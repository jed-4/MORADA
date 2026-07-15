import { forwardRef, useCallback, useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  BottomSheetTextInput,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, fontSize, fontWeight } from '../../theme';
import { haptic } from '../../lib/haptics';

// Gesture-driven bottom sheet — the app-wide replacement for hand-rolled
// <Modal> forms, detail views, and pickers.
//
//   const ref = useRef<BottomSheetModal>(null);
//   ref.current?.present();  ref.current?.dismiss();
//
//   <Sheet ref={ref} title="Filter tasks">
//     ...content...
//   </Sheet>
//
// Sizing: dynamic by default (grows to content, up to 88%). Pass snapPoints
// (e.g. ['50%', '88%']) for fixed-height sheets. Use scrollable for long
// content, and SheetTextInput inside sheets so the keyboard is handled.

export type SheetRef = BottomSheetModal;

interface SheetProps {
  title?: string;
  children: ReactNode;
  /** Fixed snap points (e.g. ['50%', '88%']). Defaults to dynamic content sizing. */
  snapPoints?: (string | number)[];
  /** Wrap content in a BottomSheetScrollView for long content. */
  scrollable?: boolean;
  /** Pass 'push' for sheets presented on top of another sheet (e.g. pickers inside a form sheet). */
  stackBehavior?: 'push' | 'switch' | 'replace';
  onDismiss?: () => void;
}

export const Sheet = forwardRef<BottomSheetModal, SheetProps>(function Sheet(
  { title, children, snapPoints, scrollable, stackBehavior, onDismiss },
  ref,
) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        pressBehavior="close"
        opacity={0.45}
      />
    ),
    [],
  );

  const points = useMemo(() => snapPoints, [snapPoints]);

  const header = title ? (
    <View style={[styles.header, { borderBottomColor: theme.border }]}>
      <Text style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
    </View>
  ) : null;

  const contentStyle = { paddingBottom: insets.bottom + 16 };

  return (
    <BottomSheetModal
      ref={ref}
      snapPoints={points}
      enableDynamicSizing={!points}
      maxDynamicContentSize={undefined}
      enablePanDownToClose
      stackBehavior={stackBehavior}
      onDismiss={onDismiss}
      onAnimate={(_from, to) => {
        if (to === 0) haptic.light();
      }}
      backdropComponent={renderBackdrop}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      backgroundStyle={{ backgroundColor: theme.card, borderRadius: 20 }}
      handleIndicatorStyle={{ backgroundColor: theme.borderStrong, width: 40 }}
    >
      {scrollable ? (
        <BottomSheetScrollView
          contentContainerStyle={contentStyle}
          keyboardShouldPersistTaps="handled"
        >
          {header}
          {children}
        </BottomSheetScrollView>
      ) : (
        <BottomSheetView style={contentStyle}>
          {header}
          {children}
        </BottomSheetView>
      )}
    </BottomSheetModal>
  );
});

/** TextInput that plays nicely with sheet keyboard handling. */
export { BottomSheetTextInput as SheetTextInput };

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginBottom: 8,
  },
  title: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
  },
});
