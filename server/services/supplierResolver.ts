import { matchSupplier, type SupplierCandidate } from "@shared/supplierMatcher";

// Resolve an extracted invoice supplier to an existing supplier contact.
// Precedence: ABN exact → email exact → high-confidence fuzzy name. Returns a
// null id when nothing is confident enough, so the bill is left for a human
// rather than mis-assigned.

export interface SupplierLike {
  id: string;
  name?: string | null;
  company?: string | null;
  abn?: string | null;
  email?: string | null;
}

const onlyDigits = (s?: string | null) => (s || "").replace(/\D/g, "");

export type SupplierResolution = {
  supplierId: string | null;
  reason: "abn" | "email" | "name" | "none";
  confidence: number;
};

export function resolveSupplierId(
  extracted: { supplierName?: string; supplierAbn?: string; supplierEmail?: string },
  suppliers: SupplierLike[],
): SupplierResolution {
  // 1. ABN exact (11 digits) — the strongest signal.
  const abn = onlyDigits(extracted.supplierAbn);
  if (abn.length === 11) {
    const hit = suppliers.find((s) => onlyDigits(s.abn) === abn);
    if (hit) return { supplierId: hit.id, reason: "abn", confidence: 1 };
  }

  // 2. Email exact.
  const email = (extracted.supplierEmail || "").trim().toLowerCase();
  if (email) {
    const hit = suppliers.find((s) => (s.email || "").trim().toLowerCase() === email);
    if (hit) return { supplierId: hit.id, reason: "email", confidence: 0.95 };
  }

  // 3. High-confidence fuzzy name (matcher already gates on >= 0.85).
  if (extracted.supplierName) {
    const candidates: SupplierCandidate[] = suppliers.map((s) => ({
      id: s.id,
      names: [s.name, s.company],
    }));
    const result = matchSupplier(extracted.supplierName, candidates);
    if (result.match) {
      return { supplierId: result.match.candidate.id, reason: "name", confidence: result.match.confidence };
    }
  }

  return { supplierId: null, reason: "none", confidence: 0 };
}
