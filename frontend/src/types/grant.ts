export type GrantStatus = 'open' | 'closed' | 'upcoming';
export type GrantType = 'Tax Credit' | 'Grant' | 'State' | 'Federal';
export type CompatibilityLevel = 'High' | 'Match Required' | 'Low';

export interface Grant {
  id: string;
  title: string;
  description: string;
  type: GrantType;
  status: GrantStatus;
  eligibility: string;
  deadline?: string;
  requirement: string;
  compatibility: CompatibilityLevel;
  amount?: string;
  isFeatured?: boolean;
  category: 'federal' | 'state' | 'local' | 'tax-credit' | 'direct-grant';
}

export interface GrantFilters {
  search: string;
  category: 'all' | 'federal' | 'state' | 'local' | 'tax-credit' | 'direct-grant';
}
