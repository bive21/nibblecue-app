/**
 * SENDING THE QUEUE (docs/CRASH_REPORTS.md §2): once per launch, signed in, on a build that talks
 * to a real server. One report at a time, oldest first:
 *
 *   · `stored`: the server has it, so the phone forgets it
 *   · `refused`: the server will never take it (over the person's daily limit, or a shape it does
 *     not accept). Forgotten too: a report kept for a retry that can never land is a queue that
 *     never empties
 *   · a throw (no network, the server down): the send stops and everything left waits for the next
 *     launch, which is the whole reason the queue is on disk
 */
import type { CrashReport } from '@nibblecue/core';
import type { KeyValueStore } from '../prefs';
import { forgetCrashes, loadCrashes } from './store';

export type CrashAnswer = 'stored' | 'refused';
export type CrashSink = (report: CrashReport) => Promise<CrashAnswer>;

export interface FlushResult {
  sent: number;
  refused: number;
  left: number;
}

export async function flushCrashes(
  store: KeyValueStore,
  sink: CrashSink,
  now: number,
): Promise<FlushResult> {
  const queue = await loadCrashes(store, now);
  const done: CrashReport[] = [];
  let sent = 0;
  let refused = 0;
  for (const report of queue) {
    let answer: CrashAnswer;
    try {
      answer = await sink(report);
    } catch {
      break;
    }
    done.push(report);
    if (answer === 'stored') sent += 1;
    else refused += 1;
  }
  if (done.length > 0) await forgetCrashes(store, done, now);
  return { sent, refused, left: queue.length - done.length };
}

/**
 * The server's answer, read: `report_crash` returns `stored`, or `rate_limited` once the person has
 * sent the day's share (0156). An error is thrown, so the send stops and keeps the rest, unless the
 * database said this report can never be stored.
 */
export function crashAnswerOf(r: {
  data: unknown;
  error: { code?: string | null; message?: string } | null;
}): CrashAnswer {
  if (r.error === null) return r.data === 'stored' ? 'stored' : 'refused';
  const code = r.error.code ?? '';
  // a report the database will never take: the RPC's own refusal (CC422) or a value it cannot hold
  // (22…, a data exception; 23…, a constraint). Anything else (no network, a session that needs a
  // refresh, a server not yet migrated to 0156) is not about the report, and the report waits
  if (code === 'CC422' || code === 'CC429' || /^2[23]/.test(code)) return 'refused';
  throw new Error(r.error.message ?? 'no answer');
}
