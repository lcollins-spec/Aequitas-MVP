"""
Diagnostic: print inputs used by Python IRR vs values written to Excel for Deal 31.
Run from backend/ with:  python debug_deal31.py
"""
import json, sys, os
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.database import db, DealModel

app = create_app()

def to_decimal(value, fallback=0):
    if value is None:
        return fallback
    v = float(value)
    return v / 100 if v > 1 else v

def to_pct(val, default=0.0):
    if val is None:
        return default
    v = float(val)
    return v / 100.0 if v > 1.0 else v

def classify_unit_type(unit_type_str):
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

with app.app_context():
    deal = DealModel.query.get(31)
    if deal is None:
        print("Deal 31 not found!")
        sys.exit(1)

    print(f"\n{'='*70}")
    print(f"  DEAL 31: {deal.deal_name}")
    print(f"{'='*70}\n")

    # ------------------------------------------------------------------ #
    # SECTION A: Python IRR (_compute_metrics) — reads directly from DB   #
    # ------------------------------------------------------------------ #
    purchase_price      = deal.purchase_price or 0.0
    monthly_rent        = deal.monthly_rent or 0.0
    other_income        = deal.other_monthly_income or 0.0
    closing_costs       = deal.closing_costs or 0.0
    loan_term_years     = deal.loan_term_years or 30

    vacancy_rate_py     = to_pct(deal.vacancy_rate, 0.05)
    annual_rent_inc     = to_pct(deal.annual_rent_increase, 0.02)
    down_pct            = to_pct(deal.down_payment_percent, 0.20)
    interest_rate_py    = to_pct(deal.loan_interest_rate, 0.065)
    maintenance_pct     = to_pct(deal.maintenance_percent, 0.0)
    mgmt_pct            = to_pct(deal.property_management_percent, 0.0)

    property_tax_annual = deal.property_tax_annual or 0.0
    insurance_annual    = deal.insurance_annual or 0.0
    hoa_monthly         = deal.hoa_monthly or 0.0
    utilities_monthly   = deal.utilities_monthly or 0.0
    other_exp_monthly   = deal.other_expenses_monthly or 0.0

    loan_amount_py  = purchase_price * (1.0 - down_pct)
    ltv_py          = 1.0 - down_pct

    # NOI (Python)
    gross_monthly        = monthly_rent + other_income
    vacancy_loss         = gross_monthly * vacancy_rate_py
    total_monthly_income = gross_monthly - vacancy_loss
    total_monthly_expenses = (
        property_tax_annual / 12.0
        + insurance_annual / 12.0
        + hoa_monthly
        + monthly_rent * maintenance_pct
        + monthly_rent * mgmt_pct
        + utilities_monthly
        + other_exp_monthly
    )
    annual_noi_py = (total_monthly_income - total_monthly_expenses) * 12.0

    print("━" * 70)
    print("A) PYTHON IRR INPUTS  (from DB fields via _compute_metrics)")
    print("━" * 70)
    print(f"  purchase_price         = ${purchase_price:,.0f}   [deal.purchase_price={deal.purchase_price!r}]")
    print(f"  monthly_rent (DB)      = ${monthly_rent:,.2f}   [deal.monthly_rent={deal.monthly_rent!r}]")
    print(f"  other_monthly_income   = ${other_income:,.2f}   [deal.other_monthly_income={deal.other_monthly_income!r}]")
    print(f"  closing_costs          = ${closing_costs:,.2f}   [deal.closing_costs={deal.closing_costs!r}]")
    print(f"  vacancy_rate           = {vacancy_rate_py:.4f} ({vacancy_rate_py*100:.2f}%)  [raw={deal.vacancy_rate!r}]")
    print(f"  down_payment_percent   = {down_pct:.4f} ({down_pct*100:.2f}%)  [raw={deal.down_payment_percent!r}]")
    print(f"  LTV (derived)          = {ltv_py:.4f} ({ltv_py*100:.2f}%)")
    print(f"  loan_interest_rate     = {interest_rate_py:.4f} ({interest_rate_py*100:.2f}%)  [raw={deal.loan_interest_rate!r}]")
    print(f"  loan_term_years        = {loan_term_years}   [raw={deal.loan_term_years!r}]")
    print(f"  annual_rent_increase   = {annual_rent_inc:.4f} ({annual_rent_inc*100:.2f}%)  [raw={deal.annual_rent_increase!r}]")
    print(f"  property_tax_annual    = ${property_tax_annual:,.2f}   [raw={deal.property_tax_annual!r}]")
    print(f"  insurance_annual       = ${insurance_annual:,.2f}   [raw={deal.insurance_annual!r}]")
    print(f"  hoa_monthly            = ${hoa_monthly:,.2f}   [raw={deal.hoa_monthly!r}]")
    print(f"  utilities_monthly      = ${utilities_monthly:,.2f}   [raw={deal.utilities_monthly!r}]")
    print(f"  maintenance_percent    = {maintenance_pct:.4f} ({maintenance_pct*100:.2f}%)  [raw={deal.maintenance_percent!r}]")
    print(f"  mgmt_percent           = {mgmt_pct:.4f} ({mgmt_pct*100:.2f}%)  [raw={deal.property_management_percent!r}]")
    print(f"  other_expenses_monthly = ${other_exp_monthly:,.2f}   [raw={deal.other_expenses_monthly!r}]")
    print(f"  --- DERIVED ---")
    print(f"  gross_monthly_income   = ${gross_monthly:,.2f}")
    print(f"  vacancy_loss/mo        = ${vacancy_loss:,.2f}")
    print(f"  net_monthly_income     = ${total_monthly_income:,.2f}")
    print(f"  total_monthly_expenses = ${total_monthly_expenses:,.2f}")
    print(f"  annual_NOI (Python)    = ${annual_noi_py:,.2f}")
    print(f"  exit_cap_rate          = [NOT USED in Python IRR — no exit sale assumed]")
    print(f"  unit_mix               = [NOT USED in Python IRR — uses deal.monthly_rent directly]")

    # ------------------------------------------------------------------ #
    # SECTION B: Excel template writes — reads from underwriting_json      #
    # ------------------------------------------------------------------ #
    raw_json = deal.underwriting_json
    data = {}
    if raw_json:
        try:
            data = json.loads(raw_json)
        except Exception as e:
            print(f"\n[WARNING] underwriting_json parse error: {e}")
    else:
        print("\n[WARNING] deal.underwriting_json is NULL — Excel export falls back to DB fields only]")

    financing        = data.get('financing', {}) or {}
    exit_assumptions = data.get('exitAssumptions', {}) or {}
    op_expenses      = data.get('omOperatingExpenses') or data.get('operatingExpenses', {}) or {}
    op_projections   = data.get('operatingProjections', {}) or {}
    unit_mix_list    = data.get('unitMix', []) or []

    # Unit buckets
    unit_buckets = {'studio': [0, 0], '1br': [0, 0], '2br': [0, 0], '3br': [0, 0]}
    for u in unit_mix_list:
        t = classify_unit_type(u.get('unitType', ''))
        if t not in unit_buckets:
            t = 'other'
        if t == 'other':
            continue
        cnt  = u.get('count', 0)
        rent = u.get('askingRent') or u.get('marketRent') or u.get('currentRent') or 0
        unit_buckets[t][0] += cnt
        if rent:
            unit_buckets[t][1] = rent
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

    # NOI for Excel
    total_units_xl = sum(u.get('count', 0) for u in unit_mix_list) or 1
    annual_gross_rent_xl = sum(
        u.get('count', 0) * (u.get('askingRent') or u.get('marketRent') or u.get('currentRent') or 0) * 12
        for u in unit_mix_list
    )
    vacancy_rate_xl = to_decimal(
        data.get('vacancyRate') or op_projections.get('stabilizedVacancy') or deal.vacancy_rate or 0.05
    )
    egi_xl = annual_gross_rent_xl * (1 - vacancy_rate_xl)
    utilities_annual_xl = (
        (op_expenses.get('utilitiesElectric') or 0)
        + (op_expenses.get('utilitiesGas') or 0)
        + (op_expenses.get('utilitiesWaterSewer') or 0)
        + (op_expenses.get('utilitiesTrash') or 0)
        or op_expenses.get('utilitiesAnnual')
        or (deal.utilities_monthly or 0) * 12
    )
    mgmt_fee_pct_xl = to_decimal(
        op_expenses.get('managementFeePct')
        or (deal.property_management_percent if deal.property_management_percent else None)
        or 0.04
    )
    total_opex_xl = (
        (op_expenses.get('payroll') or 0)
        + (op_expenses.get('administrative') or op_expenses.get('legalProfessional') or 0)
        + (op_expenses.get('marketing') or 0)
        + (op_expenses.get('repairsMaintenance') or op_expenses.get('repairsMaintenanceAnnual') or 0)
        + (op_expenses.get('insurance') or op_expenses.get('insuranceAnnual') or deal.insurance_annual or 0)
        + utilities_annual_xl
        + (op_expenses.get('propertyTax') or op_expenses.get('propertyTaxAnnual') or deal.property_tax_annual or 0)
        + mgmt_fee_pct_xl * egi_xl
    )
    ttm_noi_xl = max(egi_xl - total_opex_xl, 0)

    # LTV for Excel
    ltv_xl_raw = financing.get('ltv') or data.get('ltv')
    if ltv_xl_raw is None:
        ltv_xl = 1.0 - (to_decimal(deal.down_payment_percent) if deal.down_payment_percent else 0.35)
    else:
        ltv_xl = to_decimal(ltv_xl_raw)

    interest_rate_xl = to_decimal(
        financing.get('interestRate') or data.get('interestRate') or deal.loan_interest_rate or 0
    )
    exit_cap_raw  = exit_assumptions.get('exitCapRate') or data.get('exitCapRate') or 0
    entry_cap_xl  = to_decimal(data.get('entryCapRate') or exit_cap_raw or 0.06)
    exit_cap_xl   = to_decimal(exit_cap_raw or 0.06)
    hold_years_xl = data.get('holdingPeriod') or exit_assumptions.get('holdPeriodYears') or 0
    hold_months_xl = int(hold_years_xl * 12)
    loan_term_xl  = int(float(financing.get('loanTermYears') or 5) * 12)
    rent_growth_raw = float(data.get('rentGrowthRate') or 0.02)
    rent_growth_xl  = to_decimal(rent_growth_raw)
    aeq_pct_xl    = to_decimal(data.get('aequitasEquityPct', 0.5))
    purchase_price_xl = data.get('purchasePrice') or deal.purchase_price or 0

    _tu = max(total_units_xl, 1)

    print(f"\n{'━'*70}")
    print("B) EXCEL TEMPLATE WRITES  (from underwriting_json / DB fallbacks)")
    print(f"{'━'*70}")
    print(f"  D5   Property Name        = {data.get('propertyName') or deal.deal_name!r}")
    print(f"  D6   Address              = {data.get('address') or deal.property_address!r}")
    print(f"  D25  Purchase Price       = ${purchase_price_xl:,.0f}   [json.purchasePrice={data.get('purchasePrice')!r}]")
    print(f"  D23  TTM NOI              = ${round(ttm_noi_xl):,}")
    print(f"         egi_xl             = ${egi_xl:,.2f}  (annual_gross_rent=${annual_gross_rent_xl:,.2f} × (1-{vacancy_rate_xl:.4f}))")
    print(f"         total_opex_xl      = ${total_opex_xl:,.2f}")
    print(f"  D47  LTV                  = {ltv_xl:.4f} ({ltv_xl*100:.2f}%)  [financing.ltv={financing.get('ltv')!r}]")
    print(f"  E49  Interest Rate        = {interest_rate_xl:.4f} ({interest_rate_xl*100:.2f}%)  [financing.interestRate={financing.get('interestRate')!r}]")
    print(f"  E24  Entry Cap Rate       = {entry_cap_xl:.4f} ({entry_cap_xl*100:.2f}%)  [json.entryCapRate={data.get('entryCapRate')!r}]")
    print(f"  H24  Exit Cap Rate        = {exit_cap_xl:.4f} ({exit_cap_xl*100:.2f}%)  [exitAssumptions.exitCapRate={exit_assumptions.get('exitCapRate')!r}]")
    print(f"  F17  Hold Period (months) = {hold_months_xl}  ({hold_years_xl} yrs)  [json.holdingPeriod={data.get('holdingPeriod')!r}]")
    print(f"  D48  Loan Term (months)   = {loan_term_xl}  [financing.loanTermYears={financing.get('loanTermYears')!r}]")
    print(f"  D74  Vacancy Rate         = {vacancy_rate_xl:.4f} ({vacancy_rate_xl*100:.2f}%)  [json.vacancyRate={data.get('vacancyRate')!r}]")
    print(f"  D105 Rent Growth Rate     = {rent_growth_xl:.4f} ({rent_growth_xl*100:.2f}%)  [json.rentGrowthRate={data.get('rentGrowthRate')!r}]")
    print(f"  G8   LP Equity Share      = {round(1.0 - aeq_pct_xl, 6):.4f}  [json.aequitasEquityPct={data.get('aequitasEquityPct')!r}]")
    print(f"  --- Unit Mix ---")
    print(f"  D60/E60  Studio  count={unit_buckets['studio'][0]}  rent=${unit_buckets['studio'][1]}")
    print(f"  D61/E61  1BR     count={unit_buckets['1br'][0]}  rent=${unit_buckets['1br'][1]}")
    print(f"  D62/E62  2BR     count={unit_buckets['2br'][0]}  rent=${unit_buckets['2br'][1]}")
    print(f"  D63/E63  3BR     count={unit_buckets['3br'][0]}  rent=${unit_buckets['3br'][1]}")
    print(f"  total_units_xl            = {total_units_xl}")
    print(f"  --- OpEx ($/unit/yr) written to K42-K55 ---")
    print(f"  K42  payroll              = {(op_expenses.get('payroll') or 0)/_tu:.2f}  [raw={op_expenses.get('payroll')!r}]")
    print(f"  K43  admin/legal          = {(op_expenses.get('administrative') or op_expenses.get('legalProfessional') or 0)/_tu:.2f}")
    print(f"  K44  marketing            = {(op_expenses.get('marketing') or 0)/_tu:.2f}")
    print(f"  K45  repairs/maint        = {(op_expenses.get('repairsMaintenance') or op_expenses.get('repairsMaintenanceAnnual') or 0)/_tu:.2f}")
    print(f"  K52  insurance            = {(op_expenses.get('insurance') or op_expenses.get('insuranceAnnual') or deal.insurance_annual or 0)/_tu:.2f}")
    print(f"  K53  utilities            = {utilities_annual_xl/_tu:.2f}")
    print(f"  K55  property tax         = {(op_expenses.get('propertyTax') or op_expenses.get('propertyTaxAnnual') or deal.property_tax_annual or 0)/_tu:.2f}")

    print(f"\n{'━'*70}")
    print("C) DIVERGENCE SUMMARY")
    print(f"{'━'*70}")
    print(f"  PURCHASE PRICE:   Python=${purchase_price:,.0f}  |  Excel=${purchase_price_xl:,.0f}   {'MATCH' if purchase_price == purchase_price_xl else '*** MISMATCH ***'}")
    print(f"  LTV:              Python={ltv_py:.4f}  |  Excel={ltv_xl:.4f}   {'MATCH' if abs(ltv_py - ltv_xl) < 0.0001 else '*** MISMATCH ***'}")
    print(f"  INTEREST RATE:    Python={interest_rate_py:.4f}  |  Excel={interest_rate_xl:.4f}   {'MATCH' if abs(interest_rate_py - interest_rate_xl) < 0.0001 else '*** MISMATCH ***'}")
    print(f"  VACANCY:          Python={vacancy_rate_py:.4f}  |  Excel={vacancy_rate_xl:.4f}   {'MATCH' if abs(vacancy_rate_py - vacancy_rate_xl) < 0.0001 else '*** MISMATCH ***'}")
    print(f"  RENT GROWTH:      Python={annual_rent_inc:.4f}  |  Excel={rent_growth_xl:.4f}   {'MATCH' if abs(annual_rent_inc - rent_growth_xl) < 0.0001 else '*** MISMATCH ***'}")
    print(f"  NOI:              Python=${annual_noi_py:,.0f}  |  Excel TTM NOI=${round(ttm_noi_xl):,}   {'MATCH' if abs(annual_noi_py - ttm_noi_xl) < 1 else '*** MISMATCH ***'}")
    print(f"  HOLD PERIOD:      Python=[30yr fixed]  |  Excel={hold_months_xl}mo ({hold_years_xl}yr)")
    print(f"  EXIT CAP RATE:    Python=[not used]  |  Excel={exit_cap_xl:.4f}")

    print(f"\n{'='*70}")
    print("RAW underwriting_json keys present:")
    if data:
        for k in sorted(data.keys()):
            val = data[k]
            if isinstance(val, (dict, list)):
                print(f"  {k}: {type(val).__name__} ({len(val)} items)")
            else:
                print(f"  {k}: {val!r}")
    else:
        print("  (none — json is null or empty)")
    print(f"{'='*70}\n")
