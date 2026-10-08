/**
 * THE SCHEDULE'S DAY, MOVING (`scheduleMotion.ts`, `NowLine.tsx`, `SoonDot.tsx`, `StaggerIn.tsx`;
 * the owner, 2026-09-26). The numbers are walked here — how long the now line's glide takes, where
 * it is kept inside the list, how the soon dot breathes and how a slot's chip settles — and so are
 * the two new inks, against every ground they land on in every theme, scheme and skin. What only a
 * device can show (the native driver, the loop stopping out of sight) is held by tripwires over the
 * component files, because this suite has no renderer (`interaction.test.ts`).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { deriveAccent } from '../theme/accent';
import {
  DEFAULT_APPEARANCE,
  PLUS_APPEARANCE,
  resolveAppearance,
  SCHEME_NAMES,
} from '../theme/appearance';
import { AA_GRAPHIC, composite, contrastRatio, parseColor } from '../theme/contrast';
import { SKIN_NAMES } from '../theme/skins';
import { space, themeNames, themes } from '../theme/theme';
import { sampleFrame } from './keyframes';
import {
  chipSettleFrames,
  NOW_GLIDE,
  NOW_LINE,
  NOW_STEP,
  nowGlideMs,
  nowInk,
  nowLineY,
  SLOT_DONE,
  SOON_DOT,
  SOON_MS,
  soonBreath,
  soonDotShown,
} from './scheduleMotion';
import { TICK_DRAW_MS } from './tickDraw';
import { handInk, HAND_SWEEP, WHEEL_HAND } from './wheelHand';

const here = dirname(fileURLToPath(import.meta.url));
/** Comments out, whitespace flattened: a scan reads what the code does, not what it says. */
const code = (file: string): string =>
  readFileSync(join(here, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

describe('the now line: where it is, and how it gets there', () => {
  it('glides down in 300–700 ms, longer the further it goes', () => {
    expect(nowGlideMs(0)).toBe(NOW_GLIDE.minMs);
    expect(nowGlideMs(-40)).toBe(NOW_GLIDE.minMs);
    expect(nowGlideMs(Number.NaN)).toBe(NOW_GLIDE.minMs);
    expect(nowGlideMs(5000)).toBe(NOW_GLIDE.maxMs);
    let prev = 0;
    for (let d = 0; d <= 900; d += 15) {
      const ms = nowGlideMs(d);
      expect(ms, `${d}`).toBeGreaterThanOrEqual(prev);
      expect(ms).toBeGreaterThanOrEqual(300);
      expect(ms).toBeLessThanOrEqual(700);
      prev = ms;
    }
    // a place a few rows down is well under half a second
    expect(nowGlideMs(120)).toBeLessThan(450);
  });

  it('sets off a beat after the page, on the ease-out the wheel’s hand uses, with no overshoot', () => {
    expect(NOW_GLIDE.delayMs).toBeGreaterThan(0);
    expect(NOW_GLIDE.delayMs).toBeLessThanOrEqual(150);
    expect(NOW_GLIDE.ease).toEqual(HAND_SWEEP.ease);
    for (const ease of [NOW_GLIDE.ease, NOW_STEP.ease]) {
      const [x1, y1, x2, y2] = ease;
      expect([x1, x2].every(x => x >= 0 && x <= 1)).toBe(true);
      expect(y1).toBeGreaterThanOrEqual(0);
      expect(y2).toBeLessThanOrEqual(1);
    }
    // the clock passing a slot is a short step, not a second arrival
    expect(NOW_STEP.ms).toBeLessThanOrEqual(400);
  });

  it('keeps the whole dot inside the list, and is exactly at the place anywhere else', () => {
    const r = NOW_LINE.dot / 2;
    expect(nowLineY(0, 400)).toBe(r);
    expect(nowLineY(-10, 400)).toBe(r);
    expect(nowLineY(400, 400)).toBe(400 - r);
    expect(nowLineY(212.5, 400)).toBe(212.5);
    // a list barely taller than the dot draws it in its middle
    expect(nowLineY(3, NOW_LINE.dot)).toBe(NOW_LINE.dot / 2);
    expect(nowLineY(Number.NaN, 400)).toBe(r);
  });

  it('is thin and quiet: under 2 pt, at the wheel hand’s share, its dot in the rows’ gutter', () => {
    expect(NOW_LINE.stroke).toBeLessThan(2);
    expect(NOW_LINE.alpha).toBe(WHEEL_HAND.alpha);
    // the dot sits in the rows' 14 pt gutter, clear of the time column
    expect(NOW_LINE.dot).toBeLessThan(space.xl);
  });

  it('wears the wheel hand’s ink: the accent, and the night amber in Night', () => {
    for (const theme of themeNames)
      for (const scheme of SCHEME_NAMES) {
        const c = resolveAppearance(
          { ...DEFAULT_APPEARANCE, theme, scheme },
          'light',
          PLUS_APPEARANCE,
        ).palette;
        expect(nowInk(c, theme)).toBe(handInk(c, theme));
      }
    expect(nowInk({ accent: '#123456' }, 'night')).toBe(themes.night.accent);
  });
});

describe('the soon dot: the next slot, a quarter of an hour off or less, breathing', () => {
  const f = soonBreath();

  it('is for fifteen minutes before the slot', () => {
    expect(SOON_MS).toBe(15 * 60_000);
  });

  it('breathes calmly, and loops without a seam', () => {
    expect(SOON_DOT.cycleMs).toBeGreaterThanOrEqual(2000);
    expect(SOON_DOT.cycleMs).toBeLessThanOrEqual(3000);
    for (const fr of [f.core, f.halo, f.haloOpacity]) {
      expect(sampleFrame(fr, 0)).toBeCloseTo(sampleFrame(fr, 1), 9);
      expect(fr.extrapolate).toBe('clamp');
    }
    // at rest between breaths: the dot itself, and no ring
    expect(sampleFrame(f.core, 0)).toBe(1);
    expect(sampleFrame(f.haloOpacity, 0)).toBe(0);
    // the full of the breath is its middle
    expect(sampleFrame(f.core, 0.5)).toBeCloseTo(SOON_DOT.corePeak, 9);
    expect(sampleFrame(f.halo, 0.5)).toBeCloseTo(SOON_DOT.haloPeak, 9);
    expect(sampleFrame(f.haloOpacity, 0.5)).toBeCloseTo(SOON_DOT.haloAlpha, 9);
  });

  it('never dims the dot and never grows past the rows’ gutter', () => {
    for (let p = 0; p <= 1; p += 0.01) {
      const core = sampleFrame(f.core, p);
      expect(core).toBeGreaterThanOrEqual(1);
      expect(core).toBeLessThanOrEqual(SOON_DOT.corePeak + 1e-9);
      const halo = sampleFrame(f.halo, p);
      expect(halo * SOON_DOT.size).toBeLessThanOrEqual(space.xl);
      const ink = sampleFrame(f.haloOpacity, p);
      expect(ink).toBeGreaterThanOrEqual(0);
      expect(ink).toBeLessThanOrEqual(SOON_DOT.haloAlpha + 1e-9);
    }
  });

  it('is never drawn in the amber Night, and is in light and dark', () => {
    expect(soonDotShown('night')).toBe(false);
    expect(soonDotShown('light')).toBe(true);
    expect(soonDotShown('dark')).toBe(true);
  });
});

describe('a slot turning done', () => {
  it('settles its chip about as long as the check takes to draw, and fades the wash a little after', () => {
    expect(Math.abs(SLOT_DONE.chipMs - TICK_DRAW_MS)).toBeLessThanOrEqual(40);
    expect(SLOT_DONE.washMs).toBeGreaterThanOrEqual(SLOT_DONE.chipMs);
    expect(SLOT_DONE.washMs).toBeLessThanOrEqual(400);
    const c = chipSettleFrames();
    expect(sampleFrame(c.scale, 1)).toBe(1);
    expect(sampleFrame(c.opacity, 1)).toBe(1);
    // it starts as a chip, faint and a little small — never gone, never a pop from nothing
    expect(sampleFrame(c.scale, 0)).toBeGreaterThan(0.85);
    expect(sampleFrame(c.opacity, 0)).toBeGreaterThan(0);
  });
});

/**
 * THE INKS, WHERE THEY LAND. The now line crosses the day's card (`surfaceSolid`, which `PlainCard`
 * paints), the wash under a due row (`tintSoft`) and a folded group's header (`paper`); its dot sits
 * on the same three. The soon dot is on an upcoming row — the card — and is the accent at full.
 * Everywhere 3:1, a mark (WCAG 1.4.11), in every skin × scheme × theme: the skin changes no hue
 * (`skins.ts`), and walking it is the proof that it does not here either.
 */
describe('3:1 on everything the line and the dot land on, in every skin, scheme and theme', () => {
  const cases = SKIN_NAMES.flatMap(skin =>
    SCHEME_NAMES.flatMap(scheme => themeNames.map(theme => ({ skin, scheme, theme }))),
  );

  it('walks every skin, every scheme and every theme', () => {
    expect(cases).toHaveLength(SKIN_NAMES.length * SCHEME_NAMES.length * 3);
    expect(SCHEME_NAMES).toHaveLength(6);
  });

  it.each(cases)('$skin / $scheme / $theme', ({ skin, scheme, theme }) => {
    const c = resolveAppearance(
      { ...DEFAULT_APPEARANCE, theme, scheme, skin },
      'light',
      PLUS_APPEARANCE,
    ).palette;
    const grounds = {
      card: c.surfaceSolid,
      dueWash: deriveAccent(c).tintSoft,
      groupHeader: c.paper,
    };
    const ink = nowInk(c, theme);
    expect(parseColor(ink).a).toBe(1);
    for (const [name, ground] of Object.entries(grounds)) {
      expect(parseColor(ground).a, name).toBe(1);
      const line = composite(ground, ink, NOW_LINE.alpha);
      expect(contrastRatio(line, ground), `line on ${name}`).toBeGreaterThanOrEqual(AA_GRAPHIC);
      expect(contrastRatio(ink, ground), `dot on ${name}`).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
    if (soonDotShown(theme))
      expect(
        contrastRatio(deriveAccent(c).accent, c.surfaceSolid),
        'soon dot',
      ).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });
});

describe('the components (tripwires)', () => {
  const line = code('NowLine.tsx');
  const dot = code('SoonDot.tsx');
  const enter = code('StaggerIn.tsx');

  it('move everything on the native driver, and nothing on the JavaScript one', () => {
    for (const src of [line, dot, enter]) {
      expect(src).toContain('useNativeDriver: true');
      expect(src).not.toContain('useNativeDriver: false');
      // no layout is animated: a transform and an opacity only
      expect(src).not.toMatch(/height: num\(|width: num\(|top: num\(/);
    }
    expect(line).toContain('transform: [{ translateY: top }]');
    expect(enter).toContain('transform: [{ translateY: num(v, f.y) }]');
  });

  it('read reduce motion and the amber Night from the theme, and draw the end state then', () => {
    for (const src of [line, dot, enter])
      expect(src).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    // the line is simply at now
    expect(line).toContain('if (still) { top.setValue(latest.current - half); return undefined; }');
    // the dot never breathes when still, and is not drawn at all in Night
    expect(dot).toContain('const breathes = shown && !still && running;');
    expect(dot).toContain('if (!shown) return null;');
    // a first look is simply there
    expect(enter).toContain('useState(() => delay !== null && !still)');
  });

  it('stops the dot’s loop the moment it is not seen, and leaves it at rest', () => {
    expect(dot).toContain('Animated.loop(');
    expect(dot).toContain('if (!breathes) { clock.setValue(0); return undefined; }');
    expect(dot).toContain('return () => { loop.stop(); clock.setValue(0); };');
    expect(dot).toContain('}, [breathes, clock]);');
    // the ring is only mounted while it breathes
    expect(dot).toContain('{breathes ? <Animated.View');
  });

  it('are decoration: no touches, hidden from assistive technology', () => {
    for (const src of [line, dot]) {
      expect(src).toContain('pointerEvents="none"');
      expect(src).toContain('importantForAccessibility="no-hide-descendants"');
      expect(src).toContain('accessibilityElementsHidden');
      expect(src).not.toContain('<Pressable');
      expect(src).not.toContain('accessibilityRole');
    }
  });

  it('glide the line once per arrival, and step it only when the clock passes a slot', () => {
    expect(line).toContain('}, [arrival, still]);');
    expect(line).toContain('const stepped = lastAt.current !== at;');
    expect(line).toContain('if (!stepped || still) { top.setValue(y - half); return undefined; }');
  });

  it('asks for nothing Expo Go does not carry, and writes no color of its own', () => {
    for (const f of ['NowLine.tsx', 'SoonDot.tsx', 'StaggerIn.tsx', 'scheduleMotion.ts']) {
      const src = code(f);
      for (const m of src.matchAll(/from '([^']+)'/g)) {
        const source = m[1] ?? '';
        expect(
          source.startsWith('.') || ['react', 'react-native', '@nibblecue/core'].includes(source),
          `${f}: ${source}`,
        ).toBe(true);
      }
      expect(src, f).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    }
  });
});
