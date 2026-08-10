"""
Funder engine — runs the two automated capital-source connectors and
upserts FunderHitModel rows. Unlike signal_engine.py there is no per-market
loop: family offices and banks are national datasets, so this is a single
global pass over the enabled, non-stubbed FunderDefinitionModel rows.
"""
import json
import logging
import uuid
from datetime import datetime

from app.database import db, FunderDefinitionModel, FunderHitModel
from app.services import funder_connectors

logger = logging.getLogger(__name__)

CONNECTORS = {
    'family_office_adv': funder_connectors.fetch_family_offices,
    'bank_cre_growth': funder_connectors.fetch_bank_cre_growth,
}


def _upsert_funder_hit(source, record):
    """Same dedup-lookup-then-insert-or-refresh shape as signal_engine._upsert_hit,
    keyed on source+external_id instead of a normalized address."""
    external_id = record.get('external_id')
    if not external_id or not record.get('name'):
        return False

    dedup_key = f"{source}:{external_id}"
    existing = FunderHitModel.query.filter_by(dedup_key=dedup_key).first()
    now = datetime.utcnow()
    raw_json = json.dumps(record.get('raw_data'), default=str) if record.get('raw_data') is not None else None

    if existing:
        existing.last_seen_at = now
        if record.get('city'):
            existing.city = record['city']
        if record.get('state'):
            existing.state = record['state']
        if record.get('aum') is not None:
            existing.aum = record['aum']
        if record.get('cre_loan_total') is not None:
            existing.cre_loan_total = record['cre_loan_total']
        if record.get('cre_growth_pct') is not None:
            existing.cre_growth_pct = record['cre_growth_pct']
        if record.get('contact_address'):
            existing.contact_address = record['contact_address']
        if raw_json is not None:
            existing.raw_data = raw_json
        return False  # not newly created

    hit = FunderHitModel(
        id=uuid.uuid4().hex,
        source=source,
        name=record['name'],
        entity_type=record.get('entity_type'),
        city=record.get('city'),
        state=record.get('state'),
        aum=record.get('aum'),
        cre_loan_total=record.get('cre_loan_total'),
        cre_growth_pct=record.get('cre_growth_pct'),
        contact_address=record.get('contact_address'),
        external_id=external_id,
        raw_data=raw_json,
        dedup_key=dedup_key,
        first_seen_at=now,
        last_seen_at=now,
    )
    db.session.add(hit)
    return True


def run_funder_scan():
    """Run every enabled, non-stubbed funder definition. Returns count of new hits."""
    defs = FunderDefinitionModel.query.filter_by(enabled=True, stubbed=False).all()
    created = 0

    for definition in defs:
        connector = CONNECTORS.get(definition.key)
        if not connector:
            continue
        try:
            records = connector()
        except Exception as e:
            logger.warning(f"funder connector '{definition.key}' failed: {e}")
            continue

        for record in records:
            if _upsert_funder_hit(definition.key, record):
                created += 1

    db.session.commit()
    logger.info(f"run_funder_scan: {created} new hits created")
    return created
