import { useState } from 'react';
import { Search, Star, Bookmark } from 'lucide-react';
import type { Grant, GrantFilters, GrantStatus, CompatibilityLevel } from '../types/grant';

// Mock data - replace with API calls later
const mockGrants: Grant[] = [
  {
    id: '1',
    title: 'Loan Housing Voucher Tax Credits (LIHTC)',
    description: 'Federal tax credits for affordable rental housing development',
    type: 'Tax Credit',
    status: 'open',
    eligibility: 'Up to $2.1M per project',
    deadline: '2024-10-15',
    requirement: 'National',
    compatibility: 'High',
    amount: 'Up to $2.0M per project',
    isFeatured: true,
    category: 'federal',
  },
  {
    id: '2',
    title: 'HOME Investment Partnership Program',
    description: 'Flexible funding for affordable housing activities',
    type: 'Grant',
    status: 'open',
    eligibility: 'Up to $10M annually',
    deadline: '2024-09-30',
    requirement: 'National',
    compatibility: 'Match Required',
    amount: 'Up to $10M annually',
    isFeatured: true,
    category: 'federal',
  },
  {
    id: '3',
    title: 'Opportunity Zone Tax Incentives',
    description: 'Tax benefits for investments in designated zones',
    type: 'Tax Credit',
    status: 'open',
    eligibility: 'Varies by investment',
    requirement: 'Ongoing',
    compatibility: 'High',
    amount: 'Varies by investment',
    isFeatured: true,
    category: 'federal',
  },
  {
    id: '4',
    title: 'Texas Housing Trust Fund',
    description: 'State funding for affordable housing development and preservation',
    type: 'Grant',
    status: 'open',
    eligibility: 'Up to $3M per project',
    deadline: '2024-11-01',
    requirement: 'Texas',
    compatibility: 'High',
    category: 'state',
  },
  {
    id: '5',
    title: 'Section 8 Project-Based Vouchers',
    description: 'Long-term rental subsidies for affordable housing projects',
    type: 'Federal',
    status: 'open',
    eligibility: 'Based on unit count',
    requirement: 'National',
    compatibility: 'High',
    category: 'federal',
  },
  {
    id: '6',
    title: 'Community Development Block Grant',
    description: 'Flexible federal funding for community development',
    type: 'Grant',
    status: 'open',
    eligibility: 'Up to $5M',
    deadline: '2024-12-15',
    requirement: 'Metro areas',
    compatibility: 'Match Required',
    category: 'federal',
  },
  {
    id: '7',
    title: 'Arizona Affordable Housing Tax Credit',
    description: 'State tax credits for affordable housing projects',
    type: 'Tax Credit',
    status: 'open',
    eligibility: 'Up to $2M per project',
    deadline: '2024-10-30',
    requirement: 'Arizona',
    compatibility: 'High',
    category: 'state',
  },
  {
    id: '8',
    title: 'Austin Housing Trust',
    description: 'Local funding for affordable housing in Austin metro',
    type: 'Grant',
    status: 'open',
    eligibility: 'Up to $1.5M',
    deadline: '2024-09-15',
    requirement: 'Austin, TX',
    compatibility: 'High',
    category: 'local',
  },
];

const getStatusColor = (status: GrantStatus): { bg: string; text: string } => {
  switch (status) {
    case 'open':
      return { bg: 'bg-green-50', text: 'text-green-700' };
    case 'closed':
      return { bg: 'bg-red-50', text: 'text-red-700' };
    case 'upcoming':
      return { bg: 'bg-blue-50', text: 'text-blue-700' };
    default:
      return { bg: 'bg-gray-50', text: 'text-gray-700' };
  }
};

const getCompatibilityColor = (compatibility: CompatibilityLevel): { bg: string; text: string } => {
  switch (compatibility) {
    case 'High':
      return { bg: 'bg-green-50', text: 'text-green-700' };
    case 'Match Required':
      return { bg: 'bg-orange-50', text: 'text-orange-700' };
    case 'Low':
      return { bg: 'bg-red-50', text: 'text-red-700' };
    default:
      return { bg: 'bg-gray-50', text: 'text-gray-700' };
  }
};

const Grants = () => {
  const [filters, setFilters] = useState<GrantFilters>({
    search: '',
    category: 'all',
  });

  const getCategoryCount = (category: string): number => {
    if (category === 'all') return mockGrants.length;
    if (category === 'federal') return mockGrants.filter(g => g.category === 'federal').length;
    if (category === 'state') return mockGrants.filter(g => g.category === 'state').length;
    if (category === 'local') return mockGrants.filter(g => g.category === 'local').length;
    if (category === 'tax-credit') return mockGrants.filter(g => g.type === 'Tax Credit').length;
    if (category === 'direct-grant') return mockGrants.filter(g => g.type === 'Grant').length;
    return 0;
  };

  const filteredGrants = mockGrants.filter(grant => {
    const matchesSearch = grant.title.toLowerCase().includes(filters.search.toLowerCase()) ||
                         grant.description.toLowerCase().includes(filters.search.toLowerCase());

    let matchesCategory = true;
    if (filters.category !== 'all') {
      if (filters.category === 'tax-credit') {
        matchesCategory = grant.type === 'Tax Credit';
      } else if (filters.category === 'direct-grant') {
        matchesCategory = grant.type === 'Grant';
      } else {
        matchesCategory = grant.category === filters.category;
      }
    }

    return matchesSearch && matchesCategory;
  });

  const featuredGrants = filteredGrants.filter(g => g.isFeatured);
  const allGrants = filteredGrants.filter(g => !g.isFeatured);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 md:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold text-gray-800">Grants & Tax Credits</h1>
            <p className="text-sm text-gray-500 mt-1">Discover funding opportunities for affordable housing development</p>
          </div>
          <button className="px-4 py-2 bg-black text-white text-sm font-medium rounded-lg hover:bg-gray-800 transition-colors">
            CREATE APP
          </button>
        </div>

        {/* Search Bar */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
            <input
              type="text"
              placeholder="Search grants and tax credits..."
              value={filters.search}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          <button
            onClick={() => setFilters({ ...filters, category: 'all' })}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filters.category === 'all'
                ? 'bg-black text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            All Opportunities ({getCategoryCount('all')})
          </button>
          <button
            onClick={() => setFilters({ ...filters, category: 'federal' })}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filters.category === 'federal'
                ? 'bg-black text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Federal ({getCategoryCount('federal')})
          </button>
          <button
            onClick={() => setFilters({ ...filters, category: 'state' })}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filters.category === 'state'
                ? 'bg-black text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            State ({getCategoryCount('state')})
          </button>
          <button
            onClick={() => setFilters({ ...filters, category: 'local' })}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filters.category === 'local'
                ? 'bg-black text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Local ({getCategoryCount('local')})
          </button>
          <button
            onClick={() => setFilters({ ...filters, category: 'tax-credit' })}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filters.category === 'tax-credit'
                ? 'bg-black text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Tax Credits ({getCategoryCount('tax-credit')})
          </button>
          <button
            onClick={() => setFilters({ ...filters, category: 'direct-grant' })}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filters.category === 'direct-grant'
                ? 'bg-black text-white'
                : 'bg-white text-gray-700 border border-gray-200 hover:bg-gray-50'
            }`}
          >
            Direct Grants ({getCategoryCount('direct-grant')})
          </button>
        </div>

        {/* Featured Opportunities */}
        {featuredGrants.length > 0 && (
          <div className="mb-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-4">Featured Opportunities</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {featuredGrants.map((grant) => {
                const statusColors = getStatusColor(grant.status);
                return (
                  <div key={grant.id} className="bg-white rounded-lg border border-gray-200 p-5 hover:shadow-md transition-shadow">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-semibold text-gray-800 text-sm flex-1 pr-2">{grant.title}</h3>
                      <span className={`px-2.5 py-1 rounded text-xs font-medium capitalize ${statusColors.bg} ${statusColors.text}`}>
                        {grant.status}
                      </span>
                    </div>
                    <p className="text-xs text-gray-600 mb-4">{grant.description}</p>
                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Amount:</span>
                        <span className="text-gray-800 font-medium">{grant.amount || grant.eligibility}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="text-gray-500">Deadline:</span>
                        <span className="text-gray-800 font-medium">{grant.deadline || 'Ongoing'}</span>
                      </div>
                    </div>
                    <button className="w-full py-2 bg-black text-white text-xs font-medium rounded hover:bg-gray-800 transition-colors">
                      View Details
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* All Opportunities */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-800">
              All Opportunities ({allGrants.length})
            </h2>
            <button className="text-sm text-gray-600 hover:text-gray-800">
              Sort by: Deadline ▼
            </button>
          </div>
          <div className="space-y-4">
            {allGrants.map((grant) => {
              const statusColors = getStatusColor(grant.status);
              const compatibilityColors = getCompatibilityColor(grant.compatibility);

              return (
                <div key={grant.id} className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-md transition-shadow">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="font-semibold text-gray-800">{grant.title}</h3>
                        <span className={`px-2.5 py-1 rounded text-xs font-medium ${statusColors.bg} ${statusColors.text}`}>
                          {grant.type}
                        </span>
                        <span className={`px-2.5 py-1 rounded text-xs font-medium capitalize ${statusColors.bg} ${statusColors.text}`}>
                          {grant.status}
                        </span>
                        {grant.category === 'federal' && (
                          <span className="px-2.5 py-1 rounded text-xs font-medium bg-blue-50 text-blue-700">
                            Federal
                          </span>
                        )}
                        {grant.category === 'state' && (
                          <span className="px-2.5 py-1 rounded text-xs font-medium bg-purple-50 text-purple-700">
                            State
                          </span>
                        )}
                        <Star size={16} className="text-yellow-500 fill-yellow-500" />
                      </div>
                      <p className="text-sm text-gray-600 mb-4">{grant.description}</p>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Eligibility</div>
                          <div className="text-sm text-gray-800 font-medium">{grant.eligibility}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Deadline</div>
                          <div className="text-sm text-gray-800 font-medium">{grant.deadline || 'Ongoing'}</div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1">Requirement</div>
                          <div className="text-sm text-gray-800 font-medium">{grant.requirement}</div>
                        </div>
                      </div>
                    </div>
                    <div className="ml-6 flex flex-col items-end gap-2">
                      <div className="text-right">
                        <div className="text-xs text-gray-500 mb-1">Compatibility</div>
                        <span className={`px-2.5 py-1 rounded text-xs font-medium ${compatibilityColors.bg} ${compatibilityColors.text}`}>
                          {grant.compatibility}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between pt-4 border-t border-gray-100">
                    <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                      View Requirements →
                    </button>
                    <div className="flex items-center gap-2">
                      <button className="px-4 py-2 bg-black text-white text-sm font-medium rounded hover:bg-gray-800 transition-colors">
                        View Details
                      </button>
                      <button className="px-3 py-2 border border-gray-200 rounded hover:bg-gray-50 transition-colors">
                        <Bookmark size={16} className="text-gray-600" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Grants;
