// Supplier payment terms → bill due date.
//
// Terms can arrive as an enum key ("net_30", "on_receipt", "end_of_next_month")
// or free text ("Net 30", "COD", "EOM", "Net 60", "45"). This parser handles
// both, plus arbitrary "Net N", so it degrades gracefully as data varies.

export type ParsedTerms =
  | { kind: "days"; days: number }
  | { kind: "eom" } // end of the bill's month
  | { kind: "eonm" } // end of the month after the bill's month
  | { kind: "unknown" };

export function parsePaymentTerms(terms: string | null | undefined): ParsedTerms {
  if (!terms) return { kind: "unknown" };
  const t = terms.trim().toLowerCase().replace(/[\s_-]+/g, " ");

  if (["on receipt", "due on receipt", "cod", "net 0", "0"].includes(t)) return { kind: "days", days: 0 };
  if (["eonm", "end of next month"].includes(t)) return { kind: "eonm" };
  if (["eom", "end of month"].includes(t)) return { kind: "eom" };

  const net = t.match(/^net\s*(\d{1,3})$/);
  if (net) return { kind: "days", days: parseInt(net[1], 10) };

  const plain = t.match(/^(\d{1,3})$/);
  if (plain) return { kind: "days", days: parseInt(plain[1], 10) };

  return { kind: "unknown" };
}

// Compute the due date from a bill date + terms. Pure local-date math (no
// timezone surprises). Returns null when terms are unrecognised.
export function computeDueDate(billDate: Date, terms: string | null | undefined): Date | null {
  const parsed = parsePaymentTerms(terms);
  const y = billDate.getFullYear();
  const m = billDate.getMonth();
  const d = billDate.getDate();
  switch (parsed.kind) {
    case "days":
      return new Date(y, m, d + parsed.days);
    case "eom":
      return new Date(y, m + 1, 0); // day 0 of next month = last day of this month
    case "eonm":
      return new Date(y, m + 2, 0);
    default:
      return null;
  }
}

// Human label for where a due date came from, e.g. "Net 30" / "End of month".
export function describePaymentTerms(terms: string | null | undefined): string | null {
  const parsed = parsePaymentTerms(terms);
  switch (parsed.kind) {
    case "days":
      return parsed.days === 0 ? "On receipt" : `Net ${parsed.days}`;
    case "eom":
      return "End of month";
    case "eonm":
      return "End of next month";
    default:
      return null;
  }
}
