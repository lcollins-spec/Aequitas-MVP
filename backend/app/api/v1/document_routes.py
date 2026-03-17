"""
Document upload / retrieval routes backed by Google Drive.

POST /api/v1/documents/upload  — upload a file to Drive, persist metadata
GET  /api/v1/documents/<deal_id> — list all documents for a deal
DELETE /api/v1/documents/<doc_id> — delete a document from Drive and DB
"""

import uuid
import logging
from flask import Blueprint, request, jsonify
from app.database import db, DealModel, DealDocumentModel
from app.utils import google_drive

logger = logging.getLogger(__name__)

documents_bp = Blueprint('documents', __name__)

ALLOWED_MIME_TYPES = {
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'message/rfc822',
    'text/plain',
    'image/jpeg',
    'image/png',
}

VALID_DOCUMENT_TYPES = {
    'OM', 'T12', 'Rent Roll', 'LOI Draft', 'PSA Draft', 'Email', 'Other'
}


@documents_bp.route('/documents/upload', methods=['POST'])
def upload_document():
    """
    Accepts multipart/form-data with:
      - file       : the file to upload
      - deal_id    : integer deal ID
      - document_type : one of the valid document types
    """
    try:
        # ── Validate inputs ───────────────────────────────────────────────────
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided'}), 400

        file = request.files['file']
        if not file or not file.filename:
            return jsonify({'success': False, 'error': 'Empty file'}), 400

        deal_id_raw = request.form.get('deal_id')
        if not deal_id_raw:
            return jsonify({'success': False, 'error': 'deal_id is required'}), 400

        try:
            deal_id = int(deal_id_raw)
        except ValueError:
            return jsonify({'success': False, 'error': 'deal_id must be an integer'}), 400

        document_type = request.form.get('document_type', 'Other')
        if document_type not in VALID_DOCUMENT_TYPES:
            document_type = 'Other'

        # ── Look up the deal ──────────────────────────────────────────────────
        deal = db.session.get(DealModel, deal_id)
        if not deal:
            return jsonify({'success': False, 'error': f'Deal {deal_id} not found'}), 404

        deal_name = deal.deal_name

        # ── Read file bytes ───────────────────────────────────────────────────
        file_bytes = file.read()
        if len(file_bytes) == 0:
            return jsonify({'success': False, 'error': 'Uploaded file is empty'}), 400

        mime_type = file.content_type or 'application/octet-stream'

        # ── Upload to Drive ───────────────────────────────────────────────────
        try:
            result = google_drive.upload_file(
                file_bytes=file_bytes,
                filename=file.filename,
                mime_type=mime_type,
                deal_name=deal_name,
                document_type=document_type,
            )
        except RuntimeError as e:
            logger.error("Google Drive upload failed: %s", e)
            return jsonify({'success': False, 'error': str(e)}), 502

        # ── Persist metadata ──────────────────────────────────────────────────
        doc = DealDocumentModel(
            id=str(uuid.uuid4()),
            deal_id=deal_id,
            file_name=file.filename,
            document_type=document_type,
            drive_file_id=result['file_id'],
            drive_url=result['web_view_link'],
        )
        db.session.add(doc)
        db.session.commit()

        return jsonify({
            'success': True,
            'file_id': result['file_id'],
            'file_name': result['file_name'],
            'drive_url': result['web_view_link'],
            'document': doc.to_dict(),
        }), 201

    except Exception as e:
        logger.exception("Unhandled error in upload_document")
        db.session.rollback()
        return jsonify({'success': False, 'error': str(e)}), 500


@documents_bp.route('/documents/<int:deal_id>', methods=['GET'])
def list_documents(deal_id: int):
    """Return all documents for a deal, ordered by upload date descending."""
    deal = db.session.get(DealModel, deal_id)
    if not deal:
        return jsonify({'success': False, 'error': f'Deal {deal_id} not found'}), 404

    docs = (
        DealDocumentModel.query
        .filter_by(deal_id=deal_id)
        .order_by(DealDocumentModel.uploaded_at.desc())
        .all()
    )

    return jsonify({
        'success': True,
        'documents': [d.to_dict() for d in docs],
    })


@documents_bp.route('/documents/doc/<doc_id>', methods=['DELETE'])
def delete_document(doc_id: str):
    """Delete a document from Drive and from the DB."""
    doc = db.session.get(DealDocumentModel, doc_id)
    if not doc:
        return jsonify({'success': False, 'error': 'Document not found'}), 404

    # Delete from Drive first
    try:
        google_drive.delete_file(doc.drive_file_id)
    except RuntimeError as e:
        logger.error("Google Drive delete failed: %s", e)
        return jsonify({'success': False, 'error': str(e)}), 502

    db.session.delete(doc)
    db.session.commit()

    return jsonify({'success': True})
