import { Document, Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { Proposal, ProposalSection, Project } from '@shared/schema';
import { CoverPageSection } from './sections/CoverPageSection';

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontSize: 11,
    fontFamily: 'Helvetica',
    backgroundColor: '#ffffff',
  },
  header: {
    marginBottom: 20,
    paddingBottom: 10,
    borderBottom: '2px solid #3B82F6',
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
    borderTop: '1px solid #E5E7EB',
    fontSize: 9,
    color: '#9CA3AF',
  },
});

interface ProposalDocumentProps {
  proposal: Proposal;
  sections: ProposalSection[];
  project?: Project;
  companyLogo?: string;
  companyName?: string;
  primaryColor?: string;
}

export function ProposalDocument({
  proposal,
  sections,
  project,
  companyLogo,
  companyName,
  primaryColor = '#3B82F6',
}: ProposalDocumentProps) {
  // Sort sections by order
  const sortedSections = [...sections].sort((a, b) => a.order - b.order);

  // Check if we have a cover page section
  const coverPageSection = sortedSections.find(s => s.sectionType === 'cover_page');
  const otherSections = sortedSections.filter(s => s.sectionType !== 'cover_page');

  return (
    <Document>
      {/* Render cover page as first page if it exists */}
      {coverPageSection && (
        <CoverPageSection
          proposal={proposal}
          section={coverPageSection}
          project={project}
          companyLogo={companyLogo}
          companyName={companyName}
          primaryColor={primaryColor}
        />
      )}

      {/* Render other sections on subsequent pages */}
      {otherSections.length > 0 && (
        <Page size="A4" style={styles.page}>
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

          {/* Render sections */}
          {otherSections.map((section) => (
            <View key={section.id} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.name || 'Untitled Section'}</Text>
              {section.description && section.description.trim() !== '' && (
                <Text style={styles.text}>{section.description}</Text>
              )}
            </View>
          ))}

          {/* Footer */}
          <View style={styles.footer}>
            <Text>{companyName || 'Company Name'}</Text>
            <Text>Page 1</Text>
          </View>
        </Page>
      )}
    </Document>
  );
}
