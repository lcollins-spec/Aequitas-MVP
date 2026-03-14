import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ArrowLeft, ChevronDown, Plus, Trash2, CheckCircle2, Clock, AlertTriangle,
} from 'lucide-react';
import {
  getDealExecution, patchDealExecution,
  type DealExecutionRecord, type CapitalCall, type Distribution, type CapexItem, type DealDocument,
} from '../types/dealExecution';
import DocumentsPanel from '../components/DocumentsPanel';
import {
  getPipelineStatus, setPipelineStatus,
  type PipelineStatus, PIPELINE_STATUSES, PIPELINE_STATUS_STYLES,
} from '../types/deal';
import { getFundSettings } from '../types/fundSettings';

// ─── Constants ────────────────────────────────────────────────────────────────
const STATUS_RANK: Record<PipelineStatus, number> = {
  'Analyzing': 0,
  'Data Room Received': 1,
  'LOI Executed': 2,
  'Under Contract': 3,
  'Closed': 4,
  'Exited': 5,
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

// ─── Main component ───────────────────────────────────────────────────────────
const DealExecution = () => {
  const { dealId } = useParams<{ dealId: string }>();
  const numericId = parseInt(dealId ?? '0');

  const [record, setRecord] = useState<DealExecutionRecord | null>(null);
  const fundSettings = useMemo(() => getFundSettings(), []);

  // Status
  const [pipelineStatus, setPipelineStatusState] = useState<PipelineStatus>('Analyzing');
  const [showStatusDrop, setShowStatusDrop] = useState(false);

  // Section A — Deal Terms
  const [purchasePrice, setPurchasePrice] = useState('');
  const [earnestMoney, setEarnestMoney] = useState('');
  const [ddDeadline, setDdDeadline] = useState('');
  const [financingContingency, setFinancingContingency] = useState('');
  const [targetClose, setTargetClose] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [loanTermMonths, setLoanTermMonths] = useState('');

  // Section B — Capital Structure / Pro Forma
  const [strategy, setStrategy] = useState<'Acquisition' | 'Light Rehab' | 'Heavy Rehab'>('Acquisition');
  const [aequitasEquity, setAequitasEquity] = useState('');
  const [projExitValue, setProjExitValue] = useState('');
  const [projLpNetIrr, setProjLpNetIrr] = useState('');
  const [projEquityMultiple, setProjEquityMultiple] = useState('');

  // Documents (Data Room + additional uploads)
  const [documents, setDocuments] = useState<DealDocument[]>([]);

  // Section C — CapEx
  const [capexItems, setCapexItems] = useState<CapexItem[]>([]);
  const [newCapexDesc, setNewCapexDesc] = useState('');
  const [newCapexAmt, setNewCapexAmt] = useState('');

  // Section D — Capital Calls
  const [capitalCalls, setCapitalCalls] = useState<CapitalCall[]>([]);
  const [showCcForm, setShowCcForm] = useState(false);
  const [ccDate, setCcDate] = useState('');
  const [ccCalled, setCcCalled] = useState('');
  const [ccReceived, setCcReceived] = useState('');
  const [ccPurpose, setCcPurpose] = useState('');
  const [ccStatus, setCcStatus] = useState<CapitalCall['status']>('Pending');

  // Section D — Distributions
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [showDistForm, setShowDistForm] = useState(false);
  const [distDate, setDistDate] = useState('');
  const [distAmount, setDistAmount] = useState('');
  const [distType, setDistType] = useState<Distribution['type']>('Operating');

  // Milestones (target dates)
  const [underContractTarget, setUnderContractTarget] = useState('');
  const [closedTarget, setClosedTarget] = useState('');
  const [exitedTarget, setExitedTarget] = useState('');

  // ── Load record on mount
  useEffect(() => {
    const rec = getDealExecution(numericId);
    if (rec) {
      setRecord(rec);
      const loi = rec.loiData ?? {};
      setPurchasePrice(loi.purchasePrice ? String(loi.purchasePrice) : rec.purchasePrice ? String(rec.purchasePrice) : '');
      setEarnestMoney(loi.earnestMoneyDeposit ? String(loi.earnestMoneyDeposit) : '');
      setDdDeadline(loi.dueDiligenceDeadline ?? '');
      setFinancingContingency(loi.financingContingency ?? '');
      setTargetClose(loi.targetCloseDate ?? '');
      setLoanAmount(loi.loanAmount ? String(loi.loanAmount) : '');
      setInterestRate(loi.interestRate ? String((loi.interestRate * 100).toFixed(3)) : '');
      setLoanTermMonths(loi.loanTermMonths ? String(loi.loanTermMonths) : '');

      const pf = rec.proForma ?? {};
      setStrategy(pf.strategy ?? 'Acquisition');
      setAequitasEquity(pf.aequitasEquity ? String(pf.aequitasEquity) : '');
      setProjExitValue(pf.projectedExitValue ? String(pf.projectedExitValue) : '');
      setProjLpNetIrr(pf.projectedLpNetIrr ? String(pf.projectedLpNetIrr) : '');
      setProjEquityMultiple(pf.projectedEquityMultiple ? String(pf.projectedEquityMultiple) : '');

      setDocuments(rec.documents ?? []);
      setCapexItems(rec.capexItems ?? []);
      setCapitalCalls(rec.capitalCalls ?? []);
      setDistributions(rec.distributions ?? []);

      const ms = rec.milestones ?? {};
      setUnderContractTarget(ms.underContractTarget ?? '');
      setClosedTarget(ms.closedTarget ?? '');
      setExitedTarget(ms.exitedTarget ?? '');
    }
    setPipelineStatusState(getPipelineStatus(numericId));
  }, [numericId]);

  // ── Live calculations
  const ppNum = parseNum(purchasePrice);
  const loanNum = parseNum(loanAmount);
  const capexTotal = useMemo(() => capexItems.reduce((s, i) => s + i.amount, 0), [capexItems]);
  const totalEquityRequired = ppNum - loanNum + capexTotal;
  const acqFeeAmount = ppNum * fundSettings.acqFee;

  // ── Auto-save callbacks (called on blur)
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

  const saveMilestones = useCallback(() => {
    patchDealExecution(numericId, {
      milestones: {
        underContractTarget: underContractTarget || undefined,
        closedTarget: closedTarget || undefined,
        exitedTarget: exitedTarget || undefined,
      },
    });
  }, [numericId, underContractTarget, closedTarget, exitedTarget]);

  // ── Status change
  const handleStatusChange = (s: PipelineStatus) => {
    setPipelineStatusState(s);
    setPipelineStatus(numericId, s);
    setShowStatusDrop(false);
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

  // ── Capital call operations
  const addCapitalCall = () => {
    if (!ccDate) return;
    const cc: CapitalCall = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: ccDate,
      amountCalled: parseNum(ccCalled),
      amountReceived: parseNum(ccReceived),
      purpose: ccPurpose.trim(),
      status: ccStatus,
    };
    const updated = [...capitalCalls, cc];
    setCapitalCalls(updated);
    patchDealExecution(numericId, { capitalCalls: updated });
    setCcDate(''); setCcCalled(''); setCcReceived(''); setCcPurpose(''); setCcStatus('Pending');
    setShowCcForm(false);
  };

  const removeCapitalCall = (id: string) => {
    const updated = capitalCalls.filter(c => c.id !== id);
    setCapitalCalls(updated);
    patchDealExecution(numericId, { capitalCalls: updated });
  };

  // ── Distribution operations
  const addDistribution = () => {
    if (!distDate || !distAmount) return;
    const d: Distribution = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: distDate,
      amount: parseNum(distAmount),
      type: distType,
    };
    const updated = [...distributions, d];
    setDistributions(updated);
    patchDealExecution(numericId, { distributions: updated });
    setDistDate(''); setDistAmount(''); setDistType('Operating');
    setShowDistForm(false);
  };

  const removeDistribution = (id: string) => {
    const updated = distributions.filter(d => d.id !== id);
    setDistributions(updated);
    patchDealExecution(numericId, { distributions: updated });
  };

  // ── Document operations
  const handleDocumentsChange = useCallback((updated: DealDocument[]) => {
    setDocuments(updated);
    patchDealExecution(numericId, { documents: updated });
  }, [numericId]);

  // ── Milestone strip data
  const rank = STATUS_RANK[pipelineStatus];
  const today = Date.now();
  const dayMs = 86_400_000;

  const milestoneItems = [
    { label: 'Data Room Received', date: record?.createdAt, completed: rank >= 1, editable: false, value: '', onChange: undefined as ((v: string) => void) | undefined },
    { label: 'LOI Executed',       date: record?.loiExecutedAt, completed: rank >= 2, editable: false, value: '', onChange: undefined as ((v: string) => void) | undefined },
    { label: 'Under Contract',     date: underContractTarget || undefined, completed: rank >= 3, editable: true, value: underContractTarget, onChange: setUnderContractTarget },
    { label: 'Closed',             date: closedTarget || undefined, completed: rank >= 4, editable: true, value: closedTarget, onChange: setClosedTarget },
    { label: 'Exited',             date: exitedTarget || undefined, completed: rank >= 5, editable: true, value: exitedTarget, onChange: setExitedTarget },
  ];

  const milestoneStyle = (m: typeof milestoneItems[number]) => {
    if (m.completed) return { bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700', icon: 'text-green-500' };
    if (m.date) {
      const diff = new Date(m.date).getTime() - today;
      if (diff < 0) return { bg: 'bg-red-50', border: 'border-red-200', text: 'text-red-700', icon: 'text-red-500' };
      if (diff < 14 * dayMs) return { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700', icon: 'text-amber-500' };
    }
    return { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-600', icon: 'text-gray-400' };
  };

  // ── Not found state
  if (!record) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] text-center gap-4">
        <AlertTriangle size={32} className="text-amber-400" />
        <p className="text-gray-600 text-sm max-w-sm">
          No deal execution record found for this deal. Advance a deal to <strong>Data Room Received</strong> on the Underwriting page first.
        </p>
        <Link to="/underwriting" className="flex items-center gap-1.5 text-sm font-medium text-blue-600 hover:underline">
          <ArrowLeft size={14} /> Go to Underwriting
        </Link>
      </div>
    );
  }

  const statusStyle = PIPELINE_STATUS_STYLES[pipelineStatus];

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gray-50 min-h-screen">

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-start gap-3">
          <Link to="/underwriting" className="mt-1 p-1.5 text-gray-400 hover:text-gray-600 hover:bg-white border border-transparent hover:border-gray-200 rounded-lg transition-colors">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <p className="text-xs text-gray-400 mb-0.5 uppercase tracking-wide">Deal Execution</p>
            <h1 className="text-2xl font-semibold text-gray-900">{record.dealName}</h1>
            {record.propertyAddress && (
              <p className="text-sm text-gray-500 mt-0.5">{record.propertyAddress}</p>
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

      {/* ── Milestone strip ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl p-5 shadow-sm mb-6">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Milestones</p>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {milestoneItems.map(m => {
            const s = milestoneStyle(m);
            return (
              <div key={m.label} className={`flex-shrink-0 flex flex-col gap-1.5 px-4 py-3 rounded-xl border ${s.bg} ${s.border} min-w-[148px]`}>
                <div className="flex items-center gap-1.5">
                  {m.completed
                    ? <CheckCircle2 size={12} className={s.icon} />
                    : <Clock size={12} className={s.icon} />
                  }
                  <span className={`text-xs font-semibold ${s.text} leading-tight`}>{m.label}</span>
                </div>
                {m.editable ? (
                  <input
                    type="date"
                    value={m.value}
                    onChange={e => m.onChange?.(e.target.value)}
                    onBlur={saveMilestones}
                    className={`text-xs bg-transparent border-0 focus:outline-none focus:ring-1 focus:ring-blue-300 rounded px-0 w-full ${s.text}`}
                  />
                ) : (
                  <span className={`text-xs ${s.text}`}>{fmtDate(m.date)}</span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── Two-column layout ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">

        {/* Left — Documents, Sections A, C, D */}
        <div className="xl:col-span-2 space-y-6">

          {/* Documents panel */}
          <DocumentsPanel
            documents={documents}
            onDocumentsChange={handleDocumentsChange}
          />

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

            {/* Add line item form */}
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

          {/* Section D — Capital Calls */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">D — Capital Calls</h2>
                {capitalCalls.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Total called: {fmt$(capitalCalls.reduce((s, c) => s + c.amountCalled, 0))} ·
                    Received: {fmt$(capitalCalls.reduce((s, c) => s + c.amountReceived, 0))}
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowCcForm(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors"
              >
                <Plus size={12} /> Add Call
              </button>
            </div>

            {capitalCalls.length > 0 ? (
              <div className="overflow-x-auto mb-4">
                <table className="w-full text-sm min-w-[560px]">
                  <thead>
                    <tr className="border-b border-gray-200">
                      {['Date', 'Called', 'Received', 'Purpose', 'Status', ''].map(h => (
                        <th key={h} className="text-left py-2 px-2 text-xs font-semibold text-gray-400 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {capitalCalls.map(cc => (
                      <tr key={cc.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="py-2.5 px-2 text-gray-700 whitespace-nowrap">{fmtDate(cc.date)}</td>
                        <td className="py-2.5 px-2 text-gray-700 tabular-nums">{fmt$(cc.amountCalled)}</td>
                        <td className="py-2.5 px-2 text-gray-700 tabular-nums">{fmt$(cc.amountReceived)}</td>
                        <td className="py-2.5 px-2 text-gray-600 max-w-[120px] truncate">{cc.purpose || '—'}</td>
                        <td className="py-2.5 px-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${
                            cc.status === 'Funded'  ? 'bg-green-100 text-green-700' :
                            cc.status === 'Partial' ? 'bg-amber-100 text-amber-700' :
                                                      'bg-gray-100 text-gray-600'
                          }`}>{cc.status}</span>
                        </td>
                        <td className="py-2.5 px-2">
                          <button onClick={() => removeCapitalCall(cc.id)} className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors">
                            <Trash2 size={12} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-4">No capital calls recorded yet.</p>
            )}

            {showCcForm && (
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">New Capital Call</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date" value={ccDate} onChange={setCcDate} type="date" />
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                    <select
                      value={ccStatus}
                      onChange={e => setCcStatus(e.target.value as CapitalCall['status'])}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option>Pending</option>
                      <option>Funded</option>
                      <option>Partial</option>
                    </select>
                  </div>
                  <Field label="Amount Called ($)" value={ccCalled} onChange={setCcCalled} placeholder="e.g. 500000" />
                  <Field label="Amount Received ($)" value={ccReceived} onChange={setCcReceived} placeholder="e.g. 500000" />
                  <div className="col-span-2">
                    <Field label="Purpose" value={ccPurpose} onChange={setCcPurpose} placeholder="e.g. Initial acquisition" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowCcForm(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg">Cancel</button>
                  <button onClick={addCapitalCall} className="px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg">Save Call</button>
                </div>
              </div>
            )}
          </div>

          {/* Section D — Distributions */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-base font-semibold text-gray-900">D — Distributions</h2>
                {distributions.length > 0 && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    Total: {fmt$(distributions.reduce((s, d) => s + d.amount, 0))}
                  </p>
                )}
              </div>
              <button
                onClick={() => setShowDistForm(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 border border-emerald-200 rounded-lg transition-colors"
              >
                <Plus size={12} /> Add Distribution
              </button>
            </div>

            {distributions.length > 0 ? (
              <table className="w-full text-sm mb-4">
                <thead>
                  <tr className="border-b border-gray-200">
                    {['Date', 'Amount', 'Type', ''].map(h => (
                      <th key={h} className="text-left py-2 px-2 text-xs font-semibold text-gray-400 uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {distributions.map(d => (
                    <tr key={d.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="py-2.5 px-2 text-gray-700 whitespace-nowrap">{fmtDate(d.date)}</td>
                      <td className="py-2.5 px-2 font-semibold text-emerald-700 tabular-nums">{fmt$(d.amount)}</td>
                      <td className="py-2.5 px-2">
                        <span className="text-xs text-gray-600 bg-gray-100 px-2 py-0.5 rounded-full">{d.type}</span>
                      </td>
                      <td className="py-2.5 px-2">
                        <button onClick={() => removeDistribution(d.id)} className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors">
                          <Trash2 size={12} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-xs text-gray-400 mb-4">No distributions recorded yet.</p>
            )}

            {showDistForm && (
              <div className="border border-gray-200 rounded-xl p-4 bg-gray-50 space-y-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">New Distribution</p>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Date" value={distDate} onChange={setDistDate} type="date" />
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                    <select
                      value={distType}
                      onChange={e => setDistType(e.target.value as Distribution['type'])}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                    >
                      <option>Operating</option>
                      <option>Return of Capital</option>
                      <option>Disposition</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <Field label="Amount ($)" value={distAmount} onChange={setDistAmount} placeholder="e.g. 100000" />
                  </div>
                </div>
                <div className="flex gap-2 justify-end">
                  <button onClick={() => setShowDistForm(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg">Cancel</button>
                  <button onClick={addDistribution} className="px-4 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg">Save Distribution</button>
                </div>
              </div>
            )}
          </div>

        </div>{/* end left column */}

        {/* Right — Section B (sticky) */}
        <div>
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

            {/* Aequitas Equity */}
            <Field label="Aequitas Equity ($)" value={aequitasEquity} onChange={setAequitasEquity} onBlur={saveProForma} placeholder="e.g. 2500000" />

            {/* Strategy */}
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

            {/* Fund Economics — read-only from FundSettings */}
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

            {/* Pro Forma */}
            <div className="space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Pro Forma</p>
              <Field label="Projected Exit Value ($)"   value={projExitValue}      onChange={setProjExitValue}      onBlur={saveProForma} placeholder="e.g. 12000000" />
              <Field label="LP Net IRR (%)"             value={projLpNetIrr}       onChange={setProjLpNetIrr}       onBlur={saveProForma} placeholder="e.g. 18.5" />
              <Field label="Equity Multiple (x)"        value={projEquityMultiple} onChange={setProjEquityMultiple} onBlur={saveProForma} placeholder="e.g. 2.1" />
            </div>

            {/* Summary note */}
            <p className="text-xs text-gray-400 leading-relaxed border-t border-gray-100 pt-4">
              Pro forma data feeds the Fund Returns portfolio table and TVPI/DPI calculations. Capital call amounts feed the XIRR model.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default DealExecution;
