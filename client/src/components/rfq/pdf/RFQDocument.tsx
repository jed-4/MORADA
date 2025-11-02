import { Document, Page, Text, View, StyleSheet, Image, Link } from '@react-pdf/renderer';
import type { Rfq, RfqItem } from '@shared/schema';

const createStyles = (primaryColor: string = '#3B82F6') => StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  header: {
    marginBottom: 30,
    paddingBottom: 15,
    borderBottom: `2px solid ${primaryColor}`,
  },
  logo: {
    width: 120,
    height: 40,
    marginBottom: 15,
    objectFit: 'contain',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#1F2937',
  },
  subtitle: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  infoGrid: {
    flexDirection: 'row',
    marginTop: 15,
    gap: 40,
  },
  infoColumn: {
    flex: 1,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  infoLabel: {
    fontSize: 10,
    color: '#6B7280',
    width: 100,
    fontWeight: 'bold',
  },
  infoValue: {
    fontSize: 10,
    color: '#1F2937',
    flex: 1,
  },
  section: {
    marginTop: 25,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#1F2937',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  scopeBox: {
    padding: 15,
    backgroundColor: '#F9FAFB',
    borderRadius: 4,
    border: '1px solid #E5E7EB',
  },
  scopeText: {
    fontSize: 10,
    lineHeight: 1.6,
    color: '#374151',
  },
  table: {
    marginTop: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: primaryColor,
    padding: 8,
    fontWeight: 'bold',
  },
  tableHeaderText: {
    fontSize: 10,
    color: '#ffffff',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1px solid #E5E7EB',
    padding: 8,
  },
  tableRowAlt: {
    backgroundColor: '#F9FAFB',
  },
  tableCell: {
    fontSize: 10,
    color: '#374151',
  },
  colDescription: {
    flex: 3,
  },
  colQuantity: {
    flex: 1,
    textAlign: 'center',
  },
  colUnit: {
    flex: 1,
    textAlign: 'center',
  },
  colNotes: {
    flex: 2,
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    paddingTop: 15,
    borderTop: `1px solid ${primaryColor}`,
  },
  footerText: {
    fontSize: 9,
    color: '#6B7280',
    textAlign: 'center',
    marginBottom: 8,
  },
  confirmButton: {
    backgroundColor: primaryColor,
    padding: 10,
    borderRadius: 4,
    textAlign: 'center',
    marginTop: 10,
  },
  confirmButtonText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: 'bold',
  },
});

interface RFQDocumentProps {
  rfq: Rfq;
  items: RfqItem[];
  companyLogo?: string;
  companyName?: string;
  companyEmail?: string;
  companyPhone?: string;
  primaryColor?: string;
  confirmLink?: string;
}

export function RFQDocument({
  rfq,
  items,
  companyLogo,
  companyName = 'Your Company',
  companyEmail,
  companyPhone,
  primaryColor = '#3B82F6',
  confirmLink,
}: RFQDocumentProps) {
  const styles = createStyles(primaryColor);

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return 'N/A';
    const d = typeof date === 'string' ? new Date(date) : date;
    return d.toLocaleDateString('en-AU', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  const formatQuantity = (qty: number | string | null | undefined) => {
    if (!qty) return '-';
    const num = typeof qty === 'string' ? parseFloat(qty) : qty;
    return num.toFixed(2);
  };

  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header with Logo */}
        <View style={styles.header}>
          {companyLogo && <Image src={companyLogo} style={styles.logo} />}
          <Text style={styles.title}>Request for Quote</Text>
          <Text style={styles.subtitle}>RFQ #{rfq.rfqNumber}</Text>
          
          {/* Info Grid */}
          <View style={styles.infoGrid}>
            <View style={styles.infoColumn}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Date Issued:</Text>
                <Text style={styles.infoValue}>{formatDate(rfq.createdAt)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Due Date:</Text>
                <Text style={styles.infoValue}>{formatDate(rfq.dueDate)}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Status:</Text>
                <Text style={styles.infoValue}>{rfq.status.toUpperCase()}</Text>
              </View>
            </View>
            <View style={styles.infoColumn}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Company:</Text>
                <Text style={styles.infoValue}>{companyName}</Text>
              </View>
              {companyEmail && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Email:</Text>
                  <Text style={styles.infoValue}>{companyEmail}</Text>
                </View>
              )}
              {companyPhone && (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Phone:</Text>
                  <Text style={styles.infoValue}>{companyPhone}</Text>
                </View>
              )}
            </View>
          </View>

          {/* Suppliers Section */}
          {rfq.supplierNames && rfq.supplierNames.length > 0 && (
            <View style={{ marginTop: 15, paddingTop: 15, borderTop: '1px solid #E5E7EB' }}>
              <Text style={[styles.infoLabel, { marginBottom: 6 }]}>Suppliers:</Text>
              {rfq.supplierNames.map((name, index) => (
                <Text key={index} style={[styles.infoValue, { marginBottom: 3 }]}>
                  • {name}
                </Text>
              ))}
            </View>
          )}
        </View>

        {/* Scope of Work Section */}
        {rfq.scope && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Scope of Work</Text>
            <View style={styles.scopeBox}>
              <Text style={styles.scopeText}>{rfq.scope}</Text>
            </View>
          </View>
        )}

        {/* Line Items Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Items</Text>
          <View style={styles.table}>
            {/* Table Header */}
            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderText, styles.colDescription]}>Description</Text>
              <Text style={[styles.tableHeaderText, styles.colQuantity]}>Quantity</Text>
              <Text style={[styles.tableHeaderText, styles.colUnit]}>Unit</Text>
              <Text style={[styles.tableHeaderText, styles.colNotes]}>Notes</Text>
            </View>

            {/* Table Rows */}
            {items.map((item, index) => (
              <View 
                key={item.id} 
                style={[styles.tableRow, index % 2 === 1 && styles.tableRowAlt]}
              >
                <Text style={[styles.tableCell, styles.colDescription]}>
                  {item.description}
                </Text>
                <Text style={[styles.tableCell, styles.colQuantity]}>
                  {formatQuantity(item.quantity)}
                </Text>
                <Text style={[styles.tableCell, styles.colUnit]}>
                  {item.unit || '-'}
                </Text>
                <Text style={[styles.tableCell, styles.colNotes]}>
                  {item.notes || '-'}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Footer with Confirm Link */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>
            Please review the scope and items above and provide your quote by {formatDate(rfq.dueDate)}.
          </Text>
          <Text style={styles.footerText}>
            Questions? Contact us at {companyEmail || 'info@company.com'}
          </Text>
          
          {confirmLink && (
            <Link src={confirmLink} style={styles.confirmButton}>
              <Text style={styles.confirmButtonText}>
                CONFIRM RECEIPT OF THIS RFQ
              </Text>
            </Link>
          )}
          
          <Text style={[styles.footerText, { marginTop: 15, fontSize: 8 }]}>
            Generated by BuildPro • {formatDate(new Date())}
          </Text>
        </View>
      </Page>
    </Document>
  );
}
