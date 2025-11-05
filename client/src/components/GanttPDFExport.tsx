import { Document, Page, Text, View, StyleSheet, pdf } from '@react-pdf/renderer';
import { format } from 'date-fns';
import type { GanttStage, GanttSubtask } from '@shared/schema';

// PDF Styles matching Gantt design
const styles = StyleSheet.create({
  page: {
    padding: 30,
    fontSize: 10,
    fontFamily: 'Helvetica',
  },
  title: {
    fontSize: 24,
    marginBottom: 20,
    fontFamily: 'Helvetica-Bold',
  },
  header: {
    flexDirection: 'row',
    borderBottomWidth: 2,
    borderBottomColor: '#bba7db',
    paddingBottom: 10,
    marginBottom: 15,
  },
  headerCell: {
    fontSize: 11,
    fontFamily: 'Helvetica-Bold',
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  stageRow: {
    backgroundColor: '#f8f4ff',
    paddingVertical: 10,
    borderRadius: 4,
    marginBottom: 5,
  },
  subtaskRow: {
    paddingLeft: 20,
    paddingVertical: 6,
  },
  nameCell: {
    width: '40%',
    fontSize: 10,
  },
  stageName: {
    fontFamily: 'Helvetica-Bold',
    fontSize: 11,
  },
  dateCell: {
    width: '25%',
    fontSize: 9,
  },
  statusCell: {
    width: '20%',
    fontSize: 9,
  },
  assignedCell: {
    width: '15%',
    fontSize: 9,
  },
  badge: {
    backgroundColor: '#bba7db',
    color: '#ffffff',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
    fontSize: 8,
    display: 'inline-block',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    textAlign: 'center',
    fontSize: 8,
    color: '#6b7280',
  },
});

interface GanttPDFProps {
  stages: GanttStage[];
  subtasksByStage: Record<string, GanttSubtask[]>;
  projectName?: string;
}

// PDF Document Component
const GanttPDFDocument = ({ stages, subtasksByStage, projectName }: GanttPDFProps) => (
  <Document>
    <Page size="A4" orientation="landscape" style={styles.page}>
      <Text style={styles.title}>Gantt Chart - {projectName || 'Project Timeline'}</Text>
      <Text style={{ fontSize: 9, color: '#6b7280', marginBottom: 20 }}>
        Generated on {format(new Date(), 'MMMM dd, yyyy')}
      </Text>

      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.headerCell, styles.nameCell]}>Stage / Task</Text>
        <Text style={[styles.headerCell, styles.dateCell]}>Start Date</Text>
        <Text style={[styles.headerCell, styles.dateCell]}>End Date</Text>
        <Text style={[styles.headerCell, styles.statusCell]}>Duration</Text>
        <Text style={[styles.headerCell, styles.assignedCell]}>Assigned</Text>
      </View>

      {/* Stages and Subtasks */}
      {stages.map((stage) => {
        const subtasks = subtasksByStage[stage.id] || [];
        const startDate = new Date(stage.startDate);
        const endDate = new Date(stage.endDate);
        const duration = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));

        return (
          <View key={stage.id}>
            {/* Stage Row */}
            <View style={[styles.row, styles.stageRow]}>
              <Text style={[styles.nameCell, styles.stageName]}>{stage.name}</Text>
              <Text style={styles.dateCell}>{format(startDate, 'MMM dd, yyyy')}</Text>
              <Text style={styles.dateCell}>{format(endDate, 'MMM dd, yyyy')}</Text>
              <Text style={styles.statusCell}>{duration} days</Text>
              <Text style={styles.assignedCell}>{stage.foremanName || '-'}</Text>
            </View>

            {/* Subtasks */}
            {subtasks.map((subtask) => {
              const subStart = new Date(subtask.startDate);
              const subEnd = new Date(subtask.endDate);
              const subDuration = Math.ceil((subEnd.getTime() - subStart.getTime()) / (1000 * 60 * 60 * 24));

              return (
                <View key={subtask.id} style={[styles.row, styles.subtaskRow]}>
                  <Text style={styles.nameCell}>↳ {subtask.name}</Text>
                  <Text style={styles.dateCell}>{format(subStart, 'MMM dd, yyyy')}</Text>
                  <Text style={styles.dateCell}>{format(subEnd, 'MMM dd, yyyy')}</Text>
                  <Text style={styles.statusCell}>{subDuration} days</Text>
                  <Text style={styles.assignedCell}>{subtask.assignedToName || '-'}</Text>
                </View>
              );
            })}
          </View>
        );
      })}

      {/* Footer */}
      <Text style={styles.footer}>
        BuildPro - Project Management Software | Page 1 of 1
      </Text>
    </Page>
  </Document>
);

// Export function
export const exportGanttToPDF = async (
  stages: GanttStage[],
  subtasksByStage: Record<string, GanttSubtask[]>,
  projectName?: string
) => {
  const blob = await pdf(
    <GanttPDFDocument 
      stages={stages} 
      subtasksByStage={subtasksByStage} 
      projectName={projectName}
    />
  ).toBlob();

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `gantt-chart-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
  link.click();
  URL.revokeObjectURL(url);
};
