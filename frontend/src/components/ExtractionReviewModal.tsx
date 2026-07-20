/**
 * Extraction Review Modal
 * Shows AI-extracted OM / rent-roll data grouped by section so the user can
 * double-check and correct values before they're applied to the underwriting
 * form (and, from there, exported into the model's Inputs tab).
 */

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';

export type ReviewFieldType = 'text' | 'number' | 'percent';

export interface ReviewField {
  key: string; // dot path into the extracted data object, e.g. 'operatingExpenses.insuranceAnnual'
  label: string;
  group: string;
  type?: ReviewFieldType;
}

export interface ReviewUnitMixRow {
  unitType: string;
  count: number;
  askingRent: number;
  avgSf: number;
}

interface ExtractionReviewModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  data: any;
  fields: ReviewField[];
  includeUnitMix?: boolean;
  onConfirm: (editedData: any) => void;
  onCancel: () => void;
}

function getPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), obj);
}

function setPath(obj: any, path: string, value: any): any {
  const keys = path.split('.');
  const clone = { ...obj };
  let cursor = clone;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    cursor[k] = { ...(cursor[k] ?? {}) };
    cursor = cursor[k];
  }
  cursor[keys[keys.length - 1]] = value;
  return clone;
}

const MAX_UNIT_TYPES = 16;

const ExtractionReviewModal: React.FC<ExtractionReviewModalProps> = ({
  isOpen,
  title,
  subtitle,
  data,
  fields,
  includeUnitMix,
  onConfirm,
  onCancel,
}) => {
  const [edited, setEdited] = useState<any>(data ?? {});
  const [unitMix, setUnitMix] = useState<ReviewUnitMixRow[]>([]);

  useEffect(() => {
    if (isOpen) {
      setEdited(data ?? {});
      const mix = (data?.unitMix ?? []) as any[];
      setUnitMix(
        mix.map((u) => ({
          unitType: u.unitType ?? u.type ?? '',
          count: u.count ?? 0,
          askingRent: u.askingRent ?? u.rent ?? 0,
          avgSf: u.avgSf ?? u.sqft ?? 0,
        }))
      );
    }
  }, [isOpen, data]);

  if (!isOpen) return null;

  const groups = fields.reduce<Record<string, ReviewField[]>>((acc, f) => {
    (acc[f.group] ||= []).push(f);
    return acc;
  }, {});

  const handleFieldChange = (field: ReviewField, raw: string) => {
    let value: any = raw;
    if (field.type === 'number') {
      value = raw === '' ? null : Number(raw);
    } else if (field.type === 'percent') {
      value = raw === '' ? null : Number(raw) / 100;
    }
    setEdited((prev: any) => setPath(prev, field.key, value));
  };

  const displayValue = (field: ReviewField) => {
    const v = getPath(edited, field.key);
    if (v == null) return '';
    if (field.type === 'percent') return (Number(v) * 100).toString();
    return v;
  };

  const handleConfirm = () => {
    const finalData = includeUnitMix ? { ...edited, unitMix } : edited;
    onConfirm(finalData);
  };

  const inputCls =
    'w-full px-2 py-1.5 bg-gray-50 border border-gray-200 rounded text-sm text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500';
  const labelCls = 'block text-xs font-medium text-gray-500 mb-1';

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b sticky top-0 bg-white z-10">
          <div>
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X className="h-6 w-6" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
            <p className="text-sm text-gray-800">
              Review the values extracted below before they're added to the deal. Only what you confirm here
              flows into the exported model.
            </p>
          </div>

          {Object.entries(groups).map(([group, groupFields]) => (
            <div key={group}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{group}</p>
              <div className="grid grid-cols-2 gap-3">
                {groupFields.map((field) => (
                  <div key={field.key}>
                    <label className={labelCls}>
                      {field.label}
                      {field.type === 'percent' && ' (%)'}
                    </label>
                    <input
                      type={field.type === 'text' ? 'text' : 'number'}
                      value={displayValue(field)}
                      onChange={(e) => handleFieldChange(field, e.target.value)}
                      className={inputCls}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {includeUnitMix && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Unit Mix</p>
                <span className="text-xs text-gray-500">
                  {unitMix.reduce((s, u) => s + (u.count || 0), 0)} units total
                </span>
              </div>
              <div className="border border-gray-200 rounded-lg overflow-hidden text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-2 py-1.5 text-gray-500 font-medium">Type</th>
                      <th className="text-right px-2 py-1.5 text-gray-500 font-medium">Units</th>
                      <th className="text-right px-2 py-1.5 text-gray-500 font-medium">Rent/mo</th>
                      <th className="text-right px-2 py-1.5 text-gray-500 font-medium">Avg SF</th>
                      <th className="px-1"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {unitMix.map((row, idx) => (
                      <tr key={idx} className="border-t border-gray-100">
                        <td className="px-2 py-1">
                          <input
                            type="text"
                            value={row.unitType}
                            onChange={(e) => {
                              const u = [...unitMix];
                              u[idx] = { ...u[idx], unitType: e.target.value };
                              setUnitMix(u);
                            }}
                            className="w-full px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            value={row.count}
                            onChange={(e) => {
                              const u = [...unitMix];
                              u[idx] = { ...u[idx], count: Number(e.target.value) || 0 };
                              setUnitMix(u);
                            }}
                            className="w-16 px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-right text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            value={row.askingRent}
                            onChange={(e) => {
                              const u = [...unitMix];
                              u[idx] = { ...u[idx], askingRent: Number(e.target.value) || 0 };
                              setUnitMix(u);
                            }}
                            className="w-20 px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-right text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            value={row.avgSf}
                            onChange={(e) => {
                              const u = [...unitMix];
                              u[idx] = { ...u[idx], avgSf: Number(e.target.value) || 0 };
                              setUnitMix(u);
                            }}
                            className="w-20 px-1.5 py-0.5 bg-gray-50 border border-gray-200 rounded text-right text-gray-800 focus:outline-none focus:ring-1 focus:ring-primary-500"
                          />
                        </td>
                        <td className="px-1">
                          <button
                            onClick={() => setUnitMix(unitMix.filter((_, i) => i !== idx))}
                            className="text-gray-300 hover:text-red-400 text-xs"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                    {unitMix.length < MAX_UNIT_TYPES && (
                      <tr className="border-t border-gray-100">
                        <td colSpan={5} className="px-2 py-1.5">
                          <button
                            onClick={() => setUnitMix([...unitMix, { unitType: '', count: 0, askingRent: 0, avgSf: 0 }])}
                            className="text-xs text-primary-800 hover:text-primary-700"
                          >
                            + Add row
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end space-x-3 p-6 border-t sticky bottom-0 bg-white">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Discard
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 bg-primary-800 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            Confirm & Apply
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExtractionReviewModal;
