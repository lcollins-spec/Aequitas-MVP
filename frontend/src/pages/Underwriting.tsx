import { useState, useMemo, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { FileText, Download, ChevronDown, TrendingUp, Save } from 'lucide-react';
import { fredApi } from '../services/fredApi';
import { rentcastApi } from '../services/rentcastApi';
import { dealApi } from '../services/dealApi';
import type { RentEstimateData, RentalComparable } from '../types/rentcast';
import type { Deal, DealStatus } from '../types/deal';
import { DEAL_STATUS_LABELS } from '../types/deal';
import DealsListSidebar from '../components/DealsListSidebar';
import RiskAssessmentPanel from '../components/RiskAssessmentPanel';
import PropertyUrlInput from '../components/PropertyUrlInput';
import PropertyPdfUpload from '../components/PropertyPdfUpload';

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

const amiOptions = [
  '30% AMI - $24,000/year',
  '50% AMI - $40,000/year',
  '60% AMI - $48,000/year',
  '80% AMI - $64,000/year',
];

const gpPartners = [
  'Aequitas Housing',
];

const Underwriting = () => {
  const [searchParams] = useSearchParams();

  // Current Deal State
  const [currentDealId, setCurrentDealId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importTab, setImportTab] = useState<'url' | 'pdf'>('url');

  // Deal Parameters State
  const [dealName, setDealName] = useState('New Development Project');
  const [dealStatus, setDealStatus] = useState<DealStatus>('potential');
  const [location, setLocation] = useState('Sacramento, CA');
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

  // Auto-update construction cost and closing costs when purchase price or percentages change
  useEffect(() => {
    setConstructionCost(purchasePrice * (constructionCostPct / 100));
  }, [purchasePrice, constructionCostPct]);

  useEffect(() => {
    setClosingCosts(purchasePrice * (closingCostsPct / 100));
  }, [purchasePrice, closingCostsPct]);

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
          // Auto-populate rent from RentCast data
          if (response.data.estimatedRent) {
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

  // Load deal from URL query parameter
  useEffect(() => {
    const dealIdParam = searchParams.get('dealId');
    if (dealIdParam) {
      const dealId = parseInt(dealIdParam, 10);
      if (!isNaN(dealId)) {
        loadDeal(dealId);
      }
    }
  }, [searchParams]);

  /**
   * Load a deal and populate form fields
   */
  const loadDeal = async (dealId: number) => {
    try {
      const deal = await dealApi.getDeal(dealId);
      setCurrentDealId(deal.id!);

      // Populate form fields from deal
      if (deal.dealName) setDealName(deal.dealName);
      if (deal.status) setDealStatus(deal.status);
      if (deal.location) setLocation(deal.location);
      if (deal.purchasePrice) setPurchasePrice(deal.purchasePrice);
      if (deal.closingCosts) setClosingCosts(deal.closingCosts);
      if (deal.monthlyRent) setAvgMonthlyRent(deal.monthlyRent);
      if (deal.loanInterestRate) setInterestRate(deal.loanInterestRate / 100);
      if (deal.loanTermYears) setLoanTermYears(deal.loanTermYears);
    } catch (error) {
      console.error('Error loading deal:', error);
      alert('Failed to load deal');
    }
  };

  /**
   * Handle deal selection from sidebar
   */
  const handleSelectDeal = (deal: Deal) => {
    if (deal.id) {
      loadDeal(deal.id);
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
      }
    } catch (err) {
      console.error('Error creating deal from imported property:', err);
      alert('Failed to create deal from imported property');
    }
  };

  /**
   * Save current deal
   */
  const handleSaveDeal = async () => {
    if (!currentDealId) {
      alert('No deal loaded. Create a deal from the map first.');
      return;
    }

    setSaving(true);
    try {
      await dealApi.updateDeal(currentDealId, {
        dealName,
        status: dealStatus,
        location,
        purchasePrice,
        closingCosts,
        monthlyRent: avgMonthlyRent,
        loanInterestRate: interestRate * 100,
        loanTermYears,
        // Add calculated metrics
        monthlyPayment: Math.abs(metrics.annualDebtService / 12),
        npv: metrics.irr,
        irr: metrics.irr
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
  const handleExportExcel = async () => {
    if (!currentDealId) {
      alert('No deal loaded. Please load a deal first.');
      return;
    }

    setExporting(true);
    try {
      // Build comprehensive multifamily underwriting data
      const underwritingData = {
        propertyName: dealName,
        address: location,
        city: location.split(',')[0]?.trim() || '',
        county: 'Sacramento County', // TODO: Extract from location or add field
        state: location.split(',')[1]?.trim() || 'CA',
        zipCode: '95814', // TODO: Add field or extract from location
        yearBuilt: 1985, // TODO: Add field
        buildingType: 'Garden Style', // TODO: Add field
        numberOfBuildings: 4, // TODO: Add field
        parkingSpaces: totalUnits * 1.5, // Estimate

        purchasePrice: purchasePrice,
        acquisitionDate: new Date().toISOString(),
        earnestMoneyPct: 0.02,
        constructionCostPct: constructionCostPct / 100,
        closingCostsPct: closingCostsPct / 100,
        dueDiligenceCosts: 50000,

        // Generate basic unit mix from total units
        unitMix: [
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

        otherIncome: {
          laundryPerUnit: 15,
          petRentPerUnit: 25,
          parkingPerSpace: 30,
          otherPerUnit: 10
        },

        operatingExpenses: {
          propertyTax: purchasePrice * 0.011,
          insurance: totalUnits * 600,
          utilitiesElectric: totalUnits * 50 * 12,
          utilitiesGas: totalUnits * 30 * 12,
          utilitiesWaterSewer: totalUnits * 40 * 12,
          utilitiesTrash: totalUnits * 25 * 12,
          repairsMaintenance: totalUnits * 500,
          payroll: totalUnits * 350,
          managementFeePct: 0.04,
          marketing: totalUnits * 100,
          legalProfessional: 25000,
          administrative: totalUnits * 150
        },

        renovationBudget: {
          commonAreaExterior: constructionCost || 100000,
          contingencyPct: 0.10
        },

        operatingProjections: {
          marketRentGrowth: 0.03,
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
    
    const grossPotentialRent = totalUnits * avgMonthlyRent * 12;
    const vacancyLoss = grossPotentialRent * vacancyRate;
    const badDebtLoss = grossPotentialRent * badDebtRate;
    const effectiveGrossIncome = grossPotentialRent - vacancyLoss - badDebtLoss;
    const operatingExpenses = effectiveGrossIncome * operatingExpenseRatio;
    const netOperatingIncome = effectiveGrossIncome - operatingExpenses;
    
    const annualCashFlows = [];
    const irrStream = [-equityRequired];
    let projectedNOI = netOperatingIncome;
    
    for (let year = 1; year <= holdingPeriod; year++) {
      if (year > 1) projectedNOI *= 1.02;
      const cashFlow = projectedNOI - annualDebtService;
      annualCashFlows.push(cashFlow);
      irrStream.push(cashFlow);
    }
    
    const exitNOI = projectedNOI * 1.02;

    // Validate exit cap rate before division to prevent Infinity
    let validExitCapRate = exitCapRate;
    if (exitCapRate <= 0 || exitCapRate > 1) {
      console.error('Invalid exit cap rate:', exitCapRate, '- using default 6%');
      validExitCapRate = 0.06; // Default to 6% if invalid
    }

    const salePrice = exitNOI / validExitCapRate;

    // Calculate remaining loan balance after holdingPeriod years
    const monthlyRate = interestRate / 12;
    const totalPayments = loanTermYears * 12;
    const paymentsMade = holdingPeriod * 12;

    let loanBalance = loanAmount;
    if (paymentsMade < totalPayments && monthlyRate > 0) {
      loanBalance = loanAmount *
        ((Math.pow(1 + monthlyRate, totalPayments) - Math.pow(1 + monthlyRate, paymentsMade)) /
         (Math.pow(1 + monthlyRate, totalPayments) - 1));
    } else if (paymentsMade >= totalPayments) {
      loanBalance = 0; // Loan fully paid off
    }

    const saleProceeds = salePrice - loanBalance;
    irrStream[irrStream.length - 1] += saleProceeds;
    
    const irr = calculateIRR(irrStream) * 100;

    // Calculate total cash returned to equity investors (excluding initial investment)
    const totalCashReturned = irrStream.slice(1).reduce((a, b) => a + b, 0);
    const totalReturn = totalCashReturned / equityRequired;
    
    return {
      totalProjectCost,
      loanAmount,
      equityRequired,
      netOperatingIncome,
      annualDebtService,
      annualCashFlows,
      salePrice,
      irr,
      totalReturn,
    };
  }, [purchasePrice, constructionCost, closingCosts, totalUnits, avgMonthlyRent, operatingExpenseRatio, interestRate, loanTermYears, ltv, exitCapRate, holdingPeriod, vacancyRate, badDebtRate]);

  // Format cash flow data for chart
  const cashFlowData = metrics.annualCashFlows.map((cashFlow, index) => ({
    year: index + 1,
    cashFlow: cashFlow,
  }));

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
  <div className="flex gap-2">
          <button
            onClick={handleSaveDeal}
            disabled={!currentDealId || saving}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg font-medium text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            {saving ? 'Saving...' : 'Save Deal'}
          </button>
          <button
            onClick={() => setIsImportModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-800 rounded-lg font-medium text-sm transition-colors"
          >
            Import Details
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
          <div className="flex items-center gap-2 mb-6">
            <FileText size={20} color="#3b82f6" />
            <h3 className="text-lg font-semibold text-gray-800">Deal Parameters</h3>
          </div>
          {/* Import via modal only (Import URL button opens modal) */}
          <div className="space-y-4">
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
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Deal Status</label>
              <div className="relative">
                <select
                  value={dealStatus}
                  onChange={(e) => setDealStatus(e.target.value as DealStatus)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white appearance-none cursor-pointer"
                >
                  {Object.entries(DEAL_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Location</label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
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
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Purchase Price ($)</label>
              <input
                type="number"
                value={purchasePrice}
                onChange={(e) => setPurchasePrice(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Construction Cost % <span className="text-gray-400">(Default: 10%)</span></label>
              <input
                type="number"
                step="0.1"
                value={constructionCostPct}
                onChange={(e) => setConstructionCostPct(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Construction Cost ($) <span className="text-gray-400 italic">- Auto-calculated</span></label>
              <input
                type="number"
                value={constructionCost}
                onChange={(e) => setConstructionCost(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Closing Costs % <span className="text-gray-400">(Default: 3%)</span></label>
              <input
                type="number"
                step="0.1"
                value={closingCostsPct}
                onChange={(e) => setClosingCostsPct(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Closing Costs ($) <span className="text-gray-400 italic">- Auto-calculated</span></label>
              <input
                type="number"
                value={closingCosts}
                onChange={(e) => setClosingCosts(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-gray-600">
                  Average Monthly Rent ($)
                </label>
                {rentEstimate && !loadingRentEstimate && rentEstimate.estimatedRent && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                      <TrendingUp size={12} />
                      RentCast: ${Math.round(rentEstimate.estimatedRent).toLocaleString()}
                    </span>
                    <button
                      onClick={() => setAvgMonthlyRent(Math.round(rentEstimate.estimatedRent!))}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium underline"
                      title="Use RentCast market estimate"
                    >
                      Use
                    </button>
                    {comparables.length > 0 && (
                      <button
                        onClick={() => setShowComparables(!showComparables)}
                        className="text-xs text-blue-600 hover:text-blue-700 font-medium underline"
                      >
                        {showComparables ? 'Hide' : 'View'} Comps
                      </button>
                    )}
                  </div>
                )}
              </div>
              <input
                type="number"
                value={avgMonthlyRent}
                onChange={(e) => setAvgMonthlyRent(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
              {rentEstimate && !loadingRentEstimate && rentEstimate.estimatedRent && (
                <p className="text-xs text-gray-500 mt-1">
                  Range: ${Math.round(rentEstimate.rentRangeLow || 0).toLocaleString()} -
                  ${Math.round(rentEstimate.rentRangeHigh || 0).toLocaleString()}
                  {rentEstimate.lastUpdated && ` • Updated: ${new Date(rentEstimate.lastUpdated).toLocaleDateString()}`}
                </p>
              )}
              {loadingRentEstimate && (
                <p className="text-xs text-gray-400 mt-1">Loading market estimate...</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Operating Expense Ratio (%)</label>
              <input
                type="number"
                value={operatingExpenseRatio * 100}
                onChange={(e) => setOperatingExpenseRatio((Number(e.target.value) || 0) / 100)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Vacancy Rate (%)</label>
              <input
                type="number"
                step="0.1"
                value={vacancyRate * 100}
                onChange={(e) => setVacancyRate((Number(e.target.value) || 0) / 100)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
              <p className="text-xs text-gray-500 mt-1">
                Typical range: 5-8% (stabilized) or 8-15% (value-add)
              </p>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Bad Debt / Loss to Lease (%)</label>
              <input
                type="number"
                step="0.1"
                value={badDebtRate * 100}
                onChange={(e) => setBadDebtRate((Number(e.target.value) || 0) / 100)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
              <p className="text-xs text-gray-500 mt-1">
                Typical range: 0-2% (stabilized) or 5-10% (distressed/value-add)
              </p>
            </div>
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-medium text-gray-600">Interest Rate (%)</label>
                {currentMortgageRate && !loadingRates && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-green-600 font-medium flex items-center gap-1">
                      <TrendingUp size={12} />
                      Market: {currentMortgageRate.toFixed(2)}%
                    </span>
                    <button
                      onClick={() => setInterestRate(currentMortgageRate / 100)}
                      className="text-xs text-blue-600 hover:text-blue-700 font-medium underline"
                      title="Use current 30-year mortgage rate"
                    >
                      Use
                    </button>
                  </div>
                )}
              </div>
              <input
                type="number"
                step="0.1"
                value={interestRate * 100}
                onChange={(e) => setInterestRate((Number(e.target.value) || 0) / 100)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
              {currentMortgageRate && !loadingRates && (
                <p className="text-xs text-gray-500 mt-1">
                  Current 30-year mortgage: {currentMortgageRate.toFixed(2)}% (FRED) •
                  Last updated: {new Date(rateLastUpdated).toLocaleDateString()}
                </p>
              )}
              {loadingRates && (
                <p className="text-xs text-gray-400 mt-1">Loading current rates...</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">LTV Ratio (%)</label>
              <input
                type="range"
                min="50"
                max="90"
                step="1"
                value={ltv}
                onChange={(e) => setLtv(Number(e.target.value))}
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
              />
              <div className="text-center text-sm font-bold text-blue-600 mt-1">{ltv}%</div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Loan Term (Years)</label>
              <input
                type="number"
                value={loanTermYears}
                onChange={(e) => setLoanTermYears(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Exit Cap Rate (%)</label>
              <input
                type="number"
                step="0.1"
                value={exitCapRate * 100}
                onChange={(e) => setExitCapRate((Number(e.target.value) || 0) / 100)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Holding Period (Years)</label>
              <input
                type="number"
                value={holdingPeriod}
                onChange={(e) => setHoldingPeriod(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">AMI Target</label>
              <div className="relative">
                <select
                  value={amiTarget}
                  onChange={(e) => setAmiTarget(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white appearance-none cursor-pointer"
                >
                  {amiOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">GP Partner</label>
              <div className="relative">
                <select
                  value={gpPartner}
                  onChange={(e) => setGpPartner(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white appearance-none cursor-pointer"
                >
                  {gpPartners.map((partner) => (
                    <option key={partner} value={partner}>
                      {partner}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
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
              <span className="block text-xs text-gray-500 mb-1">LTV Ratio</span>
              <span className="block text-xl font-bold text-gray-800">{ltv}%</span>
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

          {/* Cash Flow Chart */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              Annual Cash Flow Analysis ({holdingPeriod} Years)
              {metrics.annualCashFlows.some(cf => cf < 0) && (
                <span className="ml-2 text-xs text-orange-600 font-normal">
                  ⚠️ Contains negative cash flow (typical for value-add deals)
                </span>
              )}
            </h3>
            <div className="relative">
              <div className="absolute -left-4 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-gray-500 font-medium">Cash Flow ($)</div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart
                  data={cashFlowData}
                  margin={{ top: 10, right: 40, left: 40, bottom: 0 }}
                  barCategoryGap="18%"
                  barGap={8}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis
                    dataKey="year"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                    dy={10}
                    padding={{ left: 24, right: 24 }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#6b7280', fontSize: 12 }}
                    tickFormatter={(value) => `$${(value / 1000).toLocaleString()}k`}
                    dx={-10}
                  />
                  <Tooltip 
                    formatter={(value: number) => [`$${value.toLocaleString()}`, 'Cash Flow']}
                    contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                  />
                  <Bar dataKey="cashFlow" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={48} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center text-xs text-gray-500 font-medium mt-2">Year</div>
          </div>

          {/* Risk Assessment - Academic Research-Based Analysis */}
          {currentDealId && (
            <RiskAssessmentPanel dealId={currentDealId} holdingPeriod={holdingPeriod} geography="US" />
          )}
        </div>
        </div>
      </div>

      {/* Import Property Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="relative w-full max-w-2xl p-6 bg-white rounded-lg shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">Import Property Data</h2>
              <button
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportTab('url'); // Reset to URL tab on close
                }}
                className="p-1 text-gray-400 hover:text-gray-600"
                aria-label="Close import modal"
              >
                ✕
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-gray-200 mb-4">
              <button
                onClick={() => setImportTab('url')}
                className={`flex-1 py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
                  importTab === 'url'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Import from URL
              </button>
              <button
                onClick={() => setImportTab('pdf')}
                className={`flex-1 py-2 px-4 text-sm font-medium border-b-2 transition-colors ${
                  importTab === 'pdf'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Upload PDF
              </button>
            </div>

            {/* Tab Content */}
            <div>
              {importTab === 'url' && (
                <PropertyUrlInput
                  onDataExtracted={async (data) => {
                    await handleImportCreateDeal(data);
                    setIsImportModalOpen(false);
                    setImportTab('url');
                  }}
                  onError={(err) => console.warn('Import error:', err)}
                />
              )}

              {importTab === 'pdf' && (
                <PropertyPdfUpload
                  onDataExtracted={async (data) => {
                    await handleImportCreateDeal(data);
                    setIsImportModalOpen(false);
                    setImportTab('url');
                  }}
                  onError={(err) => console.warn('PDF import error:', err)}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Underwriting;
