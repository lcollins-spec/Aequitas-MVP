"""
Property scraping API routes
Provides REST endpoints for extracting property data from listing URLs and PDFs
"""
import base64
import json
import os
import re
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


@scraping_bp.route('/scraping/extract-om', methods=['POST'])
def extract_om():
    """
    Extract Offering Memorandum data from uploaded PDF using Claude's native document API.
    Extracts: property name, address, unit count, unit mix, and asking rents by unit type.
    Does not use any PDF parsing library — sends PDF directly to Claude as a base64 document block.
    """
    try:
        if 'file' not in request.files:
            return jsonify({'success': False, 'error': 'No file provided', 'code': 'INVALID_INPUT'}), 400

        file = request.files['file']

        if file.filename == '':
            return jsonify({'success': False, 'error': 'No file selected', 'code': 'INVALID_INPUT'}), 400

        if not file.filename.lower().endswith('.pdf'):
            return jsonify({'success': False, 'error': 'File must be a PDF', 'code': 'INVALID_FILE_TYPE'}), 400

        api_key = os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            return jsonify({'success': False, 'error': 'ANTHROPIC_API_KEY not configured', 'code': 'SERVICE_UNAVAILABLE'}), 503

        try:
            from anthropic import Anthropic
        except ImportError:
            return jsonify({'success': False, 'error': 'Anthropic SDK not available', 'code': 'SERVICE_UNAVAILABLE'}), 503

        pdf_bytes = file.read()
        pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')

        client = Anthropic(api_key=api_key)
        message = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=4096,
            messages=[{
                'role': 'user',
                'content': [
                    {
                        'type': 'document',
                        'source': {
                            'type': 'base64',
                            'media_type': 'application/pdf',
                            'data': pdf_base64
                        }
                    },
                    {
                        'type': 'text',
                        'text': (
                            'Respond with raw JSON only. No markdown, no backticks, no explanation, no preamble. '
                            'Your entire response must be valid JSON starting with { and ending with }.\n\n'
                            'This is a multifamily real estate Offering Memorandum (OM). '
                            'Extract the following fields and return ONLY a valid JSON object with no extra text or markdown.\n\n'
                            'UNIT MIX RULES:\n'
                            '- Count units from the individual rent roll rows, NOT from summary tables.\n'
                            '- "count" = total units of that type including vacant (VACANT, V, empty rent) rows.\n'
                            '- "askingRent" = average monthly rent using ONLY occupied (non-vacant) rows for that type.\n'
                            '- Use unitType labels like: "Studio", "1BR/1BA", "2BR/1BA", "2BR/2BA", "3BR/2BA".\n'
                            '- Each entry in unitMix must represent ONE bedroom type.\n\n'
                            'OPERATING EXPENSES RULES:\n'
                            '- Pull annual totals from the operating expense summary table.\n'
                            '- If only a monthly figure is shown, multiply by 12 for annual.\n'
                            '- managementFeePct: express as a decimal between 0 and 1 (e.g., 0.06 for 6%).\n\n'
                            'RENT STABILIZATION RULES:\n'
                            '- Set rentStabilized to true if the document mentions rent stabilization, rent control, COLA caps, or CPI-linked rent increases.\n'
                            '- annualRentGrowthCap: the maximum allowed annual rent increase as a decimal (e.g., 0.022 for 2.2%).\n\n'
                            'Return this exact JSON structure (use null for any field not found):\n'
                            '{\n'
                            '  "propertyName": "string or null",\n'
                            '  "address": "full street address or null",\n'
                            '  "city": "string or null",\n'
                            '  "state": "2-letter state code or null",\n'
                            '  "zipcode": "string or null",\n'
                            '  "numUnits": integer or null,\n'
                            '  "askingPrice": number or null,\n'
                            '  "unitMix": [\n'
                            '    {"unitType": "e.g. 1BR/1BA", "count": integer, "sqft": integer or null, "askingRent": number or null}\n'
                            '  ],\n'
                            '  "laundryIncome": "annual laundry/vending/other income as number or null",\n'
                            '  "operatingExpenses": {\n'
                            '    "utilitiesAnnual": "number or null",\n'
                            '    "insuranceAnnual": "number or null",\n'
                            '    "propertyTaxAnnual": "number or null",\n'
                            '    "repairsMaintenanceAnnual": "number or null",\n'
                            '    "managementFeePct": "decimal 0.0-1.0 or null"\n'
                            '  },\n'
                            '  "rentStabilized": "boolean or null",\n'
                            '  "annualRentGrowthCap": "decimal 0.0-1.0 or null"\n'
                            '}'
                        )
                    }
                ]
            }]
        )

        print(f'[extract-om] stop_reason={message.stop_reason}, content blocks={len(message.content)}', flush=True)
        for i, block in enumerate(message.content):
            block_type = getattr(block, 'type', type(block).__name__)
            block_text = getattr(block, 'text', None)
            print(f'[extract-om] block[{i}] type={block_type} text_len={len(block_text) if block_text else "N/A"} preview={repr((block_text or "")[:200])}', flush=True)

        response_text = ''
        for block in message.content:
            if hasattr(block, 'text') and block.text:
                response_text = block.text.strip()
                break

        if not response_text:
            print(f'[extract-om] no text content in response', flush=True)
            return jsonify({'success': False, 'error': 'Claude returned an empty response', 'code': 'PARSE_ERROR'}), 500

        # Strip markdown fences if present
        if '```' in response_text:
            response_text = re.sub(r'^```json\s*', '', response_text)
            response_text = re.sub(r'^```\s*', '', response_text)
            response_text = re.sub(r'```$', '', response_text)
            response_text = response_text.strip()

        # Extract JSON object even if Claude prepended chain-of-thought text
        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if not json_match:
            print(f'[extract-om] no JSON object found in response: {repr(response_text[:300])}', flush=True)
            return jsonify({'success': False, 'error': 'No JSON object found in Claude response', 'code': 'PARSE_ERROR'}), 500
        response_text = json_match.group(0)

        print(f'[extract-om] parsing JSON ({len(response_text)} chars): {repr(response_text[:300])}', flush=True)
        data = json.loads(response_text)
        print(f'[extract-om] extracted payload: {json.dumps(data, indent=2)}', flush=True)
        return jsonify({'success': True, 'data': data}), 200

    except json.JSONDecodeError as e:
        print(f'OM extraction JSON parse error: {str(e)}', flush=True)
        print(f'RAW CLAUDE RESPONSE: {repr(response_text)}', flush=True)
        try:
            with open('/tmp/claude_om_response.txt', 'w') as f:
                f.write(response_text)
            print('[extract-om] raw response written to /tmp/claude_om_response.txt', flush=True)
        except Exception:
            pass
        return jsonify({'success': False, 'error': f'Failed to parse Claude response as JSON: {str(e)}', 'code': 'PARSE_ERROR'}), 500
    except Exception as e:
        error_msg = str(e)
        print(f'Error in extract_om: {error_msg}', flush=True)
        # Surface Anthropic API errors (billing, rate limits, etc.) directly
        if 'credit balance is too low' in error_msg or 'billing' in error_msg.lower():
            return jsonify({'success': False, 'error': 'Anthropic API credits exhausted. Please add credits at console.anthropic.com/settings/billing.', 'code': 'BILLING_ERROR'}), 503
        if 'rate_limit' in error_msg.lower() or 'rate limit' in error_msg.lower():
            return jsonify({'success': False, 'error': 'Anthropic API rate limit reached. Please try again in a moment.', 'code': 'RATE_LIMIT'}), 429
        if 'invalid_api_key' in error_msg or 'authentication' in error_msg.lower():
            return jsonify({'success': False, 'error': 'Anthropic API key is invalid.', 'code': 'AUTH_ERROR'}), 503
        return jsonify({'success': False, 'error': 'Internal server error', 'code': 'SERVER_ERROR'}), 500


@scraping_bp.route('/scraping/debug-om', methods=['POST'])
def debug_om():
    """
    Debug route: same as /extract-om but returns the raw Claude response as plain text.
    Remove this route once the JSON parsing issue is resolved.
    """
    if 'file' not in request.files:
        return 'No file provided', 400

    file = request.files['file']
    if not file.filename.lower().endswith('.pdf'):
        return 'File must be a PDF', 400

    api_key = os.getenv('ANTHROPIC_API_KEY')
    if not api_key:
        return 'ANTHROPIC_API_KEY not configured', 503

    try:
        from anthropic import Anthropic
    except ImportError:
        return 'Anthropic SDK not available', 503

    pdf_bytes = file.read()
    pdf_base64 = base64.b64encode(pdf_bytes).decode('utf-8')

    client = Anthropic(api_key=api_key)
    message = client.messages.create(
        model='claude-sonnet-4-6',
        max_tokens=4096,
        messages=[{
            'role': 'user',
            'content': [
                {
                    'type': 'document',
                    'source': {
                        'type': 'base64',
                        'media_type': 'application/pdf',
                        'data': pdf_base64
                    }
                },
                {
                    'type': 'text',
                    'text': (
                        'Respond with raw JSON only. No markdown, no backticks, no explanation, no preamble. '
                        'Your entire response must be valid JSON starting with { and ending with }.\n\n'
                        'This is a multifamily real estate Offering Memorandum (OM). '
                        'Extract the following fields and return ONLY a valid JSON object with no extra text or markdown.\n\n'
                        'UNIT MIX RULES:\n'
                        '- Count units from the individual rent roll rows, NOT from summary tables.\n'
                        '- Exclude any rows marked as VACANT, vacant, or empty/V from counts.\n'
                        '- Group occupied units by bedroom type and calculate the average monthly asking/market rent for each type.\n'
                        '- Use unitType labels like: "Studio", "1BR/1BA", "2BR/1BA", "2BR/2BA", "3BR/2BA".\n'
                        '- Each entry in unitMix must represent ONE bedroom type with the total occupied count and average rent.\n\n'
                        'OPERATING EXPENSES RULES:\n'
                        '- Pull annual totals from the operating expense summary table.\n'
                        '- If only a monthly figure is shown, multiply by 12 for annual.\n'
                        '- managementFeePct: express as a decimal between 0 and 1 (e.g., 0.06 for 6%).\n\n'
                        'RENT STABILIZATION RULES:\n'
                        '- Set rentStabilized to true if the document mentions rent stabilization, rent control, COLA caps, or CPI-linked rent increases.\n'
                        '- annualRentGrowthCap: the maximum allowed annual rent increase as a decimal (e.g., 0.022 for 2.2%).\n\n'
                        'Return this exact JSON structure (use null for any field not found):\n'
                        '{\n'
                        '  "propertyName": "string or null",\n'
                        '  "address": "full street address or null",\n'
                        '  "city": "string or null",\n'
                        '  "state": "2-letter state code or null",\n'
                        '  "zipcode": "string or null",\n'
                        '  "numUnits": integer or null,\n'
                        '  "askingPrice": number or null,\n'
                        '  "unitMix": [\n'
                        '    {"unitType": "e.g. 1BR/1BA", "count": integer, "sqft": integer or null, "askingRent": number or null}\n'
                        '  ],\n'
                        '  "laundryIncome": "annual laundry/vending/other income as number or null",\n'
                        '  "operatingExpenses": {\n'
                        '    "utilitiesAnnual": "number or null",\n'
                        '    "insuranceAnnual": "number or null",\n'
                        '    "propertyTaxAnnual": "number or null",\n'
                        '    "repairsMaintenanceAnnual": "number or null",\n'
                        '    "managementFeePct": "decimal 0.0-1.0 or null"\n'
                        '  },\n'
                        '  "rentStabilized": "boolean or null",\n'
                        '  "annualRentGrowthCap": "decimal 0.0-1.0 or null"\n'
                        '}'
                    )
                }
            ]
        }]
    )

    raw_text = ''
    for block in message.content:
        if hasattr(block, 'text') and block.text:
            raw_text = block.text
            break

    with open('/tmp/claude_om_response.txt', 'w') as f:
        f.write(raw_text)

    return raw_text, 200, {'Content-Type': 'text/plain; charset=utf-8'}


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
