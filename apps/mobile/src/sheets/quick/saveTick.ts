/**
 * THE SAVE THAT TICKS, BETWEEN THE SHEET AND ITS HOST (the owner, 2026-09-26, "agreed": a Save's
 * words give way to a check that draws itself, and the sheet closes as it always has). The drawing
 * is the design system's (`Button`'s `done`, `saveTick.ts` there); this file is the handshake that
 * decides WHEN, because neither half knows enough on its own:
 *
 *   - the form (`QuickEntry`) knows its Save was pressed, but not whether the write landed — a
 *     sheet's `onSave` decides that and says only `onDone()`;
 *   - the host (`QuickEntrySheet`) hears `onDone()`, but not what caused it — a Save, a timer's
 *     Start, the medicine sheet's "manage" row all end in the same call.
 *
 * So the form marks its Save as IN FLIGHT for exactly as long as its `onSave` runs (`pressed`), and
 * the host, told the sheet is done, asks whether a Save is in flight (`holdFor`): if one is, the
 * save landed from it — every sheet calls `onDone()` inside its `onSave`, after the write commits —
 * and the host shows the tick and closes `SAVE_TICK_HOLD_MS` later; if none is, it closes at once,
 * exactly as before. A Start, a Skip or a row that navigates never ticks and never waits.
 *
 * NOTHING HERE TOUCHES THE WRITE. The entry is written, the toast is up and the one haptic is felt
 * (the write funnel, `useWriteContext`) before any of this runs.
 */
import { SAVE_TICK_HOLD_MS } from '@nibblecue/ui/layout';
import { createContext, useContext } from 'react';

export interface SaveTick {
  /** The save landed from the form's Save, and the sheet is holding for its check. */
  ticked: boolean;
  /**
   * Run the form's save with its Save marked in flight until the save settles — landed, refused or
   * thrown. Hands back whatever the save does, so the form's own contract is unchanged.
   */
  pressed(run: () => void | Promise<void>): Promise<void>;
}

export const SaveTickContext = createContext<SaveTick | null>(null);

/** The host's handshake, or null for a form drawn anywhere else: its Save then simply saves. */
export const useSaveTick = (): SaveTick | null => useContext(SaveTickContext);

/**
 * HOW LONG THE HOST WAITS before closing a sheet that says it is done: the tick's hold while a Save
 * is in flight — the save that just landed came from it — and nothing otherwise.
 */
export const holdFor = (inFlight: number): number => (inFlight > 0 ? SAVE_TICK_HOLD_MS : 0);

/**
 * THE SAVES IN FLIGHT, as a set of tokens rather than a count: a save that settles after its sheet
 * has been put away and opened again must not take a new opening's Save out of flight with it.
 */
export interface InFlight {
  readonly size: number;
  /** Mark one save in flight; the returned function marks it settled, once. */
  add(): () => void;
  /** A new opening: nothing is in flight. */
  clear(): void;
}

export function inFlightSaves(): InFlight {
  let live = new Set<object>();
  return {
    get size() {
      return live.size;
    },
    add() {
      const token = {};
      const owner = live;
      owner.add(token);
      return () => {
        owner.delete(token);
      };
    },
    clear() {
      live = new Set();
    },
  };
}

/**
 * `SaveTick.pressed`, over a set of saves in flight. A save that throws before it has begun throws
 * exactly as it did without this, and one that rejects rejects as it did — only settled first.
 */
export function runPressed(saves: InFlight, run: () => void | Promise<void>): Promise<void> {
  const settle = saves.add();
  let out: void | Promise<void>;
  try {
    out = run();
  } catch (err) {
    settle();
    throw err;
  }
  return Promise.resolve(out).finally(settle);
}
