// API helpers for the Funders (capital-source sourcing) engine.

// Manual pipeline-conversion tracking — fixed set, no automation. Must match
// HIT_STATUSES in backend/app/api/v1/funders_routes.py.
export const FUNDER_STATUSES = ['New', 'Researching', 'Contacted', 'Meeting Scheduled', 'Committed', 'Passed'] as const;
export type FunderStatus = typeof FUNDER_STATUSES[number];

export interface FunderDefinition {
  id: string;
  key: string;
  label: string;
  enabled: boolean;
  stubbed: boolean;
  disabled_reason?: string | null;
}

export interface FunderHit {
  id: string;
  source: string;
  name: string;
  entity_type?: string | null;
  city?: string | null;
  state?: string | null;
  aum?: number | null;
  cre_loan_total?: number | null;
  cre_growth_pct?: number | null;
  contact_address?: string | null;
  external_id?: string | null;
  raw_data?: string | null;
  first_seen_at: string;
  last_seen_at: string;
  pinned: boolean;
  note: string;
  status: FunderStatus;
}

const BASE = '/api/v1/funders';

async function unwrap<T>(r: Response): Promise<T> {
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Request failed (${r.status})`);
  return j;
}

// ── Definitions ─────────────────────────────────────────────────────────────

export async function fetchDefinitions(): Promise<FunderDefinition[]> {
  const r = await fetch(`${BASE}/definitions`);
  const j = await unwrap<{ definitions: FunderDefinition[] }>(r);
  return j.definitions ?? [];
}

export async function updateDefinition(id: string, enabled: boolean): Promise<FunderDefinition> {
  const r = await fetch(`${BASE}/definitions/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  const j = await unwrap<{ definition: FunderDefinition }>(r);
  return j.definition;
}

// ── Hits ─────────────────────────────────────────────────────────────────────

export async function fetchHits(params: {
  source?: string;
  entityType?: string;
  minAum?: number;
  pinned?: boolean;
  status?: FunderStatus;
  nameSearch?: string;
} = {}): Promise<FunderHit[]> {
  const qs = new URLSearchParams();
  if (params.source) qs.set('source', params.source);
  if (params.entityType) qs.set('entity_type', params.entityType);
  if (params.minAum !== undefined) qs.set('min_aum', String(params.minAum));
  if (params.pinned !== undefined) qs.set('pinned', String(params.pinned));
  if (params.status) qs.set('status', params.status);
  if (params.nameSearch) qs.set('name_search', params.nameSearch);
  const r = await fetch(`${BASE}/hits${qs.toString() ? `?${qs}` : ''}`);
  const j = await unwrap<{ hits: FunderHit[] }>(r);
  return j.hits ?? [];
}

export type CreateFunderPayload = {
  name: string;
  source?: string;
  entity_type?: string;
  city?: string;
  state?: string;
  aum?: number;
  contact_address?: string;
  external_id?: string;
  raw_data?: Record<string, unknown>;
};

export async function createHit(payload: CreateFunderPayload): Promise<FunderHit> {
  const r = await fetch(`${BASE}/hits`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const j = await unwrap<{ hit: FunderHit }>(r);
  return j.hit;
}

export async function updateHit(id: string, patch: { pinned?: boolean; note?: string; status?: FunderStatus }): Promise<FunderHit> {
  const r = await fetch(`${BASE}/hits/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  });
  const j = await unwrap<{ hit: FunderHit }>(r);
  return j.hit;
}

export async function exportHits(hitIds: string[]): Promise<{ sheet_url: string }> {
  const r = await fetch(`${BASE}/hits/export`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ hit_ids: hitIds }),
  });
  return unwrap<{ sheet_url: string }>(r);
}

// ── Scan trigger ─────────────────────────────────────────────────────────────

export async function triggerScan(): Promise<{ created: number }> {
  const r = await fetch(`${BASE}/scan`, { method: 'POST' });
  return unwrap<{ created: number }>(r);
}
