import { Fragment, useEffect, useMemo, useState } from 'react';
import { Plus, Printer, LayoutGrid, List as ListIcon, X, CheckCircle2, Circle, ChevronDown, ChevronUp, Pencil, ExternalLink, Eye, EyeOff, Trash2 } from 'lucide-react';
import * as sourcingApi from '../services/sourcingApi';
import type { SourcingProperty, SourcingOperator } from '../services/sourcingApi';
import { dealApi } from '../services/dealApi';
import type { Deal, PipelineStatus } from '../types/deal';
import { getPipelineStatus, setPipelineStatus, PIPELINE_STATUSES, PIPELINE_STATUS_STYLES } from '../types/deal';
import { getDealExecution, patchDealExecution, loadAllExecutionsFromBackend } from '../types/dealExecution';

// ── Types ───────────────────────────────────────────────────────────────────

type ViewStyle = 'card' | 'table';
type DetailLevel = 'summary' | 'detail';

interface DealDocLink {
  documentType: string;
  fileName: string;
  driveUrl: string;
}

// A row is either a real, underwritten Deal (source of truth for real deals —
// most never pass through the sourcing CRM) or a pure pre-underwriting
// SourcingProperty prospect that has no Deal yet. A property WITH a deal_id
// is folded into its linked deal's row, never shown separately.
interface Row {
  id: string;
  dealId: number | null;
  property: SourcingProperty | null;
  deal: Deal | null;
  name: string;
  market: string;
  units: number | null;
  neighborhood: string;
  businessPlan: string;
  targetReturn: string;
  operatorId: string | null;
  operatorNameFallback: string;
  omUrl: string | null;
  documents: DealDocLink[];
  hidden: boolean;
  stage: string;
  stageOptions: string[];
  stageOrder: number;
  stageStyle: string;
  /** True only for a real deal with no linked SourcingProperty — its narrative
   *  fields live in DealExecutionRecord and are editable right on this page. */
  editableInline: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROP_STAGE_ORDER = ['Identified', 'Contacted', 'In Conversation', 'LOI', 'Dead'];

const PROP_STAGE_STYLES: Record<string, string> = {
  'Identified':      'bg-gray-100 text-gray-700 border-gray-200',
  'Contacted':       'bg-yellow-50 text-yellow-700 border-yellow-200',
  'In Conversation': 'bg-gray-50 text-gray-700 border-gray-200',
  'LOI':             'bg-purple-50 text-purple-700 border-purple-200',
  'Dead':            'bg-red-50 text-red-700 border-red-200',
};

const LS_VIEW_STYLE = 'investor_pipeline_view_style';
const LS_DETAIL_LEVEL = 'investor_pipeline_detail_level';

// ── Helpers ───────────────────────────────────────────────────────────────────

function stageStyleFor(stage: string, isDealStage: boolean): string {
  if (isDealStage) return PIPELINE_STATUS_STYLES[stage as keyof typeof PIPELINE_STATUS_STYLES] || 'bg-gray-100 text-gray-600 border-gray-200';
  return PROP_STAGE_STYLES[stage] || 'bg-gray-100 text-gray-700 border-gray-200';
}

function pct(n: number): string {
  const v = Math.abs(n) <= 1 ? n * 100 : n;
  return `${v.toFixed(1)}%`;
}

function returnDisplay(row: Row): string {
  // Deal.capRate/irr are only populated when explicitly set (e.g. from an
  // extracted OM) — most underwritten deals compute returns live from
  // underwritingJson in the Underwriting page and never persist them back
  // to the deal record. So a real deal with neither field set is NOT
  // necessarily un-underwritten — fall back to the manually-entered target
  // return (still editable) before assuming nothing exists.
  if (row.deal?.irr != null) return `${pct(row.deal.irr)} IRR`;
  if (row.deal?.capRate != null) return `${pct(row.deal.capRate)} Cap Rate`;
  if (row.targetReturn) {
    const t = row.targetReturn.trim();
    return /target/i.test(t) ? t : `${t} (target)`;
  }
  return row.deal ? 'Underwriting pending' : '—';
}

function unitsFromUnderwriting(json?: string): number | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return typeof parsed.totalUnits === 'number' ? parsed.totalUnits : null;
  } catch {
    return null;
  }
}

function operatorDisplay(row: Row, operatorsById: Record<string, SourcingOperator>): { name: string; firm?: string; status?: string; propertiesManaged?: string } | null {
  const linked = row.operatorId ? operatorsById[row.operatorId] : undefined;
  if (linked) return { name: linked.name, firm: linked.firm, status: linked.status, propertiesManaged: linked.properties_managed };
  if (row.operatorNameFallback) return { name: row.operatorNameFallback };
  return null;
}

// ── Root component ────────────────────────────────────────────────────────────

const InvestorPipeline = () => {
  const [deals, setDeals] = useState<Deal[]>([]);
  const [properties, setProperties] = useState<SourcingProperty[]>([]);
  const [operators, setOperators] = useState<SourcingOperator[]>([]);
  const [documentsByDealId, setDocumentsByDealId] = useState<Record<number, DealDocLink[]>>({});
  const [execVersion, setExecVersion] = useState(0); // bumped after any execution-data write to force row recompute
  const [loading, setLoading] = useState(true);
  const [viewStyle, setViewStyle] = useState<ViewStyle>(
    () => (localStorage.getItem(LS_VIEW_STYLE) as ViewStyle) || 'card'
  );
  const [detailLevel, setDetailLevel] = useState<DetailLevel>(
    () => (localStorage.getItem(LS_DETAIL_LEVEL) as DetailLevel) || 'summary'
  );
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const [showAdd, setShowAdd] = useState(false);
  const [editingDealId, setEditingDealId] = useState<number | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => { localStorage.setItem(LS_VIEW_STYLE, viewStyle); }, [viewStyle]);
  useEffect(() => { localStorage.setItem(LS_DETAIL_LEVEL, detailLevel); setOverrides({}); }, [detailLevel]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [allDeals, props, ops] = await Promise.all([
          dealApi.getAllDeals(undefined, 200),
          sourcingApi.fetchProperties(),
          sourcingApi.fetchOperators(),
          loadAllExecutionsFromBackend(),
        ]);
        if (cancelled) return;
        setDeals(allDeals);
        setProperties(props);
        setOperators(ops);
        setExecVersion(v => v + 1);

        const docPairs = await Promise.all(allDeals.map(async d => {
          if (!d.id) return [null, [] as DealDocLink[]] as const;
          try {
            const r = await fetch(`/api/v1/documents/${d.id}`);
            if (!r.ok) return [d.id, [] as DealDocLink[]] as const;
            const j = await r.json();
            const docs: DealDocLink[] = (j.documents || []).map((doc: any) => ({
              documentType: doc.documentType, fileName: doc.fileName, driveUrl: doc.driveUrl,
            }));
            return [d.id, docs] as const;
          } catch {
            return [d.id, [] as DealDocLink[]] as const;
          }
        }));
        if (cancelled) return;
        const map: Record<number, DealDocLink[]> = {};
        docPairs.forEach(([id, docs]) => { if (id != null) map[id] = docs; });
        setDocumentsByDealId(map);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const operatorsById = useMemo(() => {
    const map: Record<string, SourcingOperator> = {};
    operators.forEach(o => { map[o.id] = o; });
    return map;
  }, [operators]);

  const propsByDealId = useMemo(() => {
    const map: Record<number, SourcingProperty> = {};
    properties.forEach(p => { if (p.deal_id) map[p.deal_id] = p; });
    return map;
  }, [properties]);

  const rows: Row[] = useMemo(() => {
    const dealRows: Row[] = deals.filter(d => d.id != null).map(deal => {
      const linkedProp = propsByDealId[deal.id!] || null;
      const exec = getDealExecution(deal.id!);
      const stage = getPipelineStatus(deal.id!);
      const units = linkedProp?.units || exec?.totalUnits || unitsFromUnderwriting(deal.underwritingJson) || null;
      const docs = documentsByDealId[deal.id!] || [];
      const omDoc = docs.find(d => d.documentType === 'OM');
      return {
        id: `deal-${deal.id}`,
        dealId: deal.id!,
        property: linkedProp,
        deal,
        name: deal.dealName || linkedProp?.address || 'Untitled deal',
        market: linkedProp?.market || deal.location || '',
        units,
        neighborhood: linkedProp?.neighborhood || exec?.neighborhood || '',
        businessPlan: linkedProp?.business_plan || exec?.businessPlan || '',
        targetReturn: linkedProp?.target_return || exec?.targetReturn || '',
        operatorId: linkedProp?.operator_id || exec?.operatorId || null,
        operatorNameFallback: linkedProp?.operator_name || '',
        omUrl: linkedProp?.om_drive_url || omDoc?.driveUrl || null,
        documents: docs,
        hidden: !!exec?.hiddenFromInvestorView,
        stage,
        stageOptions: PIPELINE_STATUSES,
        stageOrder: 100 + Math.max(0, PIPELINE_STATUSES.indexOf(stage)),
        stageStyle: stageStyleFor(stage, true),
        editableInline: !linkedProp,
      };
    });

    const orphanPropRows: Row[] = properties.filter(p => !p.deal_id).map(property => {
      const stage = property.status || 'Identified';
      const idx = PROP_STAGE_ORDER.indexOf(stage);
      return {
        id: `prop-${property.id}`,
        dealId: null,
        property,
        deal: null,
        name: property.address || 'Untitled property',
        market: property.market || '',
        units: property.units || null,
        neighborhood: property.neighborhood || '',
        businessPlan: property.business_plan || '',
        targetReturn: property.target_return || '',
        operatorId: property.operator_id || null,
        operatorNameFallback: property.operator_name || '',
        omUrl: property.om_drive_url || null,
        documents: [],
        hidden: false,
        stage,
        stageOptions: PROP_STAGE_ORDER,
        stageOrder: idx >= 0 ? idx : PROP_STAGE_ORDER.length,
        stageStyle: stageStyleFor(stage, false),
        editableInline: false,
      };
    });

    return [...dealRows, ...orphanPropRows].sort(
      (a, b) => a.stageOrder - b.stageOrder || a.name.localeCompare(b.name)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deals, properties, propsByDealId, documentsByDealId, execVersion]);

  const isExpanded = (id: string) => overrides[id] ?? (detailLevel === 'detail');
  const toggleExpanded = (id: string) => setOverrides(prev => ({ ...prev, [id]: !isExpanded(id) }));

  /** Matches a typed operator name against the existing roster (case-insensitive);
   *  creates a new SourcingOperator record on the fly if nothing matches, so
   *  users can type a brand-new operator without leaving this page. */
  const resolveOperatorId = async (name: string): Promise<string | null> => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = operators.find(o => o.name.toLowerCase() === trimmed.toLowerCase());
    if (existing) return existing.id;
    const created = await sourcingApi.createOperator({
      id: Date.now().toString(),
      market: '', name: trimmed, firm: '', status: 'prospecting',
      properties_managed: '', last_contact_date: '', notes: '',
    });
    setOperators(prev => [...prev, created]);
    return created.id;
  };

  const changeStage = async (row: Row, newStage: string) => {
    if (row.dealId != null) {
      setPipelineStatus(row.dealId, newStage as PipelineStatus);
      setExecVersion(v => v + 1); // getPipelineStatus reads localStorage synchronously — force rows to recompute
    } else if (row.property) {
      const updated = await sourcingApi.updateProperty(row.property.id, { status: newStage });
      setProperties(prev => prev.map(p => p.id === updated.id ? updated : p));
    }
  };

  /** Real deals are only ever soft-hidden from this deck — the Deal itself,
   *  and everywhere else it's shown (Dashboard, GPPortfolio, etc.), is untouched. */
  const toggleHidden = (dealId: number, hide: boolean) => {
    patchDealExecution(dealId, { hiddenFromInvestorView: hide });
    setExecVersion(v => v + 1);
  };

  /** Pre-underwriting prospects have no Deal record, no documents, nothing else
   *  referencing them — an actual delete here is low-consequence and reversible
   *  only via "Add Deal" again, so a plain confirm is enough (no soft-hide needed). */
  const deleteProspect = async (property: SourcingProperty) => {
    if (!window.confirm(`Remove "${property.address || 'this property'}" from the pipeline? This can't be undone.`)) return;
    await sourcingApi.deleteProperty(property.id);
    setProperties(prev => prev.filter(p => p.id !== property.id));
  };

  const addProperty = async (payload: {
    address: string; market: string; neighborhood: string; units: number;
    business_plan: string; target_return: string; operatorName: string; status: string;
  }) => {
    const operatorId = await resolveOperatorId(payload.operatorName);
    const created = await sourcingApi.createProperty({
      id: Date.now().toString(),
      market: payload.market,
      address: payload.address,
      units: payload.units,
      transaction_type: 'Acquisition',
      owner_name: '',
      operator_name: payload.operatorName,
      contact_name: '', contact_phone: '', contact_email: '',
      status: payload.status,
      priority: 'medium',
      notes: '',
      deal_id: null,
      neighborhood: payload.neighborhood,
      business_plan: payload.business_plan,
      target_return: payload.target_return,
      operator_id: operatorId,
    });
    setProperties(prev => [...prev, created]);
    setShowAdd(false);
  };

  const saveDealNarrative = async (dealId: number, patch: {
    businessPlan: string; targetReturn: string; neighborhood: string; operatorName: string; units: number | null;
  }) => {
    const operatorId = await resolveOperatorId(patch.operatorName);
    patchDealExecution(dealId, {
      businessPlan: patch.businessPlan,
      targetReturn: patch.targetReturn,
      neighborhood: patch.neighborhood,
      operatorId: operatorId || undefined,
      totalUnits: patch.units ?? undefined,
    });
    setExecVersion(v => v + 1);
    setEditingDealId(null);
  };

  const editingRow = editingDealId != null ? rows.find(r => r.dealId === editingDealId) || null : null;
  const hiddenCount = rows.filter(r => r.hidden).length;
  const visibleRows = showHidden ? rows : rows.filter(r => !r.hidden);

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="no-print flex items-center justify-between flex-wrap gap-3 mb-6">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Investor Pipeline</h1>
          <p className="text-sm text-gray-500 mt-0.5">A walkthrough-ready snapshot of the current deal pipeline.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-white border border-gray-200 rounded-lg p-1">
            <button
              onClick={() => setViewStyle('card')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewStyle === 'card' ? 'bg-primary-800 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <LayoutGrid size={13} /> Cards
            </button>
            <button
              onClick={() => setViewStyle('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${viewStyle === 'table' ? 'bg-primary-800 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              <ListIcon size={13} /> Table
            </button>
          </div>
          <div className="flex items-center bg-white border border-gray-200 rounded-lg p-1">
            <button
              onClick={() => setDetailLevel('summary')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${detailLevel === 'summary' ? 'bg-primary-800 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Summary
            </button>
            <button
              onClick={() => setDetailLevel('detail')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${detailLevel === 'detail' ? 'bg-primary-800 text-white' : 'text-gray-600 hover:bg-gray-50'}`}
            >
              Detail
            </button>
          </div>
          {hiddenCount > 0 && (
            <button
              onClick={() => setShowHidden(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border rounded-lg transition-colors ${showHidden ? 'bg-gray-800 text-white border-gray-800' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              {showHidden ? <Eye size={13} /> : <EyeOff size={13} />} Hidden ({hiddenCount})
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-gray-200 bg-white text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <Printer size={13} /> Print / Save PDF
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium bg-primary-800 text-white rounded-lg hover:bg-primary-700 transition-colors shadow-sm"
          >
            <Plus size={14} /> Add Deal
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : visibleRows.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm p-12 text-center text-gray-400">
          <p>No deals in the pipeline yet.</p>
        </div>
      ) : viewStyle === 'card' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {visibleRows.map(row => (
            <PipelineCard
              key={row.id}
              row={row}
              operatorsById={operatorsById}
              expanded={isExpanded(row.id)}
              onToggle={() => toggleExpanded(row.id)}
              onEdit={row.editableInline ? () => setEditingDealId(row.dealId) : undefined}
              onStageChange={stage => changeStage(row, stage)}
              onHide={row.dealId != null ? hide => toggleHidden(row.dealId!, hide) : undefined}
              onDelete={row.property && row.dealId == null ? () => deleteProspect(row.property!) : undefined}
            />
          ))}
        </div>
      ) : (
        <PipelineTable
          rows={visibleRows}
          operatorsById={operatorsById}
          isExpanded={isExpanded}
          onToggle={toggleExpanded}
          onEdit={id => setEditingDealId(id)}
          onStageChange={changeStage}
          onHide={toggleHidden}
          onDelete={deleteProspect}
        />
      )}

      {showAdd && (
        <AddDealModal operatorNames={operators.map(o => o.name)} onSave={addProperty} onClose={() => setShowAdd(false)} />
      )}

      {editingRow && editingRow.dealId != null && (
        <EditNarrativeModal
          row={editingRow}
          operatorsById={operatorsById}
          operatorNames={operators.map(o => o.name)}
          onSave={patch => saveDealNarrative(editingRow.dealId!, patch)}
          onClose={() => setEditingDealId(null)}
        />
      )}

      <style>{`
        @media print {
          .no-print { display: none !important; }
          aside { display: none !important; }
          main { margin-left: 0 !important; }
          .pipeline-card, .pipeline-row { page-break-inside: avoid; }
        }
      `}</style>
    </div>
  );
};

// ── Card view ─────────────────────────────────────────────────────────────────

interface CardProps {
  row: Row;
  operatorsById: Record<string, SourcingOperator>;
  expanded: boolean;
  onToggle: () => void;
  onEdit?: () => void;
  onStageChange: (stage: string) => void;
  onHide?: (hide: boolean) => void;
  onDelete?: () => void;
}

const PipelineCard = ({ row, operatorsById, expanded, onToggle, onEdit, onStageChange, onHide, onDelete }: CardProps) => {
  const op = operatorDisplay(row, operatorsById);

  return (
    <div className={`pipeline-card bg-white rounded-xl shadow-sm border p-5 ${row.hidden ? 'border-gray-200 opacity-60' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <h3 className="text-sm font-semibold text-gray-800 leading-snug truncate">{row.name}</h3>
          {row.hidden && <span className="no-print flex-shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">Hidden</span>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <StageSelect row={row} onChange={onStageChange} />
          {onEdit && (
            <button onClick={onEdit} className="no-print text-gray-400 hover:text-primary-700 transition-colors" title="Edit business plan / operator / neighborhood">
              <Pencil size={12} />
            </button>
          )}
          {onHide && (
            <button onClick={() => onHide(!row.hidden)} className="no-print text-gray-400 hover:text-gray-700 transition-colors" title={row.hidden ? 'Show in investor deck' : 'Hide from investor deck'}>
              {row.hidden ? <Eye size={12} /> : <EyeOff size={12} />}
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} className="no-print text-gray-400 hover:text-red-600 transition-colors" title="Delete">
              <Trash2 size={12} />
            </button>
          )}
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-3">{row.market}</p>

      <div className="flex items-center gap-4 text-xs text-gray-600 mb-2">
        <span>{row.units != null ? `${row.units} units` : 'Units n/a'}</span>
        <span className="font-medium text-gray-800">{returnDisplay(row)}</span>
        <OmLink url={row.omUrl} />
      </div>

      {!expanded && row.businessPlan && (
        <p className="text-xs text-gray-500 line-clamp-1">{row.businessPlan}</p>
      )}

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-100 space-y-3">
          {row.neighborhood && (
            <p className="text-xs text-gray-600 leading-relaxed">{row.neighborhood}</p>
          )}
          {row.businessPlan ? (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Business Plan</p>
              <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{row.businessPlan}</p>
            </div>
          ) : row.editableInline ? (
            <p className="text-xs text-gray-400 italic">No business plan yet — click the pencil icon to add one.</p>
          ) : null}
          {op && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Target Operator</p>
              <p className="text-xs text-gray-700">
                {op.name}{op.firm ? ` (${op.firm})` : ''}
              </p>
              {(op.status || op.propertiesManaged) && (
                <p className="text-[11px] text-gray-400 mt-0.5">
                  {[op.status, op.propertiesManaged ? `${op.propertiesManaged} properties managed` : null].filter(Boolean).join(' · ')}
                </p>
              )}
            </div>
          )}
          <DocumentLinks documents={row.documents} />
        </div>
      )}

      <button
        onClick={onToggle}
        className="no-print mt-3 flex items-center gap-1 text-xs text-primary-700 hover:text-primary-800 font-medium"
      >
        {expanded ? <><ChevronUp size={12} /> Less</> : <><ChevronDown size={12} /> More</>}
      </button>
    </div>
  );
};

// ── Shared bits: stage select, OM link, document list ─────────────────────────

const StageSelect = ({ row, onChange }: { row: Row; onChange: (stage: string) => void }) => (
  <select
    value={row.stage}
    onChange={e => onChange(e.target.value)}
    className={`no-print text-xs px-2 py-0.5 rounded-full border font-medium cursor-pointer ${row.stageStyle}`}
  >
    {row.stageOptions.map(s => <option key={s} value={s}>{s}</option>)}
  </select>
);

const OmLink = ({ url }: { url: string | null }) => {
  const hasOm = !!url;
  const cls = `flex items-center gap-1 ${hasOm ? 'text-green-600 hover:text-green-700' : 'text-gray-400'}`;
  const content = <>{hasOm ? <CheckCircle2 size={12} /> : <Circle size={12} />} {hasOm ? 'OM on file' : 'OM pending'}{hasOm && <ExternalLink size={10} />}</>;
  return hasOm ? (
    <a href={url} target="_blank" rel="noopener noreferrer" className={cls}>{content}</a>
  ) : (
    <span className={cls}>{content}</span>
  );
};

const DocumentLinks = ({ documents }: { documents: DealDocLink[] }) => {
  if (documents.length === 0) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Documents</p>
      <div className="flex flex-wrap gap-1.5">
        {documents.map((doc, i) => (
          <a
            key={i}
            href={doc.driveUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-700 hover:border-primary-400 hover:text-primary-700 transition-colors"
          >
            {doc.documentType} <ExternalLink size={9} />
          </a>
        ))}
      </div>
    </div>
  );
};

// ── Table view ────────────────────────────────────────────────────────────────

interface TableProps {
  rows: Row[];
  operatorsById: Record<string, SourcingOperator>;
  isExpanded: (id: string) => boolean;
  onToggle: (id: string) => void;
  onEdit: (dealId: number) => void;
  onStageChange: (row: Row, stage: string) => void;
  onHide: (dealId: number, hide: boolean) => void;
  onDelete: (property: SourcingProperty) => void;
}

const PipelineTable = ({ rows, operatorsById, isExpanded, onToggle, onEdit, onStageChange, onHide, onDelete }: TableProps) => (
  <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-x-auto">
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-gray-200 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
          <th className="px-4 py-3">Deal</th>
          <th className="px-4 py-3">Stage</th>
          <th className="px-4 py-3">Units</th>
          <th className="px-4 py-3">Return</th>
          <th className="px-4 py-3">OM</th>
          <th className="no-print px-4 py-3"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => {
          const expanded = isExpanded(row.id);
          const op = operatorDisplay(row, operatorsById);
          return (
            <Fragment key={row.id}>
              <tr className={`pipeline-row border-b border-gray-100 last:border-0 ${row.hidden ? 'opacity-60' : ''}`}>
                <td className="px-4 py-3">
                  <p className="font-medium text-gray-800">
                    {row.name}
                    {row.hidden && <span className="no-print ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-gray-200 text-gray-600 font-medium">Hidden</span>}
                  </p>
                  <p className="text-xs text-gray-500">{row.market}</p>
                </td>
                <td className="px-4 py-3">
                  <StageSelect row={row} onChange={stage => onStageChange(row, stage)} />
                </td>
                <td className="px-4 py-3 text-gray-600">{row.units != null ? row.units : '—'}</td>
                <td className="px-4 py-3 font-medium text-gray-800">{returnDisplay(row)}</td>
                <td className="px-4 py-3 text-xs">
                  <OmLink url={row.omUrl} />
                </td>
                <td className="no-print px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-2">
                    {row.editableInline && (
                      <button onClick={() => onEdit(row.dealId!)} className="text-gray-400 hover:text-primary-700" title="Edit">
                        <Pencil size={13} />
                      </button>
                    )}
                    {row.dealId != null && (
                      <button onClick={() => onHide(row.dealId!, !row.hidden)} className="text-gray-400 hover:text-gray-700" title={row.hidden ? 'Show in investor deck' : 'Hide from investor deck'}>
                        {row.hidden ? <Eye size={13} /> : <EyeOff size={13} />}
                      </button>
                    )}
                    {row.property && row.dealId == null && (
                      <button onClick={() => onDelete(row.property!)} className="text-gray-400 hover:text-red-600" title="Delete">
                        <Trash2 size={13} />
                      </button>
                    )}
                    <button onClick={() => onToggle(row.id)} className="text-primary-700 hover:text-primary-800">
                      {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>
                </td>
              </tr>
              {expanded && (
                <tr className="pipeline-row border-b border-gray-100 bg-gray-50/50">
                  <td colSpan={6} className="px-4 py-3 space-y-2">
                    {row.neighborhood && <p className="text-xs text-gray-600">{row.neighborhood}</p>}
                    {row.businessPlan ? (
                      <p className="text-xs text-gray-700 leading-relaxed whitespace-pre-line">{row.businessPlan}</p>
                    ) : row.editableInline ? (
                      <p className="text-xs text-gray-400 italic">No business plan yet.</p>
                    ) : null}
                    {op && (
                      <p className="text-xs text-gray-700">
                        <span className="font-medium">Target Operator:</span> {op.name}{op.firm ? ` (${op.firm})` : ''}
                        {op.status ? ` — ${op.status}` : ''}
                        {op.propertiesManaged ? ` · ${op.propertiesManaged} properties managed` : ''}
                      </p>
                    )}
                    <DocumentLinks documents={row.documents} />
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  </div>
);

// ── Add Deal modal (creates a pre-underwriting SourcingProperty prospect) ─────

interface AddDealModalProps {
  operatorNames: string[];
  onSave: (payload: {
    address: string; market: string; neighborhood: string; units: number;
    business_plan: string; target_return: string; operatorName: string; status: string;
  }) => Promise<void>;
  onClose: () => void;
}

const AddDealModal = ({ operatorNames, onSave, onClose }: AddDealModalProps) => {
  const [address, setAddress] = useState('');
  const [market, setMarket] = useState('');
  const [neighborhood, setNeighborhood] = useState('');
  const [units, setUnits] = useState('');
  const [businessPlan, setBusinessPlan] = useState('');
  const [targetReturn, setTargetReturn] = useState('');
  const [operatorName, setOperatorName] = useState('');
  const [status, setStatus] = useState('Identified');
  const [saving, setSaving] = useState(false);

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-primary-500';

  const save = async () => {
    if (!address.trim()) return;
    setSaving(true);
    try {
      await onSave({
        address, market, neighborhood,
        units: Number(units) || 0,
        business_plan: businessPlan,
        target_return: targetReturn,
        operatorName,
        status,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">Add Deal to Pipeline</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Address / Deal Name *</label>
            <input type="text" value={address} onChange={e => setAddress(e.target.value)} className={inputCls} placeholder="123 Main St, Austin, TX" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Market</label>
              <input type="text" value={market} onChange={e => setMarket(e.target.value)} className={inputCls} placeholder="Austin, TX" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Units</label>
              <input type="number" value={units} onChange={e => setUnits(e.target.value)} className={inputCls} />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Neighborhood / Area</label>
            <textarea rows={2} value={neighborhood} onChange={e => setNeighborhood(e.target.value)} className={`${inputCls} resize-none`} placeholder="e.g. East Austin — walkable corridor" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Business Plan</label>
            <textarea rows={3} value={businessPlan} onChange={e => setBusinessPlan(e.target.value)} className={`${inputCls} resize-none`} placeholder="e.g. Value-add reposition, 18mo hold" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Target Return</label>
            <input type="text" value={targetReturn} onChange={e => setTargetReturn(e.target.value)} className={inputCls} placeholder="~15% IRR (target)" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Target Operator</label>
            <input
              type="text" list="investor-operator-names" value={operatorName}
              onChange={e => setOperatorName(e.target.value)}
              className={inputCls} placeholder="Type an existing or brand-new operator name"
            />
            <datalist id="investor-operator-names">
              {operatorNames.map(n => <option key={n} value={n} />)}
            </datalist>
            <p className="text-[11px] text-gray-400 mt-1">Matches an existing operator by name, or creates a new one.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Stage</label>
            <select value={status} onChange={e => setStatus(e.target.value)} className={inputCls}>
              {PROP_STAGE_ORDER.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
          <button onClick={save} disabled={saving || !address.trim()} className="flex-1 py-2 text-sm font-medium bg-primary-800 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
            {saving ? 'Adding…' : 'Add Deal'}
          </button>
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

// ── Edit Narrative modal (for real deals with no linked SourcingProperty) ─────

interface EditNarrativeModalProps {
  row: Row;
  operatorsById: Record<string, SourcingOperator>;
  operatorNames: string[];
  onSave: (patch: { businessPlan: string; targetReturn: string; neighborhood: string; operatorName: string; units: number | null }) => void;
  onClose: () => void;
}

const EditNarrativeModal = ({ row, operatorsById, operatorNames, onSave, onClose }: EditNarrativeModalProps) => {
  const [neighborhood, setNeighborhood] = useState(row.neighborhood);
  const [businessPlan, setBusinessPlan] = useState(row.businessPlan);
  const [targetReturn, setTargetReturn] = useState(row.targetReturn);
  const [units, setUnits] = useState(row.units != null ? String(row.units) : '');
  const initialOperatorName = row.operatorId ? (operatorsById[row.operatorId]?.name || '') : row.operatorNameFallback;
  const [operatorName, setOperatorName] = useState(initialOperatorName);

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-primary-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <div>
            <h2 className="text-base font-semibold text-gray-800">Edit Investor Details</h2>
            <p className="text-xs text-gray-500 mt-0.5">{row.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Units</label>
            <input type="number" value={units} onChange={e => setUnits(e.target.value)} className={inputCls} placeholder="e.g. 56" />
            <p className="text-[11px] text-gray-400 mt-1">This deal has no unit count on record yet — enter it manually here.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Neighborhood / Area</label>
            <textarea rows={2} value={neighborhood} onChange={e => setNeighborhood(e.target.value)} className={`${inputCls} resize-none`} placeholder="e.g. East Austin — walkable corridor" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Business Plan</label>
            <textarea rows={3} value={businessPlan} onChange={e => setBusinessPlan(e.target.value)} className={`${inputCls} resize-none`} placeholder="e.g. Value-add reposition, 18mo hold" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Target Return</label>
            <input type="text" value={targetReturn} onChange={e => setTargetReturn(e.target.value)} className={inputCls} placeholder="~15% IRR (target)" />
            <p className="text-[11px] text-gray-400 mt-1">Only shown when the deal has no cap rate/IRR on record yet.</p>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Target Operator</label>
            <input
              type="text" list="investor-operator-names-edit" value={operatorName}
              onChange={e => setOperatorName(e.target.value)}
              className={inputCls} placeholder="Type an existing or brand-new operator name"
            />
            <datalist id="investor-operator-names-edit">
              {operatorNames.map(n => <option key={n} value={n} />)}
            </datalist>
          </div>
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={() => onSave({ businessPlan, targetReturn, neighborhood, operatorName, units: units.trim() ? Number(units) : null })}
            className="flex-1 py-2 text-sm font-medium bg-primary-800 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Save
          </button>
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default InvestorPipeline;
