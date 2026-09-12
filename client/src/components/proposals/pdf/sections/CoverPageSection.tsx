import { Page, Text, View, Image } from "@react-pdf/renderer";
import { PDF_COLORS, PDF_SPACE, brandRamp } from "@/components/pdf/shared/pdfTokens";
import { PdfHeroBand } from "@/components/pdf/shared/PdfHeroBand";
import type { Proposal, ProposalSection, Project, Contact } from "@shared/schema";
import { DocFooter } from "@/components/pdf/shared/DocFooter";
import { PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";

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
  showFooter?: boolean;
  /** Live proposal total, for the optional headline price. */
  totals?: { subtotalCents: number; gstCents: number; totalCents: number };
  showGst?: boolean;
}

const formatDate = (date: Date | string | null | undefined) => {
  if (!date) return "N/A";
  return new Date(date).toLocaleDateString("en-AU", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
};


/** The band's status chip. Muted on purpose — "Proposal" names the document,
 *  it is not a state the reader needs flagging. */
function proposalStatusChip(brandColor: string): { bg: string; text: string } {
  const ramp = brandRamp(brandColor);
  return { bg: ramp.wash, text: ramp.onWhite };
}

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
  showFooter,
  totals,
  showGst = true,
}: CoverPageSectionProps) {
  const resolvedColor = brandColor ?? primaryColor;

  /**
   * The headline price, off by default.
   *
   * Opt-in because it is a judgement call, not a default: some builders want
   * the number where the client cannot miss it, others want them to read the
   * scope first. Off, nothing about the page changes.
   */
  const coverContent = (section.content as Record<string, unknown> | null) ?? {};
  const showPrice = coverContent.showPrice === true && (totals?.totalCents ?? 0) > 0;
  const priceLabel = showGst ? 'Total (inc GST)' : 'Total';
  const priceText = `$${((totals?.totalCents ?? 0) / 100).toLocaleString('en-AU', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
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
        style={{ paddingBottom: 60, fontFamily: PDF_FONT_FAMILY, backgroundColor: PDF_COLORS.surface }}
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
                  fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
                  color: PDF_COLORS.surface,
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
                  backgroundColor: PDF_COLORS.surface,
                  paddingHorizontal: 10,
                  paddingVertical: 3,
                  borderRadius: 2,
                }}
              >
                <Text
                  style={{
                    fontSize: 8,
                    fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
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
                fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
                color: PDF_COLORS.surface,
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
                fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
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
                  fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
                  color: PDF_COLORS.ink,
                }}
              >
                {clientName}
              </Text>
            ) : (
              <Text style={{ fontSize: 11, color: PDF_COLORS.inkFaint }}>—</Text>
            )}
            {clientEmail ? (
              <Text
                style={{ fontSize: 9, color: PDF_COLORS.inkMuted, marginTop: 3 }}
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
                fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
                color: resolvedColor,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 6,
              }}
            >
              REFERENCE
            </Text>
            <Text style={{ fontSize: 11, color: PDF_COLORS.inkMuted }}>
              {proposal.proposalNumber || "—"}
            </Text>
            <Text
              style={{
                fontSize: 8,
                fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
                color: resolvedColor,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginTop: 12,
                marginBottom: 6,
              }}
            >
              DATE
            </Text>
            <Text style={{ fontSize: 11, color: PDF_COLORS.inkMuted }}>
              {formatDate(proposal.createdAt)}
            </Text>
          </View>
        </View>

        {showPrice ? (
          <View
            style={{
              marginHorizontal: 32,
              marginTop: 24,
              paddingTop: 12,
              borderTopWidth: 2,
              borderTopColor: resolvedColor,
            }}
          >
            <Text
              style={{
                fontSize: 8,
                fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
                color: resolvedColor,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 4,
              }}
            >
              {priceLabel}
            </Text>
            <Text style={{ fontSize: 24, fontFamily: PDF_FONT_FAMILY, fontWeight: 700, color: PDF_COLORS.ink }}>
              {priceText}
            </Text>
          </View>
        ) : null}

        {proposal.expiryDate ? (
          <Text
            style={{
              paddingHorizontal: 32,
              fontSize: 9,
              color: PDF_COLORS.inkFaint,
              marginTop: 16,
            }}
          >
            This proposal is valid until {formatDate(proposal.expiryDate)}
          </Text>
        ) : null}

        <DocFooter
          show={showFooter}
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
      style={{ paddingBottom: 60, fontFamily: PDF_FONT_FAMILY, backgroundColor: PDF_COLORS.surface }}
    >
      {/* One band carrying identity, status and the headline figure, rather
          than an accent rule, a logo row and a total block three separate
          places down the page. The kit's note: "three identity blocks is two
          too many". The band honours the company's masthead setting, so
          nobody's documents change palette without asking. */}
      <PdfHeroBand
        companyName={companyName || ""}
        logoUrl={companyLogo}
        contactLines={[companyPhone]}
        brandColor={resolvedColor}
        status={{ label: "Proposal", ...proposalStatusChip(resolvedColor) }}
        figure={showPrice ? priceText : null}
        figureLabel={showPrice ? priceLabel : null}
        figureCaption={proposal.proposalNumber || null}
        // Style 2 returns earlier with its own full-bleed treatment; this is
        // the style-1 branch, so the masthead stays light by definition.
        variant="light"
      />

      <View style={{ paddingTop: PDF_SPACE.xl }} />

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

      {/* Project title */}
      <Text
        style={{
          marginHorizontal: 40,
          fontSize: 30,
          fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
          color: PDF_COLORS.ink,
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
            color: PDF_COLORS.inkMuted,
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
            color: PDF_COLORS.inkFaint,
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
          backgroundColor: PDF_COLORS.border,
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
              fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
              color: PDF_COLORS.inkFaint,
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
                fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
                color: PDF_COLORS.ink,
              }}
            >
              {clientName}
            </Text>
          ) : (
            <Text style={{ fontSize: 11, color: PDF_COLORS.inkFaint }}>—</Text>
          )}
          {clientEmail ? (
            <Text style={{ fontSize: 9, color: PDF_COLORS.inkMuted, marginTop: 3 }}>
              {clientEmail}
            </Text>
          ) : null}
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontSize: 8,
              fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
              color: PDF_COLORS.inkFaint,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              marginBottom: 6,
            }}
          >
            DATE
          </Text>
          <Text style={{ fontSize: 11, color: PDF_COLORS.inkMuted }}>
            {formatDate(proposal.createdAt)}
          </Text>
          <Text
            style={{
              fontSize: 8,
              fontFamily: PDF_FONT_FAMILY, fontWeight: 700,
              color: PDF_COLORS.inkFaint,
              textTransform: "uppercase",
              letterSpacing: 0.8,
              marginTop: 14,
              marginBottom: 6,
            }}
          >
            REFERENCE
          </Text>
          <Text style={{ fontSize: 11, color: PDF_COLORS.inkMuted }}>
            {proposal.proposalNumber || "—"}
          </Text>
        </View>
      </View>

      {/* No price block here: the hero band above carries the figure. Printing
          it twice on one page invites the reader to check they match. */}

      {proposal.expiryDate ? (
        <Text
          style={{
            marginHorizontal: 40,
            fontSize: 9,
            color: PDF_COLORS.inkFaint,
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
            color: PDF_COLORS.inkMuted,
            lineHeight: 1.6,
            marginTop: 16,
          }}
        >
          {section.description}
        </Text>
      ) : null}

      <DocFooter
        show={showFooter}
        companyName={companyName}
        brandColor={resolvedColor}
        docStyle="style1"
      />
    </Page>
  );
}
