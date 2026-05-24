import { parseISO } from 'date-fns';
import xirr from 'xirr';

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
