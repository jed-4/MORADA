import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { metrics, radii, shadow, size, space, useColors } from '../../theme';
import { sheetFrame } from '../ui/Sheet';
import { SheetHeader } from './PageHeader';

/**
 * A pop-up built on RN Modal (for forms with their own keyboard handling, and
 * pickers that must open over another modal): scrim, bg sheet with a 20 top
 * radius and grabber, Close/Cancel · title · action header, the caller's
 * content, and an optional bottom bar.
 */
export function ModalSheet({
  visible,
  onRequestClose,
  title,
  cancelLabel = 'Close',
  onCancel,
  doneLabel,
  onDone,
  doneDisabled,
  doneLoading,
  form,
  fill,
  bottomBar,
  keyboardBehavior,
  children,
}: {
  /** Fill up to 90% even when the content is short (long pick lists). */
  fill?: boolean;
  keyboardBehavior?: 'padding' | 'height';
  visible: boolean;
  onRequestClose: () => void;
  title: string;
  cancelLabel?: string;
  /** Omit for a header with only the action on the right. */
  onCancel?: () => void;
  doneLabel?: string;
  onDone?: () => void;
  doneDisabled?: boolean;
  doneLoading?: boolean;
  /** Forms take a fixed 90% so the header action stays above the keyboard. */
  form?: boolean;
  bottomBar?: ReactNode;
  children: ReactNode;
}) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onRequestClose}>
      <View style={[fr.overlay, { backgroundColor: c.scrim }]}>
        <KeyboardAvoidingView behavior={keyboardBehavior ?? (Platform.OS === 'ios' ? 'padding' : undefined)} style={fr.container}>
          <View style={[fr.sheet, shadow.sheet, sheetFrame, { backgroundColor: c.bg, paddingBottom: bottomBar ? 0 : insets.bottom }, (form || fill) && fr.sheetForm]}>
            <View style={[fr.grabber, { backgroundColor: c.grabber }]} />
            <View style={fr.header}>
              <SheetHeader
                title={title}
                cancelLabel={cancelLabel}
                onCancel={onCancel}
                doneLabel={doneLabel}
                onDone={onDone}
                doneDisabled={doneDisabled}
                doneLoading={doneLoading}
              />
            </View>
            {children}
            {bottomBar ? (
              <View
                style={[
                  fr.bottomBar,
                  { borderTopColor: c.border, backgroundColor: c.bg, paddingBottom: Math.max(insets.bottom, metrics.actionBar.padY) },
                ]}
              >
                {bottomBar}
              </View>
            ) : null}
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const fr = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end' },
  // flex: 1 so the sheet's percentage heights resolve against the screen.
  container: { flex: 1, justifyContent: 'flex-end' },
  sheet: { borderTopLeftRadius: radii.sheet, borderTopRightRadius: radii.sheet, maxHeight: '90%' },
  sheetForm: { height: '90%' },
  grabber: {
    alignSelf: 'center',
    marginTop: metrics.sheet.grabberTop,
    width: metrics.sheet.grabberWidth,
    height: metrics.sheet.grabberHeight,
    borderRadius: metrics.sheet.grabberHeight / 2,
  },
  header: { paddingHorizontal: space.screenX },
  bottomBar: {
    flexDirection: 'row',
    gap: metrics.actionBar.gap,
    paddingHorizontal: space.screenX,
    paddingTop: metrics.actionBar.padY,
    borderTopWidth: size.border,
  },
});
