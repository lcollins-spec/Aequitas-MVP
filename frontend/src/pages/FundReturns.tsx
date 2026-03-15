import { useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { DollarSign, TrendingUp, ArrowUp, PieChart, Activity, BarChart2, Settings } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Line,
  ComposedChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from 'recharts';
import { getAllDealExecutions, loadAllExecutionsFromBackend, type DealExecutionRecord } from '../types/dealExecution';
import { getFundSettings, saveFundSettings, loadFundSettingsFromBackend, type FundSettings } from '../types/fundSettings';
import { getPipelineStatus, PIPELINE_STATUS_STYLES, type PipelineStatus } from '../types/deal';
import FundSettingsModal from '../components/FundSettingsModal';

// ─── XIRR ────────────────────────────────────────────────────────────────────
// Solves for the rate r such that: Σ cf_i / (1+r)^(t_i in years) = 0
function xirr(cashflows: { date: Date; amount: number }[]): number | null {
  if (cashflows.length < 2) return null;
  const hasNeg = cashflows.some(c => c.amount < 0);
  const hasPos = cashflows.some(c => c.amount > 0);
  if (!hasNeg || !hasPos) return null;

  const d0 = cashflows[0].date.getTime();
  const years = (d: Date) => (d.getTime() - d0) / (365.25 * 86400 * 1000);

  let rate = 0.1;
  for (let i = 0; i < 1000; i++) {
    let f = 0, df = 0;
    for (const cf of cashflows) {
      const t = years(cf.date);
      const pv = cf.amount / Math.pow(1 + rate, t);
      f += pv;
      df -= t * cf.amount / Math.pow(1 + rate, t + 1);
    }
    if (Math.abs(df) < 1e-10) break;
    const next = rate - f / df;
    if (Math.abs(next - rate) < 0.00001) return next;
    rate = next;
  }
  return rate;
}

// ─── Illustrative IRR trend (J-curve shape) from vintage year ────────────────
function buildIllustativeIrrTrend(vintageYear: number): { label: string; irr: number }[] {
  const quarters: { label: string; irr: number }[] = [];
  // Shape: negative dip Y1, recovery Y2, growth Y3+
  const curve = [-2, -4, -3, -1, 1, 3, 5, 6.5, 7.8, 8.5, 9.2, 9.8, 10.2, 10.5, 10.8, 11.0];
  let q = 1, y = vintageYear;
  const now = new Date();
  const cutoffY = now.getFullYear();
  const cutoffQ = Math.ceil((now.getMonth() + 1) / 3);

  for (let i = 0; i < curve.length; i++) {
    if (y > cutoffY || (y === cutoffY && q > cutoffQ)) break;
    quarters.push({ label: `Q${q} ${y}`, irr: curve[i] });
    q++;
    if (q > 4) { q = 1; y++; }
  }
  return quarters;
}

// ─── Formatters ──────────────────────────────────────────────────────────────
const fmt$ = (v: number) => {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};
const fmtPct = (v: number) => `${v.toFixed(1)}%`;
const fmtX = (v: number) => `${v.toFixed(2)}x`;

// ─── Component ───────────────────────────────────────────────────────────────
const FundReturns = () => {
  const [settings, setSettings] = useState<FundSettings>(() => getFundSettings());
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [executions, setExecutions] = useState<DealExecutionRecord[]>(() => getAllDealExecutions());
  const navigate = useNavigate();

  // Hydrate from backend on mount
  useEffect(() => {
    loadFundSettingsFromBackend().then(backendSettings => {
      if (backendSettings) setSettings(backendSettings);
    });
    loadAllExecutionsFromBackend().then(() => {
      setExecutions(getAllDealExecutions());
    });
  }, []);

  const handleSaveSettings = useCallback((updated: FundSettings) => {
    saveFundSettings(updated);
    setSettings(updated);
    setShowSettingsModal(false);
  }, []);

  // ── Capital deployed = sum of amountReceived across all Section D capital calls
  const capitalDeployed = useMemo(() =>
    executions.reduce((sum, ex) =>
      sum + (ex.capitalCalls ?? []).reduce((s, c) => s + (c.amountReceived ?? 0), 0), 0),
    [executions]);

  // ── Total capital called
  const totalCapitalCalled = useMemo(() =>
    executions.reduce((sum, ex) =>
      sum + (ex.capitalCalls ?? []).reduce((s, c) => s + (c.amountCalled ?? 0), 0), 0),
    [executions]);

  // ── Total distributions
  const totalDistributions = useMemo(() =>
    executions.reduce((sum, ex) =>
      sum + (ex.distributions ?? []).reduce((s, d) => s + (d.amount ?? 0), 0), 0),
    [executions]);

  // ── Unrealized value = sum of projected exit values from Section B
  const unrealizedValue = useMemo(() =>
    executions.reduce((sum, ex) => sum + (ex.proForma?.projectedExitValue ?? 0), 0),
    [executions]);

  // ── Total Value = distributions already paid + unrealized NAV
  const totalValue = totalDistributions + unrealizedValue;

  // ── TVPI / DPI — denominator is total capital called (amountCalled), not deployed (amountReceived)
  const tvpi = totalCapitalCalled > 0 ? totalValue / totalCapitalCalled : 0;
  const dpi = totalCapitalCalled > 0 ? totalDistributions / totalCapitalCalled : 0;

  // ── Net IRR via XIRR over actual cash flows
  const netIrr = useMemo(() => {
    const cfs: { date: Date; amount: number }[] = [];
    for (const ex of executions) {
      for (const cc of ex.capitalCalls ?? []) {
        cfs.push({ date: new Date(cc.date), amount: -cc.amountReceived });
      }
      for (const d of ex.distributions ?? []) {
        cfs.push({ date: new Date(d.date), amount: d.amount });
      }
    }
    // Add current unrealized value at today
    if (unrealizedValue > 0) {
      cfs.push({ date: new Date(), amount: unrealizedValue });
    }
    cfs.sort((a, b) => a.date.getTime() - b.date.getTime());
    const r = xirr(cfs);
    return r !== null && isFinite(r) ? r * 100 : null;
  }, [executions, unrealizedValue]);

  // ── Deployment bar: fill against capital committed (raised), not target
  const capitalCommitted = settings.capitalCommitted;
  const deploymentPct = capitalCommitted > 0
    ? Math.min((capitalDeployed / capitalCommitted) * 100, 100)
    : 0;

  // ── Investment period remaining
  const firstCloseDate = new Date(`${settings.vintageYear}-01-01`);
  const endDate = new Date(firstCloseDate);
  endDate.setFullYear(endDate.getFullYear() + settings.investmentPeriodYears);
  const msRemaining = endDate.getTime() - Date.now();
  const yearsRemaining = Math.max(msRemaining / (365.25 * 86400 * 1000), 0);

  // ── Illustrative IRR trend
  const irrTrend = useMemo(() => buildIllustativeIrrTrend(settings.vintageYear), [settings.vintageYear]);

  // ── Cash flow chart: aggregate Section D entries by quarter
  const cashFlowChart = useMemo(() => {
    const map = new Map<string, { label: string; capitalCalls: number; distributions: number }>();
    const toQ = (iso: string) => {
      const d = new Date(iso);
      const q = Math.ceil((d.getMonth() + 1) / 3);
      return `Q${q} ${d.getFullYear()}`;
    };
    for (const ex of executions) {
      for (const cc of ex.capitalCalls ?? []) {
        const k = toQ(cc.date);
        const e = map.get(k) ?? { label: k, capitalCalls: 0, distributions: 0 };
        e.capitalCalls += cc.amountReceived;
        map.set(k, e);
      }
      for (const d of ex.distributions ?? []) {
        const k = toQ(d.date);
        const e = map.get(k) ?? { label: k, capitalCalls: 0, distributions: 0 };
        e.distributions += d.amount;
        map.set(k, e);
      }
    }
    return Array.from(map.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .map(r => ({ ...r, netCashFlow: r.distributions - r.capitalCalls }));
  }, [executions]);

  // ── Strategy breakdown
  const strategies = useMemo(() => {
    const buckets: Record<string, { count: number; deployed: number; unrealized: number }> = {
      'Acquisition': { count: 0, deployed: 0, unrealized: 0 },
      'Light Rehab': { count: 0, deployed: 0, unrealized: 0 },
      'Heavy Rehab': { count: 0, deployed: 0, unrealized: 0 },
    };
    for (const ex of executions) {
      const s = ex.proForma?.strategy ?? 'Acquisition';
      if (!buckets[s]) buckets[s] = { count: 0, deployed: 0, unrealized: 0 };
      const dep = (ex.capitalCalls ?? []).reduce((a, c) => a + c.amountReceived, 0);
      buckets[s].count += 1;
      buckets[s].deployed += dep;
      buckets[s].unrealized += ex.proForma?.projectedExitValue ?? 0;
    }
    return Object.entries(buckets).map(([name, b]) => ({
      name,
      count: b.count,
      deployed: b.deployed,
      allocationPct: capitalDeployed > 0 ? (b.deployed / capitalDeployed) * 100 : 0,
    }));
  }, [executions, capitalDeployed]);

  // ─── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gray-50 min-h-screen">

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-800">{settings.fundName}</h1>
          <p className="text-sm text-gray-500 mt-1">
            Vintage {settings.vintageYear} · Pref {fmtPct(settings.prefReturn * 100)} · Carry {fmtPct(settings.carry * 100)} · Acq Fee {fmtPct(settings.acqFee * 100)} · AM Fee {fmtPct(settings.amFee * 100)}
          </p>
        </div>
        <button
          onClick={() => setShowSettingsModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-colors"
          title="Fund Settings"
        >
          <Settings size={16} />
          Settings
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 mb-6">
        <KpiCard label="Fund Size" value={fmt$(settings.targetFundSize)} icon={<DollarSign size={20} className="text-blue-500" />} bg="bg-blue-50" />
        <KpiCard label="Capital Raised" value={fmt$(capitalCommitted)} sub={capitalCommitted === 0 ? 'No LPs committed yet' : undefined} icon={<TrendingUp size={20} className="text-emerald-500" />} bg="bg-emerald-50" />
        <KpiCard label="Capital Deployed" value={fmt$(capitalDeployed)} sub={capitalDeployed === 0 ? '—' : `${fmtPct(capitalCommitted > 0 ? (capitalDeployed / capitalCommitted) * 100 : 0)} of raised`} icon={<BarChart2 size={20} className="text-violet-500" />} bg="bg-violet-50" />
        <KpiCard
          label="Net IRR"
          value={netIrr !== null ? fmtPct(netIrr) : '—'}
          sub={netIrr === null ? 'No cash flows yet' : undefined}
          icon={<ArrowUp size={20} className="text-purple-500" />}
          bg="bg-purple-50"
          valueColor={netIrr !== null && netIrr > 0 ? 'text-green-700' : 'text-gray-800'}
        />
        <KpiCard label="TVPI" value={totalCapitalCalled > 0 ? fmtX(tvpi) : '—'} sub={totalCapitalCalled > 0 ? fmt$(totalValue) : undefined} icon={<PieChart size={20} className="text-indigo-500" />} bg="bg-indigo-50" />
        <KpiCard label="DPI" value={totalCapitalCalled > 0 ? fmtX(dpi) : '—'} sub={totalCapitalCalled > 0 ? `${fmt$(totalDistributions)} distributed` : undefined} icon={<Activity size={20} className="text-orange-500" />} bg="bg-orange-50" />
        <KpiCard label="Total Value" value={fmt$(totalValue)} sub={unrealizedValue > 0 ? `${fmt$(unrealizedValue)} unrealized` : 'No deals closed yet'} icon={<DollarSign size={20} className="text-teal-500" />} bg="bg-teal-50" />
      </div>

      {/* Deployment Progress */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
        <h3 className="text-base font-semibold text-gray-800 mb-4">Fund Deployment Progress</h3>
        <div className="flex justify-between text-sm text-gray-600 mb-2">
          <span>Capital Deployed: <strong>{fmt$(capitalDeployed)}</strong> / {fmt$(capitalCommitted > 0 ? capitalCommitted : settings.targetFundSize)} {capitalCommitted > 0 ? 'raised' : 'target'}</span>
          <span>Remaining: <strong>{fmt$(Math.max((capitalCommitted > 0 ? capitalCommitted : settings.targetFundSize) - capitalDeployed, 0))}</strong></span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-3 mb-2">
          <div
            className="bg-blue-500 h-3 rounded-full transition-all duration-500"
            style={{ width: `${Math.max(deploymentPct, capitalDeployed > 0 ? 2 : 0)}%` }}
          />
        </div>
        <p className="text-xs text-gray-500">
          Investment period: {yearsRemaining > 0 ? `${yearsRemaining.toFixed(1)} years remaining` : 'Investment period ended'} · Target fund size: {fmt$(settings.targetFundSize)}
        </p>
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">

        {/* IRR Trend — illustrative quarterly data from vintage year */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <div className="flex items-start justify-between mb-1">
            <h3 className="text-base font-semibold text-gray-800">Net IRR Trend</h3>
            <span className="text-xs text-amber-600 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full">Illustrative</span>
          </div>
          <p className="text-xs text-gray-400 mb-4">Quarterly from vintage year · shape reflects typical real estate fund J-curve</p>
          {irrTrend.length === 0 ? (
            <EmptyState message="No quarters yet — set a vintage year in fund settings." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={irrTrend} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, 'IRR']} />
                <Bar dataKey="irr" radius={[4, 4, 0, 0]} fill="#6366f1"
                  label={false}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Cash Flow chart — from Section D (zeros until item 6) */}
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-base font-semibold text-gray-800 mb-1">Quarterly Cash Flows</h3>
          <p className="text-xs text-gray-400 mb-4">Capital calls vs. distributions from deal Section D entries</p>
          {cashFlowChart.length === 0 ? (
            <EmptyState message="No capital calls or distributions recorded yet. Complete Deal Execution Section D to populate." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <ComposedChart data={cashFlowChart} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={v => fmt$(v)} />
                <Tooltip formatter={(v: number) => [fmt$(v)]} />
                <Legend />
                <Bar dataKey="capitalCalls" name="Capital Calls" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="distributions" name="Distributions" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Line type="monotone" dataKey="netCashFlow" name="Net" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Strategy Breakdown */}
      <div className="bg-white rounded-xl p-6 shadow-sm mb-6">
        <h3 className="text-base font-semibold text-gray-800 mb-4">Strategy Breakdown</h3>
        {executions.length === 0 ? (
          <EmptyState message="No deal execution records yet. Advance a deal through Data Room Received to create one." />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {strategies.map(s => (
              <div key={s.name} className="border border-gray-200 rounded-xl p-4">
                <h4 className="text-sm font-semibold text-gray-800 mb-3">{s.name}</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-500">Deals</span>
                    <span className="font-medium text-gray-800">{s.count}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Deployed</span>
                    <span className="font-medium text-gray-800">{s.deployed > 0 ? fmt$(s.deployed) : '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">Allocation %</span>
                    <span className="font-medium text-gray-800">{s.allocationPct > 0 ? fmtPct(s.allocationPct) : '—'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Portfolio Table */}
      <div className="bg-white rounded-xl shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
          <h3 className="text-base font-semibold text-gray-800">Portfolio</h3>
          {executions.length > 0 && (
            <p className="text-xs text-gray-400 mt-0.5">Click a row to open the deal execution page</p>
          )}
        </div>
        {executions.length === 0 ? (
          <div className="p-6">
            <EmptyState message="No deals in execution. Advance a deal to Data Room Received on the Underwriting page to see it here." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  {['Property', 'Units', 'Market', 'Status', 'Aequitas Equity', 'Close Date', 'Current Value', 'IRR', 'Multiple'].map(h => (
                    <th key={h} className="text-left py-3 px-4 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {executions.map(ex => {
                  const status = getPipelineStatus(ex.dealId) as PipelineStatus;
                  const statusStyle = PIPELINE_STATUS_STYLES[status];
                  // Parse "City, ST" from address: take everything after the first comma
                  const addr = ex.propertyAddress ?? ex.location ?? '';
                  const commaIdx = addr.indexOf(',');
                  const market = commaIdx !== -1 ? addr.slice(commaIdx + 1).trim() : addr || '—';
                  // Close date: prefer milestone closedTarget, fall back to LOI targetCloseDate
                  const closeDateRaw = ex.milestones?.closedTarget ?? ex.loiData?.targetCloseDate;
                  const closeDate = closeDateRaw
                    ? new Date(closeDateRaw).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                    : '—';

                  return (
                    <tr
                      key={ex.dealId}
                      onClick={() => navigate(`/deal-execution/${ex.dealId}`)}
                      className="border-b border-gray-100 hover:bg-blue-50 cursor-pointer transition-colors"
                    >
                      <td className="py-3 px-4">
                        <div className="font-medium text-gray-900 max-w-[160px] truncate">{ex.dealName}</div>
                        {ex.propertyAddress && (
                          <div className="text-xs text-gray-400 max-w-[160px] truncate">{ex.propertyAddress}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-gray-600 tabular-nums">{ex.totalUnits ?? '—'}</td>
                      <td className="py-3 px-4 text-gray-600 max-w-[120px] truncate">{market}</td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold border ${statusStyle}`}>
                          {status}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-gray-700 tabular-nums">
                        {ex.proForma?.aequitasEquity ? fmt$(ex.proForma.aequitasEquity) : '—'}
                      </td>
                      <td className="py-3 px-4 text-gray-600 whitespace-nowrap">{closeDate}</td>
                      <td className="py-3 px-4 text-gray-700 tabular-nums">
                        {ex.proForma?.projectedExitValue ? fmt$(ex.proForma.projectedExitValue) : '—'}
                      </td>
                      <td className="py-3 px-4 tabular-nums">
                        {ex.proForma?.projectedLpNetIrr != null ? (
                          <span className={ex.proForma.projectedLpNetIrr >= 0 ? 'text-green-700 font-semibold' : 'text-red-600 font-semibold'}>
                            {fmtPct(ex.proForma.projectedLpNetIrr)}
                          </span>
                        ) : '—'}
                      </td>
                      <td className="py-3 px-4 text-gray-700 tabular-nums">
                        {ex.proForma?.projectedEquityMultiple ? fmtX(ex.proForma.projectedEquityMultiple) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showSettingsModal && (
        <FundSettingsModal
          settings={settings}
          onSave={handleSaveSettings}
          onClose={() => setShowSettingsModal(false)}
        />
      )}
    </div>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
  bg: string;
  valueColor?: string;
}

const KpiCard = ({ label, value, sub, icon, bg, valueColor = 'text-gray-800' }: KpiCardProps) => (
  <div className="bg-white rounded-xl p-4 shadow-sm flex flex-col gap-2">
    <div className="flex items-center justify-between">
      <span className="text-xs text-gray-500">{label}</span>
      <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center`}>{icon}</div>
    </div>
    <span className={`text-xl font-bold ${valueColor}`}>{value}</span>
    {sub && <span className="text-xs text-gray-400 leading-tight">{sub}</span>}
  </div>
);

const EmptyState = ({ message }: { message: string }) => (
  <div className="flex items-center justify-center py-12 text-center">
    <p className="text-sm text-gray-400 max-w-xs">{message}</p>
  </div>
);

export default FundReturns;
