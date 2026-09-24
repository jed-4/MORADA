import { PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";

/**
 * Per-section control over how the prose is set: alignment, body size, family.
 *
 * Until now every one of these was a constant baked into a section component.
 * The closing section, for instance, was hard-coded to 14pt centred — fine for
 * the one sign-off sentence it was designed around, wrong for anything longer,
 * and there was no way to change it short of editing the component. A template
 * is exactly where that matters: the whole point of building one is to fix the
 * look once.
 *
 * It lives in `section.content.textStyle`, so it is ordinary section content —
 * it saves, it copies into a template, and it comes back out with the template.
 * No migration: the column is already jsonb.
 */
export interface SectionTextStyle {
  align: "left" | "center" | "right" | "justify";
  /** Body size in points. Headings and list items scale with it. */
  fontSize: number;
  fontFamily: string;
}

/** The size the block styles in RichTextBlocks are written against. */
export const BODY_FONT_SIZE = 11;

export const DEFAULT_SECTION_TEXT_STYLE: SectionTextStyle = {
  align: "left",
  fontSize: BODY_FONT_SIZE,
  fontFamily: PDF_FONT_FAMILY,
};

export const TEXT_ALIGN_OPTIONS = [
  { value: "left", label: "Left" },
  { value: "center", label: "Centre" },
  { value: "right", label: "Right" },
  { value: "justify", label: "Justified" },
] as const;

export const TEXT_SIZE_OPTIONS = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24];

/**
 * Only fonts the renderer can actually resolve.
 *
 * Inter is the registered family (see registerPdfFonts). The other three are
 * PDF core fonts, which @react-pdf resolves without registration INCLUDING
 * their bold and italic faces — so a <strong> or <em> inside the prose still
 * renders instead of throwing "Could not resolve font". Nothing else may be
 * added here without registering real face files for all four combinations.
 */
export const TEXT_FONT_OPTIONS = [
  { value: PDF_FONT_FAMILY, label: "Inter (default)" },
  { value: "Helvetica", label: "Helvetica" },
  { value: "Times-Roman", label: "Times" },
  { value: "Courier", label: "Courier" },
];

const ALIGNS = new Set(TEXT_ALIGN_OPTIONS.map((o) => o.value as string));
const FAMILIES = new Set(TEXT_FONT_OPTIONS.map((o) => o.value));

/**
 * Read the style off a section's content, falling back a field at a time.
 *
 * Deliberately tolerant: this runs against jsonb written by older builds and
 * by hand-edited templates, and a bad value must degrade to the default rather
 * than reach @react-pdf, where an unknown family is a render-killing throw.
 */
export function resolveSectionTextStyle(
  content: Record<string, unknown> | null | undefined,
  fallback: Partial<SectionTextStyle> = {},
): SectionTextStyle {
  const base = { ...DEFAULT_SECTION_TEXT_STYLE, ...fallback };
  const raw = (content?.textStyle ?? null) as Partial<SectionTextStyle> | null;
  if (!raw || typeof raw !== "object") return base;

  const align = typeof raw.align === "string" && ALIGNS.has(raw.align) ? raw.align : base.align;
  const size = Number(raw.fontSize);
  const fontSize = Number.isFinite(size) && size >= 6 && size <= 48 ? size : base.fontSize;
  const fontFamily =
    typeof raw.fontFamily === "string" && FAMILIES.has(raw.fontFamily)
      ? raw.fontFamily
      : base.fontFamily;

  return { align, fontSize, fontFamily };
}

/** Scale a size that was written against BODY_FONT_SIZE. Headings track the body. */
export function scaleFont(base: number, style: SectionTextStyle): number {
  const scaled = (base * style.fontSize) / BODY_FONT_SIZE;
  return Math.round(scaled * 10) / 10;
}
