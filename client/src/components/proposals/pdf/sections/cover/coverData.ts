import type { Proposal, ProposalSection, Project, Contact } from '@shared/schema';
import { brandRamp, type PdfBrandRamp } from '@/components/pdf/shared/pdfTokens';

/**
 * Everything the three cover templates read, resolved once.
 *
 * The templates differ in composition, not in content — each one shows the
 * project, the client, the reference, the date and optionally the price. Doing
 * the resolution here means adding a fourth template is a layout exercise, and
 * that a field cannot fall back differently depending on which cover the
 * builder picked.
 */

export interface CoverFacts {
  projectTitle: string;
  subtitle: string;
  clientName: string;
  clientEmail: string;
  projectAddress: string;
  reference: string;
  dateText: string;
  expiryText: string | null;
  /** The headline figure, already formatted, or null when it is switched off. */
  price: string | null;
  priceLabel: string;
  imagePath: string | null;
  note: string;
}

export interface CoverPalette {
  primary: PdfBrandRamp;
  /**
   * The accent. Falls back to the primary ramp when no secondary is set, so a
   * template never has to ask whether one exists — it just uses it, and an
   * unconfigured document quietly looks the way it did before.
   */
  secondary: PdfBrandRamp;
  /** True when the builder actually chose a second colour. */
  hasSecondary: boolean;
}

export function coverPalette(primaryColor: string, secondaryColor?: string | null): CoverPalette {
  const secondary = (secondaryColor || '').trim();
  const valid = /^#[0-9a-fA-F]{6}$/.test(secondary);
  return {
    primary: brandRamp(primaryColor),
    secondary: brandRamp(valid ? secondary : primaryColor),
    hasSecondary: valid,
  };
}

export function formatCoverDate(date: Date | string | null | undefined): string {
  if (!date) return 'N/A';
  return new Date(date).toLocaleDateString('en-AU', { year: 'numeric', month: 'long', day: 'numeric' });
}

export function coverFacts(args: {
  proposal: Proposal;
  section: ProposalSection;
  project?: Project;
  client?: Contact;
  totals?: { totalCents: number };
  showGst: boolean;
}): CoverFacts {
  const { proposal, section, project, client, totals, showGst } = args;
  const content = (section.content as Record<string, unknown> | null) ?? {};
  const str = (key: string): string => {
    const value = content[key];
    return typeof value === 'string' ? value.trim() : '';
  };

  /* The headline price is opt-in because it is a judgement call, not a
     default: some builders want the number where the client cannot miss it,
     others want them to read the scope first. */
  const showPrice = content.showPrice === true && (totals?.totalCents ?? 0) > 0;

  return {
    projectTitle: str('projectTitle') || project?.name || proposal.name,
    subtitle: str('subtitle'),
    clientName: str('clientName') || client?.name || '',
    clientEmail: str('clientEmail') || client?.email || '',
    projectAddress: (project as { address?: string | null } | undefined)?.address || project?.location || '',
    reference: proposal.proposalNumber || '',
    dateText: formatCoverDate(proposal.createdAt),
    expiryText: proposal.expiryDate ? formatCoverDate(proposal.expiryDate) : null,
    price: showPrice
      ? `$${((totals?.totalCents ?? 0) / 100).toLocaleString('en-AU', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
      : null,
    priceLabel: showGst ? 'Total (inc GST)' : 'Total',
    imagePath: str('imagePath') || null,
    note: (section.description || '').trim(),
  };
}
