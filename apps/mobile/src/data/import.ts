/**
 * WRITING AN IMPORTED HISTORY (core's `import/` builds the plan; this runs it).
 *
 * IT IS ORDINARY LOGGING, AND THAT IS THE WHOLE DESIGN. Every row goes through `logActivity`, so an
 * imported feed is the same kind of thing as a typed one: it has a client-generated id, it lands in
 * the outbox, it syncs to the other parent's phone, it appears on the timeline, it can be corrected
 * and it can be deleted with the same undo. There is no import table, no server endpoint and no
 * migration — an import is a parent logging five hundred feeds very quickly.
 *
 * THE DOUBLE-TAP GUARD MUST BE OFF, and this is the one thing about import that is not obvious.
 * `logActivity`'s dedupe window is keyed on (type, child, salient) and measured against the WRITE
 * clock, not the entry's own time — it exists to swallow a parent tapping WET twice in 200 ms. An
 * import writes hundreds of rows inside one second, so two 4 oz bottles from different DAYS look
 * exactly like one bottle tapped twice, and the second would be suppressed. Silently. That is a
 * lost log (CLAUDE.md §7), so `dedupeWindowMs: 0` turns the guard off and `existingEntries` +
 * `newDrafts` do the de-duplicating properly, on the rows' own kind and time.
 *
 * NOTHING IS WRITTEN BEFORE THE PARENT HAS SEEN THE PLAN. The screen shows the counts first; this
 * function is what runs after they say yes, and it reports back what it actually did.
 */
import {
  HELD_SLACK_MS,
  MODULE_BY_ID,
  sleepKindAt,
  type Clock,
  type DayWindow,
  type HeldEntry,
  type ImportDraft,
  type ModuleId,
} from '@nibblecue/core';
import type { Db } from '../db/driver';
import { logActivity, type WriteContext } from './activities';

/**
 * THE ENTRIES THE HOUSEHOLD ALREADY HOLDS, over the span the file covers: each one's kind and
 * start, which is all `newDrafts` matches on (an entry of the same kind within a minute is already
 * there; core's `import/index.ts` says why the amount and the seconds are left out).
 *
 * Bounded by the plan's own first and last row, and `HELD_SLACK_MS` past them so the minute either
 * side of the first and the last is seen, rather than read whole: a household two years in has tens
 * of thousands of rows and the file is usually a few weeks.
 *
 * The baby's entries and the household's (a pump is the parent's, not a baby's, and is written with
 * no baby: `importChildId`), so a pump imported from one twin's file is found again when the other
 * twin's file brings the same session.
 *
 * Deleted rows are INCLUDED on purpose. A parent who imported, decided the rows were wrong and
 * deleted them has said no; re-running the same file should not bring them back through the side
 * door. Undo is for a mistake seconds old, not a decision.
 */
export async function existingEntries(
  db: Db,
  input: { householdId: string; childId: string | null; fromMs: number; toMs: number },
): Promise<HeldEntry[]> {
  const rows = await db.all<{ type: string; start_at: string }>(
    `select type, start_at from activities
      where household_id = ?
        and (child_id = ? or (? is null and child_id is null) or child_id is null)
        and start_at >= ? and start_at <= ?`,
    [
      input.householdId,
      input.childId,
      input.childId,
      new Date(input.fromMs - HELD_SLACK_MS).toISOString(),
      new Date(input.toMs + HELD_SLACK_MS).toISOString(),
    ],
  );
  return rows.map(r => ({ type: r.type, startMs: Date.parse(r.start_at) }));
}

/**
 * THE BABY AN IMPORTED ROW IS FILED AGAINST: the one the import is for, except for a kind the
 * household owns rather than a baby (`householdScoped` in the module registry: a pump). The pump
 * sheet writes a session with no baby (`sheets/quick/save.ts`), and an imported one is the same
 * kind of thing: filed against a twin, it vanished from the other twin's view, and the same
 * session in the other twin's file was written a second time (found 2026-09-28, with the
 * Huckleberry reader, which brings pump sessions in).
 */
export function importChildId(type: ImportDraft['type'], childId: string | null): string | null {
  return MODULE_BY_ID[type as ModuleId]?.householdScoped === true ? null : childId;
}

export interface RunImportInput extends WriteContext {
  childId: string | null;
  drafts: readonly ImportDraft[];
  /**
   * The zone and the household's waking window, which file each imported sleep as a nap or a
   * night by when it started (`withSleepKind`). Required: without them every imported night was
   * stored as a nap.
   */
  day: { timeZone: string; window: DayWindow };
  /** Called after each row, so a long import can show where it is rather than freezing. */
  onProgress?: (done: number, total: number) => void;
}

export interface ImportOutcome {
  /** Rows that reached the local database and the outbox. */
  written: number;
  /**
   * Rows that threw on the way in. Counted and reported rather than retried: a parent who is told
   * "482 of 500" can look, and one who is told nothing cannot. The lines are kept so they can.
   */
  failed: { line: number; message: string }[];
}

/**
 * ONE ROW AT A TIME, IN ORDER, AND IT KEEPS GOING PAST A FAILURE.
 *
 * Sequential rather than parallel because each write appends to the outbox and takes the same
 * SQLite connection; a hundred concurrent writes would serialize anyway and the progress count
 * would jump about. And a row that throws does not abort the rest: half a history is worth more
 * than none, and the outcome says exactly which lines did not make it.
 */
export async function runImport(
  db: Db,
  clock: Clock,
  input: RunImportInput,
): Promise<ImportOutcome> {
  const failed: ImportOutcome['failed'] = [];
  let written = 0;
  const total = input.drafts.length;
  for (const draft of input.drafts) {
    const detail = withSleepKind(draft, input.day);
    try {
      const outcome = await logActivity(db, clock, {
        householdId: input.householdId,
        createdBy: input.createdBy,
        deviceId: input.deviceId,
        source: input.source,
        childId: importChildId(draft.type, input.childId),
        type: draft.type,
        startAt: new Date(draft.startMs).toISOString(),
        endAt: draft.endMs === null ? null : new Date(draft.endMs).toISOString(),
        quantity: draft.quantity,
        ...(draft.canonicalUnit !== null ? { canonicalUnit: draft.canonicalUnit } : {}),
        ...(detail !== null ? { detail } : {}),
        notes: draft.notes,
        // OFF — see the note at the top of this file. Two 4 oz bottles from different days are two
        // feeds, and the guard cannot tell them from one bottle tapped twice.
        dedupeWindowMs: 0,
        metadata: { imported: true },
      });
      if (outcome.committed) written += 1;
      else failed.push({ line: draft.line, message: 'the write did not commit' });
    } catch (err) {
      failed.push({ line: draft.line, message: err instanceof Error ? err.message : 'unknown' });
    }
    input.onProgress?.(written + failed.length, total);
  }
  return { written, failed };
}

/**
 * A SLEEP IS FILED AS A NAP OR A NIGHT BY WHEN IT STARTED, as one logged here is (`sleepKindAt`;
 * the sleep sheet). Another tracker's file says "sleep", "nap" or "night sleep", and the importer
 * reads all three as one sleep on purpose (core `TYPE_WORDS`: the split is the household's own
 * day window, not a word in somebody else's file). Written with no kind, a sleep took the
 * database's default, so every imported night was a nap in Reports, on the visit sheet and in the
 * Log (the care-timers sweep of 2026-09-24). This app's own download carries the kind the parent
 * saw, and that stands.
 */
export function withSleepKind(
  draft: ImportDraft,
  day: { timeZone: string; window: DayWindow },
): ImportDraft['detail'] {
  if (draft.type !== 'sleep') return draft.detail;
  const detail = draft.detail ?? {};
  if (detail['kind'] === 'NAP' || detail['kind'] === 'NIGHT') return detail;
  return { ...detail, kind: sleepKindAt(day.timeZone, draft.startMs, day.window, draft.endMs) };
}
