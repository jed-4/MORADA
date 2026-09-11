import { Text, View, StyleSheet } from '@react-pdf/renderer';
import { registerPdfFonts, PDF_FONT_FAMILY } from "@/components/pdf/shared/registerPdfFonts";
import { PDF_COLORS, PDF_LEADING } from "@/components/pdf/shared/pdfTokens";

// Registering here covers every proposal section: all eleven of them render
// their prose through this module, so none can fall back to Helvetica.
registerPdfFonts();

type InlineSeg = { text: string; bold?: boolean; italic?: boolean; underline?: boolean };
export type RenderBlock = { type: 'p' | 'h1' | 'h2' | 'h3' | 'li' | 'ol-li'; text: string; segs?: InlineSeg[] };

// Split a raw HTML fragment that may still contain <strong>/<b>/<em>/<i>/<u>
// inline tags into styled text segments. All other tags are stripped.
function parseInline(fragment: string): InlineSeg[] {
  if (!fragment) return [];
  const decode = (s: string) =>
    s
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");

  const segs: InlineSeg[] = [];
  const stack: { bold: boolean; italic: boolean; underline: boolean }[] = [
    { bold: false, italic: false, underline: false },
  ];
  const re = /<\s*(\/?)(strong|b|em|i|u)\s*>|<[^>]+>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(fragment)) !== null) {
    const [, closing, tag, textChunk] = m;
    if (textChunk) {
      const top = stack[stack.length - 1];
      const t = decode(textChunk);
      if (t) segs.push({ text: t, bold: top.bold, italic: top.italic, underline: top.underline });
    } else if (tag) {
      const lower = tag.toLowerCase();
      const isBold = lower === 'strong' || lower === 'b';
      const isItalic = lower === 'em' || lower === 'i';
      const isUnderline = lower === 'u';
      if (closing) {
        if (stack.length > 1) stack.pop();
      } else {
        const top = stack[stack.length - 1];
        stack.push({
          bold: top.bold || isBold,
          italic: top.italic || isItalic,
          underline: top.underline || isUnderline,
        });
      }
    }
  }
  return segs;
}

export function htmlToBlocks(html: string): RenderBlock[] {
  if (!html) return [];
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html
      .split(/\n{2,}/)
      .map((t) => ({ type: 'p' as const, text: t.trim(), segs: [{ text: t.trim() }] }))
      .filter((b) => b.text.length > 0);
  }
  const blocks: RenderBlock[] = [];
  // Mark block boundaries with sentinels so we can preserve inline tags
  // (strong/em/u) while still segmenting paragraphs / list items.
  const cleaned = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/(p|div|h[1-6]|li)\s*>/gi, '__BLOCK__')
    .replace(/<\s*(p|div|h[1-6]|li|ul|ol)[^>]*>/gi, (_m, tag) => `__OPEN_${String(tag).toLowerCase()}__`);
  const segments = cleaned.split('__BLOCK__');
  let inOl = false;
  for (const seg of segments) {
    let typ: RenderBlock['type'] = 'p';
    let body = seg;
    const m = body.match(/__OPEN_(p|div|h1|h2|h3|h4|h5|h6|li|ul|ol)__/);
    if (m) {
      const tag = m[1];
      if (tag === 'ol') inOl = true;
      else if (tag === 'ul') inOl = false;
      else if (tag === 'h1') typ = 'h1';
      else if (tag === 'h2') typ = 'h2';
      else if (tag.startsWith('h')) typ = 'h3';
      else if (tag === 'li') typ = inOl ? 'ol-li' : 'li';
    }
    body = body.replace(/__OPEN_[a-z0-9]+__/g, '');
    const segs = parseInline(body);
    const text = segs.map((s) => s.text).join('').trim();
    if (text) blocks.push({ type: typ, text, segs });
  }
  return blocks;
}

const blockStyles = StyleSheet.create({
  p: { fontSize: 11, lineHeight: PDF_LEADING.body, color: PDF_COLORS.ink, marginBottom: 6 },
  h1: { fontSize: 18, fontWeight: 'bold', marginTop: 8, marginBottom: 6, color: PDF_COLORS.ink },
  h2: { fontSize: 15, fontWeight: 'bold', marginTop: 8, marginBottom: 4, color: PDF_COLORS.ink },
  h3: { fontSize: 13, fontWeight: 'bold', marginTop: 6, marginBottom: 4, color: PDF_COLORS.ink },
  li: { fontSize: 11, lineHeight: PDF_LEADING.body, color: PDF_COLORS.ink, marginLeft: 12 },
});

function renderSegs(segs: InlineSeg[] | undefined, fallback: string) {
  const list = segs && segs.length > 0 ? segs : [{ text: fallback }];
  return list.map((s, i) => {
    const style: Record<string, string | number> = {};
    if (s.bold) style.fontWeight = 'bold';
    if (s.italic) style.fontStyle = 'italic';
    if (s.underline) style.textDecoration = 'underline';
    return (
      <Text key={i} style={style}>
        {s.text}
      </Text>
    );
  });
}

interface RichTextBlocksProps {
  html: string;
}

export function RichTextBlocks({ html }: RichTextBlocksProps) {
  const blocks = htmlToBlocks(html);
  if (blocks.length === 0) return null;
  let olIdx = 0;
  return (
    <View>
      {blocks.map((b, i) => {
        if (b.type === 'h1') return <Text key={i} style={blockStyles.h1}>{renderSegs(b.segs, b.text)}</Text>;
        if (b.type === 'h2') return <Text key={i} style={blockStyles.h2}>{renderSegs(b.segs, b.text)}</Text>;
        if (b.type === 'h3') return <Text key={i} style={blockStyles.h3}>{renderSegs(b.segs, b.text)}</Text>;
        if (b.type === 'li') return <Text key={i} style={blockStyles.li}>{'\u2022 '}{renderSegs(b.segs, b.text)}</Text>;
        if (b.type === 'ol-li') {
          olIdx += 1;
          return <Text key={i} style={blockStyles.li}>{`${olIdx}. `}{renderSegs(b.segs, b.text)}</Text>;
        }
        olIdx = 0;
        return <Text key={i} style={blockStyles.p}>{renderSegs(b.segs, b.text)}</Text>;
      })}
    </View>
  );
}

interface PageHeaderProps {
  proposalName: string;
  proposalNumber?: string | null;
  expiryDate?: string | Date | null;
  primaryColor?: string;
  companyLogo?: string;
}

export function PageHeader({ proposalName, proposalNumber, expiryDate, primaryColor = PDF_COLORS.brandFallback }: PageHeaderProps) {
  const styles = StyleSheet.create({
    header: { marginBottom: 20, paddingBottom: 10, borderBottom: `2px solid ${primaryColor}` },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 10, color: PDF_COLORS.ink },
    subtitle: { fontSize: 14, color: PDF_COLORS.inkMuted, marginBottom: 5 },
  });
  return (
    <View style={styles.header}>
      <Text style={styles.title}>{proposalName}</Text>
      {proposalNumber && <Text style={styles.subtitle}>Proposal #{proposalNumber}</Text>}
      {expiryDate && (
        <Text style={styles.subtitle}>
          Valid until: {new Date(expiryDate).toLocaleDateString()}
        </Text>
      )}
    </View>
  );
}

interface PageFooterProps {
  companyName?: string;
  primaryColor?: string;
}

export function PageFooter({ companyName, primaryColor = PDF_COLORS.brandFallback }: PageFooterProps) {
  const styles = StyleSheet.create({
    footer: {
      position: 'absolute',
      bottom: 30,
      left: 40,
      right: 40,
      paddingTop: 10,
      borderTop: `1px solid ${primaryColor}`,
      fontSize: 9,
      color: primaryColor,
      opacity: 0.6,
    },
  });
  return (
    <View style={styles.footer}>
      <Text>{companyName || 'Company Name'}</Text>
    </View>
  );
}

export const sharedPageStyle = {
  padding: 40,
  fontSize: 11,
  fontFamily: PDF_FONT_FAMILY,
  backgroundColor: '#ffffff',
};

export const sharedSectionStyle = StyleSheet.create({
  section: { marginTop: 20, marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: PDF_COLORS.ink },
  text: { fontSize: 11, lineHeight: PDF_LEADING.body, color: PDF_COLORS.ink },
  muted: { fontSize: 11, fontStyle: 'italic', color: PDF_COLORS.inkMuted },
  intro: { fontSize: 11, lineHeight: PDF_LEADING.body, color: PDF_COLORS.ink, marginBottom: 12 },
});

/**
 * The section's own "Description" — intro text under the heading.
 *
 * Every section accordion in the builder offers a Description field, and until
 * now exactly one section type (the cover page) rendered it. On the other ten
 * you could type into it, get "Section updated successfully", and never see the
 * text anywhere in the document. This renders it wherever a section is drawn.
 *
 * Rich HTML is preferred over the plain mirror, since the editor writes both
 * and only the HTML keeps the user's formatting. Placeholders have already been
 * substituted into these two fields upstream by substituteSectionContent.
 */
export function SectionIntro({
  section,
}: {
  section: { description?: string | null; descriptionHtml?: string | null };
}) {
  const html = section.descriptionHtml;
  if (html && htmlToBlocks(html).length > 0) {
    return <RichTextBlocks html={html} />;
  }
  const plain = section.description;
  if (plain && plain.trim()) {
    return <Text style={sharedSectionStyle.intro}>{plain}</Text>;
  }
  return null;
}
