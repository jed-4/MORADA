import { Text, View } from '@react-pdf/renderer';
import { PDF_COLORS } from '@/components/pdf/shared/pdfTokens';
import { PDF_FONT_FAMILY } from '@/components/pdf/shared/registerPdfFonts';

/** The small caps label above every field on a cover. */
export function CoverLabel({ children, color }: { children: string; color: string }) {
  return (
    <Text
      style={{
        fontSize: 8,
        fontFamily: PDF_FONT_FAMILY,
        fontWeight: 700,
        color,
        textTransform: 'uppercase',
        letterSpacing: 0.8,
        marginBottom: 6,
      }}
    >
      {children}
    </Text>
  );
}

/**
 * Prepared for / Date / Reference, in whatever ink the template needs.
 *
 * All three covers show the same four facts; only the ground under them
 * changes, so the colours are parameters and the composition is not.
 */
export function CoverFactColumns({
  clientName,
  clientEmail,
  dateText,
  reference,
  labelColor,
  valueColor,
  mutedColor,
  gap = 40,
}: {
  clientName: string;
  clientEmail: string;
  dateText: string;
  reference: string;
  labelColor: string;
  valueColor: string;
  mutedColor: string;
  gap?: number;
}) {
  return (
    <View style={{ flexDirection: 'row', gap }}>
      <View style={{ flex: 1 }}>
        <CoverLabel color={labelColor}>PREPARED FOR</CoverLabel>
        {clientName ? (
          <Text style={{ fontSize: 13, fontFamily: PDF_FONT_FAMILY, fontWeight: 700, color: valueColor }}>
            {clientName}
          </Text>
        ) : (
          <Text style={{ fontSize: 11, color: mutedColor }}>—</Text>
        )}
        {clientEmail ? (
          <Text style={{ fontSize: 9, color: mutedColor, marginTop: 3 }}>{clientEmail}</Text>
        ) : null}
      </View>

      <View style={{ flex: 1 }}>
        <CoverLabel color={labelColor}>DATE</CoverLabel>
        <Text style={{ fontSize: 11, color: mutedColor }}>{dateText}</Text>
        <View style={{ marginTop: 14 }}>
          <CoverLabel color={labelColor}>REFERENCE</CoverLabel>
          <Text style={{ fontSize: 11, color: mutedColor }}>{reference || '—'}</Text>
        </View>
      </View>
    </View>
  );
}

/** "This proposal is valid until …", in the one place it belongs. */
export function CoverExpiry({ text, color, style }: { text: string | null; color: string; style?: object }) {
  if (!text) return null;
  return <Text style={{ fontSize: 9, color, ...style }}>This proposal is valid until {text}</Text>;
}

export const COVER_INK = PDF_COLORS;
