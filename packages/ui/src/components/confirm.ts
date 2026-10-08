/**
 * THE APP'S OWN CONFIRMATION, the part of it that is not drawn (the owner, 2026-09-29: *"im in what
 * to track, and tried to turn off pumping module. but the confirmation box is not in our ordinary
 * design, im from android, and it look like an old text box that android has. why does this not
 * follow our design?"*).
 *
 * Every question the app asked before it did something — turning a module off, deleting a log,
 * skipping a slot, signing out everywhere, ending a sleep for tummy time — was React Native's
 * `Alert.alert`: the phone's own dialog, which Android draws as a gray box from another decade and
 * iOS in the system's own type, in none of the app's themes and none of its skins. Each is now one
 * sheet of the design system (`ConfirmSheet`), and this file is what it answers, pure so node holds
 * every answer (`confirm.test.ts`):
 *
 *   ONE ANSWER    `ask` resolves once: true on the action; false on Cancel, the sheet's Close, a tap
 *                 on the scrim, a drag down, or Android's Back. The first answer is the answer: a
 *                 second tap on the action while the sheet slides away, or a Cancel after it, is
 *                 nothing. What the action DOES is the caller's, after the promise resolves, so a
 *                 double tap can never do it twice.
 *   IN TURN       a question asked while another is up waits for it (Both, with both babies asleep,
 *                 asks once per baby), and is shown once the one before has had `gapMs` to leave.
 *                 Swapped in place, the second would read as the first with its words changed, and
 *                 a screen reader would not hear that it is a new question.
 *   NEVER HANGS   a question needs a sheet on the screen to be answered. A host with nothing
 *                 subscribed (its element not mounted, or its screen or sheet gone) answers a new
 *                 question false at once, and the last subscriber leaving answers everything still
 *                 waiting false: Cancel writes nothing, and a question nobody can see must never
 *                 hold a write open for ever (a timer's start holds its key until it is answered).
 *   DISMISS       `dismiss` answers everything false without being asked: something else took the
 *                 screen (the shell opening another sheet over a question it hosts).
 *
 * The store shape (`subscribe`, `current`) is `useSyncExternalStore`'s, so only the sheet redraws
 * when a question comes and goes, never the screen that asked it.
 */

/** What a confirmation asks: one question, one line under it, and the two answers. */
export interface ConfirmRequest {
  /** The question, as the sheet's title: "Turn off pumping?". */
  title: string;
  /** One short line under it: what the action changes, or what it is about. */
  body: string;
  /** The action's own words, never "OK" or "Yes": "Turn off", "Delete", "End sleep". */
  action: string;
  /** The other answer; `CONFIRM_CANCEL` when not given. */
  cancel?: string;
  /**
   * Drawn as the danger button, as Delete, Discard and Leave household are: a thing that removes,
   * stops or cannot be taken back. A plain primary otherwise (ending a sleep for tummy time is
   * undone from its toast like any stop, so it is not drawn as a danger).
   */
  destructive?: boolean;
}

/** Asks, and resolves with the answer: true for the action, false for everything else. */
export type Confirm = (request: ConfirmRequest) => Promise<boolean>;

export const CONFIRM_CANCEL = 'Cancel';

/** One of the sheet's two buttons, in the order it draws them (`confirmButtons`). */
export interface ConfirmButton {
  label: string;
  variant: 'danger' | 'primary' | 'ghost';
  /** What a press answers. */
  answer: boolean;
  /** `<testID>.action` / `<testID>.cancel`. */
  role: 'action' | 'cancel';
}

/**
 * THE ACTION FIRST, FULL WIDTH, THEN CANCEL UNDER IT AS A GHOST: the way the app already asks in
 * its own pages (Family's Leave household, the supply's Remove), so a question looks the same
 * wherever it is asked. Top to bottom is also the reading order, for a screen reader as for an eye.
 */
export function confirmButtons(request: ConfirmRequest): [ConfirmButton, ConfirmButton] {
  return [
    {
      label: request.action,
      variant: request.destructive === true ? 'danger' : 'primary',
      answer: true,
      role: 'action',
    },
    { label: request.cancel ?? CONFIRM_CANCEL, variant: 'ghost', answer: false, role: 'cancel' },
  ];
}

export interface ConfirmQueue {
  /** Asks; resolves with the answer (see the header). Stable for the queue's life. */
  ask: Confirm;
  /** The sheet's answer: the action (true), or Cancel, Close, the scrim, a drag or Back (false). */
  answer: (ok: boolean) => void;
  /** Answers every question up or waiting false, unasked: something else took the screen. */
  dismiss: () => void;
  /** The question on the screen, or null. The same object for as long as it is up. */
  current: () => ConfirmRequest | null;
  /** The sheet that draws the questions; returns its unsubscribe. */
  subscribe: (listener: () => void) => () => void;
}

export interface ConfirmQueueOptions {
  /** How long a question has to leave before the next is shown; 0 shows it at once. */
  gapMs?: number;
  /** `setTimeout`, returning its clear: a test hands in its own clock. */
  schedule?: (run: () => void, ms: number) => () => void;
  now?: () => number;
}

interface Asked {
  request: ConfirmRequest;
  resolve: (ok: boolean) => void;
}

const realSchedule = (run: () => void, ms: number): (() => void) => {
  const id = setTimeout(run, ms);
  return () => clearTimeout(id);
};

export function confirmQueue(options: ConfirmQueueOptions = {}): ConfirmQueue {
  const gapMs = options.gapMs ?? 0;
  const schedule = options.schedule ?? realSchedule;
  const now = options.now ?? Date.now;
  const listeners = new Set<() => void>();
  const waiting: Asked[] = [];
  let up: Asked | null = null;
  let leftAt: number | null = null;
  let pending: (() => void) | null = null;

  const emit = () => {
    for (const listener of [...listeners]) listener();
  };

  /** Shows the next question, once nothing is up and the last one has had its time to leave. */
  const next = () => {
    if (up !== null || pending !== null || waiting.length === 0) return;
    const wait = leftAt === null ? 0 : leftAt + gapMs - now();
    if (wait > 0) {
      pending = schedule(() => {
        pending = null;
        next();
      }, wait);
      return;
    }
    up = waiting.shift() ?? null;
    emit();
  };

  const dismiss = () => {
    pending?.();
    pending = null;
    const all = [...(up === null ? [] : [up]), ...waiting.splice(0)];
    const wasUp = up !== null;
    up = null;
    if (wasUp) {
      leftAt = now();
      emit();
    }
    for (const q of all) q.resolve(false);
  };

  return {
    ask: request => {
      // nothing on the screen can answer it: Cancel, at once, rather than a question nobody sees
      if (listeners.size === 0) return Promise.resolve(false);
      return new Promise<boolean>(resolve => {
        waiting.push({ request, resolve });
        next();
      });
    },
    answer: ok => {
      // already answered — the second tap of a double tap, or a Cancel as the sheet slides away
      if (up === null) return;
      const q = up;
      up = null;
      leftAt = now();
      emit();
      q.resolve(ok);
      next();
    },
    dismiss,
    current: () => up?.request ?? null,
    subscribe: listener => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
        // the sheet is gone (its screen or its own sheet closed): nothing can answer what waits
        if (listeners.size === 0) dismiss();
      };
    },
  };
}
