import { useState, useRef, useCallback } from 'react';
import { X, Upload, FileText, Trash2, ChevronDown, Loader2, AlertCircle } from 'lucide-react';
import type { DocumentType, DealDocument } from '../types/dealExecution';
import { DOCUMENT_TYPES, EXTRACTABLE_TYPES } from '../types/dealExecution';

interface StagedFile {
  file: File;
  docType: DocumentType;
}

interface DataRoomModalProps {
  dealName: string;
  onConfirm: (documents: Omit<DealDocument, 'id' | 'uploadedAt'>[]) => void;
  onSkip: () => void;
  onClose: () => void;
}

const formatBytes = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const DataRoomModal = ({ dealName, onConfirm, onSkip, onClose }: DataRoomModalProps) => {
  const [staged, setStaged] = useState<StagedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = (files: FileList | File[]) => {
    const newFiles = Array.from(files).map<StagedFile>(file => ({
      file,
      docType: 'Other',
    }));
    setStaged(prev => [...prev, ...newFiles]);
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
  }, []);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const removeFile = (index: number) => {
    setStaged(prev => prev.filter((_, i) => i !== index));
  };

  const updateDocType = (index: number, docType: DocumentType) => {
    setStaged(prev => prev.map((s, i) => i === index ? { ...s, docType } : s));
  };

  const hasExtractable = staged.some(s => EXTRACTABLE_TYPES.includes(s.docType));

  const handleConfirm = async () => {
    setConfirming(true);
    // Short artificial delay so "processing" state is visible
    await new Promise(r => setTimeout(r, 400));
    const docs = staged.map<Omit<DealDocument, 'id' | 'uploadedAt'>>(s => ({
      name: s.file.name,
      size: s.file.size,
      type: s.docType,
      extractionAttempted: EXTRACTABLE_TYPES.includes(s.docType),
    }));
    onConfirm(docs);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Data Room Received</h2>
            <p className="text-sm text-gray-500 mt-0.5 truncate max-w-xs">{dealName}</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          {/* Instructional copy */}
          <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl text-sm text-blue-800 leading-relaxed">
            Upload any documents the operator shared — T12, rent roll, existing financials.
            Claude will attempt to extract key figures from T12 and Rent Roll files.
            <span className="font-medium"> All extracted values will be flagged for your review.</span>
          </div>

          {/* Drop zone */}
          <div
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
            className={`flex flex-col items-center justify-center gap-3 w-full min-h-[120px] border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
              dragging
                ? 'border-blue-400 bg-blue-50'
                : 'border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50'
            }`}
          >
            <Upload size={28} className="text-gray-400" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-600">Drop files here or click to browse</p>
              <p className="text-xs text-gray-400 mt-0.5">PDF, Excel, images — any format</p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={e => { if (e.target.files) { addFiles(e.target.files); e.target.value = ''; } }}
            />
          </div>

          {/* Staged file list */}
          {staged.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                {staged.length} file{staged.length !== 1 ? 's' : ''} — tag each by type
              </p>
              {staged.map((s, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg"
                >
                  <FileText size={16} className="text-gray-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{s.file.name}</p>
                    <p className="text-xs text-gray-400">{formatBytes(s.file.size)}</p>
                  </div>

                  {/* Document type selector */}
                  <div className="relative flex-shrink-0">
                    <select
                      value={s.docType}
                      onChange={e => updateDocType(idx, e.target.value as DocumentType)}
                      className="appearance-none pl-2.5 pr-7 py-1.5 text-xs font-medium border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500 cursor-pointer"
                    >
                      {DOCUMENT_TYPES.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                  </div>

                  {/* Extraction badge for T12 / Rent Roll */}
                  {EXTRACTABLE_TYPES.includes(s.docType) && (
                    <span className="flex-shrink-0 px-2 py-0.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-full">
                      AI extract
                    </span>
                  )}

                  <button
                    onClick={() => removeFile(idx)}
                    className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded transition-colors flex-shrink-0"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}

              {/* Extraction note */}
              {hasExtractable && (
                <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
                  <AlertCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-amber-700">
                    Claude will attempt to extract key figures from your T12 / Rent Roll.
                    All extracted values will be marked <strong>AI-extracted — verify</strong> before they're treated as clean data.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onSkip}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Skip — no documents yet
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {confirming ? (
              <>
                <Loader2 size={15} className="animate-spin" />
                Processing…
              </>
            ) : (
              `Confirm${staged.length ? ` (${staged.length} file${staged.length !== 1 ? 's' : ''})` : ''}`
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataRoomModal;
