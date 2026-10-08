/**
 * THE PHONE'S CRASH QUEUE (docs/CRASH_REPORTS.md §2): reports written here the moment they are
 * made, sent on a later launch. A crash is exactly when the network call cannot be trusted to
 * finish, so the report is on disk before anything is sent.
 *
 * DEVICE LEVEL, under its own `crash:` prefix, outside `prefs:`: a report holds nothing about the
 * account (`@nibblecue/core` `crashReportFrom` took it out), and a sign-out that is itself the
 * crash must not take its own report with it. The dev "start fresh" clears it with everything.
 *
 * SMALL ON PURPOSE. A crash loop writes the same report over and over; the queue keeps the first
 * few of each and at most `MAX_QUEUED` in all, and anything older than `MAX_AGE_MS` is dropped
 * unsent. The server has its own limit per person per day (0156).
 */
import { parseCrashReport, type CrashReport } from '@nibblecue/core';
import type { KeyValueStore } from '../prefs';

export const CRASH_QUEUE_KEY = 'crash:pending';
export const MAX_QUEUED = 10;
/** The same report (name, message, first frame) kept at most this many times. */
export const MAX_REPEATS = 3;
export const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

const sameCrash = (a: CrashReport, b: CrashReport): boolean =>
  a.error_name === b.error_name &&
  a.message === b.message &&
  a.stack.split('\n')[0] === b.stack.split('\n')[0];

export async function loadCrashes(store: KeyValueStore, now: number): Promise<CrashReport[]> {
  let raw: string | null;
  try {
    raw = await store.get(CRASH_QUEUE_KEY);
  } catch {
    return [];
  }
  if (raw === null) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .map(parseCrashReport)
    .filter((r): r is CrashReport => r !== null && now - Date.parse(r.occurred_at) <= MAX_AGE_MS);
}

async function write(store: KeyValueStore, list: readonly CrashReport[]): Promise<void> {
  if (list.length === 0) await store.remove(CRASH_QUEUE_KEY);
  else await store.set(CRASH_QUEUE_KEY, JSON.stringify(list));
}

/** Adds a report, unless the queue is full or already holds this crash `MAX_REPEATS` times. */
export async function queueCrash(
  store: KeyValueStore,
  report: CrashReport,
  now: number,
): Promise<boolean> {
  const list = await loadCrashes(store, now);
  if (list.length >= MAX_QUEUED) return false;
  if (list.filter(r => sameCrash(r, report)).length >= MAX_REPEATS) return false;
  await write(store, [...list, report]);
  return true;
}

/** Removes the reports a send has dealt with: every one in `done`, matched by value. */
export async function forgetCrashes(
  store: KeyValueStore,
  done: readonly CrashReport[],
  now: number,
): Promise<void> {
  const gone = new Set(done.map(r => JSON.stringify(r)));
  const list = await loadCrashes(store, now);
  await write(
    store,
    list.filter(r => !gone.has(JSON.stringify(r))),
  );
}
