"""
Deal management API routes
Provides REST endpoints for CRUD operations on deals
"""
import json
from flask import Blueprint, request, jsonify, send_file
from app.services.deal_service import DealService
from app.database import db, DealMetaModel, DealOpPerformanceModel

deals_bp = Blueprint('deals', __name__)


@deals_bp.route('/deals', methods=['GET'])
def get_deals():
    """
    Get all deals with optional status filter

    Query Parameters:
        status (optional): Filter by status ('potential', 'ongoing', 'completed', 'rejected')
        limit (optional): Maximum number of deals to return (default 100)

    Returns:
        JSON response with deals array
    """
    try:
        status = request.args.get('status')
        limit = request.args.get('limit', 100, type=int)

        deals = DealService.get_all_deals(status=status, limit=limit)

        return jsonify({
            'deals': [deal.to_dict() for deal in deals]
        }), 200

    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500


@deals_bp.route('/deals', methods=['POST'])
def create_deal():
    """
    Create a new deal

    Request Body:
        JSON object with deal data (dealName and location are required)

    Returns:
        JSON response with created deal
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({
                'error': 'Request body is required'
            }), 400

        deal = DealService.create_deal(data)

        return jsonify({
            'deal': deal.to_dict()
        }), 201

    except ValueError as e:
        return jsonify({
            'error': str(e)
        }), 400
    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500


@deals_bp.route('/deals/<int:deal_id>', methods=['GET'])
def get_deal(deal_id):
    """
    Get a single deal by ID

    Path Parameters:
        deal_id: ID of the deal to retrieve

    Returns:
        JSON response with deal data
    """
    try:
        deal = DealService.get_deal(deal_id)

        if not deal:
            return jsonify({
                'error': 'Deal not found'
            }), 404

        return jsonify({
            'deal': deal.to_dict()
        }), 200

    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500


@deals_bp.route('/deals/<int:deal_id>', methods=['PUT'])
def update_deal(deal_id):
    """
    Update an existing deal

    Path Parameters:
        deal_id: ID of the deal to update

    Request Body:
        JSON object with updated deal data

    Returns:
        JSON response with updated deal
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({
                'error': 'Request body is required'
            }), 400

        deal = DealService.update_deal(deal_id, data)

        if not deal:
            return jsonify({
                'error': 'Deal not found'
            }), 404

        return jsonify({
            'deal': deal.to_dict()
        }), 200

    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500


@deals_bp.route('/deals/<int:deal_id>', methods=['DELETE'])
def delete_deal(deal_id):
    """
    Delete a deal

    Path Parameters:
        deal_id: ID of the deal to delete

    Returns:
        JSON response with success status
    """
    try:
        success = DealService.delete_deal(deal_id)

        if not success:
            return jsonify({
                'error': 'Deal not found'
            }), 404

        return jsonify({
            'success': True,
            'message': 'Deal deleted successfully'
        }), 200

    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500


@deals_bp.route('/deals/<int:deal_id>/export', methods=['GET'])
def export_deal(deal_id):
    """
    Export a deal to Excel

    Path Parameters:
        deal_id: ID of the deal to export

    Returns:
        Excel file download
    """
    try:
        # Import here to avoid circular dependency
        from app.services.excel_export_service import ExcelExportService

        deal = DealService.get_deal(deal_id)

        if not deal:
            return jsonify({
                'error': 'Deal not found'
            }), 404

        # Generate Excel file
        excel_file = ExcelExportService.generate_excel(deal_id)

        if not excel_file:
            return jsonify({
                'error': 'Failed to generate Excel file'
            }), 500

        # Send file as download
        filename = f"{deal.deal_name.replace(' ', '_')}_financial_model.xlsx"
        return send_file(
            excel_file,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500


# ── Deal Meta endpoints (pipeline status + execution data) ────────────────────

def _get_or_create_meta(deal_id: int) -> DealMetaModel:
    meta = DealMetaModel.query.get(deal_id)
    if not meta:
        meta = DealMetaModel(deal_id=deal_id)
        db.session.add(meta)
        db.session.flush()
    return meta


@deals_bp.route('/deals/<int:deal_id>/pipeline-status', methods=['GET'])
def get_pipeline_status(deal_id):
    try:
        meta = DealMetaModel.query.get(deal_id)
        status = meta.pipeline_status if meta else 'Analyzing'
        return jsonify({'pipelineStatus': status}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@deals_bp.route('/deals/<int:deal_id>/pipeline-status', methods=['PUT'])
def set_pipeline_status(deal_id):
    try:
        data = request.get_json() or {}
        status = data.get('pipelineStatus', 'Analyzing')
        meta = _get_or_create_meta(deal_id)
        meta.pipeline_status = status
        db.session.commit()
        return jsonify({'pipelineStatus': meta.pipeline_status}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@deals_bp.route('/deals/<int:deal_id>/execution-data', methods=['GET'])
def get_execution_data(deal_id):
    try:
        meta = DealMetaModel.query.get(deal_id)
        if not meta or not meta.execution_data:
            return jsonify({'data': None}), 200
        return jsonify({'data': json.loads(meta.execution_data)}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@deals_bp.route('/deals/<int:deal_id>/execution-data', methods=['PUT'])
def set_execution_data(deal_id):
    try:
        data = request.get_json() or {}
        record = data.get('data')
        meta = _get_or_create_meta(deal_id)
        meta.execution_data = json.dumps(record) if record is not None else None
        db.session.commit()
        return jsonify({'success': True}), 200
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': str(e)}), 500


@deals_bp.route('/deals/all-execution-data', methods=['GET'])
def get_all_execution_data():
    """Returns all deal execution records for fund-level aggregation."""
    try:
        metas = DealMetaModel.query.filter(DealMetaModel.execution_data.isnot(None)).all()
        records = []
        for m in metas:
            try:
                records.append(json.loads(m.execution_data))
            except Exception:
                pass
        return jsonify({'records': records}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ── Operating Performance endpoints ──────────────────────────────────────────

@deals_bp.route('/deals/<int:deal_id>/op-performance', methods=['GET'])
def get_op_performance(deal_id):
    rows = DealOpPerformanceModel.query.filter_by(deal_id=deal_id).order_by(DealOpPerformanceModel.created_at).all()
    return jsonify({'rows': [r.to_dict() for r in rows]}), 200


@deals_bp.route('/deals/<int:deal_id>/op-performance', methods=['POST'])
def create_op_performance(deal_id):
    data = request.get_json() or {}
    import time
    row_id = data.get('id') or f'{int(time.time() * 1000)}'
    row = DealOpPerformanceModel(
        id=row_id,
        deal_id=deal_id,
        year=data.get('year', ''),
        projected_noi=float(data.get('projectedNoi') or 0),
        actual_noi=float(data.get('actualNoi') or 0),
    )
    db.session.add(row)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return jsonify({'error': 'Row already exists'}), 409
    return jsonify({'row': row.to_dict()}), 201


@deals_bp.route('/deals/<int:deal_id>/op-performance/bulk', methods=['POST'])
def bulk_create_op_performance(deal_id):
    """Migrate localStorage data to DB: insert all rows, skip existing."""
    items = request.get_json() or []
    created = 0
    for data in items:
        import time
        row_id = data.get('id') or f'{int(time.time() * 1000)}-{created}'
        if DealOpPerformanceModel.query.get(row_id):
            continue
        row = DealOpPerformanceModel(
            id=row_id,
            deal_id=deal_id,
            year=data.get('year', ''),
            projected_noi=float(data.get('projectedNoi') or 0),
            actual_noi=float(data.get('actualNoi') or 0),
        )
        db.session.add(row)
        created += 1
    db.session.commit()
    return jsonify({'created': created}), 201


@deals_bp.route('/deals/<int:deal_id>/op-performance/<row_id>', methods=['DELETE'])
def delete_op_performance(deal_id, row_id):
    row = DealOpPerformanceModel.query.filter_by(id=row_id, deal_id=deal_id).first()
    if not row:
        return jsonify({'error': 'Not found'}), 404
    db.session.delete(row)
    db.session.commit()
    return jsonify({'success': True}), 200


@deals_bp.route('/deals/grouped', methods=['GET'])
def get_deals_grouped():
    """
    Get deals grouped by status

    Returns:
        JSON response with deals grouped by status
    """
    try:
        grouped_deals = DealService.get_deals_by_status_grouped()

        # Convert Deal objects to dicts
        result = {}
        for status, deals in grouped_deals.items():
            result[status] = [deal.to_dict() for deal in deals]

        return jsonify(result), 200

    except Exception as e:
        return jsonify({
            'error': str(e)
        }), 500
