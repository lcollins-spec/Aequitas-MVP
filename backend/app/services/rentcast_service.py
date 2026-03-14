"""RentCast API client service for rental market intelligence."""

import logging
import requests
from typing import Optional, List
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)
from app.models.rentcast_models import (
    RentEstimateData,
    RentalComparable,
    MarketStatistics,
    MarketTrend,
    PropertyValuation
)


class RentCastCache:
    """Simple in-memory cache with TTL support."""

    def __init__(self):
        self._cache: dict[str, tuple] = {}
        self._max_size = 1000

    def get(self, key: str) -> Optional[dict]:
        """Retrieve cached value if not expired."""
        if key in self._cache:
            value, expiry = self._cache[key]
            if datetime.now() < expiry:
                return value
            else:
                del self._cache[key]
        return None

    def set(self, key: str, value: dict, ttl_seconds: int = 604800):
        """Store value with TTL (default 7 days)."""
        if len(self._cache) >= self._max_size:
            # Simple LRU: remove oldest entry
            oldest_key = min(self._cache.keys(), key=lambda k: self._cache[k][1])
            del self._cache[oldest_key]

        expiry = datetime.now() + timedelta(seconds=ttl_seconds)
        self._cache[key] = (value, expiry)

    def clear(self):
        """Clear all cached entries."""
        self._cache.clear()


class RentCastService:
    """Service for interacting with RentCast API."""

    BASE_URL = 'https://api.rentcast.io/v1'

    def __init__(self, api_key: str = '', cache_ttl: int = 604800):
        """
        Initialize RentCast API client.

        Args:
            api_key: RentCast API key (required)
            cache_ttl: Cache time-to-live in seconds (default 7 days)
        """
        if not api_key:
            logger.warning(
                "RENTCAST_API_KEY is not set — RentCast features will be unavailable. "
                "Get a key at https://app.rentcast.io/app/api-settings"
            )

        self.api_key = api_key
        self.configured = bool(api_key)
        self.cache_ttl = cache_ttl
        self.cache = RentCastCache()

    def get_rent_estimate(
        self,
        address: Optional[str] = None,
        zipcode: Optional[str] = None,
        bedrooms: Optional[int] = None,
        bathrooms: Optional[float] = None,
        square_footage: Optional[int] = None
    ) -> Optional[RentEstimateData]:
        """
        Get rent estimate for a property.

        Args:
            address: Full property address
            zipcode: 5-digit ZIP code
            bedrooms: Number of bedrooms
            bathrooms: Number of bathrooms
            square_footage: Square footage

        Returns:
            RentEstimateData object or None if error
        """
        # Validate input
        if not address and not zipcode:
            raise ValueError("Either address or zipcode is required")

        # Build cache key
        cache_key = f"rentcast:estimate:{address}:{zipcode}:{bedrooms}:{bathrooms}:{square_footage}"
        cached_data = self.cache.get(cache_key)
        if cached_data:
            return self._dict_to_rent_estimate(cached_data)

        try:
            # Build request parameters
            params = {}
            if address:
                params['address'] = address
            if zipcode:
                params['zipCode'] = zipcode
            if bedrooms is not None:
                params['bedrooms'] = bedrooms
            if bathrooms is not None:
                params['bathrooms'] = bathrooms
            if square_footage is not None:
                params['squareFootage'] = square_footage

            # Make API request
            endpoint = f"{self.BASE_URL}/avm/rent/long-term"
            data = self._make_request(endpoint, params)

            if not data:
                return None

            # Parse response
            rent_estimate = self._parse_rent_estimate(data, address, zipcode)

            # Cache the result
            if rent_estimate:
                self.cache.set(cache_key, self._rent_estimate_to_dict(rent_estimate), self.cache_ttl)

            return rent_estimate

        except Exception as e:
            print(f"Error fetching rent estimate: {str(e)}")
            return None

    def get_rental_comparables(
        self,
        address: Optional[str] = None,
        zipcode: Optional[str] = None,
        bedrooms: Optional[int] = None,
        bathrooms: Optional[float] = None,
        comp_count: int = 10,
        max_radius: float = 5.0
    ) -> Optional[List[RentalComparable]]:
        """
        Get rental comparable properties.

        Args:
            address: Full property address
            zipcode: 5-digit ZIP code
            bedrooms: Number of bedrooms
            bathrooms: Number of bathrooms
            comp_count: Number of comparables (1-25, default 10)
            max_radius: Maximum search radius in miles (default 5.0)

        Returns:
            List of RentalComparable objects or None if error
        """
        # Validate input - require address for RentCast API
        if not address:
            # If only zipcode is provided, construct a generic address
            if zipcode:
                # Use center of zipcode as a reference point
                address = f"{zipcode}, USA"
            else:
                raise ValueError("Address is required for comparables")

        # Validate comp_count
        comp_count = max(1, min(comp_count, 25))

        # Build cache key
        cache_key = f"rentcast:comps:{address}:{zipcode}:{bedrooms}:{bathrooms}:{comp_count}:{max_radius}"
        cached_data = self.cache.get(cache_key)
        if cached_data:
            return [self._dict_to_comparable(comp) for comp in cached_data]

        try:
            # Build request parameters
            params = {
                'compCount': comp_count,
                'radius': max_radius,
                'address': address
            }
            if bedrooms is not None:
                params['bedrooms'] = bedrooms
            if bathrooms is not None:
                params['bathrooms'] = bathrooms

            # Make API request
            endpoint = f"{self.BASE_URL}/avm/rent/long-term"
            data = self._make_request(endpoint, params)

            if not data:
                print(f"No data returned from RentCast API for address: {address}")
                return None

            if 'comparables' not in data:
                print(f"No comparables in response for address: {address}")
                return None

            # Parse comparables
            comparables = []
            for comp_data in data.get('comparables', []):
                comp = self._parse_comparable(comp_data)
                if comp:
                    comparables.append(comp)

            # Cache the result
            if comparables:
                self.cache.set(
                    cache_key,
                    [self._comparable_to_dict(comp) for comp in comparables],
                    self.cache_ttl
                )

            return comparables if comparables else None

        except Exception as e:
            print(f"Error fetching rental comparables: {str(e)}")
            return None

    def get_market_statistics(
        self,
        zipcode: str,
        data_type: str = 'Rental'
    ) -> Optional[MarketStatistics]:
        """
        Get market statistics for a ZIP code.

        Args:
            zipcode: 5-digit ZIP code
            data_type: Data type ('Rental', 'Sale', or 'All')

        Returns:
            MarketStatistics object or None if error
        """
        # Validate ZIP code
        if not zipcode or len(zipcode) != 5:
            raise ValueError("Valid 5-digit ZIP code is required")

        # Build cache key
        cache_key = f"rentcast:stats:{zipcode}:{data_type}"
        cached_data = self.cache.get(cache_key)
        if cached_data:
            return self._dict_to_market_stats(cached_data)

        try:
            # Build request parameters
            params = {
                'zipCode': zipcode,
                'dataType': data_type
            }

            # Make API request
            endpoint = f"{self.BASE_URL}/markets"
            data = self._make_request(endpoint, params)

            if not data:
                return None

            # Parse market statistics
            market_stats = self._parse_market_stats(data, zipcode)

            # Cache the result
            if market_stats:
                self.cache.set(cache_key, self._market_stats_to_dict(market_stats), self.cache_ttl)

            return market_stats

        except Exception as e:
            print(f"Error fetching market statistics: {str(e)}")
            return None

    def get_market_trends(
        self,
        zipcode: str,
        months: int = 12,
        data_type: str = 'Rental'
    ) -> Optional[List[MarketTrend]]:
        """
        Get historical market trends for a ZIP code.

        Args:
            zipcode: 5-digit ZIP code
            months: Number of months of history (1-24, default 12)
            data_type: Data type ('Rental', 'Sale', or 'All')

        Returns:
            List of MarketTrend objects or None if error
        """
        # Validate ZIP code
        if not zipcode or len(zipcode) != 5:
            raise ValueError("Valid 5-digit ZIP code is required")

        # Validate months
        months = max(1, min(months, 24))

        # Build cache key
        cache_key = f"rentcast:trends:{zipcode}:{months}:{data_type}"
        cached_data = self.cache.get(cache_key)
        if cached_data:
            return [self._dict_to_market_trend(trend) for trend in cached_data]

        try:
            # Build request parameters
            params = {
                'zipCode': zipcode,
                'dataType': data_type,
                'historyRange': months
            }

            # Make API request
            endpoint = f"{self.BASE_URL}/markets"
            data = self._make_request(endpoint, params)

            if not data or 'history' not in data:
                return None

            # Parse market trends
            trends = []
            for trend_data in data.get('history', []):
                trend = self._parse_market_trend(trend_data)
                if trend:
                    trends.append(trend)

            # Cache the result
            if trends:
                self.cache.set(
                    cache_key,
                    [self._market_trend_to_dict(trend) for trend in trends],
                    self.cache_ttl
                )

            return trends

        except Exception as e:
            print(f"Error fetching market trends: {str(e)}")
            return None

    def get_property_valuation(
        self,
        address: Optional[str] = None,
        zipcode: Optional[str] = None,
        bedrooms: Optional[int] = None,
        bathrooms: Optional[float] = None,
        square_footage: Optional[int] = None
    ) -> Optional[PropertyValuation]:
        """
        Get complete property valuation (estimate + comparables + market stats).

        Args:
            address: Full property address
            zipcode: 5-digit ZIP code
            bedrooms: Number of bedrooms
            bathrooms: Number of bathrooms
            square_footage: Square footage

        Returns:
            PropertyValuation object or None if error
        """
        try:
            # Fetch rent estimate (includes comparables)
            rent_estimate = self.get_rent_estimate(
                address=address,
                zipcode=zipcode,
                bedrooms=bedrooms,
                bathrooms=bathrooms,
                square_footage=square_footage
            )

            if not rent_estimate:
                return None

            # Fetch comparables
            comparables = self.get_rental_comparables(
                address=address,
                zipcode=zipcode,
                bedrooms=bedrooms,
                bathrooms=bathrooms,
                comp_count=10
            ) or []

            # Fetch market statistics if zipcode is available
            market_stats = None
            if zipcode:
                market_stats = self.get_market_statistics(zipcode)

            # Create property valuation
            valuation = PropertyValuation(
                rent_estimate=rent_estimate,
                comparables=comparables,
                market_stats=market_stats,
                last_updated=datetime.now().isoformat()
            )

            return valuation

        except Exception as e:
            print(f"Error fetching property valuation: {str(e)}")
            return None

    def _make_request(self, endpoint: str, params: dict) -> Optional[dict]:
        """
        Make API request to RentCast.

        Args:
            endpoint: API endpoint URL
            params: Query parameters

        Returns:
            JSON response data or None if error
        """
        if not self.api_key:
            return None

        try:
            headers = {
                'X-Api-Key': self.api_key,
                'accept': 'application/json'
            }

            response = requests.get(endpoint, params=params, headers=headers, timeout=10)
            response.raise_for_status()

            return response.json()

        except requests.exceptions.RequestException as e:
            print(f"RentCast API request failed: {str(e)}")
            return None
        except ValueError as e:
            print(f"Failed to parse RentCast API response: {str(e)}")
            return None

    def _parse_rent_estimate(self, data: dict, address: Optional[str], zipcode: Optional[str]) -> Optional[RentEstimateData]:
        """Parse rent estimate from API response."""
        try:
            return RentEstimateData(
                address=address or data.get('address', ''),
                zipcode=zipcode or data.get('zipCode', ''),
                bedrooms=data.get('bedrooms'),
                bathrooms=data.get('bathrooms'),
                square_footage=data.get('squareFootage'),
                estimated_rent=data.get('rent'),
                rent_range_low=data.get('rentRangeLow'),
                rent_range_high=data.get('rentRangeHigh'),
                price_per_sqft=data.get('pricePerSquareFoot'),
                property_type=data.get('propertyType'),
                last_updated=datetime.now().isoformat()
            )
        except Exception as e:
            print(f"Error parsing rent estimate: {str(e)}")
            return None

    def _parse_comparable(self, comp_data: dict) -> Optional[RentalComparable]:
        """Parse rental comparable from API response."""
        try:
            return RentalComparable(
                address=comp_data.get('address', ''),
                distance_miles=comp_data.get('distance', 0),
                bedrooms=comp_data.get('bedrooms'),
                bathrooms=comp_data.get('bathrooms'),
                square_footage=comp_data.get('squareFootage'),
                listed_rent=comp_data.get('price'),
                price_per_sqft=comp_data.get('pricePerSquareFoot'),
                property_type=comp_data.get('propertyType'),
                days_on_market=comp_data.get('daysOnMarket'),
                listing_url=comp_data.get('url')
            )
        except Exception as e:
            print(f"Error parsing comparable: {str(e)}")
            return None

    def _parse_market_stats(self, data: dict, zipcode: str) -> Optional[MarketStatistics]:
        """Parse market statistics from API response."""
        try:
            return MarketStatistics(
                zipcode=zipcode,
                data_month=data.get('month', datetime.now().strftime('%Y-%m')),
                avg_rent_all=data.get('averageRent'),
                median_rent_all=data.get('medianRent'),
                avg_rent_1bed=data.get('averageRent1Bed'),
                avg_rent_2bed=data.get('averageRent2Bed'),
                avg_rent_3bed=data.get('averageRent3Bed'),
                avg_rent_4bed=data.get('averageRent4Bed'),
                total_listings=data.get('totalListings'),
                avg_days_on_market=data.get('averageDaysOnMarket'),
                inventory_level=data.get('inventoryLevel'),
                last_updated=datetime.now().isoformat()
            )
        except Exception as e:
            print(f"Error parsing market statistics: {str(e)}")
            return None

    def _parse_market_trend(self, trend_data: dict) -> Optional[MarketTrend]:
        """Parse market trend from API response."""
        try:
            return MarketTrend(
                date=trend_data.get('date', ''),
                avg_rent=trend_data.get('averageRent'),
                median_rent=trend_data.get('medianRent'),
                listing_count=trend_data.get('listingCount')
            )
        except Exception as e:
            print(f"Error parsing market trend: {str(e)}")
            return None

    # Helper methods for cache serialization
    def _rent_estimate_to_dict(self, estimate: RentEstimateData) -> dict:
        """Convert RentEstimateData to dict for caching."""
        return estimate.to_dict()

    def _dict_to_rent_estimate(self, data: dict) -> RentEstimateData:
        """Convert dict to RentEstimateData."""
        return RentEstimateData(
            address=data['address'],
            zipcode=data['zipcode'],
            bedrooms=data.get('bedrooms'),
            bathrooms=data.get('bathrooms'),
            square_footage=data.get('squareFootage'),
            estimated_rent=data.get('estimatedRent'),
            rent_range_low=data.get('rentRangeLow'),
            rent_range_high=data.get('rentRangeHigh'),
            price_per_sqft=data.get('pricePerSqft'),
            property_type=data.get('propertyType'),
            last_updated=data.get('lastUpdated')
        )

    def _comparable_to_dict(self, comp: RentalComparable) -> dict:
        """Convert RentalComparable to dict for caching."""
        return comp.to_dict()

    def _dict_to_comparable(self, data: dict) -> RentalComparable:
        """Convert dict to RentalComparable."""
        return RentalComparable(
            address=data['address'],
            distance_miles=data['distanceMiles'],
            bedrooms=data.get('bedrooms'),
            bathrooms=data.get('bathrooms'),
            square_footage=data.get('squareFootage'),
            listed_rent=data.get('listedRent'),
            price_per_sqft=data.get('pricePerSqft'),
            property_type=data.get('propertyType'),
            days_on_market=data.get('daysOnMarket'),
            listing_url=data.get('listingUrl')
        )

    def _market_stats_to_dict(self, stats: MarketStatistics) -> dict:
        """Convert MarketStatistics to dict for caching."""
        return stats.to_dict()

    def _dict_to_market_stats(self, data: dict) -> MarketStatistics:
        """Convert dict to MarketStatistics."""
        return MarketStatistics(
            zipcode=data['zipcode'],
            data_month=data['dataMonth'],
            avg_rent_all=data.get('avgRentAll'),
            median_rent_all=data.get('medianRentAll'),
            avg_rent_1bed=data.get('avgRent1bed'),
            avg_rent_2bed=data.get('avgRent2bed'),
            avg_rent_3bed=data.get('avgRent3bed'),
            avg_rent_4bed=data.get('avgRent4bed'),
            total_listings=data.get('totalListings'),
            avg_days_on_market=data.get('avgDaysOnMarket'),
            inventory_level=data.get('inventoryLevel'),
            last_updated=data.get('lastUpdated')
        )

    def _market_trend_to_dict(self, trend: MarketTrend) -> dict:
        """Convert MarketTrend to dict for caching."""
        return trend.to_dict()

    def _dict_to_market_trend(self, data: dict) -> MarketTrend:
        """Convert dict to MarketTrend."""
        return MarketTrend(
            date=data['date'],
            avg_rent=data.get('avgRent'),
            median_rent=data.get('medianRent'),
            listing_count=data.get('listingCount')
        )
