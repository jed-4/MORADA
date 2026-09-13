import type { Estimate, EstimateGroup, EstimateItem } from '@shared/schema';

/**
 * Stand-in figures, so a template can be designed.
 *
 * A template has no linked estimate, and every money section is built to
 * render nothing rather than lie: the estimate table returned null, allowances
 * said "No allowances defined", and the payment schedule and summary printed
 * zeroes. Four of the sections a builder most wants to lay out were invisible
 * in the one place they are laid out.
 *
 * So a template preview is given a sample. Deliberately NOT a real estimate and
 * never a fallback on a real proposal — a proposal whose estimate is missing
 * must keep showing nothing, because numbers that appeared from nowhere in a
 * client's document are far worse than a blank section. The only caller is the
 * template page; see ProposalDocument's `sampleData` prop.
 *
 * The content is chosen to exercise the layout rather than to look tidy:
 *   - two top-level groups, so the "one table per group" split is visible
 *   - a nested group, so indentation and group subtotals show
 *   - a Prime Cost and a Provisional Sum line, so the Allowances section fills
 *   - a long description, so wrapping and the description-under-name setting
 *     can actually be judged
 *   - round-ish numbers that still produce awkward GST, so column alignment is
 *     tested rather than flattered
 */

const ESTIMATE_ID = 'sample-estimate';

export const SAMPLE_ESTIMATE_ID = ESTIMATE_ID;

const group = (id: string, name: string, order: number, parentGroupId: string | null = null) => ({
  id,
  estimateId: ESTIMATE_ID,
  name,
  parentGroupId,
  order,
  proposalVisible: true,
} as unknown as EstimateGroup);

const item = (
  id: string,
  groupId: string,
  name: string,
  quantity: number,
  unit: string,
  unitCostExTax: number,
  extra: Partial<EstimateItem> = {},
) => ({
  id,
  estimateId: ESTIMATE_ID,
  groupId,
  name,
  description: null,
  quantity,
  unit,
  unitCostExTax,
  markupPercent: 20,
  wastagePercent: 0,
  proposalVisible: true,
  shownAs: 'price',
  allowance: 'None',
  order: 0,
  ...extra,
} as unknown as EstimateItem);

export const SAMPLE_GROUPS: EstimateGroup[] = [
  group('sample-g1', 'Preliminaries & Site', 0),
  group('sample-g2', 'Bathroom', 1),
  group('sample-g2a', 'Bathroom · Fit-off', 2, 'sample-g2'),
];

export const SAMPLE_ITEMS: EstimateItem[] = [
  item('sample-i1', 'sample-g1', 'Site establishment & temporary fencing', 1, 'item', 1850),
  item('sample-i2', 'sample-g1', 'Waste removal', 3, 'skip', 620, {
    description:
      'Includes collection, disposal fees and the exchange of bins as the work proceeds, so the site stays clear through each stage.',
  }),
  item('sample-i3', 'sample-g2', 'Demolition & make good', 1, 'item', 2400),
  item('sample-i4', 'sample-g2', 'Waterproofing to AS 3740', 18, 'm2', 78),
  item('sample-i5', 'sample-g2', 'Wall & floor tiling', 34, 'm2', 96),
  item('sample-i6', 'sample-g2a', 'Tapware & fittings', 1, 'item', 2200, {
    allowance: 'Prime Cost',
    description: 'A Prime Cost allowance — the final figure follows the selections you make.',
  }),
  item('sample-i7', 'sample-g2a', 'Shower screen & mirror', 1, 'item', 1450, {
    allowance: 'Provisional Sum',
  }),
  item('sample-i8', 'sample-g2a', 'Plumbing fit-off', 1, 'item', 1320),
];

export const SAMPLE_ESTIMATE = {
  id: ESTIMATE_ID,
  name: 'Sample figures',
  projectMarkupPercent: 10,
  taxRate: 10,
  version: 1,
} as unknown as Estimate;

/** The shape ProposalDocument's `estimatesData` expects, keyed for any id. */
export function sampleEstimateData(estimateId: string | null | undefined) {
  return {
    [estimateId || ESTIMATE_ID]: {
      estimate: SAMPLE_ESTIMATE,
      groups: SAMPLE_GROUPS,
      items: SAMPLE_ITEMS,
    },
  };
}
