import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";
import { registerPdfFonts, PDF_FONT_FAMILY } from "./registerPdfFonts";
import { PDF_COLORS, PDF_RADIUS, companyInitials } from "./pdfTokens";
import { tintOnWhite } from "./pdfColor";

interface DocBrandedHeaderProps {
  companyName: string;
  abn?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  brandColor: string;
  docStyle: "style1" | "style2";
}

// Idempotent — the shared chrome is used by every document, so registering
// here means none of them can render in Helvetica by omission.
registerPdfFonts();

export function DocBrandedHeader({
  companyName,
  abn,
  phone,
  email,
  logoUrl,
  brandColor,
  docStyle,
}: DocBrandedHeaderProps) {
  const isS2 = docStyle === "style2";

  const styles = StyleSheet.create({
    wrap: {
      flexDirection: "row",
      alignItems: "center",
      paddingHorizontal: 40,
      paddingVertical: 16,
      backgroundColor: isS2 ? brandColor : "#ffffff",
      borderBottomWidth: isS2 ? 0 : 1,
      borderBottomColor: PDF_COLORS.border,
      gap: 14,
      minHeight: 80,
    },
    logoBox: {
      width: 72,
      height: 44,
      alignItems: "center",
      justifyContent: "center",
      borderRadius: 4,
      backgroundColor: isS2 ? "rgba(255,255,255,0.2)" : tintOnWhite(brandColor, 0.1),
      overflow: "hidden",
    },
    logoImg: {
      width: 72,
      height: 44,
    },
    companyName: {
      fontSize: isS2 ? 15 : 13,
      fontFamily: PDF_FONT_FAMILY, fontWeight: 600,
      color: isS2 ? "#ffffff" : PDF_COLORS.ink,
    },
    detail: {
      fontSize: 9,
      color: isS2 ? "rgba(255,255,255,0.75)" : PDF_COLORS.inkMuted,
      marginTop: 2,
    },
  });

  return (
    <View style={styles.wrap}>
      {/* Initials rather than an empty tile. A builder with no logo used to
          get a blank grey rectangle in the corner of every proposal. */}
      <View style={styles.logoBox}>
        {logoUrl ? (
          <Image src={logoUrl} style={styles.logoImg} />
        ) : (
          <Text
            style={{
              fontFamily: PDF_FONT_FAMILY,
              fontWeight: 600,
              fontSize: 13,
              color: isS2 ? "#ffffff" : brandColor,
            }}
          >
            {companyInitials(companyName)}
          </Text>
        )}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.companyName}>{companyName}</Text>
        {abn ? <Text style={styles.detail}>ABN {abn}</Text> : null}
        {phone ? <Text style={styles.detail}>{phone}</Text> : null}
        {email ? <Text style={styles.detail}>{email}</Text> : null}
      </View>
    </View>
  );
}
