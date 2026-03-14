// Legacy types kept for backward-compat with any other consumers
export type RegulationStatus = 'compliant' | 'concerning' | 'negotiation' | 'active' | 'proposed' | 'needed' | 'enacted';

export interface Regulation {
  id: string;
  title: string;
  description: string;
  status: RegulationStatus;
  effectiveDate: string;
  sunset?: string;
}

export interface RegulatoryChange {
  id: string;
  title: string;
  description: string;
  status: 'proposed' | 'enacted';
  proposedDate?: string;
  enactedDate?: string;
  effectiveDate?: string;
}

export interface Market {
  id: string;
  name: string;
  state: string;
  riskScore: number;
}

export interface MarketRegulationsSummary {
  market: Market;
  lastChecked: string;
  compliantCount: number;
  concerningCount: number;
  proposedChangesCount: number;
  currentRegulations: Regulation[];
  upcomingChanges: RegulatoryChange[];
}

// --- New API-driven types ---

export type ApiRegulationStatus = 'funding' | 'enabling' | 'risk';
export type RegulationJurisdiction = 'federal' | 'state' | 'local';
export type RegulationType = 'current' | 'upcoming';

export interface RegulationItem {
  title: string;
  summary: string;
  status: ApiRegulationStatus;
  jurisdiction: RegulationJurisdiction;
  type: RegulationType;
}

export interface MarketEntry {
  id: string;
  name: string;
}

export interface MarketData {
  regulations: RegulationItem[];
  lastChecked: string; // ISO datetime string
}

export interface PinnedItem {
  id: string;
  regulation: RegulationItem;
  note: string;
  pinnedAt: string;
  marketId: string;
  marketName: string;
}
