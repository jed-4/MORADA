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
}: DocProposalInnerHeaderProps) {
  const isS2 = docStyle === "style2";

  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 40,
        paddingVertical: 8,
        minHeight: 56,
        backgroundColor: isS2 ? brandColor + "14" : "#ffffff",
        borderTopWidth: 3,
        borderTopColor: brandColor,
        borderBottomWidth: 1,
        borderBottomColor: isS2 ? tintOnWhite(brandColor, "30") : PDF_COLORS.border,
        ...(isS2 ? { borderLeftWidth: 3, borderLeftColor: brandColor } : {}),
      }}
    >
      <View
        style={{
          width: 40,
          height: 28,
          borderRadius: 3,
          backgroundColor: isS2 ? "rgba(255,255,255,0.35)" : PDF_COLORS.border,
          overflow: "hidden",
          marginRight: 10,
        }}
      >
        {logoUrl ? (
          <Image src={logoUrl} style={{ width: 40, height: 28 }} />
        ) : null}
      </View>

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
            fontFamily: "Helvetica-Oblique",
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
