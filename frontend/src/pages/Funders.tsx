import { useState, useEffect, useCallback } from 'react';
import {
  Pin,
  PinOff,
  X,
  RefreshCw,
  Plus,
  ChevronDown,
  ChevronUp,
  Settings,
  Download,
} from 'lucide-react';
import * as fundersApi from '../services/fundersApi';
import { FUNDER_STATUSES } from '../services/fundersApi';
import type { FunderDefinition, FunderHit, FunderStatus } from '../services/fundersApi';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatCurrency(n?: number | null): string {
  if (n === null || n === undefined) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function sourceLabel(source: string, defs: FunderDefinition[]): string {
  if (source === 'curated_emerging_manager') return 'Curated — Emerging Manager Program';
  return defs.find((d) => d.key === source)?.label ?? source;
}

function parseRawData(raw?: string | null): Record<string, unknown> {
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

// ── Pinned Drawer ──────────────────────────────────────────────────────────

interface PinnedDrawerProps {
  open: boolean;
  onClose: () => void;
  pinnedHits: FunderHit[];
  defs: FunderDefinition[];
  onUnpin: (hit: FunderHit) => void;
  onNoteChange: (hit: FunderHit, note: string) => void;
}

const PinnedDrawer = ({ open, onClose, pinnedHits, defs, onUnpin, onNoteChange }: PinnedDrawerProps) => {
  return (
    <>
      {open && <div className="fixed inset-0 bg-black/20 z-40" onClick={onClose} />}
      <div
        className={`fixed top-0 right-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Pin size={16} className="text-primary-800" />
            <h2 className="text-base font-semibold text-gray-800">Pinned Funders</h2>
            <span className="text-xs text-gray-400">({pinnedHits.length})</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {pinnedHits.length === 0 ? (
            <p className="text-sm text-gray-400 text-center mt-8">
              No pinned funders yet.<br />Click the pin icon on any hit.
            </p>
          ) : (
            pinnedHits.map((h) => (
              <div key={h.id} className="border border-gray-200 rounded-lg p-4 relative">
                <button
                  onClick={() => onUnpin(h)}
                  className="absolute top-3 right-3 text-gray-300 hover:text-red-400 transition-colors"
                  aria-label="Unpin"
                >
                  <X size={14} />
                </button>
                <div className="pr-5 mb-2">
                  <p className="text-sm font-medium text-gray-800 leading-snug">{h.name}</p>
                  <p className="text-xs text-gray-400">{[h.city, h.state].filter(Boolean).join(', ')}</p>
                </div>
                <div className="flex items-center gap-2 mb-3 flex-wrap">
                  <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-800 border border-primary-200">
                    {sourceLabel(h.source, defs)}
                  </span>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label>
                  <textarea
                    rows={3}
                    defaultValue={h.note}
                    placeholder="Add notes…"
                    onBlur={(e) => onNoteChange(h, e.target.value)}
                    className="w-full text-sm px-2.5 py-2 border border-gray-200 rounded-md resize-none focus:outline-none focus:border-primary-500 text-gray-700 placeholder-gray-300"
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </>
  );
};

// ── Funder card ──────────────────────────────────────────────────────────────

interface FunderCardProps {
  hit: FunderHit;
  defs: FunderDefinition[];
  expanded: boolean;
  onToggle: () => void;
  onPin: () => void;
  onNoteChange: (note: string) => void;
  onStatusChange: (status: FunderStatus) => void;
  selected: boolean;
  onSelectToggle: () => void;
}

const FunderCard = ({ hit, defs, expanded, onToggle, onPin, onNoteChange, onStatusChange, selected, onSelectToggle }: FunderCardProps) => {
  const raw = parseRawData(hit.raw_data);
  return (
    <div className="p-5 hover:bg-gray-50 transition-colors border-b border-gray-100">
      <div className="flex items-start justify-between cursor-pointer" onClick={onToggle}>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <label
              onClick={(e) => e.stopPropagation()}
              className="flex items-center p-1.5 -m-1.5 mr-0.5 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected}
                onChange={onSelectToggle}
                aria-label="Select for export"
                className="w-4 h-4 accent-primary-800 cursor-pointer"
              />
            </label>
            <h3 className="font-medium text-gray-800">{hit.name || 'Unknown'}</h3>
            {hit.entity_type && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200">
                {hit.entity_type.replace(/_/g, ' ')}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-800 border border-primary-200">
              {sourceLabel(hit.source, defs)}
            </span>
            <select
              value={hit.status}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => onStatusChange(e.target.value as FunderStatus)}
              className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200 focus:outline-none focus:border-primary-500"
            >
              {FUNDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            {(hit.city || hit.state) && (
              <span className="text-xs text-gray-400">{[hit.city, hit.state].filter(Boolean).join(', ')}</span>
            )}
            {hit.aum != null && <span className="text-xs text-gray-400">AUM {formatCurrency(hit.aum)}</span>}
            {hit.cre_growth_pct != null && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                +{hit.cre_growth_pct}% CRE QoQ
              </span>
            )}
            <span className="text-xs text-gray-400">Seen {formatTimestamp(hit.last_seen_at)}</span>
          </div>
          {expanded && (
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-gray-600">
              <div><span className="text-gray-400">Contact:</span> {hit.contact_address || '—'}</div>
              {hit.cre_loan_total != null && (
                <div><span className="text-gray-400">CRE loan book:</span> {formatCurrency(hit.cre_loan_total)}</div>
              )}
              {Object.entries(raw).map(([key, value]) => (
                <div key={key} className={typeof value === 'string' && value.length > 60 ? 'col-span-2' : ''}>
                  <span className="text-gray-400">{key.replace(/_/g, ' ')}:</span>{' '}
                  {String(value)}
                </div>
              ))}
              <div className="col-span-2 mt-2">
                <label className="block text-xs font-semibold text-gray-500 mb-1">Notes</label>
                <textarea
                  rows={2}
                  defaultValue={hit.note}
                  placeholder="Add notes…"
                  onClick={(e) => e.stopPropagation()}
                  onBlur={(e) => onNoteChange(e.target.value)}
                  className="w-full text-sm px-2.5 py-2 border border-gray-200 rounded-md resize-none focus:outline-none focus:border-primary-500 text-gray-700 placeholder-gray-300"
                />
              </div>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={onPin}
            className={`p-1 rounded transition-colors ${hit.pinned ? 'text-primary-800 hover:text-primary-700' : 'text-gray-300 hover:text-primary-800'}`}
            aria-label={hit.pinned ? 'Unpin' : 'Pin'}
          >
            {hit.pinned ? <Pin size={15} /> : <PinOff size={15} />}
          </button>
          {expanded ? <ChevronUp size={18} className="text-gray-400" /> : <ChevronDown size={18} className="text-gray-400" />}
        </div>
      </div>
    </div>
  );
};

// ── Main page ────────────────────────────────────────────────────────────────

const Funders = () => {
  const [defs, setDefs] = useState<FunderDefinition[]>([]);
  const [hits, setHits] = useState<FunderHit[]>([]);
  const [pinnedHits, setPinnedHits] = useState<FunderHit[]>([]);

  const [filterSource, setFilterSource] = useState<string>('all');
  const [filterEntityType, setFilterEntityType] = useState<string>('all');
  const [minAum, setMinAum] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [nameSearch, setNameSearch] = useState('');

  const [expandedHitId, setExpandedHitId] = useState<string | null>(null);
  const [pinDrawerOpen, setPinDrawerOpen] = useState(false);
  const [showSourcePanel, setShowSourcePanel] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [selectedForExport, setSelectedForExport] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [hitsLoading, setHitsLoading] = useState(true);

  const [newFunderName, setNewFunderName] = useState('');
  const [newFunderEntityType, setNewFunderEntityType] = useState('');
  const [newFunderCity, setNewFunderCity] = useState('');
  const [newFunderState, setNewFunderState] = useState('');
  const [adding, setAdding] = useState(false);

  const refreshHits = useCallback(async () => {
    setHitsLoading(true);
    try {
      const loaded = await fundersApi.fetchHits({
        source: filterSource !== 'all' ? filterSource : undefined,
        entityType: filterEntityType !== 'all' ? filterEntityType : undefined,
        minAum: minAum ? Number(minAum) : undefined,
        pinned: pinnedOnly ? true : undefined,
        nameSearch: nameSearch.trim() || undefined,
      });
      setHits(loaded);
    } finally {
      setHitsLoading(false);
    }
  }, [filterSource, filterEntityType, minAum, pinnedOnly, nameSearch]);

  const refreshPinnedHits = useCallback(async () => {
    const loaded = await fundersApi.fetchHits({ pinned: true });
    setPinnedHits(loaded);
  }, []);

  useEffect(() => {
    (async () => {
      const d = await fundersApi.fetchDefinitions();
      setDefs(d);
      await refreshPinnedHits();
      setInitialLoading(false);
    })();
  }, [refreshPinnedHits]);

  useEffect(() => {
    refreshHits();
  }, [refreshHits]);

  const handleScan = async () => {
    setScanning(true);
    try {
      await fundersApi.triggerScan();
      await refreshHits();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleToggleSource = async (def: FunderDefinition) => {
    if (def.stubbed) return;
    try {
      const updated = await fundersApi.updateDefinition(def.id, !def.enabled);
      setDefs((prev) => prev.map((d) => (d.id === def.id ? updated : d)));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update source');
    }
  };

  const handleAddFunder = async () => {
    if (!newFunderName.trim()) return;
    setAdding(true);
    try {
      const created = await fundersApi.createHit({
        name: newFunderName.trim(),
        entity_type: newFunderEntityType.trim() || undefined,
        city: newFunderCity.trim() || undefined,
        state: newFunderState.trim() || undefined,
      });
      setHits((prev) => [created, ...prev]);
      setNewFunderName(''); setNewFunderEntityType(''); setNewFunderCity(''); setNewFunderState('');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to add funder');
    } finally {
      setAdding(false);
    }
  };

  // Keeps `hits` (filtered feed) and `pinnedHits` (unfiltered, drives the drawer) consistent
  // after any pin/note change, regardless of which view triggered it.
  const applyHitUpdate = (hitId: string, updated: FunderHit) => {
    setHits((prev) => prev.map((h) => (h.id === hitId ? updated : h)));
    setPinnedHits((prev) => {
      if (!updated.pinned) return prev.filter((h) => h.id !== hitId);
      const exists = prev.some((h) => h.id === hitId);
      return exists ? prev.map((h) => (h.id === hitId ? updated : h)) : [updated, ...prev];
    });
  };

  const handlePinToggle = async (hit: FunderHit) => {
    const updated = await fundersApi.updateHit(hit.id, { pinned: !hit.pinned });
    applyHitUpdate(hit.id, updated);
  };

  const handleSelectToggle = (hitId: string) => {
    setSelectedForExport((prev) => {
      const next = new Set(prev);
      if (next.has(hitId)) next.delete(hitId); else next.add(hitId);
      return next;
    });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const { sheet_url } = await fundersApi.exportHits(Array.from(selectedForExport));
      window.open(sheet_url, '_blank');
      setSelectedForExport(new Set());
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  };

  const handleNoteChange = async (hit: FunderHit, note: string) => {
    const updated = await fundersApi.updateHit(hit.id, { note });
    applyHitUpdate(hit.id, updated);
  };

  const handleStatusChange = async (hit: FunderHit, status: FunderStatus) => {
    const updated = await fundersApi.updateHit(hit.id, { status });
    applyHitUpdate(hit.id, updated);
  };

  const allSources = ['family_office_adv', 'bank_cre_growth', 'curated_emerging_manager', ...defs.map((d) => d.key)]
    .filter((v, i, arr) => arr.indexOf(v) === i);
  const entityTypes = Array.from(new Set(hits.map((h) => h.entity_type).filter((v): v is string => !!v)));

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Funders</h1>
          <p className="text-sm text-gray-500 mt-1">
            Capital sources that fund deal-by-deal — family offices, banks growing their CRE book, and curated emerging-manager / women/POC-led sponsor programs.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {selectedForExport.size > 0 && (
            <button
              onClick={handleExport}
              disabled={exporting}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-white border border-primary-200 text-primary-800 rounded-md hover:bg-primary-50 transition-colors disabled:opacity-50"
            >
              <Download size={15} /> {exporting ? 'Exporting…' : `Export ${selectedForExport.size} to Sheet`}
            </button>
          )}
          <button
            onClick={() => setPinDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Pin size={15} /> Pinned
          </button>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary-800 text-white rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={scanning ? 'animate-spin' : ''} /> {scanning ? 'Scanning…' : 'Scan'}
          </button>
        </div>
      </div>

      {scanning && (
        <div className="mb-6 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
          Scanning family offices (SEC Form ADV) and banks (FDIC call reports) — this can take a few seconds.
        </div>
      )}

      {/* Source toggle panel */}
      <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowSourcePanel((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Settings size={15} /> Automated sources {initialLoading ? '(loading…)' : `(${defs.filter((d) => d.enabled).length} active)`}
          </span>
          {showSourcePanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showSourcePanel && (
          <div className="p-4">
            <div className="grid grid-cols-2 gap-2">
              {defs.map((d) => (
                <label
                  key={d.id}
                  title={d.stubbed ? d.disabled_reason ?? undefined : undefined}
                  className={`flex items-center gap-2 text-sm px-3 py-2 rounded-md border ${
                    d.stubbed ? 'opacity-50 cursor-not-allowed border-gray-100 bg-gray-50' : 'border-gray-200 cursor-pointer hover:bg-gray-50'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={d.enabled}
                    disabled={d.stubbed}
                    onChange={() => handleToggleSource(d)}
                  />
                  {d.label}
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add funder (curated entries) */}
      <div className="mb-6 border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowAddForm((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <span>Add a curated funder</span>
          {showAddForm ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showAddForm && (
          <div className="p-4 flex items-center gap-2 flex-wrap">
            <input
              value={newFunderName}
              onChange={(e) => setNewFunderName(e.target.value)}
              placeholder="Name (e.g. XYZ Pension Emerging Manager Program)"
              className="flex-1 min-w-[220px] text-sm px-2.5 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-primary-500"
            />
            <input
              value={newFunderEntityType}
              onChange={(e) => setNewFunderEntityType(e.target.value)}
              placeholder="Entity type"
              className="w-40 text-sm px-2.5 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-primary-500"
            />
            <input
              value={newFunderCity}
              onChange={(e) => setNewFunderCity(e.target.value)}
              placeholder="City"
              className="w-28 text-sm px-2.5 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-primary-500"
            />
            <input
              value={newFunderState}
              onChange={(e) => setNewFunderState(e.target.value)}
              placeholder="State"
              className="w-20 text-sm px-2.5 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-primary-500"
            />
            <button
              onClick={handleAddFunder}
              disabled={adding}
              className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-800 text-white rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50"
            >
              <Plus size={14} /> Add
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-primary-500"
        >
          <option value="all">All sources</option>
          {allSources.map((s) => <option key={s} value={s}>{sourceLabel(s, defs)}</option>)}
        </select>
        <select
          value={filterEntityType}
          onChange={(e) => setFilterEntityType(e.target.value)}
          className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-primary-500"
        >
          <option value="all">All entity types</option>
          {entityTypes.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
        </select>
        <input
          value={minAum}
          onChange={(e) => setMinAum(e.target.value)}
          placeholder="Min AUM ($)"
          type="number"
          className="w-32 text-sm px-2.5 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-primary-500"
        />
        <button
          onClick={() => setPinnedOnly((v) => !v)}
          className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border transition-colors ${
            pinnedOnly ? 'bg-primary-50 text-primary-800 border-primary-200' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Pin size={14} /> Pinned only
        </button>
        <input
          value={nameSearch}
          onChange={(e) => setNameSearch(e.target.value)}
          placeholder="Search name…"
          className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-primary-500 w-48"
        />
      </div>

      {/* Feed */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        {hitsLoading ? (
          <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
        ) : hits.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">
            No funders yet. Enable a source above and click "Scan", or add a curated entry.
          </p>
        ) : (
          hits.map((h) => (
            <FunderCard
              key={h.id}
              hit={h}
              defs={defs}
              expanded={expandedHitId === h.id}
              onToggle={() => setExpandedHitId(expandedHitId === h.id ? null : h.id)}
              onPin={() => handlePinToggle(h)}
              onNoteChange={(note) => handleNoteChange(h, note)}
              onStatusChange={(status) => handleStatusChange(h, status)}
              selected={selectedForExport.has(h.id)}
              onSelectToggle={() => handleSelectToggle(h.id)}
            />
          ))
        )}
      </div>

      <PinnedDrawer
        open={pinDrawerOpen}
        onClose={() => setPinDrawerOpen(false)}
        pinnedHits={pinnedHits}
        defs={defs}
        onUnpin={(h) => handlePinToggle(h)}
        onNoteChange={(h, note) => handleNoteChange(h, note)}
      />
    </div>
  );
};

export default Funders;
