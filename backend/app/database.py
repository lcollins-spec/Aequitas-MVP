"""
Database configuration and models for Aequitas MVP
"""
from datetime import datetime, date
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import Column, Integer, String, Float, DateTime, Text, Date, ForeignKey, Boolean, JSON, Index
from sqlalchemy.sql import func

db = SQLAlchemy()


class DealModel(db.Model):
    """
    SQLAlchemy model for real estate deals
    Stores all property information, financial details, and calculated metrics
    """
    __tablename__ = 'deals'

    # Primary Key
    id = Column(Integer, primary_key=True, autoincrement=True)

    # Basic Deal Information
    deal_name = Column(String(255), nullable=False)
    location = Column(String(255), nullable=False)
    status = Column(String(50), default='potential', nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    # Property Information
    property_address = Column(String(500))
    latitude = Column(Float)
    longitude = Column(Float)

    # Purchase Details
    purchase_price = Column(Float)
    down_payment_percent = Column(Float)
    loan_interest_rate = Column(Float)
    loan_term_years = Column(Integer)
    closing_costs = Column(Float)

    # Income
    monthly_rent = Column(Float)
    other_monthly_income = Column(Float)
    vacancy_rate = Column(Float)
    annual_rent_increase = Column(Float)

    # Expenses
    property_tax_annual = Column(Float)
    insurance_annual = Column(Float)
    hoa_monthly = Column(Float)
    maintenance_percent = Column(Float)
    property_management_percent = Column(Float)
    utilities_monthly = Column(Float)
    other_expenses_monthly = Column(Float)

    # Property Details
    bedrooms = Column(Integer)
    bathrooms = Column(Float)
    square_footage = Column(Integer)
    property_type = Column(String(100))
    year_built = Column(Integer)

    # Market Data Snapshots (JSON stored as text)
    rentcast_data = Column(Text)
    fred_data = Column(Text)

    # Calculated Metrics (cached for performance)
    monthly_payment = Column(Float)
    total_monthly_income = Column(Float)
    total_monthly_expenses = Column(Float)
    monthly_cash_flow = Column(Float)
    cash_on_cash_return = Column(Float)
    cap_rate = Column(Float)
    roi = Column(Float)
    npv = Column(Float)
    irr = Column(Float)

    def __repr__(self):
        return f'<Deal {self.id}: {self.deal_name} ({self.status})>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'dealName': self.deal_name,
            'location': self.location,
            'status': self.status,
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

            # Calculated Metrics
            'monthlyPayment': self.monthly_payment,
            'totalMonthlyIncome': self.total_monthly_income,
            'totalMonthlyExpenses': self.total_monthly_expenses,
            'monthlyCashFlow': self.monthly_cash_flow,
            'cashOnCashReturn': self.cash_on_cash_return,
            'capRate': self.cap_rate,
            'roi': self.roi,
            'npv': self.npv,
            'irr': self.irr
        }

    @staticmethod
    def from_dict(data):
        """Create a DealModel instance from a dictionary"""
        return DealModel(
            deal_name=data.get('dealName'),
            location=data.get('location'),
            status=data.get('status', 'potential'),

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

            # Calculated Metrics
            monthly_payment=data.get('monthlyPayment'),
            total_monthly_income=data.get('totalMonthlyIncome'),
            total_monthly_expenses=data.get('totalMonthlyExpenses'),
            monthly_cash_flow=data.get('monthlyCashFlow'),
            cash_on_cash_return=data.get('cashOnCashReturn'),
            cap_rate=data.get('capRate'),
            roi=data.get('roi'),
            npv=data.get('npv'),
            irr=data.get('irr')
        )

    def update_from_dict(self, data):
        """Update model fields from a dictionary"""
        # Basic Deal Information
        if 'dealName' in data:
            self.deal_name = data['dealName']
        if 'location' in data:
            self.location = data['location']
        if 'status' in data:
            self.status = data['status']

        # Property Information
        if 'propertyAddress' in data:
            self.property_address = data['propertyAddress']
        if 'latitude' in data:
            self.latitude = data['latitude']
        if 'longitude' in data:
            self.longitude = data['longitude']

        # Purchase Details
        if 'purchasePrice' in data:
            self.purchase_price = data['purchasePrice']
        if 'downPaymentPercent' in data:
            self.down_payment_percent = data['downPaymentPercent']
        if 'loanInterestRate' in data:
            self.loan_interest_rate = data['loanInterestRate']
        if 'loanTermYears' in data:
            self.loan_term_years = data['loanTermYears']
        if 'closingCosts' in data:
            self.closing_costs = data['closingCosts']

        # Income
        if 'monthlyRent' in data:
            self.monthly_rent = data['monthlyRent']
        if 'otherMonthlyIncome' in data:
            self.other_monthly_income = data['otherMonthlyIncome']
        if 'vacancyRate' in data:
            self.vacancy_rate = data['vacancyRate']
        if 'annualRentIncrease' in data:
            self.annual_rent_increase = data['annualRentIncrease']

        # Expenses
        if 'propertyTaxAnnual' in data:
            self.property_tax_annual = data['propertyTaxAnnual']
        if 'insuranceAnnual' in data:
            self.insurance_annual = data['insuranceAnnual']
        if 'hoaMonthly' in data:
            self.hoa_monthly = data['hoaMonthly']
        if 'maintenancePercent' in data:
            self.maintenance_percent = data['maintenancePercent']
        if 'propertyManagementPercent' in data:
            self.property_management_percent = data['propertyManagementPercent']
        if 'utilitiesMonthly' in data:
            self.utilities_monthly = data['utilitiesMonthly']
        if 'otherExpensesMonthly' in data:
            self.other_expenses_monthly = data['otherExpensesMonthly']

        # Property Details
        if 'bedrooms' in data:
            self.bedrooms = data['bedrooms']
        if 'bathrooms' in data:
            self.bathrooms = data['bathrooms']
        if 'squareFootage' in data:
            self.square_footage = data['squareFootage']
        if 'propertyType' in data:
            self.property_type = data['propertyType']
        if 'yearBuilt' in data:
            self.year_built = data['yearBuilt']

        # Market Data
        if 'rentcastData' in data:
            self.rentcast_data = data['rentcastData']
        if 'fredData' in data:
            self.fred_data = data['fredData']

        # Calculated Metrics
        if 'monthlyPayment' in data:
            self.monthly_payment = data['monthlyPayment']
        if 'totalMonthlyIncome' in data:
            self.total_monthly_income = data['totalMonthlyIncome']
        if 'totalMonthlyExpenses' in data:
            self.total_monthly_expenses = data['totalMonthlyExpenses']
        if 'monthlyCashFlow' in data:
            self.monthly_cash_flow = data['monthlyCashFlow']
        if 'cashOnCashReturn' in data:
            self.cash_on_cash_return = data['cashOnCashReturn']
        if 'capRate' in data:
            self.cap_rate = data['capRate']
        if 'roi' in data:
            self.roi = data['roi']
        if 'npv' in data:
            self.npv = data['npv']
        if 'irr' in data:
            self.irr = data['irr']

        # Update timestamp
        self.updated_at = datetime.utcnow()


# ============================================================================
# FUND MODELS
# ============================================================================


class FundModel(db.Model):
    """
    SQLAlchemy model for investment funds
    Stores basic fund information and configuration
    """
    __tablename__ = 'funds'

    # Primary Key
    id = Column(Integer, primary_key=True, autoincrement=True)

    # Basic Fund Information
    fund_name = Column(String(255), nullable=False)
    fund_size = Column(Float)  # Total committed capital
    status = Column(String(50), default='active', nullable=False)  # active, closed, liquidated
    vintage_year = Column(Integer)  # Year fund was established
    investment_period_start = Column(Date)
    investment_period_end = Column(Date)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f'<Fund {self.id}: {self.fund_name} ({self.status})>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'fundName': self.fund_name,
            'fundSize': self.fund_size,
            'status': self.status,
            'vintageYear': self.vintage_year,
            'investmentPeriodStart': self.investment_period_start.isoformat() if self.investment_period_start else None,
            'investmentPeriodEnd': self.investment_period_end.isoformat() if self.investment_period_end else None,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

    @staticmethod
    def from_dict(data):
        """Create a FundModel instance from a dictionary"""
        from datetime import datetime as dt
        return FundModel(
            fund_name=data.get('fundName'),
            fund_size=data.get('fundSize'),
            status=data.get('status', 'active'),
            vintage_year=data.get('vintageYear'),
            investment_period_start=dt.fromisoformat(data['investmentPeriodStart']) if data.get('investmentPeriodStart') else None,
            investment_period_end=dt.fromisoformat(data['investmentPeriodEnd']) if data.get('investmentPeriodEnd') else None
        )

    def update_from_dict(self, data):
        """Update model fields from a dictionary"""
        from datetime import datetime as dt

        if 'fundName' in data:
            self.fund_name = data['fundName']
        if 'fundSize' in data:
            self.fund_size = data['fundSize']
        if 'status' in data:
            self.status = data['status']
        if 'vintageYear' in data:
            self.vintage_year = data['vintageYear']
        if 'investmentPeriodStart' in data:
            self.investment_period_start = dt.fromisoformat(data['investmentPeriodStart']) if data['investmentPeriodStart'] else None
        if 'investmentPeriodEnd' in data:
            self.investment_period_end = dt.fromisoformat(data['investmentPeriodEnd']) if data['investmentPeriodEnd'] else None

        self.updated_at = datetime.utcnow()


class FundMetricsModel(db.Model):
    """
    SQLAlchemy model for fund performance metrics
    Stores snapshot of fund metrics at a specific date
    """
    __tablename__ = 'fund_metrics'

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey('funds.id'), nullable=False)
    as_of_date = Column(Date, nullable=False)
    deployed_capital = Column(Float)
    remaining_capital = Column(Float)
    net_irr = Column(Float)  # Net IRR percentage
    tvpi = Column(Float)  # Total Value to Paid-In multiple
    dpi = Column(Float)  # Distributions to Paid-In multiple
    total_value = Column(Float)  # NAV + Distributions
    created_at = Column(DateTime, default=func.now(), nullable=False)

    def __repr__(self):
        return f'<FundMetrics {self.id}: Fund {self.fund_id} as of {self.as_of_date}>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'fundId': self.fund_id,
            'asOfDate': self.as_of_date.isoformat() if self.as_of_date else None,
            'deployedCapital': self.deployed_capital,
            'remainingCapital': self.remaining_capital,
            'netIrr': self.net_irr,
            'tvpi': self.tvpi,
            'dpi': self.dpi,
            'totalValue': self.total_value,
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }

    @staticmethod
    def from_dict(data):
        """Create a FundMetricsModel instance from a dictionary"""
        from datetime import datetime as dt
        return FundMetricsModel(
            fund_id=data.get('fundId'),
            as_of_date=dt.fromisoformat(data['asOfDate']).date() if data.get('asOfDate') else None,
            deployed_capital=data.get('deployedCapital'),
            remaining_capital=data.get('remainingCapital'),
            net_irr=data.get('netIrr'),
            tvpi=data.get('tvpi'),
            dpi=data.get('dpi'),
            total_value=data.get('totalValue')
        )

    def update_from_dict(self, data):
        """Update model fields from a dictionary"""
        from datetime import datetime as dt

        if 'asOfDate' in data:
            self.as_of_date = dt.fromisoformat(data['asOfDate']).date() if data['asOfDate'] else None
        if 'deployedCapital' in data:
            self.deployed_capital = data['deployedCapital']
        if 'remainingCapital' in data:
            self.remaining_capital = data['remainingCapital']
        if 'netIrr' in data:
            self.net_irr = data['netIrr']
        if 'tvpi' in data:
            self.tvpi = data['tvpi']
        if 'dpi' in data:
            self.dpi = data['dpi']
        if 'totalValue' in data:
            self.total_value = data['totalValue']


class QuarterlyPerformanceModel(db.Model):
    """
    SQLAlchemy model for quarterly fund performance
    Stores IRR performance by quarter
    """
    __tablename__ = 'fund_quarterly_performance'

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey('funds.id'), nullable=False)
    year = Column(Integer, nullable=False)
    quarter = Column(Integer, nullable=False)  # 1, 2, 3, 4
    irr = Column(Float)  # IRR for that quarter
    created_at = Column(DateTime, default=func.now(), nullable=False)

    def __repr__(self):
        return f'<QuarterlyPerformance {self.id}: Fund {self.fund_id} Q{self.quarter} {self.year}>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'fundId': self.fund_id,
            'year': self.year,
            'quarter': self.quarter,
            'quarterLabel': f'Q{self.quarter} {self.year}',
            'irr': self.irr,
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }

    @staticmethod
    def from_dict(data):
        """Create a QuarterlyPerformanceModel instance from a dictionary"""
        return QuarterlyPerformanceModel(
            fund_id=data.get('fundId'),
            year=data.get('year'),
            quarter=data.get('quarter'),
            irr=data.get('irr')
        )

    def update_from_dict(self, data):
        """Update model fields from a dictionary"""
        if 'year' in data:
            self.year = data['year']
        if 'quarter' in data:
            self.quarter = data['quarter']
        if 'irr' in data:
            self.irr = data['irr']


class InvestmentStrategyModel(db.Model):
    """
    SQLAlchemy model for investment strategies
    Stores breakdown of fund investments by strategy
    """
    __tablename__ = 'investment_strategies'

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey('funds.id'), nullable=False)
    strategy_name = Column(String(100), nullable=False)  # e.g., "Acquisitions", "Development"
    deployed_capital = Column(Float)
    current_value = Column(Float)
    allocation_percent = Column(Float)  # Target allocation %
    irr = Column(Float)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f'<InvestmentStrategy {self.id}: {self.strategy_name} for Fund {self.fund_id}>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'fundId': self.fund_id,
            'strategyName': self.strategy_name,
            'deployedCapital': self.deployed_capital,
            'currentValue': self.current_value,
            'allocationPercent': self.allocation_percent,
            'irr': self.irr,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None
        }

    @staticmethod
    def from_dict(data):
        """Create an InvestmentStrategyModel instance from a dictionary"""
        return InvestmentStrategyModel(
            fund_id=data.get('fundId'),
            strategy_name=data.get('strategyName'),
            deployed_capital=data.get('deployedCapital'),
            current_value=data.get('currentValue'),
            allocation_percent=data.get('allocationPercent'),
            irr=data.get('irr')
        )

    def update_from_dict(self, data):
        """Update model fields from a dictionary"""
        if 'strategyName' in data:
            self.strategy_name = data['strategyName']
        if 'deployedCapital' in data:
            self.deployed_capital = data['deployedCapital']
        if 'currentValue' in data:
            self.current_value = data['currentValue']
        if 'allocationPercent' in data:
            self.allocation_percent = data['allocationPercent']
        if 'irr' in data:
            self.irr = data['irr']

        self.updated_at = datetime.utcnow()


class CashFlowModel(db.Model):
    """
    SQLAlchemy model for fund cash flows
    Stores quarterly capital calls and distributions
    """
    __tablename__ = 'fund_cash_flows'

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey('funds.id'), nullable=False)
    year = Column(Integer, nullable=False)
    quarter = Column(Integer, nullable=False)  # 1, 2, 3, 4
    capital_calls = Column(Float)  # Outflows (negative)
    distributions = Column(Float)  # Inflows (positive)
    net_cash_flow = Column(Float)  # Distributions - Capital Calls
    created_at = Column(DateTime, default=func.now(), nullable=False)

    def __repr__(self):
        return f'<CashFlow {self.id}: Fund {self.fund_id} Q{self.quarter} {self.year}>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'fundId': self.fund_id,
            'year': self.year,
            'quarter': self.quarter,
            'quarterLabel': f'Q{self.quarter} {self.year}',
            'capitalCalls': self.capital_calls,
            'distributions': self.distributions,
            'netCashFlow': self.net_cash_flow,
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }

    @staticmethod
    def from_dict(data):
        """Create a CashFlowModel instance from a dictionary"""
        return CashFlowModel(
            fund_id=data.get('fundId'),
            year=data.get('year'),
            quarter=data.get('quarter'),
            capital_calls=data.get('capitalCalls'),
            distributions=data.get('distributions'),
            net_cash_flow=data.get('netCashFlow')
        )

    def update_from_dict(self, data):
        """Update model fields from a dictionary"""
        if 'year' in data:
            self.year = data['year']
        if 'quarter' in data:
            self.quarter = data['quarter']
        if 'capitalCalls' in data:
            self.capital_calls = data['capitalCalls']
        if 'distributions' in data:
            self.distributions = data['distributions']
        if 'netCashFlow' in data:
            self.net_cash_flow = data['netCashFlow']


class FundActivityModel(db.Model):
    """
    SQLAlchemy model for fund activities
    Stores transactions and events related to the fund
    """
    __tablename__ = 'fund_activities'

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey('funds.id'), nullable=False)
    activity_date = Column(Date, nullable=False)
    description = Column(Text, nullable=False)
    amount = Column(Float)
    status = Column(String(50))  # Completed, In Progress, Scheduled
    activity_type = Column(String(50))  # distribution, acquisition, refinancing, capital_call
    created_at = Column(DateTime, default=func.now(), nullable=False)

    def __repr__(self):
        return f'<FundActivity {self.id}: {self.description[:30]}>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'fundId': self.fund_id,
            'activityDate': self.activity_date.isoformat() if self.activity_date else None,
            'description': self.description,
            'amount': self.amount,
            'status': self.status,
            'activityType': self.activity_type,
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }

    @staticmethod
    def from_dict(data):
        """Create a FundActivityModel instance from a dictionary"""
        from datetime import datetime as dt
        return FundActivityModel(
            fund_id=data.get('fundId'),
            activity_date=dt.fromisoformat(data['activityDate']).date() if data.get('activityDate') else None,
            description=data.get('description'),
            amount=data.get('amount'),
            status=data.get('status'),
            activity_type=data.get('activityType')
        )

    def update_from_dict(self, data):
        """Update model fields from a dictionary"""
        from datetime import datetime as dt

        if 'activityDate' in data:
            self.activity_date = dt.fromisoformat(data['activityDate']).date() if data['activityDate'] else None
        if 'description' in data:
            self.description = data['description']
        if 'amount' in data:
            self.amount = data['amount']
        if 'status' in data:
            self.status = data['status']
        if 'activityType' in data:
            self.activity_type = data['activityType']


class BenchmarkDataModel(db.Model):
    """
    SQLAlchemy model for benchmark comparison data
    Stores fund performance vs industry benchmarks
    """
    __tablename__ = 'benchmark_data'

    id = Column(Integer, primary_key=True, autoincrement=True)
    fund_id = Column(Integer, ForeignKey('funds.id'), nullable=False)
    metric_name = Column(String(100), nullable=False)  # Net IRR, TVPI, DPI
    fund_value = Column(Float)
    industry_benchmark = Column(Float)
    as_of_date = Column(Date, nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    def __repr__(self):
        return f'<BenchmarkData {self.id}: {self.metric_name} for Fund {self.fund_id}>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        outperformance = self.fund_value - self.industry_benchmark if self.fund_value and self.industry_benchmark else 0
        return {
            'id': self.id,
            'fundId': self.fund_id,
            'metricName': self.metric_name,
            'fundValue': self.fund_value,
            'industryBenchmark': self.industry_benchmark,
            'outperformance': outperformance,
            'asOfDate': self.as_of_date.isoformat() if self.as_of_date else None,
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }

    @staticmethod
    def from_dict(data):
        """Create a BenchmarkDataModel instance from a dictionary"""
        from datetime import datetime as dt
        return BenchmarkDataModel(
            fund_id=data.get('fundId'),
            metric_name=data.get('metricName'),
            fund_value=data.get('fundValue'),
            industry_benchmark=data.get('industryBenchmark'),
            as_of_date=dt.fromisoformat(data['asOfDate']).date() if data.get('asOfDate') else None
        )

    def update_from_dict(self, data):
        """Update model fields from a dictionary"""
        from datetime import datetime as dt

        if 'metricName' in data:
            self.metric_name = data['metricName']
        if 'fundValue' in data:
            self.fund_value = data['fundValue']
        if 'industryBenchmark' in data:
            self.industry_benchmark = data['industryBenchmark']
        if 'asOfDate' in data:
            self.as_of_date = dt.fromisoformat(data['asOfDate']).date() if data['asOfDate'] else None


# ============================================================================
# RISK ASSESSMENT MODELS
# ============================================================================


class RiskAssessmentModel(db.Model):
    """
    SQLAlchemy model for risk assessments
    Stores comprehensive risk analysis based on academic research
    """
    __tablename__ = 'risk_assessments'

    # Primary Key
    id = Column(Integer, primary_key=True, autoincrement=True)
    deal_id = Column(Integer, ForeignKey('deals.id'), nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    # Part 1: Rent Tier Classification
    predicted_fundamental_rent = Column(Float)
    rent_decile_national = Column(Integer)  # 1-10
    rent_decile_regional = Column(Integer)  # 1-10
    rent_tier_label = Column(String(10))  # 'D1', 'D2', ... 'D10'

    # Part 2: Yield Calculations
    gross_yield = Column(Float)
    maintenance_cost_pct = Column(Float)
    property_tax_pct = Column(Float)
    turnover_cost_pct = Column(Float)
    default_cost_pct = Column(Float)
    management_cost_pct = Column(Float)
    net_yield = Column(Float)

    # Part 3: Capital Appreciation
    projected_price_yr1 = Column(Float)
    projected_price_yr5 = Column(Float)
    projected_price_yr10 = Column(Float)
    capital_gain_yield_annual = Column(Float)
    noi_growth_rate = Column(Float)

    # Part 4: Total Return
    total_return_unlevered = Column(Float)
    total_return_levered = Column(Float)

    # Part 5: Risk Metrics
    systematic_risk_score = Column(Float)
    cash_flow_cyclicality = Column(String(20))  # 'Low', 'Medium', 'High'
    regulatory_risk_score = Column(Float)
    idiosyncratic_risk_score = Column(Float)
    composite_risk_score = Column(Float)  # 0-100
    composite_risk_level = Column(String(20))  # 'Low', 'Medium', 'High'

    # Part 5b: Climate Risk (NEW - 4th dimension)
    climate_risk_score = Column(Float)  # 0-100 composite score
    climate_risk_level = Column(String(20))  # 'Low', 'Medium', 'High', 'Very High', 'Unknown'

    # Individual hazard scores (8 hazards)
    flood_risk_score = Column(Float)
    wildfire_risk_score = Column(Float)
    hurricane_risk_score = Column(Float)
    earthquake_risk_score = Column(Float)
    tornado_risk_score = Column(Float)
    extreme_heat_risk_score = Column(Float)
    sea_level_rise_risk_score = Column(Float)
    drought_risk_score = Column(Float)

    # Geocoding results
    property_latitude = Column(Float)
    property_longitude = Column(Float)
    geocoded_address = Column(String(500))

    # Climate data metadata
    climate_data_sources = Column(JSON)  # Track which APIs were used
    climate_calculation_date = Column(DateTime)

    # Part 6: Limits to Arbitrage
    renter_constraint_score = Column(Float)
    institutional_constraint_score = Column(Float)
    medium_landlord_constraint_score = Column(Float)
    arbitrage_opportunity_score = Column(Float)

    # Part 7: Benchmark Comparison
    benchmark_net_yield_min = Column(Float)
    benchmark_net_yield_max = Column(Float)
    benchmark_capital_gain_min = Column(Float)
    benchmark_capital_gain_max = Column(Float)
    benchmark_total_return_min = Column(Float)
    benchmark_total_return_max = Column(Float)
    vs_benchmark_yield = Column(String(20))  # 'Above', 'Within', 'Below'
    vs_benchmark_return = Column(String(20))

    # Metadata
    hedonic_model_version = Column(String(20))
    last_calculated = Column(DateTime)

    def __repr__(self):
        return f'<RiskAssessment {self.id}: Deal {self.deal_id} ({self.rent_tier_label})>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'dealId': self.deal_id,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,

            # Part 1: Rent Tier Classification
            'predictedFundamentalRent': self.predicted_fundamental_rent,
            'rentDecileNational': self.rent_decile_national,
            'rentDecileRegional': self.rent_decile_regional,
            'rentTierLabel': self.rent_tier_label,

            # Part 2: Yield Calculations
            'grossYield': self.gross_yield,
            'maintenanceCostPct': self.maintenance_cost_pct,
            'propertyTaxPct': self.property_tax_pct,
            'turnoverCostPct': self.turnover_cost_pct,
            'defaultCostPct': self.default_cost_pct,
            'managementCostPct': self.management_cost_pct,
            'netYield': self.net_yield,

            # Part 3: Capital Appreciation
            'projectedPriceYr1': self.projected_price_yr1,
            'projectedPriceYr5': self.projected_price_yr5,
            'projectedPriceYr10': self.projected_price_yr10,
            'capitalGainYieldAnnual': self.capital_gain_yield_annual,
            'noiGrowthRate': self.noi_growth_rate,

            # Part 4: Total Return
            'totalReturnUnlevered': self.total_return_unlevered,
            'totalReturnLevered': self.total_return_levered,

            # Part 5: Risk Metrics
            'systematicRiskScore': self.systematic_risk_score,
            'cashFlowCyclicality': self.cash_flow_cyclicality,
            'regulatoryRiskScore': self.regulatory_risk_score,
            'idiosyncraticRiskScore': self.idiosyncratic_risk_score,
            'compositeRiskScore': self.composite_risk_score,
            'compositeRiskLevel': self.composite_risk_level,

            # Part 5b: Climate Risk (NEW)
            'climateRiskScore': self.climate_risk_score,
            'climateRiskLevel': self.climate_risk_level,
            'floodRiskScore': self.flood_risk_score,
            'wildfireRiskScore': self.wildfire_risk_score,
            'hurricaneRiskScore': self.hurricane_risk_score,
            'earthquakeRiskScore': self.earthquake_risk_score,
            'tornadoRiskScore': self.tornado_risk_score,
            'extremeHeatRiskScore': self.extreme_heat_risk_score,
            'seaLevelRiseRiskScore': self.sea_level_rise_risk_score,
            'droughtRiskScore': self.drought_risk_score,
            'propertyLatitude': self.property_latitude,
            'propertyLongitude': self.property_longitude,
            'geocodedAddress': self.geocoded_address,
            'climateDataSources': self.climate_data_sources,
            'climateCalculationDate': self.climate_calculation_date.isoformat() if self.climate_calculation_date else None,

            # Part 6: Limits to Arbitrage
            'renterConstraintScore': self.renter_constraint_score,
            'institutionalConstraintScore': self.institutional_constraint_score,
            'mediumLandlordConstraintScore': self.medium_landlord_constraint_score,
            'arbitrageOpportunityScore': self.arbitrage_opportunity_score,

            # Part 7: Benchmark Comparison
            'benchmarkNetYieldMin': self.benchmark_net_yield_min,
            'benchmarkNetYieldMax': self.benchmark_net_yield_max,
            'benchmarkCapitalGainMin': self.benchmark_capital_gain_min,
            'benchmarkCapitalGainMax': self.benchmark_capital_gain_max,
            'benchmarkTotalReturnMin': self.benchmark_total_return_min,
            'benchmarkTotalReturnMax': self.benchmark_total_return_max,
            'vsBenchmarkYield': self.vs_benchmark_yield,
            'vsBenchmarkReturn': self.vs_benchmark_return,

            # Metadata
            'hedonicModelVersion': self.hedonic_model_version,
            'lastCalculated': self.last_calculated.isoformat() if self.last_calculated else None
        }


class RiskBenchmarkData(db.Model):
    """
    SQLAlchemy model for risk assessment benchmark data
    Stores academic research findings by rent decile
    """
    __tablename__ = 'risk_benchmark_data'

    id = Column(Integer, primary_key=True, autoincrement=True)
    rent_decile = Column(Integer, nullable=False)  # 1-10
    geography = Column(String(50), nullable=False)  # 'US', 'Belgium', 'Netherlands'

    # Return benchmarks from research
    net_yield_min = Column(Float)
    net_yield_max = Column(Float)
    capital_gain_min = Column(Float)
    capital_gain_max = Column(Float)
    total_return_min = Column(Float)
    total_return_max = Column(Float)

    # Cost structure benchmarks
    maintenance_cost_pct = Column(Float)
    turnover_cost_pct = Column(Float)
    default_cost_pct = Column(Float)

    # Risk metrics benchmarks
    systematic_risk_beta = Column(Float)
    cash_flow_volatility = Column(Float)

    created_at = Column(DateTime, default=func.now(), nullable=False)

    def __repr__(self):
        return f'<RiskBenchmark {self.id}: D{self.rent_decile} {self.geography}>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'rentDecile': self.rent_decile,
            'geography': self.geography,
            'netYieldMin': self.net_yield_min,
            'netYieldMax': self.net_yield_max,
            'capitalGainMin': self.capital_gain_min,
            'capitalGainMax': self.capital_gain_max,
            'totalReturnMin': self.total_return_min,
            'totalReturnMax': self.total_return_max,
            'maintenanceCostPct': self.maintenance_cost_pct,
            'turnoverCostPct': self.turnover_cost_pct,
            'defaultCostPct': self.default_cost_pct,
            'systematicRiskBeta': self.systematic_risk_beta,
            'cashFlowVolatility': self.cash_flow_volatility,
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }


class HedonicModelCoefficients(db.Model):
    """
    SQLAlchemy model for hedonic regression model coefficients
    Stores parameters for rent prediction model: log(Rent) = β × Characteristics + α
    """
    __tablename__ = 'hedonic_coefficients'

    id = Column(Integer, primary_key=True, autoincrement=True)
    model_version = Column(String(20), nullable=False)
    region = Column(String(100), nullable=False)  # 'national', state code, or metro area
    created_at = Column(DateTime, default=func.now(), nullable=False)

    # Property characteristic coefficients
    coef_sqft = Column(Float)
    coef_bedrooms = Column(Float)
    coef_bathrooms = Column(Float)
    coef_age = Column(Float)
    coef_property_type_multi = Column(Float)  # Multifamily vs single-family
    coef_property_type_condo = Column(Float)
    intercept = Column(Float)

    # Neighborhood and time fixed effects (JSON stored as Text)
    neighborhood_effects = Column(Text)  # JSON: {zipcode: alpha_value}
    time_effects = Column(Text)  # JSON: {year: alpha_value}

    # Model performance metrics
    r_squared = Column(Float)
    rmse = Column(Float)
    sample_size = Column(Integer)

    def __repr__(self):
        return f'<HedonicCoefficients {self.id}: {self.model_version} {self.region}>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'modelVersion': self.model_version,
            'region': self.region,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'coefSqft': self.coef_sqft,
            'coefBedrooms': self.coef_bedrooms,
            'coefBathrooms': self.coef_bathrooms,
            'coefAge': self.coef_age,
            'coefPropertyTypeMulti': self.coef_property_type_multi,
            'coefPropertyTypeCondo': self.coef_property_type_condo,
            'intercept': self.intercept,
            'neighborhoodEffects': self.neighborhood_effects,
            'timeEffects': self.time_effects,
            'rSquared': self.r_squared,
            'rmse': self.rmse,
            'sampleSize': self.sample_size
        }


class MarketDecileThresholds(db.Model):
    """
    SQLAlchemy model for market rent distribution thresholds
    Stores rent values that define each decile (D1-D10) in a market
    """
    __tablename__ = 'market_decile_thresholds'

    id = Column(Integer, primary_key=True, autoincrement=True)
    geography = Column(String(100), nullable=False)  # 'national', state, or zipcode
    bedrooms = Column(Integer)  # Can vary by unit size
    data_year = Column(Integer, nullable=False)

    # Decile rent thresholds (monthly rent values)
    d1_threshold = Column(Float)  # Bottom 10%
    d2_threshold = Column(Float)
    d3_threshold = Column(Float)
    d4_threshold = Column(Float)
    d5_threshold = Column(Float)
    d6_threshold = Column(Float)
    d7_threshold = Column(Float)
    d8_threshold = Column(Float)
    d9_threshold = Column(Float)
    d10_threshold = Column(Float)  # Top 10%

    last_updated = Column(DateTime, default=func.now(), nullable=False)
    created_at = Column(DateTime, default=func.now(), nullable=False)

    def __repr__(self):
        return f'<MarketThresholds {self.id}: {self.geography} {self.bedrooms}BR {self.data_year}>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'geography': self.geography,
            'bedrooms': self.bedrooms,
            'dataYear': self.data_year,
            'd1Threshold': self.d1_threshold,
            'd2Threshold': self.d2_threshold,
            'd3Threshold': self.d3_threshold,
            'd4Threshold': self.d4_threshold,
            'd5Threshold': self.d5_threshold,
            'd6Threshold': self.d6_threshold,
            'd7Threshold': self.d7_threshold,
            'd8Threshold': self.d8_threshold,
            'd9Threshold': self.d9_threshold,
            'd10Threshold': self.d10_threshold,
            'lastUpdated': self.last_updated.isoformat() if self.last_updated else None,
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }


# ============================================================================
# GP (GENERAL PARTNER) MODELS
# ============================================================================


class GPModel(db.Model):
    """
    SQLAlchemy model for General Partners (GPs)
    Stores GP information, contact details, and performance metrics
    """
    __tablename__ = 'gps'

    # Primary Key
    id = Column(Integer, primary_key=True, autoincrement=True)

    # Basic GP Information
    gp_name = Column(String(255), nullable=False)
    location = Column(String(255))
    tier = Column(String(50))  # Standard, Premium, etc.
    performance_rating = Column(String(50))  # Outstanding, Excellent, etc.
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    # Contact Information
    contact_email = Column(String(255))
    contact_phone = Column(String(50))
    website = Column(String(255))

    # Performance Metrics
    net_irr = Column(Float)  # Net IRR percentage
    gross_irr = Column(Float)  # Gross IRR percentage
    irr_trend = Column(Float)  # Positive or negative trend
    total_aum = Column(Float)  # Assets Under Management
    deal_count = Column(Integer)  # Number of deals managed
    current_value = Column(Float)  # Current portfolio value

    # Additional Tags/Labels
    tags = Column(Text)  # JSON string of tags

    def __repr__(self):
        return f'<GP {self.id}: {self.gp_name}>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'gpName': self.gp_name,
            'location': self.location,
            'tier': self.tier,
            'performanceRating': self.performance_rating,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
            'contactEmail': self.contact_email,
            'contactPhone': self.contact_phone,
            'website': self.website,
            'netIrr': self.net_irr,
            'grossIrr': self.gross_irr,
            'irrTrend': self.irr_trend,
            'totalAum': self.total_aum,
            'dealCount': self.deal_count,
            'currentValue': self.current_value,
            'tags': self.tags
        }

    @staticmethod
    def from_dict(data):
        """Create a GPModel instance from a dictionary"""
        return GPModel(
            gp_name=data.get('gpName'),
            location=data.get('location'),
            tier=data.get('tier'),
            performance_rating=data.get('performanceRating'),
            contact_email=data.get('contactEmail'),
            contact_phone=data.get('contactPhone'),
            website=data.get('website'),
            net_irr=data.get('netIrr'),
            gross_irr=data.get('grossIrr'),
            irr_trend=data.get('irrTrend'),
            total_aum=data.get('totalAum'),
            deal_count=data.get('dealCount'),
            current_value=data.get('currentValue'),
            tags=data.get('tags')
        )

    def update_from_dict(self, data):
        """Update model fields from a dictionary"""
        if 'gpName' in data:
            self.gp_name = data['gpName']
        if 'location' in data:
            self.location = data['location']
        if 'tier' in data:
            self.tier = data['tier']
        if 'performanceRating' in data:
            self.performance_rating = data['performanceRating']
        if 'contactEmail' in data:
            self.contact_email = data['contactEmail']
        if 'contactPhone' in data:
            self.contact_phone = data['contactPhone']
        if 'website' in data:
            self.website = data['website']
        if 'netIrr' in data:
            self.net_irr = data['netIrr']
        if 'grossIrr' in data:
            self.gross_irr = data['grossIrr']
        if 'irrTrend' in data:
            self.irr_trend = data['irrTrend']
        if 'totalAum' in data:
            self.total_aum = data['totalAum']
        if 'dealCount' in data:
            self.deal_count = data['dealCount']
        if 'currentValue' in data:
            self.current_value = data['currentValue']
        if 'tags' in data:
            self.tags = data['tags']

        self.updated_at = datetime.utcnow()


class GPQuarterlyPerformanceModel(db.Model):
    """
    SQLAlchemy model for GP quarterly performance data
    Stores IRR performance by quarter for trend analysis
    """
    __tablename__ = 'gp_quarterly_performance'

    id = Column(Integer, primary_key=True, autoincrement=True)
    gp_id = Column(Integer, ForeignKey('gps.id'), nullable=False)
    year = Column(Integer, nullable=False)
    quarter = Column(Integer, nullable=False)  # 1, 2, 3, 4
    irr = Column(Float)  # IRR for that quarter
    created_at = Column(DateTime, default=func.now(), nullable=False)

    def __repr__(self):
        return f'<GPQuarterlyPerformance {self.id}: GP {self.gp_id} Q{self.quarter} {self.year}>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'gpId': self.gp_id,
            'year': self.year,
            'quarter': self.quarter,
            'quarterLabel': f'Q{self.quarter} {self.year}',
            'irr': self.irr,
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }

    @staticmethod
    def from_dict(data):
        """Create a GPQuarterlyPerformanceModel instance from a dictionary"""
        return GPQuarterlyPerformanceModel(
            gp_id=data.get('gpId'),
            year=data.get('year'),
            quarter=data.get('quarter'),
            irr=data.get('irr')
        )


class GPPortfolioSummaryModel(db.Model):
    """
    SQLAlchemy model for GP portfolio summary
    Stores performance distribution across quartiles
    """
    __tablename__ = 'gp_portfolio_summary'

    id = Column(Integer, primary_key=True, autoincrement=True)
    gp_id = Column(Integer, ForeignKey('gps.id'), nullable=False)
    year = Column(Integer, nullable=False)
    quartile = Column(Integer, nullable=False)  # 1, 2, 3, or 4
    deal_count = Column(Integer)  # Number of deals in this quartile
    percentage = Column(Float)  # Percentage of deals in this quartile
    created_at = Column(DateTime, default=func.now(), nullable=False)

    def __repr__(self):
        return f'<GPPortfolioSummary {self.id}: GP {self.gp_id} Q{self.quartile} {self.year}>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'gpId': self.gp_id,
            'year': self.year,
            'quartile': self.quartile,
            'dealCount': self.deal_count,
            'percentage': self.percentage,
            'createdAt': self.created_at.isoformat() if self.created_at else None
        }

    @staticmethod
    def from_dict(data):
        """Create a GPPortfolioSummaryModel instance from a dictionary"""
        return GPPortfolioSummaryModel(
            gp_id=data.get('gpId'),
            year=data.get('year'),
            quartile=data.get('quartile'),
            deal_count=data.get('dealCount'),
            percentage=data.get('percentage')
        )


class PropertyImportModel(db.Model):
    """
    SQLAlchemy model for property imports from external URLs
    Stores import metadata and extracted data for web scraping operations
    """
    __tablename__ = 'property_imports'

    # Primary Key
    id = Column(Integer, primary_key=True, autoincrement=True)
    deal_id = Column(Integer, ForeignKey('deals.id'), nullable=True)

    # Source Information
    source_url = Column(String(1000), nullable=False)
    source_platform = Column(String(50))
    import_status = Column(String(50), default='pending', nullable=False)
    import_method = Column(String(50))

    # Timestamps
    created_at = Column(DateTime, default=func.now(), nullable=False)
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    # Extracted Data (JSON stored as text)
    raw_html = Column(Text)
    extracted_data = Column(Text)
    enrichment_data = Column(Text)

    # Extraction Results - Address
    property_address = Column(String(500))
    city = Column(String(100))
    state = Column(String(2))
    zipcode = Column(String(10))
    latitude = Column(Float)
    longitude = Column(Float)

    # Property Details Extracted
    price = Column(Float)
    square_footage = Column(Integer)
    units = Column(Integer)
    bedrooms = Column(Integer)
    bathrooms = Column(Float)
    year_built = Column(Integer)
    property_type = Column(String(100))

    # Financials Extracted
    noi = Column(Float)
    cap_rate = Column(Float)
    gross_income = Column(Float)

    # Error Tracking
    error_message = Column(Text)
    error_type = Column(String(50))

    # Metadata
    user_assisted = Column(Boolean, default=False)
    confidence_score = Column(Float)

    def __repr__(self):
        return f'<PropertyImport {self.id}: {self.source_platform} {self.import_status}>'

    def to_dict(self):
        """Convert model to dictionary for JSON serialization"""
        return {
            'id': self.id,
            'dealId': self.deal_id,
            'sourceUrl': self.source_url,
            'sourcePlatform': self.source_platform,
            'importStatus': self.import_status,
            'importMethod': self.import_method,
            'createdAt': self.created_at.isoformat() if self.created_at else None,
            'updatedAt': self.updated_at.isoformat() if self.updated_at else None,
            'rawHtml': self.raw_html,
            'extractedData': self.extracted_data,
            'enrichmentData': self.enrichment_data,
            'propertyAddress': self.property_address,
            'city': self.city,
            'state': self.state,
            'zipcode': self.zipcode,
            'latitude': self.latitude,
            'longitude': self.longitude,
            'price': self.price,
            'squareFootage': self.square_footage,
            'units': self.units,
            'bedrooms': self.bedrooms,
            'bathrooms': self.bathrooms,
            'yearBuilt': self.year_built,
            'propertyType': self.property_type,
            'noi': self.noi,
            'capRate': self.cap_rate,
            'grossIncome': self.gross_income,
            'errorMessage': self.error_message,
            'errorType': self.error_type,
            'userAssisted': self.user_assisted,
            'confidenceScore': self.confidence_score
        }

    @staticmethod
    def from_dict(data):
        """Create a PropertyImportModel instance from a dictionary"""
        return PropertyImportModel(
            deal_id=data.get('dealId'),
            source_url=data.get('sourceUrl'),
            source_platform=data.get('sourcePlatform'),
            import_status=data.get('importStatus', 'pending'),
            import_method=data.get('importMethod'),
            raw_html=data.get('rawHtml'),
            extracted_data=data.get('extractedData'),
            enrichment_data=data.get('enrichmentData'),
            property_address=data.get('propertyAddress'),
            city=data.get('city'),
            state=data.get('state'),
            zipcode=data.get('zipcode'),
            latitude=data.get('latitude'),
            longitude=data.get('longitude'),
            price=data.get('price'),
            square_footage=data.get('squareFootage'),
            units=data.get('units'),
            bedrooms=data.get('bedrooms'),
            bathrooms=data.get('bathrooms'),
            year_built=data.get('yearBuilt'),
            property_type=data.get('propertyType'),
            noi=data.get('noi'),
            cap_rate=data.get('capRate'),
            gross_income=data.get('grossIncome'),
            error_message=data.get('errorMessage'),
            error_type=data.get('errorType'),
            user_assisted=data.get('userAssisted', False),
            confidence_score=data.get('confidenceScore')
        )


class ClimateRiskCache(db.Model):
    """
    SQLAlchemy model for caching climate risk API responses
    Reduces API calls and improves performance
    """
    __tablename__ = 'climate_risk_cache'

    id = Column(Integer, primary_key=True, autoincrement=True)
    latitude = Column(Float, nullable=False, index=True)
    longitude = Column(Float, nullable=False, index=True)
    hazard_type = Column(String(30), nullable=False)  # 'flood', 'wildfire', etc.

    # Risk data
    risk_score = Column(Float)  # 0-100
    risk_details = Column(JSON)  # Store full hazard data

    # Metadata
    data_source = Column(String(100))  # e.g., 'FEMA NFHL', 'USGS'
    created_at = Column(DateTime, default=func.now())
    expires_at = Column(DateTime)  # TTL

    # Composite index for fast lookups
    __table_args__ = (
        Index('idx_location_hazard', 'latitude', 'longitude', 'hazard_type'),
    )

    def __repr__(self):
        return f'<ClimateRiskCache {self.hazard_type} at ({self.latitude}, {self.longitude})>'

    def is_expired(self):
        """Check if cache entry has expired"""
        if not self.expires_at:
            return False
        return datetime.utcnow() > self.expires_at


class ApiRateLimit(db.Model):
    """
    SQLAlchemy model for tracking API usage to avoid exceeding rate limits
    """
    __tablename__ = 'api_rate_limits'

    id = Column(Integer, primary_key=True, autoincrement=True)
    api_name = Column(String(50), nullable=False)  # 'NOAA_CDO', 'USGS', etc.
    date = Column(Date, nullable=False, index=True)
    request_count = Column(Integer, default=0)
    limit_per_day = Column(Integer)

    __table_args__ = (
        Index('idx_api_date', 'api_name', 'date'),
    )

    def __repr__(self):
        return f'<ApiRateLimit {self.api_name} on {self.date}: {self.request_count}/{self.limit_per_day}>'

    @staticmethod
    def check_and_increment(api_name, limit):
        """Check if we can make another request and increment counter"""
        from datetime import date as date_class
        today = date_class.today()

        rate_limit = ApiRateLimit.query.filter_by(
            api_name=api_name,
            date=today
        ).first()

        if not rate_limit:
            rate_limit = ApiRateLimit(
                api_name=api_name,
                date=today,
                request_count=0,
                limit_per_day=limit
            )
            db.session.add(rate_limit)

        if rate_limit.request_count >= limit:
            return False  # Limit exceeded

        rate_limit.request_count += 1
        db.session.commit()
        return True
