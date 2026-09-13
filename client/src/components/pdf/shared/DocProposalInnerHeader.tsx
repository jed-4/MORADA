import { View, Text, Image } from "@react-pdf/renderer";
import { registerPdfFonts, PDF_FONT_FAMILY } from "./registerPdfFonts";
import { tintOnWhite } from "./pdfColor";
import { PDF_COLORS, PDF_RADIUS } from "./pdfTokens";

interface DocProposalInnerHeaderProps {
  companyName?: string;
  companyPhone?: string;
  logoUrl?: string;
  proposalNumber?: string | null;
  proposalName?: string | null;
  brandColor: string;
  docStyle: "style1" | "style2";
  /** Repeat on every page the parent <Page> spills onto. */
  fixed?: boolean;
  /**
   * How much of the masthead repeats on inner pages.
   *
   * "full" is the original: brand rule, logo tile, company, number, project.
   * "compact" drops the logo tile — page one already showed it, and repeating
   * it eight times is the company introducing itself to someone reading their
   * proposal. "minimal" is a book-style running head: one line of small muted
   * type, number left, project right, hairline under, no brand fill.
   */
  variant?: "minimal" | "compact" | "full";
}

// Idempotent — the shared chrome is used by every document, so registering
// here means none of them can render in Helvetica by omission.
registerPdfFonts();

export function DocProposalInnerHeader({
  companyName,
  companyPhone,
  logoUrl,
  proposalNumber,
  proposalName,
  brandColor,
  docStyle,
  fixed,
  variant = "full",
}: DocProposalInnerHeaderProps) {
  const isS2 = docStyle === "style2";

  if (variant === "minimal") {
    return (
      <View
        fixed={fixed}
        style={{
          paddingHorizontal: 40,
          paddingTop: 14,
          paddingBottom: 5,
        }}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            borderBottomWidth: 1,
            borderBottomColor: PDF_COLORS.border,
            paddingBottom: 5,
          }}
        >
          <Text style={{ fontSize: 8, color: PDF_COLORS.inkFaint, letterSpacing: 0.4 }}>
            {proposalNumber ? `Proposal #${proposalNumber}` : companyName || ""}
          </Text>
          {proposalName ? (
            <Text style={{ fontSize: 8, color: PDF_COLORS.inkFaint, maxWidth: 320, textAlign: "right" }}>
              {proposalName}
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View
      fixed={fixed}
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 40,
        paddingVertical: 8,
        minHeight: variant === "compact" ? 34 : 56,
        backgroundColor: isS2 ? brandColor + "14" : "#ffffff",
        borderTopWidth: 3,
        borderTopColor: brandColor,
        borderBottomWidth: 1,
        borderBottomColor: isS2 ? tintOnWhite(brandColor, "30") : PDF_COLORS.border,
        ...(isS2 ? { borderLeftWidth: 3, borderLeftColor: brandColor } : {}),
      }}
    >
      {/* objectFit: "contain" is not optional.
          Without it @react-pdf STRETCHES the image to the box, and a logo that
          is anything other than 10:7 arrives at the client squashed — Jed's is
          close to square, so the running header crushed it on every page. The
          box bounds the header's height; the logo keeps its shape inside it.

          And the tile is only drawn when there is a logo. It used to render
          regardless, so a company that has not uploaded one got an empty grey
          rectangle beside their name — the same thing PdfHeroBand was fixed
          for, one file over. */}
      {variant === "full" && logoUrl && (
        <View
          style={{
            width: 44,
            height: 28,
            overflow: "hidden",
            marginRight: 10,
            justifyContent: "center",
          }}
        >
          <Image src={logoUrl} style={{ width: 44, height: 28, objectFit: "contain" }} />
        </View>
      )}

      <View style={{ flex: 1 }}>
        {companyName ? (
          <Text
            style={{
              fontSize: 10,
              fontFamily: PDF_FONT_FAMILY, fontWeight: 600,
              color: PDF_COLORS.ink,
            }}
          >
            {companyName}
          </Text>
        ) : null}
        {proposalNumber ? (
          <Text
            style={{
              fontSize: 8,
              color: isS2 ? brandColor : PDF_COLORS.inkFaint,
              marginTop: 1,
            }}
          >
            Proposal #{proposalNumber}
          </Text>
        ) : null}
        {companyPhone ? (
          <Text style={{ fontSize: 8, color: PDF_COLORS.inkFaint, marginTop: 1 }}>
            {companyPhone}
          </Text>
        ) : null}
      </View>

      {proposalName ? (
        <Text
          style={{
            fontSize: 9,
            color: isS2 ? brandColor : PDF_COLORS.inkMuted,
            // Inter italic, now that the family ships one. This was the last
            // Helvetica in the running header of every proposal page.
            fontFamily: PDF_FONT_FAMILY,
            fontStyle: "italic",
            maxWidth: 200,
            textAlign: "right",
          }}
        >
          {proposalName}
        </Text>
      ) : null}
    </View>
  );
}
