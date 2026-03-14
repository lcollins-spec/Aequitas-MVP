"""
Regulations API routes
Fetches real-time regulatory data for a market using Claude with web search.
"""
import json
import os
import re
import time
from flask import Blueprint, request, jsonify

regulations_bp = Blueprint('regulations', __name__)


@regulations_bp.route('/regulations/fetch', methods=['POST'])
def fetch_regulations():
    """
    Fetch regulatory information for a NOAH multifamily market using Claude + web search.

    Request Body:
        {
            "market": "Austin, TX",
            "topics": ["rent control", "LIHTC", ...]  // optional
        }

    Returns:
        JSON array of regulation items:
        [
            {
                "title": "...",
                "summary": "...",
                "status": "compliant|concerning|proposed|enacted",
                "jurisdiction": "federal|state|local",
                "type": "current|upcoming"
            },
            ...
        ]
    """
    try:
        data = request.get_json()
        if not data:
            return jsonify({'success': False, 'error': 'Request body is required', 'code': 'INVALID_INPUT'}), 400

        market = (data.get('market') or '').strip()
        if not market:
            return jsonify({'success': False, 'error': 'market is required', 'code': 'INVALID_INPUT'}), 400

        topics = data.get('topics') or []
        topics_str = ', '.join(topics) if topics else (
            'rent control, eviction moratorium, LIHTC, ADU regulations, '
            'property tax exemptions, zoning variance, landlord-tenant law'
        )

        api_key = os.getenv('ANTHROPIC_API_KEY')
        if not api_key:
            return jsonify({
                'success': False,
                'error': 'ANTHROPIC_API_KEY not configured',
                'code': 'SERVICE_UNAVAILABLE'
            }), 503

        try:
            from anthropic import Anthropic
        except ImportError:
            return jsonify({
                'success': False,
                'error': 'Anthropic SDK not available',
                'code': 'SERVICE_UNAVAILABLE'
            }), 503

        client = Anthropic(api_key=api_key)

        prompt = (
            f'You are a real estate regulatory analyst specializing in NOAH (Naturally Occurring Affordable Housing) '
            f'multifamily investments. Research the current regulatory environment in {market} for a NOAH multifamily '
            f'real estate investor. Focus specifically on these topics: {topics_str}.\n\n'
            f'Use web search to find real, current regulations and proposed changes at the federal, state, and local '
            f'level that would affect NOAH multifamily investors in {market}. Include both in-effect regulations and '
            f'upcoming/pending changes.\n\n'
            f'Return ONLY a valid JSON array. No markdown, no backticks, no explanation — just the raw JSON array '
            f'starting with [ and ending with ]. Each item must have exactly this shape:\n'
            f'{{"title": "regulation or bill name", '
            f'"summary": "concise 1-2 sentence description and investor impact", '
            f'"status": "funding|enabling|risk", '
            f'"jurisdiction": "federal|state|local", '
            f'"type": "current|upcoming"}}\n\n'
            f'Status definitions — pick exactly one:\n'
            f'- "funding" = a tax credit, grant, subsidy, or incentive program that creates a possible funding opportunity for the investor (e.g. LIHTC, property tax exemptions, density bonuses with financial benefit)\n'
            f'- "enabling" = legislation that makes development or ownership easier, expands rights, or reduces burdens (e.g. zoning reform, ADU expansion, eviction rule relaxation)\n'
            f'- "risk" = any regulation that is unfavorable, restricts rent growth, adds compliance burden, or poses financial risk to a NOAH investor (e.g. rent control, eviction moratoriums, inclusionary zoning mandates, right-to-counsel laws)\n\n'
            f'Return 8-15 items. Cover a mix of federal, state, and local; include both current and upcoming items.'
        )

        # Retry up to 3 times with exponential backoff on rate limit
        message = None
        last_error = None
        for attempt in range(3):
            try:
                message = client.messages.create(
                    model='claude-sonnet-4-6',
                    max_tokens=4096,
                    tools=[{
                        'type': 'web_search_20250305',
                        'name': 'web_search',
                        'max_uses': 3
                    }],
                    messages=[{
                        'role': 'user',
                        'content': prompt
                    }]
                )
                break
            except Exception as e:
                last_error = e
                if 'rate_limit' in str(e).lower() or 'rate limit' in str(e).lower():
                    wait = 15 * (2 ** attempt)  # 15s, 30s, 60s
                    print(f'[regulations/fetch] Rate limited, waiting {wait}s (attempt {attempt + 1}/3)', flush=True)
                    time.sleep(wait)
                else:
                    raise

        if message is None:
            raise last_error

        # Collect all text blocks; use the last one (final answer after tool use)
        response_text = ''
        for block in message.content:
            if hasattr(block, 'text') and block.text:
                response_text = block.text.strip()

        if not response_text:
            print('[regulations/fetch] No text content in Claude response', flush=True)
            return jsonify({
                'success': False,
                'error': 'Claude returned an empty response',
                'code': 'PARSE_ERROR'
            }), 500

        # Strip markdown fences if present
        if '```' in response_text:
            response_text = re.sub(r'```json\s*', '', response_text)
            response_text = re.sub(r'```', '', response_text)
            response_text = response_text.strip()

        # Extract the JSON array
        json_match = re.search(r'\[.*\]', response_text, re.DOTALL)
        if not json_match:
            print(f'[regulations/fetch] No JSON array in response: {repr(response_text[:300])}', flush=True)
            return jsonify({
                'success': False,
                'error': 'No JSON array found in Claude response',
                'code': 'PARSE_ERROR'
            }), 500

        regulations = json.loads(json_match.group(0))
        return jsonify({'success': True, 'data': regulations}), 200

    except json.JSONDecodeError as e:
        print(f'[regulations/fetch] JSON parse error: {e}', flush=True)
        return jsonify({
            'success': False,
            'error': f'Failed to parse Claude response as JSON: {str(e)}',
            'code': 'PARSE_ERROR'
        }), 500
    except Exception as e:
        error_msg = str(e)
        print(f'[regulations/fetch] Error: {error_msg}', flush=True)
        if 'credit balance is too low' in error_msg or 'billing' in error_msg.lower():
            return jsonify({
                'success': False,
                'error': 'Anthropic API credits exhausted. Add credits at console.anthropic.com/settings/billing.',
                'code': 'BILLING_ERROR'
            }), 503
        if 'rate_limit' in error_msg.lower() or 'rate limit' in error_msg.lower():
            return jsonify({
                'success': False,
                'error': 'Anthropic API rate limit reached. Please try again in a moment.',
                'code': 'RATE_LIMIT'
            }), 429
        if 'invalid_api_key' in error_msg or 'authentication' in error_msg.lower():
            return jsonify({
                'success': False,
                'error': 'Anthropic API key is invalid.',
                'code': 'AUTH_ERROR'
            }), 503
        return jsonify({'success': False, 'error': 'Internal server error', 'code': 'SERVER_ERROR'}), 500
