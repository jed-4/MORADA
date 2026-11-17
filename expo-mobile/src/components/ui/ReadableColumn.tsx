import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Widest a column of reading text should get. On the Duo unfolded a full-width
 * line of diary text or a note runs ~7.6 inches — hard to read. Phones are
 * narrower than this, so nothing changes there.
 */
export const READABLE_MAX_WIDTH = 720;

/** Spread onto a ScrollView's contentContainerStyle or a content View. */
export const readableFrame = { width: '100%', maxWidth: READABLE_MAX_WIDTH, alignSelf: 'center' } as const;

/** Centres its children in a column no wider than READABLE_MAX_WIDTH. */
export function ReadableColumn({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[readableFrame, style]}>{children}</View>;
}
