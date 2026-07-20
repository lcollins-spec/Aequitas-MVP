import { useState } from 'react';
import { Link, AlertCircle, CheckCircle, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { scrapingApi } from '../services/scrapingApi';
import type { PropertyImport, ExtractedPropertyData } from '../types/scraping';

interface PropertyUrlInputProps {
  onDataExtracted: (data: ExtractedPropertyData) => void;
  onError?: (error: string) => void;
}

const PropertyUrlInput = ({ onDataExtracted, onError }: PropertyUrlInputProps) => {
  const [url, setUrl] = useState('');
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<PropertyImport | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExtract = async () => {
    if (!url.trim()) {
      setError('Please enter a URL');
      return;
    }

    // Basic URL validation
    try {
      new URL(url);
    } catch {
      setError('Please enter a valid URL');
      return;
    }

    setError(null);
    setIsExtracting(true);
    setExtractedData(null);

    try {
      const result = await scrapingApi.extractPropertyData(url, true);
      setExtractedData(result);
      setShowPreview(true);

      // Show warning if requires user input
      if (result.requiresUserInput) {
        setError('Some fields could not be extracted automatically. Please review and fill in missing information.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to extract property data';
      setError(errorMessage);
      if (onError) {
        onError(errorMessage);
      }
    } finally {
      setIsExtracting(false);
    }
  };

  const handleUseData = () => {
    if (extractedData?.extractedData) {
      onDataExtracted(extractedData.extractedData);
      setUrl('');
      setExtractedData(null);
      setShowPreview(false);
      setError(null);
    }
  };

  const handleRetry = () => {
    setError(null);
    setExtractedData(null);
    handleExtract();
  };

  const formatCurrency = (value?: number) => {
    if (!value) return 'Not available';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(value);
  };

  const formatNumber = (value?: number) => {
    if (!value) return 'Not available';
    return new Intl.NumberFormat('en-US').format(value);
  };

  return (
    <div className="space-y-4">
      {/* URL Input Section */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Property Listing URL
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Link className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isExtracting) {
                  handleExtract();
                }
              }}
              placeholder="Paste LoopNet, Crexi, or property listing URL..."
              className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              disabled={isExtracting}
            />
          </div>
          <button
            onClick={handleExtract}
            disabled={isExtracting || !url.trim()}
            className="px-4 py-2 bg-primary-800 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isExtracting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Extracting...
              </>
            ) : (
              'Extract Property Data'
            )}
          </button>
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Supports LoopNet, Crexi, Showcase, and CityFeet listings
        </p>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-md">
          <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm text-red-800">{error}</p>
            {extractedData?.suggestedAction && (
              <p className="text-xs text-red-600 mt-1">{extractedData.suggestedAction}</p>
            )}
          </div>
          {extractedData?.status === 'failed' && (
            <button
              onClick={handleRetry}
              className="text-sm text-red-700 hover:text-red-900 underline"
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Warnings */}
      {extractedData?.warnings && extractedData.warnings.length > 0 && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-md">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="text-sm font-medium text-yellow-800 mb-1">Warnings:</p>
              <ul className="text-sm text-yellow-700 list-disc list-inside space-y-1">
                {extractedData.warnings.map((warning, idx) => (
                  <li key={idx}>{warning}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Preview Card */}
      {extractedData && extractedData.status !== 'failed' && (
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          {/* Header */}
          <div
            className="flex items-center justify-between p-4 bg-gray-50 border-b border-gray-200 cursor-pointer"
            onClick={() => setShowPreview(!showPreview)}
          >
            <div className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-600" />
              <div>
                <h3 className="text-sm font-medium text-gray-900">
                  Property Data Extracted
                </h3>
                <p className="text-xs text-gray-500">
                  Confidence: {Math.round((extractedData.confidenceScore || 0) * 100)}%
                  {extractedData.method && ` • ${extractedData.method.replace(/_/g, ' ')}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleUseData();
                }}
                className="px-3 py-1.5 bg-primary-800 text-white text-sm rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                Use This Data
              </button>
              {showPreview ? (
                <ChevronUp className="h-5 w-5 text-gray-400" />
              ) : (
                <ChevronDown className="h-5 w-5 text-gray-400" />
              )}
            </div>
          </div>

          {/* Preview Content */}
          {showPreview && (
            <div className="p-4 space-y-4">
              {/* Basic Information */}
              <div>
                <h4 className="text-sm font-medium text-gray-900 mb-2">Basic Information</h4>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-gray-500">Address:</span>
                    <p className="font-medium text-gray-900">
                      {extractedData.extractedData?.address || 'Not available'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">City, State:</span>
                    <p className="font-medium text-gray-900">
                      {extractedData.extractedData?.city && extractedData.extractedData?.state
                        ? `${extractedData.extractedData.city}, ${extractedData.extractedData.state}`
                        : 'Not available'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">ZIP Code:</span>
                    <p className="font-medium text-gray-900">
                      {extractedData.extractedData?.zipcode || 'Not available'}
                    </p>
                  </div>
                  <div>
                    <span className="text-gray-500">Property Type:</span>
                    <p className="font-medium text-gray-900">
                      {extractedData.extractedData?.propertyType || 'Not available'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Property Details */}
              {(extractedData.extractedData?.buildingSizeSf ||
                extractedData.extractedData?.yearBuilt ||
                extractedData.extractedData?.numUnits ||
                extractedData.extractedData?.bedrooms) && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Property Details</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {extractedData.extractedData.buildingSizeSf && (
                      <div>
                        <span className="text-gray-500">Building Size:</span>
                        <p className="font-medium text-gray-900">
                          {formatNumber(extractedData.extractedData.buildingSizeSf)} SF
                        </p>
                      </div>
                    )}
                    {extractedData.extractedData.yearBuilt && (
                      <div>
                        <span className="text-gray-500">Year Built:</span>
                        <p className="font-medium text-gray-900">
                          {extractedData.extractedData.yearBuilt}
                        </p>
                      </div>
                    )}
                    {extractedData.extractedData.numUnits && (
                      <div>
                        <span className="text-gray-500">Units:</span>
                        <p className="font-medium text-gray-900">
                          {extractedData.extractedData.numUnits}
                        </p>
                      </div>
                    )}
                    {extractedData.extractedData.bedrooms && (
                      <div>
                        <span className="text-gray-500">Bedrooms:</span>
                        <p className="font-medium text-gray-900">
                          {extractedData.extractedData.bedrooms}
                        </p>
                      </div>
                    )}
                    {extractedData.extractedData.bathrooms && (
                      <div>
                        <span className="text-gray-500">Bathrooms:</span>
                        <p className="font-medium text-gray-900">
                          {extractedData.extractedData.bathrooms}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Financial Data */}
              {(extractedData.extractedData?.askingPrice ||
                extractedData.extractedData?.capRate ||
                extractedData.extractedData?.noi) && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Financial Information</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {extractedData.extractedData.askingPrice && (
                      <div>
                        <span className="text-gray-500">Asking Price:</span>
                        <p className="font-medium text-gray-900">
                          {formatCurrency(extractedData.extractedData.askingPrice)}
                        </p>
                      </div>
                    )}
                    {extractedData.extractedData.capRate && (
                      <div>
                        <span className="text-gray-500">Cap Rate:</span>
                        <p className="font-medium text-gray-900">
                          {extractedData.extractedData.capRate}%
                        </p>
                      </div>
                    )}
                    {extractedData.extractedData.noi && (
                      <div>
                        <span className="text-gray-500">NOI:</span>
                        <p className="font-medium text-gray-900">
                          {formatCurrency(extractedData.extractedData.noi)}
                        </p>
                      </div>
                    )}
                    {extractedData.extractedData.pricePerSf && (
                      <div>
                        <span className="text-gray-500">Price/SF:</span>
                        <p className="font-medium text-gray-900">
                          {formatCurrency(extractedData.extractedData.pricePerSf)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Enrichment Data */}
              {extractedData.enrichmentData?.estimatedRent && (
                <div>
                  <h4 className="text-sm font-medium text-gray-900 mb-2">Market Data (Estimated)</h4>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div>
                      <span className="text-gray-500">Estimated Rent:</span>
                      <p className="font-medium text-gray-900">
                        {formatCurrency(extractedData.enrichmentData.estimatedRent)}
                      </p>
                    </div>
                    {extractedData.enrichmentData.marketAvgRent && (
                      <div>
                        <span className="text-gray-500">Market Avg Rent:</span>
                        <p className="font-medium text-gray-900">
                          {formatCurrency(extractedData.enrichmentData.marketAvgRent)}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Missing Fields */}
              {extractedData.missingFields && extractedData.missingFields.length > 0 && (
                <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
                  <p className="text-sm font-medium text-gray-900 mb-1">
                    Missing Fields:
                  </p>
                  <p className="text-sm text-gray-700">
                    {extractedData.missingFields.join(', ')}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default PropertyUrlInput;
