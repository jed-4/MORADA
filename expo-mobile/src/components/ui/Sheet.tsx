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
import { useColors, MAX_FONT_SCALE, metrics, radii, shadow, size, type } from '../../theme';
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
  const c = useColors();
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
        opacity={1}
        style={[props.style, { backgroundColor: c.scrim }]}
      />
    ),
    [c.scrim],
  );

  const points = useMemo(() => snapPoints, [snapPoints]);

  // Revamp: a plain centred title on the sheet's bg, no rule under it.
  const header = title ? (
    <View style={styles.header}>
      <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[type.sheetTitle, styles.title, { color: c.text }]} accessibilityRole="header">
        {title}
      </Text>
    </View>
  ) : null;

  // With a footer, leave room so the last field can scroll clear of it.
  const contentStyle = { paddingBottom: footer ? metrics.sheet.footerSpace + insets.bottom : insets.bottom + metrics.sheet.padX };

  const renderFooter = useCallback(
    (props: BottomSheetFooterProps) => (
      <BottomSheetFooter {...props}>
        <View
          style={[
            styles.footer,
            { backgroundColor: c.bg, borderTopColor: c.border, paddingBottom: Math.max(insets.bottom, metrics.actionBar.padY) },
          ]}
        >
          {footer}
        </View>
      </BottomSheetFooter>
    ),
    [footer, c.bg, c.border, insets.bottom],
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
      style={[shadow.sheet, sheetStyle]}
      backdropComponent={renderBackdrop}
      footerComponent={footer ? renderFooter : undefined}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      // Revamp v1 (COMPONENTS §24): bg fill, 20 top radius, 36×5 grabber.
      backgroundStyle={{ backgroundColor: c.bg, borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet }}
      handleStyle={{ paddingTop: metrics.sheet.grabberTop }}
      handleIndicatorStyle={{
        backgroundColor: c.grabber,
        width: metrics.sheet.grabberWidth,
        height: metrics.sheet.grabberHeight,
        borderRadius: metrics.sheet.grabberHeight / 2,
      }}
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
  footer: {
    flexDirection: 'row',
    gap: metrics.actionBar.gap,
    paddingHorizontal: metrics.sheet.padX,
    paddingTop: metrics.actionBar.padY,
    borderTopWidth: size.border,
  },
  header: {
    paddingHorizontal: metrics.sheet.padX,
    paddingTop: metrics.sheet.titlePadTop,
    paddingBottom: metrics.sheet.titlePadBottom,
  },
  title: { textAlign: 'center' },
});
