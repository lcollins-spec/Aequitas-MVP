import type { RegulationItem } from '../types/regulation';

const API_BASE_URL = '/api/v1';

export const fetchMarketRegulations = async (
  market: string,
  topics: string[]
): Promise<RegulationItem[]> => {
  const response = await fetch(`${API_BASE_URL}/regulations/fetch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ market, topics }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.error || `Request failed (${response.status})`);
  }

  const data = await response.json();
  if (!data.success || !data.data) {
    throw new Error(data.error || 'Failed to fetch regulations');
  }

  return data.data as RegulationItem[];
};
