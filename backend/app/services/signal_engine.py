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

from app.database import db, SignalMarketModel, SignalDefinitionModel, SignalHitModel
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


def _upsert_hit(market_id, source, record):
    address = (record.get('address') or '').strip()
    if not address:
        return False
    units = record.get('unit_count')
    if not _in_unit_range(units):
        return False

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
    if not feed_url or not feed_type or not field_mapping_json:
        return []
    mapping = json.loads(field_mapping_json)
    fetcher = (
        signal_connectors.fetch_arcgis_feature_server if feed_type == 'arcgis'
        else signal_connectors.fetch_socrata_dataset
    )
    return fetcher(feed_url, mapping)


def run_market_scan(market):
    """Run every enabled, non-stubbed signal against a single market. Returns count of new hits."""
    signal_defs = {s.key: s for s in SignalDefinitionModel.query.filter_by(enabled=True, stubbed=False).all()}
    created = 0

    if 'absentee_owner' in signal_defs:
        try:
            records = _fetch_via_feed(market.assessor_feed_url, market.assessor_feed_type, market.assessor_field_mapping)
        except Exception as e:
            logger.warning(f"assessor feed fetch failed for market {market.id}: {e}")
            records = []
        for rec in records:
            mailing = _normalize_address(rec.get('mailing_address'))
            situs = _normalize_address(rec.get('situs_address') or rec.get('address'))
            sale_dt = _parse_date(rec.get('sale_date'))
            long_hold = bool(sale_dt and (datetime.utcnow() - sale_dt).days > LONG_HOLD_DAYS)
            is_absentee = bool(mailing) and bool(situs) and mailing != situs
            if is_absentee or long_hold:
                if _upsert_hit(market.id, 'absentee_owner', {
                    'address': rec.get('situs_address') or rec.get('address'),
                    'owner_name': rec.get('owner_name'),
                    'owner_mailing_address': rec.get('mailing_address'),
                    'unit_count': rec.get('units'),
                    'assessed_value': rec.get('assessed_value'),
                    'raw_data': rec,
                }):
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
            }):
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
            }):
                created += 1

    if 'hud_fha_loan_maturity' in signal_defs or 'hud_section8_contract_expiration' in signal_defs:
        hud_datasets.refresh_hud_datasets()
        for rec in hud_datasets.scan_hud_signals_for_market(market):
            if rec['source'] not in signal_defs:
                continue
            if _upsert_hit(market.id, rec['source'], rec):
                created += 1

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
