import { Page, View } from "@react-pdf/renderer";
import { PDF_COLORS } from "@/components/pdf/shared/pdfTokens";
import type { Proposal, ProposalSection, Project, Contact } from "@shared/schema";
import { DocFooter } from "@/components/pdf/shared/DocFooter";
import { PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";
import { coverTemplateOf } from "../coverTemplates";
import { coverFacts, coverPalette } from "./cover/coverData";
import { MastheadCover } from "./cover/MastheadCover";
import { FeatureCover } from "./cover/FeatureCover";
import { PhotoCover } from "./cover/PhotoCover";

interface CoverPageSectionProps {
  proposal: Proposal;
  section: ProposalSection;
  project?: Project;
  client?: Contact;
  companyLogo?: string;
  companyName?: string;
  companyPhone?: string;
  primaryColor?: string;
  brandColor?: string;
  /** The cover's accent. Optional — falls back to the primary colour. */
  secondaryColor?: string;
  documentStyle?: "style1" | "style2";
  showFooter?: boolean;
  /** Live proposal total, for the optional headline price. */
  totals?: { subtotalCents: number; gstCents: number; totalCents: number };
  showGst?: boolean;
}

/**
 * The cover page, in one of three layouts.
 *
 * This file used to BE the cover: two long branches on `documentStyle`, a
 * company-wide setting, inside one 600-line component. The layouts were fine;
 * choosing between them was not, since a bold cover on one proposal meant
 * changing every document the company sends. Each layout now lives in its own
 * file under cover/, the facts they all display are resolved once in
 * coverData, and this file does nothing but pick one and own the sheet.
 */
export function CoverPageSection({
  proposal,
  section,
  project,
  client,
  companyLogo,
  companyName = "Your Company",
  companyPhone,
  primaryColor = PDF_COLORS.brandFallback,
  brandColor,
  secondaryColor,
  documentStyle = "style1",
  showFooter,
  totals,
  showGst = true,
}: CoverPageSectionProps) {
  const resolvedColor = brandColor ?? primaryColor;
  const template = coverTemplateOf(section, documentStyle);
  const palette = coverPalette(resolvedColor, secondaryColor);
  const facts = coverFacts({ proposal, section, project, client, totals, showGst });

  const shared = { facts, palette, companyName, companyLogo, companyPhone };

  return (
    <Page
      size="A4"
      style={{
        // The photo cover runs its panel to the bottom edge, so it cannot
        // reserve footer space the way a white page does.
        paddingBottom: template === "photo" ? 0 : 60,
        fontFamily: PDF_FONT_FAMILY,
        backgroundColor: PDF_COLORS.surface,
      }}
    >
      {template === "feature" ? (
        <FeatureCover {...shared} />
      ) : template === "photo" ? (
        <PhotoCover {...shared} />
      ) : (
        <MastheadCover {...shared} />
      )}

      {/* A full-bleed cover has no white margin to print a footer into, and
          the page number belongs on the pages that carry content anyway. */}
      {template === "photo" ? (
        <View />
      ) : (
        <DocFooter
          show={showFooter}
          companyName={companyName}
          brandColor={resolvedColor}
          docStyle={template === "feature" ? "style2" : "style1"}
        />
      )}
    </Page>
  );
}
