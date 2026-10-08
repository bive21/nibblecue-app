/** @SYNC-TIMER-MERGE — docs/OFFLINE_SYNC.md §5.1 and §9's overlapping-timers row. */
import { describe, expect, it } from 'vitest';
import { collapseTimers, elapsedMs, mergeTimers, sideMs, type TimerState } from './timers';

const DANA = '11111111-1111-1111-1111-111111111111';
const BRAD = '22222222-2222-2222-2222-222222222222';
const EMMA = 'cccccccc-0000-0000-0000-0000000000e1';
const NOW = Date.parse('2026-09-14T13:44:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

const timer = (over: Partial<TimerState> & Pick<TimerState, 'id' | 'started_at'>): TimerState => ({
  household_id: 'aaaaaaaa-0000-0000-0000-00000000000a',
  child_id: EMMA,
  type: 'sleep',
  paused_ms: 0,
  active_side: null,
  side_started_at: null,
  left_seconds: 0,
  right_seconds: 0,
  started_by: DANA,
  ...over,
});

describe('mergeTimers', () => {
  const dana = timer({
    id: 'dddddddd-0000-0000-0000-000000000001',
    started_at: iso(NOW - 44 * 60_000), // 1:00 PM
    started_by: DANA,
    paused_ms: 60_000,
    left_seconds: 300,
    right_seconds: 0,
    active_side: 'LEFT',
    side_started_at: iso(NOW - 5 * 60_000),
  });
  const brad = timer({
    id: 'dddddddd-0000-0000-0000-000000000002',
    started_at: iso(NOW - 40 * 60_000), // 1:04 PM, four minutes later
    started_by: BRAD,
    paused_ms: 0,
    left_seconds: 0,
    right_seconds: 420,
    active_side: 'RIGHT',
    side_started_at: iso(NOW - 2 * 60_000),
  });

  it('keeps the earlier start: a parent’s real start time is the truth', () => {
    for (const merged of [mergeTimers(dana, brad), mergeTimers(brad, dana)]) {
      expect(merged.started_at).toBe(dana.started_at);
      expect(merged.id).toBe(dana.id);
      expect(merged.started_by).toBe(DANA);
      expect(merged.active_side).toBe('LEFT');
      expect(merged.side_started_at).toBe(dana.side_started_at);
    }
  });

  it('folds a whole mirror, one row per scope, with every other row untouched', () => {
    const liam = 'cccccccc-0000-0000-0000-0000000000e2';
    const rows = [
      { ...dana, meta: '{"from":"dana"}' },
      { ...brad, meta: '{"from":"brad"}' },
      { ...timer({ id: 'e1', started_at: iso(NOW - 600_000), child_id: liam }), meta: '{}' },
      {
        ...timer({ id: 'e2', started_at: iso(NOW - 900_000), type: 'pump', child_id: null }),
        meta: '{}',
      },
    ];
    const folded = collapseTimers(rows);
    // Emma's two sleep rows became one; Liam's sleep and the household's pump are their own scopes
    expect(folded).toHaveLength(3);
    const emma = folded.find(r => r.child_id === EMMA && r.type === 'sleep');
    expect(emma?.id).toBe(dana.id);
    expect(emma?.right_seconds).toBe(420); // the loser's observed minutes still survive
    // the caller's own columns come through the fold: the winner's row carries them
    expect(emma?.meta).toBe('{"from":"dana"}');
    expect(folded.map(r => r.id)).toContain('e1');
    expect(folded.map(r => r.id)).toContain('e2');
  });

  it('leaves a mirror with nothing to fold exactly as it found it', () => {
    expect(collapseTimers([])).toEqual([]);
    expect(collapseTimers([dana])).toEqual([dana]);
  });

  it('takes greatest() on every counter, so no observed minute is thrown away', () => {
    const merged = mergeTimers(dana, brad);
    expect(merged.paused_ms).toBe(60_000);
    expect(merged.left_seconds).toBe(300);
    expect(merged.right_seconds).toBe(420);
  });

  it('is commutative — two devices and the server reach the same row', () => {
    expect(mergeTimers(dana, brad)).toEqual(mergeTimers(brad, dana));
  });

  it('breaks an exact tie on started_at by the lower id, without another round trip', () => {
    const a = timer({ id: 'dddddddd-0000-0000-0000-00000000000a', started_at: iso(NOW) });
    const b = timer({ id: 'dddddddd-0000-0000-0000-00000000000b', started_at: iso(NOW) });
    expect(mergeTimers(a, b).id).toBe(a.id);
    expect(mergeTimers(b, a).id).toBe(a.id);
  });

  it('refuses an unparseable started_at rather than silently preferring the other row', () => {
    const broken = timer({ id: 'dddddddd-0000-0000-0000-00000000000c', started_at: 'just now' });
    expect(() => mergeTimers(broken, brad)).toThrow(TypeError);
  });
});

describe('elapsedMs', () => {
  it('is now minus started_at minus paused_ms — a timer is timestamps, never an interval', () => {
    expect(elapsedMs({ started_at: iso(NOW - 600_000), paused_ms: 0 }, NOW)).toBe(600_000);
    expect(elapsedMs({ started_at: iso(NOW - 600_000), paused_ms: 120_000 }, NOW)).toBe(480_000);
  });

  it('survives a clock that went backwards without showing a negative time', () => {
    expect(elapsedMs({ started_at: iso(NOW + 60_000), paused_ms: 0 }, NOW)).toBe(0);
  });
});

describe('sideMs', () => {
  it('banks both sides when nothing is running', () => {
    expect(
      sideMs(
        { active_side: null, side_started_at: null, left_seconds: 60, right_seconds: 30 },
        NOW,
      ),
    ).toEqual({ left: 60_000, right: 30_000 });
  });

  it('adds the running side’s time since it started, and only that side’s', () => {
    expect(
      sideMs(
        {
          active_side: 'RIGHT',
          side_started_at: iso(NOW - 90_000),
          left_seconds: 60,
          right_seconds: 30,
        },
        NOW,
      ),
    ).toEqual({ left: 60_000, right: 30_000 + 90_000 });
  });
});
