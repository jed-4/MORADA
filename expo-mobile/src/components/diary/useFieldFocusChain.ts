import { useCallback, useRef } from 'react';
import type { TextInputInstance } from 'react-native';

/**
 * Return-key "Next" for a form whose fields come from a template.
 *
 *   const chain = useFieldFocusChain(['title', ...fieldIds]);
 *   <TextInput ref={chain.ref('title')}
 *     returnKeyType={chain.isLast('title') ? 'done' : 'next'}
 *     submitBehavior={chain.isLast('title') ? 'blurAndSubmit' : 'submit'}
 *     onSubmitEditing={() => chain.next('title')} />
 *
 * `next` focuses the next key in `order` that has a mounted input (so a
 * select or switch in between is skipped), or dismisses the keyboard at the end.
 * Ref callbacks are cached per key, so re-renders don't detach/re-attach them.
 */
export function useFieldFocusChain(order: string[]) {
  const inputs = useRef(new Map<string, TextInputInstance>());
  const callbacks = useRef(new Map<string, (r: TextInputInstance | null) => void>());
  const orderRef = useRef(order);
  orderRef.current = order;

  const ref = useCallback((key: string) => {
    let cb = callbacks.current.get(key);
    if (!cb) {
      cb = (r: TextInputInstance | null) => {
        if (r) inputs.current.set(key, r);
        else inputs.current.delete(key);
      };
      callbacks.current.set(key, cb);
    }
    return cb;
  }, []);

  const nextKey = useCallback((key: string): string | null => {
    const o = orderRef.current;
    for (let i = o.indexOf(key) + 1; i > 0 && i < o.length; i++) {
      if (inputs.current.has(o[i])) return o[i];
    }
    return null;
  }, []);

  const next = useCallback((key: string) => {
    const k = nextKey(key);
    if (k) inputs.current.get(k)?.focus();
    else inputs.current.get(key)?.blur();
  }, [nextKey]);

  /** True when no later input exists — show "done" on the return key. */
  const isLast = useCallback((key: string) => {
    const o = orderRef.current;
    const i = o.indexOf(key);
    return i === -1 || i === o.length - 1;
  }, []);

  return { ref, next, isLast };
}
