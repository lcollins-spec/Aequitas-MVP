/**
 * Capital Appreciation Chart Component
 * Projects property value over 10-year holding period
 * Shows that D1 properties appreciate faster (0.99-5.50%) than D10 (-0.10-1.95%)
 */

import React from 'react';
import { Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Area, ComposedChart } from 'recharts';

interface CapitalAppreciationChartProps {
  projectedValues: {
    yr1: number;
    yr5: number;
    yr10: number;
  };
  annualizedRate: number;
  rentDecile: number;
}

const CapitalAppreciationChart: React.FC<CapitalAppreciationChartProps> = ({
  projectedValues,
  annualizedRate,
  rentDecile,
}) => {
  // Generate year-by-year projections
  const initialValue = projectedValues.yr1 / (1 + annualizedRate / 100);
  const yearlyData = [];

  for (let year = 0; year <= 10; year++) {
    const value = initialValue * Math.pow(1 + annualizedRate / 100, year);
    yearlyData.push({
      year: year,
      value: value,
      // Add benchmark range based on decile
      benchmarkLow: initialValue * Math.pow(1 + getBenchmarkRange(rentDecile).low / 100, year),
      benchmarkHigh: initialValue * Math.pow(1 + getBenchmarkRange(rentDecile).high / 100, year),
    });
  }

  function getBenchmarkRange(decile: number): { low: number; high: number; label: string } {
    // Based on academic research benchmark data
    if (decile <= 3) {
      return { low: 0.99, high: 5.50, label: 'D1-D3: 0.99-5.50% annually' };
    } else if (decile <= 7) {
      return { low: 0.50, high: 3.50, label: 'D4-D7: 0.50-3.50% annually' };
    } else {
      return { low: -0.10, high: 1.95, label: 'D8-D10: -0.10-1.95% annually' };
    }
  }

  const benchmarkInfo = getBenchmarkRange(rentDecile);

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatPercent = (value: number): string => {
    return `${value.toFixed(2)}%`;
  };

  const getTrendColor = (rate: number): string => {
    if (rate >= 3.0) return 'text-green-600';
    if (rate >= 1.0) return 'text-yellow-600';
    if (rate >= 0) return 'text-gray-600';
    return 'text-red-600';
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Capital Appreciation Projection</h3>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center">
          <div className="text-sm text-gray-600 mb-1">Current Value</div>
          <div className="text-lg font-bold text-gray-900">{formatCurrency(initialValue)}</div>
        </div>
        <div className="text-center">
          <div className="text-sm text-gray-600 mb-1">10-Year Value</div>
          <div className="text-lg font-bold text-primary-800">{formatCurrency(projectedValues.yr10)}</div>
        </div>
        <div className="text-center">
          <div className="text-sm text-gray-600 mb-1">Annual Growth</div>
          <div className={`text-lg font-bold ${getTrendColor(annualizedRate)}`}>
            {formatPercent(annualizedRate)}
          </div>
        </div>
      </div>

      {/* Appreciation Chart */}
      <div className="mb-4">
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={yearlyData} margin={{ top: 10, right: 30, left: 20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="year"
              tick={{ fontSize: 12, fill: '#6b7280' }}
              label={{ value: 'Year', position: 'insideBottom', offset: -10, style: { fontSize: 12 } }}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#6b7280' }}
              label={{ value: 'Property Value ($)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
              tickFormatter={(value) => `$${(value / 1000000).toFixed(1)}M`}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
              labelFormatter={(year) => `Year ${year}`}
              formatter={(value: any, name: string) => {
                if (name === 'value') return [formatCurrency(value), 'Projected Value'];
                if (name === 'benchmarkLow') return [formatCurrency(value), 'Benchmark Low'];
                if (name === 'benchmarkHigh') return [formatCurrency(value), 'Benchmark High'];
                return [formatCurrency(value), name];
              }}
            />
            <Legend
              wrapperStyle={{ paddingTop: '10px' }}
              iconType="line"
            />
            {/* Benchmark Range (shaded area) */}
            <Area
              type="monotone"
              dataKey="benchmarkLow"
              fill="#93c5fd"
              stroke="none"
              fillOpacity={0.3}
              name="Benchmark Range"
            />
            <Area
              type="monotone"
              dataKey="benchmarkHigh"
              fill="#93c5fd"
              stroke="none"
              fillOpacity={0.3}
            />
            {/* Projected Value Line */}
            <Line
              type="monotone"
              dataKey="value"
              stroke="#3b82f6"
              strokeWidth={3}
              dot={{ fill: '#3b82f6', r: 4 }}
              name="Projected Value"
            />
            {/* Benchmark Bounds */}
            <Line
              type="monotone"
              dataKey="benchmarkLow"
              stroke="#60a5fa"
              strokeWidth={1}
              strokeDasharray="5 5"
              dot={false}
              name="Benchmark Low"
            />
            <Line
              type="monotone"
              dataKey="benchmarkHigh"
              stroke="#60a5fa"
              strokeWidth={1}
              strokeDasharray="5 5"
              dot={false}
              name="Benchmark High"
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      {/* Projection Details */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Projection Milestones</h4>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-600 mb-1">Year 1</div>
            <div className="text-sm font-semibold text-gray-900">{formatCurrency(projectedValues.yr1)}</div>
            <div className="text-xs text-gray-500 mt-1">
              +{formatPercent(((projectedValues.yr1 / initialValue) - 1) * 100)}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-600 mb-1">Year 5</div>
            <div className="text-sm font-semibold text-gray-900">{formatCurrency(projectedValues.yr5)}</div>
            <div className="text-xs text-gray-500 mt-1">
              +{formatPercent(((projectedValues.yr5 / initialValue) - 1) * 100)}
            </div>
          </div>
          <div className="bg-gray-50 rounded-lg p-3">
            <div className="text-xs text-gray-600 mb-1">Year 10</div>
            <div className="text-sm font-semibold text-gray-900">{formatCurrency(projectedValues.yr10)}</div>
            <div className="text-xs text-gray-500 mt-1">
              +{formatPercent(((projectedValues.yr10 / initialValue) - 1) * 100)}
            </div>
          </div>
        </div>
      </div>

      {/* Benchmark Comparison */}
      <div className="mt-4 bg-gray-50 border border-gray-200 rounded-lg p-3">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-gray-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <h4 className="text-xs font-medium text-gray-900">Benchmark Range</h4>
            <p className="text-xs text-gray-800 mt-1">
              {benchmarkInfo.label}.
              {rentDecile <= 3 && ' Low-rent properties show significantly higher appreciation due to affordability-driven demand and neighborhood improvement.'}
              {rentDecile > 7 && ' High-rent properties show minimal appreciation and may even depreciate during downturns.'}
            </p>
          </div>
        </div>
      </div>

      {/* Total Gain Summary */}
      <div className="mt-4 pt-4 border-t">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Total Capital Gain (10 years)</span>
          <div className="text-right">
            <div className={`text-lg font-bold ${getTrendColor(annualizedRate)}`}>
              {formatCurrency(projectedValues.yr10 - initialValue)}
            </div>
            <div className="text-xs text-gray-500">
              ({formatPercent(((projectedValues.yr10 / initialValue) - 1) * 100)} total return)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CapitalAppreciationChart;
