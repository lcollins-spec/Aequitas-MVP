"""
Funders (capital-source sourcing) API routes.

Family offices + banks run on-demand via the two automated connectors; see
backend/app/services/funder_engine.py for the scan logic. Curated
emerging-manager/program entries have no connector — they're seeded once
(backend/scripts/seed_curated_funders.py) and stay editable via POST/PATCH
below. This module is the CRUD/trigger surface over both.
"""
import csv
import io
import json
import logging
import uuid
from datetime import datetime

from flask import Blueprint, request, jsonify

from app.database import db, FunderDefinitionModel, FunderHitModel
from app.services import funder_engine
from app.utils import google_drive

logger = logging.getLogger(__name__)

funders_bp = Blueprint('funders', __name__)

HIT_STATUSES = ['New', 'Researching', 'Contacted', 'Meeting Scheduled', 'Committed', 'Passed']
DEFAULT_MANUAL_SOURCE = 'curated_emerging_manager'


# ── Definitions (toggles) ───────────────────────────────────────────────────

@funders_bp.route('/funders/definitions', methods=['GET'])
def list_definitions():
    defs = FunderDefinitionModel.query.order_by(FunderDefinitionModel.label).all()
    return jsonify({'definitions': [d.to_dict() for d in defs]}), 200


@funders_bp.route('/funders/definitions/<def_id>', methods=['PATCH'])
def update_definition(def_id):
    definition = FunderDefinitionModel.query.get(def_id)
    if not definition:
        return jsonify({'error': 'Not found'}), 404
    data = request.get_json() or {}
    if 'enabled' in data:
        if definition.stubbed and data['enabled']:
            return jsonify({'error': f'This source is not yet available: {definition.disabled_reason}'}), 400
        definition.enabled = bool(data['enabled'])
    db.session.commit()
    return jsonify({'definition': definition.to_dict()}), 200


# ── Hits ─────────────────────────────────────────────────────────────────────

@funders_bp.route('/funders/hits', methods=['GET'])
def list_hits():
    source = request.args.get('source')
    entity_type = request.args.get('entity_type')
    min_aum = request.args.get('min_aum', type=float)
    pinned_param = request.args.get('pinned')
    status = request.args.get('status')
    name_search = (request.args.get('name_search') or '').strip().lower()

    filtered = FunderHitModel.query.all()
    if source:
        filtered = [h for h in filtered if h.source == source]
    if entity_type:
        filtered = [h for h in filtered if h.entity_type == entity_type]
    if min_aum is not None:
        filtered = [h for h in filtered if h.aum is not None and h.aum >= min_aum]
    if pinned_param is not None:
        want_pinned = pinned_param.lower() == 'true'
        filtered = [h for h in filtered if h.pinned == want_pinned]
    if status:
        filtered = [h for h in filtered if h.status == status]
    if name_search:
        filtered = [h for h in filtered if name_search in (h.name or '').lower()]

    results = [h.to_dict() for h in sorted(filtered, key=lambda x: x.first_seen_at, reverse=True)]
    return jsonify({'hits': results}), 200


@funders_bp.route('/funders/hits', methods=['POST'])
def create_hit():
    """Manual create — the curated category has no connector, so this is how
    it stays editable/growable over time, not a mirror of any existing
    signal-engine endpoint (there is no equivalent there)."""
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400

    source = data.get('source') or DEFAULT_MANUAL_SOURCE
    external_id = data.get('external_id') or f"manual-{uuid.uuid4().hex[:12]}"
    dedup_key = f"{source}:{external_id}"
    if FunderHitModel.query.filter_by(dedup_key=dedup_key).first():
        return jsonify({'error': 'A funder with this source/external_id already exists'}), 409

    now = datetime.utcnow()
    hit = FunderHitModel(
        id=uuid.uuid4().hex,
        source=source,
        name=name,
        entity_type=data.get('entity_type'),
        city=data.get('city'),
        state=data.get('state'),
        aum=data.get('aum'),
        cre_loan_total=data.get('cre_loan_total'),
        cre_growth_pct=data.get('cre_growth_pct'),
        contact_address=data.get('contact_address'),
        external_id=external_id,
        raw_data=json.dumps(data['raw_data'], default=str) if data.get('raw_data') is not None else None,
        dedup_key=dedup_key,
        first_seen_at=now,
        last_seen_at=now,
    )
    db.session.add(hit)
    db.session.commit()
    return jsonify({'hit': hit.to_dict()}), 201


@funders_bp.route('/funders/hits/<hit_id>', methods=['PATCH'])
def update_hit(hit_id):
    hit = FunderHitModel.query.get(hit_id)
    if not hit:
        return jsonify({'error': 'Not found'}), 404
    data = request.get_json() or {}
    if 'pinned' in data:
        hit.pinned = bool(data['pinned'])
    if 'note' in data:
        hit.note = data['note'] or ''
    if 'status' in data:
        if data['status'] not in HIT_STATUSES:
            return jsonify({'error': f"status must be one of {HIT_STATUSES}"}), 400
        hit.status = data['status']
    db.session.commit()
    return jsonify({'hit': hit.to_dict()}), 200


FUNDER_EXPORT_COLUMNS = [
    'name', 'source', 'entity_type', 'city', 'state', 'aum', 'cre_loan_total',
    'cre_growth_pct', 'contact_address', 'status', 'note', 'first_seen_at', 'last_seen_at',
]


@funders_bp.route('/funders/hits/export', methods=['POST'])
def export_hits():
    data = request.get_json() or {}
    hit_ids = data.get('hit_ids') or []
    if not hit_ids:
        return jsonify({'error': 'hit_ids is required'}), 400

    hits = FunderHitModel.query.filter(FunderHitModel.id.in_(hit_ids)).all()
    if not hits:
        return jsonify({'error': 'No matching hits found'}), 404

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=FUNDER_EXPORT_COLUMNS)
    writer.writeheader()
    for h in hits:
        row = h.to_dict()
        writer.writerow({col: row.get(col) for col in FUNDER_EXPORT_COLUMNS})

    filename = f"Aequitas Funders Export {datetime.utcnow().strftime('%Y-%m-%d %H%M')}"
    try:
        result = google_drive.upload_csv_as_sheet(buf.getvalue().encode('utf-8'), filename)
    except Exception as e:
        logger.warning(f"funders export failed: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500

    return jsonify({'success': True, 'sheet_url': result['web_view_link']}), 200


# ── Scan trigger ─────────────────────────────────────────────────────────────

@funders_bp.route('/funders/scan', methods=['POST'])
def trigger_scan():
    try:
        created = funder_engine.run_funder_scan()
        return jsonify({'success': True, 'created': created}), 200
    except Exception as e:
        logger.warning(f"funder scan failed: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500
