import { Page, Text, View, StyleSheet, Image } from '@react-pdf/renderer';
import type { Proposal, ProposalSection, Project } from '@shared/schema';

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#ffffff',
    position: 'relative',
  },
  // Hero section with color overlay
  hero: {
    height: '55%',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 60,
    paddingVertical: 80,
  },
  heroOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    opacity: 0.95,
  },
  logo: {
    width: 140,
    height: 50,
    marginBottom: 40,
    objectFit: 'contain',
  },
  proposalTitle: {
    fontSize: 42,
    fontWeight: 'bold',
    color: '#ffffff',
    textAlign: 'center',
    marginBottom: 16,
    letterSpacing: -0.5,
  },
  proposalSubtitle: {
    fontSize: 18,
    color: '#ffffff',
    textAlign: 'center',
    opacity: 0.9,
    marginBottom: 8,
  },
  // Project details section
  details: {
    height: '45%',
    padding: 60,
    backgroundColor: '#ffffff',
  },
  detailsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#6B7280',
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 20,
  },
  detailRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  detailLabel: {
    fontSize: 12,
    color: '#6B7280',
    width: 120,
    fontWeight: 'bold',
  },
  detailValue: {
    fontSize: 12,
    color: '#1F2937',
    flex: 1,
  },
  // Footer
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 60,
    right: 60,
    paddingTop: 15,
    borderTop: '1px solid #E5E7EB',
  },
  footerText: {
    fontSize: 9,
    color: '#9CA3AF',
    textAlign: 'center',
  },
});

interface CoverPageSectionProps {
  proposal: Proposal;
  section: ProposalSection;
  project?: Project;
  companyLogo?: string;
  companyName?: string;
  primaryColor?: string;
}

export function CoverPageSection({
  proposal,
  section,
  project,
  companyLogo,
  companyName = 'Your Company',
  primaryColor = '#3B82F6',
}: CoverPageSectionProps) {
  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-AU', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <Page size="A4" style={styles.page}>
      {/* Hero Section with Brand Color */}
      <View style={styles.hero}>
        <View style={[styles.heroOverlay, { backgroundColor: primaryColor }]} />
        
        {companyLogo && (
          <Image src={companyLogo} style={styles.logo} />
        )}
        
        <Text style={styles.proposalTitle}>
          {section.name || 'Project Proposal'}
        </Text>
        
        <Text style={styles.proposalSubtitle}>
          {project?.name || proposal.name}
        </Text>
        
        {project?.jobNumber && (
          <Text style={styles.proposalSubtitle}>
            Job #{project.jobNumber}
          </Text>
        )}
      </View>

      {/* Project Details Section */}
      <View style={styles.details}>
        <Text style={styles.detailsTitle}>Proposal Details</Text>
        
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Proposal Number</Text>
          <Text style={styles.detailValue}>{proposal.proposalNumber || 'N/A'}</Text>
        </View>
        
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Date Prepared</Text>
          <Text style={styles.detailValue}>{formatDate(proposal.createdAt)}</Text>
        </View>
        
        {proposal.expiryDate && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Valid Until</Text>
            <Text style={styles.detailValue}>{formatDate(proposal.expiryDate)}</Text>
          </View>
        )}
        
        {project?.description && (
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Project</Text>
            <Text style={styles.detailValue}>{project.description}</Text>
          </View>
        )}
        
        {section.description && section.description.trim() !== '' && (
          <View style={[styles.detailRow, { marginTop: 20 }]}>
            <Text style={[styles.detailValue, { fontSize: 11, lineHeight: 1.6 }]}>
              {section.description}
            </Text>
          </View>
        )}
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <Text style={styles.footerText}>
          Prepared by {companyName} • {formatDate(new Date())}
        </Text>
      </View>
    </Page>
  );
}
