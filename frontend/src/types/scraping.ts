/**
 * TypeScript types for property scraping functionality
 */

export type ImportStatus = 'pending' | 'success' | 'partial' | 'failed';
export type ImportMethod = 'tier1_direct' | 'tier2_syndication' | 'tier3_api_enrichment';
export type ErrorType = 'blocked' | 'parse_error' | 'network_error' | 'not_found' | 'unknown';

export interface ExtractedPropertyData {
  // Basic Information
  propertyName?: string;
  address?: string;
  city?: string;
  state?: string;
  zipcode?: string;

  // Location Data
  latitude?: number;
  longitude?: number;
  walkScore?: number;
  transitScore?: number;

  // Property Details
  propertyType?: string;
  buildingSizeSf?: number;
  lotSizeAcres?: number;
  yearBuilt?: number;
  numUnits?: number;
  numStories?: number;
  bedrooms?: number;
  bathrooms?: number;
  zoning?: string;
  parcelId?: string;

  // Financial Data
  askingPrice?: number;
  pricePerSf?: number;
  pricePerUnit?: number;
  capRate?: number;
  noi?: number;
  grossIncome?: number;
  occupancyRate?: number;

  // Parking
  parkingSpaces?: number;
  parkingType?: string;
  parkingRatio?: number;

  // Listing Information
  listingUrl?: string;
  listingId?: string;
  daysOnMarket?: number;
  listingStatus?: string;
}

export interface EnrichmentData {
  estimatedRent?: number;
  rentRangeLow?: number;
  rentRangeHigh?: number;
  estimatedValue?: number;
  valueRangeLow?: number;
  valueRangeHigh?: number;
  marketAvgRent?: number;
  marketMedianRent?: number;
  marketInventoryLevel?: string;
  comparableCount?: number;
}

export interface PropertyImport {
  importId?: number;
  status: ImportStatus;
  method?: ImportMethod;
  extractedData?: ExtractedPropertyData;
  enrichmentData?: EnrichmentData;
  confidenceScore?: number;
  missingFields?: string[];
  warnings?: string[];
  requiresUserInput?: boolean;
  errorType?: ErrorType;
  errorMessage?: string;
  suggestedAction?: string;
  sourceUrl?: string;
  sourcePlatform?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface PropertyImportResponse {
  success: boolean;
  data?: PropertyImport;
  error?: string;
  code?: string;
  details?: {
    importId?: number;
    status?: string;
    errorType?: string;
    errorMessage?: string;
    suggestedAction?: string;
  };
}

export interface ListImportsResponse {
  success: boolean;
  data?: {
    imports: PropertyImport[];
    total: number;
  };
  error?: string;
  code?: string;
}

export interface UnitMixEntry {
  unitType: string;
  count: number;
  sqft?: number | null;
  askingRent: number;
}

export interface OmExtractedData {
  propertyName?: string | null;
  address?: string | null;
  city?: string | null;
  state?: string | null;
  zipcode?: string | null;
  numUnits?: number | null;
  askingPrice?: number | null;
  unitMix: UnitMixEntry[];
  laundryIncome?: number | null;
  operatingExpenses?: {
    utilitiesAnnual?: number | null;
    insuranceAnnual?: number | null;
    propertyTaxAnnual?: number | null;
    repairsMaintenanceAnnual?: number | null;
    managementFeePct?: number | null;
  } | null;
  rentStabilized?: boolean | null;
  annualRentGrowthCap?: number | null;
}
