import { View, Text } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { registerPdfFonts, PDF_FONT_FAMILY } from "./registerPdfFonts";
import { PDF_COLORS, PDF_RADIUS, PDF_TYPE, PDF_WEIGHT, brandRamp } from "./pdfTokens";
import { PdfPanel } from "./PdfPrimitives";

/**
 * The priced-rows table, in the portal's shape: a header row filled with the
 * company's brand colour, white rows with hairline dividers, optional grouping
 * rows, and trailing rows for amounts that are not line items.
 *
 * Column widths are fixed points because A4 gives 515pt between the margins
 * and a builder who turns on every optional column has little room left for
 * the description — the flexible text cell absorbs whatever is left, so the
 * table cannot overflow the page no matter what is enabled.
 */

registerPdfFonts();

export interface PdfTableColumn<T> {
  key: string;
  label: string;
  /** Fixed width in points. The text cell (no width) takes the remainder. */
  width: number;
  align: "left" | "right";
  value: (row: T) => string;
}

export interface PdfTableGroup<T> {
  key: string;
  label?: string;
  /**
   * Shown right-aligned on the group header row — but only where it earns its
   * place. A group of one line has a "subtotal" identical to the line above
   * it, which is noise, so by default it is suppressed. See `showTotal`.
   */
  total?: string;
  rows: T[];
  /**
   * Sub-groups, rendered indented and lighter than their parent. One level of
   * nesting is supported; deeper nesting renders but stops getting visually
   * distinct, which is a reasonable place for a document to stop.
   */
  children?: Array<PdfTableGroup<T>>;
  /**
   * Override the earns-its-place rule for this group. Rarely needed — a
   * parent of sub-groups always shows its total, because it is summing
   * something the reader cannot add up by eye.
   */
  showTotal?: boolean;
}

export interface PdfTrailingRow {
  label: string;
  value: string;
  /** Heavier, for a row that carries weight (a margin line). */
  emphasis?: boolean;
}

interface PdfLineTableProps<T> {
  columns: Array<PdfTableColumn<T>>;
  groups: Array<PdfTableGroup<T>>;
  /** Header for the flexible left-hand cell. Omit to drop that cell entirely. */
  textHeader?: string | null;
  /** Renders the left-hand cell for a row. */
  renderText?: (row: T) => ReactNode;
  trailingRows?: PdfTrailingRow[];
  brandColor?: string | null;
  /** Show the group header rows. Off means a flat list. */
  grouped?: boolean;
  rowKey: (row: T, index: number) => string;
  /**
   * Repeat the column header at the top of each page the table spans.
   *
   * On by default, because a table whose second page has no header is a table
   * of unlabelled numbers. Turn it off for a table you know is short and that
   * sits near a page boundary, where @react-pdf can otherwise emit the header
   * twice on one page.
   */
  repeatHeader?: boolean;
}

/** A4 (595pt) less both 40pt margins, less the panel's own 20pt of padding. */
const USABLE_WIDTH = 595 - 80 - 20;
/** Below this the text cell stops being a column and starts being a stack of
 *  single words. */
const MIN_TEXT_WIDTH = 120;

export function PdfLineTable<T>({
  columns,
  groups,
  textHeader,
  renderText,
  trailingRows = [],
  brandColor,
  grouped = true,
  rowKey,
  repeatHeader = true,
}: PdfLineTableProps<T>) {
  const brand = brandRamp(brandColor);
  const showText = !!textHeader || !!renderText;

  /**
   * Keep the description readable when every optional column is switched on.
   *
   * Nine columns come to 448pt of the 495pt available, leaving the flexible
   * text cell about 47pt — at which point a description sets one short word
   * per line and a fourteen-row table runs to five pages. Rather than silently
   * refusing a column the builder asked for, the numeric columns give up width
   * proportionally until the text cell clears MIN_TEXT_WIDTH. Currency still
   * fits: the tightest result is ~40pt, and "$46,062.50" needs 38pt at 8.5pt
   * Inter.
   */
  const fixedTotal = columns.reduce((sum, c) => sum + c.width, 0);
  const textWidth = USABLE_WIDTH - fixedTotal;
  const squeeze =
    showText && textWidth < MIN_TEXT_WIDTH && fixedTotal > 0
      ? Math.max(0.62, (USABLE_WIDTH - MIN_TEXT_WIDTH) / fixedTotal)
      : 1;
  const widthOf = (c: PdfTableColumn<T>) => (squeeze === 1 ? c.width : Math.floor(c.width * squeeze));

  // A right-aligned column needs a gutter on its LEFT, or a squeezed header
  // runs into its neighbour ("Unit PriceMkup %"). Figures are shorter than
  // their headers, so the gap only ever shows up in the header row.
  const cell = (align: "left" | "right", width?: number) => ({
    width,
    flex: width ? undefined : 1,
    textAlign: align,
    paddingRight: align === "right" ? 0 : 6,
    paddingLeft: align === "right" ? 5 : 0,
  });

  /**
   * A group heading earns its total when the reader cannot do the sum by eye.
   *
   * One line means the "subtotal" repeats the figure directly under it, which
   * is the noise every one of these documents used to print. A parent of
   * sub-groups always shows one, because what it sums is spread across
   * headings the reader would otherwise have to add up themselves.
   */
  const showsTotal = (g: PdfTableGroup<T>) =>
    g.total != null &&
    (g.showTotal ?? (g.rows.length > 1 || (g.children?.length ?? 0) > 0));

  /**
   * Zebra runs continuously down the table rather than restarting per group.
   * Restarting put two shaded rows back to back across a group boundary, which
   * reads as one row rather than two.
   */
  let stripe = 0;

  /**
   * One group, and any groups under it.
   *
   * `depth` drives the only two things that separate a sub-group from its
   * parent: it indents, and it drops the fill for a plain rule. A nested group
   * wearing the same grey band as its parent reads as a sibling, which is
   * exactly the confusion this exists to avoid.
   */
  const renderGroup = (group: PdfTableGroup<T>, depth: number): ReactNode => {
    const nested = depth > 0;
    // Ungrouped means FLAT, all the way down. Indenting without the heading
    // that explains it leaves rows shunted right for no visible reason — the
    // reader sees a flat list with an arbitrary ragged edge. Turning grouping
    // off has to collapse the nesting too, not just hide its labels.
    const indent = grouped ? 10 + depth * 12 : 10;
    return (
      <View key={group.key}>
        {grouped && group.label && (
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingLeft: indent,
              paddingRight: 10,
              paddingVertical: nested ? 3 : 4,
              backgroundColor: nested ? PDF_COLORS.surface : PDF_COLORS.surfaceMuted,
              borderTopWidth: 1,
              borderTopColor: PDF_COLORS.border,
            }}
            wrap={false}
          >
            <Text
              style={{
                fontFamily: PDF_FONT_FAMILY,
                fontWeight: nested ? PDF_WEIGHT.medium : PDF_WEIGHT.semibold,
                fontSize: PDF_TYPE.tableHeader,
                letterSpacing: nested ? 0 : 0.4,
                textTransform: nested ? "none" : "uppercase",
                color: nested ? PDF_COLORS.ink : PDF_COLORS.inkMuted,
              }}
            >
              {group.label}
            </Text>
            {showsTotal(group) && (
              <Text
                style={{
                  fontFamily: PDF_FONT_FAMILY,
                  fontWeight: nested ? PDF_WEIGHT.medium : PDF_WEIGHT.semibold,
                  fontSize: PDF_TYPE.tableHeader,
                  color: nested ? PDF_COLORS.ink : PDF_COLORS.inkMuted,
                }}
              >
                {group.total}
              </Text>
            )}
          </View>
        )}

        {group.rows.map((row, idx) => {
          const shaded = stripe++ % 2 === 1;
          return (
            <View
              key={rowKey(row, idx)}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                paddingLeft: indent,
                paddingRight: 10,
                paddingVertical: 5,
                borderTopWidth: 1,
                borderTopColor: PDF_COLORS.border,
                backgroundColor: shaded ? PDF_COLORS.surfaceSubtle : PDF_COLORS.surface,
              }}
              wrap={false}
            >
              {showText && <View style={cell("left")}>{renderText?.(row)}</View>}
              {columns.map((c) => (
                <Text
                  key={c.key}
                  style={{
                    ...cell(c.align, widthOf(c)),
                    fontSize: squeeze < 1 ? PDF_TYPE.caption + 0.5 : PDF_TYPE.tableCell,
                    color: PDF_COLORS.ink,
                  }}
                >
                  {c.value(row)}
                </Text>
              ))}
            </View>
          );
        })}

        {group.children?.map((child) => renderGroup(child, depth + 1))}
      </View>
    );
  };

  return (
    <PdfPanel>
      {/* Header — brand fill, readable ink derived from it, so a pale brand
          colour does not produce white-on-cream.

          `fixed` repeats it at the top of every page the table spans. Without
          it the second page of a long table was a block of unlabelled figures:
          the reader had to page back to find out which column was the price.
          @react-pdf re-renders a fixed element per page rather than floating
          one, so this costs nothing on a single-page table. */}
      <View
        fixed={repeatHeader}
        style={{
          flexDirection: "row",
          backgroundColor: brand.base,
          paddingHorizontal: 10,
          paddingVertical: 6,
        }}
      >
        {showText && (
          <Text
            style={{
              ...cell("left"),
              fontFamily: PDF_FONT_FAMILY,
              fontWeight: PDF_WEIGHT.semibold,
              fontSize: PDF_TYPE.tableHeader,
              color: brand.onBrand,
            }}
          >
            {textHeader}
          </Text>
        )}
        {columns.map((c) => (
          <Text
            key={c.key}
            style={{
              ...cell(c.align, widthOf(c)),
              fontFamily: PDF_FONT_FAMILY,
              fontWeight: PDF_WEIGHT.semibold,
              fontSize: PDF_TYPE.tableHeader,
              color: brand.onBrand,
            }}
          >
            {c.label}
          </Text>
        ))}
      </View>

      {groups.map((group) => renderGroup(group, 0))}

      {/* Amounts that are not line items — a document-level margin, or value
          the builder chose not to itemise. They belong inside the table, or
          the rows above stop adding up to the total below it. */}
      {trailingRows.map((t, i) => (
        <View
          key={`${t.label}-${i}`}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderTopWidth: 1,
            borderTopColor: PDF_COLORS.border,
            backgroundColor: PDF_COLORS.surface,
          }}
          wrap={false}
        >
          <Text
            style={{
              fontSize: PDF_TYPE.tableCell,
              color: PDF_COLORS.ink,
              fontFamily: PDF_FONT_FAMILY,
              fontWeight: t.emphasis ? PDF_WEIGHT.medium : PDF_WEIGHT.regular,
            }}
          >
            {t.label}
          </Text>
          <Text
            style={{
              fontSize: PDF_TYPE.tableCell,
              color: PDF_COLORS.ink,
              fontFamily: PDF_FONT_FAMILY,
              fontWeight: PDF_WEIGHT.medium,
            }}
          >
            {t.value}
          </Text>
        </View>
      ))}
    </PdfPanel>
  );
}

/** A two-column "label / amount" list — allowances, labour, attachments. */
export function PdfSimpleRows({
  rows,
}: {
  rows: Array<{ key: string; label: string; value?: string | null; negative?: boolean }>;
}) {
  return (
    <PdfPanel>
      {rows.map((r, idx) => (
        <View
          key={r.key}
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderTopWidth: idx === 0 ? 0 : 1,
            borderTopColor: PDF_COLORS.border,
            backgroundColor: idx % 2 === 1 ? PDF_COLORS.surfaceSubtle : PDF_COLORS.surface,
          }}
          wrap={false}
        >
          <Text style={{ fontSize: PDF_TYPE.tableCell, color: PDF_COLORS.ink, flex: 1, paddingRight: 8 }}>
            {r.label}
          </Text>
          {r.value && (
            <Text
              style={{
                fontFamily: PDF_FONT_FAMILY,
                fontWeight: PDF_WEIGHT.medium,
                fontSize: PDF_TYPE.tableCell,
                color: r.negative ? "#B4503C" : PDF_COLORS.ink,
              }}
            >
              {r.value}
            </Text>
          )}
        </View>
      ))}
    </PdfPanel>
  );
}

/** Page footer, matching the portal's wording. */
export function PdfDocFooter({ companyName }: { companyName?: string | null }) {
  return (
    <View
      fixed
      style={{
        position: "absolute",
        bottom: 24,
        left: 40,
        right: 40,
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        borderTopWidth: 1,
        borderTopColor: PDF_COLORS.border,
        paddingTop: 8,
      }}
    >
      <Text style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkFaint }}>{companyName || ""}</Text>
      <Text style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkFaint }}>Powered by Morada</Text>
      <Text
        style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkFaint }}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}
