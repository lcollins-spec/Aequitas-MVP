import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import {
  Plus,
  X,
  Upload,
  Users,
  Briefcase,
  Building2,
  ChevronUp,
  ChevronDown,
  AlertCircle,
  MapPin,
  ArrowLeft,
  Loader2,
  CheckCircle,
  FileText,
} from 'lucide-react';
import * as sourcingApi from '../services/sourcingApi';
import type { MarketEntry, SourcingProperty, SourcingBroker, SourcingOperator, ParsedDealFields } from '../services/sourcingApi';
import { dealApi } from '../services/dealApi';

// ── Types ───────────────────────────────────────────────────────────────────

type PropertyStatus = 'not_contacted' | 'outreach_sent' | 'in_conversation' | 'passed' | 'active_deal';
type BrokerStatus = 'cold' | 'introduced' | 'active' | 'strong';
type OperatorStatus = 'prospecting' | 'intro_made' | 'meeting_held' | 'partnership_discussion' | 'active_partner';
type Tab = 'properties' | 'brokers' | 'operators';
type SortDir = 'asc' | 'desc';

interface SourcingData {
  properties: SourcingProperty[];
  brokers: SourcingBroker[];
  operators: SourcingOperator[];
}

const DEFAULT_MARKETS: MarketEntry[] = [
  { id: '1', name: 'Austin, TX' },
  { id: '2', name: 'Phoenix, AZ' },
];

// ── localStorage migration keys (read-once, then cleared) ────────────────────
const LS_DATA = 'sourcing_data';
const LS_MARKETS = 'sourcing_markets';

// ── Status constants ─────────────────────────────────────────────────────────

const PROP_STATUSES: { value: PropertyStatus; label: string; cls: string; pin: string }[] = [
  { value: 'not_contacted',   label: 'Not Contacted',   cls: 'bg-gray-100 text-gray-700 border-gray-200',     pin: '#9CA3AF' },
  { value: 'outreach_sent',   label: 'Outreach Sent',   cls: 'bg-yellow-50 text-yellow-700 border-yellow-200', pin: '#F59E0B' },
  { value: 'in_conversation', label: 'In Conversation', cls: 'bg-blue-50 text-blue-700 border-blue-200',       pin: '#3B82F6' },
  { value: 'passed',          label: 'Passed',          cls: 'bg-red-50 text-red-700 border-red-200',          pin: '#EF4444' },
  { value: 'active_deal',     label: 'Active Deal',     cls: 'bg-green-50 text-green-700 border-green-200',    pin: '#10B981' },
];

const BROKER_STATUSES: { value: BrokerStatus; label: string; cls: string }[] = [
  { value: 'cold',       label: 'Cold',       cls: 'bg-gray-100 text-gray-700 border-gray-200'     },
  { value: 'introduced', label: 'Introduced', cls: 'bg-blue-50 text-blue-700 border-blue-200'       },
  { value: 'active',     label: 'Active',     cls: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  { value: 'strong',     label: 'Strong',     cls: 'bg-green-50 text-green-700 border-green-200'    },
];

const OPERATOR_STATUSES: { value: OperatorStatus; label: string; cls: string }[] = [
  { value: 'prospecting',            label: 'Prospecting',            cls: 'bg-gray-100 text-gray-700 border-gray-200'      },
  { value: 'intro_made',             label: 'Intro Made',             cls: 'bg-blue-50 text-blue-700 border-blue-200'        },
  { value: 'meeting_held',           label: 'Meeting Held',           cls: 'bg-purple-50 text-purple-700 border-purple-200'  },
  { value: 'partnership_discussion', label: 'Partnership Discussion', cls: 'bg-yellow-50 text-yellow-700 border-yellow-200'  },
  { value: 'active_partner',         label: 'Active Partner',         cls: 'bg-green-50 text-green-700 border-green-200'     },
];

function propStatus(s: string) { return PROP_STATUSES.find(x => x.value === s) || PROP_STATUSES[0]; }
function brokerStatus(s: string) { return BROKER_STATUSES.find(x => x.value === s) || BROKER_STATUSES[0]; }
function operatorStatus(s: string) { return OPERATOR_STATUSES.find(x => x.value === s) || OPERATOR_STATUSES[0]; }

const PRIORITY_OPTIONS: { value: string; label: string; dot: string; badge: string }[] = [
  { value: 'high',   label: 'High',   dot: 'bg-red-500',    badge: 'bg-red-50 text-red-700 border-red-200'       },
  { value: 'medium', label: 'Medium', dot: 'bg-yellow-400', badge: 'bg-yellow-50 text-yellow-700 border-yellow-200' },
  { value: 'low',    label: 'Low',    dot: 'bg-green-500',  badge: 'bg-green-50 text-green-700 border-green-200'  },
];
function dealPriority(val: string) { return PRIORITY_OPTIONS.find(x => x.value === val) || PRIORITY_OPTIONS[1]; }

function isOverdue(date?: string): boolean {
  if (!date) return false;
  return new Date(date) < new Date(new Date().toDateString());
}

// ── Google Maps declarations ──────────────────────────────────────────────────

declare global {
  interface Window {
    google: any;
    _sourcingMapReady?: () => void;
  }
}

// ── SourcingMap ───────────────────────────────────────────────────────────────

interface SourcingMapProps {
  properties: SourcingProperty[];
  selectedMarket: MarketEntry | null;
  onGeocode: (id: string, lat: number, lng: number) => void;
  focusPropId?: string | null;
}

const SourcingMap = ({ properties, selectedMarket, onGeocode, focusPropId }: SourcingMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  const [mapsReady, setMapsReady] = useState(false);

  const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  useEffect(() => {
    if (!apiKey) return;
    if ((window as any).google?.maps) { setMapsReady(true); return; }

    const scriptId = 'google-maps-api';
    if (document.getElementById(scriptId)) {
      window._sourcingMapReady = () => setMapsReady(true);
      return;
    }

    window._sourcingMapReady = () => setMapsReady(true);
    const s = document.createElement('script');
    s.id = scriptId;
    s.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&callback=_sourcingMapReady`;
    s.async = true;
    s.defer = true;
    document.head.appendChild(s);
  }, [apiKey]);

  useEffect(() => {
    if (!mapsReady || !containerRef.current || mapRef.current) return;
    mapRef.current = new window.google.maps.Map(containerRef.current, {
      center: { lat: 39.8283, lng: -98.5795 },
      zoom: 4,
      mapTypeControl: false,
      streetViewControl: false,
    });
    infoWindowRef.current = new window.google.maps.InfoWindow();
  }, [mapsReady]);

  // Center map on focused property when it has coordinates
  useEffect(() => {
    if (!mapsReady || !mapRef.current || !focusPropId) return;
    const prop = properties.find(p => p.id === focusPropId);
    if (prop?.lat && prop?.lng) {
      mapRef.current.panTo({ lat: prop.lat, lng: prop.lng });
      mapRef.current.setZoom(14);
    }
  }, [mapsReady, focusPropId, properties]);

  const plotMarker = useCallback((prop: SourcingProperty, lat: number, lng: number) => {
    if (!mapRef.current) return;
    const si = propStatus(prop.status);
    const marker = new window.google.maps.Marker({
      position: { lat, lng },
      map: mapRef.current,
      title: prop.address,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        fillColor: si.pin,
        fillOpacity: 1,
        strokeColor: '#ffffff',
        strokeWeight: 2,
        scale: 10,
      },
    });
    marker.addListener('click', () => {
      infoWindowRef.current.setContent(`
        <div style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.6;max-width:260px">
          <div style="font-weight:600;font-size:14px;margin-bottom:6px">${prop.address || 'Address unknown'}</div>
          <div style="color:#6B7280;margin-bottom:3px"><b>Owner:</b> ${prop.owner_name || '—'}</div>
          <div style="color:#6B7280;margin-bottom:3px"><b>Units:</b> ${prop.units || '—'}</div>
          <div style="color:#6B7280;margin-bottom:3px"><b>Status:</b> ${si.label}</div>
          ${prop.last_contact_date ? `<div style="color:#6B7280;margin-bottom:3px"><b>Last Contact:</b> ${prop.last_contact_date}</div>` : ''}
          ${prop.notes ? `<div style="color:#6B7280;margin-bottom:6px"><b>Notes:</b> ${prop.notes}</div>` : ''}
          ${prop.deal_id ? `<div><a href="/deal-execution/${prop.deal_id}" style="color:#3B82F6;font-weight:500;text-decoration:none">View Deal →</a></div>` : ''}
        </div>
      `);
      infoWindowRef.current.open(mapRef.current, marker);
    });
    markersRef.current.push(marker);
  }, []);

  useEffect(() => {
    if (!mapsReady || !mapRef.current) return;

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    const visible = selectedMarket
      ? properties.filter(p => p.market === selectedMarket.name)
      : properties;

    const toGeocode: SourcingProperty[] = [];
    visible.forEach(p => {
      if (p.lat && p.lng) { plotMarker(p, p.lat, p.lng); }
      else if (p.address) { toGeocode.push(p); }
    });

    if (toGeocode.length > 0 && window.google?.maps?.Geocoder) {
      const geocoder = new window.google.maps.Geocoder();
      const next = (i: number) => {
        if (i >= toGeocode.length) return;
        const prop = toGeocode[i];
        geocoder.geocode({ address: prop.address }, (results: any, status: string) => {
          if (status === 'OK' && results?.[0]) {
            const lat: number = results[0].geometry.location.lat();
            const lng: number = results[0].geometry.location.lng();
            onGeocode(prop.id, lat, lng);
            plotMarker({ ...prop, lat, lng }, lat, lng);
          }
          setTimeout(() => next(i + 1), 250);
        });
      };
      next(0);
    }

    fetch('/api/v1/deals')
      .then(r => r.json())
      .then((resp: any) => {
        const deals: any[] = resp.deals || resp || [];
        deals.forEach((deal: any) => {
          if (!deal.latitude || !deal.longitude) return;
          const marker = new window.google.maps.Marker({
            position: { lat: Number(deal.latitude), lng: Number(deal.longitude) },
            map: mapRef.current,
            title: deal.deal_name || deal.property_address || 'Platform Deal',
            icon: {
              path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
              fillColor: '#10B981',
              fillOpacity: 0.85,
              strokeColor: '#fff',
              strokeWeight: 1.5,
              scale: 7,
            },
          });
          marker.addListener('click', () => {
            infoWindowRef.current.setContent(`
              <div style="font-family:system-ui,sans-serif;font-size:13px;line-height:1.6;max-width:240px">
                <div style="font-weight:600;font-size:14px;margin-bottom:6px">${deal.deal_name || 'Platform Deal'}</div>
                <div style="color:#6B7280;margin-bottom:3px"><b>Address:</b> ${deal.property_address || '—'}</div>
                <div style="color:#6B7280;margin-bottom:6px"><b>Status:</b> ${deal.status || '—'}</div>
                <a href="/deal-execution/${deal.id}" style="color:#3B82F6;font-weight:500;text-decoration:none">View Deal →</a>
              </div>
            `);
            infoWindowRef.current.open(mapRef.current, marker);
          });
          markersRef.current.push(marker);
        });
      })
      .catch(() => {});

    const geocoded = visible.filter(p => p.lat && p.lng);
    if (geocoded.length > 1 && mapRef.current) {
      const bounds = new window.google.maps.LatLngBounds();
      geocoded.forEach(p => bounds.extend({ lat: p.lat!, lng: p.lng! }));
      mapRef.current.fitBounds(bounds);
    }
  }, [mapsReady, properties, selectedMarket, plotMarker, onGeocode]);

  if (!apiKey) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-16 text-center">
        <MapPin size={44} className="text-gray-200 mx-auto mb-4" />
        <p className="text-gray-600 text-sm font-medium mb-2">Google Maps API key not configured</p>
        <p className="text-gray-400 text-xs">
          Add <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">VITE_GOOGLE_MAPS_API_KEY</code> to your{' '}
          <code className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">frontend/.env</code> file to enable the map.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="relative">
        <div ref={containerRef} style={{ height: 560, width: '100%' }} />
        {!mapsReady && (
          <div className="absolute inset-0 flex items-center justify-center bg-white">
            <p className="text-gray-400 text-sm">Loading map…</p>
          </div>
        )}
      </div>
      <div className="px-6 py-3 border-t border-gray-100 flex flex-wrap items-center gap-5">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Legend</span>
        {PROP_STATUSES.map(({ label, pin }) => (
          <div key={label} className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: pin }} />
            <span className="text-xs text-gray-600">{label}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-3 h-3 flex-shrink-0" style={{ backgroundColor: '#10B981', clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)' }} />
          <span className="text-xs text-gray-600">Platform Deal</span>
        </div>
      </div>
    </div>
  );
};

// ── PropertyModal ─────────────────────────────────────────────────────────────

interface PropertyModalProps {
  initial: Partial<SourcingProperty> | null;
  market: string;
  onSave: (p: SourcingProperty) => void;
  onClose: () => void;
  deals?: { id: number; deal_name: string }[];
}

const PropertyModal = ({ initial, market, onSave, onClose, deals }: PropertyModalProps) => {
  const [form, setForm] = useState<Partial<SourcingProperty>>({
    address: '', units: 0, owner_name: '', status: 'not_contacted',
    priority: 'medium', last_contact_date: '', notes: '', deal_id: null,
    ...initial,
  });

  const f = (k: keyof SourcingProperty, v: any) => setForm(p => ({ ...p, [k]: v }));

  // Legislation state
  const [legFetching, setLegFetching] = useState(false);
  const [legStatus, setLegStatus] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [legislation, setLegislation] = useState<any[] | null>(() => {
    try { return initial?.property_legislation ? JSON.parse(initial.property_legislation) : null; } catch { return null; }
  });

  const handleFetchLocalRegs = async () => {
    if (!market) return;
    setLegFetching(true);
    setLegStatus('idle');
    try {
      const resp = await fetch('/api/v1/regulations/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json.error || 'Failed');
      const data = json.data;
      setLegislation(data);
      if (form.id) {
        await fetch(`/api/v1/sourcing/properties/${form.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ property_legislation: JSON.stringify(data) }),
        });
        setForm(p => ({ ...p, property_legislation: JSON.stringify(data) }));
      }
      setLegStatus('saved');
    } catch {
      setLegStatus('failed');
    } finally {
      setLegFetching(false);
    }
  };

  const save = () => {
    if (!form.address?.trim()) return;
    onSave({
      id: form.id || Date.now().toString(),
      market,
      address: form.address || '',
      units: Number(form.units) || 0,
      owner_name: form.owner_name || '',
      status: (form.status as PropertyStatus) || 'not_contacted',
      priority: form.priority || 'medium',
      last_contact_date: form.last_contact_date || '',
      notes: form.notes || '',
      deal_id: form.deal_id ?? null,
      lat: form.lat,
      lng: form.lng,
      property_legislation: form.property_legislation,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">{initial?.id ? 'Edit Property' : 'Add Property'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Address *</label>
            <input
              type="text" value={form.address || ''}
              onChange={e => f('address', e.target.value)}
              placeholder="123 Main St, Austin, TX 78701"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Units</label>
              <input
                type="number" value={form.units || ''}
                onChange={e => f('units', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={form.status || 'not_contacted'}
                onChange={e => f('status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
              >
                {PROP_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Owner Name</label>
            <input
              type="text" value={form.owner_name || ''}
              onChange={e => f('owner_name', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Last Contact Date</label>
              <input
                type="date" value={form.last_contact_date || ''}
                onChange={e => f('last_contact_date', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Priority</label>
              <select
                value={form.priority || 'medium'}
                onChange={e => f('priority', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
              >
                {PRIORITY_OPTIONS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              rows={3} value={form.notes || ''}
              onChange={e => f('notes', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400 resize-none"
            />
          </div>
          {deals && deals.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Link to Deal</label>
              <select
                value={form.deal_id ?? ''}
                onChange={e => f('deal_id', e.target.value ? Number(e.target.value) : null)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
              >
                <option value="">— None —</option>
                {deals.map(d => (
                  <option key={d.id} value={d.id}>{d.deal_name}</option>
                ))}
              </select>
            </div>
          )}
          {/* ── Local Regulations ─────────────────────────────────────── */}
          <div className="border-t border-gray-100 pt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-600">Local Regulations</label>
              <button
                type="button"
                onClick={handleFetchLocalRegs}
                disabled={legFetching}
                className="flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors font-medium"
              >
                {legFetching ? (
                  <><Loader2 size={10} className="animate-spin" /> Fetching…</>
                ) : legStatus === 'saved' ? (
                  <><CheckCircle size={10} className="text-green-600" /> <span className="text-green-700">Saved</span></>
                ) : legStatus === 'failed' ? (
                  'Failed — Retry'
                ) : (
                  'Fetch Local Regs'
                )}
              </button>
            </div>
            {legislation && legislation.length > 0 && (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {legislation.map((item: any, i: number) => (
                  <div key={i} className="p-2 rounded-lg bg-gray-50 border border-gray-100">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium text-gray-800 leading-tight">{item.title}</p>
                      <span className={`flex-shrink-0 text-xs px-1.5 py-0.5 rounded font-medium ${
                        item.status === 'funding' ? 'bg-green-100 text-green-700' :
                        item.status === 'enabling' ? 'bg-blue-100 text-blue-700' :
                        'bg-red-100 text-red-700'
                      }`}>{item.jurisdiction} · {item.status}</span>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{item.summary}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={save} className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            {initial?.id ? 'Save Changes' : 'Add Property'}
          </button>
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ── BrokerModal ───────────────────────────────────────────────────────────────

interface BrokerModalProps {
  initial: Partial<SourcingBroker> | null;
  market: string;
  onSave: (b: SourcingBroker) => void;
  onClose: () => void;
}

const BrokerModal = ({ initial, market, onSave, onClose }: BrokerModalProps) => {
  const [form, setForm] = useState<Partial<SourcingBroker>>({
    name: '', firm: '', status: 'cold', last_contact_date: '', last_deal_sent: '', notes: '',
    ...initial,
  });

  const f = (k: keyof SourcingBroker, v: any) => setForm(p => ({ ...p, [k]: v }));

  const save = () => {
    if (!form.name?.trim()) return;
    onSave({
      id: form.id || Date.now().toString(),
      market,
      name: form.name || '',
      firm: form.firm || '',
      status: (form.status as BrokerStatus) || 'cold',
      last_contact_date: form.last_contact_date || '',
      last_deal_sent: form.last_deal_sent || '',
      notes: form.notes || '',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">{initial?.id ? 'Edit Broker' : 'Add Broker'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input
                type="text" value={form.name || ''}
                onChange={e => f('name', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Firm</label>
              <input
                type="text" value={form.firm || ''}
                onChange={e => f('firm', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select
              value={form.status || 'cold'}
              onChange={e => f('status', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
            >
              {BROKER_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Last Contact Date</label>
              <input
                type="date" value={form.last_contact_date || ''}
                onChange={e => f('last_contact_date', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Last Deal Sent</label>
              <input
                type="text" value={form.last_deal_sent || ''}
                onChange={e => f('last_deal_sent', e.target.value)}
                placeholder="Deal name or date"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              rows={3} value={form.notes || ''}
              onChange={e => f('notes', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400 resize-none"
            />
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={save} className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            {initial?.id ? 'Save Changes' : 'Add Broker'}
          </button>
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ── OperatorModal ─────────────────────────────────────────────────────────────

interface OperatorModalProps {
  initial: Partial<SourcingOperator> | null;
  market: string;
  onSave: (o: SourcingOperator) => void;
  onClose: () => void;
}

const OperatorModal = ({ initial, market, onSave, onClose }: OperatorModalProps) => {
  const [form, setForm] = useState<Partial<SourcingOperator>>({
    name: '', firm: '', status: 'prospecting', properties_managed: '', last_contact_date: '', notes: '',
    ...initial,
  });

  const f = (k: keyof SourcingOperator, v: any) => setForm(p => ({ ...p, [k]: v }));

  const save = () => {
    if (!form.name?.trim()) return;
    onSave({
      id: form.id || Date.now().toString(),
      market,
      name: form.name || '',
      firm: form.firm || '',
      status: (form.status as OperatorStatus) || 'prospecting',
      properties_managed: form.properties_managed || '',
      last_contact_date: form.last_contact_date || '',
      notes: form.notes || '',
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">{initial?.id ? 'Edit Operator' : 'Add Operator'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
              <input
                type="text" value={form.name || ''}
                onChange={e => f('name', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Firm</label>
              <input
                type="text" value={form.firm || ''}
                onChange={e => f('firm', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select
                value={form.status || 'prospecting'}
                onChange={e => f('status', e.target.value)}
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
              >
                {OPERATOR_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Properties Managed</label>
              <input
                type="text" value={form.properties_managed || ''}
                onChange={e => f('properties_managed', e.target.value)}
                placeholder="e.g. 500 units"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Last Contact Date</label>
            <input
              type="date" value={form.last_contact_date || ''}
              onChange={e => f('last_contact_date', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Notes</label>
            <textarea
              rows={3} value={form.notes || ''}
              onChange={e => f('notes', e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400 resize-none"
            />
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={save} className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
            {initial?.id ? 'Save Changes' : 'Add Operator'}
          </button>
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ── ImportModal ───────────────────────────────────────────────────────────────

interface ImportModalProps {
  tab: Tab;
  market: string;
  onImport: (items: any[]) => void;
  onClose: () => void;
}

const ImportModal = ({ tab, market, onImport, onClose }: ImportModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<any[] | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const typeLabel = tab === 'properties' ? 'Properties' : tab === 'brokers' ? 'Brokers' : 'Operators';

  const previewCols: Record<Tab, string[]> = {
    properties: ['address', 'units', 'owner_name', 'status', 'last_contact_date'],
    brokers: ['name', 'firm', 'status', 'last_contact_date', 'last_deal_sent'],
    operators: ['name', 'firm', 'status', 'properties_managed', 'last_contact_date'],
  };

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setPreview(null);
    setError(null);
  };

  const parse = async () => {
    if (!file) return;
    setLoading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', tab);
      const r = await fetch('/api/v1/sourcing/parse-import', { method: 'POST', body: fd });
      const data = await r.json();
      if (!data.success) throw new Error(data.error || 'Parse failed');
      setPreview(data.data);
    } catch (e: any) {
      setError(e.message || 'Failed to parse file');
    } finally {
      setLoading(false);
    }
  };

  const confirmImport = () => {
    if (!preview) return;
    const ts = Date.now();
    const items = preview.map((row, i) => ({
      ...row,
      id: `${ts}_${i}`,
      market,
    }));
    onImport(items);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 flex-shrink-0">
          <h2 className="text-base font-semibold text-gray-800">Import {typeLabel} from Excel / CSV</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-5">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Select file (.xlsx or .csv)</label>
            <div className="flex items-center gap-3">
              <button
                onClick={() => fileRef.current?.click()}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors"
              >
                Choose File
              </button>
              <span className="text-sm text-gray-500">{file ? file.name : 'No file selected'}</span>
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFileChange} className="hidden" />
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Column names can vary — Claude will intelligently map them to the {typeLabel.toLowerCase()} data model.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}

          {preview && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-sm font-semibold text-gray-800">Preview</span>
                <span className="text-xs text-gray-400">({preview.length} rows mapped)</span>
              </div>
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="text-xs w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      {previewCols[tab].map(col => (
                        <th key={col} className="px-3 py-2.5 text-left font-semibold text-gray-600 capitalize whitespace-nowrap">
                          {col.replace(/_/g, ' ')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {preview.slice(0, 12).map((row, i) => (
                      <tr key={i} className="hover:bg-gray-50">
                        {previewCols[tab].map(col => (
                          <td key={col} className="px-3 py-2 text-gray-700 max-w-[180px] truncate">
                            {row[col] || '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.length > 12 && (
                <p className="text-xs text-gray-400 mt-2">Showing first 12 of {preview.length} rows</p>
              )}
            </div>
          )}
        </div>

        <div className="flex gap-3 px-6 py-4 border-t border-gray-200 flex-shrink-0">
          {!preview ? (
            <button
              onClick={parse}
              disabled={!file || loading}
              className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Parsing with Claude…
                </>
              ) : 'Parse File'}
            </button>
          ) : (
            <button
              onClick={confirmImport}
              className="flex-1 py-2 text-sm font-medium bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
            >
              Import {preview.length} {typeLabel}
            </button>
          )}
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ── ImportDealModal ────────────────────────────────────────────────────────────

interface ImportDealModalProps {
  market: string;
  markets: MarketEntry[];
  onSave: (p: SourcingProperty) => void;
  onClose: () => void;
}

const ImportDealModal = ({ market, markets, onSave, onClose }: ImportDealModalProps) => {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<ParsedDealFields | null>(null);
  const [targetMarket, setTargetMarket] = useState(market);
  const fileRef = useRef<HTMLInputElement>(null);

  const parse = async () => {
    if (!text.trim() && !file) return;
    setParsing(true);
    setError(null);
    try {
      const result = await sourcingApi.parseDeal(text, file);
      setFields(result);
    } catch (e: any) {
      setError(e.message || 'Failed to parse');
    } finally {
      setParsing(false);
    }
  };

  const handleSave = () => {
    if (!fields) return;
    const noteParts: string[] = [];
    if (fields.asking_price) noteParts.push(`Asking: ${fields.asking_price}`);
    const prop: SourcingProperty = {
      id: Date.now().toString(),
      market: targetMarket,
      address: fields.property_address,
      units: parseInt(fields.unit_count) || 0,
      owner_name: fields.seller_broker_name,
      status: 'not_contacted',
      priority: 'medium',
      last_contact_date: '',
      notes: noteParts.join(' | '),
      deal_id: null,
    };
    onSave(prop);
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400';

  // Review form
  if (fields) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-800">Review Extracted Deal</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
          </div>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <p className="text-xs text-gray-500 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
              Review and edit the extracted fields before saving. Blank fields were not found in the source material.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Property Address</label>
              <input type="text" value={fields.property_address}
                onChange={e => setFields(f => f ? { ...f, property_address: e.target.value } : f)}
                className={inputCls} placeholder="Not found" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Unit Count</label>
                <input type="text" value={fields.unit_count}
                  onChange={e => setFields(f => f ? { ...f, unit_count: e.target.value } : f)}
                  className={inputCls} placeholder="Not found" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Asking Price</label>
                <input type="text" value={fields.asking_price}
                  onChange={e => setFields(f => f ? { ...f, asking_price: e.target.value } : f)}
                  className={inputCls} placeholder="Not found" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Seller / Broker Name</label>
              <input type="text" value={fields.seller_broker_name}
                onChange={e => setFields(f => f ? { ...f, seller_broker_name: e.target.value } : f)}
                className={inputCls} placeholder="Not found" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Market / City</label>
              <input type="text" value={fields.market_city}
                onChange={e => setFields(f => f ? { ...f, market_city: e.target.value } : f)}
                className={inputCls} placeholder="Not found" />
            </div>
            {markets.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Add to Market</label>
                <select value={targetMarket} onChange={e => setTargetMarket(e.target.value)} className={inputCls}>
                  {markets.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
              </div>
            )}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
            <button onClick={handleSave}
              className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
              Save Deal
            </button>
            <button onClick={() => setFields(null)}
              className="flex-1 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Input form
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">Import Deal</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Paste email or deal material</label>
            <textarea
              rows={6} value={text} onChange={e => setText(e.target.value)}
              placeholder="Paste email, OM summary, or any deal text here…"
              className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400 resize-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">Or upload a PDF</label>
            <div className="flex items-center gap-3">
              <button onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors">
                Choose PDF
              </button>
              <span className="text-sm text-gray-500">{file ? file.name : 'No file selected'}</span>
              <input ref={fileRef} type="file" accept=".pdf"
                onChange={e => setFile(e.target.files?.[0] ?? null)} className="hidden" />
            </div>
          </div>
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={parse}
            disabled={(!text.trim() && !file) || parsing}
            className="flex-1 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {parsing
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Parsing…</>
              : 'Parse'}
          </button>
          <button onClick={onClose}
            className="flex-1 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ── BrokersTable ──────────────────────────────────────────────────────────────

interface BrokersTableProps {
  brokers: SourcingBroker[];
  onEdit: (b: SourcingBroker) => void;
  onDelete: (id: string) => void;
}

const BrokersTable = ({ brokers, onEdit, onDelete }: BrokersTableProps) => {
  const [sort, setSort] = useState<{ col: keyof SourcingBroker; dir: SortDir }>({ col: 'name', dir: 'asc' });

  const toggle = (col: keyof SourcingBroker) =>
    setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));

  const sorted = [...brokers].sort((a, b) => {
    const av = String(a[sort.col] ?? '').toLowerCase();
    const bv = String(b[sort.col] ?? '').toLowerCase();
    return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const SortIcon = ({ col }: { col: keyof SourcingBroker }) =>
    sort.col !== col
      ? <ChevronDown size={12} className="text-gray-300" />
      : sort.dir === 'asc'
        ? <ChevronUp size={12} className="text-blue-500" />
        : <ChevronDown size={12} className="text-blue-500" />;

  const Th = ({ col, label }: { col: keyof SourcingBroker; label: string }) => (
    <th
      onClick={() => toggle(col)}
      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none whitespace-nowrap"
    >
      <div className="flex items-center gap-1">{label} <SortIcon col={col} /></div>
    </th>
  );

  if (sorted.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 text-center">
        <Users size={44} className="text-gray-200 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">No brokers yet. Click "Add Broker" to get started.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <Th col="name" label="Name" />
              <Th col="firm" label="Firm" />
              <Th col="status" label="Status" />
              <Th col="last_contact_date" label="Last Contact" />
              <Th col="last_deal_sent" label="Last Deal Sent" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map(b => {
              const si = brokerStatus(b.status);
              return (
                <tr
                  key={b.id}
                  onClick={() => onEdit(b)}
                  className="cursor-pointer hover:bg-blue-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{b.name}</td>
                  <td className="px-4 py-3 text-gray-600">{b.firm || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${si.cls}`}>{si.label}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{b.last_contact_date || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{b.last_deal_sent || '—'}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs max-w-[200px] truncate">{b.notes || '—'}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => onDelete(b.id)}
                      className="text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── OperatorsTable ────────────────────────────────────────────────────────────

interface OperatorsTableProps {
  operators: SourcingOperator[];
  onEdit: (o: SourcingOperator) => void;
  onDelete: (id: string) => void;
}

const OperatorsTable = ({ operators, onEdit, onDelete }: OperatorsTableProps) => {
  const [sort, setSort] = useState<{ col: keyof SourcingOperator; dir: SortDir }>({ col: 'name', dir: 'asc' });

  const toggle = (col: keyof SourcingOperator) =>
    setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));

  const sorted = [...operators].sort((a, b) => {
    const av = String(a[sort.col] ?? '').toLowerCase();
    const bv = String(b[sort.col] ?? '').toLowerCase();
    return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const SortIcon = ({ col }: { col: keyof SourcingOperator }) =>
    sort.col !== col
      ? <ChevronDown size={12} className="text-gray-300" />
      : sort.dir === 'asc'
        ? <ChevronUp size={12} className="text-blue-500" />
        : <ChevronDown size={12} className="text-blue-500" />;

  const Th = ({ col, label }: { col: keyof SourcingOperator; label: string }) => (
    <th
      onClick={() => toggle(col)}
      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none whitespace-nowrap"
    >
      <div className="flex items-center gap-1">{label} <SortIcon col={col} /></div>
    </th>
  );

  if (sorted.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm p-12 text-center">
        <Briefcase size={44} className="text-gray-200 mx-auto mb-3" />
        <p className="text-gray-500 text-sm">No operators yet. Click "Add Operator" to get started.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <Th col="name" label="Name" />
              <Th col="firm" label="Firm" />
              <Th col="status" label="Status" />
              <Th col="properties_managed" label="Properties Managed" />
              <Th col="last_contact_date" label="Last Contact" />
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">Notes</th>
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map(op => {
              const si = operatorStatus(op.status);
              return (
                <tr
                  key={op.id}
                  onClick={() => onEdit(op)}
                  className="cursor-pointer hover:bg-blue-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{op.name}</td>
                  <td className="px-4 py-3 text-gray-600">{op.firm || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${si.cls}`}>{si.label}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{op.properties_managed || '—'}</td>
                  <td className={`px-4 py-3 whitespace-nowrap ${isOverdue(op.last_contact_date) ? 'bg-yellow-50 text-yellow-800' : 'text-gray-600'}`}>
                    {op.last_contact_date || '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-400 text-xs max-w-[200px] truncate">{op.notes || '—'}</td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                    <button
                      onClick={() => onDelete(op.id)}
                      className="text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── PropertiesTable ───────────────────────────────────────────────────────────

interface PropertiesTableProps {
  properties: SourcingProperty[];
  onEdit: (p: SourcingProperty) => void;
  onDelete: (id: string) => void;
  highlightPropId?: string | null;
  onStartUnderwriting: (p: SourcingProperty) => void;
  startingUwId?: string | null;
}

const PropertiesTable = ({ properties, onEdit, onDelete, highlightPropId, onStartUnderwriting, startingUwId }: PropertiesTableProps) => {
  const [sort, setSort] = useState<{ col: keyof SourcingProperty; dir: SortDir }>({ col: 'address', dir: 'asc' });
  const highlightedRowRef = useRef<HTMLTableRowElement | null>(null);

  useEffect(() => {
    if (highlightedRowRef.current) {
      highlightedRowRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [highlightPropId]);

  const toggle = (col: keyof SourcingProperty) =>
    setSort(s => ({ col, dir: s.col === col && s.dir === 'asc' ? 'desc' : 'asc' }));

  const sorted = [...properties].sort((a, b) => {
    const av = String(a[sort.col] ?? '').toLowerCase();
    const bv = String(b[sort.col] ?? '').toLowerCase();
    return sort.dir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
  });

  const SortIcon = ({ col }: { col: keyof SourcingProperty }) =>
    sort.col !== col
      ? <ChevronDown size={12} className="text-gray-300" />
      : sort.dir === 'asc'
        ? <ChevronUp size={12} className="text-blue-500" />
        : <ChevronDown size={12} className="text-blue-500" />;

  const Th = ({ col, label }: { col: keyof SourcingProperty; label: string }) => (
    <th
      onClick={() => toggle(col)}
      className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide cursor-pointer hover:text-gray-700 select-none whitespace-nowrap"
    >
      <div className="flex items-center gap-1">{label} <SortIcon col={col} /></div>
    </th>
  );

  if (sorted.length === 0) return null;

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden mt-4">
      <div className="px-5 py-3 border-b border-gray-100">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Property List</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <Th col="address" label="Address" />
              <Th col="units" label="Units" />
              <Th col="owner_name" label="Owner" />
              <Th col="status" label="Status" />
              <Th col="priority" label="Priority" />
              <Th col="last_contact_date" label="Last Contact" />
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map(p => {
              const si = propStatus(p.status);
              const pri = dealPriority(p.priority);
              const isHighlighted = p.id === highlightPropId;
              return (
                <tr
                  key={p.id}
                  ref={isHighlighted ? highlightedRowRef : null}
                  onClick={() => onEdit(p)}
                  className={`cursor-pointer hover:bg-blue-50 transition-colors ${isHighlighted ? 'ring-2 ring-inset ring-blue-400 bg-blue-50' : ''}`}
                >
                  <td className="px-4 py-3 font-medium text-gray-800">{p.address}</td>
                  <td className="px-4 py-3 text-gray-600">{p.units || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.owner_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${si.cls}`}>{si.label}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border w-fit ${pri.badge}`}>
                      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${pri.dot}`} />
                      {pri.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{p.last_contact_date || '—'}</td>
                  <td className="px-4 py-3 flex items-center gap-2" onClick={e => e.stopPropagation()}>
                    {p.deal_id && (
                      <Link
                        to={`/deal-execution/${p.deal_id}`}
                        className="text-xs text-blue-500 hover:text-blue-700 font-medium whitespace-nowrap"
                      >
                        View Deal →
                      </Link>
                    )}
                    <button
                      onClick={() => onStartUnderwriting(p)}
                      disabled={startingUwId === p.id}
                      className="text-xs text-indigo-500 hover:text-indigo-700 font-medium whitespace-nowrap transition-colors disabled:opacity-50"
                    >
                      {startingUwId === p.id ? '…' : p.deal_id ? 'Underwriting →' : 'Start Underwriting'}
                    </button>
                    <button
                      onClick={() => onDelete(p.id)}
                      className="text-gray-300 hover:text-red-400 transition-colors"
                    >
                      <X size={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// ── Main Sourcing component ───────────────────────────────────────────────────

// Shared fuzzy address matcher (mirrors the one in Underwriting)
function addressMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(' '));
  const tb = nb.split(' ');
  const shared = tb.filter(t => t.length > 2 && ta.has(t)).length;
  return shared >= 2;
}

const Sourcing = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const addressParam = searchParams.get('address') ?? '';

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [markets, setMarkets] = useState<MarketEntry[]>([]);
  const [selectedMarket, setSelectedMarket] = useState<MarketEntry | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('properties');
  const [data, setData] = useState<SourcingData>({ properties: [], brokers: [], operators: [] });
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<{ id: number; deal_name: string }[]>([]);

  // Modal state
  const [showAddProp, setShowAddProp] = useState(false);
  const [editProp, setEditProp] = useState<SourcingProperty | null>(null);
  const [showAddBroker, setShowAddBroker] = useState(false);
  const [editBroker, setEditBroker] = useState<SourcingBroker | null>(null);
  const [showAddOperator, setShowAddOperator] = useState(false);
  const [editOperator, setEditOperator] = useState<SourcingOperator | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showImportDeal, setShowImportDeal] = useState(false);
  const [startingUwId, setStartingUwId] = useState<string | null>(null);

  // Market sidebar state
  const [showAddMarket, setShowAddMarket] = useState(false);
  const [newMarketInput, setNewMarketInput] = useState('');

  // Derived: which property matches the URL ?address= param
  const highlightPropId = useMemo(() => {
    if (!addressParam) return null;
    const match = data.properties.find(p => addressMatch(addressParam, p.address));
    return match?.id ?? null;
  }, [addressParam, data.properties]);

  // ── Fetch deals for "Link to Deal" dropdown ────────────────────────────────
  useEffect(() => {
    fetch('/api/v1/deals')
      .then(r => r.ok ? r.json() : null)
      .then((d: { deals?: { id: number; deal_name: string }[] } | null) => {
        if (d?.deals) setDeals(d.deals);
      })
      .catch(() => {});
  }, []);

  // ── On mount: load from API, migrate localStorage if DB is empty ───────────
  useEffect(() => {
    const init = async () => {
      try {
        const [dbMarkets, dbProps, dbBrokers, dbOps] = await Promise.all([
          sourcingApi.fetchMarkets(),
          sourcingApi.fetchProperties(),
          sourcingApi.fetchBrokers(),
          sourcingApi.fetchOperators(),
        ]);

        const dbIsEmpty = dbMarkets.length === 0 && dbProps.length === 0 &&
          dbBrokers.length === 0 && dbOps.length === 0;

        if (dbIsEmpty) {
          // One-time migration from localStorage
          const lsMarketsRaw = localStorage.getItem(LS_MARKETS);
          const lsDataRaw = localStorage.getItem(LS_DATA);

          let migratedMarkets = dbMarkets;
          let migratedProps = dbProps;
          let migratedBrokers = dbBrokers;
          let migratedOps = dbOps;

          if (lsMarketsRaw) {
            try {
              const lsMarkets: MarketEntry[] = JSON.parse(lsMarketsRaw);
              if (lsMarkets.length > 0) {
                await Promise.all(lsMarkets.map(m => sourcingApi.createMarket(m)));
                migratedMarkets = lsMarkets;
              }
            } catch { /* ignore */ }
            localStorage.removeItem(LS_MARKETS);
          }

          if (lsDataRaw) {
            try {
              const lsData = JSON.parse(lsDataRaw);
              const props: SourcingProperty[] = lsData.properties || [];
              const brokers: SourcingBroker[] = lsData.brokers || [];
              const ops: SourcingOperator[] = lsData.operators || [];

              if (props.length > 0) {
                await sourcingApi.bulkCreateProperties(props);
                migratedProps = props;
              }
              if (brokers.length > 0) {
                await sourcingApi.bulkCreateBrokers(brokers);
                migratedBrokers = brokers;
              }
              if (ops.length > 0) {
                await sourcingApi.bulkCreateOperators(ops);
                migratedOps = ops;
              }
            } catch { /* ignore */ }
            localStorage.removeItem(LS_DATA);
          }

          // If still nothing (fresh install), seed default markets
          if (migratedMarkets.length === 0) {
            await Promise.all(DEFAULT_MARKETS.map(m => sourcingApi.createMarket(m)));
            migratedMarkets = DEFAULT_MARKETS;
          }

          setMarkets(migratedMarkets);
          setData({ properties: migratedProps, brokers: migratedBrokers, operators: migratedOps });
          setSelectedMarket(migratedMarkets[0] ?? null);
        } else {
          // Also clear any stale localStorage keys if DB already has data
          localStorage.removeItem(LS_MARKETS);
          localStorage.removeItem(LS_DATA);

          setMarkets(dbMarkets);
          setData({ properties: dbProps, brokers: dbBrokers, operators: dbOps });
          setSelectedMarket(dbMarkets[0] ?? null);
        }
      } catch { /* network error — still show empty state */ }
      setLoading(false);
    };
    init();
  }, []);

  // ── Geocode cache update (from SourcingMap) ────────────────────────────────
  const handleGeocode = useCallback((id: string, lat: number, lng: number) => {
    setData(prev => ({
      ...prev,
      properties: prev.properties.map(p => p.id === id ? { ...p, lat, lng } : p),
    }));
    sourcingApi.updateProperty(id, { lat, lng }).catch(() => {});
  }, []);

  // ── Property CRUD ──────────────────────────────────────────────────────────
  const saveProp = async (p: SourcingProperty) => {
    const exists = data.properties.some(x => x.id === p.id);
    if (exists) {
      setData(prev => ({ ...prev, properties: prev.properties.map(x => x.id === p.id ? p : x) }));
      sourcingApi.updateProperty(p.id, p).catch(() => {});
    } else {
      setData(prev => ({ ...prev, properties: [...prev.properties, p] }));
      sourcingApi.createProperty(p).catch(() => {});
    }
    setShowAddProp(false);
    setEditProp(null);
  };

  const deleteProp = (id: string) => {
    setData(prev => ({ ...prev, properties: prev.properties.filter(p => p.id !== id) }));
    sourcingApi.deleteProperty(id).catch(() => {});
  };

  // ── Broker CRUD ────────────────────────────────────────────────────────────
  const saveBroker = async (b: SourcingBroker) => {
    const exists = data.brokers.some(x => x.id === b.id);
    if (exists) {
      setData(prev => ({ ...prev, brokers: prev.brokers.map(x => x.id === b.id ? b : x) }));
      sourcingApi.updateBroker(b.id, b).catch(() => {});
    } else {
      setData(prev => ({ ...prev, brokers: [...prev.brokers, b] }));
      sourcingApi.createBroker(b).catch(() => {});
    }
    setShowAddBroker(false);
    setEditBroker(null);
  };

  const deleteBroker = (id: string) => {
    setData(prev => ({ ...prev, brokers: prev.brokers.filter(b => b.id !== id) }));
    sourcingApi.deleteBroker(id).catch(() => {});
  };

  // ── Operator CRUD ──────────────────────────────────────────────────────────
  const saveOperator = async (o: SourcingOperator) => {
    const exists = data.operators.some(x => x.id === o.id);
    if (exists) {
      setData(prev => ({ ...prev, operators: prev.operators.map(x => x.id === o.id ? o : x) }));
      sourcingApi.updateOperator(o.id, o).catch(() => {});
    } else {
      setData(prev => ({ ...prev, operators: [...prev.operators, o] }));
      sourcingApi.createOperator(o).catch(() => {});
    }
    setShowAddOperator(false);
    setEditOperator(null);
  };

  const deleteOperator = (id: string) => {
    setData(prev => ({ ...prev, operators: prev.operators.filter(o => o.id !== id) }));
    sourcingApi.deleteOperator(id).catch(() => {});
  };

  // ── Start Underwriting ─────────────────────────────────────────────────────
  const startUnderwriting = async (p: SourcingProperty) => {
    // If already linked, open the existing underwriting record
    if (p.deal_id) {
      navigate(`/underwriting?dealId=${p.deal_id}`);
      return;
    }

    setStartingUwId(p.id);
    try {
      // Parse asking price from notes (format set by Import Deal: "Asking: $5,200,000")
      let purchasePrice: number | undefined;
      const askingMatch = (p.notes || '').match(/Asking:\s*\$?([\d,]+)/i);
      if (askingMatch) {
        const parsed = parseInt(askingMatch[1].replace(/,/g, ''), 10);
        if (parsed > 0) purchasePrice = parsed;
      }

      // Create a new deal pre-populated from the sourcing property
      const deal = await dealApi.createDeal({
        dealName: p.address || 'Untitled Deal',
        location: p.market || '',
        propertyAddress: p.address || '',
        status: 'potential',
        purchasePrice,
        underwritingJson: JSON.stringify({ totalUnits: p.units || 0 }),
      });

      if (!deal.id) throw new Error('No deal ID returned');

      // Link the sourcing property to the new deal
      await sourcingApi.updateProperty(p.id, { deal_id: deal.id });
      setData(prev => ({
        ...prev,
        properties: prev.properties.map(x => x.id === p.id ? { ...x, deal_id: deal.id } : x),
      }));

      navigate(`/underwriting?dealId=${deal.id}`);
    } catch {
      // Silently swallow — button just re-enables
    } finally {
      setStartingUwId(null);
    }
  };

  // ── Import ─────────────────────────────────────────────────────────────────
  const handleImport = (items: any[]) => {
    if (activeTab === 'properties') {
      const typed = items as SourcingProperty[];
      setData(prev => ({ ...prev, properties: [...prev.properties, ...typed] }));
      sourcingApi.bulkCreateProperties(typed).catch(() => {});
    } else if (activeTab === 'brokers') {
      const typed = items as SourcingBroker[];
      setData(prev => ({ ...prev, brokers: [...prev.brokers, ...typed] }));
      sourcingApi.bulkCreateBrokers(typed).catch(() => {});
    } else {
      const typed = items as SourcingOperator[];
      setData(prev => ({ ...prev, operators: [...prev.operators, ...typed] }));
      sourcingApi.bulkCreateOperators(typed).catch(() => {});
    }
    setShowImport(false);
  };

  // ── Market CRUD ────────────────────────────────────────────────────────────
  const addMarket = async () => {
    const name = newMarketInput.trim();
    if (!name) return;
    const entry: MarketEntry = { id: Date.now().toString(), name };
    setMarkets(prev => [...prev, entry]);
    setNewMarketInput('');
    setShowAddMarket(false);
    setSelectedMarket(entry);
    setView('detail');
    sourcingApi.createMarket(entry).catch(() => {});
  };

  const removeMarket = (id: string) => {
    const updated = markets.filter(m => m.id !== id);
    setMarkets(updated);
    if (selectedMarket?.id === id) setSelectedMarket(updated[0] ?? null);
    sourcingApi.deleteMarket(id).catch(() => {});
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const filterByMarket = <T extends { market: string }>(items: T[]) =>
    selectedMarket ? items.filter(i => i.market === selectedMarket.name) : items;

  const filteredProps = filterByMarket(data.properties);
  const filteredBrokers = filterByMarket(data.brokers);
  const filteredOps = filterByMarket(data.operators);

  const currentMarket = selectedMarket?.name ?? 'all markets';

  const tabConfig: Record<Tab, { label: string; icon: React.ReactNode; count: number }> = {
    properties: { label: 'Properties', icon: <Building2 size={15} />, count: filteredProps.length },
    brokers:    { label: 'Brokers',    icon: <Users size={15} />,     count: filteredBrokers.length },
    operators:  { label: 'Operators',  icon: <Briefcase size={15} />, count: filteredOps.length },
  };

  const addLabel = activeTab === 'properties' ? 'Add Property' : activeTab === 'brokers' ? 'Add Broker' : 'Add Operator';
  const handleAdd = () => {
    if (activeTab === 'properties') setShowAddProp(true);
    else if (activeTab === 'brokers') setShowAddBroker(true);
    else setShowAddOperator(true);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // Level 1 — Market Overview
  if (view === 'list') {
    return (
      <div className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8">
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-800">Sourcing</h1>
          <p className="text-sm text-gray-500 mt-1">Track properties, brokers, and operators by market</p>
        </div>

        {showAddMarket ? (
          <div className="mb-6 bg-white rounded-xl border border-gray-200 p-4 shadow-sm max-w-sm">
            <input
              autoFocus
              type="text"
              placeholder="City, ST"
              value={newMarketInput}
              onChange={e => setNewMarketInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addMarket(); if (e.key === 'Escape') setShowAddMarket(false); }}
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

        {loading ? (
          <p className="text-sm text-gray-400">Loading…</p>
        ) : markets.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
            <p>No markets yet. Add one to get started.</p>
          </div>
        ) : (
          <div className="space-y-3 max-w-2xl">
            {markets.map(m => {
              const pCount = data.properties.filter(p => p.market === m.name).length;
              const bCount = data.brokers.filter(b => b.market === m.name).length;
              const oCount = data.operators.filter(o => o.market === m.name).length;
              return (
                <div
                  key={m.id}
                  onClick={() => { setSelectedMarket(m); setView('detail'); }}
                  className="bg-white rounded-xl shadow-sm border border-gray-200 p-5 cursor-pointer hover:border-blue-300 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-wrap">
                      <h2 className="text-base font-semibold text-gray-800 group-hover:text-blue-700 transition-colors">{m.name}</h2>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="flex items-center gap-1 px-2.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-xs font-medium">
                          <Building2 size={11} /> {pCount} Properties
                        </span>
                        <span className="flex items-center gap-1 px-2.5 py-0.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-full text-xs font-medium">
                          <Users size={11} /> {bCount} Brokers
                        </span>
                        <span className="flex items-center gap-1 px-2.5 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full text-xs font-medium">
                          <Briefcase size={11} /> {oCount} Operators
                        </span>
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
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left sidebar */}
      <div className="w-48 flex-shrink-0 bg-white border-r border-gray-200 flex flex-col">
        <button
          onClick={() => setView('list')}
          className="flex items-center gap-1.5 px-4 py-3 text-sm text-gray-500 hover:text-gray-800 border-b border-gray-200 transition-colors"
        >
          <ArrowLeft size={14} /> All Markets
        </button>
        <nav className="flex-1 overflow-y-auto py-2">
          {markets.map((m) => (
            <button
              key={m.id}
              onClick={() => setSelectedMarket(m)}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                selectedMarket?.id === m.id
                  ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-500'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-800'
              }`}
            >
              {m.name}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 min-w-0">
      {/* ── Modals ── */}
      {(showAddProp || editProp) && (
        <PropertyModal
          initial={editProp}
          market={selectedMarket?.name ?? ''}
          onSave={saveProp}
          onClose={() => { setShowAddProp(false); setEditProp(null); }}
          deals={deals}
        />
      )}
      {(showAddBroker || editBroker) && (
        <BrokerModal
          initial={editBroker}
          market={selectedMarket?.name ?? ''}
          onSave={saveBroker}
          onClose={() => { setShowAddBroker(false); setEditBroker(null); }}
        />
      )}
      {(showAddOperator || editOperator) && (
        <OperatorModal
          initial={editOperator}
          market={selectedMarket?.name ?? ''}
          onSave={saveOperator}
          onClose={() => { setShowAddOperator(false); setEditOperator(null); }}
        />
      )}
      {showImport && (
        <ImportModal
          tab={activeTab}
          market={selectedMarket?.name ?? ''}
          onImport={handleImport}
          onClose={() => setShowImport(false)}
        />
      )}
      {showImportDeal && (
        <ImportDealModal
          market={selectedMarket?.name ?? ''}
          markets={markets}
          onSave={(p) => { saveProp(p); setShowImportDeal(false); }}
          onClose={() => setShowImportDeal(false)}
        />
      )}

      {/* ── Main Content ── */}
      <div className="p-4 md:p-6 lg:p-8 min-w-0">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-800">{selectedMarket?.name ?? 'Sourcing'}</h1>
          <p className="text-sm text-gray-500 mt-1">Track properties, brokers, and operators</p>
        </div>

        {/* Tabs + Action buttons */}
        <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
          <div className="flex bg-white border border-gray-200 rounded-xl p-1 gap-1 shadow-sm">
            {(Object.keys(tabConfig) as Tab[]).map(tab => {
              const cfg = tabConfig[tab];
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    activeTab === tab
                      ? 'bg-blue-600 text-white shadow-sm'
                      : 'text-gray-600 hover:text-gray-800 hover:bg-gray-50'
                  }`}
                >
                  {cfg.icon}
                  {cfg.label}
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                    activeTab === tab ? 'bg-blue-500 text-blue-100' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {cfg.count}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center gap-2">
            {activeTab === 'properties' && (
              <button
                onClick={() => setShowImportDeal(true)}
                className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <FileText size={15} /> Import Deal
              </button>
            )}
            <button
              onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-3 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
            >
              <Upload size={15} /> Import from Excel
            </button>
            <button
              onClick={handleAdd}
              className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              <Plus size={15} /> {addLabel}
            </button>
          </div>
        </div>

        {/* Quick stats bar */}
        <div className="flex items-center gap-6 mb-5 px-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm">
          <span className="text-xs text-gray-500 font-medium uppercase tracking-wide">{selectedMarket ? selectedMarket.name : 'All Markets'}</span>
          <div className="flex items-center gap-1.5">
            <Building2 size={14} className="text-blue-500" />
            <span className="text-sm font-semibold text-gray-800">{filteredProps.length}</span>
            <span className="text-xs text-gray-500">properties</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Users size={14} className="text-purple-500" />
            <span className="text-sm font-semibold text-gray-800">{filteredBrokers.length}</span>
            <span className="text-xs text-gray-500">brokers</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Briefcase size={14} className="text-green-500" />
            <span className="text-sm font-semibold text-gray-800">{filteredOps.length}</span>
            <span className="text-xs text-gray-500">operators</span>
          </div>
          <span className="text-xs text-gray-400 ml-auto">in {currentMarket}</span>
        </div>

        {/* Tab content */}
        {activeTab === 'properties' && (
          <>
            <SourcingMap
              properties={filteredProps}
              selectedMarket={selectedMarket}
              onGeocode={handleGeocode}
              focusPropId={highlightPropId}
            />
            <PropertiesTable
              properties={filteredProps}
              onEdit={p => setEditProp(p)}
              onDelete={deleteProp}
              highlightPropId={highlightPropId}
              onStartUnderwriting={startUnderwriting}
              startingUwId={startingUwId}
            />
          </>
        )}
        {activeTab === 'brokers' && (
          <BrokersTable
            brokers={filteredBrokers}
            onEdit={b => setEditBroker(b)}
            onDelete={deleteBroker}
          />
        )}
        {activeTab === 'operators' && (
          <OperatorsTable
            operators={filteredOps}
            onEdit={o => setEditOperator(o)}
            onDelete={deleteOperator}
          />
        )}
      </div>
      </div>
    </div>
  );
};

export default Sourcing;
