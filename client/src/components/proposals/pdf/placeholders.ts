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
    return d.toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' });
  } catch {
    return '';
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
  return {
    'client.name': client?.name || '',
    'client.email': client?.email || '',
    'project.name': project?.name || '',
    'project.address': projectAddress(project),
    'proposal.number': proposal.proposalNumber || '',
    'proposal.date': formatDate(p.sentDate) || formatDate(p.createdAt) || todayString(),
    'proposal.expiry': formatDate(p.expiryDate),
    'proposal.total': formatCurrencyCents(p.totalAmount),
    'estimate.total_inc_gst': formatCurrencyCents(estimateTotalIncGstCents ?? p.totalAmount),
    'builder.company': companyName || '',
    'builder.phone': companyPhone || '',
    'company.name': companyName || '',
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
