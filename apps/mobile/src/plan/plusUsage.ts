/**
 * WHAT THE HOUSEHOLD USED OF PLUS DURING THE PREVIEW, COUNTED ON THIS PHONE (the owner, 2026-09-28:
 * *"From marketing point of view, how can I sell the system more? … what else can we do with the
 * app to ensure they will subscribe to us?"*).
 *
 * The trial-end sheets used to say one personal thing, the count of entries. What a parent is about
 * to give up is not a number of rows but the parts of the app they have been reaching for, so the
 * sheets and the "preview ended" card now say that as well, in plain counts: *"In your preview: the
 * nap outlook on 6 days, Night on 4 nights, Reports on 3 days."* The sentence is `previewRecap`
 * (`promptCopy.ts`); this file is the count under it.
 *
 * WHAT IS COUNTED, AND WHERE. Every surface that wears the quiet "Plus" tag during the preview
 * records the local day it was drawn (`usePlusTag`, `PlusTag.tsx`): the same places, so a recap can
 * only name something the parent was shown was Plus while they used it. Night and the colors are
 * the exception, counted where they are PAINTED rather than where they are chosen
 * (`PlusUsageWatch`): the Appearance sheet is opened once, and Night is used every night it is on.
 * Nothing is counted outside the preview, because a tag is drawn only inside it.
 *
 * A NIGHT RUNS NOON TO NOON (`usageDay`), so the 9 p.m. feed and the 2 a.m. one are one night of
 * Night, as a parent would count it; every other surface counts calendar days on the phone's clock.
 *
 * CHEAP, AND ON THIS PHONE ONLY. A day is a ten-character string, each surface keeps at most
 * `USAGE_DAYS_KEPT` of them, the whole record is one prefs value per person and household, and it is
 * read and written at most once per surface per day (`notePlusUse`). No database table, no network:
 * it is not analytics and never leaves the phone, and it goes with every other household key on
 * sign-out or when the household leaves the phone (`prefs/index.ts`, which keeps only device keys).
 *
 * Pure except for `notePlusUse` and `readPlusUsage`, which take the store they write to, so the
 * mobile suite (node, nothing mounted) reads every rule here directly.
 */
import type { KeyValueStore } from '../prefs';

/** Every surface the recap can name, in the order a tie is broken. */
export const PLUS_USES = [
  'napOutlook',
  'reports',
  'history',
  'stashOrder',
  'fromLog',
  'dayPlans',
  'night',
  'colors',
  'glass',
] as const;
export type PlusUse = (typeof PLUS_USES)[number];

/** Distinct local days each surface was used on, oldest first. */
export type PlusUsage = Readonly<Partial<Record<PlusUse, readonly string[]>>>;

/** The unit a surface is counted in: days, or for Night, nights. */
export const USE_UNIT: Readonly<Record<PlusUse, 'day' | 'night'>> = {
  napOutlook: 'day',
  reports: 'day',
  history: 'day',
  stashOrder: 'day',
  fromLog: 'day',
  dayPlans: 'day',
  night: 'night',
  colors: 'day',
  glass: 'day',
};

/**
 * How many days each surface keeps. The preview is 14 days (core's `WELCOME_DAYS`); a phone clock
 * moved about, or a support extension, can add a few, and past this the count is not a sentence
 * anybody needs. The oldest day goes first.
 */
export const USAGE_DAYS_KEPT = 31;

const HOUR_MS = 3_600_000;
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

const pad = (n: number): string => String(n).padStart(2, '0');

/** A day on the phone's own calendar: `2026-09-20`. */
const localDay = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * THE DAY A USE IS COUNTED ON: the phone's own calendar day, and for Night the evening it belongs
 * to, noon to noon (the header says why). Local, like the trial sheet's end date (`endsOnLabel`):
 * a parent counts days on the clock in their hand.
 */
export function usageDay(use: PlusUse, ms: number): string {
  return localDay(new Date(USE_UNIT[use] === 'night' ? ms - 12 * HOUR_MS : ms));
}

/**
 * The record with `day` counted for `use`. The SAME object when the day is already there, so a
 * caller can tell a write that would change nothing from one that would, and skip it.
 */
export function recordPlusUse(usage: PlusUsage, use: PlusUse, day: string): PlusUsage {
  const days = usage[use] ?? [];
  if (days.includes(day)) return usage;
  const next = [...days, day].sort().slice(-USAGE_DAYS_KEPT);
  return { ...usage, [use]: next };
}

/** How many days each used surface has, most first, ties in `PLUS_USES` order; unused ones left out. */
export function plusUsageCounts(usage: PlusUsage): { use: PlusUse; count: number }[] {
  return PLUS_USES.map(use => ({ use, count: usage[use]?.length ?? 0 }))
    .filter(c => c.count > 0)
    .sort((a, b) => b.count - a.count || PLUS_USES.indexOf(a.use) - PLUS_USES.indexOf(b.use));
}

const VERSION = 1;

export function serializePlusUsage(usage: PlusUsage): string {
  return JSON.stringify({ v: VERSION, days: usage });
}

/**
 * A stored record, read tolerantly: anything that is not the shape this file writes — a newer
 * version, a hand-edited value, a surface since renamed, a day that is not a day — is dropped
 * rather than trusted, and an unreadable value is an empty record, never an error. A count shown
 * to a parent must never be made up, so the safe reading of a doubtful value is "not used".
 */
export function parsePlusUsage(raw: string | null): PlusUsage {
  if (raw === null) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (typeof parsed !== 'object' || parsed === null) return {};
  const { v, days } = parsed as { v?: unknown; days?: unknown };
  if (v !== VERSION || typeof days !== 'object' || days === null) return {};
  const out: Partial<Record<PlusUse, readonly string[]>> = {};
  for (const use of PLUS_USES) {
    const list = (days as Record<string, unknown>)[use];
    if (!Array.isArray(list)) continue;
    const valid = [
      ...new Set(list.filter((d): d is string => typeof d === 'string' && DAY_KEY.test(d))),
    ]
      .sort()
      .slice(-USAGE_DAYS_KEPT);
    if (valid.length > 0) out[use] = valid;
  }
  return out;
}

/**
 * WHERE THE RECORD IS KEPT: per person and per household, because a parent who leaves one household
 * and joins another is starting that household's preview, not continuing the first one's.
 */
export const plusUsageKey = (userId: string, householdId: string): string =>
  `plus_usage:${userId}:${householdId}`;

/** What this process has already written: a tag drawn forty times a day reads storage once. */
const noted = new Set<string>();
/** One write at a time per record, so two surfaces counted in the same frame cannot lose either. */
const queues = new Map<string, Promise<void>>();

/**
 * Count `use` for the day `nowMs` falls on. Idempotent within a day, cheap when repeated, and never
 * throws: a record that cannot be written is a day the recap does not mention, which is the honest
 * way for it to fail.
 */
export function notePlusUse(
  store: KeyValueStore,
  key: string,
  use: PlusUse,
  nowMs: number,
): Promise<void> {
  const day = usageDay(use, nowMs);
  const mark = `${key}|${use}|${day}`;
  if (noted.has(mark)) return queues.get(key) ?? Promise.resolve();
  noted.add(mark);
  const run = (queues.get(key) ?? Promise.resolve())
    .then(async () => {
      const current = parsePlusUsage(await store.get(key));
      const next = recordPlusUse(current, use, day);
      if (next !== current) await store.set(key, serializePlusUsage(next));
    })
    .catch(() => {
      // forget the mark, so the next draw of the surface tries the day again
      noted.delete(mark);
    });
  queues.set(key, run);
  return run;
}

/** The record as stored, after any write still in flight has landed. */
export async function readPlusUsage(store: KeyValueStore, key: string): Promise<PlusUsage> {
  await (queues.get(key) ?? Promise.resolve());
  try {
    return parsePlusUsage(await store.get(key));
  } catch {
    return {};
  }
}
