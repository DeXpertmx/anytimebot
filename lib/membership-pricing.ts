// Annual membership pricing helpers.
//
// For yearly memberships the system shows the discount vs. the monthly
// alternative. The discount is only shown when a real monthly event with the
// same name exists on the same booking page; a prorated fallback
// (annual price / 12) is definitionally equal to the annual price, so it would
// only produce rounding noise — nothing is shown without a real counterpart.

export interface PricingEventType {
  id: string;
  name: string;
  price: number; // cents
  collectPayment: boolean;
  paymentInterval?: string | null; // 'ONE_TIME' | 'MONTH' | 'YEAR'
  currency?: string | null;
}

export interface AnnualSavings {
  savingsCents: number;
  currency?: string;
  /** Real monthly counterpart price in cents, null when prorated fallback used. */
  monthlyEquivalent: number | null;
  /** Whole-number discount percentage, e.g. 17 for 16.67%. */
  percent: number;
}

/**
 * Computes the annual discount for a yearly membership event.
 * Returns null when the event is not a paid yearly membership or when there is
 * no actual savings (the yearly price is not cheaper than 12 monthly payments).
 */
export function computeAnnualSavings(
  events: PricingEventType[],
  annualEvent: PricingEventType,
): AnnualSavings | null {
  if (annualEvent.paymentInterval !== 'YEAR' || !annualEvent.collectPayment || annualEvent.price <= 0) {
    return null;
  }

  const monthlyCounterpart = events.find(
    (candidate) =>
      candidate.id !== annualEvent.id &&
      candidate.collectPayment &&
      candidate.price > 0 &&
      (candidate.paymentInterval === 'MONTH' || !candidate.paymentInterval) &&
      candidate.name.trim().toLowerCase() === annualEvent.name.trim().toLowerCase(),
  );

  if (!monthlyCounterpart) return null;

  const monthlyCost = monthlyCounterpart.price;
  const annualCost = annualEvent.price;
  const savingsCents = monthlyCost * 12 - annualCost;

  if (savingsCents <= 0) return null;

  return {
    savingsCents,
    currency: annualEvent.currency ?? undefined,
    monthlyEquivalent: monthlyCost,
    percent: Math.round((savingsCents / (annualEvent.price + savingsCents)) * 100),
  };
}
