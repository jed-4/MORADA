import { Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { Proposal, ProposalSection, ProposalAcceptance } from '@shared/schema';
import { sharedSectionStyle } from './RichTextBlocks';
import { DocProposalInnerHeader } from '@/components/pdf/shared/DocProposalInnerHeader';
import { DocFooter } from '@/components/pdf/shared/DocFooter';

interface SignatureSectionProps {
  proposal: Proposal;
  section: ProposalSection;
  acceptance?: ProposalAcceptance | null;
  companyName?: string;
  companyPhone?: string;
  logoUrl?: string;
  primaryColor?: string;
  brandColor?: string;
  documentStyle?: 'style1' | 'style2';
}

export function SignatureSection({
  proposal,
  section,
  acceptance,
  companyName,
  companyPhone,
  logoUrl,
  primaryColor = '#3B82F6',
  brandColor,
  documentStyle = 'style1',
}: SignatureSectionProps) {
  const resolvedColor = brandColor ?? primaryColor;
  const isS2 = documentStyle === 'style2';

  const styles = StyleSheet.create({
    row: { marginTop: 24, flexDirection: 'row', gap: 32 },
    box: {
      flex: 1,
      padding: 12,
      backgroundColor: isS2 ? resolvedColor + '0a' : 'transparent',
      borderRadius: isS2 ? 4 : 0,
    },
    line: {
      borderBottom: `${isS2 ? 2 : 1}px solid ${resolvedColor}`,
      height: 36,
    },
    label: { fontSize: 10, marginTop: 4, color: '#6B7280' },
    drawnSig: { height: 60, marginBottom: 4, objectFit: 'contain' },
    typedSig: {
      fontSize: 22,
      fontFamily: 'Helvetica-Oblique',
      marginBottom: 4,
      color: '#1F2937',
    },
    acceptedLine: {
      marginTop: 12,
      fontSize: 12,
      fontFamily: 'Helvetica-Bold',
      color: '#1F2937',
    },
    meta: { marginTop: 8, fontSize: 10, color: '#374151' },
    metaLine: { marginBottom: 2 },
    acceptedBadge: {
      marginTop: 16,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    badgeDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#22c55e',
    },
  });

  const isAccepted = acceptance && acceptance.status === 'accepted';
  const sigData = acceptance?.signature || '';
  const isImage = !!sigData && sigData.startsWith('data:image');

  return (
    <Page
      size="A4"
      style={{ paddingBottom: 60, fontFamily: 'Helvetica', backgroundColor: '#ffffff' }}
    >
      <DocProposalInnerHeader
        companyName={companyName}
        companyPhone={companyPhone}
        logoUrl={logoUrl}
        proposalNumber={proposal.proposalNumber}
        proposalName={proposal.name}
        brandColor={resolvedColor}
        docStyle={documentStyle}
      />
      <View style={{ paddingHorizontal: 40 }}>
        <View style={sharedSectionStyle.section}>
          <Text style={[sharedSectionStyle.sectionTitle, { color: resolvedColor }]}>
            {section.name || 'Signature'}
          </Text>

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
            <>
              <View style={styles.acceptedBadge}>
                <View style={styles.badgeDot} />
                <Text style={{ fontSize: 11, color: '#16a34a', fontFamily: 'Helvetica-Bold' }}>
                  Proposal Accepted
                </Text>
              </View>
              {(acceptance?.signedByName || acceptance?.signedAt) && (
                <Text style={styles.acceptedLine}>
                  {`Accepted by ${acceptance?.signedByName || 'client'}${
                    acceptance?.signedAt
                      ? ` on ${new Date(acceptance.signedAt).toLocaleDateString()}`
                      : ''
                  }`}
                </Text>
              )}
              <View style={styles.meta}>
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
            </>
          )}
        </View>
      </View>
      <DocFooter
        companyName={companyName}
        brandColor={resolvedColor}
        docStyle={documentStyle}
      />
    </Page>
  );
}
