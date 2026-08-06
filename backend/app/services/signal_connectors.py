"""
Signal connectors for the sourcing signals engine.

Each connector is a generic function parametrized entirely by per-market
config (a feed URL + a field-name mapping) — no market-specific code lives
here. Adding a new market whose county/city already publishes data through
one of these formats (Esri ArcGIS FeatureServer/MapServer, or Socrata SODA
API — the two most common open-data platforms for county/city government)
is just a new SignalMarketModel config row, not new code.
"""
import csv
import io
import json
import os
import re
import logging

import requests

logger = logging.getLogger(__name__)

REQUEST_TIMEOUT = 20


def _extract(attrs, source):
    """
    Look up a mapped field's value. `source` is normally a single field name
    (string) — the original, unchanged behavior. Some feeds split an address
    across several fields with no single composed one (e.g. LA's code-
    violations feed, Hamilton County's assessor layer); for those, `source`
    can be a list of field names, joined with a space, skipping any that are
    empty/null. Every existing config uses a plain string, so this is a no-op
    for them.
    """
    if isinstance(source, list):
        return ' '.join(str(attrs[s]) for s in source if attrs.get(s))
    return attrs.get(source)


def fetch_arcgis_feature_server(feed_url, field_mapping, limit=2000, where='1=1'):
    """
    Query an Esri FeatureServer/MapServer `/query` endpoint and normalize
    records using field_mapping (target_key -> source attribute name).

    `where` defaults to matching everything, but callers hitting a national
    layer (e.g. the HUD LIHTC dataset) can pass a real filter so the server
    does the city/state narrowing instead of downloading everything and
    filtering client-side — this is what makes a per-market county feed and
    a national HUD layer usable through the same function.

    Returns a list of dicts with the target_key names from field_mapping.
    """
    if not feed_url or not field_mapping:
        return []

    query_url = feed_url.rstrip('/')
    if not query_url.endswith('/query'):
        query_url = f'{query_url}/query'

    params = {
        'where': where,
        'outFields': '*',
        'f': 'json',
        'resultRecordCount': limit,
    }
    resp = requests.get(query_url, params=params, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()

    features = data.get('features', [])
    records = []
    for feature in features:
        attrs = feature.get('attributes', {})
        record = {target: _extract(attrs, source) for target, source in field_mapping.items()}
        records.append(record)
    return records


def fetch_socrata_dataset(feed_url, field_mapping, limit=2000, where=None):
    """
    Query a Socrata SODA API resource endpoint and normalize records using
    field_mapping (target_key -> source column name).

    `where` is a SoQL filter (Socrata's `$where` param) — same rationale as
    fetch_arcgis_feature_server's `where`: push filtering server-side rather
    than fetching `limit` rows and hoping the ones you care about are in it.

    Returns a list of dicts with the target_key names from field_mapping.
    """
    if not feed_url or not field_mapping:
        return []

    params = {'$limit': limit}
    if where:
        params['$where'] = where
    resp = requests.get(feed_url, params=params, timeout=REQUEST_TIMEOUT)
    resp.raise_for_status()
    rows = resp.json()

    records = []
    for row in rows:
        record = {target: _extract(row, source) for target, source in field_mapping.items()}
        records.append(record)
    return records


def import_tax_delinquent_csv(file_storage):
    """
    Parse a user-uploaded county tax-delinquent export (CSV or Excel) and use
    Claude to map its arbitrary columns onto our target schema. There's no
    bulk tax-delinquent API for either seed market, so this manual-upload
    path is the real v1 implementation of the tax_delinquency signal — the
    same "map arbitrary spreadsheet columns" approach already used for bulk
    property import in sourcing_routes.py.

    Returns a list of mapped row dicts:
      {address, owner_name, owner_mailing_address, unit_count, assessed_value}
    """
    filename = (file_storage.filename or '').lower()
    rows = []
    headers = []

    if filename.endswith('.csv'):
        content = file_storage.read().decode('utf-8-sig', errors='replace')
        reader = csv.DictReader(io.StringIO(content))
        headers = list(reader.fieldnames or [])
        for i, row in enumerate(reader):
            if i >= 500:
                break
            rows.append(dict(row))
    elif filename.endswith('.xlsx') or filename.endswith('.xls'):
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(file_storage.read()), data_only=True)
        ws = wb.active
        all_rows = list(ws.iter_rows(values_only=True))
        if not all_rows:
            raise ValueError('File is empty')
        headers = [str(h).strip() if h is not None else f'Col{i}' for i, h in enumerate(all_rows[0])]
        for row in all_rows[1:501]:
            rows.append(dict(zip(headers, [str(v).strip() if v is not None else '' for v in row])))
    else:
        raise ValueError('Only .xlsx, .xls, and .csv files are supported')

    if not rows:
        raise ValueError('No data rows found in file')

    api_key = os.getenv('ANTHROPIC_API_KEY')
    if not api_key:
        raise RuntimeError('ANTHROPIC_API_KEY not configured')

    from anthropic import Anthropic
    client = Anthropic(api_key=api_key)

    target_fields = ['address', 'owner_name', 'owner_mailing_address', 'unit_count', 'assessed_value']
    prompt = (
        f'You are a data mapping assistant for a real estate sourcing tool.\n\n'
        f'Spreadsheet columns from a county tax-delinquent property export: {headers}\n\n'
        f'Sample data (first 10 rows):\n{json.dumps(rows[:10], indent=2)}\n\n'
        f'Target schema fields: {", ".join(target_fields)}\n'
        f'unit_count and assessed_value should be numbers (null if unknown/not applicable).\n\n'
        f'Map ALL {len(rows)} rows to the target schema. Leave unknown fields as null. '
        f'Return ONLY a raw JSON array (no markdown fences, no explanation) starting with [ and ending with ].\n\n'
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
        raise ValueError('Failed to parse Claude response as JSON array')

    return json.loads(json_match.group(0))
