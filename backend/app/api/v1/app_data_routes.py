"""
Generic key-value store endpoints for app-level JSON blobs.
Used for sourcing data, fund settings, operating performance, etc.

GET  /app-data/<key>  → { value: any | null }
PUT  /app-data/<key>  → body: { value: any } → { success: true }
"""
import json
from flask import Blueprint, request, jsonify
from app.database import db, AppDataModel

app_data_bp = Blueprint('app_data', __name__)


@app_data_bp.route('/app-data/<key>', methods=['GET'])
def get_app_data(key: str):
    try:
        row = AppDataModel.query.get(key)
        if not row or row.value is None:
            return jsonify({'value': None}), 200
        return jsonify({'value': json.loads(row.value)}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app_data_bp.route('/app-data/<key>', methods=['PUT'])
def set_app_data(key: str):
    try:
        data = request.get_json() or {}
        value = data.get('value')
        row = AppDataModel.query.get(key)
        if row is None:
            row = AppDataModel(key=key)
            db.session.add(row)
        row.value = json.dumps(value) if value is not None else None
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500
