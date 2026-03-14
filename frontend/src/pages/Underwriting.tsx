import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { FileText, Download, ChevronDown, TrendingUp, Save, Upload, Loader2, CheckCircle, ChevronUp } from 'lucide-react';
import { fredApi } from '../services/fredApi';
import { rentcastApi } from '../services/rentcastApi';
import { censusApi } from '../services/censusApi';
import { dealApi } from '../services/dealApi';
import type { RentEstimateData, RentalComparable, MarketStatistics } from '../types/rentcast';
import type { DemographicData } from '../types/census';
import type { Deal, DealStatus } from '../types/deal';
import { DEAL_STATUS_LABELS, getPipelineStatus, setPipelineStatus } from '../types/deal';
import type { PipelineStatus } from '../types/deal';
import DealsListSidebar from '../components/DealsListSidebar';
import PropertyUrlInput from '../components/PropertyUrlInput';
import DataRoomModal from '../components/DataRoomModal';
import LoiModal from '../components/LoiModal';
import { saveDealExecution, patchDealExecution, getDealExecution, type DealExecutionRecord } from '../types/dealExecution';
import type { DealDocument, LoiExtractedData } from '../types/dealExecution';

import { scrapingApi } from '../services/scrapingApi';
import type { UnitMixEntry, OmExtractedData } from '../types/scraping';

// --- FINANCIAL CALCULATION UTILITIES ---
const calculatePMT = (rate: number, nper: number, pv: number) => {
  if (rate === 0) return -(pv / nper);
  const pvif = Math.pow(1 + rate, nper);
  return -((rate * pv * pvif) / (pvif - 1));
};

const npv = (rate: number, values: number[]) => {
  return values.reduce((acc, val, i) => acc + val / Math.pow(1 + rate, i), 0);
};

const calculateIRR = (values: number[], guess = 0.1) => {
  const maxIter = 1000;
  const precision = 0.00001;
  let rate = guess;

  for (let i = 0; i < maxIter; i++) {
    const npvValue = npv(rate, values);
    if (Math.abs(npvValue) < precision) return rate;

    const npvDerivative = values.reduce(
      (acc, val, j) => acc - (j * val) / Math.pow(1 + rate, j + 1),
      0
    );

    // Safety check for division by zero
    if (Math.abs(npvDerivative) < 0.0000001) {
      console.error('IRR calculation failed: derivative approaching zero');
      return NaN;
    }

    const newRate = rate - npvValue / npvDerivative;

    // Bounds checking to prevent Infinity/NaN
    if (!isFinite(newRate) || isNaN(newRate)) {
      console.error('IRR calculation diverged');
      return NaN;
    }

    if (Math.abs(newRate - rate) < precision) return newRate;
    rate = newRate;
  }

  console.warn('IRR did not converge after', maxIter, 'iterations');
  return rate;
};

type YearRow = {
  year: number;
  label: string;
  gpr: number;
  vacancyLoss: number;
  badDebtLoss: number;
  egi: number;
  opex: number;
  noi: number;
  debtService: number;
  cfbt: number;
  saleProceeds: number;
  isAcquisition: boolean;
  isExit: boolean;
};

const fmtDollar = (n: number, forceBlank = false): string => {
  if (forceBlank || n === 0) return '—';
  const abs = Math.round(Math.abs(n)).toLocaleString('en-US');
  return n >= 0 ? `$${abs}` : `($${abs})`;
};

const amiOptions = [
  '30% AMI - $24,000/year',
  '50% AMI - $40,000/year',
  '60% AMI - $48,000/year',
  '80% AMI - $64,000/year',
];

const gpPartners = [
  'Aequitas Housing',
];

// --- MARKET ANALYSIS PANEL ---
type MarketAnalysisPanelProps = {
  isOpen: boolean;
  loading: boolean;
  error: string | null;
  demographics: DemographicData | null;
  marketStats: MarketStatistics | null;
  zipCode: string;
  cityName: string;
  onToggle: () => void;
};

function MarketAnalysisPanelBlock({ isOpen, loading, error, demographics, marketStats, zipCode, cityName, onToggle }: MarketAnalysisPanelProps) {
  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  const amiRows: [number, number][] = demographics ? [
    [30, demographics.income.ami_30_percent],
    [50, demographics.income.ami_50_percent],
    [60, demographics.income.ami_60_percent],
    [80, demographics.income.ami_80_percent],
  ] : [];

  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <TrendingUp size={18} className="text-blue-500" />
          <span className="text-sm font-semibold text-gray-800">Market Analysis</span>
          {(cityName || zipCode) && (
            <span className="text-xs text-gray-400">
              {cityName && zipCode ? `${cityName} (${zipCode})` : cityName || zipCode}
            </span>
          )}
        </div>
        {isOpen ? <ChevronUp size={16} className="text-gray-400" /> : <ChevronDown size={16} className="text-gray-400" />}
      </button>

      {isOpen && (
        <div className="px-5 pb-5 border-t border-gray-100">
          {loading && (
            <div className="flex items-center gap-2 py-6 justify-center text-gray-500">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Fetching market data…</span>
            </div>
          )}
          {error && !loading && (
            <p className="text-sm text-red-500 py-4">{error}</p>
          )}
          {!loading && !error && demographics && (
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-xs text-gray-500">Population</p>
                  <p className="text-sm font-bold text-blue-900">{demographics.population.total_population.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-yellow-50 rounded-lg">
                  <p className="text-xs text-gray-500">Median Income</p>
                  <p className="text-sm font-bold text-yellow-900">{fmt(demographics.income.median_household_income)}</p>
                </div>
              </div>

              <div>
                <p className="text-xs font-medium text-gray-500 mb-2">AMI Levels</p>
                <div className="grid grid-cols-4 gap-2">
                  {amiRows.map(([pct, val]) => (
                    <div key={pct} className="p-2 bg-gray-50 rounded-lg text-center">
                      <p className="text-xs text-gray-400">{pct}%</p>
                      <p className="text-xs font-semibold text-gray-800">{fmt(val)}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-pink-50 rounded-lg">
                  <p className="text-xs text-gray-500">Median Rent</p>
                  <p className="text-sm font-bold text-pink-900">{fmt(demographics.housing.median_gross_rent)}</p>
                </div>
                <div className="p-3 bg-teal-50 rounded-lg">
                  <p className="text-xs text-gray-500">Occupancy Rate</p>
                  <p className="text-sm font-bold text-teal-900">{demographics.housing.occupancy_rate.toFixed(1)}%</p>
                </div>
              </div>

              {marketStats && (
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Rental Market (RentCast)</p>
                  <div className="grid grid-cols-2 gap-2">
                    {marketStats.avgRentAll != null && (
                      <div className="p-3 bg-purple-50 rounded-lg">
                        <p className="text-xs text-gray-500">Avg Rent</p>
                        <p className="text-sm font-bold text-purple-900">{fmt(marketStats.avgRentAll)}</p>
                      </div>
                    )}
                    {marketStats.avgRent1bed != null && (
                      <div className="p-3 bg-indigo-50 rounded-lg">
                        <p className="text-xs text-gray-500">1 Bed</p>
                        <p className="text-sm font-bold text-indigo-900">{fmt(marketStats.avgRent1bed)}</p>
                      </div>
                    )}
                    {marketStats.avgRent2bed != null && (
                      <div className="p-3 bg-indigo-50 rounded-lg">
                        <p className="text-xs text-gray-500">2 Bed</p>
                        <p className="text-sm font-bold text-indigo-900">{fmt(marketStats.avgRent2bed)}</p>
                      </div>
                    )}
                    {marketStats.avgRent3bed != null && (
                      <div className="p-3 bg-indigo-50 rounded-lg">
                        <p className="text-xs text-gray-500">3 Bed</p>
                        <p className="text-sm font-bold text-indigo-900">{fmt(marketStats.avgRent3bed)}</p>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const Underwriting = () => {
  const [searchParams] = useSearchParams();

  // Current Deal State
  const [currentDealId, setCurrentDealId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Pipeline status (localStorage-backed)
  const [pipelineStatus, setPipelineStatusState] = useState<PipelineStatus>('Analyzing');
  const [showDataRoomModal, setShowDataRoomModal] = useState(false);
  const [showLoiModal, setShowLoiModal] = useState(false);

  const isUnderwritingLocked = pipelineStatus === 'LOI Executed'
    || pipelineStatus === 'Under Contract'
    || pipelineStatus === 'Closed'
    || pipelineStatus === 'Exited';

  // Deal Parameters State
  const [dealName, setDealName] = useState('New Development Project');
  const [dealStatus, setDealStatus] = useState<DealStatus>('potential');
  const [location, setLocation] = useState('Sacramento, CA');
  const [county, setCounty] = useState('Sacramento County');
  const [zipCode, setZipCode] = useState('95814');
  const [yearBuilt, setYearBuilt] = useState(1985);
  const [buildingType, setBuildingType] = useState('Garden Style');
  const [numberOfBuildings, setNumberOfBuildings] = useState(4);
  const [totalUnits, setTotalUnits] = useState(200);
  const [purchasePrice, setPurchasePrice] = useState(15000000);
  const [constructionCostPct, setConstructionCostPct] = useState(10); // percentage
  const [constructionCost, setConstructionCost] = useState(purchasePrice * 0.10);
  const [closingCostsPct, setClosingCostsPct] = useState(3); // percentage
  const [closingCosts, setClosingCosts] = useState(purchasePrice * 0.03);
  const [avgMonthlyRent, setAvgMonthlyRent] = useState(1200);
  const [operatingExpenseRatio, setOperatingExpenseRatio] = useState(0.35);
  const [interestRate, setInterestRate] = useState(0.065);
  const [loanTermYears, setLoanTermYears] = useState(30);
  const [ltv, setLtv] = useState(70);
  const [exitCapRate, setExitCapRate] = useState(0.06);
  const [holdingPeriod, setHoldingPeriod] = useState(10);
  const [vacancyRate, setVacancyRate] = useState(0.05); // 5% default
  const [badDebtRate, setBadDebtRate] = useState(0.00); // 0% default
  const [rentGrowthRate, setRentGrowthRate] = useState(0.02); // 2% default
  const [cashFlowTab, setCashFlowTab] = useState<'noi' | 'levered'>('noi');
  const [amiTarget, setAmiTarget] = useState('60% AMI - $48,000/year');
  const [gpPartner, setGpPartner] = useState('Aequitas Housing');

  // FRED API State
  const [currentMortgageRate, setCurrentMortgageRate] = useState<number | null>(null);
  const [rateLastUpdated, setRateLastUpdated] = useState<string>('');
  const [loadingRates, setLoadingRates] = useState(true);

  // RentCast API State
  const [rentEstimate, setRentEstimate] = useState<RentEstimateData | null>(null);
  const [loadingRentEstimate, setLoadingRentEstimate] = useState(false);
  const [showComparables, setShowComparables] = useState(false);
  const [comparables, setComparables] = useState<RentalComparable[]>([]);

  // Offering Memorandum PDF extraction state
  const [unitMix, setUnitMix] = useState<UnitMixEntry[]>([]);
  const [omUploading, setOmUploading] = useState(false);
  const [omError, setOmError] = useState<string | null>(null);
  const [omLaundryIncome, setOmLaundryIncome] = useState<number | null>(null);
  const [omOperatingExpenses, setOmOperatingExpenses] = useState<OmExtractedData['operatingExpenses'] | null>(null);
  const [omRentStabilized, setOmRentStabilized] = useState<boolean | null>(null);
  const [omAnnualRentGrowthCap, setOmAnnualRentGrowthCap] = useState<number | null>(null);

  // Market Analysis Panel State
  const [marketAnalysisOpen, setMarketAnalysisOpen] = useState(false);
  const [marketAnalysisLoading, setMarketAnalysisLoading] = useState(false);
  const [marketAnalysisDemographics, setMarketAnalysisDemographics] = useState<DemographicData | null>(null);
  const [marketAnalysisStats, setMarketAnalysisStats] = useState<MarketStatistics | null>(null);
  const [marketAnalysisError, setMarketAnalysisError] = useState<string | null>(null);

  // Fetch current mortgage rates on mount
  useEffect(() => {
    async function fetchCurrentRates() {
      try {
        setLoadingRates(true);
        const response = await fredApi.getRates();
        if (response.success && response.data) {
          setCurrentMortgageRate(response.data.mortgage30Year);
          setRateLastUpdated(response.lastUpdated || new Date().toISOString());
        }
      } catch (error) {
        console.error('Error fetching FRED rates:', error);
      } finally {
        setLoadingRates(false);
      }
    }
    fetchCurrentRates();
  }, []);

  // Fetch rent estimate when location changes
  useEffect(() => {
    async function fetchRentEstimate() {
      if (!location) return;

      setLoadingRentEstimate(true);
      try {
        // Extract ZIP code from location if possible, or use the full location
        const response = await rentcastApi.getRentEstimate({
          address: location,
          bedrooms: 2, // Default assumption for market estimate
        });

        if (response.success && response.data) {
          setRentEstimate(response.data);
          // Auto-populate rent from RentCast data only when no deal is loaded
          // (when a deal is loaded, the saved monthlyRent takes precedence)
          if (response.data.estimatedRent && !currentDealId) {
            setAvgMonthlyRent(Math.round(response.data.estimatedRent));
          }
        }

        // Also fetch comparables
        const compsResponse = await rentcastApi.getComparables({
          address: location,
          bedrooms: 2,
          compCount: 10,
        });

        if (compsResponse.success && compsResponse.data) {
          setComparables(compsResponse.data);
        }
      } catch (error) {
        console.error('Error fetching RentCast data:', error);
      } finally {
        setLoadingRentEstimate(false);
      }
    }

    fetchRentEstimate();
  }, [location]); // Only re-fetch when location changes

  // Weighted average rent from unit mix; auto-syncs to avgMonthlyRent when unit mix is set
  const weightedAvgRentFromMix = useMemo(() => {
    if (unitMix.length === 0) return null;
    const totalUnitsInMix = unitMix.reduce((sum, u) => sum + u.count, 0);
    if (totalUnitsInMix === 0) return null;
    return Math.round(unitMix.reduce((sum, u) => sum + u.count * u.askingRent, 0) / totalUnitsInMix);
  }, [unitMix]);

  useEffect(() => {
    if (weightedAvgRentFromMix !== null) {
      setAvgMonthlyRent(weightedAvgRentFromMix);
    }
  }, [weightedAvgRentFromMix]);

  // Load deal from URL query parameter
  useEffect(() => {
    const dealIdParam = searchParams.get('dealId');
    if (dealIdParam) {
      const dealId = parseInt(dealIdParam, 10);
      if (!isNaN(dealId)) {
        setCurrentDealId(dealId);
        const status = getPipelineStatus(dealId);
        setPipelineStatusState(status);
        // Populate from localStorage first (no API dependency)
        const execRecord = getDealExecution(dealId);
        if (execRecord) {
          if (execRecord.dealName) setDealName(execRecord.dealName);
          if (execRecord.location) setLocation(execRecord.location);
          if (execRecord.totalUnits) setTotalUnits(execRecord.totalUnits);
          if (execRecord.purchasePrice) setPurchasePrice(execRecord.purchasePrice);
        }
        // Repair: status past Analyzing but no record → create minimal record
        if (status !== 'Analyzing') {
          repairExecutionRecord(
            dealId,
            execRecord?.dealName || '',
            execRecord?.location || '',
            execRecord?.purchasePrice || 0,
            execRecord?.totalUnits || 0,
          );
        }
        // Also try the API for additional fields — silently ignore failures
        tryLoadDealFromApi(dealId);
      }
    }
  }, [searchParams]);

  /**
   * If a deal's pipeline status is past Analyzing but no execution record exists
   * (data inconsistency), create a minimal record so Deal Execution page can open.
   */
  const repairExecutionRecord = (dealId: number, name: string, loc: string, price: number, units: number) => {
    if (!getDealExecution(dealId)) {
      saveDealExecution({
        dealId,
        dealName: name || 'Untitled Deal',
        propertyAddress: loc,
        location: loc,
        totalUnits: units,
        purchasePrice: price,
        createdAt: new Date().toISOString(),
        documents: [],
      } as DealExecutionRecord);
    }
  };

  /** Restore all form state from a Deal object (shared by sidebar select and API load). */
  const applyDealToState = (deal: Deal) => {
    if (deal.dealName) setDealName(deal.dealName);
    if (deal.status) setDealStatus(deal.status);
    if (deal.location) setLocation(deal.location);
    if (deal.purchasePrice) setPurchasePrice(deal.purchasePrice);
    if (deal.closingCosts) setClosingCosts(deal.closingCosts);
    if (deal.monthlyRent) setAvgMonthlyRent(deal.monthlyRent);
    if (deal.loanInterestRate) setInterestRate(deal.loanInterestRate / 100);
    if (deal.loanTermYears) setLoanTermYears(deal.loanTermYears);
    if (deal.underwritingJson) {
      try {
        const uw = JSON.parse(deal.underwritingJson);
        if (uw.totalUnits) setTotalUnits(uw.totalUnits);
        if (uw.ltv != null) setLtv(uw.ltv);
        if (uw.vacancyRate != null) setVacancyRate(uw.vacancyRate);
        if (uw.badDebtRate != null) setBadDebtRate(uw.badDebtRate);
        if (uw.operatingExpenseRatio != null) setOperatingExpenseRatio(uw.operatingExpenseRatio);
        if (uw.exitCapRate) setExitCapRate(uw.exitCapRate);
        if (uw.holdingPeriod) setHoldingPeriod(uw.holdingPeriod);
        if (uw.constructionCostPct) setConstructionCostPct(uw.constructionCostPct);
        if (uw.constructionCost) setConstructionCost(uw.constructionCost);
        if (uw.closingCostsPct != null) setClosingCostsPct(uw.closingCostsPct);
        if (uw.county) setCounty(uw.county);
        if (uw.zipCode) setZipCode(uw.zipCode);
        if (uw.yearBuilt) setYearBuilt(uw.yearBuilt);
        if (uw.buildingType) setBuildingType(uw.buildingType);
        if (uw.numberOfBuildings) setNumberOfBuildings(uw.numberOfBuildings);
        if (uw.amiTarget) setAmiTarget(uw.amiTarget);
        if (uw.gpPartner) setGpPartner(uw.gpPartner);
        // Restore OM-extracted data
        if (uw.unitMix && Array.isArray(uw.unitMix)) setUnitMix(uw.unitMix);
        if (uw.omOperatingExpenses) setOmOperatingExpenses(uw.omOperatingExpenses);
        if (uw.omLaundryIncome != null) setOmLaundryIncome(uw.omLaundryIncome);
        if (uw.omRentStabilized != null) setOmRentStabilized(uw.omRentStabilized);
        if (uw.omAnnualRentGrowthCap != null) setOmAnnualRentGrowthCap(uw.omAnnualRentGrowthCap);
        if (uw.rentGrowthRate != null) setRentGrowthRate(uw.rentGrowthRate);
        if (uw.marketAnalysisDemographics) setMarketAnalysisDemographics(uw.marketAnalysisDemographics);
        if (uw.marketAnalysisStats) setMarketAnalysisStats(uw.marketAnalysisStats);
      } catch { /* ignore malformed JSON */ }
    }
  };

  /**
   * Best-effort API load — populates extra form fields if backend is available.
   * Never resets currentDealId on failure.
   */
  const tryLoadDealFromApi = async (dealId: number) => {
    try {
      const deal = await dealApi.getDeal(dealId);
      applyDealToState(deal);
    } catch {
      // Backend unavailable — form fields already set from localStorage or Deal object
    }
  };

  /**
   * Handle deal selection from sidebar
   */
  const handleSelectDeal = (deal: Deal) => {
    if (!deal.id) return;
    setCurrentDealId(deal.id);
    const status = getPipelineStatus(deal.id);
    setPipelineStatusState(status);
    // Restore all saved assumptions from the Deal object (includes underwritingJson blob)
    applyDealToState(deal);
    // Also pull totalUnits from the execution record as a fallback
    const execRecord = getDealExecution(deal.id);
    if (execRecord?.totalUnits) setTotalUnits(execRecord.totalUnits);
    // Repair: if status is past Analyzing but no execution record exists, create one
    if (status !== 'Analyzing') {
      repairExecutionRecord(
        deal.id,
        deal.dealName || '',
        deal.location || '',
        deal.purchasePrice || 0,
        execRecord?.totalUnits || 0,
      );
    }
  };

  // Create deal from imported property data and load it
  const handleImportCreateDeal = async (data: any) => {
    try {
      // Directly populate the form fields from extracted data
      if (data.propertyName) {
        setDealName(data.propertyName);
      } else if (data.address) {
        setDealName(`Deal - ${data.address}`);
      }

      if (data.city && data.state) {
        setLocation(`${data.city}, ${data.state}`);
      } else if (data.city) {
        setLocation(data.city);
      } else if (data.address) {
        setLocation(data.address);
      }

      // Populate new geographic fields
      if (data.county) {
        setCounty(data.county);
      }

      if (data.zipCode) {
        setZipCode(data.zipCode);
      }

      if (data.yearBuilt) {
        setYearBuilt(data.yearBuilt);
      }

      if (data.propertyType) {
        // Try to map property type to building type
        const typeMap: { [key: string]: string } = {
          'Garden': 'Garden Style',
          'Mid-Rise': 'Mid-Rise',
          'High-Rise': 'High-Rise',
          'Townhome': 'Townhome',
          'Mixed Use': 'Mixed Use'
        };
        const mappedType = Object.keys(typeMap).find(key =>
          data.propertyType.toLowerCase().includes(key.toLowerCase())
        );
        if (mappedType) {
          setBuildingType(typeMap[mappedType]);
        }
      }

      if (data.numberOfBuildings) {
        setNumberOfBuildings(data.numberOfBuildings);
      }

      if (data.askingPrice) {
        setPurchasePrice(data.askingPrice);
      }

      if (data.numUnits) {
        setTotalUnits(data.numUnits);
      }

      if (data.estimatedRent) {
        setAvgMonthlyRent(data.estimatedRent);
      }

      if (data.capRate) {
        setExitCapRate(data.capRate / 100); // Convert percentage to decimal
      }

      // Map extracted property data to Deal create shape
      const createPayload: Partial<Deal> = {
        dealName: data.propertyName || `Deal - ${data.address || data.city || 'Imported'}`,
        location: data.city && data.state ? `${data.city}, ${data.state}` : data.city || data.state || data.address || '',
        status: 'potential',
        propertyAddress: data.address,
        latitude: data.latitude,
        longitude: data.longitude,
        purchasePrice: data.askingPrice || undefined,
        monthlyRent: data.estimatedRent || undefined,
        bedrooms: data.bedrooms,
        bathrooms: data.bathrooms,
        squareFootage: data.buildingSizeSf,
        yearBuilt: data.yearBuilt,
        propertyType: data.propertyType,
        capRate: data.capRate
      };

      const created = await dealApi.createDeal(createPayload);
      if (created && created.id) {
        setCurrentDealId(created.id);
        // Persist deal ID in URL so page refresh doesn't lose context
        const url = new URL(window.location.href);
        url.searchParams.set('dealId', String(created.id));
        window.history.replaceState({}, '', url.toString());
      }
    } catch (err) {
      console.error('Error creating deal from imported property:', err);
      alert('Failed to create deal from imported property');
    }
  };

  /**
   * Handle Offering Memorandum PDF upload — extracts unit mix and rents via Claude document API
   */
  const handleOmUpload = async (file: File) => {
    setOmUploading(true);
    setOmError(null);
    try {
      const data = await scrapingApi.extractOmFromPdf(file);
      console.log('[OM extraction result]', JSON.stringify(data, null, 2));

      // Populate form fields from OM data
      if (data.propertyName) setDealName(data.propertyName);
      if (data.numUnits) setTotalUnits(data.numUnits);
      if (data.askingPrice) setPurchasePrice(data.askingPrice);
      if (data.city && data.state) setLocation(`${data.city}, ${data.state}`);
      if (data.zipcode) setZipCode(data.zipcode);

      // Populate OM-specific state (single source of truth for Excel export)
      if (data.unitMix && data.unitMix.length > 0) {
        setUnitMix(data.unitMix);
        // Derive weighted-average monthly rent so export validation passes
        const totalUnitsInMix = data.unitMix.reduce((sum, u) => sum + u.count, 0);
        if (totalUnitsInMix > 0) {
          const weightedRent = data.unitMix.reduce((sum, u) => sum + u.askingRent * u.count, 0) / totalUnitsInMix;
          setAvgMonthlyRent(Math.round(weightedRent));
        }
      }
      if (data.laundryIncome != null) setOmLaundryIncome(data.laundryIncome);
      if (data.operatingExpenses != null) setOmOperatingExpenses(data.operatingExpenses);
      if (data.rentStabilized != null) setOmRentStabilized(data.rentStabilized);
      if (data.annualRentGrowthCap != null) setOmAnnualRentGrowthCap(data.annualRentGrowthCap);

      // Create a deal record if one isn't loaded — required for Excel export
      if (!currentDealId) {
        const dealLocation = data.city && data.state
          ? `${data.city}, ${data.state}`
          : data.address || 'Location TBD';
        const created = await dealApi.createDeal({
          dealName: data.propertyName || `Deal - ${data.address || dealLocation || 'OM Import'}`,
          location: dealLocation,
          status: 'potential',
          propertyAddress: data.address || undefined,
          purchasePrice: data.askingPrice || undefined,
        });
        if (created && created.id) {
          setCurrentDealId(created.id);
          // Persist deal ID in URL so page refresh doesn't lose context
          const url = new URL(window.location.href);
          url.searchParams.set('dealId', String(created.id));
          window.history.replaceState({}, '', url.toString());
        }
      }
    } catch (err) {
      setOmError(err instanceof Error ? err.message : 'Failed to extract data from OM');
    } finally {
      setOmUploading(false);
    }
  };

  /**
   * Save current deal
   */
  const handleSaveDeal = async () => {
    setSaving(true);
    try {
      // Auto-create deal record if one doesn't exist yet (e.g. after OM upload or fresh page)
      let dealId = currentDealId;
      if (!dealId) {
        const created = await dealApi.createDeal({
          dealName,
          location: location || 'Location TBD',
          status: dealStatus,
        });
        if (!created || !created.id) {
          alert('Failed to create deal record. Is the backend running?');
          return;
        }
        dealId = created.id;
        setCurrentDealId(dealId);
        const url = new URL(window.location.href);
        url.searchParams.set('dealId', String(dealId));
        window.history.replaceState({}, '', url.toString());
      }

      await dealApi.updateDeal(dealId, {
        dealName,
        status: dealStatus,
        location,
        purchasePrice,
        closingCosts,
        monthlyRent: avgMonthlyRent,
        loanInterestRate: interestRate * 100,
        loanTermYears,
        // Computed metrics
        monthlyPayment: Math.abs(metrics.annualDebtService / 12),
        irr: metrics.irr,
        equityMultiple: metrics.totalReturn,
        // All multifamily-specific assumptions — restored on page refresh
        underwritingJson: JSON.stringify({
          totalUnits,
          ltv,
          vacancyRate,
          badDebtRate,
          operatingExpenseRatio,
          exitCapRate,
          holdingPeriod,
          constructionCostPct,
          constructionCost,
          closingCostsPct,
          county,
          zipCode,
          yearBuilt,
          buildingType,
          numberOfBuildings,
          amiTarget,
          gpPartner,
          // OM-extracted data — persisted so export is correct after page refresh
          unitMix,
          omOperatingExpenses: omOperatingExpenses ?? undefined,
          omLaundryIncome: omLaundryIncome ?? undefined,
          omRentStabilized: omRentStabilized ?? undefined,
          omAnnualRentGrowthCap: omAnnualRentGrowthCap ?? undefined,
          rentGrowthRate,
          marketAnalysisDemographics: marketAnalysisDemographics ?? undefined,
          marketAnalysisStats: marketAnalysisStats ?? undefined,
        }),
      });

      alert('Deal saved successfully!');
    } catch (error) {
      console.error('Error saving deal:', error);
      alert('Failed to save deal');
    } finally {
      setSaving(false);
    }
  };

  /**
   * Export deal to Excel (Multifamily Underwriting Model)
   */
  const handleToggleMarketAnalysis = async () => {
    if (marketAnalysisOpen) {
      setMarketAnalysisOpen(false);
      return;
    }
    setMarketAnalysisOpen(true);
    if (marketAnalysisDemographics || marketAnalysisLoading) return;
    const zip = zipCode.trim();
    if (!zip || zip.length !== 5) return;
    setMarketAnalysisLoading(true);
    setMarketAnalysisError(null);
    try {
      const [demoResp, statsResp] = await Promise.all([
        censusApi.getDemographics(zip),
        rentcastApi.getMarketStats(zip),
      ]);
      if (demoResp.success && demoResp.data) {
        setMarketAnalysisDemographics(demoResp.data);
      } else {
        setMarketAnalysisError(demoResp.error || 'Failed to fetch demographics');
      }
      if (statsResp.success && statsResp.data) {
        setMarketAnalysisStats(statsResp.data);
      }
    } catch {
      setMarketAnalysisError('Failed to fetch market data');
    } finally {
      setMarketAnalysisLoading(false);
    }
  };

  const handleExportExcel = async () => {
    if (!currentDealId) {
      alert('No deal loaded. Please load a deal first.');
      return;
    }

    // Validate required fields
    const validationErrors: string[] = [];
    if (!dealName) validationErrors.push('Deal Name is required');
    if (!location) validationErrors.push('Location is required');
    if (!county) validationErrors.push('County is required');
    if (!zipCode) validationErrors.push('ZIP Code is required');
    if (totalUnits <= 0) validationErrors.push('Total Units must be greater than 0');
    if (purchasePrice <= 0) validationErrors.push('Purchase Price must be greater than 0');
    if (avgMonthlyRent <= 0) validationErrors.push('Average Monthly Rent must be greater than 0');

    if (validationErrors.length > 0) {
      alert('Please fix the following errors before exporting:\n\n' + validationErrors.join('\n'));
      return;
    }

    setExporting(true);
    try {
      // Build comprehensive multifamily underwriting data
      const underwritingData = {
        propertyName: dealName,
        address: location,
        city: location.split(',')[0]?.trim() || '',
        county: county,
        state: location.split(',')[1]?.trim() || 'CA',
        zipCode: zipCode,
        yearBuilt: yearBuilt,
        buildingType: buildingType,
        numberOfBuildings: numberOfBuildings,
        parkingSpaces: Math.round(totalUnits * 1.5), // Estimate 1.5 spaces per unit

        purchasePrice: purchasePrice,
        acquisitionDate: new Date().toISOString(),
        earnestMoneyPct: 0.02,
        constructionCostPct: constructionCostPct / 100,
        closingCostsPct: closingCostsPct / 100,
        dueDiligenceCosts: 50000,

        // Use OM-extracted unit mix if available, otherwise generate from totals
        unitMix: unitMix.length > 0 ? unitMix : [
          {
            unitType: '1BR/1BA',
            count: Math.floor(totalUnits * 0.3),
            avgSf: 650,
            currentRent: avgMonthlyRent * 0.85,
            marketRent: avgMonthlyRent,
            renovationCostPerUnit: 8000
          },
          {
            unitType: '2BR/2BA',
            count: Math.floor(totalUnits * 0.5),
            avgSf: 900,
            currentRent: avgMonthlyRent,
            marketRent: avgMonthlyRent * 1.15,
            renovationCostPerUnit: 10000
          },
          {
            unitType: '3BR/2BA',
            count: Math.floor(totalUnits * 0.2),
            avgSf: 1100,
            currentRent: avgMonthlyRent * 1.2,
            marketRent: avgMonthlyRent * 1.4,
            renovationCostPerUnit: 12000
          }
        ],

        physicalOccupancy: 0.95,
        economicOccupancy: 0.90,
        vacancyRate: vacancyRate,
        badDebtRate: badDebtRate,
        vacancyLossAnnual: totalUnits * avgMonthlyRent * 12 * vacancyRate,
        concessionsAnnual: 20000,
        badDebtAnnual: totalUnits * avgMonthlyRent * 12 * badDebtRate,
        laundryIncome: omLaundryIncome ?? 0,
        rentStabilized: omRentStabilized ?? false,
        annualRentGrowthCap: omAnnualRentGrowthCap ?? undefined,

        otherIncome: {
          laundryPerUnit: 15,
          petRentPerUnit: 25,
          parkingPerSpace: 30,
          otherPerUnit: 10
        },

        operatingExpenses: {
          // Use OM-extracted annual figures when available; fall back to per-unit estimates
          propertyTaxAnnual: omOperatingExpenses?.propertyTaxAnnual ?? purchasePrice * 0.011,
          insuranceAnnual: omOperatingExpenses?.insuranceAnnual ?? totalUnits * 600,
          utilitiesAnnual: omOperatingExpenses?.utilitiesAnnual ?? (totalUnits * 145 * 12),
          repairsMaintenanceAnnual: omOperatingExpenses?.repairsMaintenanceAnnual ?? totalUnits * 500,
          managementFeePct: omOperatingExpenses?.managementFeePct ?? 0.04,
          payroll: totalUnits * 350,
          marketing: totalUnits * 100,
          legalProfessional: 25000,
          administrative: totalUnits * 150
        },

        renovationBudget: {
          commonAreaExterior: constructionCost || 100000,
          contingencyPct: 0.10
        },

        operatingProjections: {
          marketRentGrowth: 0.02,
          inplaceRentGrowth: 0.025,
          otherIncomeGrowth: 0.03,
          opexGrowth: 0.03,
          stabilizedVacancy: 0.05,
          capexPerUnitAnnual: 400
        },

        financing: {
          loanType: 'Agency Fixed',
          ltv: ltv / 100,
          interestRate: interestRate,
          amortizationYears: 30,
          loanTermYears: loanTermYears,
          originationFeePct: 0.01,
          lenderLegalDd: 25000
        },

        equityRequired: metrics.equityRequired,  // cost-basis equity → overrides D25 so IRR matches on-screen
        entryCapRate: metrics.entryCapRate,  // actual in-place cap rate (NOI / purchase price) → D19
        aequitasEquityPct: 0.5,  // Aequitas equity share of the deal → D46

        exitAssumptions: {
          holdPeriodYears: holdingPeriod,
          exitCapRate: exitCapRate,
          saleCostsPct: 0.04
        },

        propertyTax: {
          countyTaxRate: 0.011,
          prop13Cap: 0.02,
          specialAssessments: 0
        }
      };

      await dealApi.exportMultifamilyToExcel(currentDealId, underwritingData);
    } catch (error) {
      console.error('Error exporting to Excel:', error);
      alert('Failed to export to Excel');
    } finally {
      setExporting(false);
    }
  };

  // CALCULATIONS (Memoized for performance)
  const metrics = useMemo(() => {
    const totalProjectCost = purchasePrice + constructionCost + closingCosts;
    const loanAmount = totalProjectCost * (ltv / 100);
    const equityRequired = totalProjectCost - loanAmount;
    const annualDebtService = calculatePMT(interestRate / 12, loanTermYears * 12, loanAmount) * 12 * -1;

    const baseGPR = totalUnits * avgMonthlyRent * 12;
    const year1VacancyLoss = baseGPR * vacancyRate;
    const year1BadDebtLoss = baseGPR * badDebtRate;
    const year1EGI = baseGPR - year1VacancyLoss - year1BadDebtLoss;
    const year1OpEx = year1EGI * operatingExpenseRatio;
    const netOperatingIncome = year1EGI - year1OpEx;
    const entryCapRate = purchasePrice > 0 ? netOperatingIncome / purchasePrice : 0;

    let validExitCapRate = exitCapRate;
    if (exitCapRate <= 0 || exitCapRate > 1) validExitCapRate = 0.06;

    // Remaining loan balance after holdingPeriod years
    const monthlyRate = interestRate / 12;
    const totalPayments = loanTermYears * 12;
    const paymentsMade = holdingPeriod * 12;
    let loanBalance = loanAmount;
    if (paymentsMade < totalPayments && monthlyRate > 0) {
      loanBalance = loanAmount *
        ((Math.pow(1 + monthlyRate, totalPayments) - Math.pow(1 + monthlyRate, paymentsMade)) /
         (Math.pow(1 + monthlyRate, totalPayments) - 1));
    } else if (paymentsMade >= totalPayments) {
      loanBalance = 0;
    }

    // Build year-by-year table
    const yearlyData: YearRow[] = [];
    const irrStream: number[] = [-equityRequired];
    const annualCashFlows: number[] = [];

    // Year 0 — acquisition (equity out, no operating income)
    yearlyData.push({
      year: 0, label: 'Year 0',
      gpr: 0, vacancyLoss: 0, badDebtLoss: 0, egi: 0, opex: 0, noi: 0,
      debtService: 0, cfbt: -equityRequired, saleProceeds: 0,
      isAcquisition: true, isExit: false,
    });

    let lastNOI = netOperatingIncome;
    for (let year = 1; year <= holdingPeriod; year++) {
      const gpr = baseGPR * Math.pow(1 + rentGrowthRate, year - 1);
      const vLoss = gpr * vacancyRate;
      const bdLoss = gpr * badDebtRate;
      const egi = gpr - vLoss - bdLoss;
      const opex = egi * operatingExpenseRatio;
      const noi = egi - opex;
      const cfbt = noi - annualDebtService;
      lastNOI = noi;
      annualCashFlows.push(cfbt);
      irrStream.push(cfbt);
      yearlyData.push({
        year, label: `Year ${year}`,
        gpr, vacancyLoss: vLoss, badDebtLoss: bdLoss, egi, opex, noi,
        debtService: annualDebtService, cfbt, saleProceeds: 0,
        isAcquisition: false, isExit: false,
      });
    }

    // Exit row — sale reversion
    const exitNOI = lastNOI * (1 + rentGrowthRate);
    const salePrice = exitNOI / validExitCapRate;
    const saleProceeds = salePrice - loanBalance;
    irrStream[irrStream.length - 1] += saleProceeds;

    yearlyData.push({
      year: holdingPeriod + 1, label: 'Exit',
      gpr: 0, vacancyLoss: 0, badDebtLoss: 0, egi: 0, opex: 0, noi: exitNOI,
      debtService: 0, cfbt: 0, saleProceeds,
      isAcquisition: false, isExit: true,
    });

    const irr = calculateIRR(irrStream) * 100;
    const totalCashReturned = irrStream.slice(1).reduce((a, b) => a + b, 0);
    const totalReturn = totalCashReturned / equityRequired;

    return {
      totalProjectCost,
      loanAmount,
      equityRequired,
      netOperatingIncome,
      entryCapRate,
      annualDebtService,
      annualCashFlows,
      salePrice,
      irr,
      totalReturn,
      yearlyData,
    };
  }, [purchasePrice, constructionCost, closingCosts, totalUnits, avgMonthlyRent, operatingExpenseRatio, interestRate, loanTermYears, ltv, exitCapRate, holdingPeriod, vacancyRate, badDebtRate, rentGrowthRate]);

  // --- Data Room modal handlers ---
  const createDealExecutionRecord = (docs: Omit<DealDocument, 'id' | 'uploadedAt'>[]) => {
    if (!currentDealId) return;
    const documents: DealDocument[] = docs.map(d => ({
      ...d,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      uploadedAt: new Date().toISOString(),
    }));
    saveDealExecution({
      dealId: currentDealId,
      dealName,
      propertyAddress: location,
      location,
      totalUnits,
      purchasePrice,
      createdAt: new Date().toISOString(),
      documents,
    });
    setPipelineStatus(currentDealId, 'Data Room Received');
    setPipelineStatusState('Data Room Received');
  };

  const handleDataRoomConfirm = (docs: Omit<DealDocument, 'id' | 'uploadedAt'>[]) => {
    createDealExecutionRecord(docs);
    setShowDataRoomModal(false);
  };

  const handleDataRoomSkip = () => {
    createDealExecutionRecord([]);
    setShowDataRoomModal(false);
  };

  // --- LOI modal handlers ---
  const advanceToLoiExecuted = (loiData: LoiExtractedData, fileName?: string) => {
    if (!currentDealId) return;
    patchDealExecution(currentDealId, { loiData, loiDocumentName: fileName, loiExecutedAt: new Date().toISOString() });
    setPipelineStatus(currentDealId, 'LOI Executed');
    setPipelineStatusState('LOI Executed');
  };

  const handleLoiConfirm = (loiData: LoiExtractedData, fileName?: string) => {
    advanceToLoiExecuted(loiData, fileName);
    setShowLoiModal(false);
  };

  const handleLoiSkip = () => {
    advanceToLoiExecuted({});
    setShowLoiModal(false);
  };

  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gray-50 min-h-screen">
<div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-800">Deal Underwriting</h1>
          <p className="text-sm text-gray-500 mt-1">
            Analyze projected returns and export financial models
            {currentDealId && <span className="ml-2 text-blue-600 font-medium">• Deal #{currentDealId} loaded</span>}
          </p>
        </div>
  <div className="flex gap-2 flex-wrap">
          {/* Stage-transition button: Data Room Received */}
          {currentDealId && pipelineStatus === 'Analyzing' && (
            <button
              onClick={() => setShowDataRoomModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 rounded-lg font-medium text-sm transition-colors"
            >
              <Upload size={16} />
              Data Room Received
            </button>
          )}
          {/* Stage-transition button: LOI Executed */}
          {currentDealId && pipelineStatus === 'Data Room Received' && (
            <button
              onClick={() => setShowLoiModal(true)}
              className="flex items-center gap-2 px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg font-medium text-sm transition-colors"
            >
              <FileText size={16} />
              LOI Executed
            </button>
          )}
          {/* Link to Deal Execution page once a record exists */}
          {currentDealId && pipelineStatus !== 'Analyzing' && (
            <Link
              to={`/deal-execution/${currentDealId}`}
              className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg font-medium text-sm transition-colors"
            >
              <TrendingUp size={16} />
              Deal Execution →
            </Link>
          )}
          <button
            onClick={handleSaveDeal}
            disabled={!currentDealId || saving}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Deal'}
          </button>
          <button
            onClick={handleExportExcel}
            disabled={!currentDealId || exporting}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download size={16} />
            {exporting ? 'Exporting...' : 'Export Excel Model'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Deals Sidebar */}
        <div className="lg:col-span-1">
          <DealsListSidebar
            onSelectDeal={handleSelectDeal}
            activeDealId={currentDealId ?? undefined}
          />
        </div>

        {/* Main Content - now takes 3 columns */}
        <div className="lg:col-span-3 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Deal Parameters */}
        <div className="bg-white rounded-xl p-6 shadow-sm lg:col-span-1">
          <div className="flex items-center gap-2 mb-4">
            <FileText size={20} color="#3b82f6" />
            <h3 className="text-lg font-semibold text-gray-800">Deal Parameters</h3>
          </div>

          {/* LOI locked banner */}
          {isUnderwritingLocked && (
            <div className="flex items-center gap-2 px-3 py-2 mb-4 bg-purple-50 border border-purple-200 rounded-lg">
              <FileText size={14} className="text-purple-600 flex-shrink-0" />
              <p className="text-xs font-medium text-purple-800">LOI executed — underwriting locked.</p>
            </div>
          )}

          <div className={`space-y-5 ${isUnderwritingLocked ? 'pointer-events-none opacity-60' : ''}`}>

            {/* ── OM Upload — prominent hero zone ── */}
            <div>
              {/* Idle: large dashed upload target */}
              {!omUploading && unitMix.length === 0 && (
                <label className={`flex flex-col items-center justify-center gap-3 w-full min-h-[148px] border-2 border-dashed rounded-xl transition-colors cursor-pointer px-4 py-7 text-center border-blue-300 bg-blue-50 hover:bg-blue-100 hover:border-blue-400 ${omUploading ? 'pointer-events-none' : ''}`}>
                  <Upload size={36} className="text-blue-400" />
                  <div>
                    <p className="text-sm font-semibold text-blue-700">Upload Offering Memorandum (PDF)</p>
                    <p className="text-xs text-blue-500 mt-1">Drop file here or click to browse · max 20 MB</p>
                  </div>
                  <input
                    type="file"
                    accept=".pdf"
                    className="hidden"
                    disabled={omUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        if (file.size > 20 * 1024 * 1024) { setOmError('File must be under 20MB'); return; }
                        handleOmUpload(file);
                        e.target.value = '';
                      }
                    }}
                  />
                </label>
              )}

              {/* Loading state */}
              {omUploading && (
                <div className="flex flex-col items-center justify-center gap-3 w-full min-h-[148px] border-2 border-dashed border-blue-300 rounded-xl bg-blue-50 px-4 py-7 text-center">
                  <Loader2 size={36} className="text-blue-500 animate-spin" />
                  <div>
                    <p className="text-sm font-semibold text-blue-700">Analyzing OM…</p>
                    <p className="text-xs text-blue-500 mt-1">This may take 20–30 seconds</p>
                  </div>
                </div>
              )}

              {/* Success state */}
              {!omUploading && unitMix.length > 0 && (
                <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                  <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-green-800">OM Parsed Successfully</p>
                    <p className="text-xs text-green-700 mt-0.5 truncate">{dealName}</p>
                    <p className="text-xs text-green-600 mt-0.5">
                      {totalUnits} total units
                      {unitMix.map(u => ` · ${u.count}×${u.unitType}`).join('')}
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setUnitMix([]);
                      setOmLaundryIncome(null);
                      setOmOperatingExpenses(null);
                      setOmRentStabilized(null);
                      setOmAnnualRentGrowthCap(null);
                    }}
                    className="text-xs text-green-600 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
                  >
                    Clear
                  </button>
                </div>
              )}

              {omError && <p className="text-xs text-red-600 mt-2">{omError}</p>}
            </div>

            {/* ── OR divider + Link to URL ── */}
            {!omUploading && (
              <div className="flex flex-col items-center gap-2">
                <div className="flex items-center gap-3 w-full">
                  <div className="flex-1 border-t border-gray-200" />
                  <span className="text-xs text-gray-400 font-medium">OR</span>
                  <div className="flex-1 border-t border-gray-200" />
                </div>
                <button
                  onClick={() => setIsImportModalOpen(true)}
                  className="w-full px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-700 transition-colors"
                >
                  Link to URL
                </button>
                <p className="text-xs text-gray-400 italic">
                  ⚠ Only works with an active rents API key
                </p>
              </div>
            )}

            {/* ── Unit Mix table (shown after parse) ── */}
            {unitMix.length > 0 && (
              <div className="border border-gray-200 rounded-lg overflow-hidden text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-2 py-1.5 text-gray-500 font-medium">Type</th>
                      <th className="text-right px-2 py-1.5 text-gray-500 font-medium">Units</th>
                      <th className="text-right px-2 py-1.5 text-gray-500 font-medium">Rent/mo ($)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {unitMix.map((row, idx) => (
                      <tr key={idx} className="border-t border-gray-100">
                        <td className="px-2 py-1.5 text-gray-700">{row.unitType}</td>
                        <td className="px-2 py-1.5 text-right text-gray-700">{row.count}</td>
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            value={row.askingRent}
                            onChange={(e) => {
                              const updated = [...unitMix];
                              updated[idx] = { ...updated[idx], askingRent: Number(e.target.value) || 0 };
                              setUnitMix(updated);
                            }}
                            className="w-full px-1.5 py-0.5 bg-blue-50 border border-blue-200 rounded text-right text-gray-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {weightedAvgRentFromMix !== null && (
                  <div className="bg-gray-50 border-t border-gray-200 px-2 py-1.5 flex justify-between">
                    <span className="text-gray-500 font-medium">Weighted avg</span>
                    <span className="text-blue-600 font-semibold">${weightedAvgRentFromMix.toLocaleString()}/mo</span>
                  </div>
                )}
              </div>
            )}

            {/* ── Essential fields ── */}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Deal Name</label>
              <input
                type="text"
                value={dealName}
                onChange={(e) => setDealName(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
                placeholder="City, State"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Purchase Price ($)</label>
              <input
                type="number"
                value={purchasePrice}
                onChange={(e) => {
                  const price = Number(e.target.value) || 0;
                  setPurchasePrice(price);
                  setConstructionCost(price * (constructionCostPct / 100));
                  setClosingCosts(price * (closingCostsPct / 100));
                }}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Total Units</label>
              <input
                type="number"
                value={totalUnits}
                onChange={(e) => setTotalUnits(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>

            {/* ── Advanced Settings (collapsed) ── */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="w-full flex items-center justify-between px-3 py-2.5 bg-gray-50 text-xs font-medium text-gray-600 hover:bg-gray-100 transition-colors"
              >
                Advanced Settings
                {showAdvanced ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </button>
              {showAdvanced && (
                <div className="p-3 space-y-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Deal Status</label>
                    <div className="relative">
                      <select
                        value={dealStatus}
                        onChange={(e) => setDealStatus(e.target.value as DealStatus)}
                        className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white appearance-none cursor-pointer"
                      >
                        {Object.entries(DEAL_STATUS_LABELS).map(([value, label]) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">County</label>
                      <input type="text" value={county} onChange={(e) => setCounty(e.target.value)} placeholder="e.g., Fresno County" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">ZIP Code</label>
                      <input type="text" value={zipCode} onChange={(e) => setZipCode(e.target.value)} placeholder="e.g., 93704" maxLength={10} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Year Built</label>
                      <input type="number" value={yearBuilt} onChange={(e) => setYearBuilt(Number(e.target.value) || 1900)} min="1800" max={new Date().getFullYear()} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1.5">Buildings</label>
                      <input type="number" value={numberOfBuildings} onChange={(e) => setNumberOfBuildings(Number(e.target.value) || 1)} min="1" className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Building Type</label>
                    <select value={buildingType} onChange={(e) => setBuildingType(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white">
                      <option>Garden Style</option><option>Mid-Rise</option><option>High-Rise</option><option>Townhome</option><option>Mixed Use</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Construction Cost % <span className="text-gray-400">(Default: 10%)</span></label>
                    <input type="number" step="0.1" value={constructionCostPct} onChange={(e) => { const pct = Number(e.target.value) || 0; setConstructionCostPct(pct); setConstructionCost(purchasePrice * (pct / 100)); }} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Construction Cost ($) <span className="text-gray-400 italic">– Auto-calculated</span></label>
                    <input type="number" value={constructionCost} onChange={(e) => setConstructionCost(Number(e.target.value) || 0)} className="w-full px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Closing Costs % <span className="text-gray-400">(Default: 3%)</span></label>
                    <input type="number" step="0.1" value={closingCostsPct} onChange={(e) => { const pct = Number(e.target.value) || 0; setClosingCostsPct(pct); setClosingCosts(purchasePrice * (pct / 100)); }} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Closing Costs ($) <span className="text-gray-400 italic">– Auto-calculated</span></label>
                    <input type="number" value={closingCosts} onChange={(e) => setClosingCosts(Number(e.target.value) || 0)} className="w-full px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-gray-600">Average Monthly Rent ($)</label>
                      {rentEstimate && !loadingRentEstimate && rentEstimate.estimatedRent && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-green-600 font-medium flex items-center gap-1"><TrendingUp size={12} />RentCast: ${Math.round(rentEstimate.estimatedRent).toLocaleString()}</span>
                          <button onClick={() => setAvgMonthlyRent(Math.round(rentEstimate.estimatedRent!))} className="text-xs text-blue-600 hover:text-blue-700 font-medium underline">Use</button>
                          {comparables.length > 0 && <button onClick={() => setShowComparables(!showComparables)} className="text-xs text-blue-600 hover:text-blue-700 font-medium underline">{showComparables ? 'Hide' : 'View'} Comps</button>}
                        </div>
                      )}
                    </div>
                    <input type="number" value={avgMonthlyRent} onChange={(e) => setAvgMonthlyRent(Number(e.target.value) || 0)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                    {loadingRentEstimate && <p className="text-xs text-gray-400 mt-1">Loading market estimate...</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Operating Expense Ratio (%)</label>
                    <input type="number" value={operatingExpenseRatio * 100} onChange={(e) => setOperatingExpenseRatio((Number(e.target.value) || 0) / 100)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Vacancy Rate (%)</label>
                    <input type="number" step="0.1" value={vacancyRate * 100} onChange={(e) => setVacancyRate((Number(e.target.value) || 0) / 100)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Bad Debt / Loss to Lease (%)</label>
                    <input type="number" step="0.1" value={badDebtRate * 100} onChange={(e) => setBadDebtRate((Number(e.target.value) || 0) / 100)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-medium text-gray-600">Interest Rate (%)</label>
                      {currentMortgageRate && !loadingRates && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-green-600 font-medium flex items-center gap-1"><TrendingUp size={12} />Market: {currentMortgageRate.toFixed(2)}%</span>
                          <button onClick={() => setInterestRate(currentMortgageRate / 100)} className="text-xs text-blue-600 hover:text-blue-700 font-medium underline">Use</button>
                        </div>
                      )}
                    </div>
                    <input type="number" step="0.1" value={interestRate * 100} onChange={(e) => setInterestRate((Number(e.target.value) || 0) / 100)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                    {currentMortgageRate && !loadingRates && <p className="text-xs text-gray-500 mt-1">30-yr mortgage: {currentMortgageRate.toFixed(2)}% (FRED) · Updated {new Date(rateLastUpdated).toLocaleDateString()}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">LTV Ratio (%)</label>
                    <input type="range" min="50" max="90" step="1" value={ltv} onChange={(e) => setLtv(Number(e.target.value))} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600" />
                    <div className="text-center text-sm font-bold text-blue-600 mt-1">{ltv}%</div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Loan Term (Years)</label>
                    <input type="number" value={loanTermYears} onChange={(e) => setLoanTermYears(Number(e.target.value) || 0)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Exit Cap Rate (%)</label>
                    <input type="number" step="0.1" value={exitCapRate * 100} onChange={(e) => setExitCapRate((Number(e.target.value) || 0) / 100)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Annual Rent Growth (%)</label>
                    <input type="number" step="0.1" value={rentGrowthRate * 100} onChange={(e) => setRentGrowthRate((Number(e.target.value) || 0) / 100)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">Holding Period (Years)</label>
                    <input type="number" value={holdingPeriod} onChange={(e) => setHoldingPeriod(Number(e.target.value) || 0)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">AMI Target</label>
                    <div className="relative">
                      <select value={amiTarget} onChange={(e) => setAmiTarget(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white appearance-none cursor-pointer">
                        {amiOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1.5">GP Partner</label>
                    <div className="relative">
                      <select value={gpPartner} onChange={(e) => setGpPartner(e.target.value)} className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white appearance-none cursor-pointer">
                        {gpPartners.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                      <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* ── Export Excel — full-width CTA at bottom ── */}
            <button
              onClick={handleExportExcel}
              disabled={unitMix.length === 0 || !currentDealId || exporting}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-semibold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed bg-green-600 hover:bg-green-700 text-white"
            >
              <Download size={16} />
              {exporting ? 'Exporting…' : 'Export to Excel'}
            </button>

          </div>
        </div>

        {/* Rental Comparables Section */}
        {showComparables && comparables.length > 0 && (
          <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">
                Rental Comparables
                <span className="text-sm font-normal text-gray-500 ml-2">
                  ({comparables.length} properties)
                </span>
              </h3>
              <button
                onClick={() => setShowComparables(false)}
                className="text-sm text-gray-500 hover:text-gray-700"
              >
                Close
              </button>
            </div>

            <div className="space-y-3">
              {comparables.slice(0, 8).map((comp, index) => (
                <div
                  key={index}
                  className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900">{comp.address}</p>
                      <p className="text-xs text-gray-500 mt-1">
                        {comp.bedrooms && `${comp.bedrooms} bed`}
                        {comp.bathrooms && ` • ${comp.bathrooms} bath`}
                        {comp.squareFootage && ` • ${comp.squareFootage.toLocaleString()} sqft`}
                        {comp.distanceMiles && ` • ${comp.distanceMiles.toFixed(2)} mi away`}
                      </p>
                    </div>
                    <div className="text-right">
                      {comp.listedRent && (
                        <>
                          <p className="text-lg font-bold text-blue-600">
                            ${comp.listedRent.toLocaleString()}/mo
                          </p>
                          {comp.pricePerSqft && (
                            <p className="text-xs text-gray-500">
                              ${comp.pricePerSqft.toFixed(2)}/sqft
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {comparables.length > 8 && (
              <p className="text-xs text-gray-500 mt-4 text-center">
                Showing 8 of {comparables.length} comparables
              </p>
            )}
          </div>
        )}

        {/* Right Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Metrics Row - 5 Columns */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <span className="block text-xs text-gray-500 mb-1">Total Units</span>
              <span className="block text-xl font-bold text-gray-800">{totalUnits}</span>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <span className="block text-xs text-gray-500 mb-1">Total Project Cost</span>
              <span className="block text-xl font-bold text-gray-800">${(metrics.totalProjectCost / 1000000).toFixed(1)}M</span>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <span className="block text-xs text-gray-500 mb-1">Entry Cap Rate</span>
              <span className="block text-xl font-bold text-gray-800">{(metrics.entryCapRate * 100).toFixed(2)}%</span>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <span className="block text-xs text-gray-500 mb-1">10-Year IRR</span>
              <span className={`block text-xl font-bold ${
                isNaN(metrics.irr) || !isFinite(metrics.irr)
                  ? 'text-red-600'
                  : metrics.irr > 0
                    ? 'text-green-600'
                    : 'text-orange-600'
              }`}>
                {isNaN(metrics.irr) || !isFinite(metrics.irr)
                  ? 'Error'
                  : `${metrics.irr.toFixed(2)}%`}
              </span>
              {(isNaN(metrics.irr) || !isFinite(metrics.irr)) && (
                <p className="text-xs text-red-600 mt-1">Check exit cap rate</p>
              )}
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <span className="block text-xs text-gray-500 mb-1">Equity Multiple</span>
              <span className="block text-xl font-bold text-green-600">{metrics.totalReturn.toFixed(2)}x</span>
            </div>
          </div>

          {/* Cash Flow Table — tabbed NOI Waterfall / Levered CF */}
          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            {/* Tab bar */}
            <div className="flex border-b border-gray-200">
              <button
                onClick={() => setCashFlowTab('noi')}
                className={`px-5 py-3 text-sm font-medium transition-colors ${cashFlowTab === 'noi' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                NOI Waterfall
              </button>
              <button
                onClick={() => setCashFlowTab('levered')}
                className={`px-5 py-3 text-sm font-medium transition-colors ${cashFlowTab === 'levered' ? 'border-b-2 border-blue-500 text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}
              >
                Levered Cash Flow
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-200">
                    <th className="sticky left-0 z-10 bg-gray-50 px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide min-w-[180px]">
                      Line Item
                    </th>
                    {metrics.yearlyData.map((row) => (
                      <th key={row.label} className={`px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide whitespace-nowrap min-w-[100px] ${row.isExit ? 'text-purple-600 bg-purple-50' : row.isAcquisition ? 'text-orange-600 bg-orange-50' : 'text-gray-500'}`}>
                        {row.label}
                      </th>
                    ))}
                  </tr>
                </thead>

                {cashFlowTab === 'noi' ? (
                  <tbody className="divide-y divide-gray-100">
                    {/* Gross Potential Rent */}
                    <tr className="hover:bg-gray-50">
                      <td className="sticky left-0 z-10 bg-white hover:bg-gray-50 px-4 py-2.5 text-xs font-medium text-gray-700">Gross Potential Rent</td>
                      {metrics.yearlyData.map((row) => (
                        <td key={row.label} className="px-4 py-2.5 text-right text-xs text-gray-700 font-mono">
                          {row.isAcquisition || row.isExit ? '—' : fmtDollar(row.gpr)}
                        </td>
                      ))}
                    </tr>
                    {/* Vacancy Loss */}
                    <tr className="hover:bg-gray-50">
                      <td className="sticky left-0 z-10 bg-white hover:bg-gray-50 px-4 py-2.5 text-xs text-gray-500 pl-7">(–) Vacancy Loss</td>
                      {metrics.yearlyData.map((row) => (
                        <td key={row.label} className="px-4 py-2.5 text-right text-xs text-red-500 font-mono">
                          {row.isAcquisition || row.isExit ? '—' : row.vacancyLoss === 0 ? '—' : `($${Math.round(row.vacancyLoss).toLocaleString('en-US')})`}
                        </td>
                      ))}
                    </tr>
                    {/* Bad Debt */}
                    <tr className="hover:bg-gray-50">
                      <td className="sticky left-0 z-10 bg-white hover:bg-gray-50 px-4 py-2.5 text-xs text-gray-500 pl-7">(–) Bad Debt</td>
                      {metrics.yearlyData.map((row) => (
                        <td key={row.label} className="px-4 py-2.5 text-right text-xs text-red-500 font-mono">
                          {row.isAcquisition || row.isExit ? '—' : row.badDebtLoss === 0 ? '—' : `($${Math.round(row.badDebtLoss).toLocaleString('en-US')})`}
                        </td>
                      ))}
                    </tr>
                    {/* EGI */}
                    <tr className="bg-blue-50/40 hover:bg-blue-50">
                      <td className="sticky left-0 z-10 bg-blue-50/40 hover:bg-blue-50 px-4 py-2.5 text-xs font-semibold text-gray-700">= Effective Gross Income</td>
                      {metrics.yearlyData.map((row) => (
                        <td key={row.label} className="px-4 py-2.5 text-right text-xs font-semibold text-gray-700 font-mono">
                          {row.isAcquisition || row.isExit ? '—' : fmtDollar(row.egi)}
                        </td>
                      ))}
                    </tr>
                    {/* OpEx */}
                    <tr className="hover:bg-gray-50">
                      <td className="sticky left-0 z-10 bg-white hover:bg-gray-50 px-4 py-2.5 text-xs text-gray-500 pl-7">(–) Operating Expenses</td>
                      {metrics.yearlyData.map((row) => (
                        <td key={row.label} className="px-4 py-2.5 text-right text-xs text-red-500 font-mono">
                          {row.isAcquisition || row.isExit ? '—' : `($${Math.round(row.opex).toLocaleString('en-US')})`}
                        </td>
                      ))}
                    </tr>
                    {/* NOI */}
                    <tr className="bg-green-50 border-t-2 border-green-200">
                      <td className="sticky left-0 z-10 bg-green-50 px-4 py-3 text-xs font-bold text-green-800">= NOI</td>
                      {metrics.yearlyData.map((row) => (
                        <td key={row.label} className={`px-4 py-3 text-right text-xs font-bold font-mono ${row.isExit ? 'text-purple-700' : 'text-green-700'}`}>
                          {row.isAcquisition ? '—' : fmtDollar(row.noi)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                ) : (
                  <tbody className="divide-y divide-gray-100">
                    {/* Equity Investment (Year 0 only) */}
                    <tr className="hover:bg-gray-50">
                      <td className="sticky left-0 z-10 bg-white hover:bg-gray-50 px-4 py-2.5 text-xs font-medium text-gray-700">Equity Investment</td>
                      {metrics.yearlyData.map((row) => (
                        <td key={row.label} className="px-4 py-2.5 text-right text-xs font-mono text-red-500">
                          {row.isAcquisition ? `($${Math.round(metrics.equityRequired).toLocaleString('en-US')})` : '—'}
                        </td>
                      ))}
                    </tr>
                    {/* NOI */}
                    <tr className="hover:bg-gray-50">
                      <td className="sticky left-0 z-10 bg-white hover:bg-gray-50 px-4 py-2.5 text-xs font-medium text-gray-700">NOI</td>
                      {metrics.yearlyData.map((row) => (
                        <td key={row.label} className="px-4 py-2.5 text-right text-xs text-gray-700 font-mono">
                          {row.isAcquisition ? '—' : fmtDollar(row.noi)}
                        </td>
                      ))}
                    </tr>
                    {/* Debt Service */}
                    <tr className="hover:bg-gray-50">
                      <td className="sticky left-0 z-10 bg-white hover:bg-gray-50 px-4 py-2.5 text-xs text-gray-500 pl-7">(–) Debt Service</td>
                      {metrics.yearlyData.map((row) => (
                        <td key={row.label} className="px-4 py-2.5 text-right text-xs text-red-500 font-mono">
                          {row.isAcquisition || row.isExit ? '—' : `($${Math.round(row.debtService).toLocaleString('en-US')})`}
                        </td>
                      ))}
                    </tr>
                    {/* CFBT */}
                    <tr className="bg-blue-50/40 hover:bg-blue-50">
                      <td className="sticky left-0 z-10 bg-blue-50/40 hover:bg-blue-50 px-4 py-2.5 text-xs font-semibold text-gray-700">= CFBT</td>
                      {metrics.yearlyData.map((row) => (
                        <td key={row.label} className={`px-4 py-2.5 text-right text-xs font-semibold font-mono ${row.isAcquisition ? 'text-red-600' : row.cfbt < 0 ? 'text-orange-600' : 'text-gray-700'}`}>
                          {row.isAcquisition || row.isExit ? '—' : fmtDollar(row.cfbt)}
                        </td>
                      ))}
                    </tr>
                    {/* Sale Proceeds */}
                    <tr className="hover:bg-gray-50">
                      <td className="sticky left-0 z-10 bg-white hover:bg-gray-50 px-4 py-2.5 text-xs text-gray-500 pl-7">+ Sale Proceeds (net)</td>
                      {metrics.yearlyData.map((row) => (
                        <td key={row.label} className="px-4 py-2.5 text-right text-xs text-purple-600 font-mono font-medium">
                          {row.isExit ? fmtDollar(row.saleProceeds) : '—'}
                        </td>
                      ))}
                    </tr>
                    {/* Net Cash Flow */}
                    <tr className="bg-green-50 border-t-2 border-green-200">
                      <td className="sticky left-0 z-10 bg-green-50 px-4 py-3 text-xs font-bold text-green-800">= Net Cash Flow</td>
                      {metrics.yearlyData.map((row) => (
                        <td key={row.label} className={`px-4 py-3 text-right text-xs font-bold font-mono ${
                          row.isAcquisition ? 'text-red-600'
                          : row.isExit ? 'text-purple-700'
                          : row.cfbt < 0 ? 'text-orange-600'
                          : 'text-green-700'
                        }`}>
                          {row.isAcquisition
                            ? `($${Math.round(metrics.equityRequired).toLocaleString('en-US')})`
                            : row.isExit
                              ? fmtDollar(row.saleProceeds)
                              : fmtDollar(row.cfbt)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                )}
              </table>
            </div>

            {/* IRR + Equity Multiple footer */}
            <div className="flex gap-6 px-6 py-4 bg-gray-50 border-t border-gray-200">
              <div>
                <span className="text-xs text-gray-500">IRR</span>
                <span className={`block text-lg font-bold ${isNaN(metrics.irr) || !isFinite(metrics.irr) ? 'text-red-600' : metrics.irr > 0 ? 'text-green-600' : 'text-orange-600'}`}>
                  {isNaN(metrics.irr) || !isFinite(metrics.irr) ? 'Error' : `${metrics.irr.toFixed(2)}%`}
                </span>
              </div>
              <div>
                <span className="text-xs text-gray-500">Equity Multiple</span>
                <span className="block text-lg font-bold text-green-600">{metrics.totalReturn.toFixed(2)}x</span>
              </div>
              <div>
                <span className="text-xs text-gray-500">Rent Growth / yr</span>
                <span className="block text-lg font-bold text-gray-700">{(rentGrowthRate * 100).toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-xs text-gray-500">Exit Cap Rate</span>
                <span className="block text-lg font-bold text-gray-700">{(exitCapRate * 100).toFixed(1)}%</span>
              </div>
            </div>
          </div>

          {/* Market Analysis Panel */}
          <MarketAnalysisPanelBlock
            isOpen={marketAnalysisOpen}
            loading={marketAnalysisLoading}
            error={marketAnalysisError}
            demographics={marketAnalysisDemographics}
            marketStats={marketAnalysisStats}
            zipCode={zipCode}
            cityName={location}
            onToggle={handleToggleMarketAnalysis}
          />

        </div>
        </div>
      </div>

      {/* Data Room Received Modal */}
      {showDataRoomModal && (
        <DataRoomModal
          dealName={dealName}
          onConfirm={handleDataRoomConfirm}
          onSkip={handleDataRoomSkip}
          onClose={() => setShowDataRoomModal(false)}
        />
      )}

      {/* LOI Executed Modal */}
      {showLoiModal && (
        <LoiModal
          dealName={dealName}
          onConfirm={handleLoiConfirm}
          onSkip={handleLoiSkip}
          onClose={() => setShowLoiModal(false)}
        />
      )}

      {/* Import Property Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="relative w-full max-w-2xl p-6 bg-white rounded-lg shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Link Property URL</h2>
              <button
                onClick={() => setIsImportModalOpen(false)}
                className="p-1 text-gray-400 hover:text-gray-600"
                aria-label="Close import modal"
              >
                ✕
              </button>
            </div>

            <PropertyUrlInput
              onDataExtracted={async (data) => {
                await handleImportCreateDeal(data);
                setIsImportModalOpen(false);
              }}
              onError={(err) => console.warn('Import error:', err)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Underwriting;
