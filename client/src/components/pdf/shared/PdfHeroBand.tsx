import { View, Text, Image, Svg, Defs, LinearGradient, Stop, Rect } from "@react-pdf/renderer";
import { registerPdfFonts, PDF_FONT_FAMILY } from "./registerPdfFonts";
import {
  PDF_COLORS,
  PDF_PAGE_MARGIN,
  PDF_RADIUS,
  PDF_SPACE,
  PDF_TYPE,
  PDF_WEIGHT,
  brandRamp,
  companyInitials,
} from "./pdfTokens";

/**
 * The masthead every document opens with.
 *
 * This is a port of the client portal's hero band, which is the design Jed
 * asked the PDFs to match. The old chrome spread the same information over
 * three stacked blocks — a brand band with the company in it, a grey
 * CLIENT/PROJECT bar, then a third row carrying the document number, its
 * status and a money card — which spent roughly 40% of page one before any
 * content, and put the total nowhere near the band. The portal says all of it
 * once, in one band, and starts the document immediately.
 *
 * Two things the old header got wrong that are fixed here by construction:
 *
 *   - the logo tile was drawn whether or not a logo existed, so a builder who
 *     has not uploaded one got an empty grey rectangle. It now falls back to
 *     the company's initials.
 *
 *   - the headline figure was rendered in the *bills* amber (#F8F3E8 /
 *     #B8853A) regardless of the company's brand colour, so a builder branded
 *     green got an orange price. Every colour here derives from brandRamp().
 */

registerPdfFonts();

export interface PdfHeroBandProps {
  companyName: string;
  logoUrl?: string | null;
  /** Contact lines under the company name. Falsy entries are dropped. */
  contactLines?: Array<string | null | undefined>;
  brandColor?: string | null;

  /** Right-hand side. */
  status?: { label: string; bg: string; text: string } | null;
  /** The headline figure, already formatted (e.g. "$6,875.00"). */
  figure?: string | null;
  /** Small print under the figure — the document number, usually. */
  figureCaption?: string | null;
  /** Above the figure when it needs naming ("Inc. GST"). */
  figureLabel?: string | null;

  /**
   * Which masthead the company chose in Settings.
   *
   * "brand" (documentStyle style2) fills the band with their colour;
   * "light" (style1) keeps a white masthead with ink text and a brand rule.
   * Both use the SAME composition — one band carrying identity, status and
   * the headline figure — because the composition is what was wrong, not the
   * colour. Honouring the setting means nobody's documents change palette
   * without them asking.
   */
  variant?: "brand" | "light";
}

export function PdfHeroBand({
  companyName,
  logoUrl,
  contactLines = [],
  brandColor,
  status,
  figure,
  figureCaption,
  figureLabel,
  variant = "brand",
}: PdfHeroBandProps) {
  const ramp = brandRamp(brandColor);
  const isBrand = variant === "brand";
  // On a light masthead the "on brand" inks become ordinary document inks, and
  // the brand colour is spent on the figure instead of the ground.
  const brand = isBrand
    ? ramp
    : { ...ramp, onBrand: PDF_COLORS.ink, onBrandMuted: PDF_COLORS.inkMuted };
  const lines = contactLines.filter((l): l is string => !!l && !!l.trim());

  return (
    <View
      style={{
        position: "relative",
        paddingHorizontal: PDF_PAGE_MARGIN,
        paddingVertical: 22,
        minHeight: 104,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
        backgroundColor: isBrand ? undefined : PDF_COLORS.surface,
        borderBottomWidth: isBrand ? 0 : 2,
        borderBottomColor: isBrand ? undefined : ramp.base,
      }}
    >
      {/* The gradient. @react-pdf has no CSS gradients, but it does ship SVG
          primitives, so the band is a stretched <Rect> behind the content
          rather than the flat fill a naive port would settle for.
          preserveAspectRatio="none" lets the 100x100 viewBox stretch to the
          band's real proportions. */}
      {isBrand && (
        <Svg
          style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
        >
          <Defs>
            <LinearGradient id="pdfHeroGradient" x1="0" y1="0" x2="1" y2="1">
              <Stop offset="0" stopColor={ramp.base} />
              <Stop offset="1" stopColor={ramp.gradientTo} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100" height="100" fill="url(#pdfHeroGradient)" />
        </Svg>
      )}

      {/* Identity */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12, flex: 1, paddingRight: PDF_SPACE.lg }}>
        <View
          style={{
            width: 46,
            height: 46,
            borderRadius: PDF_RADIUS.md,
            backgroundColor: isBrand ? "rgba(255,255,255,0.22)" : ramp.wash,
            alignItems: "center",
            justifyContent: "center",
            overflow: "hidden",
          }}
        >
          {logoUrl ? (
            <Image src={logoUrl} style={{ width: 46, height: 46, objectFit: "contain" }} />
          ) : (
            <Text
              style={{
                fontFamily: PDF_FONT_FAMILY,
                fontWeight: PDF_WEIGHT.semibold,
                fontSize: 15,
                color: isBrand ? brand.onBrand : ramp.onWhite,
              }}
            >
              {companyInitials(companyName)}
            </Text>
          )}
        </View>

        <View style={{ flex: 1 }}>
          <Text
            style={{
              fontFamily: PDF_FONT_FAMILY,
              fontWeight: PDF_WEIGHT.bold,
              fontSize: PDF_TYPE.heroTitle,
              color: brand.onBrand,
              marginBottom: 2,
            }}
          >
            {companyName}
          </Text>
          {lines.map((line, i) => (
            <Text
              key={i}
              style={{ fontSize: PDF_TYPE.heroMeta, color: brand.onBrandMuted, marginTop: 1 }}
            >
              {line}
            </Text>
          ))}
        </View>
      </View>

      {/* Figure. Right-aligned against the page margin, so it lines up with the
          totals card further down the page. */}
      <View style={{ alignItems: "flex-end" }}>
        {status && (
          <View
            style={{
              backgroundColor: status.bg,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: PDF_RADIUS.pill,
              marginBottom: PDF_SPACE.sm,
            }}
          >
            <Text
              style={{
                fontFamily: PDF_FONT_FAMILY,
                fontWeight: PDF_WEIGHT.semibold,
                fontSize: PDF_TYPE.caption + 0.5,
                color: status.text,
              }}
            >
              {status.label}
            </Text>
          </View>
        )}
        {figureLabel && (
          <Text style={{ fontSize: PDF_TYPE.caption, color: brand.onBrandMuted, marginBottom: 1 }}>
            {figureLabel}
          </Text>
        )}
        {figure && (
          <Text
            style={{
              fontFamily: PDF_FONT_FAMILY,
              fontWeight: PDF_WEIGHT.bold,
              fontSize: PDF_TYPE.heroFigure,
              color: isBrand ? brand.onBrand : ramp.onWhite,
            }}
          >
            {figure}
          </Text>
        )}
        {figureCaption && (
          <Text style={{ fontSize: PDF_TYPE.heroMeta, color: brand.onBrandMuted, marginTop: 1 }}>
            {figureCaption}
          </Text>
        )}
      </View>
    </View>
  );
}

/** The page-margin-aligned body the hero sits above. */
export const PDF_BODY_STYLE = {
  paddingHorizontal: PDF_PAGE_MARGIN,
  paddingTop: PDF_SPACE.xl,
  backgroundColor: PDF_COLORS.surface,
} as const;
