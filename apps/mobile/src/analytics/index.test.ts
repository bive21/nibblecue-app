import { describe, expect, it } from 'vitest';
import {
  ageBucket,
  backdateBucket,
  BANNED_KEY,
  countBucket,
  durationBucket,
  createAnalytics,
  EVENT_PROPS,
  gatedSink,
  msBucket,
  quietAnalytics,
  sanitize,
  tzOffsetBucket,
  type AnalyticsRecord,
} from './index';

describe('the analytics emitter (ACCOUNTS.md §8, MOBILE.md §12)', () => {
  it('no event allows a key that could carry a person', () => {
    for (const [event, keys] of Object.entries(EVENT_PROPS)) {
      for (const k of keys) {
        if (k === 'child_count' || k === 'child_count_after') continue; // counts, not names
        expect(BANNED_KEY.test(k), `${event}.${k}`).toBe(false);
      }
    }
  });

  it('strips unknown keys and anything identifying, whatever the caller passes', () => {
    const out = sanitize('signup_completed', {
      entry: 'setup',
      // what the sign-up events carried while they fired on AUTH (2026-09-27): no longer allowed,
      // because the only way to know them was to measure the sign-in screen
      method: 'email',
      verified: 1,
      ms_bucket: '5-30s',
      email: 'dana@example.test',
      display_name: 'Dana',
      child_name: 'Mia',
      birth_date: '2026-06-01',
      invite_code: '482916',
      password: 'hunter22hunter22',
      extra: 'nope',
    });
    expect(out).toEqual({ entry: 'setup' });
  });

  it('has no event that can only be measured on the sign-in screen', () => {
    expect(Object.keys(EVENT_PROPS)).not.toContain('signup_started');
    expect(EVENT_PROPS.signup_completed).toEqual(['entry']);
  });

  it('a gated sink passes records on only while the gate is open, asked at each record', () => {
    const seen: string[] = [];
    let open = false;
    const a = createAnalytics(
      gatedSink(
        r => seen.push(r.event),
        () => open,
      ),
    );
    a.emit('app_open', { cold: true });
    open = true;
    a.emit('app_open', { cold: true });
    open = false;
    a.emit('signed_out', { scope: 'local', queued_ops_bucket: '0' });
    expect(seen).toEqual(['app_open']);
    // and the quiet emitter sends nothing at all, whatever it is asked
    expect(() => quietAnalytics().emit('signed_out', { scope: 'local' })).not.toThrow();
  });

  it('has_due_date is a boolean, never the date', () => {
    const out = sanitize('household_created', {
      module_count: 9,
      child_count: 1,
      has_due_date: '2026-07-13',
      tz_offset_bucket: '-5h',
    });
    expect(out.has_due_date).toBe(true);
    expect(JSON.stringify(out)).not.toContain('2026');
    expect(
      sanitize('child_added', { source: 'onboarding', child_count_after: 2, has_due_date: 0 })
        .has_due_date,
    ).toBe(false);
  });

  it('household_created carries the acquisition key when answered, and nothing when not', () => {
    // a key from core's closed list; the emitter never sees a label, a clinic or a URL
    // because the payload it reads was schema-checked before it was sent
    const base = { module_count: 9, child_count: 1, has_due_date: false, tz_offset_bucket: '-5h' };
    expect(sanitize('household_created', { ...base, heard_from: 'friend' }).heard_from).toBe(
      'friend',
    );
    expect(sanitize('household_created', { ...base, heard_from: undefined })).not.toHaveProperty(
      'heard_from',
    );
    expect(sanitize('household_created', base)).not.toHaveProperty('heard_from');
  });

  it('records the sanitized event with a timestamp through the sink', () => {
    const seen: AnalyticsRecord[] = [];
    const a = createAnalytics(
      r => seen.push(r),
      () => Date.parse('2026-09-14T12:00:00Z'),
    );
    a.emit('signed_out', { scope: 'forced', queued_ops_bucket: '1-3', email: 'x@y.z' });
    expect(seen).toEqual([
      {
        event: 'signed_out',
        props: { scope: 'forced', queued_ops_bucket: '1-3' },
        at: '2026-09-14T12:00:00.000Z',
      },
    ]);
    a.emit('onboarding_step_completed', {
      step: 2,
      role_choice: 'parent',
      back_count: 1,
      ms_bucket: msBucket(12_000),
    });
    expect(seen[1]?.props).toEqual({
      step: 2,
      role_choice: 'parent',
      back_count: 1,
      ms_bucket: '5-30s',
    });
  });

  it('buckets, never raw numbers of the sensitive kind', () => {
    expect([
      msBucket(10),
      msBucket(6_000),
      msBucket(60_000),
      msBucket(300_000),
      msBucket(1e7),
    ]).toEqual(['<5s', '5-30s', '30s-2m', '2-10m', '>10m']);
    expect([countBucket(0), countBucket(3), countBucket(10), countBucket(11)]).toEqual([
      '0',
      '1-3',
      '4-10',
      '>10',
    ]);
    expect(tzOffsetBucket(-300)).toBe('-5h');
    expect(tzOffsetBucket(330)).toBe('6h');
  });
});

describe('the WP4 capture and queue events (MOBILE.md §12)', () => {
  it('carries every prop MOBILE §12 lists for each of them, and nothing else', () => {
    expect(EVENT_PROPS.activity_logged).toEqual([
      'module',
      'source',
      'taps',
      'backdated',
      'backdate_bucket',
    ]);
    expect(EVENT_PROPS.activity_edited).toEqual(['module', 'age_bucket', 'undo']);
    expect(EVENT_PROPS.activity_deleted).toEqual(EVENT_PROPS.activity_edited);
    expect(EVENT_PROPS.timer_started).toEqual(['type', 'source', 'duration_bucket']);
    expect(EVENT_PROPS.timer_stopped).toEqual(EVENT_PROPS.timer_started);
    expect(EVENT_PROPS.duplicate_suppressed).toEqual(['module', 'layer', 'source']);
    expect(EVENT_PROPS.offline_write_queued).toEqual(['entity', 'queue_depth_bucket']);
    expect(EVENT_PROPS.widget_tap).toEqual(['widget', 'action']);
  });

  it('the three sync events carry buckets and enums, never a queue depth or a server message', () => {
    expect(EVENT_PROPS.sync_conflict_resolved).toEqual(['table', 'strategy']);
    expect(EVENT_PROPS.sync_flush).toEqual([
      'ops_bucket',
      'duration_ms_bucket',
      'result',
      'error_class',
    ]);
    expect(EVENT_PROPS.sync_health).toEqual([
      'queue_depth_bucket',
      'oldest_pending_bucket',
      'failed_bucket',
    ]);
    // every count and every duration ends in _bucket; nothing raw survives sanitize
    for (const key of [...EVENT_PROPS.sync_flush, ...EVENT_PROPS.sync_health]) {
      expect(/^(ops|duration_ms|queue_depth|oldest_pending|failed)$/.test(key), key).toBe(false);
    }
  });

  it('a flush reports its size as a bucket and its failure as an enum, never an op or a message', () => {
    expect(
      sanitize('sync_flush', {
        ops_bucket: countBucket(17),
        duration_ms_bucket: msBucket(4_000),
        result: 'partial',
        error_class: 'transport',
        // everything a flush has in scope and must never reach analytics
        ops: 17,
        duration_ms: 4_000,
        last_error: 'duplicate key value violates unique constraint',
        household_id: 'aaaaaaaa-0000-4000-8000-000000000001',
        client_op_id: '11111111-0000-4000-8000-000000000001',
      }),
    ).toEqual({
      ops_bucket: '>10',
      duration_ms_bucket: '<5s',
      result: 'partial',
      error_class: 'transport',
    });
  });

  it('the health event says how deep and how old, in bands', () => {
    expect(
      sanitize('sync_health', {
        queue_depth_bucket: countBucket(2),
        oldest_pending_bucket: msBucket(700_000),
        failed_bucket: countBucket(0),
        oldest_pending_at: '2026-09-14T03:14:00.000Z',
      }),
    ).toEqual({ queue_depth_bucket: '1-3', oldest_pending_bucket: '>10m', failed_bucket: '0' });
  });

  it('a resolved conflict names the rule, never the entry', () => {
    expect(
      sanitize('sync_conflict_resolved', {
        table: 'activities',
        strategy: 'lww',
        entity_id: '22222222-0000-4000-8000-000000000001',
        notes: 'took it all',
      }),
    ).toEqual({ table: 'activities', strategy: 'lww' });
  });

  it('a logged bottle carries the module and the source, never the amount', () => {
    const out = sanitize('activity_logged', {
      module: 'bottle',
      source: 'quicklog',
      taps: 2,
      backdated: 1,
      backdate_bucket: backdateBucket(1_900_000),
      // everything a capture sheet has in scope and must never reach analytics
      quantity: 118,
      consumed_ml: 118,
      notes: 'took it all',
      child_name: 'Emma',
      food: 'pear',
    });
    expect(out).toEqual({
      module: 'bottle',
      source: 'quicklog',
      taps: 2,
      backdated: true,
      backdate_bucket: '1h',
    });
  });

  it('a suppressed duplicate names its layer and nothing about the entry', () => {
    expect(
      sanitize('duplicate_suppressed', {
        module: 'diaper',
        layer: 'client_debounce',
        source: 'widget',
        client_op_id: '11111111-0000-4000-8000-000000000001',
      }),
    ).toEqual({ module: 'diaper', layer: 'client_debounce', source: 'widget' });
  });

  it('a queued write carries a bucket, never the queue depth', () => {
    expect(
      sanitize('offline_write_queued', {
        entity: 'activity',
        queue_depth_bucket: countBucket(17),
        queue_depth: 17,
      }),
    ).toEqual({ entity: 'activity', queue_depth_bucket: '>10' });
  });

  it('undo and backdated are booleans, whatever the caller passes', () => {
    expect(sanitize('activity_deleted', { module: 'sleep', age_bucket: '<1h', undo: 1 }).undo).toBe(
      true,
    );
    expect(sanitize('activity_logged', { module: 'sleep', backdated: 0 }).backdated).toBe(false);
  });

  it('the new buckets are bands, and the boundaries are named', () => {
    expect([
      backdateBucket(0),
      backdateBucket(900_000),
      backdateBucket(900_001),
      backdateBucket(1_800_000),
      backdateBucket(3_600_000),
      backdateBucket(3_600_001),
    ]).toEqual(['0', '15m', '30m', '30m', '1h', 'custom']);
    expect([
      durationBucket(60_000),
      durationBucket(600_000),
      durationBucket(1_800_000),
      durationBucket(7_200_000),
      durationBucket(4 * 3_600_000),
    ]).toEqual(['<5m', '5-20m', '20-60m', '1-3h', '>3h']);
    expect([ageBucket(60_000), ageBucket(7_200_000), ageBucket(3 * 86_400_000)]).toEqual([
      '<1h',
      '<1d',
      'older',
    ]);
  });
});

describe('nothing about buying (the owner, 2026-09-28: "server count")', () => {
  it('has no event for a gate, a trial-end sheet or a purchase', () => {
    for (const gone of [
      'gate_opened',
      'plan_prompt_shown',
      'plan_prompt_answered',
      'purchase_started',
      'purchase_completed',
    ]) {
      expect(Object.keys(EVENT_PROPS)).not.toContain(gone);
    }
    // and no prop that would say it by another name
    const props = Object.values(EVENT_PROPS).flat() as string[];
    for (const key of ['feature', 'decides', 'prompt', 'answer', 'origin', 'period']) {
      expect(props).not.toContain(key);
    }
  });
});
