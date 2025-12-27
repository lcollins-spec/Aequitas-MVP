"""Federal Reserve Economic Data (FRED) API client service."""

import requests
from typing import Optional, List
from datetime import datetime, timedelta
from app.models.fred_models import (
    InterestRateData,
    InflationData,
    HousingMarketData,
    EconomicIndicators,
    MacroeconomicData,
    TimeSeriesDataPoint
)


class FREDCache:
    """Simple in-memory cache with TTL support."""

    def __init__(self):
        self._cache: dict[str, tuple] = {}
        self._max_size = 500

    def get(self, key: str) -> Optional[dict]:
        """Retrieve cached value if not expired."""
        if key in self._cache:
            value, expiry = self._cache[key]
            if datetime.now() < expiry:
                return value
            else:
                del self._cache[key]
        return None

    def set(self, key: str, value: dict, ttl_seconds: int = 3600):
        """Store value with TTL (default 1 hour)."""
        if len(self._cache) >= self._max_size:
            # Simple LRU: remove oldest entry
            oldest_key = min(self._cache.keys(), key=lambda k: self._cache[k][1])
            del self._cache[oldest_key]

        expiry = datetime.now() + timedelta(seconds=ttl_seconds)
        self._cache[key] = (value, expiry)

    def clear(self):
        """Clear all cached entries."""
        self._cache.clear()


class FREDService:
    """Service for interacting with Federal Reserve Economic Data API."""

    # FRED Series IDs mapping
    SERIES_IDS = {
        # Interest Rates
        'FEDFUNDS': 'federal_funds_rate',
        'DPRIME': 'prime_rate',
        'MORTGAGE30US': 'mortgage_30yr',
        'MORTGAGE15US': 'mortgage_15yr',
        'DGS10': 'treasury_10yr',
        'DGS2': 'treasury_2yr',

        # Inflation
        'CPIAUCSL': 'cpi_all_items',
        'CPILFESL': 'core_cpi',
        'PCEPI': 'pce_inflation',

        # Housing Market
        'HOUST': 'housing_starts',
        'PERMIT': 'building_permits',
        'EXHOSLUSM495S': 'home_sales_existing',
        'HSN1F': 'home_sales_new',
        'CSUSHPISA': 'case_shiller_index',

        # Economic Indicators
        'GDPC1': 'gdp_real',
        'UNRATE': 'unemployment_rate',
        'CIVPART': 'labor_force_participation',
        'UMCSENT': 'consumer_sentiment',
    }

    def __init__(self, api_key: str = '', base_url: str = 'https://api.stlouisfed.org/fred',
                 cache_ttl: int = 3600):
        """
        Initialize FRED API client.

        Args:
            api_key: FRED API key (required)
            base_url: Base URL for FRED API
            cache_ttl: Cache time-to-live in seconds (default 1 hour)
        """
        if not api_key:
            raise ValueError(
                "FRED API key is required. "
                "Get one at https://fred.stlouisfed.org/docs/api/api_key.html"
            )

        self.api_key = api_key
        self.base_url = base_url
        self.cache_ttl = cache_ttl
        self.cache = FREDCache()

    def get_macroeconomic_snapshot(self) -> Optional[MacroeconomicData]:
        """
        Fetch complete macroeconomic snapshot with all indicators.

        Returns:
            MacroeconomicData object or None if error
        """
        # Check cache
        cache_key = "fred:macro:snapshot"
        cached_data = self.cache.get(cache_key)
        if cached_data:
            return self._dict_to_macro_data(cached_data)

        try:
            # Fetch interest rates
            interest_rates = self.get_interest_rates()
            if not interest_rates:
                return None

            # Fetch inflation data
            inflation = self.get_inflation_data()
            if not inflation:
                return None

            # Fetch housing market data
            housing_market = self.get_housing_market_data()
            if not housing_market:
                return None

            # Fetch economic indicators
            economic_indicators = self.get_economic_indicators()
            if not economic_indicators:
                return None

            # Create complete snapshot
            macro_data = MacroeconomicData(
                interest_rates=interest_rates,
                inflation=inflation,
                housing_market=housing_market,
                economic_indicators=economic_indicators,
                last_updated=datetime.now().isoformat()
            )

            # Cache the result
            self.cache.set(cache_key, self._macro_data_to_dict(macro_data), self.cache_ttl)

            return macro_data

        except Exception as e:
            print(f"Error fetching macroeconomic snapshot: {str(e)}")
            return None

    def get_interest_rates(self) -> Optional[InterestRateData]:
        """Fetch current interest rates."""
        # Check cache
        cache_key = "fred:interest_rates"
        cached_data = self.cache.get(cache_key)
        if cached_data:
            return InterestRateData(**cached_data)

        try:
            rates = {}
            rate_series = ['FEDFUNDS', 'DPRIME', 'MORTGAGE30US', 'MORTGAGE15US', 'DGS10', 'DGS2']

            for series_id in rate_series:
                value = self._get_latest_observation(series_id)
                field_name = self.SERIES_IDS[series_id]
                rates[field_name] = value

            interest_rates = InterestRateData(**rates)

            # Cache the result
            self.cache.set(cache_key, asdict(interest_rates), self.cache_ttl)

            return interest_rates

        except Exception as e:
            print(f"Error fetching interest rates: {str(e)}")
            return None

    def get_inflation_data(self) -> Optional[InflationData]:
        """Fetch inflation metrics with YoY calculations."""
        # Check cache
        cache_key = "fred:inflation"
        cached_data = self.cache.get(cache_key)
        if cached_data:
            return InflationData(**cached_data)

        try:
            # Fetch current CPI values
            cpi_all = self._get_latest_observation('CPIAUCSL')
            core_cpi = self._get_latest_observation('CPILFESL')
            pce = self._get_latest_observation('PCEPI')

            # Calculate YoY change for CPI
            cpi_yoy = self._calculate_yoy_change('CPIAUCSL')

            inflation_data = InflationData(
                cpi_all_items=cpi_all,
                core_cpi=core_cpi,
                pce_inflation=pce,
                cpi_yoy_change=cpi_yoy
            )

            # Cache the result
            self.cache.set(cache_key, asdict(inflation_data), self.cache_ttl)

            return inflation_data

        except Exception as e:
            print(f"Error fetching inflation data: {str(e)}")
            return None

    def get_housing_market_data(self) -> Optional[HousingMarketData]:
        """Fetch housing market indicators."""
        # Check cache
        cache_key = "fred:housing_market"
        cached_data = self.cache.get(cache_key)
        if cached_data:
            return HousingMarketData(**cached_data)

        try:
            housing_starts = self._get_latest_observation('HOUST')
            building_permits = self._get_latest_observation('PERMIT')
            existing_sales = self._get_latest_observation('EXHOSLUSM495S')
            new_sales = self._get_latest_observation('HSN1F')
            case_shiller = self._get_latest_observation('CSUSHPISA')

            # Convert to int where appropriate
            housing_data = HousingMarketData(
                housing_starts=int(housing_starts) if housing_starts is not None else None,
                building_permits=int(building_permits) if building_permits is not None else None,
                home_sales_existing=existing_sales,
                home_sales_new=int(new_sales) if new_sales is not None else None,
                case_shiller_index=case_shiller
            )

            # Cache the result
            self.cache.set(cache_key, asdict(housing_data), self.cache_ttl)

            return housing_data

        except Exception as e:
            print(f"Error fetching housing market data: {str(e)}")
            return None

    def get_economic_indicators(self) -> Optional[EconomicIndicators]:
        """Fetch broad economic indicators."""
        # Check cache
        cache_key = "fred:economic_indicators"
        cached_data = self.cache.get(cache_key)
        if cached_data:
            return EconomicIndicators(**cached_data)

        try:
            gdp = self._get_latest_observation('GDPC1')
            unemployment = self._get_latest_observation('UNRATE')
            labor_force = self._get_latest_observation('CIVPART')
            sentiment = self._get_latest_observation('UMCSENT')

            # Calculate GDP growth rate (YoY)
            gdp_growth = self._calculate_yoy_change('GDPC1')

            indicators = EconomicIndicators(
                gdp_real=gdp,
                gdp_growth_rate=gdp_growth,
                unemployment_rate=unemployment,
                labor_force_participation=labor_force,
                consumer_sentiment=sentiment
            )

            # Cache the result
            self.cache.set(cache_key, asdict(indicators), self.cache_ttl)

            return indicators

        except Exception as e:
            print(f"Error fetching economic indicators: {str(e)}")
            return None

    def get_time_series(self, series_id: str, start_date: Optional[str] = None,
                       end_date: Optional[str] = None, limit: int = 100) -> Optional[List[TimeSeriesDataPoint]]:
        """
        Fetch historical time series data for any FRED series.

        Args:
            series_id: FRED series ID (e.g., 'MORTGAGE30US')
            start_date: Start date in YYYY-MM-DD format (optional)
            end_date: End date in YYYY-MM-DD format (optional)
            limit: Maximum number of observations (1-1000, default 100)

        Returns:
            List of TimeSeriesDataPoint objects or None if error
        """
        # Validate limit
        limit = max(1, min(limit, 1000))

        # Build cache key
        cache_key = f"fred:series:{series_id}:{start_date}:{end_date}:{limit}"
        cached_data = self.cache.get(cache_key)
        if cached_data:
            return [TimeSeriesDataPoint(**point) for point in cached_data]

        try:
            params = {
                'series_id': series_id,
                'api_key': self.api_key,
                'file_type': 'json',
                'sort_order': 'desc',
                'limit': limit
            }

            if start_date:
                params['observation_start'] = start_date
            if end_date:
                params['observation_end'] = end_date

            url = f"{self.base_url}/series/observations"
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()

            data = response.json()
            observations = data.get('observations', [])

            # Filter out missing values and convert to TimeSeriesDataPoint
            time_series = []
            for obs in observations:
                if obs['value'] != '.':  # FRED uses '.' for missing values
                    time_series.append(TimeSeriesDataPoint(
                        date=obs['date'],
                        value=float(obs['value'])
                    ))

            # Reverse to get chronological order
            time_series.reverse()

            # Cache the result
            self.cache.set(cache_key, [asdict(point) for point in time_series], self.cache_ttl)

            return time_series

        except requests.exceptions.RequestException as e:
            print(f"FRED API request failed for series {series_id}: {str(e)}")
            return None
        except (ValueError, KeyError) as e:
            print(f"Failed to parse FRED API response for series {series_id}: {str(e)}")
            return None

    def _get_latest_observation(self, series_id: str) -> Optional[float]:
        """
        Internal helper to get the most recent observation for a series.

        Args:
            series_id: FRED series ID

        Returns:
            Latest value as float or None if not available
        """
        try:
            params = {
                'series_id': series_id,
                'api_key': self.api_key,
                'file_type': 'json',
                'sort_order': 'desc',
                'limit': 1
            }

            url = f"{self.base_url}/series/observations"
            response = requests.get(url, params=params, timeout=10)
            response.raise_for_status()

            data = response.json()
            observations = data.get('observations', [])

            if observations and observations[0]['value'] != '.':
                return float(observations[0]['value'])

            return None

        except Exception as e:
            print(f"Error fetching latest observation for {series_id}: {str(e)}")
            return None

    def _calculate_yoy_change(self, series_id: str) -> Optional[float]:
        """
        Calculate year-over-year percentage change for a series.

        Args:
            series_id: FRED series ID

        Returns:
            YoY percentage change or None if not enough data
        """
        try:
            # Fetch 400 days of data to ensure we get 12 months ago
            time_series = self.get_time_series(series_id, limit=400)

            if not time_series or len(time_series) < 2:
                return None

            # Get most recent value
            current_value = time_series[-1].value
            current_date = datetime.fromisoformat(time_series[-1].date)

            # Find value from approximately 365 days ago
            target_date = current_date - timedelta(days=365)

            # Find closest observation to target date
            year_ago_value = None
            min_diff = timedelta(days=9999)

            for point in time_series:
                point_date = datetime.fromisoformat(point.date)
                diff = abs(point_date - target_date)
                if diff < min_diff:
                    min_diff = diff
                    year_ago_value = point.value

            if year_ago_value is None or year_ago_value == 0:
                return None

            # Calculate percentage change
            yoy_change = ((current_value - year_ago_value) / year_ago_value) * 100
            return round(yoy_change, 2)

        except Exception as e:
            print(f"Error calculating YoY change for {series_id}: {str(e)}")
            return None

    def _macro_data_to_dict(self, data: MacroeconomicData) -> dict:
        """Convert MacroeconomicData to dictionary for caching."""
        return data.to_dict()

    def _dict_to_macro_data(self, data: dict) -> MacroeconomicData:
        """Convert dictionary back to MacroeconomicData object."""
        return MacroeconomicData(
            interest_rates=InterestRateData(
                federal_funds_rate=data['interestRates']['federalFundsRate'],
                prime_rate=data['interestRates']['primeRate'],
                mortgage_30yr=data['interestRates']['mortgage30Year'],
                mortgage_15yr=data['interestRates']['mortgage15Year'],
                treasury_10yr=data['interestRates']['treasury10Year'],
                treasury_2yr=data['interestRates']['treasury2Year']
            ),
            inflation=InflationData(
                cpi_all_items=data['inflation']['cpiAllItems'],
                core_cpi=data['inflation']['coreCpi'],
                pce_inflation=data['inflation']['pceInflation'],
                cpi_yoy_change=data['inflation']['cpiYoyChange']
            ),
            housing_market=HousingMarketData(
                housing_starts=data['housingMarket']['housingStarts'],
                building_permits=data['housingMarket']['buildingPermits'],
                home_sales_existing=data['housingMarket']['homeSalesExisting'],
                home_sales_new=data['housingMarket']['homeSalesNew'],
                case_shiller_index=data['housingMarket']['caseShillerIndex']
            ),
            economic_indicators=EconomicIndicators(
                gdp_real=data['economicIndicators']['realGdp'],
                gdp_growth_rate=data['economicIndicators']['gdpGrowthRate'],
                unemployment_rate=data['economicIndicators']['unemploymentRate'],
                labor_force_participation=data['economicIndicators']['laborForceParticipation'],
                consumer_sentiment=data['economicIndicators']['consumerSentiment']
            ),
            last_updated=data['lastUpdated']
        )


def asdict(obj):
    """Helper to convert dataclass to dict."""
    from dataclasses import asdict as dc_asdict
    return dc_asdict(obj)
