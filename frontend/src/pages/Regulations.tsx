import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronDown,
  ChevronUp,
  CheckCircle,
  AlertCircle,
  Clock,
  FileText,
  Plus,
  X,
  RefreshCw,
  Tag,
  Star,
  Pin,
  PinOff,
  ArrowLeft,
} from 'lucide-react';
import type {
  MarketEntry,
  MarketData,
  RegulationItem,
  ApiRegulationStatus,
  RegulationJurisdiction,
  PinnedItem,
} from '../types/regulation';
import { fetchMarketRegulations } from '../services/regulationsApi';

// ── localStorage keys (settings only — cache is in DB) ─────────────────────
const LS_MARKETS = 'aequitas_reg_markets';
const LS_TOPICS = 'aequitas_reg_topics';
const LS_DATA_PREFIX = 'aequitas_reg_data_';  // legacy — migrated on first load
const LS_FEATURED = 'aequitas_reg_featured';
const LS_PINS = 'aequitas_reg_pins';
const AUTO_REFRESH_MS = 24 * 60 * 60 * 1000;

const DEFAULT_TOPICS = [
  'rent control',
  'eviction moratorium',
  'LIHTC',
  'ADU regulations',
  'property tax exemptions',
  'zoning variance',
  'landlord-tenant law',
];

const DEFAULT_MARKETS: MarketEntry[] = [
  { id: '1', name: 'Austin, TX' },
  { id: '2', name: 'Phoenix, AZ' },
];

// ── localStorage helpers ───────────────────────────────────────────────────

function loadMarkets(): MarketEntry[] {
  try {
    const raw = localStorage.getItem(LS_MARKETS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_MARKETS;
}
function saveMarkets(m: MarketEntry[]) {
  localStorage.setItem(LS_MARKETS, JSON.stringify(m));
  fetch('/api/v1/app-data/reg_markets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: m }) }).catch(() => {});
}

function loadTopics(): string[] {
  try {
    const raw = localStorage.getItem(LS_TOPICS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_TOPICS;
}
function saveTopics(t: string[]) {
  localStorage.setItem(LS_TOPICS, JSON.stringify(t));
  fetch('/api/v1/app-data/reg_topics', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: t }) }).catch(() => {});
}

async function loadMarketData(id: string): Promise<MarketData | null> {
  try {
    const r = await fetch(`/api/v1/app-data/reg_cache_${id}`);
    if (!r.ok) return null;
    const j = await r.json();
    if (j?.value) return j.value as MarketData;
  } catch {}
  return null;
}

function saveMarketData(id: string, d: MarketData) {
  // Persist to DB (fire-and-forget); also migrate away from localStorage
  fetch(`/api/v1/app-data/reg_cache_${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: d }),
  }).catch(() => {});
  // Remove legacy localStorage key
  localStorage.removeItem(LS_DATA_PREFIX + id);
}

function loadFeatured(): Set<string> {
  try {
    const raw = localStorage.getItem(LS_FEATURED);
    if (raw) return new Set(JSON.parse(raw));
  } catch {}
  return new Set();
}
function saveFeatured(ids: Set<string>) {
  const arr = [...ids];
  localStorage.setItem(LS_FEATURED, JSON.stringify(arr));
  fetch('/api/v1/app-data/reg_featured', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: arr }) }).catch(() => {});
}

function loadPins(): Record<string, PinnedItem[]> {
  try {
    const raw = localStorage.getItem(LS_PINS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}
function savePins(p: Record<string, PinnedItem[]>) {
  localStorage.setItem(LS_PINS, JSON.stringify(p));
  fetch('/api/v1/app-data/reg_pins', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ value: p }) }).catch(() => {});
}

function isStale(lastChecked: string): boolean {
  return Date.now() - new Date(lastChecked).getTime() > AUTO_REFRESH_MS;
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

// ── Status helpers ─────────────────────────────────────────────────────────

function getStatusColors(status: ApiRegulationStatus) {
  switch (status) {
    case 'funding': return { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' };
    case 'enabling': return { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
    case 'risk': return { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
    default: return { bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200' };
  }
}

function getStatusLabel(status: ApiRegulationStatus): string {
  switch (status) {
    case 'funding': return 'Funding Opportunity';
    case 'enabling': return 'Enabling Legislation';
    case 'risk': return 'Regulatory Risk';
    default: return status;
  }
}

// ── Pinned Drawer ──────────────────────────────────────────────────────────

interface PinnedDrawerProps {
  open: boolean;
  onClose: () => void;
  pins: Record<string, PinnedItem[]>;
  markets: MarketEntry[];
  onUnpin: (marketId: string, pinId: string) => void;
  onNoteChange: (marketId: string, pinId: string, note: string) => void;
}

const PinnedDrawer = ({ open, onClose, pins, markets, onUnpin, onNoteChange }: PinnedDrawerProps) => {
  const allPinned = markets.flatMap((m) =>
    (pins[m.id] ?? []).map((p) => ({ ...p, marketName: m.name }))
  );

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/20 z-40"
          onClick={onClose}
        />
      )}

      {/* Drawer */}
      <div
        className={`fixed top-0 right-0 h-full w-[420px] bg-white shadow-2xl z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Pin size={16} className="text-blue-500" />
            <h2 className="text-base font-semibold text-gray-800">Pinned Regulations</h2>
            <span className="text-xs text-gray-400">({allPinned.length})</span>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {allPinned.length === 0 ? (
            <p className="text-sm text-gray-400 text-center mt-8">
              No pinned regulations yet.<br />Click the pin icon on any regulation card.
            </p>
          ) : (
            markets.map((m) => {
              const mPins = pins[m.id] ?? [];
              if (mPins.length === 0) return null;
              return (
                <div key={m.id}>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                    {m.name}
                  </div>
                  <div className="space-y-4">
                    {mPins.map((p) => {
                      const colors = getStatusColors(p.regulation.status);
                      return (
                        <div key={p.id} className="border border-gray-200 rounded-lg p-4 relative">
                          {/* Unpin */}
                          <button
                            onClick={() => onUnpin(m.id, p.id)}
                            className="absolute top-3 right-3 text-gray-300 hover:text-red-400 transition-colors"
                            aria-label="Unpin"
                          >
                            <X size={14} />
                          </button>

                          {/* Title + badges */}
                          <div className="pr-5 mb-2">
                            <p className="text-sm font-medium text-gray-800 leading-snug">{p.regulation.title}</p>
                          </div>
                          <div className="flex items-center gap-2 mb-3">
                            <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colors.bg} ${colors.text} ${colors.border}`}>
                              {getStatusLabel(p.regulation.status)}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600 border border-gray-200 capitalize">
                              {p.regulation.jurisdiction}
                            </span>
                          </div>

                          {/* Summary */}
                          <p className="text-xs text-gray-500 mb-3 leading-relaxed">{p.regulation.summary}</p>

                          {/* Notes textarea */}
                          <div>
                            <label className="block text-xs font-semibold text-gray-500 mb-1">
                              Notes / Questions / Ideas
                            </label>
                            <textarea
                              rows={3}
                              defaultValue={p.note}
                              placeholder="Add notes, questions, or ideas…"
                              onBlur={(e) => onNoteChange(m.id, p.id, e.target.value)}
                              className="w-full text-sm px-2.5 py-2 border border-gray-200 rounded-md resize-none focus:outline-none focus:border-blue-400 text-gray-700 placeholder-gray-300"
                            />
                          </div>
                        </div>
                      );
                    })}
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

// ── RegCard ────────────────────────────────────────────────────────────────

interface RegCardProps {
  item: RegulationItem;
  expanded: boolean;
  onToggle: () => void;
  icon: 'file' | 'clock';
  isPinned: boolean;
  onPin: () => void;
}

const RegCard = ({ item, expanded, onToggle, icon, isPinned, onPin }: RegCardProps) => {
  const colors = getStatusColors(item.status);
  return (
    <div className={`p-5 hover:bg-gray-50 transition-colors ${isPinned ? 'border-l-2 border-blue-400' : ''}`}>
      <div className="flex items-start justify-between cursor-pointer" onClick={onToggle}>
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            {icon === 'file' ? (
              <FileText size={18} className="text-gray-400 flex-shrink-0" />
            ) : (
              <Clock size={18} className="text-gray-400 flex-shrink-0" />
            )}
            <h3 className="font-medium text-gray-800">{item.title}</h3>
          </div>
          {expanded && (
            <div className="ml-9 mt-3">
              <p className="text-sm text-gray-600">{item.summary}</p>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 ml-4" onClick={(e) => e.stopPropagation()}>
          {/* Pin button */}
          <button
            onClick={onPin}
            className={`p-1 rounded transition-colors ${isPinned ? 'text-blue-500 hover:text-blue-700' : 'text-gray-300 hover:text-blue-400'}`}
            aria-label={isPinned ? 'Unpin' : 'Pin'}
          >
            {isPinned ? <Pin size={15} /> : <PinOff size={15} />}
          </button>
          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${colors.bg} ${colors.text} ${colors.border}`}>
            {getStatusLabel(item.status)}
          </span>
          {expanded ? <ChevronUp size={20} className="text-gray-400" /> : <ChevronDown size={20} className="text-gray-400" />}
        </div>
      </div>
    </div>
  );
};

// ── JurisdictionSection ────────────────────────────────────────────────────

interface JurisdictionSectionProps {
  label: string;
  items: RegulationItem[];
  expanded: Set<string>;
  onToggle: (key: string) => void;
  pins: PinnedItem[];
  onPin: (item: RegulationItem, key: string) => void;
}

const JurisdictionSection = ({ label, items, expanded, onToggle, pins, onPin }: JurisdictionSectionProps) => {
  const current = items.filter((r) => r.type === 'current');
  const upcoming = items.filter((r) => r.type === 'upcoming');
  if (items.length === 0) return null;

  const isPinned = (item: RegulationItem) => pins.some((p) => p.regulation.title === item.title);

  return (
    <div className="bg-white rounded-xl shadow-sm mb-6">
      <div className="p-6 border-b border-gray-200">
        <h2 className="text-lg font-semibold text-gray-800">{label}</h2>
      </div>
      {current.length > 0 && (
        <div>
          <div className="px-6 pt-4 pb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Current Regulations</span>
          </div>
          <div className="divide-y divide-gray-100">
            {current.map((item, i) => {
              const key = `${label}-current-${i}`;
              return (
                <RegCard
                  key={key}
                  item={item}
                  expanded={expanded.has(key)}
                  onToggle={() => onToggle(key)}
                  icon="file"
                  isPinned={isPinned(item)}
                  onPin={() => onPin(item, key)}
                />
              );
            })}
          </div>
        </div>
      )}
      {upcoming.length > 0 && (
        <div className={current.length > 0 ? 'border-t border-gray-200' : ''}>
          <div className="px-6 pt-4 pb-2">
            <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Upcoming Changes</span>
          </div>
          <div className="divide-y divide-gray-100">
            {upcoming.map((item, i) => {
              const key = `${label}-upcoming-${i}`;
              return (
                <RegCard
                  key={key}
                  item={item}
                  expanded={expanded.has(key)}
                  onToggle={() => onToggle(key)}
                  icon="clock"
                  isPinned={isPinned(item)}
                  onPin={() => onPin(item, key)}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ── Main component ─────────────────────────────────────────────────────────

const Regulations = () => {
  const [markets, setMarkets] = useState<MarketEntry[]>(loadMarkets);
  const [selectedMarket, setSelectedMarket] = useState<MarketEntry | null>(null);
  const [featuredIds, setFeaturedIds] = useState<Set<string>>(loadFeatured);
  const [topics, setTopics] = useState<string[]>(loadTopics);
  const [topicsOpen, setTopicsOpen] = useState(false);
  const [newTopic, setNewTopic] = useState('');
  const [showAddMarket, setShowAddMarket] = useState(false);
  const [newMarketInput, setNewMarketInput] = useState('');
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [loadingMarkets, setLoadingMarkets] = useState<Set<string>>(new Set());
  const [errorMarkets, setErrorMarkets] = useState<Record<string, string>>({});
  const [marketDataCache, setMarketDataCache] = useState<Record<string, MarketData>>({});
  const [pins, setPins] = useState<Record<string, PinnedItem[]>>(loadPins);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [view, setView] = useState<'list' | 'detail'>('list');

  const topicsRef = useRef(topics);
  useEffect(() => { topicsRef.current = topics; }, [topics]);

  // ── Init ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const featured = loadFeatured();
    const mktList = loadMarkets();
    const firstFeatured = mktList.find((m) => featured.has(m.id));
    setSelectedMarket(firstFeatured ?? mktList[0] ?? null);

    // Background: hydrate from backend
    const syncKey = async (key: string, lsKey: string, apply: (v: any) => void) => {
      try {
        const r = await fetch(`/api/v1/app-data/${key}`);
        if (!r.ok) return;
        const json = await r.json();
        if (json?.value == null) return;
        localStorage.setItem(lsKey, JSON.stringify(json.value));
        apply(json.value);
      } catch { /* ignore */ }
    };

    syncKey('reg_markets', LS_MARKETS, (v: MarketEntry[]) => {
      if (Array.isArray(v) && v.length > 0) {
        setMarkets(v);
        const feat = loadFeatured();
        const first = v.find(m => feat.has(m.id)) ?? v[0] ?? null;
        setSelectedMarket(first);
      }
    });
    syncKey('reg_topics', LS_TOPICS, (v: string[]) => {
      if (Array.isArray(v) && v.length > 0) setTopics(v);
    });
    syncKey('reg_featured', LS_FEATURED, (v: string[]) => {
      if (Array.isArray(v)) setFeaturedIds(new Set(v));
    });
    syncKey('reg_pins', LS_PINS, (v: Record<string, PinnedItem[]>) => {
      if (v && typeof v === 'object') setPins(v);
    });

    // One-time migration: move any legacy localStorage reg cache entries to DB
    const lsKeys = Object.keys(localStorage).filter(k => k.startsWith(LS_DATA_PREFIX));
    lsKeys.forEach(k => {
      const marketId = k.slice(LS_DATA_PREFIX.length);
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          const data = JSON.parse(raw) as MarketData;
          fetch(`/api/v1/app-data/reg_cache_${marketId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ value: data }),
          }).catch(() => {});
        }
      } catch { /* ignore */ }
      localStorage.removeItem(k);
    });
  }, []);

  useEffect(() => {
    const loadAll = async () => {
      const cache: Record<string, MarketData> = {};
      await Promise.all(markets.map(async (m) => {
        const d = await loadMarketData(m.id);
        if (d) cache[m.id] = d;
      }));
      setMarketDataCache(cache);
    };
    loadAll();
  }, [markets]);

  // Auto-refresh stale markets
  useEffect(() => {
    const checkStale = async () => {
      for (const m of markets) {
        const d = await loadMarketData(m.id);
        if (!d || isStale(d.lastChecked)) triggerFetch(m.id, m.name);
      }
    };
    checkStale();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Fetch ─────────────────────────────────────────────────────────────
  const triggerFetch = useCallback(async (marketId: string, marketName: string) => {
    setLoadingMarkets((prev) => new Set(prev).add(marketId));
    setErrorMarkets((prev) => { const n = { ...prev }; delete n[marketId]; return n; });
    try {
      const regulations = await fetchMarketRegulations(marketName, topicsRef.current);
      const data: MarketData = { regulations, lastChecked: new Date().toISOString() };
      saveMarketData(marketId, data);
      setMarketDataCache((prev) => ({ ...prev, [marketId]: data }));
    } catch (err: any) {
      setErrorMarkets((prev) => ({ ...prev, [marketId]: err.message || 'Failed to load regulations' }));
    } finally {
      setLoadingMarkets((prev) => { const n = new Set(prev); n.delete(marketId); return n; });
    }
  }, []);

  // ── Market CRUD ───────────────────────────────────────────────────────
  const addMarket = () => {
    const name = newMarketInput.trim();
    if (!name) return;
    const id = Date.now().toString();
    const entry: MarketEntry = { id, name };
    const updated = [...markets, entry];
    setMarkets(updated);
    saveMarkets(updated);
    setNewMarketInput('');
    setShowAddMarket(false);
    setSelectedMarket(entry);
    setView('detail');
    triggerFetch(id, name);
  };

  const removeMarket = (id: string) => {
    const updated = markets.filter((m) => m.id !== id);
    setMarkets(updated);
    saveMarkets(updated);
    const newFeatured = new Set(featuredIds);
    newFeatured.delete(id);
    setFeaturedIds(newFeatured);
    saveFeatured(newFeatured);
    if (selectedMarket?.id === id) setSelectedMarket(updated[0] ?? null);
  };

  // ── Topic CRUD ────────────────────────────────────────────────────────
  const addTopic = () => {
    const t = newTopic.trim();
    if (!t || topics.includes(t)) return;
    const updated = [...topics, t];
    setTopics(updated);
    saveTopics(updated);
    setNewTopic('');
  };

  const removeTopic = (t: string) => {
    const updated = topics.filter((x) => x !== t);
    setTopics(updated);
    saveTopics(updated);
  };

  // ── Pin CRUD ──────────────────────────────────────────────────────────
  const togglePin = (marketId: string, marketName: string, item: RegulationItem) => {
    const current = pins[marketId] ?? [];
    const exists = current.find((p) => p.regulation.title === item.title);
    let updated: PinnedItem[];
    if (exists) {
      updated = current.filter((p) => p.id !== exists.id);
    } else {
      const newPin: PinnedItem = {
        id: Date.now().toString(),
        regulation: item,
        note: '',
        pinnedAt: new Date().toISOString(),
        marketId,
        marketName,
      };
      updated = [...current, newPin];
    }
    const newPins = { ...pins, [marketId]: updated };
    setPins(newPins);
    savePins(newPins);
  };

  const unpinItem = (marketId: string, pinId: string) => {
    const updated = (pins[marketId] ?? []).filter((p) => p.id !== pinId);
    const newPins = { ...pins, [marketId]: updated };
    setPins(newPins);
    savePins(newPins);
  };

  const updateNote = (marketId: string, pinId: string, note: string) => {
    const updated = (pins[marketId] ?? []).map((p) => p.id === pinId ? { ...p, note } : p);
    const newPins = { ...pins, [marketId]: updated };
    setPins(newPins);
    savePins(newPins);
  };

  // ── Card toggle ───────────────────────────────────────────────────────
  const toggleCard = (key: string) => {
    setExpandedCards((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key); else n.add(key);
      return n;
    });
  };

  // ── Derived ───────────────────────────────────────────────────────────
  const activeData = selectedMarket ? marketDataCache[selectedMarket.id] : null;
  const regulations = activeData?.regulations ?? [];
  const byJurisdiction = (j: RegulationJurisdiction) => regulations.filter((r) => r.jurisdiction === j);
  const fundingCount = regulations.filter((r) => r.status === 'funding').length;
  const enablingCount = regulations.filter((r) => r.status === 'enabling').length;
  const riskCount = regulations.filter((r) => r.status === 'risk').length;
  const isLoading = selectedMarket ? loadingMarkets.has(selectedMarket.id) : false;
  const error = selectedMarket ? errorMarkets[selectedMarket.id] : undefined;
  const activePins = selectedMarket ? (pins[selectedMarket.id] ?? []) : [];
  const totalPinCount = Object.values(pins).reduce((sum, arr) => sum + arr.length, 0);

  // ── Render ────────────────────────────────────────────────────────────

  // Level 1 — Market Overview
  if (view === 'list') {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-800">Legislation and Government Funding</h1>
          <p className="text-sm text-gray-500 mt-1">Track local regulations affecting affordable housing development</p>
        </div>

        {showAddMarket ? (
          <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4 shadow-sm max-w-sm">
            <input
              autoFocus
              type="text"
              placeholder="City, ST"
              value={newMarketInput}
              onChange={(e) => setNewMarketInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addMarket(); if (e.key === 'Escape') setShowAddMarket(false); }}
              className="w-full text-sm px-2.5 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400 mb-3"
            />
            <div className="flex gap-2">
              <button onClick={addMarket} className="flex-1 text-sm py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium">Add</button>
              <button onClick={() => setShowAddMarket(false)} className="flex-1 text-sm py-1.5 border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddMarket(true)}
            className="mb-6 flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={15} /> Add Market
          </button>
        )}

        {markets.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
            <p>No markets yet. Add one to get started.</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {markets.map((m) => {
              const mData = marketDataCache[m.id];
              const fCount = mData?.regulations.filter(r => r.status === 'funding').length ?? 0;
              const eCount = mData?.regulations.filter(r => r.status === 'enabling').length ?? 0;
              const rCount = mData?.regulations.filter(r => r.status === 'risk').length ?? 0;
              const refreshing = loadingMarkets.has(m.id);
              return (
                <div
                  key={m.id}
                  onClick={() => { setSelectedMarket(m); setView('detail'); }}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-3">
                        <h2 className="text-base font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">{m.name}</h2>
                        {refreshing && <RefreshCw size={13} className="text-blue-400 animate-spin flex-shrink-0" />}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1 px-2.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs font-medium">
                          <CheckCircle size={11} /> {fCount} Funding
                        </span>
                        <span className="flex items-center gap-1 px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-medium">
                          <FileText size={11} /> {eCount} Enabling
                        </span>
                        <span className="flex items-center gap-1 px-2.5 py-0.5 bg-red-50 text-red-700 border border-red-200 rounded-full text-xs font-medium">
                          <AlertCircle size={11} /> {rCount} Risks
                        </span>
                        {mData && (
                          <span className="text-xs text-gray-400 ml-1">
                            Last checked: {formatTimestamp(mData.lastChecked)}
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); removeMarket(m.id); }}
                      className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-opacity flex-shrink-0 ml-3"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  // Level 2 — Market Detail
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Pinned Drawer */}
      <PinnedDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        pins={pins}
        markets={markets}
        onUnpin={unpinItem}
        onNoteChange={updateNote}
      />

      <div className="p-4 md:p-6 lg:p-8">
        {/* Back button */}
        <button
          onClick={() => setView('list')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors mb-4"
        >
          <ArrowLeft size={15} /> All Markets
        </button>

        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-gray-800">Legislation and Government Funding</h1>
            <p className="text-sm text-gray-500 mt-1">Track local regulations affecting affordable housing development</p>
          </div>
          {/* Pinned button */}
          {totalPinCount > 0 && (
            <button
              onClick={() => setDrawerOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
            >
              <Pin size={14} />
              Pinned ({totalPinCount})
            </button>
          )}
        </div>

        {/* Location bar */}
        {selectedMarket && (
          <div className="mb-6 flex items-center justify-between bg-white rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border border-gray-200 rounded-lg">
                {featuredIds.has(selectedMarket.id) && <Star size={13} className="text-yellow-400" fill="currentColor" />}
                <span className="text-sm font-medium text-gray-800">{selectedMarket.name}</span>
              </div>
              {activeData ? (
                <span className="text-xs text-gray-500">Last checked: {formatTimestamp(activeData.lastChecked)}</span>
              ) : isLoading ? (
                <span className="text-xs text-blue-500">Fetching regulations…</span>
              ) : null}
            </div>
            <button
              onClick={() => triggerFetch(selectedMarket.id, selectedMarket.name)}
              disabled={isLoading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50 transition-colors"
            >
              <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        )}

        {/* Search Topics panel */}
        <div className="bg-white rounded-xl shadow-sm mb-6">
          <button
            onClick={() => setTopicsOpen((o) => !o)}
            className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 rounded-xl transition-colors"
          >
            <div className="flex items-center gap-2">
              <Tag size={16} className="text-gray-500" />
              <span className="text-sm font-semibold text-gray-700">Search Topics</span>
              <span className="text-xs text-gray-400">({topics.length} tags — injected into API query)</span>
            </div>
            {topicsOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
          </button>
          {topicsOpen && (
            <div className="px-4 pb-4 border-t border-gray-100">
              <div className="flex flex-wrap gap-2 mt-3">
                {topics.map((t) => (
                  <span key={t} className="flex items-center gap-1 px-2.5 py-1 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs">
                    {t}
                    <button onClick={() => removeTopic(t)} className="hover:text-red-500 ml-0.5"><X size={11} /></button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2 mt-3">
                <input
                  type="text"
                  placeholder="Add topic…"
                  value={newTopic}
                  onChange={(e) => setNewTopic(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addTopic(); }}
                  className="flex-1 text-sm px-3 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
                />
                <button onClick={addTopic} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">Add</button>
              </div>
            </div>
          )}
        </div>

        {/* Summary Cards */}
        {selectedMarket && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-5 border border-green-200">
              <div className="flex items-start justify-between mb-2">
                <span className="text-sm font-medium text-green-700">Possible Funding Opportunities</span>
                <CheckCircle size={20} className="text-green-600" />
              </div>
              <div className="text-3xl font-bold text-green-800">{fundingCount}</div>
            </div>
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-5 border border-blue-200">
              <div className="flex items-start justify-between mb-2">
                <span className="text-sm font-medium text-blue-700">Enabling Legislation</span>
                <FileText size={20} className="text-blue-600" />
              </div>
              <div className="text-3xl font-bold text-blue-800">{enablingCount}</div>
            </div>
            <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-xl p-5 border border-red-200">
              <div className="flex items-start justify-between mb-2">
                <span className="text-sm font-medium text-red-700">Regulatory Risks</span>
                <AlertCircle size={20} className="text-red-600" />
              </div>
              <div className="text-3xl font-bold text-red-800">{riskCount}</div>
            </div>
          </div>
        )}

        {/* Loading */}
        {isLoading && regulations.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <RefreshCw size={32} className="animate-spin text-blue-400 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">Fetching real-time regulations for {selectedMarket?.name}…</p>
            <p className="text-gray-400 text-xs mt-1">This may take 20–30 seconds while Claude searches the web.</p>
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-6">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle size={18} className="text-red-500" />
              <span className="font-medium text-red-700">Failed to load regulations</span>
            </div>
            <p className="text-sm text-red-600">{error}</p>
            <button
              onClick={() => selectedMarket && triggerFetch(selectedMarket.id, selectedMarket.name)}
              className="mt-3 text-sm text-red-600 underline hover:text-red-800"
            >
              Retry
            </button>
          </div>
        )}

        {!selectedMarket && (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
            <p>Add a market to get started.</p>
          </div>
        )}

        {/* Jurisdiction sections */}
        {regulations.length > 0 && selectedMarket && (
          <>
            {(['federal', 'state', 'local'] as RegulationJurisdiction[]).map((j) => (
              <JurisdictionSection
                key={j}
                label={j.charAt(0).toUpperCase() + j.slice(1)}
                items={byJurisdiction(j)}
                expanded={expandedCards}
                onToggle={toggleCard}
                pins={activePins}
                onPin={(item) => togglePin(selectedMarket.id, selectedMarket.name, item)}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
};

export default Regulations;
