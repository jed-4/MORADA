import { Page, View } from '@react-pdf/renderer';
import type { ReactNode } from 'react';
import { DocProposalInnerHeader } from '@/components/pdf/shared/DocProposalInnerHeader';
import { DocFooter } from '@/components/pdf/shared/DocFooter';
import { tintOnWhite } from '@/components/pdf/shared/pdfColor';

interface SectionPageProps {
  companyName?: string;
  companyPhone?: string;
  logoUrl?: string;
  proposalNumber?: string | null;
  proposalName?: string | null;
  brandColor: string;
  docStyle: 'style1' | 'style2';
  showFooter?: boolean;
  children: ReactNode;
}

/**
 * One sheet of the proposal, and everything that repeats on it.
 *
 * The page chrome used to be copied into all twelve section files — the same
 * <Page>, the same header, the same footer, twelve times — which meant a
 * section could only ever own a whole page. Sections are bodies now and this
 * owns the sheet, so several can share one.
 *
 * `fixed` on both header and footer: they repeat on every physical page this
 * one spills onto. Previously only the footer did, so page two of a long
 * estimate carried a page number but no idea which proposal it belonged to.
 */
export function SectionPage({
  companyName,
  companyPhone,
  logoUrl,
  proposalNumber,
  proposalName,
  brandColor,
  docStyle,
  showFooter,
  children,
}: SectionPageProps) {
  return (
    <Page
      size="A4"
      style={{ paddingBottom: 60, paddingTop: 0, fontFamily: 'Helvetica', backgroundColor: '#ffffff' }}
    >
      <DocProposalInnerHeader
        fixed
        companyName={companyName}
        companyPhone={companyPhone}
        logoUrl={logoUrl}
        proposalNumber={proposalNumber ?? undefined}
        proposalName={proposalName ?? undefined}
        brandColor={brandColor}
        docStyle={docStyle}
      />
      {children}
      <DocFooter
        show={showFooter}
        companyName={companyName}
        brandColor={brandColor}
        docStyle={docStyle}
      />
    </Page>
  );
}

/**
 * The rule between two sections that share a sheet. Full width, in the brand
 * colour at low weight — enough to say "that section ended" without competing
 * with the estimate's group bars.
 *
 * The tint is pre-blended rather than an alpha or an opacity: @react-pdf draws
 * a border with an alpha channel BRIGHT GREEN. See pdfColor.ts — it has bitten
 * every style2 document in the app once already.
 */
export function SectionDivider({ brandColor }: { brandColor: string }) {
  return (
    <View
      style={{
        marginHorizontal: 40,
        // Small on purpose: sharedSectionStyle.section already puts 20pt below
        // the section above and 20pt above the one below. At 22 each side the
        // gap came to 84pt — most of an inch of nothing.
        marginTop: 6,
        marginBottom: 6,
        borderTopWidth: 1,
        borderTopColor: tintOnWhite(brandColor, 0.35),
      }}
    />
  );
}
