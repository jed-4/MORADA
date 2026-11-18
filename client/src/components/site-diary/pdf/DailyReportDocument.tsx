import { Document, Page, View, Text, Image } from "@react-pdf/renderer";
import type { DailyReportModel } from "../../../../../shared/dailyReport";
import { formatHours } from "../../../../../shared/dailyReport";
import { registerPdfFonts, PDF_FONT_FAMILY } from "../../pdf/shared/registerPdfFonts";
import { PDF_COLORS, PDF_SPACE, PDF_TYPE, PDF_WEIGHT, PDF_RADIUS, PDF_LEADING } from "../../pdf/shared/pdfTokens";
import { PdfHeroBand, PDF_BODY_STYLE } from "../../pdf/shared/PdfHeroBand";
import { PdfSection, PdfFieldGrid, PdfPanel, PdfProse } from "../../pdf/shared/PdfPrimitives";
import { PdfSimpleRows, PdfDocFooter } from "../../pdf/shared/PdfLineTable";
import { PdfDocumentTitle } from "../../pdf/shared/PdfPartiesPanel";

/**
 * The daily site report — one project, one day, for the client.
 *
 * Rendered on the SERVER (server/dailyReport.ts, renderToBuffer) rather than in
 * the browser like the other documents, because the phone app has to open it
 * too and React Native cannot run @react-pdf. It is still an on-demand render
 * of a finished tree — there is no live <PDFViewer>, so the reconciler gap in
 * @react-pdf 4.3.1 (no detachDeletedInstance) cannot bite.
 *
 * Imports are relative, not "@/…", and nothing here may use fontStyle
 * "italic" casually: @react-pdf cannot synthesise a slant (the Inter italics
 * are registered, so it works, but there is no need for it on this page).
 *
 * The model has no money in it by construction — see shared/dailyReport.ts.
 */

registerPdfFonts();

// Six across keeps twelve photos to two rows (~130pt), which is what lets a
// normal day fit on one page.
const PHOTO_COLUMNS = 6;
const PHOTO_GAP = 6;
/** A4 less both 40pt margins. */
const BODY_WIDTH = 595 - 80;
const PHOTO_WIDTH = Math.floor((BODY_WIDTH - PHOTO_GAP * (PHOTO_COLUMNS - 1)) / PHOTO_COLUMNS);
const PHOTO_HEIGHT = Math.round(PHOTO_WIDTH * 0.75);

function EmptyLine({ children }: { children: string }) {
  return (
    <Text style={{ fontSize: PDF_TYPE.bodySmall, color: PDF_COLORS.inkFaint }}>{children}</Text>
  );
}

function EntryBlock({ entry, first }: { entry: DailyReportModel["entries"][number]; first: boolean }) {
  return (
    <View
      style={{
        paddingHorizontal: 12,
        paddingVertical: 10,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: PDF_COLORS.border,
      }}
      wrap={false}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: entry.fields.length ? 6 : 0 }}>
        <Text
          style={{
            fontFamily: PDF_FONT_FAMILY,
            fontWeight: PDF_WEIGHT.semibold,
            fontSize: PDF_TYPE.body,
            color: PDF_COLORS.ink,
            flex: 1,
            paddingRight: 8,
          }}
        >
          {entry.title}
        </Text>
        <Text style={{ fontSize: PDF_TYPE.caption + 0.5, color: PDF_COLORS.inkFaint }}>
          {[entry.time, entry.author].filter(Boolean).join(" · ")}
        </Text>
      </View>
      {entry.fields.map((f, i) => (
        <View key={`${f.label}-${i}`} style={{ flexDirection: "row", marginTop: i === 0 ? 0 : 3 }}>
          <Text style={{ width: 110, fontSize: PDF_TYPE.bodySmall, color: PDF_COLORS.inkMuted, paddingRight: 8 }}>
            {f.label}
          </Text>
          <Text style={{ flex: 1, fontSize: PDF_TYPE.bodySmall, color: PDF_COLORS.ink, lineHeight: PDF_LEADING.body }}>
            {f.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function PhotoGrid({ photos, more }: { photos: DailyReportModel["photos"]; more: number }) {
  return (
    <View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {photos.map((p, i) => (
          <View
            key={i}
            wrap={false}
            style={{
              width: PHOTO_WIDTH,
              height: PHOTO_HEIGHT,
              marginRight: (i + 1) % PHOTO_COLUMNS === 0 ? 0 : PHOTO_GAP,
              marginBottom: PHOTO_GAP,
              borderRadius: PDF_RADIUS.sm,
              overflow: "hidden",
              backgroundColor: PDF_COLORS.surfaceMuted,
            }}
          >
            <Image src={p.src} style={{ width: PHOTO_WIDTH, height: PHOTO_HEIGHT, objectFit: "cover" }} />
          </View>
        ))}
      </View>
      {more > 0 && (
        <Text style={{ fontSize: PDF_TYPE.bodySmall, color: PDF_COLORS.inkMuted, marginTop: 2 }}>
          +{more} more {more === 1 ? "photo" : "photos"} in the site diary
        </Text>
      )}
    </View>
  );
}

export function DailyReportDocument({ model }: { model: DailyReportModel }) {
  const { company, project } = model;
  const hasDefects = model.defectsRaised.length > 0 || model.defectsClosed.length > 0;

  return (
    <Document title={`Daily site report — ${project.name} — ${model.date}`} author={company.name}>
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
          variant={company.variant}
          companyName={company.name}
          logoUrl={company.logoSrc}
          contactLines={company.contactLines}
          brandColor={company.brandColor}
          figureLabel="Daily site report"
          figure={new Date(`${model.date}T12:00:00Z`).toLocaleDateString("en-AU", {
            day: "numeric",
            month: "short",
            year: "numeric",
            timeZone: "UTC",
          })}
        />

        <View style={PDF_BODY_STYLE}>
          <PdfDocumentTitle>{project.name}</PdfDocumentTitle>
          <Text style={{ fontSize: PDF_TYPE.body, color: PDF_COLORS.inkMuted, marginTop: 3 }}>
            {model.dateLabel}
          </Text>

          <View style={{ marginTop: PDF_SPACE.lg }}>
            <PdfFieldGrid
              columns={3}
              fields={[
                { label: "Site address", value: project.address },
                { label: "Weather", value: model.weather || "Not recorded" },
                {
                  label: "On site",
                  value: model.crew.length
                    ? `${model.crew.length} ${model.crew.length === 1 ? "person" : "people"} · ${formatHours(model.crewTotalHours)}`
                    : "No time recorded",
                },
              ]}
            />
          </View>

          {model.workDone.length > 0 && (
            <PdfSection label="Work done">
              {model.workDone.map((w, i) => (
                <PdfProse key={i} style={{ marginTop: i === 0 ? 0 : PDF_SPACE.sm }}>
                  {w}
                </PdfProse>
              ))}
            </PdfSection>
          )}

          <PdfSection label="Site diary">
            {model.entries.length ? (
              <PdfPanel>
                {model.entries.map((e, i) => (
                  <EntryBlock key={i} entry={e} first={i === 0} />
                ))}
              </PdfPanel>
            ) : (
              <EmptyLine>No diary entries for this day.</EmptyLine>
            )}
          </PdfSection>

          {model.photos.length > 0 && (
            <PdfSection label="Photos">
              <PhotoGrid photos={model.photos} more={model.morePhotos} />
            </PdfSection>
          )}

          {/* One unit: the two halves must never land on different pages. */}
          <View style={{ flexDirection: "row" }} wrap={false}>
            <View style={{ flex: 1, paddingRight: PDF_SPACE.md }}>
              <PdfSection label="On site" wrap={false}>
                {model.crew.length ? (
                  <PdfSimpleRows
                    rows={model.crew.map((c, i) => ({ key: `${c.name}-${i}`, label: c.name, value: formatHours(c.hours) }))}
                  />
                ) : (
                  <EmptyLine>No time recorded.</EmptyLine>
                )}
              </PdfSection>
            </View>
            <View style={{ flex: 1, paddingLeft: PDF_SPACE.md }}>
              <PdfSection label="Scheduled today" wrap={false}>
                {model.schedule.length ? (
                  <PdfSimpleRows
                    rows={model.schedule.map((s, i) => ({ key: `${s.name}-${i}`, label: s.name, value: s.detail || null }))}
                  />
                ) : (
                  <EmptyLine>Nothing scheduled.</EmptyLine>
                )}
              </PdfSection>
            </View>
          </View>

          {hasDefects && (
            <PdfSection label="Defects" wrap={false}>
              <PdfSimpleRows
                rows={[
                  ...model.defectsRaised.map((d, i) => ({
                    key: `r${i}`,
                    label: d.location ? `${d.title} — ${d.location}` : d.title,
                    value: "Raised",
                  })),
                  ...model.defectsClosed.map((d, i) => ({
                    key: `c${i}`,
                    label: d.location ? `${d.title} — ${d.location}` : d.title,
                    value: "Closed",
                  })),
                ]}
              />
            </PdfSection>
          )}
        </View>

        <PdfDocFooter companyName={company.name} />
      </Page>
    </Document>
  );
}
