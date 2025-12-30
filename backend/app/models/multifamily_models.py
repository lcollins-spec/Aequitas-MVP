"""
Multifamily underwriting data models
Supports comprehensive NOAH (Naturally Occurring Affordable Housing) underwriting
"""
from dataclasses import dataclass, field
from typing import List, Optional, Dict
from datetime import datetime


@dataclass
class UnitType:
    """Represents a unit type in the unit mix"""
    unit_type: str  # e.g., "Studio", "1BR/1BA", "2BR/2BA"
    count: int
    avg_sf: int
    current_rent: float  # Monthly rent
    market_rent: float   # Post-renovation market rent
    renovation_cost_per_unit: float


@dataclass
class OperatingExpenses:
    """T12 operating expenses"""
    property_tax: float
    insurance: float
    utilities_electric: float
    utilities_gas: float
    utilities_water_sewer: float
    utilities_trash: float
    repairs_maintenance: float
    payroll: float
    management_fee_pct: float  # % of EGI
    marketing: float
    legal_professional: float
    administrative: float


@dataclass
class OtherIncome:
    """Other income sources per unit/space/month"""
    laundry_per_unit: float = 15.0
    pet_rent_per_unit: float = 25.0
    parking_per_space: float = 30.0
    other_per_unit: float = 10.0


@dataclass
class RenovationBudget:
    """Renovation and capital improvement budget"""
    common_area_exterior: float = 100000.0
    contingency_pct: float = 0.10


@dataclass
class OperatingProjections:
    """Growth rates and stabilized assumptions"""
    market_rent_growth: float = 0.03  # 3% annual
    inplace_rent_growth: float = 0.025  # 2.5% annual
    other_income_growth: float = 0.03
    opex_growth: float = 0.03
    stabilized_vacancy: float = 0.05  # 5%
    capex_per_unit_annual: float = 400.0


@dataclass
class FinancingTerms:
    """Loan terms and structure"""
    loan_type: str = "Agency Fixed"  # or "Bridge Floating"
    ltv: float = 0.70  # 70%
    interest_rate: float = 0.06  # 6%
    amortization_years: int = 30
    loan_term_years: int = 10
    origination_fee_pct: float = 0.01
    lender_legal_dd: float = 25000.0


@dataclass
class ExitAssumptions:
    """Sale/exit assumptions"""
    hold_period_years: int = 5
    exit_cap_rate: float = 0.055  # 5.5%
    sale_costs_pct: float = 0.04  # 4%


@dataclass
class PropertyTaxAssumptions:
    """Property tax parameters"""
    county_tax_rate: float = 0.011  # 1.1%
    prop13_cap: float = 0.02  # 2% max annual increase (California)
    special_assessments: float = 0.0


@dataclass
class MultifamilyUnderwriting:
    """
    Complete multifamily underwriting dataset
    All data needed to generate the Excel model
    """
    # Property Information
    property_name: str
    address: str
    city: str
    county: str
    state: str
    zip_code: str
    year_built: int
    building_type: str  # "Garden Style", "Mid-Rise", etc.
    number_of_buildings: int
    parking_spaces: int

    # Acquisition
    purchase_price: float
    acquisition_date: datetime
    earnest_money_pct: float = 0.02
    closing_costs_pct: float = 0.03
    due_diligence_costs: float = 50000.0

    # Unit Mix
    unit_mix: List[UnitType] = field(default_factory=list)

    # Current Operations (T12)
    physical_occupancy: float = 0.90
    economic_occupancy: float = 0.87
    vacancy_loss_annual: float = 150000.0
    concessions_annual: float = 20000.0
    bad_debt_annual: float = 25000.0

    # Components
    other_income: OtherIncome = field(default_factory=OtherIncome)
    operating_expenses: Optional[OperatingExpenses] = None
    renovation_budget: RenovationBudget = field(default_factory=RenovationBudget)
    operating_projections: OperatingProjections = field(default_factory=OperatingProjections)
    financing: FinancingTerms = field(default_factory=FinancingTerms)
    exit_assumptions: ExitAssumptions = field(default_factory=ExitAssumptions)
    property_tax: PropertyTaxAssumptions = field(default_factory=PropertyTaxAssumptions)

    # Optional metadata
    deal_id: Optional[int] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    def to_dict(self) -> Dict:
        """Convert to dictionary for JSON serialization"""
        return {
            'propertyName': self.property_name,
            'address': self.address,
            'city': self.city,
            'county': self.county,
            'state': self.state,
            'zipCode': self.zip_code,
            'yearBuilt': self.year_built,
            'buildingType': self.building_type,
            'numberOfBuildings': self.number_of_buildings,
            'parkingSpaces': self.parking_spaces,

            'purchasePrice': self.purchase_price,
            'acquisitionDate': self.acquisition_date.isoformat() if self.acquisition_date else None,
            'earnestMoneyPct': self.earnest_money_pct,
            'closingCostsPct': self.closing_costs_pct,
            'dueDiligenceCosts': self.due_diligence_costs,

            'unitMix': [
                {
                    'unitType': u.unit_type,
                    'count': u.count,
                    'avgSf': u.avg_sf,
                    'currentRent': u.current_rent,
                    'marketRent': u.market_rent,
                    'renovationCostPerUnit': u.renovation_cost_per_unit
                } for u in self.unit_mix
            ],

            'physicalOccupancy': self.physical_occupancy,
            'economicOccupancy': self.economic_occupancy,
            'vacancyLossAnnual': self.vacancy_loss_annual,
            'concessionsAnnual': self.concessions_annual,
            'badDebtAnnual': self.bad_debt_annual,

            'otherIncome': {
                'laundryPerUnit': self.other_income.laundry_per_unit,
                'petRentPerUnit': self.other_income.pet_rent_per_unit,
                'parkingPerSpace': self.other_income.parking_per_space,
                'otherPerUnit': self.other_income.other_per_unit
            },

            'operatingExpenses': {
                'propertyTax': self.operating_expenses.property_tax,
                'insurance': self.operating_expenses.insurance,
                'utilitiesElectric': self.operating_expenses.utilities_electric,
                'utilitiesGas': self.operating_expenses.utilities_gas,
                'utilitiesWaterSewer': self.operating_expenses.utilities_water_sewer,
                'utilitiesTrash': self.operating_expenses.utilities_trash,
                'repairsMaintenance': self.operating_expenses.repairs_maintenance,
                'payroll': self.operating_expenses.payroll,
                'managementFeePct': self.operating_expenses.management_fee_pct,
                'marketing': self.operating_expenses.marketing,
                'legalProfessional': self.operating_expenses.legal_professional,
                'administrative': self.operating_expenses.administrative
            } if self.operating_expenses else None,

            'renovationBudget': {
                'commonAreaExterior': self.renovation_budget.common_area_exterior,
                'contingencyPct': self.renovation_budget.contingency_pct
            },

            'operatingProjections': {
                'marketRentGrowth': self.operating_projections.market_rent_growth,
                'inplaceRentGrowth': self.operating_projections.inplace_rent_growth,
                'otherIncomeGrowth': self.operating_projections.other_income_growth,
                'opexGrowth': self.operating_projections.opex_growth,
                'stabilizedVacancy': self.operating_projections.stabilized_vacancy,
                'capexPerUnitAnnual': self.operating_projections.capex_per_unit_annual
            },

            'financing': {
                'loanType': self.financing.loan_type,
                'ltv': self.financing.ltv,
                'interestRate': self.financing.interest_rate,
                'amortizationYears': self.financing.amortization_years,
                'loanTermYears': self.financing.loan_term_years,
                'originationFeePct': self.financing.origination_fee_pct,
                'lenderLegalDd': self.financing.lender_legal_dd
            },

            'exitAssumptions': {
                'holdPeriodYears': self.exit_assumptions.hold_period_years,
                'exitCapRate': self.exit_assumptions.exit_cap_rate,
                'saleCostsPct': self.exit_assumptions.sale_costs_pct
            },

            'propertyTax': {
                'countyTaxRate': self.property_tax.county_tax_rate,
                'prop13Cap': self.property_tax.prop13_cap,
                'specialAssessments': self.property_tax.special_assessments
            },

            'dealId': self.deal_id,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

    @staticmethod
    def from_dict(data: Dict) -> 'MultifamilyUnderwriting':
        """Create from dictionary"""
        # Parse unit mix
        unit_mix = []
        for u in data.get('unitMix', []):
            unit_mix.append(UnitType(
                unit_type=u['unitType'],
                count=u['count'],
                avg_sf=u['avgSf'],
                current_rent=u['currentRent'],
                market_rent=u['marketRent'],
                renovation_cost_per_unit=u['renovationCostPerUnit']
            ))

        # Parse operating expenses
        opex_data = data.get('operatingExpenses')
        operating_expenses = None
        if opex_data:
            operating_expenses = OperatingExpenses(
                property_tax=opex_data['propertyTax'],
                insurance=opex_data['insurance'],
                utilities_electric=opex_data['utilitiesElectric'],
                utilities_gas=opex_data['utilitiesGas'],
                utilities_water_sewer=opex_data['utilitiesWaterSewer'],
                utilities_trash=opex_data['utilitiesTrash'],
                repairs_maintenance=opex_data['repairsMaintenance'],
                payroll=opex_data['payroll'],
                management_fee_pct=opex_data['managementFeePct'],
                marketing=opex_data['marketing'],
                legal_professional=opex_data['legalProfessional'],
                administrative=opex_data['administrative']
            )

        # Parse acquisition date
        acq_date = data.get('acquisitionDate')
        if isinstance(acq_date, str):
            acq_date = datetime.fromisoformat(acq_date.replace('Z', '+00:00'))
        elif acq_date is None:
            acq_date = datetime.now()

        return MultifamilyUnderwriting(
            property_name=data['propertyName'],
            address=data['address'],
            city=data['city'],
            county=data['county'],
            state=data['state'],
            zip_code=data['zipCode'],
            year_built=data['yearBuilt'],
            building_type=data['buildingType'],
            number_of_buildings=data['numberOfBuildings'],
            parking_spaces=data['parkingSpaces'],

            purchase_price=data['purchasePrice'],
            acquisition_date=acq_date,
            earnest_money_pct=data.get('earnestMoneyPct', 0.02),
            closing_costs_pct=data.get('closingCostsPct', 0.03),
            due_diligence_costs=data.get('dueDiligenceCosts', 50000.0),

            unit_mix=unit_mix,

            physical_occupancy=data.get('physicalOccupancy', 0.90),
            economic_occupancy=data.get('economicOccupancy', 0.87),
            vacancy_loss_annual=data.get('vacancyLossAnnual', 150000.0),
            concessions_annual=data.get('concessionsAnnual', 20000.0),
            bad_debt_annual=data.get('badDebtAnnual', 25000.0),

            other_income=OtherIncome(**data.get('otherIncome', {})) if data.get('otherIncome') else OtherIncome(),
            operating_expenses=operating_expenses,

            renovation_budget=RenovationBudget(**data.get('renovationBudget', {})) if data.get('renovationBudget') else RenovationBudget(),
            operating_projections=OperatingProjections(**data.get('operatingProjections', {})) if data.get('operatingProjections') else OperatingProjections(),
            financing=FinancingTerms(**data.get('financing', {})) if data.get('financing') else FinancingTerms(),
            exit_assumptions=ExitAssumptions(**data.get('exitAssumptions', {})) if data.get('exitAssumptions') else ExitAssumptions(),
            property_tax=PropertyTaxAssumptions(**data.get('propertyTax', {})) if data.get('propertyTax') else PropertyTaxAssumptions(),

            deal_id=data.get('dealId'),
            created_at=data.get('createdAt'),
            updated_at=data.get('updatedAt')
        )
