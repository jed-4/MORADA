import { View, Text } from "@react-pdf/renderer";
import { registerPdfFonts, PDF_FONT_FAMILY } from "./registerPdfFonts";
import { PDF_COLORS, PDF_RADIUS } from "./pdfTokens";

interface DocFooterProps {
  companyName?: string;
  brandColor: string;
  docStyle: "style1" | "style2";
  /** False hides the footer on this page. Defaults to shown. */
  show?: boolean;
}

// Idempotent — the shared chrome is used by every document, so registering
// here means none of them can render in Helvetica by omission.
registerPdfFonts();

export function DocFooter({ companyName, brandColor, docStyle, show = true }: DocFooterProps) {
  if (!show) return null;
  const isS2 = docStyle === "style2";

  return (
    <View
      fixed
      style={{
        position: "absolute",
        bottom: 20,
        left: 0,
        right: 0,
        flexDirection: "row",
        alignItems: "center",
        paddingHorizontal: 40,
        paddingTop: 6,
        borderTopWidth: isS2 ? 2 : 1,
        borderTopColor: isS2 ? brandColor : PDF_COLORS.border,
        ...(isS2 ? { borderLeftWidth: 3, borderLeftColor: brandColor } : {}),
      }}
    >
      <Text
        style={{
          fontSize: 9,
          color: isS2 ? brandColor : PDF_COLORS.inkFaint,
          flex: 1,
          fontFamily: PDF_FONT_FAMILY,
        }}
      >
        {companyName || ""}
      </Text>
      <Text style={{ fontSize: 9, color: PDF_COLORS.inkFaint, flex: 1, textAlign: "center" }}>
        Powered by Morada
      </Text>
      <Text
        style={{ fontSize: 9, color: PDF_COLORS.inkFaint, flex: 1, textAlign: "right" }}
        render={({ pageNumber, totalPages }) => `Page ${pageNumber} of ${totalPages}`}
      />
    </View>
  );
}
