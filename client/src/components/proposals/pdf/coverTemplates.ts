import type { ProposalSection } from '@shared/schema';

/**
 * The cover page's layout, chosen per proposal.
 *
 * The two existing designs were not a choice: they were branches on
 * `company_settings.document_style`, a company-wide switch that also drives
 * every footer in the document. A builder who wanted a bold cover on one
 * proposal had to change the look of every document the company sends. The
 * layouts themselves were fine — so they are promoted to named templates here
 * rather than redrawn, and `document_style` survives as the default for
 * anyone who already set it.
 */
export type CoverTemplate = 'masthead' | 'feature' | 'photo';

export const COVER_TEMPLATES: Array<{
  value: CoverTemplate;
  label: string;
  description: string;
}> = [
  {
    value: 'masthead',
    label: 'Masthead',
    description:
      'A white page with the company band across the top and the project set large underneath. The quietest of the three — it reads as a document, not a brochure.',
  },
  {
    value: 'feature',
    label: 'Feature',
    description:
      'The top third is a solid block of the primary colour carrying the project title, with the client and reference on tinted cards below. Bold, and it survives being printed badly.',
  },
  {
    value: 'photo',
    label: 'Photo',
    description:
      'A full-bleed image — a render, a site photo, a finished job — above a colour panel holding the title and details. Needs an image; without one it falls back to a plain colour panel.',
  },
];

export function coverTemplateOf(
  section: ProposalSection,
  documentStyle: 'style1' | 'style2' | undefined,
): CoverTemplate {
  const content = (section.content as Record<string, unknown> | null) ?? {};
  const explicit = content.template;
  if (explicit === 'masthead' || explicit === 'feature' || explicit === 'photo') return explicit;
  // Nobody who set documentStyle asked for their covers to change, so the old
  // switch keeps deciding until this proposal says otherwise.
  return documentStyle === 'style2' ? 'feature' : 'masthead';
}
