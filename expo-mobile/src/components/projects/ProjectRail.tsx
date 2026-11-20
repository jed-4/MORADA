import { ScrollView, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme, lightTheme } from '../../theme';
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
  const theme = useTheme();
  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      {projects.map((p) => {
        const selected = p.id === selectedId;
        const label = (p.jobNumber || p.projectNumber || initials(p.name)).slice(0, 5);
        const colour = p.color || lightTheme.textMuted;
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
            style={styles.item}
          >
            <View
              style={[
                styles.badge,
                { backgroundColor: colour },
                selected && { borderColor: theme.textPrimary, borderWidth: 3 },
              ]}
            >
              <Text style={styles.badgeText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {label}
              </Text>
            </View>
            <Text
              style={[styles.name, { color: selected ? theme.textPrimary : theme.textSecondary }]}
              numberOfLines={2}
            >
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
  content: { alignItems: 'center', paddingBottom: 24, gap: 10 },
  item: { width: 68, alignItems: 'center', gap: 4, paddingVertical: 2 },
  badge: { width: 48, height: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3 },
  badgeText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  name: { fontSize: 10, textAlign: 'center', lineHeight: 12 },
});
