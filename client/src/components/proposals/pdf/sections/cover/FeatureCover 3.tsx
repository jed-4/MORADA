import { Image, Text, View } from '@react-pdf/renderer';
import { PDF_COLORS } from '@/components/pdf/shared/pdfTokens';
import { PDF_FONT_FAMILY } from '@/components/pdf/shared/registerPdfFonts';
import { CoverLabel, CoverExpiry } from './CoverPieces';
import type { CoverTemplateProps } from './types';

/**
 * The bold one: the top third is a solid block of the primary colour with the
 * project title in it, and the client and reference sit on tinted cards below.
 *
 * Text on the block is taken from the brand ramp rather than hard-coded white,
 * because plenty of builders pick a pale brand and white on pale yellow is
 * unreadable. The cards are washed in the SECONDARY colour, which is the one
 * place on this page where a second colour does real work — it separates the
 * facts from the masthead without introducing a third grey.
 */
export function FeatureCover({ facts, palette, companyName, companyLogo, companyPhone }: CoverTemplateProps) {
  const { primary, secondary } = palette;

  return (
    <>
      <View
        style={{
          height: 310,
          backgroundColor: primary.base,
          paddingHorizontal: 40,
          paddingTop: 32,
          paddingBottom: 28,
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          {companyLogo ? (
            <View
              style={{
                width: 72,
                height: 44,
                borderRadius: 4,
                overflow: 'hidden',
                marginRight: 14,
              }}
            >
              <Image src={companyLogo} style={{ width: 72, height: 44, objectFit: 'contain' }} />
            </View>
          ) : null}
          <View style={{ justifyContent: 'center' }}>
            <Text style={{ fontSize: 13, fontFamily: PDF_FONT_FAMILY, fontWeight: 700, color: primary.onBrand }}>
              {companyName}
            </Text>
            {companyPhone ? (
              <Text style={{ fontSize: 9, color: primary.onBrandMuted, marginTop: 2 }}>{companyPhone}</Text>
            ) : null}
          </View>
        </View>

        <View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 }}>
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
          </View>
          <Text
            style={{
              fontSize: 30,
              fontFamily: PDF_FONT_FAMILY,
              fontWeight: 700,
              color: primary.onBrand,
              lineHeight: 1.2,
            }}
          >
            {facts.projectTitle}
          </Text>
          {facts.subtitle ? (
            <Text style={{ fontSize: 13, color: primary.onBrandMuted, marginTop: 6 }}>{facts.subtitle}</Text>
          ) : null}
          {facts.projectAddress ? (
            <Text style={{ fontSize: 10, color: primary.onBrandMuted, marginTop: 4 }}>{facts.projectAddress}</Text>
          ) : null}
        </View>
      </View>

      <View style={{ flexDirection: 'row', paddingHorizontal: 32, paddingTop: 24, gap: 14 }}>
        <View style={{ flex: 1, backgroundColor: secondary.wash, borderRadius: 5, padding: 16 }}>
          <CoverLabel color={secondary.onWhite}>PREPARED FOR</CoverLabel>
          {facts.clientName ? (
            <Text style={{ fontSize: 13, fontFamily: PDF_FONT_FAMILY, fontWeight: 700, color: PDF_COLORS.ink }}>
              {facts.clientName}
            </Text>
          ) : (
            <Text style={{ fontSize: 11, color: PDF_COLORS.inkFaint }}>—</Text>
          )}
          {facts.clientEmail ? (
            <Text style={{ fontSize: 9, color: PDF_COLORS.inkMuted, marginTop: 3 }}>{facts.clientEmail}</Text>
          ) : null}
        </View>

        <View style={{ flex: 1, backgroundColor: secondary.wash, borderRadius: 5, padding: 16 }}>
          <CoverLabel color={secondary.onWhite}>REFERENCE</CoverLabel>
          <Text style={{ fontSize: 11, color: PDF_COLORS.inkMuted }}>{facts.reference || '—'}</Text>
          <View style={{ marginTop: 12 }}>
            <CoverLabel color={secondary.onWhite}>DATE</CoverLabel>
            <Text style={{ fontSize: 11, color: PDF_COLORS.inkMuted }}>{facts.dateText}</Text>
          </View>
        </View>
      </View>

      {facts.price ? (
        <View
          style={{
            marginHorizontal: 32,
            marginTop: 24,
            paddingTop: 12,
            borderTopWidth: 2,
            borderTopColor: secondary.base,
          }}
        >
          <CoverLabel color={secondary.onWhite}>{facts.priceLabel}</CoverLabel>
          <Text style={{ fontSize: 24, fontFamily: PDF_FONT_FAMILY, fontWeight: 700, color: PDF_COLORS.ink }}>
            {facts.price}
          </Text>
        </View>
      ) : null}

      <CoverExpiry
        text={facts.expiryText}
        color={PDF_COLORS.inkFaint}
        style={{ paddingHorizontal: 32, marginTop: 16 }}
      />

      {facts.note ? (
        <Text
          style={{
            paddingHorizontal: 32,
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
