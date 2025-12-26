import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import { DivIcon } from 'leaflet';
import type { LatLngExpression } from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface Property {
  id: number;
  lat: number;
  lng: number;
  price: string;
  address: string;
}

interface PropertyMapProps {
  properties?: Property[];
  center?: LatLngExpression;
  zoom?: number;
  className?: string;
}

// Mock property data around Sacramento, CA
const defaultProperties: Property[] = [
  {
    id: 1,
    lat: 38.5816,
    lng: -121.4944,
    price: '$625k',
    address: '1234 Capitol Mall, Sacramento, CA 95814'
  },
  {
    id: 2,
    lat: 38.5950,
    lng: -121.4750,
    price: '$495k',
    address: '456 Folsom Blvd, Sacramento, CA 95819'
  },
  {
    id: 3,
    lat: 38.5680,
    lng: -121.5050,
    price: '$550k',
    address: '789 Land Park Dr, Sacramento, CA 95818'
  },
  {
    id: 4,
    lat: 38.6100,
    lng: -121.4600,
    price: '$720k',
    address: '321 Fair Oaks Blvd, Sacramento, CA 95825'
  },
  {
    id: 5,
    lat: 38.5500,
    lng: -121.4700,
    price: '$580k',
    address: '987 Riverside Blvd, Sacramento, CA 95822'
  }
];

const PropertyMap = ({
  properties = defaultProperties,
  center = [38.5816, -121.4944],
  zoom = 12,
  className = 'h-full w-full'
}: PropertyMapProps) => {
  
  // Create custom marker icon using Tailwind classes
  const createCustomIcon = (price: string): DivIcon => {
    return new DivIcon({
      className: 'custom-marker',
      html: `
        <div class="bg-red-700 text-white rounded-full px-2 py-1 text-xs font-bold shadow-lg cursor-pointer hover:bg-red-800 transition-colors whitespace-nowrap">
          ${price}
        </div>
      `,
      iconSize: [60, 30],
      iconAnchor: [30, 15],
      popupAnchor: [0, -15]
    });
  };

  return (
    <div className={className}>
      <MapContainer
        center={center}
        zoom={zoom}
        scrollWheelZoom={true}
        className="h-full w-full z-0 rounded-xl"
        zoomControl={true}
        attributionControl={false}
      >
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
            icon={createCustomIcon(property.price)}
          >
            <Popup className="custom-popup">
              <div className="p-2">
                <p className="font-semibold text-gray-800 text-sm">
                  {property.price}
                </p>
                <p className="text-gray-600 text-xs mt-1">
                  {property.address}
                </p>
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
};

export default PropertyMap;
