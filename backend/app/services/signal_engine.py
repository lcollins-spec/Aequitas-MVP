"""
Signal engine — the market-agnostic runner. Loops enabled, non-stubbed
signals against each configured SignalMarketModel and upserts SignalHitModel
rows. Contains no market-specific logic: per-market behavior comes entirely
from each market's feed_url/field_mapping config columns.
"""
import json
import logging
import re
import uuid
from datetime import datetime

from app.database import db, SignalMarketModel, SignalDefinitionModel, SignalHitModel, SignalScanRunModel
from app.services import signal_connectors, hud_datasets

logger = logging.getLogger(__name__)

UNIT_MIN = 20
UNIT_MAX = 80
LONG_HOLD_DAYS = 365 * 7  # 7 years, per spec's "deed date >7-10 years ago"


def _normalize_address(address):
    return re.sub(r'[^a-z0-9]', '', (address or '').lower())


def _make_dedup_key(market_id, source, address):
    return f"{market_id}:{source}:{_normalize_address(address)}"


def _in_unit_range(units):
    """Records with no unit-count data pass through for manual review rather than being dropped."""
    if units in (None, ''):
        return True
    try:
        return UNIT_MIN <= float(units) <= UNIT_MAX
    except (TypeError, ValueError):
        return True


def _parse_date(value):
    if isinstance(value, datetime):
        return value
    if isinstance(value, (int, float)):
        # Esri ArcGIS date fields are commonly epoch milliseconds
        try:
            return datetime.utcfromtimestamp(value / 1000)
        except (ValueError, OSError, OverflowError):
            return None
    if isinstance(value, str) and value.strip():
        for fmt in ('%Y-%m-%d', '%m/%d/%Y', '%Y-%m-%dT%H:%M:%S', '%Y/%m/%d'):
            try:
                return datetime.strptime(value.strip()[:len(fmt)], fmt)
            except ValueError:
                continue
    return None


def _upsert_hit(market_id, source, record, is_lihtc=False):
    """
    No unit-range gate here on purpose (big-bucket ingestion pivot): this
    used to reject any record with a known unit_count outside 20-80,
    which — since every signal routes through this one function — was
    silently dropping out-of-range properties from every signal, not just
    the one it was originally written for. Capture everything; unit range
    (and every other criterion) is a UI filter now, not an ingestion gate.

    is_lihtc is computed by the caller (run_market_scan), not the connector
    record itself — it's a cross-reference against the market's LIHTC
    address set, checked once per scan and applied regardless of source.
    """
    address = (record.get('address') or '').strip()
    if not address:
        return False
    units = record.get('unit_count')
    year_built = record.get('year_built')

    dedup_key = _make_dedup_key(market_id, source, address)
    existing = SignalHitModel.query.filter_by(dedup_key=dedup_key).first()
    now = datetime.utcnow()
    raw_json = json.dumps(record.get('raw_data'), default=str) if record.get('raw_data') is not None else None

    if existing:
        existing.last_seen_at = now
        if record.get('owner_name'):
            existing.owner_name = record['owner_name']
        if record.get('owner_mailing_address'):
            existing.owner_mailing_address = record['owner_mailing_address']
        if units not in (None, ''):
            existing.unit_count = int(float(units))
        if year_built not in (None, ''):
            existing.year_built = int(float(year_built))
        if is_lihtc:
            existing.is_lihtc = True  # sticky — never un-flag once matched, matches are cheap false positives at worst
        if record.get('assessed_value') is not None:
            existing.assessed_value = record['assessed_value']
        if record.get('listing_price') is not None:
            existing.listing_price = record['listing_price']
        if record.get('listing_broker'):
            existing.listing_broker = record['listing_broker']
        if record.get('listing_url'):
            existing.listing_url = record['listing_url']
        if raw_json is not None:
            existing.raw_data = raw_json
        return False  # not newly created

    hit = SignalHitModel(
        id=uuid.uuid4().hex,
        market_id=market_id,
        source=source,
        address=address,
        owner_name=record.get('owner_name'),
        owner_mailing_address=record.get('owner_mailing_address'),
        unit_count=int(float(units)) if units not in (None, '') else None,
        year_built=int(float(year_built)) if year_built not in (None, '') else None,
        is_lihtc=bool(is_lihtc),
        assessed_value=record.get('assessed_value'),
        listing_price=record.get('listing_price'),
        listing_broker=record.get('listing_broker'),
        listing_url=record.get('listing_url'),
        raw_data=raw_json,
        dedup_key=dedup_key,
        first_seen_at=now,
        last_seen_at=now,
    )
    db.session.add(hit)
    return True


def _fetch_via_feed(feed_url, feed_type, field_mapping_json):
    """
    `_where` is a reserved key in the field_mapping JSON (not a data field —
    stripped before building the attribute mapping): an optional server-side
    filter clause. Some feeds are large enough that fetching the default
    page and filtering client-side would miss the records that actually
    matter (verified case: Sacramento's sales-history layer has 56,891 rows;
    the 20-80-unit multifamily ones aren't guaranteed to be in the first
    2000 returned) — pushing the filter server-side fixes that.
    """
    if not feed_url or not feed_type or not field_mapping_json:
        return []
    mapping = json.loads(field_mapping_json)
    where = mapping.pop('_where', None)
    if feed_type == 'arcgis':
        return signal_connectors.fetch_arcgis_feature_server(feed_url, mapping, where=where or '1=1')
    return signal_connectors.fetch_socrata_dataset(feed_url, mapping, where=where)


def run_market_scan(market):
    """Run every enabled, non-stubbed signal against a single market. Returns count of new hits."""
    signal_defs = {s.key: s for s in SignalDefinitionModel.query.filter_by(enabled=True, stubbed=False).all()}
    created = 0

    # Computed once per scan, applied to every hit below regardless of which
    # signal produced it — "not LIHTC" is a universal exclusion now, not
    # specific to the (disabled) hud_lihtc_year15 signal.
    lihtc_addresses = hud_datasets.get_lihtc_addresses_for_market(market)

    def _is_lihtc(address):
        return _normalize_address(address) in lihtc_addresses

    if 'absentee_owner' in signal_defs:
        try:
            records = _fetch_via_feed(market.assessor_feed_url, market.assessor_feed_type, market.assessor_field_mapping)
        except Exception as e:
            logger.warning(f"assessor feed fetch failed for market {market.id}: {e}")
            records = []

        # Some assessor feeds (e.g. Sacramento's) are sales HISTORY, not a
        # current-ownership roll — multiple rows per address across past
        # decades. Keep only the most recent sale per address before
        # checking long-hold age, otherwise an old historical sale row
        # would misflag an address that has since resold recently.
        latest_by_address = {}
        for rec in records:
            situs = _normalize_address(rec.get('situs_address') or rec.get('address'))
            if not situs:
                continue
            sale_dt = _parse_date(rec.get('sale_date'))
            prev = latest_by_address.get(situs)
            if prev is None or (sale_dt is not None and (prev[1] is None or sale_dt > prev[1])):
                latest_by_address[situs] = (rec, sale_dt)

        for rec, sale_dt in latest_by_address.values():
            mailing = _normalize_address(rec.get('mailing_address'))
            situs = _normalize_address(rec.get('situs_address') or rec.get('address'))
            long_hold = bool(sale_dt and (datetime.utcnow() - sale_dt).days > LONG_HOLD_DAYS)
            is_absentee = bool(mailing) and bool(situs) and mailing != situs
            if not (is_absentee or long_hold):
                continue
            # No property-type gate here on purpose: it used to require the
            # raw property_type string to literally contain "multi", which
            # only ever matched Sacramento's exact wording ("Multiple Family
            # Residence") and silently dropped every genuine multifamily
            # record elsewhere (e.g. LA County's "Five or More Units or
            # Apartments" never matches "multi"). property_type is still
            # captured in raw_data for manual inspection; filtering by it
            # is a UI/server-side-WHERE concern now, same as unit_count.
            hit_address = rec.get('situs_address') or rec.get('address')
            if _upsert_hit(market.id, 'absentee_owner', {
                'address': hit_address,
                'owner_name': rec.get('owner_name'),
                'owner_mailing_address': rec.get('mailing_address'),
                'unit_count': rec.get('units'),
                'year_built': rec.get('year_built'),
                'assessed_value': rec.get('assessed_value'),
                'raw_data': rec,
            }, is_lihtc=_is_lihtc(hit_address)):
                created += 1

    if 'code_violations' in signal_defs:
        try:
            records = _fetch_via_feed(
                market.code_violations_feed_url, market.code_violations_feed_type, market.code_violations_field_mapping
            )
        except Exception as e:
            logger.warning(f"code violations feed fetch failed for market {market.id}: {e}")
            records = []
        for rec in records:
            if not rec.get('address'):
                continue
            if _upsert_hit(market.id, 'code_violations', {
                'address': rec.get('address'),
                'owner_name': rec.get('owner_name'),
                'owner_mailing_address': rec.get('owner_mailing_address'),
                'unit_count': rec.get('units'),
                'raw_data': rec,
            }, is_lihtc=_is_lihtc(rec.get('address'))):
                created += 1

    if 'tax_delinquency' in signal_defs:
        try:
            records = _fetch_via_feed(
                market.tax_delinquent_feed_url, market.tax_delinquent_feed_type, market.tax_delinquent_field_mapping
            )
        except Exception as e:
            logger.warning(f"tax delinquent feed fetch failed for market {market.id}: {e}")
            records = []
        for rec in records:
            if not rec.get('address'):
                continue
            if _upsert_hit(market.id, 'tax_delinquency', {
                'address': rec.get('address'),
                'owner_name': rec.get('owner_name'),
                'owner_mailing_address': rec.get('owner_mailing_address'),
                'unit_count': rec.get('units'),
                'assessed_value': rec.get('assessed_value'),
                'raw_data': rec,
            }, is_lihtc=_is_lihtc(rec.get('address'))):
                created += 1

    if 'hud_fha_loan_maturity' in signal_defs or 'hud_section8_contract_expiration' in signal_defs:
        hud_datasets.refresh_hud_datasets()
        for rec in hud_datasets.scan_hud_signals_for_market(market):
            if rec['source'] not in signal_defs:
                continue
            if _upsert_hit(market.id, rec['source'], rec, is_lihtc=_is_lihtc(rec.get('address'))):
                created += 1

    # Cut for now (out of buy box — LIHTC/affordable properties don't match
    # this fund's conventional Class B/C target). Called separately, and only
    # when enabled, rather than unconditionally like the other HUD signals
    # above, so a disabled signal costs nothing per scan. Real, verified,
    # working data if this is ever turned back on — see hud_datasets.py.
    if 'hud_lihtc_year15' in signal_defs:
        for rec in hud_datasets.scan_lihtc_for_market(market):
            if _upsert_hit(market.id, rec['source'], rec):
                created += 1

    db.session.commit()

    # One row per market per scan — powers the insights "what's new" /
    # trend view. Logged after the commit above so hits_total_after reflects
    # what actually landed.
    total_after = SignalHitModel.query.filter_by(market_id=market.id).count()
    db.session.add(SignalScanRunModel(
        id=uuid.uuid4().hex, market_id=market.id,
        hits_created=created, hits_total_after=total_after,
    ))
    db.session.commit()

    return created


def run_all_market_scans():
    total = 0
    for market in SignalMarketModel.query.all():
        total += run_market_scan(market)
    return total


def import_tax_delinquent_hits(market_id, file_storage):
    """Parse an uploaded tax-delinquent export and upsert hits tagged tax_delinquency."""
    mapped_rows = signal_connectors.import_tax_delinquent_csv(file_storage)
    created = 0
    for row in mapped_rows:
        if _upsert_hit(market_id, 'tax_delinquency', {
            'address': row.get('address'),
            'owner_name': row.get('owner_name'),
            'owner_mailing_address': row.get('owner_mailing_address'),
            'unit_count': row.get('unit_count'),
            'assessed_value': row.get('assessed_value'),
            'raw_data': row,
        }):
            created += 1
    db.session.commit()
    return created
