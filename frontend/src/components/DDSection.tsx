/**
 * DDSection — full Due Diligence tracking panel for a deal.
 * Tabs: Checklist · Issues & Findings · Q&A Log · Budget · Contacts
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Plus, Trash2, CheckCircle2, ChevronRight, ChevronDown, Filter,
  AlertTriangle, MessageSquare, DollarSign, Users, ClipboardList,
  Calendar, X, Loader2, Upload, ExternalLink,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DDKeyDates {
  term_sheet_executed?: string;
  dd_start_date?: string;
  target_dd_completion?: string;
  site_visit?: string;
  jv_execution_target?: string;
  closing_target?: string;
}

interface DDItem {
  id: number;
  deal_id: number;
  top_section: string;
  section_code: string;
  section_name: string;
  item_number: number;
  description: string;
  responsible: string;
  status: string;
  comments: string;
  analyst_notes: string;
  due_date?: string;
  completed_date?: string;
  drive_url?: string;
  drive_file_id?: string;
  document_id?: string;
}

interface DDIssue {
  id: number;
  deal_id: number;
  status: string;
  date_identified?: string;
  type: string;
  category: string;
  description: string;
  action_plan: string;
  resolved_date?: string;
}

interface DDQuestion {
  id: number;
  deal_id: number;
  resolved: boolean;
  priority: string;
  category: string;
  question: string;
  party_to_respond: string;
  date_identified?: string;
  response: string;
  date_resolved?: string;
}

interface DDBudgetItem {
  id: number;
  deal_id: number;
  service: string;
  vendor: string;
  estimated_cost?: number;
  invoice_number: string;
  due_date?: string;
  comments: string;
  sort_order: number;
}

interface DDContact {
  id: number;
  deal_id: number;
  party_type: string;
  company: string;
  name_title: string;
  email: string;
  phone: string;
  notes: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = ['Open', 'In Progress', 'Complete', 'Waived', 'N/A'];
const RESPONSIBLE_OPTIONS = ['AEQUITAS', 'SPONS', 'CONS', 'COUNSEL'];
const PRIORITY_OPTIONS = ['High', 'Medium', 'Low'];
const ISSUE_STATUS_OPTIONS = ['Open', 'In Progress', 'Resolved', 'Monitoring'];

const STATUS_STYLE: Record<string, string> = {
  'Open':        'bg-gray-100 text-gray-600',
  'In Progress': 'bg-blue-100 text-blue-700',
  'Complete':    'bg-green-100 text-green-700',
  'Waived':      'bg-yellow-100 text-yellow-700',
  'N/A':         'bg-gray-100 text-gray-400',
};

const RESP_STYLE: Record<string, string> = {
  AEQUITAS: 'bg-indigo-50 text-indigo-700',
  SPONS:    'bg-orange-50 text-orange-700',
  CONS:     'bg-purple-50 text-purple-700',
  COUNSEL:  'bg-teal-50  text-teal-700',
};

const PRIORITY_STYLE: Record<string, string> = {
  High:   'bg-red-100 text-red-700',
  Medium: 'bg-yellow-100 text-yellow-700',
  Low:    'bg-gray-100 text-gray-500',
};

const API = (path: string) => `/api/v1${path}`;

// ─── Small helpers ────────────────────────────────────────────────────────────

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
};


const TableHeader = ({ cols }: { cols: string[] }) => (
  <thead>
    <tr className="border-b border-gray-200">
      {cols.map(c => (
        <th key={c} className="px-3 py-2 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">
          {c}
        </th>
      ))}
    </tr>
  </thead>
);

const InlineInput = ({
  value, onChange, onBlur, placeholder = '', type = 'text', className = '',
}: {
  value: string; onChange: (v: string) => void; onBlur?: () => void;
  placeholder?: string; type?: string; className?: string;
}) => (
  <input
    type={type}
    value={value}
    onChange={e => onChange(e.target.value)}
    onBlur={onBlur}
    placeholder={placeholder}
    className={`w-full px-2 py-1 border border-transparent rounded hover:border-gray-200 focus:border-blue-300 focus:outline-none focus:ring-1 focus:ring-blue-300 text-sm text-gray-800 bg-transparent focus:bg-white transition-colors ${className}`}
  />
);

const InlineSelect = ({
  value, onChange, options, className = '',
}: {
  value: string; onChange: (v: string) => void; options: string[]; className?: string;
}) => (
  <select
    value={value}
    onChange={e => onChange(e.target.value)}
    className={`px-2 py-1 rounded text-xs font-semibold border border-transparent hover:border-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-300 bg-transparent cursor-pointer ${className}`}
  >
    {options.map(o => <option key={o} value={o}>{o}</option>)}
  </select>
);

// ─── Key Dates Bar ─────────────────────────────────────────────────────────────

const KeyDatesBar = ({ dealId }: { dealId: number }) => {
  const [dates, setDates] = useState<DDKeyDates>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(API(`/dd/${dealId}/key-dates`))
      .then(r => r.json())
      .then(d => { if (d.key_dates) setDates(d.key_dates); })
      .catch(() => {});
  }, [dealId]);

  const save = useCallback(async (patch: Partial<DDKeyDates>) => {
    setSaving(true);
    const next = { ...dates, ...patch };
    setDates(next);
    await fetch(API(`/dd/${dealId}/key-dates`), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(next),
    }).catch(() => {});
    setSaving(false);
  }, [dealId, dates]);

  const fields: Array<{ key: keyof DDKeyDates; label: string }> = [
    { key: 'term_sheet_executed', label: 'Term Sheet' },
    { key: 'dd_start_date', label: 'DD Start' },
    { key: 'target_dd_completion', label: 'DD Target' },
    { key: 'site_visit', label: 'Site Visit' },
    { key: 'jv_execution_target', label: 'JV Execution' },
    { key: 'closing_target', label: 'Closing Target' },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-xl px-5 py-4 mb-5 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Calendar size={14} className="text-gray-400" />
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Key Dates</span>
        {saving && <Loader2 size={12} className="text-blue-400 animate-spin ml-1" />}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {fields.map(({ key, label }) => (
          <div key={key}>
            <label className="block text-xs text-gray-400 mb-1">{label}</label>
            <input
              type="date"
              value={dates[key] ?? ''}
              onChange={e => save({ [key]: e.target.value || undefined })}
              className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>
        ))}
      </div>
    </div>
  );
};

// ─── Tab 1: DD Checklist ──────────────────────────────────────────────────────

const DDChecklist = ({ dealId }: { dealId: number }) => {
  const [items, setItems] = useState<DDItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const [filterResp, setFilterResp] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const [expandedItems, setExpandedItems] = useState<Set<number>>(new Set());
  // Per-item upload tracking: itemId → uploading|error|null
  const [itemUploading, setItemUploading] = useState<Record<number, boolean>>({});
  const [itemUploadError, setItemUploadError] = useState<Record<number, string | null>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(API(`/dd/${dealId}/items`));
      const d = await r.json();
      setItems(d.items ?? []);
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => { load(); }, [load]);

  const seed = async () => {
    setSeeding(true);
    await fetch(API(`/dd/${dealId}/items/seed`), { method: 'POST' });
    await load();
    setSeeding(false);
  };

  const patch = useCallback(async (itemId: number, patch: Partial<DDItem>) => {
    setItems(prev => prev.map(it => it.id === itemId ? { ...it, ...patch } : it));
    await fetch(API(`/dd/${dealId}/items/${itemId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {});
  }, [dealId]);

  const uploadItemDoc = useCallback(async (itemId: number, file: File) => {
    setItemUploading(prev => ({ ...prev, [itemId]: true }));
    setItemUploadError(prev => ({ ...prev, [itemId]: null }));
    const formData = new FormData();
    formData.append('file', file);
    formData.append('deal_id', String(dealId));
    formData.append('document_type', 'DD Document');
    formData.append('dd_item_id', String(itemId));
    try {
      const res = await fetch('/api/v1/documents/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      // Update local item with drive URL and any AI-generated analyst notes
      setItems(prev => prev.map(it => {
        if (it.id !== itemId) return it;
        return {
          ...it,
          drive_url: json.drive_url ?? it.drive_url,
          drive_file_id: json.document?.driveFileId ?? it.drive_file_id,
          document_id: json.document?.id ?? it.document_id,
          analyst_notes: json.summary ? json.summary : it.analyst_notes,
        };
      }));
    } catch (err: unknown) {
      setItemUploadError(prev => ({ ...prev, [itemId]: err instanceof Error ? err.message : 'Upload failed' }));
    } finally {
      setItemUploading(prev => ({ ...prev, [itemId]: false }));
    }
  }, [dealId]);

  const filtered = useMemo(() => items.filter(it => {
    if (filterResp && it.responsible !== filterResp) return false;
    if (filterStatus && it.status !== filterStatus) return false;
    return true;
  }), [items, filterResp, filterStatus]);

  // Group by top_section → section_code
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, DDItem[]>>();
    for (const it of filtered) {
      if (!map.has(it.top_section)) map.set(it.top_section, new Map());
      const sub = map.get(it.top_section)!;
      const key = `${it.section_code}||${it.section_name}`;
      if (!sub.has(key)) sub.set(key, []);
      sub.get(key)!.push(it);
    }
    return map;
  }, [filtered]);

  // Progress
  const total = items.length;
  const done = items.filter(i => ['Complete', 'Waived', 'N/A'].includes(i.status)).length;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  const toggleSection = (key: string) =>
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  const toggleItem = (id: number) =>
    setExpandedItems(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-gray-400 gap-2">
        <Loader2 size={18} className="animate-spin" /> Loading checklist…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4">
        <ClipboardList size={36} className="text-gray-300" />
        <div className="text-center">
          <p className="text-sm font-medium text-gray-700 mb-1">No DD checklist yet</p>
          <p className="text-xs text-gray-400 mb-4">Seed the standard Aequitas DD checklist (90 items)</p>
          <button
            onClick={seed}
            disabled={seeding}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
          >
            {seeding ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Initialize DD Checklist
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Progress + filters */}
      <div className="flex flex-wrap items-center gap-4 mb-5">
        <div className="flex items-center gap-3 flex-1 min-w-[200px]">
          <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-blue-500'}`}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-xs font-semibold text-gray-600 tabular-nums w-10">{pct}%</span>
          <span className="text-xs text-gray-400 whitespace-nowrap">{done}/{total} complete</span>
        </div>

        <div className="flex items-center gap-2">
          <Filter size={13} className="text-gray-400" />
          <select
            value={filterResp}
            onChange={e => setFilterResp(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none"
          >
            <option value="">All Responsible</option>
            {RESPONSIBLE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="px-2 py-1 text-xs border border-gray-200 rounded-lg bg-white focus:outline-none"
          >
            <option value="">All Statuses</option>
            {STATUS_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          {(filterResp || filterStatus) && (
            <button onClick={() => { setFilterResp(''); setFilterStatus(''); }}
              className="text-xs text-blue-500 hover:underline flex items-center gap-0.5">
              <X size={10} /> Clear
            </button>
          )}
        </div>
      </div>

      {/* Accordion by top-section / sub-section */}
      <div className="space-y-3">
        {[...grouped.entries()].map(([topSection, subMap]) => {
          const topKey = `top:${topSection}`;
          const topOpen = openSections[topKey] !== false; // open by default

          const topItems = [...subMap.values()].flat();
          const topDone = topItems.filter(i => ['Complete', 'Waived', 'N/A'].includes(i.status)).length;
          const topAllDone = topDone === topItems.length;

          return (
            <div key={topSection} className="border border-gray-200 rounded-xl overflow-hidden">
              {/* Top-level section header */}
              <button
                onClick={() => toggleSection(topKey)}
                className="w-full flex items-center justify-between px-4 py-3.5 bg-gray-900 text-white text-left hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <ChevronRight size={14} className={`text-gray-400 transition-transform ${topOpen ? 'rotate-90' : ''}`} />
                  {topAllDone
                    ? <CheckCircle2 size={14} className="text-green-400" />
                    : <div className="w-3.5 h-3.5 rounded-full border-2 border-gray-500" />
                  }
                  <span className="text-sm font-semibold">{topSection}</span>
                </div>
                <span className="text-xs text-gray-400">{topDone}/{topItems.length}</span>
              </button>

              {topOpen && (
                <div className="divide-y divide-gray-100">
                  {[...subMap.entries()].map(([subKey, subItems]) => {
                    const [sectionCode, sectionName] = subKey.split('||');
                    const secOpen = openSections[subKey] !== false;
                    const secDone = subItems.filter(i => ['Complete', 'Waived', 'N/A'].includes(i.status)).length;
                    const secAllDone = secDone === subItems.length;

                    return (
                      <div key={subKey}>
                        {/* Sub-section header */}
                        <button
                          onClick={() => toggleSection(subKey)}
                          className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                        >
                          <div className="flex items-center gap-2.5">
                            <ChevronRight size={12} className={`text-gray-400 transition-transform ${secOpen ? 'rotate-90' : ''}`} />
                            {secAllDone
                              ? <CheckCircle2 size={13} className="text-green-500" />
                              : <div className={`w-3 h-3 rounded-full border-2 ${secDone > 0 ? 'border-blue-400' : 'border-gray-300'}`} />
                            }
                            <span className="text-xs font-semibold text-gray-600">
                              {sectionCode} — {sectionName}
                            </span>
                          </div>
                          <span className="text-xs text-gray-400">{secDone}/{subItems.length}</span>
                        </button>

                        {secOpen && (
                          <div className="divide-y divide-gray-50">
                            {subItems.map(item => {
                              const expanded = expandedItems.has(item.id);
                              return (
                                <div key={item.id} className="px-4 py-3">
                                  <div className="flex items-center gap-3">
                                    {/* Item # */}
                                    <span className="text-xs text-gray-300 w-5 text-right shrink-0">
                                      {item.item_number}
                                    </span>

                                    {/* Status badge */}
                                    <select
                                      value={item.status}
                                      onChange={e => patch(item.id, { status: e.target.value })}
                                      className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-300 ${STATUS_STYLE[item.status] ?? 'bg-gray-100 text-gray-500'}`}
                                    >
                                      {STATUS_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                                    </select>

                                    {/* Description */}
                                    <span className={`flex-1 text-sm leading-snug ${
                                      ['Complete', 'Waived', 'N/A'].includes(item.status)
                                        ? 'text-gray-400 line-through'
                                        : 'text-gray-800'
                                    }`}>
                                      {item.description}
                                    </span>

                                    {/* Responsible */}
                                    <select
                                      value={item.responsible}
                                      onChange={e => patch(item.id, { responsible: e.target.value })}
                                      className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-semibold border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-blue-300 ${RESP_STYLE[item.responsible] ?? 'bg-gray-100 text-gray-600'}`}
                                    >
                                      {RESPONSIBLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                                    </select>

                                    {/* Due date */}
                                    <input
                                      type="date"
                                      value={item.due_date ?? ''}
                                      onChange={e => patch(item.id, { due_date: e.target.value || undefined })}
                                      className="shrink-0 px-2 py-0.5 border border-gray-200 rounded text-xs bg-white focus:outline-none focus:ring-1 focus:ring-blue-300 w-[120px]"
                                      title="Due date"
                                    />

                                    {/* Expand toggle */}
                                    <button
                                      onClick={() => toggleItem(item.id)}
                                      className="shrink-0 text-gray-300 hover:text-gray-500"
                                      title="Show comments / analyst notes"
                                    >
                                      <ChevronDown size={14} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
                                    </button>
                                  </div>

                                  {/* Expanded comments / notes / upload */}
                                  {expanded && (
                                    <div className="mt-3 ml-8 space-y-3">
                                      <div className="grid grid-cols-2 gap-3">
                                        <div>
                                          <label className="block text-xs text-gray-400 mb-1">Comments</label>
                                          <textarea
                                            value={item.comments}
                                            onChange={e => setItems(prev => prev.map(it => it.id === item.id ? { ...it, comments: e.target.value } : it))}
                                            onBlur={() => patch(item.id, { comments: item.comments })}
                                            rows={2}
                                            placeholder="Add a comment…"
                                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none"
                                          />
                                        </div>
                                        <div>
                                          <label className="block text-xs text-gray-400 mb-1">Analyst Notes</label>
                                          <textarea
                                            value={item.analyst_notes}
                                            onChange={e => setItems(prev => prev.map(it => it.id === item.id ? { ...it, analyst_notes: e.target.value } : it))}
                                            onBlur={() => patch(item.id, { analyst_notes: item.analyst_notes })}
                                            rows={2}
                                            placeholder="Internal notes…"
                                            className="w-full px-2 py-1.5 border border-gray-200 rounded-lg text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-blue-300 resize-none"
                                          />
                                        </div>
                                      </div>
                                      {/* Document attachment */}
                                      <div className="flex items-center gap-2">
                                        {item.drive_url ? (
                                          <a
                                            href={item.drive_url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors"
                                          >
                                            <ExternalLink size={11} />
                                            View in Drive
                                          </a>
                                        ) : null}
                                        <label className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 hover:text-gray-700 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-lg cursor-pointer transition-colors">
                                          {itemUploading[item.id]
                                            ? <><Loader2 size={11} className="animate-spin" />Uploading…</>
                                            : <><Upload size={11} />{item.drive_url ? 'Replace doc' : 'Attach doc'}</>
                                          }
                                          <input
                                            type="file"
                                            accept=".pdf,.doc,.docx,.xlsx,.xls,.png,.jpg"
                                            className="hidden"
                                            disabled={itemUploading[item.id]}
                                            onChange={e => {
                                              const f = e.target.files?.[0];
                                              if (f) uploadItemDoc(item.id, f);
                                              e.target.value = '';
                                            }}
                                          />
                                        </label>
                                        {itemUploadError[item.id] && (
                                          <span className="text-xs text-red-600">{itemUploadError[item.id]}</span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
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
  );
};

// ─── Tab 2: Issues & Findings ─────────────────────────────────────────────────

const IssuesTab = ({ dealId }: { dealId: number }) => {
  const [issues, setIssues] = useState<DDIssue[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(API(`/dd/${dealId}/issues`));
    const d = await r.json();
    setIssues(d.issues ?? []);
    setLoading(false);
  }, [dealId]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const r = await fetch(API(`/dd/${dealId}/issues`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'Open', date_identified: new Date().toISOString().slice(0, 10) }),
    });
    const d = await r.json();
    if (d.issue) setIssues(prev => [d.issue, ...prev]);
  };

  const update = async (id: number, patch: Partial<DDIssue>) => {
    setIssues(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    await fetch(API(`/dd/${dealId}/issues/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {});
  };

  const del = async (id: number) => {
    setIssues(prev => prev.filter(i => i.id !== id));
    await fetch(API(`/dd/${dealId}/issues/${id}`), { method: 'DELETE' }).catch(() => {});
  };

  if (loading) return <div className="py-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</div>;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={add} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors">
          <Plus size={13} /> Add Issue
        </button>
      </div>

      {issues.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <AlertTriangle size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No issues logged yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[700px]">
            <TableHeader cols={['Status', 'Date', 'Type', 'Category', 'Issue / Finding', 'Action Plan', 'Resolved', '']} />
            <tbody className="divide-y divide-gray-100">
              {issues.map(issue => (
                <tr key={issue.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 w-28">
                    <InlineSelect
                      value={issue.status}
                      onChange={v => update(issue.id, { status: v })}
                      options={ISSUE_STATUS_OPTIONS}
                      className={STATUS_STYLE[issue.status] ?? 'bg-gray-100 text-gray-600'}
                    />
                  </td>
                  <td className="px-3 py-2 w-28">
                    <InlineInput type="date" value={issue.date_identified ?? ''} onChange={v => update(issue.id, { date_identified: v || undefined })} />
                  </td>
                  <td className="px-3 py-2 w-28">
                    <InlineInput value={issue.type} onChange={v => update(issue.id, { type: v })} placeholder="Legal / Financial…" />
                  </td>
                  <td className="px-3 py-2 w-28">
                    <InlineInput value={issue.category} onChange={v => update(issue.id, { category: v })} placeholder="Category" />
                  </td>
                  <td className="px-3 py-2">
                    <InlineInput value={issue.description} onChange={v => update(issue.id, { description: v })} placeholder="Describe the issue…" />
                  </td>
                  <td className="px-3 py-2">
                    <InlineInput value={issue.action_plan} onChange={v => update(issue.id, { action_plan: v })} placeholder="Proposed resolution…" />
                  </td>
                  <td className="px-3 py-2 w-28">
                    <InlineInput type="date" value={issue.resolved_date ?? ''} onChange={v => update(issue.id, { resolved_date: v || undefined })} />
                  </td>
                  <td className="px-3 py-2 w-8">
                    <button onClick={() => del(issue.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── Tab 3: Q&A Log ───────────────────────────────────────────────────────────

const QATab = ({ dealId }: { dealId: number }) => {
  const [questions, setQuestions] = useState<DDQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(API(`/dd/${dealId}/questions`));
    const d = await r.json();
    setQuestions(d.questions ?? []);
    setLoading(false);
  }, [dealId]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const r = await fetch(API(`/dd/${dealId}/questions`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: 'Medium', date_identified: new Date().toISOString().slice(0, 10) }),
    });
    const d = await r.json();
    if (d.question) setQuestions(prev => [d.question, ...prev]);
  };

  const update = async (id: number, patch: Partial<DDQuestion>) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...patch } : q));
    await fetch(API(`/dd/${dealId}/questions/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {});
  };

  const del = async (id: number) => {
    setQuestions(prev => prev.filter(q => q.id !== id));
    await fetch(API(`/dd/${dealId}/questions/${id}`), { method: 'DELETE' }).catch(() => {});
  };

  const visible = showResolved ? questions : questions.filter(q => !q.resolved);

  if (loading) return <div className="py-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <label className="flex items-center gap-2 text-xs text-gray-500 cursor-pointer select-none">
          <input type="checkbox" checked={showResolved} onChange={e => setShowResolved(e.target.checked)} className="rounded" />
          Show resolved
        </label>
        <button onClick={add} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors">
          <Plus size={13} /> Add Question
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <MessageSquare size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">{questions.length === 0 ? 'No questions logged yet' : 'No open questions'}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[800px]">
            <TableHeader cols={['✓', 'Priority', 'Category', 'Question', 'Party', 'Date', 'Response', 'Resolved', '']} />
            <tbody className="divide-y divide-gray-100">
              {visible.map(q => (
                <tr key={q.id} className={`hover:bg-gray-50 ${q.resolved ? 'opacity-60' : ''}`}>
                  <td className="px-3 py-2 w-8">
                    <button
                      onClick={() => update(q.id, {
                        resolved: !q.resolved,
                        date_resolved: !q.resolved ? new Date().toISOString().slice(0, 10) : undefined,
                      })}
                      className={`w-4 h-4 rounded flex items-center justify-center border-2 transition-colors ${
                        q.resolved ? 'bg-green-500 border-green-500' : 'border-gray-300 hover:border-green-400'
                      }`}
                    >
                      {q.resolved && <CheckCircle2 size={10} className="text-white" />}
                    </button>
                  </td>
                  <td className="px-3 py-2 w-24">
                    <InlineSelect
                      value={q.priority}
                      onChange={v => update(q.id, { priority: v })}
                      options={PRIORITY_OPTIONS}
                      className={PRIORITY_STYLE[q.priority] ?? 'bg-gray-100 text-gray-600'}
                    />
                  </td>
                  <td className="px-3 py-2 w-28">
                    <InlineInput value={q.category} onChange={v => update(q.id, { category: v })} placeholder="Category" />
                  </td>
                  <td className="px-3 py-2">
                    <InlineInput value={q.question} onChange={v => update(q.id, { question: v })} placeholder="Question or issue…" />
                  </td>
                  <td className="px-3 py-2 w-28">
                    <InlineInput value={q.party_to_respond} onChange={v => update(q.id, { party_to_respond: v })} placeholder="Sponsor…" />
                  </td>
                  <td className="px-3 py-2 w-28">
                    <InlineInput type="date" value={q.date_identified ?? ''} onChange={v => update(q.id, { date_identified: v || undefined })} />
                  </td>
                  <td className="px-3 py-2">
                    <InlineInput value={q.response} onChange={v => update(q.id, { response: v })} placeholder="Response or resolution…" />
                  </td>
                  <td className="px-3 py-2 w-28">
                    <span className="text-gray-400">{fmtDate(q.date_resolved)}</span>
                  </td>
                  <td className="px-3 py-2 w-8">
                    <button onClick={() => del(q.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── Tab 4: DD Budget ─────────────────────────────────────────────────────────

const BudgetTab = ({ dealId }: { dealId: number }) => {
  const [items, setItems] = useState<DDBudgetItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(API(`/dd/${dealId}/budget`));
    const d = await r.json();
    setItems(d.budget ?? []);
    setLoading(false);
  }, [dealId]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const r = await fetch(API(`/dd/${dealId}/budget`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ service: '' }),
    });
    const d = await r.json();
    if (d.item) setItems(prev => [...prev, d.item]);
  };

  const update = async (id: number, patch: Partial<DDBudgetItem>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
    await fetch(API(`/dd/${dealId}/budget/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {});
  };

  const del = async (id: number) => {
    setItems(prev => prev.filter(i => i.id !== id));
    await fetch(API(`/dd/${dealId}/budget/${id}`), { method: 'DELETE' }).catch(() => {});
  };

  const total = items.reduce((s, i) => s + (i.estimated_cost ?? 0), 0);

  if (loading) return <div className="py-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</div>;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={add} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors">
          <Plus size={13} /> Add Service
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs min-w-[600px]">
          <TableHeader cols={['Service', 'Vendor', 'Est. Cost ($)', 'Invoice #', 'Due Date', 'Comments', '']} />
          <tbody className="divide-y divide-gray-100">
            {items.map(item => (
              <tr key={item.id} className="hover:bg-gray-50">
                <td className="px-3 py-2">
                  <InlineInput value={item.service} onChange={v => update(item.id, { service: v })} placeholder="Service description" />
                </td>
                <td className="px-3 py-2 w-36">
                  <InlineInput value={item.vendor} onChange={v => update(item.id, { vendor: v })} placeholder="Vendor name" />
                </td>
                <td className="px-3 py-2 w-28">
                  <InlineInput
                    value={item.estimated_cost != null ? String(item.estimated_cost) : ''}
                    onChange={v => update(item.id, { estimated_cost: v ? parseFloat(v) : undefined })}
                    placeholder="0"
                    type="number"
                  />
                </td>
                <td className="px-3 py-2 w-28">
                  <InlineInput value={item.invoice_number} onChange={v => update(item.id, { invoice_number: v })} placeholder="INV-001" />
                </td>
                <td className="px-3 py-2 w-32">
                  <InlineInput type="date" value={item.due_date ?? ''} onChange={v => update(item.id, { due_date: v || undefined })} />
                </td>
                <td className="px-3 py-2">
                  <InlineInput value={item.comments} onChange={v => update(item.id, { comments: v })} placeholder="Notes…" />
                </td>
                <td className="px-3 py-2 w-8">
                  <button onClick={() => del(item.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}

            {/* Total row */}
            <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold">
              <td className="px-3 py-2.5 text-xs text-gray-600" colSpan={2}>TOTAL</td>
              <td className="px-3 py-2.5 text-sm text-gray-900">
                {total > 0 ? `$${total.toLocaleString()}` : '—'}
              </td>
              <td colSpan={4} />
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ─── Tab 5: Contacts ──────────────────────────────────────────────────────────

const ContactsTab = ({ dealId }: { dealId: number }) => {
  const [contacts, setContacts] = useState<DDContact[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const r = await fetch(API(`/dd/${dealId}/contacts`));
    const d = await r.json();
    setContacts(d.contacts ?? []);
    setLoading(false);
  }, [dealId]);

  useEffect(() => { load(); }, [load]);

  const add = async () => {
    const r = await fetch(API(`/dd/${dealId}/contacts`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ party_type: '' }),
    });
    const d = await r.json();
    if (d.contact) setContacts(prev => [...prev, d.contact]);
  };

  const update = async (id: number, patch: Partial<DDContact>) => {
    setContacts(prev => prev.map(c => c.id === id ? { ...c, ...patch } : c));
    await fetch(API(`/dd/${dealId}/contacts/${id}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    }).catch(() => {});
  };

  const del = async (id: number) => {
    setContacts(prev => prev.filter(c => c.id !== id));
    await fetch(API(`/dd/${dealId}/contacts/${id}`), { method: 'DELETE' }).catch(() => {});
  };

  if (loading) return <div className="py-8 text-center text-gray-400 text-sm flex items-center justify-center gap-2"><Loader2 size={16} className="animate-spin" /> Loading…</div>;

  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={add} className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors">
          <Plus size={13} /> Add Contact
        </button>
      </div>

      {contacts.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <Users size={28} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No contacts yet</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[700px]">
            <TableHeader cols={['Party', 'Company', 'Name / Title', 'Email', 'Phone', 'Notes', '']} />
            <tbody className="divide-y divide-gray-100">
              {contacts.map(c => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-3 py-2 w-32">
                    <InlineInput value={c.party_type} onChange={v => update(c.id, { party_type: v })} placeholder="Sponsor…" />
                  </td>
                  <td className="px-3 py-2">
                    <InlineInput value={c.company} onChange={v => update(c.id, { company: v })} placeholder="Company name" />
                  </td>
                  <td className="px-3 py-2">
                    <InlineInput value={c.name_title} onChange={v => update(c.id, { name_title: v })} placeholder="Name / Title" />
                  </td>
                  <td className="px-3 py-2">
                    <InlineInput value={c.email} onChange={v => update(c.id, { email: v })} placeholder="email@example.com" type="email" />
                  </td>
                  <td className="px-3 py-2 w-36">
                    <InlineInput value={c.phone} onChange={v => update(c.id, { phone: v })} placeholder="+1 (555) 000-0000" />
                  </td>
                  <td className="px-3 py-2">
                    <InlineInput value={c.notes} onChange={v => update(c.id, { notes: v })} placeholder="Notes…" />
                  </td>
                  <td className="px-3 py-2 w-8">
                    <button onClick={() => del(c.id)} className="text-gray-300 hover:text-red-500 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

// ─── Main DDSection component ──────────────────────────────────────────────────

type DDTab = 'checklist' | 'issues' | 'qa' | 'budget' | 'contacts';

const DD_TABS: Array<{ id: DDTab; label: string; icon: React.ReactNode }> = [
  { id: 'checklist', label: 'Checklist',         icon: <ClipboardList size={14} /> },
  { id: 'issues',    label: 'Issues & Findings', icon: <AlertTriangle size={14} /> },
  { id: 'qa',        label: 'Q&A Log',           icon: <MessageSquare size={14} /> },
  { id: 'budget',    label: 'Budget',            icon: <DollarSign size={14} /> },
  { id: 'contacts',  label: 'Contacts',          icon: <Users size={14} /> },
];

export default function DDSection({ dealId }: { dealId: number }) {
  const [activeTab, setActiveTab] = useState<DDTab>('checklist');

  return (
    <div>
      <KeyDatesBar dealId={dealId} />

      {/* Tab bar */}
      <div className="flex gap-1 mb-5 border-b border-gray-200">
        {DD_TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              activeTab === tab.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="bg-white rounded-xl p-6 shadow-sm">
        {activeTab === 'checklist' && <DDChecklist dealId={dealId} />}
        {activeTab === 'issues'    && <IssuesTab   dealId={dealId} />}
        {activeTab === 'qa'        && <QATab        dealId={dealId} />}
        {activeTab === 'budget'    && <BudgetTab    dealId={dealId} />}
        {activeTab === 'contacts'  && <ContactsTab  dealId={dealId} />}
      </div>
    </div>
  );
}
