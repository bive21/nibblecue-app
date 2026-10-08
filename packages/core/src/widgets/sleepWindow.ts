/**
 * THE SLEEP WINDOW ON THE LOCK SCREEN (the owner's handoff, 2026-10-08, "Sleep window · Option 2"):
 * the nap outlook's own next-sleep estimate (`schedule/naps.ts`), as the state a live surface draws.
 * Nothing is predicted here: the estimate is the outlook's, and this only says where the clock is
 * against it — before it, inside its window, or past it — and what the card may offer.
 *
 *   before   the estimate is ahead: "In 35 min", Start sleep
 *   open     inside a real window, both ends included: "Window now", Start sleep
 *   passed   past it, for `SLEEP_WINDOW_GRACE_MS`: "Window has passed" (a point: "Check sleep"),
 *            and Update sleep, which opens the app and writes nothing
 *   null     nothing to show: asleep, no estimate, a log with a gap, the night, or the grace over
 *
 * A RANGE ONLY FROM REAL BOUNDS: the outlook's own window (2026-10-08, `schedule/napWindow.ts`),
 * sized by how far off this household's past estimates have been. Without one (an outlook read
 * before its window is laid on) the card says "Around 2:20 PM" and draws no rail, and never invents
 * a range around a point here. The rail is time only — where the clock is between waking and the
 * window's end — never a readiness, a confidence or a score.
 *
 * Every countdown rounds up to the minute, and under a minute says "<1 min", never "0 min" and
 * never an early "Window now". A forecast never starts a sleep; only a parent's tap does.
 */
export type SleepWindowPhase = 'before' | 'open' | 'passed';

/** How long a passed estimate stays on the lock screen before it goes: a presentation default. */
export const SLEEP_WINDOW_GRACE_MS = 15 * 60_000;

export interface SleepWindowInput {
  /** The outlook's state: only 'awake' has a next sleep to show. */
  state: string;
  awakeSinceMs: number | null;
  /** The outlook's estimate for the next sleep, a point. */
  nextAtMs: number | null;
  nextKind: 'nap' | 'night' | null;
  /** The outlook could not count a window from the log (a gap): nothing is shown. */
  gap: boolean;
  /** Real bounds, when the outlook has them; absent today. */
  windowStartMs?: number | null;
  windowEndMs?: number | null;
}

export interface SleepWindowView {
  phase: SleepWindowPhase;
  kind: 'nap' | 'night';
  mode: 'window' | 'point';
  startMs: number;
  endMs: number;
  awakeSinceMs: number;
  /** "In 35 min" · "In <1 min" · "Window now" · "Window has passed" · "Check sleep". */
  status: string;
  /** The Dynamic Island's short form: "35m" · "<1m" · "Now" · "". */
  compact: string;
  /** Whole minutes awake, never seconds. */
  awakeMinutes: number;
  /** Bounded windows only: the clock's place and the window's start on [waking, window end]. */
  rail: { marker: number; bandStart: number } | null;
  action: 'start' | 'update';
}

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/** "35 min" rounded up, "<1 min" under a minute; "1h 5m" past the hour. */
export function untilWords(ms: number): { long: string; short: string } {
  if (ms < 60_000) return { long: '<1 min', short: '<1m' };
  const minutes = Math.ceil(ms / 60_000);
  if (minutes < 60) return { long: `${minutes} min`, short: `${minutes}m` };
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return { long: `${h}h ${m}m`, short: `${h}h${m === 0 ? '' : ` ${m}m`}` };
}

export function sleepWindowState(input: SleepWindowInput, nowMs: number): SleepWindowView | null {
  if (input.state !== 'awake' || input.gap) return null;
  const wake = input.awakeSinceMs;
  const at = input.nextAtMs;
  const kind = input.nextKind;
  if (wake === null || at === null || kind === null || wake > nowMs) return null;
  const s = input.windowStartMs ?? null;
  const e = input.windowEndMs ?? null;
  const bounded = s !== null && e !== null && wake < s && s < e;
  const startMs = bounded ? s : at;
  const endMs = bounded ? e : at;
  if (nowMs > endMs + SLEEP_WINDOW_GRACE_MS) return null;
  const phase: SleepWindowPhase =
    nowMs < startMs ? 'before' : nowMs <= endMs && bounded ? 'open' : 'passed';
  const until = untilWords(startMs - nowMs);
  const status =
    phase === 'before'
      ? SLEEP_WINDOW_COPY.inMinutes(until.long)
      : phase === 'open'
        ? SLEEP_WINDOW_COPY.windowNow
        : passedStatus(bounded ? 'window' : 'point');
  const compact = phase === 'before' ? until.short : phase === 'open' ? 'Now' : '';
  const span = endMs - wake;
  return {
    phase,
    kind,
    mode: bounded ? 'window' : 'point',
    startMs,
    endMs,
    awakeSinceMs: wake,
    status,
    compact,
    awakeMinutes: Math.floor((nowMs - wake) / 60_000),
    rail:
      bounded && phase !== 'passed'
        ? { marker: clamp01((nowMs - wake) / span), bandStart: clamp01((startMs - wake) / span) }
        : null,
    action: phase === 'passed' ? 'update' : 'start',
  };
}

/** What a passed estimate says: a window that was real, or a point to check against the log. */
export const passedStatus = (mode: 'window' | 'point'): string =>
  mode === 'window' ? SLEEP_WINDOW_COPY.windowPassed : SLEEP_WINDOW_COPY.checkSleep;

export const SLEEP_WINDOW_COPY = {
  inMinutes: (until: string): string => `In ${until}`,
  windowNow: 'Window now',
  windowPassed: 'Window has passed',
  checkSleep: 'Check sleep',
  nextNap: 'Next nap',
  bedtime: 'Bedtime',
  identity: (kind: 'nap' | 'night', name: string): string =>
    `${kind === 'night' ? 'Bedtime' : 'Next nap'}${name.trim() === '' ? '' : ` · ${name.trim()}`}`,
  around: (clock: string): string => `Around ${clock}`,
  awake: 'Awake',
  awakeSince: (clock: string): string => `Awake since ${clock}`,
  startSleep: 'Start sleep',
  updateSleep: 'Update sleep',
} as const;
