import { useState, useMemo, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { FileText, Download, ChevronDown, TrendingUp, Save, Upload, Loader2, CheckCircle, ChevronUp } from 'lucide-react';
import { fredApi } from '../services/fredApi';
import { rentcastApi } from '../services/rentcastApi';
import { censusApi } from '../services/censusApi';
import { dealApi } from '../services/dealApi';
import type { RentalComparable, MarketStatistics } from '../types/rentcast';
import type { DemographicData } from '../types/census';
import type { Deal, DealStatus } from '../types/deal';
import { getPipelineStatus, setPipelineStatus } from '../types/deal';
import type { PipelineStatus } from '../types/deal';
import DealsListSidebar from '../components/DealsListSidebar';
import PropertyUrlInput from '../components/PropertyUrlInput';
import DataRoomModal from '../components/DataRoomModal';
import LoiModal from '../components/LoiModal';
import { saveDealExecution, patchDealExecution, getDealExecution, type DealExecutionRecord } from '../types/dealExecution';
import type { DealDocument, LoiExtractedData } from '../types/dealExecution';
import { scrapingApi } from '../services/scrapingApi';
import * as sourcingApi from '../services/sourcingApi';
import ClimateCheckUpload, { ClimateScoreSummary } from '../components/ClimateCheckUpload';
import ExtractionReviewModal from '../components/ExtractionReviewModal';
import { mergeExtractions, MERGED_REVIEW_FIELDS } from '../utils/extractionMerge';

type UnitMixRow = { unitType: string; count: number; askingRent: number; avgSf: number };
type FeeItem = { id: string; description: string; amount: number };

// OM_REVIEW_FIELDS / RENT_ROLL_REVIEW_FIELDS / MERGED_REVIEW_FIELDS live in ../utils/extractionMerge

const GP_PARTNERS_FALLBACK = ['Aequitas Housing'];

const amiOptions = [
  '30% AMI - $24,000/year',
  '50% AMI - $40,000/year',
  '60% AMI - $48,000/year',
  '80% AMI - $64,000/year',
];

// ── Market Analysis Panel ─────────────────────────────────────────────────────

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
          <TrendingUp size={18} className="text-primary-800" />
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
          {error && !loading && <p className="text-sm text-red-500 py-4">{error}</p>}
          {!loading && !error && demographics && (
            <div className="space-y-4 pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs text-gray-500">Population</p>
                  <p className="text-sm font-bold text-gray-900">{demographics.population.total_population.toLocaleString()}</p>
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
                    {marketStats.avgRent2bed != null && (
                      <div className="p-3 bg-indigo-50 rounded-lg">
                        <p className="text-xs text-gray-500">2 Bed</p>
                        <p className="text-sm font-bold text-indigo-900">{fmt(marketStats.avgRent2bed)}</p>
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

function addressMatch(a: string, b: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const na = norm(a);
  const nb = norm(b);
  if (!na || !nb) return false;
  if (na.includes(nb) || nb.includes(na)) return true;
  const ta = new Set(na.split(' '));
  const tb = nb.split(' ');
  const shared = tb.filter(t => t.length > 2 && ta.has(t)).length;
  return shared >= 2;
}

// ── Input helpers ─────────────────────────────────────────────────────────────

const pctInput = (
  val: number,
  onChange: (v: number) => void,
  step = 0.1,
  extraClass = '',
) => (
  <input
    type="number"
    step={step}
    value={parseFloat((val * 100).toFixed(4))}
    onChange={(e) => onChange((Number(e.target.value) || 0) / 100)}
    className={`w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white ${extraClass}`}
  />
);

const fmtCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

// ── Main component ────────────────────────────────────────────────────────────

const Underwriting = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  // navigation / modals
  const [currentDealId, setCurrentDealId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [legislationFetching, setLegislationFetching] = useState(false);
  const [legislationStatus, setLegislationStatus] = useState<'idle' | 'saved' | 'failed'>('idle');
  const [pipelineStatus, setPipelineStatusState] = useState<PipelineStatus>('Analyzing');
  const [showDataRoomModal, setShowDataRoomModal] = useState(false);
  const [showLoiModal, setShowLoiModal] = useState(false);
  // Raw extractions from the most recent OM / Rent Roll / T-12 upload for this deal. Kept
  // around (not nulled on confirm) so a later upload of another document type can still be
  // merged and diffed against it — this is what lets the review card stay accurate and
  // "the same card" no matter which document arrives first.
  const [omData, setOmData] = useState<any>(null);
  const [pendingOmFile, setPendingOmFile] = useState<File | null>(null);
  const [rentRollData, setRentRollData] = useState<any>(null);
  const [t12Data, setT12Data] = useState<any>(null);
  const [reviewOpen, setReviewOpen] = useState(false);

  const isUnderwritingLocked =
    pipelineStatus === 'LOI Executed' ||
    pipelineStatus === 'Under Contract' ||
    pipelineStatus === 'Closed' ||
    pipelineStatus === 'Exited';

  // deal info
  const [dealName, setDealName] = useState('New Development Project');
  const [dealStatus, setDealStatus] = useState<DealStatus>('potential');
  const [location, setLocation] = useState('Sacramento, CA');
  const [county, setCounty] = useState('Sacramento County');
  const [zipCode, setZipCode] = useState('95814');
  const [yearBuilt, setYearBuilt] = useState(1985);
  const [buildingType, setBuildingType] = useState('Garden Style');
  const [numberOfBuildings, setNumberOfBuildings] = useState(4);
  const [totalUnits, setTotalUnits] = useState(0);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [ttmNoi, setTtmNoi] = useState(0);
  const [acquisitionDate, setAcquisitionDate] = useState('');
  const [holdPeriodYears, setHoldPeriodYears] = useState(10);
  const [bridgePeriodMonths, setBridgePeriodMonths] = useState(36);
  const [entryCapRateInput, setEntryCapRateInput] = useState(0.0675);
  const [salesCostPct, setSalesCostPct] = useState(0.02);

  // total capitalization (Sources & Uses)
  const [closingCostPct, setClosingCostPct] = useState(0);
  const [acquisitionFeePct, setAcquisitionFeePct] = useState(0);
  const [workingCapitalPerUnit, setWorkingCapitalPerUnit] = useState(0);
  const [additionalFees, setAdditionalFees] = useState<FeeItem[]>([]);
  const [amiTarget, setAmiTarget] = useState('60% AMI - $48,000/year');
  const [gpPartner, setGpPartner] = useState('Aequitas Housing');
  const [gpPartners, setGpPartners] = useState<string[]>(GP_PARTNERS_FALLBACK);

  // uploads
  const [unitMix, setUnitMix] = useState<UnitMixRow[]>([]);
  const [omUploaded, setOmUploaded] = useState(false);
  const [rrUploaded, setRrUploaded] = useState(false);
  const [omUploading, setOmUploading] = useState(false);
  const [rrUploading, setRrUploading] = useState(false);
  const [omError, setOmError] = useState<string | null>(null);
  const [rrError, setRrError] = useState<string | null>(null);
  const [t12Uploading, setT12Uploading] = useState(false);
  const [t12Error, setT12Error] = useState<string | null>(null);
  const [t12Uploaded, setT12Uploaded] = useState(false);
  const [omLaundryIncome, setOmLaundryIncome] = useState<number | null>(null);
  const [omRentStabilized, setOmRentStabilized] = useState<boolean | null>(null);
  const [omAnnualRentGrowthCap, setOmAnnualRentGrowthCap] = useState<number | null>(null);

  // other income
  const [rubsPct, setRubsPct] = useState(0.675);
  const [parkingIncomePerUnit, setParkingIncomePerUnit] = useState(0);
  const [otherIncomePerUnit, setOtherIncomePerUnit] = useState(0);

  // income adjustments (5-year arrays, stored as decimals 0-1)
  const [vacancyRates, setVacancyRates] = useState([0.08, 0.07, 0.06, 0.06, 0.06]);
  const [lossToLeaseRates, setLossToLeaseRates] = useState([0.0125, 0.0125, 0.0125, 0.0125, 0.0125]);
  const [badDebtRates, setBadDebtRates] = useState([0.01, 0.01, 0.01, 0.01, 0.01]);
  const [concessionsRates, setConcessionsRates] = useState([0.02, 0.01, 0.01, 0.0, 0.0]);
  const [nonRevUnits, setNonRevUnits] = useState([0, 0, 0, 0, 0]);

  // opex ($/unit/yr)
  const [managementFeePct, setManagementFeePct] = useState(0.04);
  const [capReservePerUnit, setCapReservePerUnit] = useState(250);
  const [opexPayrollPerUnit, setOpexPayrollPerUnit] = useState(0);
  const [opexAdminPerUnit, setOpexAdminPerUnit] = useState(0);
  const [opexMarketingPerUnit, setOpexMarketingPerUnit] = useState(0);
  const [opexRmPerUnit, setOpexRmPerUnit] = useState(0);
  const [opexContractServicePerUnit, setOpexContractServicePerUnit] = useState(0);
  const [opexTurnoverPerUnit, setOpexTurnoverPerUnit] = useState(0);
  const [opexOtherPerUnit, setOpexOtherPerUnit] = useState(0);
  const [opexInsurancePerUnit, setOpexInsurancePerUnit] = useState(0);
  const [opexInsurancePerUnitConfirmed, setOpexInsurancePerUnitConfirmed] = useState(false);
  // Defaults to 0, not the suggested 5% — every deal (old and new) starts at "no growth"
  // until the user explicitly applies the suggestion in the UI (see the Insurance field below).
  const [insuranceGrowthRate, setInsuranceGrowthRate] = useState(0);
  const [opexUtilitiesPerUnit, setOpexUtilitiesPerUnit] = useState(0);
  const [opexPropertyTaxPerUnit, setOpexPropertyTaxPerUnit] = useState(0);

  // property tax
  const [assessedValue, setAssessedValue] = useState(0);
  const [assessedValueNextBuyer, setAssessedValueNextBuyer] = useState(0);
  const [assessmentPct, setAssessmentPct] = useState(1.0);
  const [millageRate, setMillageRate] = useState(0.01184);
  const [specialAssessments, setSpecialAssessments] = useState(0);
  // Property tax abatement (5-year array, decimals 0-1) — mirrors vacancyRates/etc. shape.
  // Defaults to all-zero (no abatement) for every deal; a "use typical schedule" suggestion
  // in the UI lets the user opt into 0%/1.5%/70%/90%/90% explicitly.
  const [abatementPctSchedule, setAbatementPctSchedule] = useState([0, 0, 0, 0, 0]);

  // senior loan
  const [seniorLtvPct, setSeniorLtvPct] = useState(0);
  const [seniorInterestRate, setSeniorInterestRate] = useState(0.065);
  const [seniorFinancingCostsPct, setSeniorFinancingCostsPct] = useState(0.01);
  const [seniorIoPeriods, setSeniorIoPeriods] = useState(0);

  // refi loan
  const [refiTermMonths, setRefiTermMonths] = useState(360);
  const [refiInterestRate, setRefiInterestRate] = useState(0.0625);
  const [refiFinancingCostsPct, setRefiFinancingCostsPct] = useState(0.01);
  const [refiIoPeriods, setRefiIoPeriods] = useState(0);
  const [refiTargetDscr, setRefiTargetDscr] = useState(1.25);
  const [refiTargetDy, setRefiTargetDy] = useState(0.09);
  const [refiTargetLtv, setRefiTargetLtv] = useState(0.65);

  // growth & exit
  const [rentGrowthRate, setRentGrowthRate] = useState(0.02);
  const [opexGrowthRate, setOpexGrowthRate] = useState(0.02);
  const [exitCapRate, setExitCapRate] = useState(0.0675);

  // waterfall
  const [lpEquityShare, setLpEquityShare] = useState(0.85);
  const [amFeePct, setAmFeePct] = useState(0.01);
  const [pariPassu, setPariPassu] = useState(0);
  const [preferredReturnPct, setPreferredReturnPct] = useState(0.08);
  const [gpPromotePct, setGpPromotePct] = useState(0.30);

  // FRED
  const [currentMortgageRate, setCurrentMortgageRate] = useState<number | null>(null);
  const [rateLastUpdated, setRateLastUpdated] = useState('');
  const [loadingRates, setLoadingRates] = useState(true);

  // RentCast comparables
  const [showComparables, setShowComparables] = useState(false);
  const [comparables, setComparables] = useState<RentalComparable[]>([]);

  // market analysis
  const [marketAnalysisOpen, setMarketAnalysisOpen] = useState(false);
  const [marketAnalysisLoading, setMarketAnalysisLoading] = useState(false);
  const [marketAnalysisDemographics, setMarketAnalysisDemographics] = useState<DemographicData | null>(null);
  const [marketAnalysisStats, setMarketAnalysisStats] = useState<MarketStatistics | null>(null);
  const [marketAnalysisError, setMarketAnalysisError] = useState<string | null>(null);

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    fetch('/api/v1/gps')
      .then(r => r.ok ? r.json() : null)
      .then((data: { id: number; name: string }[] | null) => {
        if (data && data.length > 0) {
          setGpPartners(data.map(g => g.name));
          setGpPartner(prev => data.some(g => g.name === prev) ? prev : data[0].name);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    async function fetchRates() {
      try {
        setLoadingRates(true);
        const response = await fredApi.getRates();
        if (response.success && response.data) {
          setCurrentMortgageRate(response.data.mortgage30Year);
          setRateLastUpdated(response.lastUpdated || new Date().toISOString());
        }
      } catch {
        // ignore
      } finally {
        setLoadingRates(false);
      }
    }
    fetchRates();
  }, []);

  useEffect(() => {
    async function fetchComps() {
      if (!location) return;
      try {
        const compsResponse = await rentcastApi.getComparables({ address: location, bedrooms: 2, compCount: 10 });
        if (compsResponse.success && compsResponse.data) setComparables(compsResponse.data);
      } catch { /* ignore */ }
    }
    fetchComps();
  }, [location]);

  useEffect(() => {
    const dealIdParam = searchParams.get('dealId');
    if (dealIdParam) {
      const dealId = parseInt(dealIdParam, 10);
      if (!isNaN(dealId)) {
        if (dealId !== currentDealId) {
          setOmData(null);
          setRentRollData(null);
          setT12Data(null);
          setPendingOmFile(null);
          setReviewOpen(false);
        }
        setCurrentDealId(dealId);
        const status = getPipelineStatus(dealId);
        setPipelineStatusState(status);
        const execRecord = getDealExecution(dealId);
        if (execRecord) {
          if (execRecord.dealName) setDealName(execRecord.dealName);
          if (execRecord.location) setLocation(execRecord.location);
          if (execRecord.totalUnits) setTotalUnits(execRecord.totalUnits);
          if (execRecord.purchasePrice) setPurchasePrice(execRecord.purchasePrice);
        }
        if (status !== 'Analyzing') {
          repairExecutionRecord(
            dealId,
            execRecord?.dealName || '',
            execRecord?.location || '',
            execRecord?.purchasePrice || 0,
            execRecord?.totalUnits || 0,
          );
        }
        tryLoadDealFromApi(dealId).then(deal => {
          if (deal && searchParams.get('reviewOm') === '1') {
            let uwTotalUnits = 0;
            try { uwTotalUnits = deal.underwritingJson ? (JSON.parse(deal.underwritingJson).totalUnits || 0) : 0; } catch { /* ignore */ }
            const [uwCity, uwState] = (deal.location || '').split(',').map(s => s.trim());
            setOmData({
              propertyName: deal.dealName || '',
              askingPrice: deal.purchasePrice || undefined,
              city: uwCity || '',
              state: uwState || '',
              numUnits: uwTotalUnits,
              unitMix: uwTotalUnits > 0 ? [{ unitType: 'All Units', count: uwTotalUnits, askingRent: 0, avgSf: 0 }] : [],
              closingCostPct,
              acquisitionFeePct,
              workingCapitalPerUnit,
              seniorLtvPct,
              seniorInterestRate,
              seniorIoPeriods,
              seniorFinancingCostsPct,
            });
            setPendingOmFile(null);
            setReviewOpen(true);
            setSearchParams(prev => {
              const next = new URLSearchParams(prev);
              next.delete('reviewOm');
              return next;
            }, { replace: true });
          }
        });
      }
    }
  }, [searchParams]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const weightedAvgRent = useMemo(() => {
    if (unitMix.length === 0) return null;
    const totalU = unitMix.reduce((s, u) => s + u.count, 0);
    if (totalU === 0) return null;
    return Math.round(unitMix.reduce((s, u) => s + u.askingRent * u.count, 0) / totalU);
  }, [unitMix]);

  const unitMixCount = useMemo(() => unitMix.reduce((s, u) => s + (u.count || 0), 0), [unitMix]);
  const additionalFeesTotal = useMemo(() => additionalFees.reduce((s, f) => s + (f.amount || 0), 0), [additionalFees]);

  const addAdditionalFee = () => {
    setAdditionalFees(prev => [...prev, { id: `${Date.now()}-${Math.random().toString(36).slice(2)}`, description: '', amount: 0 }]);
  };
  const updateAdditionalFee = (id: string, patch: Partial<Pick<FeeItem, 'description' | 'amount'>>) => {
    setAdditionalFees(prev => prev.map(f => (f.id === id ? { ...f, ...patch } : f)));
  };
  const removeAdditionalFee = (id: string) => {
    setAdditionalFees(prev => prev.filter(f => f.id !== id));
  };

  // ── Helpers ───────────────────────────────────────────────────────────────

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

  const applyDealToState = (deal: Deal) => {
    if (deal.dealName) setDealName(deal.dealName);
    if (deal.status) setDealStatus(deal.status);
    if (deal.location) setLocation(deal.location);
    if (deal.purchasePrice) setPurchasePrice(deal.purchasePrice);
    if (!deal.underwritingJson) return;
    try {
      const uw = JSON.parse(deal.underwritingJson);
      // Basic info
      if (uw.totalUnits) setTotalUnits(uw.totalUnits);
      if (uw.county) setCounty(uw.county);
      if (uw.zipCode) setZipCode(uw.zipCode);
      if (uw.yearBuilt) setYearBuilt(uw.yearBuilt);
      if (uw.buildingType) setBuildingType(uw.buildingType);
      if (uw.numberOfBuildings) setNumberOfBuildings(uw.numberOfBuildings);
      if (uw.amiTarget) setAmiTarget(uw.amiTarget);
      if (uw.gpPartner) setGpPartner(uw.gpPartner);
      if (uw.acquisitionDate !== undefined) setAcquisitionDate(uw.acquisitionDate);
      if (uw.ttmNoi != null) setTtmNoi(uw.ttmNoi);
      if (uw.purchasePrice != null) setPurchasePrice(uw.purchasePrice);
      if (uw.omLaundryIncome != null) setOmLaundryIncome(uw.omLaundryIncome);
      if (uw.omRentStabilized != null) setOmRentStabilized(uw.omRentStabilized);
      if (uw.omAnnualRentGrowthCap != null) setOmAnnualRentGrowthCap(uw.omAnnualRentGrowthCap);
      if (uw.marketAnalysisDemographics) { setMarketAnalysisDemographics(uw.marketAnalysisDemographics); setMarketAnalysisOpen(true); }
      if (uw.marketAnalysisStats) setMarketAnalysisStats(uw.marketAnalysisStats);

      // Unit mix
      if (uw.unitMix?.length > 0) {
        setUnitMix(uw.unitMix.map((u: any) => ({
          unitType: u.unitType ?? '',
          count: u.count ?? 0,
          askingRent: u.askingRent ?? 0,
          avgSf: u.avgSf ?? u.sqft ?? 0,
        })));
        setOmUploaded(true);
      }

      // Hold period
      const hp = uw.holdPeriodYears ?? uw.holdingPeriod;
      if (hp != null) setHoldPeriodYears(hp);

      // Bridge period
      const bp = uw.bridgePeriodMonths ?? uw.bridgeLoanTermMonths;
      if (bp != null) setBridgePeriodMonths(bp);

      // Entry cap
      if (uw.entryCapRateInput != null) {
        setEntryCapRateInput(uw.entryCapRateInput > 1 ? uw.entryCapRateInput / 100 : uw.entryCapRateInput);
      }
      if (uw.salesCostPct != null) setSalesCostPct(uw.salesCostPct > 1 ? uw.salesCostPct / 100 : uw.salesCostPct);

      // Total capitalization (old deals lack these — defaults from useState apply: 0%/$0/[])
      if (uw.closingCostPct != null) setClosingCostPct(uw.closingCostPct > 1 ? uw.closingCostPct / 100 : uw.closingCostPct);
      if (uw.acquisitionFeePct != null) setAcquisitionFeePct(uw.acquisitionFeePct > 1 ? uw.acquisitionFeePct / 100 : uw.acquisitionFeePct);
      if (uw.workingCapitalPerUnit != null) setWorkingCapitalPerUnit(uw.workingCapitalPerUnit);
      if (Array.isArray(uw.additionalFees)) {
        setAdditionalFees(uw.additionalFees.map((f: any) => ({
          id: f.id ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          description: f.description ?? '',
          amount: f.amount ?? 0,
        })));
      }

      // Growth / exit rates (old format could be decimal or %)
      const toDecimal = (v: number) => v > 1 ? v / 100 : v;
      if (uw.rentGrowthRate != null) setRentGrowthRate(toDecimal(uw.rentGrowthRate));
      if (uw.opexGrowthRate != null) setOpexGrowthRate(toDecimal(uw.opexGrowthRate));
      if (uw.exitCapRate != null) setExitCapRate(toDecimal(uw.exitCapRate));

      // 5-year arrays (new format) or scalar (old format)
      const toArr = (arr: number[], scalar: number | null | undefined) =>
        Array.isArray(arr) ? arr : (scalar != null ? [scalar, scalar, scalar, scalar, scalar] : null);

      const va = toArr(uw.vacancyRates, uw.vacancyRate != null ? toDecimal(uw.vacancyRate) : null);
      if (va) setVacancyRates(va);
      const la = toArr(uw.lossToLeaseRates, uw.lossToLeaseRate != null ? toDecimal(uw.lossToLeaseRate) : null);
      if (la) setLossToLeaseRates(la);
      const ba = toArr(uw.badDebtRates, uw.badDebtRate != null ? toDecimal(uw.badDebtRate) : null);
      if (ba) setBadDebtRates(ba);
      const ca = toArr(uw.concessionsRates, uw.concessionsRate != null ? toDecimal(uw.concessionsRate) : null);
      if (ca) setConcessionsRates(ca);
      const na = toArr(uw.nonRevUnits, uw.nonRevenueUnits);
      if (na) setNonRevUnits(na);

      // Opex
      const mfp = uw.managementFeePct ?? uw.omOperatingExpenses?.managementFeePct;
      if (mfp != null) setManagementFeePct(mfp > 1 ? mfp / 100 : mfp);
      if (uw.capReservePerUnit != null) setCapReservePerUnit(uw.capReservePerUnit);
      else if (uw.capexPerUnit != null) setCapReservePerUnit(uw.capexPerUnit);
      if (uw.opexPayrollPerUnit != null) setOpexPayrollPerUnit(uw.opexPayrollPerUnit);
      if (uw.opexAdminPerUnit != null) setOpexAdminPerUnit(uw.opexAdminPerUnit);
      if (uw.opexMarketingPerUnit != null) setOpexMarketingPerUnit(uw.opexMarketingPerUnit);
      if (uw.opexRmPerUnit != null) setOpexRmPerUnit(uw.opexRmPerUnit);
      if (uw.opexContractServicePerUnit != null) setOpexContractServicePerUnit(uw.opexContractServicePerUnit);
      if (uw.opexTurnoverPerUnit != null) setOpexTurnoverPerUnit(uw.opexTurnoverPerUnit);
      if (uw.opexOtherPerUnit != null) setOpexOtherPerUnit(uw.opexOtherPerUnit);
      if (uw.opexInsurancePerUnit != null) setOpexInsurancePerUnit(uw.opexInsurancePerUnit);
      if (uw.opexInsurancePerUnitConfirmed != null) setOpexInsurancePerUnitConfirmed(!!uw.opexInsurancePerUnitConfirmed);
      if (uw.insuranceGrowthRate != null) setInsuranceGrowthRate(toDecimal(uw.insuranceGrowthRate));
      if (uw.opexUtilitiesPerUnit != null) setOpexUtilitiesPerUnit(uw.opexUtilitiesPerUnit);
      if (uw.opexPropertyTaxPerUnit != null) setOpexPropertyTaxPerUnit(uw.opexPropertyTaxPerUnit);

      // Other income
      if (uw.rubsPct != null) setRubsPct(uw.rubsPct > 1 ? uw.rubsPct / 100 : uw.rubsPct);
      if (uw.parkingIncomePerUnit != null) setParkingIncomePerUnit(uw.parkingIncomePerUnit);
      if (uw.otherIncomePerUnit != null) setOtherIncomePerUnit(uw.otherIncomePerUnit);

      // Property tax
      if (uw.assessedValue != null) setAssessedValue(uw.assessedValue);
      if (uw.assessedValueNextBuyer != null) setAssessedValueNextBuyer(uw.assessedValueNextBuyer);
      if (uw.assessmentPct != null) setAssessmentPct(uw.assessmentPct);
      if (uw.millageRate != null) setMillageRate(uw.millageRate);
      if (uw.specialAssessments != null) setSpecialAssessments(uw.specialAssessments);
      if (Array.isArray(uw.abatementPctSchedule)) setAbatementPctSchedule(uw.abatementPctSchedule);

      // Senior loan — LTV replaces the old direct loan-amount input. Old deals only
      // have seniorLoanAmount ($) saved; derive the equivalent LTV from it so
      // re-exporting an old deal produces the same loan amount as before.
      if (uw.seniorLtvPct != null) {
        setSeniorLtvPct(uw.seniorLtvPct > 1 ? uw.seniorLtvPct / 100 : uw.seniorLtvPct);
      } else if (uw.seniorLoanAmount != null) {
        const pp = uw.purchasePrice ?? deal.purchasePrice ?? 0;
        if (pp > 0) setSeniorLtvPct(Math.min(1, Math.max(0, uw.seniorLoanAmount / pp)));
      }
      const sir = uw.seniorInterestRate ?? uw.interestRate;
      if (sir != null) setSeniorInterestRate(sir > 1 ? sir / 100 : sir);
      if (uw.seniorFinancingCostsPct != null) setSeniorFinancingCostsPct(uw.seniorFinancingCostsPct > 1 ? uw.seniorFinancingCostsPct / 100 : uw.seniorFinancingCostsPct);
      if (uw.seniorIoPeriods != null) setSeniorIoPeriods(uw.seniorIoPeriods);

      // Refi loan
      if (uw.refiTermMonths != null) setRefiTermMonths(uw.refiTermMonths);
      if (uw.refiInterestRate != null) setRefiInterestRate(uw.refiInterestRate > 1 ? uw.refiInterestRate / 100 : uw.refiInterestRate);
      if (uw.refiFinancingCostsPct != null) setRefiFinancingCostsPct(uw.refiFinancingCostsPct > 1 ? uw.refiFinancingCostsPct / 100 : uw.refiFinancingCostsPct);
      if (uw.refiIoPeriods != null) setRefiIoPeriods(uw.refiIoPeriods);
      if (uw.refiTargetDscr != null) setRefiTargetDscr(uw.refiTargetDscr);
      if (uw.refiTargetDy != null) setRefiTargetDy(uw.refiTargetDy > 1 ? uw.refiTargetDy / 100 : uw.refiTargetDy);
      const rtl = uw.refiTargetLtv ?? uw.refiLtv;
      if (rtl != null) setRefiTargetLtv(rtl > 1 ? rtl / 100 : rtl);

      // Waterfall
      if (uw.lpEquityShare != null) setLpEquityShare(uw.lpEquityShare > 1 ? uw.lpEquityShare / 100 : uw.lpEquityShare);
      if (uw.amFeePct != null) setAmFeePct(uw.amFeePct > 1 ? uw.amFeePct / 100 : uw.amFeePct);
      if (uw.pariPassu != null) setPariPassu(uw.pariPassu);
      if (uw.preferredReturnPct != null) setPreferredReturnPct(uw.preferredReturnPct > 1 ? uw.preferredReturnPct / 100 : uw.preferredReturnPct);
      const gpp = uw.gpPromotePct ?? uw.gpEquitySplitPct;
      if (gpp != null) setGpPromotePct(gpp > 1 ? gpp / 100 : gpp);

    } catch { /* ignore malformed JSON */ }
  };

  const tryLoadDealFromApi = async (dealId: number): Promise<Deal | null> => {
    try {
      const deal = await dealApi.getDeal(dealId);
      applyDealToState(deal);
      return deal;
    } catch { return null; /* backend unavailable */ }
  };

  const handleSelectDeal = (deal: Deal) => {
    if (!deal.id) return;
    // omData/rentRollData/t12Data deliberately survive a Confirm & Apply so a later upload
    // of another document type can still merge/diff against it (see applyMergedDataToForm).
    // Switching to a different deal must clear that cache — otherwise uploading an OM here
    // could silently merge against a stale Rent Roll/T-12 left over from whatever deal was open before.
    if (deal.id !== currentDealId) {
      setOmData(null);
      setRentRollData(null);
      setT12Data(null);
      setPendingOmFile(null);
      setReviewOpen(false);
    }
    setCurrentDealId(deal.id);
    const status = getPipelineStatus(deal.id);
    setPipelineStatusState(status);
    applyDealToState(deal);
    const execRecord = getDealExecution(deal.id);
    if (execRecord?.totalUnits) setTotalUnits(execRecord.totalUnits);
    if (status !== 'Analyzing') {
      repairExecutionRecord(deal.id, deal.dealName || '', deal.location || '', deal.purchasePrice || 0, execRecord?.totalUnits || 0);
    }
  };

  const handleImportCreateDeal = async (data: any) => {
    try {
      if (data.propertyName) setDealName(data.propertyName);
      else if (data.address) setDealName(`Deal - ${data.address}`);
      if (data.city && data.state) setLocation(`${data.city}, ${data.state}`);
      else if (data.city) setLocation(data.city);
      if (data.county) setCounty(data.county);
      if (data.zipCode) setZipCode(data.zipCode);
      if (data.yearBuilt) setYearBuilt(data.yearBuilt);
      if (data.numberOfBuildings) setNumberOfBuildings(data.numberOfBuildings);
      if (data.askingPrice) setPurchasePrice(data.askingPrice);
      if (data.numUnits) setTotalUnits(data.numUnits);
      const created = await dealApi.createDeal({
        dealName: data.propertyName || `Deal - ${data.address || data.city || 'Imported'}`,
        location: data.city && data.state ? `${data.city}, ${data.state}` : data.city || data.address || '',
        status: 'potential',
        propertyAddress: data.address,
        purchasePrice: data.askingPrice || undefined,
      });
      if (created?.id) {
        setCurrentDealId(created.id);
        const url = new URL(window.location.href);
        url.searchParams.set('dealId', String(created.id));
        window.history.replaceState({}, '', url.toString());
      }
    } catch (err) {
      console.error('Error creating deal from import:', err);
    }
  };

  // ── Upload handlers ───────────────────────────────────────────────────────

  // Applies (possibly user-edited) extracted OM data to the live underwriting form.
  // Only called after the user confirms the extraction review modal.
  // Applies the (possibly user-edited) merged OM + Rent Roll + T-12 data to the live
  // underwriting form. Precedence between the sources was already resolved
  // by mergeExtractions before this runs — this just writes whatever `data` says.
  const applyMergedDataToForm = async (data: any, sources: { hasOm: boolean; hasRentRoll: boolean; hasT12: boolean }, file: File | null) => {
    if (data.propertyName) setDealName(data.propertyName);
    if (data.unitMix?.length > 0) {
      setTotalUnits(data.unitMix.reduce((s: number, u: any) => s + (u.count ?? 0), 0));
    } else if (data.numUnits) {
      setTotalUnits(data.numUnits);
    }
    if (data.askingPrice) setPurchasePrice(data.askingPrice);
    if (data.city && data.state) setLocation(`${data.city}, ${data.state}`);
    if (data.zipcode) setZipCode(data.zipcode);
    if (data.ttmNoi != null) setTtmNoi(data.ttmNoi);

    if (data.unitMix?.length > 0) {
      setUnitMix(data.unitMix.map((u: any) => ({
        unitType: u.unitType ?? '',
        count: u.count ?? 0,
        askingRent: u.askingRent ?? 0,
        avgSf: u.avgSf ?? 0,
      })));
    }

    // Income adjustments
    if (data.vacancyRate != null) { const v = data.vacancyRate; setVacancyRates([v, v, v, v, v]); }
    if (data.badDebtRate != null) { const v = data.badDebtRate; setBadDebtRates([v, v, v, v, v]); }
    if (data.lossToLeaseRate != null) { const v = data.lossToLeaseRate; setLossToLeaseRates([v, v, v, v, v]); }
    if (data.concessionsRate != null) { const v = data.concessionsRate; setConcessionsRates([v, v, v, v, v]); }

    // Other income (rubsPct from OM is 0-100)
    if (data.rubsPct != null) setRubsPct(data.rubsPct / 100);
    if (data.parkingIncomePerUnit != null) setParkingIncomePerUnit(data.parkingIncomePerUnit);
    if (data.otherIncomePerUnit != null) setOtherIncomePerUnit(data.otherIncomePerUnit);

    // Opex per unit
    const unitCount = data.numUnits ?? (data.unitMix?.reduce((s: number, u: any) => s + (u.count ?? 0), 0) ?? 0);
    if (data.operatingExpenses && unitCount > 0) {
      const oe = data.operatingExpenses;
      if (oe.insuranceAnnual != null) {
        setOpexInsurancePerUnit(Math.round(oe.insuranceAnnual / unitCount));
        // Reviewing and confirming this modal IS the explicit confirmation step —
        // never applied silently before this point.
        setOpexInsurancePerUnitConfirmed(true);
      }
      if (oe.utilitiesAnnual != null) setOpexUtilitiesPerUnit(Math.round(oe.utilitiesAnnual / unitCount));
      if (oe.propertyTaxAnnual != null) setOpexPropertyTaxPerUnit(Math.round(oe.propertyTaxAnnual / unitCount));
      if (oe.repairsMaintenanceAnnual != null && data.opexRmPerUnit == null)
        setOpexRmPerUnit(Math.round(oe.repairsMaintenanceAnnual / unitCount));
      if (oe.managementFeePct != null) setManagementFeePct(oe.managementFeePct > 1 ? oe.managementFeePct / 100 : oe.managementFeePct);
    }
    if (data.opexPayrollPerUnit != null) setOpexPayrollPerUnit(data.opexPayrollPerUnit);
    if (data.opexAdminPerUnit != null) setOpexAdminPerUnit(data.opexAdminPerUnit);
    if (data.opexMarketingPerUnit != null) setOpexMarketingPerUnit(data.opexMarketingPerUnit);
    if (data.opexRmPerUnit != null) setOpexRmPerUnit(data.opexRmPerUnit);
    if (data.opexContractServicePerUnit != null) setOpexContractServicePerUnit(data.opexContractServicePerUnit);
    if (data.opexTurnoverPerUnit != null) setOpexTurnoverPerUnit(data.opexTurnoverPerUnit);
    if (data.capexPerUnit != null) setCapReservePerUnit(data.capexPerUnit);
    if (data.opexGrowthRate != null) setOpexGrowthRate(data.opexGrowthRate > 1 ? data.opexGrowthRate / 100 : data.opexGrowthRate);
    if (data.insuranceGrowthRate != null) setInsuranceGrowthRate(data.insuranceGrowthRate > 1 ? data.insuranceGrowthRate / 100 : data.insuranceGrowthRate);

    // Property tax / deal structure
    if (data.assessedValue != null) setAssessedValue(data.assessedValue);
    if (data.assessmentPct != null) setAssessmentPct(data.assessmentPct);
    if (data.bridgePeriodMonths != null) setBridgePeriodMonths(data.bridgePeriodMonths);
    if (data.lpEquityShare != null) setLpEquityShare(data.lpEquityShare > 1 ? data.lpEquityShare / 100 : data.lpEquityShare);

    // Property tax abatement schedule (asked manually in the review modal, not extracted)
    if ([data.abatementYear1, data.abatementYear2, data.abatementYear3, data.abatementYear4, data.abatementYear5]
      .some((v) => v != null)) {
      setAbatementPctSchedule([
        data.abatementYear1 ?? 0,
        data.abatementYear2 ?? 0,
        data.abatementYear3 ?? 0,
        data.abatementYear4 ?? 0,
        data.abatementYear5 ?? 0,
      ]);
    }

    // OM extras
    if (data.laundryIncome != null) setOmLaundryIncome(data.laundryIncome);
    if (data.rentStabilized != null) setOmRentStabilized(data.rentStabilized);
    if (data.annualRentGrowthCap != null) setOmAnnualRentGrowthCap(data.annualRentGrowthCap);

    // Deal costs (asked manually in the review modal, not extracted)
    if (data.closingCostPct != null) setClosingCostPct(data.closingCostPct);
    if (data.acquisitionFeePct != null) setAcquisitionFeePct(data.acquisitionFeePct);
    if (data.workingCapitalPerUnit != null) setWorkingCapitalPerUnit(data.workingCapitalPerUnit);

    // Senior loan (asked manually in the review modal, not extracted)
    if (data.seniorLtvPct != null) setSeniorLtvPct(data.seniorLtvPct);
    if (data.seniorInterestRate != null) setSeniorInterestRate(data.seniorInterestRate);
    if (data.seniorIoPeriods != null) setSeniorIoPeriods(data.seniorIoPeriods);
    if (data.seniorFinancingCostsPct != null) setSeniorFinancingCostsPct(data.seniorFinancingCostsPct);

    if (sources.hasOm) setOmUploaded(true);
    if (sources.hasRentRoll) setRrUploaded(true);
    if (sources.hasT12) setT12Uploaded(true);

    if (!sources.hasOm) return;

    // Create a deal record only if one doesn't exist yet (native direct-upload
    // path). If we already have a dealId — e.g. handed off from Sourcing — the
    // setters above already applied everything to form state; the user's own
    // "Save Deal" click persists it for real, so there's nothing to do here.
    let dealIdForUpload = currentDealId;
    if (!dealIdForUpload) {
      const dealLocation = data.city && data.state ? `${data.city}, ${data.state}` : data.address || 'Location TBD';
      const created = await dealApi.createDeal({
        dealName: data.propertyName || `Deal - ${data.address || dealLocation || 'OM Import'}`,
        location: dealLocation,
        status: 'potential',
        propertyAddress: data.address || undefined,
        purchasePrice: data.askingPrice || undefined,
      });
      if (created?.id) {
        dealIdForUpload = created.id;
        setCurrentDealId(created.id);
        const url = new URL(window.location.href);
        url.searchParams.set('dealId', String(created.id));
        window.history.replaceState({}, '', url.toString());
      }
    }
    if (file && dealIdForUpload) {
      const driveForm = new FormData();
      driveForm.append('file', file);
      driveForm.append('deal_id', String(dealIdForUpload));
      driveForm.append('document_type', 'OM');
      fetch('/api/v1/documents/upload', { method: 'POST', body: driveForm }).catch(() => {});
    }
  };

  const handleOmUpload = async (file: File) => {
    setOmUploading(true);
    setOmError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/v2/underwriting/extract-om', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Extraction failed');
      // Hand off to the review card instead of applying directly — user confirms/edits first.
      // Seed senior-loan and abatement-schedule fields with current form state (not
      // extracted) so the card opens pre-filled. insuranceGrowthRate is likewise
      // seeded rather than extracted — the AI extraction prompt doesn't ask for it.
      setOmData({
        ...json.data,
        closingCostPct,
        acquisitionFeePct,
        workingCapitalPerUnit,
        seniorLtvPct,
        seniorInterestRate,
        seniorIoPeriods,
        seniorFinancingCostsPct,
        insuranceGrowthRate,
        abatementYear1: abatementPctSchedule[0],
        abatementYear2: abatementPctSchedule[1],
        abatementYear3: abatementPctSchedule[2],
        abatementYear4: abatementPctSchedule[3],
        abatementYear5: abatementPctSchedule[4],
      });
      setPendingOmFile(file);
      setReviewOpen(true);
    } catch (err) {
      setOmError(err instanceof Error ? err.message : 'Failed to extract OM data');
    } finally {
      setOmUploading(false);
    }
  };

  const handleRentRollUpload = async (file: File) => {
    setRrUploading(true);
    setRrError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (currentDealId) formData.append('deal_id', String(currentDealId));
      const res = await fetch('/api/v2/underwriting/extract-rent-roll', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Extraction failed');
      // Same review card as OM uploads — hand off instead of applying directly.
      // Seed senior-loan fields with current form state (not extracted) so the card opens pre-filled.
      setRentRollData({
        ...json.data,
        closingCostPct,
        acquisitionFeePct,
        workingCapitalPerUnit,
        seniorLtvPct,
        seniorInterestRate,
        seniorIoPeriods,
        seniorFinancingCostsPct,
      });
      setReviewOpen(true);
    } catch (err) {
      setRrError(err instanceof Error ? err.message : 'Failed to extract Rent Roll data');
    } finally {
      setRrUploading(false);
    }
  };

  // Merged view of the three raw extractions, recomputed whenever any of them
  // changes — this is what drives the single shared review card and its
  // discrepancy banner.
  const { merged: mergedReviewData, discrepancies: reviewDiscrepancies } = useMemo(
    () => mergeExtractions(omData, rentRollData, t12Data),
    [omData, rentRollData, t12Data]
  );

  // Drives the review card's title/subtitle so they read naturally for any
  // combination of 1-3 present sources, instead of a hand-written ternary chain.
  const reviewSourceLabels = [
    omData != null && 'OM',
    rentRollData != null && 'Rent Roll',
    t12Data != null && 'T-12',
  ].filter(Boolean) as string[];

  const handleGenerateClarificationEmail = async (discrepancies: ReturnType<typeof mergeExtractions>['discrepancies']) => {
    const res = await fetch('/api/v2/underwriting/draft-clarification-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        propertyName: mergedReviewData?.propertyName || dealName,
        dealName,
        discrepancies: discrepancies.map((d) => ({ label: d.label, omValue: d.omValue, rentRollValue: d.rentRollValue, t12Value: d.t12Value })),
      }),
    });
    const json = await res.json();
    if (!res.ok || !json.success) throw new Error(json.error || 'Failed to draft email');
    return json.email as string;
  };

  const handleT12Upload = async (file: File) => {
    setT12Uploading(true);
    setT12Error(null);
    try {
      const data = await scrapingApi.extractT12FromFile(file, currentDealId ?? undefined);
      // Same review card as OM/Rent Roll uploads — hand off instead of applying directly.
      // Seed deal-cost/senior-loan fields with current form state (not extracted) so the
      // card opens pre-filled, same pattern as handleOmUpload/handleRentRollUpload.
      setT12Data({
        ...data,
        closingCostPct,
        acquisitionFeePct,
        workingCapitalPerUnit,
        seniorLtvPct,
        seniorInterestRate,
        seniorIoPeriods,
        seniorFinancingCostsPct,
      });
      setReviewOpen(true);
    } catch (err) {
      setT12Error(err instanceof Error ? err.message : 'Failed to extract T12 data');
    } finally {
      setT12Uploading(false);
    }
  };

  // ── Build export payload ──────────────────────────────────────────────────

  const buildExportPayload = () => {
    // Pass unit types through as-is (up to the template's 16-slot capacity) — no bucketing.
    // Portfolios with multiple buildings/unit types rely on every distinct row surviving export.
    const normalizedMix = unitMix.slice(0, 16).map(u => ({
      unitType: u.unitType,
      count: u.count,
      askingRent: u.askingRent,
      avgSf: u.avgSf,
    }));

    return {
      propertyName: dealName,
      address: location,
      acquisitionDate: acquisitionDate || new Date().toISOString().slice(0, 10),
      holdPeriodYears,
      bridgePeriodMonths,
      ttmNoi,
      purchasePrice,
      entryCapRate: entryCapRateInput,
      salesCostPct,
      closingCostPct,
      acquisitionFeePct,
      workingCapitalPerUnit,
      additionalFeesTotal,
      lpEquityShare,
      unitMix: normalizedMix,
      rubsPct,
      parkingPerUnitMo: parkingIncomePerUnit,
      otherIncomePerUnitMo: otherIncomePerUnit,
      lossToLeaseRate: lossToLeaseRates,
      vacancyRate: vacancyRates,
      badDebtRate: badDebtRates,
      concessionsRate: concessionsRates,
      nonRevenueUnits: nonRevUnits,
      managementFeePct,
      capReservePerUnit,
      opexPayrollPerUnit,
      opexAdminPerUnit,
      opexMarketingPerUnit,
      opexRmPerUnit,
      opexContractServicePerUnit,
      opexTurnoverPerUnit,
      opexOtherPerUnit,
      opexInsurancePerUnit,
      opexInsurancePerUnitConfirmed,
      insuranceGrowthRate,
      opexUtilitiesPerUnit,
      opexPropertyTaxPerUnit,
      seniorLtvPct,
      seniorInterestRate,
      seniorFinancingCostsPct,
      seniorIoPeriods,
      refiTermMonths,
      refiInterestRate,
      refiFinancingCostsPct,
      refiIoPeriods,
      // refiTargetDscr/Dy/Ltv intentionally omitted — F52/F53/F54 in the template are
      // fixed sizing constants, not per-deal inputs (confirmed during the Inputs-tab redesign).
      rentGrowthRate,
      opexGrowthRate,
      exitCapRate,
      amFeePct,
      pariPassu,
      preferredReturnPct,
      gpPromotePct,
      assessedValue,
      assessedValueNextBuyer,
      assessmentPct,
      millageRate,
      specialAssessments,
      abatementPctSchedule,
    };
  };

  // ── Save / export ─────────────────────────────────────────────────────────

  const handleSaveDeal = async () => {
    setSaving(true);
    try {
      let dealId = currentDealId;
      if (!dealId) {
        const created = await dealApi.createDeal({
          dealName,
          location: location || 'Location TBD',
          status: dealStatus,
        });
        if (!created?.id) { alert('Failed to create deal record. Is the backend running?'); return; }
        dealId = created.id;
        setCurrentDealId(dealId);
        const url = new URL(window.location.href);
        url.searchParams.set('dealId', String(dealId));
        window.history.replaceState({}, '', url.toString());
      }

      let demoData = marketAnalysisDemographics;
      let statsData = marketAnalysisStats;
      if (!demoData && !marketAnalysisLoading) {
        const fetched = await fetchMarketAnalysisData();
        demoData = fetched.demographics;
        statsData = fetched.stats;
      }

      await dealApi.updateDeal(dealId, {
        dealName,
        status: dealStatus,
        location,
        purchasePrice,
        underwritingJson: JSON.stringify({
          totalUnits, county, zipCode, yearBuilt, buildingType, numberOfBuildings,
          amiTarget, gpPartner, acquisitionDate, ttmNoi, purchasePrice,
          holdPeriodYears, bridgePeriodMonths, entryCapRateInput, salesCostPct,
          closingCostPct, acquisitionFeePct, workingCapitalPerUnit, additionalFees,
          unitMix, omLaundryIncome, omRentStabilized, omAnnualRentGrowthCap,
          vacancyRates, lossToLeaseRates, badDebtRates, concessionsRates, nonRevUnits,
          managementFeePct, capReservePerUnit,
          opexPayrollPerUnit, opexAdminPerUnit, opexMarketingPerUnit, opexRmPerUnit,
          opexContractServicePerUnit, opexTurnoverPerUnit, opexOtherPerUnit,
          opexInsurancePerUnit, opexInsurancePerUnitConfirmed, insuranceGrowthRate,
          opexUtilitiesPerUnit, opexPropertyTaxPerUnit,
          rubsPct, parkingIncomePerUnit, otherIncomePerUnit,
          assessedValue, assessedValueNextBuyer, assessmentPct, millageRate, specialAssessments,
          abatementPctSchedule,
          seniorLtvPct, seniorInterestRate, seniorFinancingCostsPct, seniorIoPeriods,
          refiTermMonths, refiInterestRate, refiFinancingCostsPct, refiIoPeriods,
          refiTargetDscr, refiTargetDy, refiTargetLtv,
          rentGrowthRate, opexGrowthRate, exitCapRate,
          lpEquityShare, amFeePct, pariPassu, preferredReturnPct, gpPromotePct,
          marketAnalysisDemographics: demoData ?? undefined,
          marketAnalysisStats: statsData ?? undefined,
        }),
      });

      // Link to sourcing property by address
      try {
        const sourcingProps = await sourcingApi.fetchProperties();
        const matchedProp = sourcingProps.find(p =>
          addressMatch(location, p.address) || addressMatch(location, `${p.address} ${p.market}`)
        );
        if (matchedProp && matchedProp.deal_id !== dealId) {
          await sourcingApi.updateProperty(matchedProp.id, { deal_id: dealId });
        }
      } catch { /* ignore */ }

      setMarketAnalysisOpen(true);
      alert('Deal saved successfully!');
    } catch (err) {
      console.error('Error saving deal:', err);
      alert('Failed to save deal');
    } finally {
      setSaving(false);
    }
  };

  const handleExportExcel = async () => {
    setExporting(true);
    try {
      const body = buildExportPayload();
      const res = await fetch('/api/v2/underwriting/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as any).error || 'Export failed');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${dealName || 'Aequitas'}_Model.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error exporting:', err);
      alert('Failed to export: ' + (err instanceof Error ? err.message : String(err)));
    } finally {
      setExporting(false);
    }
  };

  // ── Market Analysis ───────────────────────────────────────────────────────

  const fetchMarketAnalysisData = async () => {
    const zip = zipCode.trim();
    if (!zip || zip.length !== 5) return { demographics: null, stats: null };
    setMarketAnalysisLoading(true);
    setMarketAnalysisError(null);
    try {
      const [demoResp, statsResp] = await Promise.all([
        censusApi.getDemographics(zip),
        rentcastApi.getMarketStats(zip),
      ]);
      const demographics = demoResp.success && demoResp.data ? demoResp.data : null;
      const stats = statsResp.success && statsResp.data ? statsResp.data : null;
      if (demographics) setMarketAnalysisDemographics(demographics);
      else setMarketAnalysisError(demoResp.error || 'Failed to fetch demographics');
      if (stats) setMarketAnalysisStats(stats);
      return { demographics, stats };
    } catch {
      setMarketAnalysisError('Failed to fetch market data');
      return { demographics: null, stats: null };
    } finally {
      setMarketAnalysisLoading(false);
    }
  };

  const handleToggleMarketAnalysis = async () => {
    if (marketAnalysisOpen) { setMarketAnalysisOpen(false); return; }
    setMarketAnalysisOpen(true);
    if (marketAnalysisDemographics || marketAnalysisLoading) return;
    await fetchMarketAnalysisData();
  };

  const handleFetchLegislation = async () => {
    if (!location) return;
    setLegislationFetching(true);
    setLegislationStatus('idle');
    try {
      const resp = await fetch('/api/v1/regulations/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ market: location }),
      });
      const json = await resp.json();
      if (!resp.ok || !json.success) throw new Error(json.error || 'Failed');
      if (currentDealId) {
        await fetch(`/api/v1/deals/${currentDealId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dealLegislation: JSON.stringify(json.data) }),
        });
      }
      setLegislationStatus('saved');
    } catch {
      setLegislationStatus('failed');
    } finally {
      setLegislationFetching(false);
    }
  };

  // ── Data Room / LOI handlers ──────────────────────────────────────────────

  const createDealExecutionRecord = (docs: Omit<DealDocument, 'id' | 'uploadedAt'>[]) => {
    if (!currentDealId) return;
    const documents: DealDocument[] = docs.map(d => ({
      ...d,
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      uploadedAt: new Date().toISOString(),
    }));
    saveDealExecution({
      dealId: currentDealId, dealName, propertyAddress: location, location,
      totalUnits, purchasePrice, createdAt: new Date().toISOString(), documents,
    });
    setPipelineStatus(currentDealId, 'Data Room Received');
    setPipelineStatusState('Data Room Received');
  };

  const handleDataRoomConfirm = (docs: Omit<DealDocument, 'id' | 'uploadedAt'>[]) => {
    createDealExecutionRecord(docs);
    setShowDataRoomModal(false);
  };

  const handleDataRoomSkip = () => { createDealExecutionRecord([]); setShowDataRoomModal(false); };

  const advanceToLoiExecuted = (loiData: LoiExtractedData, fileName?: string) => {
    if (!currentDealId) return;
    patchDealExecution(currentDealId, { loiData, loiDocumentName: fileName, loiExecutedAt: new Date().toISOString() });
    setPipelineStatus(currentDealId, 'LOI Executed');
    setPipelineStatusState('LOI Executed');
  };

  const handleLoiConfirm = (loiData: LoiExtractedData, fileName?: string) => { advanceToLoiExecuted(loiData, fileName); setShowLoiModal(false); };
  const handleLoiSkip = () => { advanceToLoiExecuted({}); setShowLoiModal(false); };

  // ── Shared input class ────────────────────────────────────────────────────

  const inp = 'w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:bg-white';
  const lbl = 'block text-xs font-medium text-gray-600 mb-1.5';

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-semibold text-brandPurple-700">Deal Underwriting</h1>
          <p className="text-sm text-gray-500 mt-1">
            Analyze projected returns and export financial models
            {currentDealId && <span className="ml-2 text-primary-800 font-medium">• Deal #{currentDealId} loaded</span>}
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {currentDealId && pipelineStatus === 'Analyzing' && (
            <button onClick={() => setShowDataRoomModal(true)} className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-primary-100 text-gray-700 border border-gray-200 rounded-lg font-medium text-sm transition-colors">
              <Upload size={16} /> Data Room Received
            </button>
          )}
          {currentDealId && pipelineStatus === 'Data Room Received' && (
            <button onClick={() => setShowLoiModal(true)} className="flex items-center gap-2 px-4 py-2 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg font-medium text-sm transition-colors">
              <FileText size={16} /> LOI Executed
            </button>
          )}
          {currentDealId && pipelineStatus !== 'Analyzing' && (
            <Link to={`/deal-execution/${currentDealId}`} className="flex items-center gap-2 px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-700 border border-gray-200 rounded-lg font-medium text-sm transition-colors">
              <TrendingUp size={16} /> Deal Execution →
            </Link>
          )}
          <button onClick={handleSaveDeal} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50">
            <Save size={16} /> {saving ? 'Saving...' : 'Save Deal'}
          </button>
          <button onClick={handleExportExcel} disabled={exporting} className="flex items-center gap-2 px-4 py-2 bg-primary-800 hover:bg-primary-700 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50">
            <Download size={16} /> {exporting ? 'Exporting...' : 'Export Excel Model'}
          </button>
        </div>
      </div>

      {/* Main grid: sidebar + 3-col content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <DealsListSidebar onSelectDeal={handleSelectDeal} activeDealId={currentDealId ?? undefined} />
        </div>

        {/* Content */}
        <div className="lg:col-span-3 space-y-6">

          {/* LOI locked banner */}
          {isUnderwritingLocked && (
            <div className="flex items-center gap-2 px-4 py-3 bg-purple-50 border border-purple-200 rounded-xl">
              <FileText size={14} className="text-purple-600 flex-shrink-0" />
              <p className="text-xs font-medium text-purple-800">LOI executed — underwriting locked.</p>
            </div>
          )}

          {/* ── UPLOADS ─────────────────────────────────────────────────────── */}
          <div className={`bg-white rounded-xl p-5 shadow-sm ${isUnderwritingLocked ? 'pointer-events-none opacity-60' : ''}`}>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Documents</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

              {/* OM Upload */}
              <div>
                {omUploading ? (
                  <div className="flex flex-col items-center justify-center gap-3 w-full min-h-[120px] border-2 border-dashed border-primary-300 rounded-xl bg-gray-50 px-4 py-5 text-center">
                    <Loader2 size={28} className="text-primary-800 animate-spin" />
                    <p className="text-sm font-semibold text-gray-700">Analyzing OM… (20–30 sec)</p>
                  </div>
                ) : omUploaded ? (
                  <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <CheckCircle size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-green-800">OM Parsed</p>
                      <p className="text-xs text-green-700 mt-0.5 truncate">{dealName}</p>
                      <p className="text-xs text-green-600">{totalUnits} units · {unitMix.length} types</p>
                    </div>
                    <label className="text-xs text-green-600 hover:text-primary-700 cursor-pointer flex-shrink-0">
                      Re-upload
                      <input type="file" accept=".pdf" className="hidden" onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) { if (f.size > 20 * 1024 * 1024) { setOmError('File must be under 20MB'); return; } handleOmUpload(f); e.target.value = ''; }
                      }} />
                    </label>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-3 w-full min-h-[120px] border-2 border-dashed border-primary-300 rounded-xl bg-primary-50 hover:bg-primary-100 hover:border-primary-400 transition-colors cursor-pointer px-4 py-5 text-center">
                    <Upload size={28} className="text-primary-800" />
                    <div>
                      <p className="text-sm font-semibold text-primary-800">Upload Offering Memorandum</p>
                      <p className="text-xs text-primary-800 mt-1">PDF · max 20 MB</p>
                    </div>
                    <input type="file" accept=".pdf" className="hidden" onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) { if (f.size > 20 * 1024 * 1024) { setOmError('File must be under 20MB'); return; } handleOmUpload(f); e.target.value = ''; }
                    }} />
                  </label>
                )}
                {omError && <p className="text-xs text-red-600 mt-2">{omError}</p>}
              </div>

              {/* Rent Roll Upload */}
              <div>
                {rrUploading ? (
                  <div className="flex flex-col items-center justify-center gap-2 w-full min-h-[120px] border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 px-4 py-5 text-center">
                    <Loader2 size={24} className="text-gray-500 animate-spin" />
                    <p className="text-sm text-gray-500">Analyzing Rent Roll…</p>
                  </div>
                ) : rrUploaded ? (
                  <div className="flex items-start gap-3 p-4 bg-green-50 border border-green-200 rounded-xl">
                    <CheckCircle size={18} className="text-green-600 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-green-800">Rent Roll Parsed</p>
                      <p className="text-xs text-green-600">{unitMix.length} unit types · {totalUnits} total</p>
                    </div>
                    <label className="text-xs text-green-600 hover:text-primary-700 cursor-pointer flex-shrink-0">
                      Re-upload
                      <input type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden" onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) { handleRentRollUpload(f); e.target.value = ''; }
                      }} />
                    </label>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center gap-3 w-full min-h-[120px] border-2 border-dashed border-gray-300 rounded-xl bg-gray-50 hover:bg-gray-100 hover:border-gray-400 transition-colors cursor-pointer px-4 py-5 text-center">
                    <Upload size={28} className="text-gray-400" />
                    <div>
                      <p className="text-sm font-semibold text-gray-600">Upload Rent Roll</p>
                      <p className="text-xs text-gray-400 mt-1">PDF · Excel · CSV</p>
                    </div>
                    <input type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden" onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) { handleRentRollUpload(f); e.target.value = ''; }
                    }} />
                  </label>
                )}
                {rrError && <p className="text-xs text-red-600 mt-2">{rrError}</p>}
              </div>

              {/* T12 */}
              <div>
                {t12Uploading ? (
                  <div className="flex flex-col items-center justify-center gap-2 w-full h-20 border-2 border-dashed border-gray-300 rounded-lg px-3 py-2 text-center">
                    <Loader2 size={18} className="text-gray-500 animate-spin" />
                    <span className="text-xs text-gray-500">Analyzing T12…</span>
                  </div>
                ) : t12Uploaded ? (
                  <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <CheckCircle size={16} className="text-green-600" />
                    <span className="text-xs font-semibold text-green-800">T12 Parsed</span>
                    <label className="ml-auto text-xs text-green-600 hover:text-primary-700 cursor-pointer">
                      Re-upload
                      <input type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden" onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) { handleT12Upload(f); e.target.value = ''; }
                      }} />
                    </label>
                  </div>
                ) : (
                  <label className="flex items-center gap-2 w-full h-20 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:bg-gray-50 hover:border-gray-400 transition-colors px-3 py-2">
                    <Upload size={16} className="text-gray-400" />
                    <div>
                      <p className="text-xs font-medium text-gray-600">T12 Operating Statement</p>
                      <p className="text-[10px] text-gray-400">PDF or Excel</p>
                    </div>
                    <input type="file" accept=".pdf,.xlsx,.xls,.csv" className="hidden" onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) { handleT12Upload(f); e.target.value = ''; }
                    }} />
                  </label>
                )}
                {t12Error && <p className="text-[10px] text-red-600 mt-1">{t12Error}</p>}
              </div>

              {/* Climate Check */}
              <div className="flex flex-col justify-center">
                <ClimateCheckUpload dealId={currentDealId} />
              </div>

            </div>

            {/* OR → URL import */}
            <div className="flex flex-col items-center gap-2 mt-4">
              <div className="flex items-center gap-3 w-full">
                <div className="flex-1 border-t border-gray-200" />
                <span className="text-xs text-gray-400 font-medium">OR</span>
                <div className="flex-1 border-t border-gray-200" />
              </div>
              <button onClick={() => setIsImportModalOpen(true)} className="w-full px-3 py-2 text-xs text-gray-500 border border-gray-200 rounded-lg hover:bg-gray-50 hover:text-gray-700 transition-colors">
                Link to URL
              </button>
            </div>
          </div>

          {/* ── DEAL INFO + UNIT MIX ─────────────────────────────────────────── */}
          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${isUnderwritingLocked ? 'pointer-events-none opacity-60' : ''}`}>

            {/* Deal Info */}
            <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">Deal Info</h3>

              <div><label className={lbl}>Deal Name</label>
                <input type="text" value={dealName} onChange={e => setDealName(e.target.value)} className={inp} /></div>

              <div><label className={lbl}>Address / Location</label>
                <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="City, State" className={inp} />
                {location && (
                  <div className="flex flex-wrap gap-3 mt-1 items-center">
                    <Link to={`/pipeline?address=${encodeURIComponent(location)}`} className="text-xs text-primary-800 hover:text-primary-700" tabIndex={-1}>View in Pipeline →</Link>
                    <Link to={`/regulations?market=${encodeURIComponent(location.split(',').map(p => p.trim()).slice(-2).join(', '))}`} className="text-xs text-indigo-500 hover:text-indigo-700" tabIndex={-1}>Local Regs →</Link>
                    <button onClick={handleFetchLegislation} disabled={legislationFetching} className="text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 transition-colors">
                      {legislationFetching ? <><Loader2 size={10} className="inline animate-spin mr-1" />Fetching…</> :
                       legislationStatus === 'saved' ? <><CheckCircle size={10} className="inline text-green-600 mr-1" /><span className="text-green-700">Saved</span></> :
                       legislationStatus === 'failed' ? 'Failed — Retry' : 'Fetch Legislation'}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Acquisition Date</label>
                  <input type="date" value={acquisitionDate} onChange={e => setAcquisitionDate(e.target.value)} className={inp} /></div>
                <div><label className={lbl}>Total Units</label>
                  <input type="number" value={totalUnits} onChange={e => setTotalUnits(Number(e.target.value) || 0)} className={inp} /></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Hold Period (yrs)</label>
                  <input type="number" value={holdPeriodYears} onChange={e => setHoldPeriodYears(Number(e.target.value) || 0)} className={inp} /></div>
                <div><label className={lbl}>Bridge Period (mo)</label>
                  <input type="number" value={bridgePeriodMonths} onChange={e => setBridgePeriodMonths(Number(e.target.value) || 0)} className={inp} /></div>
              </div>

              <div><label className={lbl}>Purchase Price ($)</label>
                <input type="number" value={purchasePrice} onChange={e => setPurchasePrice(Number(e.target.value) || 0)} className={inp} /></div>

              <div><label className={lbl}>Trailing 12-Month NOI ($)</label>
                <input type="number" step="1000" value={ttmNoi} onChange={e => setTtmNoi(Number(e.target.value) || 0)} className={inp} /></div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Entry Cap Rate (%)</label>
                  {pctInput(entryCapRateInput, setEntryCapRateInput, 0.01)}
                </div>
                <div><label className={lbl}>Sales Cost (%)</label>
                  {pctInput(salesCostPct, setSalesCostPct, 0.1)}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>County</label>
                  <input type="text" value={county} onChange={e => setCounty(e.target.value)} placeholder="e.g. Sacramento County" className={inp} /></div>
                <div><label className={lbl}>ZIP Code</label>
                  <input type="text" value={zipCode} onChange={e => setZipCode(e.target.value)} maxLength={10} className={inp} /></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Year Built</label>
                  <input type="number" value={yearBuilt} onChange={e => setYearBuilt(Number(e.target.value) || 1900)} className={inp} /></div>
                <div><label className={lbl}>Buildings</label>
                  <input type="number" value={numberOfBuildings} onChange={e => setNumberOfBuildings(Number(e.target.value) || 1)} className={inp} /></div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Building Type</label>
                  <select value={buildingType} onChange={e => setBuildingType(e.target.value)} className={inp}>
                    <option>Garden Style</option><option>Mid-Rise</option><option>High-Rise</option><option>Townhome</option><option>Mixed Use</option>
                  </select>
                </div>
                <div><label className={lbl}>AMI Target</label>
                  <select value={amiTarget} onChange={e => setAmiTarget(e.target.value)} className={inp}>
                    {amiOptions.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div><label className={lbl}>GP Partner</label>
                <select value={gpPartner} onChange={e => setGpPartner(e.target.value)} className={inp}>
                  {gpPartners.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            {/* Unit Mix + Other Income */}
            <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">Unit Mix</h3>
                {weightedAvgRent !== null && (
                  <span className="text-xs text-primary-800 font-semibold">Avg ${weightedAvgRent.toLocaleString()}/mo</span>
                )}
              </div>

              {/* Unit mix table */}
              <div className="border border-gray-200 rounded-lg overflow-hidden text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-2 py-1.5 text-gray-500 font-medium">Type</th>
                      <th className="text-right px-2 py-1.5 text-gray-500 font-medium">Units</th>
                      <th className="text-right px-2 py-1.5 text-gray-500 font-medium">Rent/mo</th>
                      <th className="text-right px-2 py-1.5 text-gray-500 font-medium">Avg SF</th>
                      <th className="px-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {unitMix.map((row, idx) => (
                      <tr key={idx} className="border-t border-gray-100">
                        <td className="px-2 py-1">
                          <input type="text" value={row.unitType} onChange={e => { const u = [...unitMix]; u[idx] = { ...u[idx], unitType: e.target.value }; setUnitMix(u); }}
                            className="w-full px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500" />
                        </td>
                        <td className="px-1 py-1">
                          <input type="number" value={row.count} onChange={e => { const u = [...unitMix]; u[idx] = { ...u[idx], count: Number(e.target.value) || 0 }; setUnitMix(u); }}
                            className="w-14 px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-right text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500" />
                        </td>
                        <td className="px-1 py-1">
                          <input type="number" value={row.askingRent} onChange={e => { const u = [...unitMix]; u[idx] = { ...u[idx], askingRent: Number(e.target.value) || 0 }; setUnitMix(u); }}
                            className="w-16 px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-right text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500" />
                        </td>
                        <td className="px-1 py-1">
                          <input type="number" value={row.avgSf} onChange={e => { const u = [...unitMix]; u[idx] = { ...u[idx], avgSf: Number(e.target.value) || 0 }; setUnitMix(u); }}
                            className="w-16 px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-right text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500" />
                        </td>
                        <td className="px-1">
                          <button onClick={() => setUnitMix(unitMix.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-400 text-xs">✕</button>
                        </td>
                      </tr>
                    ))}
                    {unitMix.length < 16 && (
                      <tr className="border-t border-gray-100">
                        <td colSpan={5} className="px-2 py-1.5">
                          <button onClick={() => setUnitMix([...unitMix, { unitType: '', count: 0, askingRent: 0, avgSf: 0 }])} className="text-xs text-primary-800 hover:text-primary-700">+ Add row</button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Other income */}
              <div className="border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Other Income</p>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={lbl}>RUBS (% of utilities)</label>
                    {pctInput(rubsPct, setRubsPct, 1)}
                  </div>
                  <div><label className={lbl}>Parking ($/unit/mo)</label>
                    <input type="number" value={parkingIncomePerUnit} onChange={e => setParkingIncomePerUnit(Number(e.target.value) || 0)} className={inp} /></div>
                </div>
                <div className="mt-3"><label className={lbl}>Other Income ($/unit/mo)</label>
                  <input type="number" value={otherIncomePerUnit} onChange={e => setOtherIncomePerUnit(Number(e.target.value) || 0)} className={inp} /></div>
              </div>

              {/* Rent comps */}
              {comparables.length > 0 && (
                <div className="border-t border-gray-100 pt-3">
                  <button onClick={() => setShowComparables(!showComparables)} className="text-xs text-primary-800 hover:text-primary-700">
                    {showComparables ? 'Hide' : 'View'} {comparables.length} Rent Comps
                  </button>
                  {currentMortgageRate && !loadingRates && (
                    <span className="ml-3 text-xs text-green-600">30-yr: {currentMortgageRate.toFixed(2)}% (FRED · {new Date(rateLastUpdated).toLocaleDateString()})</span>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── INCOME ADJUSTMENTS (5-Year) ──────────────────────────────────── */}
          <div className={`bg-white rounded-xl p-5 shadow-sm ${isUnderwritingLocked ? 'pointer-events-none opacity-60' : ''}`}>
            <h3 className="text-sm font-semibold text-gray-700 mb-4">Income Adjustments (5-Year)</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="text-left px-3 py-2 text-gray-500 font-medium w-36">Adjustment</th>
                    {[1, 2, 3, 4, 5].map(y => (
                      <th key={y} className="text-right px-2 py-2 text-gray-500 font-medium w-20">Yr {y}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {([
                    { label: 'Vacancy (%)', vals: vacancyRates, setVals: setVacancyRates, pct: true },
                    { label: 'Bad Debt (%)', vals: badDebtRates, setVals: setBadDebtRates, pct: true },
                    { label: 'Loss to Lease (%)', vals: lossToLeaseRates, setVals: setLossToLeaseRates, pct: true },
                    { label: 'Concessions (%)', vals: concessionsRates, setVals: setConcessionsRates, pct: true },
                    { label: 'Non-Rev Units', vals: nonRevUnits, setVals: setNonRevUnits, pct: false },
                  ] as { label: string; vals: number[]; setVals: (v: number[]) => void; pct: boolean }[]).map(({ label, vals, setVals, pct }) => (
                    <tr key={label} className="border-t border-gray-100">
                      <td className="px-3 py-1.5 text-gray-600 font-medium">{label}</td>
                      {vals.map((v, i) => (
                        <td key={i} className="px-1 py-1">
                          <input
                            type="number"
                            step={pct ? 0.1 : 1}
                            value={pct ? parseFloat((v * 100).toFixed(3)) : v}
                            onChange={(e) => {
                              const updated = [...vals];
                              updated[i] = pct ? (Number(e.target.value) || 0) / 100 : (Number(e.target.value) || 0);
                              setVals(updated);
                            }}
                            className="w-full px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-right focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ── OPEX + FINANCING ─────────────────────────────────────────────── */}
          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${isUnderwritingLocked ? 'pointer-events-none opacity-60' : ''}`}>

            {/* Operating Expenses */}
            <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Operating Expenses ($/unit/yr)</h3>

              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Mgmt Fee (%)</label>
                  {pctInput(managementFeePct, setManagementFeePct, 0.1)}
                </div>
                <div><label className={lbl}>Cap Reserve ($/unit/yr)</label>
                  <input type="number" value={capReservePerUnit} onChange={e => setCapReservePerUnit(Number(e.target.value) || 0)} className={inp} /></div>
              </div>

              {([
                ['Payroll', opexPayrollPerUnit, setOpexPayrollPerUnit],
                ['Admin', opexAdminPerUnit, setOpexAdminPerUnit],
                ['Marketing', opexMarketingPerUnit, setOpexMarketingPerUnit],
                ['R&M', opexRmPerUnit, setOpexRmPerUnit],
                ['Contract Services', opexContractServicePerUnit, setOpexContractServicePerUnit],
                ['Turnover', opexTurnoverPerUnit, setOpexTurnoverPerUnit],
                ['Other', opexOtherPerUnit, setOpexOtherPerUnit],
                ['Utilities', opexUtilitiesPerUnit, setOpexUtilitiesPerUnit],
                ['Property Tax', opexPropertyTaxPerUnit, setOpexPropertyTaxPerUnit],
              ] as [string, number, (v: number) => void][]).map(([label, val, setter]) => (
                <div key={label}>
                  <label className={lbl}>{label}</label>
                  <input type="number" value={val} onChange={e => setter(Number(e.target.value) || 0)} className={inp} />
                </div>
              ))}

              <div>
                <label className={lbl}>Insurance</label>
                <input
                  type="number"
                  value={opexInsurancePerUnit}
                  onChange={e => {
                    setOpexInsurancePerUnit(Number(e.target.value) || 0);
                    // A user-entered value is inherently confirmed — never silently applied.
                    setOpexInsurancePerUnitConfirmed(true);
                  }}
                  className={inp}
                />
                {!opexInsurancePerUnitConfirmed && opexInsurancePerUnit === 0 && (
                  <button
                    type="button"
                    onClick={() => { setOpexInsurancePerUnit(896.84); setOpexInsurancePerUnitConfirmed(true); }}
                    className="text-xs text-primary-800 hover:text-primary-700 underline mt-1"
                  >
                    Use suggested default ($896.84/unit/yr)
                  </button>
                )}
              </div>
              <div>
                <label className={lbl}>Insurance Growth Rate (%/yr)</label>
                {pctInput(insuranceGrowthRate, setInsuranceGrowthRate, 0.1)}
                {insuranceGrowthRate === 0 && (
                  <button
                    type="button"
                    onClick={() => setInsuranceGrowthRate(0.05)}
                    className="text-xs text-primary-800 hover:text-primary-700 underline mt-1"
                  >
                    Use suggested default (5.0%/yr)
                  </button>
                )}
              </div>

              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Property Tax Model</p>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Assessed Value ($)</label>
                  <input type="number" step="10000" value={assessedValue} onChange={e => setAssessedValue(Number(e.target.value) || 0)} className={inp} /></div>
                <div><label className={lbl}>Assessed (Next Buyer) ($)</label>
                  <input type="number" step="10000" value={assessedValueNextBuyer} onChange={e => setAssessedValueNextBuyer(Number(e.target.value) || 0)} className={inp} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Assessment Ratio (1.0 = 100%)</label>
                  <input type="number" step="0.01" value={assessmentPct} onChange={e => setAssessmentPct(Number(e.target.value) || 0)} className={inp} /></div>
                <div><label className={lbl}>Millage Rate (%)</label>
                  <input type="number" step="0.001" value={+(millageRate * 100).toFixed(4)} onChange={e => setMillageRate((Number(e.target.value) || 0) / 100)} className={inp} /></div>
              </div>
              <div><label className={lbl}>Special Assessments (Annual $)</label>
                <input type="number" step="1000" value={specialAssessments} onChange={e => setSpecialAssessments(Number(e.target.value) || 0)} className={inp} /></div>

              <div>
                <div className="flex items-center justify-between">
                  <label className={lbl}>Abatement Schedule (% of gross tax, by year)</label>
                  {abatementPctSchedule.every(v => v === 0) && (
                    <button
                      type="button"
                      onClick={() => setAbatementPctSchedule([0, 0.015, 0.70, 0.90, 0.90])}
                      className="text-xs text-primary-800 hover:text-primary-700 underline"
                    >
                      Use typical schedule (0/1.5/70/90/90%)
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-2 mt-1">
                  {abatementPctSchedule.map((v, i) => (
                    <div key={i}>
                      <label className="text-[10px] text-gray-400">Yr {i + 1}</label>
                      <input
                        type="number"
                        step="0.1"
                        value={parseFloat((v * 100).toFixed(3))}
                        onChange={(e) => {
                          const updated = [...abatementPctSchedule];
                          updated[i] = (Number(e.target.value) || 0) / 100;
                          setAbatementPctSchedule(updated);
                        }}
                        className={`${inp} text-right`}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Financing */}
            <div className="bg-white rounded-xl p-5 shadow-sm space-y-4">
              <h3 className="text-sm font-semibold text-gray-700">Financing</h3>

              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Total Capitalization</p>
              <div className="space-y-3">
                <div><label className={lbl}>Closing Costs (% of Acquisition Cost)</label>
                  {pctInput(closingCostPct, v => setClosingCostPct(Math.min(1, Math.max(0, v))), 0.1)}
                  <p className="text-xs text-gray-400 mt-1">{fmtCurrency(closingCostPct * purchasePrice)}</p>
                </div>
                <div><label className={lbl}>Aequitas Acquisition Fee (% of Acquisition Cost)</label>
                  {pctInput(acquisitionFeePct, v => setAcquisitionFeePct(Math.min(1, Math.max(0, v))), 0.1)}
                  <p className="text-xs text-gray-400 mt-1">{fmtCurrency(acquisitionFeePct * purchasePrice)}</p>
                </div>
                <div><label className={lbl}>Working Capital / Reserve ($/unit)</label>
                  <input type="number" step="100" value={workingCapitalPerUnit} onChange={e => setWorkingCapitalPerUnit(Number(e.target.value) || 0)} className={inp} />
                  <p className="text-xs text-gray-400 mt-1">{fmtCurrency(workingCapitalPerUnit * unitMixCount)}</p>
                </div>
                <div>
                  <label className={lbl}>Additional Fees / Costs</label>
                  <div className="space-y-2">
                    {additionalFees.map(f => (
                      <div key={f.id} className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Description"
                          value={f.description}
                          onChange={e => updateAdditionalFee(f.id, { description: e.target.value })}
                          className={`${inp} flex-1`}
                        />
                        <input
                          type="number"
                          placeholder="$"
                          value={f.amount}
                          onChange={e => updateAdditionalFee(f.id, { amount: Number(e.target.value) || 0 })}
                          className={`${inp} w-28`}
                        />
                        <button onClick={() => removeAdditionalFee(f.id)} className="text-xs text-red-500 hover:text-red-700">✕</button>
                      </div>
                    ))}
                    <button onClick={addAdditionalFee} className="text-xs text-primary-800 hover:text-primary-700 underline">+ Add fee/cost</button>
                  </div>
                  {additionalFees.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">Total: {fmtCurrency(additionalFeesTotal)}</p>
                  )}
                </div>
              </div>

              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Senior / Bridge Loan</p>
              <div className="space-y-3">
                <div><label className={lbl}>LTV (%)</label>
                  {pctInput(seniorLtvPct, v => setSeniorLtvPct(Math.min(1, Math.max(0, v))), 1)}
                  <p className="text-xs text-gray-400 mt-1">{fmtCurrency(seniorLtvPct * purchasePrice)} loan amount</p>
                  {currentMortgageRate && !loadingRates && (
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-green-600">FRED 30-yr: {currentMortgageRate.toFixed(2)}%</span>
                      <button onClick={() => setSeniorInterestRate(currentMortgageRate / 100)} className="text-xs text-primary-800 hover:text-primary-700 underline">Use</button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={lbl}>Interest Rate (%)</label>
                    {pctInput(seniorInterestRate, setSeniorInterestRate, 0.1)}
                  </div>
                  <div><label className={lbl}>IO Periods (mo)</label>
                    <input type="number" value={seniorIoPeriods} onChange={e => setSeniorIoPeriods(Number(e.target.value) || 0)} className={inp} /></div>
                </div>
                <div><label className={lbl}>Financing Costs (%)</label>
                  {pctInput(seniorFinancingCostsPct, setSeniorFinancingCostsPct, 0.1)}
                </div>
              </div>

              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide pt-2">Refinance Loan</p>
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={lbl}>Term (months)</label>
                    <input type="number" value={refiTermMonths} onChange={e => setRefiTermMonths(Number(e.target.value) || 0)} className={inp} /></div>
                  <div><label className={lbl}>IO Periods (mo)</label>
                    <input type="number" value={refiIoPeriods} onChange={e => setRefiIoPeriods(Number(e.target.value) || 0)} className={inp} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={lbl}>Interest Rate (%)</label>
                    {pctInput(refiInterestRate, setRefiInterestRate, 0.1)}
                  </div>
                  <div><label className={lbl}>Financing Costs (%)</label>
                    {pctInput(refiFinancingCostsPct, setRefiFinancingCostsPct, 0.1)}
                  </div>
                </div>
                <p className="text-xs font-medium text-gray-500">Sizing Constraints</p>
                <div className="grid grid-cols-3 gap-2">
                  <div><label className={lbl}>Min DSCR</label>
                    <input type="number" step="0.01" value={refiTargetDscr} onChange={e => setRefiTargetDscr(Number(e.target.value) || 0)} className={inp} /></div>
                  <div><label className={lbl}>Min DY (%)</label>
                    {pctInput(refiTargetDy, setRefiTargetDy, 0.1)}
                  </div>
                  <div><label className={lbl}>Max LTV (%)</label>
                    {pctInput(refiTargetLtv, setRefiTargetLtv, 1)}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── WATERFALL + GROWTH & EXIT ────────────────────────────────────── */}
          <div className={`grid grid-cols-1 lg:grid-cols-2 gap-6 ${isUnderwritingLocked ? 'pointer-events-none opacity-60' : ''}`}>

            {/* Waterfall */}
            <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Waterfall</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>LP Equity Share (%)</label>
                  {pctInput(lpEquityShare, setLpEquityShare, 1)}
                </div>
                <div><label className={lbl}>GP Promote (%)</label>
                  {pctInput(gpPromotePct, setGpPromotePct, 1)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Preferred Return (%)</label>
                  {pctInput(preferredReturnPct, setPreferredReturnPct, 0.5)}
                </div>
                <div><label className={lbl}>AM Fee (%)</label>
                  {pctInput(amFeePct, setAmFeePct, 0.1)}
                </div>
              </div>
              <div><label className={lbl}>Pari Passu (0 = No, 1 = Yes)</label>
                <select value={pariPassu} onChange={e => setPariPassu(Number(e.target.value))} className={inp}>
                  <option value={0}>No</option>
                  <option value={1}>Yes</option>
                </select>
              </div>
            </div>

            {/* Growth & Exit */}
            <div className="bg-white rounded-xl p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Growth &amp; Exit</h3>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Rent Growth (%/yr)</label>
                  {pctInput(rentGrowthRate, setRentGrowthRate, 0.1)}
                </div>
                <div><label className={lbl}>OpEx Growth (%/yr)</label>
                  {pctInput(opexGrowthRate, setOpexGrowthRate, 0.1)}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={lbl}>Exit Cap Rate (%)</label>
                  {pctInput(exitCapRate, setExitCapRate, 0.1)}
                </div>
                <div><label className={lbl}>Sales Cost (%)</label>
                  {pctInput(salesCostPct, setSalesCostPct, 0.1)}
                </div>
              </div>

              {/* Summary chips */}
              <div className="pt-2 grid grid-cols-2 gap-2">
                {[
                  ['Purchase Price', purchasePrice > 0 ? `$${(purchasePrice / 1e6).toFixed(2)}M` : '—'],
                  ['TTM NOI', ttmNoi > 0 ? `$${(ttmNoi / 1e3).toFixed(0)}K` : '—'],
                  ['Entry Cap', `${(entryCapRateInput * 100).toFixed(2)}%`],
                  ['Exit Cap', `${(exitCapRate * 100).toFixed(2)}%`],
                  ['Hold', `${holdPeriodYears} yrs`],
                  ['Bridge', `${bridgePeriodMonths} mo`],
                ].map(([label, value]) => (
                  <div key={label} className="bg-gray-50 rounded-lg p-2.5">
                    <p className="text-[10px] text-gray-400">{label}</p>
                    <p className="text-sm font-bold text-gray-800">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* ── CLIMATE RISK SUMMARY ─────────────────────────────────────────── */}
          <ClimateScoreSummary dealId={currentDealId} />

          {/* ── MARKET ANALYSIS ─────────────────────────────────────────────── */}
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

          {/* ── RENT COMPS ───────────────────────────────────────────────────── */}
          {showComparables && comparables.length > 0 && (
            <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-gray-900">Rental Comparables <span className="text-sm font-normal text-gray-500">({comparables.length})</span></h3>
                <button onClick={() => setShowComparables(false)} className="text-sm text-gray-500 hover:text-gray-700">Close</button>
              </div>
              <div className="space-y-3">
                {comparables.slice(0, 8).map((comp, i) => (
                  <div key={i} className="p-4 bg-gray-50 rounded-lg border border-gray-200">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-900">{comp.address}</p>
                        <p className="text-xs text-gray-500 mt-1">
                          {comp.bedrooms && `${comp.bedrooms} bed`}
                          {comp.bathrooms && ` · ${comp.bathrooms} bath`}
                          {comp.squareFootage && ` · ${comp.squareFootage.toLocaleString()} sqft`}
                          {comp.distanceMiles && ` · ${comp.distanceMiles.toFixed(2)} mi`}
                        </p>
                      </div>
                      <div className="text-right">
                        {comp.listedRent && <p className="text-lg font-bold text-primary-800">${comp.listedRent.toLocaleString()}/mo</p>}
                        {comp.pricePerSqft && <p className="text-xs text-gray-500">${comp.pricePerSqft.toFixed(2)}/sqft</p>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showDataRoomModal && (
        <DataRoomModal dealName={dealName} onConfirm={handleDataRoomConfirm} onSkip={handleDataRoomSkip} onClose={() => setShowDataRoomModal(false)} />
      )}
      {showLoiModal && (
        <LoiModal dealName={dealName} onConfirm={handleLoiConfirm} onSkip={handleLoiSkip} onClose={() => setShowLoiModal(false)} />
      )}
      <ExtractionReviewModal
        isOpen={reviewOpen && (omData != null || rentRollData != null || t12Data != null)}
        title={
          reviewSourceLabels.length > 1 ? 'Review Extracted Deal Data'
          : reviewSourceLabels.length === 1 ? `Review Extracted ${reviewSourceLabels[0]} Data`
          : 'Review Extracted Data'
        }
        subtitle={
          reviewSourceLabels.length > 1
            ? "Merged from the documents you uploaded — Rent Roll takes priority for rents/occupancy, T-12 for actual income and expenses where available, and the OM fills in the rest. Double-check before they're added to this deal."
            : reviewSourceLabels.length === 1
            ? `Double-check the values pulled from the ${reviewSourceLabels[0] === 'OM' ? 'Offering Memorandum' : reviewSourceLabels[0] === 'Rent Roll' ? 'rent roll' : 'T-12'} before they're added to this deal.`
            : undefined
        }
        data={mergedReviewData}
        fields={MERGED_REVIEW_FIELDS}
        includeUnitMix
        discrepancies={reviewDiscrepancies}
        onGenerateClarificationEmail={reviewDiscrepancies.length > 0 ? handleGenerateClarificationEmail : undefined}
        onCancel={() => setReviewOpen(false)}
        onConfirm={(edited) => {
          const file = pendingOmFile;
          const sources = { hasOm: omData != null, hasRentRoll: rentRollData != null, hasT12: t12Data != null };
          setReviewOpen(false);
          setPendingOmFile(null);
          applyMergedDataToForm(edited, sources, file);
        }}
      />
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="relative w-full max-w-2xl p-6 bg-white rounded-lg shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Link Property URL</h2>
              <button onClick={() => setIsImportModalOpen(false)} className="p-1 text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <PropertyUrlInput
              onDataExtracted={async (data) => { await handleImportCreateDeal(data); setIsImportModalOpen(false); }}
              onError={(err) => console.warn('Import error:', err)}
            />
          </div>
        </div>
      )}
    </div>
  );
};

export default Underwriting;
