/**
 * THE STEP TRACK'S HOP (the owner, 2026-09-26, of setup's animations). Two halves, the way this
 * package tests anything that moves: every pose is PURE (`stepHop.ts`) and is sampled here exactly
 * as `interpolate` would sample it; what can only be seen on a device — that the hop runs on the
 * native driver, plays once per change and never on a first draw, rests under reduce motion and in
 * the amber Night, and keeps the track one progressbar to a screen reader — is held by tripwires
 * over `StepTrack.tsx`, because this suite has no renderer (`interaction.test.ts` says why).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { space } from '../theme/theme';
import { sampleFrame } from './keyframes';
import {
  barPitch,
  HOP_LIFT,
  HOP_MS,
  HOP_SQUASH,
  hopFrames,
  hopOffset,
  ROLL_END,
  rollFrames,
  trackStep,
} from './stepHop';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
/** Comments out: the component explains its own rules, and a scan must not read the explanation. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const STEPS = Array.from({ length: 401 }, (_, i) => i / 400);

describe('when the marker hops', () => {
  it('hops forward or back only when the step changes on a track of the same length', () => {
    expect(trackStep({ current: 2, total: 5 }, { current: 3, total: 5 }, false)).toBe('forward');
    expect(trackStep({ current: 3, total: 5 }, { current: 2, total: 5 }, false)).toBe('back');
    expect(trackStep({ current: 3, total: 5 }, { current: 3, total: 5 }, false)).toBeNull();
  });

  it('never on the first draw of a track — a setup opened or resumed hops nothing', () => {
    expect(trackStep(null, { current: 3, total: 5 }, false)).toBeNull();
  });

  it('never on a track that gained or lost a bar: that is a different track, drawn where it is', () => {
    // setup's brands step appears or goes as the modules change on the step before it
    expect(trackStep({ current: 3, total: 5 }, { current: 4, total: 4 }, false)).toBeNull();
    expect(trackStep({ current: 3, total: 4 }, { current: 3, total: 5 }, false)).toBeNull();
  });

  it('never under reduce motion or in the amber Night', () => {
    expect(trackStep({ current: 2, total: 5 }, { current: 3, total: 5 }, true)).toBeNull();
  });
});

describe('the hop', () => {
  const pitch = barPitch(300, 5, space.sm);

  it('measures the bars the way the row lays them out: equal flex bars and the gaps between', () => {
    expect(pitch).toBeCloseTo((300 - 4 * space.sm) / 5 + space.sm, 9);
    expect(barPitch(0, 5, space.sm)).toBe(0);
    expect(barPitch(300, 0, space.sm)).toBe(0);
  });

  it('starts on the old bar — left of the new one going forward, right of it going back', () => {
    expect(hopOffset(2, 3, pitch)).toBeCloseTo(-pitch, 9);
    expect(hopOffset(3, 2, pitch)).toBeCloseTo(pitch, 9);
    for (const offset of [-pitch, pitch]) {
      const f = hopFrames(offset);
      expect(sampleFrame(f.x, 0)).toBeCloseTo(offset, 9);
      expect(sampleFrame(f.x, 1)).toBeCloseTo(0, 9);
    }
  });

  it('travels one way only, in an arc that lifts a few points and comes down on the new bar', () => {
    const f = hopFrames(-pitch);
    let before = -Infinity;
    for (const t of STEPS) {
      const x = sampleFrame(f.x, t);
      expect(x + 1e-9, `x at ${t}`).toBeGreaterThanOrEqual(before);
      before = x;
    }
    const ys = STEPS.map(t => sampleFrame(f.y, t));
    expect(Math.min(...ys)).toBeCloseTo(-HOP_LIFT, 1);
    expect(Math.max(...ys)).toBeLessThanOrEqual(1e-9);
    expect(sampleFrame(f.y, 0)).toBe(0);
    expect(sampleFrame(f.y, 1)).toBe(0);
    // the lift stays inside the room above the track: the page's own top padding
    expect(HOP_LIFT).toBeLessThan(space.md);
  });

  it('lands with a small squash about its foot, and stands up again', () => {
    const f = hopFrames(-pitch);
    const sq = STEPS.map(t => sampleFrame(f.squash, t));
    expect(Math.min(...sq)).toBeCloseTo(HOP_SQUASH, 2);
    expect(HOP_SQUASH).toBeGreaterThanOrEqual(0.6);
    expect(sq[0]).toBe(1);
    expect(sq[sq.length - 1]).toBe(1);
    // only once it has landed: in the air it keeps its height
    const landed = STEPS.find(t => sampleFrame(f.squash, t) < 0.999) ?? 1;
    expect(sampleFrame(f.x, landed)).toBeCloseTo(0, 1);
  });

  it('is short, and every frame is at rest at the end — a hop cut short is set straight there', () => {
    expect(HOP_MS).toBeLessThanOrEqual(600);
    const f = hopFrames(-pitch);
    for (const fr of [f.x, f.y, f.squash]) {
      expect(fr.extrapolate).toBe('clamp');
      for (let i = 1; i < fr.inputRange.length; i += 1)
        expect(fr.inputRange[i] ?? 0).toBeGreaterThan(fr.inputRange[i - 1] ?? 0);
    }
  });
});

describe('the odometer', () => {
  const h = 14;

  it('rolls the new number up from below going forward, and down from above going back', () => {
    const fwd = rollFrames(1, h);
    expect(sampleFrame(fwd.inY, 0)).toBeCloseTo(h, 9);
    expect(sampleFrame(fwd.outY, 1)).toBeCloseTo(-h, 9);
    const back = rollFrames(-1, h);
    expect(sampleFrame(back.inY, 0)).toBeCloseTo(-h, 9);
    expect(sampleFrame(back.outY, 1)).toBeCloseTo(h, 9);
  });

  it('is settled before the marker lands: the new number in place and whole, the old one gone', () => {
    for (const dir of [1, -1] as const) {
      const f = rollFrames(dir, h);
      expect(sampleFrame(f.inY, ROLL_END)).toBeCloseTo(0, 9);
      expect(sampleFrame(f.inOpacity, ROLL_END)).toBe(1);
      expect(sampleFrame(f.outOpacity, ROLL_END)).toBe(0);
      // and at rest, which is where a track that never hopped is drawn: only the current number
      expect(sampleFrame(f.inOpacity, 1)).toBe(1);
      expect(sampleFrame(f.outOpacity, 1)).toBe(0);
      expect(sampleFrame(f.inY, 1)).toBeCloseTo(0, 9);
    }
    expect(ROLL_END).toBeLessThan(1);
  });

  it('starts from the old number: the new one hidden, the old one whole', () => {
    const f = rollFrames(1, h);
    expect(sampleFrame(f.inOpacity, 0)).toBe(0);
    expect(sampleFrame(f.outOpacity, 0)).toBe(1);
    expect(sampleFrame(f.outY, 0)).toBe(0);
  });
});

describe('the component (tripwires over StepTrack.tsx)', () => {
  const src = withoutComments(read('StepTrack.tsx'));
  const flat = src.replace(/\s+/g, ' ');

  it('is still one progressbar, named once, with the numeral inside it', () => {
    expect(flat).toContain('accessibilityRole="progressbar"');
    expect(flat).toContain('accessibilityLabel={`Step ${current} of ${total}`}');
    expect(flat).toContain('accessibilityValue={{ min: 0, max: total, now: current }}');
    // one accessible node: the numbers, old and new, are drawings inside it
    expect(flat.match(/\baccessible\b/g) ?? []).toHaveLength(1);
  });

  it('keeps the three signals: accent fill, the tall marker, and the mono numeral', () => {
    expect(flat).toContain('backgroundColor: i < current ? t.color.accent : t.color.line2');
    expect(flat).toContain('height: STEP_BAR_CURRENT_HEIGHT');
    expect(flat).toContain('<Numeric variant="label" ink="text2">');
  });

  it('hops once per change it saw — never on a first draw, never replayed by a re-render', () => {
    expect(flat).toContain(
      'setShown({ current, total, from: shown.current, fromTotal: shown.total, n: shown.n + 1 });',
    );
    expect(flat).toContain(
      'shown.n === 0 ? null : { current: shown.from, total: shown.fromTotal }',
    );
    expect(flat).toContain('if (played.current === shown.n) return;');
  });

  it('rests under reduce motion and in the amber Night, and is never left mid-air', () => {
    expect(flat).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(flat).toContain('run.stop(); clock.setValue(1);');
    expect(flat).toContain('new Animated.Value(1)');
  });

  it('moves by transforms and opacity on the native driver, and animates no size', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    const fed = [...flat.matchAll(/(\w+): num\(clock,/g)].map(m => m[1]);
    expect(new Set(fed)).toEqual(new Set(['translateX', 'translateY', 'scaleY', 'opacity']));
  });

  it('lifts the marker’s cell over its neighbours, so a hop back is never drawn under a bar', () => {
    expect(flat).toContain('style={[styles.cell, isCurrent ? styles.lifted : null]}');
    expect(flat).toContain('lifted: { zIndex: 1 }');
    expect(flat).toContain('pointerEvents="none"');
  });

  it('squashes about the marker’s foot: out to it, squash, and back', () => {
    const order = [
      '{ translateY: foot }',
      '{ scaleY: num(clock, hop.squash) }',
      '{ translateY: -foot }',
    ].map(s => flat.indexOf(s));
    for (const i of order) expect(i).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
