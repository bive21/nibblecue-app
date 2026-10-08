/**
 * The About sheet's hidden credits as numbers: the seven taps that open them, and the stars they
 * open onto (the owner, 2026-09-25, of the "that's cool" list). Pure TypeScript, tested in node;
 * `StarfieldCredits.tsx` draws the stars and the About sheet counts its taps through `countTap`.
 *
 * SEVEN TAPS, EACH WITHIN TWO SECONDS OF THE LAST. The old convention — Android's build number
 * does the same — and a count that forgets a pause, so a parent who tapped the wordmark twice last
 * week and five times today opens nothing by accident. The first few taps feel like nothing; from
 * the fourth there is a light tick under the finger, which is the whole of the hint that something
 * is there; the seventh opens the sky.
 *
 * THE STARS ARE THREE LAYERS AT THREE SPEEDS — many small faint ones far away, fewer brighter ones
 * nearer, and a handful of near sparkles — each drifting slowly up and round for ever: a layer is
 * two copies of one screen's worth of stars stacked, moved up by one screen over its period, and
 * started again from the top, where the second copy is exactly where the first began. The nearer
 * the layer, the faster it goes, which is all the depth there is.
 */
import type { HapticKind } from '../feedback/haptics';
import { patternNoise } from '../theme/ground';

/* ------------------------------------------------------------------------ the taps */

export const EGG_TAPS = 7;
/** A pause longer than this starts the count again. */
export const EGG_IDLE_MS = 2000;
/** From this tap on, each one is felt: the only sign there is something to find. */
export const EGG_FELT_FROM = 4;

export interface TapRun {
  count: number;
  /** When the last tap in the run landed, in ms. */
  at: number;
}

export interface TapResult {
  /** The run to keep for the next tap; null once it has fired, so the next tap starts again. */
  run: TapRun | null;
  /** This tap's place in its run, 1 to the taps that open it (`EGG_TAPS` for the credits). */
  count: number;
  fired: boolean;
}

/**
 * One tap at `now`, after `run` (null for none). A clock that went backwards starts again. The
 * credits' seven-in-two-seconds is the default; the top bar's heart counts its own, shorter door
 * to the Night light with the same rule (`markDoor.ts`).
 */
export function countTap(
  run: TapRun | null,
  now: number,
  taps: number = EGG_TAPS,
  idleMs: number = EGG_IDLE_MS,
): TapResult {
  const continuing = run !== null && now >= run.at && now - run.at <= idleMs;
  const count = continuing ? run.count + 1 : 1;
  if (count >= taps) return { run: null, count, fired: true };
  return { run: { count, at: now }, count, fired: false };
}

/** What a tap feels like: nothing, then a tick from the fourth, then the arrival. */
export function tapFeel(result: TapResult): HapticKind | null {
  if (result.fired) return 'success';
  return result.count >= EGG_FELT_FROM ? 'tick' : null;
}

/* ------------------------------------------------------------------------ the stars */

export interface StarLayerPlan {
  key: 'far' | 'mid' | 'near';
  /** Stars per screen's worth of sky. */
  count: number;
  /** Diameter in points, least to most. */
  size: readonly [number, number];
  /** Each star's own strength, least to most. */
  alpha: readonly [number, number];
  kind: 'dot' | 'sparkle';
  /** How long the layer takes to drift one screen up. */
  periodMs: number;
}

export const STARFIELD_LAYERS: readonly StarLayerPlan[] = [
  { key: 'far', count: 44, size: [1, 1.8], alpha: [0.3, 0.6], kind: 'dot', periodMs: 150_000 },
  { key: 'mid', count: 20, size: [1.8, 2.8], alpha: [0.55, 0.9], kind: 'dot', periodMs: 100_000 },
  { key: 'near', count: 6, size: [6, 10], alpha: [0.85, 1], kind: 'sparkle', periodMs: 70_000 },
];

export interface FieldStar {
  /** Its center, in one screen's coordinates. */
  x: number;
  y: number;
  size: number;
  alpha: number;
}

export interface StarLayer {
  key: StarLayerPlan['key'];
  kind: StarLayerPlan['kind'];
  periodMs: number;
  stars: readonly FieldStar[];
}

const lerp = (range: readonly [number, number], k: number): number =>
  range[0] + (range[1] - range[0]) * k;

/**
 * One screen's worth of each layer. Deterministic — the same phone draws the same sky every time,
 * which is what lets a test say where the stars are — and scaled to the screen, so a tablet is not
 * a phone's sky with gaps in it: the counts are per phone-sized area, at least the plan's count.
 */
export function starfield(width: number, height: number): readonly StarLayer[] {
  const w = Math.max(0, width);
  const h = Math.max(0, height);
  if (w === 0 || h === 0)
    return STARFIELD_LAYERS.map(l => ({
      key: l.key,
      kind: l.kind,
      periodMs: l.periodMs,
      stars: [],
    }));
  // a 390 × 844 phone is the plan's area; a bigger screen gets more stars, never fewer
  const scale = Math.max(1, (w * h) / (390 * 844));
  return STARFIELD_LAYERS.map((layer, li) => {
    const n = Math.round(layer.count * scale);
    const stars: FieldStar[] = [];
    for (let i = 0; i < n; i += 1) {
      const size = lerp(layer.size, patternNoise(li, i, 3));
      // kept a whole star inside the screen across, so none is cut by the side of the phone
      const x = size / 2 + patternNoise(li, i, 1) * (w - size);
      const y = patternNoise(li, i, 2) * h;
      stars.push({ x, y, size, alpha: lerp(layer.alpha, patternNoise(li, i, 4)) });
    }
    return { key: layer.key, kind: layer.kind, periodMs: layer.periodMs, stars };
  });
}

/**
 * A layer's drift, in the shape `Animated.Value#interpolate` takes: the value runs 0 → 1 over the
 * layer's period, looped, and the layer — two screens tall, the same stars twice — moves up by one
 * screen, so the frame after 1 is the frame at 0.
 */
export function driftFrames(height: number): {
  inputRange: [number, number];
  outputRange: [number, number];
} {
  return { inputRange: [0, 1], outputRange: [0, -Math.max(0, height)] };
}
