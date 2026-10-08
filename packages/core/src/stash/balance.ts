/**
 * The dashboard's arithmetic (docs/MILK_STASH.md §9, §10, §11): buckets by condition, the
 * seven-day pumped/used pair, the week a day at a time, and the ledger's own identity
 *
 *     start_of_week + pumped − used − discarded + corrected = current
 *
 * with every term read from the ledger. `MOVE`, `THAW` and `SPLIT` are net-zero (0 on one row,
 * or −n/+n across two), so they cannot move the balance — balance.test.ts asserts it.
 *
 * PUMPED IS `ADD`, USED IS `USE`, DISCARDED IS `DISCARD`, AND CORRECTED IS EVERY OTHER `ADJUST`
 * (the owner, 2026-09-24). An ADJUST is a correction of the count, not milk moving: a parent's
 * "Correct the amount" and the last few ml a bottle leaves behind. No screen draws the corrected
 * figure since 2026-09-27 (the owner, of Reports: *"dont think we need to know correct # as it does
 * not make sense"*): the screens draw what went in, what came out and what is in the stash now,
 * and none of them presents those as a sum that has to close (`stashWeekDays` below, Reports'
 * `stashWeek.ts`, the Stash screen's `weekLegend`). The identity stays here as the books' own
 * check, which the scenario tests hold the ledger to.
 *
 * A WRITE AND ITS UNDO CANCEL OUT, BEFORE ANYTHING IS SUMMED (2026-09-27; `withoutUndone`). The
 * ledger is append-only, so an Undo that reaches a row the server already has cannot unwrite it:
 * it appends the same amount the other way (`data/undo.ts` `compensate`). Counted by kind, the
 * pair read as milk pumped AND milk corrected — the owner's trial entry from the first-run tour,
 * saved into the stash and taken back when the tour ended, was on Reports as "Pumped +4 oz" and
 * "Corrected −4 oz". An Undo means it never happened: the entry is already gone from the Log and
 * Today, its bag is gone from the stash, and an Undo that ran before the write left the phone
 * leaves no row at all. Now the arithmetic agrees, on every phone and for rows written before
 * this was fixed, because the pair names itself: the compensating row's id is derived from the
 * row it takes back, the same derivation on every phone and on the server.
 */
import { volumeAsRead, type VolumeUnit } from '../entry/units';
import { deriveOpId } from '../sync/ids';
import { localDayBounds, shiftDay, wallClock } from '../today/day';
import {
  IN_STASH_STATUSES,
  isFrozenKind,
  NET_ZERO_KINDS,
  type MilkContainerStatus,
  type MilkStorageKind,
  type MilkTxnKind,
} from './constants';

export interface LedgerLine {
  /** The row's own id. For every row the app writes it is also its `client_op_id`. */
  id: string;
  /** The op that wrote the row: what an Undo's compensating row takes its id from. */
  client_op_id: string;
  kind: MilkTxnKind;
  delta_ml: number;
  occurred_at: string;
  /**
   * The entry the row belongs to — the bottle a USE poured, the pump session an ADD stored — or
   * null for milk added or thrown out by hand. Only what a sum in the household's unit groups by
   * (`entriesOf`); absent on a row read without it, which then counts on its own.
   */
  activity_id?: string | null;
}

/**
 * THE LEDGER AS THE AMOUNTS A PARENT ENTERED (the pre-launch sweep, 2026-09-27): the draws one
 * bottle took from two bags are ONE amount — the bottle — and so are the parts one pump session was
 * stored in; every other row is its own. A sum written in the household's unit adds these up as
 * each reads (`volumeAsRead`), never the parts of one: a 4 oz bottle drawn as 107 + 11 ml is
 * 3.5 + 0.25 oz part by part, and 4 oz as the bottle it is. Rows of one entry share its moment, so
 * they fall in one day. The sums of stored ml are the same either way.
 */
function entriesOf<T extends Pick<LedgerLine, 'id' | 'kind' | 'delta_ml' | 'activity_id'>>(
  rows: readonly T[],
): { kind: MilkTxnKind; delta_ml: number }[] {
  const out = new Map<string, { kind: MilkTxnKind; delta_ml: number }>();
  for (const r of rows) {
    const entry = r.activity_id ?? null;
    const key =
      entry !== null && (r.kind === 'USE' || r.kind === 'ADD')
        ? `${r.kind}:${entry}`
        : `row:${r.id}`;
    const e = out.get(key);
    if (e === undefined) out.set(key, { kind: r.kind, delta_ml: r.delta_ml });
    else e.delta_ml += r.delta_ml;
  }
  return [...out.values()];
}

/**
 * The id of the row an Undo writes to take `row` back: `deriveOpId(<the op it undoes>, 'undo')`,
 * exactly as `data/undo.ts` mints it, so a retried Undo is the same row and not a second one.
 * Null for a row whose op id is not a uuid (a hand-written fixture), which nothing can undo.
 */
export function undoIdOf(row: Pick<LedgerLine, 'client_op_id'>): string | null {
  try {
    return deriveOpId(row.client_op_id, 'undo');
  } catch {
    return null;
  }
}

/**
 * THE LEDGER WITH EVERY UNDONE WRITE TAKEN OUT: each row whose Undo is also in `rows`, and that
 * Undo with it. The two always sum to nothing — the Undo is the same amount the other way — so no
 * balance moves; only the sums by kind change, which is the point.
 *
 * WHAT IT NEVER TAKES OUT. A parent's "Correct the amount" and a bottle's written-off remainder are
 * ADJUSTs with ids of their own, not an Undo of anything, and a delete from the Log returns a
 * bottle's milk under the delete's own id (`data/entries.ts`); all of those stay, because each is a
 * real change to what is in the stash. Only a row that names another row as the one it takes back
 * is paired, and only while both are here — an Undo whose row fell before the window stays as the
 * ADJUST it is, which moves no flow a screen draws.
 */
export function withoutUndone<T extends Pick<LedgerLine, 'id' | 'client_op_id'>>(
  rows: readonly T[],
): T[] {
  const ids = new Set(rows.map(r => r.id));
  const gone = new Set<string>();
  for (const r of rows) {
    if (gone.has(r.id)) continue;
    const undo = undoIdOf(r);
    if (undo === null || undo === r.id || !ids.has(undo)) continue;
    gone.add(r.id);
    gone.add(undo);
  }
  return gone.size === 0 ? [...rows] : rows.filter(r => !gone.has(r.id));
}

export interface LedgerWindow {
  /** `ADD` rows: milk that went into the stash, from a pump or added by hand. */
  pumpedMl: number;
  usedMl: number;
  discardedMl: number;
  /**
   * Upward `ADJUST` rows: a correction up, or a delete from the Log that put a bottle's milk back.
   * An Undo is never here when the write it took back is in the rows (`withoutUndone`).
   */
  adjustedUpMl: number;
  /** Downward `ADJUST` rows: a correction down, a bottle's last few ml written off. */
  adjustedDownMl: number;
  /**
   * HOW MANY USE ENTRIES, AND HOW MUCH HISTORY THEY ARE SPREAD OVER — what tells a rate from an
   * anecdote (`outlook.ts`). The days-left column divided by seven whether or not the household
   * had lived seven days, and divided by a sample of one as readily as by a sample of twenty.
   */
  useCount: number;
  /** The earliest row in the window, or null when it is empty. */
  firstAtMs: number | null;
}

const at = (iso: string): number => Date.parse(iso);

/**
 * The sums over rows at or after `sinceMs`, with every undone write taken out first
 * (`withoutUndone`). Pairing reads every row it is handed, so a caller that reads a little before
 * the window lets an Undo inside it find a write just outside.
 *
 * `unit` is the household's milk unit, for a window a screen writes out: each amount a parent
 * entered — a bag, a session, a bottle — is added as it reads (`entriesOf`, `volumeAsRead`), so a
 * week of 4 oz bags is the ounces that went in. In ml, and without one, the plain sums of
 * `delta_ml` — the books, which the balance identity is checked in.
 */
export function ledgerWindow(
  rows: readonly LedgerLine[],
  sinceMs: number,
  unit: VolumeUnit = 'ml',
): LedgerWindow {
  const ml = (delta: number): number => volumeAsRead(delta, unit);
  const w: LedgerWindow = {
    pumpedMl: 0,
    usedMl: 0,
    discardedMl: 0,
    adjustedUpMl: 0,
    adjustedDownMl: 0,
    useCount: 0,
    firstAtMs: null,
  };
  const inWindow = withoutUndone(rows).filter(r => !(at(r.occurred_at) < sinceMs));
  for (const r of inWindow) {
    const ms = at(r.occurred_at);
    if (Number.isFinite(ms) && (w.firstAtMs === null || ms < w.firstAtMs)) w.firstAtMs = ms;
    if (r.kind === 'USE') w.useCount += 1;
  }
  for (const e of entriesOf(inWindow)) {
    if (e.kind === 'ADD' && e.delta_ml > 0) w.pumpedMl += ml(e.delta_ml);
    else if (e.kind === 'USE') w.usedMl += ml(-e.delta_ml);
    else if (e.kind === 'DISCARD') w.discardedMl += ml(-e.delta_ml);
    else if (e.kind === 'ADJUST' && e.delta_ml > 0) w.adjustedUpMl += ml(e.delta_ml);
    else if (e.kind === 'ADJUST' && e.delta_ml < 0) w.adjustedDownMl += ml(-e.delta_ml);
  }
  return w;
}

/** Every correction in the window, signed: up minus down. */
const correctedMl = (w: { adjustedUpMl: number; adjustedDownMl: number }): number =>
  w.adjustedUpMl - w.adjustedDownMl;

export interface WeeklyBalance extends LedgerWindow {
  weekStartMs: number;
  currentMl: number;
  /** Derived from the identity, never stored — the books' check, not a figure any screen draws. */
  startMl: number;
  /**
   * `adjustedUpMl − adjustedDownMl`: the term that closes the identity. Not drawn since 2026-09-27
   * (see the header): a parent reads what went in and what came out, never a correction.
   */
  correctedMl: number;
}

/** Monday 00:00 in the household's zone, like Postgres' `date_trunc('week')`. */
export function weekStartMs(timeZone: string, nowMs: number): number {
  const w = wallClock(timeZone, nowMs);
  // `Wall` has no weekday, so derive it from the local date at noon (immune to DST edges)
  const noon = Date.UTC(w.year, w.month - 1, w.day, 12);
  const weekday = new Date(noon).getUTCDay(); // 0 = Sunday
  const back = (weekday + 6) % 7; // days since Monday
  return back === 0
    ? localDayBounds(timeZone, nowMs).startMs
    : shiftDay(timeZone, nowMs, -back).startMs;
}

export function weeklyBalance(
  rows: readonly LedgerLine[],
  weekStart: number,
  currentMl: number,
): WeeklyBalance {
  const w = ledgerWindow(rows, weekStart);
  const corrected = correctedMl(w);
  return {
    ...w,
    weekStartMs: weekStart,
    currentMl,
    correctedMl: corrected,
    startMl: currentMl - w.pumpedMl + w.usedMl + w.discardedMl - corrected,
  };
}

export const isNetZeroKind = (kind: MilkTxnKind): boolean => NET_ZERO_KINDS.includes(kind);

/**
 * ONE DAY OF THE STASH'S WEEK: what went into it and what came out of it, from its own ledger
 * (Reports' "Milk stash, this week", 2026-09-27).
 *
 * IN is `ADD` (a pump saved to the stash, or milk added by hand); OUT is `USE` and `DISCARD`
 * together (poured into a bottle, or thrown out), with the two kept apart for the words under the
 * figure. A correction is neither: it is the count put right, not milk that moved, and it is in
 * "now" and nowhere else. Every undone write is out before anything is counted (`withoutUndone`).
 */
export interface StashDay {
  startMs: number;
  endMs: number;
  inMl: number;
  usedMl: number;
  discardedMl: number;
  /** `usedMl + discardedMl`. */
  outMl: number;
  /**
   * WHETHER THE STASH HAD ANY ENTRY THAT DAY. A day it had none is a gap in its book and is drawn
   * as one — a dash, never a zero — the rule every picture on Reports keeps; a day with a bottle
   * drawn and nothing added has an entry, and its IN is a true 0.
   */
  logged: boolean;
  /** A day of this week still to come: drawn as an empty column, never a figure. */
  ahead: boolean;
}

export interface StashWeek {
  weekStartMs: number;
  /** Monday to Sunday in the household's zone. */
  days: StashDay[];
  /** The index of today in `days`. */
  today: number;
  inMl: number;
  usedMl: number;
  discardedMl: number;
  outMl: number;
  /** How many `ADD` rows went in, and how many `USE` rows came out: counts, never a rate. */
  adds: number;
  uses: number;
  discards: number;
}

/**
 * The week from Monday 00:00 in the household's zone (`weekStartMs`), a day at a time. `rows` may
 * reach further back than the week — pairing an Undo with its write reads all of them — and only
 * what falls inside a day of this week is counted. `unit` is the household's milk unit: each amount
 * a parent entered — a bag, a session, a bottle — is added as it reads (`entriesOf`,
 * `volumeAsRead`), as every figure a parent reads is. The counts are still of rows.
 */
export function stashWeekDays(
  rows: readonly LedgerLine[],
  timeZone: string,
  nowMs: number,
  unit: VolumeUnit = 'ml',
): StashWeek {
  const start = weekStartMs(timeZone, nowMs);
  const days: StashDay[] = [];
  for (let i = 0; i < 7; i += 1) {
    const b = i === 0 ? localDayBounds(timeZone, start) : shiftDay(timeZone, start, i);
    days.push({
      startMs: b.startMs,
      endMs: b.endMs,
      inMl: 0,
      usedMl: 0,
      discardedMl: 0,
      outMl: 0,
      logged: false,
      ahead: b.startMs > nowMs,
    });
  }
  const week: StashWeek = {
    weekStartMs: start,
    days,
    today: Math.max(
      0,
      days.findIndex(d => nowMs >= d.startMs && nowMs < d.endMs),
    ),
    inMl: 0,
    usedMl: 0,
    discardedMl: 0,
    outMl: 0,
    adds: 0,
    uses: 0,
    discards: 0,
  };
  const byDay = new Map<StashDay, LedgerLine[]>();
  for (const r of withoutUndone(rows)) {
    const ms = at(r.occurred_at);
    if (!Number.isFinite(ms) || ms > nowMs) continue;
    const day = days.find(d => ms >= d.startMs && ms < d.endMs);
    if (day === undefined) continue;
    day.logged = true;
    if (r.kind === 'ADD' && r.delta_ml > 0) week.adds += 1;
    else if (r.kind === 'USE' && r.delta_ml < 0) week.uses += 1;
    else if (r.kind === 'DISCARD' && r.delta_ml < 0) week.discards += 1;
    const list = byDay.get(day);
    if (list === undefined) byDay.set(day, [r]);
    else list.push(r);
  }
  // the amounts, a day at a time: each bag, session and bottle as it reads (`entriesOf`)
  for (const [day, dayRows] of byDay) {
    for (const e of entriesOf(dayRows)) {
      const ml = volumeAsRead(Math.abs(e.delta_ml), unit);
      if (e.kind === 'ADD' && e.delta_ml > 0) {
        day.inMl += ml;
        week.inMl += ml;
      } else if (e.kind === 'USE' && e.delta_ml < 0) {
        day.usedMl += ml;
        week.usedMl += ml;
      } else if (e.kind === 'DISCARD' && e.delta_ml < 0) {
        day.discardedMl += ml;
        week.discardedMl += ml;
      }
    }
  }
  for (const d of days) d.outMl = d.usedMl + d.discardedMl;
  week.outMl = week.usedMl + week.discardedMl;
  return week;
}

export interface StashBuckets {
  totalMl: number;
  /** Fridge and room together (§10: `ROOM` counts with fridge). */
  fridgeMl: number;
  thawedMl: number;
  frozenMl: number;
  containers: number;
  thawing: number;
}

/**
 * The stash by condition. `unit` is the household's milk unit: each container is added as it reads
 * (`volumeAsRead`), so thirteen 4 oz bags are 52 oz and not the 51.75 their stored ml add up to.
 */
export function stashBuckets(
  list: readonly { amountMl: number; kind: MilkStorageKind; status: MilkContainerStatus }[],
  unit: VolumeUnit = 'ml',
): StashBuckets {
  const b: StashBuckets = {
    totalMl: 0,
    fridgeMl: 0,
    thawedMl: 0,
    frozenMl: 0,
    containers: 0,
    thawing: 0,
  };
  for (const c of list) {
    if (!IN_STASH_STATUSES.includes(c.status)) continue;
    const ml = volumeAsRead(c.amountMl, unit);
    b.totalMl += ml;
    b.containers += 1;
    if (c.status === 'THAWING' || c.kind === 'THAWED') {
      b.thawedMl += ml;
      b.thawing += 1;
    } else if (isFrozenKind(c.kind)) b.frozenMl += ml;
    else b.fridgeMl += ml;
  }
  return b;
}
