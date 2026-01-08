/**
 * Missing Fields Modal Component
 * Allows users to input missing required fields for risk assessment
 */

import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

interface MissingFieldsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (fields: MissingFieldsData) => Promise<void>;
  missingFields: string[];
  currentValues?: Partial<MissingFieldsData>;
}

export interface MissingFieldsData {
  bedrooms?: number;
  bathrooms?: number;
  squareFootage?: number;
}

const MissingFieldsModal: React.FC<MissingFieldsModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  missingFields,
  currentValues
}) => {
  const [bedrooms, setBedrooms] = useState<string>(currentValues?.bedrooms?.toString() || '');
  const [bathrooms, setBathrooms] = useState<string>(currentValues?.bathrooms?.toString() || '');
  const [squareFootage, setSquareFootage] = useState<string>(currentValues?.squareFootage?.toString() || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setBedrooms(currentValues?.bedrooms?.toString() || '');
      setBathrooms(currentValues?.bathrooms?.toString() || '');
      setSquareFootage(currentValues?.squareFootage?.toString() || '');
      setError(null);
    }
    // Only re-run when modal opens or specific currentValues fields change
  }, [isOpen, currentValues?.bedrooms, currentValues?.bathrooms, currentValues?.squareFootage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate that all missing fields are filled
    const data: MissingFieldsData = {};

    if (missingFields.includes('bedrooms')) {
      const bedroomsNum = parseFloat(bedrooms);
      if (!bedrooms || isNaN(bedroomsNum) || bedroomsNum <= 0) {
        setError('Please enter a valid number of bedrooms');
        return;
      }
      data.bedrooms = bedroomsNum;
    }

    if (missingFields.includes('bathrooms')) {
      const bathroomsNum = parseFloat(bathrooms);
      if (!bathrooms || isNaN(bathroomsNum) || bathroomsNum <= 0) {
        setError('Please enter a valid number of bathrooms');
        return;
      }
      data.bathrooms = bathroomsNum;
    }

    if (missingFields.includes('square_footage') || missingFields.includes('squareFootage')) {
      const sqftNum = parseFloat(squareFootage);
      if (!squareFootage || isNaN(sqftNum) || sqftNum <= 0) {
        setError('Please enter a valid square footage');
        return;
      }
      data.squareFootage = sqftNum;
    }

    try {
      setSubmitting(true);
      await onSubmit(data);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update fields');
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <h2 className="text-xl font-bold text-gray-900">Missing Property Details</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            disabled={submitting}
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <p className="text-sm text-yellow-800">
              The following fields are required to calculate the risk assessment. Please provide the missing information:
            </p>
            <ul className="mt-2 text-sm text-yellow-700 list-disc list-inside">
              {missingFields.map(field => (
                <li key={field}>
                  {field === 'square_footage' || field === 'squareFootage'
                    ? 'Square Footage'
                    : field.charAt(0).toUpperCase() + field.slice(1)}
                </li>
              ))}
            </ul>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Form Fields */}
          <div className="space-y-4">
            {(missingFields.includes('bedrooms')) && (
              <div>
                <label htmlFor="bedrooms" className="block text-sm font-medium text-gray-700 mb-1">
                  Bedrooms <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="bedrooms"
                  value={bedrooms}
                  onChange={(e) => setBedrooms(e.target.value)}
                  onKeyPress={(e) => {
                    // Prevent non-numeric characters
                    if (!/[0-9]/.test(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  min="0"
                  step="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., 3"
                  disabled={submitting}
                  required
                />
              </div>
            )}

            {(missingFields.includes('bathrooms')) && (
              <div>
                <label htmlFor="bathrooms" className="block text-sm font-medium text-gray-700 mb-1">
                  Bathrooms <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="bathrooms"
                  value={bathrooms}
                  onChange={(e) => setBathrooms(e.target.value)}
                  onKeyPress={(e) => {
                    // Allow numbers and decimal point
                    if (!/[0-9.]/.test(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  min="0"
                  step="0.5"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., 2.5"
                  disabled={submitting}
                  required
                />
              </div>
            )}

            {(missingFields.includes('square_footage') || missingFields.includes('squareFootage')) && (
              <div>
                <label htmlFor="squareFootage" className="block text-sm font-medium text-gray-700 mb-1">
                  Square Footage <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  id="squareFootage"
                  value={squareFootage}
                  onChange={(e) => setSquareFootage(e.target.value)}
                  onKeyPress={(e) => {
                    // Prevent non-numeric characters
                    if (!/[0-9]/.test(e.key)) {
                      e.preventDefault();
                    }
                  }}
                  min="0"
                  step="1"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., 1500"
                  disabled={submitting}
                  required
                />
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center"
            >
              {submitting ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Updating...
                </>
              ) : (
                'Update & Calculate'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MissingFieldsModal;
