from flask import Blueprint, jsonify, request
import os
import json

from pathlib import Path

api_v1 = Blueprint('api_v1', __name__)

@api_v1.route('/ping', methods=['GET'])
def ping():
    return jsonify({'pong': True})

@api_v1.route('/echo', methods=['POST'])
def echo():
    payload = request.get_json(silent=True) or {}
    return jsonify({'received': payload}), 201

@api_v1.route('/status', methods=['GET'])
def status():
    return jsonify({'service': 'PE-Aequitas API', 'version': 'v1'})


@api_v1.route('/metrics', methods=['GET'])
def metrics():
    """Return simple metrics for the frontend dashboard.

    Reads values from `Web_scraping/available_properties.json` and 
    `Web_scraping/potential_properties.json`. Otherwise returns reasonable defaults.
    """
    repo_root = Path(__file__).resolve().parents[4]
    available_path = repo_root / 'Web_scraping' / 'available_properties.json'
    potential_path = repo_root / 'Web_scraping' / 'potential_properties.json'

    defaults = {
        'total_affordable_units': 12847,
        'families_housed': 28903
    }

    try:
        total_units = defaults['total_affordable_units']
        families = defaults['families_housed']

        # Try to read available_properties for unit count
        if available_path.exists():
            with open(available_path, 'r', encoding='utf-8') as f:
                available_data = json.load(f)
                props = available_data.get('properties', [])
                # If there's a totalUnits in the first property or metadata, use it
                if props and 'totalUnits' in props[0]:
                    try:
                        total_units = int(props[0]['totalUnits'])
                    except Exception:
                        pass

        # Try to read potential_properties for additional context if needed
        if potential_path.exists():
            with open(potential_path, 'r', encoding='utf-8') as f:
                potential_data = json.load(f)
                # Optionally derive additional metrics from potential_data

        return jsonify({
            'total_affordable_units': total_units,
            'families_housed': families,
        })
    except Exception:
            return jsonify(defaults)

    return jsonify(defaults)
