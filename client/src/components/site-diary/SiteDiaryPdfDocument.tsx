import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { SiteDiaryEntry, SiteDiaryTemplate, TemplateFieldDefinition } from "@shared/schema";
import { registerPdfFonts, PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";
import { PDF_COLORS } from "@/components/pdf/shared/pdfTokens";

registerPdfFonts();

// #A890D4 was the FIGMA swatch, not the colour the app ships. Every other
// document takes the company's own brand colour; these internal ones had
// no brandColor prop at all, so they printed in a purple from nowhere.
const PDF_PRIMARY = PDF_COLORS.brandFallback;

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: PDF_FONT_FAMILY,
  },
  header: {
    marginBottom: 20,
    borderBottom: `2 solid ${PDF_PRIMARY}`,
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontFamily: PDF_FONT_FAMILY, fontWeight: 600,
    color: PDF_COLORS.ink,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: PDF_COLORS.inkMuted,
  },
  entryCard: {
    marginBottom: 14,
    border: `1 solid ${PDF_COLORS.border}`,
    borderRadius: 4,
    overflow: "hidden",
  },
  entryHeader: {
    backgroundColor: PDF_COLORS.surfaceSubtle,
    padding: 8,
    borderBottom: `1 solid ${PDF_COLORS.border}`,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  entryTitle: {
    fontSize: 11,
    fontFamily: PDF_FONT_FAMILY, fontWeight: 600,
    color: PDF_COLORS.ink,
    flex: 1,
  },
  entryDate: {
    fontSize: 9,
    color: PDF_COLORS.inkMuted,
  },
  templateBadge: {
    fontSize: 8,
    color: PDF_COLORS.inkMuted,
    backgroundColor: PDF_COLORS.surfaceMuted,
    padding: "2 6",
    borderRadius: 3,
    marginLeft: 8,
  },
  entryBody: {
    padding: 8,
  },
  fieldRow: {
    flexDirection: "row",
    marginBottom: 4,
    paddingBottom: 4,
    borderBottom: `0.5 solid ${PDF_COLORS.surfaceMuted}`,
  },
  fieldLabel: {
    width: "30%",
    fontSize: 9,
    fontFamily: PDF_FONT_FAMILY, fontWeight: 600,
    color: PDF_COLORS.inkMuted,
  },
  fieldValue: {
    width: "70%",
    fontSize: 9,
    color: PDF_COLORS.ink,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: `0.5 solid ${PDF_COLORS.border}`,
    paddingTop: 6,
    marginTop: 4,
  },
  metaText: {
    fontSize: 8,
    color: PDF_COLORS.inkFaint,
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: `0.5 solid ${PDF_COLORS.border}`,
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: PDF_COLORS.inkFaint,
  },
  noEntries: {
    textAlign: "center",
    color: PDF_COLORS.inkFaint,
    marginTop: 40,
    fontSize: 12,
  },
});

function formatDate(dateStr: string | Date): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("en-AU", {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return String(dateStr);
  }
}

function renderFieldValue(
  field: TemplateFieldDefinition,
  val: any
): string {
  if (val === undefined || val === null || val === "") return "—";

  if (field.type === "checkbox") {
    if (typeof val === "object" && "value" in val) {
      const checked = val.value ? "Yes" : "No";
      if (val.value && val.checkedByName) {
        return `${checked} (by ${val.checkedByName})`;
      }
      return checked;
    }
    return val ? "Yes" : "No";
  }

  if (field.type === "file" || field.type === "photo-gallery") {
    const files = Array.isArray(val) ? val : [];
    if (files.length === 0) return "No files";
    return files.map((f: any) => f.name).join(", ");
  }

  if (field.type === "date") {
    return formatDate(val);
  }

  return String(val);
}

export function SiteDiaryPdfDocument({
  entries,
  templates,
  projectName,
}: {
  entries: SiteDiaryEntry[];
  templates: SiteDiaryTemplate[];
  projectName: string;
}) {
  const sortedEntries = [...entries].sort(
    (a, b) => new Date(b.entryDateTime).getTime() - new Date(a.entryDateTime).getTime()
  );

  const generatedDate = new Date().toLocaleDateString("en-AU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>Site Diary Report</Text>
          <Text style={styles.subtitle}>
            {projectName} — {sortedEntries.length} {sortedEntries.length === 1 ? "entry" : "entries"}
          </Text>
          <Text style={styles.subtitle}>Generated {generatedDate}</Text>
        </View>

        {sortedEntries.length === 0 ? (
          <Text style={styles.noEntries}>No entries to display</Text>
        ) : (
          sortedEntries.map((entry) => {
            const template = templates.find((t) => t.id === entry.templateId);
            const templateFields = (template?.fields as TemplateFieldDefinition[]) || [];
            const fieldValues = (entry.fieldValues as Record<string, any>) || {};

            return (
              <View key={entry.id} style={styles.entryCard} wrap={false}>
                <View style={styles.entryHeader}>
                  <Text style={styles.entryTitle}>{entry.title}</Text>
                  <Text style={styles.templateBadge}>{entry.templateName}</Text>
                  <Text style={styles.entryDate}>{formatDate(entry.entryDateTime)}</Text>
                </View>
                <View style={styles.entryBody}>
                  {templateFields.length > 0
                    ? templateFields.map((field) => (
                        <View key={field.id} style={styles.fieldRow}>
                          <Text style={styles.fieldLabel}>{field.title}</Text>
                          <Text style={styles.fieldValue}>
                            {renderFieldValue(field, fieldValues[field.id])}
                          </Text>
                        </View>
                      ))
                    : Object.entries(fieldValues).map(([key, val]) => (
                        <View key={key} style={styles.fieldRow}>
                          <Text style={styles.fieldLabel}>
                            {key.replace(/([A-Z])/g, " $1").trim()}
                          </Text>
                          <Text style={styles.fieldValue}>
                            {typeof val === "object" ? JSON.stringify(val) : String(val)}
                          </Text>
                        </View>
                      ))}
                  {entry.createdByName && (
                    <View style={styles.metaRow}>
                      <Text style={styles.metaText}>
                        Created by {entry.createdByName}
                        {entry.createdAt
                          ? ` on ${formatDate(entry.createdAt)}`
                          : ""}
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            );
          })
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>Morada Site Diary</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
