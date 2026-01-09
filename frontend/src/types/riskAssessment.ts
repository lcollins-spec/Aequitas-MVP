/**
 * TypeScript types for Risk Assessment System
 * Based on academic research for affordable housing investment analysis
 */

export interface RiskAssessment {
  // Identifiers
  id?: number;
  dealId: number;
  calculatedAt: string;
  holdingPeriod: number;
  geography: string;

  // Rent Tier Classification (Part 1)
  predictedFundamentalRent: number;
  rentDecileNational: number; // 1-10
  rentDecileRegional: number; // 1-10
  rentTierLabel: string; // 'D1', 'D2', ... 'D10'
  rentPercentile: number;

  // Yield Calculations (Part 2)
  grossYield: number;
  maintenanceCostPct: number;
  propertyTaxPct: number;
  turnoverCostPct: number;
  defaultCostPct: number;
  managementCostPct: number;
  totalCostPct: number;
  netYield: number;

  // Capital Appreciation (Part 3)
  projectedPriceYr1: number;
  projectedPriceYr5: number;
  projectedPriceYr10: number;
  capitalGainYieldAnnual: number;

  // Total Returns (Part 4)
  totalReturnUnlevered: number;
  totalReturnLevered: number;
  leverageEffect: number;

  // Risk Metrics (Part 5)
  systematicRiskScore: number;
  betaGdp: number;
  betaStocks: number;
  cashFlowVolatility: string;
  cashFlowCyclicality: string;

  regulatoryRiskScore: number;
  hasRentControl: boolean;
  rpsScore: number;

  idiosyncraticRiskScore: number;

  compositeRiskScore: number;
  compositeRiskLevel: 'Low' | 'Medium' | 'High';

  // Climate Risk (Part 5b - NEW: 4th dimension)
  climateRiskScore?: number; // 0-100 composite score
  climateRiskLevel?: 'Low' | 'Medium' | 'High' | 'Very High' | 'Unknown';

  // Individual hazard scores (8 hazards)
  floodRiskScore?: number;
  wildfireRiskScore?: number;
  hurricaneRiskScore?: number;
  earthquakeRiskScore?: number; // Phase 2
  tornadoRiskScore?: number; // Phase 2
  extremeHeatRiskScore?: number; // Phase 2
  seaLevelRiseRiskScore?: number; // Phase 2
  droughtRiskScore?: number; // Phase 2

  // Geocoding results
  propertyLatitude?: number;
  propertyLongitude?: number;
  geocodedAddress?: string;

  // Top climate hazards
  topClimateHazards?: Array<{
    hazard: string;
    score: number;
    label: string;
  }>;

  // Arbitrage Opportunities (Part 6)
  renterConstraintScore: number;
  institutionalConstraintScore: number;
  mediumLandlordFitScore: number;
  arbitrageOpportunityScore: number;
  arbitrageOpportunityLevel: string;
  recommendedInvestorType: string;

  // Benchmark Comparison (Part 7)
  vsBenchmarkYield: 'Above' | 'Within' | 'Below';
  vsBenchmarkReturn: 'Above' | 'Within' | 'Below';

  // Full component data
  components?: {
    rentPrediction?: any;
    classification?: any;
    costComponents?: any;
    appreciation?: any;
    systematicRisk?: any;
    regulatoryRisk?: any;
    idiosyncraticRisk?: any;
    climateRisk?: any; // NEW: Climate risk component
    compositeRisk?: any;
    renterConstraints?: any;
    institutionalConstraints?: any;
    mediumLandlordFit?: any;
    arbitrageOpportunity?: any;
    yieldBenchmark?: any;
    returnBenchmark?: any;
  };
}

export interface DealMemo {
  // Section 1: Property Summary
  propertySummary: {
    address: string;
    purchasePrice: number;
    bedrooms: number;
    bathrooms: number;
    squareFootage: number;
    yearBuilt: number;
    propertyAge: number;
    propertyCondition?: string;
    numberOfUnits: number;
    propertyType: string;
  };

  // Section 2: Rent Prediction
  rentPrediction: {
    predictedRent: number;
    confidenceInterval?: [number, number];
    modelVersion?: string;
  };

  // Section 3: Tier Classification
  tierClassification: {
    tierLabel: string;
    nationalDecile: number;
    regionalDecile: number;
    percentile: number;
    interpretation: {
      category: string;
      description: string;
      expectedReturnRange: string;
    };
  };

  // Section 4: Yield Analysis
  yieldAnalysis: {
    annualRent: number;
    propertyValue: number;
    grossYield: number;
    costComponents: {
      maintenanceCostPct: number;
      propertyTaxPct: number;
      turnoverCostPct: number;
      defaultCostPct: number;
      managementCostPct: number;
      totalCostPct: number;
    };
    netYield: number;
    benchmarkComparison: any;
  };

  // Section 5: Appreciation Projection
  appreciationProjection: {
    projectedValueYr1: number;
    projectedValueYr5: number;
    projectedValueYr10: number;
    annualizedAppreciationRate: number;
    totalAppreciation: number;
    benchmarkComparison: any;
  };

  // Section 6: Total Return
  totalReturn: {
    totalReturnUnlevered: number;
    totalReturnLevered: number;
    leverageEffect: number;
    costOfDebt: number;
    ltv: number;
    benchmarkComparison: any;
  };

  // Section 7: Risk Assessment
  riskAssessment: {
    systematicRisk: any;
    regulatoryRisk: any;
    idiosyncraticRisk: any;
    compositeRisk: {
      compositeRiskScore: number;
      compositeRiskLevel: string;
      interpretation: string;
    };
  };

  // Section 8: Arbitrage Opportunity
  arbitrageOpportunity: {
    renterConstraints: any;
    institutionalConstraints: any;
    mediumLandlordFit: any;
    overallOpportunity: {
      arbitrageOpportunityScore: number;
      opportunityLevel: string;
      recommendedInvestorType: string;
      interpretation: string;
    };
  };

  // Section 9: Investment Recommendation
  investmentRecommendation: {
    overallRating: string;
    ratingScore: number;
    keyStrengths: string[];
    keyConcerns: string[];
    summary: string;
  };

  // Section 10: Sensitivity Analysis
  sensitivityAnalysis: {
    scenarios: {
      [key: string]: {
        name: string;
        rentAssumption: number;
        appreciationAssumption: number;
        netYield: number;
        totalReturnUnlevered: number;
        totalReturnLevered: number;
      };
    };
    interpretation: string;
  };

  // Section 11: Executive Summary
  executiveSummary: {
    property: string;
    address: string;
    purchasePrice: number;
    rentTier: string;
    tierCategory: string;
    expectedReturnRange: string;
    calculatedReturnUnlevered: number;
    calculatedReturnLevered: number;
    riskLevel: string;
    riskScore: number;
    arbitrageOpportunityLevel: string;
    arbitrageScore: number;
    overallRating: string;
    ratingScore: number;
    targetInvestor: string;
  };
}

export interface BenchmarkData {
  rentDecile: number; // 1-10
  geography: string;
  netYieldMin: number;
  netYieldMax: number;
  capitalGainMin: number;
  capitalGainMax: number;
  totalReturnMin: number;
  totalReturnMax: number;
  maintenanceCostPct: number;
  turnoverCostPct: number;
  defaultCostPct: number;
  systematicRiskBeta?: number;
  cashFlowVolatility?: string;
}

export interface MarketThresholds {
  geography: string;
  bedrooms: number;
  dataYear: number;
  d1Threshold: number;
  d2Threshold: number;
  d3Threshold: number;
  d4Threshold: number;
  d5Threshold: number;
  d6Threshold: number;
  d7Threshold: number;
  d8Threshold: number;
  d9Threshold: number;
  d10Threshold: number;
  lastUpdated: string;
}

export interface DealComparison {
  deals: {
    [dealId: number]: DealMemo;
  };
  rankings: {
    byTotalReturn: Array<[number, DealMemo]>;
    byRiskAdjustedReturn: Array<[number, DealMemo]>;
    byArbitrageOpportunity: Array<[number, DealMemo]>;
    byOverallRating: Array<[number, DealMemo]>;
  };
}

// API Response types
export interface RiskAssessmentResponse {
  success: boolean;
  data?: RiskAssessment;
  error?: string;
}

export interface DealMemoResponse {
  success: boolean;
  data?: DealMemo;
  error?: string;
}

export interface BenchmarkDataResponse {
  success: boolean;
  data?: BenchmarkData;
  error?: string;
}

export interface MarketThresholdsResponse {
  success: boolean;
  data?: MarketThresholds;
  error?: string;
}

export interface DealComparisonResponse {
  success: boolean;
  data?: DealComparison;
  error?: string;
}
