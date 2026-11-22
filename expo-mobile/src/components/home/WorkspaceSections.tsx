import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronRight, Pin, type LucideIcon } from 'lucide-react-native';
import { metrics, size, tabular, type, useColors } from '../../theme';
import { AgendaStrip, Card, Divider, ProjectSquare, SectionCardHeader } from '../kit';
import { usePersistedState } from '../../lib/usePersistedState';
import { haptic } from '../../lib/haptics';

// Workspace (P01) section cards: icon · title · caret · count · ›, rows with
// 1dp dividers. Built from the kit; presentation only — the screen owns data.

const m = metrics.workspace;

/** A collapsible Workspace section card. Collapsed state survives relaunches. */
export function WorkspaceSection({
  id,
  icon,
  title,
  count,
  onOpen,
  children,
}: {
  /** Stable key for the remembered collapsed state. */
  id: string;
  icon: LucideIcon;
  title: string;
  count?: number | null;
  onOpen?: () => void;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = usePersistedState<boolean>(`workspace.collapsed.${id}`, false);
  const toggle = () => {
    haptic.select();
    setCollapsed(!collapsed);
  };
  return (
    <Card variant="section">
      <SectionCardHeader inline icon={icon} title={title} count={count ?? undefined} open={!collapsed} onToggle={toggle} onOpen={onOpen} />
      {collapsed ? null : <View>{children}</View>}
    </Card>
  );
}

/** Rows separated by 1dp dividers (none before the first). */
export function Rows({ children }: { children: ReactNode }) {
  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <>
      {rows.map((row, i) => (
        <Fragment key={row.key ?? i}>
          {i > 0 ? <Divider /> : null}
          {row}
        </Fragment>
      ))}
    </>
  );
}

/** "Tasks", "Schedule · 1" inside the Today card. */
export function SubLabel({ children }: { children: string }) {
  const c = useColors();
  return (
    <Text style={[type.captionSemi, tabular, { color: c.muted, paddingTop: m.subLabelPad.top, paddingBottom: m.subLabelPad.bottom }]}>
      {children}
    </Text>
  );
}

/** Quiet empty line ("Nothing due today"). */
export function EmptyLine({ children }: { children: string }) {
  const c = useColors();
  return <Text style={[type.body, { color: c.mutedStrong, paddingVertical: m.row.padY }]}>{children}</Text>;
}

/** Agenda-style row: 3dp project-colour strip · title + meta · right text. */
export function AgendaRow({
  color,
  title,
  meta,
  right,
  rightStrong,
  lead,
  onPress,
  accessibilityLabel,
}: {
  color?: string | null;
  title: string;
  meta?: string | null;
  right?: string | null;
  /** Hours: 15 SemiBold text colour instead of 13 Medium muted. */
  rightStrong?: boolean;
  /** Replaces the strip (e.g. a task checkbox). */
  lead?: ReactNode;
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: m.agendaRow.gap,
        paddingVertical: m.agendaRow.padY,
        opacity: pressed ? metrics.pressedOpacity : 1,
      })}
    >
      {lead ?? <AgendaStrip color={color} />}
      <View style={{ flex: 1, gap: metrics.listRow.bodyGap }}>
        <Text numberOfLines={2} style={[type.rowTitleMedium, { color: c.text }]}>
          {title}
        </Text>
        {meta ? (
          <Text numberOfLines={1} style={[type.meta, { color: c.mutedStrong }]}>
            {meta}
          </Text>
        ) : null}
      </View>
      {right ? (
        <Text style={[rightStrong ? type.rowTitleStrong : type.metaMedium, tabular, { color: rightStrong ? c.text : c.mutedStrong }]}>{right}</Text>
      ) : null}
    </Pressable>
  );
}

/** Project row: square · name · pin · stage. */
export function ProjectLineRow({
  name,
  color,
  id,
  pinned,
  stage,
  onPress,
}: {
  name: string;
  color?: string | null;
  id: string;
  pinned?: boolean;
  stage?: string | null;
  onPress: () => void;
}) {
  const c = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[name, pinned ? 'pinned' : null, stage].filter(Boolean).join(', ')}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: m.row.gap,
        paddingVertical: m.row.padY,
        opacity: pressed ? metrics.pressedOpacity : 1,
      })}
    >
      <ProjectSquare color={color} fallbackKey={id} size="row" />
      <Text numberOfLines={1} style={[type.rowTitleMedium, { color: c.text, flexShrink: 1 }]}>
        {name}
      </Text>
      {pinned ? <Pin size={m.row.pin} color={c.muted} strokeWidth={metrics.iconStroke} /> : null}
      <View style={{ flex: 1 }} />
      {stage ? (
        <Text numberOfLines={1} style={[type.meta, { color: c.mutedStrong, flexShrink: 1, textAlign: 'right' }]}>
          {stage}
        </Text>
      ) : null}
    </Pressable>
  );
}

/** "+35 more ›" at the foot of a capped list. */
export function MoreRow({ count, onPress }: { count: number; onPress: () => void }) {
  const c = useColors();
  if (count <= 0) return null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${count} more`}
      style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: metrics.groupHeader.toggleGap, paddingVertical: m.row.padY, opacity: pressed ? metrics.pressedOpacity : 1 })}
    >
      <Text style={[type.metaMedium, tabular, { color: c.muted }]}>{`+${count} more`}</Text>
      <ChevronRight size={size.icon.caret} color={c.muted} strokeWidth={metrics.iconStrokeActive} />
    </Pressable>
  );
}
