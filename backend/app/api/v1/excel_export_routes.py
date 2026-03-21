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
    print("EXPORT HANDLER RUNNING - excel_export_routes.py")
    raw_body = request.get_json(silent=True)
    print(f'\n===== [export-excel deal={deal_id}] RAW REQUEST BODY =====')
    print(json.dumps(raw_body, indent=2, default=str))
    print(f'===== END RAW REQUEST BODY =====\n')

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

    wb = load_workbook(TEMPLATE_PATH)
    wb.calculation.calcMode = 'auto'
    wb.calculation.fullCalcOnLoad = True
    ws = wb.worksheets[0]

    # --- D5: Property Name ---
    ws['D5'] = data.get('propertyName') or deal.deal_name or ''

    # --- D6: Address ---
    ws['D6'] = data.get('address') or deal.property_address or ''

    # --- E16: Acquisition Date (Python date object) ---
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

    # --- D25: Asking Price ---
    purchase_price = data.get('purchasePrice') or deal.purchase_price or 0
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

    # --- D47: LTV (decimal) ---
    ltv = financing.get('ltv') or data.get('ltv')
    if ltv is None:
        ltv = 1.0 - (_to_decimal(deal.down_payment_percent) if deal.down_payment_percent else 0.35)
    else:
        ltv = _to_decimal(ltv)
    ws['D47'] = ltv

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
