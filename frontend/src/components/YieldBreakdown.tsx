/**
 * Yield Breakdown Component
 * Displays waterfall chart showing gross yield → net yield after costs
 * Cost components vary by rent decile (D1 properties have higher management costs)
 */

import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';

interface CostComponents {
  maintenanceCostPct: number;
  propertyTaxPct: number;
  turnoverCostPct: number;
  defaultCostPct: number;
  managementCostPct: number;
  totalCostPct: number;
}

interface YieldBreakdownProps {
  grossYield: number;
  netYield: number;
  costComponents: CostComponents;
  vsBenchmark: 'Above' | 'Within' | 'Below';
}

const YieldBreakdown: React.FC<YieldBreakdownProps> = ({
  grossYield,
  netYield,
  costComponents,
  vsBenchmark,
}) => {
  // Create waterfall data
  const waterfallData = [
    {
      name: 'Gross Yield',
      value: grossYield,
      displayValue: grossYield.toFixed(2) + '%',
      fill: '#10b981', // Green
      type: 'positive',
    },
    {
      name: 'Maintenance',
      value: -costComponents.maintenanceCostPct,
      displayValue: '-' + costComponents.maintenanceCostPct.toFixed(2) + '%',
      fill: '#ef4444', // Red
      type: 'cost',
    },
    {
      name: 'Property Tax',
      value: -costComponents.propertyTaxPct,
      displayValue: '-' + costComponents.propertyTaxPct.toFixed(2) + '%',
      fill: '#ef4444',
      type: 'cost',
    },
    {
      name: 'Turnover',
      value: -costComponents.turnoverCostPct,
      displayValue: '-' + costComponents.turnoverCostPct.toFixed(2) + '%',
      fill: '#ef4444',
      type: 'cost',
    },
    {
      name: 'Default',
      value: -costComponents.defaultCostPct,
      displayValue: '-' + costComponents.defaultCostPct.toFixed(2) + '%',
      fill: '#ef4444',
      type: 'cost',
    },
    {
      name: 'Management',
      value: -costComponents.managementCostPct,
      displayValue: '-' + costComponents.managementCostPct.toFixed(2) + '%',
      fill: '#ef4444',
      type: 'cost',
    },
    {
      name: 'Net Yield',
      value: netYield,
      displayValue: netYield.toFixed(2) + '%',
      fill: netYield >= 0 ? '#3b82f6' : '#dc2626', // Blue if positive, red if negative
      type: 'result',
    },
  ];

  const getBenchmarkBadgeColor = (position: string): string => {
    switch (position) {
      case 'Above':
        return 'bg-green-100 text-green-800 border-green-300';
      case 'Within':
        return 'bg-gray-100 text-gray-800 border-gray-300';
      case 'Below':
        return 'bg-red-100 text-red-800 border-red-300';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Yield Breakdown</h3>
        <div className={`inline-block px-3 py-1 rounded-full text-xs font-medium border ${getBenchmarkBadgeColor(vsBenchmark)}`}>
          {vsBenchmark} Benchmark
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center">
          <div className="text-sm text-gray-600 mb-1">Gross Yield</div>
          <div className="text-xl font-bold text-green-600">{grossYield.toFixed(2)}%</div>
        </div>
        <div className="text-center">
          <div className="text-sm text-gray-600 mb-1">Total Costs</div>
          <div className="text-xl font-bold text-red-600">-{costComponents.totalCostPct.toFixed(2)}%</div>
        </div>
        <div className="text-center">
          <div className="text-sm text-gray-600 mb-1">Net Yield</div>
          <div className={`text-xl font-bold ${netYield >= 0 ? 'text-primary-800' : 'text-red-600'}`}>
            {netYield.toFixed(2)}%
          </div>
        </div>
      </div>

      {/* Waterfall Chart */}
      <div className="mb-4">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart
            data={waterfallData}
            margin={{ top: 20, right: 30, left: 20, bottom: 60 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 11, fill: '#6b7280' }}
              angle={-45}
              textAnchor="end"
              height={80}
            />
            <YAxis
              tick={{ fontSize: 12, fill: '#6b7280' }}
              label={{ value: 'Yield (%)', angle: -90, position: 'insideLeft', style: { fontSize: 12 } }}
            />
            <Tooltip
              contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '0.5rem' }}
              formatter={(value: any) => `${value.toFixed(2)}%`}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {waterfallData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.fill} />
              ))}
              <LabelList
                dataKey="displayValue"
                position="top"
                style={{ fontSize: 11, fill: '#374151', fontWeight: 500 }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Cost Breakdown Table */}
      <div className="border-t pt-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3">Cost Component Details</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Maintenance</span>
            <span className="font-medium text-gray-900">{costComponents.maintenanceCostPct.toFixed(2)}%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Property Tax</span>
            <span className="font-medium text-gray-900">{costComponents.propertyTaxPct.toFixed(2)}%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Turnover (Vacancy)</span>
            <span className="font-medium text-gray-900">{costComponents.turnoverCostPct.toFixed(2)}%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Default (Bad Debt)</span>
            <span className="font-medium text-gray-900">{costComponents.defaultCostPct.toFixed(2)}%</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-600">Management</span>
            <span className="font-medium text-gray-900">{costComponents.managementCostPct.toFixed(2)}%</span>
          </div>
          <div className="flex items-center justify-between text-sm font-semibold border-t pt-2 mt-2">
            <span className="text-gray-900">Total Costs</span>
            <span className="text-red-600">{costComponents.totalCostPct.toFixed(2)}%</span>
          </div>
        </div>
      </div>

      {/* Insight */}
      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg className="h-5 w-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
          </div>
          <div className="ml-3">
            <p className="text-xs text-amber-800">
              Low-rent properties (D1-D3) typically have higher management costs (6-7%) due to more intensive tenant management,
              but this is offset by superior appreciation and lower systematic risk, resulting in higher total returns.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default YieldBreakdown;
