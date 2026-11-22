import { Fragment } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronRight, type LucideIcon } from 'lucide-react-native';
import { metrics, size, space, tabular, type, useColors } from '../../theme';
import { Divider } from './Card';

function Caret({ open }: { open: boolean }) {
  const c = useColors();
  const Glyph = open ? ChevronDown : ChevronRight;
  return <Glyph size={size.icon.caret} color={c.muted} strokeWidth={metrics.iconStrokeActive} />;
}

/** Collapsible group title above a card: title + caret · muted meta(s) · optional › to open the full list. */
export function GroupHeader({
  title,
  meta,
  open,
  onToggle,
  onOpen,
}: {
  title: string;
  meta?: (string | number | null | undefined)[] | string | number | null;
  open: boolean;
  onToggle: () => void;
  onOpen?: () => void;
}) {
  const c = useColors();
  const metas = (Array.isArray(meta) ? meta : [meta]).filter((m) => m != null && m !== '');
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.groupHeader.gap, minHeight: metrics.groupHeader.height, marginBottom: space.groupHeaderToCard }}>
      <Pressable
        onPress={onToggle}
        hitSlop={metrics.hitSlop}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.groupHeader.toggleGap, flexShrink: 1 }}
      >
        <Text numberOfLines={1} style={[type.rowTitle, { color: c.text, flexShrink: 1 }]}>
          {title}
        </Text>
        <Caret open={open} />
      </Pressable>
      {metas.map((m, i) => (
        <Text key={i} style={[type.meta, tabular, { color: c.muted }]}>
          {m}
        </Text>
      ))}
      {onOpen ? (
        <Pressable onPress={onOpen} hitSlop={metrics.hitSlop} accessibilityLabel={`Open ${title}`} style={{ marginLeft: 'auto' }}>
          <ChevronRight size={size.icon.row} color={c.muted} strokeWidth={metrics.iconStroke} />
        </Pressable>
      ) : null}
    </View>
  );
}

export interface CollapsedGroup {
  key: string;
  title: string;
  meta?: string | null;
  /** Right-aligned meta ("0/18"). */
  trailing?: string | null;
  onPress: () => void;
}

/** Several collapsed groups at the foot of a screen: plain rows, no card. */
export function CollapsedGroupList({ groups }: { groups: CollapsedGroup[] }) {
  const c = useColors();
  return (
    <View>
      {groups.map((g, i) => (
        <Fragment key={g.key}>
          {i > 0 ? <Divider /> : null}
          <Pressable
            onPress={g.onPress}
            accessibilityRole="button"
            accessibilityState={{ expanded: false }}
            style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.groupHeader.gap, paddingVertical: metrics.groupHeader.collapsedRowPad }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.groupHeader.toggleGap, flexShrink: 1 }}>
              <Text numberOfLines={1} style={[type.rowTitle, { color: c.text, flexShrink: 1 }]}>
                {g.title}
              </Text>
              <Caret open={false} />
            </View>
            {g.meta ? <Text style={[type.meta, tabular, { color: c.muted }]}>{g.meta}</Text> : null}
            {g.trailing ? <Text style={[type.meta, tabular, { color: c.muted, marginLeft: 'auto' }]}>{g.trailing}</Text> : null}
          </Pressable>
        </Fragment>
      ))}
    </View>
  );
}

/** Header inside a card (Workspace sections, Project detail cards). */
export function SectionCardHeader({
  title,
  count,
  icon: Glyph,
  open,
  onToggle,
  onOpen,
  inline,
  divider = true,
}: {
  title: string;
  count?: string | number | null;
  icon?: LucideIcon;
  open: boolean;
  onToggle?: () => void;
  onOpen?: () => void;
  /** Workspace section cards: the card's own padding frames it; no divider. */
  inline?: boolean;
  /** Draw the rule under an open header. Off when the card draws its own dividers. */
  divider?: boolean;
}) {
  const c = useColors();
  return (
    <View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.groupHeader.gap, paddingVertical: inline ? 0 : metrics.groupHeader.sectionCardPad }}>
        <Pressable
          onPress={onToggle}
          disabled={!onToggle}
          hitSlop={metrics.hitSlop}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.groupHeader.toggleGap, flexShrink: 1 }}
        >
          {Glyph ? <Glyph size={metrics.groupHeader.sectionIcon} color={c.icon} strokeWidth={metrics.iconStroke} /> : null}
          <Text numberOfLines={1} style={[type.sectionTitle, { color: c.text, flexShrink: 1, marginLeft: Glyph ? metrics.groupHeader.toggleGap : 0 }]}>
            {title}
          </Text>
          {onToggle ? <Caret open={open} /> : null}
        </Pressable>
        {count != null && count !== '' ? <Text style={[inline ? type.metaMedium : type.meta, tabular, { color: c.muted }]}>{count}</Text> : null}
        {onOpen ? (
          <Pressable onPress={onOpen} hitSlop={metrics.hitSlop} accessibilityLabel={`Open ${title}`} style={{ marginLeft: 'auto' }}>
            <ChevronRight size={size.icon.row} color={c.muted} strokeWidth={metrics.iconStroke} />
          </Pressable>
        ) : null}
      </View>
      {open && !inline && divider ? <Divider /> : null}
    </View>
  );
}
