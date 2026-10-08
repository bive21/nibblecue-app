/**
 * ONE NATIVE MODAL AT A TIME, ON AN iPHONE (2026-10-06, the owner: "from milk stash page, used one of
 * the entries from deep freezer, and the screen froze again … we've fixed it once this morning, and
 * now this happens again").
 *
 * WHAT FREEZES. Every sheet, popover and picker here is a React Native `Modal`, which iOS presents as
 * a view controller of its own. Ask iOS to present one while another is still being dismissed and the
 * second is presented from a controller that is going away: it never shows, and its transparent window
 * stays over the app, taking every touch. The parent sees a screen that will not respond. This
 * morning it was the pump's two pages (`handOffSheet`); this afternoon a stored bag's "Use for a
 * bottle", which closes the bag's sheet and opens the bottle's in the same tap. Any "close this, open
 * that" in the app is the same bug waiting, so the rule lives here, once, for every modal.
 *
 * THE RULE. A modal that is let go counts as LEAVING for long enough to have gone — its own exit
 * animation and the system's dismissal after it. A modal asked to open while any is leaving waits
 * until none is, then opens. Android has no such limit (its dialogs stack), and is left exactly as it
 * was: there the gate is never consulted. Pure state, so `modalGate.test.ts` holds the arithmetic.
 */

/** The system's own dismissal of a view controller, after the exit the app draws. */
export const IOS_DISMISS_MS = 380;

export interface ModalGate {
  /** A modal let go: leaving for `ms` from now. Returns a release, for one that comes back first. */
  leave(ms: number): () => void;
  /** Whether any modal is still leaving. */
  busy(): boolean;
  /** Run `cb` once nothing is leaving — at once when nothing is. Returns a cancel. */
  whenSettled(cb: () => void): () => void;
}

export function createModalGate(
  timers: {
    set: (fn: () => void, ms: number) => unknown;
    clear: (id: unknown) => void;
  } = {
    set: (fn, ms) => setTimeout(fn, ms),
    clear: id => clearTimeout(id as ReturnType<typeof setTimeout>),
  },
): ModalGate {
  let leaving = 0;
  const waiting = new Set<() => void>();
  const flush = () => {
    if (leaving > 0) return;
    const run = [...waiting];
    waiting.clear();
    for (const cb of run) cb();
  };
  return {
    leave(ms) {
      leaving += 1;
      let gone = false;
      const done = () => {
        if (gone) return;
        gone = true;
        timers.clear(id);
        leaving -= 1;
        flush();
      };
      const id = timers.set(done, ms);
      return done;
    },
    busy: () => leaving > 0,
    whenSettled(cb) {
      if (leaving === 0) {
        cb();
        return () => undefined;
      }
      waiting.add(cb);
      return () => {
        waiting.delete(cb);
      };
    },
  };
}

/** The app's one gate: every modal in it shares it. */
export const modalGate = createModalGate();

/**
 * WHAT ONE MODAL DOES WHEN ITS `visible` CHANGES — `useModalGate`'s effect, kept here so a test can
 * play two modals through one tap in either order. Let go: leaving from now, if it was showing, and
 * hidden. Asked to open: it looks at the gate on the NEXT tick, after every effect of the commit
 * that asked has run — so a modal let go by the same tap is already leaving, whichever of the two
 * effects ran first (2026-10-07: the bag's sheet closing and the bottle's opening crossed when the
 * opening one looked first). Returns the effect's cleanup.
 */
export function gateVisibility(
  gate: ModalGate,
  visible: boolean,
  wasShown: boolean,
  leaveMs: number,
  setShown: (shown: boolean) => void,
  defer: (fn: () => void) => () => void = fn => {
    const id = setTimeout(fn, 0);
    return () => clearTimeout(id);
  },
): () => void {
  if (!visible) {
    if (wasShown) gate.leave(leaveMs);
    setShown(false);
    return () => undefined;
  }
  let cancel = (): void => undefined;
  const stopTick = defer(() => {
    cancel = gate.whenSettled(() => setShown(true));
  });
  return () => {
    stopTick();
    cancel();
  };
}
