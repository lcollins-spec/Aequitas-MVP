"""
ClimateCheck PDF upload and extraction routes.

POST /api/v1/underwriting/<deal_id>/climate-upload
    Accepts a PDF, uploads to Drive, extracts scores via Claude, returns
    extracted JSON for frontend review — does NOT write to DB until confirmed.

POST /api/v1/underwriting/<deal_id>/climate-confirm
    Saves confirmed extracted data to the deal record.

GET  /api/v1/underwriting/<deal_id>/climate
    Returns current confirmed climate data for a deal.
"""

import json
import logging
import base64
import os

from flask import Blueprint, request, jsonify
from app.database import db, DealModel
from app.utils import google_drive

logger = logging.getLogger(__name__)

climate_check_bp = Blueprint('climate_check', __name__)

EXTRACTION_PROMPT = """Extract the following from this ClimateCheck report. Return JSON only, no preamble:
{
  "overall_score": number (0-100),
  "wildfire_score": number (0-100),
  "flood_score": number (0-100),
  "wildfire_risk_label": string (e.g. "Moderate", "High", "Severe"),
  "flood_risk_label": string,
  "overall_risk_label": string,
  "key_risks": [string] (top 3 risk descriptions as bullet text from the report),
  "property_address": string
}
If a field is not found, return null for that field."""


@climate_check_bp.route('/underwriting/<int:deal_id>/climate-upload', methods=['POST'])
def climate_upload(deal_id: int):
    """
    Accepts multipart PDF, uploads to Drive, extracts scores via Claude.
    Returns extracted data for frontend review — does NOT save to DB.
    """
    try:
        # ── Validate deal ─────────────────────────────────────────────────────
        deal = db.session.get(DealModel, deal_id)
        if not deal:
            return jsonify({'success': False, 'error': f'Deal {deal_id} not found'}), 404

        # ── Validate file ─────────────────────────────────────────────────────
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400

        file = request.files['file']
        if not file or not file.filename:
            return jsonify({'success': False, 'error': 'Empty file'}), 400

        if not file.filename.lower().endswith('.pdf'):
            return jsonify({'success': False, 'error': 'Only PDF files are accepted'}), 400

        file_bytes = file.read()
        if len(file_bytes) == 0:
            return jsonify({'success': False, 'error': 'Uploaded file is empty'}), 400

        if len(file_bytes) > 20 * 1024 * 1024:
            return jsonify({'success': False, 'error': 'File must be under 20 MB'}), 400

        # ── Upload to Google Drive ────────────────────────────────────────────
        drive_url = ''
        try:
            result = google_drive.upload_file(
                file_bytes=file_bytes,
                filename=file.filename,
                mime_type='application/pdf',
                deal_name=deal.deal_name,
                document_type='Other',
            )
            drive_url = result['web_view_link']
        except RuntimeError as e:
            logger.error("Google Drive upload failed for climate PDF: %s", e)
            # Non-fatal — continue with extraction even if Drive fails
            drive_url = ''

        # ── Extract via Claude ────────────────────────────────────────────────
        api_key = os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            return jsonify({'success': False, 'error': 'ANTHROPIC_API_KEY not configured'}), 503

        try:
            from anthropic import Anthropic
        except ImportError:
            return jsonify({'success': False, 'error': 'Anthropic SDK not available'}), 503

        pdf_b64 = base64.standard_b64encode(file_bytes).decode('utf-8')

        client = Anthropic(api_key=api_key)
        message = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=1024,
            messages=[{
                'role': 'user',
                'content': [
                    {
                        'type': 'document',
                        'source': {
                            'type': 'base64',
                            'media_type': 'application/pdf',
                            'data': pdf_b64,
                        },
                    },
                    {
                        'type': 'text',
                        'text': EXTRACTION_PROMPT,
                    },
                ],
            }],
        )

        raw_text = message.content[0].text.strip()

        # Strip markdown fences if present
        if raw_text.startswith('```'):
            raw_text = raw_text.split('\n', 1)[-1]
            if raw_text.endswith('```'):
                raw_text = raw_text[:-3]

        extracted = json.loads(raw_text)

        # ── Persist PDF metadata (filename + Drive URL) to DB ─────────────────
        # We save the file reference now so it's not lost if user refreshes
        # before confirming. Scores are NOT persisted yet (climateConfirmed = 0).
        deal.climate_pdf_filename = file.filename
        deal.climate_pdf_drive_url = drive_url
        deal.climate_raw_extracted = json.dumps(extracted)
        db.session.commit()

        return jsonify({
            'success': True,
            'extracted': extracted,
            'filename': file.filename,
            'drive_url': drive_url,
        })

    except json.JSONDecodeError as e:
        logger.error("Claude returned non-JSON for climate extraction: %s", e)
        return jsonify({'success': False, 'error': 'Claude could not parse the PDF — ensure it is a ClimateCheck report'}), 422
    except Exception as e:
        err = str(e)
        logger.exception("Unhandled error in climate_upload for deal %s", deal_id)
        if 'credit' in err.lower() or 'billing' in err.lower():
            return jsonify({'success': False, 'error': 'Anthropic API credits exhausted'}), 503
        db.session.rollback()
        return jsonify({'success': False, 'error': err}), 500


@climate_check_bp.route('/underwriting/<int:deal_id>/climate-confirm', methods=['POST'])
def climate_confirm(deal_id: int):
    """
    Saves user-confirmed ClimateCheck data to the deal record.
    Expects JSON body with extracted fields.
    """
    try:
        deal = db.session.get(DealModel, deal_id)
        if not deal:
            return jsonify({'success': False, 'error': f'Deal {deal_id} not found'}), 404

        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'No data provided'}), 400

        extracted = data.get('extracted', {})

        deal.climate_overall_score    = extracted.get('overall_score')
        deal.climate_wildfire_score   = extracted.get('wildfire_score')
        deal.climate_flood_score      = extracted.get('flood_score')
        deal.climate_overall_label    = extracted.get('overall_risk_label')
        deal.climate_wildfire_label   = extracted.get('wildfire_risk_label')
        deal.climate_flood_label      = extracted.get('flood_risk_label')
        deal.climate_key_risks        = json.dumps(extracted.get('key_risks') or [])
        deal.climate_property_address = extracted.get('property_address')
        deal.climate_confirmed        = 1

        db.session.commit()

        return jsonify({'success': True, 'deal': deal.to_dict()})

    except Exception as e:
        logger.exception("Unhandled error in climate_confirm for deal %s", deal_id)
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@climate_check_bp.route('/underwriting/<int:deal_id>/climate', methods=['GET'])
def climate_get(deal_id: int):
    """Return current climate data for a deal."""
    deal = db.session.get(DealModel, deal_id)
    if not deal:
        return jsonify({'success': False, 'error': f'Deal {deal_id} not found'}), 404

    key_risks = []
    if deal.climate_key_risks:
        try:
            key_risks = json.loads(deal.climate_key_risks)
        except Exception:
            pass

    raw_extracted = None
    if deal.climate_raw_extracted:
        try:
            raw_extracted = json.loads(deal.climate_raw_extracted)
        except Exception:
            pass

    return jsonify({
        'success': True,
        'confirmed': bool(deal.climate_confirmed),
        'data': {
            'overall_score':    deal.climate_overall_score,
            'wildfire_score':   deal.climate_wildfire_score,
            'flood_score':      deal.climate_flood_score,
            'overall_risk_label':   deal.climate_overall_label,
            'wildfire_risk_label':  deal.climate_wildfire_label,
            'flood_risk_label':     deal.climate_flood_label,
            'key_risks':        key_risks,
            'property_address': deal.climate_property_address,
            'pdf_filename':     deal.climate_pdf_filename,
            'pdf_drive_url':    deal.climate_pdf_drive_url,
        },
        'raw_extracted': raw_extracted,
    })
