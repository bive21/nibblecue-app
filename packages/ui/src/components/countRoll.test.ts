/**
 * A TILE'S COUNT ROLLS WHEN A NEW ENTRY RAISES IT (the owner, 2026-09-26, "agreed"). The wheels,
 * the rule and the frames are PURE (`countRoll.ts`) and held here; that `RollingCount.tsx` and
 * `QuickAction.tsx` hand them to the native driver, draw the chip exactly as before at rest, and add
 * nothing a screen reader or a finger can find, is held by tripwires over their source, since this
 * suite has no renderer (`interaction.test.ts`).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AA_TEXT, contrastRatio } from '../theme/contrast';
import { resolvePalette, schemes, themeNames, type SchemeName } from '../theme/theme';
import {
  columnTurns,
  COUNT_AFTER_SHEET_MS,
  COUNT_CHIP_LINE,
  COUNT_MARK,
  COUNT_PULSE_MS,
  COUNT_PULSE_PEAK,
  COUNT_ROLL_EASE,
  COUNT_ROLL_MS,
  countAppearFrames,
  countColumns,
  countLine,
  countPulseFrames,
  countRollFrames,
  countSettled,
  countStart,
  countStep,
  type CountInput,
  type CountState,
} from './countRoll';
import type { Frame } from './dayNightSwitch';
import { easeAt } from './themeSkyToggle';

const here = dirname(fileURLToPath(import.meta.url));
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const flat = (f: string) =>
  withoutComments(readFileSync(join(here, f), 'utf8')).replace(/\s+/g, ' ');

/*
  TWO FACTS READ OFF THE SOURCE, because the files that hold them import React Native, which node
  cannot load: how a tile writes its count, and how long a sheet takes to leave.
*/
const countMark = (n: number): string => `${n}×`;
const SHEET_DURATION_MS = Number(
  /export const SHEET_DURATION_MS = (\d+);/.exec(flat('BottomSheet.tsx'))?.[1] ?? Number.NaN,
);

it('reads the tile’s count and the sheet’s exit from the files that own them', () => {
  expect(flat('QuickAction.tsx')).toContain(
    'export const countMark = (n: number): string => `${n}×`;',
  );
  expect(SHEET_DURATION_MS).toBe(220);
});

function sample(fr: Frame, p: number): number {
  const xs = fr.inputRange;
  const ys = fr.outputRange;
  const last = xs.length - 1;
  if (p <= (xs[0] ?? 0)) return ys[0] ?? 0;
  if (p >= (xs[last] ?? 1)) return ys[last] ?? 0;
  let i = 0;
  while ((xs[i + 1] ?? 1) < p) i += 1;
  const [x0, x1, y0, y1] = [xs[i] ?? 0, xs[i + 1] ?? 1, ys[i] ?? 0, ys[i + 1] ?? 0];
  return y0 + ((p - x0) / (x1 - x0)) * (y1 - y0);
}

const IN = (value: number, scope = 'emma|2026-09-26', hold = false, still = false): CountInput => ({
  value,
  scope,
  hold,
  still,
});

/** Feed a tile a run of inputs, as it renders: each step settles the way the component settles it. */
function run(inputs: readonly CountInput[]): CountState[] {
  const first = inputs[0];
  if (first === undefined) return [];
  let s = countStart(first);
  const out = [s];
  for (const i of inputs.slice(1)) {
    const next = countStep(s, i);
    // the component sets it and renders again at once: the second call must settle
    expect(countStep(next, i)).toBe(next);
    s = next;
    out.push(s);
  }
  return out;
}

describe('the wheels', () => {
  it('turns only the column that changes: 3 → 4 is one wheel, 13 → 14 leaves the tens still', () => {
    expect(countColumns(3, 4)).toEqual([{ from: '3', to: '4' }]);
    const teens = countColumns(13, 14);
    expect(teens).toEqual([
      { from: '1', to: '1' },
      { from: '3', to: '4' },
    ]);
    expect(teens.map(columnTurns)).toEqual([false, true]);
  });

  it('carries: 9 → 10 turns the units to 0 and brings a 1 up into a blank tens column', () => {
    expect(countColumns(9, 10)).toEqual([
      { from: '', to: '1' },
      { from: '9', to: '0' },
    ]);
    expect(countColumns(99, 100)).toEqual([
      { from: '', to: '1' },
      { from: '9', to: '0' },
      { from: '9', to: '0' },
    ]);
  });

  it('brings the first digit of the day up from nothing — a tile with no count draws no chip', () => {
    expect(countColumns(0, 1)).toEqual([{ from: '', to: '1' }]);
    // a jump of two (both twins at once) turns straight to its digit: no stop at every number
    expect(countColumns(3, 5)).toEqual([{ from: '3', to: '5' }]);
  });

  it('draws the same glyphs at rest as the tile always wrote: the number, then ×', () => {
    expect(COUNT_MARK).toBe('×');
    for (const n of [1, 3, 9, 10, 42, 100])
      expect(
        countColumns(n, n)
          .map(c => c.to)
          .join('') + COUNT_MARK,
      ).toBe(countMark(n));
  });
});

describe('when a count rolls, and when it never does', () => {
  it('never on the first render: whatever a tile is told first is simply shown', () => {
    const s = countStart(IN(4));
    expect(s.shown).toBe(4);
    expect(s.move).toBeNull();
  });

  it('never when a load lands, a baby is switched or the day turns — a change of scope', () => {
    const states = run([
      // the first frame, before the day's rows are read
      IN(0, 'unread#emma|2026-09-26'),
      // the read lands: 3 bottles today — a new scope, so it simply shows
      IN(3, 'emma#emma|2026-09-26'),
      // the top bar switches to Liam: the old rows still stand for a render…
      IN(3, 'emma#liam|2026-09-26'),
      // …and Liam's read lands with his 5
      IN(5, 'liam#liam|2026-09-26'),
      // midnight: the counts fall to the new day's, under the new day's scope
      IN(0, 'liam#liam|2026-09-27'),
      IN(2, 'liam2#liam|2026-09-27'),
    ]);
    for (const s of states) expect(s.move).toBeNull();
    expect(states.map(s => s.shown)).toEqual([0, 3, 3, 5, 0, 2]);
  });

  it('rolls a rise within one scope — a new entry, logged here or pulled from the other phone', () => {
    const [, , after] = run([IN(3), IN(3), IN(4)]);
    expect(after?.move).toEqual({ from: 3, to: 4, delay: 0, seq: 1 });
    expect(after?.shown).toBe(4);
  });

  it('never plays a fall: an Undo or a delete simply shows the new number', () => {
    const [, fell] = run([IN(4), IN(3)]);
    expect(fell?.move).toBeNull();
    expect(fell?.shown).toBe(3);
    // a fall mid-roll stops the roll where it lands: the lower number, at rest
    const [, rose, back] = run([IN(3), IN(4), IN(3)]);
    expect(rose?.move).not.toBeNull();
    expect(back?.move).toBeNull();
    expect(back?.shown).toBe(3);
  });

  it('holds a rise under a sheet, showing the old number, and rolls it a beat after the sheet goes', () => {
    const states = run([
      IN(3),
      // the Save lands while its sheet is still up: the chip keeps its 3
      IN(4, undefined, true),
      IN(4, undefined, true),
      // the sheet leaves: 3 → 4, once the sheet is most of the way down
      IN(4, undefined, false),
    ]);
    expect(states[1]?.shown).toBe(3);
    expect(states[1]?.move).toBeNull();
    expect(states[2]?.shown).toBe(3);
    expect(states[3]?.move).toEqual({ from: 3, to: 4, delay: COUNT_AFTER_SHEET_MS, seq: 1 });
    // a rise with nothing over the tile does not wait
    expect(run([IN(3), IN(4)])[1]?.move?.delay).toBe(0);
  });

  it('drops a held rise when the scope changes under the sheet: another baby’s count is not a rise', () => {
    const states = run([
      IN(3, 'a'),
      IN(4, 'a', true),
      // the child switcher is a sheet too: Liam's count arrives while it is up
      IN(6, 'b', true),
      IN(6, 'b', false),
    ]);
    for (const s of states) expect(s.move).toBeNull();
    expect(states[3]?.shown).toBe(6);
  });

  it('never rolls when nothing may move — reduce motion, or the amber Night', () => {
    const states = run([IN(3, 'a', false, true), IN(4, 'a', false, true), IN(5, 'a', true, true)]);
    for (const s of states) expect(s.move).toBeNull();
    // and the number is simply the new one, never held
    expect(states.map(s => s.shown)).toEqual([3, 4, 5]);
  });

  it('rolls again from where the last roll landed, and each roll settles only itself', () => {
    const [, first, second] = run([IN(3), IN(4), IN(5)]);
    expect(first?.move).toEqual({ from: 3, to: 4, delay: 0, seq: 1 });
    expect(second?.move).toEqual({ from: 4, to: 5, delay: 0, seq: 2 });
    if (second === undefined) throw new Error('no state');
    // the first roll's finish arriving late leaves the second alone
    expect(countSettled(second, 1)).toBe(second);
    expect(countSettled(second, 2).move).toBeNull();
    expect(countSettled(second, 2).shown).toBe(5);
  });
});

describe('the clock and the frames', () => {
  it('turns a wheel in 260 ms and swells the tile in 280, on the sheet’s curve, never past its digit', () => {
    expect(COUNT_ROLL_MS).toBe(260);
    expect(COUNT_PULSE_MS).toBe(280);
    expect([...COUNT_ROLL_EASE]).toEqual([0.22, 0.8, 0.28, 1]);
    for (let i = 0; i <= 100; i += 1) {
      const y = easeAt(COUNT_ROLL_EASE, i / 100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
    // a held rise waits for the sheet to be most of the way down, and not for all of it
    expect(COUNT_AFTER_SHEET_MS).toBeGreaterThan(0);
    expect(COUNT_AFTER_SHEET_MS).toBeLessThan(SHEET_DURATION_MS);
  });

  it('slides a turning column exactly one line: the old digit out of the top, the new one in', () => {
    for (const scale of [1, 1.3, 1.6]) {
      const line = countLine(scale);
      const stack = countRollFrames(line).stack;
      expect(sample(stack, 0)).toBe(0);
      expect(sample(stack, 1)).toBeCloseTo(-line, 9);
      expect(stack.extrapolate).toBe('clamp');
    }
    expect(countLine(1)).toBe(COUNT_CHIP_LINE);
    expect(countLine(Number.NaN)).toBe(COUNT_CHIP_LINE);
    expect(countLine(0)).toBe(COUNT_CHIP_LINE);
  });

  it('brings the day’s first chip in with its wheel, not as a bare × through a held roll’s delay', () => {
    const { opacity } = countAppearFrames();
    // unseen while the wheel waits at its start, whole before the digit is a fiftieth of the way up
    expect(sample(opacity, 0)).toBe(0);
    expect(sample(opacity, 0.02)).toBe(1);
    expect(sample(opacity, 1)).toBe(1);
    const tile = flat('QuickAction.tsx');
    expect(tile).toContain('tally.appear !== null ? { opacity: tally.appear } : null,');
    const count = flat('RollingCount.tsx');
    expect(count).toContain('const first = move !== null && move.from <= 0;');
    expect(count).toContain('if (!first) return null;');
  });

  it('swells the tile 1 → 1.04 → 1, a half sine: never below rest, never past the peak', () => {
    const { scale } = countPulseFrames();
    expect(COUNT_PULSE_PEAK).toBe(1.04);
    expect(sample(scale, 0)).toBe(1);
    expect(sample(scale, 1)).toBe(1);
    expect(sample(scale, 0.5)).toBeCloseTo(COUNT_PULSE_PEAK, 9);
    for (let i = 0; i <= 200; i += 1) {
      const v = sample(scale, i / 200);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(COUNT_PULSE_PEAK + 1e-9);
    }
  });
});

describe('the rolling digits are the chip’s own words', () => {
  it('in the chip’s ink on the chip’s fill, at 4.5:1 or better in every scheme and theme', () => {
    for (const theme of themeNames)
      for (const scheme of Object.keys(schemes) as SchemeName[]) {
        const p = resolvePalette(theme, scheme);
        expect(contrastRatio(p.text, p.surfaceSolid), `${theme}/${scheme}`).toBeGreaterThanOrEqual(
          AA_TEXT,
        );
      }
    // …which is the pair the chip is drawn in, turning or at rest
    const tile = flat('QuickAction.tsx');
    expect(tile).toContain('backgroundColor: t.color.surfaceSolid,');
    const count = flat('RollingCount.tsx');
    expect(count.match(/<Numeric variant="meta" ink="text" style=\{textStyle\}>/g)).toHaveLength(2);
    expect(count).not.toMatch(/color=|ink="(?!text")/);
  });
});

describe('RollingCount and the tile (tripwires over the source)', () => {
  const count = flat('RollingCount.tsx');
  const tile = flat('QuickAction.tsx');

  it('draws the chip’s words exactly as before while at rest', () => {
    expect(count).toContain(
      'if (move === null) { return ( <Numeric variant="meta" ink="text" style={textStyle}> {text} </Numeric> ); }',
    );
    expect(tile).toContain('text={countMark(tally.shown)}');
    expect(tile).toContain('textStyle={styles.chipText}');
  });

  it('turns only the columns that change, each in a clip one line tall', () => {
    expect(count).toContain('columnTurns(c) ? (');
    expect(count).toContain("wheel: { overflow: 'hidden' }");
    expect(count).toContain('style={[styles.wheel, { height: line }]}');
  });

  it('runs every clock on the native driver, and none from JavaScript', () => {
    const timings = count.match(/Animated\.timing\(/g) ?? [];
    expect(timings).toHaveLength(2);
    expect(count.match(/useNativeDriver: true/g)).toHaveLength(2);
    expect(count).not.toContain('useNativeDriver: false');
    // the tile's press and its pulse are one scale, so a pressed tile still settles at 1
    expect(tile).toContain('Animated.multiply(scale, tally.pulse)');
    expect(tile).toContain('transform: [{ scale: tileScale }]');
  });

  it('never rolls without a scope, under reduce motion or in the amber Night', () => {
    expect(count).toContain(
      'const still = options === undefined || motionStill(t.reduceMotion, t.theme);',
    );
    // what covers the tiles is said round them, and nothing covers them unless someone says so
    expect(count).toContain('export const CountHoldContext = createContext(false);');
    expect(count).toContain('const covered = useContext(CountHoldContext);');
    expect(count).toContain("scope: options?.scope ?? '', hold: covered, still");
    // decided as it renders, so the first frame of a new number is already the roll's
    expect(count).toContain(
      'const next = countStep(state, input); if (next !== state) setState(next);',
    );
  });

  it('adds nothing a finger or a screen reader can find, and is felt as nothing', () => {
    // the tile is one button whose name says the real count; the chip takes no touches
    expect(tile).toContain("${count ? `, ${count} ${count === 1 ? 'time' : 'times'} today` : ''}");
    expect(tile).toContain('pointerEvents="none"');
    for (const src of [count, tile]) {
      expect(src).not.toContain('haptic(');
      expect(src).not.toMatch(/accessible(?!ElementsHidden)[=:]|accessibilityRole="(?!button)/);
    }
  });
});
