import { useState, useRef } from 'react';
import { X, AlertCircle } from 'lucide-react';
import * as sourcingApi from '../services/sourcingApi';
import type { MarketEntry, SourcingProperty, SourcingOperator, SourcingBroker, ParsedDealFields } from '../services/sourcingApi';
import { gpApi } from '../services/gpApi';
import type { GP } from '../types/gp';

interface UploadDealModalProps {
  market: string;
  markets: MarketEntry[];
  gps: GP[];
  operators: SourcingOperator[];
  brokers: SourcingBroker[];
  onSave: (p: SourcingProperty) => void | Promise<void>;
  onClose: () => void;
  mode?: 'email' | 'om';
}

// Loose substring match, same heuristic already used for market matching:
// catches "Greystar" <-> "Greystar Real Estate Partners" in either direction.
function findMatch<T>(items: T[], name: (item: T) => string, extracted: string): T | undefined {
  const needle = extracted.toLowerCase().trim();
  if (!needle) return undefined;
  return items.find(item => {
    const n = name(item).toLowerCase();
    return n === needle || n.includes(needle) || needle.includes(n);
  });
}

const UploadDealModal = ({ market, markets, gps, operators, brokers, onSave, onClose, mode = 'email' }: UploadDealModalProps) => {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<ParsedDealFields | null>(null);
  const [targetMarket, setTargetMarket] = useState(market);
  const [marketWasMatched, setMarketWasMatched] = useState(true);
  const [targetGpId, setTargetGpId] = useState<number | null>(null);
  const [showNewGpForm, setShowNewGpForm] = useState(false);
  const [pendingNewGp, setPendingNewGp] = useState(false);
  const [newGpName, setNewGpName] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const parse = async () => {
    if (!text.trim() && !file) return;
    setParsing(true);
    setError(null);
    try {
      const result = await sourcingApi.parseDeal(text, file);
      setFields({
        property_address:   result.property_address   || '',
        unit_count:         result.unit_count         || '',
        asking_price:       result.asking_price       || '',
        seller_broker_name: result.seller_broker_name || '',
        operator_name:      result.operator_name      || '',
        market_city:        result.market_city        || '',
        contact_name:       result.contact_name       || '',
        contact_phone:      result.contact_phone      || '',
        contact_email:      result.contact_email      || '',
      });

      // Default "Add to Market" to extracted market if it matches an existing entry;
      // otherwise fall through to auto-create on save.
      const extractedMarket = (result.market_city || '').toLowerCase().split(',')[0].trim();
      const matchedMarket = findMatch(markets, m => m.name, extractedMarket);
      setTargetMarket(matchedMarket ? matchedMarket.name : '');
      setMarketWasMatched(!!matchedMarket || !extractedMarket);

      // Same heuristic against GPs. No match -> offer to create one; empty extraction -> skip.
      // Always set every branch (mirroring the market logic above) so a stale match/prompt
      // from a previous parse in this same modal session can never carry over.
      const extractedGp = (result.operator_name || '').trim();
      const matchedGp = findMatch(gps, g => g.gpName, extractedGp);
      if (matchedGp) {
        setTargetGpId(matchedGp.id ?? null);
        setShowNewGpForm(false);
        setPendingNewGp(false);
        setNewGpName('');
      } else if (extractedGp) {
        setTargetGpId(null);
        setShowNewGpForm(true);
        setPendingNewGp(true);
        setNewGpName(extractedGp);
      } else {
        setTargetGpId(null);
        setShowNewGpForm(false);
        setPendingNewGp(false);
        setNewGpName('');
      }
    } catch (e: any) {
      setError(e.message || 'Failed to parse');
    } finally {
      setParsing(false);
    }
  };

  const handleSave = async () => {
    if (!fields) return;
    setSaving(true);
    setError(null);
    try {
      const needsNewGp = pendingNewGp && newGpName.trim().length > 0;
      const needsNewMarket = !marketWasMatched && !targetMarket && !!fields.market_city;
      const marketName = needsNewMarket ? fields.market_city.split(',')[0].trim() : targetMarket;

      // Operator and GP are the same real-world thing here — same extracted name matched
      // against both lists. Mirrors the market auto-create pattern: match by name, silently
      // create a pipeline entry in the Operators tab if there's no existing one, so uploading
      // a deal keeps that tab populated the same way it already keeps Markets populated.
      const extractedOperatorName = fields.operator_name.trim();
      const matchedOperator = findMatch(operators, o => o.name, extractedOperatorName);
      const needsNewOperator = !matchedOperator && !!extractedOperatorName;

      // Same treatment for the listing broker.
      const extractedBrokerName = fields.seller_broker_name.trim();
      const matchedBroker = findMatch(brokers, b => b.name, extractedBrokerName);
      const needsNewBroker = !matchedBroker && !!extractedBrokerName;

      const [gp] = await Promise.all([
        needsNewGp ? gpApi.createGP({ gpName: newGpName.trim() }) : Promise.resolve(null),
        needsNewMarket
          ? sourcingApi.createMarket({ id: Date.now().toString(), name: marketName })
          : Promise.resolve(null),
        needsNewOperator
          ? sourcingApi.createOperator({
              id: `${Date.now()}-op`,
              market: marketName,
              name: extractedOperatorName,
              firm: '',
              status: 'prospecting',
              properties_managed: '',
              last_contact_date: '',
              notes: 'Auto-added from deal upload',
            })
          : Promise.resolve(null),
        needsNewBroker
          ? sourcingApi.createBroker({
              id: `${Date.now()}-br`,
              market: marketName,
              name: extractedBrokerName,
              firm: '',
              status: 'cold',
              last_contact_date: '',
              last_deal_sent: '',
              notes: 'Auto-added from deal upload',
            })
          : Promise.resolve(null),
      ]);
      const gpId = gp ? (gp.id ?? null) : targetGpId;

      const noteParts: string[] = [];
      if (fields.asking_price) noteParts.push(`Asking: ${fields.asking_price}`);
      const prop: SourcingProperty = {
        id: Date.now().toString(),
        market: marketName,
        address:        fields.property_address,
        units:          parseInt(fields.unit_count) || 0,
        transaction_type: 'Acquisition',
        owner_name:     fields.seller_broker_name,
        operator_name:  fields.operator_name,
        contact_name:   fields.contact_name,
        contact_phone:  fields.contact_phone,
        contact_email:  fields.contact_email,
        status:   'Identified',
        priority: 'medium',
        notes:    noteParts.join(' | '),
        deal_id:  null,
        gp_id:    gpId,
      };
      await onSave(prop);
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-primary-500';

  if (fields) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
        <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
            <h2 className="text-base font-semibold text-gray-800">Review Extracted Deal</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
          </div>
          <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
            <p className="text-xs text-gray-500 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
              Review and edit the extracted fields before saving. Blank fields were not found in the source material.
            </p>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Property Address</label>
              <input type="text" value={fields.property_address}
                onChange={e => setFields(f => f ? { ...f, property_address: e.target.value } : f)}
                className={inputCls} placeholder="Not found" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Unit Count</label>
                <input type="text" value={fields.unit_count}
                  onChange={e => setFields(f => f ? { ...f, unit_count: e.target.value } : f)}
                  className={inputCls} placeholder="Not found" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Asking Price</label>
                <input type="text" value={fields.asking_price}
                  onChange={e => setFields(f => f ? { ...f, asking_price: e.target.value } : f)}
                  className={inputCls} placeholder="Not found" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Owner / Broker Name</label>
              <input type="text" value={fields.seller_broker_name}
                onChange={e => setFields(f => f ? { ...f, seller_broker_name: e.target.value } : f)}
                className={inputCls} placeholder="Not found" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Operator Name</label>
              <input type="text" value={fields.operator_name}
                onChange={e => setFields(f => f ? { ...f, operator_name: e.target.value } : f)}
                className={inputCls} placeholder="Not found" />
            </div>
            {targetGpId !== null && !showNewGpForm && (
              <div className="text-xs text-green-700 bg-green-50 border border-green-100 rounded-lg px-3 py-2">
                Matched to existing GP: <span className="font-medium">{gps.find(g => g.id === targetGpId)?.gpName}</span>
              </div>
            )}
            {showNewGpForm && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
                <p className="text-xs font-medium text-amber-800">No matching GP found for "{fields.operator_name}"</p>
                <input type="text" value={newGpName} onChange={e => setNewGpName(e.target.value)}
                  className={inputCls} placeholder="GP name" />
                <div className="flex gap-2">
                  <button type="button" onClick={() => setShowNewGpForm(false)} disabled={!newGpName.trim()}
                    className="flex-1 py-1.5 text-xs font-medium bg-amber-600 text-white rounded-lg hover:bg-amber-700 disabled:opacity-50 transition-colors">
                    Create new GP
                  </button>
                  <button type="button" onClick={() => { setShowNewGpForm(false); setPendingNewGp(false); setNewGpName(''); setTargetGpId(null); }}
                    className="flex-1 py-1.5 text-xs border border-amber-300 text-amber-700 rounded-lg hover:bg-amber-100 transition-colors">
                    Skip
                  </button>
                </div>
              </div>
            )}
            {pendingNewGp && !showNewGpForm && (
              <div className="text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
                Will create new GP "<span className="font-medium">{newGpName}</span>" on save.
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Market / City</label>
              <input type="text" value={fields.market_city}
                onChange={e => {
                  const value = e.target.value;
                  setFields(f => f ? { ...f, market_city: value } : f);
                  const extracted = value.toLowerCase().split(',')[0].trim();
                  const matched = findMatch(markets, m => m.name, extracted);
                  setTargetMarket(matched ? matched.name : '');
                  setMarketWasMatched(!!matched || !extracted);
                }}
                className={inputCls} placeholder="Not found" />
            </div>
            <div className="space-y-3 pt-1">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Contact</p>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contact Name</label>
                <input type="text" value={fields.contact_name}
                  onChange={e => setFields(f => f ? { ...f, contact_name: e.target.value } : f)}
                  className={inputCls} placeholder="Not found" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Contact Phone</label>
                  <input type="tel" value={fields.contact_phone}
                    onChange={e => setFields(f => f ? { ...f, contact_phone: e.target.value } : f)}
                    className={inputCls} placeholder="Not found" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Contact Email</label>
                  <input type="email" value={fields.contact_email}
                    onChange={e => setFields(f => f ? { ...f, contact_email: e.target.value } : f)}
                    className={inputCls} placeholder="Not found" />
                </div>
              </div>
            </div>
            {markets.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Add to Market</label>
                <select value={targetMarket} onChange={e => { setTargetMarket(e.target.value); setMarketWasMatched(true); }} className={inputCls}>
                  <option value="">
                    {marketWasMatched ? '— select market —' : `— create "${fields.market_city.split(',')[0].trim()}" —`}
                  </option>
                  {markets.map(m => <option key={m.id} value={m.name}>{m.name}</option>)}
                </select>
                {!marketWasMatched && !targetMarket && (
                  <p className="text-xs text-gray-500 mt-1">No existing market matched — a new one will be created on save.</p>
                )}
              </div>
            )}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
                <span className="text-sm text-red-700">{error}</span>
              </div>
            )}
          </div>
          <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
            <button onClick={handleSave} disabled={saving}
              className="flex-1 py-2 text-sm font-medium bg-primary-800 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors">
              {saving ? 'Saving…' : 'Save Deal'}
            </button>
            <button onClick={() => setFields(null)} className="flex-1 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">{mode === 'om' ? 'Import from OM' : 'Import from Email'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors"><X size={18} /></button>
        </div>
        <div className="p-6 space-y-4">
          {mode === 'email' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Paste email or deal material</label>
              <textarea
                rows={6} value={text} onChange={e => setText(e.target.value)}
                placeholder="Paste email, OM summary, or any deal text here…"
                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:border-primary-500 resize-none"
              />
            </div>
          )}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-2">{mode === 'om' ? 'Upload OM (PDF)' : 'Or upload a PDF'}</label>
            <div className="flex items-center gap-3">
              <button onClick={() => fileRef.current?.click()}
                className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 transition-colors">
                Choose PDF
              </button>
              <span className="text-sm text-gray-500">{file ? file.name : 'No file selected'}</span>
              <input ref={fileRef} type="file" accept=".pdf"
                onChange={e => setFile(e.target.files?.[0] ?? null)} className="hidden" />
            </div>
          </div>
          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle size={15} className="text-red-500 flex-shrink-0 mt-0.5" />
              <span className="text-sm text-red-700">{error}</span>
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 py-4 border-t border-gray-200">
          <button
            onClick={parse}
            disabled={(!text.trim() && !file) || parsing}
            className="flex-1 py-2 text-sm font-medium bg-primary-800 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
          >
            {parsing
              ? <><span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> Parsing…</>
              : 'Parse'}
          </button>
          <button onClick={onClose} className="flex-1 py-2 text-sm border border-gray-300 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadDealModal;
