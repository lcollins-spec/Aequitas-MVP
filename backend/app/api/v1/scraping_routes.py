"""
Property scraping API routes
Provides REST endpoints for extracting property data from listing URLs and PDFs
"""
import json
import os
import tempfile
from flask import Blueprint, request, jsonify
from werkzeug.utils import secure_filename
from app.services.scraping_service import ScrapingService
from app.services.pdf_extraction_service import PDFExtractionService
from app.database import db, PropertyImportModel

scraping_bp = Blueprint('scraping', __name__)

# Initialize services (lazy loading)
_scraping_service = None
_pdf_service = None


def get_scraping_service():
    """Get or create scraping service instance."""
    global _scraping_service
    if _scraping_service is None:
        _scraping_service = ScrapingService(cache_ttl=86400)  # 24 hours
    return _scraping_service


def get_pdf_service():
    """Get or create PDF extraction service instance."""
    global _pdf_service
    if _pdf_service is None:
        _pdf_service = PDFExtractionService()
    return _pdf_service


@scraping_bp.route('/scraping/extract', methods=['POST'])
def extract_property_data():
    """
    Extract property data from listing URL.

    Request Body:
        {
            "url": "https://www.loopnet.com/...",
            "enrichWithApi": true  // optional, default true
        }

    Returns:
        JSON response with extracted property data and import metadata
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({
                'success': False,
                'error': 'Request body is required',
                'code': 'INVALID_INPUT'
            }), 400

        url = data.get('url')
        if not url:
            return jsonify({
                'success': False,
                'error': 'URL is required',
                'code': 'INVALID_INPUT'
            }), 400

        enrich_with_api = data.get('enrichWithApi', True)

        # Extract property data
        scraping_service = get_scraping_service()
        result = scraping_service.extract_from_url(url, enrich=enrich_with_api)

        # Save import record to database
        import_record = PropertyImportModel(
            source_url=url,
            source_platform=result.source_platform,
            import_status=result.status,
            import_method=result.method,
            error_type=result.error_type,
            error_message=result.error_message,
            confidence_score=result.confidence_score,
            user_assisted=False
        )

        # Save extracted data as JSON
        if result.extracted_data:
            import_record.extracted_data = json.dumps(result.extracted_data.to_dict())

            # Also save individual fields for easy querying
            import_record.property_address = result.extracted_data.address
            import_record.city = result.extracted_data.city
            import_record.state = result.extracted_data.state
            import_record.zipcode = result.extracted_data.zipcode
            import_record.latitude = result.extracted_data.latitude
            import_record.longitude = result.extracted_data.longitude
            import_record.price = result.extracted_data.asking_price
            import_record.square_footage = result.extracted_data.building_size_sf
            import_record.units = result.extracted_data.num_units
            import_record.bedrooms = result.extracted_data.bedrooms
            import_record.bathrooms = result.extracted_data.bathrooms
            import_record.year_built = result.extracted_data.year_built
            import_record.property_type = result.extracted_data.property_type
            import_record.noi = result.extracted_data.noi
            import_record.cap_rate = result.extracted_data.cap_rate
            import_record.gross_income = result.extracted_data.gross_income

        # Save enrichment data
        if result.enrichment_data:
            import_record.enrichment_data = json.dumps(result.enrichment_data.to_dict())

        # Commit to database
        db.session.add(import_record)
        db.session.commit()

        # Return result
        if result.status == 'failed':
            return jsonify({
                'success': False,
                'error': result.error_message or 'Failed to extract property data',
                'code': 'EXTRACTION_FAILED',
                'details': {
                    'importId': import_record.id,
                    'status': result.status,
                    'errorType': result.error_type,
                    'errorMessage': result.error_message,
                    'suggestedAction': result.suggested_action
                }
            }), 400

        response_data = result.to_dict()
        response_data['importId'] = import_record.id

        return jsonify({
            'success': True,
            'data': response_data
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'code': 'INVALID_INPUT'
        }), 400
    except Exception as e:
        print(f"Error in extract_property_data: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'code': 'SERVER_ERROR'
        }), 500


@scraping_bp.route('/scraping/extract-pdf', methods=['POST'])
def extract_from_pdf():
    """
    Extract property data from uploaded PDF file.

    Request:
        Multipart form data with 'file' field containing PDF

    Returns:
        JSON response with extracted property data and import metadata
    """
    try:
        # Check if file is present
        if 'file' not in request.files:
            return jsonify({
                'success': False,
                'error': 'No file provided',
                'code': 'INVALID_INPUT'
            }), 400

        file = request.files['file']

        # Check if filename is empty
        if file.filename == '':
            return jsonify({
                'success': False,
                'error': 'No file selected',
                'code': 'INVALID_INPUT'
            }), 400

        # Check file extension
        if not file.filename.lower().endswith('.pdf'):
            return jsonify({
                'success': False,
                'error': 'File must be a PDF',
                'code': 'INVALID_FILE_TYPE'
            }), 400

        # Save file to temporary location
        filename = secure_filename(file.filename)
        temp_dir = tempfile.mkdtemp()
        temp_path = os.path.join(temp_dir, filename)

        try:
            file.save(temp_path)

            # Extract property data from PDF
            pdf_service = get_pdf_service()
            result = pdf_service.extract_from_pdf(temp_path)

            # Save import record to database
            import_record = PropertyImportModel(
                source_url=f'pdf_upload:{filename}',
                source_platform='pdf_upload',
                import_status=result.status,
                import_method=result.method,
                error_type=result.error_type,
                error_message=result.error_message,
                confidence_score=result.confidence_score,
                user_assisted=False
            )

            # Save extracted data as JSON
            if result.extracted_data:
                import_record.extracted_data = json.dumps(result.extracted_data.to_dict())

                # Also save individual fields for easy querying
                import_record.property_address = result.extracted_data.address
                import_record.city = result.extracted_data.city
                import_record.state = result.extracted_data.state
                import_record.zipcode = result.extracted_data.zipcode
                import_record.latitude = result.extracted_data.latitude
                import_record.longitude = result.extracted_data.longitude
                import_record.price = result.extracted_data.asking_price
                import_record.square_footage = result.extracted_data.building_size_sf
                import_record.units = result.extracted_data.num_units
                import_record.bedrooms = result.extracted_data.bedrooms
                import_record.bathrooms = result.extracted_data.bathrooms
                import_record.year_built = result.extracted_data.year_built
                import_record.property_type = result.extracted_data.property_type
                import_record.noi = result.extracted_data.noi
                import_record.cap_rate = result.extracted_data.cap_rate
                import_record.gross_income = result.extracted_data.gross_income

            # Commit to database
            db.session.add(import_record)
            db.session.commit()

            # Clean up temp file
            try:
                os.remove(temp_path)
                os.rmdir(temp_dir)
            except:
                pass  # Ignore cleanup errors

            # Return result
            if result.status == 'failed':
                return jsonify({
                    'success': False,
                    'error': result.error_message or 'Failed to extract property data from PDF',
                    'code': 'EXTRACTION_FAILED',
                    'details': {
                        'importId': import_record.id,
                        'status': result.status,
                        'errorType': result.error_type,
                        'errorMessage': result.error_message,
                        'suggestedAction': result.suggested_action
                    }
                }), 400

            response_data = result.to_dict()
            response_data['importId'] = import_record.id

            return jsonify({
                'success': True,
                'data': response_data
            }), 200

        finally:
            # Ensure cleanup even if an error occurs
            try:
                if os.path.exists(temp_path):
                    os.remove(temp_path)
                if os.path.exists(temp_dir):
                    os.rmdir(temp_dir)
            except:
                pass

    except Exception as e:
        print(f"Error in extract_from_pdf: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'code': 'SERVER_ERROR'
        }), 500


@scraping_bp.route('/scraping/imports/<int:import_id>', methods=['GET'])
def get_import(import_id):
    """
    Get a property import by ID.

    Path Parameters:
        import_id: ID of the import to retrieve

    Returns:
        JSON response with import data
    """
    try:
        import_record = PropertyImportModel.query.get(import_id)

        if not import_record:
            return jsonify({
                'success': False,
                'error': 'Import not found',
                'code': 'NOT_FOUND'
            }), 404

        # Parse JSON fields
        import_dict = import_record.to_dict()
        if import_record.extracted_data:
            try:
                import_dict['extractedData'] = json.loads(import_record.extracted_data)
            except:
                pass

        if import_record.enrichment_data:
            try:
                import_dict['enrichmentData'] = json.loads(import_record.enrichment_data)
            except:
                pass

        return jsonify({
            'success': True,
            'data': import_dict
        }), 200

    except Exception as e:
        print(f"Error in get_import: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'code': 'SERVER_ERROR'
        }), 500


@scraping_bp.route('/scraping/imports', methods=['GET'])
def list_imports():
    """
    List recent property imports with optional filters.

    Query Parameters:
        limit (optional): Maximum number of imports to return (default 20, max 100)
        status (optional): Filter by status ('success', 'partial', 'failed')
        dealId (optional): Filter by associated deal ID

    Returns:
        JSON response with imports array
    """
    try:
        limit = min(request.args.get('limit', 20, type=int), 100)
        status = request.args.get('status')
        deal_id = request.args.get('dealId', type=int)

        # Build query
        query = PropertyImportModel.query

        if status:
            query = query.filter_by(import_status=status)

        if deal_id:
            query = query.filter_by(deal_id=deal_id)

        # Order by most recent first
        query = query.order_by(PropertyImportModel.created_at.desc())

        # Apply limit
        imports = query.limit(limit).all()

        # Convert to dictionaries
        imports_data = []
        for import_record in imports:
            import_dict = import_record.to_dict()

            # Parse JSON fields
            if import_record.extracted_data:
                try:
                    import_dict['extractedData'] = json.loads(import_record.extracted_data)
                except:
                    pass

            if import_record.enrichment_data:
                try:
                    import_dict['enrichmentData'] = json.loads(import_record.enrichment_data)
                except:
                    pass

            imports_data.append(import_dict)

        return jsonify({
            'success': True,
            'data': {
                'imports': imports_data,
                'total': len(imports_data)
            }
        }), 200

    except Exception as e:
        print(f"Error in list_imports: {str(e)}")
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'code': 'SERVER_ERROR'
        }), 500


@scraping_bp.route('/scraping/imports/<int:import_id>', methods=['PATCH'])
def update_import(import_id):
    """
    Update a property import (e.g., link to deal, mark as user-assisted).

    Path Parameters:
        import_id: ID of the import to update

    Request Body:
        {
            "dealId": 123,  // optional
            "userAssisted": true  // optional
        }

    Returns:
        JSON response with updated import data
    """
    try:
        import_record = PropertyImportModel.query.get(import_id)

        if not import_record:
            return jsonify({
                'success': False,
                'error': 'Import not found',
                'code': 'NOT_FOUND'
            }), 404

        data = request.get_json()
        if not data:
            return jsonify({
                'success': False,
                'error': 'Request body is required',
                'code': 'INVALID_INPUT'
            }), 400

        # Update fields
        if 'dealId' in data:
            import_record.deal_id = data['dealId']

        if 'userAssisted' in data:
            import_record.user_assisted = data['userAssisted']

        # Commit changes
        db.session.commit()

        return jsonify({
            'success': True,
            'data': import_record.to_dict()
        }), 200

    except Exception as e:
        print(f"Error in update_import: {str(e)}")
        db.session.rollback()
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'code': 'SERVER_ERROR'
        }), 500


# Error handlers
@scraping_bp.errorhandler(404)
def not_found(error):
    """Handle 404 errors."""
    return jsonify({
        'success': False,
        'error': 'Resource not found',
        'code': 'NOT_FOUND'
    }), 404


@scraping_bp.errorhandler(500)
def internal_error(error):
    """Handle 500 errors."""
    return jsonify({
        'success': False,
        'error': 'Internal server error',
        'code': 'SERVER_ERROR'
    }), 500
