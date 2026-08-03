import { parseISO } from 'date-fns';
import xirr from 'xirr';
import type { PFEntry, MutualFund } from '../hooks/useApi';

/**
 * Calculate XIRR from an array of cash flows.
 * @param cashflows Array of { amount, date } objects. Amount: negative for investments, positive for redemptions/current value.
 * @returns XIRR as a decimal (e.g., 0.12 for 12%), or null if not computable.
 */
export function calculateXIRR(
  cashflows: { amount: number; date: string | Date }[]
): number | null {
  if (!cashflows || cashflows.length < 2) return null;
  try {
    // Convert all dates to Date objects
    const flows = cashflows.map((cf) => ({
      amount: cf.amount,
      when: cf.date instanceof Date ? cf.date : parseISO(cf.date as string),
    }));
    return xirr(flows);
  } catch (e) {
    return null;
  }
}

export interface PFOpening {
  account: string;
  opening_balance: number;
  opening_month: string;
}

/**
 * Build EPF cashflows for an XIRR-style annualized return.
 *
 * - Opening balance of each account is an outflow on its opening month.
 * - Every passbook row except annual interest is a flow: monthly contributions
 *   are outflows, the 2021 transfer-out is an inflow and the transfer-in an
 *   outflow (they cancel), withdrawals return money to the member.
 * - The latest running balance is the final inflow (today).
 *
 * @param rows PF passbook entries, latest-first (as returned by /api/pf).
 * @param accounts Per-account opening balances.
 * @returns Cashflow array consumable by calculateXIRR.
 */
export function buildPFCashflows(
  rows: PFEntry[],
  accounts: PFOpening[],
  endDate: Date = new Date()
): { amount: number; date: string }[] {
  const flows: { amount: number; date: string }[] = [];
  const today = endDate.toISOString().slice(0, 10);

  for (const a of accounts) {
    const ob = a.opening_balance || 0;
    if (ob > 0 && a.opening_month) {
      flows.push({ amount: -ob, date: `${a.opening_month}-01` });
    }
  }

  let currentValue = 0;
  for (const r of rows) {
    if (r.notes !== 'Interest credited') {
      const amount = -(r.employee_contrib + r.employer_contrib);
      if (amount !== 0 && r.entry_date) {
        flows.push({ amount, date: `${r.entry_date}-01` });
      }
    }
    if (!currentValue && r.running_balance) currentValue = r.running_balance;
  }

  if (currentValue > 0) flows.push({ amount: currentValue, date: today });
  return flows;
}

/**
 * Build mutual-fund cashflows for an XIRR-style annualized return.
 *
 * Approximation: each fund's invested amount is a single outflow on its
 * purchase date; the combined current value is the final inflow (today).
 *
 * @param rows MF holdings as returned by /api/mutual-funds.
 * @returns Cashflow array consumable by calculateXIRR.
 */
export function buildMFCashflows(
  rows: MutualFund[],
  endDate: Date = new Date()
): { amount: number; date: string }[] {
  const flows: { amount: number; date: string }[] = [];
  const today = endDate.toISOString().slice(0, 10);

  let totalVal = 0;
  for (const mf of rows) {
    if (mf.Value_at_cost && mf.Purchase_Date) {
      flows.push({ amount: -Math.abs(mf.Value_at_cost), date: mf.Purchase_Date });
    }
    totalVal += mf.Value_now || 0;
  }

  if (totalVal > 0) flows.push({ amount: totalVal, date: today });
  return flows;
}
