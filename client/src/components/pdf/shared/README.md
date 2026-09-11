# The PDF document kit

What is actually in `client/src/components/pdf/shared/` as of `c353c1b4`, written
as a handover for the proposal document. **This describes the code as built, not
as it ought to be.** Where something is missing or unresolved it says so, because
the gaps are the part worth knowing before you copy anything.

The reference implementation is
[`client/src/components/variations/pdf/VariationDocument.tsx`](../../variations/pdf/VariationDocument.tsx).
Invoice, purchase order and RFQ also render from this kit and are worth a look
for how a document with a different shape uses it.

---

## 1. What's in the directory

| File | What it is | Status |
|---|---|---|
| `pdfTokens.ts` | Colour, type, spacing, radii, `brandRamp()` | New. The one source of literals. |
| `registerPdfFonts.ts` | Inter, 8 faces | Pre-existing, extended |
| `pdfColor.ts` | `tintOnWhite()` | Pre-existing, **unchanged** |
| `pdfStatus.ts` | One status-chip palette for all documents | New |
| `PdfHeroBand.tsx` | The masthead | New |
| `PdfPartiesPanel.tsx` | To / Project / Document block + `PdfDocumentTitle` | New |
| `PdfPrimitives.tsx` | `PdfSection`, `PdfPanel`, `PdfTotalsCard`, `PdfSignatureCards`, `PdfCallout`, `PdfFieldGrid`, `PdfProse` | New |
| `PdfLineTable.tsx` | The priced-rows table, `PdfSimpleRows`, `PdfDocFooter` | New |
| `DocBrandedHeader.tsx` | Legacy masthead | **Proposal sections still use this** |
| `DocFooter.tsx` | Legacy footer | **Proposal sections still use this** |
| `DocProposalInnerHeader.tsx` | Proposal running header | Retokened, still yours |

Nothing was forked. `DocProjectBar.tsx` was **deleted** — its props were
hard-coded to a client (`clientName`/`clientEmail`/`clientPhone`), so purchase
orders and RFQs passed only the project and never named their supplier.
`PdfPartiesPanel` takes a labelled recipient instead.

`DocBrandedHeader` / `DocFooter` / `DocProposalInnerHeader` were retokened in
place (warm ink, Inter, `PDF_COLORS`) but **not restructured**, because the
proposal still renders from them. If you move the proposal onto `PdfHeroBand`,
all three become deletable.

### One thing to correct up front

**There is no `StyleSheet.create` in the new kit.** Everything is inline style
objects. That was deliberate — nearly every style here depends on the runtime
brand colour via `brandRamp(brandColor)`, and `StyleSheet.create` at module
scope can't see a prop. The only survivor is `DocBrandedHeader`, which builds
its sheet *inside* the component for the same reason.

So: lift the token values, not a stylesheet.

---

## 2. Type

Registered in `registerPdfFonts.ts` as family **`Inter`**, eight faces, all
`.woff` (fontkit reads TTF/OTF/WOFF but **not WOFF2**), vendored at
`client/public/fonts/`, all from `@fontsource/inter@5.1.0`:

```
Inter-400.woff  Inter-500.woff  Inter-600.woff  Inter-700.woff
Inter-400i.woff Inter-500i.woff Inter-600i.woff Inter-700i.woff
```

> **Read this before you touch fonts.** @react-pdf does **not** synthesise a
> slant. Ask a family with no italic face for `fontStyle: "italic"` and it
> throws `Could not resolve font` and takes the whole render down. Your
> `RichTextBlocks` maps a builder's `<em>` straight onto that style — so
> italicising one word in a proposal produced no PDF at all until the italic
> faces landed. The uprights originally came from `@fontsource/inter@4.5.15`,
> which packages Inter 3 and ships **no italic**; Inter only gained a true
> italic in v4. All eight now come from one version so metrics can't mismatch.

Also registered: `Font.registerHyphenationCallback((word) => [word])` — no
hyphenation. It was chopping supplier names mid-word in narrow columns.

### The scale (`PDF_TYPE`, verbatim)

```ts
export const PDF_TYPE = {
  heroTitle: 16,
  heroFigure: 20,
  heroMeta: 9,

  docTitle: 13,
  sectionLabel: 8,
  sectionLabelTracking: 0.6,

  body: 9.5,
  bodySmall: 8.5,
  fieldLabel: 8,
  fieldValue: 10,

  tableHeader: 8,
  tableCell: 8.5,

  totalLabel: 10,
  totalFigure: 14,

  caption: 7,
} as const;

export const PDF_WEIGHT = { regular: 400, medium: 500, semibold: 600, bold: 700 };
export const PDF_LEADING = { tight: 1.25, body: 1.5, relaxed: 1.6 } as const;
```

### Role → values

| Role | size | weight | colour | other |
|---|---|---|---|---|
| Page/document title | 16 | 700 | `ink` | `lineHeight: 1.25` |
| Hero figure (the money) | 20 | 700 | `brand.onBrand` on the band, `brand.onWhite` on a light masthead | |
| Section heading | 8 | 600 | `inkMuted` | **uppercase**, `letterSpacing: 0.6`, `marginBottom: 10` |
| Table column header | 8 | 600 | `brand.onBrand` | no transform, no tracking |
| Table body row | 8.5 | 400 | `ink` | drops to **7.5** when columns are squeezed (§4) |
| Group heading row | 8 | 600 | `inkMuted` | **uppercase**, `letterSpacing: 0.4` |
| Totals-card rows | 8.5 | 400 label / 500 value | `inkMuted` / `ink` | |
| Totals-card subtotal row | 8.5 | 600 both | `ink` | rule above |
| Grand total | label **10** / figure **14** | 700 | `brand.onWhite` | |
| Small print / caption | 7 | 400 | `inkFaint` | |
| Body prose | 9.5 | 400 | `ink` | `lineHeight: 1.5` |

Note the section heading is the *only* thing that is uppercase + tracked. The
table header is deliberately not — it's already on a coloured fill and doing
both was too much.

---

## 3. Colour

```ts
export const PDF_COLORS = {
  ink: "#2C2825",            // --foreground
  inkMuted: "#6B6561",       // --muted-foreground
  inkFaint: "#A39C94",       // captions, footer
  surface: "#FFFFFF",
  surfaceSubtle: "#FAF9F7",  // zebra rows, inset panels
  surfaceMuted: "#F2F1EE",   // group header rows
  border: "#E9E9E7",         // --border. Every hairline.
  borderStrong: "#DCDAD6",   // a division rather than a hairline
  brandFallback: "#87749A",  // --primary, only when a company has set none
} as const;

export const PDF_ACCENTS = {
  positive: "#83C9A2", positiveWash: "#EAF6EF",
  negative: "#DA998B", negativeWash: "#F9EFEC",
  caution:  "#D5B772", cautionWash:  "#F8F3E8",
  info:     "#71CAD1", infoWash:     "#E8F6F8",
} as const;
```

### `brandRamp(brandColor)` — derive, never hard-code

```ts
export function brandRamp(brandColor?: string | null): PdfBrandRamp {
  const base = (brandColor || PDF_COLORS.brandFallback).trim();
  const isLight = luminance(base) > 0.5;
  return {
    base,
    gradientTo:   lighten(base, 0.3),
    onBrand:      isLight ? PDF_COLORS.ink : "#FFFFFF",
    onBrandMuted: isLight ? PDF_COLORS.inkMuted : "rgba(255,255,255,0.78)",
    wash:         tintOnWhite(base, 0.08),
    rule:         tintOnWhite(base, 0.25),
    onWhite:      inkOnWhite(base),
  };
}
```

**Two rules that matter more than they look:**

- `base` is for **grounds**. `onWhite` is for **ink on a white page**. A pale
  brand (a yellow, say) is a fine table header and an unreadable total —
  `onWhite` darkens by multiplying channels, preserving hue, until it clears
  4.5:1. Never use `base` as text on white.
- `onBrand` flips to dark ink on a pale brand. Without it a builder with a
  yellow brand gets white-on-cream column headers.

**No alpha, anywhere.** `tintOnWhite` exists because @react-pdf renders a
**transparent BORDER colour as bright green** — not the tint, green. Background
colours accept alpha fine, which is why it went unnoticed for so long. The rule
in this kit is: never hand any colour an alpha channel; pre-blend against white.
See the header comment in `pdfColor.ts`.

### Where brand appears, and where it deliberately doesn't

**Brand:** the hero band (a real gradient — see §7), the **table column header
fill**, the totals-card rule + grand total text, the emphasised cell of the
contract-summary strip, `PdfCallout`'s left rule.

**Neutral on purpose:** every table body row, every hairline, group header rows
(`surfaceMuted` + `inkMuted`), all section headings, the footer. The previous
variation document tinted body rows `brandColor + "14"` and it made a busy page
noisier without helping anyone read it.

---

## 4. Table anatomy

`PdfLineTable.tsx`. This is the part you asked most about, so it's the most
detailed — including what it **doesn't** do.

### Column widths

A **mix**: fixed-point numeric columns plus one flexible text cell that absorbs
the remainder.

```ts
/** A4 (595pt) less both 40pt margins, less the panel's own 20pt of padding. */
const USABLE_WIDTH = 595 - 80 - 20;   // 495
const MIN_TEXT_WIDTH = 120;

const fixedTotal = columns.reduce((sum, c) => sum + c.width, 0);
const textWidth  = USABLE_WIDTH - fixedTotal;
const squeeze =
  showText && textWidth < MIN_TEXT_WIDTH && fixedTotal > 0
    ? Math.max(0.62, (USABLE_WIDTH - MIN_TEXT_WIDTH) / fixedTotal)
    : 1;
const widthOf = (c) => (squeeze === 1 ? c.width : Math.floor(c.width * squeeze));
```

**Yes, it fills the content width** — the text cell is `flex: 1`, so whatever
the numeric columns don't take, it does.

The squeeze is the bit worth stealing. The variation offers nine optional
numeric columns totalling 448pt of the 495 available, which left the text cell
~47pt: a description set one short word per line and a fourteen-row table ran to
**five pages**. Rather than refuse a column the builder asked for, the numeric
columns give up width proportionally (floor 0.62) until the text cell clears
120pt, and body text drops 8.5 → 7.5. Same document went five pages to three.

Variation's fixed widths, for calibration:

```ts
{ costCode: 52, quantity: 34, unit: 32, unitCost: 56, unitPrice: 56,
  markupPercent: 38, markupAmount: 56, amountEx: 60, amountInc: 64 }
```

Currency still fits at the floor: tightest result ~40pt, and `$46,062.50` needs
38pt at 8.5pt Inter.

### The column header row

**Filled** with `brand.base`, text `brand.onBrand` at 8/600. No rule. Padding
`10pt` horizontal, `6pt` vertical.

```ts
<View style={{ flexDirection: "row", backgroundColor: brand.base,
               paddingHorizontal: 10, paddingVertical: 6 }}>
```

- **It repeats at the top of every page the table spans**, via `fixed` on the
  header View, controlled by `repeatHeader` (default `true`). A second page of
  unlabelled figures makes the reader page back to find out which column is the
  price. Turn it off for a short table sitting near a page boundary, where
  @react-pdf can otherwise draw the header twice on one page.
- **It prints once per table, never per group.** Groups render inside the same
  panel under one header.

### Row separators

Hairline **and** zebra, both:

```ts
borderTopWidth: 1,
borderTopColor: PDF_COLORS.border,           // #E9E9E7
backgroundColor: idx % 2 === 1 ? PDF_COLORS.surfaceSubtle : PDF_COLORS.surface,
                                             // #FAF9F7 / #FFFFFF
```

1pt is the thinnest @react-pdf reliably draws; 0.5 renders inconsistently.

Zebra runs **continuously down the table**, not per group. Restarting it at each
group put two shaded rows back to back across a boundary, which reads as one
tall row rather than two.

### Row padding and height

`paddingHorizontal: 10`, `paddingVertical: 5`, `alignItems: "flex-start"`.
Height is content-driven — a two-line description makes a taller row. Rows carry
`wrap={false}` so a single row never splits across a page.

Group header rows: `paddingVertical: 4` (tighter than a body row).
Trailing rows: `paddingVertical: 6` (looser — they carry weight).

### Numeric alignment and the right edge

```ts
const cell = (align, width) => ({
  width,
  flex: width ? undefined : 1,
  textAlign: align,
  paddingRight: align === "right" ? 0 : 6,
  paddingLeft:  align === "right" ? 5 : 0,
});
```

Right-aligned columns get **zero right padding**, so the last column's figures
sit flush on the panel's inner edge, and the totals card below aligns with them.
The 5pt **left** padding exists because squeezed headers ran into each other
(`Unit PriceMkup %`) — figures are shorter than their headers, so the collision
only ever shows up in the header row.

No `tabular-nums`: @react-pdf has no `fontVariantNumeric`, and Inter's default
figures are near-tabular enough at these sizes that it hasn't been a problem.

---

## 5. Grouping

Deliberately **light**, and the opposite of what you have:

```ts
<View style={{ flexDirection: "row", justifyContent: "space-between",
               alignItems: "center",
               paddingHorizontal: 10, paddingVertical: 4,
               backgroundColor: PDF_COLORS.surfaceMuted,   // #F2F1EE
               borderTopWidth: 1, borderTopColor: PDF_COLORS.border }}>
  <Text style={{ fontFamily: PDF_FONT_FAMILY, fontWeight: 600, fontSize: 8,
                 letterSpacing: 0.4, textTransform: "uppercase",
                 color: PDF_COLORS.inkMuted }}>{group.label}</Text>
  {group.total && <Text style={{ /* same, no tracking */ }}>{group.total}</Text>}
</View>
```

A **neutral grey band with muted uppercase text**, not a brand bar. The brand is
spent once, on the column header. A brand bar per group made a six-group table
look like six tables.

The group total sits **right-aligned on the heading row itself**, not as a
separate subtotal row underneath. That buys a row per group and reads better.

### Nesting

`PdfTableGroup` takes an optional `children: PdfTableGroup<T>[]`. A sub-group is
distinguished from its parent by exactly two things:

```
LABOUR                                      ← depth 0: grey fill, uppercase,
  Labour line 1                                tracked, muted ink
SUBCONTRACTOR                    $9,000.00
  Sub direct line 1
    Electrical                   $4,000.00  ← depth 1: no fill, title case,
      Elec line 1                              ink, indented 12pt
```

`paddingLeft` is `10 + depth * 12`. Past depth 1 it keeps indenting but stops
getting visually distinct, which is a reasonable place for a document to stop.

### Subtotals earn their place

A group total prints only when the reader can't do the sum by eye:

```ts
const showsTotal = (g) =>
  g.total != null &&
  (g.showTotal ?? (g.rows.length > 1 || (g.children?.length ?? 0) > 0));
```

So a one-line group prints no subtotal — it would just repeat the figure
directly beneath it — but a parent of sub-groups always does, because what it
sums is spread across headings. `showTotal` overrides both ways.

**There is no subtotal label.** The row is `LABEL … $figure`, so the wording
question doesn't arise. If you add a labelled subtotal, you're defining it.

Grouping is switched off with `grouped={false}`, which renders rows with no
heading rows at all. Important: "off" means the caller should pass **one flat
group in the builder's own order** — not the same groups with labels hidden.
`buildVariationDocumentModel` returns `costLines` alongside `costGroups` for
exactly this; walking `costGroups` and hiding the label silently reorders the
document.

---

## 6. Money

There is **no shared money helper in the kit** — each document defines its own,
identically. Worth consolidating; hasn't been.

```ts
function formatAUD(dollars: number): string {
  return new Intl.NumberFormat("en-AU", {
    style: "currency", currency: "AUD", minimumFractionDigits: 2,
  }).format(dollars);
}
```

`$1,234.50`. Comma thousands, two decimals always, `$` prefix, no space.
**Negatives come out as `-$120.00`** (Intl's default) — not parenthesised. The
one exception is the invoice's "Paid to date", which is hand-wrapped in
parentheses and coloured `#3F7D5C` via `tone: "credit"`.

Everything upstream is **cents as integers**, so call sites are all
`formatAUD(x / 100)`. `variation_items.unitCostExTax` is the exception —
dollars-as-float — and the model converts at the boundary.

### The grand total

`PdfTotalsCard`: right-aligned, `width: 240` (invoice uses 260), bordered +
12pt-radius panel, `paddingHorizontal: 14 / paddingVertical: 12`.

Rows are 8.5pt, muted label / ink value. A row with `subtotal: true` gets a
1pt `border` rule above and goes 600 weight both sides — that's how the invoice
shows "Invoice total" above "Paid to date".

The grand total is separated by a rule in **`brand.rule`** (`tintOnWhite(base,
0.25)`), then label 10/700 and figure 14/700, both in **`brand.onWhite`**.

**No fill behind the total.** The previous variation document used
`brandColor + "14"` and it fought the table above it. A rule and a colour shift
is enough.

---

## 7. Page furniture

```ts
<Page size="A4" style={{
  fontSize: PDF_TYPE.body,          // 9.5
  fontFamily: PDF_FONT_FAMILY,      // "Inter"
  color: PDF_COLORS.ink,
  backgroundColor: PDF_COLORS.surface,
  paddingBottom: 56,                // the ONLY page padding
}}>
```

- **Size** A4 (595 × 842pt).
- **Margins** There is no page-level horizontal margin. The hero band is
  full-bleed, and the body applies its own
  `paddingHorizontal: PDF_PAGE_MARGIN` (**40**). Top margin is effectively zero
  — the band starts at y=0. Bottom is **56pt**, reserving space for the fixed
  footer.
- **Body top** `paddingTop: PDF_SPACE.xl` (24).
- **Header height** `PdfHeroBand` is `minHeight: 104`, `paddingVertical: 22`,
  `paddingHorizontal: 40`. Grows with the number of contact lines.
- **Footer** `PdfDocFooter`, `fixed`, absolutely positioned `bottom: 24, left:
  40, right: 40`, 1pt top rule, `paddingTop: 8`. Three cells at 7pt `inkFaint`:
  company name (left) · `Powered by Morada` (centre) · `Page N of M` (right).
  Height ≈ 20pt including the rule.

The gradient: @react-pdf has **no CSS gradients**, but it does ship
`Svg`/`Defs`/`LinearGradient`/`Stop`/`Rect` (v4.3.1). The band is an absolutely
positioned `<Svg viewBox="0 0 100 100" preserveAspectRatio="none">` with a
stretched `<Rect>` behind the content.

---

## 8. Things I changed my mind about

Ordered by how much time they'd save you.

**Section spacing must be on the leading edge.** `PdfSection` originally carried
`marginBottom: 24`. On a page that otherwise just fits, the last section's
trailing margin tips past the boundary and you get **a second page containing
nothing but the fixed footer** — a two-page invoice whose page two is blank.
Leading margins collapse into the page padding instead of past it. If you add
spacing anywhere, put it on top.

**Don't tint body rows with the brand.** `brandColor + "14"` on alternate rows
looked considered in isolation and made a nine-column table unreadable. Neutral
zebra (`#FAF9F7`) and one brand moment in the header is better.

**Don't put the brand behind the grand total either.** Same reason. A brand rule
plus `onWhite` text carries it.

**The brand colour cannot be used as ink without derivation.** This cost a
render: a pale yellow brand produced a grand total that was legible on screen at
400% and invisible on paper. `onWhite` exists solely because of that.

**I tried a dotted leader** from label to figure in the money rows. Jed: *"The
dotted lines to the figures aren't too nice. Remove them."* Gone. The rules
between rows stayed.

**Three identity blocks is two too many.** The original had a brand band, then a
grey client/project bar, then a third row with the document number, status and a
money card — roughly 40% of page one before any content, with the total nowhere
near the band. One band carrying identity + status + headline figure is the
whole improvement. Your `DocProposalInnerHeader` + `DocBrandedHeader` pairing is
the same shape and would benefit.

**`textDecoration`, not `textDecorationLine`.** The React Native spelling is
silently ignored by @react-pdf — a struck-through superseded contract sum simply
rendered normally, with no error, for weeks.

**A `borderRadius: 0` throws.** @react-pdf rejects a numeric zero radius; omit
the property instead. There's a comment about this in the old invoice code.

**Column widths can't be eyeballed.** Everything above about the squeeze was
found by rendering a kitchen-sink case (every optional column, 14 rows,
deliberately long descriptions) and looking at it. A component test would have
passed the whole time. There's a Node render harness if you want it —
`server/__tests__/pdf-documents.test.ts`, run with:

```bash
PDF_FONT_DIR="$PWD/client/public/fonts" \
  npx tsx --tsconfig tsconfig.pdfrender.json server/__tests__/pdf-documents.test.ts
```

`PDF_FONT_DIR` is needed because the faces are registered by browser path
(`/fonts/...`), which fontkit resolves against the **filesystem root** under
Node. The separate tsconfig only flips JSX to the automatic runtime.

---

## Known gaps, collected

1. `formatAUD` is duplicated in every document instead of living here.
2. `DocBrandedHeader` / `DocFooter` / `DocProposalInnerHeader` only exist for the
   proposal; moving it onto `PdfHeroBand` + `PdfDocFooter` retires all three.

Four earlier gaps — no repeating header, no nesting, subtotals on single-line
groups, and per-group zebra — were closed in the kit rather than worked around
per document. All four are covered by `server/__tests__/pdf-documents.test.ts`.
