import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';
import type { ScopeItem } from "@shared/schema";
import { PRIMARY_COLOR } from "./types";

// Helper function to convert Tiptap JSON to plain text for PDF
export const tiptapJsonToText = (jsonOrHtml: string | null | undefined): string => {
  if (!jsonOrHtml) return '';

  // Try to parse as JSON first (for new items)
  try {
    const parsed = JSON.parse(jsonOrHtml);
    if (parsed.type && parsed.content) {
      // It's Tiptap JSON, extract text recursively
      const extractText = (node: any): string => {
        if (node.text) return node.text;
        if (node.content) {
          return node.content.map((child: any) => extractText(child)).join(' ');
        }
        return '';
      };
      return extractText(parsed);
    }
  } catch {
    // Not JSON, treat as HTML
  }

  // Fallback: strip HTML tags (for existing items)
  return jsonOrHtml.replace(/<[^>]*>/g, '');
};

type DescriptionBlock = { kind: 'p' | 'li'; text: string; marker?: string };

// Split a description into the blocks it was written as, so the PDF keeps the
// paragraph breaks and bullets instead of running everything together on one
// line. react-pdf has no HTML renderer — each block becomes its own <Text>.
export const descriptionToBlocks = (jsonOrHtml: string | null | undefined): DescriptionBlock[] => {
  if (!jsonOrHtml) return [];

  const html = (() => {
    try {
      const parsed = JSON.parse(jsonOrHtml);
      // Tiptap JSON: fall back to the flat text path, it has no list semantics here.
      if (parsed.type && parsed.content) return null;
    } catch {
      /* not JSON — it's HTML */
    }
    return jsonOrHtml;
  })();

  if (html === null) {
    const text = tiptapJsonToText(jsonOrHtml).trim();
    return text ? [{ kind: 'p', text }] : [];
  }

  const doc = new DOMParser().parseFromString(html, 'text/html');
  const blocks: DescriptionBlock[] = [];

  // A hard break inside a block is its own line in the editor, so it has to be
  // its own <Text> here too — react-pdf won't break on markup.
  const lines = (el: Element): string[] =>
    el.innerHTML
      .split(/<\s*br\s*\/?>/i)
      .map(part => {
        const holder = doc.createElement('div');
        holder.innerHTML = part;
        return (holder.textContent || '').replace(/\s+/g, ' ').trim();
      })
      .filter(Boolean);

  for (const child of Array.from(doc.body.children)) {
    const tag = child.tagName.toLowerCase();
    if (tag === 'ul' || tag === 'ol') {
      const ordered = tag === 'ol';
      let n = 1;
      for (const li of Array.from(child.children)) {
        if (li.tagName.toLowerCase() !== 'li') continue;
        const text = lines(li).join(' ');
        if (text) blocks.push({ kind: 'li', text, marker: ordered ? `${n++}.` : '•' });
      }
      continue;
    }
    for (const text of lines(child)) blocks.push({ kind: 'p', text });
  }

  // No block-level children (e.g. a bare text node) — keep the whole thing.
  if (blocks.length === 0) {
    const text = (doc.body.textContent || '').replace(/\s+/g, ' ').trim();
    if (text) blocks.push({ kind: 'p', text });
  }

  return blocks;
};

const ItemDescription = ({ description }: { description: string }) => {
  const blocks = descriptionToBlocks(description);
  if (blocks.length === 0) return null;
  return (
    <View>
      {blocks.map((block, i) =>
        block.kind === 'li' ? (
          <View key={i} style={pdfStyles.bulletRow}>
            <Text style={pdfStyles.bulletMarker}>{block.marker}</Text>
            <Text style={pdfStyles.itemDescription}>{block.text}</Text>
          </View>
        ) : (
          <Text key={i} style={pdfStyles.itemDescription}>{block.text}</Text>
        )
      )}
    </View>
  );
};

// PDF Document Component
export const ScopePDF = ({ stage, items, hideClientCosts = false }: { stage: string; items: ScopeItem[]; hideClientCosts?: boolean }) => (
  <Document>
    <Page size="A4" style={pdfStyles.page}>
      <View style={pdfStyles.header}>
        <Text style={pdfStyles.title}>Scope of Works - {stage}</Text>
        {hideClientCosts && (
          <Text style={pdfStyles.subtitle}>Client Version</Text>
        )}
      </View>
      {items.map((item, index) => (
        <View key={item.id} style={pdfStyles.item}>
          <Text style={pdfStyles.itemNumber}>{index + 1}.</Text>
          <View style={pdfStyles.itemContent}>
            <Text style={pdfStyles.itemTitle}>{item.title}</Text>
            {item.description && <ItemDescription description={item.description} />}
            {!hideClientCosts && item.costCodeTitle && (
              <Text style={pdfStyles.itemCostCode}>Cost Code: {item.costCodeTitle}</Text>
            )}
          </View>
        </View>
      ))}
    </Page>
  </Document>
);

const pdfStyles = StyleSheet.create({
  page: { padding: 40, fontSize: 11 },
  header: { marginBottom: 20, borderBottom: `2px solid ${PRIMARY_COLOR}` },
  title: { fontSize: 24, fontWeight: 'bold', color: PRIMARY_COLOR, marginBottom: 10 },
  subtitle: { fontSize: 12, color: '#999', fontStyle: 'italic', marginTop: 4 },
  item: { flexDirection: 'row', marginBottom: 12 },
  itemNumber: { width: 30, fontWeight: 'bold' },
  itemContent: { flex: 1 },
  itemTitle: { fontWeight: 'bold', marginBottom: 4 },
  itemDescription: { color: '#666', fontSize: 10, marginBottom: 2 },
  bulletRow: { flexDirection: 'row', marginBottom: 2 },
  bulletMarker: { color: '#666', fontSize: 10, width: 12 },
  itemCostCode: { color: PRIMARY_COLOR, fontSize: 9, marginTop: 4, fontStyle: 'italic' },
});

export default ScopePDF;
