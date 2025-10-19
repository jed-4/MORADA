import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { Proposal, ProposalSection, Project, Estimate, EstimateGroup, EstimateItem } from '@shared/schema';
import { CoverPageSection } from './sections/CoverPageSection';
import { EstimateSection } from './sections/EstimateSection';

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
}

export function ProposalDocument({
  proposal,
  sections,
  project,
  companyLogo,
  companyName,
  primaryColor = '#3B82F6',
  estimatesData = {},
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

        // Render text-based sections
        const content = section.content as Record<string, any> || {};
        
        // Determine which content to display based on section type
        let mainContent = '';
        if (section.sectionType === 'cover_letter' && content.letterText) {
          mainContent = content.letterText;
        } else if (section.sectionType === 'closing_letter' && content.closingText) {
          mainContent = content.closingText;
        } else if (section.sectionType === 'summary' && content.summaryText) {
          mainContent = content.summaryText;
        } else if (section.sectionType === 'terms_conditions' && content.termsText) {
          mainContent = content.termsText;
        } else if (section.sectionType === 'custom' && content.customText) {
          mainContent = content.customText;
        } else if (section.description) {
          mainContent = section.description;
        }

        // Skip sections with no content to avoid PDF errors
        if (!mainContent || mainContent.trim() === '') {
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
              <Text style={styles.text}>{mainContent}</Text>
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
