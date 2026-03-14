import { useState, useEffect, useRef } from 'react';
import { Trash2, Calendar, ChevronDown } from 'lucide-react';
import type { Deal } from '../types/deal';
import {
  type PipelineStatus,
  PIPELINE_STATUSES,
  PIPELINE_STATUS_STYLES,
  getPipelineStatus,
  setPipelineStatus,
} from '../types/deal';
import { dealApi } from '../services/dealApi';

type FilterTab = 'All' | 'Analyzing' | 'Data Room' | 'LOI Executed' | 'Under Contract' | 'Closed';

const FILTER_TABS: FilterTab[] = ['All', 'Analyzing', 'Data Room', 'LOI Executed', 'Under Contract', 'Closed'];

const TAB_TO_STATUS: Record<FilterTab, PipelineStatus | null> = {
  'All':            null,
  'Analyzing':      'Analyzing',
  'Data Room':      'Data Room Received',
  'LOI Executed':   'LOI Executed',
  'Under Contract': 'Under Contract',
  'Closed':         'Closed',
};

interface DealsListSidebarProps {
  onSelectDeal: (deal: Deal) => void;
  activeDealId?: number;
  onDealsUpdate?: () => void;
}

// Badge with dropdown for status changes
const PipelineBadge = ({
  dealId,
  status,
  onChange,
}: {
  dealId: number;
  status: PipelineStatus;
  onChange: (s: PipelineStatus) => void;
}) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative" onClick={e => e.stopPropagation()}>
      <button
        onClick={() => setOpen(o => !o)}
        className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium border rounded-full ${PIPELINE_STATUS_STYLES[status]}`}
      >
        {status}
        <ChevronDown size={10} />
      </button>
      {open && (
        <div className="absolute left-0 z-50 mt-1 w-44 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
          {PIPELINE_STATUSES.map(s => (
            <button
              key={s}
              onClick={() => { onChange(s); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 text-xs hover:bg-gray-50 ${s === status ? 'font-semibold' : ''}`}
            >
              <span className={`inline-block px-2 py-0.5 rounded-full border ${PIPELINE_STATUS_STYLES[s]}`}>
                {s}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

const DealsListSidebar = ({ onSelectDeal, activeDealId, onDealsUpdate }: DealsListSidebarProps) => {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeFilter, setActiveFilter] = useState<FilterTab>('All');
  const [pipelineStatuses, setPipelineStatuses] = useState<Record<number, PipelineStatus>>({});

  const fetchDeals = async () => {
    setLoading(true);
    setError(null);
    try {
      const grouped = await dealApi.getDealsGrouped();
      const all = (Object.values(grouped) as Deal[][])
        .flat()
        .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
      setDeals(all);
      // Hydrate pipeline statuses from localStorage
      const statuses: Record<number, PipelineStatus> = {};
      all.forEach(d => {
        if (d.id != null) statuses[d.id] = getPipelineStatus(d.id);
      });
      setPipelineStatuses(statuses);
    } catch (err) {
      console.error('Error fetching deals:', err);
      setError('Failed to load deals');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchDeals(); }, []);

  const handleStatusChange = (dealId: number, status: PipelineStatus) => {
    setPipelineStatus(dealId, status);
    setPipelineStatuses(prev => ({ ...prev, [dealId]: status }));
  };

  const handleDeleteDeal = async (dealId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Are you sure you want to delete this deal?')) return;
    try {
      await dealApi.deleteDeal(dealId);
      await fetchDeals();
      if (onDealsUpdate) onDealsUpdate();
    } catch (err) {
      console.error('Error deleting deal:', err);
      alert('Failed to delete deal. Please try again.');
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  };

  const filterStatus = TAB_TO_STATUS[activeFilter];
  const filteredDeals = filterStatus
    ? deals.filter(d => d.id != null && pipelineStatuses[d.id] === filterStatus)
    : deals;

  if (loading) {
    return (
      <div className="p-6 bg-white shadow-sm rounded-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-800">Underwritten Deals</h3>
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 bg-white shadow-sm rounded-xl">
        <h3 className="mb-4 text-lg font-semibold text-gray-800">Underwritten Deals</h3>
        <div className="p-4 text-sm text-red-800 bg-red-100 border border-red-200 rounded-lg">{error}</div>
        <button
          onClick={fetchDeals}
          className="w-full px-4 py-2 mt-3 text-sm font-medium text-blue-600 transition-colors bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden bg-white shadow-sm rounded-xl">
      {/* Header */}
      <div className="p-4 border-b border-gray-100">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-gray-800">Underwritten Deals</h3>
          <span className="px-2 py-1 text-xs font-medium text-blue-600 rounded-full bg-blue-50">
            {filteredDeals.length}
          </span>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-1">
          {FILTER_TABS.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveFilter(tab)}
              className={`px-2.5 py-1 text-xs font-medium rounded-full border transition-colors ${
                activeFilter === tab
                  ? 'bg-blue-600 text-white border-blue-600'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:bg-gray-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Deal List */}
      <div className="max-h-[600px] overflow-y-auto">
        {filteredDeals.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-gray-500">
              {activeFilter === 'All' ? 'No deals yet. Upload an OM to get started.' : `No deals with status "${activeFilter}".`}
            </p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {filteredDeals.map(deal => {
              const isActive = deal.id === activeDealId;
              const pipelineStatus = deal.id != null ? (pipelineStatuses[deal.id] ?? 'Analyzing') : 'Analyzing';
              return (
                <div
                  key={deal.id}
                  onClick={() => onSelectDeal(deal)}
                  className={`p-3 rounded-lg cursor-pointer transition-all border ${
                    isActive
                      ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-200'
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <h4 className={`text-sm font-semibold truncate ${isActive ? 'text-blue-900' : 'text-gray-800'}`}>
                        {deal.dealName}
                      </h4>
                      <p className="mt-1 text-xs text-gray-600 truncate">{deal.location}</p>
                      {deal.propertyAddress && (
                        <p className="mt-0.5 text-xs text-gray-500 truncate">{deal.propertyAddress}</p>
                      )}
                      <div className="flex items-center gap-2 mt-2">
                        <div className="flex items-center gap-1">
                          <Calendar size={12} className="text-gray-400" />
                          <span className="text-xs text-gray-500">{formatDate(deal.updatedAt)}</span>
                        </div>
                      </div>
                      {/* Pipeline status badge */}
                      <div className="mt-2">
                        {deal.id != null && (
                          <PipelineBadge
                            dealId={deal.id}
                            status={pipelineStatus}
                            onChange={s => handleStatusChange(deal.id!, s)}
                          />
                        )}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDeleteDeal(deal.id!, e)}
                      className="p-1 text-gray-400 transition-colors rounded hover:text-red-600 hover:bg-red-50"
                      aria-label="Delete deal"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {deal.monthlyCashFlow !== undefined && deal.monthlyCashFlow !== null && (
                    <div className="flex items-center justify-between pt-2 mt-2 border-t border-gray-200">
                      <span className="text-xs text-gray-600">Cash Flow:</span>
                      <span className={`text-xs font-semibold ${deal.monthlyCashFlow > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${deal.monthlyCashFlow.toFixed(0)}/mo
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {deals.length > 0 && (
        <div className="p-3 border-t border-gray-200">
          <button
            onClick={fetchDeals}
            className="w-full px-4 py-2 text-sm font-medium text-gray-700 transition-colors bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            Refresh
          </button>
        </div>
      )}
    </div>
  );
};

export default DealsListSidebar;
