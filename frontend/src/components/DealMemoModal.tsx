/**
 * Deal Memo Modal Component
 * Displays comprehensive investment analysis in full-screen modal
 * Includes export to PDF and print functionality
 */

import React, { useState, useEffect } from 'react';
import { X, Download, Printer } from 'lucide-react';
import type { DealMemo } from '../types/riskAssessment';
import { getDealMemo, convertToCamelCase } from '../services/riskAssessmentApi';

interface DealMemoModalProps {
  dealId: number;
  isOpen: boolean;
  onClose: () => void;
  holdingPeriod?: number;
  geography?: string;
}

const DealMemoModal: React.FC<DealMemoModalProps> = ({
  dealId,
  isOpen,
  onClose,
  holdingPeriod = 10,
  geography = 'US',
}) => {
  const [memo, setMemo] = useState<DealMemo | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && dealId) {
      loadMemo();
    }
  }, [isOpen, dealId, holdingPeriod, geography]);

  const loadMemo = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getDealMemo(dealId, holdingPeriod, geography);
      setMemo(convertToCamelCase(data) as DealMemo);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load deal memo');
      console.error('Error loading deal memo:', err);
    } finally {
      setLoading(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = async () => {
    // Trigger print dialog which can save as PDF
    window.print();
  };

  if (!isOpen) return null;

  const formatCurrency = (value: number): string => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const getRatingColor = (rating: string): string => {
    const lowerRating = rating.toLowerCase();
    if (lowerRating.includes('strong buy')) return 'text-green-700 bg-green-100';
    if (lowerRating.includes('buy')) return 'text-gray-700 bg-gray-100';
    if (lowerRating.includes('hold')) return 'text-yellow-700 bg-yellow-100';
    if (lowerRating.includes('consider')) return 'text-orange-700 bg-orange-100';
    if (lowerRating.includes('pass')) return 'text-red-700 bg-red-100';
    return 'text-gray-700 bg-gray-100';
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose}></div>

      {/* Modal */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute inset-0 overflow-hidden">
          <div className="pointer-events-none fixed inset-y-0 right-0 flex max-w-full pl-10">
            <div className="pointer-events-auto w-screen max-w-5xl">
              <div className="flex h-full flex-col overflow-y-scroll bg-white shadow-xl">
                {/* Header */}
                <div className="bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-6 no-print">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <h2 className="text-2xl font-bold text-white">Investment Memo</h2>
                      {memo && (
                        <span className="ml-4 text-gray-100">Deal #{dealId}</span>
                      )}
                    </div>
                    <div className="flex items-center space-x-3">
                      <button
                        onClick={handlePrint}
                        className="flex items-center px-4 py-2 bg-white text-primary-800 rounded-lg hover:bg-primary-50 transition-colors"
                      >
                        <Printer size={18} className="mr-2" />
                        Print
                      </button>
                      <button
                        onClick={handleExportPDF}
                        className="flex items-center px-4 py-2 bg-primary-800 text-white rounded-lg hover:bg-primary-700 transition-colors"
                      >
                        <Download size={18} className="mr-2" />
                        Export PDF
                      </button>
                      <button
                        onClick={onClose}
                        className="text-white hover:text-gray-100 transition-colors"
                      >
                        <X size={28} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 px-8 py-6" id="memo-content">
                  {loading && (
                    <div className="flex items-center justify-center py-12">
                      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-800"></div>
                      <span className="ml-3 text-gray-600">Loading memo...</span>
                    </div>
                  )}

                  {error && (
                    <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                      <p className="text-red-800">{error}</p>
                    </div>
                  )}

                  {memo && (
                    <div className="space-y-8 print-content">
                      {/* Executive Summary */}
                      <section className="border-b pb-6">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">Executive Summary</h2>
                        <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-6">
                          <div className="grid grid-cols-2 gap-6">
                            <div>
                              <div className="text-sm text-gray-600 mb-1">Property</div>
                              <div className="text-lg font-semibold text-gray-900">
                                {memo.executiveSummary.property}
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                {memo.executiveSummary.address}
                              </div>
                              <div className="text-sm font-medium text-gray-700 mt-2">
                                {formatCurrency(memo.executiveSummary.purchasePrice)}
                              </div>
                            </div>
                            <div>
                              <div className="text-sm text-gray-600 mb-1">Overall Rating</div>
                              <div className={`inline-block px-4 py-2 rounded-lg text-lg font-bold ${getRatingColor(memo.executiveSummary.overallRating)}`}>
                                {memo.executiveSummary.overallRating}
                              </div>
                              <div className="text-sm text-gray-600 mt-1">
                                Score: {memo.executiveSummary.ratingScore}/100
                              </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-4 mt-6 pt-6 border-t border-gray-200">
                            <div>
                              <div className="text-xs text-gray-600 mb-1">Rent Tier</div>
                              <div className="text-xl font-bold text-gray-700">
                                {memo.executiveSummary.rentTier}
                              </div>
                              <div className="text-xs text-gray-600">{memo.executiveSummary.tierCategory}</div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-600 mb-1">Expected Return (Levered)</div>
                              <div className="text-xl font-bold text-green-700">
                                {memo.executiveSummary.calculatedReturnLevered.toFixed(2)}%
                              </div>
                              <div className="text-xs text-gray-600">
                                Unlevered: {memo.executiveSummary.calculatedReturnUnlevered.toFixed(2)}%
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-600 mb-1">Risk Level</div>
                              <div className="text-lg font-semibold text-gray-800">
                                {memo.executiveSummary.riskLevel}
                              </div>
                              <div className="text-xs text-gray-600">
                                Score: {memo.executiveSummary.riskScore}/100
                              </div>
                            </div>
                          </div>

                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <div className="text-xs text-gray-600 mb-1">Target Investor</div>
                            <div className="text-base font-medium text-gray-900">
                              {memo.executiveSummary.targetInvestor}
                            </div>
                          </div>
                        </div>
                      </section>

                      {/* Investment Recommendation */}
                      <section className="border-b pb-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Investment Recommendation</h2>
                        <div className="space-y-4">
                          <div className="flex items-center justify-between">
                            <span className="text-gray-700 font-medium">Rating:</span>
                            <span className={`px-4 py-2 rounded-lg font-bold ${getRatingColor(memo.investmentRecommendation.overallRating)}`}>
                              {memo.investmentRecommendation.overallRating}
                            </span>
                          </div>

                          {memo.investmentRecommendation.keyStrengths.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-green-700 mb-2">Key Strengths</h4>
                              <ul className="space-y-1">
                                {memo.investmentRecommendation.keyStrengths.map((strength, idx) => (
                                  <li key={idx} className="flex items-start">
                                    <span className="text-green-600 mr-2">✓</span>
                                    <span className="text-sm text-gray-700">{strength}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {memo.investmentRecommendation.keyConcerns.length > 0 && (
                            <div>
                              <h4 className="text-sm font-semibold text-red-700 mb-2">Key Concerns</h4>
                              <ul className="space-y-1">
                                {memo.investmentRecommendation.keyConcerns.map((concern, idx) => (
                                  <li key={idx} className="flex items-start">
                                    <span className="text-red-600 mr-2">⚠</span>
                                    <span className="text-sm text-gray-700">{concern}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          <div className="bg-gray-50 rounded-lg p-4">
                            <p className="text-sm text-gray-800 leading-relaxed">
                              {memo.investmentRecommendation.summary}
                            </p>
                          </div>
                        </div>
                      </section>

                      {/* Property Summary */}
                      <section className="border-b pb-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Property Details</h2>
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">Address:</span>
                              <span className="text-sm font-medium text-gray-900">{memo.propertySummary.address}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">Property Type:</span>
                              <span className="text-sm font-medium text-gray-900">{memo.propertySummary.propertyType}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">Units:</span>
                              <span className="text-sm font-medium text-gray-900">{memo.propertySummary.numberOfUnits}</span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">Year Built:</span>
                              <span className="text-sm font-medium text-gray-900">{memo.propertySummary.yearBuilt}</span>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">Bedrooms/Bathrooms:</span>
                              <span className="text-sm font-medium text-gray-900">
                                {memo.propertySummary.bedrooms}BR / {memo.propertySummary.bathrooms}BA
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">Square Footage:</span>
                              <span className="text-sm font-medium text-gray-900">
                                {memo.propertySummary.squareFootage.toLocaleString()} sqft
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">Purchase Price:</span>
                              <span className="text-sm font-medium text-gray-900">
                                {formatCurrency(memo.propertySummary.purchasePrice)}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-sm text-gray-600">Property Age:</span>
                              <span className="text-sm font-medium text-gray-900">{memo.propertySummary.propertyAge} years</span>
                            </div>
                          </div>
                        </div>
                      </section>

                      {/* Rent Analysis */}
                      <section className="border-b pb-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Rent Tier Classification</h2>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <div className="grid grid-cols-3 gap-4">
                            <div>
                              <div className="text-xs text-gray-600 mb-1">Tier</div>
                              <div className="text-2xl font-bold text-gray-700">
                                {memo.tierClassification.tierLabel}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-600 mb-1">Category</div>
                              <div className="text-sm font-semibold text-gray-900">
                                {memo.tierClassification.interpretation.category}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-gray-600 mb-1">Expected Return Range</div>
                              <div className="text-sm font-semibold text-gray-900">
                                {memo.tierClassification.interpretation.expectedReturnRange}
                              </div>
                            </div>
                          </div>
                          <div className="mt-4 pt-4 border-t border-gray-200">
                            <p className="text-sm text-gray-700">
                              {memo.tierClassification.interpretation.description}
                            </p>
                          </div>
                        </div>
                      </section>

                      {/* Returns Analysis */}
                      <section className="border-b pb-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Expected Returns</h2>
                        <div className="grid grid-cols-2 gap-6">
                          <div className="border rounded-lg p-4">
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Yield Analysis</h4>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Gross Yield:</span>
                                <span className="text-sm font-semibold text-gray-900">
                                  {memo.yieldAnalysis.grossYield.toFixed(2)}%
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Net Yield:</span>
                                <span className="text-sm font-semibold text-gray-700">
                                  {memo.yieldAnalysis.netYield.toFixed(2)}%
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="border rounded-lg p-4">
                            <h4 className="text-sm font-semibold text-gray-700 mb-3">Total Return ({holdingPeriod} years)</h4>
                            <div className="space-y-2">
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Unlevered:</span>
                                <span className="text-sm font-semibold text-gray-900">
                                  {memo.totalReturn.totalReturnUnlevered.toFixed(2)}%
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-sm text-gray-600">Levered:</span>
                                <span className="text-sm font-semibold text-green-700">
                                  {memo.totalReturn.totalReturnLevered.toFixed(2)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </section>

                      {/* Risk Assessment */}
                      <section className="border-b pb-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-4">Risk Assessment</h2>
                        <div className="bg-gray-50 rounded-lg p-4">
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-sm font-medium text-gray-700">Composite Risk:</span>
                            <div>
                              <span className="text-2xl font-bold text-gray-900">
                                {memo.riskAssessment.compositeRisk.compositeRiskScore.toFixed(1)}
                              </span>
                              <span className="text-sm text-gray-600">/100</span>
                              <span className="ml-3 text-sm font-semibold text-gray-700">
                                ({memo.riskAssessment.compositeRisk.compositeRiskLevel})
                              </span>
                            </div>
                          </div>
                          <p className="text-sm text-gray-700">
                            {memo.riskAssessment.compositeRisk.interpretation}
                          </p>
                        </div>
                      </section>

                      {/* Sensitivity Analysis */}
                      {memo.sensitivityAnalysis && (
                        <section className="border-b pb-6">
                          <h2 className="text-xl font-bold text-gray-900 mb-4">Sensitivity Analysis</h2>
                          <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Scenario</th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Net Yield</th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Unlevered Return</th>
                                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Levered Return</th>
                                </tr>
                              </thead>
                              <tbody className="bg-white divide-y divide-gray-200">
                                {Object.values(memo.sensitivityAnalysis.scenarios).map((scenario, idx) => (
                                  <tr key={idx} className={scenario.name.toLowerCase().includes('base') ? 'bg-gray-50' : ''}>
                                    <td className="px-4 py-2 text-sm font-medium text-gray-900">{scenario.name}</td>
                                    <td className="px-4 py-2 text-sm text-right text-gray-700">{scenario.netYield.toFixed(2)}%</td>
                                    <td className="px-4 py-2 text-sm text-right text-gray-700">{scenario.totalReturnUnlevered.toFixed(2)}%</td>
                                    <td className="px-4 py-2 text-sm text-right font-semibold text-gray-900">{scenario.totalReturnLevered.toFixed(2)}%</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                          <div className="mt-3 text-sm text-gray-600">
                            {memo.sensitivityAnalysis.interpretation}
                          </div>
                        </section>
                      )}

                      {/* Footer */}
                      <section className="text-center text-sm text-gray-500 pt-6 border-t">
                        <p>Generated with Aequitas Risk Assessment System</p>
                        <p className="mt-1">Based on academic research showing low-rent properties deliver 2-4% higher returns</p>
                        <p className="mt-1">{new Date().toLocaleDateString()}</p>
                      </section>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          .no-print {
            display: none !important;
          }
          .print-content {
            page-break-inside: avoid;
          }
          section {
            page-break-inside: avoid;
          }
        }
      `}</style>
    </div>
  );
};

export default DealMemoModal;
