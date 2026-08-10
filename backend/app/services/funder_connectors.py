"""
Funder connectors for the capital-source sourcing engine.

Unlike signal_connectors.py (per-market feed config) or even hud_datasets.py
(national datasets, but still cross-referenced per-market), these two are
fully national with zero market/city parameters — there is no market concept
anywhere in the funder engine.

Both endpoints were verified live (not guessed from docs) before writing
this file:

  - SEC IAPD firm search (api.adviserinfo.sec.gov/search/firm): real, no
    auth, paginated via `start`. Confirmed 288 real "family office" hits
    with firm_name/firm_ia_scope/firm_source_id/firm_ia_address_details.
    No AUM field is present on this search endpoint (only on a per-firm
    detail page), so `aum` is left null for this source rather than making
    an N+1 detail call per firm. The `hits` param is silently capped at 20
    server-side regardless of what's requested (verified: hits=10, 20, and
    50 all return exactly 20 rows) — pagination below advances `start` by
    the actual number of rows returned each page, not a requested page size,
    since advancing by a larger assumed page size would skip records.

  - FDIC BankFind (api.fdic.gov/banks/*, banks.data.fdic.gov 301-redirects
    here now): real, no key. `institutions` confirmed 4,254 active banks;
    `financials` confirmed real quarterly call-report data with LNREMULT
    (multifamily) + LNRENRES (nonfarm nonresidential CRE) loan columns,
    filterable by REPDTE + ASSET range, offset-paginated.

    Raw QoQ growth on this data is noisy in a way that matters for the
    product: a same-quarter join at $1B+ assets surfaced banks like Fifth
    Third and Pinnacle Bank showing 60-130% single-quarter CRE growth,
    which for banks that size is almost certainly a merger/acquisition
    absorbing another institution's loan book, not organic relationship-
    building — the actual signal this feature wants. Two guards below filter
    that out: a CRE-base floor (skip tiny books where % growth is just
    noise) and an asset-growth ceiling (skip banks whose total balance
    sheet also jumped sharply in the same quarter, the tell for M&A).
"""
import json
import logging
from datetime import datetime

import requests

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 30

IAPD_SEARCH_URL = 'https://api.adviserinfo.sec.gov/search/firm'
FDIC_INSTITUTIONS_URL = 'https://api.fdic.gov/banks/institutions'
FDIC_FINANCIALS_URL = 'https://api.fdic.gov/banks/financials'

FAMILY_OFFICE_QUERY = 'family office'
FAMILY_OFFICE_MAX_RESULTS = 500

BANK_ASSET_FLOOR_THOUSANDS = 1_000_000       # $1B+ total assets
BANK_CRE_BASE_FLOOR_THOUSANDS = 25_000       # $25M+ prior-quarter CRE book
BANK_ASSET_GROWTH_CEILING = 0.40             # >40% QoQ asset jump ⇒ likely M&A, not organic
BANK_CRE_GROWTH_MIN = 0.05                   # 5%+ QoQ CRE growth to surface as a hit
BANK_MAX_RESULTS = 100


def fetch_family_offices():
    """Active SEC-registered investment advisers matching 'family office'."""
    records = []
    start = 0
    total = None

    while start < FAMILY_OFFICE_MAX_RESULTS and (total is None or start < total):
        resp = requests.get(
            IAPD_SEARCH_URL,
            params={'query': FAMILY_OFFICE_QUERY, 'start': start},
            headers={'Accept': 'application/json'},
            timeout=REQUEST_TIMEOUT,
        )
        resp.raise_for_status()
        payload = resp.json()
        hits_block = payload.get('hits', {})
        total = hits_block.get('total', 0)
        hits = hits_block.get('hits', [])
        if not hits:
            break

        for hit in hits:
            src = hit.get('_source', {})
            if src.get('firm_ia_scope') != 'ACTIVE':
                continue

            city, state, contact_address = None, None, None
            addr_raw = src.get('firm_ia_address_details')
            if addr_raw:
                try:
                    office = json.loads(addr_raw).get('officeAddress', {})
                    city = office.get('city')
                    state = office.get('state')
                    parts = [office.get('street1'), office.get('street2'),
                             office.get('city'), office.get('state'), office.get('postalCode')]
                    contact_address = ', '.join(p for p in parts if p)
                except (ValueError, TypeError):
                    pass

            records.append({
                'name': src.get('firm_name'),
                'entity_type': 'family_office',
                'city': city,
                'state': state,
                'aum': None,
                'contact_address': contact_address,
                'external_id': src.get('firm_source_id'),
                'raw_data': {
                    'sec_number': src.get('firm_ia_full_sec_number'),
                    'other_names': src.get('firm_other_names'),
                    'branches_count': src.get('firm_branches_count'),
                },
            })

        start += len(hits)

    logger.info(f"fetch_family_offices: {len(records)} active firms from {total} total matches")
    return records


def _latest_quarter_end():
    """Discover the most recent REPDTE with call-report data, and the prior quarter's."""
    resp = requests.get(
        FDIC_FINANCIALS_URL,
        params={'fields': 'REPDTE', 'sort_by': 'REPDTE', 'sort_order': 'DESC', 'limit': 1},
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    data = resp.json().get('data', [])
    if not data:
        return None, None
    latest = data[0]['data']['REPDTE']  # 'YYYYMMDD'
    latest_dt = datetime.strptime(latest, '%Y%m%d')

    quarter_ends = ['0331', '0630', '0930', '1231']
    idx = quarter_ends.index(latest[4:])
    if idx == 0:
        prior = f"{latest_dt.year - 1}1231"
    else:
        prior = f"{latest_dt.year}{quarter_ends[idx - 1]}"
    return latest, prior


def _fetch_financials_snapshot(repdte):
    resp = requests.get(
        FDIC_FINANCIALS_URL,
        params={
            'filters': f'REPDTE:{repdte} AND ASSET:[{BANK_ASSET_FLOOR_THOUSANDS} TO *]',
            'fields': 'CERT,NAME,CITY,STALP,ASSET,LNREMULT,LNRENRES',
            'limit': 5000,
        },
        timeout=REQUEST_TIMEOUT,
    )
    resp.raise_for_status()
    return {row['data']['CERT']: row['data'] for row in resp.json().get('data', [])}


def fetch_bank_cre_growth():
    """Banks with $1B+ assets whose CRE (multifamily + nonfarm nonresidential)
    loan book grew meaningfully quarter-over-quarter, excluding likely M&A."""
    latest_repdte, prior_repdte = _latest_quarter_end()
    if not latest_repdte:
        logger.warning("fetch_bank_cre_growth: could not determine latest REPDTE")
        return []

    latest = _fetch_financials_snapshot(latest_repdte)
    prior = _fetch_financials_snapshot(prior_repdte)

    candidates = []
    for cert, r1 in latest.items():
        r0 = prior.get(cert)
        if not r0:
            continue

        cre0 = (r0.get('LNREMULT') or 0) + (r0.get('LNRENRES') or 0)
        cre1 = (r1.get('LNREMULT') or 0) + (r1.get('LNRENRES') or 0)
        if cre0 < BANK_CRE_BASE_FLOOR_THOUSANDS:
            continue
        cre_growth_pct = (cre1 - cre0) / cre0

        asset0, asset1 = r0.get('ASSET') or 0, r1.get('ASSET') or 0
        asset_growth_pct = (asset1 - asset0) / asset0 if asset0 else 0
        if asset_growth_pct > BANK_ASSET_GROWTH_CEILING:
            continue  # likely merger/acquisition, not organic CRE growth

        if cre_growth_pct < BANK_CRE_GROWTH_MIN:
            continue

        candidates.append({
            'name': (r1.get('NAME') or '').title(),
            'entity_type': 'bank',
            'city': (r1.get('CITY') or '').title(),
            'state': r1.get('STALP'),
            'aum': asset1 * 1000,  # ASSET is reported in thousands of dollars
            'cre_loan_total': cre1 * 1000,
            'cre_growth_pct': round(cre_growth_pct * 100, 2),
            'contact_address': None,
            'external_id': str(cert),
            'raw_data': {
                'cert': cert, 'repdte_latest': latest_repdte, 'repdte_prior': prior_repdte,
                'cre_loans_prior': cre0 * 1000, 'cre_loans_latest': cre1 * 1000,
                'assets_prior': asset0 * 1000, 'assets_latest': asset1 * 1000,
            },
        })

    candidates.sort(key=lambda r: r['cre_growth_pct'], reverse=True)
    result = candidates[:BANK_MAX_RESULTS]
    logger.info(
        f"fetch_bank_cre_growth: {len(result)} banks above {BANK_CRE_GROWTH_MIN*100:.0f}% "
        f"CRE growth (from {len(candidates)} qualifying, {len(latest)} banks at ${BANK_ASSET_FLOOR_THOUSANDS/1000:.0f}M+ assets)"
    )
    return result
