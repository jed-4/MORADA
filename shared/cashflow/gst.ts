// GST / BAS.
//
// The forecast works out GST rather than asking for it as an expense: every
// cash event carries its GST share, and those shares are summed per BAS
// period and paid (or refunded) on that period's due date.
//
// Only CASH basis is modelled in version 1 (Lighthouse's basis). On cash
// basis GST falls into the period the money moves, which is exactly the date
// every forecast event already carries.

import { makeKey, parseKey, type DateKey } from "./dates";

export type BasFrequency = "quarterly" | "monthly";

export interface BasPeriod {
  /** 'YYYY-MM' of the period's first month. */
  key: string;
  start: DateKey;
  end: DateKey;
  due: DateKey;
}

function lastDay(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Standard ATO lodgement dates. Quarters follow the Australian financial
 * year (Jul–Sep, Oct–Dec, Jan–Mar, Apr–Jun).
 *
 *   Quarterly, self-lodged:  28 Oct · 28 Feb · 28 Apr · 28 Jul
 *   Quarterly, via an agent: 25 Nov · 28 Feb · 26 May · 25 Aug
 *   Monthly:                 21st of the following month
 */
export function basPeriodFor(date: DateKey, frequency: BasFrequency, viaAgent = false): BasPeriod {
  const { year, month } = parseKey(date);

  if (frequency === "monthly") {
    const dueYear = month === 12 ? year + 1 : year;
    const dueMonth = month === 12 ? 1 : month + 1;
    return {
      key: `${year}-${String(month).padStart(2, "0")}`,
      start: makeKey(year, month, 1),
      end: makeKey(year, month, lastDay(year, month)),
      due: makeKey(dueYear, dueMonth, 21),
    };
  }

  const endMonth = Math.ceil(month / 3) * 3;
  const startMonth = endMonth - 2;
  let due: DateKey;
  switch (endMonth) {
    case 9:
      due = viaAgent ? makeKey(year, 11, 25) : makeKey(year, 10, 28);
      break;
    case 12:
      due = makeKey(year + 1, 2, 28);
      break;
    case 3:
      due = viaAgent ? makeKey(year, 5, 26) : makeKey(year, 4, 28);
      break;
    default: // 6
      due = viaAgent ? makeKey(year, 8, 25) : makeKey(year, 7, 28);
  }
  return {
    key: `${year}-${String(startMonth).padStart(2, "0")}`,
    start: makeKey(year, startMonth, 1),
    end: makeKey(year, endMonth, lastDay(year, endMonth)),
    due,
  };
}

/** GST inside an inc-GST amount at 10% (1/11), keeping the amount's sign. */
export function gstOfInc(amountCents: number): number {
  return Math.round(amountCents / 11);
}
