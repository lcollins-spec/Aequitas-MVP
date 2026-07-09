"""
Document upload / retrieval routes backed by Google Drive.

POST /api/v1/documents/upload  — upload a file to Drive, persist metadata
GET  /api/v1/documents/<deal_id> — list all documents for a deal
DELETE /api/v1/documents/<doc_id> — delete a document from Drive and DB
"""

import uuid
import logging
from flask import Blueprint, request, jsonify
from app.database import db, DealModel, DealDocumentModel, DDItem
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
    'OM', 'T12', 'Rent Roll', 'LOI Draft', 'PSA Draft',
    'Financial Model', 'DD Document', 'Email', 'Other',
}


@documents_bp.route('/documents/upload', methods=['POST'])
def upload_document():
    """
    Accepts multipart/form-data with:
      - file          : the file to upload
      - deal_id       : integer deal ID
      - document_type : one of the valid document types
      - dd_item_id    : (optional) integer DD checklist item ID; when provided
                        and document_type == 'DD Document', the file is also
                        summarized by Claude and the summary is written to
                        DDItem.analyst_notes + drive fields.
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

        dd_item_id_raw = request.form.get('dd_item_id')
        dd_item_id = None
        if dd_item_id_raw:
            try:
                dd_item_id = int(dd_item_id_raw)
            except ValueError:
                pass

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

        summary = None

        # ── Auto-summarize DD Documents and link to checklist item ────────────
        if document_type == 'DD Document' and dd_item_id is not None:
            try:
                import os, io
                import anthropic

                api_key = os.getenv('ANTHROPIC_API_KEY')
                if api_key:
                    client = anthropic.Anthropic(api_key=api_key)
                    import base64
                    b64 = base64.standard_b64encode(file_bytes).decode('utf-8')
                    # Use text fallback for Excel; PDF as document block
                    fname_lower = (file.filename or '').lower()
                    if fname_lower.endswith(('.xlsx', '.xls', '.csv')):
                        # Convert spreadsheet to text for Claude
                        try:
                            import openpyxl, io as _io
                            wb = openpyxl.load_workbook(_io.BytesIO(file_bytes), data_only=True)
                            lines = []
                            for ws in wb.worksheets:
                                lines.append(f'--- Sheet: {ws.title} ---')
                                for row in ws.iter_rows(values_only=True):
                                    row_vals = [str(c) if c is not None else '' for c in row]
                                    if any(v.strip() for v in row_vals):
                                        lines.append('\t'.join(row_vals))
                            text_content = '\n'.join(lines)
                        except Exception:
                            text_content = file_bytes.decode('utf-8', errors='replace')
                        messages = [{
                            'role': 'user',
                            'content': (
                                f'Summarize this due diligence document in 2-3 sentences. '
                                f'Identify any red flags, required actions, or key findings.\n\n{text_content}'
                            ),
                        }]
                    else:
                        messages = [{
                            'role': 'user',
                            'content': [
                                {
                                    'type': 'document',
                                    'source': {
                                        'type': 'base64',
                                        'media_type': 'application/pdf',
                                        'data': b64,
                                    },
                                },
                                {
                                    'type': 'text',
                                    'text': (
                                        'Summarize this due diligence document in 2-3 sentences. '
                                        'Identify any red flags, required actions, or key findings.'
                                    ),
                                },
                            ],
                        }]

                    resp = client.messages.create(
                        model='claude-opus-4-6',
                        max_tokens=512,
                        messages=messages,
                    )
                    summary = resp.content[0].text.strip() if resp.content else None

                    if summary:
                        dd_item = db.session.get(DDItem, dd_item_id)
                        if dd_item and dd_item.deal_id == deal_id:
                            dd_item.analyst_notes = summary
                            dd_item.drive_url = result['web_view_link']
                            dd_item.drive_file_id = result['file_id']
                            dd_item.document_id = doc.id
                            db.session.commit()
            except Exception as exc:
                logger.warning("DD auto-summarize failed (non-blocking): %s", exc)

        return jsonify({
            'success': True,
            'file_id': result['file_id'],
            'file_name': result['file_name'],
            'drive_url': result['web_view_link'],
            'document': doc.to_dict(),
            'summary': summary,
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
