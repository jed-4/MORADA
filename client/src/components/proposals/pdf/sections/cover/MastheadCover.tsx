import { Text, View } from '@react-pdf/renderer';
import { PDF_COLORS, PDF_SPACE } from '@/components/pdf/shared/pdfTokens';
import { PdfHeroBand } from '@/components/pdf/shared/PdfHeroBand';
import { PDF_FONT_FAMILY } from '@/components/pdf/shared/registerPdfFonts';
import { CoverFactColumns, CoverExpiry } from './CoverPieces';
import type { CoverTemplateProps } from './types';

/**
 * The quiet one: a white page, the company band across the top, the project
 * set large underneath.
 *
 * The band carries identity, status and the headline figure together rather
 * than spreading them over three stacked blocks — the kit's note is that
 * "three identity blocks is two too many". It is also why no price block
 * appears further down the page: printing the figure twice on one sheet only
 * invites the reader to check that the two agree.
 *
 * The secondary colour appears as the accent rule and the field labels, which
 * is the most it can do on a page whose whole point is restraint.
 */
export function MastheadCover({ facts, palette, companyName, companyLogo, companyPhone }: CoverTemplateProps) {
  const { primary, secondary } = palette;

  return (
    <>
      <PdfHeroBand
        companyName={companyName}
        logoUrl={companyLogo}
        contactLines={[companyPhone]}
        brandColor={primary.base}
        status={{ label: 'Proposal', bg: primary.wash, text: primary.onWhite }}
        figure={facts.price}
        figureLabel={facts.price ? facts.priceLabel : null}
        figureCaption={facts.reference || null}
        variant="light"
      />

      <View style={{ paddingTop: PDF_SPACE.xl }} />

      <View
        style={{
          marginLeft: 40,
          width: 80,
          height: 3,
          backgroundColor: secondary.base,
          marginBottom: 10,
        }}
      />

      <Text
        style={{
          marginHorizontal: 40,
          fontSize: 30,
          fontFamily: PDF_FONT_FAMILY,
          fontWeight: 700,
          color: PDF_COLORS.ink,
          lineHeight: 1.2,
        }}
      >
        {facts.projectTitle}
      </Text>

      {facts.subtitle ? (
        <Text style={{ marginHorizontal: 40, fontSize: 13, color: PDF_COLORS.inkMuted, marginTop: 8 }}>
          {facts.subtitle}
        </Text>
      ) : null}

      {facts.projectAddress ? (
        <Text style={{ marginHorizontal: 40, fontSize: 10, color: PDF_COLORS.inkFaint, marginTop: 4 }}>
          {facts.projectAddress}
        </Text>
      ) : null}

      <View
        style={{
          marginHorizontal: 40,
          height: 1,
          backgroundColor: PDF_COLORS.border,
          marginTop: 28,
          marginBottom: 24,
        }}
      />

      <View style={{ paddingHorizontal: 40 }}>
        <CoverFactColumns
          clientName={facts.clientName}
          clientEmail={facts.clientEmail}
          dateText={facts.dateText}
          reference={facts.reference}
          labelColor={secondary.onWhite}
          valueColor={PDF_COLORS.ink}
          mutedColor={PDF_COLORS.inkMuted}
        />
      </View>

      <CoverExpiry
        text={facts.expiryText}
        color={PDF_COLORS.inkFaint}
        style={{ marginHorizontal: 40, marginTop: 24 }}
      />

      {facts.note ? (
        <Text
          style={{
            marginHorizontal: 40,
            fontSize: 11,
            color: PDF_COLORS.inkMuted,
            lineHeight: 1.6,
            marginTop: 16,
          }}
        >
          {facts.note}
        </Text>
      ) : null}
    </>
  );
}
