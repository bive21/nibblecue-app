/**
 * Toasts (docs/DESIGN_SYSTEM.md §5, §11 "Toasts"): one on screen at a time, queued behind it,
 * with up to two actions — and the right-hand slot is Undo on every screen, always. The
 * queue rules are the pure reducer in @nibblecue/ui (toastQueue.ts, tested); this file is
 * the host: it holds the state, announces each message to the screen reader, and places the
 * toast above the floating tab bar and its raised button.
 */
import {
  INITIAL_TOAST_STATE,
  screenBottomPadding,
  SheetToastContext,
  Toast,
  TOAST_MAX_WIDTH,
  toastDurationFor,
  toastReducer,
  useSheetsUp,
  useTheme,
  type ToastItem,
  type ToastSecondaryAction,
} from '@nibblecue/ui';
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
  type ReactNode,
} from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ToastOptions {
  /** The recoverable action; it always takes the right-hand slot. */
  undo?: () => void;
  /** The softer action to Undo's left ("+ Liam" on a twin household's entry). */
  secondary?: ToastSecondaryAction;
  /** Show after the current toast instead of replacing it. */
  queue?: boolean;
}

export interface ToastValue {
  show(message: string, options?: ToastOptions): void;
  dismiss(): void;
}

const ToastContext = createContext<ToastValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(toastReducer, INITIAL_TOAST_STATE);
  const seq = useRef(0);
  const show = useCallback((message: string, options: ToastOptions = {}) => {
    /**
     * AN EMPTY TOAST IS A BUG, NOT A TOAST. A box with no sentence in it tells a parent that
     * something happened and refuses to say what — worse than silence, because it looks like a
     * failure. Callers that had nothing to say were passing '' (`StashSaveSheet` did, on the
     * path where a save did not commit), so the host refuses it outright rather than drawing
     * the box. `toast.test.ts` holds it.
     */
    if (message.trim().length === 0) return;
    seq.current += 1;
    const item: ToastItem = {
      id: `t${seq.current}`,
      message,
      ...(options.undo ? { undo: options.undo } : {}),
      ...(options.secondary ? { secondary: options.secondary } : {}),
    };
    AccessibilityInfo.announceForAccessibility(message);
    dispatch({ type: options.queue ? 'enqueue' : 'show', item });
  }, []);
  const dismiss = useCallback(() => dispatch({ type: 'dismiss' }), []);
  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const current = state.current;
  // a sheet is a native modal over this host: while one is up, the sheet in front draws the toast
  // over itself instead (`SheetToastContext` in packages/ui), and this host draws nothing
  const sheetUp = useSheetsUp() > 0;
  const toast = current ? (
    <Toast
      id={current.id}
      message={current.message}
      {...(current.undo ? { undo: current.undo } : {})}
      {...(current.secondary ? { secondary: current.secondary } : {})}
      visible
      durationMs={toastDurationFor(current)}
      onDismiss={() => dispatch({ type: 'expire' })}
      style={styles.toast}
    />
  ) : null;
  return (
    <ToastContext.Provider value={value}>
      <SheetToastContext.Provider value={toast}>{children}</SheetToastContext.Provider>
      <View
        pointerEvents="box-none"
        style={[
          styles.host,
          { bottom: screenBottomPadding(insets.bottom, t.tabs), paddingHorizontal: t.space.xxl },
        ]}
      >
        {sheetUp ? null : toast}
      </View>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastValue {
  const v = useContext(ToastContext);
  if (!v) throw new Error('useToast outside ToastProvider');
  return v;
}

const styles = StyleSheet.create({
  host: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  /**
   * A DEFINITE WIDTH, which is what the prototype gives it (`left:12px; right:12px`) and what
   * the toast's own `flex: 1` message needs to resolve against. `alignItems: 'center'` above
   * would otherwise shrink-wrap the toast to its content, and its content is a `flex: 1` text
   * with nothing to flex against — the box collapses to its padding and the parent sees an
   * empty white box with neither the sentence nor Undo in it. The cap keeps it a toast rather
   * than a banner on a tablet, and the centering is what places it once it is capped.
   */
  toast: { width: '100%', maxWidth: TOAST_MAX_WIDTH },
});
