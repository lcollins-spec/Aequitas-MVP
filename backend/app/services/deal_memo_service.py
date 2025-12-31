"""
Deal Memo Service
Generates comprehensive investment analysis memos

Combines all assessment services:
- Hedonic rent prediction
- Rent tier classification
- Yield analysis
- Capital appreciation
- Total return calculation
- Risk assessment
- Arbitrage opportunity
"""

from typing import Dict, Optional
from datetime import datetime
from app.database import db, DealModel
from app.services.hedonic_model_service import HedonicModelService
from app.services.rent_tier_service import RentTierService
from app.services.yield_calculation_service import YieldCalculationService
from app.services.capital_appreciation_service import CapitalAppreciationService
from app.services.total_return_service import TotalReturnService
from app.services.risk_assessment_service import RiskAssessmentService
from app.services.arbitrage_limits_service import ArbitrageLimitsService


class DealMemoService:
    """
    Service for generating comprehensive deal analysis memos
    """

    @staticmethod
    def generate_memo(
        deal_id: int,
        holding_period: int = 10,
        geography: str = 'US'
    ) -> Dict:
        """
        Generate complete investment analysis memo

        Args:
            deal_id: Deal to analyze
            holding_period: Investment horizon in years
            geography: Geographic market

        Returns:
            Comprehensive analysis dictionary with all components
        """

        # Fetch deal
        deal = DealModel.query.get(deal_id)
        if not deal:
            raise ValueError(f"Deal {deal_id} not found")

        memo = {
            'deal_id': deal_id,
            'generated_at': datetime.utcnow().isoformat(),
            'holding_period': holding_period,
            'property_summary': {},
            'rent_prediction': {},
            'tier_classification': {},
            'yield_analysis': {},
            'appreciation_projection': {},
            'total_return': {},
            'risk_assessment': {},
            'arbitrage_opportunity': {},
            'investment_recommendation': {},
            'sensitivity_analysis': {},
            'executive_summary': {}
        }

        # SECTION 1: Property Summary
        property_age = None
        year_built = getattr(deal, 'construction_year', None) or deal.year_built
        if year_built:
            property_age = datetime.now().year - year_built

        memo['property_summary'] = {
            'address': getattr(deal, 'street_address', None) or deal.property_address or 'N/A',
            'purchase_price': deal.purchase_price,
            'bedrooms': deal.bedrooms,
            'bathrooms': deal.bathrooms,
            'square_footage': deal.square_footage,
            'year_built': year_built,
            'property_age': property_age,
            'property_condition': getattr(deal, 'property_condition', None),
            'number_of_units': getattr(deal, 'number_of_units', None) or 1,
            'property_type': deal.property_type
        }

        # SECTION 2: Rent Prediction (Hedonic Model)
        try:
            property_data = {
                'square_footage': deal.square_footage,
                'bedrooms': deal.bedrooms,
                'bathrooms': deal.bathrooms,
                'year_built': year_built,
                'property_type': deal.property_type,
                'epc_score': getattr(deal, 'epc_score', None)
            }

            rent_prediction = HedonicModelService.predict_fundamental_rent(property_data)
            memo['rent_prediction'] = rent_prediction

            predicted_rent = rent_prediction['predicted_rent']
        except Exception as e:
            # Fallback to observed rent if hedonic model fails
            predicted_rent = deal.monthly_rent or 1000
            memo['rent_prediction'] = {
                'predicted_rent': predicted_rent,
                'error': str(e),
                'fallback_method': 'observed_rent'
            }

        # SECTION 3: Rent Tier Classification
        classification = RentTierService.classify_property(
            predicted_rent=predicted_rent,
            geography='national',
            bedrooms=deal.bedrooms
        )
        memo['tier_classification'] = classification

        rent_decile = classification['national_decile']

        # SECTION 4: Yield Analysis
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

        yield_benchmark = YieldCalculationService.compare_to_benchmark(
            calculated_net_yield=net_yield,
            rent_decile=rent_decile,
            geography=geography
        )

        memo['yield_analysis'] = {
            'annual_rent': annual_rent,
            'property_value': property_value,
            'gross_yield': gross_yield,
            'cost_components': cost_components,
            'net_yield': net_yield,
            'benchmark_comparison': yield_benchmark
        }

        # SECTION 5: Capital Appreciation Projection
        appreciation = CapitalAppreciationService.project_future_value(
            current_value=property_value,
            rent_decile=rent_decile,
            years=holding_period,
            geography=geography
        )

        memo['appreciation_projection'] = appreciation

        # SECTION 6: Total Return Calculation
        total_return_unlevered = TotalReturnService.calculate_unlevered_return(
            net_yield=net_yield,
            capital_gain_yield=appreciation['annualized_appreciation_rate']
        )

        # Get financing terms
        cost_of_debt = deal.loan_interest_rate or 6.5
        down_payment_pct = deal.down_payment_percent or 25.0
        ltv = 1.0 - (down_payment_pct / 100)

        total_return_levered = TotalReturnService.calculate_levered_return(
            unlevered_return=total_return_unlevered,
            cost_of_debt=cost_of_debt,
            ltv=ltv
        )

        return_benchmark = TotalReturnService.compare_to_benchmark(
            total_return_unlevered=total_return_unlevered,
            rent_decile=rent_decile,
            geography=geography
        )

        memo['total_return'] = {
            'net_yield': net_yield,
            'capital_gain_yield': appreciation['annualized_appreciation_rate'],
            'total_return_unlevered': total_return_unlevered,
            'cost_of_debt': cost_of_debt,
            'ltv': round(ltv, 3),
            'total_return_levered': total_return_levered,
            'leverage_effect': round(total_return_levered - total_return_unlevered, 2),
            'benchmark_comparison': return_benchmark
        }

        # SECTION 7: Risk Assessment
        # Extract state from address (simplified)
        state = 'CA'  # Default, should be extracted from address in production

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

        memo['risk_assessment'] = {
            'systematic_risk': systematic_risk,
            'regulatory_risk': regulatory_risk,
            'idiosyncratic_risk': idiosyncratic_risk,
            'composite_risk': composite_risk,
            'key_risks': RiskAssessmentService._identify_key_risks(
                systematic_risk, regulatory_risk, idiosyncratic_risk
            ),
            'risk_mitigations': RiskAssessmentService._suggest_mitigations(
                systematic_risk, regulatory_risk, idiosyncratic_risk, rent_decile
            )
        }

        # SECTION 8: Arbitrage Opportunity
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

        memo['arbitrage_opportunity'] = {
            'renter_constraints': renter_constraints,
            'institutional_constraints': institutional_constraints,
            'medium_landlord_fit': medium_landlord_fit,
            'overall_opportunity': arbitrage_opportunity
        }

        # SECTION 9: Investment Recommendation
        recommendation = DealMemoService._generate_recommendation(
            tier_classification=classification,
            total_return=memo['total_return'],
            risk_assessment=composite_risk,
            arbitrage_opportunity=arbitrage_opportunity
        )

        memo['investment_recommendation'] = recommendation

        # SECTION 10: Sensitivity Analysis
        sensitivity = DealMemoService._generate_sensitivity_analysis(
            base_net_yield=net_yield,
            base_appreciation=appreciation['annualized_appreciation_rate'],
            cost_of_debt=cost_of_debt,
            ltv=ltv
        )

        memo['sensitivity_analysis'] = sensitivity

        # SECTION 11: Executive Summary
        executive_summary = DealMemoService._generate_executive_summary(
            deal=deal,
            classification=classification,
            total_return=memo['total_return'],
            risk_assessment=composite_risk,
            arbitrage_opportunity=arbitrage_opportunity,
            recommendation=recommendation
        )

        memo['executive_summary'] = executive_summary

        return memo

    @staticmethod
    def _generate_recommendation(
        tier_classification: Dict,
        total_return: Dict,
        risk_assessment: Dict,
        arbitrage_opportunity: Dict
    ) -> Dict:
        """Generate investment recommendation based on analysis"""

        rent_decile = tier_classification['national_decile']
        tier_label = tier_classification['tier_label']
        total_return_unlevered = total_return['total_return_unlevered']
        total_return_levered = total_return['total_return_levered']
        composite_risk_score = risk_assessment['composite_risk_score']
        composite_risk_level = risk_assessment['composite_risk_level']
        arbitrage_score = arbitrage_opportunity['arbitrage_opportunity_score']
        arbitrage_level = arbitrage_opportunity['opportunity_level']

        # Determine overall rating
        if total_return_unlevered > 8.0 and composite_risk_score < 45 and arbitrage_score > 70:
            rating = 'Strong Buy'
            rating_score = 90
        elif total_return_unlevered > 6.0 and composite_risk_score < 55 and arbitrage_score > 55:
            rating = 'Buy'
            rating_score = 75
        elif total_return_unlevered > 4.0 and composite_risk_score < 65:
            rating = 'Hold'
            rating_score = 60
        elif total_return_unlevered > 2.0:
            rating = 'Consider'
            rating_score = 45
        else:
            rating = 'Pass'
            rating_score = 30

        # Key strengths
        strengths = []
        if rent_decile <= 3:
            strengths.append(f"{tier_label} tier delivers research-validated return premium (2-4%/year vs high-rent)")
        if composite_risk_score < 40:
            strengths.append(f"Low total risk ({composite_risk_level}) - below market average")
        if arbitrage_score > 70:
            strengths.append(f"High arbitrage opportunity - limited institutional competition")
        if total_return_levered > 10:
            strengths.append(f"Strong levered returns ({total_return_levered}%) with moderate leverage")

        # Key concerns
        concerns = []
        if composite_risk_score > 60:
            concerns.append(f"Elevated risk profile ({composite_risk_level})")
        if total_return_unlevered < 5:
            concerns.append(f"Below-market unlevered returns ({total_return_unlevered}%)")
        if arbitrage_score < 40:
            concerns.append("Limited arbitrage opportunity - competitive market")
        if rent_decile >= 8:
            concerns.append(f"{tier_label} tier shows higher systematic risk and lower returns")

        # Target investor
        target_investor = arbitrage_opportunity.get('recommended_investor_type', 'Individual Investor')

        return {
            'overall_rating': rating,
            'rating_score': rating_score,
            'target_investor': target_investor,
            'key_strengths': strengths,
            'key_concerns': concerns,
            'summary': DealMemoService._generate_recommendation_summary(
                rating, tier_label, total_return_unlevered, composite_risk_level, arbitrage_level
            )
        }

    @staticmethod
    def _generate_recommendation_summary(
        rating: str,
        tier_label: str,
        total_return: float,
        risk_level: str,
        arbitrage_level: str
    ) -> str:
        """Generate recommendation summary text"""

        if rating == 'Strong Buy':
            return (
                f"{tier_label} property with exceptional risk-adjusted returns. "
                f"{total_return:.1f}% unlevered return with {risk_level.lower()} risk profile "
                f"and {arbitrage_level.lower()} arbitrage opportunity. "
                "Strongly recommended for acquisition."
            )
        elif rating == 'Buy':
            return (
                f"{tier_label} property with attractive returns. "
                f"{total_return:.1f}% unlevered return and {risk_level.lower()} risk. "
                "Recommended for acquisition with standard due diligence."
            )
        elif rating == 'Hold':
            return (
                f"{tier_label} property with market-rate returns. "
                f"{total_return:.1f}% unlevered return. "
                "Acceptable investment but not exceptional."
            )
        elif rating == 'Consider':
            return (
                f"{tier_label} property with modest returns. "
                f"{total_return:.1f}% unlevered return. "
                "Proceed with caution and detailed analysis."
            )
        else:
            return (
                f"{tier_label} property with below-market returns. "
                f"{total_return:.1f}% unlevered return. "
                "Not recommended unless strategic rationale exists."
            )

    @staticmethod
    def _generate_sensitivity_analysis(
        base_net_yield: float,
        base_appreciation: float,
        cost_of_debt: float,
        ltv: float
    ) -> Dict:
        """Generate sensitivity tables for key variables"""

        scenarios = {}

        # Scenario 1: Base Case
        scenarios['base'] = {
            'name': 'Base Case',
            'net_yield': base_net_yield,
            'capital_gain': base_appreciation,
            'total_return_unlevered': round(base_net_yield + base_appreciation, 2),
            'total_return_levered': TotalReturnService.calculate_levered_return(
                base_net_yield + base_appreciation, cost_of_debt, ltv
            )
        }

        # Scenario 2: Optimistic (+0.5% yield, +1.0% appreciation)
        opt_yield = base_net_yield + 0.5
        opt_appreciation = base_appreciation + 1.0
        scenarios['optimistic'] = {
            'name': 'Optimistic',
            'net_yield': opt_yield,
            'capital_gain': opt_appreciation,
            'total_return_unlevered': round(opt_yield + opt_appreciation, 2),
            'total_return_levered': TotalReturnService.calculate_levered_return(
                opt_yield + opt_appreciation, cost_of_debt, ltv
            )
        }

        # Scenario 3: Pessimistic (-0.5% yield, -1.0% appreciation)
        pess_yield = base_net_yield - 0.5
        pess_appreciation = base_appreciation - 1.0
        scenarios['pessimistic'] = {
            'name': 'Pessimistic',
            'net_yield': pess_yield,
            'capital_gain': pess_appreciation,
            'total_return_unlevered': round(pess_yield + pess_appreciation, 2),
            'total_return_levered': TotalReturnService.calculate_levered_return(
                pess_yield + pess_appreciation, cost_of_debt, ltv
            )
        }

        # Scenario 4: High Interest Rates (+2% cost of debt)
        scenarios['high_rates'] = {
            'name': 'High Interest Rates',
            'net_yield': base_net_yield,
            'capital_gain': base_appreciation,
            'cost_of_debt': cost_of_debt + 2.0,
            'total_return_unlevered': round(base_net_yield + base_appreciation, 2),
            'total_return_levered': TotalReturnService.calculate_levered_return(
                base_net_yield + base_appreciation, cost_of_debt + 2.0, ltv
            )
        }

        # Scenario 5: Low Leverage (50% LTV)
        scenarios['low_leverage'] = {
            'name': 'Low Leverage (50% LTV)',
            'net_yield': base_net_yield,
            'capital_gain': base_appreciation,
            'ltv': 0.50,
            'total_return_unlevered': round(base_net_yield + base_appreciation, 2),
            'total_return_levered': TotalReturnService.calculate_levered_return(
                base_net_yield + base_appreciation, cost_of_debt, 0.50
            )
        }

        return {
            'scenarios': scenarios,
            'interpretation': DealMemoService._interpret_sensitivity(scenarios)
        }

    @staticmethod
    def _interpret_sensitivity(scenarios: Dict) -> str:
        """Interpret sensitivity analysis results"""

        base_levered = scenarios['base']['total_return_levered']
        opt_levered = scenarios['optimistic']['total_return_levered']
        pess_levered = scenarios['pessimistic']['total_return_levered']

        upside = opt_levered - base_levered
        downside = base_levered - pess_levered

        if downside < upside:
            return (
                f"Asymmetric return profile with {upside:.1f}% upside vs {downside:.1f}% downside. "
                "Positive risk-reward skew."
            )
        else:
            return (
                f"Returns range from {pess_levered:.1f}% (pessimistic) to {opt_levered:.1f}% (optimistic). "
                f"Downside of {downside:.1f}% exceeds upside of {upside:.1f}%."
            )

    @staticmethod
    def _generate_executive_summary(
        deal: DealModel,
        classification: Dict,
        total_return: Dict,
        risk_assessment: Dict,
        arbitrage_opportunity: Dict,
        recommendation: Dict
    ) -> Dict:
        """Generate executive summary for memo"""

        return {
            'property': f"{deal.bedrooms}BR/{deal.bathrooms}BA, {deal.square_footage or 'N/A'} sqft",
            'address': getattr(deal, 'street_address', None) or deal.property_address or 'N/A',
            'purchase_price': deal.purchase_price,
            'rent_tier': classification['tier_label'],
            'tier_category': classification['interpretation']['category'],
            'expected_return_range': classification['interpretation']['expected_return_range'],
            'calculated_return_unlevered': total_return['total_return_unlevered'],
            'calculated_return_levered': total_return['total_return_levered'],
            'risk_level': risk_assessment['composite_risk_level'],
            'risk_score': risk_assessment['composite_risk_score'],
            'arbitrage_opportunity_level': arbitrage_opportunity['opportunity_level'],
            'arbitrage_score': arbitrage_opportunity['arbitrage_opportunity_score'],
            'overall_rating': recommendation['overall_rating'],
            'rating_score': recommendation['rating_score'],
            'target_investor': recommendation['target_investor'],
            'key_takeaway': recommendation['summary']
        }

    @staticmethod
    def generate_comparison_memo(deal_ids: list, holding_period: int = 10) -> Dict:
        """
        Generate side-by-side comparison of multiple deals

        Args:
            deal_ids: List of deal IDs to compare
            holding_period: Investment horizon

        Returns:
            Comparison analysis with rankings
        """

        if len(deal_ids) < 2:
            raise ValueError("Need at least 2 deals to compare")

        if len(deal_ids) > 5:
            raise ValueError("Maximum 5 deals for comparison")

        comparison = {
            'generated_at': datetime.utcnow().isoformat(),
            'holding_period': holding_period,
            'deals': {},
            'rankings': {},
            'summary': {}
        }

        # Generate memo for each deal
        for deal_id in deal_ids:
            try:
                memo = DealMemoService.generate_memo(deal_id, holding_period)
                comparison['deals'][deal_id] = memo
            except Exception as e:
                comparison['deals'][deal_id] = {'error': str(e)}

        # Rank deals by various metrics
        comparison['rankings'] = DealMemoService._rank_deals(comparison['deals'])

        return comparison

    @staticmethod
    def _rank_deals(deals: Dict) -> Dict:
        """Rank deals by key metrics"""

        rankings = {
            'by_total_return': [],
            'by_risk_adjusted_return': [],
            'by_arbitrage_opportunity': [],
            'by_overall_rating': []
        }

        valid_deals = {
            deal_id: memo
            for deal_id, memo in deals.items()
            if 'error' not in memo
        }

        # Rank by total return (levered)
        rankings['by_total_return'] = sorted(
            valid_deals.items(),
            key=lambda x: x[1]['total_return']['total_return_levered'],
            reverse=True
        )

        # Rank by risk-adjusted return (Sharpe-like: return / risk)
        rankings['by_risk_adjusted_return'] = sorted(
            valid_deals.items(),
            key=lambda x: (
                x[1]['total_return']['total_return_unlevered'] /
                max(x[1]['risk_assessment']['composite_risk']['composite_risk_score'], 1)
            ),
            reverse=True
        )

        # Rank by arbitrage opportunity
        rankings['by_arbitrage_opportunity'] = sorted(
            valid_deals.items(),
            key=lambda x: x[1]['arbitrage_opportunity']['overall_opportunity']['arbitrage_opportunity_score'],
            reverse=True
        )

        # Rank by overall rating
        rankings['by_overall_rating'] = sorted(
            valid_deals.items(),
            key=lambda x: x[1]['investment_recommendation']['rating_score'],
            reverse=True
        )

        return rankings
