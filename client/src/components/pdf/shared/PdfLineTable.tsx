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
  /** Shown right-aligned on the group header row. */
  total?: string;
  rows: T[];
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

  return (
    <PdfPanel>
      {/* Header — brand fill, readable ink derived from it, so a pale brand
          colour does not produce white-on-cream. */}
      <View
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

      {groups.map((group) => (
        <View key={group.key}>
          {grouped && group.label && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingHorizontal: 10,
                paddingVertical: 4,
                backgroundColor: PDF_COLORS.surfaceMuted,
                borderTopWidth: 1,
                borderTopColor: PDF_COLORS.border,
              }}
            >
              <Text
                style={{
                  fontFamily: PDF_FONT_FAMILY,
                  fontWeight: PDF_WEIGHT.semibold,
                  fontSize: PDF_TYPE.tableHeader,
                  letterSpacing: 0.4,
                  textTransform: "uppercase",
                  color: PDF_COLORS.inkMuted,
                }}
              >
                {group.label}
              </Text>
              {group.total && (
                <Text
                  style={{
                    fontFamily: PDF_FONT_FAMILY,
                    fontWeight: PDF_WEIGHT.semibold,
                    fontSize: PDF_TYPE.tableHeader,
                    color: PDF_COLORS.inkMuted,
                  }}
                >
                  {group.total}
                </Text>
              )}
            </View>
          )}

          {group.rows.map((row, idx) => (
            <View
              key={rowKey(row, idx)}
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderTopWidth: 1,
                borderTopColor: PDF_COLORS.border,
                backgroundColor: idx % 2 === 1 ? PDF_COLORS.surfaceSubtle : PDF_COLORS.surface,
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
          ))}
        </View>
      ))}

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
