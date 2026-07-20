/**
 * Rent Tier Classification Component
 * Displays property's position in rent decile distribution (D1-D10)
 * Shows that D1 (low-rent) properties deliver higher returns than D10 (high-rent)
 */

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, ReferenceLine } from 'recharts';

interface RentTierClassificationProps {
  rentDecileNational: number;
  rentDecileRegional: number;
  rentTierLabel: string;
  rentPercentile: number;
  predictedRent: number;
}

const RentTierClassification: React.FC<RentTierClassificationProps> = ({
  rentDecileNational,
  rentDecileRegional,
  rentTierLabel,
  rentPercentile,
  predictedRent,
}) => {
  // Create data for all 10 deciles
  const decileData = [
    { decile: 'D1', label: 'D1\nLow-Rent', expectedReturn: '4.5-11.2%', opacity: rentDecileNational === 1 ? 1 : 0.3 },
    { decile: 'D2', label: 'D2', expectedReturn: '4.2-10.5%', opacity: rentDecileNational === 2 ? 1 : 0.3 },
    { decile: 'D3', label: 'D3', expectedReturn: '4.0-9.8%', opacity: rentDecileNational === 3 ? 1 : 0.3 },
    { decile: 'D4', label: 'D4', expectedReturn: '3.8-9.2%', opacity: rentDecileNational === 4 ? 1 : 0.3 },
    { decile: 'D5', label: 'D5', expectedReturn: '3.5-8.6%', opacity: rentDecileNational === 5 ? 1 : 0.3 },
    { decile: 'D6', label: 'D6', expectedReturn: '3.3-8.1%', opacity: rentDecileNational === 6 ? 1 : 0.3 },
    { decile: 'D7', label: 'D7', expectedReturn: '3.0-7.5%', opacity: rentDecileNational === 7 ? 1 : 0.3 },
    { decile: 'D8', label: 'D8', expectedReturn: '2.8-7.0%', opacity: rentDecileNational === 8 ? 1 : 0.3 },
    { decile: 'D9', label: 'D9', expectedReturn: '2.7-6.5%', opacity: rentDecileNational === 9 ? 1 : 0.3 },
    { decile: 'D10', label: 'D10\nHigh-Rent', expectedReturn: '2.6-7.0%', opacity: rentDecileNational === 10 ? 1 : 0.3 },
  ];

  // Assign height based on typical returns (D1 highest, D10 lowest)
  const decileHeights = [100, 95, 90, 85, 80, 75, 70, 65, 60, 55];

  const chartData = decileData.map((d, idx) => ({
    ...d,
    value: decileHeights[idx],
    fill: getDecileColor(idx + 1, rentDecileNational),
  }));

  function getDecileColor(decile: number, currentDecile: number): string {
    if (decile === currentDecile) {
      // Highlight current decile
      if (decile <= 3) return '#10b981'; // Green for D1-D3 (high return)
      if (decile <= 7) return '#f59e0b'; // Yellow for D4-D7 (medium)
      return '#ef4444'; // Red for D8-D10 (lower return)
    }
    return '#d1d5db'; // Gray for non-current
  }

  const getTierCategory = (decile: number): { category: string; description: string; color: string } => {
    if (decile <= 3) {
      return {
        category: 'High Return Potential',
        description: 'Academic research shows D1-D3 properties deliver 2-4% higher annual returns than D8-D10',
        color: 'text-green-600',
      };
    } else if (decile <= 7) {
      return {
        category: 'Medium Return Potential',
        description: 'Mid-tier properties show moderate returns with balanced risk',
        color: 'text-yellow-600',
      };
    } else {
      return {
        category: 'Lower Return Potential',
        description: 'High-rent properties typically show lower total returns despite higher rents',
        color: 'text-red-600',
      };
    }
  };

  const tierInfo = getTierCategory(rentDecileNational);

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Rent Tier Classification</h3>

      {/* Tier Summary */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-4 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className={`text-3xl font-bold ${tierInfo.color}`}>{rentTierLabel}</span>
              <span className="text-gray-600">({rentPercentile.toFixed(1)}th percentile)</span>
            </div>
            <div className="mt-2">
              <div className={`text-lg font-semibold ${tierInfo.color}`}>{tierInfo.category}</div>
              <p className="text-sm text-gray-700 mt-1 max-w-2xl">{tierInfo.description}</p>
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-600">Predicted Rent</div>
            <div className="text-2xl font-bold text-gray-900">${predictedRent.toFixed(0)}/mo</div>
          </div>
        </div>
      </div>

      {/* Decile Distribution Chart */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">
          National Rent Decile Distribution (D1 = Lowest 10%, D10 = Highest 10%)
        </h4>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 40 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 12, fill: '#6b7280' }}
              angle={0}
              textAnchor="middle"
              height={60}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#6b7280' }}
              label={{ value: 'Expected Return', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
              domain={[0, 110]}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
              formatter={(_value: any, _name: any, props: any) => [props.payload.expectedReturn, 'Expected Return']}
              labelFormatter={(label) => `Decile: ${label}`}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.fill}
                  opacity={entry.opacity}
                  stroke={index + 1 === rentDecileNational ? '#1f2937' : 'none'}
                  strokeWidth={index + 1 === rentDecileNational ? 2 : 0}
                />
              ))}
            </Bar>
            {rentDecileNational && (
              <ReferenceLine
                x={chartData[rentDecileNational - 1].label}
                stroke="#1f2937"
                strokeWidth={2}
                strokeDasharray="3 3"
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Comparison: National vs Regional */}
      <div className="grid grid-cols-2 gap-4 mt-6">
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">National Decile</div>
          <div className="text-xl font-bold text-gray-900">{rentTierLabel}</div>
          <div className="text-xs text-gray-500 mt-1">
            Compared to all US properties
          </div>
        </div>
        <div className="border rounded-lg p-4">
          <div className="text-sm text-gray-600 mb-1">Regional Decile</div>
          <div className="text-xl font-bold text-gray-900">D{rentDecileRegional}</div>
          <div className="text-xs text-gray-500 mt-1">
            Compared to local market
          </div>
        </div>
      </div>

      {/* Key Insight */}
      <div className="mt-6 bg-gray-50 border border-gray-200 rounded-lg p-4">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h4 className="text-sm font-medium text-gray-900">Research Finding</h4>
            <p className="text-sm text-gray-800 mt-1">
              {rentDecileNational <= 3
                ? 'Properties in D1-D3 (low-rent affordable housing) historically deliver 2-4% higher annual returns than D8-D10 properties, with lower systematic risk.'
                : rentDecileNational <= 7
                ? 'Mid-tier properties offer balanced risk-return profiles, though they underperform low-rent (D1-D3) properties on a risk-adjusted basis.'
                : 'High-rent properties (D8-D10) typically show the lowest total returns (2.6-7.0% annually) despite higher absolute rents, due to higher costs and slower appreciation.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RentTierClassification;
