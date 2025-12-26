import { useState, useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { FileText, Download, AlertCircle, ChevronDown } from 'lucide-react';

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
    const newRate = rate - npvValue / npvDerivative;
    if (Math.abs(newRate - rate) < precision) return newRate;
    rate = newRate;
  }
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
  // Deal Parameters State
  const [dealName, setDealName] = useState('New Development Project');
  const [location, setLocation] = useState('Sacramento, CA');
  const [totalUnits, setTotalUnits] = useState(200);
  const [purchasePrice, setPurchasePrice] = useState(15000000);
  const [constructionCost, setConstructionCost] = useState(25000000);
  const [closingCosts, setClosingCosts] = useState(3000000);
  const [avgMonthlyRent, setAvgMonthlyRent] = useState(1200);
  const [operatingExpenseRatio, setOperatingExpenseRatio] = useState(0.35);
  const [interestRate, setInterestRate] = useState(0.065);
  const [loanTermYears, setLoanTermYears] = useState(30);
  const [ltv, setLtv] = useState(75);
  const [exitCapRate, setExitCapRate] = useState(0.06);
  const [holdingPeriod, setHoldingPeriod] = useState(10);
  const [amiTarget, setAmiTarget] = useState('60% AMI - $48,000/year');
  const [gpPartner, setGpPartner] = useState('Aequitas Housing');

  // CALCULATIONS (Memoized for performance)
  const metrics = useMemo(() => {
    const totalProjectCost = purchasePrice + constructionCost + closingCosts;
    const loanAmount = totalProjectCost * (ltv / 100);
    const equityRequired = totalProjectCost - loanAmount;
    const annualDebtService = calculatePMT(interestRate / 12, loanTermYears * 12, loanAmount) * 12 * -1;
    
    const grossPotentialRent = totalUnits * avgMonthlyRent * 12;
    const vacancyLoss = grossPotentialRent * 0.05;
    const effectiveGrossIncome = grossPotentialRent - vacancyLoss;
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
    const salePrice = exitNOI / exitCapRate;
    const loanBalance = loanAmount;
    const saleProceeds = salePrice - loanBalance;
    irrStream[irrStream.length - 1] += saleProceeds;
    
    const irr = calculateIRR(irrStream) * 100;
    const totalReturn = (irrStream.reduce((a, b) => a + b, 0) + equityRequired) / equityRequired;
    
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
  }, [purchasePrice, constructionCost, closingCosts, totalUnits, avgMonthlyRent, operatingExpenseRatio, interestRate, loanTermYears, ltv, exitCapRate, holdingPeriod]);

  // Risk Assessment Logic
  const riskAssessment = useMemo(() => [
    { label: 'Financing Risk', level: ltv > 80 ? 'High' : ltv > 70 ? 'Medium' : 'Low' },
    { label: 'Market Risk', level: 'Medium' },
    { label: 'Construction Risk', level: constructionCost > 20000000 ? 'High' : constructionCost > 10000000 ? 'Medium' : 'Low' },
    { label: 'Regulatory Risk', level: 'Low' },
  ], [ltv, constructionCost]);

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
          </p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg font-medium text-sm transition-colors">
          <Download size={16} />
          Export Excel Model
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Deal Parameters */}
        <div className="bg-white rounded-xl p-6 shadow-sm lg:col-span-1">
          <div className="flex items-center gap-2 mb-6">
            <FileText size={20} color="#3b82f6" />
            <h3 className="text-lg font-semibold text-gray-800">Deal Parameters</h3>
          </div>
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
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Construction Cost ($)</label>
              <input
                type="number"
                value={constructionCost}
                onChange={(e) => setConstructionCost(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Closing Costs ($)</label>
              <input
                type="number"
                value={closingCosts}
                onChange={(e) => setClosingCosts(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Average Monthly Rent ($)</label>
              <input
                type="number"
                value={avgMonthlyRent}
                onChange={(e) => setAvgMonthlyRent(Number(e.target.value) || 0)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
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
              <label className="block text-xs font-medium text-gray-600 mb-1.5">Interest Rate (%)</label>
              <input
                type="number"
                step="0.1"
                value={interestRate * 100}
                onChange={(e) => setInterestRate((Number(e.target.value) || 0) / 100)}
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white"
              />
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
              <span className="block text-xl font-bold text-green-600">{metrics.irr.toFixed(2)}%</span>
            </div>
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <span className="block text-xs text-gray-500 mb-1">Equity Multiple</span>
              <span className="block text-xl font-bold text-green-600">{metrics.totalReturn.toFixed(2)}x</span>
            </div>
          </div>

          {/* Cash Flow Chart */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">Annual Cash Flow Analysis ({holdingPeriod} Years)</h3>
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

          {/* Risk Assessment */}
          <div className="bg-white rounded-xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-4">
              <AlertCircle size={20} color="#f97316" />
              <h3 className="text-lg font-semibold text-gray-800">Risk Assessment</h3>
            </div>
            <div className="space-y-3">
              {riskAssessment.map((risk, index) => (
                <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-700">{risk.label}</span>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                    risk.level === 'Low' ? 'bg-green-100 text-green-700' :
                    risk.level === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {risk.level}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Underwriting;
