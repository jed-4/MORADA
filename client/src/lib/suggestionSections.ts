// Shared list of app areas a suggestion can be tagged with. Keep the `value`
// stable (stored in the DB); the `label` is what users see. The mobile app
// keeps its own copy of this list since it cannot import from the web client.
export const SUGGESTION_SECTIONS: { value: string; label: string }[] = [
  { value: "general", label: "General / Overall" },
  { value: "dashboard", label: "Dashboard" },
  { value: "projects", label: "Projects" },
  { value: "tasks", label: "Tasks" },
  { value: "schedule", label: "Schedule" },
  { value: "estimates", label: "Estimates & Quotes" },
  { value: "selections", label: "Selections" },
  { value: "bills", label: "Bills & Purchase Orders" },
  { value: "invoices", label: "Client Invoices" },
  { value: "budget", label: "Budget & Financials" },
  { value: "site-diary", label: "Site Diary" },
  { value: "checklists", label: "Checklists" },
  { value: "messages", label: "Messages & Notes" },
  { value: "documents", label: "Documents & Files" },
  { value: "mobile", label: "Mobile App" },
  { value: "other", label: "Something else" },
];

export const SUGGESTION_SECTION_LABELS: Record<string, string> =
  Object.fromEntries(SUGGESTION_SECTIONS.map((s) => [s.value, s.label]));
