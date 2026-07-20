/**
 * Arbitrage Opportunity Card Component
 * Highlights market inefficiencies and investment opportunities
 * Shows which investor type is best suited for the property
 */

import React from 'react';

interface ArbitrageOpportunityCardProps {
  arbitrageScore: number; // 0-100
  arbitrageLevel: string;
  recommendedInvestor: string;
  constraints: {
    renterConstraintScore: number;
    institutionalConstraintScore: number;
    mediumLandlordFitScore: number;
  };
  rentDecile: number;
}

const ArbitrageOpportunityCard: React.FC<ArbitrageOpportunityCardProps> = ({
  arbitrageScore,
  arbitrageLevel,
  recommendedInvestor,
  constraints,
  rentDecile,
}) => {
  const getOpportunityColor = (level: string): string => {
    const lowerLevel = level.toLowerCase();
    if (lowerLevel.includes('very high') || lowerLevel.includes('excellent')) {
      return 'bg-green-100 text-green-800 border-green-300';
    } else if (lowerLevel.includes('high')) {
      return 'bg-gray-100 text-gray-800 border-primary-300';
    } else if (lowerLevel.includes('moderate') || lowerLevel.includes('medium')) {
      return 'bg-yellow-100 text-yellow-800 border-yellow-300';
    } else if (lowerLevel.includes('low')) {
      return 'bg-orange-100 text-orange-800 border-orange-300';
    } else {
      return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getScoreGradient = (score: number): string => {
    if (score >= 75) return 'from-green-500 to-green-600';
    if (score >= 50) return 'from-blue-500 to-blue-600';
    if (score >= 25) return 'from-yellow-500 to-yellow-600';
    return 'from-orange-500 to-orange-600';
  };

  const getConstraintLabel = (score: number): { label: string; color: string } => {
    if (score >= 75) return { label: 'Very High', color: 'text-green-600' };
    if (score >= 50) return { label: 'High', color: 'text-primary-800' };
    if (score >= 25) return { label: 'Moderate', color: 'text-yellow-600' };
    return { label: 'Low', color: 'text-red-600' };
  };

  const getArbitrageExplanation = (decile: number, score: number): string => {
    if (decile <= 3 && score >= 60) {
      return 'Strong arbitrage opportunity! Low-rent properties (D1-D3) are systematically undervalued by institutional investors who avoid them due to management complexity, despite delivering superior risk-adjusted returns. Medium landlords can capture this mispricing.';
    } else if (decile <= 3) {
      return 'Moderate opportunity in low-rent segment. While these properties offer higher returns, certain constraints may limit profit potential.';
    } else if (decile <= 7) {
      return 'Mid-tier properties face balanced market conditions with moderate arbitrage opportunities due to competition from various investor types.';
    } else {
      return 'Limited arbitrage opportunity. High-rent properties (D8-D10) are efficiently priced by active institutional participation, leaving minimal mispricing to exploit.';
    }
  };

  const getInvestorTypeIcon = (investor: string): React.ReactElement => {
    const lowerInvestor = investor.toLowerCase();
    if (lowerInvestor.includes('medium landlord') || lowerInvestor.includes('10-50')) {
      return (
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      );
    } else if (lowerInvestor.includes('institutional') || lowerInvestor.includes('reit')) {
      return (
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 14v3m4-3v3m4-3v3M3 21h18M3 10h18M3 7l9-4 9 4M4 10h16v11H4V10z" />
        </svg>
      );
    } else if (lowerInvestor.includes('small') || lowerInvestor.includes('individual')) {
      return (
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      );
    } else {
      return (
        <svg className="h-8 w-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
        </svg>
      );
    }
  };

  return (
    <div className="bg-white rounded-lg shadow-lg p-6 border-2 border-purple-200">
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <svg className="h-6 w-6 text-purple-600 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
          </svg>
          Arbitrage Opportunity
        </h3>
        <div className={`inline-block px-4 py-2 rounded-full text-sm font-semibold border-2 ${getOpportunityColor(arbitrageLevel)}`}>
          {arbitrageLevel}
        </div>
      </div>

      {/* Opportunity Score Gauge */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Opportunity Score</span>
          <span className="text-3xl font-bold text-gray-900">{arbitrageScore.toFixed(0)}<span className="text-lg text-gray-500">/100</span></span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${getScoreGradient(arbitrageScore)} transition-all duration-500 ease-out`}
            style={{ width: `${arbitrageScore}%` }}
          ></div>
        </div>
      </div>

      {/* Recommended Investor Type */}
      <div className="mb-6 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg p-4">
        <div className="flex items-start">
          <div className="flex-shrink-0 text-purple-600">
            {getInvestorTypeIcon(recommendedInvestor)}
          </div>
          <div className="ml-4 flex-1">
            <h4 className="text-sm font-semibold text-gray-900 mb-1">Recommended Investor Type</h4>
            <p className="text-lg font-bold text-purple-700">{recommendedInvestor}</p>
            <p className="text-xs text-gray-600 mt-2">
              {rentDecile <= 3
                ? 'Medium landlords (10-50 units) are ideally positioned to capture value in low-rent properties through superior local management while achieving scale economies.'
                : rentDecile <= 7
                ? 'Multiple investor types can succeed with mid-tier properties, though active management remains important.'
                : 'Institutional investors and REITs have competitive advantages in high-rent segments through scale and professional management.'}
            </p>
          </div>
        </div>
      </div>

      {/* Constraint Scores */}
      <div className="mb-6">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Market Constraints Creating Opportunity</h4>
        <div className="space-y-3">
          {/* Renter Constraints */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <div className="text-sm text-gray-700">Renter Ability to Buy</div>
              <div className="text-xs text-gray-500">Higher = Renters more constrained from buying</div>
            </div>
            <div className="text-right">
              <div className={`text-lg font-bold ${getConstraintLabel(constraints.renterConstraintScore).color}`}>
                {constraints.renterConstraintScore.toFixed(0)}
              </div>
              <div className="text-xs text-gray-600">{getConstraintLabel(constraints.renterConstraintScore).label}</div>
            </div>
          </div>

          {/* Institutional Constraints */}
          <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
            <div className="flex-1">
              <div className="text-sm text-gray-700">Institutional Avoidance</div>
              <div className="text-xs text-gray-500">Higher = Institutions more likely to avoid</div>
            </div>
            <div className="text-right">
              <div className={`text-lg font-bold ${getConstraintLabel(constraints.institutionalConstraintScore).color}`}>
                {constraints.institutionalConstraintScore.toFixed(0)}
              </div>
              <div className="text-xs text-gray-600">{getConstraintLabel(constraints.institutionalConstraintScore).label}</div>
            </div>
          </div>

          {/* Medium Landlord Fit */}
          <div className="flex items-center justify-between p-3 bg-purple-50 rounded-lg border border-purple-200">
            <div className="flex-1">
              <div className="text-sm font-semibold text-gray-900">Medium Landlord Fit</div>
              <div className="text-xs text-gray-600">Higher = Better suited for 10-50 unit operators</div>
            </div>
            <div className="text-right">
              <div className={`text-lg font-bold ${getConstraintLabel(constraints.mediumLandlordFitScore).color}`}>
                {constraints.mediumLandlordFitScore.toFixed(0)}
              </div>
              <div className="text-xs text-gray-600">{getConstraintLabel(constraints.mediumLandlordFitScore).label}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Arbitrage Explanation */}
      <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-purple-500" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h4 className="text-sm font-semibold text-purple-900 mb-1">Why This Opportunity Exists</h4>
            <p className="text-xs text-purple-800 leading-relaxed">
              {getArbitrageExplanation(rentDecile, arbitrageScore)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ArbitrageOpportunityCard;
