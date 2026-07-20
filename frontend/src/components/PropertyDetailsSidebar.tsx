import { X, MapPin, Home, Bed, Bath, Maximize, Calendar, ExternalLink, PlusCircle } from 'lucide-react';
import type { MapProperty } from '../types/map';

interface PropertyDetailsSidebarProps {
  property: MapProperty | null;
  onClose: () => void;
  onCreateDeal?: (property: MapProperty) => void;
}

const PropertyDetailsSidebar = ({ property, onClose, onCreateDeal }: PropertyDetailsSidebarProps) => {
  if (!property) {
    return (
      <div className="flex flex-col items-center justify-center p-6 py-8 text-center bg-white shadow-sm rounded-xl">
        <MapPin size={48} className="text-gray-300" />
        <p className="mt-3 text-sm text-gray-500">
          Select a property on the map to view details
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white shadow-sm rounded-xl overflow-hidden">
      {/* Header with close button */}
      <div className="flex items-start justify-between p-4 border-b border-gray-200">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-800">Property Details</h3>
          <p className="mt-1 text-2xl font-bold text-primary-800">{property.priceFormatted}</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-gray-400 transition-colors hover:text-gray-600"
          aria-label="Close details"
        >
          <X size={20} />
        </button>
      </div>

      {/* Property Information */}
      <div className="p-4 space-y-4">
        {/* Address */}
        <div className="flex items-start gap-3">
          <div className="flex items-center justify-center flex-shrink-0 w-10 h-10 rounded-lg bg-gray-50">
            <Home size={18} className="text-primary-800" />
          </div>
          <div className="flex-1 min-w-0">
            <span className="block text-xs text-gray-500">Location</span>
            <span className="block text-sm font-medium text-gray-800 break-words">
              {property.address || `Lat: ${property.lat.toFixed(4)}, Lng: ${property.lng.toFixed(4)}`}
            </span>
            {!property.address && property.distanceMiles !== undefined && (
              <span className="block text-xs text-gray-500 mt-1">
                {property.distanceMiles.toFixed(2)} miles from search center
              </span>
            )}
          </div>
        </div>

        {/* Property Features Grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Bedrooms */}
          {property.bedrooms !== undefined && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50">
              <Bed size={16} className="text-gray-600" />
              <div>
                <span className="block text-xs text-gray-500">Bedrooms</span>
                <span className="block text-sm font-semibold text-gray-800">
                  {property.bedrooms}
                </span>
              </div>
            </div>
          )}

          {/* Bathrooms */}
          {property.bathrooms !== undefined && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50">
              <Bath size={16} className="text-gray-600" />
              <div>
                <span className="block text-xs text-gray-500">Bathrooms</span>
                <span className="block text-sm font-semibold text-gray-800">
                  {property.bathrooms}
                </span>
              </div>
            </div>
          )}

          {/* Square Footage */}
          {property.squareFootage !== undefined && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50">
              <Maximize size={16} className="text-gray-600" />
              <div>
                <span className="block text-xs text-gray-500">Sq Ft</span>
                <span className="block text-sm font-semibold text-gray-800">
                  {property.squareFootage.toLocaleString()}
                </span>
              </div>
            </div>
          )}

          {/* Days on Market */}
          {property.daysOnMarket !== undefined && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-gray-50">
              <Calendar size={16} className="text-gray-600" />
              <div>
                <span className="block text-xs text-gray-500">Days on Market</span>
                <span className="block text-sm font-semibold text-gray-800">
                  {property.daysOnMarket}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Property Type */}
        {property.propertyType && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-purple-50">
            <div>
              <span className="block text-xs text-purple-600">Property Type</span>
              <span className="block text-sm font-semibold text-purple-800">
                {property.propertyType}
              </span>
            </div>
          </div>
        )}

        {/* Distance */}
        {property.distanceMiles !== undefined && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-green-50">
            <MapPin size={16} className="text-green-600" />
            <div>
              <span className="block text-xs text-green-600">Distance from Search</span>
              <span className="block text-sm font-semibold text-green-800">
                {property.distanceMiles.toFixed(2)} miles
              </span>
            </div>
          </div>
        )}

        {/* Listing Link */}
        {property.listingUrl && (() => {
          // Defensive: ensure listingUrl is a valid absolute or relative URL
          let safeHref = '';
          try {
            // new URL will throw for invalid URLs; if it's relative, base on window.location
            safeHref = new URL(property.listingUrl, window.location.href).href;
          } catch (err) {
            // Fallback: don't render the link if URL is malformed
            // eslint-disable-next-line no-console
            console.warn('Skipping invalid listingUrl for property', property.id, property.listingUrl, err);
            return null;
          }

          return (
            <a
              href={safeHref}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-full gap-2 px-4 py-3 text-sm font-medium text-white transition-colors bg-primary-800 rounded-lg hover:bg-primary-700"
            >
              View Full Listing
              <ExternalLink size={16} />
            </a>
          );
        })()}

        {/* Create Deal Button */}
        {onCreateDeal && (
          <button
            onClick={() => onCreateDeal(property)}
            className="flex items-center justify-center w-full gap-2 px-4 py-3 text-sm font-medium text-white transition-colors bg-green-500 rounded-lg hover:bg-green-600"
          >
            <PlusCircle size={16} />
            Create Deal from Property
          </button>
        )}
      </div>

      {/* Location Coordinates (for debugging/reference) */}
      <div className="px-4 py-3 text-xs text-gray-400 border-t border-gray-200 bg-gray-50">
        <div className="flex justify-between">
          <span>Lat: {property.lat.toFixed(6)}</span>
          <span>Lng: {property.lng.toFixed(6)}</span>
        </div>
      </div>
    </div>
  );
};

export default PropertyDetailsSidebar;
