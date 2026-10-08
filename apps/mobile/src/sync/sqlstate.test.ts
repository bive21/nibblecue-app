/**
 * The client's SQLSTATE table against the server's.
 *
 * `app.sync_error_code` decides whether an op is parked or retried; so does `pushErrorCode`. If
 * they ever disagree, one arm of the product parks a log the other would have delivered — so this
 * suite asserts every row of the table by hand AND reads `0009_add_sync_push.sql` to check that
 * the SQL has no state the client has never heard of. The second half is what catches a state
 * added to the migration and forgotten here, which no hand-written table can catch by itself.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HAS_SERVER_MIGRATIONS, SERVER_MIGRATIONS } from '../testing/serverMigrations';
import { SQLSTATE, classifyPushError, pushErrorCode } from './sqlstate';

/*
  The server's migrations live in the cuddlecue-app repository (NibbleCue shares its Supabase
  project), read from `testing/serverMigrations.ts`'s path. Without that checkout the half below
  that reads them is skipped rather than failed: this repository alone cannot see the server.
*/
const MIGRATION = SERVER_MIGRATIONS;

/** Every state these migrations, their constraints and their tests actually raise. */
const TABLE: readonly [state: string, message: string, expected: string][] = [
  ['42501', 'permission denied for table activities', 'FORBIDDEN'],
  ['23514', 'violates check constraint "activity_time_sane"', 'VALIDATION'],
  ['23502', 'null value in column "start_at" violates not-null constraint', 'VALIDATION'],
  ['22P02', 'invalid input syntax for type uuid', 'VALIDATION'],
  ['22007', 'invalid input syntax for type timestamp with time zone', 'VALIDATION'],
  ['22003', 'numeric field overflow', 'VALIDATION'],
  ['23503', 'violates foreign key constraint', 'CONFLICT'],
  ['23505', 'duplicate key value violates unique constraint "activities_timer_uniq"', 'CONFLICT'],
  ['40P01', 'deadlock detected', 'SERVER'],
  ['40001', 'could not serialize access due to concurrent update', 'SERVER'],
  ['P0001', 'milk ledger for container abc would go negative (-90)', 'CONFLICT'],
  ['P0001', 'first_frozen_at is immutable once set', 'VALIDATION'],
  ['P0001', 'something nobody has seen before', 'SERVER'],
  ['CC401', 'unauthenticated', 'FORBIDDEN'],
  ['CC403', 'forbidden', 'FORBIDDEN'],
  ['CC404', 'activity not found', 'CONFLICT'],
  ['CC409', 'conflict', 'CONFLICT'],
  ['CC422', 'validation_error', 'VALIDATION'],
  ['CC429', 'rate_limited', 'SERVER'],
];

describe('SQLSTATE to PushErrorCode', () => {
  for (const [state, message, expected] of TABLE) {
    it(`${state} (${message.slice(0, 32)}) is ${expected}`, () => {
      expect(pushErrorCode(state, message)).toBe(expected);
    });
  }

  it('an unknown state is retryable, never terminal', () => {
    // The failure direction that matters: a state nobody has classified must not park a parent's
    // log for ever. SERVER retries with backoff and surfaces in the inspector.
    expect(pushErrorCode('XX000', 'internal error')).toBe('SERVER');
    expect(pushErrorCode('', '')).toBe('SERVER');
  });

  it('P0001 is read by its message, because it is every bare raise in the schema', () => {
    // One SQLSTATE, two answers: the ledger race is retryable and gets rewritten, the write-once
    // guards are a bug in the payload and are terminal.
    expect(pushErrorCode('P0001', 'would go negative')).not.toBe(
      pushErrorCode('P0001', 'immutable'),
    );
  });

  it('classifies a PostgrestError and keeps its message and state', () => {
    const classified = classifyPushError({
      code: 'CC403',
      message: 'forbidden',
      details: 'household',
      hint: null,
    });
    expect(classified).toEqual({ code: 'FORBIDDEN', message: 'forbidden', state: 'CC403' });
  });

  it('survives an error with no code at all', () => {
    expect(classifyPushError({ message: 'fetch failed' })).toEqual({
      code: 'SERVER',
      message: 'fetch failed',
      state: '',
    });
  });
});

describe.skipIf(!HAS_SERVER_MIGRATIONS)('the client table against the migration', () => {
  const sql = HAS_SERVER_MIGRATIONS
    ? readFileSync(join(MIGRATION, '0009_add_sync_push.sql'), 'utf8')
    : '';
  const body = /create or replace function app\.sync_error_code[\s\S]*?\$\$;/.exec(sql)?.[0] ?? '';

  it('found the function it is meant to be checking', () => {
    expect(body).toMatch(/p_state = '42501'/);
    expect(body).toMatch(/would go negative/);
  });

  it('every SQLSTATE the migration classifies is one this file knows', () => {
    const known = new Set<string>(Object.values(SQLSTATE));
    const inSql = [...body.matchAll(/'([0-9A-Z]{5})'/g)].map(m => m[1] as string);
    expect(inSql.length).toBeGreaterThan(10);
    expect(inSql.filter(state => !known.has(state))).toEqual([]);
  });

  it('every SQLSTATE this file names is one the migration classifies, or is named by it', () => {
    // CC429 is the exception and is deliberate: `app.fail` can raise it (0008's rate limits) and
    // `app.sync_error_code` has no arm for it, so it falls through to SERVER on both sides —
    // which is the right answer for a rate limit, because waiting is what clears one.
    const inSql = new Set([...body.matchAll(/'([0-9A-Z]{5})'/g)].map(m => m[1] as string));
    const missing = Object.values(SQLSTATE).filter(state => !inSql.has(state));
    expect(missing).toEqual(['CC429']);
    expect(pushErrorCode('CC429', 'rate_limited')).toBe('SERVER');
  });
});

describe.skipIf(!HAS_SERVER_MIGRATIONS)('NibbleCue’s own push function (0161)', () => {
  const sql = HAS_SERVER_MIGRATIONS
    ? readFileSync(join(MIGRATION, '0161_nibble_records.sql'), 'utf8')
    : '';

  it('classifies its failures through the same app.sync_error_code', () => {
    expect(sql).toMatch(/app\.sync_error_code\(v_state, v_msg\)/);
  });

  it('raises only states this file knows', () => {
    const known = new Set<string>(Object.values(SQLSTATE));
    const raised = [...sql.matchAll(/app\.fail\('([0-9A-Z]{5})'/g)].map(m => m[1] as string);
    expect(raised.length).toBeGreaterThan(5);
    expect(raised.filter(state => !known.has(state))).toEqual([]);
  });
});
