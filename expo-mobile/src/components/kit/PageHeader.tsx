import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ChevronDown, ChevronLeft, type LucideIcon } from 'lucide-react-native';
import { metrics, size, tabular, type, useColors } from '../../theme';
import { ProjectSquare } from './ProjectSquare';

export interface HeaderAction {
  icon: LucideIcon;
  onPress: () => void;
  label: string;
  /** Draw in accent (e.g. a filter that is on). */
  active?: boolean;
}

export interface HeaderProject {
  name: string;
  color?: string | null;
  id?: string | number | null;
}

function Actions({ actions, iconSize }: { actions?: HeaderAction[]; iconSize: number }) {
  const c = useColors();
  if (!actions?.length) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.pageHeader.actionGap }}>
      {actions.map((a) => (
        <Pressable key={a.label} onPress={a.onPress} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel={a.label}>
          <a.icon size={iconSize} color={a.active ? c.accent : c.icon} strokeWidth={metrics.iconStroke} />
        </Pressable>
      ))}
    </View>
  );
}

function Back({ onBack, iconSize }: { onBack?: () => void; iconSize: number }) {
  const c = useColors();
  if (!onBack) return null;
  return (
    <Pressable onPress={onBack} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Back">
      <ChevronLeft size={iconSize} color={c.text} strokeWidth={metrics.iconStroke} />
    </Pressable>
  );
}

function ProjectLine({ project, square = 'header', textStyle = type.meta }: { project: HeaderProject; square?: 'header' | 'taskHeader'; textStyle?: object }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.pageHeader.projectGap, flexShrink: 1 }}>
      <ProjectSquare color={project.color} fallbackKey={project.id ?? project.name} size={square} />
      <Text numberOfLines={1} style={[textStyle, { color: c.muted, flexShrink: 1 }]}>
        {project.name}
      </Text>
    </View>
  );
}

/** One-row inner-screen header: back · title · project · spacer · actions. */
export function PageHeader({
  title,
  project,
  onBack,
  actions,
  onProjectPress,
  right,
}: {
  title: string;
  project?: HeaderProject | null;
  onBack?: () => void;
  actions?: HeaderAction[];
  /** Makes the project a picker (screens opened outside a project). */
  onProjectPress?: () => void;
  /** Extra trailing content after the action icons (a self-contained button). */
  right?: ReactNode;
}) {
  const c = useColors();
  return (
    <View
      style={{
        minHeight: metrics.pageHeader.height,
        paddingVertical: metrics.pageHeader.padY,
        flexDirection: 'row',
        alignItems: 'center',
        gap: metrics.pageHeader.gap,
      }}
    >
      <Back onBack={onBack} iconSize={metrics.pageHeader.back} />
      <Text accessibilityRole="header" numberOfLines={1} style={[type.pageTitle, { color: c.text, flexShrink: 0 }]}>
        {title}
      </Text>
      {project ? (
        onProjectPress ? (
          <Pressable
            onPress={onProjectPress}
            hitSlop={metrics.hitSlop}
            accessibilityRole="button"
            accessibilityLabel={`Project: ${project.name}. Change project`}
            style={{ paddingLeft: metrics.pageHeader.projectPadLeft, flexShrink: 1, flexDirection: 'row', alignItems: 'center', gap: metrics.groupHeader.toggleGap }}
          >
            <ProjectLine project={project} />
            <ChevronDown size={size.icon.caret} color={c.muted} strokeWidth={metrics.iconStrokeActive} />
          </Pressable>
        ) : (
          <View style={{ paddingLeft: metrics.pageHeader.projectPadLeft, flexShrink: 1 }}>
            <ProjectLine project={project} />
          </View>
        )
      ) : null}
      <View style={{ flex: 1 }} />
      <Actions actions={actions} iconSize={size.icon.header} />
      {right ? <View style={{ marginLeft: actions?.length ? metrics.pageHeader.actionGap : 0 }}>{right}</View> : null}
    </View>
  );
}

/** Project tasks: bigger back + 24 Bold title, project line underneath. */
export function TasksHeader({ title, project, onBack, actions }: { title: string; project?: HeaderProject | null; onBack?: () => void; actions?: HeaderAction[] }) {
  const c = useColors();
  return (
    // back · column (title / project) · actions
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: metrics.pageHeader.gap }}>
      <Back onBack={onBack} iconSize={metrics.pageHeader.backTasks} />
      <View style={{ flex: 1, gap: metrics.pageHeader.tasksTitleGap }}>
        <Text accessibilityRole="header" numberOfLines={2} style={[type.title, { color: c.text }]}>
          {title}
        </Text>
        {project ? <ProjectLine project={project} square="taskHeader" textStyle={type.meta} /> : null}
      </View>
      <Actions actions={actions} iconSize={size.icon.header} />
    </View>
  );
}

/** Detail screens: back on the left, icons on the right; the title is its own block below. */
export function DetailHeader({ onBack, actions }: { onBack?: () => void; actions?: HeaderAction[] }) {
  return (
    <View style={{ minHeight: metrics.pageHeader.height, flexDirection: 'row', alignItems: 'center' }}>
      <Back onBack={onBack} iconSize={metrics.pageHeader.back} />
      <View style={{ flex: 1 }} />
      <Actions actions={actions} iconSize={size.icon.header} />
    </View>
  );
}

/** Tab roots (Projects, Messages): 30 Bold title + muted count + actions. */
export function RootTitle({
  title,
  count,
  countSize = 'large',
  actions,
  accentActions,
}: {
  title: string;
  count?: string | number | null;
  countSize?: 'large' | 'small';
  actions?: HeaderAction[];
  /** Projects: actions drawn in accent. */
  accentActions?: boolean;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: metrics.pageHeader.projectGap, flex: 1 }}>
        <Text accessibilityRole="header" style={[type.display, { color: c.text }]}>
          {title}
        </Text>
        {count != null && count !== '' ? (
          <Text style={[countSize === 'large' ? type.emptyTitle : type.body, tabular, { color: c.muted }]}>{count}</Text>
        ) : null}
      </View>
      <Actions actions={accentActions ? actions?.map((a) => ({ ...a, active: true })) : actions} iconSize={metrics.pageHeader.rootAction} />
    </View>
  );
}

/** Form sheet header: Cancel · centred title (+ project) · Done. */
export function SheetHeader({
  title,
  project,
  onCancel,
  onDone,
  doneLabel = 'Done',
  doneDisabled,
  right,
}: {
  title: string;
  project?: HeaderProject | null;
  onCancel?: () => void;
  onDone?: () => void;
  doneLabel?: string;
  doneDisabled?: boolean;
  right?: ReactNode;
}) {
  const c = useColors();
  return (
    <View style={{ minHeight: metrics.sheetHeader.height, flexDirection: 'row', alignItems: 'center' }}>
      <View style={{ width: metrics.sheetHeader.sideWidth }}>
        {onCancel ? (
          <Pressable onPress={onCancel} hitSlop={metrics.hitSlop} accessibilityRole="button">
            <Text style={[type.rowTitle, { color: c.muted }]}>Cancel</Text>
          </Pressable>
        ) : null}
      </View>
      <View style={{ flex: 1, alignItems: 'center' }}>
        <Text accessibilityRole="header" numberOfLines={1} style={[type.sheetTitle, { color: c.text }]}>
          {title}
        </Text>
        {project ? <ProjectLine project={project} textStyle={type.caption} /> : null}
      </View>
      <View style={{ width: metrics.sheetHeader.sideWidth, alignItems: 'flex-end' }}>
        {right ??
          (onDone ? (
            <Pressable onPress={onDone} disabled={doneDisabled} hitSlop={metrics.hitSlop} accessibilityRole="button">
              <Text style={[type.rowTitle, { color: doneDisabled ? c.accentDisabled : c.accent }]}>{doneLabel}</Text>
            </Pressable>
          ) : null)}
      </View>
    </View>
  );
}
