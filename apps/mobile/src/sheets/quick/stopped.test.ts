/**
 * A PUMP'S STOP, AND THE ONE MOMENT IT ENDS (the owner, 2026-09-24, for the third time: "if we
 * cancel the stop pumpin by clicking X from it, the timer visually stops, until we click stop
 * pumping again then the timer updates… this is crucial as users").
 *
 * Stopping a pump freezes every card at the stop instant while the output is typed
 * (`stopped.ts`). The freeze has to end the moment the sheet asking for the output goes away,
 * however it goes. It was ended by the output panel's UNMOUNT, which is not that moment: the
 * sheet keeps its body mounted until its close animation reports finished, and a reopened sheet
 * unmounts the old panel only after Today has already marked the new stop — so the old panel's
 * cleanup wiped the stop the parent had just made. These hold the store's rules in node, and the
 * two files that decide WHEN, by their source.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearAllStopped,
  clearStopped,
  handStopToStash,
  isHandedToStash,
  markStopped,
  stoppedAt,
  subscribeStopped,
  takeBackStop,
} from './stopped';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');
const flat = (s: string) => s.replace(/\s+/g, ' ');

afterEach(() => {
  // a handed-over stop outlives `clearAllStopped` by design, so the tests let theirs go by name
  for (const id of ['pump-1', 'pump-2']) clearStopped(id);
  clearAllStopped();
});

describe('the stop store', () => {
  it('holds a stop per timer until it is let go', () => {
    markStopped('pump-1', 1_000);
    markStopped('pump-2', 2_000);
    expect(stoppedAt('pump-1')).toBe(1_000);
    clearStopped('pump-1');
    expect(stoppedAt('pump-1')).toBeNull();
    expect(stoppedAt('pump-2')).toBe(2_000);
  });

  it('lets every stop go at once, and tells every card', () => {
    let heard = 0;
    const off = subscribeStopped(() => (heard += 1));
    markStopped('pump-1', 1_000);
    markStopped('pump-2', 2_000);
    const before = heard;
    clearAllStopped();
    expect(stoppedAt('pump-1')).toBeNull();
    expect(stoppedAt('pump-2')).toBeNull();
    expect(heard).toBe(before + 1);
    // and letting go of nothing is not news
    clearAllStopped();
    expect(heard).toBe(before + 1);
    off();
  });

  it('a newer stop is the stop: marking again moves the instant', () => {
    markStopped('pump-1', 1_000);
    markStopped('pump-1', 5_000);
    expect(stoppedAt('pump-1')).toBe(5_000);
  });
});

describe('when a stop ends', () => {
  it('ends when the sheet stops showing the pump, however it was dismissed', () => {
    const sheet = flat(read('../../app/QuickEntrySheet.tsx'));
    expect(sheet).toContain("if (was === 'pump' && moduleId !== 'pump') clearAllStopped();");
    // arriving at the pump never clears: Today and a coin mark the stop FIRST and open second
    expect(sheet).not.toMatch(/moduleId === 'pump'[^;]*clearAllStopped/);
  });

  // (no running panel in NibbleCue to unmount)
  it('marks the stop before opening the sheet, on every path that stops a pump', () => {
    for (const [file, mark, open] of [
      // (CuddleCue's Today stops a pump too; NibbleCue's Today draws no timer)
      // "It ended" and the End time: the one end rule, and the form it opens from Today
      ['timerEnd.ts', 'markStopped(timer.id, endMs);', 'deps.openOutput?.();'],
    ] as const) {
      const src = flat(read(file));
      const at = src.indexOf(mark);
      expect(at, file).toBeGreaterThan(-1);
      expect(src.indexOf(open, at), file).toBeGreaterThan(at);
    }
    expect(flat(read('useEndTimer.ts'))).toContain(
      "openOutput: () => shell.openQuickEntry('pump')",
    );
  });

  it('unmounts a closed sheet even when its exit was cut short', () => {
    const sheet = read('../../../../../packages/ui/src/components/BottomSheet.tsx');
    expect(sheet).toContain('if (finished || !wasVisible.current) setMounted(false);');
  });
});

/**
 * THE AMOUNT, WHICHEVER WAY IT WAS GIVEN (the owner, 2026-09-24: "if i enter the total oz directly
 * (clicking + on the total oz, instead of left + right), it does not store the logs oz, instead,
 * it just shows as 0"). The running pump's "Save session only" passed the two sides and never the
 * total, so a total typed on its own reached the write as nothing. `totalOnlyMl` is required on
 * the write's input now, so the compiler holds every caller to it; this holds the one that forgot.
 */
describe('a pumped total typed on its own', () => {
  // (no running panel in NibbleCue: the pump's Save session is CuddleCue's)

  it('is a required field of every pump write, so no caller can drop it again', () => {
    const actions = flat(read('useTimerActions.ts'));
    expect(actions).toContain('totalOnlyMl: number | null;');
    expect(actions).not.toContain('totalOnlyMl?: number | null;');
  });
});

/**
 * "SAVE AND ADD TO STASH" CARRIES THE STOP TO THE NEXT SHEET (the audit of 2026-09-24, feeding M2
 * / timers 6). The session is written by the stash-save sheet, so until then the pump is stopped
 * and not finished: the pump sheet closing must not end the stop, the stash sheet ends it when it
 * writes, and backing out of it hands it back to the output form.
 */
describe('a stop handed to the stash-save sheet', () => {
  it('survives the pump sheet going away, while every other stop does not', () => {
    markStopped('pump-1', 1_000);
    markStopped('pump-2', 2_000);
    handStopToStash('pump-1');
    clearAllStopped();
    expect(stoppedAt('pump-1')).toBe(1_000);
    expect(stoppedAt('pump-2')).toBeNull();
  });

  it('ends when the session is written', () => {
    markStopped('pump-1', 1_000);
    handStopToStash('pump-1');
    clearStopped('pump-1');
    expect(stoppedAt('pump-1')).toBeNull();
    expect(isHandedToStash('pump-1')).toBe(false);
  });

  it('goes back to the output form on a cancel, stop intact, and ends with that form again', () => {
    markStopped('pump-1', 1_000);
    handStopToStash('pump-1');
    takeBackStop('pump-1');
    expect(stoppedAt('pump-1')).toBe(1_000);
    expect(isHandedToStash('pump-1')).toBe(false);
    // the form is the owner again: its sheet going away is the end
    clearAllStopped();
    expect(stoppedAt('pump-1')).toBeNull();
  });

  it('cannot hand over a stop that does not exist', () => {
    handStopToStash('pump-1');
    expect(isHandedToStash('pump-1')).toBe(false);
  });
});

// (no stash-save sheet in NibbleCue: CuddleCue's milk stash UI was not carried over)
describe('the shell does not reopen the sheet that is up, and ends orphaned stops', () => {
  const shell = flat(read('../../app/ShellProvider.tsx'));

  it('asks the rules before closing anything', () => {
    const open = shell.slice(shell.indexOf('const open = useCallback('));
    const same = open.indexOf(
      'if (handover.current === null && sameCaptureSheet(showing.current, overlay)) return;',
    );
    const ends = open.indexOf('if (endsPumpStops(overlay)) clearAllStopped();');
    const close = open.indexOf('setState(s => ({ ...s, overlay: null, gate: null }));');
    expect(same).toBeGreaterThan(-1);
    expect(ends).toBeGreaterThan(same);
    expect(close).toBeGreaterThan(ends);
  });

  it('waits out a sheet a screen owns as well as its own', () => {
    expect(shell).toContain(
      'const wait = Math.max(leavingUntil.current, sheetLeavingUntil()) - Date.now();',
    );
  });
});
