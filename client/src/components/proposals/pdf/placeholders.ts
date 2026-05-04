import type { Proposal, Project, Contact, ProposalSection } from '@shared/schema';

export interface PlaceholderContext {
  proposal: Proposal;
  project?: Project;
  client?: Contact;
  companyName?: string;
}

function todayString(): string {
  return new Date().toLocaleDateString('en-AU', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function projectAddress(project?: Project): string {
  if (!project) return '';
  return (project as any).location || (project as any).address || '';
}

export function buildSubstitutionMap(ctx: PlaceholderContext): Record<string, string> {
  const { proposal, project, client, companyName } = ctx;
  return {
    'client.name': client?.name || '',
    'client.email': client?.email || '',
    'project.name': project?.name || '',
    'project.address': projectAddress(project),
    'proposal.number': proposal.proposalNumber || '',
    'proposal.total': '',
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
  if (!changed) return section;
  return { ...section, name: nameNext, description: descNext, content: next } as ProposalSection;
}
