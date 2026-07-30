import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, ChevronDown, Plus, Trash2, CheckCircle2, Clock,
  ChevronRight, Upload, FileText, Loader2, Download, AlertTriangle,
  TrendingDown, FileSpreadsheet, Sparkles, ExternalLink,
} from 'lucide-react';
import {
  getDealExecution, patchDealExecution, getAllDealExecutions,
  loadExecutionFromBackend,
  type DealExecutionRecord, type CapexItem,
  type DDItemStatus, type DealStage, type LoanRow, type DocumentType,
  DATA_ROOM_ITEMS, CLOSING_ITEMS,
} from '../types/dealExecution';
import DocumentsPanel from '../components/DocumentsPanel';
import ClimateCheckUpload from '../components/ClimateCheckUpload';
import DDSection from '../components/DDSection';
import {
  getPipelineStatus, setPipelineStatus, syncPipelineStatusesFromBackend,
  type PipelineStatus, PIPELINE_STATUSES, PIPELINE_STATUS_STYLES,
} from '../types/deal';
import { getFundSettings } from '../types/fundSettings';

// ─── Data Room: document type → checklist item ID ────────────────────────────
const DOC_TYPE_TO_DR_ID: Partial<Record<DocumentType, string>> = {
  'OM':        'dr_om',
  'Rent Roll': 'dr_rent_roll',
  'T12':       'dr_t12',
};

const DD_STATUS_CYCLE: DDItemStatus[] = ['pending', 'uploaded', 'reviewed'];
const DD_STATUS_LABEL: Record<DDItemStatus, string> = {
  pending:  'Pending',
  uploaded: 'Uploaded',
  reviewed: 'Reviewed',
};
const DD_STATUS_STYLE: Record<DDItemStatus, string> = {
  pending:  'bg-gray-100 text-gray-500',
  uploaded: 'bg-amber-100 text-amber-700',
  reviewed: 'bg-green-100 text-green-700',
};

// ─── Approval Options ────────────────────────────────────────────────────────
const APPROVAL_OPTIONS = [
  { key: 'refinancing',          label: 'Refinancing' },
  { key: 'major_capex',          label: 'Major CapEx' },
  { key: 'sale_disposition',     label: 'Sale / Disposition' },
  { key: 'change_business_plan', label: 'Change in Business Plan' },
  { key: 'additional_debt',      label: 'Additional Debt' },
];

// ─── Loan Table Config ───────────────────────────────────────────────────────
const LOAN_ROW_LABELS = ['Existing Loan', 'Acquisition Loan', 'Refinance Loan'];
const BLANK_LOAN_ROW = (): LoanRow => ({
  lender: '', loanAmount: '', interestRate: '', rateType: 'Fixed', term: '', amortization: '', ioPeriod: '',
});


// ─── Transaction Types ───────────────────────────────────────────────────────
const TRANSACTION_TYPES = ['', 'Acquisition', 'JV', 'Recap', 'Refinance', 'Disposition'];

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmt$ = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

const parseNum = (s: string) => parseFloat(s.replace(/[$,%]/g, '').replace(/,/g, '')) || 0;

// ─── Small helpers ────────────────────────────────────────────────────────────
const SectionHeader = ({ label, sub }: { label: string; sub?: string }) => (
  <div className="flex items-baseline gap-3 mb-5">
    <h2 className="text-base font-semibold text-gray-900">{label}</h2>
    {sub && <span className="text-xs text-gray-400">{sub}</span>}
  </div>
);

const EconRow = ({ label, value }: { label: string; value: string }) => (
  <div className="flex justify-between">
    <span className="text-xs text-gray-500">{label}</span>
    <span className="text-xs font-semibold text-gray-700">{value}</span>
  </div>
);

interface FieldProps {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  onBlur?: () => void;
  type?: string;
  placeholder?: string;
  readOnly?: boolean;
}

const Field = ({ label, value, onChange, onBlur, type = 'text', placeholder, readOnly }: FieldProps) => (
  <div>
    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
    <input
      type={type}
      value={value}
      onChange={e => onChange?.(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      readOnly={readOnly}
      className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500 ${
        readOnly
          ? 'bg-gray-50 border-gray-200 text-gray-500 cursor-default'
          : 'border-gray-200 bg-white focus:bg-white'
      }`}
    />
  </div>
);

const Toggle = ({ label, value, onChange, onBlur }: { label: string; value: boolean; onChange: (v: boolean) => void; onBlur?: () => void }) => (
  <div>
    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => { onChange(!value); onBlur?.(); }}
        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors focus:outline-none ${
          value ? 'bg-primary-800' : 'bg-gray-300'
        }`}
      >
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          value ? 'translate-x-4' : 'translate-x-0.5'
        }`} />
      </button>
      <span className="text-sm text-gray-700">{value ? 'Yes' : 'No'}</span>
    </div>
  </div>
);

const TextArea = ({ label, value, onChange, onBlur, placeholder, rows = 3 }: {
  label: string; value: string; onChange?: (v: string) => void; onBlur?: () => void; placeholder?: string; rows?: number;
}) => (
  <div>
    <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
    <textarea
      value={value}
      onChange={e => onChange?.(e.target.value)}
      onBlur={onBlur}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
    />
  </div>
);

// ─── Memo renderer ────────────────────────────────────────────────────────────
const MemoDisplay = ({ text }: { text: string }) => {
  const lines = text.split('\n');
  return (
    <div className="text-sm text-gray-700 space-y-3 leading-relaxed">
      {lines.map((line, i) => {
        if (line.startsWith('## ')) {
          return (
            <h3 key={i} className="text-sm font-semibold text-gray-900 mt-4 mb-1 border-b border-gray-100 pb-1">
              {line.slice(3)}
            </h3>
          );
        }
        if (line.startsWith('**') && line.endsWith('**')) {
          return <p key={i} className="font-semibold text-gray-800">{line.slice(2, -2)}</p>;
        }
        if (line.startsWith('- ') || line.startsWith('• ')) {
          return <li key={i} className="ml-3 list-disc text-gray-600">{line.slice(2)}</li>;
        }
        if (line.trim() === '') return null;
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        if (parts.length > 1) {
          return (
            <p key={i}>
              {parts.map((part, j) =>
                part.startsWith('**') && part.endsWith('**')
                  ? <strong key={j}>{part.slice(2, -2)}</strong>
                  : part
              )}
            </p>
          );
        }
        return <p key={i} className="text-gray-600">{line}</p>;
      })}
    </div>
  );
};

// ─── Stage header strip ───────────────────────────────────────────────────────
const StageHeader = ({
  number, label, status,
}: {
  number: 1 | 2 | 3;
  label: string;
  status: 'completed' | 'active' | 'locked';
}) => {
  const colors = {
    completed: 'bg-green-50 border-green-200 text-green-700',
    active:    'bg-gray-50  border-gray-200  text-gray-700',
    locked:    'bg-gray-50  border-gray-200  text-gray-400',
  };
  const icon = {
    completed: <CheckCircle2 size={15} className="text-green-500" />,
    active:    <Clock size={15} className="text-primary-800" />,
    locked:    <Clock size={15} className="text-gray-300" />,
  };
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${colors[status]} mb-4`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
        status === 'completed' ? 'bg-green-200 text-green-700' :
        status === 'active'    ? 'bg-gray-200  text-gray-700'  :
                                 'bg-gray-200  text-gray-400'
      }`}>
        {number}
      </div>
      {icon[status]}
      <span className="text-sm font-semibold">{label}</span>
      {status === 'completed' && (
        <span className="ml-auto text-xs font-medium text-green-600">Completed</span>
      )}
      {status === 'locked' && (
        <span className="ml-auto text-xs text-gray-400">Locked</span>
      )}
    </div>
  );
};

// ─── Main component ───────────────────────────────────────────────────────────
const DealExecution = () => {
  const { dealId } = useParams<{ dealId: string }>();
  const navigate = useNavigate();
  const numericId = parseInt(dealId ?? '0');

  const [record, setRecord] = useState<DealExecutionRecord | null>(null);
  const fundSettings = useMemo(() => getFundSettings(), []);

  // All deals for switcher
  const [allDeals, setAllDeals] = useState<DealExecutionRecord[]>([]);
  const [showSwitcher, setShowSwitcher] = useState(false);

  // Status
  const [pipelineStatus, setPipelineStatusState] = useState<PipelineStatus>('Analyzing');
  const [showStatusDrop, setShowStatusDrop] = useState(false);

  // Stage
  const [stage, setStage] = useState<DealStage>(1);

  // Transaction type (drives JV section visibility)
  const [transactionType, setTransactionType] = useState('');

  // ─── Section A — Core Deal Terms ──────────────────────────────────────────
  const [purchasePrice, setPurchasePrice] = useState('');
  const [earnestMoney, setEarnestMoney] = useState('');
  const [ddDeadline, setDdDeadline] = useState('');
  const [financingContingency, setFinancingContingency] = useState('');
  const [targetClose, setTargetClose] = useState('');

  // Section A — Extended fields
  const [earnestMoneyRefundable, setEarnestMoneyRefundable] = useState(true);
  const [financingContingencyPeriodDays, setFinancingContingencyPeriodDays] = useState('');
  const [exclusivity, setExclusivity] = useState(false);
  const [psaDraftedBy, setPsaDraftedBy] = useState('');
  const [psaExecutedDate, setPsaExecutedDate] = useState('');
  const [earnestMoneyHardDate, setEarnestMoneyHardDate] = useState('');
  const [keyConditions, setKeyConditions] = useState('');
  const [loiNotes, setLoiNotes] = useState('');

  // Target dates
  const [underContractTarget, setUnderContractTarget] = useState('');
  const [closedTarget, setClosedTarget] = useState('');
  const [exitedTarget, setExitedTarget] = useState('');

  // ─── Loan Details table ───────────────────────────────────────────────────
  const [loanDetails, setLoanDetails] = useState<LoanRow[]>([
    BLANK_LOAN_ROW(), BLANK_LOAN_ROW(), BLANK_LOAN_ROW(),
  ]);


  // ─── Section B — JV / Partnership Terms ──────────────────────────────────
  const [jvOperatorEquity, setJvOperatorEquity] = useState('');
  const [jvPrefReturn, setJvPrefReturn] = useState('');
  const [jvPromoteStructure, setJvPromoteStructure] = useState('');
  const [jvAcquisitionFee, setJvAcquisitionFee] = useState('');
  const [jvAssetMgmtFee, setJvAssetMgmtFee] = useState('');
  const [jvDispositionFee, setJvDispositionFee] = useState('');

  // ─── Section C — Control & Approval Rights ───────────────────────────────
  const [majorDecisionRequired, setMajorDecisionRequired] = useState(true);
  const [approvalRights, setApprovalRights] = useState<string[]>([]);
  const [majorCapexThreshold, setMajorCapexThreshold] = useState('');
  const [approvalNotes, setApprovalNotes] = useState('');

  // ─── Capital Structure (sidebar) ──────────────────────────────────────────
  const [strategy, setStrategy] = useState<'Acquisition' | 'Light Rehab' | 'Heavy Rehab'>('Acquisition');
  const [aequitasEquity, setAequitasEquity] = useState('');
  const [projExitValue, setProjExitValue] = useState('');
  const [projLpNetIrr, setProjLpNetIrr] = useState('');
  const [projEquityMultiple, setProjEquityMultiple] = useState('');

  // Section D — CapEx
  const [capexItems, setCapexItems] = useState<CapexItem[]>([]);
  const [newCapexDesc, setNewCapexDesc] = useState('');
  const [newCapexAmt, setNewCapexAmt] = useState('');

  // Stage 1 — Data Room checklist
  const [dataRoomChecklist, setDataRoomChecklist] = useState<Record<string, DDItemStatus>>({});
  // driveDocTypes: document types already uploaded (from /api/v1/documents/<id>), used for auto-marking Data Room
  const [driveDocTypes, setDriveDocTypes] = useState<Set<DocumentType>>(new Set());

  // Stage 3 — Closing checklist
  const [closingChecklist, setClosingChecklist] = useState<Record<string, boolean>>({});

  // Investment Memo
  const [memoText, setMemoText]         = useState('');
  const [memoLoading, setMemoLoading]   = useState(false);
  const [memoError, setMemoError]       = useState('');
  const [memoDriveUrl, setMemoDriveUrl] = useState('');
  const [memoSaving, setMemoSaving]     = useState(false);

  // Linked sourcing property
  const [linkedPropAddress, setLinkedPropAddress] = useState<string | null>(null);

  // ── Computed ─────────────────────────────────────────────────────────────
  const ppNum = parseNum(purchasePrice);
  const acqLoanAmt = parseNum(loanDetails[1]?.loanAmount ?? '');
  const capexTotal = useMemo(() => capexItems.reduce((s, i) => s + i.amount, 0), [capexItems]);
  const totalEquityRequired = ppNum - acqLoanAmt + capexTotal;
  const acqFeeAmount = ppNum * fundSettings.acqFee;
  const showJvSection = transactionType === 'JV' || transactionType === 'Recap';
  const jvAequitasShare = jvOperatorEquity
    ? String(Math.max(0, 100 - (parseFloat(jvOperatorEquity) || 0)).toFixed(1))
    : '';

  // ── Helper: apply a loaded record to component state ────────────────────
  const applyRecord = useCallback((rec: DealExecutionRecord) => {
    setRecord(rec);
    setStage(rec.stage ?? 1);
    setTransactionType(rec.transactionType ?? '');

    const loi = rec.loiData ?? {};
    setPurchasePrice(loi.purchasePrice ? String(loi.purchasePrice) : rec.purchasePrice ? String(rec.purchasePrice) : '');
    setEarnestMoney(loi.earnestMoneyDeposit ? String(loi.earnestMoneyDeposit) : '');
    setDdDeadline(loi.dueDiligenceDeadline ?? '');
    setFinancingContingency(loi.financingContingency ?? '');
    setTargetClose(loi.targetCloseDate ?? '');

    // Extended Section A
    setEarnestMoneyRefundable(rec.earnestMoneyRefundable ?? true);
    setFinancingContingencyPeriodDays(rec.financingContingencyPeriodDays ? String(rec.financingContingencyPeriodDays) : '');
    setExclusivity(rec.exclusivity ?? false);
    setPsaDraftedBy(rec.psaDraftedBy ?? '');
    setPsaExecutedDate(rec.psaExecutedDate ?? '');
    setEarnestMoneyHardDate(rec.earnestMoneyHardDate ?? '');
    setKeyConditions(rec.keyConditions ?? '');
    setLoiNotes(rec.loiNotes ?? '');

    // Loan Details — use stored table or pre-populate acquisition row from loiData
    if (rec.loanDetails && rec.loanDetails.length === 3) {
      setLoanDetails(rec.loanDetails);
    } else {
      setLoanDetails([
        BLANK_LOAN_ROW(),
        {
          lender: '',
          loanAmount: loi.loanAmount ? String(loi.loanAmount) : '',
          interestRate: loi.interestRate ? String((loi.interestRate * 100).toFixed(3)) : '',
          rateType: 'Fixed',
          term: loi.loanTermMonths ? String(Math.round(loi.loanTermMonths / 12)) : '',
          amortization: '',
          ioPeriod: '',
        },
        BLANK_LOAN_ROW(),
      ]);
    }

    // JV Terms
    const jv = rec.jvTerms ?? {};
    setJvOperatorEquity(jv.operatorEquityShare != null ? String(jv.operatorEquityShare) : '');
    setJvPrefReturn(jv.preferredReturn != null ? String(jv.preferredReturn) : '');
    setJvPromoteStructure(jv.promoteStructure ?? '');
    setJvAcquisitionFee(jv.acquisitionFee != null ? String(jv.acquisitionFee) : '');
    setJvAssetMgmtFee(jv.assetManagementFee != null ? String(jv.assetManagementFee) : '');
    setJvDispositionFee(jv.dispositionFee != null ? String(jv.dispositionFee) : '');

    // Control & Approval Rights
    const ca = rec.controlApproval ?? {};
    setMajorDecisionRequired(ca.majorDecisionRequired ?? true);
    setApprovalRights(ca.approvedFor ?? []);
    setMajorCapexThreshold(ca.majorCapexThreshold != null ? String(ca.majorCapexThreshold) : '');
    setApprovalNotes(ca.notes ?? '');

    const ms = rec.milestones ?? {};
    setUnderContractTarget(ms.underContractTarget ?? '');
    setClosedTarget(ms.closedTarget ?? '');
    setExitedTarget(ms.exitedTarget ?? '');

    const pf = rec.proForma ?? {};
    setStrategy(pf.strategy ?? 'Acquisition');
    setAequitasEquity(pf.aequitasEquity ? String(pf.aequitasEquity) : '');
    setProjExitValue(pf.projectedExitValue ? String(pf.projectedExitValue) : '');
    setProjLpNetIrr(pf.projectedLpNetIrr ? String(pf.projectedLpNetIrr) : '');
    setProjEquityMultiple(pf.projectedEquityMultiple ? String(pf.projectedEquityMultiple) : '');

    setCapexItems(rec.capexItems ?? []);
    setDataRoomChecklist(rec.dataRoomChecklist ?? {});
    setClosingChecklist(rec.closingChecklist ?? {});
    if (rec.memoDriveUrl) setMemoDriveUrl(rec.memoDriveUrl);
  }, []);

  // ── Load on mount ──────────────────────────────────────────────────────────
  useEffect(() => {
    const rec = getDealExecution(numericId);
    if (rec) applyRecord(rec);
    setPipelineStatusState(getPipelineStatus(numericId));
    setAllDeals(
      getAllDealExecutions().sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    );
    loadExecutionFromBackend(numericId).then(backendRec => {
      if (backendRec) applyRecord(backendRec);
    });
    syncPipelineStatusesFromBackend([numericId]).then(() => {
      setPipelineStatusState(getPipelineStatus(numericId));
    });
    fetch('/api/v1/sourcing/properties')
      .then(r => r.ok ? r.json() : null)
      .then((data: { properties?: { deal_id: number | null; address: string }[] } | null) => {
        const linked = data?.properties?.find(p => p.deal_id === numericId);
        if (linked?.address) setLinkedPropAddress(linked.address);
      })
      .catch(() => {});
    // Load uploaded document types for Data Room auto-marking
    fetch(`/api/v1/documents/${numericId}`)
      .then(r => r.ok ? r.json() : null)
      .then((data: { documents?: { documentType: string }[] } | null) => {
        if (data?.documents) {
          setDriveDocTypes(new Set(data.documents.map(d => d.documentType as DocumentType)));
        }
      })
      .catch(() => {});
  }, [numericId, applyRecord]);

  // ── Save callbacks ────────────────────────────────────────────────────────
  const saveLoiData = useCallback(() => {
    patchDealExecution(numericId, {
      loiData: {
        purchasePrice: ppNum || undefined,
        earnestMoneyDeposit: parseNum(earnestMoney) || undefined,
        dueDiligenceDeadline: ddDeadline || undefined,
        financingContingency: financingContingency || undefined,
        targetCloseDate: targetClose || undefined,
      },
    });
  }, [numericId, ppNum, earnestMoney, ddDeadline, financingContingency, targetClose]);

  const saveSectionAExtra = useCallback(() => {
    patchDealExecution(numericId, {
      transactionType: transactionType || undefined,
      earnestMoneyRefundable,
      financingContingencyPeriodDays: financingContingencyPeriodDays ? parseInt(financingContingencyPeriodDays) : undefined,
      exclusivity,
      psaDraftedBy: psaDraftedBy || undefined,
      psaExecutedDate: psaExecutedDate || undefined,
      earnestMoneyHardDate: earnestMoneyHardDate || undefined,
      keyConditions: keyConditions || undefined,
      loiNotes: loiNotes || undefined,
    });
  }, [numericId, transactionType, earnestMoneyRefundable, financingContingencyPeriodDays, exclusivity, psaDraftedBy, psaExecutedDate, earnestMoneyHardDate, keyConditions, loiNotes]);

  const saveLoanDetails = useCallback(() => {
    patchDealExecution(numericId, { loanDetails });
  }, [numericId, loanDetails]);

  const saveMilestones = useCallback(() => {
    patchDealExecution(numericId, {
      milestones: {
        underContractTarget: underContractTarget || undefined,
        closedTarget: closedTarget || undefined,
        exitedTarget: exitedTarget || undefined,
      },
    });
  }, [numericId, underContractTarget, closedTarget, exitedTarget]);

  const saveProForma = useCallback(() => {
    patchDealExecution(numericId, {
      proForma: {
        strategy,
        aequitasEquity: parseNum(aequitasEquity) || undefined,
        projectedExitValue: parseNum(projExitValue) || undefined,
        projectedLpNetIrr: projLpNetIrr ? parseNum(projLpNetIrr) : undefined,
        projectedEquityMultiple: projEquityMultiple ? parseNum(projEquityMultiple) : undefined,
      },
    });
  }, [numericId, strategy, aequitasEquity, projExitValue, projLpNetIrr, projEquityMultiple]);

  const saveJvTerms = useCallback(() => {
    patchDealExecution(numericId, {
      jvTerms: {
        operatorEquityShare: jvOperatorEquity ? parseFloat(jvOperatorEquity) : undefined,
        preferredReturn: jvPrefReturn ? parseFloat(jvPrefReturn) : undefined,
        promoteStructure: jvPromoteStructure || undefined,
        acquisitionFee: jvAcquisitionFee ? parseFloat(jvAcquisitionFee) : undefined,
        assetManagementFee: jvAssetMgmtFee ? parseFloat(jvAssetMgmtFee) : undefined,
        dispositionFee: jvDispositionFee ? parseFloat(jvDispositionFee) : undefined,
      },
    });
  }, [numericId, jvOperatorEquity, jvPrefReturn, jvPromoteStructure, jvAcquisitionFee, jvAssetMgmtFee, jvDispositionFee]);

  const saveControlApproval = useCallback(() => {
    patchDealExecution(numericId, {
      controlApproval: {
        majorDecisionRequired,
        approvedFor: approvalRights,
        majorCapexThreshold: majorCapexThreshold ? parseFloat(majorCapexThreshold) : undefined,
        notes: approvalNotes || undefined,
      },
    });
  }, [numericId, majorDecisionRequired, approvalRights, majorCapexThreshold, approvalNotes]);

  // ── Status change ────────────────────────────────────────────────────────
  const handleStatusChange = (s: PipelineStatus) => {
    setPipelineStatusState(s);
    setPipelineStatus(numericId, s);
    setShowStatusDrop(false);
  };

  // ── Stage advancement ────────────────────────────────────────────────────
  const advanceToStage = (next: DealStage, newStatus?: PipelineStatus) => {
    setStage(next);
    patchDealExecution(numericId, { stage: next });
    if (newStatus) {
      setPipelineStatusState(newStatus);
      setPipelineStatus(numericId, newStatus);
    }
  };

  // ── Loan Details table ───────────────────────────────────────────────────
  const updateLoanRow = (idx: number, field: keyof LoanRow, value: string) => {
    setLoanDetails(prev => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: value };
      return next;
    });
  };

  // ── Approval Rights checkboxes ───────────────────────────────────────────
  const toggleApprovalRight = (key: string) => {
    setApprovalRights(prev => {
      const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
      patchDealExecution(numericId, {
        controlApproval: {
          majorDecisionRequired,
          approvedFor: next,
          majorCapexThreshold: majorCapexThreshold ? parseFloat(majorCapexThreshold) : undefined,
          notes: approvalNotes || undefined,
        },
      });
      return next;
    });
  };

  // ── CapEx operations ─────────────────────────────────────────────────────
  const addCapexItem = () => {
    if (!newCapexDesc.trim() && !newCapexAmt) return;
    const item: CapexItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      description: newCapexDesc.trim() || 'Line Item',
      amount: parseNum(newCapexAmt),
    };
    const updated = [...capexItems, item];
    setCapexItems(updated);
    patchDealExecution(numericId, { capexItems: updated });
    setNewCapexDesc('');
    setNewCapexAmt('');
  };

  const removeCapexItem = (id: string) => {
    const updated = capexItems.filter(i => i.id !== id);
    setCapexItems(updated);
    patchDealExecution(numericId, { capexItems: updated });
  };

  // ── Stage 1 — Data Room checklist (manual cycle) ─────────────────────────
  const cycleDataRoomStatus = (itemId: string) => {
    const current: DDItemStatus = dataRoomChecklist[itemId] ?? 'pending';
    const idx = DD_STATUS_CYCLE.indexOf(current);
    const next = DD_STATUS_CYCLE[(idx + 1) % DD_STATUS_CYCLE.length];
    const updated = { ...dataRoomChecklist, [itemId]: next };
    setDataRoomChecklist(updated);
    patchDealExecution(numericId, { dataRoomChecklist: updated });
  };

  // ── Stage 3 — Closing checklist ──────────────────────────────────────────
  const toggleClosingItem = (itemId: string) => {
    const updated = { ...closingChecklist, [itemId]: !closingChecklist[itemId] };
    setClosingChecklist(updated);
    patchDealExecution(numericId, { closingChecklist: updated });
  };

  // ── onExtractionConfirmed — called by DocumentsPanel after confirm ────────
  const handleExtractionConfirmed = useCallback((docType: DocumentType, data: Record<string, unknown>, driveUrl: string) => {
    if (docType === 'LOI Draft') {
      if (data.purchasePrice) setPurchasePrice(String(data.purchasePrice));
      if (data.earnestMoneyDeposit) setEarnestMoney(String(data.earnestMoneyDeposit));
      if (data.dueDiligenceDeadline) setDdDeadline(data.dueDiligenceDeadline as string);
      if (data.financingContingency) setFinancingContingency(data.financingContingency as string);
      if (data.targetCloseDate) setTargetClose(data.targetCloseDate as string);
    }
    if (docType === 'PSA Draft') {
      if (data.purchasePrice) setPurchasePrice(String(data.purchasePrice));
      if (data.psaExecutedDate) setPsaExecutedDate(data.psaExecutedDate as string);
      if (data.earnestMoneyHardDate) setEarnestMoneyHardDate(data.earnestMoneyHardDate as string);
      if (data.closingDate) setTargetClose(data.closingDate as string);
      if (data.keyConditions) setKeyConditions(data.keyConditions as string);
      if (data.psaDraftedBy) setPsaDraftedBy(data.psaDraftedBy as string);
    }
    if (docType === 'Financial Model') {
      if (data.projectedLpNetIrr) setProjLpNetIrr(String(data.projectedLpNetIrr));
      if (data.projectedEquityMultiple) setProjEquityMultiple(String(data.projectedEquityMultiple));
      if (data.projectedExitValue) setProjExitValue(String(data.projectedExitValue));
      if (data.strategy) setStrategy((data.strategy as 'Acquisition' | 'Light Rehab' | 'Heavy Rehab') ?? 'Acquisition');
      patchDealExecution(numericId, {
        modelExtracted: {
          projectedLpNetIrr:       data.projectedLpNetIrr as number | undefined,
          projectedEquityMultiple: data.projectedEquityMultiple as number | undefined,
          projectedExitValue:      data.projectedExitValue as number | undefined,
          totalEquityRequired:     data.totalEquityRequired as number | undefined,
          purchasePrice:           data.purchasePrice as number | undefined,
          strategy:                data.strategy as string | undefined,
        },
        modelDriveUrl: driveUrl,
        modelSource: 'upload',
      });
      // Also update driveDocTypes so Data Room can reflect it if needed
      setDriveDocTypes(prev => new Set([...prev, 'Financial Model']));
    }
  }, [numericId]);

  // ── Save Investment Memo to Drive ────────────────────────────────────────
  const saveMemoToDrive = useCallback(async () => {
    if (!memoText || !record) return;
    setMemoSaving(true);
    try {
      const res = await fetch('/api/v1/save-investment-memo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deal_id: numericId, memo_text: memoText, deal_name: record.dealName }),
      });
      const json = await res.json();
      if (json.success) {
        setMemoDriveUrl(json.drive_url);
        patchDealExecution(numericId, { memoDriveUrl: json.drive_url });
      }
    } catch { /* ignore */ } finally {
      setMemoSaving(false);
    }
  }, [memoText, record, numericId]);

  // ── Investment Memo generation ───────────────────────────────────────────
  const generateMemo = useCallback(async () => {
    if (!record) return;
    setMemoLoading(true);
    setMemoError('');
    setMemoText('');

    let dealApi: Record<string, unknown> = {};
    try {
      const res = await fetch(`/api/v1/deals/${numericId}`);
      if (res.ok) {
        const json = await res.json();
        dealApi = json.deal ?? {};
      }
    } catch { /* ignore */ }

    const payload = {
      dealName: record.dealName,
      propertyAddress: record.propertyAddress,
      location: record.location,
      totalUnits: record.totalUnits,
      purchasePrice: ppNum || record.purchasePrice,
      pipelineStatus,
      loiData: {
        purchasePrice: ppNum || record.purchasePrice,
        earnestMoneyDeposit: parseNum(earnestMoney) || undefined,
        dueDiligenceDeadline: ddDeadline || undefined,
        targetCloseDate: targetClose || undefined,
      },
      loanDetails,
      proForma: {
        strategy,
        aequitasEquity: parseNum(aequitasEquity) || undefined,
        projectedExitValue: parseNum(projExitValue) || undefined,
        projectedLpNetIrr: projLpNetIrr ? parseNum(projLpNetIrr) : undefined,
        projectedEquityMultiple: projEquityMultiple ? parseNum(projEquityMultiple) : undefined,
      },
      capexItems,
      milestones: {
        underContractTarget: underContractTarget || undefined,
        closedTarget: closedTarget || undefined,
        exitedTarget: exitedTarget || undefined,
      },
      fundSettings,
      dealApi,
      climateCheck: dealApi.climateConfirmed ? {
        confirmed: true,
        overall_score:      dealApi.climateOverallScore,
        wildfire_score:     dealApi.climateWildfireScore,
        flood_score:        dealApi.climateFloodScore,
        overall_risk_label: dealApi.climateOverallLabel,
        wildfire_risk_label: dealApi.climateWildfireLabel,
        flood_risk_label:   dealApi.climateFloodLabel,
        key_risks:          (() => { try { return JSON.parse(dealApi.climateKeyRisks as string ?? '[]'); } catch { return []; } })(),
        property_address:   dealApi.climatePropertyAddress,
      } : { confirmed: false },
    };

    try {
      const res = await fetch('/api/v1/generate-investment-memo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (json.success) {
        setMemoText(json.memo);
      } else {
        setMemoError(json.error ?? 'Failed to generate memo.');
      }
    } catch {
      setMemoError('Network error — make sure the backend is running on port 5001.');
    } finally {
      setMemoLoading(false);
    }
  }, [
    record, numericId, pipelineStatus, ppNum, earnestMoney, ddDeadline, targetClose,
    loanDetails, strategy, aequitasEquity, projExitValue,
    projLpNetIrr, projEquityMultiple, capexItems,
    underContractTarget, closedTarget, exitedTarget, fundSettings,
  ]);

  // ── Export as PDF ─────────────────────────────────────────────────────────
  const exportAsPdf = () => {
    if (!memoText || !record) return;
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>Investment Memo — ${record.dealName}</title>
      <style>
        body { font-family: Georgia, 'Times New Roman', serif; max-width: 760px; margin: 48px auto; color: #111; line-height: 1.7; font-size: 14px; }
        h1 { font-size: 22px; margin-bottom: 4px; }
        .sub { color: #555; font-size: 13px; margin-bottom: 32px; }
        h3 { font-size: 15px; font-weight: bold; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-top: 28px; margin-bottom: 8px; }
        p { margin: 6px 0; }
        li { margin-left: 20px; list-style: disc; }
        strong { font-weight: 700; }
        @media print { body { margin: 24px; } }
      </style>
    </head><body>
      <h1>Investment Memo: ${record.dealName}</h1>
      <div class="sub">${record.propertyAddress ?? record.location ?? ''} · Generated ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
      ${memoText
        .split('\n')
        .map(line => {
          if (line.startsWith('## ')) return `<h3>${line.slice(3)}</h3>`;
          if (line.startsWith('- ') || line.startsWith('• ')) return `<li>${line.slice(2)}</li>`;
          if (line.trim() === '') return '<br>';
          return `<p>${line.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')}</p>`;
        })
        .join('')}
    </body></html>`);
    win.document.close();
    win.focus();
    win.print();
  };

  // ── Not found state ───────────────────────────────────────────────────────
  if (!record) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <AlertTriangle size={32} className="text-amber-400" />
        <p className="text-gray-600 text-sm max-w-sm">
          No deal execution record found for this deal. Advance a deal to <strong>Data Room Received</strong> on the Underwriting page first.
        </p>
        <Link to="/deal-execution" className="flex items-center gap-1.5 text-sm font-medium text-primary-800 hover:underline">
          <ArrowLeft size={14} /> All Deals
        </Link>
      </div>
    );
  }

  const statusStyle = PIPELINE_STATUS_STYLES[pipelineStatus];
  const stageStatus = (n: 1 | 2 | 3): 'completed' | 'active' | 'locked' =>
    stage > n ? 'completed' : stage === n ? 'active' : 'locked';

  // ── Model Status Card data ────────────────────────────────────────────────
  const originalIrr = record.proForma?.projectedLpNetIrr;
  const currentIrr  = projLpNetIrr ? parseNum(projLpNetIrr) : undefined;
  const originalEM  = record.proForma?.projectedEquityMultiple;
  const currentEM   = projEquityMultiple ? parseNum(projEquityMultiple) : undefined;

  const isFlagged = (orig?: number, curr?: number) => {
    if (!orig || !curr) return false;
    return Math.abs((curr - orig) / orig) > 0.1;
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gray-50 min-h-screen">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-3">
          <Link
            to="/deal-execution"
            className="mt-1 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white border border-transparent hover:border-gray-200 rounded-lg transition-colors"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <p className="text-xs text-gray-400 mb-0.5 uppercase tracking-wide">
              <Link to="/deal-execution" className="hover:text-primary-800 transition-colors">
                All Deals
              </Link>
            </p>

            {/* Deal name + switcher */}
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-brandPurple-700">{record.dealName}</h1>
              {allDeals.length > 1 && (
                <div className="relative">
                  <button
                    onClick={() => setShowSwitcher(v => !v)}
                    className="p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <ChevronDown size={16} />
                  </button>
                  {showSwitcher && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setShowSwitcher(false)} />
                      <div className="absolute left-0 mt-1 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
                        {allDeals
                          .filter(d => d.dealId !== numericId)
                          .map(d => (
                            <button
                              key={d.dealId}
                              onClick={() => {
                                setShowSwitcher(false);
                                navigate(`/deal-execution/${d.dealId}`);
                              }}
                              className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 truncate"
                            >
                              {d.dealName}
                            </button>
                          ))}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            <p className="text-xs text-gray-400 mt-0.5 space-x-3">
              <span>Data Room: {fmtDate(record.createdAt)}</span>
              {record.loiExecutedAt && (
                <span>· LOI Executed: {fmtDate(record.loiExecutedAt)}</span>
              )}
            </p>
            {linkedPropAddress && (
              <Link
                to={`/pipeline?address=${encodeURIComponent(linkedPropAddress)}`}
                className="inline-flex items-center gap-1 text-xs text-primary-800 hover:text-primary-700 mt-0.5"
              >
                View in Pipeline →
              </Link>
            )}
            {record.location && (
              <Link
                to={`/regulations?market=${encodeURIComponent(record.location.split(',').map((p: string) => p.trim()).slice(-2).join(', '))}`}
                className="inline-flex items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700 mt-0.5"
              >
                Review Local Regs →
              </Link>
            )}
          </div>
        </div>

        {/* Status dropdown */}
        <div className="relative">
          <button
            onClick={() => setShowStatusDrop(v => !v)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-semibold border ${statusStyle} cursor-pointer select-none`}
          >
            {pipelineStatus}
            <ChevronDown size={13} />
          </button>
          {showStatusDrop && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowStatusDrop(false)} />
              <div className="absolute right-0 mt-1 w-52 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
                {PIPELINE_STATUSES.map(s => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                      s === pipelineStatus ? 'bg-gray-50 font-semibold text-gray-900' : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ── Two-column layout ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left column ──────────────────────────────────────────────────── */}
        <div className="xl:col-span-2 space-y-8">

          {/* ═════════════════════════════════════════════════════════════════
              STAGE 1 — DATA ROOM
          ═════════════════════════════════════════════════════════════════ */}
          <div>
            <StageHeader number={1} label="Stage 1 — Data Room" status={stageStatus(1)} />

            {/* Documents panel — single upload point for all docs */}
            <div className="mb-4">
              <DocumentsPanel
                dealId={numericId}
                onExtractionConfirmed={(docType, data, driveUrl) =>
                  handleExtractionConfirmed(docType, data as Record<string, unknown>, driveUrl)
                }
              />
            </div>

            {/* Climate Risk (ClimateCheck PDF) */}
            <div className="mb-4 bg-white rounded-xl p-5 shadow-sm">
              <ClimateCheckUpload dealId={numericId} />
            </div>

            {/* Data Room checklist — auto-marks from Documents panel uploads */}
            <div className={`bg-white rounded-xl p-6 shadow-sm ${stage < 1 ? 'opacity-50 pointer-events-none' : ''}`}>
              <SectionHeader label="Document Checklist" sub="Status auto-marks when uploaded via Documents panel" />
              <div className="divide-y divide-gray-100">
                {DATA_ROOM_ITEMS.map(item => {
                  const driveType = Object.entries(DOC_TYPE_TO_DR_ID).find(([, id]) => id === item.id)?.[0] as DocumentType | undefined;
                  const autoUploaded = driveType ? driveDocTypes.has(driveType) : false;
                  const manualStatus: DDItemStatus = dataRoomChecklist[item.id] ?? 'pending';
                  // Auto-upgrade to 'uploaded' if Drive doc exists, but honour manual 'reviewed'
                  const status: DDItemStatus = manualStatus === 'reviewed'
                    ? 'reviewed'
                    : autoUploaded ? 'uploaded' : manualStatus;
                  return (
                    <div key={item.id} className="flex items-center gap-3 py-3">
                      <button
                        onClick={() => cycleDataRoomStatus(item.id)}
                        className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold transition-colors ${DD_STATUS_STYLE[status]}`}
                        title="Click to cycle status"
                      >
                        {DD_STATUS_LABEL[status]}
                      </button>
                      <span className={`flex-1 text-sm ${status === 'reviewed' ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                        {item.label}
                      </span>
                      {autoUploaded && status !== 'reviewed' && (
                        <span className="text-xs text-emerald-500 flex items-center gap-0.5">
                          <CheckCircle2 size={11} /> In Drive
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
              <p className="text-xs text-gray-400 mt-3">Upload documents via the Documents panel above — OM, Rent Roll, and T12 auto-mark here.</p>
            </div>

            {/* Proceed to LOI */}
            {stage === 1 && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => advanceToStage(2, 'LOI Executed')}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-primary-800 hover:bg-primary-700 rounded-xl shadow-sm transition-colors"
                >
                  Proceed to LOI <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>

          {/* ═════════════════════════════════════════════════════════════════
              STAGE 2 — DUE DILIGENCE
          ═════════════════════════════════════════════════════════════════ */}
          <div className={stage < 2 ? 'opacity-40 pointer-events-none select-none' : ''}>
            <StageHeader number={2} label="Stage 2 — Due Diligence" status={stageStatus(2)} />

            <div className="space-y-6">

              {/* ── Financial Model ─────────────────────────────────────── */}
              {(() => {
                const extracted = record?.modelExtracted;
                const hasUploaded = driveDocTypes.has('Financial Model');
                // Prefer extracted model data; fall back to underwriting proForma
                const displayIrr = extracted?.projectedLpNetIrr ?? record?.proForma?.projectedLpNetIrr;
                const displayEM  = extracted?.projectedEquityMultiple ?? record?.proForma?.projectedEquityMultiple;
                const displayExit = extracted?.projectedExitValue ?? record?.proForma?.projectedExitValue;
                const sourceLabel = hasUploaded ? 'From uploaded model' : 'From Underwriting';
                const hasMetrics = displayIrr || displayEM || displayExit || totalEquityRequired > 0;
                return (
                  <div className="bg-white rounded-xl shadow-sm overflow-hidden border border-gray-100">
                    <div className="flex items-center gap-3 px-5 pt-5 pb-4">
                      <div className="w-9 h-9 bg-emerald-50 rounded-xl flex items-center justify-center flex-shrink-0">
                        <FileSpreadsheet size={17} className="text-emerald-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900">Financial Model</p>
                        <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] bg-gray-50 text-primary-800 rounded-full font-medium">
                            <Sparkles size={8} /> {sourceLabel}
                          </span>
                          {record?.modelDriveUrl && (
                            <a href={record.modelDriveUrl} target="_blank" rel="noopener noreferrer"
                               className="inline-flex items-center gap-0.5 text-primary-800 hover:text-primary-700">
                              <ExternalLink size={10} /> Drive
                            </a>
                          )}
                        </p>
                      </div>
                      <p className="text-xs text-gray-400">Upload via Documents panel</p>
                    </div>
                    {hasMetrics && (
                      <div className="grid grid-cols-3 gap-3 px-5 pb-5 border-t border-gray-100 pt-4">
                        <div className="text-center p-2 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-400 mb-0.5">LP Net IRR</p>
                          <p className="text-sm font-bold text-gray-900">{displayIrr ? `${displayIrr}%` : '—'}</p>
                        </div>
                        <div className="text-center p-2 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-400 mb-0.5">Equity Multiple</p>
                          <p className="text-sm font-bold text-gray-900">{displayEM ? `${displayEM}x` : '—'}</p>
                        </div>
                        <div className="text-center p-2 bg-gray-50 rounded-lg">
                          <p className="text-xs text-gray-400 mb-0.5">Equity Required</p>
                          <p className="text-sm font-bold text-gray-900">{totalEquityRequired > 0 ? fmt$(totalEquityRequired) : '—'}</p>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* ── Section A — Deal Terms ──────────────────────────────── */}
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <SectionHeader label="A — Deal Terms" sub="Upload LOI or PSA in Documents panel to auto-fill" />
                {/* Field source badge helper */}
                {record?.fieldSources && Object.keys(record.fieldSources).length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    {(['LOI Draft', 'PSA Draft'] as const).filter(t =>
                      Object.values(record.fieldSources ?? {}).includes(t)
                    ).map(t => (
                      <span key={t} className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                        <FileText size={9} /> Fields from {t}
                      </span>
                    ))}
                  </div>
                )}

                {/* Transaction Type */}
                <div className="mb-4">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Transaction Type</label>
                  <select
                    value={transactionType}
                    onChange={e => setTransactionType(e.target.value)}
                    onBlur={saveSectionAExtra}
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                  >
                    {TRANSACTION_TYPES.map(t => (
                      <option key={t} value={t}>{t || '— Select —'}</option>
                    ))}
                  </select>
                </div>

                {/* Core LOI fields */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <Field label="Purchase Price ($)" value={purchasePrice} onChange={setPurchasePrice} onBlur={saveLoiData} placeholder="e.g. 8500000" />
                  <Field label="Earnest Money Deposit ($)" value={earnestMoney} onChange={setEarnestMoney} onBlur={saveLoiData} placeholder="e.g. 250000" />
                  <Field label="Due Diligence Deadline" value={ddDeadline} onChange={setDdDeadline} onBlur={saveLoiData} type="date" />
                  <Field label="Financing Contingency" value={financingContingency} onChange={setFinancingContingency} onBlur={saveLoiData} type="date" />
                  <Field label="Target Close Date" value={targetClose} onChange={setTargetClose} onBlur={saveLoiData} type="date" />
                </div>

                {/* Extended Section A fields */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <Toggle
                    label="Earnest Money Refundable"
                    value={earnestMoneyRefundable}
                    onChange={setEarnestMoneyRefundable}
                    onBlur={saveSectionAExtra}
                  />
                  <Field
                    label="Financing Contingency Period (days)"
                    value={financingContingencyPeriodDays}
                    onChange={setFinancingContingencyPeriodDays}
                    onBlur={saveSectionAExtra}
                    placeholder="e.g. 30"
                  />
                  <Toggle
                    label="Exclusivity / No-Shop"
                    value={exclusivity}
                    onChange={setExclusivity}
                    onBlur={saveSectionAExtra}
                  />
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">PSA Drafted By</label>
                    <select
                      value={psaDraftedBy}
                      onChange={e => setPsaDraftedBy(e.target.value)}
                      onBlur={saveSectionAExtra}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="">— Select —</option>
                      <option value="Buyer">Buyer</option>
                      <option value="Seller">Seller</option>
                    </select>
                  </div>
                  <Field label="PSA Executed Date" value={psaExecutedDate} onChange={setPsaExecutedDate} onBlur={saveSectionAExtra} type="date" />
                  <Field label="Earnest Money Hard Date" value={earnestMoneyHardDate} onChange={setEarnestMoneyHardDate} onBlur={saveSectionAExtra} type="date" />
                </div>
                <div className="grid grid-cols-1 gap-4 mb-4">
                  <TextArea label="Key Conditions" value={keyConditions} onChange={setKeyConditions} onBlur={saveSectionAExtra} placeholder="e.g. Subject to financing approval, inspection satisfactory..." />
                  <TextArea label="LOI Notes" value={loiNotes} onChange={setLoiNotes} onBlur={saveSectionAExtra} placeholder="Additional notes on LOI terms..." />
                </div>

                {/* Loan Details table */}
                <div className="mt-5 pt-5 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Loan Details</p>
                  <div className="overflow-x-auto -mx-1">
                    <table className="w-full min-w-[700px] text-xs">
                      <thead>
                        <tr className="border-b border-gray-100 text-left">
                          <th className="pb-2 pr-3 text-gray-400 font-medium w-28">Type</th>
                          <th className="pb-2 pr-3 text-gray-400 font-medium">Lender</th>
                          <th className="pb-2 pr-3 text-gray-400 font-medium w-28">Loan Amt ($)</th>
                          <th className="pb-2 pr-3 text-gray-400 font-medium w-16">LTV (%)</th>
                          <th className="pb-2 pr-3 text-gray-400 font-medium w-20">Rate (%)</th>
                          <th className="pb-2 pr-3 text-gray-400 font-medium w-16">Type</th>
                          <th className="pb-2 pr-3 text-gray-400 font-medium w-14">Term (yr)</th>
                          <th className="pb-2 pr-3 text-gray-400 font-medium w-16">Amort (yr)</th>
                          <th className="pb-2 text-gray-400 font-medium w-16">IO (mo)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {loanDetails.map((row, idx) => {
                          const loanAmt = parseFloat(row.loanAmount.replace(/,/g, '')) || 0;
                          const autoLtv = ppNum > 0 && loanAmt > 0
                            ? ((loanAmt / ppNum) * 100).toFixed(1)
                            : '';
                          const cellCls = 'w-full px-2 py-1 border border-gray-200 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-primary-500';
                          return (
                            <tr key={idx}>
                              <td className="py-2 pr-3 font-medium text-gray-500 whitespace-nowrap">
                                {LOAN_ROW_LABELS[idx]}
                              </td>
                              <td className="py-2 pr-3">
                                <input type="text" value={row.lender} placeholder="Lender name"
                                  onChange={e => updateLoanRow(idx, 'lender', e.target.value)}
                                  onBlur={saveLoanDetails} className={cellCls} />
                              </td>
                              <td className="py-2 pr-3">
                                <input type="text" value={row.loanAmount} placeholder="0"
                                  onChange={e => updateLoanRow(idx, 'loanAmount', e.target.value)}
                                  onBlur={saveLoanDetails} className={cellCls} />
                              </td>
                              <td className="py-2 pr-3">
                                {autoLtv
                                  ? <span className="inline-block px-2 py-1 text-xs text-gray-700 bg-gray-50 rounded font-medium">{autoLtv}%</span>
                                  : <input type="text" value={row.ltvOverride ?? ''} placeholder="—"
                                      onChange={e => updateLoanRow(idx, 'ltvOverride', e.target.value)}
                                      onBlur={saveLoanDetails} className={cellCls} />
                                }
                              </td>
                              <td className="py-2 pr-3">
                                <input type="text" value={row.interestRate} placeholder="0.0"
                                  onChange={e => updateLoanRow(idx, 'interestRate', e.target.value)}
                                  onBlur={saveLoanDetails} className={cellCls} />
                              </td>
                              <td className="py-2 pr-3">
                                <select value={row.rateType}
                                  onChange={e => updateLoanRow(idx, 'rateType', e.target.value as 'Fixed' | 'Float')}
                                  onBlur={saveLoanDetails}
                                  className={cellCls}>
                                  <option>Fixed</option>
                                  <option>Float</option>
                                </select>
                              </td>
                              <td className="py-2 pr-3">
                                <input type="text" value={row.term} placeholder="—"
                                  onChange={e => updateLoanRow(idx, 'term', e.target.value)}
                                  onBlur={saveLoanDetails} className={cellCls} />
                              </td>
                              <td className="py-2 pr-3">
                                <input type="text" value={row.amortization} placeholder="—"
                                  onChange={e => updateLoanRow(idx, 'amortization', e.target.value)}
                                  onBlur={saveLoanDetails} className={cellCls} />
                              </td>
                              <td className="py-2">
                                <input type="text" value={row.ioPeriod} placeholder="—"
                                  onChange={e => updateLoanRow(idx, 'ioPeriod', e.target.value)}
                                  onBlur={saveLoanDetails} className={cellCls} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Target Dates */}
                <div className="mt-5 pt-5 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Target Dates</p>
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="Under Contract" value={underContractTarget} onChange={setUnderContractTarget} onBlur={saveMilestones} type="date" />
                    <Field label="Closed" value={closedTarget} onChange={setClosedTarget} onBlur={saveMilestones} type="date" />
                    <Field label="Exited" value={exitedTarget} onChange={setExitedTarget} onBlur={saveMilestones} type="date" />
                  </div>
                </div>
              </div>

              {/* ── Section B — JV / Partnership Terms (conditional) ─────── */}
              {showJvSection && (
                <div className="bg-white rounded-xl p-6 shadow-sm">
                  <SectionHeader label="B — JV / Partnership Terms" sub="Shown for JV and Recap transactions" />
                  <div className="grid grid-cols-2 gap-4">
                    <Field
                      label="Operator Equity Share (%)"
                      value={jvOperatorEquity}
                      onChange={setJvOperatorEquity}
                      onBlur={saveJvTerms}
                      placeholder="e.g. 20"
                    />
                    <Field
                      label="Aequitas Equity Share (% — auto)"
                      value={jvAequitasShare}
                      readOnly
                    />
                    <Field
                      label="Preferred Return (%)"
                      value={jvPrefReturn}
                      onChange={setJvPrefReturn}
                      onBlur={saveJvTerms}
                      placeholder="e.g. 8"
                    />
                    <Field
                      label="Promote Structure"
                      value={jvPromoteStructure}
                      onChange={setJvPromoteStructure}
                      onBlur={saveJvTerms}
                      placeholder="e.g. 80/20 above 8% pref"
                    />
                    <Field
                      label="Acquisition Fee (% of purchase price)"
                      value={jvAcquisitionFee}
                      onChange={setJvAcquisitionFee}
                      onBlur={saveJvTerms}
                      placeholder="e.g. 1.5"
                    />
                    <Field
                      label="Asset Management Fee (% of EGI)"
                      value={jvAssetMgmtFee}
                      onChange={setJvAssetMgmtFee}
                      onBlur={saveJvTerms}
                      placeholder="e.g. 3"
                    />
                    <Field
                      label="Disposition Fee (%)"
                      value={jvDispositionFee}
                      onChange={setJvDispositionFee}
                      onBlur={saveJvTerms}
                      placeholder="e.g. 1"
                    />
                  </div>
                </div>
              )}

              {/* ── Section C — Control & Approval Rights ───────────────── */}
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <SectionHeader label="C — Control &amp; Approval Rights" />
                <div className="space-y-4">
                  <Toggle
                    label="Major Decision Approval Required"
                    value={majorDecisionRequired}
                    onChange={v => { setMajorDecisionRequired(v); }}
                    onBlur={saveControlApproval}
                  />

                  <div>
                    <p className="text-xs font-medium text-gray-500 mb-2">Aequitas Approval Required For</p>
                    <div className="grid grid-cols-2 gap-2">
                      {APPROVAL_OPTIONS.map(opt => (
                        <label key={opt.key} className="flex items-center gap-2 cursor-pointer group">
                          <input
                            type="checkbox"
                            checked={approvalRights.includes(opt.key)}
                            onChange={() => toggleApprovalRight(opt.key)}
                            className="w-4 h-4 rounded border-gray-300 text-primary-800 focus:ring-primary-500"
                          />
                          <span className="text-sm text-gray-700 group-hover:text-gray-900">{opt.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <Field
                    label="Major CapEx Threshold ($)"
                    value={majorCapexThreshold}
                    onChange={setMajorCapexThreshold}
                    onBlur={saveControlApproval}
                    placeholder="e.g. 50000"
                  />
                  <TextArea
                    label="Notes"
                    value={approvalNotes}
                    onChange={setApprovalNotes}
                    onBlur={saveControlApproval}
                    placeholder="Additional approval rights notes..."
                  />
                </div>
              </div>

              {/* ── Section D — CapEx Budget ─────────────────────────────── */}
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <SectionHeader label="D — CapEx Budget" sub="Total feeds equity calculation in real time" />
                {capexItems.length > 0 && (
                  <table className="w-full text-sm mb-4">
                    <thead>
                      <tr className="border-b border-gray-100">
                        <th className="text-left py-2 text-xs font-semibold text-gray-400 uppercase">Description</th>
                        <th className="text-right py-2 text-xs font-semibold text-gray-400 uppercase">Amount</th>
                        <th className="w-8" />
                      </tr>
                    </thead>
                    <tbody>
                      {capexItems.map(item => (
                        <tr key={item.id} className="border-b border-gray-50">
                          <td className="py-2.5 text-gray-700">{item.description}</td>
                          <td className="py-2.5 text-right text-gray-700 tabular-nums">{fmt$(item.amount)}</td>
                          <td className="py-2.5 pl-2">
                            <button onClick={() => removeCapexItem(item.id)} className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr>
                        <td className="pt-3 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wide">Total CapEx</td>
                        <td className="pt-3 pb-1 text-right font-bold text-gray-900 tabular-nums">{fmt$(capexTotal)}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                )}
                <div className="flex gap-2 items-end">
                  <div className="flex-1">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
                    <input
                      type="text"
                      value={newCapexDesc}
                      onChange={e => setNewCapexDesc(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addCapexItem()}
                      placeholder="e.g. Roof replacement"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <div className="w-36">
                    <label className="block text-xs font-medium text-gray-500 mb-1">Amount ($)</label>
                    <input
                      type="text"
                      value={newCapexAmt}
                      onChange={e => setNewCapexAmt(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && addCapexItem()}
                      placeholder="e.g. 50000"
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                  <button
                    onClick={addCapexItem}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary-800 hover:text-primary-700 hover:bg-primary-50 border border-gray-200 rounded-lg transition-colors"
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>

              {/* ── Section E — Due Diligence (full tracker) ─────────────── */}
              <DDSection dealId={numericId} />

              {/* Proceed to Closing */}
              {stage === 2 && (
                <div className="flex justify-end">
                  <button
                    onClick={() => advanceToStage(3, 'Under Contract')}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-xl shadow-sm transition-colors"
                  >
                    Proceed to Closing <ChevronRight size={15} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ═════════════════════════════════════════════════════════════════
              STAGE 3 — CLOSING
          ═════════════════════════════════════════════════════════════════ */}
          <div className={stage < 3 ? 'opacity-40 pointer-events-none select-none' : ''}>
            <StageHeader number={3} label="Stage 3 — Closing" status={stageStatus(3)} />

            <div className="space-y-6">
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <SectionHeader label="Closing Checklist" />
                <div className="divide-y divide-gray-100">
                  {CLOSING_ITEMS.map(item => {
                    const checked = !!closingChecklist[item.id];
                    return (
                      <div key={item.id} className="flex items-center gap-3 py-3">
                        <button
                          onClick={() => toggleClosingItem(item.id)}
                          className={`w-5 h-5 rounded flex items-center justify-center flex-shrink-0 border-2 transition-colors ${
                            checked
                              ? 'bg-green-500 border-green-500 text-white'
                              : 'border-gray-300 bg-white hover:border-green-400'
                          }`}
                        >
                          {checked && <CheckCircle2 size={12} />}
                        </button>
                        <span className={`text-sm ${checked ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                          {item.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {stage === 3 && (
                <div className="flex justify-end">
                  <button
                    onClick={() => advanceToStage(3, 'Closed')}
                    className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-green-600 hover:bg-green-700 rounded-xl shadow-sm transition-colors"
                  >
                    <CheckCircle2 size={15} /> Mark Closed
                  </button>
                </div>
              )}
            </div>
          </div>

        </div>{/* end left column */}

        {/* ── Right column (sticky sidebar) ─────────────────────────────── */}
        <div className="space-y-6">

          {/* ── Model Status Card ──────────────────────────────────────────── */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Model Status</h2>
              <Link
                to="/underwriting"
                className="text-xs text-primary-800 hover:underline flex items-center gap-0.5"
              >
                View Full Model →
              </Link>
            </div>
            <div className="space-y-3">
              {/* IRR */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">LP Net IRR</span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-400 tabular-nums w-12 text-right">
                    {originalIrr != null ? `${originalIrr.toFixed(1)}%` : '—'}
                  </span>
                  <span className={`text-xs font-semibold tabular-nums w-14 text-right ${isFlagged(originalIrr, currentIrr) ? 'text-red-600' : 'text-gray-800'}`}>
                    {currentIrr != null ? `${currentIrr.toFixed(1)}%` : '—'}
                    {isFlagged(originalIrr, currentIrr) && <TrendingDown size={10} className="inline ml-1 text-red-500" />}
                  </span>
                </div>
              </div>
              {/* Equity Multiple */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">Equity Multiple</span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-400 tabular-nums w-12 text-right">
                    {originalEM != null ? `${originalEM.toFixed(2)}x` : '—'}
                  </span>
                  <span className={`text-xs font-semibold tabular-nums w-14 text-right ${isFlagged(originalEM, currentEM) ? 'text-red-600' : 'text-gray-800'}`}>
                    {currentEM != null ? `${currentEM.toFixed(2)}x` : '—'}
                    {isFlagged(originalEM, currentEM) && <TrendingDown size={10} className="inline ml-1 text-red-500" />}
                  </span>
                </div>
              </div>
              {/* DSCR — placeholder */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">DSCR</span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-400 w-12 text-right">—</span>
                  <span className="text-xs font-semibold text-gray-800 w-14 text-right">—</span>
                </div>
              </div>
              {/* NOI — placeholder */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-500">NOI</span>
                <div className="flex items-center gap-4">
                  <span className="text-xs text-gray-400 w-12 text-right">—</span>
                  <span className="text-xs font-semibold text-gray-800 w-14 text-right">—</span>
                </div>
              </div>
            </div>
            <div className="mt-3 pt-3 border-t border-gray-100 grid grid-cols-2 text-center text-xs text-gray-400">
              <span>Original</span>
              <span>Current</span>
            </div>
          </div>

          {/* ── Capital Structure (sticky) ────────────────────────────────── */}
          <div className="bg-white rounded-xl p-6 shadow-sm xl:sticky xl:top-6 space-y-5">
            <SectionHeader label="Capital Structure" />

            {/* Live equity waterfall */}
            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-xs text-gray-800">
                <span>Purchase Price</span>
                <span className="font-semibold tabular-nums">{ppNum > 0 ? fmt$(ppNum) : '—'}</span>
              </div>
              <div className="flex justify-between text-xs text-gray-800">
                <span>Acq. Loan Amount</span>
                <span className={`font-semibold tabular-nums ${acqLoanAmt > 0 ? 'text-red-600' : ''}`}>
                  {acqLoanAmt > 0 ? `− ${fmt$(acqLoanAmt)}` : '—'}
                </span>
              </div>
              <div className="flex justify-between text-xs text-gray-800">
                <span>Total CapEx</span>
                <span className="font-semibold tabular-nums">
                  {capexTotal > 0 ? `+ ${fmt$(capexTotal)}` : '—'}
                </span>
              </div>
              <div className="border-t border-gray-200 pt-2 flex justify-between">
                <span className="text-sm font-semibold text-gray-900">Equity Required</span>
                <span className="text-sm font-bold text-gray-900 tabular-nums">
                  {totalEquityRequired > 0 ? fmt$(totalEquityRequired) : '—'}
                </span>
              </div>
            </div>

            <Field label="Aequitas Equity ($)" value={aequitasEquity} onChange={setAequitasEquity} onBlur={saveProForma} placeholder="e.g. 2500000" />

            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Strategy</label>
              <select
                value={strategy}
                onChange={e => setStrategy(e.target.value as typeof strategy)}
                onBlur={saveProForma}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option>Acquisition</option>
                <option>Light Rehab</option>
                <option>Heavy Rehab</option>
              </select>
            </div>

            <div className="bg-gray-50 rounded-xl p-4 space-y-1.5">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Fund Economics</p>
              <EconRow label="Preferred Return" value={`${(fundSettings.prefReturn * 100).toFixed(1)}%`} />
              <EconRow label="Carry"             value={`${(fundSettings.carry * 100).toFixed(0)}%`} />
              <EconRow
                label="Acquisition Fee"
                value={`${(fundSettings.acqFee * 100).toFixed(1)}%${ppNum > 0 ? ` = ${fmt$(acqFeeAmount)}` : ''}`}
              />
              <EconRow label="AM Fee"            value={`${(fundSettings.amFee * 100).toFixed(2)}% / yr`} />
            </div>

            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Pro Forma</p>
              <Field label="Projected Exit Value ($)"   value={projExitValue}      onChange={setProjExitValue}      onBlur={saveProForma} placeholder="e.g. 12000000" />
              <Field label="LP Net IRR (%)"             value={projLpNetIrr}       onChange={setProjLpNetIrr}       onBlur={saveProForma} placeholder="e.g. 18.5" />
              <Field label="Equity Multiple (x)"        value={projEquityMultiple} onChange={setProjEquityMultiple} onBlur={saveProForma} placeholder="e.g. 2.1" />
            </div>

            <p className="text-xs text-gray-400 leading-relaxed border-t border-gray-100 pt-4">
              Pro forma data feeds the Fund Returns portfolio table and TVPI/DPI calculations.
            </p>
          </div>

          {/* ── Investment Memo ───────────────────────────────────────────── */}
          <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">Investment Memo</h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Claude synthesizes all saved deal data into an LP-ready memo.
              </p>
            </div>

            <button
              onClick={generateMemo}
              disabled={memoLoading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-xl transition-colors"
            >
              {memoLoading
                ? <><Loader2 size={15} className="animate-spin" /> Generating…</>
                : <><FileText size={15} /> Generate Memo</>
              }
            </button>

            {memoError && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                <AlertTriangle size={14} className="text-red-500 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-700">{memoError}</p>
              </div>
            )}

            {memoText && (
              <>
                <div className="border border-gray-200 rounded-xl p-4 max-h-[600px] overflow-y-auto">
                  <MemoDisplay text={memoText} />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={exportAsPdf}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
                  >
                    <Download size={14} />
                    Export PDF
                  </button>
                  <button
                    onClick={saveMemoToDrive}
                    disabled={memoSaving}
                    className="flex-1 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 disabled:cursor-not-allowed rounded-xl transition-colors"
                  >
                    {memoSaving
                      ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                      : memoDriveUrl
                        ? <><CheckCircle2 size={14} /> Saved to Drive</>
                        : <><Upload size={14} /> Save to Drive</>
                    }
                  </button>
                </div>
                {memoDriveUrl && (
                  <a
                    href={memoDriveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs text-emerald-600 hover:text-emerald-700"
                  >
                    <ExternalLink size={12} />
                    Open in Drive →
                  </a>
                )}
              </>
            )}

            {!memoText && !memoLoading && !memoError && (
              <p className="text-xs text-gray-400 text-center py-4">
                Fill in deal terms and pro forma above, then click Generate Memo.
              </p>
            )}
          </div>

        </div>{/* end right column */}

      </div>{/* end two-column layout */}
    </div>
  );
};

export default DealExecution;
