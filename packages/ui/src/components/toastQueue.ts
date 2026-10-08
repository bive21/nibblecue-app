/**
 * Toast queue and slot rules (docs/DESIGN_SYSTEM.md §5 "Toast", §11 "Toasts"; docs/MOBILE.md
 * §8). Pure TypeScript — no React, no react-native — so the host's reducer and the admin
 * console's own toasts share one set of rules and one test.
 *
 * Two rules live here and nowhere else:
 *  - ONE toast is visible at a time and a new `show` REPLACES it (the prototype's `showToast`
 *    rewrites the single toast element). A queued item waits behind the current one only when
 *    the caller chose `enqueue` — a "Saved" toast must never hide behind a stale one.
 *  - The right-hand slot belongs to Undo on every screen. `actionsInOrder` is the only way a
 *    renderer gets the actions, and it always returns the secondary action first so Undo is
 *    the last thing drawn, whatever the caller passed. Its label is never negotiated either.
 *
 * A toast with two actions stays ~7 s rather than ~5.2 s: two labels take longer to read and
 * the second one is the rarer choice, so it needs the extra time more than the first.
 */
export const TOAST_DURATION_MS = 5200;
export const TOAST_DURATION_TWO_ACTIONS_MS = 7000;
export const UNDO_LABEL = 'Undo';

export interface ToastSecondaryAction {
  label: string;
  onPress: () => void;
}

export interface ToastItem {
  id: string;
  message: string;
  /** The recoverable action; always the right-hand slot. */
  undo?: () => void;
  /** The softer action to Undo's left ("+ Liam" on a twin household's entry). */
  secondary?: ToastSecondaryAction;
}

export type ToastSlot =
  | { slot: 'secondary'; label: string; onPress: () => void }
  | { slot: 'undo'; label: typeof UNDO_LABEL; onPress: () => void };

export function toastDuration(hasUndo: boolean, hasSecondary: boolean): number {
  return hasUndo && hasSecondary ? TOAST_DURATION_TWO_ACTIONS_MS : TOAST_DURATION_MS;
}

export const toastDurationFor = (item: Pick<ToastItem, 'undo' | 'secondary'>): number =>
  toastDuration(item.undo !== undefined, item.secondary !== undefined);

/** The actions in render order, left to right: [secondary?, undo?]. Undo is always last. */
export function actionsInOrder(item: Pick<ToastItem, 'undo' | 'secondary'>): ToastSlot[] {
  const out: ToastSlot[] = [];
  if (item.secondary) {
    out.push({ slot: 'secondary', label: item.secondary.label, onPress: item.secondary.onPress });
  }
  if (item.undo) out.push({ slot: 'undo', label: UNDO_LABEL, onPress: item.undo });
  return out;
}

export interface ToastState {
  current: ToastItem | null;
  queue: ToastItem[];
}

export const INITIAL_TOAST_STATE: ToastState = { current: null, queue: [] };

export type ToastQueueAction =
  /** Show now, replacing whatever is on screen. */
  | { type: 'show'; item: ToastItem }
  /** Show after the current one (and after anything already waiting). */
  | { type: 'enqueue'; item: ToastItem }
  /** The person tapped an action or swiped it away. */
  | { type: 'dismiss' }
  /** The timer ran out. */
  | { type: 'expire' };

function advance(state: ToastState): ToastState {
  const [next, ...rest] = state.queue;
  return { current: next ?? null, queue: rest };
}

export function toastReducer(state: ToastState, action: ToastQueueAction): ToastState {
  switch (action.type) {
    case 'show':
      return { current: action.item, queue: state.queue };
    case 'enqueue':
      return state.current === null
        ? { current: action.item, queue: state.queue }
        : { current: state.current, queue: [...state.queue, action.item] };
    case 'dismiss':
    case 'expire':
      // the two are one transition; they are distinct so a host can tell a tap from a timeout
      return advance(state);
  }
}
