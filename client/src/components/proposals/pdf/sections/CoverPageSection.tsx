import { Page, Text, View, Image } from "@react-pdf/renderer";
import type { Proposal, ProposalSection, Project, Contact } from "@shared/schema";
import { DocFooter } from "@/components/pdf/shared/DocFooter";

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
  documentStyle?: "style1" | "style2";
}

const formatDate = (date: Date | string | null | undefined) => {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};

export function CoverPageSection({
  proposal,
  section,
  project,
  client,
  companyLogo,
  companyName = "Your Company",
  companyPhone,
  primaryColor = "#3B82F6",
  brandColor,
  documentStyle = "style1",
}: CoverPageSectionProps) {
  const resolvedColor = brandColor ?? primaryColor;
  const isS2 = documentStyle === "style2";

  const content = (section.content ?? {}) as Record<string, unknown>;
  const projectTitle =
    (content.projectTitle && String(content.projectTitle).trim()) ||
    project?.name ||
    proposal.name;
  const clientName =
    (content.clientName && String(content.clientName).trim()) ||
    client?.name ||
    "";
  const clientEmail =
    (content.clientEmail && String(content.clientEmail).trim()) ||
    client?.email ||
    "";
  const subtitle =
    (content.subtitle && String(content.subtitle).trim()) || "";
  const projectAddress = project?.address || "";

  if (isS2) {
    return (
      <Page
        size="A4"
        style={{ paddingBottom: 60, fontFamily: "Helvetica", backgroundColor: "#ffffff" }}
      >
        {/* Full-width brand hero block */}
        <View
          style={{
            height: 310,
            backgroundColor: resolvedColor,
            paddingHorizontal: 40,
            paddingTop: 32,
            paddingBottom: 28,
            flexDirection: "column",
            justifyContent: "space-between",
          }}
        >
          {/* Logo + company row */}
          <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
            <View
              style={{
                width: 72,
                height: 44,
                borderRadius: 4,
                backgroundColor: "rgba(255,255,255,0.18)",
                overflow: "hidden",
                marginRight: 14,
              }}
            >
              {companyLogo ? (
                <Image src={companyLogo} style={{ width: 72, height: 44 }} />
              ) : null}
            </View>
            <View style={{ justifyContent: "center" }}>
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Helvetica-Bold",
                  color: "#ffffff",
                }}
              >
                {companyName}
              </Text>
              {companyPhone ? (
                <Text
                  style={{
                    fontSize: 9,
                    color: "rgba(255,255,255,0.75)",
                    marginTop: 2,
                  }}
                >
                  {companyPhone}
                </Text>
              ) : null}
            </View>
          </View>

          {/* Project title at bottom of hero */}
          <View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                marginBottom: 14,
              }}
            >
              <View
                style={{
                  backgroundColor: "#ffffff",
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                  borderRadius: 2,
                }}
              >
                <Text
                  style={{
                    fontSize: 8,
                    fontFamily: "Helvetica-Bold",
                    color: resolvedColor,
                    letterSpacing: 1.5,
                  }}
                >
                  PROPOSAL
                </Text>
              </View>
            </View>
            <Text
              style={{
                fontSize: 30,
                fontFamily: "Helvetica-Bold",
                color: "#ffffff",
                lineHeight: 1.2,
              }}
            >
              {projectTitle}
            </Text>
            {subtitle ? (
              <Text
                style={{
                  fontSize: 13,
                  color: "rgba(255,255,255,0.82)",
                  marginTop: 6,
                }}
              >
                {subtitle}
              </Text>
            ) : null}
            {projectAddress ? (
              <Text
                style={{
                  fontSize: 10,
                  color: "rgba(255,255,255,0.65)",
                  marginTop: 4,
                }}
              >
                {projectAddress}
              </Text>
            ) : null}
          </View>
        </View>

        {/* Info cards */}
        <View
          style={{
            flexDirection: "row",
            paddingHorizontal: 32,
            paddingTop: 24,
            gap: 14,
          }}
        >
          <View
            style={{
              flex: 1,
              backgroundColor: resolvedColor + "14",
              borderRadius: 5,
              padding: 16,
            }}
          >
            <Text
              style={{
                fontSize: 8,
                fontFamily: "Helvetica-Bold",
                color: resolvedColor,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 10,
              }}
            >
              PREPARED FOR
            </Text>
            {clientName ? (
              <Text
                style={{
                  fontSize: 13,
                  fontFamily: "Helvetica-Bold",
                  color: "#111827",
                }}
              >
                {clientName}
              </Text>
            ) : (
              <Text style={{ fontSize: 11, color: "#9ca3af" }}>—</Text>
            )}
            {clientEmail ? (
              <Text
                style={{ fontSize: 9, color: "#6b7280", marginTop: 3 }}
              >
                {clientEmail}
              </Text>
            ) : null}
          </View>

          <View
            style={{
              flex: 1,
              backgroundColor: resolvedColor + "14",
              borderRadius: 5,
              padding: 16,
            }}
          >
            <Text
              style={{
                fontSize: 8,
                fontFamily: "Helvetica-Bold",
                color: resolvedColor,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 6,
              }}
            >
              REFERENCE
            </Text>
            <Text style={{ fontSize: 11, color: "#374151" }}>
              {proposal.proposalNumber || "—"}
            </Text>
            <Text
              style={{
                fontSize: 8,
                fontFamily: "Helvetica-Bold",
                color: resolvedColor,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginTop: 12,
                marginBottom: 6,
              }}
            >
              DATE
            </Text>
            <Text style={{ fontSize: 11, color: "#374151" }}>
              {formatDate(proposal.createdAt)}
            </Text>
          </View>
        </View>

        {proposal.expiryDate ? (
          <Text
            style={{
              paddingHorizontal: 32,
              fontSize: 9,
              color: "#9ca3af",
              marginTop: 16,
            }}
          >
            This proposal is valid until {formatDate(proposal.expiryDate)}
          </Text>
        ) : null}

        <DocFooter
          companyName={companyName}
          brandColor={resolvedColor}
          docStyle="style2"
        />
      </Page>
    );
  }

  /* ── Style 1: Classic / Minimal ── */
  return (
    <Page
      size="A4"
      style={{ paddingBottom: 60, fontFamily: "Helvetica", backgroundColor: "#ffffff" }}
    >
      {/* Top accent band */}
      <View style={{ height: 6, backgroundColor: resolvedColor }} />

      {/* Logo + company name row */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: 40,
          paddingTop: 28,
          paddingBottom: 18,
        }}
      >
        <View
          style={{
            width: 80,
            height: 50,
            borderRadius: 4,
            backgroundColor: "#e5e7eb",
            overflow: "hidden",
            marginRight: 14,
          }}
        >
          {companyLogo ? (
            <Image src={companyLogo} style={{ width: 80, height: 50 }} />
          ) : null}
        </View>
        <View style={{ flex: 1, alignItems: "flex-end" }}>
          <Text
            style={{
              fontSize: 13,
              fontFamily: "Helvetica-Bold",
              color: "#111827",
            }}
          >
            {companyName}
          </Text>
          {companyPhone ? (
            <Text style={{ fontSize: 9, color: "#6b7280", marginTop: 2 }}>
              {companyPhone}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Brand accent divider (80 px wide) */}
      <View
        style={{
          marginLeft: 40,
          width: 80,
          height: 3,
          backgroundColor: resolvedColor,
          marginBottom: 10,
        }}
      />

      {/* PROPOSAL badge */}
      <Text
        style={{
          marginHorizontal: 40,
          fontSize: 9,
          fontFamily: "Helvetica-Bold",
          color: resolvedColor,
          letterSpacing: 1.5,
          marginBottom: 10,
        }}
      >
        PROPOSAL
      </Text>

      {/* Project title */}
      <Text
        style={{
          marginHorizontal: 40,
          fontSize: 30,
          fontFamily: "Helvetica-Bold",
          color: "#111827",
          lineHeight: 1.2,
        }}
      >
        {projectTitle}
      </Text>

      {subtitle ? (
        <Text
          style={{
            marginHorizontal: 40,
            fontSize: 13,
            color: "#6b7280",
            marginTop: 8,
          }}
        >
          {subtitle}
        </Text>
      ) : null}

      {projectAddress ? (
        <Text
          style={{
            marginHorizontal: 40,
            fontSize: 10,
            color: "#9ca3af",
            marginTop: 4,
          }}
        >
          {projectAddress}
        </Text>
      ) : null}

      {/* Thin divider */}
      <View
        style={{
          marginHorizontal: 40,
          height: 1,
          backgroundColor: "#e5e7eb",
          marginTop: 28,
          marginBottom: 24,
        }}
      />

      {/* Two-column info: Prepared For + Reference */}
      <View
        style={{
          flexDirection: "row",
          paddingHorizontal: 40,
          gap: 40,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 8,
              fontFamily: "Helvetica-Bold",
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: 0.8,
              marginBottom: 6,
            }}
          >
            PREPARED FOR
          </Text>
          {clientName ? (
            <Text
              style={{
                fontSize: 13,
                fontFamily: "Helvetica-Bold",
                color: "#111827",
              }}
            >
              {clientName}
            </Text>
          ) : (
            <Text style={{ fontSize: 11, color: "#9ca3af" }}>—</Text>
          )}
          {clientEmail ? (
            <Text style={{ fontSize: 9, color: "#6b7280", marginTop: 3 }}>
              {clientEmail}
            </Text>
          ) : null}
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 8,
              fontFamily: "Helvetica-Bold",
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: 0.8,
              marginBottom: 6,
            }}
          >
            DATE
          </Text>
          <Text style={{ fontSize: 11, color: "#374151" }}>
            {formatDate(proposal.createdAt)}
          </Text>
          <Text
            style={{
              fontSize: 8,
              fontFamily: "Helvetica-Bold",
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: 0.8,
              marginTop: 14,
              marginBottom: 6,
            }}
          >
            REFERENCE
          </Text>
          <Text style={{ fontSize: 11, color: "#374151" }}>
            {proposal.proposalNumber || "—"}
          </Text>
        </View>
      </View>

      {proposal.expiryDate ? (
        <Text
          style={{
            marginHorizontal: 40,
            fontSize: 9,
            color: "#9ca3af",
            marginTop: 24,
          }}
        >
          This proposal is valid until {formatDate(proposal.expiryDate)}
        </Text>
      ) : null}

      {section.description && section.description.trim() ? (
        <Text
          style={{
            marginHorizontal: 40,
            fontSize: 11,
            color: "#374151",
            lineHeight: 1.6,
            marginTop: 16,
          }}
        >
          {section.description}
        </Text>
      ) : null}

      <DocFooter
        companyName={companyName}
        brandColor={resolvedColor}
        docStyle="style1"
      />
    </Page>
  );
}
