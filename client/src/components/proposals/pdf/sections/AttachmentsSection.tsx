import { Page, Text, View, StyleSheet, Link } from '@react-pdf/renderer';
import type { Proposal, ProposalSection } from '@shared/schema';
import { RichTextBlocks, sharedSectionStyle } from './RichTextBlocks';
import { DocProposalInnerHeader } from '@/components/pdf/shared/DocProposalInnerHeader';
import { DocFooter } from '@/components/pdf/shared/DocFooter';

interface AttachmentRow {
  name?: string;
  url?: string;
  type?: string;
  size?: number | string;
}

interface AttachmentsSectionProps {
  proposal: Proposal;
  section: ProposalSection;
  companyName?: string;
  companyPhone?: string;
  logoUrl?: string;
  primaryColor?: string;
  brandColor?: string;
  documentStyle?: 'style1' | 'style2';
}

export function AttachmentsSection({
  proposal,
  section,
  companyName,
  companyPhone,
  logoUrl,
  primaryColor = '#3B82F6',
  brandColor,
  documentStyle = 'style1',
}: AttachmentsSectionProps) {
  const resolvedColor = brandColor ?? primaryColor;
  const content = (section.content as Record<string, unknown>) || {};
  const introHtml = (content.attachmentsText as string) || (content.introText as string) || '';
  const rawList = (content.attachments as AttachmentRow[] | undefined) || [];
  const rows = Array.isArray(rawList) ? rawList.filter(Boolean) : [];

  const styles = StyleSheet.create({
    table: { marginTop: 12, borderTop: `1px solid ${resolvedColor}`, opacity: 1 },
    row: { flexDirection: 'row', paddingVertical: 6, borderBottom: '1px solid #E5E7EB' },
    headerRow: {
      flexDirection: 'row',
      paddingVertical: 6,
      borderBottom: `1px solid ${resolvedColor}`,
    },
    cellName: { flex: 3, fontSize: 11, color: '#1F2937' },
    cellType: { flex: 1, fontSize: 11, color: '#6B7280' },
    cellLink: { flex: 3, fontSize: 10, color: resolvedColor },
    headerCell: { fontSize: 10, fontWeight: 'bold', color: '#6B7280', textTransform: 'uppercase' },
  });

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
          <Text style={sharedSectionStyle.sectionTitle}>{section.name || 'Attachments'}</Text>
          {introHtml ? <RichTextBlocks html={introHtml} /> : null}

          {rows.length === 0 ? (
            <Text style={sharedSectionStyle.muted}>No attachments included.</Text>
          ) : (
            <View style={styles.table}>
              <View style={styles.headerRow}>
                <Text style={[styles.cellName, styles.headerCell]}>Name</Text>
                <Text style={[styles.cellType, styles.headerCell]}>Type</Text>
                <Text style={[styles.cellLink, styles.headerCell]}>Link</Text>
              </View>
              {rows.map((row, i) => {
                const name = row.name || row.url?.split('/').pop() || `Attachment ${i + 1}`;
                const type = row.type || '';
                const url = row.url || '';
                return (
                  <View style={styles.row} key={`${name}-${i}`}>
                    <Text style={styles.cellName}>{name}</Text>
                    <Text style={styles.cellType}>{type}</Text>
                    <View style={styles.cellLink}>
                      {url ? <Link src={url}>{url}</Link> : <Text>—</Text>}
                    </View>
                  </View>
                );
              })}
            </View>
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
