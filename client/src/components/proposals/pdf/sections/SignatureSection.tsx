import { Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import { PDF_COLORS, PDF_RADIUS } from "@/components/pdf/shared/pdfTokens";
import type { Proposal, ProposalSection, ProposalAcceptance } from '@shared/schema';
import { sharedSectionStyle, SectionIntro } from './RichTextBlocks';
import { PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";

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
  showFooter?: boolean;
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
  showFooter,
}: SignatureSectionProps) {
  const resolvedColor = brandColor ?? primaryColor;
  const isS2 = documentStyle === 'style2';

  const styles = StyleSheet.create({
    signatureCard: {
      borderWidth: 1,
      borderColor: PDF_COLORS.border,
      borderRadius: PDF_RADIUS.lg,
      backgroundColor: PDF_COLORS.surfaceSubtle,
      paddingHorizontal: 18,
      paddingTop: 18,
      paddingBottom: 12,
      marginTop: 10,
    },
    row: { marginTop: 24, flexDirection: 'row', gap: 32 },
    box: {
      flex: 1,
      padding: 12,
      backgroundColor: isS2 ? resolvedColor + '0a' : 'transparent',
      // react-pdf throws on a numeric 0 radius — omit it instead
      borderRadius: isS2 ? 4 : undefined,
    },
    line: {
      borderBottom: `${isS2 ? 2 : 1}px solid ${resolvedColor}`,
      height: 36,
    },
    label: { fontSize: 10, marginTop: 4, color: PDF_COLORS.inkMuted },
    drawnSig: { height: 60, marginBottom: 4, objectFit: 'contain' },
    typedSig: {
      fontSize: 22,
      fontFamily: PDF_FONT_FAMILY, fontStyle: 'italic',
      marginBottom: 4,
      color: PDF_COLORS.ink,
    },
    acceptedLine: {
      marginTop: 12,
      fontSize: 12,
      fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
      color: PDF_COLORS.ink,
    },
    meta: { marginTop: 8, fontSize: 10, color: PDF_COLORS.inkMuted },
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
      <View style={{ paddingHorizontal: 40 }}>
        <View style={sharedSectionStyle.section}>
          <Text minPresenceAhead={60} style={[sharedSectionStyle.sectionTitle, { color: resolvedColor }]}>
            {section.name || 'Signature'}
          </Text>
          <SectionIntro section={section} />

          {/* Boxed. A pair of ruled lines floating on the page reads as an
              afterthought; the thing the client is actually asked to do
              deserves a container. wrap={false} keeps it whole — half a
              signature block across a page break is unusable. */}
          <View wrap={false} style={styles.signatureCard}>
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
          </View>

          {isAccepted && (
            <>
              <View style={styles.acceptedBadge}>
                <View style={styles.badgeDot} />
                <Text style={{ fontSize: 11, color: '#16a34a', fontFamily: PDF_FONT_FAMILY, fontWeight: 700 }}>
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
  );
}
