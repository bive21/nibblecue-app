/**
 * THE TWO-STOP PICTURE TOGGLE'S TRACK (the owner, 2026-09-25, of the "that's cool" list: the bottle
 * sheet's bottle that drains, the bath sheet's bubbles). Two halves, the way this package tests
 * anything that moves: the geometry, the planner and the frames are PURE (`pictureToggle.ts`) and
 * are sampled here exactly as `Animated.Value#interpolate` samples them; what only a device can
 * show — that the track is the segmented control's radio group to a screen reader, runs on the
 * native driver and holds still under reduce motion and in the amber Night — is held by tripwires
 * over `PictureToggle.tsx`, because this suite has no renderer (`interaction.test.ts` says why that
 * is the honest instrument).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BATH_SLOT } from './bathToggle';
import { BOTTLE_END_PAD, BOTTLE_SLOT } from './bottleToggle';
import type { Frame } from './dayNightSwitch';
import {
  PICTURE_EASE,
  PICTURE_MS,
  PICTURE_STOPS,
  PICTURE_TOGGLE_SIZE,
  PICTURE_WORD,
  PICTURE_WORD_GAP,
  pictureKnobAt,
  pictureMoveMs,
  pictureStill,
  pictureToggleGeometry,
  pictureTrackFrames,
  pictureWordCap,
  pictureWordWidth,
  planPictureMove,
  swayEven,
  swayFrame,
  type PictureStop,
  type PictureToggleGeometry,
} from './pictureToggle';
import { easeAt, SKY_EASE, spanWidth } from './themeSkyToggle';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
/** Comments out: the component explains its own rules, and a scan must not read the explanation. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const component = withoutComments(read('PictureToggle.tsx'));
const flat = component.replace(/\s+/g, ' ');
const pure = withoutComments(read('pictureToggle.ts'));

/**
 * The two toggles' words today, as FIXTURES: the design system types no word, and
 * `apps/mobile/src/sheets/quick/modules/bottleBathToggles.test.ts` runs the same proof over the
 * labels the sheets really pass.
 */
const TOGGLES = [
  { name: 'bottle', slot: BOTTLE_SLOT, pad: BOTTLE_END_PAD, words: ['Finished it', 'Some left'] },
  { name: 'bath', slot: BATH_SLOT, pad: 0, words: ['Washed', 'Not washed'] },
] as const;

/** Every width a phone's sheet body can be, half a point apart, from the proven floor up. */
const WIDTHS = Array.from(
  { length: (PICTURE_TOGGLE_SIZE.maxWidth - PICTURE_TOGGLE_SIZE.minWidth) * 2 + 1 },
  (_, i) => PICTURE_TOGGLE_SIZE.minWidth + i / 2,
);
/** Below the floor, down to the theme toggle's narrowest: the words still fit, without growing. */
const NARROW = Array.from(
  { length: (PICTURE_TOGGLE_SIZE.minWidth - 272) * 2 },
  (_, i) => 272 + i / 2,
);

/** `Animated.Value#interpolate` for one number: piecewise-linear, clamped or extended past the ends. */
function sample(fr: Frame, p: number): number {
  const xs = fr.inputRange;
  const ys = fr.outputRange;
  const last = xs.length - 1;
  const seg = (i: number) => {
    const [x0, x1, y0, y1] = [xs[i] ?? 0, xs[i + 1] ?? 1, ys[i] ?? 0, ys[i + 1] ?? 0];
    return y0 + ((p - x0) / (x1 - x0)) * (y1 - y0);
  };
  if (p <= (xs[0] ?? 0)) return fr.extrapolate === 'clamp' ? (ys[0] ?? 0) : seg(0);
  if (p >= (xs[last] ?? 1)) return fr.extrapolate === 'clamp' ? (ys[last] ?? 0) : seg(last - 1);
  let i = 0;
  while ((xs[i + 1] ?? 1) < p) i += 1;
  return seg(i);
}

/** The word's box at `scale`, centered in its span as the component centers it. */
function wordBox(g: PictureToggleGeometry, s: PictureStop, label: string, scale: number) {
  const span = g.word[s];
  const w = pictureWordWidth(label, scale);
  const left = span.left + (spanWidth(span) - w) / 2;
  return { left, right: left + w };
}

const STEPS = Array.from({ length: 201 }, (_, i) => i / 200);

describe('the size of it', () => {
  it('is a pill twelve points taller than the segmented control, halved into two big targets', () => {
    for (const t of TOGGLES)
      for (const width of [...NARROW, ...WIDTHS]) {
        const g = pictureToggleGeometry(width, t.slot, t.pad);
        expect(g.height).toBe(56);
        expect(g.knob).toBe(g.height - 2 * g.inset);
        // each half is one radio: 44 pt is the floor for a target (CLAUDE.md §6)
        expect(g.zone).toBe(g.width / 2);
        expect(g.zone, `${t.name} at ${width}`).toBeGreaterThanOrEqual(44);
        expect(g.height).toBeGreaterThanOrEqual(44);
      }
  });

  it('takes the room it is given, whole phones included, and stops past any phone', () => {
    const g = (w: number) => pictureToggleGeometry(w, BOTTLE_SLOT, BOTTLE_END_PAD).width;
    // a 360 dp Android, a 375 pt iPhone and the largest phone, each less the sheet's gutters
    expect(g(324)).toBe(324);
    expect(g(339)).toBe(339);
    expect(g(394)).toBe(394);
    expect(g(900)).toBe(PICTURE_TOGGLE_SIZE.maxWidth);
    // a first frame that measured nothing still draws two zones as wide as the pill is tall
    expect(g(0)).toBe(2 * PICTURE_TOGGLE_SIZE.height);
  });

  it('rests the knob at the two ends, the same way in from each', () => {
    for (const t of TOGGLES)
      for (const width of WIDTHS) {
        const g = pictureToggleGeometry(width, t.slot, t.pad);
        expect(g.rest[0]).toBe(g.inset + t.pad);
        expect(g.width - (g.rest[1] + g.slot)).toBeCloseTo(g.inset + t.pad, 9);
        expect(g.travel).toBeCloseTo(g.rest[1] - g.rest[0], 9);
        expect(g.center[0] + g.center[1]).toBeCloseTo(g.width, 9);
      }
  });
});

describe('both words fit their halves, at every width a phone gives', () => {
  it('grows with the phone’s text to at least 1.3× from the proven floor up, and never past 1.6', () => {
    for (const t of TOGGLES)
      for (const width of WIDTHS) {
        const cap = pictureWordCap(pictureToggleGeometry(width, t.slot, t.pad), t.words);
        expect(cap, `${t.name} at ${width}`).toBeGreaterThanOrEqual(PICTURE_WORD.floor);
        expect(cap).toBeLessThanOrEqual(PICTURE_WORD.ceiling);
      }
  });

  it('fits both words at the phone’s own size below the floor, down to the narrowest window', () => {
    for (const t of TOGGLES)
      for (const width of NARROW) {
        const g = pictureToggleGeometry(width, t.slot, t.pad);
        for (const s of PICTURE_STOPS)
          expect(spanWidth(g.word[s]), `${t.name} at ${width}`).toBeGreaterThanOrEqual(
            pictureWordWidth(t.words[s]),
          );
      }
  });

  it('never lets a word touch the knob’s slot, the other word or the rim, at its largest', () => {
    for (const t of TOGGLES)
      for (const width of WIDTHS) {
        const g = pictureToggleGeometry(width, t.slot, t.pad);
        const cap = pictureWordCap(g, t.words);
        const a = wordBox(g, 0, t.words[0], cap);
        const b = wordBox(g, 1, t.words[1], cap);
        // clear of each end's slot by the gap, and of each other across the middle
        expect(a.left).toBeGreaterThanOrEqual(g.rest[0] + g.slot + PICTURE_WORD_GAP - 1e-9);
        expect(b.right).toBeLessThanOrEqual(g.rest[1] - PICTURE_WORD_GAP + 1e-9);
        expect(b.left - a.right).toBeGreaterThanOrEqual(PICTURE_WORD_GAP - 1e-9);
        // and the words sit in the pill's straight band, never out on its round ends
        expect(a.left).toBeGreaterThanOrEqual(g.height / 2);
        expect(b.right).toBeLessThanOrEqual(g.width - g.height / 2);
      }
  });

  it('bounds a word by characters, so a word nobody has written yet is bounded too', () => {
    expect(pictureWordWidth('Some left')).toBeCloseTo(9 * 0.6 * PICTURE_WORD.size, 9);
    expect(pictureWordWidth('Some left', 1.6)).toBeCloseTo(1.6 * pictureWordWidth('Some left'), 9);
    // the segmented control's own size
    expect(PICTURE_WORD.size).toBe(13);
    // a word too long for its half is reported at 1 — `adjustsFontSizeToFit` shrinks it — never below
    const g = pictureToggleGeometry(324, BOTTLE_SLOT, BOTTLE_END_PAD);
    expect(pictureWordCap(g, ['A very long answer indeed here', 'Some left'])).toBe(1);
  });
});

describe('the move', () => {
  it('takes 600 ms end to end, less from part of the way, and never under a third of it', () => {
    expect(pictureMoveMs(1)).toBe(PICTURE_MS);
    expect(pictureMoveMs(0.5)).toBeLessThan(PICTURE_MS);
    expect(pictureMoveMs(0)).toBe(Math.round(PICTURE_MS * 0.35));
    expect(pictureMoveMs(7)).toBe(PICTURE_MS);
  });

  it('moves on the theme toggle’s landing curve: no overshoot, because both stops are ends', () => {
    expect(PICTURE_EASE).toBe(SKY_EASE.land);
    let peak = 0;
    for (const x of STEPS) peak = Math.max(peak, easeAt(PICTURE_EASE, x));
    expect(peak).toBeLessThanOrEqual(1);
  });

  it('sets off from its stop at rest, the sway signed by the way it goes', () => {
    const right = planPictureMove(null, 0, 1, 1000, false);
    expect(right).toEqual({ animate: true, from: 0, to: 1, duration: PICTURE_MS, sway: 1 });
    const left = planPictureMove(null, 1, 0, 1000, false);
    expect(left).toEqual({ animate: true, from: 1, to: 0, duration: PICTURE_MS, sway: -1 });
    // a plan to where it already rests does nothing
    expect(planPictureMove(null, 1, 1, 1000, false).animate).toBe(false);
  });

  it('turns round mid-move from where the curve says it is, without a jump', () => {
    const start = 1000;
    const out = planPictureMove(null, 0, 1, start, false);
    const m = { from: out.from, to: 1 as const, startedAt: start, duration: out.duration };
    for (const frac of [0.1, 0.3, 0.5, 0.8]) {
      const now = start + frac * out.duration;
      const back = planPictureMove(m, 1, 0, now, false);
      const at = pictureKnobAt(m, now);
      expect(back.from).toBeCloseTo(at, 9);
      expect(back.to).toBe(0);
      expect(back.sway).toBe(-1);
      // shorter than a full move, and sized by what is left
      expect(back.duration).toBe(pictureMoveMs(at));
    }
    // a move that has finished is rest again
    expect(planPictureMove(m, 1, 0, start + out.duration + 1, false).from).toBe(1);
  });

  it('estimates the knob on the curve: at its start, on its way, and there', () => {
    const m = { from: 0, to: 1 as const, startedAt: 0, duration: 600 };
    expect(pictureKnobAt(m, 0)).toBe(0);
    expect(pictureKnobAt(m, 600)).toBe(1);
    let last = -1;
    for (const x of STEPS) {
      const at = pictureKnobAt(m, x * 600);
      expect(at).toBeGreaterThanOrEqual(last);
      last = at;
    }
  });
});

describe('when nothing moves: reduce motion, and the amber Night', () => {
  it('holds still under reduce motion in every theme, and in the Night theme always', () => {
    for (const theme of ['light', 'dark', 'night'] as const)
      expect(pictureStill(true, theme)).toBe(true);
    expect(pictureStill(false, 'night')).toBe(true);
    expect(pictureStill(false, 'light')).toBe(false);
    expect(pictureStill(false, 'dark')).toBe(false);
  });

  it('plans a still change as the end state, set: no animation, no sway, no time', () => {
    for (const to of PICTURE_STOPS)
      for (const at of PICTURE_STOPS) {
        const plan = planPictureMove(null, at, to, 0, true);
        expect(plan).toEqual({ animate: false, from: to, to, duration: 0, sway: 0 });
      }
    // even over a move in flight: the knob is set to where it was going, never frozen part way
    const m = { from: 0, to: 1 as const, startedAt: 0, duration: 600 };
    expect(planPictureMove(m, 1, 0, 300, true)).toEqual({
      animate: false,
      from: 0,
      to: 0,
      duration: 0,
      sway: 0,
    });
  });

  it('reads both from the theme, and sets the values in the component', () => {
    expect(flat).toContain('const still = pictureStill(t.reduceMotion, t.theme);');
    expect(flat).toMatch(/if \(!p\.animate\) \{ pos\.setValue\(p\.to\); sway\.setValue\(0\);/);
    expect(flat).toContain('[pos, sway, stop, still]');
  });
});

describe('the frames', () => {
  const g = pictureToggleGeometry(324, BOTTLE_SLOT, BOTTLE_END_PAD);
  const f = pictureTrackFrames(g);
  const EVERY: readonly [string, Frame][] = [
    ['knobX', f.knobX],
    ...PICTURE_STOPS.flatMap((s): [string, Frame][] => [
      [`chosen ${s}`, f.chosen[s]],
      [`quiet ${s}`, f.quiet[s]],
      [`ghost ${s}`, f.ghost[s]],
    ]),
    ['sway', swayFrame(7)],
    ['even', swayEven([0.2, 0.5, 0.8], [1, -1, 1])],
  ];

  it('are frames Animated can read: in order, one output per input, and clamped', () => {
    for (const [name, fr] of EVERY) {
      expect(fr.inputRange.length, name).toBe(fr.outputRange.length);
      for (let i = 1; i < fr.inputRange.length; i += 1)
        expect(fr.inputRange[i] ?? 0, name).toBeGreaterThan(fr.inputRange[i - 1] ?? 0);
      expect(fr.extrapolate, name).toBe('clamp');
    }
  });

  it('carries the knob from one end to the other and no further', () => {
    expect(sample(f.knobX, 0)).toBe(0);
    expect(sample(f.knobX, 1)).toBe(g.travel);
    expect(sample(f.knobX, 1.2)).toBe(g.travel);
  });

  it('writes the chosen word in full and the other quiet at rest, and cross-fades them on the way', () => {
    for (const [pos, chosenStop] of [
      [0, 0],
      [1, 1],
    ] as const) {
      for (const s of PICTURE_STOPS) {
        expect(sample(f.chosen[s], pos), `stop ${s} at ${pos}`).toBe(s === chosenStop ? 1 : 0);
        expect(sample(f.quiet[s], pos), `stop ${s} at ${pos}`).toBe(s === chosenStop ? 0 : 1);
      }
    }
    // one word is always whole: the two inks of it add to one at every point of the way
    for (const p of STEPS)
      for (const s of PICTURE_STOPS)
        expect(sample(f.chosen[s], p) + sample(f.quiet[s], p)).toBeCloseTo(1, 9);
  });

  it('never draws a ghost where the knob is: gone before it arrives, back only once it has left', () => {
    const seen: string[] = [];
    let overlapped = 0;
    for (const width of WIDTHS)
      for (const t of TOGGLES) {
        const gg = pictureToggleGeometry(width, t.slot, t.pad);
        const ff = pictureTrackFrames(gg);
        for (const p of STEPS) {
          const left = gg.rest[0] + sample(ff.knobX, p);
          for (const s of PICTURE_STOPS) {
            if (!(left < gg.rest[s] + gg.slot && left + gg.slot > gg.rest[s])) continue;
            overlapped += 1;
            if (sample(ff.ghost[s], p) !== 0) seen.push(`${t.name} ${width} ${p}`);
          }
        }
        // at rest, the empty end shows its ghost and the knob's end shows none
        expect(sample(ff.ghost[0], 0)).toBe(0);
        expect(sample(ff.ghost[1], 0)).toBe(1);
        expect(sample(ff.ghost[0], 1)).toBe(1);
        expect(sample(ff.ghost[1], 1)).toBe(0);
      }
    // not vacuous: the knob does pass over both slots on its way
    expect(overlapped).toBeGreaterThan(1000);
    expect(seen.slice(0, 3)).toEqual([]);
  });

  it('leans back as a knob is pushed off and forward as it stops, mirrored the other way', () => {
    const lean = swayFrame(7);
    // odd: a move to the left is a move to the right in a mirror
    for (const s of STEPS) expect(sample(lean, -s)).toBeCloseTo(-sample(lean, s), 9);
    // rest, and the end of either move, which `sway` is set back to rest from, draw the same
    for (const s of [-1, 0, 1]) expect(sample(lean, s)).toBe(0);
    // to the right: the top is left behind (counterclockwise), then carries on (clockwise)
    expect(sample(lean, 0.25)).toBe(-7);
    expect(sample(lean, 0.7)).toBeCloseTo(4.2, 9);
    // and it is never more than the amplitude
    for (const s of STEPS) expect(Math.abs(sample(lean, s))).toBeLessThanOrEqual(7);
  });

  it('draws a move’s even part the same both ways, and nothing at rest', () => {
    const even = swayEven([0.2, 0.5, 0.8], [1, -1, 1]);
    for (const s of STEPS) expect(sample(even, -s)).toBeCloseTo(sample(even, s), 9);
    for (const s of [-1, 0, 1]) expect(sample(even, s)).toBe(0);
    expect(sample(even, 0.5)).toBe(-1);
  });
});

describe('the track (tripwires over PictureToggle.tsx)', () => {
  it('is the segmented control to a screen reader: a named group of two radios, in order', () => {
    expect(flat).toContain('accessibilityRole="radiogroup"');
    expect(flat).toContain('accessibilityLabel={label}');
    expect(flat).toContain('accessibilityRole="radio"');
    expect(flat).toContain('accessibilityLabel={o.label}');
    expect(flat).toContain('accessibilityState={{ checked: on, selected: on, disabled }}');
    // one Pressable per option, and no other
    expect(component.split('<Pressable')).toHaveLength(2);
    expect(flat).toContain('PICTURE_STOPS.map(s => { const o = options[s];');
  });

  it('keeps the segmented control’s ids: `${testID}` for the group, `${testID}.${value}` for each', () => {
    expect(flat).toContain('{...(testID ? { testID } : {})}');
    expect(flat).toContain('testID: `${testID}.${o.value}`');
  });

  it('is felt by the segmented control’s own rule: a tap on the other answer, nothing on the chosen', () => {
    // the very line SegmentedControl carries (feedback/callSites.test.ts), with nothing locked here
    expect(flat).toContain(
      "onPress={() => { feelChoice({ locked: false, current: on, kind: 'tap' }); if (!on) onChange(o.value); }}",
    );
    expect(flat).toContain("import { feelChoice } from '../feedback/choice';");
    // once per tap, in the press handler: never again as the knob lands, never on its own
    expect(component.split('feelChoice(')).toHaveLength(2);
    expect(component).not.toContain('haptic(');
    // and the pictures that ride in it feel nothing of their own
    for (const file of ['BottleToggle.tsx', 'BathToggle.tsx']) {
      const src = withoutComments(read(file));
      expect(src, file).not.toContain('haptic(');
      expect(src, file).not.toContain('feelChoice(');
    }
  });

  it('hides the picture from touch and from assistive technology', () => {
    expect(flat).toMatch(
      /pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden/,
    );
  });

  it('clips the picture to the pill and draws the theme’s rim over it', () => {
    expect(flat).toContain("overflow: 'hidden'");
    expect(flat).toContain('borderColor: t.color.line2');
    const rim = component.indexOf('borderColor: t.color.line2');
    expect(rim).toBeGreaterThan(component.indexOf('{front}'));
  });

  it('stacks ghosts, then words, then the knob, then the picture’s front', () => {
    const ghost = component.indexOf('anim.ghost[s]');
    const word = component.indexOf('anim.quiet[s]');
    const knob = component.indexOf('anim.knob');
    const front = component.indexOf('{front}');
    expect(ghost).toBeGreaterThan(component.indexOf('{backdrop}'));
    expect(word).toBeGreaterThan(ghost);
    expect(knob).toBeGreaterThan(word);
    expect(front).toBeGreaterThan(knob);
  });

  it('writes each word whole on one line, capped where its half runs out, in the picture’s inks', () => {
    expect(flat).toContain('numberOfLines={1}');
    expect(flat).toContain('adjustsFontSizeToFit');
    expect(flat).toContain('maxFontSizeMultiplier={cap}');
    expect(flat).toContain('minimumFontScale={PICTURE_WORD.shrink}');
    expect(flat).toContain('color={bold ? ink.word : ink.quiet}');
    expect(flat).toContain("variant={bold ? 'bodyStrong' : 'bodySm'}");
  });

  it('runs every frame on the native driver: opacity and transforms only', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    const fed = [...flat.matchAll(/(\w+): (?:num|deg)\(/g)].map(m => m[1]);
    expect(fed.length).toBeGreaterThan(0);
    for (const prop of fed) expect(['opacity', 'translateX'], prop).toContain(prop);
    expect(flat).toContain('Easing.bezier(...PICTURE_EASE)');
    // the sway is placed in time, and set back to rest when a move arrives
    expect(flat).toContain('if (finished) sway.setValue(0);');
    expect(flat).toContain('return () => run.stop();');
  });

  it('asks for nothing Expo Go does not carry: React Native and its own files', () => {
    const imports = [...component.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    for (const source of imports)
      expect(
        ['react', 'react-native'].includes(source ?? '') || /^\./.test(source ?? ''),
        source,
      ).toBe(true);
    // (the motor is the app's to install, never this package's: feedback/callSites.test.ts)
    expect(component).not.toContain('reanimated');
  });

  it('writes no color and no word: the picture’s colors, the theme’s rim, the caller’s words', () => {
    for (const src of [component, pure]) {
      expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
      expect(src).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
      expect(src).not.toMatch(/['"`](Finished it|Some left|Washed|Not washed|Included with)/);
    }
  });
});
