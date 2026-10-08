/**
 * THE SAVE THAT TICKS (the owner, 2026-09-26, "agreed"): a Save's words give way to a check that
 * draws itself, and the sheet closes as it always has. The numbers are PURE (`saveTick.ts`) and held
 * here; the check is the checklists' own `TickMark`, whose draw `tickDraw.test.ts` already holds;
 * what `Button.tsx` does with both is held by tripwires over its source, because this suite has no
 * renderer (`interaction.test.ts` says why that is the honest instrument). The check is measured as
 * a graphic on every button fill, in every scheme and theme.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  PLUS_APPEARANCE,
  resolveAppearance,
  SCHEME_NAMES,
} from '../theme/appearance';
import { AA_GRAPHIC, AA_TEXT, contrastRatio } from '../theme/contrast';
import { moduleButtonPaint, type TintModule } from '../theme/moduleButton';
import { hit, moduleColor, themeNames } from '../theme/theme';
import {
  SAVE_TICK_HOLD_MAX_MS,
  SAVE_TICK_HOLD_MS,
  SAVE_TICK_SCALE,
  SAVE_WORDS_EASE,
  SAVE_WORDS_LIFT,
  SAVE_WORDS_OUT_MS,
  saveTickSize,
  saveWordsFrames,
} from './saveTick';
import { easeAt } from './themeSkyToggle';

/** Every module a log sheet's buttons can wear (`ModuleTint`). */
const MODULE_IDS = Object.keys(moduleColor) as TintModule[];
import {
  TICK_DRAW_MS,
  TICK_EASE,
  TICK_GRID,
  TICK_POINTS,
  TICK_STROKE,
  tickLength,
} from './tickDraw';

const here = dirname(fileURLToPath(import.meta.url));
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const flat = (f: string) =>
  withoutComments(readFileSync(join(here, f), 'utf8')).replace(/\s+/g, ' ');

/** The time, as a share of a move on `ease`, at which it has come `share` of the way. */
function timeAt(ease: readonly [number, number, number, number], share: number): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 50; i += 1) {
    const mid = (lo + hi) / 2;
    if (easeAt(ease, mid) < share) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

describe('the clock', () => {
  it('holds the sheet for the pen and a beat, and never past the 250 ms the brief allows', () => {
    expect(SAVE_TICK_HOLD_MAX_MS).toBe(250);
    expect(SAVE_TICK_HOLD_MS).toBeLessThanOrEqual(SAVE_TICK_HOLD_MAX_MS);
    // the check is whole before the sheet sets off: the hold covers the whole 220 ms draw
    expect(SAVE_TICK_HOLD_MS).toBeGreaterThanOrEqual(TICK_DRAW_MS);
    expect(SAVE_TICK_HOLD_MS).toBe(240);
  });

  it('is the checklists’ own 220 ms pen, not a second tick', () => {
    expect(TICK_DRAW_MS).toBe(220);
  });

  it('has the words gone before the pen reaches the corner, so no word is drawn through', () => {
    // the corner is where the short stroke ends: its share of the whole path
    const [a, b] = TICK_POINTS;
    const corner = Math.hypot(b[0] - a[0], b[1] - a[1]) / tickLength();
    const atCorner = timeAt(TICK_EASE, corner) * TICK_DRAW_MS;
    // by then the words' fade is all but done — at most 5% of them left
    const faded = easeAt(SAVE_WORDS_EASE, Math.min(1, atCorner / SAVE_WORDS_OUT_MS));
    expect(1 - faded).toBeLessThanOrEqual(0.05);
    // and they are wholly gone before the pen has finished
    expect(SAVE_WORDS_OUT_MS).toBeLessThan(TICK_DRAW_MS);
  });

  it('moves the words on the sheet’s own curve, which never overshoots', () => {
    expect([...SAVE_WORDS_EASE]).toEqual([0.22, 0.8, 0.28, 1]);
    for (let i = 0; i <= 100; i += 1) {
      const y = easeAt(SAVE_WORDS_EASE, i / 100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });
});

describe('the words step aside', () => {
  it('fade from whole to gone and rise a few points — a step, not a flight', () => {
    const f = saveWordsFrames();
    expect(f.opacity.outputRange).toEqual([1, 0]);
    expect(f.lift.outputRange).toEqual([0, -SAVE_WORDS_LIFT]);
    expect(SAVE_WORDS_LIFT).toBeGreaterThan(0);
    expect(SAVE_WORDS_LIFT).toBeLessThanOrEqual(8);
    for (const fr of [f.opacity, f.lift]) {
      expect(fr.inputRange).toEqual([0, 1]);
      expect(fr.extrapolate).toBe('clamp');
    }
  });
});

describe('the check’s size', () => {
  it('is half the button: 27 in the sheet’s Save, 22 in a 44, 17 in the short pill', () => {
    expect(SAVE_TICK_SCALE).toBe(0.5);
    expect(saveTickSize(hit.primary)).toBe(27);
    expect(saveTickSize(hit.min)).toBe(22);
    expect(saveTickSize(34)).toBe(17);
    expect(saveTickSize(-4)).toBe(0);
  });

  it('draws the sheet Save’s check a hair heavier than its words, and inside the button', () => {
    for (const h of [34, hit.min, hit.primary]) {
      const size = saveTickSize(h);
      expect(size).toBeLessThan(h);
      // the glyph's 2 pt on its 24 grid, scaled with its box
      const stroke = (TICK_STROKE * size) / TICK_GRID;
      expect(stroke).toBeGreaterThanOrEqual(1.4);
      expect(stroke).toBeLessThanOrEqual(2.5);
    }
  });
});

/*
  THE CHECK IS DRAWN IN THE WORDS' OWN INK, on the button's own fill: every variant, every scheme,
  every theme — both ends of primary's gradient, and every module's deep ink a log sheet's Save is
  filled with (`moduleButton.ts`). The token gate holds the words at 4.5:1 there; the
  mark is a graphic and needs 3:1, and it gets the words' 4.5 anyway. The ink per variant is
  Button.tsx's (held below and in `logoLoader.test.ts`).
*/
describe('the check can be seen on the button it is drawn in', () => {
  it('clears 3:1 as a mark — and the 4.5:1 of the words — on every fill, scheme and theme', () => {
    let checked = 0;
    for (const scheme of SCHEME_NAMES)
      for (const theme of themeNames) {
        const r = resolveAppearance(
          { ...DEFAULT_APPEARANCE, theme, scheme },
          'light',
          PLUS_APPEARANCE,
        );
        const c = r.palette;
        const fills: [string, string, string[]][] = [
          ['primary', r.onGradient, [...r.gradient.brand]],
          ['danger', r.onGradient, [c.dangerFill]],
          ['secondary', c.text, [c.surfaceSolid]],
          ['ghost', c.accent2, [c.app, c.paper, c.surfaceSolid]],
          // a log sheet's primary, in its module's deep ink (`moduleButton.ts`); none in Night
          ...MODULE_IDS.flatMap((m): [string, string, string[]][] => {
            const paint = moduleButtonPaint(m, theme);
            return paint === null ? [] : [[`primary (${m})`, paint.ink, [paint.fill]]];
          }),
        ];
        for (const [variant, ink, grounds] of fills)
          for (const ground of grounds) {
            const ratio = contrastRatio(ink, ground);
            const at = `${scheme}/${theme}: ${variant} on ${ground}`;
            expect(ratio, at).toBeGreaterThanOrEqual(AA_GRAPHIC);
            expect(ratio, at).toBeGreaterThanOrEqual(AA_TEXT);
            checked += 1;
          }
      }
    // seven fills per theme, and a module's deep ink for each module outside the amber Night
    expect(checked).toBe(
      SCHEME_NAMES.length * themeNames.length * 7 + SCHEME_NAMES.length * 2 * MODULE_IDS.length,
    );
  });
});

describe('Button: a Save that ticks (tripwires over the source)', () => {
  const src = flat('Button.tsx');

  it('draws the check in the words’ own ink, over them, only on a button that may tick', () => {
    expect(src).toContain(
      "const ink = tinted !== null ? tinted.ink : variant === 'primary' ? t.onGradient : variant === 'danger' ? t.onGradient : variant === 'secondary' ? t.color.text : t.color.accent2;",
    );
    expect(src).toContain(
      '<TickMark checked={done} size={saveTickSize(height)} color={ink} ring={0} />',
    );
    // nothing extra is mounted on a button that never ticks
    expect(src).toContain('{done !== undefined ? (');
    expect(src).toContain(
      '{done === undefined ? content : <Animated.View style={wordsOut}>{content}</Animated.View>}',
    );
  });

  it('hides the check from touch and from assistive technology: the toast has said what was saved', () => {
    const at = src.indexOf('{done !== undefined ? (');
    const check = src.slice(at, src.indexOf('<TickMark', at));
    expect(check).toContain('pointerEvents="none"');
    expect(check).toContain('accessibilityElementsHidden');
    expect(check).toContain('importantForAccessibility="no-hide-descendants"');
    // and the button's own name and state are the ones it always had
    expect(src).toContain('accessibilityLabel={accessibilityLabel ?? label}');
    expect(src).toContain('accessibilityState={{ disabled: inert, busy: !!loading }}');
  });

  it('lets a second press go once the entry it would write is written', () => {
    expect(src).toContain('onPress={done ? undefined : onPress}');
    expect(src).toContain('if (inert || done || t.reduceMotion) return;');
  });

  it('moves the words on the native driver, and simply sets them when nothing may move', () => {
    const effect = src.slice(src.indexOf('useLayoutEffect(() => {'), src.indexOf('const wordsOut'));
    expect(effect).toContain('if (still) { settle.setValue(1); return undefined; }');
    expect(effect).toContain('duration: SAVE_WORDS_OUT_MS');
    expect(effect).toContain('useNativeDriver: true');
    expect(effect).not.toContain('useNativeDriver: false');
    expect(src).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    // a button that arrives done is at rest done: only a change it sees is played
    expect(src).toContain('new Animated.Value(done ? 1 : 0)');
  });

  it('is felt as nothing: the one haptic a save makes is the write funnel’s', () => {
    expect(src).not.toContain('haptic(');
    expect(src).not.toContain('feelChoice(');
  });
});
