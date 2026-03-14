/**
 * Deal Execution — localStorage-only types (Phase 1)
 * Keyed in localStorage as: aequitas_deal_executions → Record<dealId, DealExecutionRecord>
 */

export type DocumentType = 'T12' | 'Rent Roll' | 'Appraisal' | 'Inspection' | 'Loan Docs' | 'Other';

export const DOCUMENT_TYPES: DocumentType[] = ['T12', 'Rent Roll', 'Appraisal', 'Inspection', 'Loan Docs', 'Other'];

/** Documents that Claude will attempt to extract from */
export const EXTRACTABLE_TYPES: DocumentType[] = ['T12', 'Rent Roll'];

export interface DealDocument {
  id: string;
  name: string;
  size: number;
  type: DocumentType;
  uploadedAt: string;
  /** Whether an AI extraction was attempted */
  extractionAttempted?: boolean;
}

/** Extracted fields from an LOI document — all optional, user must verify before confirming */
export interface LoiExtractedData {
  purchasePrice?: number;
  earnestMoneyDeposit?: number;
  dueDiligenceDeadline?: string;   // ISO date string
  financingContingency?: string;   // ISO date string
  targetCloseDate?: string;        // ISO date string
  loanAmount?: number;
  interestRate?: number;           // decimal e.g. 0.065
  loanTermMonths?: number;
}

// Section C types — CapEx line items
export interface CapexItem {
  id: string;
  description: string;
  amount: number;
}

// Milestone target dates — editable on Deal Execution page
export interface MilestoneDates {
  underContractTarget?: string;  // ISO date (user-set target)
  closedTarget?: string;         // ISO date (user-set target)
  exitedTarget?: string;         // ISO date (user-set target)
}

// Section D types — populated by Deal Execution page (item 6)
export interface CapitalCall {
  id: string;
  date: string;           // ISO date
  amountCalled: number;
  amountReceived: number;
  purpose: string;
  status: 'Pending' | 'Funded' | 'Partial';
}

export interface Distribution {
  id: string;
  date: string;           // ISO date
  amount: number;
  type: 'Operating' | 'Return of Capital' | 'Disposition';
}

// Section B pro-forma snapshot — populated by Deal Execution page (item 6)
export interface ProFormaSnapshot {
  projectedExitValue?: number;
  projectedLpNetIrr?: number;
  projectedEquityMultiple?: number;
  aequitasEquity?: number;
  strategy?: 'Acquisition' | 'Light Rehab' | 'Heavy Rehab';
}

export interface DealExecutionRecord {
  dealId: number;
  dealName: string;
  propertyAddress?: string;
  location?: string;
  totalUnits?: number;
  purchasePrice?: number;
  createdAt: string;
  documents: DealDocument[];
  /** Populated after LOI is confirmed */
  loiData?: LoiExtractedData;
  loiDocumentName?: string;
  /** Timestamp when LOI was executed — set by Underwriting page */
  loiExecutedAt?: string;
  /** Section C — CapEx line items */
  capexItems?: CapexItem[];
  /** Section D — capital calls and distributions */
  capitalCalls?: CapitalCall[];
  distributions?: Distribution[];
  /** Section B snapshot for fund roll-up */
  proForma?: ProFormaSnapshot;
  /** Milestone target dates */
  milestones?: MilestoneDates;
}

const DEAL_EXEC_LS_KEY = 'aequitas_deal_executions';

export const getDealExecution = (dealId: number): DealExecutionRecord | null => {
  try {
    const raw = localStorage.getItem(DEAL_EXEC_LS_KEY);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, DealExecutionRecord>;
      return map[String(dealId)] ?? null;
    }
  } catch { /* ignore */ }
  return null;
};

export const saveDealExecution = (record: DealExecutionRecord): void => {
  try {
    const raw = localStorage.getItem(DEAL_EXEC_LS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, DealExecutionRecord>) : {};
    map[String(record.dealId)] = record;
    localStorage.setItem(DEAL_EXEC_LS_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
};

/** Merge partial updates into an existing record without overwriting other fields */
export const patchDealExecution = (dealId: number, patch: Partial<DealExecutionRecord>): void => {
  try {
    const raw = localStorage.getItem(DEAL_EXEC_LS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, DealExecutionRecord>) : {};
    const existing = map[String(dealId)];
    if (existing) {
      map[String(dealId)] = { ...existing, ...patch };
      localStorage.setItem(DEAL_EXEC_LS_KEY, JSON.stringify(map));
    }
  } catch { /* ignore */ }
};

export const getAllDealExecutions = (): DealExecutionRecord[] => {
  try {
    const raw = localStorage.getItem(DEAL_EXEC_LS_KEY);
    if (raw) {
      return Object.values(JSON.parse(raw) as Record<string, DealExecutionRecord>);
    }
  } catch { /* ignore */ }
  return [];
};
