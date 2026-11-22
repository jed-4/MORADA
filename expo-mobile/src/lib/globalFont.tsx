/**
 * App-wide Inter (revamp v1).
 *
 * React 19 dropped defaultProps on function components, so React Native has
 * no supported "default font" switch. Instead we wrap RN's own <Text> and
 * <TextInput> once, at startup, before any screen renders:
 *
 *  - fontWeight → the matching Inter file (Inter_400Regular … Inter_700Bold).
 *    Custom fonts don't respond to fontWeight (Android ignores it, iOS can't
 *    find a bold member of an aliased family), so without this every existing
 *    bold label would silently turn regular.
 *  - A <Text> with no colour gets the theme's primary text colour.
 *  - Any explicit fontFamily (monospace, an icon font, a type.* style) is left
 *    alone, and nested <Text> without its own weight/colour still inherits
 *    from its parent.
 *
 * Every <Text> from 'react-native' reads `require('./Libraries/Text/Text')
 * .default` lazily, so replacing that export here reaches all importers,
 * including third-party components. Import this module at the top of App.tsx.
 */
import React, { useContext } from 'react';
import { StyleSheet, type TextStyle } from 'react-native';
import { fonts, currentColors } from '../theme';

/* eslint-disable @typescript-eslint/no-var-requires */
const TextModule = require('react-native/Libraries/Text/Text');
const TextInputModule = require('react-native/Libraries/Components/TextInput/TextInput');
const TextAncestorContext: React.Context<boolean> =
  require('react-native/Libraries/Text/TextAncestorContext').default;
/* eslint-enable @typescript-eslint/no-var-requires */

const PATCHED = Symbol.for('morada.globalFont');

export function interFamilyForWeight(weight: TextStyle['fontWeight']): string {
  switch (String(weight ?? '400')) {
    case '500':
      return fonts.medium;
    case '600':
      return fonts.semibold;
    case '700':
    case '800':
    case '900':
    case 'bold':
    case 'heavy':
    case 'black':
      return fonts.bold;
    default:
      return fonts.regular;
  }
}

/**
 * The style to add on top of the caller's own. Returns null when nothing needs
 * changing (explicit family set, or a nested span that should inherit).
 */
function interOverride(style: unknown, nested: boolean, withColor: boolean): TextStyle | null {
  const flat = (StyleSheet.flatten(style as any) ?? {}) as TextStyle;
  const out: { -readonly [K in keyof TextStyle]: TextStyle[K] } = {};
  if (!flat.fontFamily && (!nested || flat.fontWeight != null)) {
    out.fontFamily = interFamilyForWeight(flat.fontWeight);
    // The weight is now carried by the family; leaving it set makes iOS look
    // for a bold member of "Inter_700Bold" and fall back to the system font.
    if (flat.fontWeight != null) out.fontWeight = undefined;
  }
  if (withColor && !nested && flat.color == null) {
    out.color = currentColors().text;
  }
  return Object.keys(out).length ? out : null;
}

function patch(mod: any, withColor: boolean) {
  const Original = mod?.default;
  if (!Original || Original[PATCHED]) return;

  function InterText(props: any) {
    const nested = useContext(TextAncestorContext);
    const extra = interOverride(props.style, nested, withColor);
    if (!extra) return React.createElement(Original, props);
    // React 19: `ref` arrives in props and is forwarded by the spread.
    return React.createElement(Original, { ...props, style: [props.style, extra] });
  }

  // Keep statics (TextInput.State, displayName) so callers see no difference.
  for (const key of Object.getOwnPropertyNames(Original)) {
    if (key === 'length' || key === 'name' || key === 'prototype' || key === 'caller' || key === 'arguments') continue;
    try {
      (InterText as any)[key] = Original[key];
    } catch {
      /* non-writable static — skip */
    }
  }
  (InterText as any)[PATCHED] = true;

  try {
    mod.default = InterText;
  } catch (err) {
    if (__DEV__) console.warn('[globalFont] could not apply Inter to', Original.displayName, err);
  }
}

patch(TextModule, true);
patch(TextInputModule, false);

/** True when the patch took effect (checked in dev on startup). */
export function globalFontApplied(): boolean {
  return Boolean(require('react-native').Text?.[PATCHED]);
}
