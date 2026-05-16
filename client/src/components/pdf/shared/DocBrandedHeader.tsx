import { View, Text, Image, StyleSheet } from "@react-pdf/renderer";

interface DocBrandedHeaderProps {
  companyName: string;
  abn?: string | null;
  phone?: string | null;
  email?: string | null;
  logoUrl?: string | null;
  brandColor: string;
  docStyle: "style1" | "style2";
}

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
      borderBottomColor: "#e5e7eb",
      gap: 14,
      minHeight: 80,
    },
    logoBox: {
      width: 72,
      height: 44,
      borderRadius: 4,
      backgroundColor: isS2 ? "rgba(255,255,255,0.2)" : "#e5e7eb",
      overflow: "hidden",
    },
    logoImg: {
      width: 72,
      height: 44,
    },
    companyName: {
      fontSize: isS2 ? 15 : 13,
      fontFamily: "Helvetica-Bold",
      color: isS2 ? "#ffffff" : "#111827",
    },
    detail: {
      fontSize: 9,
      color: isS2 ? "rgba(255,255,255,0.75)" : "#6b7280",
      marginTop: 2,
    },
  });

  return (
    <View style={styles.wrap}>
      <View style={styles.logoBox}>
        {logoUrl ? (
          <Image src={logoUrl} style={styles.logoImg} />
        ) : null}
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
