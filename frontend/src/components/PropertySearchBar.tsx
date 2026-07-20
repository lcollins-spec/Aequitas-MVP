import { useState } from 'react';
import { Search, Filter, X } from 'lucide-react';
import type { SearchParams, PropertyFilters } from '../types/map';
import { isValidZipcode, isValidAddress } from '../utils/mapHelpers';

interface PropertySearchBarProps {
  searchParams: SearchParams;
  filters: PropertyFilters;
  onSearch: (params: SearchParams) => void;
  onFilterChange: (filters: PropertyFilters) => void;
  onClearFilters: () => void;
  isLoading: boolean;
}

const PropertySearchBar = ({
  searchParams,
  filters,
  onSearch,
  onFilterChange,
  onClearFilters,
  isLoading
}: PropertySearchBarProps) => {
  const [localSearchValue, setLocalSearchValue] = useState(searchParams.searchValue);
  const [showFilters, setShowFilters] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleSearchTypeToggle = (type: 'zipcode' | 'address') => {
    setLocalSearchValue('');
    setValidationError(null);
    onSearch({
      searchType: type,
      searchValue: ''
    });
  };

  const handleSearchClick = () => {
    setValidationError(null);

    if (searchParams.searchType === 'zipcode') {
      if (!isValidZipcode(localSearchValue)) {
        setValidationError('Please enter a valid 5-digit zipcode');
        return;
      }
    } else {
      if (!isValidAddress(localSearchValue)) {
        setValidationError('Please enter a valid address');
        return;
      }
    }

    onSearch({
      ...searchParams,
      searchValue: localSearchValue
    });
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearchClick();
    }
  };

  const handleFilterChange = (key: keyof PropertyFilters, value: any) => {
    onFilterChange({
      ...filters,
      [key]: value
    });
  };

  const hasActiveFilters =
    filters.priceMin !== undefined ||
    filters.priceMax !== undefined ||
    filters.bedrooms !== undefined ||
    filters.bathrooms !== undefined ||
    (filters.propertyType && filters.propertyType !== 'All');

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
        {/* Search Type Toggle */}
        <div className="flex bg-white rounded-lg shadow-sm">
          <button
            onClick={() => handleSearchTypeToggle('zipcode')}
            disabled={isLoading}
            className={`px-4 py-2 text-sm font-medium transition-colors rounded-l-lg ${
              searchParams.searchType === 'zipcode'
                ? 'bg-primary-800 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Zipcode
          </button>
          <button
            onClick={() => handleSearchTypeToggle('address')}
            disabled={isLoading}
            className={`px-4 py-2 text-sm font-medium transition-colors rounded-r-lg ${
              searchParams.searchType === 'address'
                ? 'bg-primary-800 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            Address
          </button>
        </div>

        {/* Search Input */}
        <div className="flex flex-1 gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={localSearchValue}
              onChange={(e) => setLocalSearchValue(e.target.value)}
              onKeyPress={handleKeyPress}
              disabled={isLoading}
              placeholder={
                searchParams.searchType === 'zipcode'
                  ? 'Enter 5-digit zipcode (e.g., 95814)'
                  : 'Enter full address (e.g., 123 Main St, City, State)'
              }
              className={`w-full px-4 py-2 text-sm text-gray-700 bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 ${
                validationError ? 'border-red-500' : 'border-gray-300'
              } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            {validationError && (
              <p className="mt-1 text-xs text-red-500">{validationError}</p>
            )}
          </div>

          <button
            onClick={handleSearchClick}
            disabled={isLoading || !localSearchValue.trim()}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white transition-colors bg-primary-800 rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <Search size={16} />
            )}
            Search
          </button>

          <button
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors rounded-lg ${
              hasActiveFilters
                ? 'bg-primary-800 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-100'
            }`}
          >
            <Filter size={16} />
            Filters
            {hasActiveFilters && (
              <span className="flex items-center justify-center w-5 h-5 text-xs bg-white rounded-full text-primary-800">
                !
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Filters Panel */}
      {showFilters && (
        <div className="p-4 bg-white shadow-sm rounded-lg">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-800">Filter Properties</h3>
            <button
              onClick={() => setShowFilters(false)}
              className="text-gray-500 hover:text-gray-700"
            >
              <X size={18} />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
            {/* Price Range */}
            <div>
              <label className="block mb-1 text-xs font-medium text-gray-700">
                Min Price
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  value={filters.priceMin || ''}
                  onChange={(e) =>
                    handleFilterChange('priceMin', e.target.value ? parseInt(e.target.value) : undefined)
                  }
                  placeholder="Any"
                  className="w-full pl-7 pr-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            <div>
              <label className="block mb-1 text-xs font-medium text-gray-700">
                Max Price
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500 text-sm">$</span>
                <input
                  type="number"
                  value={filters.priceMax || ''}
                  onChange={(e) =>
                    handleFilterChange('priceMax', e.target.value ? parseInt(e.target.value) : undefined)
                  }
                  placeholder="Any"
                  className="w-full pl-7 pr-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {/* Bedrooms */}
            <div>
              <label className="block mb-1 text-xs font-medium text-gray-700">
                Bedrooms
              </label>
              <select
                value={filters.bedrooms || ''}
                onChange={(e) =>
                  handleFilterChange('bedrooms', e.target.value ? parseInt(e.target.value) : undefined)
                }
                className="w-full px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Any</option>
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3</option>
                <option value="4">4+</option>
              </select>
            </div>

            {/* Bathrooms */}
            <div>
              <label className="block mb-1 text-xs font-medium text-gray-700">
                Bathrooms
              </label>
              <select
                value={filters.bathrooms || ''}
                onChange={(e) =>
                  handleFilterChange('bathrooms', e.target.value ? parseFloat(e.target.value) : undefined)
                }
                className="w-full px-3 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value="">Any</option>
                <option value="1">1</option>
                <option value="1.5">1.5</option>
                <option value="2">2</option>
                <option value="2.5">2.5</option>
                <option value="3">3+</option>
              </select>
            </div>
          </div>

          {/* Property Type */}
          <div className="mt-4">
            <label className="block mb-2 text-xs font-medium text-gray-700">
              Property Type
            </label>
            <div className="flex flex-wrap gap-2">
              {(['All', 'Rental', 'Sale'] as const).map((type) => (
                <button
                  key={type}
                  onClick={() => handleFilterChange('propertyType', type)}
                  className={`px-4 py-2 text-sm font-medium transition-colors rounded-lg ${
                    filters.propertyType === type
                      ? 'bg-primary-800 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {type}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2 mt-4">
            <button
              onClick={onClearFilters}
              className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 transition-colors bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              Clear Filters
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default PropertySearchBar;
