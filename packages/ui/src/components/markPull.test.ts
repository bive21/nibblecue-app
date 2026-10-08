/**
 * THE HEART ON A PULL (`markPull.ts`; the owner, 2026-09-26). Two halves, the way this package
 * tests anything that moves: the curve, the springs and the rules for when anything moves are PURE
 * and are walked here — the springs integrated a tenth of a millisecond at a time, as React
 * Native's own spring is written — and what can only be seen on a device (the native driver, the
 * anchor at the top, the door behind the heart, the still heart under reduce motion and in the
 * amber Night) is held by tripwires over `useMarkPull.ts` and `TopBar.tsx`, because this suite
 * has no renderer (`interaction.test.ts` says why that is the honest instrument).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sampleFrame } from './keyframes';
import {
  MARK_KICK_VELOCITY,
  MARK_PULL,
  MARK_PULL_FRAME,
  MARK_SPRINGS,
  markKick,
  markOnSync,
  markPullStretch,
  markRelease,
  markScales,
  type MarkRun,
} from './markPull';
import { markSize, TOP_BAR_MIN_HEIGHT } from './topBarLayout';
import { space } from '../theme/theme';

const here = dirname(fileURLToPath(import.meta.url));
const flat = (f: string): string =>
  readFileSync(join(here, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

/**
 * A run of the heart's spring, walked: React Native's spring is x'' = −(k/m)(x − to) − (c/m)x',
 * integrated here from where the run starts, at the velocity it starts with, for a second.
 */
function walk(r: MarkRun) {
  const { stiffness: k, damping: c, mass: m } = r.spring;
  let x = r.from;
  let v = r.velocity;
  let highest = x;
  let lowest = x;
  let crossings = 0;
  let settled = Infinity;
  const dt = 0.0001;
  for (let step = 0; step * dt < 1.2; step += 1) {
    const before = x;
    v += (-(k / m) * x - (c / m) * v) * dt;
    x += v * dt;
    if (Math.sign(before) !== Math.sign(x) && before !== 0) crossings += 1;
    highest = Math.max(highest, x);
    lowest = Math.min(lowest, x);
    if (Math.abs(x) > 0.005) settled = Infinity;
    else if (settled === Infinity) settled = step * dt;
  }
  return { highest, lowest, crossings, settled };
}

describe('the stretch follows the pull', () => {
  it('is nothing at rest and for a page that is scrolled rather than pulled', () => {
    expect(markPullStretch(0)).toBe(0);
    expect(markPullStretch(40)).toBe(0);
    expect(markPullStretch(2_000)).toBe(0);
  });

  it('grows with the pull, never shrinking as the finger draws further', () => {
    let last = -1;
    for (let pull = 0; pull <= 2 * MARK_PULL.full; pull += 1) {
      const s = markPullStretch(-pull);
      expect(s, `at ${pull}`).toBeGreaterThanOrEqual(last);
      last = s;
    }
  });

  it('is a quarter taller at its full stretch, and holds there however far the page goes', () => {
    expect(markPullStretch(-MARK_PULL.full)).toBeCloseTo(0.25, 9);
    expect(markPullStretch(-3 * MARK_PULL.full)).toBeCloseTo(0.25, 9);
    expect(MARK_PULL_FRAME.extrapolate).toBe('clamp');
  });

  it('eases out like a rubber band: most of it in the first half of the pull', () => {
    expect(markPullStretch(-MARK_PULL.full / 2)).toBeGreaterThan(0.7 * MARK_PULL.stretch);
    expect(markPullStretch(-MARK_PULL.full / 4)).toBeGreaterThan(0.4 * MARK_PULL.stretch);
  });

  it('squashes slightly as it stretches: a tenth narrower at full stretch, never a pinch', () => {
    const full = markScales(MARK_PULL.stretch);
    expect(full.y).toBeCloseTo(1.25, 9);
    expect(full.x).toBeCloseTo(0.9, 9);
    expect(markScales(0)).toEqual({ x: 1, y: 1 });
  });

  it('writes its frame as `interpolate` wants it: in order, and sampled as the native side draws it', () => {
    const xs = MARK_PULL_FRAME.inputRange;
    for (let i = 1; i < xs.length; i += 1) expect(xs[i] ?? 0).toBeGreaterThan(xs[i - 1] ?? 0);
    expect(xs[0]).toBe(-MARK_PULL.full);
    expect(xs[xs.length - 1]).toBe(0);
    expect(markPullStretch(-12.5)).toBe(sampleFrame(MARK_PULL_FRAME, -12.5));
  });

  it('stays inside the bar at its full stretch, hanging from its top toward the page', () => {
    // the mark is centered on the chip's line in a bar TOP_BAR_MIN_HEIGHT tall, `space.md` above
    // its foot; stretched from its top, it grows down by a quarter of its size
    for (const width of [360, 375, 380, 430]) {
      const size = markSize(width);
      const grows = MARK_PULL.stretch * size;
      const chip = 31 + 2 * space.xs;
      const below = (chip - size) / 2 + space.md;
      expect(grows, `at ${width}`).toBeLessThan(below);
      expect(below).toBeLessThan(TOP_BAR_MIN_HEIGHT);
    }
  });
});

describe('letting go', () => {
  it('bounces after a pull that started a sync: once past its shape, a squash, and home inside 0.6 s', () => {
    const r = markRelease(-MARK_PULL.full, true);
    expect(r).not.toBeNull();
    const w = walk(r as MarkRun);
    // from exactly the stretch it had
    expect(r?.from).toBeCloseTo(MARK_PULL.stretch, 9);
    // past its shape the other way by about a quarter of that — a little wider, a little shorter
    expect(-w.lowest / MARK_PULL.stretch).toBeGreaterThan(0.15);
    expect(-w.lowest / MARK_PULL.stretch).toBeLessThan(0.35);
    // never so far that the heart would pinch: the squash stays within 10% of its height
    expect(markScales(w.lowest).y).toBeGreaterThan(0.9);
    // twice across its shape at most that anyone could see
    expect(w.crossings).toBeGreaterThanOrEqual(1);
    expect(w.settled).toBeLessThan(0.6);
  });

  it('simply springs home after a pull that fell short: no bounce, and nothing when nothing stretched', () => {
    const r = markRelease(-MARK_PULL.full / 2, false);
    expect(r?.spring).toEqual(MARK_SPRINGS.settle);
    const w = walk(r as MarkRun);
    expect(w.lowest).toBeGreaterThanOrEqual(-1e-6);
    expect(w.crossings).toBe(0);
    expect(w.settled).toBeLessThan(0.45);
    // a drag that never reached the top of the page moves nothing
    expect(markRelease(120, false)).toBeNull();
    expect(markRelease(0, false)).toBeNull();
  });

  it('critically damps the settle, and underdamps the bounce by about four tenths', () => {
    const zeta = ({ stiffness: k, damping: c, mass: m }: typeof MARK_SPRINGS.bounce) =>
      c / (2 * Math.sqrt(k * m));
    expect(zeta(MARK_SPRINGS.settle)).toBeCloseTo(1, 9);
    expect(zeta(MARK_SPRINGS.bounce)).toBeGreaterThan(0.35);
    expect(zeta(MARK_SPRINGS.bounce)).toBeLessThan(0.5);
  });

  it('gives a sync with no finger on the page (Android) the bounce from rest', () => {
    const r = markKick();
    expect(r).toEqual({ from: 0, velocity: MARK_KICK_VELOCITY, spring: MARK_SPRINGS.bounce });
    const w = walk(r);
    // up to a little over half a full pull, and a little past home the other way
    expect(w.highest).toBeGreaterThan(0.1);
    expect(w.highest).toBeLessThan(MARK_PULL.stretch);
    expect(w.lowest).toBeLessThan(0);
    expect(markScales(w.lowest).y).toBeGreaterThan(0.95);
    expect(w.settled).toBeLessThan(0.6);
    // and a sync that somehow started with nothing to let go of still gets it
    expect(markRelease(0, true)).toEqual(markKick());
  });

  it('waits for the finger on a page that is pulled past its top, and kicks at once otherwise', () => {
    // iOS: the sync starts mid-pull, and the letting go is the bounce
    expect(markOnSync(true, true)).toBe('wait');
    // Android: the refresh layout held the page still, and the sync starts as the finger lifts
    expect(markOnSync(true, false)).toBe('kick');
    expect(markOnSync(false, true)).toBe('kick');
    expect(markOnSync(false, false)).toBe('kick');
  });
});

describe('the hook (tripwires over useMarkPull.ts)', () => {
  const src = flat('useMarkPull.ts');

  it('holds still under reduce motion and in the amber Night: no style, no reports', () => {
    expect(src).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(src).toContain('if (still) return undefined;');
    expect(src).toContain('if (still || syncing) return;');
  });

  it('follows the pull only while a finger is on the page, and hands the heart to its spring', () => {
    expect(src).toContain('const stretch = Animated.add(Animated.multiply(pull, follow), bounce);');
    expect(src).toContain('follow.setValue(1);');
    expect(src).toContain('follow.setValue(0); bounce.setValue(r.from);');
    expect(src).toContain('const r = markRelease(offsetY, syncedInDrag.current);');
    expect(src).toContain(
      "if (markOnSync(dragging.current, PAGE_OVERSCROLLS) === 'wait') { syncedInDrag.current = true; return; }",
    );
    expect(src).toContain('dragging.current = false; spring(markKick());');
    expect(src).toContain("const PAGE_OVERSCROLLS = Platform.OS !== 'android';");
  });

  it('runs on the native driver, scales only', () => {
    expect(src).toContain('useNativeDriver: true');
    expect(src).not.toContain('useNativeDriver: false');
    expect(src).toMatch(/\{ scaleX: stretch\.interpolate\(/);
    expect(src).toMatch(/\{ scaleY: stretch\.interpolate\(/);
    expect(src).not.toMatch(/translate|rotate|opacity/);
  });
});

describe('the bar wears it (tripwires over TopBar.tsx)', () => {
  const src = flat('TopBar.tsx');

  it('hangs the heart from its top, and only when a page hands the stretch in', () => {
    expect(src).toContain(
      'markMotion === undefined ? ( mark ) : ( <Animated.View style={[{ transformOrigin: [size / 2, 0, 0] }, markMotion]}>',
    );
  });

  it('keeps the door: the stretched heart is still inside the same three-tap target', () => {
    expect(src).toContain('hitSlop={markHitSlop(width)}');
    expect(src).toContain('const tap = countMarkTap(doorRun.current, Date.now());');
    expect(src).toMatch(/testID: `\$\{testID\}\.markDoor`/);
    expect(src).toMatch(
      /\{heart\( <Mark size=\{size\} label=\{markLabel\} monogram=\{markMonogram\} door=\{markDoor\}/,
    );
  });

  it('asks for nothing Expo Go does not carry, and is never felt', () => {
    expect(src).not.toContain('haptic(');
    expect(src).not.toContain('reanimated');
  });
});
