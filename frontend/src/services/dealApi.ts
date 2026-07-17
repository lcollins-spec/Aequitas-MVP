/**
 * API client for deal management operations
 * Communicates with backend REST API for CRUD operations
 */

import type {
  Deal,
  DealResponse,
  DealsListResponse,
  DealsGroupedResponse,
  DealDeleteResponse,
  DealStatus,
  ApiError
} from '../types/deal';

export interface ExcelMetrics {
  leveredIRR: number | null;
  leveredEM: number | null;
  unleveredIRR: number | null;
  unleveredEM: number | null;
  lpIRR: number | null;
  lpEM: number | null;
}

const API_BASE_URL = '/api/v1';

class DealApiClient {
  /**
   * Get all deals with optional status filter
   */
  async getAllDeals(status?: DealStatus, limit: number = 100): Promise<Deal[]> {
    try {
      const params = new URLSearchParams();
      if (status) {
        params.append('status', status);
      }
      params.append('limit', limit.toString());

      const response = await fetch(`${API_BASE_URL}/deals?${params}`);

      if (!response.ok) {
        const error: ApiError = await response.json();
        throw new Error(error.error || 'Failed to fetch deals');
      }

      const data: DealsListResponse = await response.json();
      return data.deals;
    } catch (error) {
      console.error('Error fetching deals:', error);
      throw error;
    }
  }

  /**
   * Get deals grouped by status
   */
  async getDealsGrouped(): Promise<DealsGroupedResponse> {
    try {
      const response = await fetch(`${API_BASE_URL}/deals/grouped`);

      if (!response.ok) {
        const error: ApiError = await response.json();
        throw new Error(error.error || 'Failed to fetch grouped deals');
      }

      const data: DealsGroupedResponse = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching grouped deals:', error);
      throw error;
    }
  }

  /**
   * Get a single deal by ID
   */
  async getDeal(dealId: number): Promise<Deal> {
    try {
      const response = await fetch(`${API_BASE_URL}/deals/${dealId}`);

      if (!response.ok) {
        const error: ApiError = await response.json();
        throw new Error(error.error || 'Failed to fetch deal');
      }

      const data: DealResponse = await response.json();
      return data.deal;
    } catch (error) {
      console.error(`Error fetching deal ${dealId}:`, error);
      throw error;
    }
  }

  /**
   * Create a new deal
   */
  async createDeal(dealData: Partial<Deal>): Promise<Deal> {
    try {
      const response = await fetch(`${API_BASE_URL}/deals`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dealData)
      });

      if (!response.ok) {
        const error: ApiError = await response.json();
        throw new Error(error.error || 'Failed to create deal');
      }

      const data: DealResponse = await response.json();
      return data.deal;
    } catch (error) {
      console.error('Error creating deal:', error);
      throw error;
    }
  }

  /**
   * Update an existing deal
   */
  async updateDeal(dealId: number, dealData: Partial<Deal>): Promise<Deal> {
    try {
      const response = await fetch(`${API_BASE_URL}/deals/${dealId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(dealData)
      });

      if (!response.ok) {
        const error: ApiError = await response.json();
        throw new Error(error.error || 'Failed to update deal');
      }

      const data: DealResponse = await response.json();
      return data.deal;
    } catch (error) {
      console.error(`Error updating deal ${dealId}:`, error);
      throw error;
    }
  }

  /**
   * Delete a deal
   */
  async deleteDeal(dealId: number): Promise<boolean> {
    try {
      const response = await fetch(`${API_BASE_URL}/deals/${dealId}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const error: ApiError = await response.json();
        throw new Error(error.error || 'Failed to delete deal');
      }

      const data: DealDeleteResponse = await response.json();
      return data.success;
    } catch (error) {
      console.error(`Error deleting deal ${dealId}:`, error);
      throw error;
    }
  }

}

// Export singleton instance
export const dealApi = new DealApiClient();
