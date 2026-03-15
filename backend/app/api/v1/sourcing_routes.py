"""
Sourcing API routes
Parses uploaded Excel/CSV files and maps columns to the sourcing data model using Claude.
"""
import json
import os
import io
import csv
import re
from flask import Blueprint, request, jsonify

sourcing_bp = Blueprint('sourcing', __name__)


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

        # Target schemas per type
        schemas = {
            'properties': {
                'fields': ['address', 'units', 'owner_name', 'status', 'last_contact_date',
                           'next_followup_date', 'notes'],
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

        # Strip markdown fences if present
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
