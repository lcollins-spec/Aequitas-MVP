/**
 * Fund-level settings — stored in localStorage.
 * Seeded with Aequitas Fund I defaults on first load.
 */

export interface FundSettings {
  fundName: string;
  targetFundSize: number;        // $200M
  capitalCommitted: number;      // updated manually as LPs commit
  vintageYear: number;           // first close year
  investmentPeriodYears: number; // years from first close
  prefReturn: number;            // 0.08 = 8%
  carry: number;                 // 0.20 = 20%
  acqFee: number;                // 0.02 = 2%
  amFee: number;                 // 0.005 = 0.5%
}

export const DEFAULT_FUND_SETTINGS: FundSettings = {
  fundName: 'Aequitas Fund I',
  targetFundSize: 200_000_000,
  capitalCommitted: 0,
  vintageYear: new Date().getFullYear(),
  investmentPeriodYears: 3,
  prefReturn: 0.08,
  carry: 0.20,
  acqFee: 0.02,
  amFee: 0.005,
};

const LS_KEY = 'aequitas_fund_settings';

export const getFundSettings = (): FundSettings => {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) return { ...DEFAULT_FUND_SETTINGS, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return { ...DEFAULT_FUND_SETTINGS };
};

export const saveFundSettings = (s: FundSettings): void => {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(s));
  } catch { /* ignore */ }
};
