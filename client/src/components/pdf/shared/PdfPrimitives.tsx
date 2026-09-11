import { View, Text } from "@react-pdf/renderer";
import type { ReactNode } from "react";
import { registerPdfFonts, PDF_FONT_FAMILY } from "./registerPdfFonts";
import {
  PDF_COLORS,
  PDF_LEADING,
  PDF_RADIUS,
  PDF_SPACE,
  PDF_TYPE,
  PDF_WEIGHT,
  brandRamp,
} from "./pdfTokens";

/**
 * The document body kit — the PDF twins of the pieces the portal is built from.
 *
 * Each one exists because the same shape was being hand-rolled in every
 * document with its own sizes and its own greys. There is nothing clever here;
 * the value is that there is now exactly one of each.
 */

registerPdfFonts();

/* ── Section label ───────────────────────────────────────────────────────── */

/** The uppercase tracked muted heading that opens a section. */
export function PdfSectionLabel({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <Text
      style={{
        fontFamily: PDF_FONT_FAMILY,
        fontWeight: PDF_WEIGHT.semibold,
        fontSize: PDF_TYPE.sectionLabel,
        letterSpacing: PDF_TYPE.sectionLabelTracking,
        color: PDF_COLORS.inkMuted,
        textTransform: "uppercase",
        marginBottom: PDF_SPACE.md,
        ...style,
      }}
    >
      {children}
    </Text>
  );
}

/** A section: label, then content, with the spacing already right. */
export function PdfSection({
  label,
  children,
  wrap = true,
}: {
  label?: string;
  children: ReactNode;
  /** false keeps a short section from splitting across a page break. */
  wrap?: boolean;
}) {
  return (
    <View style={{ marginBottom: PDF_SPACE.xl }} wrap={wrap}>
      {label && <PdfSectionLabel>{label}</PdfSectionLabel>}
      {children}
    </View>
  );
}

/* ── Field grid ──────────────────────────────────────────────────────────── */

export interface PdfField {
  label: string;
  value?: string | null;
}

/**
 * Label-over-value pairs in columns.
 *
 * `columns` defaults to 3. The old variation document used a narrow cell that
 * broke "TEST — Send flow check (Lenny Smith)" across two lines mid-bracket;
 * a real column width is the whole fix.
 */
export function PdfFieldGrid({ fields, columns = 3 }: { fields: PdfField[]; columns?: number }) {
  const shown = fields.filter((f) => f.value && String(f.value).trim());
  if (shown.length === 0) return null;
  const width = `${100 / columns}%`;

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {shown.map((f, i) => (
        <View key={`${f.label}-${i}`} style={{ width, paddingRight: PDF_SPACE.lg, marginBottom: PDF_SPACE.md }}>
          <Text style={{ fontSize: PDF_TYPE.fieldLabel, color: PDF_COLORS.inkFaint, marginBottom: 2 }}>
            {f.label}
          </Text>
          <Text
            style={{
              fontFamily: PDF_FONT_FAMILY,
              fontWeight: PDF_WEIGHT.medium,
              fontSize: PDF_TYPE.fieldValue,
              color: PDF_COLORS.ink,
              lineHeight: PDF_LEADING.tight,
            }}
          >
            {f.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ── Body copy ───────────────────────────────────────────────────────────── */

export function PdfProse({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <Text
      style={{
        fontSize: PDF_TYPE.body,
        color: PDF_COLORS.ink,
        lineHeight: PDF_LEADING.body,
        ...style,
      }}
    >
      {children}
    </Text>
  );
}

/* ── Panel ───────────────────────────────────────────────────────────────── */

/** A bordered, rounded container — the portal's card, for tables and lists. */
export function PdfPanel({ children, style }: { children: ReactNode; style?: object }) {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: PDF_COLORS.border,
        borderRadius: PDF_RADIUS.lg,
        overflow: "hidden",
        ...style,
      }}
    >
      {children}
    </View>
  );
}

/* ── Totals card ─────────────────────────────────────────────────────────── */

export interface PdfTotalRow {
  label: string;
  value: string;
  /** Struck through — a superseded contract sum, say. */
  strikethrough?: boolean;
}

/**
 * The summary card, right-aligned, with the total in the company's colour.
 *
 * The figure and its rule take the brand colour, the way the portal does. The
 * previous document put this in the bills amber, which is a token that means
 * "bill" everywhere else in the product.
 */
export function PdfTotalsCard({
  rows,
  totalLabel,
  totalValue,
  brandColor,
  width = 240,
}: {
  rows: PdfTotalRow[];
  totalLabel: string;
  totalValue: string;
  brandColor?: string | null;
  width?: number;
}) {
  const brand = brandRamp(brandColor);

  return (
    <View style={{ flexDirection: "row", justifyContent: "flex-end" }} wrap={false}>
      <PdfPanel style={{ width }}>
        <View style={{ paddingHorizontal: 14, paddingVertical: 12 }}>
          {rows.map((r, i) => (
            <View
              key={`${r.label}-${i}`}
              style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: PDF_SPACE.sm }}
            >
              <Text style={{ fontSize: PDF_TYPE.bodySmall, color: PDF_COLORS.inkMuted }}>{r.label}</Text>
              <Text
                style={{
                  fontFamily: PDF_FONT_FAMILY,
                  fontWeight: PDF_WEIGHT.medium,
                  fontSize: PDF_TYPE.bodySmall,
                  color: PDF_COLORS.ink,
                  // "textDecoration", not the React Native spelling —
                  // textDecorationLine is silently ignored by @react-pdf.
                  textDecoration: r.strikethrough ? "line-through" : "none",
                }}
              >
                {r.value}
              </Text>
            </View>
          ))}

          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              borderTopWidth: 1,
              borderTopColor: brand.rule,
              paddingTop: PDF_SPACE.md,
              marginTop: PDF_SPACE.xs,
            }}
          >
            <Text
              style={{
                fontFamily: PDF_FONT_FAMILY,
                fontWeight: PDF_WEIGHT.bold,
                fontSize: PDF_TYPE.totalLabel,
                color: brand.onWhite,
              }}
            >
              {totalLabel}
            </Text>
            <Text
              style={{
                fontFamily: PDF_FONT_FAMILY,
                fontWeight: PDF_WEIGHT.bold,
                fontSize: PDF_TYPE.totalFigure,
                color: brand.onWhite,
              }}
            >
              {totalValue}
            </Text>
          </View>
        </View>
      </PdfPanel>
    </View>
  );
}

/* ── Signatures ──────────────────────────────────────────────────────────── */

export interface PdfSignatory {
  title: string;
  signedName?: string | null;
  signedDate?: string | null;
}

/**
 * Two signature cards side by side.
 *
 * The important behaviour: when a signature has actually been captured, show
 * it. The old document printed blank ruled lines for both parties no matter
 * what, so a variation the client had signed in the portal produced an
 * attachment with an empty line where the evidence should be — the one thing
 * you would reach for if the agreement were ever questioned.
 */
export function PdfSignatureCards({ signatories }: { signatories: PdfSignatory[] }) {
  return (
    <View style={{ flexDirection: "row", gap: PDF_SPACE.md }} wrap={false}>
      {signatories.map((s, i) => {
        const signed = !!(s.signedName && s.signedDate);
        return (
          <PdfPanel key={`${s.title}-${i}`} style={{ flex: 1, borderRadius: PDF_RADIUS.lg }}>
            <View style={{ padding: 14, minHeight: 92 }}>
              <Text
                style={{
                  fontFamily: PDF_FONT_FAMILY,
                  fontWeight: PDF_WEIGHT.semibold,
                  fontSize: PDF_TYPE.sectionLabel,
                  letterSpacing: PDF_TYPE.sectionLabelTracking,
                  color: PDF_COLORS.inkMuted,
                  textTransform: "uppercase",
                  marginBottom: PDF_SPACE.md,
                }}
              >
                {s.title}
              </Text>

              {signed ? (
                <View>
                  <Text
                    style={{
                      fontFamily: PDF_FONT_FAMILY,
                      fontWeight: PDF_WEIGHT.semibold,
                      fontSize: PDF_TYPE.fieldValue + 1,
                      color: PDF_COLORS.ink,
                      marginBottom: 3,
                    }}
                  >
                    {s.signedName}
                  </Text>
                  <Text style={{ fontSize: PDF_TYPE.bodySmall, color: PDF_COLORS.inkMuted }}>
                    Signed {s.signedDate}
                  </Text>
                </View>
              ) : (
                <View>
                  {["Name", "Signature", "Date"].map((l) => (
                    <View key={l} style={{ flexDirection: "row", alignItems: "flex-end", marginBottom: PDF_SPACE.md }}>
                      <Text style={{ fontSize: PDF_TYPE.bodySmall, color: PDF_COLORS.inkMuted, width: 54 }}>
                        {l}:
                      </Text>
                      <View style={{ flex: 1, borderBottomWidth: 1, borderBottomColor: PDF_COLORS.border, height: 12 }} />
                    </View>
                  ))}
                </View>
              )}
            </View>
          </PdfPanel>
        );
      })}
    </View>
  );
}

/* ── Callout ─────────────────────────────────────────────────────────────── */

/** A tinted, left-ruled note — a rejection reason, a deadline. */
export function PdfCallout({
  label,
  children,
  tone = "neutral",
}: {
  label?: string;
  children: ReactNode;
  tone?: "neutral" | "negative" | "caution";
}) {
  const paint =
    tone === "negative"
      ? { bg: "#F9EFEC", rule: "#DA998B", ink: "#8C4636" }
      : tone === "caution"
        ? { bg: "#F8F3E8", rule: "#D5B772", ink: "#7A5C24" }
        : { bg: PDF_COLORS.surfaceSubtle, rule: PDF_COLORS.borderStrong, ink: PDF_COLORS.ink };

  return (
    <View
      style={{
        backgroundColor: paint.bg,
        borderLeftWidth: 3,
        borderLeftColor: paint.rule,
        borderRadius: PDF_RADIUS.sm,
        paddingHorizontal: 12,
        paddingVertical: 10,
      }}
      wrap={false}
    >
      {label && (
        <Text
          style={{
            fontFamily: PDF_FONT_FAMILY,
            fontWeight: PDF_WEIGHT.semibold,
            fontSize: PDF_TYPE.sectionLabel,
            letterSpacing: PDF_TYPE.sectionLabelTracking,
            color: paint.ink,
            textTransform: "uppercase",
            marginBottom: 3,
          }}
        >
          {label}
        </Text>
      )}
      <Text style={{ fontSize: PDF_TYPE.bodySmall, color: PDF_COLORS.ink, lineHeight: PDF_LEADING.body }}>
        {children}
      </Text>
    </View>
  );
}
