import { Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { Proposal, ProposalSection, ProposalAcceptance } from '@shared/schema';
import { PageHeader, PageFooter, sharedPageStyle, sharedSectionStyle } from './RichTextBlocks';

interface SignatureSectionProps {
  proposal: Proposal;
  section: ProposalSection;
  acceptance?: ProposalAcceptance | null;
  companyName?: string;
  primaryColor?: string;
}

export function SignatureSection({
  proposal,
  section,
  acceptance,
  companyName,
  primaryColor = '#3B82F6',
}: SignatureSectionProps) {
  const styles = StyleSheet.create({
    row: { marginTop: 24, flexDirection: 'row', gap: 32 },
    box: { flex: 1 },
    line: { borderBottom: '1px solid #1F2937', height: 36 },
    label: { fontSize: 10, marginTop: 4, color: '#6B7280' },
    drawnSig: { height: 60, marginBottom: 4, objectFit: 'contain' },
    typedSig: { fontSize: 22, fontFamily: 'Helvetica-Oblique', marginBottom: 4, color: '#1F2937' },
    meta: { marginTop: 16, fontSize: 10, color: '#374151' },
    metaLine: { marginBottom: 2 },
  });

  const isAccepted = acceptance && acceptance.status === 'accepted';
  const sigData = acceptance?.signature || '';
  const isImage = !!sigData && sigData.startsWith('data:image');

  return (
    <Page size="A4" style={sharedPageStyle}>
      <PageHeader
        proposalName={proposal.name}
        proposalNumber={proposal.proposalNumber}
        expiryDate={proposal.expiryDate}
        primaryColor={primaryColor}
      />
      <View style={sharedSectionStyle.section}>
        <Text style={sharedSectionStyle.sectionTitle}>{section.name || 'Signature'}</Text>

        <View style={styles.row}>
          <View style={styles.box}>
            {isAccepted && sigData ? (
              isImage ? (
                <Image src={sigData} style={styles.drawnSig} />
              ) : (
                <Text style={styles.typedSig}>{sigData}</Text>
              )
            ) : (
              <View style={styles.line} />
            )}
            <Text style={styles.label}>Client Signature</Text>
          </View>
          <View style={styles.box}>
            {isAccepted && acceptance?.signedAt ? (
              <Text style={[sharedSectionStyle.text, { paddingBottom: 8 }]}>
                {new Date(acceptance.signedAt).toLocaleDateString()}
              </Text>
            ) : (
              <View style={styles.line} />
            )}
            <Text style={styles.label}>Date</Text>
          </View>
        </View>

        {isAccepted && (
          <View style={styles.meta}>
            {acceptance?.signedByName && (
              <Text style={styles.metaLine}>Name: {acceptance.signedByName}</Text>
            )}
            {acceptance?.signedByEmail && (
              <Text style={styles.metaLine}>Email: {acceptance.signedByEmail}</Text>
            )}
            {acceptance?.signatureMethod && (
              <Text style={styles.metaLine}>Method: {acceptance.signatureMethod}</Text>
            )}
            {acceptance?.ipAddress && (
              <Text style={styles.metaLine}>IP: {acceptance.ipAddress}</Text>
            )}
          </View>
        )}
      </View>
      <PageFooter companyName={companyName} primaryColor={primaryColor} />
    </Page>
  );
}
