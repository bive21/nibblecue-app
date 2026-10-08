/**
 * THE SAVE THAT TICKS — THE SHEET AND ITS HOST (the owner, 2026-09-26, "agreed"): a Save's words
 * give way to a check that draws itself, and the sheet closes as it always has, a quarter of a
 * second later. The handshake that decides WHEN is pure (`saveTick.ts`) and run here the way a sheet
 * runs it; where the form and the host call it is held by tripwires over their source, since this
 * suite cannot render a sheet (`anatomy.test.ts` says why).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SAVE_TICK_HOLD_MAX_MS, SAVE_TICK_HOLD_MS } from '@nibblecue/ui/layout';
import { describe, expect, it } from 'vitest';
import { holdFor, inFlightSaves, runPressed } from './saveTick';

const here = dirname(fileURLToPath(import.meta.url));
const code = (...p: string[]) =>
  readFileSync(join(here, ...p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

describe('how long a sheet waits before it closes', () => {
  it('holds for the check only while a Save is in flight — a Start, a Skip or a link closes at once', () => {
    expect(holdFor(0)).toBe(0);
    expect(holdFor(1)).toBe(SAVE_TICK_HOLD_MS);
    expect(holdFor(2)).toBe(SAVE_TICK_HOLD_MS);
    expect(SAVE_TICK_HOLD_MS).toBeLessThanOrEqual(SAVE_TICK_HOLD_MAX_MS);
    expect(SAVE_TICK_HOLD_MAX_MS).toBe(250);
  });
});

describe('a Save in flight', () => {
  it('is in flight for exactly as long as its save runs, and the host hears onDone inside it', async () => {
    const saves = inFlightSaves();
    const heard: number[] = [];
    // a sheet's onSave: the write, then onDone() on a commit — which is when the host asks
    const onSave = async () => {
      await Promise.resolve();
      heard.push(saves.size);
    };
    const pending = runPressed(saves, onSave);
    expect(saves.size).toBe(1);
    await pending;
    expect(heard).toEqual([1]);
    expect(saves.size).toBe(0);
  });

  it('settles on a refusal and on a failure too, and hands the failure on exactly as before', async () => {
    const saves = inFlightSaves();
    await expect(runPressed(saves, () => Promise.reject(new Error('refused')))).rejects.toThrow(
      'refused',
    );
    expect(saves.size).toBe(0);
    // a save that throws before it has begun throws as it did, and is not left in flight
    expect(() =>
      runPressed(saves, () => {
        throw new Error('early');
      }),
    ).toThrow('early');
    expect(saves.size).toBe(0);
    // a save that is not async at all is in flight until the next turn, then settled
    const sync = runPressed(saves, () => undefined);
    expect(saves.size).toBe(1);
    await sync;
    expect(saves.size).toBe(0);
  });

  it('belongs to its opening: a save that settles late cannot take a new opening’s Save out of flight', () => {
    const saves = inFlightSaves();
    const late = saves.add();
    // the sheet was put away and opened again
    saves.clear();
    const fresh = saves.add();
    late();
    expect(saves.size).toBe(1);
    fresh();
    fresh();
    expect(saves.size).toBe(0);
  });
});

describe('the form and the host (tripwires over the source)', () => {
  const form = code('QuickEntry.tsx');
  const host = code('..', '..', 'app', 'QuickEntrySheet.tsx');

  it('marks the form’s Save in flight while the sheet’s save runs, and hands it the same instant', () => {
    expect(form).toContain('onSave: saveEntry,');
    expect(form).toContain(
      'const onSave = useCallback( (at: number) => (tick === null ? saveEntry(at) : tick.pressed(() => saveEntry(at))), [tick, saveEntry], );',
    );
    expect(form).toContain('onPress={() => void onSave(atMs)}');
  });

  it('draws the check on the form’s own Save, only where a host is listening', () => {
    const save = form.slice(form.indexOf('label={saveLabel}'), form.indexOf('testID="quick.save"'));
    expect(save).toContain('{...(tick !== null ? { done: tick.ticked } : {})}');
    expect(form.match(/testID="quick\.save"/g)).toHaveLength(1);
  });

  it('shares the handshake with every module’s body, and closes after the hold only for a Save', () => {
    expect(host).toContain('<SaveTickContext.Provider value={tick}>');
    expect(host.indexOf('<SaveTickContext.Provider value={tick}>')).toBeLessThan(
      host.indexOf('<ModuleSheetBody'),
    );
    const done = host.slice(host.indexOf('const done = () => {'), host.indexOf('A PUMP'));
    // the tour hears nothing of a slot's save since the card that waited for one, "What's coming",
    // left it (2026-09-28): the hold is the first thing the close decides
    expect(done).not.toContain("did('slot')");
    expect(done.indexOf('const hold = holdFor(saves.size);')).toBe(done.indexOf('{') + 2);
    expect(done).toContain(
      'const hold = holdFor(saves.size); if (hold === 0) { onClose(); return; }',
    );
    expect(done).toContain('setTickedAt(openedAtMs);');
    expect(done).toContain('if (live.current.open && live.current.openedAtMs === mine) onClose();');
    expect(done).toContain('}, hold);');
  });

  it('keeps the check through the exit and drops it at the next opening, with nothing in flight', () => {
    expect(host).toContain('const ticked = tickedAt === openedAtMs;');
    expect(host).toContain('useEffect(() => saves.clear(), [openedAtMs, saves]);');
    // and never leaves a timer behind the host
    expect(host).toContain('if (holding.current !== null) clearTimeout(holding.current);');
  });

  it('changes nothing about the write: no sheet body was touched to get here', () => {
    // every module still ends its save in `onDone()` after a commit, which is the host's signal
    // (NibbleCue's plain-entry sheet is solids; CuddleCue's bottle, bath, temperature and growth
    // sheets are not in it)
    for (const sheet of ['SolidsSheet'])
      expect(code('modules', `${sheet}.tsx`), sheet).toMatch(
        /if \((outcome|result)\?\.committed\) onDone\(\);/,
      );
    for (const f of ['saveTick.ts', 'QuickEntry.tsx']) expect(code(f), f).not.toContain('haptic(');
  });
});
