import { Text, View, StyleSheet } from '@react-pdf/renderer';

export type RenderBlock = { type: 'p' | 'h1' | 'h2' | 'h3' | 'li' | 'ol-li'; text: string };

export function htmlToBlocks(html: string): RenderBlock[] {
  if (!html) return [];
  if (!/<[a-z][\s\S]*>/i.test(html)) {
    return html.split(/\n{2,}/).map((t) => ({ type: 'p' as const, text: t.trim() })).filter((b) => b.text.length > 0);
  }
  const blocks: RenderBlock[] = [];
  const cleaned = html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\s*\/(p|div|h[1-6]|li)\s*>/gi, '__BLOCK__')
    .replace(/<\s*(p|div|h[1-6]|li|ul|ol)[^>]*>/gi, (_m, tag) => `__OPEN_${String(tag).toLowerCase()}__`)
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
  const segments = cleaned.split('__BLOCK__');
  let inOl = false;
  for (const seg of segments) {
    let typ: RenderBlock['type'] = 'p';
    let text = seg;
    const m = text.match(/__OPEN_(p|div|h1|h2|h3|h4|h5|h6|li|ul|ol)__/);
    if (m) {
      const tag = m[1];
      if (tag === 'ol') inOl = true;
      else if (tag === 'ul') inOl = false;
      else if (tag === 'h1') typ = 'h1';
      else if (tag === 'h2') typ = 'h2';
      else if (tag.startsWith('h')) typ = 'h3';
      else if (tag === 'li') typ = inOl ? 'ol-li' : 'li';
    }
    text = text.replace(/__OPEN_[a-z0-9]+__/g, '').trim();
    if (text) blocks.push({ type: typ, text });
  }
  return blocks;
}

const blockStyles = StyleSheet.create({
  p: { fontSize: 11, lineHeight: 1.5, color: '#374151', marginBottom: 6 },
  h1: { fontSize: 18, fontWeight: 'bold', marginTop: 8, marginBottom: 6, color: '#1F2937' },
  h2: { fontSize: 15, fontWeight: 'bold', marginTop: 8, marginBottom: 4, color: '#1F2937' },
  h3: { fontSize: 13, fontWeight: 'bold', marginTop: 6, marginBottom: 4, color: '#1F2937' },
  li: { fontSize: 11, lineHeight: 1.5, color: '#374151', marginLeft: 12 },
});

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
        if (b.type === 'h1') return <Text key={i} style={blockStyles.h1}>{b.text}</Text>;
        if (b.type === 'h2') return <Text key={i} style={blockStyles.h2}>{b.text}</Text>;
        if (b.type === 'h3') return <Text key={i} style={blockStyles.h3}>{b.text}</Text>;
        if (b.type === 'li') return <Text key={i} style={blockStyles.li}>• {b.text}</Text>;
        if (b.type === 'ol-li') {
          olIdx += 1;
          return <Text key={i} style={blockStyles.li}>{`${olIdx}. ${b.text}`}</Text>;
        }
        olIdx = 0;
        return <Text key={i} style={blockStyles.p}>{b.text}</Text>;
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

export function PageHeader({ proposalName, proposalNumber, expiryDate, primaryColor = '#3B82F6' }: PageHeaderProps) {
  const styles = StyleSheet.create({
    header: { marginBottom: 20, paddingBottom: 10, borderBottom: `2px solid ${primaryColor}` },
    title: { fontSize: 24, fontWeight: 'bold', marginBottom: 10, color: '#1F2937' },
    subtitle: { fontSize: 14, color: '#6B7280', marginBottom: 5 },
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

export function PageFooter({ companyName, primaryColor = '#3B82F6' }: PageFooterProps) {
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
  fontFamily: 'Helvetica',
  backgroundColor: '#ffffff',
};

export const sharedSectionStyle = StyleSheet.create({
  section: { marginTop: 20, marginBottom: 20 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', marginBottom: 10, color: '#1F2937' },
  text: { fontSize: 11, lineHeight: 1.5, color: '#374151' },
  muted: { fontSize: 11, fontStyle: 'italic', color: '#6B7280' },
});
