"""Data models for Federal Reserve Economic Data (FRED) API responses."""

from dataclasses import dataclass, asdict
from typing import Optional


@dataclass
class InterestRateData:
    """Current interest rate snapshot."""
    federal_funds_rate: Optional[float]
    prime_rate: Optional[float]
    mortgage_30yr: Optional[float]
    mortgage_15yr: Optional[float]
    treasury_10yr: Optional[float]
    treasury_2yr: Optional[float]

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            'federalFundsRate': self.federal_funds_rate,
            'primeRate': self.prime_rate,
            'mortgage30Year': self.mortgage_30yr,
            'mortgage15Year': self.mortgage_15yr,
            'treasury10Year': self.treasury_10yr,
            'treasury2Year': self.treasury_2yr
        }


@dataclass
class InflationData:
    """Inflation metrics with year-over-year calculations."""
    cpi_all_items: Optional[float]
    core_cpi: Optional[float]
    pce_inflation: Optional[float]
    cpi_yoy_change: Optional[float]

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            'cpiAllItems': self.cpi_all_items,
            'coreCpi': self.core_cpi,
            'pceInflation': self.pce_inflation,
            'cpiYoyChange': self.cpi_yoy_change
        }


@dataclass
class HousingMarketData:
    """Housing market indicators."""
    housing_starts: Optional[int]
    building_permits: Optional[int]
    home_sales_existing: Optional[float]
    home_sales_new: Optional[int]
    case_shiller_index: Optional[float]

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            'housingStarts': self.housing_starts,
            'buildingPermits': self.building_permits,
            'homeSalesExisting': self.home_sales_existing,
            'homeSalesNew': self.home_sales_new,
            'caseShillerIndex': self.case_shiller_index
        }


@dataclass
class EconomicIndicators:
    """Broad economic health indicators."""
    gdp_real: Optional[float]
    gdp_growth_rate: Optional[float]
    unemployment_rate: Optional[float]
    labor_force_participation: Optional[float]
    consumer_sentiment: Optional[float]

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            'realGdp': self.gdp_real,
            'gdpGrowthRate': self.gdp_growth_rate,
            'unemploymentRate': self.unemployment_rate,
            'laborForceParticipation': self.labor_force_participation,
            'consumerSentiment': self.consumer_sentiment
        }


@dataclass
class TimeSeriesDataPoint:
    """Individual time series data point."""
    date: str
    value: float

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            'date': self.date,
            'value': self.value
        }


@dataclass
class MacroeconomicData:
    """Complete macroeconomic snapshot."""
    interest_rates: InterestRateData
    inflation: InflationData
    housing_market: HousingMarketData
    economic_indicators: EconomicIndicators
    last_updated: str

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        return {
            'interestRates': self.interest_rates.to_dict(),
            'inflation': self.inflation.to_dict(),
            'housingMarket': self.housing_market.to_dict(),
            'economicIndicators': self.economic_indicators.to_dict(),
            'lastUpdated': self.last_updated
        }
