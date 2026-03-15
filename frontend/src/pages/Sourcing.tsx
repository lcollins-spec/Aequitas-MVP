import { useState, useEffect, useRef, useCallback } from 'react';
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
} from 'lucide-react';

// ── Types ───────────────────────────────────────────────────────────────────

interface MarketEntry {
  id: string;
  name: string;
}

type PropertyStatus = 'not_contacted' | 'outreach_sent' | 'in_conversation' | 'passed' | 'active_deal';
type BrokerStatus = 'cold' | 'introduced' | 'active' | 'strong';
type OperatorStatus = 'prospecting' | 'intro_made' | 'meeting_held' | 'partnership_discussion' | 'active_partner';
type Tab = 'properties' | 'brokers' | 'operators';
type SortDir = 'asc' | 'desc';

interface SourcingProperty {
  id: string;
  market: string;
  address: string;
  units: number;
  owner_name: string;
  status: PropertyStatus;
  last_contact_date: string;
  next_followup_date: string;
  notes: string;
  deal_id: number | null;
  lat?: number;
  lng?: number;
}

interface SourcingBroker {
  id: string;
  market: string;
  name: string;
  firm: string;
  status: BrokerStatus;
  last_contact_date: string;
  last_deal_sent: string;
  notes: string;
}

interface SourcingOperator {
  id: string;
  market: string;
  name: string;
  firm: string;
  status: OperatorStatus;
  properties_managed: string;
  last_contact_date: string;
  notes: string;
}

interface SourcingData {
  properties: SourcingProperty[];
  brokers: SourcingBroker[];
  operators: SourcingOperator[];
}

// ── localStorage ─────────────────────────────────────────────────────────────

const LS_DATA = 'sourcing_data';
const LS_MARKETS = 'sourcing_markets';

const DEFAULT_MARKETS: MarketEntry[] = [
  { id: '1', name: 'Austin, TX' },
  { id: '2', name: 'Phoenix, AZ' },
];

const EMPTY_DATA: SourcingData = { properties: [], brokers: [], operators: [] };

function loadMarkets(): MarketEntry[] {
  try {
    const raw = localStorage.getItem(LS_MARKETS);
    if (raw) return JSON.parse(raw);
  } catch {}
  return DEFAULT_MARKETS;
}
function saveMarkets(m: MarketEntry[]) {
  localStorage.setItem(LS_MARKETS, JSON.stringify(m));
  fetch('/api/v1/app-data/sourcing_markets', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: m }),
  }).catch(() => {});
}

function loadData(): SourcingData {
  try {
    const raw = localStorage.getItem(LS_DATA);
    if (raw) {
      const p = JSON.parse(raw);
      return {
        properties: p.properties || [],
        brokers: p.brokers || [],
        operators: p.operators || [],
      };
    }
  } catch {}
  return EMPTY_DATA;
}
function saveData(d: SourcingData) {
  localStorage.setItem(LS_DATA, JSON.stringify(d));
  fetch('/api/v1/app-data/sourcing_data', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: d }),
  }).catch(() => {});
}

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

function propStatus(s: PropertyStatus) { return PROP_STATUSES.find(x => x.value === s) || PROP_STATUSES[0]; }
function brokerStatus(s: BrokerStatus) { return BROKER_STATUSES.find(x => x.value === s) || BROKER_STATUSES[0]; }
function operatorStatus(s: OperatorStatus) { return OPERATOR_STATUSES.find(x => x.value === s) || OPERATOR_STATUSES[0]; }

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
}

const SourcingMap = ({ properties, selectedMarket, onGeocode }: SourcingMapProps) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any[]>([]);
  const infoWindowRef = useRef<any>(null);
  const [mapsReady, setMapsReady] = useState(false);

  const apiKey = (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

  // Load Google Maps script
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

  // Initialize map once
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

  // Re-plot whenever properties or market changes
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

    // Serial geocoding with small delay to avoid rate limits
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

    // Also plot existing platform deals that have coordinates
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

    // Fit bounds if we already have geocoded properties
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
      {/* Legend */}
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
}

const PropertyModal = ({ initial, market, onSave, onClose }: PropertyModalProps) => {
  const [form, setForm] = useState<Partial<SourcingProperty>>({
    address: '', units: 0, owner_name: '', status: 'not_contacted',
    last_contact_date: '', next_followup_date: '', notes: '', deal_id: null,
    ...initial,
  });

  const f = (k: keyof SourcingProperty, v: any) => setForm(p => ({ ...p, [k]: v }));

  const save = () => {
    if (!form.address?.trim()) return;
    onSave({
      id: form.id || Date.now().toString(),
      market,
      address: form.address || '',
      units: Number(form.units) || 0,
      owner_name: form.owner_name || '',
      status: (form.status as PropertyStatus) || 'not_contacted',
      last_contact_date: form.last_contact_date || '',
      next_followup_date: form.next_followup_date || '',
      notes: form.notes || '',
      deal_id: form.deal_id ?? null,
      lat: form.lat,
      lng: form.lng,
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Next Followup Date</label>
              <input
                type="date" value={form.next_followup_date || ''}
                onChange={e => f('next_followup_date', e.target.value)}
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
          {/* File picker */}
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
// Shown below the map as a compact list

interface PropertiesTableProps {
  properties: SourcingProperty[];
  onEdit: (p: SourcingProperty) => void;
  onDelete: (id: string) => void;
}

const PropertiesTable = ({ properties, onEdit, onDelete }: PropertiesTableProps) => {
  const [sort, setSort] = useState<{ col: keyof SourcingProperty; dir: SortDir }>({ col: 'address', dir: 'asc' });

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
              <Th col="last_contact_date" label="Last Contact" />
              <Th col="next_followup_date" label="Next Followup" />
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map(p => {
              const si = propStatus(p.status);
              const overdue = isOverdue(p.next_followup_date);
              return (
                <tr
                  key={p.id}
                  onClick={() => onEdit(p)}
                  className="cursor-pointer hover:bg-blue-50 transition-colors"
                >
                  <td className="px-4 py-3 font-medium text-gray-800">{p.address}</td>
                  <td className="px-4 py-3 text-gray-600">{p.units || '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{p.owner_name || '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${si.cls}`}>{si.label}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{p.last_contact_date || '—'}</td>
                  <td className={`px-4 py-3 whitespace-nowrap text-sm ${overdue ? 'bg-yellow-50 text-yellow-800 font-medium' : 'text-gray-600'}`}>
                    {p.next_followup_date || '—'}
                    {overdue && <span className="ml-1 text-xs text-yellow-600">overdue</span>}
                  </td>
                  <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
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

const Sourcing = () => {
  const [markets, setMarkets] = useState<MarketEntry[]>(loadMarkets);
  const [selectedMarket, setSelectedMarket] = useState<MarketEntry | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>('properties');
  const [data, setData] = useState<SourcingData>(loadData);

  // Modal state
  const [showAddProp, setShowAddProp] = useState(false);
  const [editProp, setEditProp] = useState<SourcingProperty | null>(null);
  const [showAddBroker, setShowAddBroker] = useState(false);
  const [editBroker, setEditBroker] = useState<SourcingBroker | null>(null);
  const [showAddOperator, setShowAddOperator] = useState(false);
  const [editOperator, setEditOperator] = useState<SourcingOperator | null>(null);
  const [showImport, setShowImport] = useState(false);

  // Market sidebar state
  const [showAddMarket, setShowAddMarket] = useState(false);
  const [newMarketInput, setNewMarketInput] = useState('');

  // Init: select first market + hydrate from backend
  useEffect(() => {
    const mkts = loadMarkets();
    setSelectedMarket(mkts[0] ?? null);

    // Background: load sourcing data from backend (overwrites localStorage if backend has data)
    fetch('/api/v1/app-data/sourcing_data')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.value) {
          const d: SourcingData = {
            properties: json.value.properties || [],
            brokers: json.value.brokers || [],
            operators: json.value.operators || [],
          };
          localStorage.setItem(LS_DATA, JSON.stringify(d));
          setData(d);
        }
      })
      .catch(() => {});

    fetch('/api/v1/app-data/sourcing_markets')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (json?.value && Array.isArray(json.value) && json.value.length > 0) {
          const m: MarketEntry[] = json.value;
          localStorage.setItem(LS_MARKETS, JSON.stringify(m));
          setMarkets(m);
          setSelectedMarket(prev => prev ?? m[0] ?? null);
        }
      })
      .catch(() => {});
  }, []);

  // ── Data helpers ──────────────────────────────────────────────────────────

  const updateData = (updated: SourcingData) => {
    setData(updated);
    saveData(updated);
  };

  // Geocode cache update (from SourcingMap)
  const handleGeocode = useCallback((id: string, lat: number, lng: number) => {
    setData(prev => {
      const updated = {
        ...prev,
        properties: prev.properties.map(p => p.id === id ? { ...p, lat, lng } : p),
      };
      saveData(updated);
      return updated;
    });
  }, []);

  // ── Property CRUD ─────────────────────────────────────────────────────────

  const saveProp = (p: SourcingProperty) => {
    const exists = data.properties.some(x => x.id === p.id);
    const updated = exists
      ? data.properties.map(x => x.id === p.id ? p : x)
      : [...data.properties, p];
    updateData({ ...data, properties: updated });
    setShowAddProp(false);
    setEditProp(null);
  };

  const deleteProp = (id: string) => {
    updateData({ ...data, properties: data.properties.filter(p => p.id !== id) });
  };

  // ── Broker CRUD ───────────────────────────────────────────────────────────

  const saveBroker = (b: SourcingBroker) => {
    const exists = data.brokers.some(x => x.id === b.id);
    const updated = exists
      ? data.brokers.map(x => x.id === b.id ? b : x)
      : [...data.brokers, b];
    updateData({ ...data, brokers: updated });
    setShowAddBroker(false);
    setEditBroker(null);
  };

  const deleteBroker = (id: string) => {
    updateData({ ...data, brokers: data.brokers.filter(b => b.id !== id) });
  };

  // ── Operator CRUD ─────────────────────────────────────────────────────────

  const saveOperator = (o: SourcingOperator) => {
    const exists = data.operators.some(x => x.id === o.id);
    const updated = exists
      ? data.operators.map(x => x.id === o.id ? o : x)
      : [...data.operators, o];
    updateData({ ...data, operators: updated });
    setShowAddOperator(false);
    setEditOperator(null);
  };

  const deleteOperator = (id: string) => {
    updateData({ ...data, operators: data.operators.filter(o => o.id !== id) });
  };

  // ── Import ────────────────────────────────────────────────────────────────

  const handleImport = (items: any[]) => {
    if (activeTab === 'properties') {
      updateData({ ...data, properties: [...data.properties, ...items] });
    } else if (activeTab === 'brokers') {
      updateData({ ...data, brokers: [...data.brokers, ...items] });
    } else {
      updateData({ ...data, operators: [...data.operators, ...items] });
    }
    setShowImport(false);
  };

  // ── Market CRUD ───────────────────────────────────────────────────────────

  const addMarket = () => {
    const name = newMarketInput.trim();
    if (!name) return;
    const entry: MarketEntry = { id: Date.now().toString(), name };
    const updated = [...markets, entry];
    setMarkets(updated);
    saveMarkets(updated);
    setNewMarketInput('');
    setShowAddMarket(false);
    setSelectedMarket(entry);
  };

  const removeMarket = (id: string) => {
    const updated = markets.filter(m => m.id !== id);
    setMarkets(updated);
    saveMarkets(updated);
    if (selectedMarket?.id === id) setSelectedMarket(updated[0] ?? null);
  };

  // ── Derived ───────────────────────────────────────────────────────────────

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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex min-h-screen bg-gray-50">

      {/* ── Market Sidebar ── */}
      <div className="w-52 bg-white border-r border-gray-200 p-4 flex flex-col flex-shrink-0">
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Markets</h3>

        {showAddMarket ? (
          <div className="mb-3">
            <input
              autoFocus
              type="text"
              placeholder="City, ST"
              value={newMarketInput}
              onChange={e => setNewMarketInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addMarket(); if (e.key === 'Escape') setShowAddMarket(false); }}
              className="w-full text-sm px-2.5 py-1.5 border border-gray-300 rounded-lg focus:outline-none focus:border-blue-400"
            />
            <div className="flex gap-1 mt-1.5">
              <button onClick={addMarket} className="flex-1 text-xs py-1.5 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors font-medium">Add</button>
              <button onClick={() => setShowAddMarket(false)} className="flex-1 text-xs py-1.5 border border-gray-300 text-gray-600 rounded-md hover:bg-gray-50 transition-colors">Cancel</button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAddMarket(true)}
            className="mb-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={14} /> Add Market
          </button>
        )}

        <div className="space-y-1 flex-1">
          {markets.map(m => (
            <div
              key={m.id}
              onClick={() => setSelectedMarket(m)}
              className={`flex items-center justify-between p-2.5 rounded-lg cursor-pointer transition-colors group ${
                selectedMarket?.id === m.id ? 'bg-blue-50 border border-blue-200' : 'hover:bg-gray-50'
              }`}
            >
              <span className="text-sm font-medium text-gray-800 truncate flex-1">{m.name}</span>
              <button
                onClick={e => { e.stopPropagation(); removeMarket(m.id); }}
                className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 transition-opacity flex-shrink-0"
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* ── Main Content ── */}
      <div className="flex-1 p-4 md:p-6 lg:p-8 min-w-0">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-800">Sourcing</h1>
          <p className="text-sm text-gray-500 mt-1">Track properties, brokers, and operators by market</p>
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
            />
            <PropertiesTable
              properties={filteredProps}
              onEdit={p => setEditProp(p)}
              onDelete={deleteProp}
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

      {/* ── Modals ── */}
      {(showAddProp || editProp) && (
        <PropertyModal
          initial={editProp}
          market={selectedMarket?.name ?? ''}
          onSave={saveProp}
          onClose={() => { setShowAddProp(false); setEditProp(null); }}
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
    </div>
  );
};

export default Sourcing;
