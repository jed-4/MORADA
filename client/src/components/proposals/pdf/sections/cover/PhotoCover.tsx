import { Image, Text, View } from '@react-pdf/renderer';
import { PDF_COLORS } from '@/components/pdf/shared/pdfTokens';
import { PDF_FONT_FAMILY } from '@/components/pdf/shared/registerPdfFonts';
import { CoverFactColumns, CoverLabel } from './CoverPieces';
import type { CoverTemplateProps } from './types';

/**
 * How much of the sheet the image takes, in points on A4.
 *
 * Two heights, because the panel below is a fixed sheet and not a flowing
 * page: a section note that did not fit would push the panel onto a second
 * page and leave the photograph stranded alone on the first. Giving the note
 * its room up front is cheaper than detecting the overflow afterwards.
 */
const IMAGE_HEIGHT = 470;
const IMAGE_HEIGHT_WITH_NOTE = 380;

/**
 * The brochure one: a full-bleed image over a colour panel carrying the facts.
 *
 * Everything below the image sits on the primary colour, so the ink comes from
 * the brand ramp rather than being hard-coded white — a builder branded pale
 * sage would otherwise get white text on a light green panel. The secondary
 * colour is the rule dividing the two halves, which is the join the eye
 * actually lands on.
 *
 * Without an image the page must still look deliberate rather than broken, so
 * the top half becomes a wash of the secondary colour carrying the company
 * name. That is a worse cover than a photograph, but it is a cover.
 */
export function PhotoCover({ facts, palette, companyName, companyLogo, companyPhone }: CoverTemplateProps) {
  const { primary, secondary } = palette;
  const imageHeight = facts.note ? IMAGE_HEIGHT_WITH_NOTE : IMAGE_HEIGHT;

  return (
    <>
      {facts.imagePath ? (
        <Image
          src={facts.imagePath}
          style={{ width: '100%', height: imageHeight, objectFit: 'cover' }}
        />
      ) : (
        <View
          style={{
            height: imageHeight,
            backgroundColor: secondary.wash,
            justifyContent: 'center',
            paddingHorizontal: 48,
          }}
        >
          {companyLogo ? (
            <Image src={companyLogo} style={{ width: 120, height: 64, objectFit: 'contain' }} />
          ) : (
            <Text
              style={{
                fontSize: 28,
                fontFamily: PDF_FONT_FAMILY,
                fontWeight: 700,
                color: secondary.onWhite,
                letterSpacing: 1,
              }}
            >
              {companyName}
            </Text>
          )}
        </View>
      )}

      {/* The join the eye lands on. */}
      <View style={{ height: 5, backgroundColor: secondary.base }} />

      <View style={{ flexGrow: 1, backgroundColor: primary.base, paddingHorizontal: 40, paddingTop: 28, paddingBottom: 32 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
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
                fontFamily: PDF_FONT_FAMILY,
                fontWeight: 700,
                color: primary.onWhite,
                letterSpacing: 1.5,
              }}
            >
              PROPOSAL
            </Text>
          </View>
          {facts.price ? (
            <View style={{ marginLeft: 'auto', alignItems: 'flex-end' }}>
              <CoverLabel color={primary.onBrandMuted}>{facts.priceLabel}</CoverLabel>
              <Text style={{ fontSize: 20, fontFamily: PDF_FONT_FAMILY, fontWeight: 700, color: primary.onBrand }}>
                {facts.price}
              </Text>
            </View>
          ) : null}
        </View>

        <Text
          style={{
            fontSize: 26,
            fontFamily: PDF_FONT_FAMILY,
            fontWeight: 700,
            color: primary.onBrand,
            lineHeight: 1.2,
          }}
        >
          {facts.projectTitle}
        </Text>

        {facts.subtitle ? (
          <Text style={{ fontSize: 12, color: primary.onBrandMuted, marginTop: 6 }}>{facts.subtitle}</Text>
        ) : null}
        {facts.projectAddress ? (
          <Text style={{ fontSize: 10, color: primary.onBrandMuted, marginTop: 4 }}>{facts.projectAddress}</Text>
        ) : null}

        {facts.note ? (
          <Text style={{ fontSize: 10, color: primary.onBrandMuted, lineHeight: 1.6, marginTop: 12 }}>
            {facts.note}
          </Text>
        ) : null}

        <View style={{ marginTop: 22 }}>
          <CoverFactColumns
            clientName={facts.clientName}
            clientEmail={facts.clientEmail}
            dateText={facts.dateText}
            reference={facts.reference}
            labelColor={primary.onBrandMuted}
            valueColor={primary.onBrand}
            mutedColor={primary.onBrandMuted}
            gap={28}
          />
        </View>

        {/* Identity sits at the foot of the panel, not over the photograph:
            a name laid over an unknown image is unreadable as often as not. */}
        <View style={{ marginTop: 'auto', paddingTop: 20, flexDirection: 'row', alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 11, fontFamily: PDF_FONT_FAMILY, fontWeight: 700, color: primary.onBrand }}>
            {companyName}
          </Text>
          {companyPhone ? (
            <Text style={{ fontSize: 9, color: primary.onBrandMuted, marginLeft: 10 }}>{companyPhone}</Text>
          ) : null}
          {facts.expiryText ? (
            <Text style={{ fontSize: 9, color: primary.onBrandMuted, marginLeft: 'auto' }}>
              Valid until {facts.expiryText}
            </Text>
          ) : null}
        </View>
      </View>
    </>
  );
}
