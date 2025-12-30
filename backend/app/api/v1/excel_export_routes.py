"""
Excel Export API Routes
Generates multifamily underwriting Excel models
"""
from flask import Blueprint, request, jsonify, send_file
from datetime import datetime
from io import BytesIO
import sys
import os

# Add parent directory to path to import build_underwriting_model
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '../../../'))

from build_underwriting_model import create_underwriting_model

excel_export_bp = Blueprint('excel_export', __name__)


@excel_export_bp.route('/underwriting/<int:deal_id>/export-excel', methods=['POST'])
def export_underwriting_excel(deal_id):
    """
    Generate and download Excel underwriting model for a multifamily property

    Request Body:
        JSON object with multifamily underwriting data

    Returns:
        Excel file download
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({'error': 'Request body with underwriting data is required'}), 400

        # Generate the model with real data from request
        wb = create_underwriting_model(data)

        # Save to BytesIO
        output = BytesIO()
        wb.save(output)
        output.seek(0)

        # Generate filename
        property_name = data.get('propertyName', 'Property').replace(' ', '_')
        timestamp = datetime.now().strftime('%Y%m%d')
        filename = f"{property_name}_Underwriting_{timestamp}.xlsx"

        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500


@excel_export_bp.route('/underwriting/export-excel-template', methods=['GET'])
def export_template():
    """
    Generate and download blank Excel underwriting template

    Returns:
        Excel file download with sample data
    """
    try:
        # Generate template
        wb = create_underwriting_model()

        # Save to BytesIO
        output = BytesIO()
        wb.save(output)
        output.seek(0)

        timestamp = datetime.now().strftime('%Y%m%d')
        filename = f"Aequitas_Underwriting_Template_{timestamp}.xlsx"

        return send_file(
            output,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500
