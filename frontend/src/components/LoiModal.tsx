import { useState, useRef } from 'react';
import { X, Upload, FileText, Loader2, AlertTriangle, CheckCircle2 } from 'lucide-react';
import type { LoiExtractedData } from '../types/dealExecution';

type Step = 'upload' | 'extracting' | 'review';

interface LoiModalProps {
  dealName: string;
  onConfirm: (loiData: LoiExtractedData, fileName?: string) => void;
  onSkip: () => void;
  onClose: () => void;
}

/** Yellow "AI-extracted — verify" badge shown next to each pre-filled field */
const AiBadge = () => (
  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 rounded">
    <AlertTriangle size={9} />
    AI-extracted — verify
  </span>
);

const formatDate = (iso?: string) => (iso ? iso.slice(0, 10) : '');

const LoiModal = ({ dealName, onConfirm, onSkip, onClose }: LoiModalProps) => {
  const [step, setStep] = useState<Step>('upload');
  const [fileName, setFileName] = useState<string>('');
  const [confirming, setConfirming] = useState(false);

  // Extracted / user-editable fields
  const [purchasePrice, setPurchasePrice] = useState('');
  const [earnestMoneyDeposit, setEarnestMoneyDeposit] = useState('');
  const [dueDiligenceDeadline, setDueDiligenceDeadline] = useState('');
  const [financingContingency, setFinancingContingency] = useState('');
  const [targetCloseDate, setTargetCloseDate] = useState('');
  const [loanAmount, setLoanAmount] = useState('');
  const [interestRate, setInterestRate] = useState('');
  const [loanTermMonths, setLoanTermMonths] = useState('');

  // Track which fields were AI-populated vs user-entered
  const [aiFields] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (file: File) => {
    setFileName(file.name);
    setStep('extracting');

    // Phase 1 stub: simulate extraction delay then present blank review form.
    // Phase 2 will wire a real Claude extraction call here.
    setTimeout(() => {
      setStep('review');
    }, 1200);
  };

  const buildLoiData = (): LoiExtractedData => ({
    purchasePrice:         purchasePrice ? parseFloat(purchasePrice.replace(/,/g, '')) : undefined,
    earnestMoneyDeposit:   earnestMoneyDeposit ? parseFloat(earnestMoneyDeposit.replace(/,/g, '')) : undefined,
    dueDiligenceDeadline:  dueDiligenceDeadline || undefined,
    financingContingency:  financingContingency || undefined,
    targetCloseDate:       targetCloseDate || undefined,
    loanAmount:            loanAmount ? parseFloat(loanAmount.replace(/,/g, '')) : undefined,
    interestRate:          interestRate ? parseFloat(interestRate) / 100 : undefined,
    loanTermMonths:        loanTermMonths ? parseInt(loanTermMonths) : undefined,
  });

  const handleConfirm = async () => {
    setConfirming(true);
    await new Promise(r => setTimeout(r, 300));
    onConfirm(buildLoiData(), fileName || undefined);
  };

  // ----- UPLOAD STEP -----
  if (step === 'upload') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl">
          <div className="flex items-start justify-between p-6 border-b border-gray-100">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">LOI Executed</h2>
              <p className="text-sm text-gray-500 mt-0.5 truncate max-w-xs">{dealName}</p>
            </div>
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
              <X size={18} />
            </button>
          </div>

          <div className="p-6 space-y-5">
            <p className="text-sm text-gray-700 leading-relaxed">
              Upload your LOI to pre-fill deal terms, or skip and enter manually.
            </p>

            {/* Drop zone */}
            <div
              onClick={() => fileInputRef.current?.click()}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFileSelect(f); }}
              className="flex flex-col items-center justify-center gap-3 w-full min-h-[120px] border-2 border-dashed border-gray-200 bg-gray-50 hover:border-blue-300 hover:bg-blue-50 rounded-xl cursor-pointer transition-colors"
            >
              <Upload size={28} className="text-gray-400" />
              <div className="text-center">
                <p className="text-sm font-medium text-gray-600">Drop LOI here or click to browse</p>
                <p className="text-xs text-gray-400 mt-0.5">PDF preferred</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.doc,.docx"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) { handleFileSelect(f); e.target.value = ''; } }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
            <button
              onClick={onSkip}
              className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
            >
              Skip — enter manually
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ----- EXTRACTING STEP -----
  if (step === 'extracting') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
        <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-10 flex flex-col items-center gap-4">
          <Loader2 size={36} className="text-blue-500 animate-spin" />
          <div className="text-center">
            <p className="text-sm font-semibold text-gray-800">Extracting LOI terms…</p>
            <p className="text-xs text-gray-400 mt-1 truncate max-w-xs">{fileName}</p>
          </div>
        </div>
      </div>
    );
  }

  // ----- REVIEW STEP -----
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl flex flex-col max-h-[92vh]">

        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Review Extracted Terms</h2>
              <p className="text-sm text-gray-500 mt-0.5">Verify each field before confirming</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* File chip + extraction notice */}
        <div className="px-6 pt-4 space-y-3">
          {fileName && (
            <div className="flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg">
              <FileText size={14} className="text-gray-400 flex-shrink-0" />
              <span className="text-xs text-gray-600 truncate">{fileName}</span>
            </div>
          )}
          <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-100 rounded-lg">
            <AlertTriangle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-amber-700">
              All fields below are <strong>AI-extracted — verify</strong> before confirming.
              Extraction is best-effort; correct any errors before continuing.
              Fields left blank will remain empty in Section A.
            </p>
          </div>
        </div>

        {/* Scrollable form */}
        <div className="overflow-y-auto flex-1 px-6 py-4 space-y-5">

          {/* Deal Terms */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Deal Terms</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-xs font-medium text-gray-600">Purchase Price ($)</label>
                  {aiFields.has('purchasePrice') && <AiBadge />}
                </div>
                <input
                  type="text"
                  value={purchasePrice}
                  onChange={e => setPurchasePrice(e.target.value)}
                  placeholder="e.g. 8,500,000"
                  className="w-full px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white"
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-xs font-medium text-gray-600">Earnest Money Deposit ($)</label>
                  {aiFields.has('earnestMoneyDeposit') && <AiBadge />}
                </div>
                <input
                  type="text"
                  value={earnestMoneyDeposit}
                  onChange={e => setEarnestMoneyDeposit(e.target.value)}
                  placeholder="e.g. 250,000"
                  className="w-full px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* Key Dates */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Key Dates</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-xs font-medium text-gray-600">Due Diligence Deadline</label>
                  {aiFields.has('dueDiligenceDeadline') && <AiBadge />}
                </div>
                <input
                  type="date"
                  value={formatDate(dueDiligenceDeadline)}
                  onChange={e => setDueDiligenceDeadline(e.target.value)}
                  className="w-full px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white"
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-xs font-medium text-gray-600">Financing Contingency</label>
                  {aiFields.has('financingContingency') && <AiBadge />}
                </div>
                <input
                  type="date"
                  value={formatDate(financingContingency)}
                  onChange={e => setFinancingContingency(e.target.value)}
                  className="w-full px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white"
                />
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-xs font-medium text-gray-600">Target Close Date</label>
                  {aiFields.has('targetCloseDate') && <AiBadge />}
                </div>
                <input
                  type="date"
                  value={formatDate(targetCloseDate)}
                  onChange={e => setTargetCloseDate(e.target.value)}
                  className="w-full px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* Financing */}
          <div>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Financing (if specified)</h3>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-xs font-medium text-gray-600">Loan Amount ($)</label>
                  {aiFields.has('loanAmount') && <AiBadge />}
                </div>
                <input
                  type="text"
                  value={loanAmount}
                  onChange={e => setLoanAmount(e.target.value)}
                  placeholder="e.g. 6,000,000"
                  className="w-full px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white"
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-xs font-medium text-gray-600">Interest Rate (%)</label>
                  {aiFields.has('interestRate') && <AiBadge />}
                </div>
                <input
                  type="text"
                  value={interestRate}
                  onChange={e => setInterestRate(e.target.value)}
                  placeholder="e.g. 6.5"
                  className="w-full px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white"
                />
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <label className="text-xs font-medium text-gray-600">Loan Term (months)</label>
                  {aiFields.has('loanTermMonths') && <AiBadge />}
                </div>
                <input
                  type="text"
                  value={loanTermMonths}
                  onChange={e => setLoanTermMonths(e.target.value)}
                  placeholder="e.g. 360"
                  className="w-full px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:bg-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button
            onClick={() => setStep('upload')}
            className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 hover:bg-gray-200 rounded-lg transition-colors"
          >
            ← Start over
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {confirming ? (
              <><Loader2 size={15} className="animate-spin" /> Confirming…</>
            ) : (
              <><CheckCircle2 size={15} /> Confirm &amp; Execute LOI</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoiModal;
