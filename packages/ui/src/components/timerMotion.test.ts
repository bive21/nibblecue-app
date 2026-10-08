/**
 * THE RUNNING TIMERS' SMALL MOVE (2026-09-26), as numbers: when a sleep's "z"s drift — every sleep,
 * nap or night, since 2026-09-27 — where they land on a card, every frame of the loop, and
 * tripwires over `TimerMotion.tsx` for what only a phone can show. The same "z"s are held to the owner's own pixels by the app
 * (`apps/mobile/src/ui/cardArtParts.test.ts`); this suite uses a fixture picture, because this
 * package cannot read the app's files.
 *
 * AND WHAT IS GONE, held gone: the pump's two bottles (the owner, 2026-09-26: *"the pumping
 * animation doesnot mean much, you can remove this"*), and the moon's breath and the tummy-time
 * push-up, which the new pictures cannot carry cleanly (`timerMotion.ts` says why).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { CardArt } from '../theme/artInk';
import { themeNames } from '../theme/theme';
import { anchoredCover } from './cardArtFit';
import type { Frame } from './dayNightSwitch';
import { sampleFrame } from './keyframes';
import * as motion from './timerMotion';
import {
  artPlacement,
  loopFrame,
  onCard,
  timerMoves,
  Z_DRIFT,
  Z_LIFE,
  zFrames,
  zLifeAt,
} from './timerMotion';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const component = withoutComments(read('TimerMotion.tsx'));
const flat = component.replace(/\s+/g, ' ');
const pure = withoutComments(read('timerMotion.ts'));
const card = withoutComments(read('TimerCard.tsx')).replace(/\s+/g, ' ');

/** A picture shaped like the owner's sleeping one (1280 × 427, the drawing in the middle). */
const ART: CardArt = {
  source: 1,
  width: 1280,
  height: 427,
  ink: 'light',
  veil: 0.18,
  veilColor: '#443962',
  veilEnd: 0.55,
  contentFraction: 0.35,
  ground: '#a58ce8',
  parts: {
    zs: { from: { x: 750, y: 150 }, to: { x: 786, y: 74 }, size: 34, sway: 9 },
  },
};
const CARDS = [300, 324, 339, 394, 420].flatMap(width =>
  [100, 124, 160, 200].map(height => ({ width, height })),
);
const STEPS = Array.from({ length: 601 }, (_, i) => i / 600);

/* ------------------------------------------------------------------ when anything moves */

/**
 * EVERY SLEEP, NAP OR NIGHT (the owner, 2026-09-27: *"yes show zzz at night too"*). The "z"s used to
 * rise only for a daytime nap, decided from the household's wake and bed; nothing about the hour
 * reaches the card now, so there is no clock to test — only that nothing is left to ask one.
 */
describe('a sleep, nap or night', () => {
  it('drifts its "z"s at any hour: the moves take no clock, no zone and no household day', () => {
    // the whole of the input: what is running, its picture, and the two stillness settings
    expect(pure).not.toMatch(/\bnapMoves\b|isAwakeAt|sleepKindAt|wallMinutes|DayWindow/);
    expect(Object.keys(motion)).not.toContain('napMoves');
    expect(pure.replace(/\s+/g, ' ')).toContain(
      'export function timerMoves(input: { type: TimerType; art: CardArt | null; theme: ThemeName; reduceMotion: boolean; }): TimerMoves {',
    );
  });

  it('is handed no day to decide it with: not by the card, and not by the layer', () => {
    expect(card).not.toMatch(/dayWindow|DayWindow|napMoves/);
    expect(flat).not.toMatch(/\bnap\b/);
  });
});

describe('what moves on each card', () => {
  const moves = (
    type: 'sleep' | 'pump' | 'tummy' | 'breastfeed',
    over: Partial<{
      art: CardArt | null;
      theme: 'light' | 'dark' | 'night';
      reduceMotion: boolean;
    }> = {},
  ) => timerMoves({ type, art: ART, theme: 'light', reduceMotion: false, ...over });

  it('drifts a sleep’s "z"s, in light and in dark, and nothing on any other card', () => {
    for (const theme of ['light', 'dark'] as const) {
      expect(moves('sleep', { theme }), theme).toEqual({ zs: true, still: false });
      for (const type of ['pump', 'tummy', 'breastfeed'] as const)
        expect(moves(type, { theme }), `${theme} ${type}`).toEqual({ zs: false, still: false });
    }
  });

  it('moves nothing under reduce motion, in light and in dark', () => {
    for (const theme of ['light', 'dark'] as const)
      for (const type of ['sleep', 'tummy', 'pump', 'breastfeed'] as const)
        expect(moves(type, { theme, reduceMotion: true }), `${theme} ${type}`).toEqual({
          zs: false,
          still: true,
        });
  });

  it('moves nothing in the amber Night, over its dim picture as over none', () => {
    for (const type of ['sleep', 'tummy', 'pump', 'breastfeed'] as const)
      expect(moves(type, { theme: 'night' }), type).toEqual({ zs: false, still: true });
  });

  it('moves no part a picture does not name, and nothing on a card with no picture', () => {
    expect(moves('sleep', { art: { ...ART, parts: {} } }).zs).toBe(false);
    expect(moves('sleep', { art: null }).zs).toBe(false);
  });

  it('knows every theme', () => {
    for (const theme of themeNames) expect(typeof moves('sleep', { theme }).still).toBe('boolean');
  });
});

/**
 * WHAT WENT, HELD GONE. The pump's bottles went at the owner's word; the moon's breath and the
 * push-up because the new pictures cannot carry them without a seam. None of their machinery is
 * left to be drawn by mistake: no export of them, no part of a picture to name them.
 */
describe('what is no longer drawn', () => {
  it('exports no bottle, no breath, no push-up and no window to move a picture through', () => {
    const gone = [
      'PUMP_BOTTLE',
      'PUMP_LOOP',
      'pumpTargets',
      'pumpLevel',
      'milkDrop',
      'MOON_BREATH',
      'moonFrame',
      'PUSH_UP',
      'pushFrames',
      'pushedTo',
      'featherStops',
      'windowOnCard',
      'veilInArt',
    ];
    for (const name of gone) expect(Object.keys(motion), name).not.toContain(name);
    expect(
      Object.keys(
        timerMoves({ type: 'pump', art: ART, theme: 'light', reduceMotion: false }),
      ).sort(),
    ).toEqual(['still', 'zs']);
  });

  it('draws no bottle, no window and no second picture in the layer', () => {
    for (const word of ['PumpBottles', 'Bottle', 'ArtWindow', 'SvgImage', 'Mask', 'pump'])
      expect(component, word).not.toContain(word);
    expect(card).not.toContain('pumpLevels');
    expect(card).not.toContain('PumpLevels');
  });
});

/* --------------------------------------------------------------- where a part lands */

describe('a "z" lands on the picture pixel for pixel', () => {
  it('is placed as `CardArtLayer` places the picture, at every card size', () => {
    for (const box of CARDS) {
      const pl = artPlacement(box, ART);
      const drawn = anchoredCover(box, ART);
      expect(pl.left).toBeCloseTo(drawn.left, 9);
      expect(pl.top).toBeCloseTo(drawn.top, 9);
      expect(ART.width * pl.s).toBeCloseTo(drawn.width, 9);
      expect(ART.height * pl.s).toBeCloseTo(drawn.height, 9);
      // the picture's right edge is the card's
      expect(onCard(pl, ART.width, 0).x).toBeCloseTo(box.width, 9);
    }
  });

  it('is born where the picture says, grown with the picture', () => {
    const path = ART.parts?.zs;
    if (path === undefined) throw new Error('fixture');
    for (const box of CARDS) {
      const pl = artPlacement(box, ART);
      for (const z of zFrames(pl, path)) {
        expect(z.born.x).toBeCloseTo(onCard(pl, path.from.x, path.from.y).x, 9);
        expect(z.born.y).toBeCloseTo(onCard(pl, path.from.x, path.from.y).y, 9);
        expect(z.size).toBeCloseTo(path.size * pl.s, 9);
      }
    }
  });
});

/* ------------------------------------------------------------------------- the loop */

/** A loop's frame has no seam: its first and last frames are the same instant. */
function seamless(fr: Frame): void {
  expect(fr.inputRange[0]).toBe(0);
  expect(fr.inputRange.at(-1)).toBe(1);
  expect(fr.outputRange[0]).toBeCloseTo(fr.outputRange.at(-1) ?? Number.NaN, 9);
  for (let i = 1; i < fr.inputRange.length; i += 1)
    expect(fr.inputRange[i] ?? 0).toBeGreaterThan(fr.inputRange[i - 1] ?? 1);
  expect(fr.inputRange.length).toBe(fr.outputRange.length);
}

describe('the "z"s drift up', () => {
  const path = ART.parts?.zs;
  if (path === undefined) throw new Error('fixture');

  it('leave one every two and a half seconds, each in the air for six', () => {
    expect(Z_DRIFT.cycleMs / Z_DRIFT.count).toBe(2500);
    expect(Z_DRIFT.cycleMs * Z_DRIFT.life).toBe(6000);
  });

  it('two or three are up at once, never more and never none', () => {
    for (const t of STEPS.slice(0, -1)) {
      const up = [0, 1, 2].filter(i => zLifeAt(i, t) !== null).length;
      expect(up, `at ${t}`).toBeGreaterThanOrEqual(2);
      expect(up).toBeLessThanOrEqual(3);
    }
  });

  it('are born and gone invisibly, so the jump back to where one is born is never seen', () => {
    for (const f of zFrames(artPlacement(CARDS[1] ?? { width: 324, height: 100 }, ART), path)) {
      seamless(f.opacity);
      seamless(f.x);
      seamless(f.y);
      seamless(f.scale);
      seamless(f.turn);
      for (const t of STEPS) {
        const o = sampleFrame(f.opacity, t);
        expect(o).toBeGreaterThanOrEqual(0);
        expect(o).toBeLessThanOrEqual(1);
      }
    }
    // opacity 0 at birth and at the end of a life
    expect(Z_LIFE.opacity[0]?.[1]).toBe(0);
    expect(Z_LIFE.opacity.at(-1)?.[1]).toBe(0);
  });

  it('rise the whole of their path, grow as they go, and sway a little either side', () => {
    const pl = artPlacement({ width: 324, height: 100 }, ART);
    const [z] = zFrames(pl, path);
    if (z === undefined) throw new Error('three "z"s');
    const ys = STEPS.map(t => sampleFrame(z.y, t));
    expect(Math.min(...ys)).toBeCloseTo((path.to.y - path.from.y) * pl.s, 6);
    const scales = STEPS.map(t => sampleFrame(z.scale, t));
    expect(Math.max(...scales)).toBeCloseTo(1, 6);
    expect(Math.min(...scales)).toBeGreaterThan(0.5);
    // the sway, beyond the drift along the path, is never more than the path's own sway
    for (const t of STEPS) {
      const u = zLifeAt(0, t);
      if (u === null) continue;
      const along = (path.to.x - path.from.x) * pl.s * Math.min(1, Math.max(0, u));
      expect(Math.abs(sampleFrame(z.x, t) - along)).toBeLessThanOrEqual(path.sway * pl.s + 1e-6);
    }
  });
});

/* ------------------------------------------------------------------ loopFrame itself */

describe('a loop as a frame', () => {
  it('samples finely, names its own turning points exactly, and keeps its input strictly rising', () => {
    const f = loopFrame(t => Math.sin(2 * Math.PI * t), [0.25, 0.5, 0.123456]);
    expect(f.inputRange).toContain(0.25);
    expect(f.inputRange).toContain(0.123456);
    expect(f.inputRange.length).toBeGreaterThanOrEqual(121);
    seamless(f);
  });
});

/* ------------------------------------------------------- the component (tripwires) */

describe('TimerMotion (tripwires over the source)', () => {
  it('runs on the native driver only, and only opacity and transforms', () => {
    expect(component).toContain('useNativeDriver: true');
    expect(component).not.toContain('useNativeDriver: false');
    const fed = [...flat.matchAll(/(\w+): (?:num|deg)\(/g)].map(m => m[1]);
    expect(fed.length).toBeGreaterThanOrEqual(5);
    for (const prop of fed)
      expect(['opacity', 'translateX', 'translateY', 'scale', 'rotate'], prop).toContain(prop);
  });

  it('is decoration: no touches, hidden from assistive technology, clipped to the card', () => {
    expect(flat).toContain(
      'pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"',
    );
    expect(flat).toContain(
      'style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: radius }]}',
    );
  });

  it('lets its clock go with the card, and asks the moves what to draw', () => {
    expect(flat).toContain('return () => { loop.stop(); clock.setValue(0); };');
    expect(flat).toContain(
      'const moves = timerMoves({ type, art, theme: t.theme, reduceMotion: t.reduceMotion });',
    );
    expect(flat).toContain('if (!moves.zs || picture === null || zs === undefined) return null;');
  });

  it('draws the "z"s in the picture’s own deepest hue, the bell switch’s own "z"', () => {
    expect(flat).toContain('stroke={art.veilColor}');
    expect(flat).toContain('<Path d={Z_PATH}');
  });

  it('is memoised on what it draws, so the card’s once-a-second tick restarts nothing', () => {
    expect(flat).toContain('export const TimerMotion = memo(');
    expect(flat).toContain(
      '(a, b) => a.type === b.type && a.art === b.art && a.radius === b.radius,',
    );
  });

  it('asks for nothing Expo Go does not carry: React Native, react-native-svg, and its own files', () => {
    const imports = [...component.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    for (const source of imports)
      expect(
        ['react', 'react-native', 'react-native-svg'].includes(source ?? '') ||
          /^\./.test(source ?? ''),
        source,
      ).toBe(true);
  });

  it('writes no color and no word, and nothing about the baby or a number', () => {
    for (const src of [component, pure]) {
      expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
      expect(src).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
    }
    for (const word of [
      'oz',
      'ml',
      'Great',
      'Well done',
      'enough',
      'good',
      'low supply',
      'confetti',
    ])
      expect(component, word).not.toMatch(new RegExp(`['"\`][^'"\`]*\\b${word}\\b`, 'i'));
  });

  it('is drawn by the card over its picture and under its words', () => {
    expect(card).toContain('<TimerMotion type={type} art={picture} radius={t.radius.m} />');
    expect(card.indexOf('<TimerMotion')).toBeGreaterThan(card.indexOf('<CardArtLayer'));
    expect(card.indexOf('<TimerMotion')).toBeLessThan(card.indexOf('<View style={[styles.body'));
  });
});
