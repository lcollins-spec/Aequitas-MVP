import { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Trash2, Upload, ExternalLink, ChevronDown, X } from 'lucide-react';
import {
  getDealExecution, patchDealExecution, loadExecutionFromBackend,
  type CapexItem, type CapitalCall, type Distribution,
} from '../types/dealExecution';
import { getPipelineStatus, syncPipelineStatusesFromBackend } from '../types/deal';

// ─── Formatters ───────────────────────────────────────────────────────────────
const fmt$ = (v: number | null | undefined): string => {
  if (v == null || isNaN(v)) return '—';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return `${sign}$${(abs / 1_000).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};
const fmtPct = (v: number | null | undefined): string =>
  v == null || isNaN(v) ? '—' : `${v.toFixed(1)}%`;
const parseNum = (s: string): number => parseFloat(s.replace(/,/g, '')) || 0;
const fmtDate = (iso?: string): string => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

function currentQuarterLabel(): string {
  const d = new Date();
  const q = Math.floor(d.getMonth() / 3) + 1;
  return `${d.getFullYear()}-Q${q}`;
}

function generateQuarters(n = 10): string[] {
  const out: string[] = [];
  let y = new Date().getFullYear();
  let q = Math.floor(new Date().getMonth() / 3) + 1;
  for (let i = 0; i < n; i++) {
    out.push(`${y}-Q${q}`);
    q--;
    if (q === 0) { q = 4; y--; }
  }
  return out;
}

// ─── Variance helpers ─────────────────────────────────────────────────────────
function variancePct(actual: number | null, underwritten: number | null): number | null {
  if (actual == null || underwritten == null || underwritten === 0) return null;
  return ((actual - underwritten) / Math.abs(underwritten)) * 100;
}
function varClass(pct: number | null): string {
  if (pct == null) return 'text-gray-400';
  if (pct >= -5) return 'text-green-600';
  if (pct >= -15) return 'text-amber-500';
  return 'text-red-500';
}
type StatusColor = 'green' | 'yellow' | 'red' | 'none';
function noiStatus(actual: number | null, underwritten: number | null): StatusColor {
  const pct = variancePct(actual, underwritten);
  if (pct == null) return 'none';
  if (pct >= -5) return 'green';
  if (pct >= -15) return 'yellow';
  return 'red';
}

// ─── Operating Performance API helpers (unchanged) ───────────────────────────
const OP_PERF_LS_KEY = 'aequitas_op_performance';

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

// ─── Asset Management API types ───────────────────────────────────────────────
interface AssetDeal {
  deal_id: number;
  deal_name: string;
  address: string;
  status: string;
  latest_quarter: string | null;
  latest_noi: number | null;
  latest_occupancy_pct: number | null;
  underwriting_noi: number | null;
  underwriting_occupancy_pct: number | null;
}

interface AssetReport {
  id: number;
  deal_id: number;
  quarter: string;
  gross_potential_rent: number | null;
  vacancy_loss: number | null;
  effective_gross_income: number | null;
  operating_expenses: number | null;
  noi: number | null;
  debt_service: number | null;
  occupancy_pct: number | null;
  notes: string | null;
  pdf_filename: string | null;
  pdf_drive_url: string | null;
  created_at: string;
}

interface UnderwritingAssumptions {
  gpr: number | null;
  vacancy_loss: number | null;
  egi: number | null;
  operating_expenses: number | null;
  noi: number | null;
  debt_service: number | null;
  occupancy_pct: number | null;
}

interface BackendDeal {
  id: number;
  dealName: string;
  location?: string;
  propertyAddress?: string;
  status: string;
}

// ─── Small shared components ──────────────────────────────────────────────────
const SectionHeader = ({ label, sub }: { label: string; sub?: string }) => (
  <div className="flex items-baseline gap-3 mb-5">
    <h2 className="text-base font-semibold text-gray-900">{label}</h2>
    {sub && <span className="text-xs text-gray-400">{sub}</span>}
  </div>
);

// ─── NOI Trend Chart (SVG) ────────────────────────────────────────────────────
function NoiChart({ reports }: { reports: AssetReport[] }) {
  const sorted = [...reports]
    .filter(r => r.noi != null)
    .sort((a, b) => a.quarter.localeCompare(b.quarter));

  if (sorted.length === 0) {
    return <p className="text-xs text-gray-400 py-4">No NOI data to chart yet.</p>;
  }

  const W = 500;
  const H = 130;
  const PAD_L = 50;
  const PAD_R = 12;
  const PAD_T = 20;
  const PAD_B = 28;
  const maxNoi = Math.max(...sorted.map(r => r.noi!), 1);
  const barW = Math.max(8, Math.min(40, (W - PAD_L - PAD_R) / sorted.length - 6));
  const barSpacing = (W - PAD_L - PAD_R) / sorted.length;
  const chartH = H - PAD_T - PAD_B;

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="overflow-visible">
      {/* Y axis label */}
      <text x={0} y={PAD_T + chartH / 2} fontSize={9} fill="#9ca3af"
        transform={`rotate(-90,${6},${PAD_T + chartH / 2})`} textAnchor="middle">NOI</text>
      {/* Bars */}
      {sorted.map((r, i) => {
        const barH = chartH > 0 ? (r.noi! / maxNoi) * chartH : 0;
        const x = PAD_L + i * barSpacing + (barSpacing - barW) / 2;
        const y = PAD_T + chartH - barH;
        return (
          <g key={r.quarter}>
            <rect x={x} y={y} width={barW} height={barH} rx={3} fill="#3b82f6" opacity={0.85} />
            <text x={x + barW / 2} y={PAD_T + chartH + 12} textAnchor="middle" fontSize={8.5} fill="#9ca3af">
              {r.quarter}
            </text>
            {barH > 16 && (
              <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize={8} fill="#374151">
                {fmt$(r.noi)}
              </text>
            )}
          </g>
        );
      })}
      {/* Baseline */}
      <line x1={PAD_L} y1={PAD_T + chartH} x2={W - PAD_R} y2={PAD_T + chartH}
        stroke="#e5e7eb" strokeWidth={1} />
    </svg>
  );
}

// ─── Report Form Modal ────────────────────────────────────────────────────────
interface ReportFormProps {
  dealId: number;
  dealName: string;
  initialReport: AssetReport | null;
  onSaved: (report: AssetReport) => void;
  onClose: () => void;
}

function ReportFormModal({ dealId, dealName, initialReport, onSaved, onClose }: ReportFormProps) {
  const quarters = useMemo(generateQuarters, []);
  const [quarter, setQuarter] = useState(initialReport?.quarter ?? currentQuarterLabel());
  const [gpr, setGpr] = useState(String(initialReport?.gross_potential_rent ?? ''));
  const [vacLoss, setVacLoss] = useState(String(initialReport?.vacancy_loss ?? ''));
  const [egi, setEgi] = useState(String(initialReport?.effective_gross_income ?? ''));
  const [opex, setOpex] = useState(String(initialReport?.operating_expenses ?? ''));
  const [noi, setNoi] = useState(String(initialReport?.noi ?? ''));
  const [ds, setDs] = useState(String(initialReport?.debt_service ?? ''));
  const [occ, setOcc] = useState(String(initialReport?.occupancy_pct ?? ''));
  const [notes, setNotes] = useState(initialReport?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [uploadingPdf, setUploadingPdf] = useState(false);
  const [pdfName, setPdfName] = useState(initialReport?.pdf_filename ?? '');
  const [pdfUrl, setPdfUrl] = useState(initialReport?.pdf_drive_url ?? '');
  const fileRef = useRef<HTMLInputElement>(null);

  const inputCls = "w-full px-2.5 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500";
  const labelCls = "block text-xs font-medium text-gray-500 mb-1";

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/asset-management/deals/${dealId}/reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quarter,
          gross_potential_rent: gpr ? parseNum(gpr) : null,
          vacancy_loss: vacLoss ? parseNum(vacLoss) : null,
          effective_gross_income: egi ? parseNum(egi) : null,
          operating_expenses: opex ? parseNum(opex) : null,
          noi: noi ? parseNum(noi) : null,
          debt_service: ds ? parseNum(ds) : null,
          occupancy_pct: occ ? parseNum(occ) : null,
          notes,
        }),
      });
      const j = await res.json();
      if (j.success) {
        onSaved(j.report);
        onClose();
      } else {
        alert(`Save failed: ${j.error}`);
      }
    } catch (e) {
      alert(`Save failed: ${e}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePdfUpload = async (file: File) => {
    setUploadingPdf(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(
        `/api/asset-management/deals/${dealId}/reports/${encodeURIComponent(quarter)}/upload-pdf`,
        { method: 'POST', body: form },
      );
      const j = await res.json();
      if (j.success) {
        setPdfName(j.filename);
        setPdfUrl(j.drive_url);
      } else {
        alert(`PDF upload failed: ${j.error}`);
      }
    } catch (e) {
      alert(`PDF upload failed: ${e}`);
    } finally {
      setUploadingPdf(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-900">
            {initialReport ? 'Edit Report' : 'Add Report'} — {dealName}
          </h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <X size={16} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-3">
          {/* Quarter */}
          <div>
            <label className={labelCls}>Quarter</label>
            <select value={quarter} onChange={e => setQuarter(e.target.value)} className={inputCls}>
              {quarters.map(q => <option key={q}>{q}</option>)}
            </select>
          </div>

          {/* Financial fields — 2 columns */}
          <div className="grid grid-cols-2 gap-3">
            {([
              ['Gross Potential Rent ($)', gpr, setGpr],
              ['Vacancy Loss ($)', vacLoss, setVacLoss],
              ['Effective Gross Income ($)', egi, setEgi],
              ['Operating Expenses ($)', opex, setOpex],
              ['NOI ($)', noi, setNoi],
              ['Debt Service ($)', ds, setDs],
            ] as [string, string, (v: string) => void][]).map(([label, val, setter]) => (
              <div key={label}>
                <label className={labelCls}>{label}</label>
                <input
                  type="text"
                  value={val}
                  onChange={e => setter(e.target.value)}
                  placeholder="e.g. 250000"
                  className={inputCls}
                />
              </div>
            ))}

            <div>
              <label className={labelCls}>Occupancy %</label>
              <input
                type="text"
                value={occ}
                onChange={e => setOcc(e.target.value)}
                placeholder="e.g. 95"
                className={inputCls}
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className={labelCls}>Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Optional notes for this quarter..."
              className={`${inputCls} resize-none`}
            />
          </div>

          {/* PDF upload */}
          <div className="border border-dashed border-gray-200 rounded-lg p-3">
            <p className="text-xs font-medium text-gray-500 mb-2">Quarterly Report PDF</p>
            {pdfName ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-700 truncate flex-1">{pdfName}</span>
                {pdfUrl && (
                  <a href={pdfUrl} target="_blank" rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-primary-800 hover:text-primary-700">
                    <ExternalLink size={12} /> View
                  </a>
                )}
              </div>
            ) : null}
            <input ref={fileRef} type="file" accept=".pdf" className="hidden"
              onChange={e => e.target.files?.[0] && handlePdfUpload(e.target.files[0])} />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploadingPdf}
              className="mt-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-primary-800 hover:bg-primary-50 border border-gray-200 rounded-lg transition-colors disabled:opacity-50"
            >
              <Upload size={12} />
              {uploadingPdf ? 'Uploading…' : pdfName ? 'Replace PDF' : 'Upload PDF'}
            </button>
          </div>
        </div>

        <div className="flex gap-2 justify-end px-6 py-4 border-t border-gray-100">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-50 border border-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-white bg-primary-800 hover:bg-primary-700 rounded-lg transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Report'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Comparison Table ─────────────────────────────────────────────────────────
interface CompTableProps {
  report: AssetReport | null;
  uw: UnderwritingAssumptions | null;
}
function ComparisonTable({ report, uw }: CompTableProps) {
  const rows: { label: string; uw: number | null; actual: number | null; isFmt$: boolean }[] = [
    { label: 'Gross Potential Rent', uw: uw?.gpr ?? null, actual: report?.gross_potential_rent ?? null, isFmt$: true },
    { label: 'Vacancy Loss', uw: uw?.vacancy_loss ?? null, actual: report?.vacancy_loss ?? null, isFmt$: true },
    { label: 'Effective Gross Income', uw: uw?.egi ?? null, actual: report?.effective_gross_income ?? null, isFmt$: true },
    { label: 'Operating Expenses', uw: uw?.operating_expenses ?? null, actual: report?.operating_expenses ?? null, isFmt$: true },
    { label: 'NOI', uw: uw?.noi ?? null, actual: report?.noi ?? null, isFmt$: true },
    { label: 'Debt Service', uw: uw?.debt_service ?? null, actual: report?.debt_service ?? null, isFmt$: true },
    {
      label: 'DSCR', isFmt$: false,
      uw: (uw?.noi && uw?.debt_service && uw.debt_service !== 0) ? uw.noi / uw.debt_service : null,
      actual: (report?.noi && report?.debt_service && report.debt_service !== 0) ? report.noi / report.debt_service : null,
    },
    { label: 'Occupancy %', uw: uw?.occupancy_pct ?? null, actual: report?.occupancy_pct ?? null, isFmt$: false },
  ];

  const thCls = "py-2.5 text-xs font-semibold text-gray-400 uppercase tracking-wide text-right first:text-left";
  const tdCls = "py-2.5 text-sm text-gray-700 text-right first:text-left";

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-100">
          <th className={thCls} style={{ textAlign: 'left' }}>Metric</th>
          <th className={thCls}>Underwritten</th>
          <th className={thCls}>Actual</th>
          <th className={thCls}>Variance</th>
          <th className={thCls}>Var %</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => {
          const diff = (row.actual != null && row.uw != null) ? row.actual - row.uw : null;
          const pct = variancePct(row.actual, row.uw);
          const cls = varClass(pct);
          const fmtVal = (v: number | null) =>
            v == null ? '—' : row.isFmt$ ? fmt$(v) : row.label === 'Occupancy %' ? fmtPct(v) : v.toFixed(2);
          return (
            <tr key={row.label} className="border-b border-gray-50">
              <td className={tdCls} style={{ textAlign: 'left' }}>{row.label}</td>
              <td className={`${tdCls} tabular-nums`}>{fmtVal(row.uw)}</td>
              <td className={`${tdCls} tabular-nums`}>{fmtVal(row.actual)}</td>
              <td className={`${tdCls} tabular-nums ${diff != null ? (diff >= 0 ? 'text-green-600' : 'text-red-500') : 'text-gray-400'}`}>
                {diff == null ? '—' : (diff >= 0 ? '+' : '') + (row.isFmt$ ? fmt$(diff) : row.label === 'Occupancy %' ? fmtPct(diff) : diff.toFixed(2))}
              </td>
              <td className={`${tdCls} tabular-nums font-medium ${cls}`}>
                {pct == null ? '—' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const AssetManagement = () => {
  // Portfolio dashboard
  const [amDeals, setAmDeals] = useState<AssetDeal[]>([]);
  const [loadingAm, setLoadingAm] = useState(true);

  // All deals (for capital calls / distributions / capex / op-perf)
  const [allDeals, setAllDeals] = useState<BackendDeal[]>([]);
  const [loadingDeals, setLoadingDeals] = useState(true);

  // Selected deal
  const [selectedDealId, setSelectedDealId] = useState<number | null>(null);

  // Reports for selected deal
  const [reports, setReports] = useState<AssetReport[]>([]);
  const [underwriting, setUnderwriting] = useState<UnderwritingAssumptions | null>(null);
  const [loadingReports, setLoadingReports] = useState(false);

  // Selected quarter for comparison table
  const [selectedQuarter, setSelectedQuarter] = useState<string>(currentQuarterLabel());

  // Add/edit modal
  const [showModal, setShowModal] = useState(false);
  const [editingReport, setEditingReport] = useState<AssetReport | null>(null);

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

  // ── Fetch asset management deals (for portfolio cards)
  useEffect(() => {
    const fetchAmDeals = async () => {
      try {
        const res = await fetch('/api/asset-management/deals');
        if (res.ok) {
          const j = await res.json();
          setAmDeals(j.deals ?? []);
        }
      } catch { /* ignore */ } finally {
        setLoadingAm(false);
      }
    };
    fetchAmDeals();
  }, []);

  // ── Fetch all deals for the sidebar + capital calls/distributions/capex
  useEffect(() => {
    const fetchDeals = async () => {
      try {
        const res = await fetch('/api/v1/deals');
        if (res.ok) {
          const json = await res.json();
          const all: BackendDeal[] = json.deals ?? [];
          const ids = all.map(d => d.id).filter((id): id is number => id != null);
          await syncPipelineStatusesFromBackend(ids);
          const closed = all.filter(d => d.id != null && getPipelineStatus(d.id) === 'Closed');
          setAllDeals(closed);
        }
      } catch { /* ignore */ } finally {
        setLoadingDeals(false);
      }
    };
    fetchDeals();
  }, []);

  // ── Merge deal lists so any deal visible in portfolio OR sidebar shows in detail
  const visibleDeals: BackendDeal[] = useMemo(() => {
    const map = new Map<number, BackendDeal>();
    allDeals.forEach(d => d.id != null && map.set(d.id, d));
    amDeals.forEach(ad => {
      if (!map.has(ad.deal_id)) {
        map.set(ad.deal_id, {
          id: ad.deal_id,
          dealName: ad.deal_name,
          location: ad.address,
          propertyAddress: ad.address,
          status: ad.status,
        });
      }
    });
    return Array.from(map.values());
  }, [allDeals, amDeals]);

  // ── Fetch reports when a deal is selected
  useEffect(() => {
    if (selectedDealId == null) return;

    // Reset forms
    setNewCCDate(''); setNewCCAmtCalled(''); setNewCCAmtReceived('');
    setNewCCPurpose(''); setNewCCStatus('Pending');
    setNewDistDate(''); setNewDistAmt(''); setNewDistType('Operating');
    setNewCapexDesc(''); setNewCapexAmt('');
    setNewOpYear(''); setNewOpProjNoi(''); setNewOpActualNoi('');
    setReports([]);
    setUnderwriting(null);

    // Fetch quarterly reports
    setLoadingReports(true);
    fetch(`/api/asset-management/deals/${selectedDealId}/reports`)
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          setReports(j.reports ?? []);
          setUnderwriting(j.underwriting ?? null);
          // Pre-select the latest quarter if available
          if (j.reports?.length > 0) setSelectedQuarter(j.reports[0].quarter);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingReports(false));

    // Load execution data (capital calls, distributions, capex)
    loadExecutionFromBackend(selectedDealId).then(backendRec => {
      if (backendRec) {
        setCapitalCalls(backendRec.capitalCalls ?? []);
        setDistributions(backendRec.distributions ?? []);
        setCapexItems(backendRec.capexItems ?? []);
      } else {
        const record = getDealExecution(selectedDealId);
        setCapitalCalls(record?.capitalCalls ?? []);
        setDistributions(record?.distributions ?? []);
        setCapexItems(record?.capexItems ?? []);
      }
    });

    // Load op performance
    fetchOpPerf(selectedDealId).then(async (rows) => {
      if (rows.length > 0) {
        setOpPerfRows(rows);
      } else {
        try {
          const raw = localStorage.getItem(OP_PERF_LS_KEY);
          if (raw) {
            const map = JSON.parse(raw) as Record<string, OpPerfRow[]>;
            const lsRows = map[String(selectedDealId)] ?? [];
            if (lsRows.length > 0) {
              await bulkMigrateOpPerf(selectedDealId, lsRows);
              setOpPerfRows(lsRows);
              delete map[String(selectedDealId)];
              if (Object.keys(map).length === 0) localStorage.removeItem(OP_PERF_LS_KEY);
              else localStorage.setItem(OP_PERF_LS_KEY, JSON.stringify(map));
            } else setOpPerfRows([]);
          } else setOpPerfRows([]);
        } catch { setOpPerfRows([]); }
      }
    });
  }, [selectedDealId]);

  const selectedDeal = useMemo(
    () => visibleDeals.find(d => d.id === selectedDealId) ?? null,
    [visibleDeals, selectedDealId],
  );

  const activeReport = useMemo(
    () => reports.find(r => r.quarter === selectedQuarter) ?? null,
    [reports, selectedQuarter],
  );

  // ─── Capital Calls operations ─────────────────────────────────────────────
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

  // ─── Distributions operations ─────────────────────────────────────────────
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

  // ─── CapEx operations ─────────────────────────────────────────────────────
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

  // ─── Operating Performance operations ─────────────────────────────────────
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

  // ─── Input helpers ────────────────────────────────────────────────────────
  const inputCls = "w-full px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500";

  // ─── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Left sidebar: deal list ───────────────────────────────────────── */}
      <aside className="w-64 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col overflow-hidden">
        <div className="px-4 py-5 border-b border-gray-100">
          <h1 className="text-sm font-semibold text-brandPurple-700">Asset Management</h1>
          <p className="text-xs text-gray-400 mt-0.5">Active &amp; closed deals</p>
        </div>
        <div className="flex-1 overflow-y-auto py-2">
          {loadingDeals && loadingAm ? (
            <p className="px-4 py-6 text-xs text-gray-400">Loading…</p>
          ) : visibleDeals.length === 0 ? (
            <div className="px-4 py-6">
              <p className="text-xs text-gray-400 leading-relaxed">
                No deals found. Deals appear here when their pipeline status is Closed, or when their
                deal status is "active" or "closed".
              </p>
            </div>
          ) : (
            visibleDeals.map(deal => (
              <button
                key={deal.id}
                onClick={() => setSelectedDealId(deal.id)}
                className={`w-full text-left px-4 py-3 transition-colors border-l-2 ${
                  selectedDealId === deal.id
                    ? 'bg-gray-50 border-l-blue-500'
                    : 'border-l-transparent hover:bg-gray-50'
                }`}
              >
                <p className={`text-sm font-medium truncate ${selectedDealId === deal.id ? 'text-gray-700' : 'text-gray-800'}`}>
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

      {/* ── Main content area ─────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-gray-50">

        {/* ═══ PORTFOLIO DASHBOARD (top) ════════════════════════════════════ */}
        {!loadingAm && amDeals.length > 0 && (
          <div className="border-b border-gray-200 bg-white px-6 py-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
              Portfolio Overview
            </h2>
            <div className="grid grid-cols-2 xl:grid-cols-3 gap-3">
              {amDeals.map(deal => {
                const st = noiStatus(deal.latest_noi, deal.underwriting_noi);
                const pct = variancePct(deal.latest_noi, deal.underwriting_noi);
                const badge: Record<StatusColor, string> = {
                  green: 'bg-green-100 text-green-700',
                  yellow: 'bg-amber-100 text-amber-700',
                  red: 'bg-red-100 text-red-600',
                  none: 'bg-gray-100 text-gray-500',
                };
                return (
                  <button
                    key={deal.deal_id}
                    onClick={() => setSelectedDealId(deal.deal_id)}
                    className={`text-left p-4 rounded-xl border transition-all hover:shadow-md ${
                      selectedDealId === deal.deal_id
                        ? 'border-primary-300 bg-gray-50/60'
                        : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    <p className="text-sm font-semibold text-gray-900 truncate">{deal.deal_name}</p>
                    {deal.address && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{deal.address}</p>
                    )}
                    {deal.latest_quarter && (
                      <p className="text-xs text-gray-400 mt-2">{deal.latest_quarter}</p>
                    )}
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      {/* NOI badge */}
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${badge[st]}`}>
                        NOI: {fmt$(deal.latest_noi)}
                        {pct != null && (
                          <span className="opacity-80">
                            ({pct >= 0 ? '+' : ''}{pct.toFixed(0)}%)
                          </span>
                        )}
                      </span>
                      {/* Occupancy */}
                      {deal.latest_occupancy_pct != null && (
                        <span className="text-xs text-gray-600 font-medium">
                          {fmtPct(deal.latest_occupancy_pct)} occ.
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══ DEAL DETAIL VIEW ════════════════════════════════════════════ */}
        {selectedDeal == null ? (
          <div className="flex items-center justify-center h-64">
            <p className="text-sm text-gray-400">Select a deal to view asset management details.</p>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">

            {/* Deal header */}
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-semibold text-brandPurple-700">{selectedDeal.dealName}</h1>
                {selectedDeal.location && (
                  <p className="text-sm text-gray-500 mt-0.5">{selectedDeal.location}</p>
                )}
              </div>
              <button
                onClick={() => { setEditingReport(activeReport); setShowModal(true); }}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-primary-800 hover:text-primary-700 hover:bg-primary-50 border border-gray-200 rounded-lg transition-colors"
              >
                <Plus size={14} />
                {activeReport ? 'Edit Report' : 'Add Report'}
              </button>
            </div>

            {/* ── 1. Quarterly Comparison ──────────────────────────────────── */}
            <div className="bg-white rounded-xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <SectionHeader label="Quarterly Performance vs Underwriting" />
                {/* Quarter selector */}
                <div className="relative flex-shrink-0 ml-4">
                  <select
                    value={selectedQuarter}
                    onChange={e => setSelectedQuarter(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-1.5 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500 cursor-pointer"
                  >
                    {generateQuarters().map(q => (
                      <option key={q} value={q}>{q}</option>
                    ))}
                    {/* Include any quarters that have reports but aren't in the default list */}
                    {reports
                      .filter(r => !generateQuarters().includes(r.quarter))
                      .map(r => <option key={r.quarter} value={r.quarter}>{r.quarter}</option>)}
                  </select>
                  <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {loadingReports ? (
                <p className="text-sm text-gray-400 py-4">Loading…</p>
              ) : (
                <ComparisonTable report={activeReport} uw={underwriting} />
              )}

              {activeReport?.notes && (
                <p className="mt-3 text-xs text-gray-500 italic">{activeReport.notes}</p>
              )}

              {activeReport?.pdf_filename && (
                <div className="mt-3 flex items-center gap-2">
                  <span className="text-xs text-gray-500">{activeReport.pdf_filename}</span>
                  {activeReport.pdf_drive_url && (
                    <a href={activeReport.pdf_drive_url} target="_blank" rel="noopener noreferrer"
                      className="flex items-center gap-1 text-xs text-primary-800 hover:text-primary-700">
                      <ExternalLink size={11} /> View PDF
                    </a>
                  )}
                </div>
              )}
            </div>

            {/* ── 2. NOI Trend Chart ────────────────────────────────────────── */}
            {reports.length > 0 && (
              <div className="bg-white rounded-xl p-6 shadow-sm">
                <SectionHeader label="NOI Trend" sub="Quarterly actuals" />
                <NoiChart reports={reports} />
              </div>
            )}

            {/* ── 3. Capital Calls ──────────────────────────────────────────── */}
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
                          }`}>{cc.status}</span>
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
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 items-end">
                {[
                  ['Date', 'date', newCCDate, setNewCCDate, '', 'date'],
                  ['Called ($)', 'text', newCCAmtCalled, setNewCCAmtCalled, 'e.g. 500000', undefined],
                  ['Received ($)', 'text', newCCAmtReceived, setNewCCAmtReceived, 'e.g. 500000', undefined],
                  ['Purpose', 'text', newCCPurpose, setNewCCPurpose, 'e.g. Acquisition', undefined],
                ].map(([label, type, value, setter, placeholder]) => (
                  <div key={String(label)}>
                    <label className="block text-xs font-medium text-gray-500 mb-1">{String(label)}</label>
                    <input type={String(type)} value={String(value)}
                      onChange={e => (setter as (v: string) => void)(e.target.value)}
                      placeholder={String(placeholder)} className={inputCls} />
                  </div>
                ))}
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                  <select value={newCCStatus} onChange={e => setNewCCStatus(e.target.value as CapitalCall['status'])} className={inputCls}>
                    <option>Pending</option><option>Funded</option><option>Partial</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button onClick={addCapitalCall} className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-sm font-medium text-primary-800 hover:text-primary-700 hover:bg-primary-50 border border-gray-200 rounded-lg transition-colors">
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>
            </div>

            {/* ── 4. Distributions ─────────────────────────────────────────── */}
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
                            dist.type === 'Operating'         ? 'bg-gray-100 text-gray-700' :
                            dist.type === 'Return of Capital' ? 'bg-purple-100 text-purple-700' :
                                                                'bg-teal-100 text-teal-700'
                          }`}>{dist.type}</span>
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
              <div className="flex gap-2 items-end flex-wrap">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Date</label>
                  <input type="date" value={newDistDate} onChange={e => setNewDistDate(e.target.value)} className={inputCls} />
                </div>
                <div className="w-36">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Amount ($)</label>
                  <input type="text" value={newDistAmt} onChange={e => setNewDistAmt(e.target.value)} placeholder="e.g. 150000" className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1">Type</label>
                  <select value={newDistType} onChange={e => setNewDistType(e.target.value as Distribution['type'])} className="px-2 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500">
                    <option>Operating</option><option>Return of Capital</option><option>Disposition</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button onClick={addDistribution} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary-800 hover:text-primary-700 hover:bg-primary-50 border border-gray-200 rounded-lg transition-colors">
                    <Plus size={14} /> Add
                  </button>
                </div>
              </div>
            </div>

            {/* ── 5. CapEx Budget ───────────────────────────────────────────── */}
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
                  <input type="text" value={newCapexDesc} onChange={e => setNewCapexDesc(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCapexItem()}
                    placeholder="e.g. Roof replacement"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="w-36">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Amount ($)</label>
                  <input type="text" value={newCapexAmt} onChange={e => setNewCapexAmt(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addCapexItem()}
                    placeholder="e.g. 50000"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <button onClick={addCapexItem} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary-800 hover:text-primary-700 hover:bg-primary-50 border border-gray-200 rounded-lg transition-colors">
                  <Plus size={14} /> Add
                </button>
              </div>
            </div>

            {/* ── 6. Operating Performance ──────────────────────────────────── */}
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
              <div className="flex gap-2 items-end flex-wrap">
                <div className="w-24">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Year</label>
                  <input type="text" value={newOpYear} onChange={e => setNewOpYear(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addOpPerfRow()} placeholder="2025"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="w-36">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Projected NOI ($)</label>
                  <input type="text" value={newOpProjNoi} onChange={e => setNewOpProjNoi(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addOpPerfRow()} placeholder="e.g. 200000"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="w-36">
                  <label className="block text-xs font-medium text-gray-500 mb-1">Actual NOI ($)</label>
                  <input type="text" value={newOpActualNoi} onChange={e => setNewOpActualNoi(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addOpPerfRow()} placeholder="e.g. 185000"
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary-500" />
                </div>
                <div className="flex items-end">
                  <button onClick={addOpPerfRow} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-primary-800 hover:text-primary-700 hover:bg-primary-50 border border-gray-200 rounded-lg transition-colors">
                    <Plus size={14} /> Add Row
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {/* ── Report Modal ───────────────────────────────────────────────────── */}
      {showModal && selectedDealId != null && selectedDeal != null && (
        <ReportFormModal
          dealId={selectedDealId}
          dealName={selectedDeal.dealName}
          initialReport={editingReport}
          onSaved={saved => {
            setReports(prev => {
              const idx = prev.findIndex(r => r.quarter === saved.quarter);
              if (idx >= 0) {
                const copy = [...prev];
                copy[idx] = saved;
                return copy;
              }
              return [saved, ...prev];
            });
            setSelectedQuarter(saved.quarter);
            // Refresh portfolio cards
            fetch('/api/asset-management/deals')
              .then(r => r.json())
              .then(j => j.success && setAmDeals(j.deals ?? []))
              .catch(() => {});
          }}
          onClose={() => { setShowModal(false); setEditingReport(null); }}
        />
      )}
    </div>
  );
};

export default AssetManagement;
