/**
 * THE DAY WHEEL DRAWS ITSELF, ONCE (the owner, 2026-09-26, of setup's "How often?"). The plan —
 * when the sweep reaches each house, the stagger, the ceiling, the arcs' dashes and each pop's
 * window — is PURE (`wheelDraw.ts`) and proved here over real rings laid out by core's own
 * `layoutWheel`. What can only be seen on a device — that the entrance is the preview's alone
 * (Routine's ring is untouched), plays once, rests under reduce motion and in the amber Night, and
 * keeps the springs' JavaScript driver and the pops' native one on separate views — is held by
 * tripwires over `ScheduleWheel.tsx` (no renderer here — `interaction.test.ts` says why).
 */
import { layoutWheel, WHEEL_DIRECTION, type ModuleId, type WheelEntry } from '@nibblecue/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sampleFrame } from './keyframes';
import { easeAt } from './themeSkyToggle';
import {
  ARC_MIN,
  arcDash,
  arcFrames,
  arcLength,
  hubFrames,
  popWindowFrames,
  shareFrom,
  sweepTimeAt,
  WHEEL_DRAW_MAX_MS,
  WHEEL_HUB_MS,
  WHEEL_POP_MS,
  WHEEL_STAGGER_MS,
  WHEEL_SWEEP_EASE,
  WHEEL_SWEEP_MS,
  wheelDrawPlan,
} from './wheelDraw';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const STEPS = Array.from({ length: 1001 }, (_, i) => i / 1000);

/** A day's entries: `activity` every `every` minutes from `from` to `to` (minutes since midnight). */
function every(activity: ModuleId, from: number, to: number, stepMin: number): WheelEntry[] {
  const out: WheelEntry[] = [];
  for (let m = from, i = 0; m <= to; m += stepMin, i += 1)
    out.push({ key: `${activity}:${i}`, minutes: m % 1440, activity });
  return out;
}

/** Rings a household really gets: an ordinary day, a busy one, a night-feeding one, an empty one. */
const RINGS = {
  ordinary: layoutWheel([
    ...every('bottle', 7 * 60, 19 * 60, 180),
    ...every('diaper', 8 * 60, 18 * 60, 240),
  ]),
  busy: layoutWheel([
    ...every('bottle', 7 * 60, 19 * 60, 120),
    ...every('pump', 7 * 60 + 30, 19 * 60, 180),
    ...every('diaper', 8 * 60, 19 * 60, 120),
    { key: 'med', minutes: 8 * 60 + 30, activity: 'med', note: 'Vitamin D' },
  ]),
  nights: layoutWheel([...every('bottle', 7 * 60, 31 * 60, 180)]),
  empty: layoutWheel([]),
};

const planOf = (ring: (typeof RINGS)[keyof typeof RINGS]) =>
  wheelDrawPlan(
    ring.wakeDeg,
    ring.bedDeg,
    ring.stops.map(s => ({ key: s.key, deg: s.deg })),
    WHEEL_DIRECTION,
  );

describe('the sweep', () => {
  it('measures the ring from the sun, the way the day runs', () => {
    expect(shareFrom(320, 320, 1)).toBe(0);
    expect(shareFrom(320, 50, 1)).toBeCloseTo(90 / 360, 9);
    expect(shareFrom(320, 230, 1)).toBeCloseTo(270 / 360, 9);
    // the other way round, for a ring that ran counter-clockwise
    expect(shareFrom(320, 230, -1)).toBeCloseTo(90 / 360, 9);
  });

  it('knows when the eased front reaches any point: the curve read backwards', () => {
    for (const share of [0.05, 0.25, 0.5, 0.75, 0.95])
      expect(easeAt(WHEEL_SWEEP_EASE, sweepTimeAt(share))).toBeCloseTo(share, 6);
    expect(sweepTimeAt(0)).toBe(0);
    expect(sweepTimeAt(1)).toBe(1);
    let before = 0;
    for (const s of STEPS) {
      const at = sweepTimeAt(s);
      expect(at + 1e-12).toBeGreaterThanOrEqual(before);
      before = at;
    }
  });

  it('leaves the sun quickly and settles as it comes back round to it', () => {
    // half the ring is drawn in well under half the sweep
    expect(sweepTimeAt(0.5)).toBeLessThan(0.5);
  });
});

describe('the plan, over real rings', () => {
  it('pops every house in the order the day runs from the sun', () => {
    for (const [name, ring] of Object.entries(RINGS)) {
      const plan = planOf(ring);
      expect(plan.stops.map(s => s.key).sort(), name).toEqual(ring.stops.map(s => s.key).sort());
      const shares = plan.stops.map(s =>
        shareFrom(ring.wakeDeg, ring.stops.find(x => x.key === s.key)?.deg ?? 0, 1),
      );
      expect(shares, name).toEqual([...shares].sort((a, b) => a - b));
    }
  });

  it('pops a house as the front reaches it, never before, on an ordinary ring', () => {
    for (const name of ['ordinary', 'busy', 'nights'] as const) {
      const ring = RINGS[name];
      const plan = planOf(ring);
      for (const s of plan.stops) {
        const deg = ring.stops.find(x => x.key === s.key)?.deg ?? 0;
        const reach = sweepTimeAt(shareFrom(ring.wakeDeg, deg, 1)) * WHEEL_SWEEP_MS;
        expect(s.at + 1e-9, `${name} ${s.key}`).toBeGreaterThanOrEqual(reach);
      }
    }
  });

  it('keeps two pops apart, however close their houses are', () => {
    for (const [name, ring] of Object.entries(RINGS)) {
      const at = planOf(ring).stops.map(s => s.at);
      for (let i = 1; i < at.length; i += 1)
        expect((at[i] ?? 0) - (at[i - 1] ?? 0) + 1e-9, name).toBeGreaterThanOrEqual(
          WHEEL_STAGGER_MS,
        );
    }
  });

  it('lands the moon when the front reaches bedtime', () => {
    const ring = RINGS.ordinary;
    const plan = planOf(ring);
    expect(plan.moonAt).toBeCloseTo(
      sweepTimeAt(shareFrom(ring.wakeDeg, ring.bedDeg, 1)) * WHEEL_SWEEP_MS,
      6,
    );
    expect(plan.dayShare).toBeCloseTo(shareFrom(ring.wakeDeg, ring.bedDeg, 1), 9);
  });

  it('is over inside the ceiling, whatever the ring holds — a crowded ring tightens its stagger', () => {
    const crowded = Array.from({ length: 40 }, (_, i) => ({ key: `s${i}`, deg: (i * 9) % 360 }));
    for (const plan of [...Object.values(RINGS).map(planOf), wheelDrawPlan(320, 207, crowded, 1)]) {
      expect(plan.totalMs).toBeLessThanOrEqual(WHEEL_DRAW_MAX_MS);
      for (const s of plan.stops) {
        expect(s.at).toBeGreaterThanOrEqual(0);
        expect(s.at + WHEEL_POP_MS).toBeLessThanOrEqual(WHEEL_DRAW_MAX_MS + 1e-9);
      }
      expect(plan.moonAt + WHEEL_POP_MS).toBeLessThanOrEqual(WHEEL_DRAW_MAX_MS + 1e-9);
    }
    // forty houses: all of them inside the ceiling, still in order, still apart
    const plan = wheelDrawPlan(320, 207, crowded, 1);
    const at = plan.stops.map(s => s.at);
    for (let i = 1; i < at.length; i += 1) expect(at[i] ?? 0).toBeGreaterThan(at[i - 1] ?? 0);
  });

  it('draws an empty ring too: the sweep, the sun and the moon, and the middle that says why', () => {
    const plan = planOf(RINGS.empty);
    expect(plan.stops).toEqual([]);
    expect(plan.totalMs).toBe(WHEEL_SWEEP_MS);
  });

  it('is a one-time entrance, and every part of it is short', () => {
    expect(WHEEL_DRAW_MAX_MS).toBeLessThanOrEqual(1200);
    expect(WHEEL_SWEEP_MS).toBeLessThanOrEqual(WHEEL_DRAW_MAX_MS);
    expect(WHEEL_POP_MS).toBeLessThanOrEqual(600);
    expect(WHEEL_STAGGER_MS).toBeGreaterThanOrEqual(30);
    expect(WHEEL_STAGGER_MS).toBeLessThanOrEqual(40);
  });
});

describe('the arcs', () => {
  const r = 110;
  const ring = RINGS.ordinary;
  const day = { length: arcLength(ring.wakeDeg, ring.bedDeg, r, 1), stroke: 3 };
  const night = { length: arcLength(ring.bedDeg, ring.wakeDeg, r, 1), stroke: 12 };
  const plan = planOf(ring);
  const arcs = arcFrames(plan.dayShare, day, night);

  it('are the ring, end to end: the day and the night make the whole circle', () => {
    expect(day.length + night.length).toBeCloseTo(2 * Math.PI * r, 6);
  });

  it('draw the day first, from the sun, then the night, handing over at bedtime', () => {
    expect(arcs.day?.offset.inputRange).toEqual([0, plan.dayShare]);
    expect(arcs.night?.offset.inputRange).toEqual([plan.dayShare, 1]);
    for (const a of [arcs.day, arcs.night]) {
      expect(a).not.toBeNull();
      if (a === null) continue;
      // nothing drawn before its turn, the whole arc after it
      expect(sampleFrame(a.offset, 0)).toBeGreaterThan(0);
      expect(sampleFrame(a.offset, 1)).toBe(0);
      expect(a.offset.extrapolate).toBe('clamp');
    }
    // the night's is still whole-gap while the day is being drawn
    const n = arcs.night;
    if (n !== null) expect(sampleFrame(n.offset, plan.dayShare / 2)).toBe(n.offset.outputRange[0]);
  });

  it('are inked all the way to the sun and the moon at rest: the dash is longer than the arc', () => {
    for (const [a, len] of [
      [arcs.day, day.length],
      [arcs.night, night.length],
    ] as const) {
      expect(a?.dasharray[0] ?? 0).toBeGreaterThan(len);
    }
    expect(arcDash(100, 3).dasharray[0]).toBe(101);
  });

  it('are simply there when there is nothing to draw in: a day that is all waking has no night', () => {
    const allDay = arcFrames(1, { length: 600, stroke: 3 }, { length: 0, stroke: 12 });
    expect(allDay.night).toBeNull();
    expect(allDay.day).not.toBeNull();
    expect(arcFrames(0.5, { length: ARC_MIN / 2, stroke: 3 }, night).day).toBeNull();
  });
});

describe('the pops', () => {
  it('each in its own window of the clock: hidden before, whole after, and never past its size for long', () => {
    const total = 1000;
    const f = popWindowFrames(300, total);
    expect(sampleFrame(f.opacity, 0.29)).toBe(0);
    expect(sampleFrame(f.opacity, (300 + WHEEL_POP_MS) / total)).toBe(1);
    expect(sampleFrame(f.scale, 1)).toBe(1);
    const peak = Math.max(...STEPS.map(t => sampleFrame(f.scale, t)));
    expect(peak).toBeGreaterThan(1);
    expect(peak).toBeLessThanOrEqual(1.12);
  });

  it('is at rest at the end of the clock for every house — the ring after the entrance is the ring', () => {
    for (const ring of Object.values(RINGS)) {
      const plan = planOf(ring);
      for (const s of plan.stops) {
        const f = popWindowFrames(s.at, plan.totalMs);
        expect(sampleFrame(f.scale, 1)).toBe(1);
        expect(sampleFrame(f.opacity, 1)).toBe(1);
      }
    }
  });

  it('brings the middle’s words in first, well before the sweep is round', () => {
    const f = hubFrames(1000);
    expect(sampleFrame(f.opacity, WHEEL_HUB_MS / 1000)).toBe(1);
    expect(WHEEL_HUB_MS).toBeLessThan(WHEEL_SWEEP_MS / 2);
  });
});

describe('the component (tripwires over ScheduleWheel.tsx)', () => {
  const src = withoutComments(read('ScheduleWheel.tsx'));
  const flat = src.replace(/\s+/g, ' ');

  it('draws the ring at rest unless an entrance is asked for, so Routine’s ring is untouched', () => {
    expect(flat).toContain("entrance = 'rest',");
    expect(flat).toContain("const animate = entrance !== 'rest' && !still;");
    expect(flat).toContain('if (!animate) return null;');
    // with no entrance the arcs are the plain paths they always were
    expect(flat).toContain(
      '<Path d={d} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />',
    );
  });

  it('plays once: the latch is set by any end, played through, cut short or shown at rest', () => {
    expect(flat).toContain("const drawn = useRef(entrance === 'rest');");
    expect(flat).toContain(
      "if (entrance === 'rest' || still || drawn.current) { drawn.current = true;",
    );
    expect(flat).toContain(
      'run.stop(); drawn.current = true; sweep.setValue(1); clock.setValue(1);',
    );
  });

  it('rests under reduce motion and in the amber Night', () => {
    expect(flat).toContain('const still = motionStill(t.reduceMotion, t.theme);');
  });

  it('draws the arcs by a dash on the JavaScript driver and pops everything else on the native one', () => {
    // one JavaScript-driven value in the file: the sweep. A stop's spring moved to the native
    // driver on 2026-09-26 — it only ever fed transforms (docs/DESIGN_SYSTEM.md §7.1)
    expect(flat.match(/useNativeDriver: false/g) ?? []).toHaveLength(1);
    expect(flat).toContain('damping: 18, stiffness: 140, mass: 0.9, useNativeDriver: true');
    expect(flat).toContain('strokeDashoffset={num(sweep, drawIn.offset)}');
    expect(flat).toContain('Animated.createAnimatedComponent(Path)');
    expect(flat).toContain(
      'duration: planMs.current, easing: Easing.linear, useNativeDriver: true',
    );
  });

  it('pops a stop on views of its own, never on the views its springs move', () => {
    expect(flat).toContain('<Animated.View style={enter.body}>{house}</Animated.View>');
    expect(flat).toContain('<Animated.View style={enter.caption}>{words}</Animated.View>');
    // the springs' views carry no pop
    expect(flat).toMatch(
      /transform: \[ \{ translateX: Animated\.subtract\(x, width \/ 2\) \}, \{ translateY: Animated\.subtract\(y, HOUSE_H \/ 2\) \}, \], \}, \]\}/,
    );
  });

  it('keeps the ring one picture to a screen reader, as it was', () => {
    expect(flat).toContain(
      'accessibilityElementsHidden importantForAccessibility="no-hide-descendants"',
    );
  });
});
