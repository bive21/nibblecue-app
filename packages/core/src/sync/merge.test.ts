import { describe, expect, it } from 'vitest';
import { CLOCK_SKEW_CLAMP_MS, HISTORY_CAP } from './constants';
import { clampEditClock, mergeFields, wholeRowApplies, type HistoryEntry } from './merge';

const DANA = '11111111-1111-1111-1111-111111111111';
const BRAD = '22222222-2222-2222-2222-222222222222';
const NOW = Date.parse('2026-09-14T10:30:00.000Z');
const iso = (ms: number) => new Date(ms).toISOString();

const empty = { clocks: {}, history: [] as HistoryEntry[] };

describe('mergeFields', () => {
  it('applies every field when the row has no clock for it yet', () => {
    const r = mergeFields({
      current: { notes: null, quantity: 90 },
      patch: { notes: 'took it all', quantity: 120 },
      ...empty,
      clientEditedAt: iso(NOW),
      by: DANA,
    });
    expect(r.applied).toEqual({ notes: 'took it all', quantity: 120 });
    expect(r.dropped).toEqual([]);
    expect(r.history).toEqual([]);
    expect(r.clocks).toEqual({ notes: iso(NOW), quantity: iso(NOW) });
  });

  it('lets two caregivers editing different fields both keep their change, in BOTH orders', () => {
    const danaEdit = { field: 'notes', value: 'fussy', at: iso(NOW - 600_000), by: DANA };
    const bradEdit = { field: 'quantity', value: 150, at: iso(NOW - 300_000), by: BRAD };

    for (const order of [
      [danaEdit, bradEdit],
      [bradEdit, danaEdit],
    ]) {
      let clocks = {};
      let history: HistoryEntry[] = [];
      let row: Record<string, unknown> = { notes: null, quantity: 120 };
      for (const e of order) {
        const r = mergeFields({
          current: row,
          patch: { [e.field]: e.value },
          clocks,
          history,
          clientEditedAt: e.at,
          by: e.by,
        });
        clocks = r.clocks;
        history = r.history;
        row = r.surviving;
      }
      expect(row).toEqual({ notes: 'fussy', quantity: 150 });
      expect(history).toEqual([]);
    }
  });

  it('resolves the same field to the later clock whichever arrives first', () => {
    const early = { at: iso(NOW - 600_000), by: DANA, value: 'early' };
    const late = { at: iso(NOW - 60_000), by: BRAD, value: 'late' };

    for (const order of [
      [early, late],
      [late, early],
    ]) {
      let clocks = {};
      let history: HistoryEntry[] = [];
      let row: Record<string, unknown> = { notes: null };
      for (const e of order) {
        const r = mergeFields({
          current: row,
          patch: { notes: e.value },
          clocks,
          history,
          clientEditedAt: e.at,
          by: e.by,
        });
        clocks = r.clocks;
        history = r.history;
        row = r.surviving;
      }
      expect(row['notes']).toBe('late');
    }
  });

  it('keeps the losing value in history rather than dropping it on the floor', () => {
    const r = mergeFields({
      current: { notes: 'Brad wrote this at 10:20' },
      patch: { notes: 'Dana wrote this at 10:10' },
      clocks: { notes: iso(NOW - 600_000) },
      history: [],
      clientEditedAt: iso(NOW - 1_200_000),
      by: DANA,
    });
    expect(r.applied).toEqual({});
    expect(r.dropped).toEqual(['notes']);
    expect(r.surviving['notes']).toBe('Brad wrote this at 10:20');
    expect(r.history).toEqual([
      { at: iso(NOW - 1_200_000), by: DANA, field: 'notes', from: 'Dana wrote this at 10:10' },
    ]);
    // The clock of a dropped field is untouched: losing must not age the winner's claim.
    expect(r.clocks).toEqual({ notes: iso(NOW - 600_000) });
  });

  it('caps history at 20 entries, oldest out', () => {
    expect(HISTORY_CAP).toBe(20);
    const history: HistoryEntry[] = Array.from({ length: 20 }, (_, i) => ({
      at: iso(NOW - (100 - i) * 1000),
      by: BRAD,
      field: 'notes',
      from: `old ${i}`,
    }));
    const r = mergeFields({
      current: { notes: 'winner' },
      patch: { notes: 'loser' },
      clocks: { notes: iso(NOW) },
      history,
      clientEditedAt: iso(NOW - 5000),
      by: DANA,
    });
    expect(r.history).toHaveLength(20);
    expect(r.history[0]?.from).toBe('old 1'); // 'old 0' fell off the front
    expect(r.history[19]?.from).toBe('loser');
  });

  it('ignores fields the patch does not carry', () => {
    const r = mergeFields({
      current: { notes: 'keep', quantity: 120 },
      patch: { quantity: 150 },
      clocks: { notes: iso(NOW) },
      history: [],
      clientEditedAt: iso(NOW - 1000),
      by: DANA,
    });
    expect(r.surviving).toEqual({ notes: 'keep', quantity: 150 });
  });

  it('refuses an unparseable clock rather than silently treating it as the epoch', () => {
    expect(() =>
      mergeFields({
        current: {},
        patch: { notes: 'x' },
        ...empty,
        clientEditedAt: 'soon',
        by: DANA,
      }),
    ).toThrow(TypeError);
  });
});

describe('clampEditClock', () => {
  it('leaves a clock in the past alone', () => {
    const r = clampEditClock(iso(NOW - 60_000), NOW);
    expect(r).toEqual({ ok: true, at: iso(NOW - 60_000), clamped: false });
  });

  it('clamps a phone that is a couple of minutes fast to the server’s now', () => {
    const r = clampEditClock(iso(NOW + 120_000), NOW);
    expect(r).toEqual({ ok: true, at: iso(NOW), clamped: true });
  });

  it('refuses a clock ten minutes ahead outright, so a broken device cannot win every field', () => {
    const r = clampEditClock(iso(NOW + 600_000), NOW);
    expect(r.ok).toBe(false);
    expect(r).toMatchObject({ code: 'VALIDATION' });
    expect(CLOCK_SKEW_CLAMP_MS).toBe(300_000);
  });

  it('clamps right up to the five-minute edge and refuses past it', () => {
    expect(clampEditClock(iso(NOW + CLOCK_SKEW_CLAMP_MS), NOW)).toMatchObject({ ok: true });
    expect(clampEditClock(iso(NOW + CLOCK_SKEW_CLAMP_MS + 1), NOW)).toMatchObject({ ok: false });
  });

  it('refuses a value that is not a timestamp', () => {
    expect(clampEditClock('yesterday', NOW)).toMatchObject({ ok: false, code: 'VALIDATION' });
  });

  it('composes with mergeFields: refused loses everything, clamped still wins on merit', () => {
    const row = { notes: 'the honest value' };
    const clocks = { notes: iso(NOW - 1000) };

    // A device ten minutes fast: the op is rejected VALIDATION and the row is never touched.
    const refused = clampEditClock(iso(NOW + 600_000), NOW);
    expect(refused.ok).toBe(false);

    // A device two minutes fast: the clock is pulled back to the server's now, which is still
    // later than the row's own clock, so the edit applies — clamping is not a punishment.
    const clamped = clampEditClock(iso(NOW + 120_000), NOW);
    expect(clamped).toMatchObject({ ok: true, clamped: true });
    if (!clamped.ok) throw new Error('unreachable');
    const merged = mergeFields({
      current: row,
      patch: { notes: 'from the fast phone' },
      clocks,
      history: [],
      clientEditedAt: clamped.at,
      by: DANA,
    });
    expect(merged.surviving['notes']).toBe('from the fast phone');
    expect(merged.clocks['notes']).toBe(iso(NOW));
  });
});

describe('wholeRowApplies — the tables with no metadata column', () => {
  it('applies a patch edited at or after the row’s last server write', () => {
    expect(wholeRowApplies(iso(NOW), iso(NOW - 1000))).toBe(true);
    expect(wholeRowApplies(iso(NOW), iso(NOW))).toBe(true);
  });

  it('drops a patch edited before it', () => {
    expect(wholeRowApplies(iso(NOW - 1000), iso(NOW))).toBe(false);
  });
});
