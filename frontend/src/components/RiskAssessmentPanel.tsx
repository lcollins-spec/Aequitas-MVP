/**
 * Risk Assessment Panel - Main Component
 * Displays comprehensive risk assessment for a property deal
 * Based on academic research showing low-rent properties (D1) outperform high-rent (D10)
 */

import React, { useState, useEffect } from 'react';
import type { RiskAssessment } from '../types/riskAssessment';
import { calculateRiskAssessment, getRiskAssessment, convertToCamelCase } from '../services/riskAssessmentApi';
import { dealApi } from '../services/dealApi';
import RentTierClassification from './RentTierClassification';
import YieldBreakdown from './YieldBreakdown';
import CapitalAppreciationChart from './CapitalAppreciationChart';
import ArbitrageOpportunityCard from './ArbitrageOpportunityCard';
import DealMemoModal from './DealMemoModal';
import MissingFieldsModal, { type MissingFieldsData } from './MissingFieldsModal';

interface RiskAssessmentPanelProps {
  dealId: number;
  holdingPeriod?: number;
  geography?: string;
}

const RiskAssessmentPanel: React.FC<RiskAssessmentPanelProps> = ({
  dealId,
  holdingPeriod = 10,
  geography = 'US',
}) => {
  const [assessment, setAssessment] = useState<RiskAssessment | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [calculating, setCalculating] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showMemoModal, setShowMemoModal] = useState<boolean>(false);
  const [showMissingFieldsModal, setShowMissingFieldsModal] = useState<boolean>(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  // Load existing assessment on mount
  useEffect(() => {
    loadExistingAssessment();
  }, [dealId]);

  const loadExistingAssessment = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getRiskAssessment(dealId);
      if (data) {
        const camelCaseData = convertToCamelCase(data) as RiskAssessment;

        // Validate that all essential fields exist
        const requiredFields = [
          'compositeRiskScore', 'compositeRiskLevel', 'betaGdp', 'betaStocks',
          'systematicRiskScore', 'regulatoryRiskScore', 'idiosyncraticRiskScore',
          'rpsScore', 'netYield', 'totalReturnLevered', 'totalReturnUnlevered'
        ];

        const isComplete = requiredFields.every(field =>
          (camelCaseData as any)[field] !== undefined &&
          (camelCaseData as any)[field] !== null
        );

        if (isComplete) {
          setAssessment(camelCaseData);
        } else {
          console.warn('Incomplete risk assessment data, clearing assessment. Please recalculate.');
          setAssessment(null);
        }
      }
    } catch (err) {
      console.error('Error loading risk assessment:', err);
      // Don't set error here - just means no existing assessment
    } finally {
      setLoading(false);
    }
  };

  const handleCalculateAssessment = async () => {
    try {
      setCalculating(true);
      setError(null);
      const data = await calculateRiskAssessment(dealId, holdingPeriod, geography);
      setAssessment(convertToCamelCase(data) as RiskAssessment);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to calculate assessment';

      // Check if error is about missing required fields
      if (errorMessage.includes('Missing required fields for risk assessment')) {
        // Parse the missing fields from the error message
        // Expected format: "Missing required fields for risk assessment: ['bedrooms', 'bathrooms']"
        const match = errorMessage.match(/\[(.*?)\]/);
        if (match) {
          const fields = match[1]
            .split(',')
            .map(f => f.trim().replace(/['"]/g, ''));
          setMissingFields(fields);
          setShowMissingFieldsModal(true);
        } else {
          setError(errorMessage);
        }
      } else {
        setError(errorMessage);
      }

      console.error('Error calculating risk assessment:', err);
    } finally {
      setCalculating(false);
    }
  };

  const handleMissingFieldsSubmit = async (fieldsData: MissingFieldsData) => {
    try {
      // Update the deal with the missing fields
      await dealApi.updateDeal(dealId, fieldsData);

      // Close the modal
      setShowMissingFieldsModal(false);
      setMissingFields([]);

      // Retry the risk assessment calculation
      await handleCalculateAssessment();
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : 'Failed to update deal');
    }
  };

  const getRiskLevelColor = (level: string): string => {
    switch (level.toLowerCase()) {
      case 'low':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'medium':
        return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'high':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getTierColor = (decile: number): string => {
    if (decile <= 3) return 'text-green-600 font-bold'; // D1-D3: High return
    if (decile <= 7) return 'text-yellow-600 font-semibold'; // D4-D7: Medium
    return 'text-red-600 font-semibold'; // D8-D10: Lower return
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <span className="ml-3 text-gray-600">Loading assessment...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Risk Assessment</h2>
            <p className="text-sm text-gray-600 mt-1">
              Academic research-based analysis showing low-rent properties deliver 2-4% higher returns
            </p>
          </div>
          <div className="flex items-center space-x-3">
            {assessment && (
              <button
                onClick={() => setShowMemoModal(true)}
                className="px-6 py-3 bg-purple-600 text-white rounded-lg font-medium hover:bg-purple-700 transition-colors flex items-center"
              >
                <svg className="h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                View Deal Memo
              </button>
            )}
            <button
              onClick={handleCalculateAssessment}
              disabled={calculating}
              className={`px-6 py-3 rounded-lg font-medium transition-colors ${
                calculating
                  ? 'bg-gray-300 text-gray-600 cursor-not-allowed'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}
            >
              {calculating ? (
                <span className="flex items-center">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Calculating...
                </span>
              ) : assessment ? (
                'Recalculate Assessment'
              ) : (
                'Calculate Assessment'
              )}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800 text-sm">{error}</p>
          </div>
        )}
      </div>

      {/* Main Assessment Display */}
      {assessment && (
        <>
          {/* Key Metrics Overview */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Metrics</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {/* Rent Tier */}
              <div className="border rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Rent Tier</div>
                <div className={`text-2xl font-bold ${getTierColor(assessment.rentDecileNational)}`}>
                  {assessment.rentTierLabel}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  National Decile {assessment.rentDecileNational}
                </div>
              </div>

              {/* Net Yield */}
              <div className="border rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Net Yield</div>
                <div className="text-2xl font-bold text-gray-900">
                  {assessment.netYield.toFixed(2)}%
                </div>
                <div className={`text-xs mt-1 ${
                  assessment.vsBenchmarkYield === 'Above' ? 'text-green-600' :
                  assessment.vsBenchmarkYield === 'Below' ? 'text-red-600' :
                  'text-gray-600'
                }`}>
                  {assessment.vsBenchmarkYield} benchmark
                </div>
              </div>

              {/* Total Return (Levered) */}
              <div className="border rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Total Return (Levered)</div>
                <div className={`text-2xl font-bold ${
                  assessment.totalReturnLevered >= 0 ? 'text-green-600' : 'text-red-600'
                }`}>
                  {assessment.totalReturnLevered.toFixed(2)}%
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Unlevered: {assessment.totalReturnUnlevered.toFixed(2)}%
                </div>
              </div>

              {/* Composite Risk */}
              <div className="border rounded-lg p-4">
                <div className="text-sm text-gray-600 mb-1">Risk Level</div>
                <div className={`inline-block px-3 py-1 rounded-full text-sm font-medium border ${getRiskLevelColor(assessment.compositeRiskLevel || 'Unknown')}`}>
                  {assessment.compositeRiskLevel || 'Unknown'}
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  Score: {assessment.compositeRiskScore?.toFixed(1) ?? 'N/A'}/100
                </div>
              </div>
            </div>
          </div>

          {/* Rent Tier Classification Chart */}
          <RentTierClassification
            rentDecileNational={assessment.rentDecileNational}
            rentDecileRegional={assessment.rentDecileRegional}
            rentTierLabel={assessment.rentTierLabel}
            rentPercentile={assessment.rentPercentile}
            predictedRent={assessment.predictedFundamentalRent}
          />

          {/* Yield and Appreciation Charts */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <YieldBreakdown
              grossYield={assessment.grossYield}
              netYield={assessment.netYield}
              costComponents={{
                maintenanceCostPct: assessment.maintenanceCostPct,
                propertyTaxPct: assessment.propertyTaxPct,
                turnoverCostPct: assessment.turnoverCostPct,
                defaultCostPct: assessment.defaultCostPct,
                managementCostPct: assessment.managementCostPct,
                totalCostPct: assessment.totalCostPct,
              }}
              vsBenchmark={assessment.vsBenchmarkYield}
            />

            <CapitalAppreciationChart
              projectedValues={{
                yr1: assessment.projectedPriceYr1,
                yr5: assessment.projectedPriceYr5,
                yr10: assessment.projectedPriceYr10,
              }}
              annualizedRate={assessment.capitalGainYieldAnnual}
              rentDecile={assessment.rentDecileNational}
            />
          </div>

          {/* Arbitrage Opportunity */}
          <ArbitrageOpportunityCard
            arbitrageScore={assessment.arbitrageOpportunityScore}
            arbitrageLevel={assessment.arbitrageOpportunityLevel}
            recommendedInvestor={assessment.recommendedInvestorType}
            constraints={{
              renterConstraintScore: assessment.renterConstraintScore,
              institutionalConstraintScore: assessment.institutionalConstraintScore,
              mediumLandlordFitScore: assessment.mediumLandlordFitScore,
            }}
            rentDecile={assessment.rentDecileNational}
          />

          {/* Risk Breakdown Details */}
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Risk Analysis Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Systematic Risk */}
              <div className="border rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Systematic Risk</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Score:</span>
                    <span className="text-sm font-medium">{assessment.systematicRiskScore.toFixed(1)}/100</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Beta (GDP):</span>
                    <span className="text-sm font-medium">{assessment.betaGdp.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Beta (Stocks):</span>
                    <span className="text-sm font-medium">{assessment.betaStocks.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Cyclicality:</span>
                    <span className="text-sm font-medium">{assessment.cashFlowCyclicality}</span>
                  </div>
                </div>
              </div>

              {/* Regulatory Risk */}
              <div className="border rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Regulatory Risk</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Score:</span>
                    <span className="text-sm font-medium">{assessment.regulatoryRiskScore.toFixed(1)}/100</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Rent Control:</span>
                    <span className={`text-sm font-medium ${assessment.hasRentControl ? 'text-red-600' : 'text-green-600'}`}>
                      {assessment.hasRentControl ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">RPS Score:</span>
                    <span className="text-sm font-medium">{assessment.rpsScore.toFixed(1)}</span>
                  </div>
                </div>
              </div>

              {/* Idiosyncratic Risk */}
              <div className="border rounded-lg p-4">
                <h4 className="font-medium text-gray-900 mb-2">Idiosyncratic Risk</h4>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Score:</span>
                    <span className="text-sm font-medium">{assessment.idiosyncraticRiskScore.toFixed(1)}/100</span>
                  </div>
                  <div className="text-sm text-gray-600 mt-2">
                    Property-specific factors including age, condition, and concentration
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Calculation Metadata */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center justify-between text-sm text-gray-600">
              <span>
                Assessment calculated at: {new Date(assessment.calculatedAt).toLocaleString()}
              </span>
              <span>
                Holding Period: {assessment.holdingPeriod} years | Geography: {assessment.geography}
              </span>
            </div>
          </div>
        </>
      )}

      {/* Empty State */}
      {!assessment && !loading && !calculating && (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="max-w-md mx-auto">
            <div className="text-gray-400 mb-4">
              <svg className="mx-auto h-16 w-16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Risk Assessment Yet</h3>
            <p className="text-gray-600 mb-6">
              Click "Calculate Assessment" to run a comprehensive 10-step risk analysis based on academic research.
            </p>
            <button
              onClick={handleCalculateAssessment}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 transition-colors"
            >
              Calculate Risk Assessment
            </button>
          </div>
        </div>
      )}

      {/* Deal Memo Modal */}
      <DealMemoModal
        dealId={dealId}
        isOpen={showMemoModal}
        onClose={() => setShowMemoModal(false)}
        holdingPeriod={holdingPeriod}
        geography={geography}
      />

      {/* Missing Fields Modal */}
      <MissingFieldsModal
        isOpen={showMissingFieldsModal}
        onClose={() => {
          setShowMissingFieldsModal(false);
          setMissingFields([]);
        }}
        onSubmit={handleMissingFieldsSubmit}
        missingFields={missingFields}
      />
    </div>
  );
};

export default RiskAssessmentPanel;
