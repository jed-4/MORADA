import { Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { PDF_COLORS } from "@/components/pdf/shared/pdfTokens";

const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: PDF_COLORS.surface,
  },
  logoContainer: {
    marginBottom: 60,
  },
  logo: {
    width: 200,
    height: 80,
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: 40,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: PDF_COLORS.ink,
    marginBottom: 20,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 18,
    color: PDF_COLORS.inkMuted,
    marginBottom: 10,
    textAlign: 'center',
  },
  divider: {
    width: 100,
    height: 3,
    backgroundColor: '#3B82F6',
    marginVertical: 30,
  },
  infoContainer: {
    marginTop: 60,
    alignItems: 'center',
  },
  infoText: {
    fontSize: 14,
    color: PDF_COLORS.inkMuted,
    marginBottom: 8,
    textAlign: 'center',
  },
});

interface CoverPageProps {
  companyLogo?: string;
  proposalName: string;
  proposalNumber: string;
  clientName?: string;
  projectName?: string;
  date: string;
  expiryDate?: string;
  primaryColor?: string;
}

export function CoverPage({
  companyLogo,
  proposalName,
  proposalNumber,
  clientName,
  projectName,
  date,
  expiryDate,
  primaryColor = '#3B82F6',
}: CoverPageProps) {
  return (
    <Page size="A4" style={styles.page}>
      {companyLogo && (
        <View style={styles.logoContainer}>
          <Image src={companyLogo} style={styles.logo} />
        </View>
      )}

      <View style={styles.titleContainer}>
        <Text style={styles.title}>{proposalName}</Text>
        {projectName && (
          <Text style={styles.subtitle}>{projectName}</Text>
        )}
      </View>

      <View style={[styles.divider, { backgroundColor: primaryColor }]} />

      <View style={styles.infoContainer}>
        <Text style={styles.infoText}>Proposal #{proposalNumber}</Text>
        {clientName && (
          <Text style={styles.infoText}>Prepared for: {clientName}</Text>
        )}
        <Text style={styles.infoText}>Date: {date}</Text>
        {expiryDate && (
          <Text style={styles.infoText}>Valid until: {expiryDate}</Text>
        )}
      </View>
    </Page>
  );
}
