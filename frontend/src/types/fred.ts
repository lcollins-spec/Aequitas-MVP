/**
 * TypeScript types for FRED (Federal Reserve Economic Data) API
 */

export interface InterestRateData {
  federalFundsRate: number | null;
  primeRate: number | null;
  mortgage30Year: number | null;
  mortgage15Year: number | null;
  treasury10Year: number | null;
  treasury2Year: number | null;
}

export interface InflationData {
  cpiAllItems: number | null;
  coreCpi: number | null;
  pceInflation: number | null;
  cpiYoyChange: number | null;
}

export interface HousingMarketData {
  housingStarts: number | null;
  buildingPermits: number | null;
  homeSalesExisting: number | null;
  homeSalesNew: number | null;
  caseShillerIndex: number | null;
}

export interface EconomicIndicators {
  realGdp: number | null;
  gdpGrowthRate: number | null;
  unemploymentRate: number | null;
  laborForceParticipation: number | null;
  consumerSentiment: number | null;
}

export interface TimeSeriesDataPoint {
  date: string;
  value: number;
}

export interface MacroeconomicData {
  interestRates: InterestRateData;
  inflation: InflationData;
  housingMarket: HousingMarketData;
  economicIndicators: EconomicIndicators;
  lastUpdated: string;
}

// API Response types
export interface FREDResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  lastUpdated?: string;
}

export interface MacroSnapshotResponse extends FREDResponse<MacroeconomicData> {}

export interface RatesResponse extends FREDResponse<InterestRateData> {}

export interface InflationResponse extends FREDResponse<InflationData> {}

export interface HousingMarketResponse extends FREDResponse<HousingMarketData> {}

export interface EconomicIndicatorsResponse extends FREDResponse<EconomicIndicators> {}

export interface TimeSeriesResponse extends FREDResponse<TimeSeriesDataPoint[]> {
  seriesId?: string;
  count?: number;
  months?: number;
}
