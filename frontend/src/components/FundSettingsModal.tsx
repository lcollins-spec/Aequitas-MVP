import { useState } from 'react';
import { X, Save } from 'lucide-react';
import type { FundSettings } from '../types/fundSettings';

interface FundSettingsModalProps {
  settings: FundSettings;
  onSave: (updated: FundSettings) => void;
  onClose: () => void;
}

const FundSettingsModal = ({ settings, onSave, onClose }: FundSettingsModalProps) => {
  const [fundName, setFundName] = useState(settings.fundName);
  const [targetFundSize, setTargetFundSize] = useState(String(settings.targetFundSize));
  const [capitalCommitted, setCapitalCommitted] = useState(String(settings.capitalCommitted));
  const [vintageYear, setVintageYear] = useState(String(settings.vintageYear));
  const [investmentPeriodYears, setInvestmentPeriodYears] = useState(String(settings.investmentPeriodYears));
  const [prefReturn, setPrefReturn] = useState(String(settings.prefReturn * 100));
  const [carry, setCarry] = useState(String(settings.carry * 100));
  const [acqFee, setAcqFee] = useState(String(settings.acqFee * 100));
  const [amFee, setAmFee] = useState(String(settings.amFee * 100));

  const parseNum = (v: string) => parseFloat(v.replace(/,/g, '')) || 0;

  const handleSave = () => {
    const updated: FundSettings = {
      fundName: fundName.trim() || settings.fundName,
      targetFundSize: parseNum(targetFundSize),
      capitalCommitted: parseNum(capitalCommitted),
      vintageYear: parseInt(vintageYear) || settings.vintageYear,
      investmentPeriodYears: parseInt(investmentPeriodYears) || settings.investmentPeriodYears,
      prefReturn: parseNum(prefReturn) / 100,
      carry: parseNum(carry) / 100,
      acqFee: parseNum(acqFee) / 100,
      amFee: parseNum(amFee) / 100,
    };
    onSave(updated);
  };

  const fieldClass = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-primary-500 bg-white';
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl flex flex-col max-h-[90vh]">

        {/* Header */}
        <div className="flex items-start justify-between p-6 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Fund Settings</h2>
            <p className="text-sm text-gray-500 mt-0.5">Changes are saved to localStorage</p>
          </div>
          <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Scrollable form */}
        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-6">

          {/* Identity */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Fund Identity</h3>
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Fund Name</label>
                <input type="text" value={fundName} onChange={e => setFundName(e.target.value)} className={fieldClass} placeholder="e.g. Aequitas Fund I" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Target Fund Size ($)</label>
                  <input type="text" value={targetFundSize} onChange={e => setTargetFundSize(e.target.value)} className={fieldClass} placeholder="e.g. 200000000" />
                </div>
                <div>
                  <label className={labelClass}>Capital Committed ($)</label>
                  <input type="text" value={capitalCommitted} onChange={e => setCapitalCommitted(e.target.value)} className={fieldClass} placeholder="e.g. 50000000" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>Vintage Year</label>
                  <input type="number" value={vintageYear} onChange={e => setVintageYear(e.target.value)} className={fieldClass} min="2000" max="2100" />
                </div>
                <div>
                  <label className={labelClass}>Investment Period (years)</label>
                  <input type="number" value={investmentPeriodYears} onChange={e => setInvestmentPeriodYears(e.target.value)} className={fieldClass} min="1" max="20" />
                </div>
              </div>
            </div>
          </div>

          {/* Economics */}
          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Economics</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Preferred Return (%)</label>
                <input type="number" step="0.1" value={prefReturn} onChange={e => setPrefReturn(e.target.value)} className={fieldClass} placeholder="e.g. 8" />
              </div>
              <div>
                <label className={labelClass}>Carry (%)</label>
                <input type="number" step="0.5" value={carry} onChange={e => setCarry(e.target.value)} className={fieldClass} placeholder="e.g. 20" />
              </div>
              <div>
                <label className={labelClass}>Acquisition Fee (%)</label>
                <input type="number" step="0.1" value={acqFee} onChange={e => setAcqFee(e.target.value)} className={fieldClass} placeholder="e.g. 2" />
              </div>
              <div>
                <label className={labelClass}>Asset Management Fee (%)</label>
                <input type="number" step="0.1" value={amFee} onChange={e => setAmFee(e.target.value)} className={fieldClass} placeholder="e.g. 0.5" />
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-primary-800 hover:bg-primary-700 rounded-lg transition-colors"
          >
            <Save size={15} />
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
};

export default FundSettingsModal;
