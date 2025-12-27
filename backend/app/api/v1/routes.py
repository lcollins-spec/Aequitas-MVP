from flask import Blueprint, jsonify, request, current_app
import os
import json
from datetime import datetime

from pathlib import Path
from app.services.census_service import CensusService
from app.services.fred_service import FREDService

api_v1 = Blueprint('api_v1', __name__)

# Initialize Census service (will be created on first request)
_census_service = None

# Initialize FRED service (will be created on first request)
_fred_service = None


def get_census_service():
    """Get or create Census service instance."""
    global _census_service
    if _census_service is None:
        _census_service = CensusService(
            api_key=current_app.config.get('CENSUS_API_KEY', ''),
            base_url=current_app.config.get('CENSUS_API_BASE_URL', 'https://api.census.gov/data'),
            api_year=current_app.config.get('CENSUS_API_YEAR', '2022'),
            cache_ttl=current_app.config.get('CENSUS_CACHE_TTL', 86400)
        )
    return _census_service


def get_fred_service():
    """Get or create FRED service instance."""
    global _fred_service
    if _fred_service is None:
        _fred_service = FREDService(
            api_key=current_app.config.get('FRED_API_KEY', ''),
            base_url=current_app.config.get('FRED_API_BASE_URL', 'https://api.stlouisfed.org/fred'),
            cache_ttl=current_app.config.get('FRED_CACHE_TTL', 3600)
        )
    return _fred_service

@api_v1.route('/ping', methods=['GET'])
def ping():
    return jsonify({'pong': True})

@api_v1.route('/echo', methods=['POST'])
def echo():
    payload = request.get_json(silent=True) or {}
    return jsonify({'received': payload}), 201

@api_v1.route('/status', methods=['GET'])
def status():
    return jsonify({'service': 'PE-Aequitas API', 'version': 'v1'})


@api_v1.route('/metrics', methods=['GET'])
def metrics():
    """Return simple metrics for the frontend dashboard.

    Reads values from `Web_scraping/available_properties.json` and 
    `Web_scraping/potential_properties.json`. Otherwise returns reasonable defaults.
    """
    repo_root = Path(__file__).resolve().parents[4]
    available_path = repo_root / 'Web_scraping' / 'available_properties.json'
    potential_path = repo_root / 'Web_scraping' / 'potential_properties.json'

    defaults = {
        'total_affordable_units': 12847,
        'families_housed': 28903
    }

    try:
        total_units = defaults['total_affordable_units']
        families = defaults['families_housed']

        # Try to read available_properties for unit count
        if available_path.exists():
            with open(available_path, 'r', encoding='utf-8') as f:
                available_data = json.load(f)
                props = available_data.get('properties', [])
                # If there's a totalUnits in the first property or metadata, use it
                if props and 'totalUnits' in props[0]:
                    try:
                        total_units = int(props[0]['totalUnits'])
                    except Exception:
                        pass

        # Try to read potential_properties for additional context if needed
        if potential_path.exists():
            with open(potential_path, 'r', encoding='utf-8') as f:
                potential_data = json.load(f)
                # Optionally derive additional metrics from potential_data

        return jsonify({
            'total_affordable_units': total_units,
            'families_housed': families,
        })
    except Exception:
            return jsonify(defaults)

    return jsonify(defaults)


@api_v1.route('/demographics/<zipcode>', methods=['GET'])
def get_demographics(zipcode):
    """
    Get comprehensive demographic data for a ZIP code.

    Args:
        zipcode: 5-digit ZIP code

    Returns:
        JSON response with demographic data or error
    """
    try:
        census_service = get_census_service()
        demographic_data = census_service.get_demographics_by_zipcode(zipcode)

        if demographic_data is None:
            return jsonify({
                'success': False,
                'error': f'No demographic data available for ZIP code {zipcode}',
                'code': 'NO_DATA'
            }), 404

        return jsonify({
            'success': True,
            'data': demographic_data.to_dict(),
            'cached': False
        })

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'code': 'INVALID_INPUT'
        }), 400

    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'code': 'SERVER_ERROR'
        }), 500


@api_v1.route('/demographics/batch', methods=['POST'])
def get_demographics_batch():
    """
    Get demographics for multiple ZIP codes in one request.

    Request body:
        {
            "zipcodes": ["95814", "95819", ...]
        }

    Returns:
        JSON response with demographic data for all ZIP codes
    """
    try:
        data = request.get_json()
        if not data or 'zipcodes' not in data:
            return jsonify({
                'success': False,
                'error': 'Missing "zipcodes" in request body',
                'code': 'INVALID_INPUT'
            }), 400

        zipcodes = data['zipcodes']

        if not isinstance(zipcodes, list):
            return jsonify({
                'success': False,
                'error': '"zipcodes" must be an array',
                'code': 'INVALID_INPUT'
            }), 400

        if len(zipcodes) > 50:
            return jsonify({
                'success': False,
                'error': 'Maximum 50 ZIP codes per request',
                'code': 'TOO_MANY_REQUESTS'
            }), 400

        census_service = get_census_service()
        results = {}
        errors = {}

        for zipcode in zipcodes:
            try:
                demographic_data = census_service.get_demographics_by_zipcode(str(zipcode))
                if demographic_data:
                    results[zipcode] = demographic_data.to_dict()
                else:
                    errors[zipcode] = 'No data available'
            except Exception as e:
                errors[zipcode] = str(e)

        return jsonify({
            'success': True,
            'data': results,
            'errors': errors if errors else None
        })

    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'code': 'SERVER_ERROR'
        }), 500


@api_v1.route('/ami-calculator', methods=['POST'])
def calculate_ami():
    """
    Calculate AMI-based rent limits for a property.

    Request body:
        {
            "zipcode": "95814",
            "ami_percent": 60,
            "bedrooms": 2
        }

    Returns:
        JSON response with AMI calculations
    """
    try:
        data = request.get_json()

        if not data:
            return jsonify({
                'success': False,
                'error': 'Missing request body',
                'code': 'INVALID_INPUT'
            }), 400

        zipcode = data.get('zipcode')
        ami_percent = data.get('ami_percent', 60)
        bedrooms = data.get('bedrooms', 2)

        if not zipcode:
            return jsonify({
                'success': False,
                'error': 'Missing required field: zipcode',
                'code': 'INVALID_INPUT'
            }), 400

        if ami_percent not in [30, 50, 60, 80]:
            return jsonify({
                'success': False,
                'error': 'ami_percent must be 30, 50, 60, or 80',
                'code': 'INVALID_INPUT'
            }), 400

        census_service = get_census_service()
        result = census_service.calculate_ami_rent_limit(
            zipcode=str(zipcode),
            ami_percent=ami_percent,
            bedrooms=bedrooms
        )

        if result is None:
            return jsonify({
                'success': False,
                'error': f'Unable to calculate AMI for ZIP code {zipcode}',
                'code': 'NO_DATA'
            }), 404

        return jsonify({
            'success': True,
            'data': result
        })

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'code': 'INVALID_INPUT'
        }), 400

    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'code': 'SERVER_ERROR'
        }), 500


# ==================== FRED API Routes ====================

@api_v1.route('/fred/macro', methods=['GET'])
def get_fred_macro():
    """
    Get complete macroeconomic snapshot.

    Returns:
        JSON response with all FRED data categories
    """
    try:
        fred_service = get_fred_service()
        macro_data = fred_service.get_macroeconomic_snapshot()

        if macro_data is None:
            return jsonify({
                'success': False,
                'error': 'Unable to fetch macroeconomic data',
                'code': 'NO_DATA'
            }), 404

        return jsonify({
            'success': True,
            'data': macro_data.to_dict()
        })

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'code': 'CONFIGURATION_ERROR'
        }), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'code': 'SERVER_ERROR'
        }), 500


@api_v1.route('/fred/rates', methods=['GET'])
def get_fred_rates():
    """
    Get current interest rates.

    Returns:
        JSON response with interest rate data
    """
    try:
        fred_service = get_fred_service()
        rates_data = fred_service.get_interest_rates()

        if rates_data is None:
            return jsonify({
                'success': False,
                'error': 'Unable to fetch interest rates',
                'code': 'NO_DATA'
            }), 404

        return jsonify({
            'success': True,
            'data': rates_data.to_dict(),
            'lastUpdated': datetime.now().isoformat()
        })

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'code': 'CONFIGURATION_ERROR'
        }), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'code': 'SERVER_ERROR'
        }), 500


@api_v1.route('/fred/inflation', methods=['GET'])
def get_fred_inflation():
    """
    Get inflation metrics.

    Returns:
        JSON response with inflation data
    """
    try:
        fred_service = get_fred_service()
        inflation_data = fred_service.get_inflation_data()

        if inflation_data is None:
            return jsonify({
                'success': False,
                'error': 'Unable to fetch inflation data',
                'code': 'NO_DATA'
            }), 404

        return jsonify({
            'success': True,
            'data': inflation_data.to_dict(),
            'lastUpdated': datetime.now().isoformat()
        })

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'code': 'CONFIGURATION_ERROR'
        }), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'code': 'SERVER_ERROR'
        }), 500


@api_v1.route('/fred/housing-market', methods=['GET'])
def get_fred_housing_market():
    """
    Get housing market indicators.

    Returns:
        JSON response with housing market data
    """
    try:
        fred_service = get_fred_service()
        housing_data = fred_service.get_housing_market_data()

        if housing_data is None:
            return jsonify({
                'success': False,
                'error': 'Unable to fetch housing market data',
                'code': 'NO_DATA'
            }), 404

        return jsonify({
            'success': True,
            'data': housing_data.to_dict(),
            'lastUpdated': datetime.now().isoformat()
        })

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'code': 'CONFIGURATION_ERROR'
        }), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'code': 'SERVER_ERROR'
        }), 500


@api_v1.route('/fred/economic-indicators', methods=['GET'])
def get_fred_economic_indicators():
    """
    Get economic indicators.

    Returns:
        JSON response with economic indicators data
    """
    try:
        fred_service = get_fred_service()
        indicators_data = fred_service.get_economic_indicators()

        if indicators_data is None:
            return jsonify({
                'success': False,
                'error': 'Unable to fetch economic indicators',
                'code': 'NO_DATA'
            }), 404

        return jsonify({
            'success': True,
            'data': indicators_data.to_dict(),
            'lastUpdated': datetime.now().isoformat()
        })

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'code': 'CONFIGURATION_ERROR'
        }), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'code': 'SERVER_ERROR'
        }), 500


@api_v1.route('/fred/mortgage-rates', methods=['GET'])
def get_fred_mortgage_rates():
    """
    Get historical mortgage rate trends.

    Query Parameters:
        months: Number of months of history (1-60, default 12)

    Returns:
        JSON response with mortgage rate time series
    """
    try:
        # Validate months parameter
        months = request.args.get('months', 12, type=int)
        if months < 1 or months > 60:
            return jsonify({
                'success': False,
                'error': 'months parameter must be between 1 and 60',
                'code': 'INVALID_INPUT'
            }), 400

        fred_service = get_fred_service()

        # Calculate approximate number of observations needed (weekly data)
        limit = months * 5  # Roughly 4-5 weeks per month

        time_series = fred_service.get_time_series('MORTGAGE30US', limit=limit)

        if time_series is None:
            return jsonify({
                'success': False,
                'error': 'Unable to fetch mortgage rate history',
                'code': 'NO_DATA'
            }), 404

        return jsonify({
            'success': True,
            'data': [point.to_dict() for point in time_series],
            'months': months
        })

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'code': 'INVALID_INPUT'
        }), 400

    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'code': 'SERVER_ERROR'
        }), 500


@api_v1.route('/fred/series/<series_id>', methods=['GET'])
def get_fred_series(series_id):
    """
    Get time series data for any FRED series.

    Path Parameters:
        series_id: FRED series identifier (e.g., 'FEDFUNDS')

    Query Parameters:
        start_date: Start date in YYYY-MM-DD format (optional)
        end_date: End date in YYYY-MM-DD format (optional)
        limit: Maximum number of observations (1-1000, default 100)

    Returns:
        JSON response with time series data
    """
    try:
        # Get query parameters
        start_date = request.args.get('start_date', None)
        end_date = request.args.get('end_date', None)
        limit = request.args.get('limit', 100, type=int)

        # Validate limit
        if limit < 1 or limit > 1000:
            return jsonify({
                'success': False,
                'error': 'limit parameter must be between 1 and 1000',
                'code': 'INVALID_INPUT'
            }), 400

        fred_service = get_fred_service()
        time_series = fred_service.get_time_series(
            series_id=series_id,
            start_date=start_date,
            end_date=end_date,
            limit=limit
        )

        if time_series is None:
            return jsonify({
                'success': False,
                'error': f'Unable to fetch data for series {series_id}',
                'code': 'NO_DATA'
            }), 404

        return jsonify({
            'success': True,
            'seriesId': series_id,
            'data': [point.to_dict() for point in time_series],
            'count': len(time_series)
        })

    except ValueError as e:
        return jsonify({
            'success': False,
            'error': str(e),
            'code': 'INVALID_INPUT'
        }), 400

    except Exception as e:
        return jsonify({
            'success': False,
            'error': 'Internal server error',
            'code': 'SERVER_ERROR'
        }), 500
