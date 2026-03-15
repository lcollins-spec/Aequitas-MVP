import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft, ChevronDown, Plus, Trash2, CheckCircle2, Clock,
  ChevronRight, Upload, FileText, Loader2, Download, AlertTriangle,
  TrendingDown,
} from 'lucide-react';
import {
  getDealExecution, patchDealExecution, getAllDealExecutions,
  loadExecutionFromBackend,
  type DealExecutionRecord, type CapexItem, type DealDocument,
  type DDItemStatus, type DealStage,
  DATA_ROOM_ITEMS, CLOSING_ITEMS,
} from '../types/dealExecution';
import DocumentsPanel from '../components/DocumentsPanel';
import {
  getPipelineStatus, setPipelineStatus, syncPipelineStatusesFromBackend,
  type PipelineStatus, PIPELINE_STATUSES, PIPELINE_STATUS_STYLES,
} from '../types/deal';
import { getFundSettings } from '../types/fundSettings';

// ─── DD Checklist Config (Stage 2 — 3 phases only) ───────────────────────────
interface DDChecklistItem { id: string; label: string; }
interface DDPhase { id: string; label: string; items: DDChecklistItem[]; }

const DD_PHASES: DDPhase[] = [
  {
    id: 'physical_environmental',
    label: 'Physical & Environmental',
    items: [
      { id: 'property_inspection', label: 'Property inspection' },
      { id: 'phase1_env',          label: 'Phase I environmental' },
      { id: 'roof_systems',        label: 'Roof/systems report' },
    ],
  },
  {
    id: 'financial_legal',
    label: 'Financial & Legal',
    items: [
      { id: 'rent_roll_verification', label: 'Rent roll verification' },
      { id: 't12_pl',                 label: 'T12 actual P&L' },
      { id: 'utility_tax_bills',      label: 'Utility & tax bills' },
      { id: 'title_survey',           label: 'Title search & survey' },
      { id: 'zoning',                 label: 'Zoning confirmation' },
      { id: 'lease_review',           label: 'Existing leases review' },
    ],
  },
  {
    id: 'financing_close',
    label: 'Financing & Close',
    items: [
      { id: 'lender_term_sheet',  label: 'Lender engagement & term sheet' },
      { id: 'appraisal',          label: 'Appraisal' },
      { id: 'psa_negotiation',    label: 'PSA negotiation' },
      { id: 'estoppels',          label: 'Estoppels' },
      { id: 'final_walkthrough',  label: 'Final walkthrough & closing' },
    ],
  },
];

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

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const fmt$ = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

const parseNum = (s: string) => parseFloat(s.replace(/,/g, '')) || 0;

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
      className={`w-full px-3 py-2 border rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400 ${
        readOnly
          ? 'bg-gray-50 border-gray-200 text-gray-500 cursor-default'
          : 'border-gray-200 bg-white focus:bg-white'
      }`}
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
    active:    'bg-blue-50  border-blue-200  text-blue-700',
    locked:    'bg-gray-50  border-gray-200  text-gray-400',
  };
  const icon = {
    completed: <CheckCircle2 size={15} className="text-green-500" />,
    active:    <Clock size={15} className="text-blue-500" />,
    locked:    <Clock size={15} className="text-gray-300" />,
  };
  return (
    <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${colors[status]} mb-4`}>
      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
        status === 'completed' ? 'bg-green-200 text-green-700' :
        status === 'active'    ? 'bg-blue-200  text-blue-700'  :
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

  // Section A — Deal Terms
  const [purchasePrice, setPurchasePrice] = useState('');
  const [earnestMoney, setEarnestMoney] = useState('');
  const [ddDeadline, setDdDeadline] = useState('');
  const [financingContingency, setFinancingContingency] = useState('');
  const [targetClose, setTargetClose] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [loanTermMonths, setLoanTermMonths] = useState('');
  // Target dates (moved from milestones strip)
  const [underContractTarget, setUnderContractTarget] = useState('');
  const [closedTarget, setClosedTarget] = useState('');
  const [exitedTarget, setExitedTarget] = useState('');

  // Section B — Capital Structure / Pro Forma
  const [strategy, setStrategy] = useState<'Acquisition' | 'Light Rehab' | 'Heavy Rehab'>('Acquisition');
  const [aequitasEquity, setAequitasEquity] = useState('');
  const [projExitValue, setProjExitValue] = useState('');
  const [projLpNetIrr, setProjLpNetIrr] = useState('');
  const [projEquityMultiple, setProjEquityMultiple] = useState('');

  // Documents
  const [documents, setDocuments] = useState<DealDocument[]>([]);

  // Section C — CapEx
  const [capexItems, setCapexItems] = useState<CapexItem[]>([]);
  const [newCapexDesc, setNewCapexDesc] = useState('');
  const [newCapexAmt, setNewCapexAmt] = useState('');

  // Stage 1 — Data Room checklist
  const [dataRoomChecklist, setDataRoomChecklist] = useState<Record<string, DDItemStatus>>({});
  const [dataRoomUploads, setDataRoomUploads]     = useState<Record<string, string>>({});
  const dataRoomRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Stage 2 — DD Checklist
  const [ddChecklist, setDdChecklist] = useState<Record<string, DDItemStatus>>({});
  const [ddUploads, setDdUploads]     = useState<Record<string, string>>({});
  const [openPhases, setOpenPhases]   = useState<Record<string, boolean>>({
    physical_environmental: false,
    financial_legal: false,
    financing_close: false,
  });
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Stage 3 — Closing checklist
  const [closingChecklist, setClosingChecklist] = useState<Record<string, boolean>>({});

  // Investment Memo
  const [memoText, setMemoText]       = useState('');
  const [memoLoading, setMemoLoading] = useState(false);
  const [memoError, setMemoError]     = useState('');

  // ── Helper: apply a loaded record to component state
  const applyRecord = useCallback((rec: DealExecutionRecord) => {
    setRecord(rec);
    setStage(rec.stage ?? 1);
    const loi = rec.loiData ?? {};
    setPurchasePrice(loi.purchasePrice ? String(loi.purchasePrice) : rec.purchasePrice ? String(rec.purchasePrice) : '');
    setEarnestMoney(loi.earnestMoneyDeposit ? String(loi.earnestMoneyDeposit) : '');
    setDdDeadline(loi.dueDiligenceDeadline ?? '');
    setFinancingContingency(loi.financingContingency ?? '');
    setTargetClose(loi.targetCloseDate ?? '');
    setLoanAmount(loi.loanAmount ? String(loi.loanAmount) : '');
    setInterestRate(loi.interestRate ? String((loi.interestRate * 100).toFixed(3)) : '');
    setLoanTermMonths(loi.loanTermMonths ? String(loi.loanTermMonths) : '');
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
    setDocuments(rec.documents ?? []);
    setCapexItems(rec.capexItems ?? []);
    setDdChecklist(rec.ddChecklist ?? {});
    setDdUploads(rec.ddUploads ?? {});
    setDataRoomChecklist(rec.dataRoomChecklist ?? {});
    setDataRoomUploads(rec.dataRoomUploads ?? {});
    setClosingChecklist(rec.closingChecklist ?? {});
  }, []);

  // ── Load record on mount (localStorage first for instant render, then backend hydration)
  useEffect(() => {
    const rec = getDealExecution(numericId);
    if (rec) applyRecord(rec);
    setPipelineStatusState(getPipelineStatus(numericId));
    setAllDeals(
      getAllDealExecutions().sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
    );
    // Hydrate from backend in background — overwrites localStorage cache with server truth
    loadExecutionFromBackend(numericId).then(backendRec => {
      if (backendRec) applyRecord(backendRec);
    });
    syncPipelineStatusesFromBackend([numericId]).then(() => {
      setPipelineStatusState(getPipelineStatus(numericId));
    });
  }, [numericId, applyRecord]);

  // ── Live calculations
  const ppNum = parseNum(purchasePrice);
  const loanNum = parseNum(loanAmount);
  const capexTotal = useMemo(() => capexItems.reduce((s, i) => s + i.amount, 0), [capexItems]);
  const totalEquityRequired = ppNum - loanNum + capexTotal;
  const acqFeeAmount = ppNum * fundSettings.acqFee;

  // ── Auto-save callbacks
  const saveLoiData = useCallback(() => {
    patchDealExecution(numericId, {
      loiData: {
        purchasePrice: ppNum || undefined,
        earnestMoneyDeposit: parseNum(earnestMoney) || undefined,
        dueDiligenceDeadline: ddDeadline || undefined,
        financingContingency: financingContingency || undefined,
        targetCloseDate: targetClose || undefined,
        loanAmount: loanNum || undefined,
        interestRate: interestRate ? parseNum(interestRate) / 100 : undefined,
        loanTermMonths: loanTermMonths ? parseInt(loanTermMonths) : undefined,
      },
    });
  }, [numericId, ppNum, earnestMoney, ddDeadline, financingContingency, targetClose, loanNum, interestRate, loanTermMonths]);

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

  // ── Status change
  const handleStatusChange = (s: PipelineStatus) => {
    setPipelineStatusState(s);
    setPipelineStatus(numericId, s);
    setShowStatusDrop(false);
  };

  // ── Stage advancement
  const advanceToStage = (next: DealStage, newStatus?: PipelineStatus) => {
    setStage(next);
    patchDealExecution(numericId, { stage: next });
    if (newStatus) {
      setPipelineStatusState(newStatus);
      setPipelineStatus(numericId, newStatus);
    }
  };

  // ── CapEx operations
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

  // ── Document operations
  const handleDocumentsChange = useCallback((updated: DealDocument[]) => {
    setDocuments(updated);
    patchDealExecution(numericId, { documents: updated });
  }, [numericId]);

  // ── Stage 1 — Data Room checklist
  const cycleDataRoomStatus = (itemId: string) => {
    const current: DDItemStatus = dataRoomChecklist[itemId] ?? 'pending';
    const idx = DD_STATUS_CYCLE.indexOf(current);
    const next = DD_STATUS_CYCLE[(idx + 1) % DD_STATUS_CYCLE.length];
    const updated = { ...dataRoomChecklist, [itemId]: next };
    setDataRoomChecklist(updated);
    patchDealExecution(numericId, { dataRoomChecklist: updated });
  };

  const handleDataRoomUpload = (itemId: string, file: File) => {
    const updatedUploads = { ...dataRoomUploads, [itemId]: file.name };
    const updatedChecklist = { ...dataRoomChecklist, [itemId]: 'uploaded' as DDItemStatus };
    setDataRoomUploads(updatedUploads);
    setDataRoomChecklist(updatedChecklist);
    patchDealExecution(numericId, { dataRoomUploads: updatedUploads, dataRoomChecklist: updatedChecklist });
  };

  // ── Stage 2 — DD Checklist operations
  const cycleItemStatus = (itemId: string) => {
    const current: DDItemStatus = ddChecklist[itemId] ?? 'pending';
    const idx = DD_STATUS_CYCLE.indexOf(current);
    const next = DD_STATUS_CYCLE[(idx + 1) % DD_STATUS_CYCLE.length];
    const updated = { ...ddChecklist, [itemId]: next };
    setDdChecklist(updated);
    patchDealExecution(numericId, { ddChecklist: updated });
  };

  const handleItemUpload = (itemId: string, file: File) => {
    const updatedUploads = { ...ddUploads, [itemId]: file.name };
    const updatedChecklist = { ...ddChecklist, [itemId]: 'uploaded' as DDItemStatus };
    setDdUploads(updatedUploads);
    setDdChecklist(updatedChecklist);
    patchDealExecution(numericId, { ddUploads: updatedUploads, ddChecklist: updatedChecklist });
  };

  const togglePhase = (phaseId: string) => {
    setOpenPhases(prev => ({ ...prev, [phaseId]: !prev[phaseId] }));
  };

  // ── Stage 3 — Closing checklist
  const toggleClosingItem = (itemId: string) => {
    const updated = { ...closingChecklist, [itemId]: !closingChecklist[itemId] };
    setClosingChecklist(updated);
    patchDealExecution(numericId, { closingChecklist: updated });
  };

  // ── DD progress summary
  const ddProgress = useMemo(() => {
    const all = DD_PHASES.flatMap(p => p.items);
    const reviewed = all.filter(it => ddChecklist[it.id] === 'reviewed').length;
    const uploaded = all.filter(it => ddChecklist[it.id] === 'uploaded').length;
    return { total: all.length, reviewed, uploaded };
  }, [ddChecklist]);

  // ── Investment Memo generation
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
        loanAmount: loanNum || undefined,
        interestRate: interestRate ? parseNum(interestRate) / 100 : undefined,
        loanTermMonths: loanTermMonths ? parseInt(loanTermMonths) : undefined,
      },
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
      ddChecklist,
      ddUploads,
      ddPhases: DD_PHASES,
      dealApi,
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
    loanNum, interestRate, loanTermMonths, strategy, aequitasEquity, projExitValue,
    projLpNetIrr, projEquityMultiple, capexItems,
    underContractTarget, closedTarget, exitedTarget, fundSettings, ddChecklist, ddUploads,
  ]);

  // ── Export as PDF
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

  // ── Not found state
  if (!record) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <AlertTriangle size={32} className="text-amber-400" />
        <p className="text-gray-600 text-sm max-w-sm">
          No deal execution record found for this deal. Advance a deal to <strong>Data Room Received</strong> on the Underwriting page first.
        </p>
        <Link to="/deal-execution" className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline">
          <ArrowLeft size={14} /> All Deals
        </Link>
      </div>
    );
  }

  const statusStyle = PIPELINE_STATUS_STYLES[pipelineStatus];
  const stageStatus = (n: 1 | 2 | 3): 'completed' | 'active' | 'locked' =>
    stage > n ? 'completed' : stage === n ? 'active' : 'locked';

  // ─── Model Status Card data ───────────────────────────────────────────────
  const originalIrr       = record.proForma?.projectedLpNetIrr;
  const currentIrr        = projLpNetIrr ? parseNum(projLpNetIrr) : undefined;
  const originalEM        = record.proForma?.projectedEquityMultiple;
  const currentEM         = projEquityMultiple ? parseNum(projEquityMultiple) : undefined;

  const isFlagged = (orig?: number, curr?: number) => {
    if (!orig || !curr) return false;
    return Math.abs((curr - orig) / orig) > 0.1;
  };

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gray-50 min-h-screen">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
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
              <Link to="/deal-execution" className="hover:text-blue-500 transition-colors">
                All Deals
              </Link>
            </p>

            {/* Deal name + switcher */}
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold text-gray-900">{record.dealName}</h1>
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

            {/* Subtitle — read-only dates */}
            <p className="text-xs text-gray-400 mt-0.5 space-x-3">
              <span>Data Room: {fmtDate(record.createdAt)}</span>
              {record.loiExecutedAt && (
                <span>· LOI Executed: {fmtDate(record.loiExecutedAt)}</span>
              )}
            </p>
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

      {/* ── Two-column layout ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* ── Left column ─────────────────────────────────────────────────── */}
        <div className="xl:col-span-2 space-y-8">

          {/* ═══════════════════════════════════════════════════════════════
              STAGE 1 — DATA ROOM
          ═══════════════════════════════════════════════════════════════ */}
          <div>
            <StageHeader number={1} label="Stage 1 — Data Room" status={stageStatus(1)} />

            {/* Documents panel (existing) */}
            <div className="mb-4">
              <DocumentsPanel
                documents={documents}
                onDocumentsChange={handleDocumentsChange}
              />
            </div>

            {/* Data Room checklist */}
            <div className={`bg-white rounded-xl p-6 shadow-sm ${stage < 1 ? 'opacity-50 pointer-events-none' : ''}`}>
              <SectionHeader label="Document Checklist" sub="Mark each item as received / reviewed" />
              <div className="divide-y divide-gray-100">
                {DATA_ROOM_ITEMS.map(item => {
                  const status: DDItemStatus = dataRoomChecklist[item.id] ?? 'pending';
                  const uploadedFile = dataRoomUploads[item.id];
                  return (
                    <div key={item.id} className="flex items-center gap-3 py-3">
                      <button
                        onClick={() => cycleDataRoomStatus(item.id)}
                        className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold transition-colors ${DD_STATUS_STYLE[status]}`}
                        title="Click to cycle: Pending → Uploaded → Reviewed"
                      >
                        {DD_STATUS_LABEL[status]}
                      </button>
                      <span className={`flex-1 text-sm ${status === 'reviewed' ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                        {item.label}
                      </span>
                      {uploadedFile && (
                        <span className="text-xs text-gray-400 truncate max-w-[120px] flex items-center gap-1">
                          <FileText size={11} />
                          {uploadedFile}
                        </span>
                      )}
                      <button
                        onClick={() => dataRoomRefs.current[item.id]?.click()}
                        className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-gray-200 hover:border-blue-200 transition-colors"
                      >
                        <Upload size={11} />
                        {uploadedFile ? 'Replace' : 'Upload'}
                      </button>
                      <input
                        type="file"
                        className="hidden"
                        ref={el => { dataRoomRefs.current[item.id] = el; }}
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleDataRoomUpload(item.id, file);
                          e.target.value = '';
                        }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Exit trigger — Stage 1 */}
            {stage === 1 && (
              <div className="mt-4 flex justify-end">
                <button
                  onClick={() => advanceToStage(2, 'LOI Executed')}
                  className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl shadow-sm transition-colors"
                >
                  Proceed to LOI <ChevronRight size={15} />
                </button>
              </div>
            )}
          </div>

          {/* ═══════════════════════════════════════════════════════════════
              STAGE 2 — DUE DILIGENCE
          ═══════════════════════════════════════════════════════════════ */}
          <div className={stage < 2 ? 'opacity-40 pointer-events-none select-none' : ''}>
            <StageHeader number={2} label="Stage 2 — Due Diligence" status={stageStatus(2)} />

            <div className="space-y-6">
              {/* Section A — Deal Terms */}
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <SectionHeader label="A — Deal Terms" sub="Pre-filled from LOI · edit and blur to save" />
                <div className="grid grid-cols-2 gap-4">
                  <Field label="Purchase Price ($)" value={purchasePrice} onChange={setPurchasePrice} onBlur={saveLoiData} placeholder="e.g. 8500000" />
                  <Field label="Earnest Money Deposit ($)" value={earnestMoney} onChange={setEarnestMoney} onBlur={saveLoiData} placeholder="e.g. 250000" />
                  <Field label="Due Diligence Deadline" value={ddDeadline} onChange={setDdDeadline} onBlur={saveLoiData} type="date" />
                  <Field label="Financing Contingency" value={financingContingency} onChange={setFinancingContingency} onBlur={saveLoiData} type="date" />
                  <Field label="Target Close Date" value={targetClose} onChange={setTargetClose} onBlur={saveLoiData} type="date" />
                  <Field label="Loan Amount ($)" value={loanAmount} onChange={setLoanAmount} onBlur={saveLoiData} placeholder="e.g. 6000000" />
                  <Field label="Interest Rate (%)" value={interestRate} onChange={setInterestRate} onBlur={saveLoiData} placeholder="e.g. 6.5" />
                  <Field label="Loan Term (months)" value={loanTermMonths} onChange={setLoanTermMonths} onBlur={saveLoiData} placeholder="e.g. 360" />
                </div>

                {/* Target Dates row */}
                <div className="mt-5 pt-5 border-t border-gray-100">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Target Dates</p>
                  <div className="grid grid-cols-3 gap-4">
                    <Field label="Under Contract" value={underContractTarget} onChange={setUnderContractTarget} onBlur={saveMilestones} type="date" />
                    <Field label="Closed" value={closedTarget} onChange={setClosedTarget} onBlur={saveMilestones} type="date" />
                    <Field label="Exited" value={exitedTarget} onChange={setExitedTarget} onBlur={saveMilestones} type="date" />
                  </div>
                </div>
              </div>

              {/* Section C — CapEx */}
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <SectionHeader label="C — CapEx Budget" sub="Total feeds equity calculation in real time" />
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
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                  </div>
                  <button
                    onClick={addCapexItem}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors"
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>

              {/* E — DD Checklist */}
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <div className="flex items-baseline justify-between mb-5">
                  <div className="flex items-baseline gap-3">
                    <h2 className="text-base font-semibold text-gray-900">E — DD Checklist</h2>
                    <span className="text-xs text-gray-400">
                      {ddProgress.reviewed} reviewed · {ddProgress.uploaded} uploaded · {ddProgress.total - ddProgress.reviewed - ddProgress.uploaded} pending
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-24 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-green-500 rounded-full transition-all"
                        style={{ width: `${(ddProgress.reviewed / ddProgress.total) * 100}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400">
                      {Math.round((ddProgress.reviewed / ddProgress.total) * 100)}%
                    </span>
                  </div>
                </div>

                <div className="space-y-3">
                  {DD_PHASES.map(phase => {
                    const isOpen = openPhases[phase.id] ?? false;
                    const phaseItems = phase.items;
                    const phaseReviewed = phaseItems.filter(it => ddChecklist[it.id] === 'reviewed').length;
                    const phaseTotal = phaseItems.length;
                    const allReviewed = phaseReviewed === phaseTotal;
                    return (
                      <div key={phase.id} className="border border-gray-200 rounded-xl overflow-hidden">
                        <button
                          onClick={() => togglePhase(phase.id)}
                          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2.5">
                            <ChevronRight size={14} className={`text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                            {allReviewed
                              ? <CheckCircle2 size={14} className="text-green-500 flex-shrink-0" />
                              : <div className={`w-3.5 h-3.5 rounded-full border-2 flex-shrink-0 ${phaseReviewed > 0 ? 'border-amber-400 bg-amber-50' : 'border-gray-300'}`} />
                            }
                            <span className="text-sm font-medium text-gray-800">{phase.label}</span>
                          </div>
                          <span className="text-xs text-gray-400 tabular-nums">{phaseReviewed}/{phaseTotal}</span>
                        </button>
                        {isOpen && (
                          <div className="divide-y divide-gray-100">
                            {phaseItems.map(item => {
                              const status: DDItemStatus = ddChecklist[item.id] ?? 'pending';
                              const uploadedFile = ddUploads[item.id];
                              return (
                                <div key={item.id} className="flex items-center gap-3 px-4 py-3">
                                  <button
                                    onClick={() => cycleItemStatus(item.id)}
                                    className={`flex-shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold transition-colors ${DD_STATUS_STYLE[status]}`}
                                    title="Click to cycle: Pending → Uploaded → Reviewed"
                                  >
                                    {DD_STATUS_LABEL[status]}
                                  </button>
                                  <span className={`flex-1 text-sm ${status === 'reviewed' ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
                                    {item.label}
                                  </span>
                                  {uploadedFile && (
                                    <span className="text-xs text-gray-400 truncate max-w-[120px] flex items-center gap-1">
                                      <FileText size={11} />
                                      {uploadedFile}
                                    </span>
                                  )}
                                  <button
                                    onClick={() => fileInputRefs.current[item.id]?.click()}
                                    className="flex-shrink-0 flex items-center gap-1 px-2 py-1 text-xs text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg border border-gray-200 hover:border-blue-200 transition-colors"
                                  >
                                    <Upload size={11} />
                                    {uploadedFile ? 'Replace' : 'Upload'}
                                  </button>
                                  <input
                                    type="file"
                                    className="hidden"
                                    ref={el => { fileInputRefs.current[item.id] = el; }}
                                    onChange={e => {
                                      const file = e.target.files?.[0];
                                      if (file) handleItemUpload(item.id, file);
                                      e.target.value = '';
                                    }}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Exit trigger — Stage 2 */}
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

          {/* ═══════════════════════════════════════════════════════════════
              STAGE 3 — CLOSING
          ═══════════════════════════════════════════════════════════════ */}
          <div className={stage < 3 ? 'opacity-40 pointer-events-none select-none' : ''}>
            <StageHeader number={3} label="Stage 3 — Closing" status={stageStatus(3)} />

            <div className="space-y-6">
              {/* Closing checklist */}
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

              {/* Exit trigger — Stage 3 */}
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

        {/* ── Right column (sticky sidebar) ───────────────────────────────── */}
        <div className="space-y-6">

          {/* ── Model Status Card ──────────────────────────────────────────── */}
          <div className="bg-white rounded-xl p-5 shadow-sm">
            <div className="flex items-baseline justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-900">Model Status</h2>
              <Link
                to="/underwriting"
                className="text-xs text-blue-600 hover:underline flex items-center gap-0.5"
              >
                View Full Model →
              </Link>
            </div>
            <div className="grid grid-cols-4 gap-1 mb-3">
              <div className="col-span-4 grid grid-cols-4 text-center mb-1">
                <div />
                <p className="text-xs text-gray-400 col-span-1">Orig.</p>
                <p className="text-xs text-gray-400 col-span-1">Current</p>
                <div />
              </div>
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

          {/* ── Section B — Capital Structure (sticky) ─────────────────────── */}
          <div className="bg-white rounded-xl p-6 shadow-sm xl:sticky xl:top-6 space-y-5">
            <SectionHeader label="B — Capital Structure" />

            {/* Live equity waterfall */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-xs text-blue-800">
                <span>Purchase Price</span>
                <span className="font-semibold tabular-nums">{ppNum > 0 ? fmt$(ppNum) : '—'}</span>
              </div>
              <div className="flex justify-between text-xs text-blue-800">
                <span>Loan Amount</span>
                <span className={`font-semibold tabular-nums ${loanNum > 0 ? 'text-red-600' : ''}`}>
                  {loanNum > 0 ? `− ${fmt$(loanNum)}` : '—'}
                </span>
              </div>
              <div className="flex justify-between text-xs text-blue-800">
                <span>Total CapEx</span>
                <span className="font-semibold tabular-nums">
                  {capexTotal > 0 ? `+ ${fmt$(capexTotal)}` : '—'}
                </span>
              </div>
              <div className="border-t border-blue-200 pt-2 flex justify-between">
                <span className="text-sm font-semibold text-blue-900">Equity Required</span>
                <span className="text-sm font-bold text-blue-900 tabular-nums">
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
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
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

          {/* ── F — Investment Memo ──────────────────────────────────────────── */}
          <div className="bg-white rounded-xl p-6 shadow-sm space-y-4">
            <div>
              <h2 className="text-base font-semibold text-gray-900">F — Investment Memo</h2>
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
                <button
                  onClick={exportAsPdf}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 rounded-xl transition-colors"
                >
                  <Download size={14} />
                  Export as PDF
                </button>
              </>
            )}

            {!memoText && !memoLoading && !memoError && (
              <p className="text-xs text-gray-400 text-center py-4">
                Fill in deal terms and pro forma above, then click Generate Memo.
              </p>
            )}
          </div>

        </div>{/* end right column */}

      </div>
    </div>
  );
};

export default DealExecution;
