import { useState, useEffect } from 'react';
import { X, Link2, Edit3 } from 'lucide-react';
import type { DealStatus, DealFormData } from '../types/deal';
import { DEAL_STATUS_LABELS } from '../types/deal';
import PropertyUrlInput from './PropertyUrlInput';
import type { ExtractedPropertyData } from '../types/scraping';

interface DealFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (dealData: DealFormData) => Promise<void>;
  initialData?: Partial<DealFormData>;
  /**
   * Controls whether the "Import from URL" flow is shown.
   * Default: true (preserves existing behavior).
   */
  showUrlImport?: boolean;
}

const DealFormModal = ({ isOpen, onClose, onSubmit, initialData, showUrlImport = true }: DealFormModalProps) => {
  const [formData, setFormData] = useState<DealFormData>({
    dealName: '',
    location: '',
    status: 'potential',
    propertyAddress: '',
    latitude: undefined,
    longitude: undefined
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Show the URL import input (toggle).
  const [showUrlInput, setShowUrlInput] = useState(false);


  useEffect(() => {
    if (initialData) {
      setFormData(prev => ({
        ...prev,
        ...initialData
      }));
    }
  }, [initialData]);

  const handleDataExtracted = (data: ExtractedPropertyData) => {
    // Map extracted data to form fields
    const location = data.city && data.state ? `${data.city}, ${data.state}` : data.city || data.state || '';

    setFormData(prev => ({
      ...prev,
      dealName: data.propertyName || prev.dealName,
      location: location || prev.location,
      propertyAddress: data.address || prev.propertyAddress,
      latitude: data.latitude || prev.latitude,
      longitude: data.longitude || prev.longitude
    }));

    // Switch to manual form view so user can review and edit
    setShowUrlInput(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validation
    if (!formData.dealName.trim()) {
      setError('Deal name is required');
      return;
    }

    if (!formData.location.trim()) {
      setError('Location is required');
      return;
    }

    setLoading(true);

    try {
      await onSubmit(formData);
      onClose();

      // Reset form
      setFormData({
        dealName: '',
        location: '',
        status: 'potential',
        propertyAddress: '',
        latitude: undefined,
        longitude: undefined
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create deal');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (!loading) {
      setError(null);
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="relative w-full max-w-md p-6 bg-white rounded-lg shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-800">Create New Deal</h2>
          <button
            onClick={handleClose}
            disabled={loading}
            className="p-1 text-gray-400 transition-colors hover:text-gray-600 disabled:opacity-50"
            aria-label="Close modal"
          >
            <X size={20} />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="p-3 mb-4 text-sm text-red-800 bg-red-100 border border-red-200 rounded-lg">
            {error}
          </div>
        )}

        {/* Toggle Button - only show if URL import feature is enabled */}
        {showUrlImport && (
          <div className="mb-4">
            <button
              type="button"
              onClick={() => setShowUrlInput(!showUrlInput)}
              disabled={loading}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-700 transition-colors bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 disabled:opacity-50"
            >
              {showUrlInput ? (
                <>
                  <Edit3 size={16} />
                  Enter Manually
                </>
              ) : (
                <>
                  <Link2 size={16} />
                  Import from URL
                </>
              )}
            </button>
          </div>
        )}

        {/* Conditional: Show URL input OR manual form */}
        {showUrlImport && showUrlInput ? (
          <PropertyUrlInput
            onDataExtracted={handleDataExtracted}
            onError={setError}
          />
        ) : (
          /* Manual Form */
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Deal Name */}
            <div>
              <label htmlFor="dealName" className="block mb-1 text-sm font-medium text-gray-700">
                Deal Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="dealName"
                value={formData.dealName}
                onChange={(e) => setFormData({ ...formData, dealName: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Sacramento Rental Property"
                disabled={loading}
                required
              />
            </div>

            {/* Location */}
            <div>
              <label htmlFor="location" className="block mb-1 text-sm font-medium text-gray-700">
                Location <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                id="location"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="e.g., Sacramento, CA"
                disabled={loading}
                required
              />
            </div>

            {/* Property Address (optional, pre-filled) */}
            {formData.propertyAddress && (
              <div>
                <label htmlFor="propertyAddress" className="block mb-1 text-sm font-medium text-gray-700">
                  Property Address
                </label>
                <input
                  type="text"
                  id="propertyAddress"
                  value={formData.propertyAddress}
                  onChange={(e) => setFormData({ ...formData, propertyAddress: e.target.value })}
                  className="w-full px-3 py-2 text-gray-600 bg-gray-50 border border-gray-300 rounded-lg"
                  disabled={loading}
                  readOnly
                />
              </div>
            )}

            {/* Status */}
            <div>
              <label htmlFor="status" className="block mb-1 text-sm font-medium text-gray-700">
                Status
              </label>
              <select
                id="status"
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as DealStatus })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={loading}
              >
                <option value="potential">{DEAL_STATUS_LABELS.potential}</option>
                <option value="ongoing">{DEAL_STATUS_LABELS.ongoing}</option>
                <option value="completed">{DEAL_STATUS_LABELS.completed}</option>
                <option value="rejected">{DEAL_STATUS_LABELS.rejected}</option>
              </select>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 transition-colors bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 px-4 py-2 text-sm font-medium text-white transition-colors bg-blue-500 rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Creating...' : 'Create Deal'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default DealFormModal;
