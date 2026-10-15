import { Document, Image, Page, Text, View } from "@react-pdf/renderer";
import { PdfHeroBand, PDF_BODY_STYLE } from "@/components/pdf/shared/PdfHeroBand";
import { PdfSectionLabel } from "@/components/pdf/shared/PdfPrimitives";
import { PdfDocFooter } from "@/components/pdf/shared/PdfLineTable";
import { PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";
import {
  brandRamp,
  PDF_ACCENTS,
  PDF_COLORS,
  PDF_RADIUS,
  PDF_SPACE,
  PDF_TYPE,
  PDF_WEIGHT,
} from "@/components/pdf/shared/pdfTokens";
import { formatCents } from "@shared/money";
import type { SelectionsPdfModel, SelectionsPdfOption } from "@shared/selectionsPdfModel";

/**
 * Selections Schedule. Client-safe by construction — see
 * shared/selectionsPdfModel.ts for what is left out and why.
 *
 * `images` maps an image filePath to a data URI already cropped to the saved
 * thumbnail square (focal point + zoom) in the browser, so the PDF shows the
 * same crop as the app.
 */
export interface SelectionsPdfDocumentProps {
  model: SelectionsPdfModel;
  images: Record<string, string>;
  projectName?: string | null;
  companyName?: string | null;
  logoUrl?: string | null;
  brandColor?: string | null;
  documentStyle?: "style1" | "style2";
  generatedOn: string;
}

const TILES_PER_ROW = 4;

function OptionTile({ option, image, accent }: { option: SelectionsPdfOption; image?: string; accent: string }) {
  return (
    <View
      style={{
        width: `${100 / TILES_PER_ROW}%`,
        paddingRight: PDF_SPACE.sm,
        marginBottom: PDF_SPACE.sm,
      }}
      wrap={false}
    >
      <View
        style={{
          borderWidth: option.chosen ? 1.5 : 1,
          borderColor: option.chosen ? PDF_ACCENTS.positive : PDF_COLORS.border,
          borderRadius: PDF_RADIUS.md,
          backgroundColor: option.chosen ? PDF_ACCENTS.positiveWash : PDF_COLORS.surface,
          overflow: "hidden",
        }}
      >
        {image ? (
          <Image src={image} style={{ width: "100%", aspectRatio: 1, objectFit: "cover" }} />
        ) : (
          <View style={{ width: "100%", aspectRatio: 1, backgroundColor: PDF_COLORS.surfaceMuted, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkFaint }}>No image</Text>
          </View>
        )}
        <View style={{ padding: PDF_SPACE.sm }}>
          <Text style={{ fontSize: PDF_TYPE.bodySmall, fontWeight: PDF_WEIGHT.semibold, color: PDF_COLORS.ink }}>{option.name}</Text>
          {!!option.brandLine && (
            <Text style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkMuted, marginTop: 1 }}>{option.brandLine}</Text>
          )}
          {(option.quantityLabel || option.priceCents != null) && (
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: PDF_SPACE.xs }}>
              <Text style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkMuted }}>{option.quantityLabel}</Text>
              {option.priceCents != null && (
                <Text style={{ fontSize: PDF_TYPE.bodySmall, fontWeight: PDF_WEIGHT.semibold, color: PDF_COLORS.ink }}>
                  {formatCents(option.priceCents)}
                </Text>
              )}
            </View>
          )}
          {option.chosen && (
            <Text
              style={{
                marginTop: PDF_SPACE.xs,
                fontSize: PDF_TYPE.caption,
                fontWeight: PDF_WEIGHT.bold,
                color: option.approved ? "#3E7A58" : accent,
                letterSpacing: 0.4,
              }}
            >
              {option.approved ? "APPROVED" : "CHOSEN"}
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

export function SelectionsPdfDocument({
  model,
  images,
  projectName,
  companyName,
  logoUrl,
  brandColor,
  documentStyle = "style1",
  generatedOn,
}: SelectionsPdfDocumentProps) {
  const ramp = brandRamp(brandColor);
  const totals = model.totals;
  const variance = totals ? totals.selectedCents - totals.allowanceCents : 0;

  return (
    <Document title={`Selections schedule${projectName ? ` — ${projectName}` : ""}`}>
      <Page
        size="A4"
        style={{
          fontSize: PDF_TYPE.body,
          fontFamily: PDF_FONT_FAMILY,
          color: PDF_COLORS.ink,
          backgroundColor: PDF_COLORS.surface,
          paddingBottom: 56,
        }}
      >
        <PdfHeroBand
          variant={documentStyle === "style2" ? "brand" : "light"}
          companyName={companyName || "—"}
          logoUrl={logoUrl}
          brandColor={brandColor}
          figureLabel="Selections schedule"
          figure={projectName || null}
          figureCaption={`${model.count} selection${model.count === 1 ? "" : "s"} · ${generatedOn}`}
        />

        <View style={PDF_BODY_STYLE}>
          {totals && (
            <View style={{ flexDirection: "row", marginBottom: PDF_SPACE.lg }}>
              {[
                { label: "Total allowance", value: formatCents(totals.allowanceCents), tone: null },
                { label: "Total selected", value: formatCents(totals.selectedCents), tone: null },
                { label: "Difference", value: `${variance > 0 ? "+" : ""}${formatCents(variance)}`, tone: variance > 0 ? "neg" : "pos" },
              ].map((card, i) => (
                <View
                  key={card.label}
                  style={{
                    flex: 1,
                    marginLeft: i === 0 ? 0 : PDF_SPACE.sm,
                    padding: PDF_SPACE.md,
                    borderWidth: 1,
                    borderColor: PDF_COLORS.border,
                    borderRadius: PDF_RADIUS.md,
                    backgroundColor: card.tone === "neg" ? PDF_ACCENTS.negativeWash : card.tone === "pos" ? PDF_ACCENTS.positiveWash : PDF_COLORS.surface,
                  }}
                >
                  <Text style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkMuted, textTransform: "uppercase", letterSpacing: 0.5 }}>{card.label}</Text>
                  <Text style={{ fontSize: PDF_TYPE.totalFigure, fontWeight: PDF_WEIGHT.bold, marginTop: 2 }}>{card.value}</Text>
                </View>
              ))}
            </View>
          )}

          {model.count === 0 && (
            <Text style={{ color: PDF_COLORS.inkMuted }}>No selections to show.</Text>
          )}

          {model.rooms.map(({ room, selections }) => (
            <View key={room} style={{ marginBottom: PDF_SPACE.md }}>
              <PdfSectionLabel style={{ color: ramp.onWhite }}>{room}</PdfSectionLabel>
              {selections.map((sel) => (
                <View
                  key={sel.id}
                  style={{
                    marginBottom: PDF_SPACE.md,
                    padding: PDF_SPACE.md,
                    paddingRight: PDF_SPACE.md - PDF_SPACE.sm,
                    borderWidth: 1,
                    borderColor: PDF_COLORS.border,
                    borderLeftWidth: 3,
                    borderLeftColor: ramp.base,
                    borderRadius: PDF_RADIUS.md,
                  }}
                  wrap={sel.options.length > TILES_PER_ROW}
                >
                  <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: PDF_SPACE.sm, paddingRight: PDF_SPACE.sm }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: PDF_TYPE.docTitle - 2, fontWeight: PDF_WEIGHT.semibold }}>{sel.name}</Text>
                      {!!sel.meta && <Text style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkMuted, marginTop: 1 }}>{sel.meta}</Text>}
                    </View>
                    {(sel.allowanceCents != null || sel.chosenPriceCents != null) && (
                      <Text style={{ fontSize: PDF_TYPE.bodySmall, color: PDF_COLORS.inkMuted, textAlign: "right" }}>
                        {sel.allowanceCents != null ? `Allowance ${formatCents(sel.allowanceCents)}` : ""}
                        {sel.allowanceCents != null && sel.chosenPriceCents != null ? "   " : ""}
                        {sel.chosenPriceCents != null ? `Selected ${formatCents(sel.chosenPriceCents)}` : ""}
                      </Text>
                    )}
                  </View>
                  {sel.options.length === 0 ? (
                    <Text style={{ fontSize: PDF_TYPE.bodySmall, color: PDF_COLORS.inkMuted }}>No options yet.</Text>
                  ) : (
                    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
                      {sel.options.map((o) => (
                        <OptionTile key={o.id} option={o} image={o.image ? images[o.image.filePath] : undefined} accent={ramp.onWhite} />
                      ))}
                    </View>
                  )}
                  {!!sel.approvedLine && (
                    <Text style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkMuted, marginTop: 2 }}>{sel.approvedLine}</Text>
                  )}
                </View>
              ))}
            </View>
          ))}

          <Text style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkFaint, marginTop: PDF_SPACE.sm }}>
            {totals || model.rooms.some((r) => r.selections.some((s) => s.options.some((o) => o.priceCents != null)))
              ? "Prices include GST."
              : ""}
          </Text>
        </View>

        <PdfDocFooter companyName={companyName} />
      </Page>
    </Document>
  );
}
