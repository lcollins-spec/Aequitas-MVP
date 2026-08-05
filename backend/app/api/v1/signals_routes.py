"""
Sourcing signals engine API routes.

Public-records + HUD signal library run on-demand against an editable market
list. See backend/app/services/signal_engine.py for the actual scan logic —
this module is just the CRUD/trigger surface over it.
"""
import json
import logging
import time
from collections import defaultdict
from datetime import datetime, timedelta

from flask import Blueprint, request, jsonify

from app.database import db, SignalMarketModel, SignalDefinitionModel, SignalHitModel
from app.services import signal_engine

logger = logging.getLogger(__name__)

signals_bp = Blueprint('signals', __name__)

# Manual pipeline-conversion tracking — fixed set, no automation.
HIT_STATUSES = ['New', 'Enriched', 'Contacted', 'Responding', 'Dead', 'Under LOI']


# ── Markets ───────────────────────────────────────────────────────────────────

@signals_bp.route('/signals/markets', methods=['GET'])
def list_markets():
    markets = SignalMarketModel.query.order_by(SignalMarketModel.created_at).all()
    return jsonify({'markets': [m.to_dict() for m in markets]}), 200


@signals_bp.route('/signals/markets', methods=['POST'])
def create_market():
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    city = (data.get('city') or '').strip()
    state = (data.get('state') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400
    market = SignalMarketModel(
        id=str(int(time.time() * 1000)),
        name=name, city=city, state=state,
        assessor_feed_url=data.get('assessor_feed_url'),
        assessor_feed_type=data.get('assessor_feed_type'),
        assessor_field_mapping=json.dumps(data['assessor_field_mapping']) if data.get('assessor_field_mapping') else None,
        code_violations_feed_url=data.get('code_violations_feed_url'),
        code_violations_feed_type=data.get('code_violations_feed_type'),
        code_violations_field_mapping=json.dumps(data['code_violations_field_mapping']) if data.get('code_violations_field_mapping') else None,
        tax_delinquent_feed_url=data.get('tax_delinquent_feed_url'),
        tax_delinquent_feed_type=data.get('tax_delinquent_feed_type'),
        tax_delinquent_field_mapping=json.dumps(data['tax_delinquent_field_mapping']) if data.get('tax_delinquent_field_mapping') else None,
    )
    db.session.add(market)
    db.session.commit()
    return jsonify({'market': market.to_dict()}), 201


@signals_bp.route('/signals/markets/<market_id>', methods=['PATCH'])
def update_market(market_id):
    market = SignalMarketModel.query.get(market_id)
    if not market:
        return jsonify({'error': 'Not found'}), 404
    data = request.get_json() or {}
    for field in ['name', 'city', 'state', 'assessor_feed_url', 'assessor_feed_type',
                  'code_violations_feed_url', 'code_violations_feed_type',
                  'tax_delinquent_feed_url', 'tax_delinquent_feed_type']:
        if field in data:
            setattr(market, field, data[field])
    if 'assessor_field_mapping' in data:
        market.assessor_field_mapping = json.dumps(data['assessor_field_mapping']) if data['assessor_field_mapping'] else None
    if 'code_violations_field_mapping' in data:
        market.code_violations_field_mapping = json.dumps(data['code_violations_field_mapping']) if data['code_violations_field_mapping'] else None
    if 'tax_delinquent_field_mapping' in data:
        market.tax_delinquent_field_mapping = json.dumps(data['tax_delinquent_field_mapping']) if data['tax_delinquent_field_mapping'] else None
    db.session.commit()
    return jsonify({'market': market.to_dict()}), 200


@signals_bp.route('/signals/markets/<market_id>', methods=['DELETE'])
def delete_market(market_id):
    market = SignalMarketModel.query.get(market_id)
    if not market:
        return jsonify({'error': 'Not found'}), 404
    SignalHitModel.query.filter_by(market_id=market_id).delete()
    db.session.delete(market)
    db.session.commit()
    return jsonify({'success': True}), 200


# ── Signal definitions (toggles) ──────────────────────────────────────────────

@signals_bp.route('/signals/definitions', methods=['GET'])
def list_definitions():
    defs = SignalDefinitionModel.query.order_by(SignalDefinitionModel.category, SignalDefinitionModel.label).all()
    return jsonify({'definitions': [d.to_dict() for d in defs]}), 200


@signals_bp.route('/signals/definitions/<def_id>', methods=['PATCH'])
def update_definition(def_id):
    definition = SignalDefinitionModel.query.get(def_id)
    if not definition:
        return jsonify({'error': 'Not found'}), 404
    data = request.get_json() or {}
    if 'enabled' in data:
        if definition.stubbed and data['enabled']:
            return jsonify({'error': f'This signal is not yet available: {definition.disabled_reason}'}), 400
        definition.enabled = bool(data['enabled'])
    db.session.commit()
    return jsonify({'definition': definition.to_dict()}), 200


# ── Hits ──────────────────────────────────────────────────────────────────────

def _normalized_address_of(hit):
    parts = hit.dedup_key.split(':', 2)
    return parts[2] if len(parts) == 3 else hit.dedup_key


@signals_bp.route('/signals/hits', methods=['GET'])
def list_hits():
    market_id = request.args.get('market_id')
    source = request.args.get('source')
    pinned_param = request.args.get('pinned')
    min_stacked = request.args.get('min_stacked', type=int)

    base_query = SignalHitModel.query
    if market_id:
        base_query = base_query.filter_by(market_id=market_id)
    in_scope = base_query.all()

    group_sources = defaultdict(set)
    for h in in_scope:
        group_sources[(h.market_id, _normalized_address_of(h))].add(h.source)

    filtered = in_scope
    if source:
        filtered = [h for h in filtered if h.source == source]
    if pinned_param is not None:
        want_pinned = pinned_param.lower() == 'true'
        filtered = [h for h in filtered if h.pinned == want_pinned]

    results = []
    for h in sorted(filtered, key=lambda x: x.first_seen_at, reverse=True):
        stacked = len(group_sources[(h.market_id, _normalized_address_of(h))])
        if min_stacked and stacked < min_stacked:
            continue
        results.append(h.to_dict(stacked_count=stacked))

    return jsonify({'hits': results}), 200


@signals_bp.route('/signals/hits/<hit_id>', methods=['PATCH'])
def update_hit(hit_id):
    hit = SignalHitModel.query.get(hit_id)
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


@signals_bp.route('/signals/hits/tax-delinquent-import', methods=['POST'])
def import_tax_delinquent():
    market_id = request.form.get('market_id')
    if not market_id:
        return jsonify({'error': 'market_id is required'}), 400
    if not SignalMarketModel.query.get(market_id):
        return jsonify({'error': 'Market not found'}), 404
    if 'file' not in request.files:
        return jsonify({'error': 'No file provided'}), 400

    try:
        created = signal_engine.import_tax_delinquent_hits(market_id, request.files['file'])
        return jsonify({'success': True, 'created': created}), 200
    except Exception as e:
        logger.warning(f"tax-delinquent import failed: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Scan trigger ──────────────────────────────────────────────────────────────

@signals_bp.route('/signals/scan', methods=['POST'])
def trigger_scan():
    data = request.get_json(silent=True) or {}
    market_id = data.get('market_id')
    try:
        if market_id:
            market = SignalMarketModel.query.get(market_id)
            if not market:
                return jsonify({'error': 'Market not found'}), 404
            created = signal_engine.run_market_scan(market)
        else:
            created = signal_engine.run_all_market_scans()
        return jsonify({'success': True, 'created': created}), 200
    except Exception as e:
        logger.warning(f"signal scan failed: {e}")
        return jsonify({'success': False, 'error': str(e)}), 500


# ── Digest ────────────────────────────────────────────────────────────────────

@signals_bp.route('/signals/digest', methods=['GET'])
def digest():
    since = datetime.utcnow() - timedelta(days=7)
    recent = (
        SignalHitModel.query
        .filter(SignalHitModel.first_seen_at >= since)
        .order_by(SignalHitModel.first_seen_at.desc())
        .all()
    )
    return jsonify({'count': len(recent), 'hits': [h.to_dict() for h in recent]}), 200
