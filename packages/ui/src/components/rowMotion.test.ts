/**
 * A LIST ROW ARRIVING, GLIDING AND SWEPT OFF, AND THE LINE DRAWN THROUGH ITS WORDS (the owner,
 * 2026-09-26: *"add animation in shopping list to make it more fun"*). The six moves, the pop's
 * spring, the sweep's stagger and the strike's two windows are PURE (`rowMotion.ts`) and sampled
 * here as `Animated.Value#interpolate` samples them; that `RowMotion` and `StrikeText` put the room
 * on the JavaScript driver and everything else on the native one, hide a row that is leaving, and
 * move nothing under reduce motion or in the amber Night is held by tripwires, since this suite has
 * no renderer (`interaction.test.ts`).
 *
 * THE PROMISES THAT MATTER MOST: every move is short — none past 450 ms — and ends exactly at rest
 * (an arrival whole, a departure shut); the rows under an arriving one are moved by its room
 * opening, never jumped; and the words a pen strikes through are all there, once, at every moment.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { Frame } from './dayNightSwitch';
import {
  AWAY_OFF,
  ENTER_RISE,
  ENTER_STAGGER_MS,
  ENTER_WHOLE_MS,
  enterStagger,
  enterWholeMs,
  GLIDE_SLIDE,
  isRowExit,
  LOOK_MS,
  LOOK_RISE,
  LOOK_STAGGER_MS,
  LOOK_WHOLE_MS,
  lookFrames,
  lookStagger,
  lookWholeMs,
  POP_FROM,
  POP_FULL_MS,
  POP_ROOM_MS,
  popScaleAt,
  ROW_AWAY_MS,
  ROW_ENTER_MS,
  ROW_ENTERS,
  ROW_EXITS,
  ROW_GLIDE_MS,
  ROW_POP_MS,
  ROW_SLIDE_MS,
  ROW_STEP_MS,
  ROW_SWEEP_MS,
  rowFrames,
  rowHasRoom,
  rowMotionMs,
  SLIDE_FROM,
  STRIKE_DELAY_MS,
  STRIKE_MS,
  strikeWindows,
  SWEEP_PAST,
  SWEEP_STAGGER_MS,
  SWEEP_WHOLE_MS,
  sweepStagger,
  sweepWholeMs,
  UNSTRIKE_MS,
  type RowMotionKind,
} from './rowMotion';

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

/** A shopping line on a phone: 58 pt tall, 356 wide. */
const H = 58;
const W = 356;
const ALL: RowMotionKind[] = [...ROW_ENTERS, ...ROW_EXITS];
const steps = (ms: number) => Array.from({ length: ms + 1 }, (_, i) => i);
const at = (k: RowMotionKind, fr: Frame, ms: number) => sample(fr, ms / rowMotionMs(k));

describe('the nine moves', () => {
  it('are each short: a pop 400 ms, a glide 300, a slide 320, a sweep 240, an enter 240, an away 320 — none past 450', () => {
    expect(rowMotionMs('pop')).toBe(ROW_POP_MS);
    for (const k of ['drop', 'rise', 'sink', 'lift'] as const)
      expect(rowMotionMs(k)).toBe(ROW_GLIDE_MS);
    expect(rowMotionMs('slide')).toBe(ROW_SLIDE_MS);
    expect(rowMotionMs('sweep')).toBe(ROW_SWEEP_MS);
    expect(rowMotionMs('enter')).toBe(ROW_ENTER_MS);
    expect(rowMotionMs('away')).toBe(ROW_AWAY_MS);
    for (const k of ALL) expect(rowMotionMs(k), k).toBeLessThanOrEqual(450);
    expect(ALL.filter(isRowExit).sort()).toEqual(['away', 'lift', 'sink', 'sweep']);
  });

  it('give every move a room but the enter, whose line is already on the list', () => {
    expect(ALL.filter(k => !rowHasRoom(k))).toEqual(['enter']);
  });

  it('use frames Animated can read, sampled finer than a frame', () => {
    expect(ROW_STEP_MS).toBeLessThanOrEqual(16);
    for (const k of ALL)
      for (const [name, fr] of Object.entries(rowFrames(k, H, W))) {
        expect(fr.inputRange.length, `${k} ${name}`).toBe(fr.outputRange.length);
        for (let i = 1; i < fr.inputRange.length; i += 1)
          expect(fr.inputRange[i] ?? 0, `${k} ${name}`).toBeGreaterThan(fr.inputRange[i - 1] ?? 0);
        expect(fr.inputRange[0], `${k} ${name}`).toBe(0);
        expect(fr.inputRange[fr.inputRange.length - 1], `${k} ${name}`).toBe(1);
        expect(fr.extrapolate, `${k} ${name}`).toBe('clamp');
      }
  });

  it('end exactly at rest: an arrival whole and in its place, a departure shut and unseen', () => {
    for (const k of ALL) {
      const f = rowFrames(k, H, W);
      if (isRowExit(k)) {
        expect(sample(f.height, 1), k).toBe(0);
        expect(sample(f.opacity, 1), k).toBe(0);
      } else {
        expect(sample(f.height, 1), k).toBe(H);
        expect(sample(f.opacity, 1), k).toBe(1);
        expect(sample(f.scale, 1), k).toBe(1);
        expect(sample(f.x, 1), k).toBe(0);
        expect(sample(f.y, 1), k).toBeCloseTo(0, 9);
      }
    }
  });

  it('start where the row was: an arrival from no room at all, a departure whole', () => {
    for (const k of ALL) {
      const f = rowFrames(k, H, W);
      // an enter's room is whole from its first frame: it has none to open (`rowHasRoom`)
      expect(sample(f.height, 0), k).toBe(isRowExit(k) || !rowHasRoom(k) ? H : 0);
      if (isRowExit(k)) {
        expect(sample(f.opacity, 0), k).toBe(1);
        expect(sample(f.x, 0), k).toBeCloseTo(0, 9);
        expect(sample(f.y, 0), k).toBeCloseTo(0, 9);
      }
    }
  });

  it('move the rows round them by the room alone, which only ever opens or only ever closes', () => {
    for (const k of ALL) {
      const f = rowFrames(k, H, W);
      let prev = sample(f.height, 0);
      for (const ms of steps(rowMotionMs(k))) {
        const h = at(k, f.height, ms);
        if (isRowExit(k)) expect(h, `${k} ${ms}`).toBeLessThanOrEqual(prev + 1e-9);
        else expect(h, `${k} ${ms}`).toBeGreaterThanOrEqual(prev - 1e-9);
        expect(h).toBeGreaterThanOrEqual(0);
        expect(h).toBeLessThanOrEqual(H + 1e-9);
        prev = h;
      }
    }
  });

  it('keep a size not yet measured shut', () => {
    for (const k of ROW_ENTERS) expect(sample(rowFrames(k, Number.NaN, W).height, 1), k).toBe(0);
  });
});

describe('the pop: a line put on the list', () => {
  const f = rowFrames('pop', H, W);

  it('opens its room quickly and settles the row in it with a small overshoot', () => {
    expect(at('pop', f.height, POP_ROOM_MS)).toBeCloseTo(H, 9);
    expect(popScaleAt(0)).toBe(POP_FROM);
    expect(POP_FROM).toBe(0.85);
    const peak = Math.max(...steps(ROW_POP_MS).map(popScaleAt));
    // a small overshoot: past full, but by a few percent at most
    expect(peak).toBeGreaterThan(1.005);
    expect(peak).toBeLessThan(1.05);
    expect(popScaleAt(ROW_POP_MS)).toBe(1);
    // it first reaches full as its room finishes opening
    const first = steps(ROW_POP_MS).find(ms => popScaleAt(ms) >= 1) ?? ROW_POP_MS;
    expect(Math.abs(first - POP_FULL_MS)).toBeLessThanOrEqual(2);
    // and never shrinks back toward where it came from
    for (const ms of steps(ROW_POP_MS))
      expect(popScaleAt(ms)).toBeGreaterThanOrEqual(POP_FROM - 1e-9);
  });

  it('grows out of the middle of its room, and fades in as it does', () => {
    for (const ms of steps(ROW_POP_MS))
      expect(at('pop', f.y, ms), `${ms}`).toBeCloseTo((at('pop', f.height, ms) - H) / 2, 6);
    expect(at('pop', f.opacity, 0)).toBe(0);
    expect(at('pop', f.opacity, ROW_POP_MS / 2)).toBe(1);
  });
});

describe('the glide: a line going to the basket, or back from it', () => {
  it('slides a line out of one card the way it goes, as it comes into the other from that side', () => {
    const sink = rowFrames('sink', H, W);
    const drop = rowFrames('drop', H, W);
    // down out of the list to buy, and down into the basket under it
    expect(sample(sink.y, 1)).toBeCloseTo(GLIDE_SLIDE * H, 9);
    expect(sample(drop.y, 0)).toBeCloseTo(-GLIDE_SLIDE * H, 9);
    const lift = rowFrames('lift', H, W);
    const rise = rowFrames('rise', H, W);
    // and up out of the basket, into the list above it
    expect(sample(lift.y, 1)).toBeCloseTo(-GLIDE_SLIDE * H, 9);
    expect(sample(rise.y, 0)).toBeCloseTo(GLIDE_SLIDE * H, 9);
    // both halves on one clock, so the line is seen to go from one to the other
    expect(rowMotionMs('sink')).toBe(rowMotionMs('drop'));
    expect(rowMotionMs('lift')).toBe(rowMotionMs('rise'));
  });

  it('is gone from the card it leaves before it is whole in the one it reaches', () => {
    const sink = rowFrames('sink', H, W);
    const drop = rowFrames('drop', H, W);
    expect(sample(sink.opacity, 0.7)).toBe(0);
    expect(sample(drop.opacity, 0.6)).toBe(1);
  });
});

describe('the sweep: a basket cleared', () => {
  const f = rowFrames('sweep', H, W);

  it('sends a line off the side, fading, and closes its room behind it', () => {
    // clear of the card by the first sample past four fifths of its time, and gone from sight
    const past = Math.ceil((0.8 * ROW_SWEEP_MS) / ROW_STEP_MS) * ROW_STEP_MS;
    expect(at('sweep', f.x, past)).toBeCloseTo(W + SWEEP_PAST, 9);
    expect(at('sweep', f.opacity, past)).toBe(0);
    expect(sample(f.x, 1)).toBeCloseTo(W + SWEEP_PAST, 9);
    // only ever further off, never back
    for (let ms = 1; ms <= ROW_SWEEP_MS; ms += 1)
      expect(at('sweep', f.x, ms)).toBeGreaterThanOrEqual(at('sweep', f.x, ms - 1) - 1e-9);
    // the room holds while the line goes, then closes
    for (const p of [0, 0.25, 0.5]) expect(sample(f.height, p)).toBeCloseTo(H, 9);
    expect(sample(f.height, 1)).toBe(0);
    // it goes off to the side, never up or down
    for (const p of [0, 0.5, 1]) expect(sample(f.y, p)).toBe(0);
  });

  it('staggers the lines 30–40 ms apart, and a big basket is gone within 450 ms however full', () => {
    expect(SWEEP_STAGGER_MS).toBeGreaterThanOrEqual(30);
    expect(SWEEP_STAGGER_MS).toBeLessThanOrEqual(40);
    expect(sweepStagger(1)).toBe(0);
    for (let n = 2; n <= 7; n += 1) expect(sweepStagger(n), `${n}`).toBe(SWEEP_STAGGER_MS);
    for (let n = 1; n <= 40; n += 1) {
      expect(sweepWholeMs(n), `${n}`).toBeLessThanOrEqual(SWEEP_WHOLE_MS);
      expect(sweepStagger(n), `${n}`).toBeGreaterThanOrEqual(0);
    }
    expect(sweepWholeMs(0)).toBe(0);
    expect(SWEEP_WHOLE_MS).toBeLessThanOrEqual(450);
  });
});

describe('the enter: a list opened for the first time (S1)', () => {
  const f = rowFrames('enter', H, W);

  it('rises a few points into its place and fades in, moving nothing round it', () => {
    expect(sample(f.y, 0)).toBe(ENTER_RISE);
    expect(ENTER_RISE).toBeGreaterThan(0);
    expect(ENTER_RISE).toBeLessThanOrEqual(16);
    // up, only ever: never below where it started, never past its place
    for (let ms = 1; ms <= ROW_ENTER_MS; ms += 1) {
      expect(at('enter', f.y, ms)).toBeLessThanOrEqual(at('enter', f.y, ms - 1) + 1e-9);
      expect(at('enter', f.y, ms)).toBeGreaterThanOrEqual(-1e-9);
    }
    expect(sample(f.opacity, 0)).toBe(0);
    // whole by the first sample past three fifths of its time
    expect(sample(f.opacity, 0.65)).toBe(1);
    // its room is its own height from the first frame to the last
    for (const p of [0, 0.3, 0.7, 1]) expect(sample(f.height, p)).toBe(H);
    for (const p of [0, 0.5, 1]) {
      expect(sample(f.x, p)).toBe(0);
      expect(sample(f.scale, p)).toBe(1);
    }
  });

  it('staggers the lines 30 ms apart, and a list of any length has landed within 400 ms', () => {
    expect(ENTER_STAGGER_MS).toBe(30);
    expect(ENTER_WHOLE_MS).toBe(400);
    expect(enterStagger(0)).toBe(0);
    expect(enterStagger(1)).toBe(0);
    for (let n = 2; n <= 6; n += 1) expect(enterStagger(n), `${n}`).toBe(ENTER_STAGGER_MS);
    for (let n = 1; n <= 60; n += 1) {
      expect(enterWholeMs(n), `${n}`).toBeLessThanOrEqual(ENTER_WHOLE_MS + 1e-9);
      expect(enterStagger(n), `${n}`).toBeGreaterThanOrEqual(0);
    }
    expect(enterWholeMs(0)).toBe(0);
    expect(enterWholeMs(1)).toBe(ROW_ENTER_MS);
  });
});

describe('the away: a line swiped off the list (S5)', () => {
  const f = rowFrames('away', H, W);

  it('carries on off the left edge, fading, then closes its room behind it', () => {
    // off the left, the way the finger sent it, a full width and a little further
    const off = Math.ceil((AWAY_OFF * ROW_AWAY_MS) / ROW_STEP_MS) * ROW_STEP_MS;
    expect(at('away', f.x, off)).toBeCloseTo(-(W + SWEEP_PAST), 9);
    expect(at('away', f.opacity, off)).toBe(0);
    for (let ms = 1; ms <= ROW_AWAY_MS; ms += 1)
      expect(at('away', f.x, ms)).toBeLessThanOrEqual(at('away', f.x, ms - 1) + 1e-9);
    // under way at once: a row let go at speed does not stop before it leaves
    expect(at('away', f.x, 30)).toBeLessThan(-0.1 * W);
    // the room holds while the line goes, then closes
    for (const p of [0, 0.2, 0.4]) expect(sample(f.height, p)).toBeCloseTo(H, 9);
    expect(sample(f.height, 1)).toBe(0);
    for (const p of [0, 0.5, 1]) expect(sample(f.y, p)).toBe(0);
  });
});

/**
 * THE NEXT DAY, OPENED AND FOLDED (the Schedule, 2026-09-26: *"Switching between Today and Tomorrow
 * slides the list sideways, in the direction of the change"*). Opened, the day comes in from the
 * right — later, the way time goes — as its room opens; folded, it leaves by the sweep, off to the
 * right, back the way it came.
 */
describe('the slide: a day arriving from the side', () => {
  const f = rowFrames('slide', H, W);

  it('comes in from the right, only ever toward its place, and lands exactly there', () => {
    expect(sample(f.x, 0)).toBeCloseTo(SLIDE_FROM * W, 9);
    expect(SLIDE_FROM).toBeGreaterThan(0);
    expect(SLIDE_FROM).toBeLessThan(1);
    for (let ms = 1; ms <= ROW_SLIDE_MS; ms += 1) {
      const x = at('slide', f.x, ms);
      expect(x).toBeLessThanOrEqual(at('slide', f.x, ms - 1) + 1e-9);
      expect(x).toBeGreaterThanOrEqual(0);
    }
    expect(sample(f.x, 1)).toBe(0);
    // sideways, never up or down, and never grown or shrunk
    for (const p of [0, 0.5, 1]) {
      expect(sample(f.y, p)).toBe(0);
      expect(sample(f.scale, p)).toBe(1);
    }
  });

  it('opens its room as it comes, and is whole by the time it lands', () => {
    expect(sample(f.height, 0)).toBe(0);
    expect(sample(f.height, 1)).toBe(H);
    // faded in well before it lands
    expect(sample(f.opacity, 0.65)).toBe(1);
  });

  it('leaves the other way it came: the sweep goes off to the right', () => {
    const out = rowFrames('sweep', H, W);
    expect(sample(out.x, 1)).toBeGreaterThan(0);
    expect(sample(f.x, 0)).toBeGreaterThan(0);
  });
});

/**
 * THE FIRST LOOK (the Schedule's day, once an app session). Not an arrival: nothing under the rows
 * moves, so there is no room in it — only a short rise into a place the row already has, and a fade.
 */
describe('the first look: a list’s rows coming in one after another', () => {
  const f = lookFrames();

  it('rises a few points into its place as it fades in, and ends exactly at rest', () => {
    expect(sample(f.y, 0)).toBe(LOOK_RISE);
    expect(sample(f.opacity, 0)).toBe(0);
    expect(sample(f.y, 1)).toBe(0);
    expect(sample(f.opacity, 1)).toBe(1);
    expect(LOOK_RISE).toBeLessThanOrEqual(12);
    for (let ms = 1; ms <= LOOK_MS; ms += 1) {
      const p = ms / LOOK_MS;
      expect(sample(f.y, p)).toBeLessThanOrEqual(sample(f.y, (ms - 1) / LOOK_MS) + 1e-9);
      expect(sample(f.opacity, p)).toBeGreaterThanOrEqual(
        sample(f.opacity, (ms - 1) / LOOK_MS) - 1e-9,
      );
    }
  });

  it('puts the rows 40 ms apart at most, and the whole list in within 400 ms however long', () => {
    expect(LOOK_WHOLE_MS).toBeLessThanOrEqual(400);
    expect(lookStagger(0)).toBe(0);
    expect(lookStagger(1)).toBe(0);
    expect(lookWholeMs(0)).toBe(0);
    expect(lookWholeMs(1)).toBe(LOOK_MS);
    for (let n = 2; n <= 40; n += 1) {
      expect(lookStagger(n), `${n}`).toBeGreaterThan(0);
      expect(lookStagger(n), `${n}`).toBeLessThanOrEqual(LOOK_STAGGER_MS);
      expect(lookWholeMs(n), `${n}`).toBeLessThanOrEqual(LOOK_WHOLE_MS + 1e-9);
    }
    // a short day keeps the full gap, so it still reads as one after another
    expect(lookStagger(4)).toBe(LOOK_STAGGER_MS);
  });
});

describe('the strike through a ticked line', () => {
  it('shows every word once at every place of the pen: struck to its left, plain to its right', () => {
    const w = strikeWindows(W);
    for (let p = 0; p <= 1; p += 0.05) {
      const struckClip = sample(w.struckOuter, p);
      const plainClip = sample(w.plainOuter, p);
      // each window's content is moved back by exactly as much: the words stand still
      expect(struckClip + sample(w.struckInner, p)).toBeCloseTo(0, 9);
      expect(plainClip + sample(w.plainInner, p)).toBeCloseTo(0, 9);
      // the struck window shows [0, pen) of the words, the plain one [pen, W]: no gap, no overlap
      const pen = p * W;
      expect(Math.max(0, struckClip)).toBeCloseTo(0, 9);
      expect(struckClip + W).toBeCloseTo(pen, 9);
      expect(plainClip).toBeCloseTo(pen, 9);
    }
  });

  it('starts a beat after the tick and is drawn quickly; taken back quicker', () => {
    expect(STRIKE_DELAY_MS).toBeGreaterThan(0);
    expect(STRIKE_DELAY_MS + STRIKE_MS).toBeLessThanOrEqual(350);
    expect(UNSTRIKE_MS).toBeLessThanOrEqual(STRIKE_MS);
  });
});

describe('the components (tripwires)', () => {
  const motion = flatOf('RowMotion.tsx');
  const strike = flatOf('StrikeSweep.tsx');

  it('opens and closes the room on the JavaScript driver, and moves everything else on the native one', () => {
    // the first look has no room at all: the native driver alone
    const look = flatOf('StaggerIn.tsx');
    expect(look).toContain('useNativeDriver: true');
    expect(look).not.toContain('useNativeDriver: false');
    expect(motion.match(/useNativeDriver: false/g) ?? []).toHaveLength(1);
    expect(motion.match(/useNativeDriver: true/g) ?? []).toHaveLength(1);
    expect(motion).toContain(
      'room: rowHasRoom(playing) ? [styles.clip, { height: num(room, f.height) }] : null,',
    );
    // and a move with no room runs nothing on the JavaScript driver
    expect(motion).toContain('const run = rowHasRoom(playing) ? Animated.parallel([');
    expect(motion).toContain(']) : eye;');
    const fed = [...motion.matchAll(/(\w+): num\(move,/g)].map(m => m[1]).sort();
    expect(fed).toEqual(['opacity', 'scale', 'translateX', 'translateY']);
    expect(strike).toContain('useNativeDriver: true');
    expect(strike).not.toContain('useNativeDriver: false');
  });

  it('takes a leaving row, and one held back, out of reach of touch and of assistive technology', () => {
    expect(motion).toContain('const hidden = active && (leaving || held);');
    expect(motion).toContain("pointerEvents={hidden ? 'none' : 'auto'}");
    expect(motion).toContain('accessibilityElementsHidden: true,');
    // and the struck copies of the words are never read on top of the words
    expect(strike.match(/accessibilityElementsHidden/g) ?? []).toHaveLength(2);
  });

  it('plays an arrival once, from its first frame, and never cuts one short', () => {
    expect(motion).toContain('useState<RowMotionKind | null>(motion)');
    expect(motion).toContain('if (motion !== null && isRowExit(motion)) setPlaying(motion);');
    // the delay is read as the move starts: a later change restarts nothing
    expect(motion).toContain('const wait = Math.max(0, lateBy.current);');
    expect(motion).toContain('}, [playing, still, measured, held, room, move]);');
  });

  it('moves nothing under reduce motion or in the amber Night: there, or gone', () => {
    for (const src of [motion, strike])
      expect(src).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(motion).toContain('if (still && leaving) return null;');
    expect(motion).toContain('if (!isRowExit(playing)) setPlaying(null);');
    expect(strike).toContain('if (!moving || still) {');
  });

  it('rests on the platform’s own line-through, so the hand-over changes no pixel', () => {
    expect(strike).toContain("struck: { textDecorationLine: 'line-through' }");
    expect(strike).toContain('style={[style, struck ? styles.struck : null]}');
  });

  it('asks for nothing Expo Go does not carry, and writes no color of its own', () => {
    for (const f of ['RowMotion.tsx', 'StrikeSweep.tsx', 'rowMotion.ts']) {
      const src = withoutComments(read(f));
      for (const m of src.matchAll(/from '([^']+)'/g)) {
        const source = m[1] ?? '';
        expect(
          ['react', 'react-native'].includes(source) || /^\./.test(source),
          `${f}: ${source}`,
        ).toBe(true);
      }
      expect(src, f).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
    }
    expect(read('core.ts')).toContain("export * from './RowMotion';");
    expect(read('core.ts')).toContain("export * from './StrikeSweep';");
    expect(read('../layout.ts')).toContain("from './components/rowMotion';");
  });
});
