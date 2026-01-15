#!/usr/bin/env python3
"""
Test script for Excel export functionality
Run this to test the underwriting model generation with demo data
"""

import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from build_underwriting_model import create_underwriting_model
from datetime import datetime

# Demo data matching the Fresno property from the Excel file
demo_data = {
    'propertyName': 'Deal - 2297 E Shaw Ave',
    'address': '2297 E Shaw Ave',
    'city': 'Fresno',
    'county': 'Fresno County',
    'state': 'CA',
    'zipCode': '93704',
    'yearBuilt': 1985,
    'buildingType': 'Garden Style',
    'numberOfBuildings': 4,
    'parkingSpaces': 300,

    'purchasePrice': 4100000,
    'acquisitionDate': datetime(2026, 1, 14),
    'earnestMoneyPct': 0.02,
    'constructionCostPct': 0.10,
    'closingCostsPct': 0.03,
    'dueDiligenceCosts': 50000,

    # Unit mix for 200 units
    'unitMix': [
        {
            'unitType': '1BR/1BA',
            'count': 60,
            'avgSf': 650,
            'currentRent': 1309,
            'marketRent': 1540
        },
        {
            'unitType': '2BR/2BA',
            'count': 100,
            'avgSf': 900,
            'currentRent': 1540,
            'marketRent': 1771
        },
        {
            'unitType': '3BR/2BA',
            'count': 40,
            'avgSf': 1100,
            'currentRent': 1848,
            'marketRent': 2156
        }
    ],

    'physicalOccupancy': 0.95,
    'economicOccupancy': 0.90,
    'vacancyRate': 0.05,
    'badDebtRate': 0.00,
    'vacancyLossAnnual': 184800,
    'concessionsAnnual': 20000,
    'badDebtAnnual': 0,

    'otherIncome': {
        'laundryPerUnit': 15,
        'petRentPerUnit': 25,
        'parkingPerSpace': 30,
        'otherPerUnit': 10
    },

    'operatingExpenses': {
        'propertyTax': 45100,
        'insurance': 120000,
        'utilitiesElectric': 120000,
        'utilitiesGas': 72000,
        'utilitiesWaterSewer': 96000,
        'utilitiesTrash': 60000,
        'repairsMaintenance': 100000,
        'payroll': 70000,
        'managementFeePct': 0.04,
        'marketing': 20000,
        'legalProfessional': 25000,
        'administrative': 30000
    },

    'renovationBudget': {
        'contingencyPct': 0.10
    },

    'operatingProjections': {
        'marketRentGrowth': 0.03,
        'inplaceRentGrowth': 0.025,
        'otherIncomeGrowth': 0.03,
        'opexGrowth': 0.03,
        'stabilizedVacancy': 0.05,
        'capexPerUnitAnnual': 400
    },

    'financing': {
        'loanType': 'Agency Fixed',
        'ltv': 0.70,
        'interestRate': 0.065,
        'amortizationYears': 30,
        'loanTermYears': 30,
        'originationFeePct': 0.01,
        'lenderLegalDd': 25000
    },

    'exitAssumptions': {
        'holdPeriodYears': 10,
        'exitCapRate': 0.06,
        'saleCostsPct': 0.04
    },

    'propertyTax': {
        'countyTaxRate': 0.011,
        'prop13Cap': 0.02,
        'specialAssessments': 0
    }
}

def main():
    print("=" * 60)
    print("EXCEL EXPORT TEST - Aequitas Underwriting Model")
    print("=" * 60)
    print()

    print(f"Property: {demo_data['propertyName']}")
    print(f"Location: {demo_data['city']}, {demo_data['state']}")
    print(f"County: {demo_data['county']}")
    print(f"ZIP Code: {demo_data['zipCode']}")
    print(f"Purchase Price: ${demo_data['purchasePrice']:,}")
    print(f"Total Units: {sum(unit['count'] for unit in demo_data['unitMix'])}")
    print()

    print("Generating Excel workbook...")
    try:
        wb = create_underwriting_model(demo_data)

        # Save to test location
        timestamp = datetime.now().strftime('%Y-%m-%d_%H%M%S')
        output_path = f"/Users/rajvardhan/Desktop/Projects/Aequitas-MVP/images/Test_{demo_data['propertyName'].replace(' ', '_')}_Underwriting_{timestamp}.xlsx"
        wb.save(output_path)

        print(f"✓ Excel model created successfully!")
        print(f"✓ Saved to: {output_path}")
        print(f"✓ Tabs included: {', '.join([ws.title for ws in wb.worksheets])}")
        print()

        # Verify calculations
        print("Verification:")
        print(f"  - Workbook calculation mode: {wb.calculation.calcMode}")
        print(f"  - Full calc on load: {wb.calculation.fullCalcOnLoad}")
        print(f"  - Number of sheets: {len(wb.worksheets)}")
        print(f"  - Named ranges defined: {len(wb.defined_names)}")
        print()

        print("✓ Test completed successfully!")
        print()
        print("NEXT STEPS:")
        print("1. Open the Excel file in Microsoft Excel or LibreOffice")
        print("2. Check the ASSUMPTIONS tab - all fields should have values")
        print("3. Check SOURCES & USES tab - should show calculated totals")
        print("4. Check ANNUAL CASH FLOW tab - should show 10-year projections")
        print("5. Verify that formulas calculate correctly (no #NAME? or NaN errors)")

    except Exception as e:
        print(f"✗ Error generating Excel: {str(e)}")
        import traceback
        traceback.print_exc()
        return 1

    return 0

if __name__ == "__main__":
    sys.exit(main())
