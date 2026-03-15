import { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import {
  getDealExecution, patchDealExecution, loadExecutionFromBackend,
  type CapexItem, type CapitalCall, type Distribution,
} from '../types/dealExecution';
import { getPipelineStatus, syncPipelineStatusesFromBackend } from '../types/deal';

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmt$ = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};
const parseNum = (s: string) => parseFloat(s.replace(/,/g, '')) || 0;
const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

// ─── Small shared components ──────────────────────────────────────────────────
const SectionHeader = ({ label, sub }: { label: string; sub?: string }) => (
  <div className="flex items-baseline gap-3 mb-5">
    <h2 className="text-base font-semibold text-gray-900">{label}</h2>
    {sub && <span className="text-xs text-gray-400">{sub}</span>}
  </div>
);

// ─── Operating Performance API helpers ───────────────────────────────────────
const OP_PERF_LS_KEY = 'aequitas_op_performance';  // legacy key — migrated on first load

interface OpPerfRow {
  id: string;
  year: string;
  projectedNoi: number;
  actualNoi: number;
}

async function fetchOpPerf(dealId: number): Promise<OpPerfRow[]> {
  try {
    const r = await fetch(`/api/v1/deals/${dealId}/op-performance`);
    if (!r.ok) return [];
    const j = await r.json();
    return (j.rows ?? []) as OpPerfRow[];
  } catch { return []; }
}

async function createOpPerfRow(dealId: number, row: OpPerfRow): Promise<void> {
  await fetch(`/api/v1/deals/${dealId}/op-performance`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(row),
  });
}

async function deleteOpPerfRow(dealId: number, rowId: string): Promise<void> {
  await fetch(`/api/v1/deals/${dealId}/op-performance/${rowId}`, { method: 'DELETE' });
}

async function bulkMigrateOpPerf(dealId: number, rows: OpPerfRow[]): Promise<void> {
  await fetch(`/api/v1/deals/${dealId}/op-performance/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(rows),
  });
}

// ─── Types from backend ───────────────────────────────────────────────────────
interface BackendDeal {
  id: number;
  dealName: string;
  location?: string;
  propertyAddress?: string;
  status: string;
}

// ─── Main Component ───────────────────────────────────────────────────────────
const AssetManagement = () => {
  const [deals, setDeals] = useState<BackendDeal[]>([]);
  const [selectedDealId, setSelectedDealId] = useState<number | null>(null);
  const [loadingDeals, setLoadingDeals] = useState(true);

  // Capital Calls state
  const [capitalCalls, setCapitalCalls] = useState<CapitalCall[]>([]);
  const [newCCDate, setNewCCDate] = useState('');
  const [newCCAmtCalled, setNewCCAmtCalled] = useState('');
  const [newCCAmtReceived, setNewCCAmtReceived] = useState('');
  const [newCCPurpose, setNewCCPurpose] = useState('');
  const [newCCStatus, setNewCCStatus] = useState<CapitalCall['status']>('Pending');

  // Distributions state
  const [distributions, setDistributions] = useState<Distribution[]>([]);
  const [newDistDate, setNewDistDate] = useState('');
  const [newDistAmt, setNewDistAmt] = useState('');
  const [newDistType, setNewDistType] = useState<Distribution['type']>('Operating');

  // CapEx state
  const [capexItems, setCapexItems] = useState<CapexItem[]>([]);
  const [newCapexDesc, setNewCapexDesc] = useState('');
  const [newCapexAmt, setNewCapexAmt] = useState('');

  // Operating Performance state
  const [opPerfRows, setOpPerfRows] = useState<OpPerfRow[]>([]);
  const [newOpYear, setNewOpYear] = useState('');
  const [newOpProjNoi, setNewOpProjNoi] = useState('');
  const [newOpActualNoi, setNewOpActualNoi] = useState('');

  // ── Fetch all deals from backend, sync pipeline statuses, filter by 'Closed'
  useEffect(() => {
    const fetchDeals = async () => {
      try {
        const res = await fetch('/api/v1/deals');
        if (res.ok) {
          const json = await res.json();
          const allDeals: BackendDeal[] = json.deals ?? [];
          const ids = allDeals.map(d => d.id).filter((id): id is number => id != null);
          await syncPipelineStatusesFromBackend(ids);
          const closed = allDeals.filter(d => d.id != null && getPipelineStatus(d.id) === 'Closed');
          setDeals(closed);
          if (closed.length > 0) setSelectedDealId(closed[0].id);
        }
      } catch { /* ignore */ } finally {
        setLoadingDeals(false);
      }
    };
    fetchDeals();
  }, []);

  // ── Load deal data when selected deal changes
  useEffect(() => {
    if (selectedDealId == null) return;
    // Reset forms
    setNewCCDate(''); setNewCCAmtCalled(''); setNewCCAmtReceived('');
    setNewCCPurpose(''); setNewCCStatus('Pending');
    setNewDistDate(''); setNewDistAmt(''); setNewDistType('Operating');
    setNewCapexDesc(''); setNewCapexAmt('');
    setNewOpYear(''); setNewOpProjNoi(''); setNewOpActualNoi('');

    // Load execution data (capital calls, distributions, capex) from backend
    loadExecutionFromBackend(selectedDealId).then(backendRec => {
      if (backendRec) {
        setCapitalCalls(backendRec.capitalCalls ?? []);
        setDistributions(backendRec.distributions ?? []);
        setCapexItems(backendRec.capexItems ?? []);
      } else {
        // Fall back to localStorage for execution data
        const record = getDealExecution(selectedDealId);
        setCapitalCalls(record?.capitalCalls ?? []);
        setDistributions(record?.distributions ?? []);
        setCapexItems(record?.capexItems ?? []);
      }
    });

    // Load op performance from DB, then migrate localStorage if DB is empty
    fetchOpPerf(selectedDealId).then(async (rows) => {
      if (rows.length > 0) {
        setOpPerfRows(rows);
      } else {
        // One-time migration from localStorage
        try {
          const raw = localStorage.getItem(OP_PERF_LS_KEY);
          if (raw) {
            const map = JSON.parse(raw) as Record<string, OpPerfRow[]>;
            const lsRows = map[String(selectedDealId)] ?? [];
            if (lsRows.length > 0) {
              await bulkMigrateOpPerf(selectedDealId, lsRows);
              setOpPerfRows(lsRows);
              // Remove this deal's data from localStorage map
              delete map[String(selectedDealId)];
              if (Object.keys(map).length === 0) {
                localStorage.removeItem(OP_PERF_LS_KEY);
              } else {
                localStorage.setItem(OP_PERF_LS_KEY, JSON.stringify(map));
              }
            } else {
              setOpPerfRows([]);
            }
          } else {
            setOpPerfRows([]);
          }
        } catch { setOpPerfRows([]); }
      }
    });
  }, [selectedDealId]);

  const selectedDeal = useMemo(
    () => deals.find(d => d.id === selectedDealId) ?? null,
    [deals, selectedDealId],
  );

  // ─── Capital Calls operations ────────────────────────────────────────────────
  const addCapitalCall = () => {
    if (!newCCDate && !newCCAmtCalled) return;
    const item: CapitalCall = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: newCCDate || new Date().toISOString().slice(0, 10),
      amountCalled: parseNum(newCCAmtCalled),
      amountReceived: parseNum(newCCAmtReceived),
      purpose: newCCPurpose.trim() || '—',
      status: newCCStatus,
    };
    const updated = [...capitalCalls, item];
    setCapitalCalls(updated);
    if (selectedDealId != null) patchDealExecution(selectedDealId, { capitalCalls: updated });
    setNewCCDate(''); setNewCCAmtCalled(''); setNewCCAmtReceived('');
    setNewCCPurpose(''); setNewCCStatus('Pending');
  };

  const removeCapitalCall = (id: string) => {
    const updated = capitalCalls.filter(i => i.id !== id);
    setCapitalCalls(updated);
    if (selectedDealId != null) patchDealExecution(selectedDealId, { capitalCalls: updated });
  };

  // ─── Distributions operations ────────────────────────────────────────────────
  const addDistribution = () => {
    if (!newDistDate && !newDistAmt) return;
    const item: Distribution = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      date: newDistDate || new Date().toISOString().slice(0, 10),
      amount: parseNum(newDistAmt),
      type: newDistType,
    };
    const updated = [...distributions, item];
    setDistributions(updated);
    if (selectedDealId != null) patchDealExecution(selectedDealId, { distributions: updated });
    setNewDistDate(''); setNewDistAmt(''); setNewDistType('Operating');
  };

  const removeDistribution = (id: string) => {
    const updated = distributions.filter(i => i.id !== id);
    setDistributions(updated);
    if (selectedDealId != null) patchDealExecution(selectedDealId, { distributions: updated });
  };

  // ─── CapEx operations ─────────────────────────────────────────────────────────
  const addCapexItem = () => {
    if (!newCapexDesc.trim() && !newCapexAmt) return;
    const item: CapexItem = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      description: newCapexDesc.trim() || 'Line Item',
      amount: parseNum(newCapexAmt),
    };
    const updated = [...capexItems, item];
    setCapexItems(updated);
    if (selectedDealId != null) patchDealExecution(selectedDealId, { capexItems: updated });
    setNewCapexDesc(''); setNewCapexAmt('');
  };

  const removeCapexItem = (id: string) => {
    const updated = capexItems.filter(i => i.id !== id);
    setCapexItems(updated);
    if (selectedDealId != null) patchDealExecution(selectedDealId, { capexItems: updated });
  };

  const capexTotal = useMemo(() => capexItems.reduce((s, i) => s + i.amount, 0), [capexItems]);

  // ─── Operating Performance operations ────────────────────────────────────────
  const addOpPerfRow = () => {
    if (!newOpYear) return;
    const row: OpPerfRow = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      year: newOpYear.trim(),
      projectedNoi: parseNum(newOpProjNoi),
      actualNoi: parseNum(newOpActualNoi),
    };
    setOpPerfRows(prev => [...prev, row]);
    if (selectedDealId != null) createOpPerfRow(selectedDealId, row).catch(() => {});
    setNewOpYear(''); setNewOpProjNoi(''); setNewOpActualNoi('');
  };

  const removeOpPerfRow = (id: string) => {
    setOpPerfRows(prev => prev.filter(r => r.id !== id));
    if (selectedDealId != null) deleteOpPerfRow(selectedDealId, id).catch(() => {});
  };

  // ─── Render ───────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden">
      {/* ── Left deal list sidebar ─────────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="px-4 py-5 border-b border-gray-100">
          <h1 className="text-sm font-semibold text-gray-800">Asset Management</h1>
          <p className="text-xs text-gray-400 mt-0.5">Closed deals</p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {loadingDeals ? (
            <p className="px-4 py-6 text-xs text-gray-400">Loading…</p>
          ) : deals.length === 0 ? (
            <div className="px-4 py-6">
              <p className="text-xs text-gray-400 leading-relaxed">
                No closed deals yet. Deals will appear here once marked Closed in Deal Execution.
              </p>
            </div>
          ) : (
            deals.map(deal => (
              <button
                key={deal.id}
                onClick={() => setSelectedDealId(deal.id)}
                className={`w-full text-left px-4 py-3 transition-colors border-l-2 ${
                  selectedDealId === deal.id
                    ? 'bg-blue-50 border-l-blue-500'
                    : 'border-l-transparent hover:bg-gray-50'
                }`}
              >
                <p className={`text-sm font-medium truncate ${selectedDealId === deal.id ? 'text-blue-700' : 'text-gray-800'}`}>
                  {deal.dealName}
                </p>
                {deal.location && (
                  <p className="text-xs text-gray-400 truncate mt-0.5">{deal.location}</p>
                )}
              </button>
            ))
          )}
        </div>
      </aside>

      {/* ── Main content area ──────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {selectedDeal == null ? (
          <div className="flex items-center justify-center h-full">
            <p className="text-sm text-gray-400">Select a deal to view asset management details.</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
            <div className="mb-2">
              <h1 className="text-xl font-semibold text-gray-900">{selectedDeal.dealName}</h1>
              {selectedDeal.location && (
                <p className="text-sm text-gray-500 mt-0.5">{selectedDeal.location}</p>
              )}
            </div>

            {/* ── 1. Capital Calls ──────────────────────────────────────────── */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <SectionHeader label="Capital Calls" />
              {capitalCalls.length > 0 && (
                <table className="w-full text-sm mb-4">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-xs font-semibold text-gray-400 uppercase">Date</th>
                      <th className="text-right py-2 text-xs font-semibold text-gray-400 uppercase">Called</th>
                      <th className="text-right py-2 text-xs font-semibold text-gray-400 uppercase">Received</th>
                      <th className="text-left py-2 pl-4 text-xs font-semibold text-gray-400 uppercase">Purpose</th>
                      <th className="text-left py-2 pl-4 text-xs font-semibold text-gray-400 uppercase">Status</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {capitalCalls.map(cc => (
                      <tr key={cc.id} className="border-b border-gray-50">
                        <td className="py-2.5 text-gray-700 tabular-nums">{fmtDate(cc.date)}</td>
                        <td className="py-2.5 text-right text-gray-700 tabular-nums">{fmt$(cc.amountCalled)}</td>
                        <td className="py-2.5 text-right text-gray-700 tabular-nums">{fmt$(cc.amountReceived)}</td>
                        <td className="py-2.5 pl-4 text-gray-700">{cc.purpose}</td>
                        <td className="py-2.5 pl-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            cc.status === 'Funded'  ? 'bg-green-100 text-green-700' :
                            cc.status === 'Partial' ? 'bg-amber-100 text-amber-700' :
                                                      'bg-gray-100 text-gray-600'
                          }`}>
                            {cc.status}
                          </span>
                        </td>
                        <td className="py-2.5 pl-2">
                          <button onClick={() => removeCapitalCall(cc.id)} className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {/* Add row form */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 items-end">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                  <input
                    type="date"
                    value={newCCDate}
                    onChange={e => setNewCCDate(e.target.value)}
                    className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Called ($)</label>
                  <input
                    type="text"
                    value={newCCAmtCalled}
                    onChange={e => setNewCCAmtCalled(e.target.value)}
                    placeholder="e.g. 500000"
                    className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Received ($)</label>
                  <input
                    type="text"
                    value={newCCAmtReceived}
                    onChange={e => setNewCCAmtReceived(e.target.value)}
                    placeholder="e.g. 500000"
                    className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Purpose</label>
                  <input
                    type="text"
                    value={newCCPurpose}
                    onChange={e => setNewCCPurpose(e.target.value)}
                    placeholder="e.g. Acquisition"
                    className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                  <select
                    value={newCCStatus}
                    onChange={e => setNewCCStatus(e.target.value as CapitalCall['status'])}
                    className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option>Pending</option>
                    <option>Funded</option>
                    <option>Partial</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={addCapitalCall}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors"
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>
            </div>

            {/* ── 2. Distributions ─────────────────────────────────────────── */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <SectionHeader label="Distributions" />
              {distributions.length > 0 && (
                <table className="w-full text-sm mb-4">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-xs font-semibold text-gray-400 uppercase">Date</th>
                      <th className="text-right py-2 text-xs font-semibold text-gray-400 uppercase">Amount</th>
                      <th className="text-left py-2 pl-4 text-xs font-semibold text-gray-400 uppercase">Type</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {distributions.map(dist => (
                      <tr key={dist.id} className="border-b border-gray-50">
                        <td className="py-2.5 text-gray-700 tabular-nums">{fmtDate(dist.date)}</td>
                        <td className="py-2.5 text-right text-gray-700 tabular-nums">{fmt$(dist.amount)}</td>
                        <td className="py-2.5 pl-4">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            dist.type === 'Operating'          ? 'bg-blue-100 text-blue-700' :
                            dist.type === 'Return of Capital'  ? 'bg-purple-100 text-purple-700' :
                                                                  'bg-teal-100 text-teal-700'
                          }`}>
                            {dist.type}
                          </span>
                        </td>
                        <td className="py-2.5 pl-2">
                          <button onClick={() => removeDistribution(dist.id)} className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors">
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {/* Add row form */}
              <div className="flex gap-2 items-end flex-wrap">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                  <input
                    type="date"
                    value={newDistDate}
                    onChange={e => setNewDistDate(e.target.value)}
                    className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div className="w-36">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Amount ($)</label>
                  <input
                    type="text"
                    value={newDistAmt}
                    onChange={e => setNewDistAmt(e.target.value)}
                    placeholder="e.g. 150000"
                    className="w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                  <select
                    value={newDistType}
                    onChange={e => setNewDistType(e.target.value as Distribution['type'])}
                    className="px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  >
                    <option>Operating</option>
                    <option>Return of Capital</option>
                    <option>Disposition</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    onClick={addDistribution}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors"
                  >
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>
            </div>

            {/* ── 3. CapEx Budget ───────────────────────────────────────────── */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <SectionHeader label="CapEx Budget" sub="Total feeds equity calculation in real time" />
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

            {/* ── 4. Operating Performance ──────────────────────────────────── */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <SectionHeader label="Operating Performance" />
              {opPerfRows.length > 0 && (
                <table className="w-full text-sm mb-4">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 text-xs font-semibold text-gray-400 uppercase">Year</th>
                      <th className="text-right py-2 text-xs font-semibold text-gray-400 uppercase">Projected NOI</th>
                      <th className="text-right py-2 text-xs font-semibold text-gray-400 uppercase">Actual NOI</th>
                      <th className="text-right py-2 text-xs font-semibold text-gray-400 uppercase">Variance</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {opPerfRows.map(row => {
                      const variance = row.actualNoi - row.projectedNoi;
                      return (
                        <tr key={row.id} className="border-b border-gray-50">
                          <td className="py-2.5 text-gray-700 font-medium">{row.year}</td>
                          <td className="py-2.5 text-right text-gray-700 tabular-nums">{fmt$(row.projectedNoi)}</td>
                          <td className="py-2.5 text-right text-gray-700 tabular-nums">{fmt$(row.actualNoi)}</td>
                          <td className={`py-2.5 text-right tabular-nums font-medium ${variance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                            {variance >= 0 ? '+' : ''}{fmt$(variance)}
                          </td>
                          <td className="py-2.5 pl-2">
                            <button onClick={() => removeOpPerfRow(row.id)} className="p-1 text-gray-300 hover:text-red-500 rounded transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {/* Add row form */}
              <div className="flex gap-2 items-end flex-wrap">
                <div className="w-24">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
                  <input
                    type="text"
                    value={newOpYear}
                    onChange={e => setNewOpYear(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addOpPerfRow()}
                    placeholder="2025"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div className="w-36">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Projected NOI ($)</label>
                  <input
                    type="text"
                    value={newOpProjNoi}
                    onChange={e => setNewOpProjNoi(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addOpPerfRow()}
                    placeholder="e.g. 200000"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div className="w-36">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Actual NOI ($)</label>
                  <input
                    type="text"
                    value={newOpActualNoi}
                    onChange={e => setNewOpActualNoi(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addOpPerfRow()}
                    placeholder="e.g. 185000"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    onClick={addOpPerfRow}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 border border-blue-200 rounded-lg transition-colors"
                  >
                    <Plus size={14} /> Add Row
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AssetManagement;
