export interface CompanySettingsForSections {
  companyName?: string;
  termsAndConditions?: string | null;
  termsTemplates?: Array<{ id: string; name: string; content: string; defaultFor?: string[] }>;
}

export interface DefaultSectionSpec {
  sectionType: string;
  name: string;
  order: number;
  content?: Record<string, unknown>;
}

/**
 * The standard proposal structure.
 *
 * This used to be inlined in the "create proposal" mutation, which meant it
 * only existed at the moment of creation: a proposal that lost its sections,
 * or one created before this set existed, could only be rebuilt by adding ten
 * sections by hand. The section list's empty state offers it now too.
 */
export function buildDefaultSections(
  settings: CompanySettingsForSections | null | undefined,
): DefaultSectionSpec[] {
  const templates = settings?.termsTemplates ?? [];
  const proposalDefault = templates.find(
    (t) => Array.isArray(t.defaultFor) && t.defaultFor.includes("proposal"),
  );
  const termsText = proposalDefault?.content || settings?.termsAndConditions || "";
  const companyName = settings?.companyName || "[Company Name]";
  const closingText = `<p>Thank you for considering ${companyName}. We look forward to working with you.</p>`;

  // No Summary section: the payment schedule carries the contract price above
  // its milestones, which are percentages of it. Summary was a page break and
  // three lines of figures immediately before the page that divides them up.
  // The type still exists for proposals that want prose there, and keeps its
  // own totals when there is no schedule to carry them.
  return [
    { sectionType: "cover_page", name: "Cover Page", order: 0 },
    { sectionType: "cover_letter", name: "Cover Letter", order: 1 },
    { sectionType: "estimate", name: "Estimate", order: 2 },
    { sectionType: "allowances", name: "Allowances", order: 3 },
    { sectionType: "payment_schedule", name: "Payment Schedule", order: 4 },
    { sectionType: "closing", name: "Closing", order: 5, content: { closingText } },
    { sectionType: "attachments", name: "Attachments", order: 6 },
    { sectionType: "terms_conditions", name: "Terms & Conditions", order: 7, content: { termsText } },
    { sectionType: "signature", name: "Signature", order: 8 },
  ];
}
