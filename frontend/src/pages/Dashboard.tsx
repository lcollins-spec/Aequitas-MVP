import { useState, useEffect } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts';
import {
  Home,
  Users,
  DollarSign,
  TrendingUp,
  Sparkles,
  MapPin,
  ChevronDown,
  Bot,
} from 'lucide-react';
import { dealApi } from '../services/dealApi';
import type { Deal } from '../types/deal';
import { DEAL_STATUS_LABELS, DEAL_STATUS_COLORS } from '../types/deal';

const unitsOverTimeData = [
  { year: '2020', units: 1200 },
  { year: '2021', units: 2000 },
  { year: '2022', units: 2600 },
  { year: '2023', units: 3200 },
  { year: '2024', units: 4200 },
];

const unitsByStateData = [
  { state: 'Virginia', units: 3800 },
  { state: 'New York', units: 3200 },
  { state: 'New Jersey', units: 2900 },
  { state: 'Ohio', units: 3100 },
];

const Dashboard = () => {
  const [dealDescription, setDealDescription] = useState('');
  const [metrics, setMetrics] = useState<{ total_affordable_units?: number; families_housed?: number } | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [recentDeals, setRecentDeals] = useState<Deal[]>([]);
  const [dealsLoading, setDealsLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    const fetchMetrics = async () => {
      try {
        const res = await fetch('/api/v1/metrics');
        if (!res.ok) throw new Error('Network response was not ok');
        const data = await res.json();
        if (mounted) setMetrics(data);
      } catch (err) {
        if (mounted) setMetrics(null);
      } finally {
        if (mounted) setMetricsLoading(false);
      }
    };
    fetchMetrics();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    let mounted = true;
    const fetchRecentDeals = async () => {
      try {
        const deals = await dealApi.getAllDeals(undefined, 10);
        if (mounted) {
          // Sort by updatedAt or createdAt in descending order and take the 4 most recent
          const sortedDeals = deals.sort((a, b) => {
            const dateA = new Date(a.updatedAt || a.createdAt || 0).getTime();
            const dateB = new Date(b.updatedAt || b.createdAt || 0).getTime();
            return dateB - dateA;
          }).slice(0, 4);
          setRecentDeals(sortedDeals);
        }
      } catch (err) {
        console.error('Error fetching recent deals:', err);
        if (mounted) setRecentDeals([]);
      } finally {
        if (mounted) setDealsLoading(false);
      }
    };
    fetchRecentDeals();
    return () => { mounted = false; };
  }, []);

  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gray-50 min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold text-gray-800">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-1">Investment Overview</p>
        </div>
        <div className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 cursor-pointer">
          <span>Last 12 months</span>
          <ChevronDown size={16} />
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl p-5 shadow-sm flex justify-between items-start">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 mb-2">Total Affordable Units</span>
            <span className="text-2xl md:text-3xl font-bold text-gray-800 mb-1">{metricsLoading ? '—' : (metrics?.total_affordable_units ?? 12847)}</span>
            <span className="text-xs font-medium text-green-500">+15.2%</span>
          </div>
          <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center">
            <Home size={24} className="text-blue-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm flex justify-between items-start">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 mb-2">Families Housed</span>
            <span className="text-2xl md:text-3xl font-bold text-gray-800 mb-1">{metricsLoading ? '—' : (metrics?.families_housed ?? 28903)}</span>
            <span className="text-xs font-medium text-green-500">+12.8%</span>
          </div>
          <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center">
            <Users size={24} className="text-purple-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm flex justify-between items-start">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 mb-2">Total Investment</span>
            <span className="text-2xl md:text-3xl font-bold text-gray-800 mb-1">$100M</span>
            <span className="text-xs font-medium text-green-500">+18.7%</span>
          </div>
          <div className="w-12 h-12 bg-green-50 rounded-xl flex items-center justify-center">
            <DollarSign size={24} className="text-green-500" />
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 shadow-sm flex justify-between items-start">
          <div className="flex flex-col">
            <span className="text-xs text-gray-500 mb-2">Avg. 10yr Return</span>
            <span className="text-2xl md:text-3xl font-bold text-gray-800 mb-1">8.2%</span>
            <span className="text-xs font-medium text-green-500">+0.5%</span>
          </div>
          <div className="w-12 h-12 bg-orange-50 rounded-xl flex items-center justify-center">
            <TrendingUp size={24} className="text-orange-500" />
          </div>
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Units Developed Over Time</h3>
          <div className="relative">
            <div className="absolute -left-4 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-gray-500 font-medium">Units</div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={unitsOverTimeData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis 
                  dataKey="year" 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  domain={[0, 6000]}
                  ticks={[0, 1500, 3000, 4500, 6000]}
                  dx={-10}
                />
                <Tooltip />
                <Line
                  type="monotone"
                  dataKey="units"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center text-xs text-gray-500 font-medium mt-2">Year</div>
        </div>

        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <Bot size={20} color="#3b82f6" />
            <span className="text-lg font-semibold text-gray-800">AI Deal Analysis</span>
            <Sparkles size={16} color="#3b82f6" />
          </div>
          <div className="space-y-3">
            <textarea
              placeholder="Describe your potential deal..."
              value={dealDescription}
              onChange={(e) => setDealDescription(e.target.value)}
              className="w-full h-32 p-3 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
            <p className="text-xs text-gray-600">
              Example: 'Looking at a 180-unit apartment complex in Richmond, VA.
              Purchase price $28M, built in 1995, needs some renovations. Current
              rents around $1,100/month, targeting 60% AMI residents. Good
              transit access and growing neighborhood.'
            </p>
            <button className="w-full flex items-center justify-center gap-2 bg-blue-500 hover:bg-blue-600 text-white py-2.5 px-4 rounded-lg font-medium text-sm transition-colors">
              <Sparkles size={16} />
              Analyze Deal
            </button>
          </div>
          <div className="mt-4 flex flex-col items-center justify-center py-6 text-center">
            <Bot size={48} color="#e5e7eb" />
            <p className="text-sm text-gray-500 mt-2">Enter deal details above to get AI-powered analysis</p>
          </div>
        </div>
      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Units by State</h3>
          <div className="relative">
            <div className="absolute -left-4 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-gray-500 font-medium">Units</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={unitsByStateData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                <XAxis 
                  dataKey="state" 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  dy={10}
                />
                <YAxis 
                  axisLine={false} 
                  tickLine={false}
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  domain={[0, 3800]}
                  ticks={[0, 950, 1900, 2850, 3800]}
                  dx={-10}
                />
                <Tooltip />
                <Bar dataKey="units" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={60} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="text-center text-xs text-gray-500 font-medium mt-2">State</div>
        </div>

        <div className="bg-white rounded-xl p-6 shadow-sm">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">Recent Deals</h3>
          <div className="space-y-3">
            {dealsLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : recentDeals.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-sm text-gray-500">No deals saved yet. Create a deal to get started.</p>
              </div>
            ) : (
              recentDeals.map((deal) => {
                const colors = DEAL_STATUS_COLORS[deal.status];
                return (
                  <div key={deal.id || deal.dealName} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors cursor-pointer">
                    <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center flex-shrink-0">
                      <MapPin size={16} color="#6b7280" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="block font-medium text-gray-800 text-sm">{deal.dealName}</span>
                      <span className="block text-xs text-gray-500 mt-0.5">
                        {deal.location}
                        {deal.propertyAddress && ` • ${deal.propertyAddress}`}
                      </span>
                      {deal.purchasePrice && (
                        <span className="block text-xs text-gray-600 mt-1">
                          ${(deal.purchasePrice / 1000000).toFixed(2)}M
                        </span>
                      )}
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium flex-shrink-0 border ${colors.bg} ${colors.text} ${colors.border}`}>
                      {DEAL_STATUS_LABELS[deal.status]}
                    </span>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
