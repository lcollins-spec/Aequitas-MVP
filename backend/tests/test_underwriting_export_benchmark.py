"""Golden benchmark for the underwriting Excel export.

The v16 template descends from the hand-built source model
"Milestone + Trails - v8 (External).xlsx" (May 28 2026). Exporting that
model's exact inputs through /api/v2/underwriting/export must reproduce the
results Excel calculated and saved in it. Any template or export change that
moves these numbers fails here — this is the check that would have caught
the Jul 29 exit-tax add-back (which overstated levered IRR 17.09% -> 19.45%).

Recalculation uses LibreOffice headless. LibreOffice can't evaluate the
negative-width SUM(OFFSET(cell,,,,-12)) in row 83 (TTM NOI), so recalc()
rewrites it to the equivalent positive-width OFFSET(cell,,-11,,12) before
recalculating. Excel gives identical results for both forms.
"""
import io
import os
import re
import shutil
import subprocess
import sys
import tempfile
import unittest

import openpyxl

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import create_app

LIBREOFFICE = shutil.which('soffice') or (
    '/Applications/LibreOffice.app/Contents/MacOS/soffice'
    if os.path.exists('/Applications/LibreOffice.app/Contents/MacOS/soffice')
    else None
)

UNITS = 56

# Inputs exactly as typed into Milestone + Trails v8 (External).
V8_PAYLOAD = {
    "propertyName": "Milestone and Trails Portfolio",
    "address": "5070 Warm Springs Rd & 4531 Milgen Rd, Columbus, GA",
    "acquisitionDate": "2026-06-01",
    "holdPeriodYears": 10,
    "bridgePeriodMonths": 24,
    "ttmNoi": 557219.8628,
    "purchasePrice": 6700000,
    "entryCapRate": 0.0831671437014925,
    "salesCostPct": 0.02,
    "closingCostPct": 0.0075,
    "acquisitionFeePct": 0,
    "workingCapitalPerUnit": 495432.59 / UNITS,
    "additionalFeesTotal": 0,
    "lpEquityShare": 0.85,
    "unitMix": [
        {"unitType": "2bd/2ba - 5070", "count": 32, "askingRent": 1230.39, "avgSf": 1100},
        {"unitType": "2bd/2ba - 4531", "count": 24, "askingRent": 1241.67, "avgSf": 1250},
    ],
    "rubsPct": 0.7,
    "parkingPerUnitMo": 0,
    "otherIncomePerUnitMo": 75,
    "lossToLeaseRate": [0.0125, 0.0125, 0.0125, 0.0125, 0.0125],
    "vacancyRate": [0.08, 0.07, 0.06, 0.06, 0.06],
    "badDebtRate": [0.01, 0.01, 0.01, 0.01, 0.01],
    "concessionsRate": [0.02, 0.01, 0.01, 0.0, 0.0],
    "nonRevenueUnits": [0, 0, 0, 0, 0],
    "managementFeePct": 0.02,
    "capReservePerUnit": 250,
    "opexPayrollPerUnit": 0,
    "opexAdminPerUnit": 1183.48,
    "opexMarketingPerUnit": 0,
    "opexRmPerUnit": 440.82,
    "opexContractServicePerUnit": 227.14,
    "opexTurnoverPerUnit": 291.07,
    "opexOtherPerUnit": 0,
    "opexInsurancePerUnit": 642.86,
    "opexInsurancePerUnitConfirmed": True,
    # v8 has no separate insurance growth input — insurance grows with opex.
    "insuranceGrowthRate": 0.02,
    "opexUtilitiesPerUnit": 331.47,
    "opexPropertyTaxPerUnit": 1498.94,
    "seniorLtvPct": 4700000 / 6700000,
    "seniorInterestRate": 0.0652,
    "seniorFinancingCostsPct": 0.01,
    "seniorIoPeriods": 24,
    "refiTermMonths": 360,
    "refiInterestRate": 0.0625,
    "refiFinancingCostsPct": 0.005,
    "refiIoPeriods": 24,
    "rentGrowthRate": 0.02,
    "opexGrowthRate": 0.02,
    "exitCapRate": 0.0675,
    "amFeePct": 0.01,
    "pariPassu": 0,
    "preferredReturnPct": 0.08,
    "gpPromotePct": 0.30,
    "assessedValue": 0,
    "assessedValueNextBuyer": 0,
    "assessmentPct": 1.0,
    "millageRate": 0.018926798044730162,
    "specialAssessments": 0,
    "abatementPctSchedule": [0, 0, 0, 0, 0],
}

# Results Excel saved in Milestone + Trails v8 (External), by Pro Forma cell.
V8_RESULTS = {
    'D37': ('Acquisition price', 6700000.000000003),
    'D41': ('Total uses', 7292682.590000003),
    'D46': ('Senior loan', 4700000),
    'D32': ('LP equity', 2203780.2015000023),
    'D31': ('GP equity', 388902.38850000047),
    'G46': ('Refi loan', 5791820.016635164),
    'G22': ('Exit NOI', 644204.9110898671),
    'G24': ('Exit value', 9543776.460590623),
    'C10': ('Unlevered IRR', 0.10095623213126181),
    'C11': ('Unlevered EM', 2.0982943549719413),
    'D10': ('Levered IRR', 0.17086737258453377),
    'D11': ('Levered EM', 2.7187031450854358),
    'D8': ('Levered net profit', 4456051.721641258),
    'F10': ('LP IRR', 0.17533123444698462),
    'F11': ('LP EM', 2.5741801978394983),
    'F8': ('LP net profit', 3469147.1535920426),
    'G10': ('GP IRR', 0.15522235560537045),
    'G11': ('GP EM', 3.537666512812415),
    'G8': ('GP net profit', 986904.5680492151),
}


def recalc(xlsx_bytes):
    """Recalculate an export via LibreOffice headless and return the evaluated
    workbook (see module docstring for the row 83 OFFSET rewrite)."""
    wb = openpyxl.load_workbook(io.BytesIO(xlsx_bytes))
    for cell in wb['Pro Forma'][83]:
        if isinstance(cell.value, str):
            cell.value = re.sub(r'OFFSET\(([A-Z]+79),,,,-12\)', r'OFFSET(\1,,-11,,12)', cell.value)
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, 'in.xlsx')
        wb.save(src)
        out_dir = os.path.join(tmp, 'out')
        subprocess.run(
            [LIBREOFFICE, '--headless', '--norestore',
             f'-env:UserInstallation=file://{os.path.join(tmp, "lo_profile")}',
             '--convert-to', 'xlsx:Calc MS Excel 2007 XML',
             '--outdir', out_dir, src],
            check=True, capture_output=True, timeout=120,
        )
        with open(os.path.join(out_dir, 'in.xlsx'), 'rb') as f:
            return openpyxl.load_workbook(io.BytesIO(f.read()), data_only=True)


def export_and_recalc(client, payload):
    resp = client.post('/api/v2/underwriting/export', json=payload)
    assert resp.status_code == 200, resp.get_data(as_text=True)
    return recalc(resp.data)['Pro Forma']


@unittest.skipUnless(LIBREOFFICE, 'LibreOffice not available for formula recalculation')
class UnderwritingExportBenchmarkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.client = create_app().test_client()
        cls.ws = export_and_recalc(cls.client, V8_PAYLOAD)

    def test_purchase_price_drives_acquisition_when_cap_rate_disagrees(self):
        """Villa Christina: NOI / entry cap implies $18.5M but the price is
        $16.5M. Sources & Uses must spend the purchase price; the cap-rate
        valuation is display only."""
        payload = dict(V8_PAYLOAD, ttmNoi=1100234, purchasePrice=16500000, entryCapRate=0.059472,
                       seniorLtvPct=0.65)
        ws = export_and_recalc(self.client, payload)
        self.assertAlmostEqual(ws['D37'].value, 16500000, delta=1.0)
        self.assertAlmostEqual(ws['D24'].value, 1100234 / 0.059472, delta=1.0)

    def test_blank_noi_still_prices_at_purchase_price(self):
        ws = export_and_recalc(self.client, dict(V8_PAYLOAD, ttmNoi=0))
        self.assertAlmostEqual(ws['D37'].value, 6700000, delta=1.0)
        self.assertGreater(ws['D32'].value, 0, 'LP equity must stay positive')

    def test_export_reproduces_v8_results(self):
        for cell, (label, expected) in V8_RESULTS.items():
            with self.subTest(cell=cell, label=label):
                actual = self.ws[cell].value
                self.assertIsInstance(actual, (int, float), f'{label} ({cell}) did not calculate: {actual!r}')
                if abs(expected) < 10:   # rates and multiples
                    self.assertAlmostEqual(actual, expected, places=6, msg=label)
                else:                    # dollar amounts
                    self.assertAlmostEqual(actual, expected, delta=1.0, msg=label)


if __name__ == '__main__':
    unittest.main()
