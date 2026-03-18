/**
 * ClimateCheckUpload
 *
 * Upload flow for ClimateCheck PDF reports.
 * 1. Upload PDF → backend extracts scores via Claude
 * 2. Review panel shows extracted fields
 * 3. "Confirm & Save" persists to deal record; "Re-upload" replaces
 *
 * If climate data is already confirmed it shows saved values + Re-upload option.
 */

import { useState, useEffect, useRef } from 'react';
import { Upload, Loader2, CheckCircle, AlertTriangle, RefreshCw, ExternalLink } from 'lucide-react';

const API = import.meta.env.VITE_API_BASE_URL ?? '';

interface ExtractedClimate {
  overall_score:      number | null;
  wildfire_score:     number | null;
  flood_score:        number | null;
  overall_risk_label:  string | null;
  wildfire_risk_label: string | null;
  flood_risk_label:    string | null;
  key_risks:          string[];
  property_address:   string | null;
}

interface ConfirmedClimate extends ExtractedClimate {
  pdf_filename:  string | null;
  pdf_drive_url: string | null;
}

interface Props {
  dealId: number | null;
  /** Called when user confirms — parent can refresh deal data */
  onConfirmed?: (data: ConfirmedClimate) => void;
}

// ── helpers ──────────────────────────────────────────────────────────────────

const scoreColor = (score: number | null): string => {
  if (score === null || score === undefined) return 'text-gray-400';
  if (score <= 33) return 'text-green-600';
  if (score <= 66) return 'text-yellow-600';
  return 'text-red-600';
};

const scoreBg = (score: number | null): string => {
  if (score === null || score === undefined) return 'bg-gray-50';
  if (score <= 33) return 'bg-green-50';
  if (score <= 66) return 'bg-yellow-50';
  return 'bg-red-50';
};

// ── component ─────────────────────────────────────────────────────────────────

export default function ClimateCheckUpload({ dealId, onConfirmed }: Props) {
  const [confirmed, setConfirmed]       = useState<ConfirmedClimate | null>(null);
  const [extracted, setExtracted]       = useState<ExtractedClimate | null>(null);
  const [filename, setFilename]         = useState<string | null>(null);
  const [driveUrl, setDriveUrl]         = useState<string | null>(null);
  const [uploading, setUploading]       = useState(false);
  const [confirming, setConfirming]     = useState(false);
  const [error, setError]               = useState<string | null>(null);
  const [loadingExisting, setLoadingExisting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load existing confirmed data on mount / dealId change
  useEffect(() => {
    if (!dealId) return;
    setLoadingExisting(true);
    fetch(`${API}/api/v1/underwriting/${dealId}/climate`)
      .then(r => r.json())
      .then(res => {
        if (res.success && res.confirmed) {
          setConfirmed(res.data as ConfirmedClimate);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingExisting(false));
  }, [dealId]);

  const handleFileChange = async (file: File) => {
    if (!dealId) { setError('Save a deal first before uploading a ClimateCheck report.'); return; }
    setError(null);
    setExtracted(null);
    setUploading(true);

    const form = new FormData();
    form.append('file', file);

    try {
      const res = await fetch(`${API}/api/v1/underwriting/${dealId}/climate-upload`, {
        method: 'POST',
        body: form,
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Upload failed');
        return;
      }
      setExtracted(data.extracted as ExtractedClimate);
      setFilename(data.filename ?? null);
      setDriveUrl(data.drive_url ?? null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleConfirm = async () => {
    if (!dealId || !extracted) return;
    setConfirming(true);
    setError(null);
    try {
      const res = await fetch(`${API}/api/v1/underwriting/${dealId}/climate-confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extracted }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error ?? 'Save failed');
        return;
      }
      const saved: ConfirmedClimate = {
        ...extracted,
        pdf_filename:  filename,
        pdf_drive_url: driveUrl,
      };
      setConfirmed(saved);
      setExtracted(null);
      onConfirmed?.(saved);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setConfirming(false);
    }
  };

  const handleReupload = () => {
    setConfirmed(null);
    setExtracted(null);
    setFilename(null);
    setDriveUrl(null);
    setError(null);
    inputRef.current?.click();
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-gray-700">Climate Risk (ClimateCheck)</p>
          <a
            href="https://climatecheck.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[11px] text-blue-500 hover:underline flex items-center gap-0.5"
          >
            Get your free report at ClimateCheck.com <ExternalLink size={10} />
          </a>
        </div>
        {confirmed && (
          <button
            onClick={handleReupload}
            className="flex items-center gap-1 px-2 py-1 text-[11px] text-gray-400 hover:text-blue-600 hover:bg-blue-50 border border-gray-200 hover:border-blue-200 rounded-lg transition-colors"
          >
            <RefreshCw size={11} /> Re-upload
          </button>
        )}
      </div>

      {/* ── State: loading existing data ── */}
      {loadingExisting && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <Loader2 size={14} className="animate-spin" /> Loading…
        </div>
      )}

      {/* ── State: confirmed saved data ── */}
      {!loadingExisting && confirmed && !extracted && (
        <ConfirmedPanel data={confirmed} />
      )}

      {/* ── State: idle upload zone ── */}
      {!loadingExisting && !confirmed && !uploading && !extracted && (
        <label className="flex flex-col items-center justify-center gap-2 w-full h-24 border-2 border-dashed border-green-300 bg-green-50 hover:bg-green-100 hover:border-green-400 rounded-xl cursor-pointer transition-colors px-3 py-3 text-center">
          <Upload size={22} className="text-green-500" />
          <span className="text-xs font-medium text-green-700">Upload ClimateCheck PDF</span>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (f) { handleFileChange(f); e.target.value = ''; }
            }}
          />
        </label>
      )}

      {/* ── State: re-upload trigger (hidden input) ── */}
      {!loadingExisting && confirmed && (
        <input
          ref={inputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f) { handleFileChange(f); e.target.value = ''; }
          }}
        />
      )}

      {/* ── State: uploading ── */}
      {uploading && (
        <div className="flex flex-col items-center justify-center gap-2 w-full h-24 border-2 border-dashed border-green-300 bg-green-50 rounded-xl px-3 py-3 text-center">
          <Loader2 size={24} className="text-green-500 animate-spin" />
          <p className="text-xs font-semibold text-green-700">Extracting climate scores…</p>
          <p className="text-[10px] text-green-600">This may take 15–30 seconds</p>
        </div>
      )}

      {/* ── State: review extracted data ── */}
      {extracted && !uploading && (
        <ReviewPanel
          extracted={extracted}
          filename={filename}
          driveUrl={driveUrl}
          confirming={confirming}
          onConfirm={handleConfirm}
          onReupload={() => { setExtracted(null); inputRef.current?.click(); }}
        />
      )}

      {/* Error */}
      {error && (
        <div className="flex items-start gap-2 p-2 bg-red-50 border border-red-200 rounded-lg">
          <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-700">{error}</p>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function ScoreRow({ label, score, riskLabel }: { label: string; score: number | null; riskLabel: string | null }) {
  return (
    <div className={`flex items-center justify-between px-3 py-2 rounded-lg ${scoreBg(score)}`}>
      <span className="text-xs text-gray-600">{label}</span>
      <span className={`text-sm font-bold ${scoreColor(score)}`}>
        {score !== null && score !== undefined ? `${Math.round(score)}/100` : '—'}
        {riskLabel && <span className="text-xs font-normal ml-1 text-gray-500">({riskLabel})</span>}
      </span>
    </div>
  );
}

function ConfirmedPanel({ data }: { data: ConfirmedClimate }) {
  const keyRisks = Array.isArray(data.key_risks) ? data.key_risks : [];
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5 text-xs text-green-700 font-medium">
        <CheckCircle size={13} className="text-green-500" />
        Confirmed · {data.pdf_filename ?? 'report uploaded'}
        {data.pdf_drive_url && (
          <a href={data.pdf_drive_url} target="_blank" rel="noopener noreferrer"
            className="ml-1 text-blue-500 hover:underline flex items-center gap-0.5">
            View <ExternalLink size={10} />
          </a>
        )}
      </div>
      {data.property_address && (
        <p className="text-[10px] text-gray-500 italic">Address: {data.property_address}</p>
      )}
      <div className="space-y-1.5">
        <ScoreRow label="Overall" score={data.overall_score} riskLabel={data.overall_risk_label} />
        <ScoreRow label="Wildfire" score={data.wildfire_score} riskLabel={data.wildfire_risk_label} />
        <ScoreRow label="Flood" score={data.flood_score} riskLabel={data.flood_risk_label} />
      </div>
      {keyRisks.length > 0 && (
        <div className="mt-1">
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Key Risks</p>
          <ul className="space-y-0.5">
            {keyRisks.map((r, i) => (
              <li key={i} className="text-[11px] text-gray-600 flex gap-1.5">
                <span className="text-gray-400 flex-shrink-0">•</span>{r}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ReviewPanel({
  extracted, filename, driveUrl, confirming, onConfirm, onReupload,
}: {
  extracted: ExtractedClimate;
  filename: string | null;
  driveUrl: string | null;
  confirming: boolean;
  onConfirm: () => void;
  onReupload: () => void;
}) {
  const keyRisks = Array.isArray(extracted.key_risks) ? extracted.key_risks : [];
  return (
    <div className="border border-blue-200 bg-blue-50 rounded-xl p-3 space-y-3">
      <p className="text-xs font-semibold text-blue-800">Review extracted data — confirm to save</p>

      {extracted.property_address && (
        <div className="text-[11px] text-blue-700">
          <span className="font-medium">Property:</span> {extracted.property_address}
        </div>
      )}

      <div className="space-y-1.5">
        <ScoreRow label="Overall" score={extracted.overall_score} riskLabel={extracted.overall_risk_label} />
        <ScoreRow label="Wildfire" score={extracted.wildfire_score} riskLabel={extracted.wildfire_risk_label} />
        <ScoreRow label="Flood" score={extracted.flood_score} riskLabel={extracted.flood_risk_label} />
      </div>

      {keyRisks.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">Key Risks</p>
          <ul className="space-y-0.5">
            {keyRisks.map((r, i) => (
              <li key={i} className="text-[11px] text-gray-600 flex gap-1.5">
                <span className="text-gray-400 flex-shrink-0">•</span>{r}
              </li>
            ))}
          </ul>
        </div>
      )}

      {filename && (
        <div className="flex items-center gap-1 text-[10px] text-gray-500">
          File: {filename}
          {driveUrl && (
            <a href={driveUrl} target="_blank" rel="noopener noreferrer"
              className="text-blue-500 hover:underline flex items-center gap-0.5 ml-1">
              View in Drive <ExternalLink size={9} />
            </a>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button
          onClick={onConfirm}
          disabled={confirming}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          {confirming ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
          {confirming ? 'Saving…' : 'Confirm & Save'}
        </button>
        <button
          onClick={onReupload}
          disabled={confirming}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-500 hover:text-blue-600 border border-gray-200 hover:border-blue-200 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} /> Re-upload
        </button>
      </div>
    </div>
  );
}

/** Lightweight display for the quick-underwrite summary (read-only, color-coded). */
export function ClimateScoreSummary({ dealId }: { dealId: number | null }) {
  const [data, setData] = useState<ConfirmedClimate | null>(null);

  useEffect(() => {
    if (!dealId) return;
    fetch(`${API}/api/v1/underwriting/${dealId}/climate`)
      .then(r => r.json())
      .then(res => { if (res.success && res.confirmed) setData(res.data); })
      .catch(() => {});
  }, [dealId]);

  if (!data) return null;

  return (
    <div className="mt-4 pt-4 border-t border-gray-100">
      <p className="text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2">Climate Risk (ClimateCheck)</p>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Overall', score: data.overall_score, lbl: data.overall_risk_label },
          { label: 'Wildfire', score: data.wildfire_score, lbl: data.wildfire_risk_label },
          { label: 'Flood', score: data.flood_score, lbl: data.flood_risk_label },
        ].map(({ label, score, lbl }) => (
          <div key={label} className={`rounded-lg p-2 text-center ${scoreBg(score)}`}>
            <p className="text-[10px] text-gray-500">{label}</p>
            <p className={`text-base font-bold ${scoreColor(score)}`}>
              {score !== null && score !== undefined ? Math.round(score) : '—'}
            </p>
            {lbl && <p className="text-[9px] text-gray-400">{lbl}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
