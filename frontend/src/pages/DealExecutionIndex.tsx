import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Briefcase, MapPin, DollarSign, Calendar, ArrowRight } from 'lucide-react';
import {
  getAllDealExecutions, loadAllExecutionsFromBackend,
  type DealExecutionRecord,
} from '../types/dealExecution';
import {
  getPipelineStatus, syncPipelineStatusesFromBackend,
  type PipelineStatus,
  PIPELINE_STATUS_STYLES,
} from '../types/deal';

const fmt$ = (v?: number) => {
  if (!v) return '—';
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${v.toFixed(0)}`;
};

const fmtDate = (iso?: string) => {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

interface CardData extends DealExecutionRecord {
  pipelineStatus: PipelineStatus;
}

const DealExecutionIndex = () => {
  const [cards, setCards] = useState<CardData[]>([]);

  const buildCards = () => {
    const records = getAllDealExecutions().sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
    setCards(records.map(r => ({ ...r, pipelineStatus: getPipelineStatus(r.dealId) })));
  };

  useEffect(() => {
    buildCards();
    // Background: hydrate from backend then re-render
    loadAllExecutionsFromBackend().then(records => {
      const ids = records.map(r => r.dealId);
      if (ids.length > 0) {
        syncPipelineStatusesFromBackend(ids).then(buildCards);
      }
    });
  }, []);

  return (
    <div className="p-4 md:p-6 lg:p-8 bg-gray-50 min-h-screen">
      <div className="mb-8">
        <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Pipeline</p>
        <h1 className="text-2xl font-semibold text-gray-900">Deal Execution</h1>
        <p className="text-sm text-gray-500 mt-1">
          {cards.length} deal{cards.length !== 1 ? 's' : ''} in execution
        </p>
      </div>

      {cards.length === 0 ? (
        <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 text-center">
          <div className="w-14 h-14 bg-blue-50 rounded-full flex items-center justify-center">
            <Briefcase size={26} className="text-blue-400" />
          </div>
          <div>
            <p className="text-gray-700 font-medium">No deals in execution yet</p>
            <p className="text-sm text-gray-400 mt-1 max-w-xs">
              Advance a deal to <strong>Data Room Received</strong> on the Underwriting page to begin.
            </p>
          </div>
          <Link
            to="/underwriting"
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-xl transition-colors"
          >
            Go to Underwriting <ArrowRight size={14} />
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {cards.map(card => {
            const statusStyle = PIPELINE_STATUS_STYLES[card.pipelineStatus];
            const pp = card.loiData?.purchasePrice ?? card.purchasePrice;
            const targetClose = card.loiData?.targetCloseDate;
            const stage = card.stage ?? 1;
            const stageLabel = stage === 1 ? 'Data Room' : stage === 2 ? 'Due Diligence' : 'Closing';
            const stageDot =
              stage === 1 ? 'bg-blue-400' :
              stage === 2 ? 'bg-amber-400' :
                            'bg-green-400';

            return (
              <Link
                key={card.dealId}
                to={`/deal-execution/${card.dealId}`}
                className="group bg-white rounded-xl p-5 shadow-sm border border-gray-100 hover:border-blue-200 hover:shadow-md transition-all"
              >
                {/* Top row: status badge + stage */}
                <div className="flex items-center justify-between mb-3">
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${statusStyle}`}>
                    {card.pipelineStatus}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <div className={`w-2 h-2 rounded-full ${stageDot}`} />
                    <span className="text-xs text-gray-400">{stageLabel}</span>
                  </div>
                </div>

                {/* Deal name */}
                <h2 className="text-base font-semibold text-gray-900 group-hover:text-blue-600 transition-colors leading-tight mb-1">
                  {card.dealName}
                </h2>

                {/* Location */}
                {(card.propertyAddress ?? card.location) && (
                  <div className="flex items-center gap-1 mb-3">
                    <MapPin size={11} className="text-gray-300 flex-shrink-0" />
                    <span className="text-xs text-gray-400 truncate">
                      {card.propertyAddress ?? card.location}
                    </span>
                  </div>
                )}

                {/* Metrics row */}
                <div className="flex items-center gap-4 pt-3 border-t border-gray-50">
                  <div className="flex items-center gap-1">
                    <DollarSign size={12} className="text-gray-300" />
                    <span className="text-xs font-medium text-gray-700">{fmt$(pp)}</span>
                  </div>
                  {targetClose && (
                    <div className="flex items-center gap-1">
                      <Calendar size={12} className="text-gray-300" />
                      <span className="text-xs text-gray-500">Close {fmtDate(targetClose)}</span>
                    </div>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default DealExecutionIndex;
