/**
 * TypeScript types for deal management
 */

export type DealStatus = 'potential' | 'ongoing' | 'completed' | 'rejected';

// Pipeline status — stored in localStorage, separate from DB deal status
export type PipelineStatus =
  | 'Analyzing'
  | 'Data Room Received'
  | 'LOI Executed'
  | 'Under Contract'
  | 'Closed'
  | 'Exited';

export const PIPELINE_STATUSES: PipelineStatus[] = [
  'Analyzing',
  'Data Room Received',
  'LOI Executed',
  'Under Contract',
  'Closed',
  'Exited',
];

export const PIPELINE_STATUS_STYLES: Record<PipelineStatus, string> = {
  'Analyzing':          'bg-gray-100 text-gray-600 border-gray-200',
  'Data Room Received': 'bg-blue-100 text-blue-700 border-blue-200',
  'LOI Executed':       'bg-purple-100 text-purple-700 border-purple-200',
  'Under Contract':     'bg-amber-100 text-amber-700 border-amber-200',
  'Closed':             'bg-green-100 text-green-700 border-green-200',
  'Exited':             'bg-teal-100 text-teal-700 border-teal-200',
};

const PIPELINE_STATUS_LS_KEY = 'aequitas_pipeline_statuses';

export const getPipelineStatus = (dealId: number): PipelineStatus => {
  try {
    const raw = localStorage.getItem(PIPELINE_STATUS_LS_KEY);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, PipelineStatus>;
      return map[String(dealId)] ?? 'Analyzing';
    }
  } catch { /* ignore */ }
  return 'Analyzing';
};

export const setPipelineStatus = (dealId: number, status: PipelineStatus): void => {
  try {
    const raw = localStorage.getItem(PIPELINE_STATUS_LS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, PipelineStatus>) : {};
    map[String(dealId)] = status;
    localStorage.setItem(PIPELINE_STATUS_LS_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
  // Fire-and-forget sync to backend
  fetch(`/api/v1/deals/${dealId}/pipeline-status`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pipelineStatus: status }),
  }).catch(() => {});
};

/** On app init, load pipeline statuses from backend and merge into localStorage cache. */
export const syncPipelineStatusesFromBackend = async (dealIds: number[]): Promise<void> => {
  try {
    const raw = localStorage.getItem(PIPELINE_STATUS_LS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, PipelineStatus>) : {};
    await Promise.all(dealIds.map(async (id) => {
      try {
        const res = await fetch(`/api/v1/deals/${id}/pipeline-status`);
        if (res.ok) {
          const json = await res.json();
          map[String(id)] = json.pipelineStatus ?? 'Analyzing';
        }
      } catch { /* ignore */ }
    }));
    localStorage.setItem(PIPELINE_STATUS_LS_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
};

export interface Deal {
  // Primary Key
  id?: number;

  // Basic Deal Information
  dealName: string;
  location: string;
  status: DealStatus;
  createdAt?: string;
  updatedAt?: string;

  // Property Information
  propertyAddress?: string;
  latitude?: number;
  longitude?: number;

  // Purchase Details
  purchasePrice?: number;
  downPaymentPercent?: number;
  loanInterestRate?: number;
  loanTermYears?: number;
  closingCosts?: number;

  // Income
  monthlyRent?: number;
  otherMonthlyIncome?: number;
  vacancyRate?: number;
  annualRentIncrease?: number;

  // Expenses
  propertyTaxAnnual?: number;
  insuranceAnnual?: number;
  hoaMonthly?: number;
  maintenancePercent?: number;
  propertyManagementPercent?: number;
  utilitiesMonthly?: number;
  otherExpensesMonthly?: number;

  // Property Details
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
  propertyType?: string;
  yearBuilt?: number;

  // Market Data Snapshots (JSON strings)
  rentcastData?: string;
  fredData?: string;
  underwritingJson?: string;
  dscrJson?: string;

  // Calculated Metrics
  monthlyPayment?: number;
  totalMonthlyIncome?: number;
  totalMonthlyExpenses?: number;
  monthlyCashFlow?: number;
  cashOnCashReturn?: number;
  capRate?: number;
  roi?: number;
  npv?: number;
  irr?: number;
  equityMultiple?: number;
}

export interface DealFormData {
  dealName: string;
  location: string;
  status: DealStatus;
  propertyAddress?: string;
  latitude?: number;
  longitude?: number;
}

export interface DealResponse {
  deal: Deal;
}

export interface DealsListResponse {
  deals: Deal[];
}

export interface DealsGroupedResponse {
  potential: Deal[];
  ongoing: Deal[];
  completed: Deal[];
  rejected: Deal[];
}

export interface DealDeleteResponse {
  success: boolean;
  message: string;
}

export interface ApiError {
  error: string;
}

export const DEAL_STATUS_LABELS: Record<DealStatus, string> = {
  potential: 'Potential',
  ongoing: 'Ongoing',
  completed: 'Completed',
  rejected: 'Rejected'
};

export const DEAL_STATUS_COLORS: Record<DealStatus, { bg: string; text: string; border: string }> = {
  potential: {
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200'
  },
  ongoing: {
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200'
  },
  completed: {
    bg: 'bg-green-50',
    text: 'text-green-700',
    border: 'border-green-200'
  },
  rejected: {
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200'
  }
};
