/**
 * API client for property scraping operations
 * Communicates with backend REST API for property data extraction
 */

import type {
  PropertyImport,
  PropertyImportResponse,
  ListImportsResponse
} from '../types/scraping';

const API_BASE_URL = '/api/v1';

class ScrapingApiClient {
  /**
   * Extract property data from a listing URL
   */
  async extractPropertyData(
    url: string,
    enrichWithApi: boolean = true
  ): Promise<PropertyImport> {
    try {
      const response = await fetch(`${API_BASE_URL}/scraping/extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ url, enrichWithApi })
      });

      const data: PropertyImportResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to extract property data');
      }

      if (!data.data) {
        throw new Error('No data returned from extraction');
      }

      return data.data;
    } catch (error) {
      console.error('Error extracting property data:', error);
      throw error;
    }
  }

  /**
   * Extract property data from a PDF file
   */
  async extractFromPdf(file: File): Promise<PropertyImport> {
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`${API_BASE_URL}/scraping/extract-pdf`, {
        method: 'POST',
        body: formData
      });

      const data: PropertyImportResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to extract property data from PDF');
      }

      if (!data.data) {
        throw new Error('No data returned from extraction');
      }

      return data.data;
    } catch (error) {
      console.error('Error extracting data from PDF:', error);
      throw error;
    }
  }

  /**
   * Get a property import by ID
   */
  async getImport(importId: number): Promise<PropertyImport> {
    try {
      const response = await fetch(`${API_BASE_URL}/scraping/imports/${importId}`);

      const data: PropertyImportResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch import');
      }

      if (!data.data) {
        throw new Error('No data returned');
      }

      return data.data;
    } catch (error) {
      console.error(`Error fetching import ${importId}:`, error);
      throw error;
    }
  }

  /**
   * List recent property imports with optional filters
   */
  async listImports(params?: {
    limit?: number;
    status?: string;
    dealId?: number;
  }): Promise<PropertyImport[]> {
    try {
      const searchParams = new URLSearchParams();

      if (params?.limit) {
        searchParams.append('limit', params.limit.toString());
      }

      if (params?.status) {
        searchParams.append('status', params.status);
      }

      if (params?.dealId) {
        searchParams.append('dealId', params.dealId.toString());
      }

      const response = await fetch(
        `${API_BASE_URL}/scraping/imports?${searchParams}`
      );

      const data: ListImportsResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to fetch imports');
      }

      return data.data?.imports || [];
    } catch (error) {
      console.error('Error fetching imports:', error);
      throw error;
    }
  }

  /**
   * Update a property import (e.g., link to deal, mark as user-assisted)
   */
  async updateImport(
    importId: number,
    updates: {
      dealId?: number;
      userAssisted?: boolean;
    }
  ): Promise<PropertyImport> {
    try {
      const response = await fetch(`${API_BASE_URL}/scraping/imports/${importId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(updates)
      });

      const data: PropertyImportResponse = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update import');
      }

      if (!data.data) {
        throw new Error('No data returned');
      }

      return data.data;
    } catch (error) {
      console.error(`Error updating import ${importId}:`, error);
      throw error;
    }
  }
}

// Export singleton instance
export const scrapingApi = new ScrapingApiClient();
