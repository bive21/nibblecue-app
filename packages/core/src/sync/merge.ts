/**
 * Per-field last-writer-wins, and the clock it is judged against.
 *
 * THE PROBLEM THIS SOLVES. `0001_init.sql`'s `app.touch()` makes `updated_at` the moment the
 * server applied a write, while `docs/OFFLINE_SYNC.md` uses the same column as the delta cursor
 * and as the edit clock. Those are two different clocks wearing one name. B edits at 10:10 and
 * syncs at 10:30, so the row reads 10:30; A edits at 10:20, syncs at 10:31, and loses an edit
 * they made ten minutes later. Per-field LWW also needs per-field clocks, which no table has.
 *
 * THE SPLIT (D1). `updated_at` stays server-owned and untouched — it remains the cursor. The
 * client's edit clock travels as `payload.client_edited_at`, and the per-field clocks live in
 * `activities.metadata.field_clocks`. Nothing in the migration changes; the clocks are additive
 * jsonb, and deleting this branch degrades to whole-row last-push-wins with no migration.
 *
 * Tables with no `metadata` column (`milk_containers`, `schedule_rules`, `schedule_phases`,
 * `children`) use whole-row LWW on the payload's fields instead (D2) — `wholeRowApplies` below.
 * Reaching into a WP6 table to add a jsonb column for uniformity nobody asked for is the more
 * expensive choice, and on a four-field patch the two are indistinguishable in practice.
 */
import { CLOCK_SKEW_CLAMP_MS, HISTORY_CAP } from './constants';

/** `{ "<column>": "<iso>" }` — when each field was last written, by the writer's own clock. */
export type FieldClocks = Record<string, string>;

/** One entry of `activities.metadata.history`, capped at `HISTORY_CAP`, oldest out. */
export interface HistoryEntry {
  at: string;
  by: string;
  field: string;
  from: unknown;
}

export interface MergeFieldsInput {
  /** The server row's current values for the fields in `patch`. */
  current: Record<string, unknown>;
  /** The incoming fields. Never includes `client_edited_at` or `detail`: the caller strips both. */
  patch: Record<string, unknown>;
  /** `metadata.field_clocks` as it stands. */
  clocks: FieldClocks;
  /** `metadata.history` as it stands, oldest first. */
  history: readonly HistoryEntry[];
  /** The incoming edit clock, already through `clampEditClock`. */
  clientEditedAt: string;
  /** `auth.uid()` of the incoming writer. */
  by: string;
}

export interface MergeFieldsResult {
  /** Fields that win and are written. */
  applied: Record<string, unknown>;
  /** Fields whose incoming value lost, in patch order. */
  dropped: string[];
  /** The row as it stands after the merge — what a `duplicate`/`applied` result echoes back. */
  surviving: Record<string, unknown>;
  clocks: FieldClocks;
  history: HistoryEntry[];
}

function ms(iso: string, what: string): number {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) throw new TypeError(`${what} is not a parseable timestamp: ${iso}`);
  return at;
}

/**
 * Apply the fields that are newer than the row's own clock for that field; drop the rest.
 *
 * A dropped value is not thrown away — it is appended to `history` as `{ at, by, field, from }`
 * where `from` is the value that lost. It is the only copy of that caregiver's edit anywhere, so
 * "never lose a log" means recording it even though it never reaches the column. (The winning
 * branch needs no entry: the value it replaced is still reconstructible from the row's own
 * `updated_by`/`updated_at` and the next pull, whereas the loser's value exists nowhere else.)
 *
 * Two caregivers editing different fields of the same bottle therefore both keep their change,
 * in either arrival order.
 */
export function mergeFields(input: MergeFieldsInput): MergeFieldsResult {
  const incomingAt = ms(input.clientEditedAt, 'client_edited_at');

  const applied: Record<string, unknown> = {};
  const dropped: string[] = [];
  const clocks: FieldClocks = { ...input.clocks };
  const history: HistoryEntry[] = [...input.history];
  const surviving: Record<string, unknown> = { ...input.current };

  for (const field of Object.keys(input.patch)) {
    const value = input.patch[field];
    const priorIso = clocks[field];
    const wins = priorIso === undefined || ms(priorIso, `field_clocks.${field}`) < incomingAt;
    if (wins) {
      applied[field] = value;
      surviving[field] = value;
      clocks[field] = input.clientEditedAt;
    } else {
      dropped.push(field);
      history.push({ at: input.clientEditedAt, by: input.by, field, from: value });
    }
  }

  return {
    applied,
    dropped,
    surviving,
    clocks,
    history: history.length > HISTORY_CAP ? history.slice(history.length - HISTORY_CAP) : history,
  };
}

/**
 * Whole-row LWW for the tables with no `metadata` column (D2): the patch applies when the client
 * edited at or after the row's last server write, and is dropped whole otherwise. `>=` rather than
 * `>` because the two clocks are different clocks — a strict comparison would silently drop an
 * edit made in the same second as the row's own apply time.
 */
export function wholeRowApplies(clientEditedAt: string, rowUpdatedAt: string): boolean {
  return ms(clientEditedAt, 'client_edited_at') >= ms(rowUpdatedAt, 'updated_at');
}

export type ClampedEditClock =
  { ok: true; at: string; clamped: boolean } | { ok: false; code: 'VALIDATION'; message: string };

/**
 * `least(client_edited_at, now())`, with anything more than five minutes ahead refused outright.
 *
 * A device with a wildly wrong clock must not be able to win every field forever, and silently
 * clamping an hour-ahead clock would hide a broken device instead of surfacing it. Inside the
 * five-minute window the value is clamped, which is the ordinary case of a phone that is a little
 * fast; beyond it the op is rejected VALIDATION, which is terminal and shows in the inspector.
 */
export function clampEditClock(clientEditedAt: string, serverNowMs: number): ClampedEditClock {
  const at = Date.parse(clientEditedAt);
  if (Number.isNaN(at)) {
    return { ok: false, code: 'VALIDATION', message: 'client_edited_at is not a timestamp' };
  }
  if (at > serverNowMs + CLOCK_SKEW_CLAMP_MS) {
    return {
      ok: false,
      code: 'VALIDATION',
      message: 'client_edited_at is more than 5 minutes ahead of the server',
    };
  }
  if (at > serverNowMs) return { ok: true, at: new Date(serverNowMs).toISOString(), clamped: true };
  return { ok: true, at: new Date(at).toISOString(), clamped: false };
}
