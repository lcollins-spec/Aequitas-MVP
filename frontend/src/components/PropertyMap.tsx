import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import { DivIcon } from 'leaflet';
import type { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { MapProperty } from '../types/map';
import { calculatePriceStats, getMarkerColor } from '../utils/mapHelpers';

interface PropertyMapProps {
  properties: MapProperty[];
  center?: LatLngExpression;
  zoom?: number;
  className?: string;
  loading?: boolean;
  onMarkerClick?: (property: MapProperty) => void;
  selectedPropertyId?: string;
}

// Component to update map view when center changes
const MapViewController = ({ center }: { center: LatLngExpression }) => {
  const map = useMap();

  useEffect(() => {
    map.setView(center, map.getZoom());
  }, [center, map]);

  return null;
};

const PropertyMap = ({
  properties,
  center = [38.5816, -121.4944],
  zoom = 12,
  className = 'h-full w-full',
  loading = false,
  onMarkerClick,
  selectedPropertyId
}: PropertyMapProps) => {

  // Calculate price statistics for color coding
  const priceStats = calculatePriceStats(properties);

  // Create custom marker icon using Tailwind classes
  const createCustomIcon = (property: MapProperty, isSelected: boolean): DivIcon => {
    try {
      const color = getMarkerColor(property.price, priceStats.average);

      // Map color names to Tailwind classes
      const colorClasses = {
        green: 'bg-green-600 hover:bg-green-700',
        yellow: 'bg-yellow-500 hover:bg-yellow-600',
        red: 'bg-red-600 hover:bg-red-700'
      };

      const bgClass = colorClasses[color as keyof typeof colorClasses] || colorClasses.red;
      const selectedClass = isSelected ? 'ring-4 ring-primary-400 ring-offset-2' : '';

      const safePrice = String(property.priceFormatted || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

      return new DivIcon({
        className: 'custom-marker',
        html: `
          <div class="${bgClass} ${selectedClass} text-white rounded-full px-2 py-1 text-xs font-bold shadow-lg cursor-pointer transition-all whitespace-nowrap">
            ${safePrice}
          </div>
        `,
        iconSize: [80, 32],
        iconAnchor: [40, 16],
        popupAnchor: [0, -16]
      });
    } catch (err) {
      // Log and return a minimal fallback to avoid crashing the map
      // eslint-disable-next-line no-console
      console.error('Failed to create custom DivIcon for property', property, err);
      return new DivIcon({
        className: 'custom-marker',
        html: `<div class="bg-gray-600 text-white rounded-full px-2 py-1 text-xs font-bold">N/A</div>`,
        iconSize: [40, 16],
        iconAnchor: [20, 8],
        popupAnchor: [0, -8]
      });
    }
  };

  return (
    <div className={`${className} relative`}>
      {/* Loading Overlay */}
      {loading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-white bg-opacity-75 rounded-xl">
          <div className="w-12 h-12 border-4 border-primary-700 border-t-transparent rounded-full animate-spin"></div>
          <p className="mt-3 text-sm font-medium text-gray-700">Loading properties...</p>
        </div>
      )}

      {/* Empty State */}
      {!loading && properties.length === 0 && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-gray-50 rounded-xl">
          <svg
            className="w-16 h-16 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="mt-3 text-sm font-medium text-gray-600">No properties found</p>
          <p className="mt-1 text-xs text-gray-500">Try a different search location or adjust your filters</p>
        </div>
      )}

      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        className="h-full w-full z-0 rounded-xl"
        zoomControl={true}
        attributionControl={false}
      >
        <MapViewController center={center} />

        {/* CartoDB Voyager tile layer - clean and professional */}
        <TileLayer
          attribution=''
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          maxZoom={20}
        />

        {/* Render custom markers for each property */}
        {properties.map((property) => (
          <Marker
            key={property.id}
            position={[property.lat, property.lng]}
            icon={createCustomIcon(property, property.id === selectedPropertyId)}
            eventHandlers={{
              click: () => {
                if (onMarkerClick) {
                  onMarkerClick(property);
                }
              }
            }}
          >
            <Popup className="custom-popup">
              <div className="p-2">
                <p className="font-semibold text-gray-800 text-sm">
                  {property.priceFormatted}
                </p>
                <p className="text-gray-600 text-xs mt-1">
                  {property.address}
                </p>
                {property.bedrooms !== undefined && property.bathrooms !== undefined && (
                  <p className="text-gray-500 text-xs mt-1">
                    {property.bedrooms} bed • {property.bathrooms} bath
                  </p>
                )}
                {property.distanceMiles !== undefined && (
                  <p className="text-primary-800 text-xs mt-1">
                    {property.distanceMiles.toFixed(2)} miles away
                  </p>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default PropertyMap;
