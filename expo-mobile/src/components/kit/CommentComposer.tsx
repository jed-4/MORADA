import { Pressable, TextInput, View } from 'react-native';
import { Paperclip, Send } from 'lucide-react-native';
import { metrics, radii, size, type, useColors } from '../../theme';

interface CommentComposerProps {
  value: string;
  onChangeText: (text: string) => void;
  onSend: () => void;
  onAttach?: () => void;
  placeholder?: string;
  sending?: boolean;
  multiline?: boolean;
}

/** Chat / comment input: optional clip · text · send. */
export function CommentComposer({ value, onChangeText, onSend, onAttach, placeholder = 'Write a comment…', sending, multiline = true }: CommentComposerProps) {
  const c = useColors();
  const m = metrics.composer;
  const canSend = value.trim().length > 0 && !sending;
  return (
    <View
      style={{
        minHeight: m.height,
        borderRadius: radii.lg,
        backgroundColor: c.surface,
        borderWidth: size.border,
        borderColor: c.border,
        flexDirection: 'row',
        alignItems: 'center',
        gap: m.gap,
        paddingLeft: m.padLeft,
        paddingRight: m.padRight,
      }}
    >
      {onAttach ? (
        <Pressable onPress={onAttach} hitSlop={metrics.hitSlop} accessibilityLabel="Attach">
          <Paperclip size={m.icon} color={c.icon} strokeWidth={metrics.iconStroke} />
        </Pressable>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={c.faint}
        multiline={multiline}
        style={[type.body, { flex: 1, color: c.textBody, paddingVertical: m.padY }]}
      />
      <Pressable onPress={onSend} disabled={!canSend} hitSlop={metrics.hitSlop} accessibilityRole="button" accessibilityLabel="Send">
        <Send size={m.icon} color={canSend ? c.accent : c.faint} strokeWidth={metrics.iconStroke} />
      </Pressable>
    </View>
  );
}
