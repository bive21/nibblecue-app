/**
 * THE NAP OUTLOOK ON THE CLOCK EACH SLEEP HAPPENED ON — for a phone that has been somewhere else.
 *
 * The engine (`naps.ts`) reads clock times — the usual morning, the usual bedtime, the clock a nap
 * tends to start at — through one day boundary. With ONE zone for the whole log, a week away is a
 * week of every sleep sitting hours from its usual clock time, and a week of history pulling the
 * other way once home. Following the phone's CURRENT zone instead does not help: it moves the
 * history by the same hours the trip did, so the engine sees the same difference, and past about
 * five hours a morning at home reads as the afternoon on the new clock.
 *
 * A baby does not live in a zone. It lives by the clock on the wall where it is, and after a flight
 * its body catches up with that clock over a few days. So here each sleep is read on the clock of
 * the zone this phone was in when the sleep began (`today/travel.ts` keeps that record), and a trip
 * reaches the engine as what it is for the baby — the clocks jumped and the baby is catching up —
 * which is the case the engine already follows for a clock change.
 *
 * WHAT IT BUYS, MEASURED (`naps.scenarios.test.ts`, the trip twice on the same households, and a
 * sweep of trips one to three zones east and west at four speeds of catching up): the days of the
 * stay itself come out better in every case, a fifth better typically, and the week after coming
 * home in all but one. The flight home's own two days are the weaker ones, because the baby is
 * then off the home clock by the whole of what it caught up. Past five or six zones the bench's
 * babies stop being believable and neither reading is good; that is written down in
 * `docs/NAP_OUTLOOK.md` §6.3 rather than tuned for.
 *
 * HOW. Every instant becomes its own wall-clock reading, "local time as if it were UTC"; the engine
 * runs on those with plain UTC days; the instants it answers with are turned back into real ones.
 * Inside one zone that is the household's own clock, so at home it changes nothing at all (the test
 * pins the outlook identical, glance for glance over a simulated population). It also reads a
 * clock change's own day by the clock on the wall: on the morning the clocks spring forward, a nap
 * at 9:00 is at 9:00, where counting minutes from midnight read it as 8:00 and put the usual 9:00
 * nap at 10:00.
 *
 * THE THREE RULES AT A ZONE CHANGE.
 *   * THE NEW CLOCK STARTS WITH THE FIRST NIGHT SLEPT THERE. On the landing day the baby's body is
 *     still on the clock it left, so that day's naps stay on it; a household that logs no nights
 *     moves a day after the phone did. (Moving at the first sleep after landing was measured too:
 *     the landing day then read hours off and pulled on the days after it.)
 *   * A CHANGE THAT WOULD RUN THE LOG BACKWARDS WAITS — a flight west that landed less than the
 *     time difference after the last sleep ended. The engine cannot read a log out of order, and
 *     the stretch across a flight is not a window anyone would want it to learn from.
 *   * "NOW" IS READ ON THE CLOCK OF THE LAST SLEEP LOGGED, not the phone's, so how long the baby
 *     has been awake is never stretched or shrunk by a time difference.
 */
import { zoneOffsetMs } from '../today/day';
import { isKnownZone, zoneAt, type ZoneSpan } from '../today/travel';
import { napOutlook, type NapOutlook, type SleepLog } from './naps';
import { MIN } from './types';

const DAY = 24 * 60 * MIN;

/** Which clock an instant is read on. */
export interface LocalClocks {
  /** The zone this phone was reading times in at an instant. */
  zoneAt(ms: number): string;
  /** A zone's offset from UTC at an instant, ms east-positive — `zoneOffsetMs` on a real phone. */
  offsetMs(zone: string, ms: number): number;
}

/**
 * The clocks for a real phone: its record of zones, the home zone before the record begins, and
 * the IANA rules through `Intl`.
 *
 * The outlook re-reads the whole log every minute and `Intl` is not free on a phone, so the offsets
 * come from `zoneOffsetMs`, which asks `Intl` once per quarter hour and remembers — for every
 * caller at once, and checked rather than assumed: this file used to keep its own memo on the
 * belief that no quarter hour of UTC holds two offsets, and a few in the zone database do
 * (`today/day.ts`).
 */
export function zoneClocks(record: readonly ZoneSpan[], fallback: string): LocalClocks {
  const unreadable = new Set<string>();
  return {
    zoneAt: ms => zoneAt(record, ms, fallback),
    offsetMs: (zone, ms) => {
      if (unreadable.has(zone)) return 0;
      try {
        return zoneOffsetMs(zone, ms);
      } catch {
        // a zone this runtime cannot read: its instants read as UTC rather than throwing on Today,
        // and it is not asked again — a throw per sleep, every minute, is what the memo saved
        if (!isKnownZone(zone)) unreadable.add(zone);
        return 0;
      }
    },
  };
}

/** The instant a zone's wall clock reads `wall` — the later one where the clocks skipped it. */
function fromWall(zone: string, wall: number, clocks: LocalClocks): number {
  const a = wall - clocks.offsetMs(zone, wall);
  if (a + clocks.offsetMs(zone, a) === wall) return a;
  const b = wall - clocks.offsetMs(zone, a);
  if (b + clocks.offsetMs(zone, b) === wall) return b;
  return Math.max(a, b);
}

const utcDayStart = (wall: number): number => Math.floor(wall / DAY) * DAY;

/** `napOutlook`, with every sleep read on the clock of the zone it began in. */
export function napOutlookOnLocalClocks(
  logs: readonly SleepLog[],
  nowMs: number,
  clocks: LocalClocks,
): NapOutlook {
  const wallOf = (zone: string, ms: number): number => ms + clocks.offsetMs(zone, ms);
  // what the engine would read at `nowMs`, decided on the REAL clock before any sleep moves: a
  // sleep not yet begun is left out, one still running at `nowMs` is running, an empty one is noise
  const sorted = logs
    .filter(s => s.startMs <= nowMs && (s.endMs === null || s.startMs < s.endMs))
    .map(s => (s.endMs !== null && s.endMs > nowMs ? { ...s, endMs: null } : s))
    .sort((a, b) => a.startMs - b.startMs);
  const local: SleepLog[] = [];
  // every wall reading of an instant the log itself holds, back to the instant: exact, where
  // turning a wall time back through the zone is ambiguous for the hour a clock repeats
  const real = new Map<number, number>();
  let zone: string | null = null;
  let floor = Number.NEGATIVE_INFINITY;

  /** Reads one sleep on `z`'s clock and adds it to the log the engine sees. In order, always. */
  const commit = (s: SleepLog, z: string): void => {
    // a zone change that would run the log backwards waits in the zone the log is in
    const at = zone !== null && z !== zone && wallOf(z, s.startMs) < floor ? zone : z;
    // the hour a clock repeats in the fall can still put one start a little before the last end
    const startMs = Math.max(wallOf(at, s.startMs), floor);
    const endMs = s.endMs === null ? null : Math.max(startMs, wallOf(at, s.endMs));
    local.push({ ...s, startMs, endMs });
    real.set(startMs, s.startMs);
    if (endMs !== null && s.endMs !== null) real.set(endMs, s.endMs);
    floor = endMs ?? startMs;
    zone = at;
  };

  /*
    THE NEW CLOCK STARTS WITH THE FIRST NIGHT SLEPT THERE. The sleeps after the phone noticed a new
    zone stay on the old clock until a night begins on the new one: on a landing day the baby's
    body is still on the clock it left, and the naps it takes are nearer that clock's than the one
    on the wall. A household that logs no nights moves a day after the phone did.
  */
  let askedSince: number | null = null;
  for (const s of sorted) {
    const want = clocks.zoneAt(s.startMs);
    const current: string | null = zone;
    if (current === null || want === current) {
      askedSince = null;
      commit(s, want);
      continue;
    }
    askedSince ??= s.startMs;
    const settled = s.kind === 'NIGHT' || s.startMs - askedSince >= DAY;
    commit(s, settled ? want : current);
    if (zone === want) askedSince = null;
  }

  const nowZone = zone ?? clocks.zoneAt(nowMs);
  const o = napOutlook(local, Math.max(wallOf(nowZone, nowMs), floor), utcDayStart);
  /** A moment the log holds (a sleep's start or end), back to the instant it was. */
  const logged = (wall: number | null): number | null =>
    wall === null ? null : (real.get(wall) ?? fromWall(nowZone, wall, clocks));
  /** A moment the engine worked out, back to an instant on the clock the baby is on now. */
  const back = (wall: number | null): number | null =>
    wall === null ? null : fromWall(nowZone, wall, clocks);

  const awakeSinceMs = logged(o.awakeSinceMs);
  const asleepSinceMs = logged(o.asleepSinceMs);
  return {
    ...o,
    awakeSinceMs,
    // durations are counted again on the real clock, so a clock change overnight is never an hour
    // more or less of being awake
    awakeForMs: o.awakeForMs === null || awakeSinceMs === null ? null : nowMs - awakeSinceMs,
    asleepSinceMs,
    asleepForMs: o.asleepForMs === null || asleepSinceMs === null ? null : nowMs - asleepSinceMs,
    usualStartMs: back(o.usualStartMs),
    nextAtMs: back(o.nextAtMs),
    wakeAtMs: back(o.wakeAtMs),
    usualMorningMs: back(o.usualMorningMs),
  };
}
