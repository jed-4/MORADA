import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer";
import type { ChecklistInstance, ChecklistInstanceItem } from "@shared/schema";

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
  meta: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginTop: 6,
    fontSize: 9,
    color: "#888888",
  },
  groupHeader: {
    backgroundColor: "#f8f7fa",
    padding: 8,
    marginTop: 12,
    marginBottom: 4,
    borderRadius: 3,
    borderLeft: "3 solid #bba7db",
  },
  groupTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#333333",
  },
  groupAssignee: {
    fontSize: 8,
    color: "#888888",
    marginTop: 2,
  },
  itemRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 6,
    paddingLeft: 16,
    borderBottom: "0.5 solid #f0f0f0",
  },
  checkbox: {
    width: 12,
    height: 12,
    border: "1 solid #cccccc",
    borderRadius: 2,
    marginRight: 8,
    marginTop: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    width: 12,
    height: 12,
    border: "1 solid #22c55e",
    backgroundColor: "#22c55e",
    borderRadius: 2,
    marginRight: 8,
    marginTop: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxNA: {
    width: 12,
    height: 12,
    border: "1 solid #94a3b8",
    backgroundColor: "#f1f5f9",
    borderRadius: 2,
    marginRight: 8,
    marginTop: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  checkmark: {
    fontSize: 8,
    color: "#ffffff",
    fontFamily: "Helvetica-Bold",
  },
  naText: {
    fontSize: 7,
    color: "#64748b",
    fontFamily: "Helvetica-Bold",
  },
  itemContent: {
    flex: 1,
  },
  itemDescription: {
    fontSize: 10,
    color: "#333333",
  },
  itemDescriptionCompleted: {
    fontSize: 10,
    color: "#94a3b8",
    textDecoration: "line-through",
  },
  itemMeta: {
    flexDirection: "row",
    gap: 12,
    marginTop: 2,
    fontSize: 8,
    color: "#888888",
  },
  itemNotes: {
    fontSize: 8,
    color: "#666666",
    marginTop: 3,
    paddingLeft: 4,
    borderLeft: "1 solid #e2e8f0",
  },
  summary: {
    marginTop: 20,
    padding: 12,
    backgroundColor: "#f8f7fa",
    borderRadius: 4,
  },
  summaryTitle: {
    fontSize: 12,
    fontFamily: "Helvetica-Bold",
    color: "#333333",
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
    backgroundColor: "#e2e8f0",
    borderRadius: 3,
    marginTop: 6,
    overflow: "hidden",
  },
  progressFill: {
    height: 6,
    backgroundColor: "#bba7db",
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
    color: "#aaaaaa",
  },
  priorityBadge: {
    fontSize: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    color: "#ffffff",
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

const getPriorityColor = (priority: string) => {
  switch (priority) {
    case "urgent": return "#ef4444";
    case "high": return "#f97316";
    case "medium": return "#eab308";
    case "low": return "#22c55e";
    default: return "#94a3b8";
  }
};

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
          <Text style={{ fontSize: 8, color: "#888888", marginTop: 3, textAlign: "right" }}>{progressPct}% complete</Text>
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
          <Text>BuildPro - Checklist Report</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
