// Merges OM, Rent Roll, and T-12 extractions into one dataset for the shared
// ExtractionReviewModal, and flags fields where the sources disagree.
//
// Precedence:
//  - Occupancy/lease-term fields (vacancy, bad debt, rent stabilization, rent
//    growth cap): T-12 > Rent Roll > OM. T-12 reflects actual trailing-12-month
//    realized performance; Rent Roll is a current snapshot; OM is often an
//    optimistic underwriting assumption.
//  - Expense/actuals fields (operating expenses, laundry income): T-12 > OM.
//    Rent Roll never supplies these.
//  - Location/identity fields: OM > Rent Roll > T-12 (OM is the primary
//    property document; the others only fill gaps).
//  - Unit mix: Rent Roll > OM. T-12 never extracts unit mix.
//  - Everything else: OM-only, uncontested (pricing, NOI, opex-per-unit
//    breakdowns, tax/deal-structure fields Rent Roll and T-12 don't extract).
// Manually-seeded fields (deal costs, senior loan, abatement schedule) pass
// straight through untouched.

import type { ReviewField } from '../components/ExtractionReviewModal';

export const OM_REVIEW_FIELDS: ReviewField[] = [
  { key: 'propertyName', label: 'Property Name', group: 'Property', type: 'text' },
  { key: 'askingPrice', label: 'Asking Price', group: 'Property', type: 'number' },
  { key: 'city', label: 'City', group: 'Property', type: 'text' },
  { key: 'state', label: 'State', group: 'Property', type: 'text' },
  { key: 'zipcode', label: 'Zip Code', group: 'Property', type: 'text' },
  { key: 'ttmNoi', label: 'TTM NOI', group: 'Property', type: 'number' },

  { key: 'vacancyRate', label: 'Vacancy Rate', group: 'Vacancy & Credit Loss', type: 'percent' },
  { key: 'badDebtRate', label: 'Bad Debt Rate', group: 'Vacancy & Credit Loss', type: 'percent' },
  { key: 'lossToLeaseRate', label: 'Loss to Lease Rate', group: 'Vacancy & Credit Loss', type: 'percent' },
  { key: 'concessionsRate', label: 'Concessions Rate', group: 'Vacancy & Credit Loss', type: 'percent' },

  { key: 'rubsPct', label: 'RUBS %', group: 'Other Income', type: 'number' },
  { key: 'parkingIncomePerUnit', label: 'Parking $/Unit/Mo', group: 'Other Income', type: 'number' },
  { key: 'otherIncomePerUnit', label: 'Other Income $/Unit/Mo', group: 'Other Income', type: 'number' },
  { key: 'laundryIncome', label: 'Laundry Income (Annual)', group: 'Other Income', type: 'number' },

  { key: 'operatingExpenses.insuranceAnnual', label: 'Insurance (Annual)', group: 'Operating Expenses', type: 'number' },
  { key: 'operatingExpenses.utilitiesAnnual', label: 'Utilities (Annual)', group: 'Operating Expenses', type: 'number' },
  { key: 'operatingExpenses.propertyTaxAnnual', label: 'Property Tax (Annual)', group: 'Operating Expenses', type: 'number' },
  { key: 'operatingExpenses.managementFeePct', label: 'Management Fee', group: 'Operating Expenses', type: 'percent' },
  { key: 'opexPayrollPerUnit', label: 'Payroll $/Unit', group: 'Operating Expenses', type: 'number' },
  { key: 'opexAdminPerUnit', label: 'Admin $/Unit', group: 'Operating Expenses', type: 'number' },
  { key: 'opexMarketingPerUnit', label: 'Marketing $/Unit', group: 'Operating Expenses', type: 'number' },
  { key: 'opexRmPerUnit', label: 'R&M $/Unit', group: 'Operating Expenses', type: 'number' },
  { key: 'opexContractServicePerUnit', label: 'Contract Service $/Unit', group: 'Operating Expenses', type: 'number' },
  { key: 'opexTurnoverPerUnit', label: 'Turnover $/Unit', group: 'Operating Expenses', type: 'number' },
  { key: 'capexPerUnit', label: 'Capex Reserve $/Unit', group: 'Operating Expenses', type: 'number' },
  { key: 'opexGrowthRate', label: 'Opex Growth Rate', group: 'Operating Expenses', type: 'percent' },
  { key: 'insuranceGrowthRate', label: 'Insurance Growth Rate', group: 'Operating Expenses', type: 'percent' },

  { key: 'assessedValue', label: 'Assessed Value', group: 'Property Tax & Deal Structure', type: 'number' },
  { key: 'assessmentPct', label: 'Assessment %', group: 'Property Tax & Deal Structure', type: 'percent' },
  { key: 'bridgePeriodMonths', label: 'Bridge Period (Months)', group: 'Property Tax & Deal Structure', type: 'number' },
  { key: 'lpEquityShare', label: 'LP Equity Share', group: 'Property Tax & Deal Structure', type: 'percent' },

  { key: 'closingCostPct', label: 'Closing Costs (% of Acquisition Cost)', group: 'Deal Costs (enter manually)', type: 'percent' },
  { key: 'acquisitionFeePct', label: 'Aequitas Acquisition Fee (% of Acquisition Cost)', group: 'Deal Costs (enter manually)', type: 'percent' },
  { key: 'workingCapitalPerUnit', label: 'Working Capital ($/Unit)', group: 'Deal Costs (enter manually)', type: 'number' },

  { key: 'seniorLtvPct', label: 'LTV', group: 'Senior Loan (enter manually)', type: 'percent' },
  { key: 'seniorInterestRate', label: 'Interest Rate', group: 'Senior Loan (enter manually)', type: 'percent' },
  { key: 'seniorIoPeriods', label: 'IO Periods (Months)', group: 'Senior Loan (enter manually)', type: 'number' },
  { key: 'seniorFinancingCostsPct', label: 'Financing Costs', group: 'Senior Loan (enter manually)', type: 'percent' },

  { key: 'abatementYear1', label: 'Abatement % Year 1', group: 'Property Tax Abatement (enter manually)', type: 'percent' },
  { key: 'abatementYear2', label: 'Abatement % Year 2', group: 'Property Tax Abatement (enter manually)', type: 'percent' },
  { key: 'abatementYear3', label: 'Abatement % Year 3', group: 'Property Tax Abatement (enter manually)', type: 'percent' },
  { key: 'abatementYear4', label: 'Abatement % Year 4', group: 'Property Tax Abatement (enter manually)', type: 'percent' },
  { key: 'abatementYear5', label: 'Abatement % Year 5', group: 'Property Tax Abatement (enter manually)', type: 'percent' },
];

export const RENT_ROLL_REVIEW_FIELDS: ReviewField[] = [
  { key: 'city', label: 'City', group: 'Property', type: 'text' },
  { key: 'state', label: 'State', group: 'Property', type: 'text' },
  { key: 'zipcode', label: 'Zip Code', group: 'Property', type: 'text' },

  { key: 'vacancyRate', label: 'Vacancy Rate', group: 'Vacancy & Credit Loss', type: 'percent' },
  { key: 'badDebtRate', label: 'Bad Debt Rate', group: 'Vacancy & Credit Loss', type: 'percent' },

  { key: 'annualRentGrowthCap', label: 'Annual Rent Growth Cap', group: 'Rent Stabilization', type: 'percent' },

  { key: 'closingCostPct', label: 'Closing Costs (% of Acquisition Cost)', group: 'Deal Costs (enter manually)', type: 'percent' },
  { key: 'acquisitionFeePct', label: 'Aequitas Acquisition Fee (% of Acquisition Cost)', group: 'Deal Costs (enter manually)', type: 'percent' },
  { key: 'workingCapitalPerUnit', label: 'Working Capital ($/Unit)', group: 'Deal Costs (enter manually)', type: 'number' },

  { key: 'seniorLtvPct', label: 'LTV', group: 'Senior Loan (enter manually)', type: 'percent' },
  { key: 'seniorInterestRate', label: 'Interest Rate', group: 'Senior Loan (enter manually)', type: 'percent' },
  { key: 'seniorIoPeriods', label: 'IO Periods (Months)', group: 'Senior Loan (enter manually)', type: 'number' },
  { key: 'seniorFinancingCostsPct', label: 'Financing Costs', group: 'Senior Loan (enter manually)', type: 'percent' },
];

// Union of both field lists, deduped by key — OM's list is a near-superset today,
// but this stays correct if a Rent-Roll-only field is ever added.
export const MERGED_REVIEW_FIELDS: ReviewField[] = (() => {
  const seen = new Set<string>();
  const merged: ReviewField[] = [];
  for (const field of [...OM_REVIEW_FIELDS, ...RENT_ROLL_REVIEW_FIELDS]) {
    if (seen.has(field.key)) continue;
    seen.add(field.key);
    merged.push(field);
  }
  return merged;
})();

// Occupancy/lease-term fields: T-12 wins when present, else Rent Roll, else OM.
const OCCUPANCY_KEYS = ['vacancyRate', 'badDebtRate', 'rentStabilized', 'annualRentGrowthCap'];
// Location/identity fields: OM wins when present, else Rent Roll, else T-12.
const LOCATION_KEYS = ['propertyName', 'address', 'city', 'state', 'zipcode'];
// Expense sub-fields nested under `operatingExpenses`: T-12 wins when present, else OM.
// Rent Roll's extraction always returns `operatingExpenses: null`, so it's never a contender.
const EXPENSE_SUBFIELD_KEYS = ['utilitiesAnnual', 'insuranceAnnual', 'propertyTaxAnnual', 'repairsMaintenanceAnnual', 'managementFeePct'];

type SourceKey = 'om' | 'rentRoll' | 't12';

export interface Discrepancy {
  field: string;
  label: string;
  omValue: any;
  rentRollValue: any;
  t12Value?: any;
  appliedValue: any;
  appliedSource: SourceKey;
}

function normalizeText(v: any): string {
  return String(v ?? '').trim().toLowerCase();
}

function fieldLabel(key: string): string {
  return MERGED_REVIEW_FIELDS.find((f) => f.key === key)?.label ?? key;
}

function percentDiffers(a: number, b: number): boolean {
  return Math.abs(a - b) > 0.005;
}

function normalizeUnitType(v: any): string {
  return String(v ?? '').trim().toLowerCase().replace(/\s+/g, '');
}

interface UnitMixRow { unitType: string; count: number; askingRent: number; avgSf: number }

function diffUnitMix(omMix: UnitMixRow[], rrMix: UnitMixRow[]): Discrepancy[] {
  const discrepancies: Discrepancy[] = [];
  const omByType = new Map(omMix.map((u) => [normalizeUnitType(u.unitType), u]));
  const rrByType = new Map(rrMix.map((u) => [normalizeUnitType(u.unitType), u]));
  const allTypes = new Set([...omByType.keys(), ...rrByType.keys()]);

  for (const type of allTypes) {
    const om = omByType.get(type);
    const rr = rrByType.get(type);
    const label = om?.unitType || rr?.unitType || type;

    if (om && !rr) {
      discrepancies.push({
        field: `unitMix.${type}`, label: `Unit Mix: ${label}`,
        omValue: `${om.count} units @ $${om.askingRent}`, rentRollValue: 'not on rent roll',
        appliedValue: om, appliedSource: 'om',
      });
      continue;
    }
    if (rr && !om) {
      // Present only on the rent roll — nothing to reconcile against, not a discrepancy.
      continue;
    }
    if (om && rr) {
      const countDiffers = Math.round(om.count) !== Math.round(rr.count);
      const rentDiffers = om.askingRent > 0 && rr.askingRent > 0 &&
        Math.abs(om.askingRent - rr.askingRent) / om.askingRent > 0.01;
      if (countDiffers || rentDiffers) {
        discrepancies.push({
          field: `unitMix.${type}`, label: `Unit Mix: ${label}`,
          omValue: `${om.count} units @ $${om.askingRent}`, rentRollValue: `${rr.count} units @ $${rr.askingRent}`,
          appliedValue: rr, appliedSource: 'rentRoll',
        });
      }
    }
  }
  return discrepancies;
}

type ValueKind = 'percent' | 'text' | 'boolean';

function valuesDiffer(a: any, b: any, kind: ValueKind): boolean {
  if (kind === 'boolean') return Boolean(a) !== Boolean(b);
  if (kind === 'percent') return percentDiffers(Number(a), Number(b));
  return normalizeText(a) !== normalizeText(b);
}

// Builds at most one Discrepancy per field, even when all three sources are
// present — pairwise OM-vs-T12 and RentRoll-vs-T12 checks would otherwise
// double up the same field in the banner when only one source is an outlier.
function buildDiscrepancy(
  key: string,
  kind: ValueKind,
  present: { source: SourceKey; value: any }[],
  appliedValue: any,
  appliedSource: SourceKey,
): Discrepancy | null {
  if (present.length < 2) return null;
  const disagree = present.some((a, i) => present.slice(i + 1).some((b) => valuesDiffer(a.value, b.value, kind)));
  if (!disagree) return null;
  const valueFor = (s: SourceKey) => present.find((p) => p.source === s)?.value;
  return {
    field: key, label: fieldLabel(key),
    omValue: valueFor('om'), rentRollValue: valueFor('rentRoll'), t12Value: valueFor('t12'),
    appliedValue, appliedSource,
  };
}

export function mergeExtractions(
  om: any | null,
  rentRoll: any | null,
  t12: any | null = null,
): { merged: any; discrepancies: Discrepancy[] } {
  // Base merge is null-coalescing, not a raw spread: extraction schemas
  // explicitly return null for fields they don't cover (e.g. Rent Roll's
  // askingPrice, T-12's askingPrice), and a spread would let those explicit
  // nulls stomp over a real value from another source. Default order is
  // OM, then Rent Roll, then T-12; the precedence blocks below override
  // that default for the specific fields where it doesn't apply.
  const merged: any = {};
  for (const key of new Set([...Object.keys(om ?? {}), ...Object.keys(rentRoll ?? {}), ...Object.keys(t12 ?? {})])) {
    const omValue = om?.[key];
    const rrValue = rentRoll?.[key];
    merged[key] = omValue != null ? omValue : (rrValue != null ? rrValue : t12?.[key]);
  }
  const discrepancies: Discrepancy[] = [];

  // Occupancy/lease-term fields: T-12 > Rent Roll > OM.
  for (const key of OCCUPANCY_KEYS) {
    const omValue = om?.[key];
    const rrValue = rentRoll?.[key];
    const t12Value = t12?.[key];
    merged[key] = t12Value != null ? t12Value : (rrValue != null ? rrValue : omValue);
    const appliedSource: SourceKey = t12Value != null ? 't12' : rrValue != null ? 'rentRoll' : 'om';
    const present = [
      omValue != null && { source: 'om' as const, value: omValue },
      rrValue != null && { source: 'rentRoll' as const, value: rrValue },
      t12Value != null && { source: 't12' as const, value: t12Value },
    ].filter(Boolean) as { source: SourceKey; value: any }[];
    const d = buildDiscrepancy(key, key === 'rentStabilized' ? 'boolean' : 'percent', present, merged[key], appliedSource);
    if (d) discrepancies.push(d);
  }

  // Location/identity fields: OM > Rent Roll > T-12.
  for (const key of LOCATION_KEYS) {
    const omValue = om?.[key];
    const rrValue = rentRoll?.[key];
    const t12Value = t12?.[key];
    const omPresent = omValue != null && omValue !== '';
    const rrPresent = rrValue != null && rrValue !== '';
    const t12Present = t12Value != null && t12Value !== '';
    merged[key] = omPresent ? omValue : rrPresent ? rrValue : (t12Present ? t12Value : undefined);
    const appliedSource: SourceKey = omPresent ? 'om' : rrPresent ? 'rentRoll' : 't12';
    const present = [
      omPresent && { source: 'om' as const, value: omValue },
      rrPresent && { source: 'rentRoll' as const, value: rrValue },
      t12Present && { source: 't12' as const, value: t12Value },
    ].filter(Boolean) as { source: SourceKey; value: any }[];
    const d = buildDiscrepancy(key, 'text', present, merged[key], appliedSource);
    if (d) discrepancies.push(d);
  }

  // Expense sub-fields: T-12 > OM, merged field-by-field (not whole-object) so
  // T-12 partially covering (e.g.) just utilities doesn't blank out OM's
  // insurance/tax/management-fee figures for the fields T-12 didn't extract.
  const omOe = om?.operatingExpenses ?? null;
  const t12Oe = t12?.operatingExpenses ?? null;
  if (omOe || t12Oe) {
    const mergedOe: any = {};
    for (const subKey of EXPENSE_SUBFIELD_KEYS) {
      const omValue = omOe?.[subKey];
      const t12Value = t12Oe?.[subKey];
      mergedOe[subKey] = t12Value != null ? t12Value : omValue;
      if (omValue != null && t12Value != null) {
        const d = buildDiscrepancy(
          `operatingExpenses.${subKey}`, 'percent',
          [{ source: 'om', value: omValue }, { source: 't12', value: t12Value }],
          mergedOe[subKey], 't12',
        );
        if (d) discrepancies.push(d);
      }
    }
    merged.operatingExpenses = mergedOe;
  }

  // laundryIncome: T-12 > OM. Rent Roll's extraction always returns null here,
  // but fall through to it defensively rather than assuming that never changes.
  {
    const omValue = om?.laundryIncome;
    const t12Value = t12?.laundryIncome;
    merged.laundryIncome = t12Value != null ? t12Value : (omValue != null ? omValue : rentRoll?.laundryIncome);
    if (omValue != null && t12Value != null) {
      const d = buildDiscrepancy(
        'laundryIncome', 'percent',
        [{ source: 'om', value: omValue }, { source: 't12', value: t12Value }],
        merged.laundryIncome, 't12',
      );
      if (d) discrepancies.push(d);
    }
  }

  // Unit mix: Rent Roll > OM, unchanged. T-12 never extracts unit mix, so it's
  // simply never passed into this comparison.
  if (om && rentRoll) {
    discrepancies.push(...diffUnitMix(om.unitMix ?? [], rentRoll.unitMix ?? []));
  }
  const rrMixLen = rentRoll?.unitMix?.length ?? 0;
  merged.unitMix = rrMixLen > 0 ? rentRoll.unitMix : (om?.unitMix ?? t12?.unitMix ?? []);

  return { merged, discrepancies };
}
