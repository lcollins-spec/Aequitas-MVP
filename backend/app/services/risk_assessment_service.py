"""
Risk Assessment Service
Calculates systematic, regulatory, and idiosyncratic risk scores

Academic Research Basis:
- Low-rent properties have LOWER systematic risk (β to GDP/stocks)
- D1 beta: 0.15-0.30 vs D10 beta: 0.45-0.65
- Regulatory risk varies by location (rent control, RPS score)
- Total risk (volatility) is LOWER for D1 than D10, contradicting market beliefs
"""

import json
import os
from typing import Dict, Optional, Tuple
from app.database import db, RiskBenchmarkData, DealModel


class RiskAssessmentService:
    """
    Service for calculating multi-dimensional risk scores
    """

    # Cache for regulatory data
    _regulatory_data_cache = None

    @staticmethod
    def load_regulatory_data() -> Dict:
        """
        Load regulatory data from JSON file

        Returns:
            Dictionary with rent control, RPS scores, political control data
        """
        if RiskAssessmentService._regulatory_data_cache:
            return RiskAssessmentService._regulatory_data_cache

        data_dir = os.path.join(
            os.path.dirname(os.path.dirname(__file__)),
            'data'
        )
        regulatory_path = os.path.join(data_dir, 'regulatory_data.json')

        try:
            with open(regulatory_path, 'r') as f:
                data = json.load(f)

            RiskAssessmentService._regulatory_data_cache = data
            return data

        except FileNotFoundError:
            raise FileNotFoundError(
                f"Regulatory data file not found at {regulatory_path}"
            )
        except json.JSONDecodeError:
            raise ValueError(f"Invalid JSON in regulatory file: {regulatory_path}")

    @staticmethod
    def calculate_systematic_risk(
        rent_decile: int,
        geography: str = 'US'
    ) -> Dict:
        """
        Calculate systematic risk (market correlation)

        Systematic risk = correlation with GDP, stock market, interest rates

        Key Finding: Low-rent properties have LOWER systematic risk
        - D1 beta to GDP: 0.15-0.30
        - D10 beta to GDP: 0.45-0.65
        - D1 beta to stocks: 0.20-0.35
        - D10 beta to stocks: 0.50-0.70

        Args:
            rent_decile: Property's rent tier (1-10)
            geography: Geographic market

        Returns:
            {
                'beta_gdp': 0.25,
                'beta_stocks': 0.30,
                'cash_flow_cyclicality': 'Low',
                'systematic_risk_score': 25.0,  # 0-100, lower is better
                'interpretation': 'Lower than average systematic risk'
            }
        """

        # Get benchmark data
        benchmark = RiskBenchmarkData.query.filter_by(
            rent_decile=rent_decile,
            geography=geography
        ).first()

        if benchmark and benchmark.systematic_risk_beta:
            beta_gdp = benchmark.systematic_risk_beta
        else:
            # Estimate beta based on decile (inversely correlated with rent level)
            # D1: low beta (0.20), D10: high beta (0.60)
            beta_gdp = 0.20 + (rent_decile - 1) * 0.044

        # Stock market beta is typically 1.5x GDP beta for real estate
        beta_stocks = beta_gdp * 1.4

        # Cash flow volatility
        if benchmark and benchmark.cash_flow_volatility:
            volatility = benchmark.cash_flow_volatility
        else:
            # D1: 8-12% volatility, D10: 15-20% volatility
            volatility = 8.0 + (rent_decile - 1) * 1.3

        # Determine cyclicality
        if beta_gdp < 0.30:
            cyclicality = 'Low'
        elif beta_gdp < 0.45:
            cyclicality = 'Moderate'
        else:
            cyclicality = 'High'

        # Calculate composite systematic risk score (0-100)
        # Lower is better
        beta_component = (beta_gdp / 0.70) * 50  # Normalize to 0-50
        volatility_component = (volatility / 20) * 50  # Normalize to 0-50
        systematic_risk_score = beta_component + volatility_component

        # Interpretation
        if systematic_risk_score < 35:
            interpretation = 'Lower than average systematic risk - less correlated with economic cycles'
        elif systematic_risk_score < 55:
            interpretation = 'Average systematic risk - moderate correlation with market conditions'
        else:
            interpretation = 'Higher than average systematic risk - highly correlated with economic cycles'

        return {
            'beta_gdp': round(beta_gdp, 2),
            'beta_stocks': round(beta_stocks, 2),
            'cash_flow_volatility': round(volatility, 1),
            'cash_flow_cyclicality': cyclicality,
            'systematic_risk_score': round(systematic_risk_score, 1),
            'interpretation': interpretation,
            'components': {
                'beta_component': round(beta_component, 1),
                'volatility_component': round(volatility_component, 1)
            }
        }

    @staticmethod
    def calculate_regulatory_risk(
        state: str,
        city: Optional[str] = None,
        rent_level: Optional[float] = None,
        ami_percentage: Optional[float] = None
    ) -> Dict:
        """
        Calculate regulatory and policy risk

        Tests 5 dimensions:
        1. Rent control exposure
        2. Renter Protection Score (RPS)
        3. Political control (likelihood of new tenant-friendly laws)
        4. Policy uncertainty index
        5. AMI threshold proximity (affordable housing regulation risk)

        Key Finding: Regulatory risk does NOT eliminate D1 premium

        Args:
            state: Two-letter state code (e.g., 'CA', 'TX')
            city: City name (optional, for rent control check)
            rent_level: Monthly rent (for AMI comparison)
            ami_percentage: Rent as % of Area Median Income

        Returns:
            {
                'has_rent_control': True,
                'rps_score': 3.8,
                'political_risk': 'High',
                'policy_uncertainty': 'High',
                'ami_risk': 'Low',
                'regulatory_risk_score': 65.0,  # 0-100, higher is more risk
                'interpretation': 'High regulatory risk - strong tenant protections'
            }
        """

        regulatory_data = RiskAssessmentService.load_regulatory_data()

        # Test 1: Rent Control
        has_rent_control = False
        rent_control_score = 0.0

        if state in regulatory_data['rent_control']['states_with_rent_control']:
            has_rent_control = True
            rent_control_score = 20.0

        if city:
            city_match = f"{city}, {state}"
            if city_match in regulatory_data['rent_control']['cities_with_rent_control']:
                has_rent_control = True
                rent_control_score = 25.0

        # Test 2: Renter Protection Score (RPS)
        rps_score = regulatory_data['renter_protection_score']['state_scores'].get(state, 1.5)

        # Higher RPS = more risk for landlords
        # Scale: 0-5, convert to 0-30 risk points
        rps_risk_score = (rps_score / 5.0) * 30

        # Test 3: Political Control (likelihood of new regulations)
        political_risk = 'Low'
        political_risk_score = 0.0

        if state in regulatory_data['political_control_2024']['democratic_trifecta']:
            political_risk = 'High'
            political_risk_score = 20.0
        elif state in regulatory_data['political_control_2024']['divided_government']:
            political_risk = 'Moderate'
            political_risk_score = 10.0
        elif state in regulatory_data['political_control_2024']['republican_trifecta']:
            political_risk = 'Low'
            political_risk_score = 0.0

        # Test 4: Policy Uncertainty Index
        policy_uncertainty = 'Low'
        uncertainty_score = 0.0

        high_uncertainty_states = regulatory_data['policy_uncertainty_index']['high_uncertainty']['states']
        moderate_uncertainty_states = regulatory_data['policy_uncertainty_index']['moderate_uncertainty']['states']

        if state in high_uncertainty_states:
            policy_uncertainty = 'High'
            uncertainty_score = 15.0
        elif state in moderate_uncertainty_states:
            policy_uncertainty = 'Moderate'
            uncertainty_score = 7.5

        # Test 5: AMI Threshold Proximity
        ami_risk = 'Low'
        ami_risk_score = 0.0

        if ami_percentage:
            if ami_percentage <= 50:
                ami_risk = 'High'
                ami_risk_score = 15.0  # Strong affordable housing regulations
            elif ami_percentage <= 80:
                ami_risk = 'Moderate'
                ami_risk_score = 7.5
            else:
                ami_risk = 'Low'
                ami_risk_score = 0.0

        # Calculate composite regulatory risk score (0-100)
        regulatory_risk_score = (
            rent_control_score +
            rps_risk_score +
            political_risk_score +
            uncertainty_score +
            ami_risk_score
        )

        # Cap at 100
        regulatory_risk_score = min(regulatory_risk_score, 100.0)

        # Interpretation
        if regulatory_risk_score < 25:
            interpretation = 'Low regulatory risk - landlord-friendly environment'
        elif regulatory_risk_score < 50:
            interpretation = 'Moderate regulatory risk - balanced regulations'
        elif regulatory_risk_score < 75:
            interpretation = 'High regulatory risk - strong tenant protections'
        else:
            interpretation = 'Very high regulatory risk - extensive tenant-friendly laws'

        return {
            'has_rent_control': has_rent_control,
            'rps_score': rps_score,
            'political_risk': political_risk,
            'policy_uncertainty': policy_uncertainty,
            'ami_risk': ami_risk,
            'regulatory_risk_score': round(regulatory_risk_score, 1),
            'interpretation': interpretation,
            'components': {
                'rent_control_score': rent_control_score,
                'rps_risk_score': round(rps_risk_score, 1),
                'political_risk_score': political_risk_score,
                'uncertainty_score': uncertainty_score,
                'ami_risk_score': ami_risk_score
            }
        }

    @staticmethod
    def calculate_idiosyncratic_risk(
        property_age: Optional[int] = None,
        property_condition: Optional[str] = None,
        num_units: int = 1,
        concentration_risk: Optional[float] = None,
        occupancy_rate: Optional[float] = None
    ) -> Dict:
        """
        Calculate property-specific (idiosyncratic) risk

        Factors:
        1. Property age (older = more maintenance uncertainty)
        2. Property condition (poor = higher risk)
        3. Concentration risk (single-tenant = higher risk)
        4. Occupancy volatility
        5. Unit count (fewer units = higher risk)

        Args:
            property_age: Years since construction
            property_condition: 'Excellent', 'Good', 'Fair', 'Poor'
            num_units: Number of rental units
            concentration_risk: % of rent from single tenant (0-100)
            occupancy_rate: Current occupancy % (0-100)

        Returns:
            {
                'age_risk_score': 15.0,
                'condition_risk_score': 10.0,
                'concentration_risk_score': 25.0,
                'occupancy_risk_score': 5.0,
                'diversification_risk_score': 20.0,
                'idiosyncratic_risk_score': 75.0,  # 0-100
                'interpretation': 'Moderate property-specific risk'
            }
        """

        # Age Risk (0-20 points)
        age_risk_score = 0.0
        if property_age:
            if property_age < 10:
                age_risk_score = 2.0
            elif property_age < 30:
                age_risk_score = 5.0
            elif property_age < 50:
                age_risk_score = 10.0
            elif property_age < 75:
                age_risk_score = 15.0
            else:
                age_risk_score = 20.0
        else:
            age_risk_score = 10.0  # Default moderate risk

        # Condition Risk (0-25 points)
        condition_risk_score = 0.0
        if property_condition:
            condition_map = {
                'excellent': 0.0,
                'good': 5.0,
                'fair': 12.5,
                'poor': 25.0
            }
            condition_risk_score = condition_map.get(property_condition.lower(), 12.5)
        else:
            condition_risk_score = 12.5  # Default moderate

        # Concentration Risk (0-30 points)
        concentration_risk_score = 0.0
        if concentration_risk is not None:
            # High concentration = high risk
            concentration_risk_score = (concentration_risk / 100) * 30
        else:
            # Single-family = 100% concentration
            if num_units == 1:
                concentration_risk_score = 30.0
            elif num_units < 5:
                concentration_risk_score = 20.0
            elif num_units < 10:
                concentration_risk_score = 10.0
            else:
                concentration_risk_score = 5.0

        # Occupancy Risk (0-15 points)
        occupancy_risk_score = 0.0
        if occupancy_rate is not None:
            if occupancy_rate >= 95:
                occupancy_risk_score = 0.0
            elif occupancy_rate >= 90:
                occupancy_risk_score = 3.0
            elif occupancy_rate >= 85:
                occupancy_risk_score = 7.5
            elif occupancy_rate >= 75:
                occupancy_risk_score = 12.0
            else:
                occupancy_risk_score = 15.0
        else:
            occupancy_risk_score = 5.0  # Default low-moderate

        # Diversification Risk (0-10 points based on unit count)
        if num_units >= 50:
            diversification_risk_score = 0.0
        elif num_units >= 20:
            diversification_risk_score = 2.5
        elif num_units >= 10:
            diversification_risk_score = 5.0
        elif num_units >= 5:
            diversification_risk_score = 7.5
        else:
            diversification_risk_score = 10.0

        # Calculate composite idiosyncratic risk (0-100)
        idiosyncratic_risk_score = (
            age_risk_score +
            condition_risk_score +
            concentration_risk_score +
            occupancy_risk_score +
            diversification_risk_score
        )

        # Cap at 100
        idiosyncratic_risk_score = min(idiosyncratic_risk_score, 100.0)

        # Interpretation
        if idiosyncratic_risk_score < 25:
            interpretation = 'Low property-specific risk - well-maintained, diversified'
        elif idiosyncratic_risk_score < 50:
            interpretation = 'Moderate property-specific risk - typical for asset class'
        elif idiosyncratic_risk_score < 75:
            interpretation = 'High property-specific risk - concentrated or aging asset'
        else:
            interpretation = 'Very high property-specific risk - significant property concerns'

        return {
            'age_risk_score': age_risk_score,
            'condition_risk_score': condition_risk_score,
            'concentration_risk_score': concentration_risk_score,
            'occupancy_risk_score': occupancy_risk_score,
            'diversification_risk_score': diversification_risk_score,
            'idiosyncratic_risk_score': round(idiosyncratic_risk_score, 1),
            'interpretation': interpretation,
            'property_age': property_age,
            'property_condition': property_condition,
            'num_units': num_units,
            'occupancy_rate': occupancy_rate
        }

    @staticmethod
    def calculate_composite_risk(
        systematic_risk: Dict,
        regulatory_risk: Dict,
        idiosyncratic_risk: Dict,
        rent_decile: int,
        climate_risk: Optional[Dict] = None  # NEW: 4th dimension
    ) -> Dict:
        """
        Calculate overall composite risk score with optional climate risk (4th dimension)

        Key Finding: Low-rent properties have LOWER total risk
        - D1 total risk score: 25-35
        - D10 total risk score: 55-70

        Weighting (with climate risk):
        - Systematic: 30%
        - Regulatory: 25%
        - Idiosyncratic: 25%
        - Climate: 20%

        Weighting (without climate risk - backward compatible):
        - Systematic: 40%
        - Regulatory: 30%
        - Idiosyncratic: 30%

        Args:
            systematic_risk: Output from calculate_systematic_risk()
            regulatory_risk: Output from calculate_regulatory_risk()
            idiosyncratic_risk: Output from calculate_idiosyncratic_risk()
            rent_decile: Property's rent tier (for validation)
            climate_risk: Optional output from ClimateRiskService (NEW)

        Returns:
            {
                'composite_risk_score': 42.5,  # 0-100
                'composite_risk_level': 'Low',
                'systematic_weight': 30,
                'regulatory_weight': 25,
                'idiosyncratic_weight': 25,
                'climate_weight': 20,
                'has_climate_risk': True,
                'interpretation': 'Lower total risk than high-rent properties',
                'validation_vs_research': 'Aligned'
            }
        """

        # Extract component scores
        systematic_score = systematic_risk['systematic_risk_score']
        regulatory_score = regulatory_risk['regulatory_risk_score']
        idiosyncratic_score = idiosyncratic_risk['idiosyncratic_risk_score']

        # Check if climate risk is available and valid
        has_climate_risk = (
            climate_risk and
            'climate_risk_score' in climate_risk and
            climate_risk.get('climate_risk_level') != 'Unknown'
        )

        # Calculate weighted composite (0-100)
        if has_climate_risk:
            climate_score = climate_risk['climate_risk_score']

            # 4-dimension weighting
            composite_risk_score = (
                systematic_score * 0.30 +
                regulatory_score * 0.25 +
                idiosyncratic_score * 0.25 +
                climate_score * 0.20
            )

            weights = {
                'systematic_weight': 30,
                'regulatory_weight': 25,
                'idiosyncratic_weight': 25,
                'climate_weight': 20
            }
        else:
            # Fallback to 3-dimension weighting (backward compatible)
            composite_risk_score = (
                systematic_score * 0.40 +
                regulatory_score * 0.30 +
                idiosyncratic_score * 0.30
            )

            weights = {
                'systematic_weight': 40,
                'regulatory_weight': 30,
                'idiosyncratic_weight': 30,
                'climate_weight': 0
            }

        # Determine risk level
        if composite_risk_score < 35:
            composite_risk_level = 'Low'
        elif composite_risk_score < 55:
            composite_risk_level = 'Medium'
        elif composite_risk_score < 75:
            composite_risk_level = 'High'
        else:
            composite_risk_level = 'Very High'

        # Validate against research expectations
        # D1-D3 should have low risk (25-40)
        # D8-D10 should have high risk (55-75)
        expected_risk = None
        validation = 'Unknown'

        if rent_decile <= 3:
            expected_risk = 'Low'
            if composite_risk_score < 45:
                validation = 'Aligned with research (low-rent = lower risk)'
            else:
                validation = 'Higher than expected for low-rent tier'
        elif rent_decile >= 8:
            expected_risk = 'High'
            if composite_risk_score > 50:
                validation = 'Aligned with research (high-rent = higher risk)'
            else:
                validation = 'Lower than expected for high-rent tier'
        else:
            expected_risk = 'Medium'
            validation = 'Within expected range for mid-tier property'

        # Interpretation
        if rent_decile <= 3:
            interpretation = (
                f"Lower total risk than high-rent properties. "
                f"D{rent_decile} properties show reduced systematic risk despite regulatory concerns."
            )
        elif rent_decile >= 8:
            interpretation = (
                f"Higher total risk than low-rent properties. "
                f"D{rent_decile} properties have elevated systematic and market risk."
            )
        else:
            interpretation = (
                f"Moderate total risk typical for mid-tier properties. "
                f"D{rent_decile} falls between low and high-rent risk profiles."
            )

        return {
            'composite_risk_score': round(composite_risk_score, 1),
            'composite_risk_level': composite_risk_level,
            'expected_risk_level': expected_risk,
            **weights,  # Include dynamic weights (systematic, regulatory, idiosyncratic, climate)
            'has_climate_risk': has_climate_risk,
            'interpretation': interpretation,
            'validation_vs_research': validation,
            'components': {
                'systematic_score': systematic_score,
                'regulatory_score': regulatory_score,
                'idiosyncratic_score': idiosyncratic_score,
                'climate_score': climate_risk.get('climate_risk_score') if has_climate_risk else None
            }
        }

    @staticmethod
    def calculate_for_deal(
        deal_id: int,
        rent_decile: int,
        geography: str = 'US'
    ) -> Dict:
        """
        Calculate complete risk assessment for a deal

        Args:
            deal_id: Deal ID to assess
            rent_decile: Property's rent tier
            geography: Geographic market

        Returns:
            Complete risk analysis with all dimensions
        """

        # Fetch deal
        deal = DealModel.query.get(deal_id)
        if not deal:
            raise ValueError(f"Deal {deal_id} not found")

        # Extract property details
        property_age = None
        if deal.construction_year:
            from datetime import datetime
            property_age = datetime.now().year - deal.construction_year

        property_condition = deal.property_condition
        num_units = deal.number_of_units or 1

        # Get state from address
        state = None
        city = None
        if deal.street_address:
            # Simple extraction (can be enhanced with geocoding)
            # For now, require state in a separate field or use default
            state = 'CA'  # Default for testing
            city = None

        # Calculate systematic risk
        systematic = RiskAssessmentService.calculate_systematic_risk(
            rent_decile=rent_decile,
            geography=geography
        )

        # Calculate regulatory risk
        regulatory = RiskAssessmentService.calculate_regulatory_risk(
            state=state or 'CA',
            city=city,
            rent_level=None,  # Can be added
            ami_percentage=None
        )

        # Calculate idiosyncratic risk
        idiosyncratic = RiskAssessmentService.calculate_idiosyncratic_risk(
            property_age=property_age,
            property_condition=property_condition,
            num_units=num_units,
            concentration_risk=None,
            occupancy_rate=None
        )

        # Calculate composite risk
        composite = RiskAssessmentService.calculate_composite_risk(
            systematic_risk=systematic,
            regulatory_risk=regulatory,
            idiosyncratic_risk=idiosyncratic,
            rent_decile=rent_decile
        )

        return {
            'deal_id': deal_id,
            'rent_decile': rent_decile,
            'systematic_risk': systematic,
            'regulatory_risk': regulatory,
            'idiosyncratic_risk': idiosyncratic,
            'composite_risk': composite,
            'summary': {
                'composite_risk_score': composite['composite_risk_score'],
                'composite_risk_level': composite['composite_risk_level'],
                'key_risks': RiskAssessmentService._identify_key_risks(
                    systematic, regulatory, idiosyncratic
                ),
                'risk_mitigation_suggestions': RiskAssessmentService._suggest_mitigations(
                    systematic, regulatory, idiosyncratic, rent_decile
                )
            }
        }

    @staticmethod
    def _identify_key_risks(systematic: Dict, regulatory: Dict, idiosyncratic: Dict) -> list:
        """Identify top 3 risk factors"""
        risks = []

        # Check systematic
        if systematic['systematic_risk_score'] > 60:
            risks.append({
                'category': 'Systematic',
                'concern': f"High market correlation (β={systematic['beta_gdp']})",
                'severity': 'High'
            })

        # Check regulatory
        if regulatory['has_rent_control']:
            risks.append({
                'category': 'Regulatory',
                'concern': 'Rent control jurisdiction',
                'severity': 'High' if regulatory['rps_score'] > 3.0 else 'Moderate'
            })
        elif regulatory['regulatory_risk_score'] > 60:
            risks.append({
                'category': 'Regulatory',
                'concern': f"High regulatory environment (RPS={regulatory['rps_score']})",
                'severity': 'Moderate'
            })

        # Check idiosyncratic
        if idiosyncratic['concentration_risk_score'] > 20:
            risks.append({
                'category': 'Idiosyncratic',
                'concern': 'High tenant concentration',
                'severity': 'Moderate'
            })

        if idiosyncratic['condition_risk_score'] > 15:
            risks.append({
                'category': 'Idiosyncratic',
                'concern': f"Property condition: {idiosyncratic.get('property_condition', 'Unknown')}",
                'severity': 'Moderate'
            })

        # Return top 3
        return sorted(risks, key=lambda x: {'High': 3, 'Moderate': 2, 'Low': 1}.get(x['severity'], 0), reverse=True)[:3]

    @staticmethod
    def _suggest_mitigations(systematic: Dict, regulatory: Dict, idiosyncratic: Dict, rent_decile: int) -> list:
        """Suggest risk mitigation strategies"""
        suggestions = []

        # Systematic risk mitigations
        if systematic['systematic_risk_score'] > 50:
            suggestions.append("Consider longer-term fixed-rate debt to hedge interest rate risk")
            suggestions.append("Maintain higher cash reserves for economic downturns")

        # Regulatory risk mitigations
        if regulatory['has_rent_control']:
            suggestions.append("Budget for below-market rent increases (typically 3-5% caps)")
            suggestions.append("Focus on property improvements that qualify for rent increase exemptions")

        if regulatory['political_risk'] == 'High':
            suggestions.append("Monitor legislative changes and tenant protection proposals")

        # Idiosyncratic risk mitigations
        if idiosyncratic['concentration_risk_score'] > 20:
            suggestions.append("Prioritize tenant retention and lease renewals")
            suggestions.append("Build contingency reserves for turnover costs")

        if idiosyncratic['age_risk_score'] > 15:
            suggestions.append("Schedule preventive maintenance to avoid major CapEx surprises")
            suggestions.append("Consider property condition assessment (PCA) report")

        # Low-rent specific
        if rent_decile <= 3:
            suggestions.append("Leverage lower systematic risk for favorable financing terms")
            suggestions.append("Highlight lower volatility to institutional investors")

        return suggestions[:5]  # Top 5 suggestions
