"""
Python dataclasses for deal entities
Provides type-safe Python objects for business logic layer
"""
from dataclasses import dataclass, field
from typing import Optional
from datetime import datetime


@dataclass
class Deal:
    """
    Business entity representing a real estate deal
    """
    # Required fields
    deal_name: str
    location: str

    # Optional ID (None for new deals)
    id: Optional[int] = None

    # Status
    status: str = 'potential'
    gp_id: Optional[int] = None

    # Timestamps
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    # Property Information
    property_address: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None

    # Purchase Details
    purchase_price: Optional[float] = None
    down_payment_percent: Optional[float] = None
    loan_interest_rate: Optional[float] = None
    loan_term_years: Optional[int] = None
    closing_costs: Optional[float] = None

    # Income
    monthly_rent: Optional[float] = None
    other_monthly_income: Optional[float] = None
    vacancy_rate: Optional[float] = None
    annual_rent_increase: Optional[float] = None

    # Expenses
    property_tax_annual: Optional[float] = None
    insurance_annual: Optional[float] = None
    hoa_monthly: Optional[float] = None
    maintenance_percent: Optional[float] = None
    property_management_percent: Optional[float] = None
    utilities_monthly: Optional[float] = None
    other_expenses_monthly: Optional[float] = None

    # Property Details
    bedrooms: Optional[int] = None
    bathrooms: Optional[float] = None
    square_footage: Optional[int] = None
    property_type: Optional[str] = None
    year_built: Optional[int] = None

    # Market Data Snapshots (JSON strings)
    rentcast_data: Optional[str] = None
    fred_data: Optional[str] = None
    underwriting_json: Optional[str] = None

    # Calculated Metrics
    monthly_payment: Optional[float] = None
    total_monthly_income: Optional[float] = None
    total_monthly_expenses: Optional[float] = None
    monthly_cash_flow: Optional[float] = None
    cash_on_cash_return: Optional[float] = None
    cap_rate: Optional[float] = None
    roi: Optional[float] = None
    npv: Optional[float] = None
    irr: Optional[float] = None
    equity_multiple: Optional[float] = None

    def to_dict(self):
        """Convert to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'dealName': self.deal_name,
            'location': self.location,
            'status': self.status,
            'gpId': self.gp_id,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,

            # Property Information
            'propertyAddress': self.property_address,
            'latitude': self.latitude,
            'longitude': self.longitude,

            # Purchase Details
            'purchasePrice': self.purchase_price,
            'downPaymentPercent': self.down_payment_percent,
            'loanInterestRate': self.loan_interest_rate,
            'loanTermYears': self.loan_term_years,
            'closingCosts': self.closing_costs,

            # Income
            'monthlyRent': self.monthly_rent,
            'otherMonthlyIncome': self.other_monthly_income,
            'vacancyRate': self.vacancy_rate,
            'annualRentIncrease': self.annual_rent_increase,

            # Expenses
            'propertyTaxAnnual': self.property_tax_annual,
            'insuranceAnnual': self.insurance_annual,
            'hoaMonthly': self.hoa_monthly,
            'maintenancePercent': self.maintenance_percent,
            'propertyManagementPercent': self.property_management_percent,
            'utilitiesMonthly': self.utilities_monthly,
            'otherExpensesMonthly': self.other_expenses_monthly,

            # Property Details
            'bedrooms': self.bedrooms,
            'bathrooms': self.bathrooms,
            'squareFootage': self.square_footage,
            'propertyType': self.property_type,
            'yearBuilt': self.year_built,

            # Market Data
            'rentcastData': self.rentcast_data,
            'fredData': self.fred_data,
            'underwritingJson': self.underwriting_json,

            # Calculated Metrics
            'monthlyPayment': self.monthly_payment,
            'totalMonthlyIncome': self.total_monthly_income,
            'totalMonthlyExpenses': self.total_monthly_expenses,
            'monthlyCashFlow': self.monthly_cash_flow,
            'cashOnCashReturn': self.cash_on_cash_return,
            'capRate': self.cap_rate,
            'roi': self.roi,
            'npv': self.npv,
            'irr': self.irr,
            'equityMultiple': self.equity_multiple
        }

    @staticmethod
    def from_dict(data: dict) -> 'Deal':
        """Create a Deal from a dictionary"""
        # Parse timestamps if present
        created_at = None
        if data.get('createdAt'):
            if isinstance(data['createdAt'], str):
                created_at = datetime.fromisoformat(data['createdAt'].replace('Z', '+00:00'))
            elif isinstance(data['createdAt'], datetime):
                created_at = data['createdAt']

        updated_at = None
        if data.get('updatedAt'):
            if isinstance(data['updatedAt'], str):
                updated_at = datetime.fromisoformat(data['updatedAt'].replace('Z', '+00:00'))
            elif isinstance(data['updatedAt'], datetime):
                updated_at = data['updatedAt']

        return Deal(
            id=data.get('id'),
            deal_name=data.get('dealName', ''),
            location=data.get('location', ''),
            status=data.get('status', 'potential'),
            gp_id=data.get('gpId'),
            created_at=created_at,
            updated_at=updated_at,

            # Property Information
            property_address=data.get('propertyAddress'),
            latitude=data.get('latitude'),
            longitude=data.get('longitude'),

            # Purchase Details
            purchase_price=data.get('purchasePrice'),
            down_payment_percent=data.get('downPaymentPercent'),
            loan_interest_rate=data.get('loanInterestRate'),
            loan_term_years=data.get('loanTermYears'),
            closing_costs=data.get('closingCosts'),

            # Income
            monthly_rent=data.get('monthlyRent'),
            other_monthly_income=data.get('otherMonthlyIncome'),
            vacancy_rate=data.get('vacancyRate'),
            annual_rent_increase=data.get('annualRentIncrease'),

            # Expenses
            property_tax_annual=data.get('propertyTaxAnnual'),
            insurance_annual=data.get('insuranceAnnual'),
            hoa_monthly=data.get('hoaMonthly'),
            maintenance_percent=data.get('maintenancePercent'),
            property_management_percent=data.get('propertyManagementPercent'),
            utilities_monthly=data.get('utilitiesMonthly'),
            other_expenses_monthly=data.get('otherExpensesMonthly'),

            # Property Details
            bedrooms=data.get('bedrooms'),
            bathrooms=data.get('bathrooms'),
            square_footage=data.get('squareFootage'),
            property_type=data.get('propertyType'),
            year_built=data.get('yearBuilt'),

            # Market Data
            rentcast_data=data.get('rentcastData'),
            fred_data=data.get('fredData'),
            underwriting_json=data.get('underwritingJson'),

            # Calculated Metrics
            monthly_payment=data.get('monthlyPayment'),
            total_monthly_income=data.get('totalMonthlyIncome'),
            total_monthly_expenses=data.get('totalMonthlyExpenses'),
            monthly_cash_flow=data.get('monthlyCashFlow'),
            cash_on_cash_return=data.get('cashOnCashReturn'),
            cap_rate=data.get('capRate'),
            roi=data.get('roi'),
            npv=data.get('npv'),
            irr=data.get('irr'),
            equity_multiple=data.get('equityMultiple')
        )
