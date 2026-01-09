"""
Climate Risk Assessment Service
Evaluates property climate hazards using free government data sources

Phase 1 (MVP): Flood, Wildfire, Hurricane
Phase 2: Earthquake, Tornado, Extreme Heat, Sea Level Rise, Drought
"""

import requests
import json
import os
from typing import Dict, Optional, Tuple, List
from datetime import datetime, timedelta
from math import radians, cos, sin, asin, sqrt
import logging

from app.database import db, ClimateRiskCache, ApiRateLimit

# Configure logging
logger = logging.getLogger(__name__)


class ClimateRiskService:
    """
    Service for calculating climate risk scores across 8 hazard dimensions
    Uses free government APIs: FEMA, NOAA, USGS, USDA, Census Bureau
    """

    # Load configuration from JSON file
    _config = None
    _config_cache_time = None
    CONFIG_CACHE_TTL = 300  # 5 minutes

    # API configuration
    CENSUS_GEOCODER_URL = "https://geocoding.geo.census.gov/geocoder/locations/address"
    FEMA_NFHL_BASE_URL = "https://hazards.fema.gov/gis/nfhl/rest/services/public/NFHL/MapServer"
    NOAA_CDO_BASE_URL = "https://www.ncdc.noaa.gov/cdo-web/api/v2"
    USGS_EARTHQUAKE_URL = "https://earthquake.usgs.gov/fdsnws/event/1/query"

    @classmethod
    def _load_config(cls) -> Dict:
        """Load climate risk configuration from JSON file with caching"""
        now = datetime.utcnow()

        # Return cached config if still valid
        if cls._config and cls._config_cache_time:
            if (now - cls._config_cache_time).total_seconds() < cls.CONFIG_CACHE_TTL:
                return cls._config

        # Load fresh config
        config_path = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            'data',
            'climate_risk_config.json'
        )

        try:
            with open(config_path, 'r') as f:
                cls._config = json.load(f)
                cls._config_cache_time = now
                return cls._config
        except Exception as e:
            logger.error(f"Failed to load climate risk config: {e}")
            # Return default minimal config
            return {
                "hazard_weights": {
                    "flood": 0.20, "wildfire": 0.18, "hurricane": 0.15,
                    "earthquake": 0.12, "tornado": 0.10, "extreme_heat": 0.10,
                    "sea_level_rise": 0.08, "drought": 0.07
                },
                "cache_ttl_days": {
                    "flood": 365, "wildfire": 90, "hurricane": 365,
                    "earthquake": 365, "tornado": 180, "extreme_heat": 30,
                    "sea_level_rise": 365, "drought": 7
                }
            }

    @staticmethod
    def geocode_property_address(
        street: str,
        city: str,
        state: str,
        zipcode: str
    ) -> Optional[Dict]:
        """
        Convert property address to lat/lon using Census Geocoder (free, no API key)

        Args:
            street: Street address
            city: City name
            state: State abbreviation (e.g., 'CA')
            zipcode: ZIP code

        Returns:
            {
                'latitude': 37.7749,
                'longitude': -122.4194,
                'matched_address': '123 Main St, San Francisco, CA 94102',
                'fips_state': '06',
                'fips_county': '075'
            }
            or None if geocoding fails
        """
        try:
            params = {
                'street': street or '',
                'city': city or '',
                'state': state or '',
                'zip': zipcode or '',
                'benchmark': 'Public_AR_Current',
                'format': 'json'
            }

            response = requests.get(
                ClimateRiskService.CENSUS_GEOCODER_URL,
                params=params,
                timeout=10
            )
            response.raise_for_status()

            data = response.json()

            if data.get('result', {}).get('addressMatches'):
                match = data['result']['addressMatches'][0]
                coords = match['coordinates']

                return {
                    'latitude': coords['y'],
                    'longitude': coords['x'],
                    'matched_address': match.get('matchedAddress', ''),
                    'fips_state': match.get('addressComponents', {}).get('state', ''),
                    'fips_county': match.get('addressComponents', {}).get('county', '')
                }

            # Try with just ZIP code if full address fails
            if zipcode:
                logger.warning(f"Full address geocoding failed, trying ZIP only: {zipcode}")
                params = {
                    'zip': zipcode,
                    'benchmark': 'Public_AR_Current',
                    'format': 'json'
                }
                response = requests.get(
                    ClimateRiskService.CENSUS_GEOCODER_URL,
                    params=params,
                    timeout=10
                )
                data = response.json()

                if data.get('result', {}).get('addressMatches'):
                    match = data['result']['addressMatches'][0]
                    coords = match['coordinates']
                    return {
                        'latitude': coords['y'],
                        'longitude': coords['x'],
                        'matched_address': f"ZIP {zipcode}",
                        'fips_state': match.get('addressComponents', {}).get('state', ''),
                        'fips_county': match.get('addressComponents', {}).get('county', '')
                    }

            logger.warning(f"Geocoding failed for address: {street}, {city}, {state} {zipcode}")
            return None

        except Exception as e:
            logger.error(f"Geocoding error: {e}")
            return None

    @staticmethod
    def _get_cached_risk(
        latitude: float,
        longitude: float,
        hazard_type: str
    ) -> Optional[Dict]:
        """
        Check cache for existing climate risk data

        Args:
            latitude: Property latitude (rounded to 4 decimals)
            longitude: Property longitude (rounded to 4 decimals)
            hazard_type: 'flood', 'wildfire', etc.

        Returns:
            Cached risk data dict or None if not found/expired
        """
        try:
            # Round coords to 4 decimals for cache key
            lat_rounded = round(latitude, 4)
            lon_rounded = round(longitude, 4)

            cached = ClimateRiskCache.query.filter_by(
                latitude=lat_rounded,
                longitude=lon_rounded,
                hazard_type=hazard_type
            ).first()

            if cached and not cached.is_expired():
                logger.info(f"Cache hit for {hazard_type} at ({lat_rounded}, {lon_rounded})")
                return {
                    'score': cached.risk_score,
                    'details': cached.risk_details,
                    'data_source': cached.data_source,
                    'cached': True,
                    'cached_at': cached.created_at.isoformat()
                }

            if cached and cached.is_expired():
                logger.info(f"Cache expired for {hazard_type} at ({lat_rounded}, {lon_rounded})")
                # Delete expired entry
                db.session.delete(cached)
                db.session.commit()

            return None

        except Exception as e:
            logger.error(f"Cache retrieval error: {e}")
            return None

    @staticmethod
    def _store_in_cache(
        latitude: float,
        longitude: float,
        hazard_type: str,
        risk_score: float,
        risk_details: Dict,
        data_source: str,
        ttl_days: int
    ):
        """
        Store climate risk data in cache

        Args:
            latitude: Property latitude
            longitude: Property longitude
            hazard_type: Hazard identifier
            risk_score: Calculated risk score (0-100)
            risk_details: Full hazard data
            data_source: API source name
            ttl_days: Time-to-live in days
        """
        try:
            # Round coords to 4 decimals
            lat_rounded = round(latitude, 4)
            lon_rounded = round(longitude, 4)

            # Check if entry already exists
            existing = ClimateRiskCache.query.filter_by(
                latitude=lat_rounded,
                longitude=lon_rounded,
                hazard_type=hazard_type
            ).first()

            if existing:
                # Update existing
                existing.risk_score = risk_score
                existing.risk_details = risk_details
                existing.data_source = data_source
                existing.created_at = datetime.utcnow()
                existing.expires_at = datetime.utcnow() + timedelta(days=ttl_days)
            else:
                # Create new
                cache_entry = ClimateRiskCache(
                    latitude=lat_rounded,
                    longitude=lon_rounded,
                    hazard_type=hazard_type,
                    risk_score=risk_score,
                    risk_details=risk_details,
                    data_source=data_source,
                    expires_at=datetime.utcnow() + timedelta(days=ttl_days)
                )
                db.session.add(cache_entry)

            db.session.commit()
            logger.info(f"Cached {hazard_type} risk for ({lat_rounded}, {lon_rounded})")

        except Exception as e:
            logger.error(f"Cache storage error: {e}")
            db.session.rollback()

    @staticmethod
    def calculate_distance_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """
        Calculate great-circle distance between two points in miles
        Uses Haversine formula
        """
        # Convert to radians
        lat1, lon1, lat2, lon2 = map(radians, [lat1, lon1, lat2, lon2])

        # Haversine formula
        dlat = lat2 - lat1
        dlon = lon2 - lon1
        a = sin(dlat/2)**2 + cos(lat1) * cos(lat2) * sin(dlon/2)**2
        c = 2 * asin(sqrt(a))

        # Radius of earth in miles
        r = 3956

        return c * r

    @staticmethod
    def calculate_flood_risk(latitude: float, longitude: float) -> Dict:
        """
        Calculate flood risk using FEMA National Flood Hazard Layer (NFHL)

        Data Source: FEMA NFHL GIS service (free, no API key required)

        Returns:
            {
                'score': 75.0,  # 0-100
                'flood_zone': 'AE',
                'interpretation': 'High risk - 1% annual flood chance',
                'data_source': 'FEMA NFHL',
                'details': {...}
            }
        """
        config = ClimateRiskService._load_config()

        # Check cache first
        cached = ClimateRiskService._get_cached_risk(latitude, longitude, 'flood')
        if cached:
            return cached

        try:
            # Query FEMA NFHL MapServer for flood zone
            # Using identify endpoint to find flood zone at lat/lon
            map_server_url = f"{ClimateRiskService.FEMA_NFHL_BASE_URL}/identify"

            params = {
                'geometry': f'{longitude},{latitude}',
                'geometryType': 'esriGeometryPoint',
                'sr': '4326',  # WGS84
                'layers': 'all',
                'tolerance': '2',
                'mapExtent': f'{longitude-0.01},{latitude-0.01},{longitude+0.01},{latitude+0.01}',
                'imageDisplay': '400,400,96',
                'returnGeometry': 'false',
                'f': 'json'
            }

            response = requests.get(map_server_url, params=params, timeout=15)
            response.raise_for_status()

            data = response.json()

            # Parse flood zone from response
            flood_zone = None
            if data.get('results'):
                for result in data['results']:
                    attrs = result.get('attributes', {})
                    if 'FLD_ZONE' in attrs:
                        flood_zone = attrs['FLD_ZONE']
                        break
                    elif 'ZONE' in attrs:
                        flood_zone = attrs['ZONE']
                        break

            # Calculate score based on flood zone
            scoring = config.get('scoring_thresholds', {}).get('flood', {})
            zone_mappings = scoring.get('zone_mappings', {})

            if flood_zone and flood_zone in zone_mappings:
                score_range = zone_mappings[flood_zone]
                risk_score = (score_range[0] + score_range[1]) / 2
            elif flood_zone:
                # Unknown zone, use default
                default_range = scoring.get('default', [25, 50])
                risk_score = (default_range[0] + default_range[1]) / 2
            else:
                # No flood zone data, assume minimal risk
                risk_score = 10.0
                flood_zone = 'X'

            # Generate interpretation
            if risk_score >= 85:
                interpretation = 'Very High Risk - High velocity flood zone or 1% annual chance'
            elif risk_score >= 70:
                interpretation = 'High Risk - 1% annual flood chance (100-year floodplain)'
            elif risk_score >= 50:
                interpretation = 'Moderate Risk - 0.2% annual flood chance (500-year floodplain)'
            elif risk_score >= 20:
                interpretation = 'Low Risk - Minimal flood hazard'
            else:
                interpretation = 'Very Low Risk - Area of minimal flood hazard'

            result = {
                'score': round(risk_score, 1),
                'flood_zone': flood_zone,
                'interpretation': interpretation,
                'data_source': 'FEMA NFHL',
                'details': {
                    'latitude': latitude,
                    'longitude': longitude,
                    'raw_data': data.get('results', [])[:1] if data.get('results') else []
                },
                'cached': False
            }

            # Store in cache
            ClimateRiskService._store_in_cache(
                latitude, longitude, 'flood',
                result['score'], result['details'],
                'FEMA NFHL', config['cache_ttl_days']['flood']
            )

            return result

        except Exception as e:
            logger.error(f"Flood risk calculation error: {e}")
            # Return default moderate risk with error
            return {
                'score': 25.0,
                'flood_zone': 'Unknown',
                'interpretation': 'Unable to determine flood risk',
                'data_source': 'FEMA NFHL (unavailable)',
                'error': str(e),
                'details': {}
            }

    @staticmethod
    def calculate_wildfire_risk(latitude: float, longitude: float) -> Dict:
        """
        Calculate wildfire risk using simplified geographic heuristics

        Note: USDA Wildfire Hazard Potential data requires GIS processing
        For MVP, using state-level and geographic proximity heuristics

        Full implementation would query USDA WHP raster data

        Returns:
            {
                'score': 68.0,  # 0-100
                'hazard_level': 'High',
                'interpretation': 'High wildfire risk area',
                'data_source': 'Geographic heuristics',
                'details': {...}
            }
        """
        config = ClimateRiskService._load_config()

        # Check cache
        cached = ClimateRiskService._get_cached_risk(latitude, longitude, 'wildfire')
        if cached:
            return cached

        try:
            # Simplified wildfire risk based on geographic location
            # High-risk states: CA, OR, WA, ID, MT, WY, CO, NM, AZ, NV, UT, TX
            # Using latitude/longitude ranges as proxy

            # Western US high-risk zones
            is_western = -125 <= longitude <= -102
            is_southwestern = 31 <= latitude <= 42 and -125 <= longitude <= -102
            is_california = 32 <= latitude <= 42 and -125 <= longitude <= -114
            is_pacific_nw = 42 <= latitude <= 49 and -125 <= longitude <= -116
            is_mountain_west = 35 <= latitude <= 49 and -116 <= longitude <= -102

            # Calculate base score
            if is_california:
                base_score = 85  # Very High - California wildfires
            elif is_pacific_nw:
                base_score = 70  # High - Oregon, Washington
            elif is_southwestern:
                base_score = 75  # High - Arizona, New Mexico
            elif is_mountain_west:
                base_score = 65  # Moderate-High - Mountain states
            elif is_western:
                base_score = 55  # Moderate - Other western areas
            else:
                base_score = 20  # Low - Eastern US

            # Adjust for elevation/terrain (simplified)
            # Higher elevations in west = more wildfire risk
            # This is a placeholder - full implementation would use elevation API

            risk_score = base_score

            # Determine hazard level
            if risk_score >= 90:
                hazard_level = 'Very High'
                interpretation = 'Very High wildfire risk - frequent large fires'
            elif risk_score >= 70:
                hazard_level = 'High'
                interpretation = 'High wildfire risk - regular fire activity'
            elif risk_score >= 40:
                hazard_level = 'Moderate'
                interpretation = 'Moderate wildfire risk'
            elif risk_score >= 20:
                hazard_level = 'Low'
                interpretation = 'Low wildfire risk'
            else:
                hazard_level = 'Very Low'
                interpretation = 'Very Low wildfire risk'

            result = {
                'score': round(risk_score, 1),
                'hazard_level': hazard_level,
                'interpretation': interpretation,
                'data_source': 'Geographic heuristics (simplified)',
                'details': {
                    'latitude': latitude,
                    'longitude': longitude,
                    'region': 'Western US' if is_western else 'Eastern US',
                    'note': 'Full implementation would use USDA Wildfire Hazard Potential data'
                },
                'cached': False
            }

            # Cache it
            ClimateRiskService._store_in_cache(
                latitude, longitude, 'wildfire',
                result['score'], result['details'],
                'Geographic heuristics', config['cache_ttl_days']['wildfire']
            )

            return result

        except Exception as e:
            logger.error(f"Wildfire risk calculation error: {e}")
            return {
                'score': 30.0,
                'hazard_level': 'Unknown',
                'interpretation': 'Unable to determine wildfire risk',
                'data_source': 'N/A',
                'error': str(e),
                'details': {}
            }

    @staticmethod
    def calculate_hurricane_risk(latitude: float, longitude: float) -> Dict:
        """
        Calculate hurricane risk based on coastal proximity and historical patterns

        Data: Simplified geographic model based on distance to coast
        Full implementation would query NOAA historical hurricane tracks

        Returns:
            {
                'score': 55.0,  # 0-100
                'coastal_proximity': 'Within 50 miles',
                'interpretation': 'Moderate hurricane risk',
                'data_source': 'Geographic model',
                'details': {...}
            }
        """
        config = ClimateRiskService._load_config()

        # Check cache
        cached = ClimateRiskService._get_cached_risk(latitude, longitude, 'hurricane')
        if cached:
            return cached

        try:
            # Hurricane-prone regions: Atlantic coast, Gulf coast
            # Simplified model based on proximity to coast

            # Atlantic coastline approximate points
            atlantic_points = [
                (25.8, -80.2),  # Miami
                (28.5, -81.4),  # Orlando (inland reference)
                (32.8, -79.9),  # Charleston
                (36.9, -76.2),  # Norfolk
                (40.7, -74.0),  # New York
                (42.4, -71.1),  # Boston
            ]

            # Gulf coastline approximate points
            gulf_points = [
                (25.8, -80.2),  # Miami
                (26.1, -81.8),  # Naples
                (27.9, -82.5),  # Tampa
                (30.4, -84.3),  # Tallahassee (inland)
                (30.4, -87.2),  # Pensacola
                (30.7, -88.0),  # Mobile
                (29.9, -90.1),  # New Orleans
                (29.3, -94.8),  # Galveston
                (27.8, -97.4),  # Corpus Christi
            ]

            # Calculate minimum distance to coast
            min_distance = float('inf')

            for point in atlantic_points + gulf_points:
                distance = ClimateRiskService.calculate_distance_miles(
                    latitude, longitude, point[0], point[1]
                )
                min_distance = min(min_distance, distance)

            # Calculate risk score based on distance
            if min_distance < 25:
                risk_score = 95.0
                proximity = 'Within 25 miles of coast'
                interpretation = 'Very High Risk - Direct coastal exposure to hurricanes'
            elif min_distance < 50:
                risk_score = 75.0
                proximity = 'Within 50 miles of coast'
                interpretation = 'High Risk - Near coastal, significant hurricane exposure'
            elif min_distance < 100:
                risk_score = 50.0
                proximity = 'Within 100 miles of coast'
                interpretation = 'Moderate Risk - Inland but within hurricane range'
            elif min_distance < 200:
                risk_score = 25.0
                proximity = 'Within 200 miles of coast'
                interpretation = 'Low Risk - Far enough inland to reduce risk'
            else:
                risk_score = 5.0
                proximity = 'More than 200 miles from coast'
                interpretation = 'Very Low Risk - Well inland from coastal areas'

            # Adjust for latitude (northern areas have lower hurricane frequency)
            if latitude > 40:
                risk_score *= 0.6  # Reduce score for northern latitudes
            elif latitude > 35:
                risk_score *= 0.8

            result = {
                'score': round(risk_score, 1),
                'coastal_proximity': proximity,
                'distance_to_coast_miles': round(min_distance, 1),
                'interpretation': interpretation,
                'data_source': 'Geographic model (simplified)',
                'details': {
                    'latitude': latitude,
                    'longitude': longitude,
                    'note': 'Full implementation would use NOAA historical hurricane data'
                },
                'cached': False
            }

            # Cache it
            ClimateRiskService._store_in_cache(
                latitude, longitude, 'hurricane',
                result['score'], result['details'],
                'Geographic model', config['cache_ttl_days']['hurricane']
            )

            return result

        except Exception as e:
            logger.error(f"Hurricane risk calculation error: {e}")
            return {
                'score': 15.0,
                'coastal_proximity': 'Unknown',
                'interpretation': 'Unable to determine hurricane risk',
                'data_source': 'N/A',
                'error': str(e),
                'details': {}
            }

    @staticmethod
    def calculate_earthquake_risk(latitude: float, longitude: float) -> Dict:
        """
        Calculate earthquake risk using simplified seismic zone model

        Full implementation would use USGS Seismic Hazard Maps API
        For MVP, using geographic zones based on known seismic activity

        Returns:
            {
                'score': 45.0,  # 0-100
                'seismic_zone': 'Moderate',
                'interpretation': 'Moderate earthquake risk',
                'data_source': 'Geographic model',
                'details': {...}
            }
        """
        config = ClimateRiskService._load_config()

        # Check cache
        cached = ClimateRiskService._get_cached_risk(latitude, longitude, 'earthquake')
        if cached:
            return cached

        try:
            # High-risk zones: California, Pacific Northwest, Alaska
            # Moderate zones: Nevada, Utah, parts of Montana, Idaho
            # Low zones: Most of eastern and central US

            # California seismic zones
            is_ca_coast = 32 <= latitude <= 42 and -125 <= longitude <= -117
            is_ca_inland = 32 <= latitude <= 42 and -117 <= longitude <= -114

            # Pacific Northwest
            is_pacific_nw = 42 <= latitude <= 49 and -125 <= longitude <= -116

            # Nevada/Utah seismic zones
            is_nevada_utah = 35 <= latitude <= 42 and -120 <= longitude <= -109

            # Central US (New Madrid zone)
            is_new_madrid = 35 <= latitude <= 40 and -92 <= longitude <= -87

            # Calculate risk score
            if is_ca_coast:
                risk_score = 85.0  # Very High - San Andreas, Hayward faults
                seismic_zone = 'Very High'
                interpretation = 'Very High Risk - Major active fault zones'
            elif is_pacific_nw:
                risk_score = 75.0  # High - Cascadia subduction zone
                seismic_zone = 'High'
                interpretation = 'High Risk - Cascadia subduction zone'
            elif is_ca_inland:
                risk_score = 65.0  # Moderate-High - Eastern CA faults
                seismic_zone = 'Moderate-High'
                interpretation = 'Moderate-High Risk - Active seismic area'
            elif is_nevada_utah:
                risk_score = 45.0  # Moderate - Basin and Range
                seismic_zone = 'Moderate'
                interpretation = 'Moderate Risk - Basin and Range province'
            elif is_new_madrid:
                risk_score = 35.0  # Low-Moderate - New Madrid zone
                seismic_zone = 'Low-Moderate'
                interpretation = 'Low-Moderate Risk - New Madrid seismic zone'
            else:
                risk_score = 10.0  # Low - Stable continental interior
                seismic_zone = 'Low'
                interpretation = 'Low Risk - Stable continental region'

            result = {
                'score': round(risk_score, 1),
                'seismic_zone': seismic_zone,
                'interpretation': interpretation,
                'data_source': 'Geographic seismic model (simplified)',
                'details': {
                    'latitude': latitude,
                    'longitude': longitude,
                    'note': 'Full implementation would use USGS Peak Ground Acceleration (PGA) data'
                },
                'cached': False
            }

            # Cache it
            ClimateRiskService._store_in_cache(
                latitude, longitude, 'earthquake',
                result['score'], result['details'],
                'Geographic model', config['cache_ttl_days']['earthquake']
            )

            return result

        except Exception as e:
            logger.error(f"Earthquake risk calculation error: {e}")
            return {
                'score': 15.0,
                'seismic_zone': 'Unknown',
                'interpretation': 'Unable to determine earthquake risk',
                'data_source': 'N/A',
                'error': str(e),
                'details': {}
            }

    @staticmethod
    def calculate_tornado_risk(latitude: float, longitude: float) -> Dict:
        """
        Calculate tornado risk based on geographic location

        Full implementation would query NOAA Storm Events Database
        For MVP, using "Tornado Alley" and regional patterns

        Returns:
            {
                'score': 60.0,  # 0-100
                'tornado_zone': 'High',
                'interpretation': 'High tornado frequency area',
                'data_source': 'Geographic model',
                'details': {...}
            }
        """
        config = ClimateRiskService._load_config()

        # Check cache
        cached = ClimateRiskService._get_cached_risk(latitude, longitude, 'tornado')
        if cached:
            return cached

        try:
            # Tornado Alley: Central plains (OK, KS, NE, TX panhandle, SD)
            is_tornado_alley = 33 <= latitude <= 43 and -103 <= longitude <= -95

            # Dixie Alley: Southeast (MS, AL, TN, AR)
            is_dixie_alley = 31 <= latitude <= 37 and -95 <= longitude <= -84

            # High frequency midwest
            is_midwest_high = 36 <= latitude <= 43 and -95 <= longitude <= -84

            # Moderate: Eastern US
            is_eastern = -84 <= longitude <= -75 and 30 <= latitude <= 42

            # Low: Western US, Northeast
            is_western = longitude < -103
            is_northeast = latitude > 42 and longitude > -80

            # Calculate score
            if is_tornado_alley:
                risk_score = 85.0  # Very High - Tornado Alley
                tornado_zone = 'Very High'
                interpretation = 'Very High Risk - Tornado Alley (highest frequency in US)'
            elif is_dixie_alley:
                risk_score = 75.0  # High - Dixie Alley
                tornado_zone = 'High'
                interpretation = 'High Risk - Dixie Alley (frequent strong tornadoes)'
            elif is_midwest_high:
                risk_score = 60.0  # Moderate-High - Midwest
                tornado_zone = 'Moderate-High'
                interpretation = 'Moderate-High Risk - Midwest tornado activity'
            elif is_eastern:
                risk_score = 35.0  # Moderate - Eastern US
                tornado_zone = 'Moderate'
                interpretation = 'Moderate Risk - Occasional tornado activity'
            elif is_western or is_northeast:
                risk_score = 10.0  # Low - Western/Northeast
                tornado_zone = 'Low'
                interpretation = 'Low Risk - Rare tornado occurrence'
            else:
                risk_score = 20.0  # Low-Moderate - Other areas
                tornado_zone = 'Low-Moderate'
                interpretation = 'Low-Moderate Risk'

            result = {
                'score': round(risk_score, 1),
                'tornado_zone': tornado_zone,
                'interpretation': interpretation,
                'data_source': 'Geographic tornado model (simplified)',
                'details': {
                    'latitude': latitude,
                    'longitude': longitude,
                    'note': 'Full implementation would use NOAA historical tornado data'
                },
                'cached': False
            }

            # Cache it
            ClimateRiskService._store_in_cache(
                latitude, longitude, 'tornado',
                result['score'], result['details'],
                'Geographic model', config['cache_ttl_days']['tornado']
            )

            return result

        except Exception as e:
            logger.error(f"Tornado risk calculation error: {e}")
            return {
                'score': 20.0,
                'tornado_zone': 'Unknown',
                'interpretation': 'Unable to determine tornado risk',
                'data_source': 'N/A',
                'error': str(e),
                'details': {}
            }

    @staticmethod
    def calculate_extreme_heat_risk(latitude: float, longitude: float) -> Dict:
        """
        Calculate extreme heat risk based on geographic location and climate

        Full implementation would query NOAA Climate Data Online
        For MVP, using latitude and regional climate patterns

        Returns:
            {
                'score': 55.0,  # 0-100
                'heat_zone': 'High',
                'interpretation': 'High extreme heat exposure',
                'data_source': 'Geographic climate model',
                'details': {...}
            }
        """
        config = ClimateRiskService._load_config()

        # Check cache
        cached = ClimateRiskService._get_cached_risk(latitude, longitude, 'extreme_heat')
        if cached:
            return cached

        try:
            # Southwest desert regions (highest heat)
            is_southwest_desert = 32 <= latitude <= 37 and -117 <= longitude <= -102

            # Southern states (high heat)
            is_deep_south = 28 <= latitude <= 35 and -107 <= longitude <= -80

            # Central/Southern plains (moderate-high)
            is_southern_plains = 30 <= latitude <= 37 and -103 <= longitude <= -93

            # Mid-latitude (moderate)
            is_mid_latitude = 37 <= latitude <= 42

            # Northern states (low)
            is_northern = latitude > 42

            # Calculate score
            if is_southwest_desert:
                risk_score = 90.0  # Very High - Phoenix, Las Vegas, desert areas
                heat_zone = 'Very High'
                interpretation = 'Very High Risk - Desert climate, 30+ days >100°F annually'
            elif is_deep_south:
                risk_score = 70.0  # High - Deep South heat and humidity
                heat_zone = 'High'
                interpretation = 'High Risk - Hot, humid summers with frequent heat waves'
            elif is_southern_plains:
                risk_score = 60.0  # Moderate-High - Texas, Oklahoma heat
                heat_zone = 'Moderate-High'
                interpretation = 'Moderate-High Risk - Hot summers, 15-30 days >100°F'
            elif is_mid_latitude:
                risk_score = 35.0  # Moderate - Mid-latitude states
                heat_zone = 'Moderate'
                interpretation = 'Moderate Risk - Warm summers, occasional heat waves'
            elif is_northern:
                risk_score = 15.0  # Low - Northern states
                heat_zone = 'Low'
                interpretation = 'Low Risk - Cool to moderate summers'
            else:
                risk_score = 30.0  # Low-Moderate
                heat_zone = 'Low-Moderate'
                interpretation = 'Low-Moderate Risk'

            # Coastal areas get slight reduction due to marine influence
            if -125 <= longitude <= -115 and 32 <= latitude <= 42:
                risk_score *= 0.8  # West coast marine influence
            elif -80 <= longitude <= -70 and 38 <= latitude <= 45:
                risk_score *= 0.9  # Northeast coast

            result = {
                'score': round(risk_score, 1),
                'heat_zone': heat_zone,
                'interpretation': interpretation,
                'data_source': 'Geographic climate model (simplified)',
                'details': {
                    'latitude': latitude,
                    'longitude': longitude,
                    'note': 'Full implementation would use NOAA historical temperature data'
                },
                'cached': False
            }

            # Cache it (shorter TTL for seasonal data)
            ClimateRiskService._store_in_cache(
                latitude, longitude, 'extreme_heat',
                result['score'], result['details'],
                'Geographic model', config['cache_ttl_days']['extreme_heat']
            )

            return result

        except Exception as e:
            logger.error(f"Extreme heat risk calculation error: {e}")
            return {
                'score': 25.0,
                'heat_zone': 'Unknown',
                'interpretation': 'Unable to determine extreme heat risk',
                'data_source': 'N/A',
                'error': str(e),
                'details': {}
            }

    @staticmethod
    def calculate_sea_level_rise_risk(latitude: float, longitude: float) -> Dict:
        """
        Calculate sea level rise risk based on coastal proximity and elevation

        Only applies to coastal properties
        Full implementation would use NOAA Sea Level Rise Viewer

        Returns:
            {
                'score': 30.0,  # 0-100
                'coastal_vulnerability': 'Low',
                'interpretation': 'Not a coastal property',
                'data_source': 'Geographic coastal model',
                'details': {...}
            }
        """
        config = ClimateRiskService._load_config()

        # Check cache
        cached = ClimateRiskService._get_cached_risk(latitude, longitude, 'sea_level_rise')
        if cached:
            return cached

        try:
            # Define major coastal zones
            # Atlantic coast
            atlantic_coast = [
                (25.8, -80.2),  # Miami
                (32.8, -79.9),  # Charleston
                (36.9, -76.2),  # Norfolk
                (40.7, -74.0),  # New York
                (42.4, -71.1),  # Boston
            ]

            # Gulf coast
            gulf_coast = [
                (29.9, -90.1),  # New Orleans
                (29.7, -95.4),  # Houston
                (27.9, -82.5),  # Tampa
            ]

            # Pacific coast
            pacific_coast = [
                (32.7, -117.2),  # San Diego
                (33.9, -118.2),  # Los Angeles
                (37.8, -122.4),  # San Francisco
                (47.6, -122.3),  # Seattle
            ]

            all_coastal = atlantic_coast + gulf_coast + pacific_coast

            # Calculate minimum distance to coast
            min_distance = float('inf')
            for coast_lat, coast_lon in all_coastal:
                distance = ClimateRiskService.calculate_distance_miles(
                    latitude, longitude, coast_lat, coast_lon
                )
                min_distance = min(min_distance, distance)

            # Calculate risk based on distance
            if min_distance < 2:
                risk_score = 95.0  # Very High - Direct coastal exposure
                coastal_vulnerability = 'Very High'
                interpretation = 'Very High Risk - Direct coastal exposure to sea level rise'
            elif min_distance < 5:
                risk_score = 75.0  # High - Near coastal
                coastal_vulnerability = 'High'
                interpretation = 'High Risk - Low-lying coastal area vulnerable to sea level rise'
            elif min_distance < 10:
                risk_score = 50.0  # Moderate - Coastal vicinity
                coastal_vulnerability = 'Moderate'
                interpretation = 'Moderate Risk - Within coastal zone, potential long-term impacts'
            elif min_distance < 25:
                risk_score = 20.0  # Low - Beyond immediate coastal zone
                coastal_vulnerability = 'Low'
                interpretation = 'Low Risk - Outside immediate sea level rise impact zone'
            else:
                risk_score = 0.0  # N/A - Not coastal
                coastal_vulnerability = 'N/A'
                interpretation = 'Not Applicable - Inland property not affected by sea level rise'

            result = {
                'score': round(risk_score, 1),
                'coastal_vulnerability': coastal_vulnerability,
                'distance_to_coast_miles': round(min_distance, 1),
                'interpretation': interpretation,
                'data_source': 'Geographic coastal model (simplified)',
                'details': {
                    'latitude': latitude,
                    'longitude': longitude,
                    'note': 'Full implementation would use NOAA Sea Level Rise elevation data'
                },
                'cached': False
            }

            # Cache it
            ClimateRiskService._store_in_cache(
                latitude, longitude, 'sea_level_rise',
                result['score'], result['details'],
                'Geographic model', config['cache_ttl_days']['sea_level_rise']
            )

            return result

        except Exception as e:
            logger.error(f"Sea level rise risk calculation error: {e}")
            return {
                'score': 0.0,
                'coastal_vulnerability': 'Unknown',
                'interpretation': 'Unable to determine sea level rise risk',
                'data_source': 'N/A',
                'error': str(e),
                'details': {}
            }

    @staticmethod
    def calculate_drought_risk(latitude: float, longitude: float) -> Dict:
        """
        Calculate drought risk based on regional climate patterns

        Full implementation would query U.S. Drought Monitor API
        For MVP, using regional precipitation patterns

        Returns:
            {
                'score': 40.0,  # 0-100
                'drought_zone': 'Moderate',
                'interpretation': 'Moderate drought frequency',
                'data_source': 'Geographic climate model',
                'details': {...}
            }
        """
        config = ClimateRiskService._load_config()

        # Check cache (shortest TTL - drought changes frequently)
        cached = ClimateRiskService._get_cached_risk(latitude, longitude, 'drought')
        if cached:
            return cached

        try:
            # Southwest deserts (highest drought risk)
            is_southwest_desert = 32 <= latitude <= 40 and -120 <= longitude <= -102

            # California
            is_california = 32 <= latitude <= 42 and -125 <= longitude <= -114

            # Great Plains (moderate-high)
            is_great_plains = 35 <= latitude <= 45 and -103 <= longitude <= -95

            # Southeast (moderate - humid but can have droughts)
            is_southeast = 30 <= latitude <= 37 and -95 <= longitude <= -75

            # Pacific Northwest (low - high precipitation)
            is_pacific_nw = 42 <= latitude <= 49 and -125 <= longitude <= -116

            # Northeast (low - adequate precipitation)
            is_northeast = 38 <= latitude <= 47 and -80 <= longitude <= -67

            # Calculate score
            if is_southwest_desert:
                risk_score = 85.0  # Very High - Arid climate
                drought_zone = 'Very High'
                interpretation = 'Very High Risk - Arid climate, frequent severe droughts'
            elif is_california:
                risk_score = 70.0  # High - Mediterranean climate, water scarcity
                drought_zone = 'High'
                interpretation = 'High Risk - Mediterranean climate, recurring drought cycles'
            elif is_great_plains:
                risk_score = 55.0  # Moderate-High - Variable precipitation
                drought_zone = 'Moderate-High'
                interpretation = 'Moderate-High Risk - Variable precipitation, periodic droughts'
            elif is_southeast:
                risk_score = 35.0  # Moderate - Generally humid but can drought
                drought_zone = 'Moderate'
                interpretation = 'Moderate Risk - Generally humid, occasional drought conditions'
            elif is_pacific_nw or is_northeast:
                risk_score = 15.0  # Low - High precipitation
                drought_zone = 'Low'
                interpretation = 'Low Risk - High precipitation region, rare droughts'
            else:
                risk_score = 30.0  # Low-Moderate
                drought_zone = 'Low-Moderate'
                interpretation = 'Low-Moderate Risk'

            result = {
                'score': round(risk_score, 1),
                'drought_zone': drought_zone,
                'interpretation': interpretation,
                'data_source': 'Geographic climate model (simplified)',
                'details': {
                    'latitude': latitude,
                    'longitude': longitude,
                    'note': 'Full implementation would use U.S. Drought Monitor real-time data'
                },
                'cached': False
            }

            # Cache it (shortest TTL - 7 days)
            ClimateRiskService._store_in_cache(
                latitude, longitude, 'drought',
                result['score'], result['details'],
                'Geographic model', config['cache_ttl_days']['drought']
            )

            return result

        except Exception as e:
            logger.error(f"Drought risk calculation error: {e}")
            return {
                'score': 25.0,
                'drought_zone': 'Unknown',
                'interpretation': 'Unable to determine drought risk',
                'data_source': 'N/A',
                'error': str(e),
                'details': {}
            }

    @staticmethod
    def calculate_composite_climate_risk(
        latitude: float,
        longitude: float,
        property_type: Optional[str] = None
    ) -> Dict:
        """
        Calculate overall climate risk score (0-100) for Phase 2 (All 8 Hazards)

        Phase 2 includes: Flood, Wildfire, Hurricane, Earthquake, Tornado,
                         Extreme Heat, Sea Level Rise, Drought

        Args:
            latitude: Property latitude
            longitude: Property longitude
            property_type: Property type (for future use)

        Returns:
            {
                'climate_risk_score': 62.5,  # 0-100, weighted composite
                'climate_risk_level': 'Medium',  # Low/Medium/High/Very High
                'latitude': 37.7749,
                'longitude': -122.4194,
                'hazards': {
                    'flood': {...},
                    'wildfire': {...},
                    'hurricane': {...}
                },
                'top_hazards': [
                    {'hazard': 'flood', 'score': 95.0, 'label': 'Flood'},
                    {'hazard': 'wildfire', 'score': 78.0, 'label': 'Wildfire'},
                    {'hazard': 'hurricane', 'score': 15.0, 'label': 'Hurricane'}
                ],
                'interpretation': '...',
                'calculated_at': '2026-01-09T...',
                'phase': 'MVP (3 hazards)'
            }
        """
        config = ClimateRiskService._load_config()
        hazard_weights = config.get('hazard_weights', {})

        hazards = {}

        try:
            # Phase 2: Calculate all 8 hazards
            logger.info(f"Calculating climate risk for ({latitude}, {longitude})")

            hazards['flood'] = ClimateRiskService.calculate_flood_risk(latitude, longitude)
            hazards['wildfire'] = ClimateRiskService.calculate_wildfire_risk(latitude, longitude)
            hazards['hurricane'] = ClimateRiskService.calculate_hurricane_risk(latitude, longitude)
            hazards['earthquake'] = ClimateRiskService.calculate_earthquake_risk(latitude, longitude)
            hazards['tornado'] = ClimateRiskService.calculate_tornado_risk(latitude, longitude)
            hazards['extreme_heat'] = ClimateRiskService.calculate_extreme_heat_risk(latitude, longitude)
            hazards['sea_level_rise'] = ClimateRiskService.calculate_sea_level_rise_risk(latitude, longitude)
            hazards['drought'] = ClimateRiskService.calculate_drought_risk(latitude, longitude)

            # Calculate weighted composite score using all 8 hazards
            composite_score = sum(
                hazards[hazard]['score'] * hazard_weights[hazard]
                for hazard in hazards
                if 'score' in hazards[hazard]
            )

            # Determine risk level
            if composite_score < 25:
                risk_level = 'Low'
            elif composite_score < 50:
                risk_level = 'Medium'
            elif composite_score < 75:
                risk_level = 'High'
            else:
                risk_level = 'Very High'

            # Identify top 3 hazards
            hazard_labels = config.get('hazard_labels', {})
            top_hazards = sorted(
                [{'hazard': k, 'score': v['score'], 'label': hazard_labels.get(k, k.title())}
                 for k, v in hazards.items() if 'score' in v],
                key=lambda x: x['score'],
                reverse=True
            )[:3]

            # Generate interpretation
            if top_hazards:
                primary_hazard = top_hazards[0]
                interpretation = f"{risk_level} climate risk primarily driven by {primary_hazard['label'].lower()} exposure"
            else:
                interpretation = f"{risk_level} climate risk"

            return {
                'climate_risk_score': round(composite_score, 1),
                'climate_risk_level': risk_level,
                'latitude': latitude,
                'longitude': longitude,
                'hazards': hazards,
                'top_hazards': top_hazards,
                'interpretation': interpretation,
                'calculated_at': datetime.utcnow().isoformat(),
                'phase': 'Phase 2 (8 hazards)',
                'note': 'Comprehensive assessment includes all 8 climate hazards'
            }

        except Exception as e:
            logger.error(f"Composite climate risk calculation error: {e}")
            return {
                'climate_risk_score': 25.0,
                'climate_risk_level': 'Unknown',
                'latitude': latitude,
                'longitude': longitude,
                'hazards': hazards,
                'top_hazards': [],
                'interpretation': 'Unable to calculate climate risk',
                'error': str(e),
                'calculated_at': datetime.utcnow().isoformat(),
                'phase': 'Phase 2 (8 hazards)'
            }
