import type { Proposal, Project, Contact, ProposalSection } from '@shared/schema';

export interface PlaceholderContext {
  proposal: Proposal;
  project?: Project;
  client?: Contact;
  companyName?: string;
  companyPhone?: string;
  estimateTotalIncGstCents?: number;
}

// Narrow accessor types for fields that may differ between revisions of the
// shared schema. Using these instead of `as any` keeps the compiler happy
// without lying about the underlying types.
type ProjectAddressFields = Pick<Project, 'location'> & { address?: string | null };
type ProposalDateFields = Pick<Proposal, 'sentDate' | 'expiryDate' | 'totalAmount'> & {
  createdAt?: Date | string | null;
};
type SectionWithDescriptionHtml = ProposalSection & { descriptionHtml?: string | null };

function todayString(): string {
  return new Date().toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatDate(date: unknown): string {
  if (!date) return '';
  try {
    const d = new Date(date as string);
    if (Number.isNaN(d.getTime())) return '';
    // Guard against the Unix epoch (and other clearly bogus pre-2000 values)
    // sneaking through as "1 January 1970". Treat anything before 2000 as
    // an unset date — see formatProposalDate() for the same rule.
    if (d.getUTCFullYear() < 2000) return '';
    return d.toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
  }
}

/**
 * Safe date formatter for proposal date fields. Returns `null` when the
 * value is missing, unparseable, or earlier than 2000 (which catches the
 * Unix epoch / `Date(0)` "1 January 1970" bug). Callers can fall back to
 * "Not set" or render nothing.
 */
export function formatProposalDate(date: unknown, locale: string = 'en-AU'): string | null {
  if (!date) return null;
  try {
    const d = new Date(date as string | number | Date);
    if (Number.isNaN(d.getTime())) return null;
    if (d.getUTCFullYear() < 2000) return null;
    return d.toLocaleDateString(locale, { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return null;
  }
}

function projectAddress(project?: Project): string {
  if (!project) return '';
  const p = project as ProjectAddressFields;
  return p.location || p.address || '';
}

function formatCurrencyCents(cents?: number): string {
  if (cents == null || Number.isNaN(cents)) return '';
  const dollars = cents / 100;
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(dollars);
}

export const PROPOSAL_PLACEHOLDER_TOKENS: Array<{ token: string; label: string }> = [
  { token: '{{client.name}}', label: 'Client Name' },
  { token: '{{client.email}}', label: 'Client Email' },
  { token: '{{project.name}}', label: 'Project Name' },
  { token: '{{project.address}}', label: 'Project Address' },
  { token: '{{proposal.date}}', label: 'Proposal Date' },
  { token: '{{proposal.expiry}}', label: 'Proposal Expiry' },
  { token: '{{estimate.total_inc_gst}}', label: 'Estimate Total (inc GST)' },
  { token: '{{builder.company}}', label: 'Builder Company' },
  { token: '{{builder.phone}}', label: 'Builder Phone' },
];

export function buildSubstitutionMap(ctx: PlaceholderContext): Record<string, string> {
  const { proposal, project, client, companyName, companyPhone, estimateTotalIncGstCents } = ctx;
  const p = proposal as ProposalDateFields;
  // When a referenced entity is missing (e.g. no client linked to the
  // proposal yet), fall back to a bracketed placeholder string rather than
  // an empty string. The empty-string behaviour caused the cover letter to
  // read "Dear ," which looked broken; the bracketed form makes it obvious
  // to the user that the field still needs to be filled in.
  return {
    'client.name': client?.name || '[Client Name]',
    'client.email': client?.email || '[Client Email]',
    'project.name': project?.name || '[Project Name]',
    'project.address': projectAddress(project) || '[Project Address]',
    'proposal.number': proposal.proposalNumber || '',
    'proposal.date': formatDate(p.sentDate) || formatDate(p.createdAt) || todayString(),
    'proposal.expiry': formatDate(p.expiryDate),
    'proposal.total': formatCurrencyCents(p.totalAmount),
    'estimate.total_inc_gst': formatCurrencyCents(estimateTotalIncGstCents ?? p.totalAmount),
    'builder.company': companyName || '[Company Name]',
    'builder.phone': companyPhone || '',
    'company.name': companyName || '[Company Name]',
    'date.today': todayString(),
  };
}

export function substitutePlaceholders(text: string, ctx: PlaceholderContext): string {
  if (!text || typeof text !== 'string' || text.indexOf('{{') === -1) return text;
  const map = buildSubstitutionMap(ctx);
  return text.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (full, token) => {
    const key = String(token).toLowerCase();
    return Object.prototype.hasOwnProperty.call(map, key) ? map[key] : full;
  });
}

const RICH_TEXT_KEYS = [
  'letterText',
  'scopeText',
  'closingText',
  'summaryText',
  'allowancesText',
  'inclusionsText',
  'exclusionsText',
  'termsText',
  'customText',
  'estimateDescription',
  'projectTitle',
  'clientName',
  'subtitle',
  'attachmentsText',
  'introText',
];

export function substituteSectionContent(
  section: ProposalSection,
  ctx: PlaceholderContext,
): ProposalSection {
  const content = (section.content as Record<string, unknown> | null) ?? {};
  let changed = false;
  const next: Record<string, unknown> = { ...content };
  for (const key of RICH_TEXT_KEYS) {
    const val = next[key];
    if (typeof val === 'string' && val.indexOf('{{') !== -1) {
      const replaced = substitutePlaceholders(val, ctx);
      if (replaced !== val) {
        next[key] = replaced;
        changed = true;
      }
    }
  }
  let nameNext = section.name;
  let descNext = section.description;
  let descHtmlNext = (section as SectionWithDescriptionHtml).descriptionHtml;
  if (typeof nameNext === 'string' && nameNext.indexOf('{{') !== -1) {
    const replaced = substitutePlaceholders(nameNext, ctx);
    if (replaced !== nameNext) {
      nameNext = replaced;
      changed = true;
    }
  }
  if (typeof descNext === 'string' && descNext.indexOf('{{') !== -1) {
    const replaced = substitutePlaceholders(descNext, ctx);
    if (replaced !== descNext) {
      descNext = replaced;
      changed = true;
    }
  }
  if (typeof descHtmlNext === 'string' && descHtmlNext.indexOf('{{') !== -1) {
    const replaced = substitutePlaceholders(descHtmlNext, ctx);
    if (replaced !== descHtmlNext) {
      descHtmlNext = replaced;
      changed = true;
    }
  }
  if (!changed) return section;
  return {
    ...section,
    name: nameNext,
    description: descNext,
    ...(descHtmlNext !== undefined ? { descriptionHtml: descHtmlNext } : {}),
    content: next,
  } as ProposalSection;
}
