import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import {
  Upload, FileText, Trash2, AlertTriangle, ExternalLink,
  Loader2, ChevronDown, Sparkles, CheckCircle2, X,
} from 'lucide-react';
import {
  DOCUMENT_TYPES, EXTRACTABLE_TYPES, EXTRACTION_ENDPOINTS,
  type DocumentType,
  patchDealExecution,
} from '../types/dealExecution';

// ─── Types ─────────────────────────────────────────────────────────────────────
interface DriveDocument {
  id: string;
  dealId: number;
  fileName: string;
  documentType: DocumentType;
  driveFileId: string;
  driveUrl: string;
  uploadedAt: string;
}

// Extraction result shape varies by doc type — keep it loose
type ExtractedFields = Record<string, string | number | null | undefined>;

interface PendingExtraction {
  docId: string;
  docType: DocumentType;
  file: File;
  driveUrl: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const guessType = (name: string): DocumentType => {
  const l = name.toLowerCase();
  if (l.includes('offering') || l.includes(' om') || l.startsWith('om ') || l.includes('_om_')) return 'OM';
  if (l.includes('t12') || l.includes('trailing'))                       return 'T12';
  if (l.includes('rent') && (l.includes('roll') || l.includes('roster'))) return 'Rent Roll';
  if (l.includes('loi') || l.includes('letter of intent'))               return 'LOI Draft';
  if (l.includes('psa') || (l.includes('purchase') && l.includes('sale'))) return 'PSA Draft';
  if (l.includes('model') || l.endsWith('.xlsx') || l.endsWith('.xls'))  return 'Financial Model';
  if (l.includes('email') || l.endsWith('.eml') || l.endsWith('.msg'))   return 'Email';
  return 'Other';
};

// Human-readable field labels for review panel
const FIELD_LABELS: Record<string, string> = {
  purchasePrice:              'Purchase Price',
  earnestMoneyDeposit:        'Earnest Money Deposit',
  dueDiligenceDeadline:       'DD Deadline',
  financingContingency:       'Financing Contingency',
  targetCloseDate:            'Target Close Date',
  loanAmount:                 'Loan Amount',
  interestRate:               'Interest Rate (%)',
  loanTermMonths:             'Loan Term (months)',
  psaExecutedDate:            'PSA Executed Date',
  earnestMoneyHardDate:       'EMD Hard Date',
  closingDate:                'Closing Date',
  keyConditions:              'Key Conditions',
  psaDraftedBy:               'PSA Drafted By',
  totalEquityRequired:        'Total Equity Required',
  acquisitionLoanAmount:      'Acquisition Loan Amount',
  projectedLpNetIrr:          'Projected LP Net IRR (%)',
  projectedEquityMultiple:    'Projected Equity Multiple',
  projectedExitValue:         'Projected Exit Value',
  strategy:                   'Strategy',
};

const fmt$ = (v: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);

const fmtVal = (key: string, val: string | number | null | undefined): string => {
  if (val == null || val === '') return '—';
  if (typeof val === 'number') {
    if (['purchasePrice','earnestMoneyDeposit','loanAmount','totalEquityRequired',
         'acquisitionLoanAmount','projectedExitValue'].includes(key)) return fmt$(val);
    if (['projectedEquityMultiple'].includes(key)) return `${val}x`;
    if (['interestRate','projectedLpNetIrr'].includes(key)) return `${val}%`;
  }
  return String(val);
};

// ─── Type pill colors ──────────────────────────────────────────────────────────
const TYPE_COLORS: Partial<Record<DocumentType, string>> = {
  'OM':              'bg-sky-50 text-sky-700',
  'T12':             'bg-blue-50 text-blue-700',
  'Rent Roll':       'bg-violet-50 text-violet-700',
  'LOI Draft':       'bg-amber-50 text-amber-700',
  'PSA Draft':       'bg-orange-50 text-orange-700',
  'Financial Model': 'bg-emerald-50 text-emerald-700',
  'DD Document':     'bg-indigo-50 text-indigo-700',
  'Email':           'bg-rose-50 text-rose-700',
  'Other':           'bg-gray-100 text-gray-600',
};
const typeColor = (t: DocumentType) => TYPE_COLORS[t] ?? 'bg-gray-100 text-gray-600';

// ─── Component ─────────────────────────────────────────────────────────────────
interface DocumentsPanelProps {
  dealId: number;
  /** Called after extraction is confirmed so parent can refresh deal data */
  onExtractionConfirmed?: (docType: DocumentType, data: ExtractedFields, driveUrl: string) => void;
}

const DocumentsPanel = ({ dealId, onExtractionConfirmed }: DocumentsPanelProps) => {
  const [documents, setDocuments] = useState<DriveDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Upload form state
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingType, setPendingType] = useState<DocumentType>('Other');
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);

  // Extraction state
  const [pendingExtraction, setPendingExtraction] = useState<PendingExtraction | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [extractedData, setExtractedData] = useState<ExtractedFields | null>(null);
  const [editedData, setEditedData] = useState<ExtractedFields | null>(null);
  const [confirming, setConfirming] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch documents ───────────────────────────────────────────────────────
  const fetchDocuments = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`/api/v1/documents/${dealId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load documents');
      setDocuments(json.documents ?? []);
    } catch (err: unknown) {
      setFetchError(err instanceof Error ? err.message : 'Failed to load documents');
    } finally {
      setLoading(false);
    }
  }, [dealId]);

  useEffect(() => {
    if (dealId) fetchDocuments();
  }, [dealId, fetchDocuments]);

  // ── Group by type ─────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<DocumentType, DriveDocument[]>();
    DOCUMENT_TYPES.forEach(t => map.set(t, []));
    documents.forEach(d => {
      const t = d.documentType as DocumentType;
      map.get(t)?.push(d);
    });
    return DOCUMENT_TYPES
      .map(t => ({ type: t, docs: map.get(t)! }))
      .filter(g => g.docs.length > 0);
  }, [documents]);

  // ── File selection ────────────────────────────────────────────────────────
  const handleFileSelect = (file: File) => {
    setPendingFile(file);
    setPendingType(guessType(file.name));
    setUploadError(null);
    setUploadSuccess(false);
    setPendingExtraction(null);
    setExtractedData(null);
    setEditedData(null);
  };

  const cancelUpload = () => {
    setPendingFile(null);
    setUploadError(null);
    setUploadSuccess(false);
    setPendingExtraction(null);
    setExtractedData(null);
    setEditedData(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // ── Upload ────────────────────────────────────────────────────────────────
  const confirmUpload = async () => {
    if (!pendingFile) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(false);

    const formData = new FormData();
    formData.append('file', pendingFile);
    formData.append('deal_id', String(dealId));
    formData.append('document_type', pendingType);

    try {
      const res = await fetch('/api/v1/documents/upload', { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');

      setUploadSuccess(true);
      await fetchDocuments();

      // If this type supports extraction, prompt the user
      if (EXTRACTABLE_TYPES.includes(pendingType)) {
        setPendingExtraction({
          docId: json.document?.id ?? '',
          docType: pendingType,
          file: pendingFile,
          driveUrl: json.drive_url ?? '',
        });
      }

      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  // ── Extract ───────────────────────────────────────────────────────────────
  const runExtraction = async () => {
    if (!pendingExtraction) return;
    const endpoint = EXTRACTION_ENDPOINTS[pendingExtraction.docType];
    if (!endpoint) return;

    setExtracting(true);
    setExtractError(null);
    setExtractedData(null);
    setEditedData(null);

    const formData = new FormData();
    formData.append('file', pendingExtraction.file);
    formData.append('deal_id', String(dealId));

    try {
      const res = await fetch(endpoint, { method: 'POST', body: formData });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Extraction failed');
      const data: ExtractedFields = json.data ?? {};
      // Filter out null/undefined so the review panel is clean
      const filtered = Object.fromEntries(
        Object.entries(data).filter(([, v]) => v != null && v !== '')
      ) as ExtractedFields;
      setExtractedData(filtered);
      setEditedData({ ...filtered });
    } catch (err: unknown) {
      setExtractError(err instanceof Error ? err.message : 'Extraction failed');
    } finally {
      setExtracting(false);
    }
  };

  const dismissExtraction = () => {
    setPendingExtraction(null);
    setExtractedData(null);
    setEditedData(null);
    setExtractError(null);
  };

  // ── Confirm extraction → write to deal ───────────────────────────────────
  const confirmExtraction = async () => {
    if (!pendingExtraction || !editedData) return;
    setConfirming(true);

    const { docType, driveUrl } = pendingExtraction;
    const sources: Record<string, DocumentType> = {};
    Object.keys(editedData).forEach(k => { sources[k] = docType; });

    // Build the patch for the execution record
    const patch: Parameters<typeof patchDealExecution>[1] = {};

    if (docType === 'LOI Draft') {
      patch.loiData = {
        purchasePrice:        editedData.purchasePrice as number | undefined,
        earnestMoneyDeposit:  editedData.earnestMoneyDeposit as number | undefined,
        dueDiligenceDeadline: editedData.dueDiligenceDeadline as string | undefined,
        financingContingency: editedData.financingContingency as string | undefined,
        targetCloseDate:      editedData.targetCloseDate as string | undefined,
        loanAmount:           editedData.loanAmount as number | undefined,
        interestRate:         editedData.interestRate as number | undefined,
        loanTermMonths:       editedData.loanTermMonths as number | undefined,
      };
      if (editedData.purchasePrice) patch.purchasePrice = editedData.purchasePrice as number;
    }

    if (docType === 'PSA Draft') {
      patch.psaData = {
        psaExecutedDate:      editedData.psaExecutedDate as string | undefined,
        earnestMoneyHardDate: editedData.earnestMoneyHardDate as string | undefined,
        purchasePrice:        editedData.purchasePrice as number | undefined,
        closingDate:          editedData.closingDate as string | undefined,
        keyConditions:        editedData.keyConditions as string | undefined,
        psaDraftedBy:         editedData.psaDraftedBy as string | undefined,
      };
      if (editedData.purchasePrice) patch.purchasePrice = editedData.purchasePrice as number;
      if (editedData.psaExecutedDate) patch.psaExecutedDate = editedData.psaExecutedDate as string;
      if (editedData.earnestMoneyHardDate) patch.earnestMoneyHardDate = editedData.earnestMoneyHardDate as string;
      if (editedData.keyConditions) patch.keyConditions = editedData.keyConditions as string;
      if (editedData.psaDraftedBy) patch.psaDraftedBy = editedData.psaDraftedBy as string;
    }

    if (docType === 'Financial Model') {
      patch.modelExtracted = {
        purchasePrice:           editedData.purchasePrice as number | undefined,
        totalEquityRequired:     editedData.totalEquityRequired as number | undefined,
        acquisitionLoanAmount:   editedData.acquisitionLoanAmount as number | undefined,
        projectedLpNetIrr:       editedData.projectedLpNetIrr as number | undefined,
        projectedEquityMultiple: editedData.projectedEquityMultiple as number | undefined,
        projectedExitValue:      editedData.projectedExitValue as number | undefined,
        strategy:                editedData.strategy as string | undefined,
      };
      patch.modelSource = 'upload';
      patch.modelDriveUrl = driveUrl;
    }

    // Merge field sources
    const existing = (() => {
      try {
        const raw = localStorage.getItem('aequitas_deal_executions');
        if (!raw) return {};
        const map = JSON.parse(raw) as Record<string, { fieldSources?: Record<string, string> }>;
        return map[String(dealId)]?.fieldSources ?? {};
      } catch { return {}; }
    })();
    patch.fieldSources = { ...existing, ...sources } as Record<string, 'LOI Draft' | 'PSA Draft' | 'Financial Model'>;

    patchDealExecution(dealId, patch);

    onExtractionConfirmed?.(docType, editedData, driveUrl);

    setConfirming(false);
    dismissExtraction();
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const deleteDocument = async (docId: string) => {
    try {
      const res = await fetch(`/api/v1/documents/doc/${docId}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Delete failed');
      setDocuments(prev => prev.filter(d => d.id !== docId));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Documents</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {loading
              ? 'Loading…'
              : documents.length === 0
                ? 'No documents yet'
                : `${documents.length} document${documents.length !== 1 ? 's' : ''} · stored in Google Drive`}
          </p>
        </div>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-800 hover:bg-gray-100 border border-gray-200 rounded-lg transition-colors"
        >
          <Upload size={13} />
          Upload
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.xlsx,.xls,.csv,.eml,.msg,.txt,.png,.jpg,.jpeg"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFileSelect(f);
          }}
        />
      </div>

      {/* Fetch error */}
      {fetchError && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
          <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
          <p className="text-xs text-red-700">{fetchError}</p>
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading documents…</span>
        </div>
      ) : documents.length === 0 && !pendingFile ? (
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
          className="flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50 rounded-xl cursor-pointer transition-colors"
        >
          <Upload size={22} className="text-gray-300" />
          <p className="text-sm text-gray-400">Drop files here or click Upload</p>
          <p className="text-xs text-gray-300">PDF, Word, Excel, Email accepted</p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ type, docs }) => (
            <div key={type}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${typeColor(type)}`}>
                  {type}
                </span>
                <span className="text-xs text-gray-400">{docs.length} file{docs.length !== 1 ? 's' : ''}</span>
              </div>
              <div className="space-y-1">
                {docs.map(doc => (
                  <div
                    key={doc.id}
                    className="flex items-center gap-3 px-3 py-2.5 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-lg group transition-colors"
                  >
                    <FileText size={15} className="text-gray-400 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 font-medium truncate">{doc.fileName}</p>
                      <p className="text-xs text-gray-400">{fmtDate(doc.uploadedAt)}</p>
                    </div>
                    <a
                      href={doc.driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors flex-shrink-0"
                    >
                      <ExternalLink size={11} />
                      Drive
                    </a>
                    <button
                      onClick={() => deleteDocument(doc.id)}
                      className="p-1 text-gray-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {!pendingFile && !pendingExtraction && (
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
              className="flex items-center justify-center gap-2 py-3 border border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
            >
              <Upload size={13} className="text-gray-300" />
              <span className="text-xs text-gray-400">Drop another file or click Upload</span>
            </div>
          )}
        </div>
      )}

      {/* Upload success banner */}
      {uploadSuccess && !pendingExtraction && (
        <div className="mt-3 p-2.5 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-xs text-green-700 font-medium">File uploaded successfully to Google Drive.</p>
        </div>
      )}

      {/* ── Upload confirm form ── */}
      {pendingFile && (
        <div className="mt-4 border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Confirm document type</p>
          <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg">
            <FileText size={14} className="text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-700 truncate flex-1">{pendingFile.name}</span>
          </div>

          <div className="relative">
            <label className="block text-xs font-medium text-gray-600 mb-1">Document Type</label>
            <button
              type="button"
              onClick={() => setShowTypeMenu(v => !v)}
              className="w-full flex items-center justify-between px-3 py-2 bg-white border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
              <span>{pendingType}</span>
              <ChevronDown size={13} className="text-gray-400" />
            </button>
            {showTypeMenu && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowTypeMenu(false)} />
                <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 overflow-hidden">
                  {DOCUMENT_TYPES.map(t => (
                    <button
                      key={t}
                      onClick={() => { setPendingType(t); setShowTypeMenu(false); }}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors ${
                        t === pendingType ? 'bg-blue-50 text-blue-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {t}
                      {EXTRACTABLE_TYPES.includes(t) && (
                        <span className="ml-2 text-xs text-amber-600 font-normal">· AI extraction</span>
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {uploadError && (
            <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700">{uploadError}</p>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button onClick={cancelUpload} disabled={uploading} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-40">
              Cancel
            </button>
            <button
              onClick={confirmUpload}
              disabled={uploading}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60"
            >
              {uploading ? <><Loader2 size={12} className="animate-spin" />Uploading…</> : <><Upload size={12} />Upload to Drive</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Extraction prompt banner ── */}
      {pendingExtraction && !extractedData && (
        <div className="mt-4 border border-amber-200 bg-amber-50 rounded-xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Sparkles size={16} className="text-amber-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  Extract data from this {pendingExtraction.docType}?
                </p>
                <p className="text-xs text-amber-600 mt-0.5">
                  Claude will read the document and pre-fill the relevant deal fields. You can review before confirming.
                </p>
              </div>
            </div>
            <button onClick={dismissExtraction} className="text-amber-400 hover:text-amber-600 flex-shrink-0">
              <X size={14} />
            </button>
          </div>
          {extractError && (
            <div className="mt-3 flex items-center gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle size={12} className="text-red-500" />
              <p className="text-xs text-red-700">{extractError}</p>
            </div>
          )}
          <div className="flex gap-2 mt-3 justify-end">
            <button onClick={dismissExtraction} className="px-3 py-1.5 text-xs text-amber-700 hover:bg-amber-100 rounded-lg transition-colors">
              Skip
            </button>
            <button
              onClick={runExtraction}
              disabled={extracting}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-amber-500 hover:bg-amber-600 rounded-lg transition-colors disabled:opacity-60"
            >
              {extracting ? <><Loader2 size={12} className="animate-spin" />Extracting…</> : <><Sparkles size={12} />Extract</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Extraction review panel ── */}
      {extractedData && editedData && pendingExtraction && (
        <div className="mt-4 border border-green-200 bg-green-50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={15} className="text-green-600" />
              <p className="text-sm font-semibold text-green-800">Review extracted fields</p>
            </div>
            <button onClick={dismissExtraction} className="text-green-400 hover:text-green-600">
              <X size={14} />
            </button>
          </div>
          <p className="text-xs text-green-600">
            Extracted from <span className="font-semibold">{pendingExtraction.docType}</span>.
            Edit any values, then confirm to populate deal fields.
          </p>

          <div className="space-y-2">
            {Object.entries(editedData).map(([key, val]) => (
              <div key={key} className="flex items-center gap-2">
                <label className="text-xs text-gray-500 w-40 flex-shrink-0">
                  {FIELD_LABELS[key] ?? key}
                </label>
                <input
                  type="text"
                  value={val ?? ''}
                  onChange={e => setEditedData(prev => ({ ...prev!, [key]: e.target.value }))}
                  className="flex-1 px-2 py-1 text-xs border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-green-400"
                />
                <span className="text-xs text-gray-400 w-24 flex-shrink-0 text-right">
                  {fmtVal(key, val)}
                </span>
              </div>
            ))}
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <button onClick={dismissExtraction} className="px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-200 rounded-lg transition-colors">
              Discard
            </button>
            <button
              onClick={confirmExtraction}
              disabled={confirming}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-60"
            >
              {confirming ? <><Loader2 size={12} className="animate-spin" />Saving…</> : <><CheckCircle2 size={12} />Confirm & Apply</>}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentsPanel;
