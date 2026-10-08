/**
 * THE DIAPER TOGGLE (the owner, 2026-09-26: *"we can do something on diaper category too (wet, dirt,
 * both, and dry)"*). Two halves, the way this package tests anything that moves: the geometry, the
 * planners and the frames are PURE (`diaperToggle.ts`) and are sampled here exactly as
 * `Animated.Value#interpolate` samples them — the pill at every width a phone gives, the diaper
 * inside it at rest and at every point of every hop, the pictures' parts in the order they play
 * and gone at rest; what only a device can show — that it is the segmented control's radio group to
 * a screen reader, runs on the native driver and holds still under reduce motion and in the amber
 * Night — is held by tripwires over `DiaperToggle.tsx`, because this suite has no renderer.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DiaperKind } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { type as typeScale } from '../theme/theme';
import type { Frame } from './dayNightSwitch';
import {
  DIAPER,
  DIAPER_GAP,
  DIAPER_GHOST_SCALE,
  DIAPER_HOLD,
  DIAPER_LANDS,
  DIAPER_LEAN,
  DIAPER_MS,
  DIAPER_PICTURE_MS,
  DIAPER_SLOT,
  DIAPER_STOPS,
  DIAPER_TOGGLE_SIZE,
  DIAPER_WORD,
  DROP,
  DROP_SPAN,
  DROPS,
  HOP,
  SPARKLES,
  WHIFF_BOX,
  WHIFF_RISE,
  WHIFF_STROKE,
  WHIFFS,
  WISP,
  WORD_QUIET,
  diaperBodyFrames,
  diaperEase,
  diaperKnobAt,
  diaperLook,
  diaperMoveMs,
  diaperPictureFrames,
  diaperStopOf,
  diaperToggleGeometry,
  diaperTrackFrames,
  diaperWordWidth,
  planDiaperMove,
  planDiaperPicture,
  whiffPath,
  type DiaperStop,
  type DiaperToggleGeometry,
} from './diaperToggle';
import { sampleFrame as sample } from './keyframes';
import { PICTURE_WORD } from './pictureToggle';
import { spanWidth } from './themeSkyToggle';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
/** Comments out: the component explains its own rules, and a scan must not read the explanation. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const component = withoutComments(read('DiaperToggle.tsx'));
const flat = component.replace(/\s+/g, ' ');
const pure = withoutComments(read('diaperToggle.ts'));

/**
 * The words as FIXTURES — the design system types no word; the diaper sheet's own test runs the
 * same proof over the words it really passes (`apps/mobile/.../diaperToggle.test.ts`).
 */
const WORDS = ['Wet', 'Dirty', 'Both', 'Dry'] as const;
const KINDS: readonly DiaperKind[] = ['WET', 'DIRTY', 'BOTH', 'DRY'];

/** Every width a phone's sheet body can be, half a point apart, from the proven floor to the cap. */
const WIDTHS = Array.from(
  { length: (DIAPER_TOGGLE_SIZE.maxWidth - DIAPER_TOGGLE_SIZE.minWidth) * 2 + 1 },
  (_, i) => DIAPER_TOGGLE_SIZE.minWidth + i / 2,
);
/** The text sizes a phone can be set to, past the chrome cap included. */
const SCALES = [0.85, 1, 1.15, 1.3, 1.45, 1.6, 2, 3.1] as const;
const STEPS = Array.from({ length: 201 }, (_, i) => i / 200);
const geo = (w: number, scale = 1) => diaperToggleGeometry(w, WORDS, scale);

/** Is (x, y) inside the pill, `margin` in from its edge? */
function insidePill(g: DiaperToggleGeometry, x: number, y: number, margin: number): boolean {
  const r = g.height / 2;
  const cx = Math.min(Math.max(x, r), g.width - r);
  return Math.hypot(x - cx, y - r) <= r - margin + 1e-9;
}

/**
 * Every point a path is drawn through or towards — its anchors and its control points — read the
 * way SVG reads the absolute commands these paths are written in: M, L, H, V, Q, C and Z. (`H` and
 * `V` carry one number each, so pairing the numbers blindly would invent points.)
 */
function pathPoints(d: string): [number, number][] {
  const tokens = d.match(/[MLHVQCZ]|-?\d*\.?\d+/g) ?? [];
  const out: [number, number][] = [];
  const takes: Record<string, number> = { M: 1, L: 1, Q: 2, C: 3 };
  let cmd = 'M';
  let [x, y] = [0, 0];
  for (let i = 0; i < tokens.length;) {
    const tk = tokens[i] ?? '';
    if (/^[A-Z]$/.test(tk)) {
      cmd = tk;
      i += 1;
      continue;
    }
    const n = (k: number) => Number(tokens[i + k]);
    if (cmd === 'H') [x, i] = [n(0), i + 1];
    else if (cmd === 'V') [y, i] = [n(0), i + 1];
    else {
      for (let k = 0; k < (takes[cmd] ?? 1); k += 1) {
        [x, y] = [n(2 * k), n(2 * k + 1)];
        out.push([x, y]);
      }
      i += 2 * (takes[cmd] ?? 1);
      continue;
    }
    out.push([x, y]);
  }
  return out;
}
/**
 * The diaper's outline in the knob's box: its paths' anchors and control points. A curve never
 * leaves the hull of its points, so a hull inside the pill is a drawing inside the pill.
 */
const OUTLINE: readonly [number, number][] = [
  ...pathPoints(DIAPER.body),
  ...DIAPER.tabs.flatMap(pathPoints),
];

/** The diaper placed: its box at `x`, `y`, leaned `deg` and squashed about its foot. */
function placed(
  x: number,
  y: number,
  deg: number,
  sx: number,
  sy: number,
): readonly [number, number][] {
  const a = (deg * Math.PI) / 180;
  const [c, s] = [Math.cos(a), Math.sin(a)];
  const { x: fx, y: fy } = DIAPER.foot;
  return OUTLINE.map(([px, py]) => {
    const [dx, dy] = [(px - fx) * sx, (py - fy) * sy];
    return [x + fx + dx * c - dy * s, y + fy + dx * s + dy * c] as [number, number];
  });
}

describe('the size of it', () => {
  it('is a pill shorter than the bottle’s, cut into four targets over 44 both ways', () => {
    for (const width of WIDTHS)
      for (const scale of SCALES) {
        const g = geo(width, scale);
        expect(g.height).toBe(48);
        expect(g.knob).toBe(g.height - 2 * g.inset);
        for (const s of DIAPER_STOPS)
          expect(spanWidth(g.zone[s]), `${width} ${scale} ${s}`).toBeGreaterThanOrEqual(44);
        expect(g.height).toBeGreaterThanOrEqual(44);
      }
  });

  it('tiles the pill with its targets, in order, each holding its own diaper and word', () => {
    for (const width of WIDTHS)
      for (const scale of SCALES) {
        const g = geo(width, scale);
        expect(g.zone[0].left).toBe(0);
        expect(g.zone[3].right).toBe(g.width);
        for (const s of [0, 1, 2] as const)
          expect(g.zone[s].right).toBe(g.zone[(s + 1) as DiaperStop].left);
        for (const s of DIAPER_STOPS) {
          // a tap where the diaper stands, or on its word, chooses that answer
          expect(g.rest[s]).toBeGreaterThanOrEqual(g.zone[s].left);
          expect(g.word[s].right).toBeLessThanOrEqual(g.zone[s].right + 1e-9);
        }
      }
  });

  it('takes the room it is given, whole phones included, and stops past any phone', () => {
    expect(geo(324).width).toBe(324);
    expect(geo(339).width).toBe(339);
    expect(geo(394).width).toBe(394);
    expect(geo(900).width).toBe(DIAPER_TOGGLE_SIZE.maxWidth);
    // a first frame that measured nothing still draws four targets of 44 beside their slots
    expect(geo(0).width).toBe(4 * (DIAPER_SLOT + DIAPER_GAP.word + 44));
  });

  it('stands the diapers evenly along the pill at the phone’s own text size', () => {
    for (const width of WIDTHS) {
      const g = geo(width);
      const gaps = [0, 1, 2].map(
        s => g.rest[(s + 1) as DiaperStop] - g.word[s as DiaperStop].right,
      );
      for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0] ?? 0, 9);
      expect(gaps[0]).toBeGreaterThanOrEqual(DIAPER_GAP.unit - 1e-9);
      // and the last word ends where the pill's end room begins
      expect(g.word[3].right).toBeCloseTo(g.width - DIAPER_GAP.end, 9);
      expect(g.rest[0]).toBe(g.inset);
    }
  });
});

describe('the four words fit, at every width a phone gives', () => {
  /**
   * FOUR WORDS AND FOUR DIAPERS SHARE ONE PILL, and on the proof's narrowest bodies — 308 to 312 pt,
   * a window narrower than any phone the app supports — they leave the words 1.27× at the least,
   * not 1.3. Past its cap a word's Text shrinks to fit, whole and on one line (`PICTURE_WORD.shrink`),
   * so nothing is ever cut off there; it only reaches the chrome cap a step sooner. Every phone's
   * body is wider: 1.40× on a 360 dp Android (324 pt), 1.52× on a 375 pt iPhone (339), and the full
   * 1.6× from 349 pt up.
   */
  it('grows with the phone’s text to at least 1.3× on every phone, 1.27× below, and never past 1.6', () => {
    for (const width of WIDTHS) {
      const cap = geo(width).cap;
      const floor = width >= 312.5 ? PICTURE_WORD.floor : 1.26;
      expect(cap, `at ${width}`).toBeGreaterThanOrEqual(floor);
      expect(cap).toBeLessThanOrEqual(PICTURE_WORD.ceiling);
    }
    expect(geo(324).cap).toBeGreaterThan(1.39);
    expect(geo(339).cap).toBeGreaterThan(1.52);
    expect(geo(349).cap).toBe(PICTURE_WORD.ceiling);
  });

  it('reads its own paths the way SVG does (the placement tests stand on it)', () => {
    expect(pathPoints('M1 2H5V7Q8 9 10 11C1 2 3 4 5 6Z')).toEqual([
      [1, 2],
      [5, 2],
      [5, 7],
      [8, 9],
      [10, 11],
      [1, 2],
      [3, 4],
      [5, 6],
    ]);
    const xs = OUTLINE.map(p => p[0]);
    const ys = OUTLINE.map(p => p[1]);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([DIAPER.bounds.left, DIAPER.bounds.right]);
    expect([Math.min(...ys), Math.max(...ys)]).toEqual([DIAPER.bounds.top, DIAPER.bounds.bottom]);
  });

  it('lays each word out at the size it is drawn, and never lets it touch a diaper or the rim', () => {
    for (const width of WIDTHS)
      for (const scale of SCALES) {
        const g = geo(width, scale);
        const drawn = Math.min(scale, g.cap);
        expect(g.scale).toBeCloseTo(drawn, 9);
        for (const s of DIAPER_STOPS) {
          // room for the word at the size the Text is allowed to draw it
          expect(spanWidth(g.word[s])).toBeCloseTo(diaperWordWidth(WORDS[s], drawn), 9);
          // clear of its own slot by the gap, and of the next stop's slot by at least the least gap
          expect(g.word[s].left).toBeCloseTo(g.rest[s] + DIAPER_SLOT + DIAPER_GAP.word, 9);
          if (s < 3)
            expect(g.rest[(s + 1) as DiaperStop] - g.word[s].right).toBeGreaterThanOrEqual(
              DIAPER_GAP.unit - 1e-9,
            );
        }
        // the last word's line, at its tallest, clears the rim where it reaches into the round end
        const line = typeScale.bodySm.lineHeight * drawn;
        const right = g.word[3].right;
        for (const y of [g.height / 2 - line / 2, g.height / 2 + line / 2])
          expect(insidePill(g, right, y, g.rim), `${width} ${scale}`).toBe(true);
      }
  });

  it('bounds a word by characters, and reports a word too long for the pill at 1 — never below', () => {
    expect(diaperWordWidth('Dirty')).toBeCloseTo(5 * DIAPER_WORD.advance * PICTURE_WORD.size, 9);
    // the bound holds for the widest of the four in the bold face (the TTF's 1.830 em for "Wet")
    expect(diaperWordWidth('Wet')).toBeGreaterThan(1.83 * PICTURE_WORD.size);
    const g = diaperToggleGeometry(324, ['Wet', 'A very long answer indeed here', 'Both', 'Dry']);
    expect(g.cap).toBe(1);
    // and the pill still holds it: the Text shrinks into the room it was given
    expect(g.word[3].right).toBeLessThanOrEqual(g.width - DIAPER_GAP.end + 1e-9);
    for (const s of DIAPER_STOPS) expect(spanWidth(g.zone[s])).toBeGreaterThanOrEqual(44);
  });
});

describe('the diaper', () => {
  const margin = (g: DiaperToggleGeometry) => g.rim + DIAPER.stroke / 2;

  it('fits its slot, and stands inside the pill at every stop, at every width', () => {
    for (const [x, y] of OUTLINE) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(DIAPER_SLOT);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(40);
    }
    // centered on the pill's middle
    expect(DIAPER.center.y + DIAPER_TOGGLE_SIZE.inset).toBe(DIAPER_TOGGLE_SIZE.height / 2);
    for (const width of WIDTHS) {
      const g = geo(width);
      for (const s of DIAPER_STOPS)
        for (const [x, y] of placed(g.rest[s], g.inset, 0, 1, 1))
          expect(insidePill(g, x, y, margin(g)), `${width} ${s}: (${x}, ${y})`).toBe(true);
    }
  });

  it('stays inside the pill through every point of every hop, crouch, lean and landing', () => {
    const bf = diaperBodyFrames();
    const out: string[] = [];
    let air = 0;
    for (const width of [308, 324, 339, 394, 440])
      for (const scale of [1, 1.6]) {
        const g = geo(width, scale);
        const tf = diaperTrackFrames(g);
        for (const from of DIAPER_STOPS)
          for (const to of DIAPER_STOPS) {
            if (from === to) continue;
            const dir = to > from ? 1 : -1;
            for (const t of STEPS) {
              const pos = from + (to - from) * diaperEase(t);
              const sway = t >= 1 ? 0 : dir * t;
              const y = g.inset + sample(tf.hopY, pos);
              if (y < g.inset - 1) air += 1;
              for (const [px, py] of placed(
                g.rest[0] + sample(tf.knobX, pos),
                y,
                sample(bf.lean, sway),
                sample(bf.squashX, sway),
                sample(bf.squashY, sway),
              ))
                if (!insidePill(g, px, py, margin(g))) out.push(`${width} ${from}→${to} t ${t}`);
            }
          }
      }
    expect(out.slice(0, 3)).toEqual([]);
    // not vacuous: it does leave the ground
    expect(air).toBeGreaterThan(1000);
  });

  it('draws its ghost smaller, about its own middle, inside the same slot', () => {
    const { x: cx, y: cy } = DIAPER.center;
    for (const [x, y] of OUTLINE) {
      const gx = cx + (x - cx) * DIAPER_GHOST_SCALE;
      const gy = cy + (y - cy) * DIAPER_GHOST_SCALE;
      expect(gx).toBeGreaterThan(0);
      expect(gx).toBeLessThan(DIAPER_SLOT);
      expect(gy).toBeGreaterThan(DIAPER.bounds.top - 1);
    }
  });
});

describe('the move', () => {
  it('takes about half a second for one hop, a little longer for more, and never longer than three', () => {
    expect(diaperMoveMs(1)).toBe(DIAPER_MS.base + DIAPER_MS.perStop);
    expect(diaperMoveMs(1)).toBeLessThanOrEqual(520);
    expect(diaperMoveMs(3)).toBeLessThanOrEqual(800);
    expect(diaperMoveMs(2)).toBeGreaterThan(diaperMoveMs(1));
    expect(diaperMoveMs(7)).toBe(diaperMoveMs(3));
    expect(diaperMoveMs(0)).toBe(DIAPER_MS.base);
  });

  it('crouches where it is, flies at one speed, and holds where it landed', () => {
    for (const x of STEPS) {
      const e = diaperEase(x);
      if (x <= DIAPER_HOLD) expect(e).toBe(0);
      else if (x >= DIAPER_LANDS) expect(e).toBe(1);
      else expect(e).toBeCloseTo((x - DIAPER_HOLD) / (DIAPER_LANDS - DIAPER_HOLD), 9);
    }
    expect(DIAPER_LANDS).toBe(1 - DIAPER_HOLD);
  });

  it('sets off from its stop at rest, the sway signed by the way it goes', () => {
    expect(planDiaperMove(null, 0, 3, 1000, false)).toEqual({
      animate: true,
      from: 0,
      to: 3,
      duration: diaperMoveMs(3),
      sway: 1,
    });
    expect(planDiaperMove(null, 2, 1, 1000, false)).toMatchObject({ from: 2, to: 1, sway: -1 });
    // a plan to where it already rests does nothing
    expect(planDiaperMove(null, 1, 1, 1000, false).animate).toBe(false);
  });

  it('turns round mid-hop from where the clock says it is, without a jump', () => {
    const start = 1000;
    const out = planDiaperMove(null, 0, 3, start, false);
    const m = { from: out.from, to: 3 as const, startedAt: start, duration: out.duration };
    for (const frac of [0.05, 0.3, 0.5, 0.8]) {
      const now = start + frac * out.duration;
      const back = planDiaperMove(m, 3, 0, now, false);
      const at = diaperKnobAt(m, now);
      expect(back.from).toBeCloseTo(at, 9);
      expect(back.sway).toBe(at > 0 ? -1 : 0);
      if (at > 0) expect(back.duration).toBe(diaperMoveMs(at));
    }
    // a move that has finished is rest again
    expect(planDiaperMove(m, 3, 0, start + out.duration + 1, false).from).toBe(3);
  });

  it('under reduce motion and in the amber Night, sets the stop: no animation, no sway, no time', () => {
    for (const at of DIAPER_STOPS)
      for (const to of DIAPER_STOPS)
        expect(planDiaperMove(null, at, to, 0, true)).toEqual({
          animate: false,
          from: to,
          to,
          duration: 0,
          sway: 0,
        });
    const m = { from: 0, to: 3 as const, startedAt: 0, duration: 770 };
    expect(planDiaperMove(m, 3, 1, 300, true)).toMatchObject({ animate: false, from: 1, to: 1 });
  });

  it('finds an answer’s stop by its place among the options', () => {
    const options = KINDS.map(value => ({ value }));
    KINDS.forEach((k, i) => expect(diaperStopOf(options, k)).toBe(i));
    expect(diaperStopOf([...options].reverse(), 'WET')).toBe(3);
  });
});

describe('the track’s frames', () => {
  const g = geo(324);
  const tf = diaperTrackFrames(g);

  it('are frames Animated can read: in order, one output per input, and clamped', () => {
    const bf = diaperBodyFrames();
    const pf = diaperPictureFrames();
    const every: [string, Frame][] = [
      ['knobX', tf.knobX],
      ['hopY', tf.hopY],
      ...DIAPER_STOPS.map((s): [string, Frame] => [`ghost ${s}`, tf.ghost[s]]),
      ['lean', bf.lean],
      ['squashX', bf.squashX],
      ['squashY', bf.squashY],
      ['quiet', WORD_QUIET],
      ['stripe', pf.stripe],
      ...pf.whiffs.flatMap((w, i): [string, Frame][] => [
        [`whiff ${i} y`, w.y],
        [`whiff ${i} x`, w.x],
        [`whiff ${i} opacity`, w.opacity],
      ]),
      ...pf.drops.flatMap((d, i): [string, Frame][] => [
        [`drop ${i} y`, d.y],
        [`drop ${i} opacity`, d.opacity],
        [`drop ${i} scale`, d.scale],
      ]),
      ['wisp y', pf.wisp.y],
      ['wisp x', pf.wisp.x],
      ['wisp opacity', pf.wisp.opacity],
      ...pf.sparkles.flatMap((sp, i): [string, Frame][] => [
        [`sparkle ${i} scale`, sp.scale],
        [`sparkle ${i} opacity`, sp.opacity],
        [`sparkle ${i} rotate`, sp.rotate],
      ]),
    ];
    for (const [name, fr] of every) {
      expect(fr.inputRange.length, name).toBe(fr.outputRange.length);
      expect(fr.inputRange.length, name).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < fr.inputRange.length; i += 1)
        expect(fr.inputRange[i] ?? 0, name).toBeGreaterThan(fr.inputRange[i - 1] ?? 0);
      expect(fr.extrapolate, name).toBe('clamp');
      for (const v of fr.outputRange) expect(Number.isFinite(v), name).toBe(true);
    }
  });

  it('carries the knob from slot to slot, and no further', () => {
    for (const s of DIAPER_STOPS) expect(sample(tf.knobX, s)).toBeCloseTo(g.rest[s] - g.rest[0], 9);
    expect(sample(tf.knobX, 3.4)).toBeCloseTo(g.rest[3] - g.rest[0], 9);
  });

  it('hops between every two stops and touches down at each one', () => {
    for (const s of DIAPER_STOPS) expect(sample(tf.hopY, s)).toBe(0);
    for (const k of [0, 1, 2]) expect(sample(tf.hopY, k + 0.5)).toBeCloseTo(-HOP, 9);
    for (const p of STEPS.map(x => 3 * x)) {
      expect(sample(tf.hopY, p)).toBeLessThanOrEqual(0);
      expect(sample(tf.hopY, p)).toBeGreaterThanOrEqual(-HOP);
    }
  });

  it('never draws a ghost where the knob is: gone before it arrives, back once it has left', () => {
    const seen: string[] = [];
    let overlapped = 0;
    for (const width of [308, 324, 339, 394, 440])
      for (const scale of [1, 1.6]) {
        const gg = geo(width, scale);
        const ff = diaperTrackFrames(gg);
        for (const p of Array.from({ length: 1201 }, (_, i) => (3 * i) / 1200)) {
          const left = gg.rest[0] + sample(ff.knobX, p);
          for (const s of DIAPER_STOPS) {
            if (!(left < gg.rest[s] + gg.slot && left + gg.slot > gg.rest[s])) continue;
            overlapped += 1;
            if (sample(ff.ghost[s], p) !== 0) seen.push(`${width} ${p} ${s}`);
          }
        }
        // at rest, the chosen stop shows no ghost and every other stop shows its own
        for (const at of DIAPER_STOPS)
          for (const s of DIAPER_STOPS) expect(sample(ff.ghost[s], at)).toBe(s === at ? 0 : 1);
      }
    expect(overlapped).toBeGreaterThan(1000);
    expect(seen.slice(0, 3)).toEqual([]);
  });

  it('writes one word whole at every moment: its two inks add to one', () => {
    for (const v of STEPS) expect(v + sample(WORD_QUIET, v)).toBeCloseTo(1, 9);
    expect(sample(WORD_QUIET, 1)).toBe(0);
    expect(sample(WORD_QUIET, 0)).toBe(1);
  });
});

describe('the body language', () => {
  const bf = diaperBodyFrames();

  it('draws rest at rest and at the end of either move, where `sway` is set back from', () => {
    for (const s of [-1, 0, 1]) {
      expect(sample(bf.lean, s)).toBe(0);
      expect(sample(bf.squashX, s)).toBe(1);
      expect(sample(bf.squashY, s)).toBe(1);
    }
  });

  it('leans into the jump either way, mirrored, and squashes the same both ways', () => {
    for (const s of STEPS) {
      expect(sample(bf.lean, -s)).toBeCloseTo(-sample(bf.lean, s), 9);
      expect(sample(bf.squashX, -s)).toBeCloseTo(sample(bf.squashX, s), 9);
      expect(sample(bf.squashY, -s)).toBeCloseTo(sample(bf.squashY, s), 9);
      expect(Math.abs(sample(bf.lean, s))).toBeLessThanOrEqual(DIAPER_LEAN + 1e-9);
    }
    // to the right, it tips to the right as it takes off
    expect(sample(bf.lean, DIAPER_HOLD + 0.04)).toBeCloseTo(DIAPER_LEAN, 9);
  });

  it('crouches before it leaves the ground and squashes after it lands, never in the air', () => {
    const lowest = (from: number, to: number) =>
      Math.min(...STEPS.filter(x => x >= from && x <= to).map(x => sample(bf.squashY, x)));
    // the crouch, while the knob has not moved yet
    expect(lowest(0, DIAPER_HOLD)).toBeLessThan(0.9);
    // the landing, once it is down
    expect(lowest(DIAPER_LANDS, 1)).toBeLessThan(0.9);
    // and between them it is stretched, not squashed: a thing in the air is not squashed
    expect(lowest(DIAPER_HOLD + 0.1, DIAPER_LANDS - 0.1)).toBeGreaterThanOrEqual(1);
  });
});

describe('what each answer looks like at rest', () => {
  it('reads the kinds as core does: wet is Wet and Both, dirty is Dirty and Both', () => {
    expect(KINDS.map(diaperLook)).toEqual([
      { wet: true, dirty: false },
      { wet: false, dirty: true },
      { wet: true, dirty: true },
      { wet: false, dirty: false },
    ]);
  });

  it('fills the stripe from the bottom as it goes blue, and drains it the same way', () => {
    const pf = diaperPictureFrames();
    expect(sample(pf.stripe, 0)).toBe(DIAPER.stripe.height);
    expect(sample(pf.stripe, 1)).toBe(0);
    let last = Number.POSITIVE_INFINITY;
    for (const v of STEPS) {
      expect(sample(pf.stripe, v)).toBeLessThanOrEqual(last);
      last = sample(pf.stripe, v);
    }
  });

  it('stands the whiffs over a dirty diaper, and has them in the waistband, unseen, over a clean one', () => {
    const pf = diaperPictureFrames();
    for (const w of pf.whiffs) {
      expect(sample(w.opacity, 1)).toBe(1);
      expect(sample(w.y, 1)).toBe(0);
      expect(sample(w.x, 1)).toBe(0);
      expect(sample(w.opacity, 0)).toBe(0);
      expect(sample(w.y, 0)).toBe(WHIFF_RISE);
    }
    // a whiff risen from inside the waistband starts under the diaper's top edge
    for (const w of WHIFFS) expect(w.bottom + WHIFF_RISE).toBeGreaterThan(DIAPER.bounds.top);
  });

  it('keeps the whiffs, the wisp, the droplets and the sparkle in the diaper’s own slot: never over a word', () => {
    const tilt = (h: number, deg: number) => Math.abs(h * Math.sin((deg * Math.PI) / 180));
    for (const w of WHIFFS) {
      const reach = WHIFF_BOX / 2 + tilt(w.bottom - w.top, w.tilt) + WHIFF_STROKE / 2 + 1.2;
      expect(w.x - reach).toBeGreaterThan(0);
      expect(w.x + reach).toBeLessThan(DIAPER_SLOT);
    }
    expect(WISP.x - WHIFF_BOX / 2 - 1.4).toBeGreaterThan(0);
    expect(WISP.x + WHIFF_BOX / 2 + 1.4).toBeLessThan(DIAPER_SLOT);
    for (const d of DROPS) {
      expect(d.x - DROP.width / 2).toBeGreaterThan(0);
      expect(d.x + DROP.width / 2).toBeLessThan(DIAPER_SLOT);
    }
    for (const sp of SPARKLES) {
      // at its largest, the sparkle's points reach half its size times the swell from its middle
      const r = (sp.size / 2) * 1.15;
      expect(sp.x - r).toBeGreaterThan(0);
      expect(sp.x + r).toBeLessThan(DIAPER_SLOT);
      expect(sp.y + r).toBeLessThan(DIAPER.bounds.top);
    }
  });

  it('draws a whiff inside its own box, round ends and all, from its foot up to its tip', () => {
    const pad = WHIFF_STROKE / 2;
    for (const h of [...WHIFFS.map(w => w.bottom - w.top), WISP.bottom - WISP.top]) {
      const pts = pathPoints(whiffPath(h));
      for (const [x, y] of pts) {
        expect(x - pad).toBeGreaterThanOrEqual(0);
        expect(x + pad).toBeLessThanOrEqual(WHIFF_BOX);
        expect(y - pad).toBeGreaterThanOrEqual(-1e-9);
        expect(y + pad).toBeLessThanOrEqual(h + 1e-9);
      }
      expect(pts[0]).toEqual([WHIFF_BOX / 2, h - pad]);
      expect(pts.at(-1)).toEqual([WHIFF_BOX / 2, pad]);
    }
  });

  it('keeps the whiffs over a dirty diaper inside the pill, even at its round left end', () => {
    for (const width of WIDTHS) {
      const g = geo(width);
      for (const s of DIAPER_STOPS)
        for (const w of WHIFFS) {
          const h = w.bottom - w.top;
          const a = (w.tilt * Math.PI) / 180;
          // the wave's ends and its widest points, leaned about its foot
          for (const [dx, dy] of [
            [0, 0],
            [-1.5, h / 4],
            [1.5, (3 * h) / 4],
            [0, h],
          ] as const) {
            const [ux, uy] = [dx, dy - h];
            const x = g.rest[s] + w.x + ux * Math.cos(a) - uy * Math.sin(a);
            const y = g.inset + w.bottom + ux * Math.sin(a) + uy * Math.cos(a);
            expect(insidePill(g, x, y, g.rim + WHIFF_STROKE / 2), `${width} ${s}`).toBe(true);
          }
        }
    }
  });
});

describe('what a change plays, once', () => {
  const ms = DIAPER_PICTURE_MS;
  const move = diaperMoveMs(1);
  const land = Math.round(move * DIAPER_LANDS);
  const takeoff = Math.round(move * DIAPER_HOLD);
  const look = (k: DiaperKind) => diaperLook(k);
  const plan = (to: DiaperKind) => planDiaperPicture(to, true, move, false);
  const drain = { to: 0, delay: takeoff, duration: Math.round(move * ms.drain) };
  const leave = { to: 0, delay: 0, duration: ms.leave };

  it('to Wet: two droplets fall in as it lands, and the stripe fills as the first goes in', () => {
    const p = plan('WET');
    expect(p.drops).toBe(land - ms.dropLead);
    const firstIn = (p.drops ?? 0) + Math.round(ms.drops * DROP_SPAN);
    expect(p.wet).toEqual({ to: 1, delay: firstIn, duration: ms.fill });
    expect(p.dirty).toEqual(leave);
    expect(p.wisp).toBeNull();
    expect(p.twinkle).toBeNull();
  });

  it('to Dirty: the whiffs rise as it lands and the wisp after them; the stripe goes yellow', () => {
    const p = plan('DIRTY');
    expect(p.dirty).toEqual({ to: 1, delay: land, duration: ms.whiffs });
    expect(p.wisp).toBe(land + ms.wispAfterWhiffs);
    expect(p.wet).toEqual(drain);
    expect(p.drops).toBeNull();
    expect(p.twinkle).toBeNull();
  });

  it('to Both: the droplets and the stripe first, then the whiffs and the wisp', () => {
    const p = plan('BOTH');
    const firstIn = (p.drops ?? 0) + Math.round(ms.drops * DROP_SPAN);
    expect(p.wet).toEqual({ to: 1, delay: firstIn, duration: ms.fill });
    expect(p.dirty).toEqual({ to: 1, delay: firstIn + ms.whiffAfterDrop, duration: ms.whiffs });
    expect(p.wisp).toBe(firstIn + ms.whiffAfterDrop + ms.wispAfterWhiffs);
    expect(p.twinkle).toBeNull();
  });

  it('to Dry: the stripe drains as it takes off, the whiffs go, and a sparkle twinkles as it lands', () => {
    const p = plan('DRY');
    expect(p.wet).toEqual(drain);
    expect(p.dirty).toEqual(leave);
    expect(p.twinkle).toBe(land - ms.twinkleLead);
    expect(p.drops).toBeNull();
    expect(p.wisp).toBeNull();
  });

  /**
   * THE STRIPE AND THE WHIFFS ALWAYS FINISH AT THE ANSWER'S LOOK. They are run there on every change,
   * from wherever a tap before found them: a run to where a value already is moves nothing (Wet to
   * Both leaves a blue stripe blue), and a change made before the last one had finished — Dry, Wet,
   * then Both before the first droplet went in — still ends with the stripe blue. Played out here
   * as a parent's quick taps, the values carried across each interruption.
   */
  it('always finishes the stripe and the whiffs at the answer’s look, however quick the taps', () => {
    type State = { wet: number; dirty: number };
    type Run = { to: number; delay: number; duration: number };
    const at = (from: number, r: Run, t: number): number =>
      t <= r.delay
        ? from
        : t >= r.delay + r.duration
          ? r.to
          : from + ((r.to - from) * (t - r.delay)) / r.duration;
    const gaps = [0, 40, 150, 300, 450, 700, 1200];
    let sequences = 0;
    for (const a of KINDS)
      for (const b of KINDS)
        for (const c of KINDS) {
          if (a === b || b === c) continue;
          for (const gap of gaps) {
            // resting on a, then b, then c `gap` ms later: what c's plan leaves in the end
            let state: State = { wet: look(a).wet ? 1 : 0, dirty: look(a).dirty ? 1 : 0 };
            const first = plan(b);
            state = {
              wet: at(state.wet, first.wet!, gap),
              dirty: at(state.dirty, first.dirty!, gap),
            };
            const last = plan(c);
            state = {
              wet: at(state.wet, last.wet!, 5000),
              dirty: at(state.dirty, last.dirty!, 5000),
            };
            expect(state, `${a}→${b}→${c} after ${gap} ms`).toEqual(last.end);
            sequences += 1;
          }
        }
    expect(sequences).toBeGreaterThan(200);
    // a run to where the value already is moves nothing: Wet to Both keeps the stripe blue
    expect(plan('BOTH').wet?.to).toBe(1);
    // and between two answers that share a part, the chosen answer's own moment still plays
    expect(plan('BOTH').drops).not.toBeNull();
    expect(plan('DIRTY').wisp).not.toBeNull();
  });

  it('plays each answer’s moment only as the diaper lands, and is all over in two seconds', () => {
    for (const to of KINDS)
      for (const distance of [0.3, 1, 2, 3]) {
        const m = diaperMoveMs(distance);
        const down = Math.round(m * DIAPER_LANDS);
        const p = planDiaperPicture(to, true, m, false);
        expect(p.animate).toBe(true);
        if (p.drops !== null) expect(p.drops).toBe(down - ms.dropLead);
        if (p.twinkle !== null) expect(p.twinkle).toBeGreaterThanOrEqual(down - ms.twinkleLead);
        if (p.wet?.to === 1) expect(p.wet.delay).toBeGreaterThan(down);
        if (p.dirty?.to === 1) expect(p.dirty.delay).toBeGreaterThanOrEqual(down);
        if (p.wisp !== null) expect(p.wisp).toBeGreaterThan(down);
        const ends = [
          p.drops === null ? 0 : p.drops + ms.drops,
          p.wisp === null ? 0 : p.wisp + ms.wisp,
          p.twinkle === null ? 0 : p.twinkle + ms.twinkle,
          p.wet === null ? 0 : p.wet.delay + p.wet.duration,
          p.dirty === null ? 0 : p.dirty.delay + p.dirty.duration,
        ];
        expect(Math.max(...ends), `${to} over ${distance}`).toBeLessThanOrEqual(2000);
        // and it runs to the answer's own look
        expect(p.end).toEqual({ wet: look(to).wet ? 1 : 0, dirty: look(to).dirty ? 1 : 0 });
        expect([p.wet?.to, p.dirty?.to]).toEqual([p.end.wet, p.end.dirty]);
      }
  });

  it('plays nothing when nothing changed: a sheet that opens on an answer shows it at rest', () => {
    for (const k of KINDS) {
      const p = planDiaperPicture(k, false, move, false);
      expect(p).toMatchObject({ animate: false, wet: null, dirty: null, drops: null });
      expect(p.wisp).toBeNull();
      expect(p.twinkle).toBeNull();
    }
  });

  it('under reduce motion and in the amber Night, sets the answer’s look and plays nothing', () => {
    for (const changed of [true, false])
      for (const to of KINDS) {
        const p = planDiaperPicture(to, changed, move, true);
        expect(p.animate).toBe(false);
        expect([p.wet, p.dirty, p.drops, p.wisp, p.twinkle]).toEqual([
          null,
          null,
          null,
          null,
          null,
        ]);
        expect(p.end).toEqual({ wet: look(to).wet ? 1 : 0, dirty: look(to).dirty ? 1 : 0 });
      }
  });
});

describe('the moments’ frames: seen once, gone at rest', () => {
  const pf = diaperPictureFrames();

  it('draws no droplet before its turn or after it has gone in — the clock’s rest draws none', () => {
    for (const [i, d] of pf.drops.entries()) {
      expect(sample(d.opacity, 0), `drop ${i}`).toBe(0);
      expect(sample(d.opacity, 1), `drop ${i}`).toBe(0);
      expect(Math.max(...STEPS.map(s => sample(d.opacity, s)))).toBe(1);
      // it falls, and only falls, from over the pill's edge to the waistband
      const from = DROPS[i]!;
      let last = Number.NEGATIVE_INFINITY;
      for (const s of STEPS) {
        const y = sample(d.y, s);
        expect(y).toBeGreaterThanOrEqual(last - 1e-9);
        last = y;
      }
      expect(from.from + sample(d.y, 1) + DROP.height).toBeCloseTo(DIAPER.bounds.top, 9);
      expect(from.at + DROP_SPAN).toBeLessThanOrEqual(1);
    }
    // one after the other
    expect(DROPS[1]!.at).toBeGreaterThan(DROPS[0]!.at);
  });

  it('sends the wisp up and out of the top of the pill, fading, and none at rest', () => {
    expect(sample(pf.wisp.opacity, 0)).toBe(0);
    expect(sample(pf.wisp.opacity, 1)).toBe(0);
    expect(Math.max(...STEPS.map(s => sample(pf.wisp.opacity, s)))).toBe(1);
    // its lowest point at the end is over the pill's top edge
    expect(DIAPER_TOGGLE_SIZE.inset + WISP.bottom + sample(pf.wisp.y, 1)).toBeLessThan(0);
    // it starts at the waistband, behind the diaper, and only rises
    expect(WISP.bottom).toBeLessThanOrEqual(DIAPER.bounds.top);
  });

  it('twinkles each sparkle once, out of nothing and back to nothing', () => {
    for (const [i, sp] of pf.sparkles.entries()) {
      for (const v of [0, 1]) {
        expect(sample(sp.opacity, v), `sparkle ${i}`).toBe(0);
        expect(sample(sp.scale, v), `sparkle ${i}`).toBe(0);
      }
      const peak = Math.max(...STEPS.map(s => sample(sp.scale, s)));
      expect(peak).toBeGreaterThan(1);
      expect(peak).toBeLessThanOrEqual(1.15 + 1e-9);
    }
  });
});

describe('the component (tripwires over DiaperToggle.tsx)', () => {
  it('is the segmented control to a screen reader: a named group of four radios, in order', () => {
    expect(flat).toContain('accessibilityRole="radiogroup"');
    expect(flat).toContain('accessibilityLabel={label}');
    expect(flat).toContain('accessibilityRole="radio"');
    // the word, or a fuller name where the word alone would not do ("Both, wet and dirty")
    expect(flat).toContain('accessibilityLabel={o.accessibilityLabel ?? o.label}');
    expect(flat).toContain('accessibilityState={{ checked: on, selected: on, disabled }}');
    expect(component.split('<Pressable')).toHaveLength(2);
    expect(flat).toContain('DIAPER_STOPS.map(s => { const o = options[s]; const on = s === stop;');
  });

  it('keeps the segmented control’s ids: `${testID}` for the group, `${testID}.${value}` for each', () => {
    expect(flat).toContain('{...(testID ? { testID } : {})}');
    expect(flat).toContain('testID: `${testID}.${o.value}`');
  });

  it('is felt by the segmented control’s own rule: a tap on another answer, nothing on the chosen', () => {
    expect(flat).toContain(
      "onPress={() => { feelChoice({ locked: false, current: on, kind: 'tap' }); if (!on) onChange(o.value); }}",
    );
    expect(component.split('feelChoice(')).toHaveLength(2);
    expect(component).not.toContain('haptic(');
  });

  it('gives each answer its own stretch of the pill as its target, the pill’s full height', () => {
    expect(flat).toContain(
      'style={[styles.zone, { left: g.zone[s].left, width: spanWidth(g.zone[s]) }]}',
    );
    expect(flat).toContain("zone: { position: 'absolute', top: 0, bottom: 0 }");
  });

  it('hides the picture from touch and from assistive technology', () => {
    expect(flat).toMatch(
      /pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden/,
    );
  });

  it('lays itself out for the phone’s own text size, and caps the words where their room runs out', () => {
    expect(flat).toContain('diaperToggleGeometry(width, [w0, w1, w2, w3], win.fontScale)');
    expect(flat).toContain('maxFontSizeMultiplier={g.cap}');
    expect(flat).toContain('numberOfLines={1}');
    expect(flat).toContain('adjustsFontSizeToFit');
    expect(flat).toContain('minimumFontScale={PICTURE_WORD.shrink}');
    expect(flat).toContain("variant={bold ? 'bodyStrong' : 'bodySm'}");
  });

  it('starts every value at rest, and every moment’s clock already over', () => {
    expect(flat).toContain('const pos = useRef(new Animated.Value(stop)).current;');
    expect(flat).toContain('const wet = useRef(new Animated.Value(look.wet ? 1 : 0)).current;');
    expect(flat).toContain('const dirty = useRef(new Animated.Value(look.dirty ? 1 : 0)).current;');
    for (const clock of ['drops', 'wisp', 'twinkle'])
      expect(flat).toContain(`const ${clock} = useRef(new Animated.Value(1)).current;`);
  });

  it('holds still under reduce motion and in the amber Night, set to the end, every moment over', () => {
    // the phone's Reduce Motion and Night hold it still; the app's Calm motion slows it instead
    // (the owner, 2026-10-06)
    expect(flat).toContain('const still = pictureStill(t.reduceMotion && !t.calmMotion, t.theme);');
    expect(flat).toContain('const pace = t.calmMotion ? CALM_PACE : 1;');
    expect(flat).toContain('duration: planned.duration * pace');
    expect(flat).toMatch(
      /if \(!p\.animate\) \{ pos\.setValue\(p\.to\); sway\.setValue\(0\); words\.forEach\(\(v, s\) => v\.setValue\(s === p\.to \? 1 : 0\)\);/,
    );
    expect(flat).toContain(
      'wet.setValue(p.end.wet); dirty.setValue(p.end.dirty); drops.setValue(1); wisp.setValue(1); twinkle.setValue(1);',
    );
    expect(flat).toContain('[pos, sway, words, stop, still, pace]');
    expect(flat).toContain('[value, still, pace, wet, dirty, drops, wisp, twinkle]');
  });

  it('winds a moment back only to play it, once: nothing loops', () => {
    expect(component.split('.setValue(delay === null ? 1 : 0)')).toHaveLength(2);
    expect(component).not.toContain('Animated.loop');
    expect(component).not.toMatch(/repeat|iterations/);
    // the moment is the parent's: it plays on a change of `value`, which a pre-selection makes by
    // remounting this at rest, never by changing it here
    expect(flat).toContain('const changed = was.current !== value;');
  });

  it('runs every frame on the native driver: opacity and transforms only', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    const fed = [...flat.matchAll(/(\w+): (?:num|deg)\(/g)].map(m => m[1]);
    expect(fed.length).toBeGreaterThan(10);
    for (const prop of fed)
      expect(
        ['opacity', 'translateX', 'translateY', 'scale', 'scaleX', 'scaleY', 'rotate'],
        prop,
      ).toContain(prop);
    expect(flat).toContain('if (finished) sway.setValue(0);');
    expect(component.split('return () => run.stop();')).toHaveLength(3);
  });

  it('draws the answer’s moment at its own stop, behind the diaper; the whiffs ride the diaper', () => {
    const moment = component.indexOf('<View style={slotBox(g.rest[stop])}>');
    const knob = component.indexOf(
      '<Animated.View collapsable={false} style={[slotBox(g.rest[0]), anim.knob]}>',
    );
    expect(moment).toBeGreaterThan(-1);
    expect(knob).toBeGreaterThan(moment);
    // the whiffs are inside the knob, before its body
    const whiffs = component.indexOf('anim.whiffs[i]');
    const body = component.indexOf('anim.body]');
    expect(whiffs).toBeGreaterThan(knob);
    expect(body).toBeGreaterThan(whiffs);
    // the stripe clips its blue, so it fills from the bottom
    expect(flat).toContain("stripe: { position: 'absolute', overflow: 'hidden' }");
  });

  it('lights nothing where nothing may be lit: no sparkle without a sparkle color', () => {
    expect(flat).toContain('const sparkleInk = pic.sparkle;');
    expect(flat).toContain('{sparkleInk ? SPARKLES.map(');
  });

  it('clips the picture to the pill and draws the theme’s rim over it', () => {
    expect(flat).toContain("overflow: 'hidden'");
    const rim = component.indexOf('borderColor: t.color.line2');
    expect(rim).toBeGreaterThan(component.indexOf('anim.body]'));
  });

  it('asks for nothing Expo Go does not carry: React Native, react-native-svg, core and its own files', () => {
    const imports = [...component.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    for (const source of imports)
      expect(
        ['react', 'react-native', 'react-native-svg', '@nibblecue/core'].includes(source ?? '') ||
          /^\./.test(source ?? ''),
        source,
      ).toBe(true);
    expect(component).not.toContain('reanimated');
  });

  it('writes no color and no word, and nothing about the baby', () => {
    for (const src of [component, pure]) {
      expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
      expect(src).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
      expect(src).not.toMatch(/['"`](Wet|Dirty|Both|Dry|Wet \+ dirty|What was in it)['"`]/);
      expect(src).not.toMatch(/stool|poop|healthy|normal|well done|great job/i);
    }
  });

  it('is exported with the design system’s other controls, and its arithmetic without them', () => {
    expect(read('core.ts')).toContain("export * from './DiaperToggle';");
    expect(read('core.ts')).not.toContain("'./diaperToggle'");
    expect(read('../layout.ts')).toContain("from './components/diaperToggle';");
    expect(read('../index.ts')).toContain("export * from './theme/diaper';");
  });
});

/** The hop's views stay real on Android's new architecture (2026-10-06: it did not play at all). */
describe('the animated layers are never flattened', () => {
  it('marks every animated layer and the tiles container collapsable={false}', () => {
    const animated = component.split('<Animated.View').length - 1;
    expect(animated).toBeGreaterThan(0);
    expect(flat.split('<Animated.View collapsable={false}').length - 1).toBe(animated);
    expect(flat).toContain(
      '<View collapsable={false} style={[ tiles ? styles.open : styles.track,',
    );
  });
});
