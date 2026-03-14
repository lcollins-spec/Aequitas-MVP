import { useState, useRef, useMemo } from 'react';
import { Upload, FileText, Trash2, AlertTriangle, CheckCircle2, ChevronDown } from 'lucide-react';
import {
  DOCUMENT_TYPES, EXTRACTABLE_TYPES,
  type DealDocument, type DocumentType,
} from '../types/dealExecution';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtSize = (bytes: number) => {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1_024) return `${(bytes / 1_024).toFixed(0)} KB`;
  return `${bytes} B`;
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

/** Guess document type from filename */
const guessType = (name: string): DocumentType => {
  const l = name.toLowerCase();
  if (l.includes('t12') || l.includes('trailing'))                   return 'T12';
  if (l.includes('rent') && (l.includes('roll') || l.includes('roster'))) return 'Rent Roll';
  if (l.includes('apprais'))                                          return 'Appraisal';
  if (l.includes('inspect'))                                          return 'Inspection';
  if (l.includes('loan') || l.includes('mortgage') || l.includes('note')) return 'Loan Docs';
  return 'Other';
};

// ─── Status badge ─────────────────────────────────────────────────────────────
const ExtractionBadge = ({ type }: { type: DocumentType }) => {
  const isExtractable = EXTRACTABLE_TYPES.includes(type);
  if (isExtractable) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded whitespace-nowrap">
        <AlertTriangle size={9} />
        AI-extracted — verify
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-gray-100 text-gray-500 border border-gray-200 rounded whitespace-nowrap">
      <CheckCircle2 size={9} />
      Stored
    </span>
  );
};

// ─── Type pill ────────────────────────────────────────────────────────────────
const TYPE_COLORS: Record<DocumentType, string> = {
  'T12':        'bg-blue-50 text-blue-700',
  'Rent Roll':  'bg-violet-50 text-violet-700',
  'Appraisal':  'bg-emerald-50 text-emerald-700',
  'Inspection': 'bg-orange-50 text-orange-700',
  'Loan Docs':  'bg-teal-50 text-teal-700',
  'Other':      'bg-gray-100 text-gray-600',
};

// ─── Component ────────────────────────────────────────────────────────────────
interface DocumentsPanelProps {
  documents: DealDocument[];
  onDocumentsChange: (updated: DealDocument[]) => void;
}

const DocumentsPanel = ({ documents, onDocumentsChange }: DocumentsPanelProps) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingType, setPendingType] = useState<DocumentType>('Other');
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Group docs by type, preserving DOCUMENT_TYPES order
  const grouped = useMemo(() => {
    const map = new Map<DocumentType, DealDocument[]>();
    DOCUMENT_TYPES.forEach(t => map.set(t, []));
    documents.forEach(d => map.get(d.type)?.push(d));
    // Only return groups that have at least one doc
    return DOCUMENT_TYPES
      .map(t => ({ type: t, docs: map.get(t)! }))
      .filter(g => g.docs.length > 0);
  }, [documents]);

  const handleFileSelect = (file: File) => {
    setPendingFile(file);
    setPendingType(guessType(file.name));
    setShowAddForm(true);
  };

  const confirmAdd = () => {
    if (!pendingFile) return;
    const doc: DealDocument = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: pendingFile.name,
      size: pendingFile.size,
      type: pendingType,
      uploadedAt: new Date().toISOString(),
      extractionAttempted: EXTRACTABLE_TYPES.includes(pendingType),
    };
    onDocumentsChange([...documents, doc]);
    setPendingFile(null);
    setShowAddForm(false);
    setShowTypeMenu(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const cancelAdd = () => {
    setPendingFile(null);
    setShowAddForm(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeDocument = (id: string) => {
    onDocumentsChange(documents.filter(d => d.id !== id));
  };

  return (
    <div className="bg-white rounded-xl p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Documents</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            {documents.length === 0
              ? 'No documents yet'
              : `${documents.length} document${documents.length !== 1 ? 's' : ''}`}
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
          accept=".pdf,.doc,.docx,.xlsx,.xls,.csv"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) handleFileSelect(f);
          }}
        />
      </div>

      {/* Document list grouped by type */}
      {documents.length === 0 ? (
        /* Drop zone / empty state */
        <div
          onClick={() => fileInputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => {
            e.preventDefault();
            const f = e.dataTransfer.files[0];
            if (f) handleFileSelect(f);
          }}
          className="flex flex-col items-center justify-center gap-2 py-10 border-2 border-dashed border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50 rounded-xl cursor-pointer transition-colors"
        >
          <Upload size={22} className="text-gray-300" />
          <p className="text-sm text-gray-400">Drop files here or click Upload</p>
          <p className="text-xs text-gray-300">PDF, Word, Excel accepted</p>
        </div>
      ) : (
        <div className="space-y-5">
          {grouped.map(({ type, docs }) => (
            <div key={type}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[type]}`}>
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
                      <p className="text-sm text-gray-800 font-medium truncate">{doc.name}</p>
                      <p className="text-xs text-gray-400">
                        {fmtSize(doc.size)} · {fmtDate(doc.uploadedAt)}
                      </p>
                    </div>
                    <ExtractionBadge type={doc.type} />
                    <button
                      onClick={() => removeDocument(doc.id)}
                      className="p-1 text-gray-300 hover:text-red-500 rounded opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Inline drop zone when docs exist */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) handleFileSelect(f);
            }}
            className="flex items-center justify-center gap-2 py-3 border border-dashed border-gray-200 hover:border-blue-300 hover:bg-blue-50 rounded-lg cursor-pointer transition-colors"
          >
            <Upload size={13} className="text-gray-300" />
            <span className="text-xs text-gray-400">Drop another file or click Upload</span>
          </div>
        </div>
      )}

      {/* Add form — shown after file is selected */}
      {showAddForm && pendingFile && (
        <div className="mt-4 border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Confirm document type</p>
          <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg">
            <FileText size={14} className="text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-700 truncate flex-1">{pendingFile.name}</span>
            <span className="text-xs text-gray-400 flex-shrink-0">{fmtSize(pendingFile.size)}</span>
          </div>

          {/* Type selector */}
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

          {/* Extraction notice for extractable types */}
          {EXTRACTABLE_TYPES.includes(pendingType) && (
            <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-100 rounded-lg">
              <AlertTriangle size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                <strong>{pendingType}</strong> documents are flagged for AI extraction. In Phase 2, Claude will attempt to read this file automatically.
              </p>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={cancelAdd}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={confirmAdd}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
            >
              <Upload size={12} />
              Add Document
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentsPanel;
