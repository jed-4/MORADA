import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { Proposal, ProposalSection, Project, Estimate, EstimateGroup, EstimateItem, ProposalPaymentMilestone } from '@shared/schema';
import { CoverPageSection } from './sections/CoverPageSection';
import { EstimateSection } from './sections/EstimateSection';

// Convert basic Tiptap/HTML to ordered blocks renderable in @react-pdf/renderer
type RenderBlock = { type: 'p' | 'h1' | 'h2' | 'h3' | 'li' | 'ol-li'; text: string };
function htmlToBlocks(html: string): RenderBlock[] {
  if (!html) return [];
  // If no HTML tags present, treat as plain text with blank-line paragraphs
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html.split(/\n{2,}/).map((t) => ({ type: 'p', text: t.trim() })).filter(b => b.text.length > 0);
  }
  const blocks: RenderBlock[] = [];
  // Normalize <br> -> \n and strip styling/script tags
  const cleaned = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/(p|div|h[1-6]|li)\s*>/gi, '__BLOCK__')
    .replace(/<\s*(p|div|h[1-6]|li|ul|ol)[^>]*>/gi, (_m, tag) => `__OPEN_${tag.toLowerCase()}__`)
    .replace(/<[^>]+>/g, '') // strip remaining tags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const segments = cleaned.split('__BLOCK__');
  let inOl = false;
  for (const seg of segments) {
    let typ: RenderBlock['type'] = 'p';
    let text = seg;
    const m = text.match(/__OPEN_(p|div|h1|h2|h3|h4|h5|h6|li|ul|ol)__/);
    if (m) {
      const tag = m[1];
      if (tag === 'ol') inOl = true;
      else if (tag === 'ul') inOl = false;
      else if (tag === 'h1') typ = 'h1';
      else if (tag === 'h2') typ = 'h2';
      else if (tag.startsWith('h')) typ = 'h3';
      else if (tag === 'li') typ = inOl ? 'ol-li' : 'li';
    }
    text = text.replace(/__OPEN_[a-z0-9]+__/g, '').trim();
    if (text) blocks.push({ type: typ, text });
  }
  return blocks;
}

const createStyles = (primaryColor: string = '#3B82F6') => StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  header: {
    marginBottom: 20,
    paddingBottom: 10,
    borderBottom: `2px solid ${primaryColor}`,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#1F2937',
  },
  subtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 5,
  },
  section: {
    marginTop: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#1F2937',
  },
  text: {
    fontSize: 11,
    lineHeight: 1.5,
    color: '#374151',
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 40,
    right: 40,
    paddingTop: 10,
    borderTop: `1px solid ${primaryColor}`,
    fontSize: 9,
    color: primaryColor,
    opacity: 0.6,
  },
});

interface ProposalDocumentProps {
  proposal: Proposal;
  sections: ProposalSection[];
  project?: Project;
  companyLogo?: string;
  companyName?: string;
  primaryColor?: string;
  estimatesData?: Record<string, {
    estimate: Estimate;
    groups: EstimateGroup[];
    items: EstimateItem[];
  }>;
  milestones?: ProposalPaymentMilestone[];
}

export function ProposalDocument({
  proposal,
  sections,
  project,
  companyLogo,
  companyName,
  primaryColor = '#3B82F6',
  estimatesData = {},
  milestones = [],
}: ProposalDocumentProps) {
  // Create styles with the custom color
  const styles = createStyles(primaryColor);
  
  // Filter out disabled sections and sort by order
  const enabledSections = sections.filter(s => s.isEnabled !== false);
  const sortedSections = [...enabledSections].sort((a, b) => a.order - b.order);

  return (
    <Document>
      {/* Render all sections in order */}
      {sortedSections.map((section) => {
        // Render cover page separately
        if (section.sectionType === 'cover_page') {
          return (
            <CoverPageSection
              key={section.id}
              proposal={proposal}
              section={section}
              project={project}
              companyLogo={companyLogo}
              companyName={companyName}
              primaryColor={primaryColor}
            />
          );
        }

        // Render estimate section
        if (section.sectionType === 'estimate') {
          const content = section.content as Record<string, any> || {};
          const estimateId = content.estimateId;
          const estimateData = estimateId ? estimatesData[estimateId] : undefined;
          
          if (!estimateData) {
            return null; // Skip if no estimate selected or data not loaded
          }

          return (
            <EstimateSection
              key={section.id}
              section={section}
              estimateData={estimateData}
              companyLogo={companyLogo}
              companyName={companyName}
              primaryColor={primaryColor}
              proposalName={proposal.name}
              proposalNumber={proposal.proposalNumber}
              expiryDate={proposal.expiryDate}
            />
          );
        }

        // Render text-based sections (with HTML→blocks support)
        const content = section.content as Record<string, any> || {};

        // Pull HTML/text body keyed by type
        let bodyHtml = '';
        switch (section.sectionType) {
          case 'cover_letter': bodyHtml = content.letterText || ''; break;
          case 'closing_letter': bodyHtml = content.closingText || ''; break;
          case 'summary': bodyHtml = content.summaryText || ''; break;
          case 'terms_conditions': bodyHtml = content.termsText || ''; break;
          case 'custom': bodyHtml = content.customText || ''; break;
          default: bodyHtml = section.description || '';
        }

        // Special-case sections that aren't pure text
        const isPaymentSchedule = section.sectionType === 'payment_schedule';
        const isSignature = section.sectionType === 'signature';
        const isAllowances = section.sectionType === 'allowances';
        const isAttachments = section.sectionType === 'attachments';

        const blocks = htmlToBlocks(bodyHtml);
        if (!isPaymentSchedule && !isSignature && !isAllowances && !isAttachments && blocks.length === 0) {
          return null;
        }

        return (
          <Page key={section.id} size="A4" style={styles.page}>
            {/* Header */}
            <View style={styles.header}>
              {companyLogo && (
                <Image
                  src={companyLogo}
                  style={{ width: 120, height: 40, marginBottom: 10 }}
                />
              )}
              <Text style={styles.title}>{proposal.name}</Text>
              <Text style={styles.subtitle}>Proposal #{proposal.proposalNumber}</Text>
              {proposal.expiryDate && (
                <Text style={styles.subtitle}>
                  Valid until: {new Date(proposal.expiryDate).toLocaleDateString()}
                </Text>
              )}
            </View>

            {/* Section content */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{section.name || 'Untitled Section'}</Text>

              {blocks.length > 0 && blocks.map((b, i) => {
                if (b.type === 'h1') return <Text key={i} style={{ fontSize: 18, fontWeight: 'bold', marginTop: 8, marginBottom: 6, color: '#1F2937' }}>{b.text}</Text>;
                if (b.type === 'h2') return <Text key={i} style={{ fontSize: 15, fontWeight: 'bold', marginTop: 8, marginBottom: 4, color: '#1F2937' }}>{b.text}</Text>;
                if (b.type === 'h3') return <Text key={i} style={{ fontSize: 13, fontWeight: 'bold', marginTop: 6, marginBottom: 4, color: '#1F2937' }}>{b.text}</Text>;
                if (b.type === 'li') return <Text key={i} style={{ ...styles.text, marginLeft: 12 }}>• {b.text}</Text>;
                if (b.type === 'ol-li') return <Text key={i} style={{ ...styles.text, marginLeft: 12 }}>{`${i + 1}. ${b.text}`}</Text>;
                return <Text key={i} style={{ ...styles.text, marginBottom: 6 }}>{b.text}</Text>;
              })}

              {isPaymentSchedule && (
                <View style={{ marginTop: 8 }}>
                  <View style={{ flexDirection: 'row', borderBottom: `1px solid ${primaryColor}`, paddingBottom: 4, marginBottom: 4 }}>
                    <Text style={{ flex: 2, fontWeight: 'bold', fontSize: 11 }}>Milestone</Text>
                    <Text style={{ flex: 1, fontWeight: 'bold', fontSize: 11, textAlign: 'right' }}>%</Text>
                    <Text style={{ flex: 1, fontWeight: 'bold', fontSize: 11, textAlign: 'right' }}>Amount</Text>
                  </View>
                  {milestones.length === 0 ? (
                    <Text style={{ ...styles.text, fontStyle: 'italic', color: '#6B7280' }}>No payment milestones defined.</Text>
                  ) : milestones.map((m) => (
                    <View key={m.id} style={{ flexDirection: 'row', paddingVertical: 3 }}>
                      <Text style={{ flex: 2, fontSize: 11 }}>{m.name}</Text>
                      <Text style={{ flex: 1, fontSize: 11, textAlign: 'right' }}>{m.percentage != null ? `${Number(m.percentage).toFixed(2)}%` : '—'}</Text>
                      <Text style={{ flex: 1, fontSize: 11, textAlign: 'right' }}>{m.amountCents != null ? `$${(Number(m.amountCents) / 100).toFixed(2)}` : '—'}</Text>
                    </View>
                  ))}
                </View>
              )}

              {isSignature && (
                <View style={{ marginTop: 32, flexDirection: 'row', gap: 32 }}>
                  <View style={{ flex: 1 }}>
                    <View style={{ borderBottom: '1px solid #1F2937', height: 36 }} />
                    <Text style={{ fontSize: 10, marginTop: 4, color: '#6B7280' }}>Client Signature</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ borderBottom: '1px solid #1F2937', height: 36 }} />
                    <Text style={{ fontSize: 10, marginTop: 4, color: '#6B7280' }}>Date</Text>
                  </View>
                </View>
              )}

              {isAllowances && (
                <Text style={{ ...styles.text, fontStyle: 'italic', color: '#6B7280' }}>
                  Allowances are calculated from the linked estimate(s).
                </Text>
              )}

              {isAttachments && (
                <Text style={{ ...styles.text, fontStyle: 'italic', color: '#6B7280' }}>
                  Attachments will be included with the digital delivery.
                </Text>
              )}
            </View>

            {/* Footer */}
            <View style={styles.footer}>
              <Text>{companyName || 'Company Name'}</Text>
            </View>
          </Page>
        );
      })}
    </Document>
  );
}
