import { View, Text, Image } from "@react-pdf/renderer";

interface DocProposalInnerHeaderProps {
  companyName?: string;
  companyPhone?: string;
  logoUrl?: string;
  proposalNumber?: string | null;
  proposalName?: string | null;
  brandColor: string;
  docStyle: "style1" | "style2";
}

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
        borderBottomColor: isS2 ? brandColor + "30" : "#e5e7eb",
        ...(isS2 ? { borderLeftWidth: 3, borderLeftColor: brandColor } : {}),
      }}
    >
      <View
        style={{
          width: 40,
          height: 28,
          borderRadius: 3,
          backgroundColor: isS2 ? "rgba(255,255,255,0.35)" : "#e5e7eb",
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
              fontFamily: "Helvetica-Bold",
              color: "#111827",
            }}
          >
            {companyName}
          </Text>
        ) : null}
        {proposalNumber ? (
          <Text
            style={{
              fontSize: 8,
              color: isS2 ? brandColor : "#9ca3af",
              marginTop: 1,
            }}
          >
            Proposal #{proposalNumber}
          </Text>
        ) : null}
        {companyPhone ? (
          <Text style={{ fontSize: 8, color: "#9ca3af", marginTop: 1 }}>
            {companyPhone}
          </Text>
        ) : null}
      </View>

      {proposalName ? (
        <Text
          style={{
            fontSize: 9,
            color: isS2 ? brandColor : "#6b7280",
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
