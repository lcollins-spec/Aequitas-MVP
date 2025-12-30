/**
 * API client for deal management operations
 * Communicates with backend REST API for CRUD operations
 */

import type {
  Deal,
  DealFormData,
  DealResponse,
  DealsListResponse,
  DealsGroupedResponse,
  DealDeleteResponse,
  DealStatus,
  ApiError
} from '../types/deal';

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

  /**
   * Export a deal to Excel (single-family financial model)
   * Downloads the Excel file directly
   */
  async exportDealToExcel(dealId: number, dealName: string): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/deals/${dealId}/export`);

      if (!response.ok) {
        const error: ApiError = await response.json();
        throw new Error(error.error || 'Failed to export deal');
      }

      // Get the blob from the response
      const blob = await response.blob();

      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dealName.replace(/\s+/g, '_')}_financial_model.xlsx`;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error(`Error exporting deal ${dealId}:`, error);
      throw error;
    }
  }

  /**
   * Export multifamily underwriting to Excel
   * Downloads comprehensive multifamily underwriting model
   */
  async exportMultifamilyToExcel(dealId: number, underwritingData: any): Promise<void> {
    try {
      const response = await fetch(`${API_BASE_URL}/underwriting/${dealId}/export-excel`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(underwritingData)
      });

      if (!response.ok) {
        const error: ApiError = await response.json();
        throw new Error(error.error || 'Failed to export multifamily underwriting');
      }

      // Get the blob from the response
      const blob = await response.blob();

      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${underwritingData.propertyName?.replace(/\s+/g, '_') || 'Property'}_Underwriting_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error(`Error exporting multifamily underwriting ${dealId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const dealApi = new DealApiClient();
