/**
 * THE SHELL'S TWO NEW RULES (the audit of 2026-09-24): the capture sheet that is up is not closed
 * and reopened when it is asked for again (feeding C8 / timers 1 and 2), and a request for anything
 * but the pump sheet ends the pump stops no sheet will ask about (timers, Low). Plus the clock a
 * screen's own modal stamps so the next sheet waits it out (timers 23).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  endsPumpStops,
  handoverAfter,
  HANDOVER_SLACK_MS,
  noteSheetLeaving,
  sameCaptureSheet,
  sheetLeavingUntil,
  swapsInPlace,
} from './overlayRules';

const here = dirname(fileURLToPath(import.meta.url));

const pump = { kind: 'quickentry' as const, moduleId: 'pump' as const };
const bottle = { kind: 'quickentry' as const, moduleId: 'bottle' as const };

describe('sameCaptureSheet', () => {
  it('is the pump sheet asked for while the pump sheet is up — "It ended", a coin, a widget Stop', () => {
    expect(sameCaptureSheet(pump, pump)).toBe(true);
  });

  it('is not another sheet, nothing, or a request that carries something new', () => {
    expect(sameCaptureSheet(pump, bottle)).toBe(false);
    expect(sameCaptureSheet(null, pump)).toBe(false);
    expect(sameCaptureSheet({ kind: 'stashsave' }, pump)).toBe(false);
    expect(sameCaptureSheet(pump, { kind: 'stashsave' })).toBe(false);
    // a container for the bottle sheet is new information: that request still reopens
    expect(sameCaptureSheet(bottle, { ...bottle, preset: { containerId: 'c1' } })).toBe(false);
    expect(sameCaptureSheet({ ...bottle, preset: { containerId: 'c1' } }, bottle)).toBe(false);
  });
});

describe('swapsInPlace (the + button opens one sheet, 2026-09-28)', () => {
  const grid = { kind: 'quicklog' };

  it('is a tile of the + grid asking for its module: the same sheet takes it where it stands', () => {
    expect(swapsInPlace(grid, bottle)).toBe(true);
    expect(swapsInPlace(grid, pump)).toBe(true);
  });

  it('is nothing else: any other sheet still closes what is up and waits for it to go', () => {
    // from anything but the grid
    expect(swapsInPlace(null, bottle)).toBe(false);
    expect(swapsInPlace(bottle, pump)).toBe(false);
    expect(swapsInPlace({ kind: 'child' }, bottle)).toBe(false);
    // and from the grid to anything but a capture sheet
    expect(swapsInPlace(grid, { kind: 'stashsave' })).toBe(false);
    expect(swapsInPlace(grid, { kind: 'entry' })).toBe(false);
    expect(swapsInPlace(grid, grid)).toBe(false);
  });

  it('is carried out by the shell before anything is closed', () => {
    const flat = (name: string) =>
      readFileSync(join(here, name), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
        .replace(/\s+/g, ' ');
    const shell = flat('ShellProvider.tsx');
    const swap = shell.indexOf(
      'if (handover.current === null && swapsInPlace(showing.current, overlay)) {',
    );
    expect(swap).toBeGreaterThan(-1);
    // placed at once: no close, no leaving stamp, no hand-over
    expect(shell.slice(swap, shell.indexOf('const up = current.current;', swap))).toBe(
      'if (handover.current === null && swapsInPlace(showing.current, overlay)) { showing.current = overlay; setState(s => place(s, overlay)); return; } ',
    );
    // one sheet for both: no modal of its own for the grid any more
    expect(shell).toContain("<QuickEntrySheet grid={ov?.kind === 'quicklog'}");
    expect(shell).not.toContain('QuickLogModal');
    // (CuddleCue's QuickLogGrid, the grid's tiles, is not in NibbleCue; the sheet keeps the swap)
    const host = flat('QuickEntrySheet.tsx');
    expect(host).toContain('visible={grid || moduleId !== null}');
  });
});

describe('endsPumpStops', () => {
  it('leaves the stop to the pump sheet and to the stash-save sheet it is handed to', () => {
    expect(endsPumpStops(pump)).toBe(false);
    expect(endsPumpStops({ kind: 'stashsave' })).toBe(false);
  });

  it('ends it for anything else — the sheet that was going to ask for the output never will', () => {
    expect(endsPumpStops(bottle)).toBe(true);
    expect(endsPumpStops({ kind: 'quicklog' })).toBe(true);
    expect(endsPumpStops({ kind: 'entry' })).toBe(true);
  });
});

describe('a sheet the shell does not own, still leaving', () => {
  it('keeps the latest of the stamps', () => {
    const now = Date.now();
    noteSheetLeaving(now + 280);
    noteSheetLeaving(now + 100);
    expect(sheetLeavingUntil()).toBe(now + 280);
  });
});

/**
 * NO WAITING ON MOTION NOBODY SEES (2026-09-28): the + grid closing into an entry sheet waited
 * 280 ms for a slide that, with the theme still, never plays.
 */
describe('the hand-over', () => {
  it('waits for the slide and the platform’s slack while sheets slide', () => {
    expect(handoverAfter(220, false)).toBe(280);
  });

  it('waits for the platform’s slack alone when the theme is still, and never for nothing', () => {
    expect(handoverAfter(220, true)).toBe(HANDOVER_SLACK_MS);
    expect(HANDOVER_SLACK_MS).toBeGreaterThan(0);
    expect(HANDOVER_SLACK_MS).toBeLessThan(100);
  });

  it('is what the shell stamps every close with, read off the theme it is painted in', () => {
    const shell = readFileSync(join(here, 'ShellProvider.tsx'), 'utf8').replace(/\s+/g, ' ');
    expect(shell).toContain('export const HANDOVER_MS = handoverAfter(SHEET_DURATION_MS, false);');
    expect(shell).toContain(
      'leavingUntil.current = Date.now() + handoverAfter(SHEET_DURATION_MS, still.current);',
    );
    expect(shell).toContain('still.current = t.reduceMotion;');
    // and the sheets it waits on really do close without a slide when the theme is still
    const sheet = readFileSync(
      join(here, '../../../../packages/ui/src/components/BottomSheet.tsx'),
      'utf8',
    ).replace(/\s+/g, ' ');
    expect(sheet).toContain(
      'if (reduceMotionRef.current) { setMounted(false); return undefined; }',
    );
  });
});
