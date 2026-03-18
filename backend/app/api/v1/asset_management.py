"""
Asset Management API routes.

GET  /api/asset-management/deals
    Returns active/closed deals with latest quarter actuals and underwriting NOI.

GET  /api/asset-management/deals/<deal_id>/reports
    Returns all asset_reports rows for a deal (ordered by quarter desc)
    plus derived underwriting assumptions for comparison.

POST /api/asset-management/deals/<deal_id>/reports
    Upserts a quarterly report (insert or update if (deal_id, quarter) already exists).

POST /api/asset-management/deals/<deal_id>/reports/<quarter>/upload-pdf
    Accepts a multipart PDF, uploads to Google Drive in the deal's folder,
    and saves pdf_filename + pdf_drive_url to the matching asset_report row.
"""
from __future__ import annotations  # allows X | None on Python 3.9

import json
import logging
from datetime import datetime

from flask import Blueprint, request, jsonify
from sqlalchemy.exc import IntegrityError

from app.database import db, DealModel, AssetReportModel
from app.utils import google_drive

logger = logging.getLogger(__name__)

asset_mgmt_bp = Blueprint('asset_management', __name__)


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _safe(v):
    """Return None instead of NaN/Inf so JSON serialisation never breaks."""
    if v is None:
        return None
    try:
        f = float(v)
        import math
        return None if (math.isnan(f) or math.isinf(f)) else f
    except (TypeError, ValueError):
        return None


def _underwriting_for(deal: DealModel) -> dict:
    """
    Derive underwriting assumptions from the deal model fields.
    All values are annual (deals store monthly figures).
    Returns None for each metric when the source field is absent.
    """
    m_rent   = deal.monthly_rent          # total monthly gross rent for the building
    vac_rate = deal.vacancy_rate          # fraction (e.g. 0.05)
    m_income = deal.total_monthly_income  # EGI per month (after vacancy/misc)
    m_expns  = deal.total_monthly_expenses
    m_pmt    = deal.monthly_payment       # debt service per month

    annual_gpr       = _safe(m_rent * 12) if m_rent is not None else None
    annual_vac_loss  = _safe(m_rent * 12 * vac_rate) if (m_rent is not None and vac_rate is not None) else None
    annual_egi       = _safe(m_income * 12) if m_income is not None else None
    annual_ds        = _safe(m_pmt * 12) if m_pmt is not None else None

    # Operating expenses = total expenses minus debt-service component
    if m_expns is not None and m_pmt is not None:
        annual_opex = _safe((m_expns - m_pmt) * 12)
    else:
        annual_opex = None

    annual_noi = _safe(annual_egi - annual_opex) if (annual_egi is not None and annual_opex is not None) else None

    occupancy_pct = _safe((1.0 - vac_rate) * 100) if vac_rate is not None else None

    # Try to enrich from underwriting_json blob if present
    uw = {}
    if deal.underwriting_json:
        try:
            uw = json.loads(deal.underwriting_json)
        except Exception:
            uw = {}

    # If the blob has a year-1 NOI value it takes precedence
    if uw.get('stabilizedNoi'):
        annual_noi = _safe(uw['stabilizedNoi'])

    return {
        'gpr': annual_gpr,
        'vacancy_loss': annual_vac_loss,
        'egi': annual_egi,
        'operating_expenses': annual_opex,
        'noi': annual_noi,
        'debt_service': annual_ds,
        'occupancy_pct': occupancy_pct,
    }


def _latest_report(deal_id: int) -> AssetReportModel | None:
    return (
        AssetReportModel.query
        .filter_by(deal_id=deal_id)
        .order_by(AssetReportModel.quarter.desc())
        .first()
    )


# ─── Routes ───────────────────────────────────────────────────────────────────

@asset_mgmt_bp.route('/asset-management/deals', methods=['GET'])
def list_am_deals():
    """Return all active/closed deals enriched with latest actuals."""
    try:
        deals = (
            DealModel.query
            .filter(DealModel.status.in_(['closed', 'active', 'completed', 'ongoing']))
            .order_by(DealModel.deal_name)
            .all()
        )

        result = []
        for deal in deals:
            latest = _latest_report(deal.id)
            uw = _underwriting_for(deal)
            result.append({
                'deal_id': deal.id,
                'deal_name': deal.deal_name,
                'address': deal.property_address or deal.location or '',
                'status': deal.status,
                'latest_quarter': latest.quarter if latest else None,
                'latest_noi': _safe(latest.noi) if latest else None,
                'latest_occupancy_pct': _safe(latest.occupancy_pct) if latest else None,
                'underwriting_noi': uw['noi'],
                'underwriting_occupancy_pct': uw['occupancy_pct'],
            })

        return jsonify({'success': True, 'deals': result}), 200

    except Exception as e:
        logger.exception("list_am_deals failed")
        return jsonify({'success': False, 'error': str(e)}), 500


@asset_mgmt_bp.route('/asset-management/deals/<int:deal_id>/reports', methods=['GET'])
def get_deal_reports(deal_id: int):
    """Return all reports for a deal plus underwriting assumptions."""
    try:
        deal = db.session.get(DealModel, deal_id)
        if not deal:
            return jsonify({'success': False, 'error': f'Deal {deal_id} not found'}), 404

        reports = (
            AssetReportModel.query
            .filter_by(deal_id=deal_id)
            .order_by(AssetReportModel.quarter.desc())
            .all()
        )

        return jsonify({
            'success': True,
            'deal': {
                'deal_id': deal.id,
                'deal_name': deal.deal_name,
                'address': deal.property_address or deal.location or '',
                'status': deal.status,
            },
            'reports': [r.to_dict() for r in reports],
            'underwriting': _underwriting_for(deal),
        }), 200

    except Exception as e:
        logger.exception("get_deal_reports failed for deal %s", deal_id)
        return jsonify({'success': False, 'error': str(e)}), 500


@asset_mgmt_bp.route('/asset-management/deals/<int:deal_id>/reports', methods=['POST'])
def upsert_deal_report(deal_id: int):
    """Insert or update a quarterly asset report."""
    try:
        deal = db.session.get(DealModel, deal_id)
        if not deal:
            return jsonify({'success': False, 'error': f'Deal {deal_id} not found'}), 404

        data = request.get_json() or {}
        quarter = data.get('quarter', '').strip()
        if not quarter:
            return jsonify({'success': False, 'error': 'quarter is required'}), 400

        # Upsert: look for existing row
        report = AssetReportModel.query.filter_by(deal_id=deal_id, quarter=quarter).first()
        if report is None:
            report = AssetReportModel(deal_id=deal_id, quarter=quarter)
            db.session.add(report)

        # Update fields
        for field in ('gross_potential_rent', 'vacancy_loss', 'effective_gross_income',
                      'operating_expenses', 'noi', 'debt_service', 'occupancy_pct'):
            raw = data.get(field)
            setattr(report, field, _safe(raw) if raw is not None else None)

        report.notes = data.get('notes', '')
        report.updated_at = datetime.utcnow()

        db.session.commit()
        return jsonify({'success': True, 'report': report.to_dict()}), 200

    except Exception as e:
        db.session.rollback()
        logger.exception("upsert_deal_report failed for deal %s", deal_id)
        return jsonify({'success': False, 'error': str(e)}), 500


@asset_mgmt_bp.route(
    '/asset-management/deals/<int:deal_id>/reports/<path:quarter>/upload-pdf',
    methods=['POST'],
)
def upload_report_pdf(deal_id: int, quarter: str):
    """Upload a PDF quarterly report to Google Drive and save the reference."""
    try:
        deal = db.session.get(DealModel, deal_id)
        if not deal:
            return jsonify({'success': False, 'error': f'Deal {deal_id} not found'}), 404

        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400

        file = request.files['file']
        if not file or not file.filename:
            return jsonify({'success': False, 'error': 'Empty file'}), 400

        file_bytes = file.read()
        if not file_bytes:
            return jsonify({'success': False, 'error': 'File is empty'}), 400

        mime_type = file.content_type or 'application/pdf'

        # Upload to the deal's existing Drive subfolder
        try:
            result = google_drive.upload_file(
                file_bytes=file_bytes,
                filename=file.filename,
                mime_type=mime_type,
                deal_name=deal.deal_name,
                document_type='Quarterly Report',
            )
        except RuntimeError as e:
            return jsonify({'success': False, 'error': str(e)}), 502

        # Upsert the report row if it doesn't exist yet
        report = AssetReportModel.query.filter_by(deal_id=deal_id, quarter=quarter).first()
        if report is None:
            report = AssetReportModel(deal_id=deal_id, quarter=quarter)
            db.session.add(report)

        report.pdf_filename = result['file_name']
        report.pdf_drive_url = result['web_view_link']
        report.updated_at = datetime.utcnow()
        db.session.commit()

        return jsonify({
            'success': True,
            'filename': result['file_name'],
            'drive_url': result['web_view_link'],
            'report': report.to_dict(),
        }), 200

    except Exception as e:
        db.session.rollback()
        logger.exception("upload_report_pdf failed for deal %s quarter %s", deal_id, quarter)
        return jsonify({'success': False, 'error': str(e)}), 500
