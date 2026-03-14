"""
Risk Assessment API Routes
Provides REST endpoints for risk assessment and deal memo generation
"""

import json
import os
import re
from flask import Blueprint, jsonify, request
from app.services.deal_service import DealService
from app.services.deal_memo_service import DealMemoService
from app.services.rent_tier_service import RentTierService
from app.database import db, RiskBenchmarkData, MarketDecileThresholds

# Create blueprint
risk_assessment_bp = Blueprint('risk_assessment', __name__)


@risk_assessment_bp.route('/deals/<int:deal_id>/risk-assessment', methods=['POST'])
def calculate_risk_assessment(deal_id):
    """
    Calculate comprehensive risk assessment for a deal

    POST /api/v1/deals/<deal_id>/risk-assessment

    Query Parameters:
        - holding_period: Investment horizon in years (default: 10)
        - geography: Geographic market for benchmarks (default: 'US')
        - save_to_db: Whether to save results to database (default: true)

    Returns:
        200: Risk assessment calculated successfully
        400: Invalid request parameters
        404: Deal not found
        500: Calculation error
    """
    try:
        # Get query parameters
        holding_period = request.args.get('holding_period', 10, type=int)
        geography = request.args.get('geography', 'US', type=str)
        save_to_db = request.args.get('save_to_db', 'true', type=str).lower() == 'true'

        # Validate parameters
        if holding_period < 1 or holding_period > 30:
            return jsonify({
                'error': 'Invalid holding_period. Must be between 1 and 30 years'
            }), 400

        # Calculate risk assessment
        assessment = DealService.calculate_risk_assessment(
            deal_id=deal_id,
            holding_period=holding_period,
            geography=geography,
            save_to_db=save_to_db
        )

        return jsonify({
            'success': True,
            'deal_id': deal_id,
            'data': assessment
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404 if 'not found' in str(e).lower() else 400

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Calculation error: {str(e)}'
        }), 500


@risk_assessment_bp.route('/deals/<int:deal_id>/risk-assessment', methods=['GET'])
def get_risk_assessment(deal_id):
    """
    Get latest risk assessment for a deal

    GET /api/v1/deals/<deal_id>/risk-assessment

    Returns:
        200: Risk assessment retrieved successfully
        404: Deal or assessment not found
    """
    try:
        assessment = DealService.get_risk_assessment(deal_id)

        if not assessment:
            return jsonify({
                'success': False,
                'error': f'No risk assessment found for deal {deal_id}'
            }), 404

        return jsonify({
            'success': True,
            'deal_id': deal_id,
            'data': assessment
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@risk_assessment_bp.route('/deals/<int:deal_id>/deal-memo', methods=['GET'])
def get_deal_memo(deal_id):
    """
    Generate comprehensive investment analysis memo

    GET /api/v1/deals/<deal_id>/deal-memo

    Query Parameters:
        - holding_period: Investment horizon in years (default: 10)
        - geography: Geographic market for benchmarks (default: 'US')

    Returns:
        200: Deal memo generated successfully
        404: Deal not found
        500: Generation error
    """
    try:
        # Get query parameters
        holding_period = request.args.get('holding_period', 10, type=int)
        geography = request.args.get('geography', 'US', type=str)

        # Generate memo
        memo = DealMemoService.generate_memo(
            deal_id=deal_id,
            holding_period=holding_period,
            geography=geography
        )

        return jsonify({
            'success': True,
            'deal_id': deal_id,
            'data': memo
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 404

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Memo generation error: {str(e)}'
        }), 500


@risk_assessment_bp.route('/deals/compare', methods=['POST'])
def compare_deals():
    """
    Generate side-by-side comparison of multiple deals

    POST /api/v1/deals/compare

    Request Body:
        {
            "deal_ids": [1, 2, 3],
            "holding_period": 10  // optional, default: 10
        }

    Returns:
        200: Comparison generated successfully
        400: Invalid request body
        500: Generation error
    """
    try:
        data = request.get_json()

        if not data or 'deal_ids' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing deal_ids in request body'
            }), 400

        deal_ids = data['deal_ids']
        holding_period = data.get('holding_period', 10)

        if not isinstance(deal_ids, list) or len(deal_ids) < 2:
            return jsonify({
                'success': False,
                'error': 'deal_ids must be a list of at least 2 deal IDs'
            }), 400

        if len(deal_ids) > 5:
            return jsonify({
                'success': False,
                'error': 'Maximum 5 deals can be compared at once'
            }), 400

        # Generate comparison
        comparison = DealMemoService.generate_comparison_memo(
            deal_ids=deal_ids,
            holding_period=holding_period
        )

        return jsonify({
            'success': True,
            'data': comparison
        }), 200

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 400

    except Exception as e:
        return jsonify({
            'success': False,
            'error': f'Comparison error: {str(e)}'
        }), 500


@risk_assessment_bp.route('/benchmarks/decile/<int:decile>', methods=['GET'])
def get_benchmark_data(decile):
    """
    Get benchmark return data for a specific rent decile

    GET /api/v1/benchmarks/decile/<decile>

    Query Parameters:
        - geography: Geographic market (default: 'US')

    Returns:
        200: Benchmark data retrieved successfully
        400: Invalid decile
        404: Benchmark data not found
    """
    try:
        if decile < 1 or decile > 10:
            return jsonify({
                'success': False,
                'error': 'Decile must be between 1 and 10'
            }), 400

        geography = request.args.get('geography', 'US', type=str)

        # Fetch benchmark data
        benchmark = RiskBenchmarkData.query.filter_by(
            rent_decile=decile,
            geography=geography
        ).first()

        if not benchmark:
            return jsonify({
                'success': False,
                'error': f'No benchmark data found for D{decile} in {geography}'
            }), 404

        return jsonify({
            'success': True,
            'decile': decile,
            'geography': geography,
            'data': benchmark.to_dict()
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@risk_assessment_bp.route('/market-thresholds', methods=['GET'])
def get_market_thresholds():
    """
    Get rent decile thresholds for a market

    GET /api/v1/market-thresholds

    Query Parameters:
        - geography: Geographic market (required, e.g., 'national', 'CA', '94110')
        - bedrooms: Number of bedrooms (optional filter)
        - year: Data year (optional, defaults to most recent)

    Returns:
        200: Thresholds retrieved successfully
        400: Missing required parameters
        404: No threshold data found
    """
    try:
        geography = request.args.get('geography', type=str)
        bedrooms = request.args.get('bedrooms', type=int)
        year = request.args.get('year', type=int)

        if not geography:
            return jsonify({
                'success': False,
                'error': 'geography parameter is required'
            }), 400

        # Get thresholds
        thresholds = RentTierService.get_decile_thresholds(
            geography=geography,
            bedrooms=bedrooms,
            year=year
        )

        if not thresholds:
            return jsonify({
                'success': False,
                'error': f'No threshold data found for geography: {geography}',
                'note': 'Using default national thresholds',
                'default_thresholds': RentTierService._get_default_national_thresholds(bedrooms)
            }), 200

        return jsonify({
            'success': True,
            'geography': geography,
            'bedrooms': bedrooms,
            'year': year,
            'thresholds': thresholds
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


@risk_assessment_bp.route('/deals/<int:deal_id>/climate-risk', methods=['POST'])
def get_climate_risk(deal_id):
    """
    Search ClimateCheck.com for climate risk scores for a deal's location.

    POST /api/v1/deals/<deal_id>/climate-risk

    Returns:
        200: { success, data: { overall, heat, flood, fire, storm, drought } }
        404: Deal not found
        503: Anthropic unavailable
    """
    try:
        deal = DealService.get_deal(deal_id)
        if not deal:
            return jsonify({'success': False, 'error': f'Deal {deal_id} not found'}), 404

        location = (deal.location or '').strip()
        if not location:
            return jsonify({'success': False, 'error': 'Deal has no location set', 'code': 'NO_LOCATION'}), 400

        api_key = os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            return jsonify({'success': False, 'error': 'ANTHROPIC_API_KEY not configured', 'code': 'SERVICE_UNAVAILABLE'}), 503

        try:
            from anthropic import Anthropic
        except ImportError:
            return jsonify({'success': False, 'error': 'Anthropic SDK not available', 'code': 'SERVICE_UNAVAILABLE'}), 503

        client = Anthropic(api_key=api_key)

        prompt = (
            f'You are a climate risk analyst. Assess the climate risk for this real estate location: "{location}".\n\n'
            f'Use web search to find current, specific risk data from these authoritative public sources:\n'
            f'- FEMA flood maps (msc.fema.gov) — search "{location} FEMA flood zone"\n'
            f'- NOAA climate data — search "{location} NOAA extreme heat days drought risk"\n'
            f'- Cal Fire / state fire agency — search "{location} wildfire risk zone" (if applicable)\n'
            f'- NOAA storm data — search "{location} hurricane tornado storm risk"\n\n'
            f'DO NOT rely on riskfactor.com or climatecheck.com — those sites require JavaScript and cannot be read.\n\n'
            f'After searching, synthesize scores on a 1-100 scale where:\n'
            f'- 1-33 = low risk\n'
            f'- 34-66 = moderate risk\n'
            f'- 67-100 = high risk\n\n'
            f'Use your knowledge of this location combined with whatever you find via search. '
            f'You MUST return a number for every field — do not return null. '
            f'Base scores on real climate characteristics of {location}: '
            f'its geography, historical weather patterns, FEMA flood zone status, proximity to fire-prone areas, etc.\n\n'
            f'Return ONLY a valid JSON object with no markdown, no backticks, no explanation. '
            f'The object must have exactly these keys: '
            f'"overall", "heat", "flood", "fire", "storm", "drought". '
            f'Each value must be an integer from 1 to 100. '
            f'Example: {{"overall": 45, "heat": 60, "flood": 20, "fire": 35, "storm": 15, "drought": 40}}'
        )

        message = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=1024,
            tools=[{
                'type': 'web_search_20250305',
                'name': 'web_search',
                'max_uses': 4
            }],
            messages=[{'role': 'user', 'content': prompt}]
        )

        # Use the last text block (final answer after tool use)
        response_text = ''
        for block in message.content:
            if hasattr(block, 'text') and block.text:
                response_text = block.text.strip()

        if not response_text:
            return jsonify({'success': False, 'error': 'No response from Claude', 'code': 'PARSE_ERROR'}), 500

        # Strip markdown fences if present
        if '```' in response_text:
            response_text = re.sub(r'```json\s*', '', response_text)
            response_text = re.sub(r'```', '', response_text)
            response_text = response_text.strip()

        json_match = re.search(r'\{.*\}', response_text, re.DOTALL)
        if not json_match:
            return jsonify({'success': False, 'error': 'No JSON object in response', 'code': 'PARSE_ERROR'}), 500

        scores = json.loads(json_match.group(0))
        return jsonify({'success': True, 'location': location, 'data': scores}), 200

    except json.JSONDecodeError as e:
        return jsonify({'success': False, 'error': f'Failed to parse response: {str(e)}', 'code': 'PARSE_ERROR'}), 500
    except Exception as e:
        error_msg = str(e)
        print(f'[climate-risk] Error: {error_msg}', flush=True)
        if 'credit balance is too low' in error_msg or 'billing' in error_msg.lower():
            return jsonify({'success': False, 'error': 'Anthropic API credits exhausted.', 'code': 'BILLING_ERROR'}), 503
        if 'rate_limit' in error_msg.lower() or 'rate limit' in error_msg.lower():
            return jsonify({'success': False, 'error': 'Rate limit reached. Please try again.', 'code': 'RATE_LIMIT'}), 429
        if 'invalid_api_key' in error_msg or 'authentication' in error_msg.lower():
            return jsonify({'success': False, 'error': 'Anthropic API key is invalid.', 'code': 'AUTH_ERROR'}), 503
        return jsonify({'success': False, 'error': 'Internal server error', 'code': 'SERVER_ERROR'}), 500


@risk_assessment_bp.route('/deals/<int:deal_id>/summary', methods=['GET'])
def get_deal_summary(deal_id):
    """
    Get deal with latest risk assessment in single response

    GET /api/v1/deals/<deal_id>/summary

    Returns:
        200: Deal and assessment retrieved successfully
        404: Deal not found
    """
    try:
        result = DealService.get_deal_with_risk_assessment(deal_id)

        if not result:
            return jsonify({
                'success': False,
                'error': f'Deal {deal_id} not found'
            }), 404

        return jsonify({
            'success': True,
            'deal_id': deal_id,
            'data': result
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500


# Error handlers
@risk_assessment_bp.errorhandler(404)
def not_found(error):
    return jsonify({
        'success': False,
        'error': 'Resource not found'
    }), 404


@risk_assessment_bp.errorhandler(500)
def internal_error(error):
    return jsonify({
        'success': False,
        'error': 'Internal server error'
    }), 500
