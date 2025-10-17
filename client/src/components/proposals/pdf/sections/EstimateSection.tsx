import { View, Text, StyleSheet } from '@react-pdf/renderer';

const styles = StyleSheet.create({
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 15,
    color: '#1F2937',
    borderBottom: '2px solid #E5E7EB',
    paddingBottom: 5,
  },
  table: {
    width: '100%',
    marginTop: 10,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    padding: 8,
    fontWeight: 'bold',
    fontSize: 10,
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: '1px solid #E5E7EB',
    padding: 8,
    fontSize: 10,
  },
  col1: {
    width: '10%',
  },
  col2: {
    width: '40%',
  },
  col3: {
    width: '15%',
    textAlign: 'right',
  },
  col4: {
    width: '15%',
    textAlign: 'right',
  },
  col5: {
    width: '20%',
    textAlign: 'right',
  },
  subtotalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 8,
    marginTop: 10,
    fontSize: 11,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 8,
    backgroundColor: '#F3F4F6',
    fontWeight: 'bold',
    fontSize: 12,
  },
  label: {
    width: 100,
    textAlign: 'right',
    marginRight: 20,
  },
  value: {
    width: 100,
    textAlign: 'right',
  },
});

interface EstimateItem {
  code?: string;
  description: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  total: number;
}

interface EstimateSectionProps {
  title?: string;
  items: EstimateItem[];
  subtotal: number;
  gst: number;
  total: number;
  showPricing?: boolean;
}

export function EstimateSection({
  title = 'Estimate',
  items,
  subtotal,
  gst,
  total,
  showPricing = true,
}: EstimateSectionProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>

      <View style={styles.table}>
        <View style={styles.tableHeader}>
          <Text style={styles.col1}>Code</Text>
          <Text style={styles.col2}>Description</Text>
          <Text style={styles.col3}>Qty</Text>
          {showPricing && (
            <>
              <Text style={styles.col4}>Unit Price</Text>
              <Text style={styles.col5}>Total</Text>
            </>
          )}
        </View>

        {items.map((item, index) => (
          <View key={index} style={styles.tableRow}>
            <Text style={styles.col1}>{item.code || '-'}</Text>
            <Text style={styles.col2}>{item.description}</Text>
            <Text style={styles.col3}>
              {item.quantity} {item.unit || ''}
            </Text>
            {showPricing && (
              <>
                <Text style={styles.col4}>${item.unitPrice.toFixed(2)}</Text>
                <Text style={styles.col5}>${item.total.toFixed(2)}</Text>
              </>
            )}
          </View>
        ))}
      </View>

      {showPricing && (
        <>
          <View style={styles.subtotalRow}>
            <Text style={styles.label}>Subtotal:</Text>
            <Text style={styles.value}>${subtotal.toFixed(2)}</Text>
          </View>
          <View style={styles.subtotalRow}>
            <Text style={styles.label}>GST (10%):</Text>
            <Text style={styles.value}>${gst.toFixed(2)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text style={styles.label}>Total:</Text>
            <Text style={styles.value}>${total.toFixed(2)}</Text>
          </View>
        </>
      )}
    </View>
  );
}
