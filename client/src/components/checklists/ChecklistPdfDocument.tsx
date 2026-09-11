import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ChecklistInstance, ChecklistInstanceItem } from "@shared/schema";
import { registerPdfFonts, PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";
import { PDF_COLORS } from "@/components/pdf/shared/pdfTokens";

registerPdfFonts();

/** The app's positive accent, deepened so a white tick stays legible on the
 *  fill. Was Tailwind's green-500, which appears nowhere else in Morada. */
const PDF_DONE = "#3F7D5C";

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
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    fontSize: 9,
    color: PDF_COLORS.inkFaint,
  },
  groupHeader: {
    backgroundColor: PDF_COLORS.surfaceSubtle,
    padding: 8,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 3,
    borderLeft: `3 solid ${PDF_PRIMARY}`,
  },
  groupTitle: {
    fontSize: 12,
    fontFamily: PDF_FONT_FAMILY, fontWeight: 600,
    color: PDF_COLORS.ink,
  },
  groupAssignee: {
    fontSize: 8,
    color: PDF_COLORS.inkFaint,
    marginTop: 2,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 6,
    paddingLeft: 16,
    borderBottom: `0.5 solid ${PDF_COLORS.border}`,
  },
  checkbox: {
    width: 12,
    height: 12,
    border: `1 solid ${PDF_COLORS.border}`,
    borderRadius: 2,
    marginRight: 8,
    marginTop: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    width: 12,
    height: 12,
    border: `1 solid ${PDF_DONE}`,
    backgroundColor: PDF_DONE,
    borderRadius: 2,
    marginRight: 8,
    marginTop: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxNA: {
    width: 12,
    height: 12,
    border: `1 solid ${PDF_COLORS.inkFaint}`,
    backgroundColor: PDF_COLORS.surfaceMuted,
    borderRadius: 2,
    marginRight: 8,
    marginTop: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  checkmark: {
    fontSize: 8,
    color: "#ffffff",
    fontFamily: PDF_FONT_FAMILY, fontWeight: 600,
  },
  naText: {
    fontSize: 7,
    color: PDF_COLORS.inkMuted,
    fontFamily: PDF_FONT_FAMILY, fontWeight: 600,
  },
  itemContent: {
    flex: 1,
  },
  itemDescription: {
    fontSize: 10,
    color: PDF_COLORS.ink,
  },
  itemDescriptionCompleted: {
    fontSize: 10,
    color: PDF_COLORS.inkFaint,
    textDecoration: "line-through",
  },
  itemMeta: {
    flexDirection: "row",
    gap: 12,
    marginTop: 2,
    fontSize: 8,
    color: PDF_COLORS.inkFaint,
  },
  itemNotes: {
    fontSize: 8,
    color: PDF_COLORS.inkMuted,
    marginTop: 3,
    paddingLeft: 4,
    borderLeft: `1 solid ${PDF_COLORS.border}`,
  },
  summary: {
    marginTop: 20,
    padding: 12,
    backgroundColor: PDF_COLORS.surfaceSubtle,
    borderRadius: 4,
  },
  summaryTitle: {
    fontSize: 12,
    fontFamily: PDF_FONT_FAMILY, fontWeight: 600,
    color: PDF_COLORS.ink,
    marginBottom: 6,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 2,
    fontSize: 10,
  },
  progressBar: {
    height: 6,
    backgroundColor: PDF_COLORS.border,
    borderRadius: 3,
    marginTop: 6,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    backgroundColor: PDF_PRIMARY,
    borderRadius: 3,
  },
  footer: {
    position: "absolute",
    bottom: 20,
    left: 40,
    right: 40,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: PDF_COLORS.inkFaint,
  },
});

interface GroupData {
  id: string;
  name: string;
  assigneeName?: string;
  items: (ChecklistInstanceItem & { assigneeName?: string; completedByName?: string })[];
}

interface ChecklistPdfProps {
  checklist: ChecklistInstance;
  groups: GroupData[];
  projectName?: string;
  exportDate: string;
}

export function ChecklistPdfDocument({ checklist, groups, projectName, exportDate }: ChecklistPdfProps) {
  const allItems = groups.flatMap(g => g.items);
  const totalItems = allItems.length;
  const completedItems = allItems.filter(i => i.status === "completed").length;
  const naItems = allItems.filter(i => i.status === "na").length;
  const pendingItems = totalItems - completedItems - naItems;
  const progressPct = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.title}>{checklist.name}</Text>
          {projectName && <Text style={styles.subtitle}>{projectName}</Text>}
          <View style={styles.meta}>
            <Text>Priority: {(checklist.priority || "medium").charAt(0).toUpperCase() + (checklist.priority || "medium").slice(1)}</Text>
            <Text>Status: {checklist.status === "completed" ? "Completed" : checklist.status === "in_progress" ? "In Progress" : "Not Started"}</Text>
            <Text>Exported: {exportDate}</Text>
          </View>
        </View>

        <View style={styles.summary}>
          <Text style={styles.summaryTitle}>Summary</Text>
          <View style={styles.summaryRow}>
            <Text>Total Items: {totalItems}</Text>
            <Text>Completed: {completedItems}</Text>
            <Text>N/A: {naItems}</Text>
            <Text>Pending: {pendingItems}</Text>
          </View>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${progressPct}%` }]} />
          </View>
          <Text style={{ fontSize: 8, color: PDF_COLORS.inkFaint, marginTop: 3, textAlign: "right" }}>{progressPct}% complete</Text>
        </View>

        {groups.map((group) => (
          <View key={group.id} wrap={false}>
            <View style={styles.groupHeader}>
              <Text style={styles.groupTitle}>{group.name}</Text>
              {group.assigneeName && (
                <Text style={styles.groupAssignee}>Assigned to: {group.assigneeName}</Text>
              )}
            </View>
            {group.items.map((item) => (
              <View key={item.id} style={styles.itemRow}>
                {item.status === "completed" ? (
                  <View style={styles.checkboxChecked}>
                    <Text style={styles.checkmark}>✓</Text>
                  </View>
                ) : item.status === "na" ? (
                  <View style={styles.checkboxNA}>
                    <Text style={styles.naText}>NA</Text>
                  </View>
                ) : (
                  <View style={styles.checkbox} />
                )}
                <View style={styles.itemContent}>
                  <Text style={item.status === "completed" ? styles.itemDescriptionCompleted : styles.itemDescription}>
                    {item.description}
                  </Text>
                  <View style={styles.itemMeta}>
                    {item.assigneeName && <Text>Assigned: {item.assigneeName}</Text>}
                    {item.status === "completed" && item.completedByName && (
                      <Text>Completed by: {item.completedByName}</Text>
                    )}
                    {item.dueDate && <Text>Due: {new Date(item.dueDate).toLocaleDateString()}</Text>}
                  </View>
                  {item.notes && (
                    <Text style={styles.itemNotes}>{item.notes}</Text>
                  )}
                </View>
              </View>
            ))}
          </View>
        ))}

        <View style={styles.footer} fixed>
          <Text>Morada - Checklist Report</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
