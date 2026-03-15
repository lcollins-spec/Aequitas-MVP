"""
Investment Memo generation endpoint — calls Claude with all available deal data
and returns a structured investment memo as plain text.
"""

import os
import json
from flask import Blueprint, request, jsonify

memo_bp = Blueprint('memo', __name__)


def _build_memo_prompt(data: dict) -> str:
    deal_name = data.get('dealName', 'Unnamed Deal')
    address = data.get('propertyAddress', '')
    location = data.get('location', '')
    total_units = data.get('totalUnits', '')
    pipeline_status = data.get('pipelineStatus', '')

    loi = data.get('loiData', {}) or {}
    purchase_price = loi.get('purchasePrice') or data.get('purchasePrice', '')
    loan_amount = loi.get('loanAmount', '')
    interest_rate = loi.get('interestRate', '')
    loan_term = loi.get('loanTermMonths', '')
    emd = loi.get('earnestMoneyDeposit', '')
    dd_deadline = loi.get('dueDiligenceDeadline', '')
    target_close = loi.get('targetCloseDate', '')

    pf = data.get('proForma', {}) or {}
    aequitas_equity = pf.get('aequitasEquity', '')
    proj_exit = pf.get('projectedExitValue', '')
    proj_irr = pf.get('projectedLpNetIrr', '')
    proj_em = pf.get('projectedEquityMultiple', '')
    strategy = pf.get('strategy', '')

    capex_items = data.get('capexItems', []) or []
    capex_total = sum(i.get('amount', 0) for i in capex_items)
    capex_lines = '\n'.join(
        f"  - {i.get('description', '')}: ${i.get('amount', 0):,.0f}" for i in capex_items
    ) or '  None recorded'

    fund_settings = data.get('fundSettings', {}) or {}
    pref_return = fund_settings.get('prefReturn', '')
    carry = fund_settings.get('carry', '')
    acq_fee = fund_settings.get('acqFee', '')
    am_fee = fund_settings.get('amFee', '')

    dd_checklist = data.get('ddChecklist', {}) or {}
    dd_uploads = data.get('ddUploads', {}) or {}
    dd_phases = data.get('ddPhases', []) or []
    dd_summary_lines = []
    for phase in dd_phases:
        phase_items = phase.get('items', [])
        reviewed = sum(1 for it in phase_items if dd_checklist.get(it['id']) == 'reviewed')
        uploaded = sum(1 for it in phase_items if dd_checklist.get(it['id']) == 'uploaded')
        total = len(phase_items)
        dd_summary_lines.append(
            f"  {phase.get('label', '')}: {reviewed} reviewed, {uploaded} uploaded, {total - reviewed - uploaded} pending (of {total})"
        )
    dd_summary = '\n'.join(dd_summary_lines) or '  No checklist data'

    capital_calls = data.get('capitalCalls', []) or []
    total_called = sum(c.get('amountCalled', 0) for c in capital_calls)
    total_received = sum(c.get('amountReceived', 0) for c in capital_calls)

    distributions = data.get('distributions', []) or []
    total_distributed = sum(d.get('amount', 0) for d in distributions)

    milestones = data.get('milestones', {}) or {}

    # Backend deal data (from DB / API)
    deal_api = data.get('dealApi', {}) or {}
    cap_rate = deal_api.get('capRate', '')
    irr_api = deal_api.get('irr', '')
    equity_mult_api = deal_api.get('equityMultiple', '')
    monthly_cash_flow = deal_api.get('monthlyCashFlow', '')
    total_monthly_income = deal_api.get('totalMonthlyIncome', '')
    total_monthly_expenses = deal_api.get('totalMonthlyExpenses', '')
    vacancy_rate = deal_api.get('vacancyRate', '')
    annual_rent_increase = deal_api.get('annualRentIncrease', '')
    property_type = deal_api.get('propertyType', '')
    year_built = deal_api.get('yearBuilt', '')
    sq_ft = deal_api.get('squareFootage', '')

    # Underwriting JSON (market context, DSCR, etc.)
    uw_raw = deal_api.get('underwritingJson')
    uw_data = {}
    if uw_raw:
        try:
            uw_data = json.loads(uw_raw) if isinstance(uw_raw, str) else uw_raw
        except Exception:
            pass

    noi = uw_data.get('noi', '') or uw_data.get('annualNOI', '')
    dscr = uw_data.get('dscr', '')
    market_analysis = uw_data.get('marketAnalysis', '') or uw_data.get('market_analysis', '')

    # Risk assessment
    risk_raw = data.get('riskAssessment', {}) or {}
    risk_level = risk_raw.get('compositeRiskLevel', '')
    risk_score = risk_raw.get('compositeRiskScore', '')
    rent_tier = risk_raw.get('rentTierLabel', '')
    net_yield = risk_raw.get('netYield', '')
    climate_risk = risk_raw.get('climateRiskLevel', '')
    arb_opp = risk_raw.get('arbitrageOpportunityLevel', '')

    # Regulations
    regulations = data.get('regulations', []) or []
    reg_lines = []
    for reg in regulations[:10]:
        status = reg.get('status', '')
        title = reg.get('title', '')
        summary = reg.get('summary', '')
        reg_lines.append(f"  [{status.upper()}] {title}: {summary}")
    reg_summary = '\n'.join(reg_lines) or '  No regulatory data available'

    fmt_currency = lambda v: f"${float(v):,.0f}" if v != '' and v is not None else 'N/A'
    fmt_pct = lambda v: f"{float(v) * 100:.1f}%" if v != '' and v is not None else 'N/A'
    fmt_x = lambda v: f"{float(v):.2f}x" if v != '' and v is not None else 'N/A'

    prompt = f"""You are a senior real estate investment analyst at Aequitas Capital, an affordable housing-focused private equity fund.

Generate a structured investment memo for the following deal. Use the exact section headers specified. Write in a professional, concise tone appropriate for an LP-ready investment memo. Do not use filler phrases. Where data is N/A or missing, note it briefly and move on.

=== RAW DEAL DATA ===

DEAL OVERVIEW
Deal Name: {deal_name}
Property Address: {address or location}
Total Units: {total_units or 'N/A'}
Property Type: {property_type or 'Multifamily'}
Year Built: {year_built or 'N/A'}
Square Footage: {sq_ft or 'N/A'}
Pipeline Status: {pipeline_status}
Strategy: {strategy or 'N/A'}

DEAL TERMS (LOI)
Purchase Price: {fmt_currency(purchase_price)}
Earnest Money Deposit: {fmt_currency(emd)}
Loan Amount: {fmt_currency(loan_amount)}
Interest Rate: {fmt_pct(interest_rate) if interest_rate else 'N/A'}
Loan Term: {f"{loan_term} months" if loan_term else 'N/A'}
DD Deadline: {dd_deadline or 'N/A'}
Target Close: {target_close or 'N/A'}

CAPITAL STRUCTURE
Aequitas Equity: {fmt_currency(aequitas_equity)}
CapEx Budget: {fmt_currency(capex_total) if capex_items else 'N/A'}
CapEx Line Items:
{capex_lines}

FUND ECONOMICS
Preferred Return: {fmt_pct(pref_return)}
Carry: {fmt_pct(carry)}
Acquisition Fee: {fmt_pct(acq_fee)}
AM Fee: {fmt_pct(am_fee)} / yr

PRO FORMA PROJECTIONS
Projected Exit Value: {fmt_currency(proj_exit)}
Projected LP Net IRR: {f"{proj_irr}%" if proj_irr else 'N/A'}
Projected Equity Multiple: {fmt_x(proj_em)}

FINANCIAL METRICS (FROM UNDERWRITING MODEL)
NOI (Annual): {fmt_currency(noi)}
DSCR: {f"{dscr:.2f}" if dscr else 'N/A'}
Cap Rate: {f"{float(cap_rate)*100:.2f}%" if cap_rate else 'N/A'}
IRR: {f"{float(irr_api)*100:.1f}%" if irr_api else 'N/A'}
Equity Multiple: {fmt_x(equity_mult_api)}
Monthly Cash Flow: {fmt_currency(monthly_cash_flow)}
Total Monthly Income: {fmt_currency(total_monthly_income)}
Total Monthly Expenses: {fmt_currency(total_monthly_expenses)}
Vacancy Rate: {fmt_pct(vacancy_rate)}
Annual Rent Increase: {fmt_pct(annual_rent_increase)}

CAPITAL CALLS & DISTRIBUTIONS
Total Capital Called: {fmt_currency(total_called)}
Total Capital Received: {fmt_currency(total_received)}
Total Distributions: {fmt_currency(total_distributed)}

MILESTONES
Under Contract Target: {milestones.get('underContractTarget', 'N/A')}
Close Target: {milestones.get('closedTarget', 'N/A')}
Exit Target: {milestones.get('exitedTarget', 'N/A')}

RISK ASSESSMENT
Composite Risk Level: {risk_level or 'N/A'}
Composite Risk Score: {risk_score or 'N/A'}
Rent Tier: {rent_tier or 'N/A'}
Net Yield: {fmt_pct(net_yield)}
Climate Risk Level: {climate_risk or 'N/A'}
Arbitrage Opportunity: {arb_opp or 'N/A'}

MARKET ANALYSIS
{market_analysis or 'No market analysis data available.'}

REGULATORY ENVIRONMENT
{reg_summary}

DUE DILIGENCE CHECKLIST STATUS
{dd_summary}

=== END DATA ===

Now write the investment memo using EXACTLY these section headers (use ## for each):

## Deal Snapshot
## Financial Summary
## Market Context
## Regulatory Environment
## Risk Summary
## Due Diligence Status

Each section should be 3–6 sentences or a short structured list. Be specific with numbers where available. End with a one-sentence investment thesis in bold under the final section.
"""
    return prompt


@memo_bp.route('/generate-investment-memo', methods=['POST'])
def generate_investment_memo():
    data = request.get_json()
    if not data:
        return jsonify({'success': False, 'error': 'No data provided'}), 400

    api_key = os.getenv('ANTHROPIC_API_KEY')
    if not api_key:
        return jsonify({'success': False, 'error': 'ANTHROPIC_API_KEY not configured'}), 503

    try:
        from anthropic import Anthropic
    except ImportError:
        return jsonify({'success': False, 'error': 'Anthropic SDK not available'}), 503

    try:
        prompt = _build_memo_prompt(data)
        client = Anthropic(api_key=api_key)
        message = client.messages.create(
            model='claude-sonnet-4-6',
            max_tokens=4096,
            messages=[{'role': 'user', 'content': prompt}],
        )
        memo_text = message.content[0].text
        return jsonify({'success': True, 'memo': memo_text})
    except Exception as e:
        err = str(e)
        if 'credit' in err.lower() or 'billing' in err.lower():
            return jsonify({'success': False, 'error': 'Anthropic API credits exhausted.'}), 503
        return jsonify({'success': False, 'error': err}), 500
