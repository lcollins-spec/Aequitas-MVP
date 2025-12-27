/**
 * FRED (Federal Reserve Economic Data) API Client
 */

import type {
  MacroSnapshotResponse,
  RatesResponse,
  InflationResponse,
  HousingMarketResponse,
  EconomicIndicatorsResponse,
  TimeSeriesResponse,
} from '../types/fred';

const API_BASE_URL = '/api/v1';

export const fredApi = {
  /**
   * Get complete macroeconomic snapshot
   */
  async getMacroSnapshot(): Promise<MacroSnapshotResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/fred/macro`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching macro snapshot:', error);
      return {
        success: false,
        error: 'Network error fetching macroeconomic data',
        code: 'NETWORK_ERROR',
      };
    }
  },

  /**
   * Get current interest rates only
   */
  async getRates(): Promise<RatesResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/fred/rates`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching interest rates:', error);
      return {
        success: false,
        error: 'Network error fetching interest rates',
        code: 'NETWORK_ERROR',
      };
    }
  },

  /**
   * Get inflation metrics
   */
  async getInflation(): Promise<InflationResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/fred/inflation`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching inflation data:', error);
      return {
        success: false,
        error: 'Network error fetching inflation data',
        code: 'NETWORK_ERROR',
      };
    }
  },

  /**
   * Get housing market indicators
   */
  async getHousingMarket(): Promise<HousingMarketResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/fred/housing-market`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching housing market data:', error);
      return {
        success: false,
        error: 'Network error fetching housing market data',
        code: 'NETWORK_ERROR',
      };
    }
  },

  /**
   * Get economic indicators
   */
  async getEconomicIndicators(): Promise<EconomicIndicatorsResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/fred/economic-indicators`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching economic indicators:', error);
      return {
        success: false,
        error: 'Network error fetching economic indicators',
        code: 'NETWORK_ERROR',
      };
    }
  },

  /**
   * Get historical mortgage rates
   * @param months - Number of months of history (1-60, default 12)
   */
  async getMortgageRatesHistory(months: number = 12): Promise<TimeSeriesResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/fred/mortgage-rates?months=${months}`);
      return await response.json();
    } catch (error) {
      console.error('Error fetching mortgage rate history:', error);
      return {
        success: false,
        error: 'Network error fetching mortgage rate history',
        code: 'NETWORK_ERROR',
      };
    }
  },

  /**
   * Get time series data for any FRED series
   * @param seriesId - FRED series identifier (e.g., 'FEDFUNDS')
   * @param params - Optional parameters (startDate, endDate, limit)
   */
  async getSeries(
    seriesId: string,
    params?: {
      startDate?: string;
      endDate?: string;
      limit?: number;
    }
  ): Promise<TimeSeriesResponse> {
    try {
      const queryParams = new URLSearchParams();
      if (params?.startDate) queryParams.append('start_date', params.startDate);
      if (params?.endDate) queryParams.append('end_date', params.endDate);
      if (params?.limit) queryParams.append('limit', params.limit.toString());

      const url = `${API_BASE_URL}/fred/series/${seriesId}${
        queryParams.toString() ? `?${queryParams.toString()}` : ''
      }`;

      const response = await fetch(url);
      return await response.json();
    } catch (error) {
      console.error(`Error fetching series ${seriesId}:`, error);
      return {
        success: false,
        error: `Network error fetching series ${seriesId}`,
        code: 'NETWORK_ERROR',
      };
    }
  },
};
