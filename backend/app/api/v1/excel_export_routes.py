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
    """Return 'studio', '1br', '2br', '3br', or 'other'."""
    s = (unit_type_str or '').lower()
    if 'studio' in s or 'eff' in s or '0br' in s or '0/1' in s or s.startswith('0b'):
        return 'studio'
    if '1br' in s or '1/1' in s or '1 br' in s or s.startswith('1b'):
        return '1br'
    if '2br' in s or '2/1' in s or '2/2' in s or '2 br' in s or s.startswith('2b'):
        return '2br'
    if '3br' in s or '3/2' in s or '3/3' in s or '3 br' in s or s.startswith('3b'):
        return '3br'
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
    op_expenses      = data.get('omOperatingExpenses') or data.get('operatingExpenses', {}) or {}
    op_projections   = data.get('operatingProjections', {}) or {}
    unit_mix_list    = data.get('unitMix', []) or []

    if not os.path.exists(TEMPLATE_PATH):
        return jsonify({'error': f'Excel template not found at: {os.path.abspath(TEMPLATE_PATH)}'}), 500

    wb = load_workbook(TEMPLATE_PATH)
    wb.calculation.calcMode = 'auto'
    wb.calculation.fullCalcOnLoad = True
    ws = wb.worksheets[0]

    # --- D5: Property Name ---
    _v = data.get('propertyName') or deal.deal_name or ''
    print(f"[cell-write] D5  = {_v!r}")
    ws['D5'] = _v

    # --- D6: Address ---
    _v = data.get('address') or deal.property_address or ''
    print(f"[cell-write] D6  = {_v!r}")
    ws['D6'] = _v

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
    print(f"[cell-write] E16 = {acq_date!r}")
    ws['E16'] = acq_date

    # --- D60/E60, D61/E61, D62/E62, D63/E63: Unit mix (Studio, 1BR, 2BR, 3BR) ---
    # Bucket each unit-mix entry by type; last non-zero rent wins within each bucket
    unit_buckets = {'studio': [0, 0], '1br': [0, 0], '2br': [0, 0], '3br': [0, 0]}
    for u in unit_mix_list:
        t = _classify_unit_type(u.get('unitType', ''))
        if t not in unit_buckets:
            t = 'other'
        if t == 'other':
            continue
        cnt  = u.get('count', 0)
        rent = u.get('askingRent') or u.get('marketRent') or u.get('currentRent') or 0
        unit_buckets[t][0] += cnt
        if rent:
            unit_buckets[t][1] = rent

    # Fallback: if nothing classified as 1BR, promote first unit in list
    if unit_buckets['1br'][0] == 0:
        if unit_mix_list:
            primary = unit_mix_list[0]
            unit_buckets['1br'][0] = primary.get('count', 0)
            unit_buckets['1br'][1] = (
                primary.get('askingRent') or primary.get('marketRent') or primary.get('currentRent') or 0
            )
        else:
            unit_buckets['1br'][0] = data.get('totalUnits') or 0
            unit_buckets['1br'][1] = data.get('avgMonthlyRent') or 0

    _unit_rows = {'studio': (60, 'D60', 'E60'), '1br': (61, 'D61', 'E61'),
                  '2br': (62, 'D62', 'E62'), '3br': (63, 'D63', 'E63')}
    for t, (_, cnt_cell, rent_cell) in _unit_rows.items():
        print(f"[cell-write] {cnt_cell} = {unit_buckets[t][0]!r}")
        ws[cnt_cell] = unit_buckets[t][0]
        print(f"[cell-write] {rent_cell} = {unit_buckets[t][1]!r}")
        ws[rent_cell] = unit_buckets[t][1]

    # --- D25: Asking Price ---
    purchase_price = data.get('purchasePrice') or deal.purchase_price or 0
    print(f"[cell-write] D25 = {purchase_price!r}")
    ws['D25'] = purchase_price

    # --- E24: Aequitas entry cap rate (decimal) ---
    exit_cap = exit_assumptions.get('exitCapRate') or data.get('exitCapRate') or 0
    entry_cap = _to_decimal(data.get('entryCapRate') or exit_cap or 0.06)
    print(f"[cell-write] E24 = {entry_cap!r}")
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
    print(f"[cell-write] D23 = {round(ttm_noi)!r}")
    ws['D23'] = round(ttm_noi)

    # --- D47: LTV (decimal) ---
    ltv = financing.get('ltv') or data.get('ltv')
    if ltv is None:
        ltv = 1.0 - (_to_decimal(deal.down_payment_percent) if deal.down_payment_percent else 0.35)
    else:
        ltv = _to_decimal(ltv)
    print(f"[cell-write] D47 = {ltv!r}")
    ws['D47'] = ltv

    # --- E49: Senior loan interest rate (decimal) ---
    interest_rate = (
        financing.get('interestRate')
        or data.get('interestRate')
        or deal.loan_interest_rate
        or 0
    )
    print(f"[cell-write] E49 = {_to_decimal(interest_rate)!r}")
    ws['E49'] = _to_decimal(interest_rate)

    # --- G8: LP equity share (decimal) ---
    # aequitasEquityPct is Aequitas (GP) share; LP = 1 - GP share
    aeq_pct = _to_decimal(data.get('aequitasEquityPct', 0.5))
    print(f"[cell-write] G8  = {round(1.0 - aeq_pct, 6)!r}")
    ws['G8'] = round(1.0 - aeq_pct, 6)

    # --- H24: Exit cap rate (decimal) ---
    print(f"[cell-write] H24 = {_to_decimal(exit_cap or 0.06)!r}")
    ws['H24'] = _to_decimal(exit_cap or 0.06)

    # --- F17: Hold period in months (integer) ---
    # Read holdingPeriod directly from underwriting_json; do not fall through to loan_term_years
    hold_years = data.get('holdingPeriod') or exit_assumptions.get('holdPeriodYears') or 0
    hold_months_int = int(hold_years * 12)
    print(f"[cell-write] F17 = {hold_months_int!r}")
    ws['F17'] = hold_months_int

    # --- D48: Senior loan term (months) ---
    loan_term_years = financing.get('loanTermYears') or 5
    loan_term_months = int(float(loan_term_years) * 12)
    print(f"[cell-write] D48 = {loan_term_months!r}")
    ws['D48'] = loan_term_months

    # --- D74: Vacancy rate (decimal, all 5 time-period columns) ---
    _vac = round(vacancy_rate, 6)
    for _col in ('D74', 'E74', 'F74', 'G74', 'H74'):
        print(f"[cell-write] {_col} = {_vac!r}")
        ws[_col] = _vac

    # --- D105: General inflation / rent growth rate (decimal) ---
    rent_growth_raw = float(data.get('rentGrowthRate') or 0.02)
    rent_growth_decimal = _to_decimal(rent_growth_raw)
    print(f"[cell-write] D105 = {rent_growth_decimal!r}")
    ws['D105'] = rent_growth_decimal

    # --- K42–K55: Individual opex line items ($/unit/yr) ---
    # Template stores $/unit/yr; platform has annual totals → divide by total_units
    _tu = max(total_units, 1)
    _opex_map = {
        'K42': (op_expenses.get('payroll') or 0) / _tu,
        'K43': (op_expenses.get('administrative') or op_expenses.get('legalProfessional') or 0) / _tu,
        'K44': (op_expenses.get('marketing') or 0) / _tu,
        'K45': (op_expenses.get('repairsMaintenance') or op_expenses.get('repairsMaintenanceAnnual') or 0) / _tu,
        'K52': (op_expenses.get('insurance') or op_expenses.get('insuranceAnnual') or deal.insurance_annual or 0) / _tu,
        'K53': utilities_annual / _tu,
        'K55': (op_expenses.get('propertyTax') or op_expenses.get('propertyTaxAnnual') or deal.property_tax_annual or 0) / _tu,
    }
    for _cell, _val in _opex_map.items():
        if _val > 0:
            print(f"[cell-write] {_cell} = {round(_val, 2)!r}")
            ws[_cell] = round(_val, 2)

    # M88, M89, M105, M106, M118, M119 are left as template formulas.
    # LibreOffice recalculates them from the cash flow rows (V85:EX85, V101:EX101, V115:EX115).

    # --- Save and return ---
    property_name = (data.get('propertyName') or deal.deal_name or 'Property').replace(' ', '_')
    filename = f"{property_name}_ProForma.xlsx"

    # --- Save to temp file, optionally recalc with LibreOffice, read back metrics ---
    import subprocess, time
    timestamp = int(time.time())
    tmp_filename = f"aequitas_export_{deal_id}_{timestamp}.xlsx"
    tmp_path = os.path.join('/tmp', tmp_filename)

    lo_path = (
        '/Applications/LibreOffice.app/Contents/MacOS/soffice'
        if os.path.exists('/Applications/LibreOffice.app/Contents/MacOS/soffice')
        else None
    )

    if lo_path:
        import tempfile
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_in  = os.path.join(tmpdir, filename)
            tmp_out = os.path.join(tmpdir, 'out')
            os.makedirs(tmp_out, exist_ok=True)
            wb.save(tmp_in)
            try:
                result = subprocess.run(
                    [lo_path, '--headless', '--convert-to', 'xlsx',
                     '--outdir', tmp_out, tmp_in],
                    capture_output=True, text=True, timeout=60
                )
                print(f"[LibreOffice] rc={result.returncode} stdout={result.stdout.strip()} stderr={result.stderr.strip()}")
                converted = os.path.join(tmp_out, filename)
                if result.returncode == 0 and os.path.exists(converted):
                    import shutil
                    shutil.copy2(converted, tmp_path)
                    print(f"[LibreOffice] Recalculated file saved to {tmp_path}")
                else:
                    print("[LibreOffice] Conversion failed, saving openpyxl file")
                    wb.save(tmp_path)
            except Exception as lo_err:
                print(f"[LibreOffice] Error: {lo_err} — saving openpyxl file")
                wb.save(tmp_path)
    else:
        print("[LibreOffice] Not found — saving with openpyxl only")
        wb.save(tmp_path)

    # --- Read back recalculated metrics ---
    excel_metrics = {'leveredIRR': None, 'leveredEM': None,
                     'unleveredIRR': None, 'unleveredEM': None,
                     'lpIRR': None, 'lpEM': None}
    try:
        wb_out = load_workbook(tmp_path, data_only=True)
        ws_out = wb_out.worksheets[0]
        excel_metrics['leveredIRR']   = ws_out['M105'].value
        excel_metrics['leveredEM']    = ws_out['M106'].value
        excel_metrics['unleveredIRR'] = ws_out['M88'].value
        excel_metrics['unleveredEM']  = ws_out['M89'].value
        excel_metrics['lpIRR']        = ws_out['M118'].value
        excel_metrics['lpEM']         = ws_out['M119'].value
        print(f"[metrics] leveredIRR={excel_metrics['leveredIRR']!r}")
        print(f"[metrics] leveredEM={excel_metrics['leveredEM']!r}")
        print(f"[metrics] unleveredIRR={excel_metrics['unleveredIRR']!r}")
        print(f"[metrics] unleveredEM={excel_metrics['unleveredEM']!r}")
        print(f"[metrics] lpIRR={excel_metrics['lpIRR']!r}")
        print(f"[metrics] lpEM={excel_metrics['lpEM']!r}")
    except Exception as read_err:
        print(f"[metrics] Failed to read back metrics: {read_err}")

    download_url = f"/api/v1/underwriting/{deal_id}/export-excel/download/{tmp_filename}"
    return jsonify({'downloadUrl': download_url, 'excelMetrics': excel_metrics})


@excel_export_bp.route('/underwriting/<int:deal_id>/export-excel/download/<filename>', methods=['GET'])
def download_export(deal_id, filename):
    """Serve a previously generated export file from /tmp and delete it after sending."""
    # Restrict to safe filenames: only allow the pattern we generate
    import re
    if not re.match(r'^aequitas_export_\d+_\d+\.xlsx$', filename):
        return jsonify({'error': 'Invalid filename'}), 400
    tmp_path = os.path.join('/tmp', filename)
    if not os.path.exists(tmp_path):
        return jsonify({'error': 'Export file not found or already downloaded'}), 404

    def stream_and_delete():
        try:
            with open(tmp_path, 'rb') as f:
                data = f.read()
            yield data
        finally:
            try:
                os.remove(tmp_path)
                print(f"[download] Deleted temp file {tmp_path}")
            except Exception:
                pass

    from flask import Response, stream_with_context
    display_name = filename.replace(f'aequitas_export_{deal_id}_', '').replace('.xlsx', '')
    download_name = f"ProForma_{deal_id}_{display_name}.xlsx"
    return Response(
        stream_with_context(stream_and_delete()),
        mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        headers={'Content-Disposition': f'attachment; filename="{download_name}"'}
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
