import { useState, useRef } from 'react';
import { FileText, AlertCircle, CheckCircle, Loader2, ChevronDown, ChevronUp, Upload } from 'lucide-react';
import { scrapingApi } from '../services/scrapingApi';
import type { PropertyImport, ExtractedPropertyData } from '../types/scraping';

interface PropertyPdfUploadProps {
  onDataExtracted: (data: ExtractedPropertyData) => void;
  onError?: (error: string) => void;
}

const PropertyPdfUpload = ({ onDataExtracted, onError }: PropertyPdfUploadProps) => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isExtracting, setIsExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState<PropertyImport | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Validate file type
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setError('Please select a PDF file');
        setSelectedFile(null);
        return;
      }

      // Validate file size (max 10MB)
      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        setSelectedFile(null);
        return;
      }

      setSelectedFile(file);
      setError(null);
      setExtractedData(null);
    }
  };

  const handleExtract = async () => {
    if (!selectedFile) {
      setError('Please select a PDF file');
      return;
    }

    setError(null);
    setIsExtracting(true);
    setExtractedData(null);

    try {
      const result = await scrapingApi.extractFromPdf(selectedFile);
      setExtractedData(result);
      setShowPreview(true);

      // Show warning if requires user input
      if (result.requiresUserInput) {
        setError('Some fields could not be extracted automatically. Please review and fill in missing information.');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to extract property data from PDF';
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
      setSelectedFile(null);
      setExtractedData(null);
      setShowPreview(false);
      setError(null);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleRetry = () => {
    setError(null);
    setExtractedData(null);
    handleExtract();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const file = e.dataTransfer.files[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.pdf')) {
        setError('Please select a PDF file');
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setError('File size must be less than 10MB');
        return;
      }

      setSelectedFile(file);
      setError(null);
      setExtractedData(null);
    }
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
      {/* File Upload Section */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Property Listing PDF
        </label>
        <div
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors"
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf"
            onChange={handleFileSelect}
            className="hidden"
            id="pdf-upload"
            disabled={isExtracting}
          />

          {selectedFile ? (
            <div className="flex items-center justify-center gap-3">
              <FileText className="h-8 w-8 text-blue-600" />
              <div className="text-left">
                <p className="text-sm font-medium text-gray-900">{selectedFile.name}</p>
                <p className="text-xs text-gray-500">
                  {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedFile(null);
                  setExtractedData(null);
                  if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                  }
                }}
                className="ml-4 text-sm text-red-600 hover:text-red-800"
                disabled={isExtracting}
              >
                Remove
              </button>
            </div>
          ) : (
            <div>
              <Upload className="h-12 w-12 text-gray-400 mx-auto mb-3" />
              <p className="text-sm text-gray-600 mb-2">
                Drag and drop your PDF here, or{' '}
                <label
                  htmlFor="pdf-upload"
                  className="text-blue-600 hover:text-blue-700 cursor-pointer underline"
                >
                  browse
                </label>
              </p>
              <p className="text-xs text-gray-500">
                Supports property listing PDFs from LoopNet, Crexi, and other brokers
              </p>
              <p className="text-xs text-gray-500 mt-1">Maximum file size: 10MB</p>
            </div>
          )}
        </div>

        {selectedFile && (
          <div className="mt-3">
            <button
              onClick={handleExtract}
              disabled={isExtracting}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isExtracting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Extracting Data...
                </>
              ) : (
                <>
                  <FileText className="h-4 w-4" />
                  Extract Property Data
                </>
              )}
            </button>
          </div>
        )}
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
                  Property Data Extracted from PDF
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
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
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

              {/* Missing Fields */}
              {extractedData.missingFields && extractedData.missingFields.length > 0 && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <p className="text-sm font-medium text-blue-900 mb-1">
                    Missing Fields:
                  </p>
                  <p className="text-sm text-blue-700">
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

export default PropertyPdfUpload;
