"""
Excel Export API Routes
Generates multifamily underwriting Excel models
"""
from flask import Blueprint, request, jsonify, send_file
from datetime import datetime, date
from io import BytesIO
import json
import os

from openpyxl import load_workbook
from app.database import db, DealModel

excel_export_bp = Blueprint('excel_export', __name__)

TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'MF_Acq_Pro_Forma_Template_-_v13.xlsx')


def _to_decimal(value, fallback=0):
    """Convert a value to decimal form. If > 1 assume it's already a percent and divide by 100."""
    if value is None:
        return fallback
    v = float(value)
    return v / 100 if v > 1 else v


def _classify_unit_type(unit_type_str):
    """Return '1br' if the unit type is a 1-bedroom, otherwise 'other'."""
    s = (unit_type_str or '').lower()
    # Match explicit 1BR patterns; avoid '1b' shortcut which falsely matches '2br/1ba'
    if '1br' in s or '1/1' in s or s.startswith('1b'):
        return '1br'
    return 'other'


@excel_export_bp.route('/underwriting/<int:deal_id>/export-excel', methods=['POST'])
def export_underwriting_excel(deal_id):
    """
    Load the MF Acq Pro Forma template, write the 13 input cells with deal data,
    and return the file. All formula cells are left untouched.
    """
    try:
        return _do_export(deal_id)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


def _do_export(deal_id):
    raw_body = request.get_json(silent=True)

    deal = DealModel.query.get(deal_id)
    if deal is None:
        return jsonify({'error': f'Deal {deal_id} not found'}), 404
    data = raw_body or {}

    financing        = data.get('financing', {}) or {}
    exit_assumptions = data.get('exitAssumptions', {}) or {}
    op_expenses      = data.get('operatingExpenses', {}) or {}
    op_projections   = data.get('operatingProjections', {}) or {}
    unit_mix_list    = data.get('unitMix', []) or []

    if not os.path.exists(TEMPLATE_PATH):
        return jsonify({'error': f'Excel template not found at: {os.path.abspath(TEMPLATE_PATH)}'}), 500

    with open(TEMPLATE_PATH, 'rb') as f:
        template_bytes = BytesIO(f.read())
    wb = load_workbook(template_bytes)
    ws = wb.worksheets[0]

    # --- D5: Property Name ---
    ws['D5'] = data.get('propertyName') or deal.deal_name or ''

    # --- D6: Address ---
    ws['D6'] = data.get('address') or deal.property_address or ''

    # --- E14: Acquisition Date (Python date object) ---
    acq_date_raw = data.get('acquisitionDate')
    acq_date = None
    if acq_date_raw:
        try:
            acq_date = datetime.strptime(acq_date_raw[:10], '%Y-%m-%d').date()
        except (ValueError, TypeError):
            acq_date = None
    if acq_date is None:
        acq_date = getattr(deal, 'acquisition_date', None)
    if acq_date is None:
        acq_date = date.today()
    ws['E16'] = acq_date

    # --- D61: 1BR unit count, E61: 1BR rent per unit ---
    # Find 1BR entry in unit mix; fall back to total units / avg rent
    one_br_count = 0
    one_br_rent = 0
    for u in unit_mix_list:
        if _classify_unit_type(u.get('unitType', '')) == '1br':
            one_br_count += u.get('count', 0)
            one_br_rent = u.get('askingRent') or u.get('marketRent') or u.get('currentRent') or 0
    if one_br_count == 0:
        # No 1BR found — use the first unit type as the primary, or fall back to totals
        if unit_mix_list:
            primary = unit_mix_list[0]
            one_br_count = primary.get('count', 0)
            one_br_rent = primary.get('askingRent') or primary.get('marketRent') or primary.get('currentRent') or 0
        else:
            one_br_count = data.get('totalUnits') or sum(u.get('count', 0) for u in unit_mix_list) or 0
            one_br_rent = data.get('avgMonthlyRent') or 0
    ws['D61'] = one_br_count
    ws['E61'] = one_br_rent

    # --- D21: Asking/listing price (valuation analysis) ---
    purchase_price = data.get('purchasePrice') or deal.purchase_price or 0
    ws['D21'] = purchase_price

    # --- D25: Asking Price ---
    ws['D25'] = purchase_price

    # --- E24: Aequitas entry cap rate (decimal) ---
    exit_cap = exit_assumptions.get('exitCapRate') or data.get('exitCapRate') or 0
    entry_cap = _to_decimal(data.get('entryCapRate') or exit_cap or 0.06)
    ws['E24'] = entry_cap

    # --- D23: TTM NOI ---
    # Compute from unit mix and operating expense ratio supplied by frontend
    total_units = sum(u.get('count', 0) for u in unit_mix_list) or 1
    annual_gross_rent = sum(
        u.get('count', 0) * (u.get('askingRent') or u.get('marketRent') or u.get('currentRent') or 0) * 12
        for u in unit_mix_list
    )
    vacancy_rate = _to_decimal(
        data.get('vacancyRate') or op_projections.get('stabilizedVacancy') or deal.vacancy_rate or 0.05
    )
    egi = annual_gross_rent * (1 - vacancy_rate)
    utilities_annual = (
        (op_expenses.get('utilitiesElectric') or 0)
        + (op_expenses.get('utilitiesGas') or 0)
        + (op_expenses.get('utilitiesWaterSewer') or 0)
        + (op_expenses.get('utilitiesTrash') or 0)
        or op_expenses.get('utilitiesAnnual')
        or (deal.utilities_monthly or 0) * 12
    )
    mgmt_fee_pct = _to_decimal(
        op_expenses.get('managementFeePct')
        or (deal.property_management_percent if deal.property_management_percent else None)
        or 0.04
    )
    total_opex = (
        (op_expenses.get('payroll') or 0)
        + (op_expenses.get('administrative') or op_expenses.get('legalProfessional') or 0)
        + (op_expenses.get('marketing') or 0)
        + (op_expenses.get('repairsMaintenance') or op_expenses.get('repairsMaintenanceAnnual') or 0)
        + (op_expenses.get('insurance') or op_expenses.get('insuranceAnnual') or deal.insurance_annual or 0)
        + utilities_annual
        + (op_expenses.get('propertyTax') or op_expenses.get('propertyTaxAnnual') or deal.property_tax_annual or 0)
        + mgmt_fee_pct * egi
    )
    ttm_noi = max(egi - total_opex, 0)
    ws['D23'] = round(ttm_noi)

    # --- E47: LTV (decimal) ---
    ltv = financing.get('ltv') or data.get('ltv')
    if ltv is None:
        ltv = 1.0 - (_to_decimal(deal.down_payment_percent) if deal.down_payment_percent else 0.35)
    else:
        ltv = _to_decimal(ltv)
    ws['E47'] = ltv

    # --- D48: Senior loan term (months) ---
    loan_term_years = financing.get('loanTermYears') or deal.loan_term_years or 30
    ws['D48'] = int(loan_term_years * 12)

    # --- E49: Senior loan interest rate (decimal) ---
    interest_rate = (
        financing.get('interestRate')
        or data.get('interestRate')
        or deal.loan_interest_rate
        or 0
    )
    ws['E49'] = _to_decimal(interest_rate)

    # --- G8: LP equity share (decimal) ---
    # aequitasEquityPct is Aequitas (GP) share; LP = 1 - GP share
    aeq_pct = _to_decimal(data.get('aequitasEquityPct', 0.5))
    ws['G8'] = round(1.0 - aeq_pct, 6)

    # --- H21: Exit cap rate (valuation analysis) ---
    ws['H21'] = _to_decimal(exit_cap or 0.06)

    # --- H24: Exit cap rate (decimal) ---
    ws['H24'] = _to_decimal(exit_cap or 0.06)

    # --- F17: Hold period in months (integer) ---
    hold_years = (
        exit_assumptions.get('holdPeriodYears')
        or financing.get('loanTermYears')
        or deal.loan_term_years
        or 0
    )
    ws['F17'] = int(hold_years * 12)

    # ── New template input cells ──────────────────────────────────────────────

    # --- D73: Loss to lease (decimal) ---
    ws['D73'] = _to_decimal(data.get('lossToLeaseRate') or getattr(deal, 'loss_to_lease_rate', None) or 0)

    # --- D74–H74: Vacancy rate (same value across Year 1–5 columns) ---
    vac = _to_decimal(
        data.get('vacancyRate')
        or op_projections.get('stabilizedVacancy')
        or deal.vacancy_rate
        or 0.05
    )
    for col in ('D', 'E', 'F', 'G', 'H'):
        ws[f'{col}74'] = vac

    # --- D75: Bad debt (decimal) ---
    ws['D75'] = _to_decimal(data.get('badDebtRate') or 0)

    # --- D76: Concessions (decimal) ---
    ws['D76'] = _to_decimal(data.get('concessionsRate') or getattr(deal, 'concessions_rate', None) or 0)

    # --- D79: Rent growth (decimal) ---
    ws['D79'] = _to_decimal(
        data.get('rentGrowthRate')
        or op_projections.get('marketRentGrowth')
        or 0.02
    )

    # --- D81: Opex growth rate (decimal) ---
    ws['D81'] = _to_decimal(
        data.get('opexGrowthRate')
        or op_projections.get('opexGrowth')
        or getattr(deal, 'opex_growth_rate', None)
        or 0.03
    )

    # --- D82: Property tax growth rate (decimal) ---
    ws['D82'] = _to_decimal(
        data.get('propertyTaxGrowthRate')
        or getattr(deal, 'property_tax_growth_rate', None)
        or 0.02
    )

    # --- K42–K47: Controllable opex $/unit/yr ---
    ws['K42'] = float(data.get('opexPayrollPerUnit') or getattr(deal, 'opex_payroll_per_unit', None) or 0)
    ws['K43'] = float(data.get('opexAdminPerUnit') or getattr(deal, 'opex_admin_per_unit', None) or 0)
    ws['K44'] = float(data.get('opexMarketingPerUnit') or getattr(deal, 'opex_marketing_per_unit', None) or 0)
    ws['K45'] = float(data.get('opexRmPerUnit') or getattr(deal, 'opex_rm_per_unit', None) or 0)
    ws['K46'] = float(data.get('opexContractServicePerUnit') or getattr(deal, 'opex_contract_service_per_unit', None) or 0)
    ws['K47'] = float(data.get('opexTurnoverPerUnit') or getattr(deal, 'opex_turnover_per_unit', None) or 0)

    # --- K52–K55: Non-controllable opex $/unit/yr ---
    ws['K52'] = float(data.get('opexInsurancePerUnit') or getattr(deal, 'opex_insurance_per_unit', None) or 0)
    ws['K53'] = float(data.get('opexUtilitiesPerUnit') or getattr(deal, 'opex_utilities_per_unit', None) or 0)
    ws['K55'] = float(data.get('opexPropertyTaxPerUnit') or getattr(deal, 'opex_property_tax_per_unit', None) or 0)

    # --- K64: CapEx $/unit/yr ---
    ws['K64'] = float(data.get('capexPerUnit') or getattr(deal, 'capex_per_unit', None) or 0)

    # --- E67: RUBS % (decimal) ---
    ws['E67'] = _to_decimal(data.get('rubsPct') or getattr(deal, 'rubs_pct', None) or 0)

    # --- G68: Parking $/unit/mo ---
    ws['G68'] = float(data.get('parkingIncomePerUnit') or getattr(deal, 'parking_income_per_unit', None) or 0)

    # --- G69: Other income $/unit/mo ---
    ws['G69'] = float(data.get('otherIncomePerUnit') or getattr(deal, 'other_income_per_unit', None) or 0)

    # --- D51: Senior IO periods (months) ---
    ws['D51'] = int(data.get('seniorIoPeriods') or getattr(deal, 'senior_io_periods', None) or 0)

    # --- D50: Senior financing costs % (decimal) ---
    ws['D50'] = _to_decimal(data.get('seniorFinancingCostsPct') or getattr(deal, 'senior_financing_costs_pct', None) or 0)

    # --- E51: Senior PMT (dynamic term from D48) ---
    ws['E51'] = '=PMT(E49/12,D48,-E47,0,)'

    # --- H51: Refi PMT (dynamic term from D48) ---
    ws['H51'] = '=PMT(H49/12,D48,-H47,0,)'

    # --- E53: DSCR (dynamic term from D48) ---
    ws['E53'] = '=D23/(PMT(E49/12,D48,-E47,0)*12)'

    # --- G55: Refi LTV (decimal) ---
    ws['G55'] = _to_decimal(data.get('refiLtv') or getattr(deal, 'refi_ltv', None) or 0)

    # --- G49: Refi interest rate (decimal) ---
    ws['G49'] = _to_decimal(data.get('refiInterestRate') or getattr(deal, 'refi_interest_rate', None) or 0)

    # --- G50: Refi financing costs % (decimal) ---
    ws['G50'] = _to_decimal(data.get('refiFinancingCostsPct') or getattr(deal, 'refi_financing_costs_pct', None) or 0)

    # --- G51: Refi IO periods (months) ---
    ws['G51'] = int(data.get('refiIoPeriods') or getattr(deal, 'refi_io_periods', None) or 0)

    # --- G48: Refi term (months) ---
    ws['G48'] = int(data.get('refiTermMonths') or getattr(deal, 'refi_term_months', None) or 0)

    # --- G6: GP equity split % (decimal) ---
    ws['G6'] = _to_decimal(data.get('gpEquitySplitPct') or getattr(deal, 'gp_equity_split_pct', None) or 0.10)

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
