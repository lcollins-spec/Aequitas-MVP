import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Pin,
  PinOff,
  X,
  RefreshCw,
  Plus,
  ChevronDown,
  ChevronUp,
  Layers,
  Settings,
  Upload,
  Trash2,
  Sliders,
} from 'lucide-react';
import * as signalsApi from '../services/signalsApi';
import { HIT_STATUSES } from '../services/signalsApi';
import type { SignalMarket, SignalDefinition, SignalHit, HitStatus, MarketFeedPayload } from '../services/signalsApi';

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function formatCurrency(n?: number | null): string {
  if (n === null || n === undefined) return '—';
  return `$${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

function sourceLabel(source: string, defs: SignalDefinition[]): string {
  return defs.find((d) => d.key === source)?.label ?? source;
}

// ── Pinned Drawer ──────────────────────────────────────────────────────────

interface PinnedDrawerProps {
  open: boolean;
  onClose: () => void;
  pinnedHits: SignalHit[];
  markets: SignalMarket[];
  defs: SignalDefinition[];
  onUnpin: (hit: SignalHit) => void;
  onNoteChange: (hit: SignalHit, note: string) => void;
}

const PinnedDrawer = ({ open, onClose, pinnedHits, markets, defs, onUnpin, onNoteChange }: PinnedDrawerProps) => {
  const pinned = pinnedHits;
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
            <h2 className="text-base font-semibold text-gray-800">Pinned Leads</h2>
            <span className="text-xs text-gray-400">({pinned.length})</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {pinned.length === 0 ? (
            <p className="text-sm text-gray-400 text-center mt-8">
              No pinned leads yet.<br />Click the pin icon on any hit.
            </p>
          ) : (
            pinned.map((h) => {
              const market = markets.find((m) => m.id === h.market_id);
              return (
                <div key={h.id} className="border border-gray-200 rounded-lg p-4 relative">
                  <button
                    onClick={() => onUnpin(h)}
                    className="absolute top-3 right-3 text-gray-300 hover:text-red-400 transition-colors"
                    aria-label="Unpin"
                  >
                    <X size={14} />
                  </button>
                  <div className="pr-5 mb-2">
                    <p className="text-sm font-medium text-gray-800 leading-snug">{h.address}</p>
                    <p className="text-xs text-gray-400">{market?.name}</p>
                  </div>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-primary-50 text-primary-800 border border-primary-200">
                      {sourceLabel(h.source, defs)}
                    </span>
                    {h.stacked_count >= 2 && (
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                        {h.stacked_count} signals matched
                      </span>
                    )}
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
              );
            })
          )}
        </div>
      </div>
    </>
  );
};

// ── Hit card ─────────────────────────────────────────────────────────────────

interface HitCardProps {
  hit: SignalHit;
  market?: SignalMarket;
  defs: SignalDefinition[];
  expanded: boolean;
  onToggle: () => void;
  onPin: () => void;
  onNoteChange: (note: string) => void;
  onStatusChange: (status: HitStatus) => void;
}

const HitCard = ({ hit, market, defs, expanded, onToggle, onPin, onNoteChange, onStatusChange }: HitCardProps) => {
  return (
    <div className={`p-5 hover:bg-gray-50 transition-colors border-b border-gray-100 ${hit.stacked_count >= 2 ? 'border-l-2 border-amber-400' : ''}`}>
      <div className="flex items-start justify-between cursor-pointer" onClick={onToggle}>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <h3 className="font-medium text-gray-800">{hit.address || 'Unknown address'}</h3>
            {hit.stacked_count >= 2 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                <Layers size={11} /> {hit.stacked_count} signals matched
              </span>
            )}
            {hit.owner_stacked_count >= 2 && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                <Layers size={11} /> {hit.owner_stacked_count} hits, same owner
              </span>
            )}
            {hit.is_lihtc && (
              <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700 border border-red-200">
                LIHTC
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
              onChange={(e) => onStatusChange(e.target.value as HitStatus)}
              className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200 focus:outline-none focus:border-primary-500"
            >
              {HIT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="text-xs text-gray-400">{market?.name ?? hit.market_id}</span>
            <span className="text-xs text-gray-400">Seen {formatTimestamp(hit.last_seen_at)}</span>
          </div>
          {expanded && (
            <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm text-gray-600">
              <div><span className="text-gray-400">Owner:</span> {hit.owner_name || '—'}</div>
              <div><span className="text-gray-400">Mailing address:</span> {hit.owner_mailing_address || '—'}</div>
              <div><span className="text-gray-400">Units:</span> {hit.unit_count ?? '—'}</div>
              <div><span className="text-gray-400">Year built:</span> {hit.year_built ?? '—'}</div>
              <div><span className="text-gray-400">Assessed value:</span> {formatCurrency(hit.assessed_value)}</div>
              {hit.listing_price != null && (
                <div><span className="text-gray-400">Listing price:</span> {formatCurrency(hit.listing_price)}</div>
              )}
              {hit.listing_broker && (
                <div><span className="text-gray-400">Broker:</span> {hit.listing_broker}</div>
              )}
              {hit.listing_url && (
                <div className="col-span-2">
                  <a href={hit.listing_url} target="_blank" rel="noreferrer" className="text-primary-800 hover:text-primary-700">
                    View listing →
                  </a>
                </div>
              )}
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

// ── Market feed config ──────────────────────────────────────────────────────
// Configures the ArcGIS/Socrata feed URL + field mapping that lets the
// absentee_owner / code_violations connectors run against a real county/city
// open-data source. See signal_connectors.py for how these are consumed.

function parseMapping(json?: string | null): Record<string, string> {
  try { return json ? JSON.parse(json) : {}; } catch { return {}; }
}

interface MarketFeedConfigProps {
  market: SignalMarket;
  onSave: (patch: MarketFeedPayload) => Promise<void>;
}

const MarketFeedConfig = ({ market, onSave }: MarketFeedConfigProps) => {
  const initialAssessor = parseMapping(market.assessor_field_mapping);
  const initialCode = parseMapping(market.code_violations_field_mapping);
  const initialTax = parseMapping(market.tax_delinquent_field_mapping);

  const [form, setForm] = useState({
    assessorFeedType: market.assessor_feed_type || '',
    assessorFeedUrl: market.assessor_feed_url || '',
    assessorOwnerName: initialAssessor.owner_name || '',
    assessorMailingAddress: initialAssessor.mailing_address || '',
    assessorSitusAddress: initialAssessor.situs_address || '',
    assessorUnits: initialAssessor.units || '',
    assessorSaleDate: initialAssessor.sale_date || '',
    assessorAssessedValue: initialAssessor.assessed_value || '',
    codeFeedType: market.code_violations_feed_type || '',
    codeFeedUrl: market.code_violations_feed_url || '',
    codeAddress: initialCode.address || '',
    codeUnits: initialCode.units || '',
    taxFeedType: market.tax_delinquent_feed_type || '',
    taxFeedUrl: market.tax_delinquent_feed_url || '',
    taxOwnerName: initialTax.owner_name || '',
    taxAddress: initialTax.address || '',
    taxUnits: initialTax.units || '',
    taxAssessedValue: initialTax.assessed_value || '',
  });
  const [saving, setSaving] = useState(false);

  const update = (field: keyof typeof form, value: string) => setForm((f) => ({ ...f, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const assessorMapping: Record<string, string> = {};
      if (form.assessorOwnerName) assessorMapping.owner_name = form.assessorOwnerName;
      if (form.assessorMailingAddress) assessorMapping.mailing_address = form.assessorMailingAddress;
      if (form.assessorSitusAddress) assessorMapping.situs_address = form.assessorSitusAddress;
      if (form.assessorUnits) assessorMapping.units = form.assessorUnits;
      if (form.assessorSaleDate) assessorMapping.sale_date = form.assessorSaleDate;
      if (form.assessorAssessedValue) assessorMapping.assessed_value = form.assessorAssessedValue;

      const codeMapping: Record<string, string> = {};
      if (form.codeAddress) codeMapping.address = form.codeAddress;
      if (form.codeUnits) codeMapping.units = form.codeUnits;

      const taxMapping: Record<string, string> = {};
      if (form.taxOwnerName) taxMapping.owner_name = form.taxOwnerName;
      if (form.taxAddress) taxMapping.address = form.taxAddress;
      if (form.taxUnits) taxMapping.units = form.taxUnits;
      if (form.taxAssessedValue) taxMapping.assessed_value = form.taxAssessedValue;

      await onSave({
        assessor_feed_url: form.assessorFeedUrl || null,
        assessor_feed_type: (form.assessorFeedType || null) as SignalMarket['assessor_feed_type'],
        assessor_field_mapping: form.assessorFeedUrl && Object.keys(assessorMapping).length ? assessorMapping : null,
        tax_delinquent_feed_url: form.taxFeedUrl || null,
        tax_delinquent_feed_type: (form.taxFeedType || null) as SignalMarket['tax_delinquent_feed_type'],
        tax_delinquent_field_mapping: form.taxFeedUrl && Object.keys(taxMapping).length ? taxMapping : null,
        code_violations_feed_url: form.codeFeedUrl || null,
        code_violations_feed_type: (form.codeFeedType || null) as SignalMarket['code_violations_feed_type'],
        code_violations_field_mapping: form.codeFeedUrl && Object.keys(codeMapping).length ? codeMapping : null,
      });
    } finally {
      setSaving(false);
    }
  };

  const selectClass = 'text-sm px-2.5 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-primary-500';
  const inputClass = 'text-sm px-2.5 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-primary-500';
  const smallInputClass = 'text-xs px-2 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-primary-500';

  return (
    <div className="px-3 pb-3 pt-1 bg-gray-50 border border-t-0 border-gray-100 rounded-b-md space-y-4">
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 mt-2">
          Assessor / Parcel Feed <span className="normal-case font-normal text-gray-400">(powers Absentee / Long-Hold Owner)</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select value={form.assessorFeedType} onChange={(e) => update('assessorFeedType', e.target.value)} className={selectClass}>
            <option value="">Feed type…</option>
            <option value="arcgis">ArcGIS FeatureServer/MapServer</option>
            <option value="socrata">Socrata SODA API</option>
          </select>
          <input value={form.assessorFeedUrl} onChange={(e) => update('assessorFeedUrl', e.target.value)} placeholder="Feed URL" className={inputClass} />
        </div>
        <div className="grid grid-cols-3 gap-2">
          <input value={form.assessorOwnerName} onChange={(e) => update('assessorOwnerName', e.target.value)} placeholder="owner_name field" className={smallInputClass} />
          <input value={form.assessorMailingAddress} onChange={(e) => update('assessorMailingAddress', e.target.value)} placeholder="mailing_address field" className={smallInputClass} />
          <input value={form.assessorSitusAddress} onChange={(e) => update('assessorSitusAddress', e.target.value)} placeholder="situs_address field" className={smallInputClass} />
          <input value={form.assessorUnits} onChange={(e) => update('assessorUnits', e.target.value)} placeholder="units field" className={smallInputClass} />
          <input value={form.assessorSaleDate} onChange={(e) => update('assessorSaleDate', e.target.value)} placeholder="sale_date field" className={smallInputClass} />
          <input value={form.assessorAssessedValue} onChange={(e) => update('assessorAssessedValue', e.target.value)} placeholder="assessed_value field" className={smallInputClass} />
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Code Violations Feed</div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select value={form.codeFeedType} onChange={(e) => update('codeFeedType', e.target.value)} className={selectClass}>
            <option value="">Feed type…</option>
            <option value="arcgis">ArcGIS FeatureServer/MapServer</option>
            <option value="socrata">Socrata SODA API</option>
          </select>
          <input value={form.codeFeedUrl} onChange={(e) => update('codeFeedUrl', e.target.value)} placeholder="Feed URL" className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={form.codeAddress} onChange={(e) => update('codeAddress', e.target.value)} placeholder="address field" className={smallInputClass} />
          <input value={form.codeUnits} onChange={(e) => update('codeUnits', e.target.value)} placeholder="units field (optional)" className={smallInputClass} />
        </div>
      </div>
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Tax Delinquent Feed <span className="normal-case font-normal text-gray-400">(live feed — where available; otherwise use the CSV upload button instead)</span>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-2">
          <select value={form.taxFeedType} onChange={(e) => update('taxFeedType', e.target.value)} className={selectClass}>
            <option value="">Feed type…</option>
            <option value="arcgis">ArcGIS FeatureServer/MapServer</option>
            <option value="socrata">Socrata SODA API</option>
          </select>
          <input value={form.taxFeedUrl} onChange={(e) => update('taxFeedUrl', e.target.value)} placeholder="Feed URL" className={inputClass} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <input value={form.taxOwnerName} onChange={(e) => update('taxOwnerName', e.target.value)} placeholder="owner_name field" className={smallInputClass} />
          <input value={form.taxAddress} onChange={(e) => update('taxAddress', e.target.value)} placeholder="address field" className={smallInputClass} />
          <input value={form.taxUnits} onChange={(e) => update('taxUnits', e.target.value)} placeholder="units field (optional)" className={smallInputClass} />
          <input value={form.taxAssessedValue} onChange={(e) => update('taxAssessedValue', e.target.value)} placeholder="assessed/tax amount field (optional)" className={smallInputClass} />
        </div>
      </div>
      <button
        onClick={handleSave}
        disabled={saving}
        className="px-3 py-1.5 text-sm bg-primary-800 text-white rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save feed config'}
      </button>
    </div>
  );
};

// ── Main page ────────────────────────────────────────────────────────────────

const Sourcing = () => {
  const [markets, setMarkets] = useState<SignalMarket[]>([]);
  const [defs, setDefs] = useState<SignalDefinition[]>([]);
  const [hits, setHits] = useState<SignalHit[]>([]);
  // Pinned hits are tracked separately from the (market/source-filtered) `hits` list above —
  // otherwise switching a filter would make a pinned hit outside that filter vanish from the
  // Pinned drawer even though it's still pinned in the database.
  const [pinnedHits, setPinnedHits] = useState<SignalHit[]>([]);
  const [digestCount, setDigestCount] = useState(0);

  const [filterMarketId, setFilterMarketId] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');
  const [stackedOnly, setStackedOnly] = useState(false);
  // Big-bucket pivot: ingestion captures everything now, these are pure UI
  // filters. Defaults match the stated target (20-80 units, built after
  // 1960, no LIHTC) but are all removable — unknown values always pass
  // through rather than being excluded (server-side, same permissive
  // philosophy used everywhere else in this engine).
  const [unitFilterOn, setUnitFilterOn] = useState(true);
  const [builtAfterOn, setBuiltAfterOn] = useState(true);
  const [excludeLihtcOn, setExcludeLihtcOn] = useState(true);
  const [ownerSearch, setOwnerSearch] = useState('');

  const [expandedHitId, setExpandedHitId] = useState<string | null>(null);
  const [pinDrawerOpen, setPinDrawerOpen] = useState(false);
  const [showSignalPanel, setShowSignalPanel] = useState(false);
  const [showMarketEditor, setShowMarketEditor] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [newMarketName, setNewMarketName] = useState('');
  const [newMarketCity, setNewMarketCity] = useState('');
  const [newMarketState, setNewMarketState] = useState('');
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const [csvUploadMarketId, setCsvUploadMarketId] = useState<string | null>(null);
  const [feedConfigMarketId, setFeedConfigMarketId] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);

  const [hitsLoading, setHitsLoading] = useState(true);

  const refreshHits = useCallback(async () => {
    setHitsLoading(true);
    try {
      const loaded = await signalsApi.fetchHits({
        marketId: filterMarketId !== 'all' ? filterMarketId : undefined,
        source: filterSource !== 'all' ? filterSource : undefined,
        minStacked: stackedOnly ? 2 : undefined,
        unitMin: unitFilterOn ? 20 : undefined,
        unitMax: unitFilterOn ? 80 : undefined,
        builtAfter: builtAfterOn ? 1960 : undefined,
        excludeLihtc: excludeLihtcOn,
        ownerSearch: ownerSearch.trim() || undefined,
      });
      setHits(loaded);
    } finally {
      setHitsLoading(false);
    }
  }, [filterMarketId, filterSource, stackedOnly, unitFilterOn, builtAfterOn, excludeLihtcOn, ownerSearch]);

  const refreshPinnedHits = useCallback(async () => {
    const loaded = await signalsApi.fetchHits({ pinned: true });
    setPinnedHits(loaded);
  }, []);

  useEffect(() => {
    (async () => {
      const [m, d] = await Promise.all([signalsApi.fetchMarkets(), signalsApi.fetchDefinitions()]);
      setMarkets(m);
      setDefs(d);
      const digest = await signalsApi.fetchDigest();
      setDigestCount(digest.count);
      await refreshPinnedHits();
      setInitialLoading(false);
    })();
  }, [refreshPinnedHits]);

  useEffect(() => {
    refreshHits();
  }, [refreshHits]);

  const handleScan = async (marketId?: string) => {
    setScanning(true);
    try {
      await signalsApi.triggerScan(marketId);
      await refreshHits();
      const digest = await signalsApi.fetchDigest();
      setDigestCount(digest.count);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setScanning(false);
    }
  };

  const handleToggleSignal = async (def: SignalDefinition) => {
    if (def.stubbed) return;
    try {
      const updated = await signalsApi.updateDefinition(def.id, !def.enabled);
      setDefs((prev) => prev.map((d) => (d.id === def.id ? updated : d)));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to update signal');
    }
  };

  const handleAddMarket = async () => {
    if (!newMarketName.trim()) return;
    try {
      const created = await signalsApi.createMarket({
        name: newMarketName.trim(), city: newMarketCity.trim(), state: newMarketState.trim(),
      });
      setMarkets((prev) => [...prev, created]);
      setNewMarketName(''); setNewMarketCity(''); setNewMarketState('');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to add market');
    }
  };

  const handleSaveFeedConfig = async (marketId: string, patch: MarketFeedPayload) => {
    try {
      const updated = await signalsApi.updateMarket(marketId, patch);
      setMarkets((prev) => prev.map((m) => (m.id === marketId ? updated : m)));
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to save feed config');
    }
  };

  const handleDeleteMarket = async (id: string) => {
    if (!confirm('Remove this market and all its hits?')) return;
    try {
      await signalsApi.deleteMarket(id);
      setMarkets((prev) => prev.filter((m) => m.id !== id));
      if (filterMarketId === id) setFilterMarketId('all');
      await refreshHits();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to remove market');
    }
  };

  // Keeps `hits` (filtered feed) and `pinnedHits` (unfiltered, drives the drawer) consistent
  // after any pin/note change, regardless of which view triggered it.
  const applyHitUpdate = (hitId: string, updated: SignalHit) => {
    setHits((prev) => prev.map((h) => (h.id === hitId ? { ...updated, stacked_count: h.stacked_count } : h)));
    setPinnedHits((prev) => {
      const stackedCount = prev.find((h) => h.id === hitId)?.stacked_count
        ?? hits.find((h) => h.id === hitId)?.stacked_count
        ?? 1;
      const withUpdate = { ...updated, stacked_count: stackedCount };
      if (!updated.pinned) return prev.filter((h) => h.id !== hitId);
      const exists = prev.some((h) => h.id === hitId);
      return exists ? prev.map((h) => (h.id === hitId ? withUpdate : h)) : [withUpdate, ...prev];
    });
  };

  const handlePinToggle = async (hit: SignalHit) => {
    const updated = await signalsApi.updateHit(hit.id, { pinned: !hit.pinned });
    applyHitUpdate(hit.id, updated);
  };

  const handleNoteChange = async (hit: SignalHit, note: string) => {
    const updated = await signalsApi.updateHit(hit.id, { note });
    applyHitUpdate(hit.id, updated);
  };

  const handleStatusChange = async (hit: SignalHit, status: HitStatus) => {
    const updated = await signalsApi.updateHit(hit.id, { status });
    applyHitUpdate(hit.id, updated);
  };

  const handleCsvFileChosen = async (file: File) => {
    if (!csvUploadMarketId) return;
    try {
      const result = await signalsApi.importTaxDelinquent(csvUploadMarketId, file);
      await refreshHits();
      alert(`Imported ${result.created} new tax-delinquent hits.`);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Import failed');
    } finally {
      setCsvUploadMarketId(null);
      if (csvInputRef.current) csvInputRef.current.value = '';
    }
  };

  const publicRecordsSignals = defs.filter((d) => d.category === 'public_records');
  const inboxSignals = defs.filter((d) => d.category === 'inbox');
  const allSources = defs.map((d) => d.key);

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <input
        ref={csvInputRef}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={(e) => e.target.files?.[0] && handleCsvFileChosen(e.target.files[0])}
      />

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800">Sourcing Signals</h1>
          <p className="text-sm text-gray-500 mt-1">
            Public-records + HUD signals for off-market multifamily leads. Runs on-demand — click "Scan all" or scan a single market below.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPinDrawerOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-sm border border-gray-200 rounded-md text-gray-600 hover:bg-gray-50 transition-colors"
          >
            <Pin size={15} /> Pinned
          </button>
          <button
            onClick={() => handleScan()}
            disabled={scanning}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-primary-800 text-white rounded-md hover:bg-primary-700 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={15} className={scanning ? 'animate-spin' : ''} /> {scanning ? 'Scanning…' : 'Scan all'}
          </button>
        </div>
      </div>

      {scanning && (
        <div className="mb-6 px-4 py-3 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-500">
          Scanning all markets and signals — the first scan after a backend restart can take up to a minute or two while the HUD national datasets download. Later scans in the same session are faster.
        </div>
      )}

      {digestCount > 0 && (
        <div className="mb-6 px-4 py-3 bg-primary-50 border border-primary-200 rounded-lg text-sm text-primary-800">
          <strong>{digestCount}</strong> new hit{digestCount === 1 ? '' : 's'} in the last 7 days.
        </div>
      )}

      {/* Signal toggle panel */}
      <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowSignalPanel((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <span className="flex items-center gap-2">
            <Settings size={15} /> Signal library {initialLoading ? '(loading…)' : `(${defs.filter((d) => d.enabled).length} active)`}
          </span>
          {showSignalPanel ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showSignalPanel && (
          <div className="p-4 space-y-4">
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Public Records</div>
              <div className="grid grid-cols-2 gap-2">
                {publicRecordsSignals.map((d) => (
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
                      onChange={() => handleToggleSignal(d)}
                    />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Inbox</div>
              <div className="grid grid-cols-2 gap-2">
                {inboxSignals.map((d) => (
                  <label
                    key={d.id}
                    title={d.stubbed ? d.disabled_reason ?? undefined : undefined}
                    className="flex items-center gap-2 text-sm px-3 py-2 rounded-md border border-gray-100 bg-gray-50 opacity-50 cursor-not-allowed"
                  >
                    <input type="checkbox" checked={d.enabled} disabled />
                    {d.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Market editor */}
      <div className="mb-6 border border-gray-200 rounded-lg overflow-hidden">
        <button
          onClick={() => setShowMarketEditor((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 text-sm font-medium text-gray-700 hover:bg-gray-100 transition-colors"
        >
          <span>Markets {initialLoading ? '(loading…)' : `(${markets.length})`}</span>
          {showMarketEditor ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showMarketEditor && (
          <div className="p-4 space-y-3">
            {markets.map((m) => {
              const feedsConfigured = !!(m.assessor_feed_url || m.code_violations_feed_url || m.tax_delinquent_feed_url);
              const cityState = [m.city, m.state].filter(Boolean).join(', ');
              const cityStateRedundant = !cityState || cityState === m.name;
              return (
                <div key={m.id}>
                  <div className="flex items-center justify-between px-3 py-2 border border-gray-100 rounded-md">
                    <div>
                      <span className="text-sm font-medium text-gray-800">{m.name}</span>
                      {!cityStateRedundant && (
                        <span className="text-xs text-gray-400 ml-2">{cityState}</span>
                      )}
                      {!feedsConfigured && (
                        <span className="text-xs text-amber-600 ml-2">No feeds configured yet</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setFeedConfigMarketId(feedConfigMarketId === m.id ? null : m.id)}
                        className={`text-xs px-2.5 py-1 border rounded flex items-center gap-1 transition-colors ${
                          feedConfigMarketId === m.id ? 'border-primary-300 bg-primary-50 text-primary-800' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                        }`}
                      >
                        <Sliders size={12} /> Configure feeds
                      </button>
                      <button
                        onClick={() => handleScan(m.id)}
                        disabled={scanning}
                        className="text-xs px-2.5 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                      >
                        Scan now
                      </button>
                      <button
                        onClick={() => { setCsvUploadMarketId(m.id); csvInputRef.current?.click(); }}
                        className="text-xs px-2.5 py-1 border border-gray-200 rounded text-gray-600 hover:bg-gray-50 flex items-center gap-1"
                      >
                        <Upload size={12} /> Tax-delinquent CSV
                      </button>
                      <button
                        onClick={() => handleDeleteMarket(m.id)}
                        className="text-gray-300 hover:text-red-400 transition-colors"
                        aria-label="Remove market"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                  {feedConfigMarketId === m.id && (
                    <MarketFeedConfig market={m} onSave={(patch) => handleSaveFeedConfig(m.id, patch)} />
                  )}
                </div>
              );
            })}
            <div className="flex items-center gap-2 pt-2">
              <input
                value={newMarketName}
                onChange={(e) => setNewMarketName(e.target.value)}
                placeholder="Market name (e.g. Tampa, FL)"
                className="flex-1 text-sm px-2.5 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-primary-500"
              />
              <input
                value={newMarketCity}
                onChange={(e) => setNewMarketCity(e.target.value)}
                placeholder="City"
                className="w-28 text-sm px-2.5 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-primary-500"
              />
              <input
                value={newMarketState}
                onChange={(e) => setNewMarketState(e.target.value)}
                placeholder="State"
                className="w-20 text-sm px-2.5 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-primary-500"
              />
              <button
                onClick={handleAddMarket}
                className="flex items-center gap-1 px-3 py-1.5 text-sm bg-primary-800 text-white rounded-md hover:bg-primary-700 transition-colors"
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <select
          value={filterMarketId}
          onChange={(e) => setFilterMarketId(e.target.value)}
          className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-primary-500"
        >
          <option value="all">All markets</option>
          {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        <select
          value={filterSource}
          onChange={(e) => setFilterSource(e.target.value)}
          className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-primary-500"
        >
          <option value="all">All sources</option>
          {allSources.map((s) => <option key={s} value={s}>{sourceLabel(s, defs)}</option>)}
        </select>
        <button
          onClick={() => setStackedOnly((v) => !v)}
          className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-md border transition-colors ${
            stackedOnly ? 'bg-amber-50 text-amber-700 border-amber-200' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          <Layers size={14} /> Stacked (2+)
        </button>
        <button
          onClick={() => setUnitFilterOn((v) => !v)}
          className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${
            unitFilterOn ? 'bg-primary-50 text-primary-800 border-primary-200' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          20-80 units
        </button>
        <button
          onClick={() => setBuiltAfterOn((v) => !v)}
          className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${
            builtAfterOn ? 'bg-primary-50 text-primary-800 border-primary-200' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          Built after 1960
        </button>
        <button
          onClick={() => setExcludeLihtcOn((v) => !v)}
          className={`text-sm px-3 py-1.5 rounded-md border transition-colors ${
            excludeLihtcOn ? 'bg-primary-50 text-primary-800 border-primary-200' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}
        >
          Exclude LIHTC
        </button>
        <input
          value={ownerSearch}
          onChange={(e) => setOwnerSearch(e.target.value)}
          placeholder="Search owner name…"
          className="text-sm px-2.5 py-1.5 border border-gray-200 rounded-md focus:outline-none focus:border-primary-500 w-48"
        />
      </div>

      {/* Feed */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white">
        {hitsLoading ? (
          <p className="text-sm text-gray-400 text-center py-12">Loading…</p>
        ) : hits.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">
            No hits yet. Configure a market's data feeds under "Markets" above, then click "Scan all".
          </p>
        ) : (
          hits.map((h) => (
            <HitCard
              key={h.id}
              hit={h}
              market={markets.find((m) => m.id === h.market_id)}
              defs={defs}
              expanded={expandedHitId === h.id}
              onToggle={() => setExpandedHitId(expandedHitId === h.id ? null : h.id)}
              onPin={() => handlePinToggle(h)}
              onNoteChange={(note) => handleNoteChange(h, note)}
              onStatusChange={(status) => handleStatusChange(h, status)}
            />
          ))
        )}
      </div>

      <PinnedDrawer
        open={pinDrawerOpen}
        onClose={() => setPinDrawerOpen(false)}
        pinnedHits={pinnedHits}
        markets={markets}
        defs={defs}
        onUnpin={(h) => handlePinToggle(h)}
        onNoteChange={(h, note) => handleNoteChange(h, note)}
      />
    </div>
  );
};

export default Sourcing;
