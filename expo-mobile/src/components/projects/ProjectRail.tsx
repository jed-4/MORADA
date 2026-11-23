import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { metrics, radii, size, space, tabular, type, useColors } from '../../theme';
import { ProjectSquare } from '../kit';
import { haptic } from '../../lib/haptics';

/**
 * The collapsed sidebar on the Projects screen when the iPhone Duo is
 * unfolded and a job is open (see TwoPane `rail`). One badge per job in the
 * job's own colour, showing its job number (or initials), so you can hop
 * between jobs without the full list taking half the screen.
 */
interface RailProject {
  id: string;
  name: string;
  jobNumber?: string;
  projectNumber?: string;
  color?: string;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

export function ProjectRail({
  projects,
  selectedId,
  onSelect,
}: {
  projects: RailProject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const c = useColors();
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {projects.map((p) => {
        const selected = p.id === selectedId;
        const number = (p.jobNumber || p.projectNumber || initials(p.name)).slice(0, 6);
        return (
          <Pressable
            key={p.id}
            onPress={() => {
              haptic.select();
              onSelect(p.id);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Open ${p.name}`}
            accessibilityState={{ selected }}
            style={({ pressed }) => [styles.item, selected && { backgroundColor: c.tint }, pressed && { opacity: metrics.pressedOpacity }]}
          >
            {/* D02 rail: square 16 · job number 11 · short name 10; current = tint. */}
            <ProjectSquare color={p.color} fallbackKey={p.id} size="rail" />
            <Text style={[type.micro, tabular, { color: selected ? c.link : c.muted }]} numberOfLines={1}>{number}</Text>
            <Text style={[type.tiny, styles.name, { color: selected ? c.link : c.muted }]} numberOfLines={2}>
              {p.name}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { alignSelf: 'stretch' },
  content: { alignItems: 'center', paddingBottom: space.screenBottom, gap: space.inlineSm },
  item: {
    width: size.railWidth - space.rowGap,
    alignItems: 'center',
    gap: space.inlineSm,
    paddingVertical: space.inline,
    paddingHorizontal: space.inlineSm,
    borderRadius: radii.lg,
  },
  name: { textAlign: 'center' },
});
