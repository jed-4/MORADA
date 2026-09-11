import { View, Text } from "@react-pdf/renderer";
import { registerPdfFonts, PDF_FONT_FAMILY } from "./registerPdfFonts";
import { PDF_COLORS, PDF_LEADING, PDF_SPACE, PDF_TYPE, PDF_WEIGHT } from "./pdfTokens";
import { PdfPanel } from "./PdfPrimitives";

/**
 * Who it's for, where the job is, and what this document is.
 *
 * Every Morada document has these three facts and none of them had a home.
 * The variation dropped all of it into one "VARIATION DETAILS" grid, mixing
 * the recipient (Client, Email, Phone) with the site (Project, Address) and
 * with the document's own metadata (Name, Deadline, Days changed) — three
 * different kinds of fact reading as one list.
 *
 * The block it replaces, DocProjectBar, was worse than untidy: its props are
 * hard-coded to a CLIENT (`clientName` / `clientEmail` / `clientPhone`), so
 * Purchase Orders and RFQs — where the counterparty is a supplier — pass only
 * the project and the recipient never appears at all. You could send a
 * purchase order that does not name who it is addressed to. `recipient.label`
 * is why this one takes a label instead of assuming.
 */

registerPdfFonts();

export interface PdfPartyBlock {
  /** "To", "Supplier", "Project", "Document". */
  label: string;
  /** The bold first line — a person, a company, a job name. */
  title?: string | null;
  /** Free lines under the title: address, email, phone. Falsy entries drop. */
  lines?: Array<string | null | undefined>;
  /** Label/value pairs, for metadata rather than an address. */
  fields?: Array<{ label: string; value?: string | null }>;
}

export interface PdfPartiesPanelProps {
  recipient?: PdfPartyBlock | null;
  project?: PdfPartyBlock | null;
  document?: PdfPartyBlock | null;
  /**
   * "columns" — the default, and Jed's pick from the two rendered side by
   * side: all three blocks in one row. "stacked" puts recipient and project on
   * top with the document metadata underneath. Both were built because the
   * choice could not be made from a description; the loser stays because the
   * other documents may want it (a site diary has no recipient at all).
   */
  layout?: "columns" | "stacked";
}

function BlockLabel({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontFamily: PDF_FONT_FAMILY,
        fontWeight: PDF_WEIGHT.semibold,
        fontSize: PDF_TYPE.sectionLabel,
        letterSpacing: PDF_TYPE.sectionLabelTracking,
        color: PDF_COLORS.inkFaint,
        textTransform: "uppercase",
        marginBottom: PDF_SPACE.sm,
      }}
    >
      {children}
    </Text>
  );
}

/** Title + address lines. */
function BlockBody({ block }: { block: PdfPartyBlock }) {
  const lines = (block.lines ?? []).filter((l): l is string => !!l && !!l.trim());
  return (
    <View>
      {block.title ? (
        <Text
          style={{
            fontFamily: PDF_FONT_FAMILY,
            fontWeight: PDF_WEIGHT.semibold,
            fontSize: PDF_TYPE.fieldValue,
            color: PDF_COLORS.ink,
            lineHeight: PDF_LEADING.tight,
            marginBottom: lines.length ? 2 : 0,
          }}
        >
          {block.title}
        </Text>
      ) : null}
      {lines.map((line, i) => (
        <Text
          key={i}
          style={{
            fontSize: PDF_TYPE.bodySmall,
            color: PDF_COLORS.inkMuted,
            lineHeight: PDF_LEADING.tight,
            marginTop: 1,
          }}
        >
          {line}
        </Text>
      ))}
    </View>
  );
}

/** Label/value pairs stacked down a column. */
function BlockFields({ fields }: { fields: NonNullable<PdfPartyBlock["fields"]> }) {
  const shown = fields.filter((f) => f.value && String(f.value).trim());
  return (
    <View>
      {shown.map((f, i) => (
        <View
          key={`${f.label}-${i}`}
          style={{ flexDirection: "row", justifyContent: "space-between", marginTop: i === 0 ? 0 : 3 }}
        >
          <Text style={{ fontSize: PDF_TYPE.bodySmall, color: PDF_COLORS.inkMuted, paddingRight: 8 }}>
            {f.label}
          </Text>
          <Text
            style={{
              fontFamily: PDF_FONT_FAMILY,
              fontWeight: PDF_WEIGHT.medium,
              fontSize: PDF_TYPE.bodySmall,
              color: PDF_COLORS.ink,
              textAlign: "right",
            }}
          >
            {f.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

/** Label/value pairs laid out ACROSS, for the stacked layout's bottom row. */
function BlockFieldsRow({ fields }: { fields: NonNullable<PdfPartyBlock["fields"]> }) {
  const shown = fields.filter((f) => f.value && String(f.value).trim());
  if (shown.length === 0) return null;
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
      {shown.map((f, i) => (
        <View key={`${f.label}-${i}`} style={{ width: "25%", paddingRight: PDF_SPACE.md, marginBottom: 2 }}>
          <Text style={{ fontSize: PDF_TYPE.caption, color: PDF_COLORS.inkFaint, marginBottom: 1 }}>
            {f.label}
          </Text>
          <Text
            style={{
              fontFamily: PDF_FONT_FAMILY,
              fontWeight: PDF_WEIGHT.medium,
              fontSize: PDF_TYPE.bodySmall,
              color: PDF_COLORS.ink,
            }}
          >
            {f.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Block({ block }: { block: PdfPartyBlock }) {
  return (
    <View>
      <BlockLabel>{block.label}</BlockLabel>
      {block.fields ? <BlockFields fields={block.fields} /> : <BlockBody block={block} />}
    </View>
  );
}

export function PdfPartiesPanel({
  recipient,
  project,
  document,
  layout = "columns",
}: PdfPartiesPanelProps) {
  const present = [recipient, project, document].filter(Boolean) as PdfPartyBlock[];
  if (present.length === 0) return null;

  if (layout === "stacked") {
    const top = [recipient, project].filter(Boolean) as PdfPartyBlock[];
    return (
      <PdfPanel>
        {top.length > 0 && (
          <View style={{ flexDirection: "row", padding: 14 }}>
            {top.map((b, i) => (
              <View
                key={b.label}
                style={{
                  flex: 1,
                  paddingLeft: i === 0 ? 0 : 14,
                  borderLeftWidth: i === 0 ? 0 : 1,
                  borderLeftColor: PDF_COLORS.border,
                }}
              >
                <Block block={b} />
              </View>
            ))}
          </View>
        )}
        {document && (
          <View
            style={{
              paddingHorizontal: 14,
              paddingVertical: 12,
              borderTopWidth: top.length > 0 ? 1 : 0,
              borderTopColor: PDF_COLORS.border,
              backgroundColor: PDF_COLORS.surfaceSubtle,
            }}
          >
            <BlockLabel>{document.label}</BlockLabel>
            {document.fields ? <BlockFieldsRow fields={document.fields} /> : <BlockBody block={document} />}
          </View>
        )}
      </PdfPanel>
    );
  }

  return (
    <PdfPanel>
      <View style={{ flexDirection: "row", padding: 14 }}>
        {present.map((b, i) => (
          <View
            key={b.label}
            style={{
              flex: 1,
              paddingLeft: i === 0 ? 0 : 14,
              paddingRight: i === present.length - 1 ? 0 : 14,
              borderLeftWidth: i === 0 ? 0 : 1,
              borderLeftColor: PDF_COLORS.border,
            }}
          >
            <Block block={b} />
          </View>
        ))}
      </View>
    </PdfPanel>
  );
}

/**
 * The document's subject line.
 *
 * Previously this was a field labelled "Name" sitting inside the details grid,
 * which is the wrong shape: "Kitchen and bathroom re-scope" is not metadata
 * about the document, it IS the document.
 */
export function PdfDocumentTitle({ children }: { children: string }) {
  return (
    <Text
      style={{
        fontFamily: PDF_FONT_FAMILY,
        fontWeight: PDF_WEIGHT.bold,
        fontSize: PDF_TYPE.heroTitle,
        color: PDF_COLORS.ink,
        lineHeight: PDF_LEADING.tight,
        marginBottom: PDF_SPACE.lg,
      }}
    >
      {children}
    </Text>
  );
}
