/**
 * THE TRIP'S LAST TICK (2026-09-26, S4): a little cart rolls along the progress line and "All done"
 * comes up where it stops. The numbers are pure (`allDone.ts`) and sampled here as
 * `Animated.Value#interpolate` samples them; the inks are measured on every ground the progress card
 * is drawn on; and that `AllDone.tsx` plays only a change, cuts short when the list opens again,
 * leaves nothing behind and draws nothing under reduce motion or in the amber Night is held by
 * tripwires, since this suite has no renderer (`interaction.test.ts`).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CELEBRATION_PRAISE_BANNED } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { ICON_PATHS } from '../icons/paths';
import { deriveAccent } from '../theme/accent';
import {
  DEFAULT_APPEARANCE,
  PLUS_APPEARANCE,
  resolveAppearance,
  SCHEME_NAMES,
} from '../theme/appearance';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio } from '../theme/contrast';
import { materialBase, SKIN_NAMES } from '../theme/skins';
import { space, themeNames } from '../theme/theme';
import {
  allDoneFrames,
  DONE_CART,
  DONE_FADE_MS,
  DONE_MS,
  DONE_ROCK_KEYS,
  DONE_ROLL_MS,
  DONE_WHEEL_GAP,
  DONE_WORD_AT,
  DONE_WORD_IN_MS,
  doneRockAt,
  doneRollAt,
} from './allDone';
import type { Frame } from './dayNightSwitch';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const flatOf = (f: string) => withoutComments(read(f)).replace(/\s+/g, ' ');

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
const at = (fr: Frame, ms: number) => sample(fr, ms / DONE_MS);

/** A progress line on a phone: the card's inner width. */
const LINE = 300;
const TRAVEL = LINE - DONE_CART;

describe('the cart rolls along the line', () => {
  const f = allDoneFrames(TRAVEL);

  it('from the line’s left end to its right, and only ever forward', () => {
    expect(at(f.x, 0)).toBe(0);
    expect(at(f.x, DONE_ROLL_MS)).toBeCloseTo(TRAVEL, 6);
    expect(at(f.x, DONE_MS)).toBeCloseTo(TRAVEL, 6);
    for (let ms = 10; ms <= DONE_MS; ms += 10)
      expect(at(f.x, ms), `${ms}`).toBeGreaterThanOrEqual(at(f.x, ms - 10) - 1e-9);
    // a soft start and a soft stop
    expect(doneRollAt(DONE_ROLL_MS * 0.1)).toBeLessThan(0.1);
    expect(doneRollAt(DONE_ROLL_MS * 0.9)).toBeGreaterThan(0.9);
  });

  it('rocks a few degrees back as it sets off and forward as it stops, and is still once stopped', () => {
    const rocks = DONE_ROCK_KEYS.map(([, d]) => d);
    expect(Math.min(...rocks)).toBeLessThan(0);
    expect(Math.max(...rocks)).toBeGreaterThan(0);
    for (const d of rocks) expect(Math.abs(d)).toBeLessThanOrEqual(6);
    expect(doneRockAt(0)).toBe(0);
    expect(doneRockAt(DONE_ROLL_MS)).toBeCloseTo(0, 9);
    for (const ms of [DONE_ROLL_MS, 1200, DONE_MS]) expect(at(f.rock, ms)).toBeCloseTo(0, 9);
  });

  it('stands on the line by its wheels, in the gap the card leaves above the line', () => {
    const cart = ICON_PATHS.cart;
    const wheel = cart.elements.find(e => e.type === 'circle');
    expect(wheel?.type).toBe('circle');
    if (wheel?.type !== 'circle') return;
    const stroke = cart.strokeWidth ?? 1.7;
    expect(DONE_WHEEL_GAP).toBeCloseTo(
      ((24 - wheel.cy - wheel.r - stroke / 2) / 24) * DONE_CART,
      9,
    );
    // the glyph's top edge (its handle at y 4.5) stays inside the card's gap over the line
    const top = ((4.5 - stroke / 2) / 24) * DONE_CART;
    expect(DONE_CART - DONE_WHEEL_GAP - top).toBeLessThanOrEqual(space.lg);
  });
});

describe('"All done" comes up where it stops, and both are gone', () => {
  const f = allDoneFrames(TRAVEL);

  it('shows the words half up as the cart stops, and whole just after', () => {
    expect(at(f.wordOpacity, DONE_WORD_AT)).toBe(0);
    expect(at(f.wordOpacity, DONE_ROLL_MS)).toBeCloseTo(0.5, 6);
    expect(at(f.wordOpacity, DONE_WORD_AT + DONE_WORD_IN_MS)).toBe(1);
    expect(at(f.wordY, DONE_WORD_AT)).toBeGreaterThan(0);
    expect(at(f.wordY, DONE_WORD_AT + DONE_WORD_IN_MS)).toBeCloseTo(0, 9);
  });

  it('is brief and calm: in view for 2.4 s at most, and nothing left on the screen after', () => {
    expect(DONE_MS).toBeLessThanOrEqual(2400);
    expect(DONE_ROLL_MS).toBeLessThanOrEqual(1000);
    for (const fr of [f.cartOpacity, f.wordOpacity]) {
      expect(at(fr, 0)).toBe(0);
      expect(at(fr, DONE_MS - DONE_FADE_MS)).toBe(1);
      expect(at(fr, DONE_MS)).toBe(0);
    }
  });

  it('uses frames Animated can read', () => {
    for (const [name, fr] of Object.entries(f)) {
      expect(fr.inputRange.length, name).toBe(fr.outputRange.length);
      expect(fr.inputRange[0], name).toBe(0);
      expect(fr.inputRange[fr.inputRange.length - 1], name).toBe(1);
      for (let i = 1; i < fr.inputRange.length; i += 1)
        expect(fr.inputRange[i] ?? 0, name).toBeGreaterThan(fr.inputRange[i - 1] ?? 0);
      expect(fr.extrapolate, name).toBe('clamp');
    }
    // a line not yet measured: the cart stays at its start
    expect(sample(allDoneFrames(Number.NaN).x, 1)).toBe(0);
    expect(sample(allDoneFrames(-5).x, 1)).toBe(0);
  });
});

/**
 * THE INKS, MEASURED (the batch's rule: every new mark at least 3:1, every word 4.5:1). The cart is
 * the accent on the progress card; the words are `text2` on it. The card is a skin's surface over
 * the page, which is the paper or the app ground; light and dark — the amber Night draws neither.
 */
describe('the inks', () => {
  it('draws the cart at 3:1 and the words at 4.5:1 on the progress card, in every skin and scheme', () => {
    for (const skin of SKIN_NAMES)
      for (const scheme of SCHEME_NAMES)
        for (const theme of themeNames.filter(x => x !== 'night')) {
          const r = resolveAppearance(
            { ...DEFAULT_APPEARANCE, theme, scheme, skin },
            'light',
            PLUS_APPEARANCE,
          );
          const c = r.palette;
          const s = r.skinTokens;
          const cards: Record<string, string> = {
            solid: c.surfaceSolid,
            onPaper: composite(c.paper, materialBase(c, s.surface), s.surface.alpha),
            onApp: composite(c.app, materialBase(c, s.surface), s.surface.alpha),
          };
          for (const [name, card] of Object.entries(cards)) {
            const where = `${skin}/${scheme}/${theme}: on ${name}`;
            expect(
              contrastRatio(deriveAccent(c).accent, card),
              `cart ${where}`,
            ).toBeGreaterThanOrEqual(AA_GRAPHIC);
            expect(contrastRatio(c.text2, card), `words ${where}`).toBeGreaterThanOrEqual(AA_TEXT);
          }
        }
  });
});

describe('the words', () => {
  it('say a plain fact about the list: no praise and no exclamation', () => {
    // the app passes its own copy (`SHOPPING.allDone`); the words this design system draws them
    // in are held there too — this is the rule both keep to
    const words = 'All done';
    for (const banned of CELEBRATION_PRAISE_BANNED)
      expect(words.toLowerCase(), banned).not.toContain(banned);
    expect(words).not.toMatch(/[!?]/);
  });
});

describe('the components (tripwires over AllDone.tsx)', () => {
  const src = flatOf('AllDone.tsx');

  it('plays only a change it sees, cut short when the list opens again, and leaves nothing behind', () => {
    expect(src).toContain('const seen = useRef(run);');
    expect(src).toContain('if (run === seen.current) return; seen.current = run;');
    expect(src).toContain('setPlaying(!still && live);');
    expect(src).toContain('if (!live || still) setPlaying(false);');
    expect(src).toContain('if (finished) setPlaying(false);');
    expect(src).toContain('return () => play.stop();');
    expect(src).toContain('return { v, playing: playing && live && !still };');
    expect(src).toContain('if (!playing) return null;');
  });

  it('is decoration: hidden from touch and from assistive technology, with no haptic', () => {
    expect(src.match(/pointerEvents="none"/g) ?? []).toHaveLength(2);
    expect(src.match(/accessibilityElementsHidden/g) ?? []).toHaveLength(2);
    expect(src).not.toContain('haptic(');
    expect(src).not.toContain('<Pressable');
  });

  it('draws nothing under reduce motion or in the amber Night', () => {
    expect(src).toContain('const still = motionStill(t.reduceMotion, t.theme);');
  });

  it('runs on the native driver: opacity and transforms only', () => {
    expect(src).toContain('useNativeDriver: true');
    expect(src).not.toContain('useNativeDriver: false');
    const fed = [...src.matchAll(/(\w+): (?:num|deg)\(/g)].map(m => m[1]);
    expect(fed.sort()).toEqual(['opacity', 'opacity', 'rotate', 'translateX', 'translateY']);
  });

  it('draws the cart in the accent and the words in the meta role’s own ink', () => {
    expect(src).toContain('<Icon name="cart" size={DONE_CART} color={a.accent} />');
    expect(src).toContain('<AppText variant="meta" ink="text2">');
  });

  it('asks for nothing Expo Go does not carry, writes no color of its own, and is exported', () => {
    for (const f of ['AllDone.tsx', 'allDone.ts']) {
      const code = withoutComments(read(f));
      for (const m of code.matchAll(/from '([^']+)'/g)) {
        const source = m[1] ?? '';
        expect(
          ['react', 'react-native'].includes(source) || /^\./.test(source),
          `${f}: ${source}`,
        ).toBe(true);
      }
      expect(code, f).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
    }
    expect(read('core.ts')).toContain("export * from './AllDone';");
    expect(read('../layout.ts')).toContain("from './components/allDone';");
  });
});
