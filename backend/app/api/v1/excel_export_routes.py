"""
Excel Export API Routes
Generates multifamily underwriting Excel models
"""
from flask import Blueprint, request, jsonify, send_file
from datetime import datetime, date, timedelta
from io import BytesIO
import json
import os

from openpyxl import load_workbook
from app.database import db, DealModel

excel_export_bp = Blueprint('excel_export', __name__)

TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'MF Acq Pro Forma Template - DEALv1.xlsx')


def _to_decimal(value, fallback=0):
    """Convert a value to decimal form. If > 1 assume it's already a percent and divide by 100."""
    if value is None:
        return fallback
    v = float(value)
    return v / 100 if v > 1 else v


def _classify_unit_type(unit_type_str):
    """Return 'studio', '1br', '2br', or '3br+' based on unitType string."""
    s = (unit_type_str or '').lower()
    if 'studio' in s or '0br' in s or 'eff' in s:
        return 'studio'
    if '1br' in s or '1/1' in s or '1b' in s:
        return '1br'
    if '2br' in s or '2/1' in s or '2/2' in s or '2b' in s:
        return '2br'
    return '3br+'


def _build_unit_mix_rows(unit_mix_list):
    """
    Convert the frontend unitMix array into 4 template rows.
    Returns dict: { 'studio': (count, rent, sqft), '1br': ..., '2br': ..., '3br+': ... }
    Rent priority: askingRent > marketRent > currentRent
    """
    rows = {'studio': (0, 0, 0), '1br': (0, 0, 0), '2br': (0, 0, 0), '3br+': (0, 0, 0)}
    if not unit_mix_list:
        return rows

    # Try to classify by unitType label first
    classified = {'studio': [], '1br': [], '2br': [], '3br+': []}
    for u in unit_mix_list:
        key = _classify_unit_type(u.get('unitType', ''))
        classified[key].append(u)

    # If nothing matched studio and all went to 3br+, fall back to index order
    if not classified['studio'] and not classified['1br'] and not classified['2br']:
        order = ['studio', '1br', '2br', '3br+']
        for i, u in enumerate(unit_mix_list[:4]):
            k = order[i]
            rent = u.get('askingRent') or u.get('marketRent') or u.get('currentRent') or 0
            rows[k] = (u.get('count', 0), rent, u.get('sqft') or u.get('avgSf') or 0)
        return rows

    for k, entries in classified.items():
        if not entries:
            continue
        count = sum(e.get('count', 0) for e in entries)
        # Weighted average rent
        total_units = count or 1
        rent = sum((e.get('askingRent') or e.get('marketRent') or e.get('currentRent') or 0) * e.get('count', 0)
                   for e in entries) / total_units
        sqft = sum((e.get('sqft') or e.get('avgSf') or 0) * e.get('count', 0)
                   for e in entries) / total_units
        rows[k] = (count, round(rent), round(sqft))

    return rows


@excel_export_bp.route('/underwriting/<int:deal_id>/export-excel', methods=['POST'])
def export_underwriting_excel(deal_id):
    """
    Load the MF Acq Pro Forma template, overwrite input cells with deal data,
    and return the file. Formula cells are never touched.

    The frontend sends a nested underwritingData object; this route unpacks it.
    """
    try:
        return _do_export(deal_id)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def _do_export(deal_id):
    print("EXPORT HANDLER RUNNING - excel_export_routes.py")
    raw_body = request.get_json(silent=True)
    print(f'\n===== [export-excel deal={deal_id}] RAW REQUEST BODY =====')
    print(json.dumps(raw_body, indent=2, default=str))
    print(f'===== END RAW REQUEST BODY =====\n')

    # (b) Log the two stubborn fields before any processing
    _data_preview = raw_body or {}
    print(f'[DIAG] entryCapRate raw    = {_data_preview.get("entryCapRate")!r}')
    print(f'[DIAG] aequitasEquityPct raw = {_data_preview.get("aequitasEquityPct")!r}')

    deal = DealModel.query.get(deal_id)
    if deal is None:
        return jsonify({'error': f'Deal {deal_id} not found'}), 404
    data = raw_body or {}

    # --- Unpack nested sub-objects sent by the frontend ---
    financing        = data.get('financing', {}) or {}
    exit_assumptions = data.get('exitAssumptions', {}) or {}
    op_expenses      = data.get('operatingExpenses', {}) or {}
    op_projections   = data.get('operatingProjections', {}) or {}
    unit_mix_list    = data.get('unitMix', []) or []

    # Derive total units from unitMix array (sum of counts)
    total_units = sum(u.get('count', 0) for u in unit_mix_list) or 1

    if not os.path.exists(TEMPLATE_PATH):
        return jsonify({'error': f'Excel template not found at: {os.path.abspath(TEMPLATE_PATH)}'}), 500

    wb = load_workbook(TEMPLATE_PATH)
    # Find the underwriting sheet regardless of exact capitalisation
    sheet_name = next((s for s in wb.sheetnames if 'underwrit' in s.lower()), None) or wb.sheetnames[0]
    ws = wb[sheet_name]

    today = date.today()

    # --- Property identification ---
    ws['D4'] = 101  # Sequential deal number; hardcoded until deal numbering is implemented
    ws['D5'] = data.get('propertyName') or deal.deal_name
    ws['D6'] = data.get('address') or deal.property_address or ''

    # Acquisition date — prefer request body, then DB field; leave blank if neither exists.
    # The template uses EOMONTH throughout, so always snap to the last day of the month.
    acq_date_raw = data.get('acquisitionDate')
    if acq_date_raw:
        try:
            acq_date = datetime.strptime(acq_date_raw[:10], '%Y-%m-%d').date()
        except (ValueError, TypeError):
            acq_date = None
    else:
        acq_date = getattr(deal, 'acquisition_date', None)
    if acq_date:
        # Snap to end of month (EOMONTH equivalent)
        if acq_date.month == 12:
            first_next = acq_date.replace(year=acq_date.year + 1, month=1, day=1)
        else:
            first_next = acq_date.replace(month=acq_date.month + 1, day=1)
        acq_date = first_next - timedelta(days=1)
    ws['F9'] = acq_date  # None leaves the cell blank

    # Hold period in years — exitAssumptions.holdPeriodYears or financing.loanTermYears
    hold_period = (exit_assumptions.get('holdPeriodYears')
                   or financing.get('loanTermYears')
                   or deal.loan_term_years
                   or 0)
    ws['D12'] = hold_period

    # --- Unit mix — map array to 4 template rows (Studio, 1BR, 2BR, 3BR+) ---
    mix = _build_unit_mix_rows(unit_mix_list)
    ws['N9'],  ws['O9'],  ws['P9']  = mix['studio']
    ws['N10'], ws['O10'], ws['P10'] = mix['1br']
    ws['N11'], ws['O11'], ws['P11'] = mix['2br']
    ws['N12'], ws['O12'], ws['P12'] = mix['3br+']

    # --- Laundry / other income → P18 ($/unit/month) ---
    laundry_income_annual = data.get('laundryIncome') or 0
    ws['P18'] = round(laundry_income_annual / 12 / total_units, 2) if laundry_income_annual else 0

    # --- Annual gross rent (used for TTM NOI and concessions conversion) ---
    annual_gross_rent = sum(
        (u.get('count', 0) * (u.get('askingRent') or u.get('marketRent') or u.get('currentRent') or 0) * 12)
        for u in unit_mix_list
    )

    # --- Valuation ---
    purchase_price = data.get('purchasePrice') or deal.purchase_price or 0

    # TTM NOI = EGI - total operating expenses
    # BEFORE: mgmt fee was missing from opex and was computed after this block
    # AFTER:  mgmt fee is resolved here and applied to EGI (not gross rent)
    _vacancy_rate = _to_decimal(data.get('vacancyRate') or op_projections.get('stabilizedVacancy') or deal.vacancy_rate or 0.05)
    egi = annual_gross_rent * (1 - _vacancy_rate)
    _utilities_annual = (
        (op_expenses.get('utilitiesElectric') or 0)
        + (op_expenses.get('utilitiesGas') or 0)
        + (op_expenses.get('utilitiesWaterSewer') or 0)
        + (op_expenses.get('utilitiesTrash') or 0)
        or op_expenses.get('utilitiesAnnual')  # combined annual from OM extraction
        or (deal.utilities_monthly or 0) * 12
    )
    # Resolve mgmt fee % here so it can be applied to EGI in the opex sum
    mgmt_fee_pct = _to_decimal(
        op_expenses.get('managementFeePct')
        or (deal.property_management_percent if deal.property_management_percent else None)
        or 0.04
    )
    _total_opex = (
        (op_expenses.get('payroll') or 0)
        + (op_expenses.get('administrative') or op_expenses.get('legalProfessional') or 0)
        + (op_expenses.get('marketing') or 0)
        + (op_expenses.get('repairsMaintenance') or op_expenses.get('repairsMaintenanceAnnual') or 0)
        + (op_expenses.get('contractServices') or 0)
        + (op_expenses.get('turnover') or 0)
        + (op_expenses.get('otherControllable') or 0)
        + (op_expenses.get('insurance') or op_expenses.get('insuranceAnnual') or deal.insurance_annual or 0)
        + _utilities_annual
        + (op_expenses.get('propertyTax') or op_expenses.get('propertyTaxAnnual') or deal.property_tax_annual or 0)
        + mgmt_fee_pct * egi  # management fee on EGI (post-vacancy), not gross rent
    )
    ttm_noi = max(egi - _total_opex, 0)
    ws['D16'] = round(ttm_noi)

    # Exit cap rate (needed by both D19 entry cap fallback and F18 exit cap write below)
    exit_cap = exit_assumptions.get('exitCapRate') or data.get('exitCapRate', 0)

    # Entry cap rate — use analyst's assumed market cap rate (same as exit cap rate assumption)
    # so D20 = NOI / cap_rate = meaningful market valuation (not trivially equal to purchase price)
    entry_cap = _to_decimal(data.get('entryCapRate') or exit_cap or 0.06)
    print(f'[DIAG] entry_cap computed  = {entry_cap!r}  (from entryCapRate={data.get("entryCapRate")!r}, exit_cap={exit_cap!r})')
    ws['D19'] = entry_cap
    print(f'[DIAG] D19 written         = {entry_cap!r}')
    print(f'[DIAG] D19 read-back       = {ws["D19"].value!r}')

    ws['D23'] = data.get('deferredCapex', 0)
    # D24 (outstanding debt) is written after LTV is computed below

    # Closing costs % — data.closingCostsPct (frontend sends this as a decimal)
    closing_costs_pct = data.get('closingCostsPct')
    if closing_costs_pct is None:
        closing_costs_pct = _to_decimal(deal.closing_costs) if (deal.closing_costs and deal.closing_costs <= 1) else 0.01
    ws['D27'] = closing_costs_pct

    # Exit cap rate — write to F18 (H18 is =F18)
    ws['F18'] = _to_decimal(exit_cap)

    # --- Income adjustments — same value across all 5 year columns M–Q ---
    vacancy       = _to_decimal(data.get('vacancyRate') or op_projections.get('stabilizedVacancy') or deal.vacancy_rate or 0.05)
    bad_debt      = _to_decimal(data.get('badDebtRate')) if data.get('badDebtRate') else 0.0025
    loss_to_lease = _to_decimal(data.get('lossToLease')) if data.get('lossToLease') else 0.0125

    # Concessions: check for direct % first (from OM extraction or manual entry),
    # then dollar amount (convert to % of gross rent), then default 0.25%.
    # Note: PropertyData/extract-om currently has no concessions field, so
    # the payload field is 'concessionsPct' (decimal) or 'concessionsAnnual' (dollars).
    concessions_pct = data.get('concessionsPct')
    if concessions_pct is not None:
        concessions = _to_decimal(concessions_pct)
    else:
        concessions_raw = data.get('concessionsAnnual') or 0
        if concessions_raw > 1:
            concessions = (concessions_raw / annual_gross_rent) if annual_gross_rent else 0.0025
        elif 0 < concessions_raw <= 1:
            concessions = concessions_raw  # already a decimal fraction
        else:
            concessions = 0.0025  # default 0.25%

    for col in ['M', 'N', 'O', 'P', 'Q']:
        ws[f'{col}22'] = loss_to_lease
        ws[f'{col}23'] = vacancy
        ws[f'{col}24'] = bad_debt
        ws[f'{col}25'] = concessions

    # --- Growth — write to AI17 (M28 is =AI17) ---
    # If rent-stabilized, cap growth at the regulatory cap (default 2.2%); otherwise use market assumptions.
    if data.get('rentStabilized'):
        rent_growth = _to_decimal(data.get('annualRentGrowthCap') or 0.022)
    else:
        rent_growth = (op_projections.get('marketRentGrowth')
                       or op_projections.get('inplaceRentGrowth')
                       or data.get('rentGrowth')
                       or _to_decimal(deal.annual_rent_increase) if deal.annual_rent_increase else None
                       or 0.03)
        rent_growth = _to_decimal(rent_growth)
    ws['AI17'] = rent_growth

    # --- Controllable opex — frontend sends annual totals; template wants $/unit/year ---
    def _per_unit(total):
        return round((total or 0) / total_units, 2)

    ws['V28'] = _per_unit(op_expenses.get('payroll'))
    ws['V29'] = _per_unit(op_expenses.get('administrative') or op_expenses.get('legalProfessional'))
    ws['V30'] = _per_unit(op_expenses.get('marketing'))
    ws['V31'] = _per_unit(op_expenses.get('repairsMaintenance') or op_expenses.get('repairsMaintenanceAnnual'))
    ws['V32'] = _per_unit(op_expenses.get('contractServices', 0))
    ws['V33'] = _per_unit(op_expenses.get('turnover', 0))
    ws['V34'] = _per_unit(op_expenses.get('otherControllable', 0))

    # --- Non-controllable opex $/unit/year ---
    ws['V37'] = _per_unit(op_expenses.get('insurance') or op_expenses.get('insuranceAnnual') or deal.insurance_annual)

    utilities_annual = (
        (op_expenses.get('utilitiesElectric') or 0)
        + (op_expenses.get('utilitiesGas') or 0)
        + (op_expenses.get('utilitiesWaterSewer') or 0)
        + (op_expenses.get('utilitiesTrash') or 0)
        or op_expenses.get('utilitiesAnnual')  # combined annual from OM extraction
        or (deal.utilities_monthly or 0) * 12
    )
    ws['V38'] = _per_unit(utilities_annual)

    ws['T39'] = mgmt_fee_pct  # already resolved and used in TTM NOI above

    ws['V40'] = _per_unit(op_expenses.get('propertyTax') or op_expenses.get('propertyTaxAnnual') or deal.property_tax_annual)

    # --- Cap reserve — write to AI18 (V47 is =AI18) — $/unit/year ---
    cap_reserve = (op_projections.get('capexPerUnitAnnual')
                   or data.get('capReserve', 0))
    ws['AI18'] = cap_reserve

    # --- Senior financing ---
    ltv = financing.get('ltv') or data.get('ltv')
    if ltv is None:
        ltv = 1.0 - (_to_decimal(deal.down_payment_percent) if deal.down_payment_percent else 0.35)
    else:
        ltv = _to_decimal(ltv)
    ws['E34'] = ltv

    # Outstanding debt = purchase price * LTV
    loan_proceeds = round(purchase_price * ltv) if purchase_price else 0
    ws['D24'] = loan_proceeds  # equity section: outstanding debt at acquisition
    ws['F34'] = loan_proceeds  # financing section: senior loan proceeds (PMT formula F38 uses this)

    # Override D25 with frontend's cost-basis equity so Excel IRR matches the on-screen value.
    # Without this, D25 = D20 - D23 - D24 derives equity from cap-rate valuation (NOI/cap_rate - loan),
    # which differs from the frontend's (purchasePrice + construction + closing) * (1 - LTV).
    equity_required = data.get('equityRequired')
    if equity_required:
        ws['D25'] = equity_required

    ws['E35'] = 36  # Senior bridge loan term: always 36 months (3 yr); amort is hardcoded in PMT formula

    ws['E37'] = _to_decimal(financing.get('originationFeePct') or data.get('financingCosts', 0))
    ws['E38'] = financing.get('ioPeriods') or data.get('ioPeriods', 0)

    # Interest rate — write to AI16 (F36 is =AI16)
    interest_rate = (financing.get('interestRate')
                     or data.get('interestRate')
                     or deal.loan_interest_rate
                     or 0)
    ws['AI16'] = _to_decimal(interest_rate)

    # --- Refinance ---
    ws['H35'] = data.get('refiTermMonths', 360)
    ws['H37'] = _to_decimal(data.get('refiFinancingCosts', 0))
    ws['H38'] = data.get('refiIoPeriods', 0)

    # --- Waterfall ---
    _aeq_pct = _to_decimal(data.get('aequitasEquityPct', 0.5))
    print(f'[DIAG] aequitasEquityPct computed = {_aeq_pct!r}  (raw={data.get("aequitasEquityPct")!r})')
    ws['D46'] = _aeq_pct
    print(f'[DIAG] D46 written         = {_aeq_pct!r}')
    print(f'[DIAG] D46 read-back       = {ws["D46"].value!r}')   # Aequitas = 50% of equity
    ws['D48'] = _to_decimal(data.get('aequitasThereafterSplit', 0.5))

    # --- Property tax detail ---
    prop_tax = data.get('propertyTax', {}) or {}
    ws['M35'] = data.get('currentAssessedValue', 0)
    ws['N35'] = data.get('nextBuyerAssessedValue', 0)
    ws['M38'] = prop_tax.get('countyTaxRate') or data.get('millageRate', 0)
    ws['M39'] = prop_tax.get('specialAssessments') or data.get('specialAssessment', 0)

    # --- Save and return ---
    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    property_name = (data.get('propertyName') or deal.deal_name or 'Property').replace(' ', '_')
    filename = f"{property_name}_ProForma.xlsx"

    return send_file(
        buf,
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        as_attachment=True,
        download_name=filename
    )


@excel_export_bp.route('/underwriting/export-excel-template', methods=['GET'])
def export_template():
    """
    Download the blank MF Acq Pro Forma template.

    Returns:
        Excel file download
    """
    try:
        timestamp = datetime.now().strftime('%Y%m%d')
        filename = f"MF_ProForma_Template_{timestamp}.xlsx"

        return send_file(
            TEMPLATE_PATH,
            mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            as_attachment=True,
            download_name=filename
        )

    except Exception as e:
        return jsonify({'error': str(e)}), 500
