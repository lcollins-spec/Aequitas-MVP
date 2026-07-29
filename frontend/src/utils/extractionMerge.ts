// Merges an OM extraction and a Rent Roll extraction into one dataset for the
// shared ExtractionReviewModal, and flags fields where the two sources disagree.
//
// Precedence: Rent Roll is the source of truth for rents/occupancy (unit mix,
// vacancy, bad debt, rent stabilization). OM is the source of truth for
// location/identity and everything Rent Roll doesn't extract (pricing, NOI,
// opex, tax/deal-structure). Manually-seeded fields (deal costs, senior loan,
// abatement schedule) pass straight through untouched.

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

// Fields Rent Roll is authoritative for when present (rents/occupancy).
const RENT_ROLL_AUTHORITATIVE_KEYS = new Set(['vacancyRate', 'badDebtRate', 'rentStabilized', 'annualRentGrowthCap']);
// Fields OM is authoritative for when present (location/identity).
const OM_AUTHORITATIVE_KEYS = new Set(['propertyName', 'address', 'city', 'state', 'zipcode']);

export interface Discrepancy {
  field: string;
  label: string;
  omValue: any;
  rentRollValue: any;
  appliedValue: any;
  appliedSource: 'om' | 'rentRoll';
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

export function mergeExtractions(om: any | null, rentRoll: any | null): { merged: any; discrepancies: Discrepancy[] } {
  // Base merge is null-coalescing, not a raw spread: the Rent Roll extraction
  // schema explicitly returns null for fields it doesn't cover (askingPrice,
  // operatingExpenses, ...), and a `{...om, ...rentRoll}` spread would let
  // those explicit nulls stomp over real OM values. OM wins by default here;
  // the precedence loops below then explicitly override the few keys Rent
  // Roll should actually win.
  const merged: any = {};
  for (const key of new Set([...Object.keys(om ?? {}), ...Object.keys(rentRoll ?? {})])) {
    const omValue = om?.[key];
    merged[key] = omValue != null ? omValue : rentRoll?.[key];
  }
  const discrepancies: Discrepancy[] = [];

  if (om && rentRoll) {
    for (const key of RENT_ROLL_AUTHORITATIVE_KEYS) {
      const omValue = om[key];
      const rrValue = rentRoll[key];
      merged[key] = rrValue != null ? rrValue : omValue;
      if (omValue == null || rrValue == null) continue;
      if (key === 'rentStabilized') {
        if (Boolean(omValue) !== Boolean(rrValue)) {
          discrepancies.push({ field: key, label: fieldLabel(key), omValue, rentRollValue: rrValue, appliedValue: merged[key], appliedSource: 'rentRoll' });
        }
      } else if (percentDiffers(Number(omValue), Number(rrValue))) {
        discrepancies.push({ field: key, label: fieldLabel(key), omValue, rentRollValue: rrValue, appliedValue: merged[key], appliedSource: 'rentRoll' });
      }
    }

    for (const key of OM_AUTHORITATIVE_KEYS) {
      const omValue = om[key];
      const rrValue = rentRoll[key];
      merged[key] = omValue != null && omValue !== '' ? omValue : rrValue;
      if (omValue == null || rrValue == null || omValue === '' || rrValue === '') continue;
      if (normalizeText(omValue) !== normalizeText(rrValue)) {
        discrepancies.push({ field: key, label: fieldLabel(key), omValue, rentRollValue: rrValue, appliedValue: merged[key], appliedSource: 'om' });
      }
    }

    discrepancies.push(...diffUnitMix(om.unitMix ?? [], rentRoll.unitMix ?? []));
    merged.unitMix = rentRoll.unitMix?.length > 0 ? rentRoll.unitMix : om.unitMix;
  }
  // Single-source case (only om or only rentRoll): the null-coalescing base
  // merge above already copied every field from whichever one exists.

  return { merged, discrepancies };
}
