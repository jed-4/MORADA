import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { metrics, radii, size, space, useColors } from '../../theme';

type CardVariant = 'list' | 'padded' | 'notes' | 'section' | 'duoList';

interface CardProps {
  variant?: CardVariant;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

/**
 * White card, 1dp border, radius 12, never a shadow.
 * `list` puts a 1dp divider between rows (not after the last), inset inside
 * the card's 14dp padding.
 */
export function Card({ variant = 'padded', children, style }: CardProps) {
  const c = useColors();
  const base: ViewStyle = {
    backgroundColor: c.surface,
    borderColor: c.border,
    borderWidth: size.border,
    borderRadius: variant === 'section' ? radii.section : radii.card,
    overflow: 'hidden',
  };
  const pad: ViewStyle =
    variant === 'list'
      ? { paddingHorizontal: space.cardX }
      : variant === 'duoList'
        ? { padding: metrics.card.duoPad }
        : variant === 'notes'
          ? { paddingVertical: metrics.card.notesPadY, paddingHorizontal: space.cardX }
          : variant === 'section'
            ? {
                paddingTop: metrics.card.sectionPad.top,
                paddingRight: metrics.card.sectionPad.right,
                paddingBottom: metrics.card.sectionPad.bottom,
                paddingLeft: metrics.card.sectionPad.left,
                gap: metrics.card.sectionGap,
              }
            : { paddingTop: metrics.card.padTop, paddingBottom: metrics.card.padBottom, paddingHorizontal: space.cardX };

  if (variant !== 'list') return <View style={[base, pad, style]}>{children}</View>;

  const rows = Children.toArray(children).filter(isValidElement);
  return (
    <View style={[base, pad, style]}>
      {rows.map((row, i) => (
        <Fragment key={row.key ?? i}>
          {i > 0 ? <Divider /> : null}
          {row}
        </Fragment>
      ))}
    </View>
  );
}

/** 1dp rule in `border`. Never hairlineWidth — too faint on dense screens. */
export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  return <View style={[{ height: size.border, backgroundColor: c.border }, style]} />;
}
