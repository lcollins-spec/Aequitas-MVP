"""
Sourcing API routes

Handles:
  1. Excel/CSV import parsing (existing)
  2. Full CRUD for sourcing markets, properties, brokers, operators
"""
import json
import os
import io
import csv
import re
from flask import Blueprint, request, jsonify
from app.database import (
    db,
    SourcingMarketModel,
    SourcingPropertyModel,
    SourcingBrokerModel,
    SourcingOperatorModel,
)

sourcing_bp = Blueprint('sourcing', __name__)


# ── Import parsing (unchanged) ────────────────────────────────────────────────

@sourcing_bp.route('/sourcing/parse-import', methods=['POST'])
def parse_import():
    """
    Parse an uploaded Excel or CSV file and map columns to the sourcing data model.

    Form data:
        - file: the Excel/CSV file
        - type: 'properties' | 'brokers' | 'operators'

    Returns:
        { success: true, data: [...mapped rows...], total: N, columns: [...] }
    """
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file uploaded'}), 400

        file = request.files['file']
        import_type = request.form.get('type', 'properties')

        if not file.filename:
            return jsonify({'success': False, 'error': 'No file selected'}), 400

        filename = file.filename.lower()
        rows = []
        headers = []

        if filename.endswith('.csv'):
            content = file.read().decode('utf-8-sig', errors='replace')
            reader = csv.DictReader(io.StringIO(content))
            headers = list(reader.fieldnames or [])
            for i, row in enumerate(reader):
                if i >= 200:
                    break
                rows.append(dict(row))

        elif filename.endswith('.xlsx') or filename.endswith('.xls'):
            try:
                import openpyxl
                wb = openpyxl.load_workbook(io.BytesIO(file.read()), data_only=True)
                ws = wb.active
                all_rows = list(ws.iter_rows(values_only=True))
                if not all_rows:
                    return jsonify({'success': False, 'error': 'File is empty'}), 400
                headers = [str(h).strip() if h is not None else f'Col{i}' for i, h in enumerate(all_rows[0])]
                for row in all_rows[1:201]:
                    rows.append(dict(zip(headers, [str(v).strip() if v is not None else '' for v in row])))
            except ImportError:
                return jsonify({'success': False, 'error': 'openpyxl not available'}), 503
        else:
            return jsonify({'success': False, 'error': 'Only .xlsx, .xls, and .csv files are supported'}), 400

        if not rows:
            return jsonify({'success': False, 'error': 'No data rows found in file'}), 400

        schemas = {
            'properties': {
                'fields': ['address', 'units', 'owner_name', 'status', 'last_contact_date', 'notes'],
                'status_values': 'not_contacted | outreach_sent | in_conversation | passed | active_deal',
                'notes': 'units should be a number; status must exactly match one of the allowed values',
            },
            'brokers': {
                'fields': ['name', 'firm', 'status', 'last_contact_date', 'last_deal_sent', 'notes'],
                'status_values': 'cold | introduced | active | strong',
                'notes': '',
            },
            'operators': {
                'fields': ['name', 'firm', 'status', 'properties_managed', 'last_contact_date', 'notes'],
                'status_values': 'prospecting | intro_made | meeting_held | partnership_discussion | active_partner',
                'notes': '',
            },
        }

        schema = schemas.get(import_type, schemas['properties'])
        fields_str = ', '.join(schema['fields'])

        api_key = os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            return jsonify({'success': False, 'error': 'ANTHROPIC_API_KEY not configured'}), 503

        try:
            from anthropic import Anthropic
        except ImportError:
            return jsonify({'success': False, 'error': 'Anthropic SDK not available'}), 503

        client = Anthropic(api_key=api_key)

        sample = rows[:10]
        prompt = (
            f'You are a data mapping assistant for a real estate sourcing tool.\n\n'
            f'Spreadsheet columns: {headers}\n\n'
            f'Sample data (first {len(sample)} rows):\n{json.dumps(sample, indent=2)}\n\n'
            f'Target schema fields for "{import_type}": {fields_str}\n'
            f'Status must be exactly one of: {schema["status_values"]}\n'
            f'{("Extra notes: " + schema["notes"]) if schema["notes"] else ""}\n\n'
            f'Map ALL {len(rows)} rows to the target schema. Use your best judgement for column name '
            f'variations. For status, map to the closest matching allowed value. Leave unknown fields '
            f'as empty string "". Return ONLY a raw JSON array (no markdown fences, no explanation) '
            f'starting with [ and ending with ].\n\n'
            f'All {len(rows)} rows:\n{json.dumps(rows, indent=2)}'
        )

        message = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=8192,
            messages=[{'role': 'user', 'content': prompt}]
        )

        response_text = message.content[0].text.strip()

        if '```' in response_text:
            response_text = re.sub(r'```json\s*', '', response_text)
            response_text = re.sub(r'```', '', response_text)
            response_text = response_text.strip()

        json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
        if not json_match:
            print(f'[sourcing/parse-import] No JSON array in response: {repr(response_text[:300])}', flush=True)
            return jsonify({'success': False, 'error': 'Failed to parse Claude response as JSON array'}), 500

        mapped_rows = json.loads(json_match.group(0))

        return jsonify({
            'success': True,
            'data': mapped_rows,
            'total': len(mapped_rows),
            'columns': headers,
        }), 200

    except json.JSONDecodeError as e:
        print(f'[sourcing/parse-import] JSON error: {e}', flush=True)
        return jsonify({'success': False, 'error': f'Failed to parse response: {str(e)}'}), 500
    except Exception as e:
        error_msg = str(e)
        print(f'[sourcing/parse-import] Error: {error_msg}', flush=True)
        if 'credit balance' in error_msg or 'billing' in error_msg.lower():
            return jsonify({'success': False, 'error': 'Anthropic API credits exhausted.'}), 503
        if 'rate_limit' in error_msg.lower():
            return jsonify({'success': False, 'error': 'Rate limit reached. Please try again.'}), 429
        return jsonify({'success': False, 'error': error_msg}), 500


# ── Markets ───────────────────────────────────────────────────────────────────

@sourcing_bp.route('/sourcing/markets', methods=['GET'])
def list_markets():
    markets = SourcingMarketModel.query.order_by(SourcingMarketModel.created_at).all()
    return jsonify({'markets': [{'id': m.id, 'name': m.name} for m in markets]}), 200


@sourcing_bp.route('/sourcing/markets', methods=['POST'])
def create_market():
    data = request.get_json() or {}
    m_id = data.get('id') or str(int(__import__('time').time() * 1000))
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'name is required'}), 400
    existing = SourcingMarketModel.query.get(m_id)
    if existing:
        return jsonify({'market': {'id': existing.id, 'name': existing.name}}), 200
    market = SourcingMarketModel(id=m_id, name=name)
    db.session.add(market)
    db.session.commit()
    return jsonify({'market': {'id': market.id, 'name': market.name}}), 201


@sourcing_bp.route('/sourcing/markets/<market_id>', methods=['DELETE'])
def delete_market(market_id):
    market = SourcingMarketModel.query.get(market_id)
    if not market:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(market)
    db.session.commit()
    return jsonify({'success': True}), 200


# ── Properties ────────────────────────────────────────────────────────────────

@sourcing_bp.route('/sourcing/properties', methods=['GET'])
def list_properties():
    market = request.args.get('market')
    q = SourcingPropertyModel.query
    if market:
        q = q.filter_by(market=market)
    props = q.all()
    return jsonify({'properties': [p.to_dict() for p in props]}), 200


@sourcing_bp.route('/sourcing/properties', methods=['POST'])
def create_property():
    data = request.get_json() or {}
    p_id = data.get('id') or str(int(__import__('time').time() * 1000))
    prop = SourcingPropertyModel(
        id=p_id,
        market=data.get('market', ''),
        address=data.get('address', ''),
        units=int(data.get('units') or 0),
        owner_name=data.get('owner_name', ''),
        status=data.get('status', 'not_contacted'),
        priority=data.get('priority', 'medium'),
        last_contact_date=data.get('last_contact_date', ''),
        notes=data.get('notes', ''),
        deal_id=data.get('deal_id'),
        lat=data.get('lat'),
        lng=data.get('lng'),
    )
    db.session.add(prop)
    db.session.commit()
    return jsonify({'property': prop.to_dict()}), 201


@sourcing_bp.route('/sourcing/properties/bulk', methods=['POST'])
def bulk_create_properties():
    items = request.get_json() or []
    created = []
    for data in items:
        p_id = data.get('id') or str(int(__import__('time').time() * 1000))
        if SourcingPropertyModel.query.get(p_id):
            continue
        prop = SourcingPropertyModel(
            id=p_id,
            market=data.get('market', ''),
            address=data.get('address', ''),
            units=int(data.get('units') or 0),
            owner_name=data.get('owner_name', ''),
            status=data.get('status', 'not_contacted'),
            priority=data.get('priority', 'medium'),
            last_contact_date=data.get('last_contact_date', ''),
            notes=data.get('notes', ''),
            deal_id=data.get('deal_id'),
            lat=data.get('lat'),
            lng=data.get('lng'),
        )
        db.session.add(prop)
        created.append(prop)
    db.session.commit()
    return jsonify({'created': len(created)}), 201


@sourcing_bp.route('/sourcing/properties/<prop_id>', methods=['PATCH'])
def update_property(prop_id):
    prop = SourcingPropertyModel.query.get(prop_id)
    if not prop:
        return jsonify({'error': 'Not found'}), 404
    data = request.get_json() or {}
    for field in ['market', 'address', 'owner_name', 'status', 'priority', 'last_contact_date', 'notes']:
        if field in data:
            setattr(prop, field, data[field])
    if 'units' in data:
        prop.units = int(data['units'] or 0)
    if 'deal_id' in data:
        prop.deal_id = data['deal_id']
    if 'lat' in data:
        prop.lat = data['lat']
    if 'lng' in data:
        prop.lng = data['lng']
    if 'property_legislation' in data:
        prop.property_legislation = data['property_legislation']
    db.session.commit()
    return jsonify({'property': prop.to_dict()}), 200


@sourcing_bp.route('/sourcing/properties/<prop_id>', methods=['DELETE'])
def delete_property(prop_id):
    prop = SourcingPropertyModel.query.get(prop_id)
    if not prop:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(prop)
    db.session.commit()
    return jsonify({'success': True}), 200


# ── Brokers ───────────────────────────────────────────────────────────────────

@sourcing_bp.route('/sourcing/brokers', methods=['GET'])
def list_brokers():
    market = request.args.get('market')
    q = SourcingBrokerModel.query
    if market:
        q = q.filter_by(market=market)
    return jsonify({'brokers': [b.to_dict() for b in q.all()]}), 200


@sourcing_bp.route('/sourcing/brokers', methods=['POST'])
def create_broker():
    data = request.get_json() or {}
    b_id = data.get('id') or str(int(__import__('time').time() * 1000))
    broker = SourcingBrokerModel(
        id=b_id,
        market=data.get('market', ''),
        name=data.get('name', ''),
        firm=data.get('firm', ''),
        status=data.get('status', 'cold'),
        last_contact_date=data.get('last_contact_date', ''),
        last_deal_sent=data.get('last_deal_sent', ''),
        notes=data.get('notes', ''),
    )
    db.session.add(broker)
    db.session.commit()
    return jsonify({'broker': broker.to_dict()}), 201


@sourcing_bp.route('/sourcing/brokers/bulk', methods=['POST'])
def bulk_create_brokers():
    items = request.get_json() or []
    created = []
    for data in items:
        b_id = data.get('id') or str(int(__import__('time').time() * 1000))
        if SourcingBrokerModel.query.get(b_id):
            continue
        broker = SourcingBrokerModel(
            id=b_id,
            market=data.get('market', ''),
            name=data.get('name', ''),
            firm=data.get('firm', ''),
            status=data.get('status', 'cold'),
            last_contact_date=data.get('last_contact_date', ''),
            last_deal_sent=data.get('last_deal_sent', ''),
            notes=data.get('notes', ''),
        )
        db.session.add(broker)
        created.append(broker)
    db.session.commit()
    return jsonify({'created': len(created)}), 201


@sourcing_bp.route('/sourcing/brokers/<broker_id>', methods=['PATCH'])
def update_broker(broker_id):
    broker = SourcingBrokerModel.query.get(broker_id)
    if not broker:
        return jsonify({'error': 'Not found'}), 404
    data = request.get_json() or {}
    for field in ['market', 'name', 'firm', 'status', 'last_contact_date', 'last_deal_sent', 'notes']:
        if field in data:
            setattr(broker, field, data[field])
    db.session.commit()
    return jsonify({'broker': broker.to_dict()}), 200


@sourcing_bp.route('/sourcing/brokers/<broker_id>', methods=['DELETE'])
def delete_broker(broker_id):
    broker = SourcingBrokerModel.query.get(broker_id)
    if not broker:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(broker)
    db.session.commit()
    return jsonify({'success': True}), 200


# ── Operators ─────────────────────────────────────────────────────────────────

@sourcing_bp.route('/sourcing/operators', methods=['GET'])
def list_operators():
    market = request.args.get('market')
    q = SourcingOperatorModel.query
    if market:
        q = q.filter_by(market=market)
    return jsonify({'operators': [o.to_dict() for o in q.all()]}), 200


@sourcing_bp.route('/sourcing/operators', methods=['POST'])
def create_operator():
    data = request.get_json() or {}
    o_id = data.get('id') or str(int(__import__('time').time() * 1000))
    op = SourcingOperatorModel(
        id=o_id,
        market=data.get('market', ''),
        name=data.get('name', ''),
        firm=data.get('firm', ''),
        status=data.get('status', 'prospecting'),
        properties_managed=data.get('properties_managed', ''),
        last_contact_date=data.get('last_contact_date', ''),
        notes=data.get('notes', ''),
    )
    db.session.add(op)
    db.session.commit()
    return jsonify({'operator': op.to_dict()}), 201


@sourcing_bp.route('/sourcing/operators/bulk', methods=['POST'])
def bulk_create_operators():
    items = request.get_json() or []
    created = []
    for data in items:
        o_id = data.get('id') or str(int(__import__('time').time() * 1000))
        if SourcingOperatorModel.query.get(o_id):
            continue
        op = SourcingOperatorModel(
            id=o_id,
            market=data.get('market', ''),
            name=data.get('name', ''),
            firm=data.get('firm', ''),
            status=data.get('status', 'prospecting'),
            properties_managed=data.get('properties_managed', ''),
            last_contact_date=data.get('last_contact_date', ''),
            notes=data.get('notes', ''),
        )
        db.session.add(op)
        created.append(op)
    db.session.commit()
    return jsonify({'created': len(created)}), 201


@sourcing_bp.route('/sourcing/operators/<operator_id>', methods=['PATCH'])
def update_operator(operator_id):
    op = SourcingOperatorModel.query.get(operator_id)
    if not op:
        return jsonify({'error': 'Not found'}), 404
    data = request.get_json() or {}
    for field in ['market', 'name', 'firm', 'status', 'properties_managed', 'last_contact_date', 'notes']:
        if field in data:
            setattr(op, field, data[field])
    db.session.commit()
    return jsonify({'operator': op.to_dict()}), 200


@sourcing_bp.route('/sourcing/operators/<operator_id>', methods=['DELETE'])
def delete_operator(operator_id):
    op = SourcingOperatorModel.query.get(operator_id)
    if not op:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(op)
    db.session.commit()
    return jsonify({'success': True}), 200


# ── Deal import parsing ────────────────────────────────────────────────────────

@sourcing_bp.route('/sourcing/parse-deal', methods=['POST'])
def parse_deal():
    """
    Parse pasted email/text or a PDF to extract deal fields using Claude.

    Form data:
        - text: pasted email or deal material (optional)
        - file: PDF file (optional)

    Returns:
        { success: true, fields: { property_address, unit_count, asking_price,
                                   seller_broker_name, market_city } }
    """
    try:
        content_parts = []

        # Collect pasted text
        pasted_text = (request.form.get('text') or '').strip()
        if pasted_text:
            content_parts.append(pasted_text)

        # Extract text from PDF
        file = request.files.get('file')
        if file and file.filename:
            filename = (file.filename or '').lower()
            if filename.endswith('.pdf'):
                try:
                    import pdfplumber
                    with pdfplumber.open(io.BytesIO(file.read())) as pdf:
                        pages = [page.extract_text() or '' for page in pdf.pages[:10]]
                        pdf_text = '\n'.join(p for p in pages if p).strip()
                    if pdf_text:
                        content_parts.append(pdf_text)
                except Exception as e:
                    print(f'[parse-deal] PDF extraction error: {e}', flush=True)

        if not content_parts:
            return jsonify({'success': False, 'error': 'No text or file provided'}), 400

        combined = '\n\n---\n\n'.join(content_parts)

        api_key = os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            return jsonify({'success': False, 'error': 'ANTHROPIC_API_KEY not configured'}), 503

        try:
            from anthropic import Anthropic
        except ImportError:
            return jsonify({'success': False, 'error': 'Anthropic SDK not available'}), 503

        client = Anthropic(api_key=api_key)

        prompt = (
            'Extract the following fields from this real estate deal material. '
            'Return ONLY valid JSON with these exact keys. '
            'Leave the value as an empty string "" if a field is not clearly present — do not guess.\n\n'
            'Fields:\n'
            '- property_address: full street address of the property\n'
            '- unit_count: number of units (as a string, e.g. "48")\n'
            '- asking_price: asking price (as a string, e.g. "$5,200,000")\n'
            '- seller_broker_name: name of the seller or listing broker\n'
            '- market_city: city and state (e.g. "Austin, TX")\n\n'
            f'Deal material:\n{combined[:8000]}'
        )

        message = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=512,
            messages=[{'role': 'user', 'content': prompt}]
        )

        response_text = message.content[0].text.strip()

        if '```' in response_text:
            response_text = re.sub(r'```json\s*', '', response_text)
            response_text = re.sub(r'```', '', response_text).strip()

        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if not json_match:
            return jsonify({'success': False, 'error': 'Failed to parse Claude response'}), 500

        fields = json.loads(json_match.group(0))

        return jsonify({'success': True, 'fields': fields}), 200

    except json.JSONDecodeError as e:
        return jsonify({'success': False, 'error': f'JSON parse error: {str(e)}'}), 500
    except Exception as e:
        error_msg = str(e)
        print(f'[parse-deal] Error: {error_msg}', flush=True)
        if 'credit balance' in error_msg or 'billing' in error_msg.lower():
            return jsonify({'success': False, 'error': 'Anthropic API credits exhausted.'}), 503
        if 'rate_limit' in error_msg.lower():
            return jsonify({'success': False, 'error': 'Rate limit reached. Please try again.'}), 429
        return jsonify({'success': False, 'error': error_msg}), 500
