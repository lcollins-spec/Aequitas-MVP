/**
 * Climate Risk Panel Component
 * Displays comprehensive climate hazard assessment (Phase 1: Flood, Wildfire, Hurricane)
 */

import React from 'react';

interface ClimateRiskPanelProps {
  climateRiskScore?: number;
  climateRiskLevel?: string;
  topHazards?: Array<{
    hazard: string;
    score: number;
    label: string;
  }>;
  individualScores: {
    flood?: number;
    wildfire?: number;
    hurricane?: number;
    earthquake?: number;
    tornado?: number;
    extremeHeat?: number;
    seaLevelRise?: number;
    drought?: number;
  };
}

const ClimateRiskPanel: React.FC<ClimateRiskPanelProps> = ({
  climateRiskScore,
  climateRiskLevel,
  topHazards = [],
  individualScores
}) => {
  // Helper function to get color based on score
  const getHazardColor = (score?: number) => {
    if (!score) return 'text-gray-400';
    if (score >= 75) return 'text-red-600';
    if (score >= 50) return 'text-orange-600';
    if (score >= 25) return 'text-yellow-600';
    return 'text-green-600';
  };

  const getBgColor = (score?: number) => {
    if (!score) return 'bg-gray-50';
    if (score >= 75) return 'bg-red-50';
    if (score >= 50) return 'bg-orange-50';
    if (score >= 25) return 'bg-yellow-50';
    return 'bg-green-50';
  };

  const getRiskLevelColor = (level?: string) => {
    switch (level) {
      case 'Very High':
        return 'bg-red-100 text-red-800';
      case 'High':
        return 'bg-orange-100 text-orange-800';
      case 'Medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'Low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Hazard configuration (Phase 2: All 8 hazards active)
  const hazardConfig = {
    flood: { icon: '🌊', label: 'Flood' },
    wildfire: { icon: '🔥', label: 'Wildfire' },
    hurricane: { icon: '🌀', label: 'Hurricane' },
    earthquake: { icon: '⚠️', label: 'Earthquake' },
    tornado: { icon: '🌪️', label: 'Tornado' },
    extremeHeat: { icon: '🌡️', label: 'Extreme Heat' },
    seaLevelRise: { icon: '🌊', label: 'Sea Level Rise' },
    drought: { icon: '🏜️', label: 'Drought' }
  };

  // If no climate risk data, show message
  if (climateRiskScore === undefined || climateRiskLevel === 'Unknown') {
    return (
      <div className="border rounded-lg p-6 bg-gray-50">
        <div className="flex items-center justify-between mb-4">
          <h4 className="text-lg font-medium text-gray-900">Climate Risk</h4>
          <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
            Not Available
          </span>
        </div>
        <p className="text-sm text-gray-600">
          Climate risk assessment requires a valid property address. Please ensure the property address is complete and try recalculating.
        </p>
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-6 bg-white">
      {/* Header with overall score */}
      <div className="flex items-center justify-between mb-6">
        <h4 className="text-lg font-medium text-gray-900">Climate Risk</h4>
        <div className="flex items-center space-x-4">
          <div className={`text-3xl font-bold ${getHazardColor(climateRiskScore)}`}>
            {climateRiskScore.toFixed(1)}
            <span className="text-base text-gray-500">/100</span>
          </div>
          <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${getRiskLevelColor(climateRiskLevel)}`}>
            {climateRiskLevel}
          </span>
        </div>
      </div>

      {/* Phase 2 Complete badge */}
      <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg">
        <p className="text-sm text-green-800">
          <strong>Comprehensive Assessment:</strong> All 8 climate hazards assessed (Flood, Wildfire, Hurricane, Earthquake, Tornado, Extreme Heat, Sea Level Rise, Drought).
        </p>
      </div>

      {/* Top 3 Hazards */}
      {topHazards.length > 0 && (
        <div className="mb-6">
          <h5 className="text-sm font-medium text-gray-700 mb-3">Top Climate Hazards</h5>
          <div className="space-y-2">
            {topHazards.map((hazard, idx) => {
              const config = hazardConfig[hazard.hazard as keyof typeof hazardConfig];
              return (
                <div
                  key={idx}
                  className={`flex items-center justify-between p-3 rounded-lg ${getBgColor(hazard.score)}`}
                >
                  <div className="flex items-center space-x-2">
                    <span className="text-2xl">{config?.icon || '📍'}</span>
                    <span className="text-sm font-medium text-gray-700">{hazard.label}</span>
                  </div>
                  <span className={`text-lg font-bold ${getHazardColor(hazard.score)}`}>
                    {hazard.score.toFixed(0)}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* All Hazards Grid */}
      <div>
        <h5 className="text-sm font-medium text-gray-700 mb-3">All Climate Hazards</h5>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {Object.entries(hazardConfig).map(([key, config]) => {
            const score = individualScores[key as keyof typeof individualScores];

            return (
              <div
                key={key}
                className={`border rounded-lg p-3 text-center transition-all ${
                  score !== undefined
                    ? `${getBgColor(score)} border-gray-300`
                    : 'bg-gray-50 border-gray-200'
                }`}
              >
                <div className="text-2xl mb-1">{config.icon}</div>
                <div className="text-xs text-gray-600 mb-1">{config.label}</div>
                {score !== undefined ? (
                  <div className={`text-base font-bold ${getHazardColor(score)}`}>
                    {score.toFixed(0)}
                  </div>
                ) : (
                  <div className="text-xs text-gray-400">N/A</div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Methodology note */}
      <div className="mt-6 pt-4 border-t border-gray-200">
        <p className="text-xs text-gray-500">
          <strong>Data Sources:</strong> FEMA NFHL (flood), USDA/NOAA (wildfire), NOAA (hurricane, tornado, extreme heat, drought), USGS (earthquake), NOAA SLR (sea level rise).
          All hazards use free government data and geographic models. Climate risk weighted at 20% in composite score.
        </p>
      </div>
    </div>
  );
};

export default ClimateRiskPanel;
