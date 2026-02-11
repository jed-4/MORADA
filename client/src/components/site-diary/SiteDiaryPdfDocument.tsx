import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { SiteDiaryEntry, SiteDiaryTemplate, TemplateFieldDefinition } from "@shared/schema";

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 10,
    fontFamily: "Helvetica",
  },
  header: {
    marginBottom: 20,
    borderBottom: "2 solid #bba7db",
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontFamily: "Helvetica-Bold",
    color: "#1a1a2e",
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 11,
    color: "#666666",
  },
  entryCard: {
    marginBottom: 14,
    border: "1 solid #e2e8f0",
    borderRadius: 4,
    overflow: "hidden",
  },
  entryHeader: {
    backgroundColor: "#f8f6fc",
    padding: 8,
    borderBottom: "1 solid #e2e8f0",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  entryTitle: {
    fontSize: 11,
    fontFamily: "Helvetica-Bold",
    color: "#1a1a2e",
    flex: 1,
  },
  entryDate: {
    fontSize: 9,
    color: "#666666",
  },
  templateBadge: {
    fontSize: 8,
    color: "#7c5bb0",
    backgroundColor: "#f0ebf7",
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
    borderBottom: "0.5 solid #f1f5f9",
  },
  fieldLabel: {
    width: "30%",
    fontSize: 9,
    fontFamily: "Helvetica-Bold",
    color: "#64748b",
  },
  fieldValue: {
    width: "70%",
    fontSize: 9,
    color: "#334155",
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: "0.5 solid #e2e8f0",
    paddingTop: 6,
    marginTop: 4,
  },
  metaText: {
    fontSize: 8,
    color: "#94a3b8",
  },
  footer: {
    position: "absolute",
    bottom: 30,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTop: "0.5 solid #e2e8f0",
    paddingTop: 6,
  },
  footerText: {
    fontSize: 7,
    color: "#94a3b8",
  },
  noEntries: {
    textAlign: "center",
    color: "#94a3b8",
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
          <Text style={styles.footerText}>BuildPro Site Diary</Text>
          <Text
            style={styles.footerText}
            render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
          />
        </View>
      </Page>
    </Document>
  );
}
