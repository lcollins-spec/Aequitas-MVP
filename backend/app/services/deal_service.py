"""
Deal service layer for CRUD operations
Handles business logic for deal management
"""
from typing import List, Optional, Dict
from datetime import datetime
from app.database import db, DealModel, RiskAssessmentModel
from app.models.deal_models import Deal
from app.services.hedonic_model_service import HedonicModelService
from app.services.rent_tier_service import RentTierService
from app.services.yield_calculation_service import YieldCalculationService
from app.services.capital_appreciation_service import CapitalAppreciationService
from app.services.total_return_service import TotalReturnService
from app.services.risk_assessment_service import RiskAssessmentService
from app.services.arbitrage_limits_service import ArbitrageLimitsService


class DealService:
    """Service class for managing real estate deals"""

    @staticmethod
    def create_deal(deal_data: dict) -> Deal:
        """
        Create a new deal

        Args:
            deal_data: Dictionary containing deal information

        Returns:
            Created Deal object

        Raises:
            ValueError: If required fields are missing
        """
        # Validate required fields
        if not deal_data.get('dealName'):
            raise ValueError('Deal name is required')
        if not deal_data.get('location'):
            raise ValueError('Location is required')

        # Create DealModel from dictionary
        deal_model = DealModel.from_dict(deal_data)

        # Save to database
        db.session.add(deal_model)
        db.session.commit()

        # Convert to Deal dataclass and return
        return Deal.from_dict(deal_model.to_dict())

    @staticmethod
    def get_deal(deal_id: int) -> Optional[Deal]:
        """
        Get a deal by ID

        Args:
            deal_id: ID of the deal to retrieve

        Returns:
            Deal object if found, None otherwise
        """
        deal_model = DealModel.query.get(deal_id)
        if not deal_model:
            return None

        return Deal.from_dict(deal_model.to_dict())

    @staticmethod
    def get_all_deals(status: Optional[str] = None, limit: int = 100) -> List[Deal]:
        """
        Get all deals, optionally filtered by status

        Args:
            status: Optional status filter ('potential', 'ongoing', 'completed', 'rejected')
            limit: Maximum number of deals to return (default 100)

        Returns:
            List of Deal objects
        """
        query = DealModel.query

        # Apply status filter if provided
        if status:
            query = query.filter(DealModel.status == status)

        # Order by updated_at descending (most recent first)
        query = query.order_by(DealModel.updated_at.desc())

        # Limit results
        query = query.limit(limit)

        # Execute query and convert to Deal objects
        deal_models = query.all()
        return [Deal.from_dict(dm.to_dict()) for dm in deal_models]

    @staticmethod
    def update_deal(deal_id: int, deal_data: dict) -> Optional[Deal]:
        """
        Update an existing deal

        Args:
            deal_id: ID of the deal to update
            deal_data: Dictionary containing updated deal information

        Returns:
            Updated Deal object if found, None otherwise
        """
        deal_model = DealModel.query.get(deal_id)
        if not deal_model:
            return None

        # Update fields from dictionary
        deal_model.update_from_dict(deal_data)

        # Commit changes
        db.session.commit()

        # Return updated Deal
        return Deal.from_dict(deal_model.to_dict())

    @staticmethod
    def delete_deal(deal_id: int) -> bool:
        """
        Delete a deal

        Args:
            deal_id: ID of the deal to delete

        Returns:
            True if deleted, False if not found
        """
        deal_model = DealModel.query.get(deal_id)
        if not deal_model:
            return False

        db.session.delete(deal_model)
        db.session.commit()
        return True

    @staticmethod
    def get_deals_by_status_grouped() -> dict:
        """
        Get deals grouped by status

        Returns:
            Dictionary with status as keys and lists of deals as values
        """
        deals = DealService.get_all_deals()

        grouped = {
            'potential': [],
            'ongoing': [],
            'completed': [],
            'rejected': []
        }

        for deal in deals:
            status = deal.status or 'potential'
            if status in grouped:
                grouped[status].append(deal)
            else:
                grouped['potential'].append(deal)

        return grouped

    @staticmethod
    def get_deal_model(deal_id: int) -> Optional[DealModel]:
        """
        Get the SQLAlchemy DealModel directly (for Excel export service)

        Args:
            deal_id: ID of the deal

        Returns:
            DealModel if found, None otherwise
        """
        return DealModel.query.get(deal_id)

    @staticmethod
    def calculate_risk_assessment(
        deal_id: int,
        holding_period: int = 10,
        geography: str = 'US',
        save_to_db: bool = True
    ) -> Dict:
        """
        Orchestrate complete risk assessment calculation pipeline

        This is the main orchestration method that runs all 10 calculation steps:
        1. Fetch deal and validate
        2. Predict fundamental rent (hedonic model)
        3. Classify into rent tier (D1-D10)
        4. Calculate gross and net yields
        5. Project capital appreciation
        6. Calculate total returns (levered/unlevered)
        7. Assess systematic, regulatory, and idiosyncratic risk
        8. Calculate arbitrage opportunity
        9. Compare to benchmarks
        10. Save to RiskAssessmentModel (if save_to_db=True)

        Args:
            deal_id: Deal to analyze
            holding_period: Investment horizon in years
            geography: Geographic market for benchmarks
            save_to_db: Whether to save results to database

        Returns:
            Complete risk assessment dictionary

        Raises:
            ValueError: If deal not found or missing required fields
        """

        # Step 1: Fetch and validate deal
        deal = DealModel.query.get(deal_id)
        if not deal:
            raise ValueError(f"Deal {deal_id} not found")

        # Validate required fields
        required_fields = ['square_footage', 'bedrooms', 'bathrooms']
        missing_fields = [f for f in required_fields if not getattr(deal, f, None)]
        if missing_fields:
            raise ValueError(f"Missing required fields for risk assessment: {missing_fields}")

        # Step 2: Predict fundamental rent using hedonic model
        property_data = {
            'square_footage': deal.square_footage,
            'bedrooms': deal.bedrooms,
            'bathrooms': deal.bathrooms,
            'year_built': getattr(deal, 'construction_year', None) or deal.year_built,
            'property_type': deal.property_type,
            'epc_score': getattr(deal, 'epc_score', None)
        }

        rent_prediction = HedonicModelService.predict_fundamental_rent(property_data)
        predicted_rent = rent_prediction['predicted_rent']

        # Step 3: Classify into rent tier
        classification = RentTierService.classify_property(
            predicted_rent=predicted_rent,
            geography='national',
            bedrooms=deal.bedrooms
        )

        rent_decile = classification['national_decile']

        # Step 4: Calculate yields
        annual_rent = predicted_rent * 12
        property_value = deal.purchase_price or 200000

        gross_yield = YieldCalculationService.calculate_gross_yield(
            annual_rent=annual_rent,
            property_value=property_value
        )

        cost_components = YieldCalculationService.calculate_cost_components(
            rent_decile=rent_decile,
            num_units=getattr(deal, 'number_of_units', None) or 1,
            property_value=property_value,
            annual_rent=annual_rent
        )

        net_yield = YieldCalculationService.calculate_net_yield(
            gross_yield=gross_yield,
            cost_components=cost_components
        )

        # Step 5: Project capital appreciation
        appreciation = CapitalAppreciationService.project_future_value(
            current_value=property_value,
            rent_decile=rent_decile,
            years=holding_period,
            geography=geography
        )

        # Step 6: Calculate total returns
        total_return_unlevered = TotalReturnService.calculate_unlevered_return(
            net_yield=net_yield,
            capital_gain_yield=appreciation['annualized_appreciation_rate']
        )

        cost_of_debt = deal.loan_interest_rate or 6.5
        down_payment_pct = deal.down_payment_percent or 25.0
        ltv = 1.0 - (down_payment_pct / 100)

        total_return_levered = TotalReturnService.calculate_levered_return(
            unlevered_return=total_return_unlevered,
            cost_of_debt=cost_of_debt,
            ltv=ltv
        )

        # Step 7: Calculate risk dimensions
        property_age = None
        year_built = getattr(deal, 'construction_year', None) or deal.year_built
        if year_built:
            property_age = datetime.now().year - year_built

        # Default state (should be extracted from address in production)
        state = 'CA'

        systematic_risk = RiskAssessmentService.calculate_systematic_risk(
            rent_decile=rent_decile,
            geography=geography
        )

        regulatory_risk = RiskAssessmentService.calculate_regulatory_risk(
            state=state,
            city=None,
            rent_level=predicted_rent,
            ami_percentage=None
        )

        idiosyncratic_risk = RiskAssessmentService.calculate_idiosyncratic_risk(
            property_age=property_age,
            property_condition=getattr(deal, 'property_condition', None),
            num_units=getattr(deal, 'number_of_units', None) or 1,
            concentration_risk=None,
            occupancy_rate=None
        )

        composite_risk = RiskAssessmentService.calculate_composite_risk(
            systematic_risk=systematic_risk,
            regulatory_risk=regulatory_risk,
            idiosyncratic_risk=idiosyncratic_risk,
            rent_decile=rent_decile
        )

        # Step 8: Calculate arbitrage opportunity
        renter_constraints = ArbitrageLimitsService.assess_renter_constraints(
            monthly_rent=predicted_rent,
            median_income=None,
            home_price_to_rent_ratio=None,
            rent_decile=rent_decile
        )

        institutional_constraints = ArbitrageLimitsService.assess_institutional_constraints(
            rent_decile=rent_decile,
            property_value=property_value,
            num_units=getattr(deal, 'number_of_units', None) or 1,
            liquidity_score=None
        )

        medium_landlord_fit = ArbitrageLimitsService.assess_medium_landlord_constraints(
            rent_decile=rent_decile,
            num_units=getattr(deal, 'number_of_units', None) or 1,
            property_value=property_value,
            geographic_concentration=None
        )

        arbitrage_opportunity = ArbitrageLimitsService.calculate_arbitrage_opportunity(
            renter_constraints=renter_constraints,
            institutional_constraints=institutional_constraints,
            medium_landlord_constraints=medium_landlord_fit,
            rent_decile=rent_decile
        )

        # Step 9: Compare to benchmarks
        yield_benchmark = YieldCalculationService.compare_to_benchmark(
            calculated_net_yield=net_yield,
            rent_decile=rent_decile,
            geography=geography
        )

        return_benchmark = TotalReturnService.compare_to_benchmark(
            total_return_unlevered=total_return_unlevered,
            rent_decile=rent_decile,
            geography=geography
        )

        # Compile complete assessment
        assessment = {
            'deal_id': deal_id,
            'calculated_at': datetime.utcnow().isoformat(),
            'holding_period': holding_period,
            'geography': geography,

            # Rent prediction and classification
            'predicted_fundamental_rent': predicted_rent,
            'rent_decile_national': classification['national_decile'],
            'rent_decile_regional': classification['regional_decile'],
            'rent_tier_label': classification['tier_label'],
            'rent_percentile': classification['percentile'],

            # Yields
            'gross_yield': gross_yield,
            'maintenance_cost_pct': cost_components['maintenance_cost_pct'],
            'property_tax_pct': cost_components['property_tax_pct'],
            'turnover_cost_pct': cost_components['turnover_cost_pct'],
            'default_cost_pct': cost_components['default_cost_pct'],
            'management_cost_pct': cost_components['management_cost_pct'],
            'total_cost_pct': cost_components['total_cost_pct'],
            'net_yield': net_yield,

            # Appreciation
            'projected_price_yr1': appreciation['projected_value_yr1'],
            'projected_price_yr5': appreciation['projected_value_yr5'],
            'projected_price_yr10': appreciation['projected_value_yr10'],
            'capital_gain_yield_annual': appreciation['annualized_appreciation_rate'],

            # Total returns
            'total_return_unlevered': total_return_unlevered,
            'total_return_levered': total_return_levered,
            'leverage_effect': round(total_return_levered - total_return_unlevered, 2),

            # Risk scores
            'systematic_risk_score': systematic_risk['systematic_risk_score'],
            'beta_gdp': systematic_risk['beta_gdp'],
            'beta_stocks': systematic_risk['beta_stocks'],
            'cash_flow_volatility': systematic_risk['cash_flow_volatility'],
            'cash_flow_cyclicality': systematic_risk['cash_flow_cyclicality'],

            'regulatory_risk_score': regulatory_risk['regulatory_risk_score'],
            'has_rent_control': regulatory_risk['has_rent_control'],
            'rps_score': regulatory_risk['rps_score'],

            'idiosyncratic_risk_score': idiosyncratic_risk['idiosyncratic_risk_score'],

            'composite_risk_score': composite_risk['composite_risk_score'],
            'composite_risk_level': composite_risk['composite_risk_level'],

            # Arbitrage
            'renter_constraint_score': renter_constraints['renter_constraint_score'],
            'institutional_constraint_score': institutional_constraints['institutional_constraint_score'],
            'medium_landlord_fit_score': 100 - medium_landlord_fit['medium_landlord_constraint_score'],
            'arbitrage_opportunity_score': arbitrage_opportunity['arbitrage_opportunity_score'],
            'arbitrage_opportunity_level': arbitrage_opportunity['opportunity_level'],
            'recommended_investor_type': arbitrage_opportunity['recommended_investor_type'],

            # Benchmarks
            'vs_benchmark_yield': yield_benchmark['position'],
            'vs_benchmark_return': return_benchmark['position'],

            # Full component data
            'components': {
                'rent_prediction': rent_prediction,
                'classification': classification,
                'cost_components': cost_components,
                'appreciation': appreciation,
                'systematic_risk': systematic_risk,
                'regulatory_risk': regulatory_risk,
                'idiosyncratic_risk': idiosyncratic_risk,
                'composite_risk': composite_risk,
                'renter_constraints': renter_constraints,
                'institutional_constraints': institutional_constraints,
                'medium_landlord_fit': medium_landlord_fit,
                'arbitrage_opportunity': arbitrage_opportunity,
                'yield_benchmark': yield_benchmark,
                'return_benchmark': return_benchmark
            }
        }

        # Step 10: Save to database if requested
        if save_to_db:
            assessment_id = DealService._save_risk_assessment(deal_id, assessment)
            assessment['assessment_id'] = assessment_id

        return assessment

    @staticmethod
    def _save_risk_assessment(deal_id: int, assessment: Dict) -> int:
        """
        Save risk assessment to database

        Args:
            deal_id: Deal ID
            assessment: Assessment data dictionary

        Returns:
            ID of created RiskAssessmentModel
        """

        # Create or update risk assessment record
        existing = RiskAssessmentModel.query.filter_by(deal_id=deal_id).first()

        if existing:
            # Update existing record
            for key, value in assessment.items():
                if key not in ['deal_id', 'calculated_at', 'components', 'assessment_id']:
                    if hasattr(existing, key):
                        setattr(existing, key, value)
            existing.updated_at = datetime.utcnow()
            db.session.commit()
            return existing.id
        else:
            # Create new record
            risk_assessment = RiskAssessmentModel(
                deal_id=deal_id,
                predicted_fundamental_rent=assessment['predicted_fundamental_rent'],
                rent_decile_national=assessment['rent_decile_national'],
                rent_decile_regional=assessment['rent_decile_regional'],
                rent_tier_label=assessment['rent_tier_label'],
                gross_yield=assessment['gross_yield'],
                net_yield=assessment['net_yield'],
                maintenance_cost_pct=assessment['maintenance_cost_pct'],
                property_tax_pct=assessment['property_tax_pct'],
                turnover_cost_pct=assessment['turnover_cost_pct'],
                default_cost_pct=assessment['default_cost_pct'],
                management_cost_pct=assessment['management_cost_pct'],
                projected_price_yr1=assessment['projected_price_yr1'],
                projected_price_yr5=assessment['projected_price_yr5'],
                projected_price_yr10=assessment['projected_price_yr10'],
                capital_gain_yield_annual=assessment['capital_gain_yield_annual'],
                total_return_unlevered=assessment['total_return_unlevered'],
                total_return_levered=assessment['total_return_levered'],
                systematic_risk_score=assessment['systematic_risk_score'],
                cash_flow_cyclicality=assessment['cash_flow_cyclicality'],
                regulatory_risk_score=assessment['regulatory_risk_score'],
                idiosyncratic_risk_score=assessment['idiosyncratic_risk_score'],
                composite_risk_level=assessment['composite_risk_level'],
                renter_constraint_score=assessment['renter_constraint_score'],
                institutional_constraint_score=assessment['institutional_constraint_score'],
                medium_landlord_constraint_score=assessment['medium_landlord_fit_score'],
                arbitrage_opportunity_score=assessment['arbitrage_opportunity_score'],
                benchmark_net_yield_min=assessment.get('benchmark_net_yield_min'),
                benchmark_net_yield_max=assessment.get('benchmark_net_yield_max'),
                benchmark_capital_gain_min=assessment.get('benchmark_capital_gain_min'),
                benchmark_capital_gain_max=assessment.get('benchmark_capital_gain_max'),
                benchmark_total_return_min=assessment.get('benchmark_total_return_min'),
                benchmark_total_return_max=assessment.get('benchmark_total_return_max'),
                vs_benchmark_yield=assessment['vs_benchmark_yield'],
                vs_benchmark_return=assessment['vs_benchmark_return']
            )

            db.session.add(risk_assessment)
            db.session.commit()

            # Update deal with risk_assessment_id
            deal = DealModel.query.get(deal_id)
            if deal:
                deal.risk_assessment_id = risk_assessment.id
                db.session.commit()

            return risk_assessment.id

    @staticmethod
    def get_risk_assessment(deal_id: int) -> Optional[Dict]:
        """
        Get latest risk assessment for a deal

        Args:
            deal_id: Deal ID

        Returns:
            Risk assessment dictionary if found, None otherwise
        """

        assessment = RiskAssessmentModel.query.filter_by(deal_id=deal_id).first()

        if not assessment:
            return None

        return assessment.to_dict()

    @staticmethod
    def get_deal_with_risk_assessment(deal_id: int) -> Optional[Dict]:
        """
        Get deal with its latest risk assessment in single response

        Args:
            deal_id: Deal ID

        Returns:
            Combined deal and risk assessment dictionary
        """

        deal = DealService.get_deal(deal_id)
        if not deal:
            return None

        risk_assessment = DealService.get_risk_assessment(deal_id)

        return {
            'deal': deal.__dict__ if hasattr(deal, '__dict__') else deal,
            'risk_assessment': risk_assessment
        }
