// API helpers for the sourcing signals engine (public-records + HUD lead sourcing).

// Manual pipeline-conversion tracking — fixed set, no automation. Must match
// HIT_STATUSES in backend/app/api/v1/signals_routes.py.
export const HIT_STATUSES = ['New', 'Enriched', 'Contacted', 'Responding', 'Dead', 'Under LOI'] as const;
export type HitStatus = typeof HIT_STATUSES[number];

export interface SignalMarket {
  id: string;
  name: string;
  city: string;
  state: string;
  assessor_feed_url?: string | null;
  assessor_feed_type?: 'arcgis' | 'socrata' | null;
  assessor_field_mapping?: string | null;
  code_violations_feed_url?: string | null;
  code_violations_feed_type?: 'arcgis' | 'socrata' | null;
  code_violations_field_mapping?: string | null;
  tax_delinquent_feed_url?: string | null;
  tax_delinquent_feed_type?: 'arcgis' | 'socrata' | null;
  tax_delinquent_field_mapping?: string | null;
}

export interface SignalDefinition {
  id: string;
  key: string;
  label: string;
  category: 'public_records' | 'inbox';
  enabled: boolean;
  stubbed: boolean;
  disabled_reason?: string | null;
}

export interface SignalHit {
  id: string;
  market_id: string;
  source: string;
  address: string;
  owner_name?: string | null;
  owner_mailing_address?: string | null;
  unit_count?: number | null;
  year_built?: number | null;
  is_lihtc: boolean;
  assessed_value?: number | null;
  listing_price?: number | null;
  listing_broker?: string | null;
  listing_url?: string | null;
  raw_data?: string | null;
  first_seen_at: string;
  last_seen_at: string;
  pinned: boolean;
  note: string;
  status: HitStatus;
  stacked_count: number;
  owner_stacked_count: number;
}

const BASE = '/api/v1/signals';

// Every mutating call goes through this so a non-2xx response throws with the
// backend's actual error message instead of silently resolving — mirrors the
// same unwrap() helper in sourcingApi.ts.
async function unwrap<T>(r: Response): Promise<T> {
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

// ── Markets ───────────────────────────────────────────────────────────────────

export async function fetchMarkets(): Promise<SignalMarket[]> {
  const r = await fetch(`${BASE}/markets`);
  const j = await unwrap<{ markets: SignalMarket[] }>(r);
  return j.markets ?? [];
}

// Field mappings are sent as plain objects (target_key -> source_field_name);
// the backend JSON-serializes them before storing. This is looser than
// SignalMarket's stored `string | null` shape since that's the read-back form.
export type MarketFeedPayload = Partial<Omit<SignalMarket, 'assessor_field_mapping' | 'code_violations_field_mapping' | 'tax_delinquent_field_mapping'>> & {
  assessor_field_mapping?: Record<string, string> | null;
  code_violations_field_mapping?: Record<string, string> | null;
  tax_delinquent_field_mapping?: Record<string, string> | null;
};

export async function createMarket(market: MarketFeedPayload): Promise<SignalMarket> {
  const r = await fetch(`${BASE}/markets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(market),
  });
  const j = await unwrap<{ market: SignalMarket }>(r);
  return j.market;
}

export async function updateMarket(id: string, patch: MarketFeedPayload): Promise<SignalMarket> {
  const r = await fetch(`${BASE}/markets/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const j = await unwrap<{ market: SignalMarket }>(r);
  return j.market;
}

export async function deleteMarket(id: string): Promise<void> {
  const r = await fetch(`${BASE}/markets/${id}`, { method: 'DELETE' });
  await unwrap(r);
}

// ── Signal definitions ────────────────────────────────────────────────────────

export async function fetchDefinitions(): Promise<SignalDefinition[]> {
  const r = await fetch(`${BASE}/definitions`);
  const j = await unwrap<{ definitions: SignalDefinition[] }>(r);
  return j.definitions ?? [];
}

export async function updateDefinition(id: string, enabled: boolean): Promise<SignalDefinition> {
  const r = await fetch(`${BASE}/definitions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  const j = await unwrap<{ definition: SignalDefinition }>(r);
  return j.definition;
}

// ── Hits ──────────────────────────────────────────────────────────────────────

export async function fetchHits(params: {
  marketId?: string;
  source?: string;
  pinned?: boolean;
  minStacked?: number;
  unitMin?: number;
  unitMax?: number;
  builtAfter?: number;
  excludeLihtc?: boolean;
  ownerSearch?: string;
} = {}): Promise<SignalHit[]> {
  const qs = new URLSearchParams();
  if (params.marketId) qs.set('market_id', params.marketId);
  if (params.source) qs.set('source', params.source);
  if (params.pinned !== undefined) qs.set('pinned', String(params.pinned));
  if (params.minStacked !== undefined) qs.set('min_stacked', String(params.minStacked));
  if (params.unitMin !== undefined) qs.set('unit_min', String(params.unitMin));
  if (params.unitMax !== undefined) qs.set('unit_max', String(params.unitMax));
  if (params.builtAfter !== undefined) qs.set('built_after', String(params.builtAfter));
  if (params.excludeLihtc !== undefined) qs.set('exclude_lihtc', String(params.excludeLihtc));
  if (params.ownerSearch) qs.set('owner_search', params.ownerSearch);
  const r = await fetch(`${BASE}/hits${qs.toString() ? `?${qs}` : ''}`);
  const j = await unwrap<{ hits: SignalHit[] }>(r);
  return j.hits ?? [];
}

export async function updateHit(id: string, patch: { pinned?: boolean; note?: string; status?: HitStatus }): Promise<SignalHit> {
  const r = await fetch(`${BASE}/hits/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const j = await unwrap<{ hit: SignalHit }>(r);
  return j.hit;
}

export async function importTaxDelinquent(marketId: string, file: File): Promise<{ created: number }> {
  const form = new FormData();
  form.append('market_id', marketId);
  form.append('file', file);
  const r = await fetch(`${BASE}/hits/tax-delinquent-import`, { method: 'POST', body: form });
  return unwrap<{ created: number }>(r);
}

// ── Scan trigger + digest ──────────────────────────────────────────────────────

export async function triggerScan(marketId?: string): Promise<{ created: number }> {
  const r = await fetch(`${BASE}/scan`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(marketId ? { market_id: marketId } : {}),
  });
  return unwrap<{ created: number }>(r);
}

export async function fetchDigest(): Promise<{ count: number; hits: SignalHit[] }> {
  const r = await fetch(`${BASE}/digest`);
  return unwrap<{ count: number; hits: SignalHit[] }>(r);
}
