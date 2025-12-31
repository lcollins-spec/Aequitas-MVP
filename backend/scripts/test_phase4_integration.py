"""
Test Phase 4: Backend Integration
Tests end-to-end risk assessment pipeline and API integration
"""

import sys
import os

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import create_app
from app.database import db, DealModel
from app.services.deal_service import DealService
from app.services.deal_memo_service import DealMemoService


def create_test_deal():
    """Create a test deal for integration testing"""
    test_deal = DealModel(
        deal_name="Test Property - Phase 4 Integration",
        location="San Francisco, CA",
        property_address="123 Test Street",
        bedrooms=2,
        bathrooms=1,
        square_footage=1200,
        year_built=1995,
        property_type='multifamily',
        purchase_price=2_000_000,
        monthly_rent=None,  # Will be predicted
        loan_interest_rate=6.5,
        down_payment_percent=25.0,
        status='potential'
    )

    db.session.add(test_deal)
    db.session.commit()

    return test_deal.id


def test_full_pipeline():
    """Test complete 10-step risk assessment pipeline"""
    print("\n" + "=" * 60)
    print("TEST 1: COMPLETE RISK ASSESSMENT PIPELINE")
    print("=" * 60)

    # Create test deal
    deal_id = create_test_deal()
    print(f"\n✓ Created test deal ID: {deal_id}")

    # Run complete risk assessment
    print(f"\nRunning 10-step risk assessment pipeline...")
    assessment = DealService.calculate_risk_assessment(
        deal_id=deal_id,
        holding_period=10,
        geography='US',
        save_to_db=True
    )

    print(f"✓ Assessment completed successfully")

    # Validate all sections are present
    required_sections = [
        'deal_id', 'calculated_at', 'predicted_fundamental_rent',
        'rent_tier_label', 'gross_yield', 'net_yield',
        'total_return_unlevered', 'total_return_levered',
        'composite_risk_score', 'arbitrage_opportunity_score',
        'components', 'assessment_id'
    ]

    missing_sections = [s for s in required_sections if s not in assessment]
    if missing_sections:
        raise ValueError(f"Missing sections in assessment: {missing_sections}")

    print(f"✓ All required sections present")

    # Display key results
    print(f"\nKey Results:")
    print(f"  Predicted Rent: ${assessment['predicted_fundamental_rent']:.2f}/month")
    print(f"  Rent Tier: {assessment['rent_tier_label']} (D{assessment['rent_decile_national']})")
    print(f"  Gross Yield: {assessment['gross_yield']}%")
    print(f"  Net Yield: {assessment['net_yield']}%")
    print(f"  Capital Gain (Annual): {assessment['capital_gain_yield_annual']}%")
    print(f"  Total Return (Unlevered): {assessment['total_return_unlevered']}%")
    print(f"  Total Return (Levered): {assessment['total_return_levered']}%")
    print(f"  Composite Risk Score: {assessment['composite_risk_score']}/100 ({assessment['composite_risk_level']})")
    print(f"  Arbitrage Opportunity: {assessment['arbitrage_opportunity_score']}/100 ({assessment['arbitrage_opportunity_level']})")
    print(f"  Recommended Investor: {assessment['recommended_investor_type']}")

    # Verify database save
    print(f"\n✓ Assessment ID: {assessment['assessment_id']}")

    # Retrieve from database
    retrieved = DealService.get_risk_assessment(deal_id)
    if not retrieved:
        raise ValueError("Failed to retrieve assessment from database")

    print(f"✓ Successfully retrieved from database")

    # Cleanup
    db.session.delete(DealModel.query.get(deal_id))
    db.session.commit()
    print(f"✓ Test deal cleaned up")

    return True


def test_deal_memo_generation():
    """Test comprehensive deal memo generation"""
    print("\n" + "=" * 60)
    print("TEST 2: DEAL MEMO GENERATION")
    print("=" * 60)

    # Create test deal
    deal_id = create_test_deal()
    print(f"\n✓ Created test deal ID: {deal_id}")

    # Generate comprehensive memo
    print(f"\nGenerating comprehensive investment memo...")
    memo = DealMemoService.generate_memo(
        deal_id=deal_id,
        holding_period=10,
        geography='US'
    )

    print(f"✓ Memo generated successfully")

    # Validate all memo sections
    required_sections = [
        'property_summary', 'rent_prediction', 'tier_classification',
        'yield_analysis', 'appreciation_projection', 'total_return',
        'risk_assessment', 'arbitrage_opportunity',
        'investment_recommendation', 'sensitivity_analysis',
        'executive_summary'
    ]

    missing_sections = [s for s in required_sections if s not in memo]
    if missing_sections:
        raise ValueError(f"Missing sections in memo: {missing_sections}")

    print(f"✓ All memo sections present")

    # Display executive summary
    exec_summary = memo['executive_summary']
    print(f"\nExecutive Summary:")
    print(f"  Property: {exec_summary['property']}")
    print(f"  Rent Tier: {exec_summary['rent_tier']} - {exec_summary['tier_category']}")
    print(f"  Unlevered Return: {exec_summary['calculated_return_unlevered']}%")
    print(f"  Levered Return: {exec_summary['calculated_return_levered']}%")
    print(f"  Risk Level: {exec_summary['risk_level']} ({exec_summary['risk_score']}/100)")
    print(f"  Arbitrage Level: {exec_summary['arbitrage_opportunity_level']} ({exec_summary['arbitrage_score']}/100)")
    print(f"  Overall Rating: {exec_summary['overall_rating']} ({exec_summary['rating_score']}/100)")
    print(f"  Target Investor: {exec_summary['target_investor']}")

    # Display investment recommendation
    recommendation = memo['investment_recommendation']
    print(f"\nInvestment Recommendation:")
    print(f"  Rating: {recommendation['overall_rating']} (Score: {recommendation['rating_score']}/100)")
    print(f"  Strengths:")
    for strength in recommendation['key_strengths']:
        print(f"    • {strength}")
    if recommendation['key_concerns']:
        print(f"  Concerns:")
        for concern in recommendation['key_concerns']:
            print(f"    • {concern}")
    print(f"  Summary: {recommendation['summary']}")

    # Display sensitivity analysis
    sensitivity = memo['sensitivity_analysis']
    print(f"\nSensitivity Analysis:")
    for scenario_name, scenario_data in sensitivity['scenarios'].items():
        print(f"  {scenario_data['name']}: {scenario_data['total_return_levered']}% levered return")
    print(f"  {sensitivity['interpretation']}")

    # Cleanup
    db.session.delete(DealModel.query.get(deal_id))
    db.session.commit()
    print(f"\n✓ Test deal cleaned up")

    return True


def test_deal_comparison():
    """Test multi-deal comparison functionality"""
    print("\n" + "=" * 60)
    print("TEST 3: MULTI-DEAL COMPARISON")
    print("=" * 60)

    # Create 3 test deals with different characteristics
    deal_ids = []

    # Deal 1: Low-rent property
    deal1 = DealModel(
        deal_name="Low-Rent Property",
        location="Oakland, CA",
        bedrooms=2,
        bathrooms=1,
        square_footage=900,
        year_built=1990,
        property_type='multifamily',
        purchase_price=1_500_000,
        loan_interest_rate=6.5,
        down_payment_percent=25.0,
        status='potential'
    )
    db.session.add(deal1)
    db.session.commit()
    deal_ids.append(deal1.id)

    # Deal 2: Mid-range property
    deal2 = DealModel(
        deal_name="Mid-Range Property",
        location="San Jose, CA",
        bedrooms=2,
        bathrooms=2,
        square_footage=1200,
        year_built=2005,
        property_type='multifamily',
        purchase_price=3_000_000,
        loan_interest_rate=6.5,
        down_payment_percent=25.0,
        status='potential'
    )
    db.session.add(deal2)
    db.session.commit()
    deal_ids.append(deal2.id)

    # Deal 3: High-rent property
    deal3 = DealModel(
        deal_name="High-Rent Property",
        location="Palo Alto, CA",
        bedrooms=3,
        bathrooms=2,
        square_footage=1800,
        year_built=2018,
        property_type='multifamily',
        purchase_price=8_000_000,
        loan_interest_rate=6.5,
        down_payment_percent=25.0,
        status='potential'
    )
    db.session.add(deal3)
    db.session.commit()
    deal_ids.append(deal3.id)

    print(f"\n✓ Created 3 test deals: {deal_ids}")

    # Generate comparison
    print(f"\nGenerating side-by-side comparison...")
    comparison = DealMemoService.generate_comparison_memo(
        deal_ids=deal_ids,
        holding_period=10
    )

    print(f"✓ Comparison generated successfully")

    # Display rankings
    rankings = comparison['rankings']

    print(f"\nRankings by Total Return (Levered):")
    for i, (deal_id, memo) in enumerate(rankings['by_total_return'][:3], 1):
        print(f"  {i}. Deal {deal_id}: {memo['total_return']['total_return_levered']}%")

    print(f"\nRankings by Risk-Adjusted Return:")
    for i, (deal_id, memo) in enumerate(rankings['by_risk_adjusted_return'][:3], 1):
        return_val = memo['total_return']['total_return_unlevered']
        risk_val = memo['risk_assessment']['composite_risk']['composite_risk_score']
        print(f"  {i}. Deal {deal_id}: {return_val:.1f}% return / {risk_val:.1f} risk = {return_val/max(risk_val, 1):.3f}")

    print(f"\nRankings by Arbitrage Opportunity:")
    for i, (deal_id, memo) in enumerate(rankings['by_arbitrage_opportunity'][:3], 1):
        arb_score = memo['arbitrage_opportunity']['overall_opportunity']['arbitrage_opportunity_score']
        arb_level = memo['arbitrage_opportunity']['overall_opportunity']['opportunity_level']
        print(f"  {i}. Deal {deal_id}: {arb_score}/100 ({arb_level})")

    print(f"\nRankings by Overall Rating:")
    for i, (deal_id, memo) in enumerate(rankings['by_overall_rating'][:3], 1):
        rating = memo['investment_recommendation']['overall_rating']
        score = memo['investment_recommendation']['rating_score']
        print(f"  {i}. Deal {deal_id}: {rating} ({score}/100)")

    # Cleanup
    for deal_id in deal_ids:
        db.session.delete(DealModel.query.get(deal_id))
    db.session.commit()
    print(f"\n✓ Test deals cleaned up")

    return True


def test_get_deal_with_assessment():
    """Test combined deal + risk assessment retrieval"""
    print("\n" + "=" * 60)
    print("TEST 4: GET DEAL WITH ASSESSMENT")
    print("=" * 60)

    # Create and assess deal
    deal_id = create_test_deal()
    print(f"\n✓ Created test deal ID: {deal_id}")

    DealService.calculate_risk_assessment(deal_id=deal_id)
    print(f"✓ Risk assessment calculated")

    # Retrieve combined data
    result = DealService.get_deal_with_risk_assessment(deal_id)

    if not result:
        raise ValueError("Failed to retrieve combined data")

    if 'deal' not in result or 'risk_assessment' not in result:
        raise ValueError("Missing deal or risk_assessment in result")

    print(f"✓ Retrieved combined deal + assessment")
    print(f"  Deal has {len(result['deal'])} fields")
    print(f"  Assessment has {len(result['risk_assessment']) if result['risk_assessment'] else 0} fields")

    # Cleanup
    db.session.delete(DealModel.query.get(deal_id))
    db.session.commit()
    print(f"✓ Test deal cleaned up")

    return True


def main():
    """Run all Phase 4 integration tests"""
    print("=" * 60)
    print("PHASE 4: BACKEND INTEGRATION TESTS")
    print("=" * 60)

    app = create_app()

    with app.app_context():
        try:
            # Run tests
            test_full_pipeline()
            test_deal_memo_generation()
            test_deal_comparison()
            test_get_deal_with_assessment()

            print("\n" + "=" * 60)
            print("ALL PHASE 4 INTEGRATION TESTS PASSED ✓")
            print("=" * 60)
            print("\nKey Achievements:")
            print("  ✓ 10-step risk assessment pipeline working end-to-end")
            print("  ✓ Database persistence validated")
            print("  ✓ Deal memo generation complete")
            print("  ✓ Multi-deal comparison functional")
            print("  ✓ API service layer ready for REST endpoints")
            print("\nPhase 4 backend integration is complete!")
            print("Ready to proceed to Phase 5 (Frontend Components)")
            print()

        except Exception as e:
            print(f"\n❌ TEST FAILED: {str(e)}")
            import traceback
            traceback.print_exc()


if __name__ == '__main__':
    main()
