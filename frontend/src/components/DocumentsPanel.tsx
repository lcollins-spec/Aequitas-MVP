import { useState, useRef, useEffect, useMemo } from 'react';
import { Upload, FileText, Trash2, AlertTriangle, ExternalLink, Loader2, ChevronDown } from 'lucide-react';
import {
  DOCUMENT_TYPES, EXTRACTABLE_TYPES,
  type DocumentType,
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

// ─── Helpers ───────────────────────────────────────────────────────────────────
const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

const guessType = (name: string): DocumentType => {
  const l = name.toLowerCase();
  if (l.includes('offering') || l.includes(' om') || l.startsWith('om ') || l.includes('_om_')) return 'OM';
  if (l.includes('t12') || l.includes('trailing'))                     return 'T12';
  if (l.includes('rent') && (l.includes('roll') || l.includes('roster'))) return 'Rent Roll';
  if (l.includes('loi') || l.includes('letter of intent'))             return 'LOI Draft';
  if (l.includes('psa') || l.includes('purchase') && l.includes('sale')) return 'PSA Draft';
  if (l.includes('email') || l.endsWith('.eml') || l.endsWith('.msg')) return 'Email';
  return 'Other';
};

// ─── Type pill colors ──────────────────────────────────────────────────────────
const TYPE_COLORS: Record<DocumentType, string> = {
  'OM':        'bg-sky-50 text-sky-700',
  'T12':       'bg-blue-50 text-blue-700',
  'Rent Roll': 'bg-violet-50 text-violet-700',
  'LOI Draft': 'bg-amber-50 text-amber-700',
  'PSA Draft': 'bg-orange-50 text-orange-700',
  'Email':     'bg-rose-50 text-rose-700',
  'Other':     'bg-gray-100 text-gray-600',
};

// ─── Component ─────────────────────────────────────────────────────────────────
interface DocumentsPanelProps {
  dealId: number;
}

const DocumentsPanel = ({ dealId }: DocumentsPanelProps) => {
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

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch documents on mount / dealId change ──────────────────────────────
  const fetchDocuments = async () => {
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
  };

  useEffect(() => {
    if (dealId) fetchDocuments();
  }, [dealId]);

  // ── Group by type ─────────────────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<DocumentType, DriveDocument[]>();
    DOCUMENT_TYPES.forEach(t => map.set(t, []));
    documents.forEach(d => map.get(d.documentType as DocumentType)?.push(d));
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
  };

  const cancelUpload = () => {
    setPendingFile(null);
    setUploadError(null);
    setUploadSuccess(false);
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
      const res = await fetch('/api/v1/documents/upload', {
        method: 'POST',
        body: formData,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Upload failed');
      setUploadSuccess(true);
      setPendingFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      await fetchDocuments();
    } catch (err: unknown) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
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

      {/* Loading state */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 py-10 text-gray-400">
          <Loader2 size={18} className="animate-spin" />
          <span className="text-sm">Loading documents…</span>
        </div>
      ) : documents.length === 0 && !pendingFile ? (
        /* Empty drop zone */
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
          <p className="text-xs text-gray-300">PDF, Word, Excel, Email accepted</p>
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
                      <p className="text-sm text-gray-800 font-medium truncate">{doc.fileName}</p>
                      <p className="text-xs text-gray-400">{fmtDate(doc.uploadedAt)}</p>
                    </div>
                    {EXTRACTABLE_TYPES.includes(doc.documentType as DocumentType) && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded whitespace-nowrap">
                        <AlertTriangle size={9} />
                        AI-extracted — verify
                      </span>
                    )}
                    <a
                      href={doc.driveUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded transition-colors flex-shrink-0"
                      title="Open in Google Drive"
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

          {/* Inline drop zone when docs exist */}
          {!pendingFile && (
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
          )}
        </div>
      )}

      {/* Upload success banner */}
      {uploadSuccess && (
        <div className="mt-3 p-2.5 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-xs text-green-700 font-medium">File uploaded successfully to Google Drive.</p>
        </div>
      )}

      {/* Upload confirm form */}
      {pendingFile && (
        <div className="mt-4 border border-blue-200 bg-blue-50 rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-blue-700 uppercase tracking-wide">Confirm document type</p>
          <div className="flex items-center gap-2 px-3 py-2 bg-white border border-gray-200 rounded-lg">
            <FileText size={14} className="text-gray-400 flex-shrink-0" />
            <span className="text-sm text-gray-700 truncate flex-1">{pendingFile.name}</span>
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

          {/* Upload error */}
          {uploadError && (
            <div className="flex items-center gap-2 p-2.5 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle size={13} className="text-red-500 flex-shrink-0" />
              <p className="text-xs text-red-700">{uploadError}</p>
            </div>
          )}

          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={cancelUpload}
              disabled={uploading}
              className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-40"
            >
              Cancel
            </button>
            <button
              onClick={confirmUpload}
              disabled={uploading}
              className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60"
            >
              {uploading ? (
                <>
                  <Loader2 size={12} className="animate-spin" />
                  Uploading…
                </>
              ) : (
                <>
                  <Upload size={12} />
                  Upload to Drive
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocumentsPanel;
