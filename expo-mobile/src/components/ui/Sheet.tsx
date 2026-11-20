import { forwardRef, useCallback, useMemo, type ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  BottomSheetModal,
  BottomSheetView,
  BottomSheetScrollView,
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetFooter,
  type BottomSheetBackdropProps,
  type BottomSheetFooterProps,
} from '@gorhom/bottom-sheet';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme, fontSize, fontWeight, MAX_FONT_SCALE } from '../../theme';
import { haptic } from '../../lib/haptics';
import { useLayout } from '../../lib/useLayout';

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
//
// Width: full width on a phone. On a big screen (iPhone Duo unfolded) the
// sheet is centred and capped at SHEET_MAX_WIDTH so forms and pickers don't
// stretch edge to edge. Done here, in the primitive, so every sheet gets it —
// never add per-call-site width tweaks.

/** Widest a sheet gets on a big screen, in points. */
export const SHEET_MAX_WIDTH = 560;

/**
 * For the hand-built bottom sheets (a transparent <Modal> with a panel pinned
 * to the bottom) that don't use <Sheet>: spread onto the panel's style so it
 * gets the same cap. A no-op on phones, which are narrower than the cap.
 */
export const sheetFrame = {
  width: '100%',
  maxWidth: SHEET_MAX_WIDTH,
  alignSelf: 'center',
} as const;

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
  /**
   * A form's primary action(s), pinned to the bottom of the sheet above the
   * keyboard and the home indicator — in thumb reach on a tall phone. Pass
   * null/undefined to hide it (e.g. while the sheet shows read-only detail).
   */
  footer?: ReactNode;
}

export const Sheet = forwardRef<BottomSheetModal, SheetProps>(function Sheet(
  { title, children, snapPoints, scrollable, stackBehavior, onDismiss, footer },
  ref,
) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width, isWide } = useLayout();
  // Equal side margins centre the sheet; the backdrop still covers the screen.
  const sideMargin = isWide ? Math.max(0, (width - SHEET_MAX_WIDTH) / 2) : 0;
  const sheetStyle = useMemo(
    () => (sideMargin > 0 ? { marginHorizontal: sideMargin } : undefined),
    [sideMargin],
  );

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
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[styles.title, { color: theme.textPrimary }]}>{title}</Text>
    </View>
  ) : null;

  // With a footer, leave room so the last field can scroll clear of it.
  const contentStyle = { paddingBottom: footer ? FOOTER_SPACE + insets.bottom : insets.bottom + 16 };

  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props}>
        <View
          style={[
            styles.footer,
            { backgroundColor: theme.card, borderTopColor: theme.border, paddingBottom: Math.max(insets.bottom, 12) },
          ]}
        >
          {footer}
        </View>
      </BottomSheetFooter>
    ),
    [footer, theme.card, theme.border, insets.bottom],
  );

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
      style={sheetStyle}
      backdropComponent={renderBackdrop}
      footerComponent={footer ? renderFooter : undefined}
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

/** Room reserved under sheet content for the footer bar (button + padding). */
const FOOTER_SPACE = 84;

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
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
