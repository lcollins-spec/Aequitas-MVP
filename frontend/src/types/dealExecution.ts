/**
 * Deal Execution — localStorage-only types (Phase 1)
 * Keyed in localStorage as: aequitas_deal_executions → Record<dealId, DealExecutionRecord>
 */

export type DocumentType = 'OM' | 'T12' | 'Rent Roll' | 'LOI Draft' | 'PSA Draft' | 'Email' | 'Other';

export const DOCUMENT_TYPES: DocumentType[] = ['OM', 'T12', 'Rent Roll', 'LOI Draft', 'PSA Draft', 'Email', 'Other'];

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

// CapEx line items
export interface CapexItem {
  id: string;
  description: string;
  amount: number;
}

// Loan Details table — one row per loan tranche
export interface LoanRow {
  lender: string;
  loanAmount: string;
  ltvOverride?: string;   // user-set LTV when auto-calc not available
  interestRate: string;
  rateType: 'Fixed' | 'Float';
  term: string;           // years
  amortization: string;   // years
  ioPeriod: string;       // months
}

// JV / Partnership Terms
export interface JvTerms {
  operatorEquityShare?: number;
  preferredReturn?: number;
  promoteStructure?: string;
  acquisitionFee?: number;
  assetManagementFee?: number;
  dispositionFee?: number;
}

// Control & Approval Rights
export interface ControlApproval {
  majorDecisionRequired?: boolean;
  approvedFor?: string[];
  majorCapexThreshold?: number;
  notes?: string;
}

// Milestone target dates — editable on Deal Execution page
export interface MilestoneDates {
  underContractTarget?: string;  // ISO date (user-set target)
  closedTarget?: string;         // ISO date (user-set target)
  exitedTarget?: string;         // ISO date (user-set target)
}

// Capital calls and distributions
export interface CapitalCall {
  id: string;
  date: string;
  amountCalled: number;
  amountReceived: number;
  purpose: string;
  status: 'Pending' | 'Funded' | 'Partial';
}

export interface Distribution {
  id: string;
  date: string;
  amount: number;
  type: 'Operating' | 'Return of Capital' | 'Disposition';
}

// Pro-forma snapshot for fund roll-up
export interface ProFormaSnapshot {
  projectedExitValue?: number;
  projectedLpNetIrr?: number;
  projectedEquityMultiple?: number;
  aequitasEquity?: number;
  strategy?: 'Acquisition' | 'Light Rehab' | 'Heavy Rehab';
}

export type DDItemStatus = 'pending' | 'uploaded' | 'reviewed';

export type DealStage = 1 | 2 | 3;

export const DATA_ROOM_ITEMS: { id: string; label: string }[] = [
  { id: 'dr_om',           label: 'Offering Memorandum (OM)' },
  { id: 'dr_rent_roll',    label: 'Rent Roll' },
  { id: 'dr_t12',          label: 'T12' },
  { id: 'dr_leases',       label: 'Leases' },
  { id: 'dr_tax_bills',    label: 'Tax Bills' },
  { id: 'dr_utility_bills', label: 'Utility Bills' },
  { id: 'dr_inspection',   label: 'Inspection Report' },
];

export const CLOSING_ITEMS: { id: string; label: string }[] = [
  { id: 'cl_psa',        label: 'PSA Executed' },
  { id: 'cl_title',      label: 'Title Cleared' },
  { id: 'cl_estoppels',  label: 'Estoppels Received' },
  { id: 'cl_insurance',  label: 'Insurance Bound' },
  { id: 'cl_wire',       label: 'Wire Sent' },
  { id: 'cl_keys',       label: 'Keys Received' },
];

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
  /** CapEx line items (Section D) */
  capexItems?: CapexItem[];
  /** Capital calls and distributions */
  capitalCalls?: CapitalCall[];
  distributions?: Distribution[];
  /** Pro-forma snapshot for fund roll-up */
  proForma?: ProFormaSnapshot;
  /** Milestone target dates */
  milestones?: MilestoneDates;
  /** DD Checklist — status per item id */
  ddChecklist?: Record<string, DDItemStatus>;
  /** DD Checklist — uploaded filename per item id */
  ddUploads?: Record<string, string>;
  /** Current stage: 1=Data Room, 2=Due Diligence, 3=Closing. Defaults to 1. */
  stage?: DealStage;
  /** Stage 1 — Data Room checklist status per item id */
  dataRoomChecklist?: Record<string, DDItemStatus>;
  /** Stage 1 — Data Room uploaded filename per item id */
  dataRoomUploads?: Record<string, string>;
  /** Stage 3 — Closing checklist: item id → checked */
  closingChecklist?: Record<string, boolean>;

  // ─── Extended Section A fields ───────────────────────────────────────────
  transactionType?: string;
  earnestMoneyRefundable?: boolean;
  financingContingencyPeriodDays?: number;
  exclusivity?: boolean;
  psaDraftedBy?: string;
  psaExecutedDate?: string;
  earnestMoneyHardDate?: string;
  keyConditions?: string;
  loiNotes?: string;

  // ─── Loan Details table (replaces individual loiData loan fields) ─────────
  loanDetails?: LoanRow[];

  // ─── Stage 2 document uploads (LOI Draft, PSA Draft) ─────────────────────
  stage2Uploads?: Record<string, string>;

  // ─── Section B — JV / Partnership Terms ──────────────────────────────────
  jvTerms?: JvTerms;

  // ─── Section C — Control & Approval Rights ───────────────────────────────
  controlApproval?: ControlApproval;
}

const DEAL_EXEC_LS_KEY = 'aequitas_deal_executions';

// ─── Backend sync helpers (fire-and-forget) ───────────────────────────────────

const _syncRecordToBackend = (record: DealExecutionRecord): void => {
  fetch(`/api/v1/deals/${record.dealId}/execution-data`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: record }),
  }).catch(() => {});
};

/** Fetch a single deal's execution record from the backend and merge into localStorage. */
export const loadExecutionFromBackend = async (dealId: number): Promise<DealExecutionRecord | null> => {
  try {
    const res = await fetch(`/api/v1/deals/${dealId}/execution-data`);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.data) return null;
    // Persist to localStorage so synchronous reads work immediately after
    const raw = localStorage.getItem(DEAL_EXEC_LS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, DealExecutionRecord>) : {};
    map[String(dealId)] = json.data;
    localStorage.setItem(DEAL_EXEC_LS_KEY, JSON.stringify(map));
    return json.data as DealExecutionRecord;
  } catch {
    return null;
  }
};

/** Fetch all execution records from the backend and merge into localStorage. */
export const loadAllExecutionsFromBackend = async (): Promise<DealExecutionRecord[]> => {
  try {
    const res = await fetch('/api/v1/deals/all-execution-data');
    if (!res.ok) return [];
    const json = await res.json();
    const records: DealExecutionRecord[] = json.records ?? [];
    if (records.length === 0) return [];
    const raw = localStorage.getItem(DEAL_EXEC_LS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, DealExecutionRecord>) : {};
    for (const r of records) {
      map[String(r.dealId)] = r;
    }
    localStorage.setItem(DEAL_EXEC_LS_KEY, JSON.stringify(map));
    return records;
  } catch {
    return [];
  }
};

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
  _syncRecordToBackend(record);
};

/** Merge partial updates into an existing record without overwriting other fields.
 *  If no record exists yet, creates a minimal one so the patch is never silently dropped. */
export const patchDealExecution = (dealId: number, patch: Partial<DealExecutionRecord>): void => {
  try {
    const raw = localStorage.getItem(DEAL_EXEC_LS_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, DealExecutionRecord>) : {};
    const existing = map[String(dealId)] ?? {
      dealId,
      dealName: '',
      createdAt: new Date().toISOString(),
      documents: [],
    } as DealExecutionRecord;
    const merged = { ...existing, ...patch };
    map[String(dealId)] = merged;
    localStorage.setItem(DEAL_EXEC_LS_KEY, JSON.stringify(map));
    _syncRecordToBackend(merged);
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
