import { View, Text } from "@react-pdf/renderer";

interface DocProjectBarProps {
  clientName?: string | null;
  clientEmail?: string | null;
  clientPhone?: string | null;
  projectName?: string | null;
  projectAddress?: string | null;
  brandColor: string;
  docStyle: "style1" | "style2";
}

export function DocProjectBar({
  clientName,
  clientEmail,
  clientPhone,
  projectName,
  projectAddress,
  brandColor,
  docStyle,
}: DocProjectBarProps) {
  const isS2 = docStyle === "style2";
  const bgColor = isS2 ? brandColor + "14" : "#F8F8F8";
  const borderColor = isS2 ? brandColor + "26" : "#e5e7eb";
  const labelColor = isS2 ? brandColor : "#9ca3af";

  const hasClient = clientName || clientEmail || clientPhone;
  const hasProject = projectName || projectAddress;

  if (!hasClient && !hasProject) return null;

  return (
    <View
      style={{
        flexDirection: "row",
        paddingHorizontal: 40,
        paddingVertical: 12,
        backgroundColor: bgColor,
        borderBottomWidth: 1,
        borderBottomColor: borderColor,
        gap: 24,
        minHeight: 60,
      }}
    >
      {hasClient ? (
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 7,
              fontFamily: "Helvetica-Bold",
              color: labelColor,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 3,
            }}
          >
            Client
          </Text>
          {clientName ? (
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111827" }}>
              {clientName}
            </Text>
          ) : null}
          {clientEmail ? (
            <Text style={{ fontSize: 8, color: "#6b7280", marginTop: 2 }}>{clientEmail}</Text>
          ) : null}
          {clientPhone ? (
            <Text style={{ fontSize: 8, color: "#6b7280", marginTop: 1 }}>{clientPhone}</Text>
          ) : null}
        </View>
      ) : null}

      {hasProject ? (
        <View style={{ flex: 2 }}>
          <Text
            style={{
              fontSize: 7,
              fontFamily: "Helvetica-Bold",
              color: labelColor,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              marginBottom: 3,
            }}
          >
            Project
          </Text>
          {projectName ? (
            <Text style={{ fontSize: 10, fontFamily: "Helvetica-Bold", color: "#111827" }}>
              {projectName}
            </Text>
          ) : null}
          {projectAddress ? (
            <Text style={{ fontSize: 8, color: "#6b7280", marginTop: 2 }}>{projectAddress}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
