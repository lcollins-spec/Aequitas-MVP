// API helpers for the sourcing pipeline (markets, properties, brokers, operators).
// All data now lives in the database; this module replaces localStorage reads/writes.

export interface MarketEntry { id: string; name: string; }

export interface SourcingProperty {
  id: string;
  market: string;
  address: string;
  units: number;
  transaction_type: string;
  owner_name: string;
  operator_name: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  status: string;
  priority: string;
  notes: string;
  deal_id: number | null;
  gp_id?: number | null;
  lat?: number;
  lng?: number;
  updated_at?: string;
  property_legislation?: string | null;
  activity_log?: string;
  om_drive_url?: string | null;
}

export interface SourcingBroker {
  id: string;
  market: string;
  name: string;
  firm: string;
  status: string;
  last_contact_date: string;
  last_deal_sent: string;
  notes: string;
}

export interface SourcingOperator {
  id: string;
  market: string;
  name: string;
  firm: string;
  status: string;
  properties_managed: string;
  last_contact_date: string;
  notes: string;
}

const BASE = '/api/v1/sourcing';

// Every mutating call below goes through this so a non-2xx response throws
// with the backend's actual error message instead of silently resolving to
// `undefined` (fetch only rejects on network failure, never on HTTP error
// status) — a failed save used to look identical to a successful one.
async function unwrap<T>(r: Response): Promise<T> {
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

// ── Markets ───────────────────────────────────────────────────────────────────

export async function fetchMarkets(): Promise<MarketEntry[]> {
  const r = await fetch(`${BASE}/markets`);
  const j = await r.json();
  return j.markets ?? [];
}

export async function createMarket(market: MarketEntry): Promise<MarketEntry> {
  const r = await fetch(`${BASE}/markets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(market),
  });
  const j = await unwrap<{ market: MarketEntry }>(r);
  return j.market;
}

export async function deleteMarket(id: string): Promise<void> {
  const r = await fetch(`${BASE}/markets/${id}`, { method: 'DELETE' });
  await unwrap(r);
}

// ── Properties ────────────────────────────────────────────────────────────────

export async function fetchProperties(): Promise<SourcingProperty[]> {
  const r = await fetch(`${BASE}/properties`);
  const j = await r.json();
  return j.properties ?? [];
}

export async function createProperty(prop: SourcingProperty): Promise<SourcingProperty> {
  const r = await fetch(`${BASE}/properties`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(prop),
  });
  const j = await unwrap<{ property: SourcingProperty }>(r);
  return j.property;
}

export async function bulkCreateProperties(props: SourcingProperty[]): Promise<void> {
  const r = await fetch(`${BASE}/properties/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(props),
  });
  await unwrap(r);
}

export async function updateProperty(id: string, patch: Partial<SourcingProperty>): Promise<SourcingProperty> {
  const r = await fetch(`${BASE}/properties/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const j = await unwrap<{ property: SourcingProperty }>(r);
  return j.property;
}

export async function deleteProperty(id: string): Promise<void> {
  const r = await fetch(`${BASE}/properties/${id}`, { method: 'DELETE' });
  await unwrap(r);
}

export async function addPropertyActivity(id: string, note: string): Promise<SourcingProperty> {
  const r = await fetch(`${BASE}/properties/${id}/activity`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ note }),
  });
  const j = await unwrap<{ property: SourcingProperty }>(r);
  return j.property;
}

// ── Brokers ───────────────────────────────────────────────────────────────────

export async function fetchBrokers(): Promise<SourcingBroker[]> {
  const r = await fetch(`${BASE}/brokers`);
  const j = await r.json();
  return j.brokers ?? [];
}

export async function createBroker(broker: SourcingBroker): Promise<SourcingBroker> {
  const r = await fetch(`${BASE}/brokers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(broker),
  });
  const j = await unwrap<{ broker: SourcingBroker }>(r);
  return j.broker;
}

export async function bulkCreateBrokers(brokers: SourcingBroker[]): Promise<void> {
  const r = await fetch(`${BASE}/brokers/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(brokers),
  });
  await unwrap(r);
}

export async function updateBroker(id: string, patch: Partial<SourcingBroker>): Promise<SourcingBroker> {
  const r = await fetch(`${BASE}/brokers/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const j = await unwrap<{ broker: SourcingBroker }>(r);
  return j.broker;
}

export async function deleteBroker(id: string): Promise<void> {
  const r = await fetch(`${BASE}/brokers/${id}`, { method: 'DELETE' });
  await unwrap(r);
}

// ── Operators ─────────────────────────────────────────────────────────────────

export async function fetchOperators(): Promise<SourcingOperator[]> {
  const r = await fetch(`${BASE}/operators`);
  const j = await r.json();
  return j.operators ?? [];
}

export async function createOperator(op: SourcingOperator): Promise<SourcingOperator> {
  const r = await fetch(`${BASE}/operators`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(op),
  });
  const j = await unwrap<{ operator: SourcingOperator }>(r);
  return j.operator;
}

export async function bulkCreateOperators(ops: SourcingOperator[]): Promise<void> {
  const r = await fetch(`${BASE}/operators/bulk`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(ops),
  });
  await unwrap(r);
}

export async function updateOperator(id: string, patch: Partial<SourcingOperator>): Promise<SourcingOperator> {
  const r = await fetch(`${BASE}/operators/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const j = await unwrap<{ operator: SourcingOperator }>(r);
  return j.operator;
}

export async function deleteOperator(id: string): Promise<void> {
  const r = await fetch(`${BASE}/operators/${id}`, { method: 'DELETE' });
  await unwrap(r);
}

// ── Deal import parsing ────────────────────────────────────────────────────────

export interface ParsedDealFields {
  property_address: string;
  unit_count: string;
  asking_price: string;
  seller_broker_name: string;
  operator_name: string;
  market_city: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
}

export async function parseDeal(text: string, file: File | null): Promise<ParsedDealFields> {
  const fd = new FormData();
  if (text.trim()) fd.append('text', text);
  if (file) fd.append('file', file);
  const r = await fetch(`${BASE}/parse-deal`, { method: 'POST', body: fd });
  const j = await r.json();
  if (!j.success) throw new Error(j.error || 'Parse failed');
  return j.fields;
}
