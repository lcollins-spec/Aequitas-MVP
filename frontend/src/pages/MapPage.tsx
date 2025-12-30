import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Home, DollarSign, MapPin, AlertCircle } from 'lucide-react';
import PropertyMap from '../components/PropertyMap';
import ErrorBoundary from '../components/ErrorBoundary';
import PropertySearchBar from '../components/PropertySearchBar';
import PropertyDetailsSidebar from '../components/PropertyDetailsSidebar';
import DealFormModal from '../components/DealFormModal';
import type { MapProperty, SearchParams, PropertyFilters } from '../types/map';
import type { DealFormData } from '../types/deal';
import { geocodingService } from '../services/geocodingService';
import { rentcastApi } from '../services/rentcastApi';
import { generatePropertyId, formatPrice, applyFilters } from '../utils/mapHelpers';
import { dealApi } from '../services/dealApi';

const MapPage = () => {
  const navigate = useNavigate();
  // Search and filter state
  const [searchParams, setSearchParams] = useState<SearchParams>({
    searchType: 'zipcode',
    searchValue: '95814' // Default Sacramento zipcode
  });
  const [filters, setFilters] = useState<PropertyFilters>({
    propertyType: 'All'
  });

  // Property and map state
  const [properties, setProperties] = useState<MapProperty[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<MapProperty | null>(null);
  const [mapCenter, setMapCenter] = useState<[number, number]>([38.5816, -121.4944]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Deal creation state
  const [isDealModalOpen, setIsDealModalOpen] = useState(false);
  const [selectedPropertyForDeal, setSelectedPropertyForDeal] = useState<MapProperty | null>(null);

  // Debounce timer ref
  const fetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Fetch properties from RentCast API based on search params and filters
   */
  const fetchProperties = useCallback(async () => {
    // Only fetch if we have a search value
    if (!searchParams.searchValue || searchParams.searchValue.trim().length === 0) {
      return;
    }

    setLoading(true);
    setError(null);
    setSelectedProperty(null);

    try {
      // Step 1: Geocode search location to get center point
      const centerPoint = searchParams.searchType === 'zipcode'
        ? await geocodingService.geocodeZipcode(searchParams.searchValue)
        : await geocodingService.geocodeAddress(searchParams.searchValue);

      if (!centerPoint) {
        setError('Location not found. Please try a different search.');
        setProperties([]);
        setLoading(false);
        return;
      }

      setMapCenter([centerPoint.lat, centerPoint.lng]);

      // Step 2: Fetch comparables from RentCast API
      const response = await rentcastApi.getComparables({
        zipcode: searchParams.searchType === 'zipcode' ? searchParams.searchValue : undefined,
        address: searchParams.searchType === 'address' ? searchParams.searchValue : undefined,
        bedrooms: filters.bedrooms,
        bathrooms: filters.bathrooms,
        compCount: 25,
        maxRadius: 5.0
      });

      if (!response.success || !response.data) {
        setError(response.error || 'Failed to fetch properties. Please try again.');
        setProperties([]);
        setLoading(false);
        return;
      }

      // Step 3: Batch geocode all comparable addresses (for those that have addresses)
      const addressesToGeocode = response.data
        .filter(comp => comp.address && comp.address.trim().length > 0)
        .map(comp => comp.address);
      const geocodedMap = await geocodingService.batchGeocode(addressesToGeocode);

      // Step 4: Transform to MapProperty format and apply filters
      const mapProperties = response.data
        .filter(comp => applyFilters(comp, filters))
        .map((comp) => {
          const geocoded = geocodedMap.get(comp.address);

          return {
            id: generatePropertyId(comp.address || `${comp.distanceMiles}-${comp.listedRent}`),
            address: comp.address || '', // Will be filled in by reverse geocoding
            // Use geocoded coords, or fallback to center with jitter based on distance
            lat: geocoded?.lat || centerPoint.lat + (Math.random() - 0.5) * 0.05,
            lng: geocoded?.lng || centerPoint.lng + (Math.random() - 0.5) * 0.05,
            price: comp.listedRent || 0,
            priceFormatted: formatPrice(comp.listedRent || 0),
            bedrooms: comp.bedrooms,
            bathrooms: comp.bathrooms,
            squareFootage: comp.squareFootage,
            propertyType: comp.propertyType,
            daysOnMarket: comp.daysOnMarket,
            distanceMiles: comp.distanceMiles,
            listingUrl: comp.listingUrl
          };
        });

      // Step 5: Reverse geocode properties that don't have addresses
      const propertiesWithoutAddresses = mapProperties.filter(prop => !prop.address || prop.address.trim().length === 0);

      if (propertiesWithoutAddresses.length > 0) {
        const coordinates = propertiesWithoutAddresses.map(prop => ({ lat: prop.lat, lng: prop.lng }));
        const reverseGeocodedMap = await geocodingService.batchReverseGeocode(coordinates);

        // Update properties with reverse geocoded addresses
        mapProperties.forEach(prop => {
          if (!prop.address || prop.address.trim().length === 0) {
            const key = `${prop.lat},${prop.lng}`;
            const reverseAddress = reverseGeocodedMap.get(key);
            if (reverseAddress) {
              prop.address = reverseAddress;
            }
          }
        });
      }

      setProperties(mapProperties);

      if (mapProperties.length === 0) {
        setError('No properties found matching your criteria. Try adjusting your filters.');
      }

    } catch (err) {
      console.error('Error fetching properties:', err);
      setError('An unexpected error occurred. Please try again.');
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, [searchParams, filters]);

  /**
   * Handle search submission
   */
  const handleSearch = (newSearchParams: SearchParams) => {
    setSearchParams(newSearchParams);
  };

  /**
   * Handle filter changes
   */
  const handleFilterChange = (newFilters: PropertyFilters) => {
    setFilters(newFilters);
  };

  /**
   * Handle clear filters
   */
  const handleClearFilters = () => {
    setFilters({
      propertyType: 'All'
    });
  };

  /**
   * Handle marker click
   */
  const handleMarkerClick = (property: MapProperty) => {
    setSelectedProperty(property);
  };

  /**
   * Handle close property details
   */
  const handleCloseDetails = () => {
    setSelectedProperty(null);
  };

  /**
   * Handle create deal from property
   */
  const handleCreateDeal = (property: MapProperty) => {
    setSelectedPropertyForDeal(property);
    setIsDealModalOpen(true);
  };

  /**
   * Handle deal form submission
   */
  const handleDealSubmit = async (dealData: DealFormData) => {
    try {
      // Create the deal with initial property data
      const createdDeal = await dealApi.createDeal({
        ...dealData,
        propertyAddress: selectedPropertyForDeal?.address,
        latitude: selectedPropertyForDeal?.lat,
        longitude: selectedPropertyForDeal?.lng,
        monthlyRent: selectedPropertyForDeal?.price,
        bedrooms: selectedPropertyForDeal?.bedrooms,
        bathrooms: selectedPropertyForDeal?.bathrooms,
        squareFootage: selectedPropertyForDeal?.squareFootage,
        propertyType: selectedPropertyForDeal?.propertyType
      });

      // Navigate to underwriting page with the created deal
      navigate(`/underwriting?dealId=${createdDeal.id}`);
    } catch (err) {
      console.error('Error creating deal:', err);
      throw err;
    }
  };

  /**
   * Handle close deal modal
   */
  const handleCloseDealModal = () => {
    setIsDealModalOpen(false);
    setSelectedPropertyForDeal(null);
  };

  // Initial load
  useEffect(() => {
    fetchProperties();
  }, []);

  // Debounced re-fetch when search params or filters change
  useEffect(() => {
    // Clear existing timer
    if (fetchTimerRef.current) {
      clearTimeout(fetchTimerRef.current);
    }

    // Set new timer
    fetchTimerRef.current = setTimeout(() => {
      fetchProperties();
    }, 500);

    // Cleanup
    return () => {
      if (fetchTimerRef.current) {
        clearTimeout(fetchTimerRef.current);
      }
    };
  }, [searchParams, filters]);

  // Calculate stats from properties
  const totalProperties = properties.length;
  const averagePrice = properties.length > 0
    ? properties.reduce((sum, p) => sum + p.price, 0) / properties.length
    : 0;

  return (
    <div className="min-h-screen p-4 md:p-6 lg:p-8 bg-gray-50">
      <div className="flex flex-col items-start justify-between gap-4 mb-6 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-gray-800 md:text-3xl">Property Search Map</h1>
          <p className="mt-1 text-sm text-gray-500">
            Search for rental properties by zipcode or address
          </p>
        </div>
      </div>

      {/* Search Bar */}
      <div className="mb-6">
        <PropertySearchBar
          searchParams={searchParams}
          filters={filters}
          onSearch={handleSearch}
          onFilterChange={handleFilterChange}
          onClearFilters={handleClearFilters}
          isLoading={loading}
        />
      </div>

      {/* Error Banner */}
      {error && (
        <div className="flex items-center gap-3 p-4 mb-6 text-sm bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={20} className="text-red-600 flex-shrink-0" />
          <p className="text-red-800">{error}</p>
          <button
            onClick={fetchProperties}
            className="ml-auto px-3 py-1 text-xs font-medium text-red-600 bg-white border border-red-300 rounded hover:bg-red-50"
          >
            Retry
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Map Container */}
        <div className="flex flex-col overflow-hidden bg-white shadow-sm lg:col-span-2 rounded-xl">
            <div className="h-[500px] md:h-[600px]">
            <ErrorBoundary>
              <PropertyMap
                properties={properties}
                center={mapCenter}
                zoom={12}
                loading={loading}
                onMarkerClick={handleMarkerClick}
                selectedPropertyId={selectedProperty?.id}
              />
            </ErrorBoundary>
          </div>

          {/* Legend */}
          <div className="flex flex-wrap items-center justify-between gap-4 px-6 py-4 border-t border-gray-200">
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-green-600 rounded-full"></span>
                <span className="text-sm text-gray-700">Below Market</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-yellow-500 rounded-full"></span>
                <span className="text-sm text-gray-700">Market Average</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-red-600 rounded-full"></span>
                <span className="text-sm text-gray-700">Above Market</span>
              </div>
            </div>
            <div className="text-sm text-gray-600">
              {totalProperties} {totalProperties === 1 ? 'property' : 'properties'} found
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Property Details */}
          <PropertyDetailsSidebar
            property={selectedProperty}
            onClose={handleCloseDetails}
            onCreateDeal={handleCreateDeal}
          />

          {/* Quick Stats */}
          <div className="p-6 bg-white shadow-sm rounded-xl">
            <h3 className="mb-4 text-lg font-semibold text-gray-800">Search Results</h3>
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-lg bg-blue-50">
                  <Home size={16} className="text-blue-500" />
                </div>
                <div className="flex-1">
                  <span className="block text-xs text-gray-500">Total Properties</span>
                  <span className="block text-lg font-bold text-gray-800">{totalProperties}</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-lg bg-purple-50">
                  <DollarSign size={16} className="text-purple-500" />
                </div>
                <div className="flex-1">
                  <span className="block text-xs text-gray-500">Average Rent</span>
                  <span className="block text-lg font-bold text-gray-800">
                    {formatPrice(averagePrice)}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-lg bg-green-50">
                  <MapPin size={16} className="text-green-500" />
                </div>
                <div className="flex-1">
                  <span className="block text-xs text-gray-500">Search Location</span>
                  <span className="block text-sm font-semibold text-gray-800 break-words">
                    {searchParams.searchValue || 'None'}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Deal Creation Modal */}
      <DealFormModal
        isOpen={isDealModalOpen}
        onClose={handleCloseDealModal}
        onSubmit={handleDealSubmit}
        initialData={{
          dealName: selectedPropertyForDeal?.address ? `Deal - ${selectedPropertyForDeal.address}` : '',
          location: searchParams.searchValue,
          status: 'potential',
          propertyAddress: selectedPropertyForDeal?.address,
          latitude: selectedPropertyForDeal?.lat,
          longitude: selectedPropertyForDeal?.lng
        }}
      />
    </div>
  );
};

export default MapPage;
