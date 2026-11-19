import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { PdfHeroBand } from "@/components/pdf/shared/PdfHeroBand";
import { PdfDocumentTitle } from "@/components/pdf/shared/PdfPartiesPanel";
import { PdfDocFooter } from "@/components/pdf/shared/PdfLineTable";
import { PdfSignatureCards } from "@/components/pdf/shared/PdfPrimitives";
import { statusPaint } from "@/components/pdf/shared/pdfStatus";
import { PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";
import { PDF_COLORS, PDF_PAGE_MARGIN, PDF_SPACE, PDF_TYPE, PDF_RADIUS } from "@/components/pdf/shared/pdfTokens";
import { DEFECT_JOB_STAGE_LABELS, DEFECT_STAGE_LABELS, type DefectJobStage, type DefectStage } from "@shared/defects";
import type { HandoverSignoffView } from "@shared/defectTrades";

/**
 * The handover defects list (Defects v2 stage 3). One row per defect: ref,
 * title and location, before/after thumbnails, status and closed date. The
 * same document is downloaded by the office and by the client (who never gets
 * trade names — the server leaves them out of the client's copy).
 *
 * Photos arrive as data URIs, already shrunk in the browser
 * (useHandoverPdfExport) — @react-pdf can't crop, and full-size originals
 * would make a 60-defect list enormous.
 */

export interface HandoverPdfDefect {
  id: string;
  ref: string;
  title: string;
  location: string | null;
  stage: DefectStage;
  trade: string | null;
  closedAt: string | null;
  before: string[];
  after: string[];
}

export interface HandoverPdfProps {
  projectName: string;
  projectAddress: string | null;
  companyName: string | null;
  logoUrl: string | null;
  brandColor: string;
  documentStyle: "style1" | "style2";
  phone?: string | null;
  email?: string | null;
  abn?: string | null;
  jobStages: string[];
  defects: HandoverPdfDefect[];
  /** Photo URL → data URI. Missing ones print as an empty box. */
  images: Record<string, string>;
  signoff: HandoverSignoffView | null;
  generatedOn: string;
}

const fmt = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }) : "—";

const THUMB = 46;

function Thumbs({ urls, images }: { urls: string[]; images: Record<string, string> }) {
  if (!urls.length) {
    return <Text style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkFaint }}>—</Text>;
  }
  return (
    <View style={{ flexDirection: "row", gap: 3 }}>
      {urls.slice(0, 2).map((u) =>
        images[u] ? (
          <Image key={u} src={images[u]} style={{ width: THUMB, height: THUMB, objectFit: "cover", borderRadius: PDF_RADIUS.sm }} />
        ) : (
          <View key={u} style={{ width: THUMB, height: THUMB, backgroundColor: PDF_COLORS.surfaceMuted, borderRadius: PDF_RADIUS.sm }} />
        ),
      )}
    </View>
  );
}

const COLS = { ref: 44, item: 0, before: 100, after: 100, status: 78 };

export function HandoverPdfDocument(p: HandoverPdfProps) {
  const closed = p.defects.filter((d) => d.stage === "closed").length;
  const open = p.defects.length - closed;
  const stageNames = p.jobStages.map((s) => DEFECT_JOB_STAGE_LABELS[s as DefectJobStage] ?? s).join(" + ");
  const headerCell = { fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkMuted, fontWeight: 600 as const };

  return (
    <Document title={`Handover defects — ${p.projectName}`}>
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
          variant={p.documentStyle === "style2" ? "brand" : "light"}
          companyName={p.companyName || "—"}
          logoUrl={p.logoUrl}
          brandColor={p.brandColor}
          contactLines={[p.phone, p.email, p.abn ? `ABN ${p.abn}` : null]}
          status={open === 0 ? statusPaint("closed", "All closed") : statusPaint("action", `${open} open`)}
          figure={`${closed} / ${p.defects.length}`}
          figureLabel="Closed"
          figureCaption={p.generatedOn}
        />

        <View style={{ paddingHorizontal: PDF_PAGE_MARGIN, paddingTop: PDF_SPACE.xl }}>
          <PdfDocumentTitle>Handover defects list</PdfDocumentTitle>
          <Text style={{ fontSize: PDF_TYPE.bodySmall, color: PDF_COLORS.inkMuted, marginBottom: PDF_SPACE.lg }}>
            {[p.projectName, p.projectAddress, stageNames].filter(Boolean).join("  ·  ")}
          </Text>

          {/* Table header */}
          <View
            fixed
            style={{ flexDirection: "row", paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: PDF_COLORS.borderStrong }}
          >
            <Text style={{ ...headerCell, width: COLS.ref }}>Ref</Text>
            <Text style={{ ...headerCell, flex: 1 }}>Defect</Text>
            <Text style={{ ...headerCell, width: COLS.before }}>Before</Text>
            <Text style={{ ...headerCell, width: COLS.after }}>After</Text>
            <Text style={{ ...headerCell, width: COLS.status, textAlign: "right" }}>Status</Text>
          </View>

          {p.defects.length === 0 && (
            <Text style={{ paddingVertical: 14, color: PDF_COLORS.inkMuted }}>No defects in these stages.</Text>
          )}

          {p.defects.map((d, i) => {
            const chip = statusPaint(d.stage === "fixed" ? "action" : d.stage === "rejected" ? "rejected" : d.stage === "closed" ? "closed" : "open", DEFECT_STAGE_LABELS[d.stage]);
            return (
              <View
                key={d.id}
                wrap={false}
                style={{
                  flexDirection: "row",
                  paddingVertical: 7,
                  borderBottomWidth: 1,
                  borderBottomColor: PDF_COLORS.border,
                  backgroundColor: i % 2 ? PDF_COLORS.surfaceSubtle : PDF_COLORS.surface,
                }}
              >
                <Text style={{ width: COLS.ref, fontWeight: 600, fontSize: PDF_TYPE.bodySmall }}>{d.ref}</Text>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={{ fontSize: PDF_TYPE.bodySmall, fontWeight: 600 }}>{d.title}</Text>
                  {d.location && <Text style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkMuted, marginTop: 2 }}>{d.location}</Text>}
                  {d.trade && <Text style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkFaint, marginTop: 1 }}>{d.trade}</Text>}
                </View>
                <View style={{ width: COLS.before }}><Thumbs urls={d.before} images={p.images} /></View>
                <View style={{ width: COLS.after }}><Thumbs urls={d.after} images={p.images} /></View>
                <View style={{ width: COLS.status, alignItems: "flex-end" }}>
                  <Text
                    style={{
                      fontSize: PDF_TYPE.caption,
                      backgroundColor: chip.bg,
                      color: chip.text,
                      paddingHorizontal: 5,
                      paddingVertical: 2,
                      borderRadius: PDF_RADIUS.sm,
                    }}
                  >
                    {chip.label}
                  </Text>
                  {d.closedAt && (
                    <Text style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkMuted, marginTop: 3 }}>{fmt(d.closedAt)}</Text>
                  )}
                </View>
              </View>
            );
          })}

          <View style={{ marginTop: PDF_SPACE.xl }}>
            <PdfSignatureCards
              signatories={[
                {
                  title: "Client sign-off",
                  signedName: p.signoff?.signerName ?? null,
                  signedDate: p.signoff ? fmt(p.signoff.signedAt) : null,
                },
              ]}
            />
            {p.signoff && p.signoff.openCount > 0 && (
              <Text style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkMuted, marginTop: 6 }}>
                {`Signed with ${p.signoff.openCount} of ${p.signoff.defectCount} defects still open.`}
              </Text>
            )}
          </View>
        </View>

        <PdfDocFooter companyName={p.companyName} />
      </Page>
    </Document>
  );
}
