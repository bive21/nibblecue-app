import { describe, expect, it } from 'vitest';
import { MILK_GUIDANCE } from '../guidance';
import { guidanceDates } from './guidance';
import { rankForUse, reasonLine, useSoon, type StashCandidate } from './ranking';

const profile = MILK_GUIDANCE.CDC_US['2026_01'];
const TZ = 'America/New_York';
const f = { timeZone: TZ, clock24: false };
const now = Date.parse('2026-06-12T15:00:00-04:00'); // 3:00 PM

function candidate(
  id: string,
  kind: StashCandidate['kind'],
  amountMl: number,
  anchors: { pumped_at: string; first_frozen_at?: string | null; thawed_at?: string | null },
  status: StashCandidate['status'] = kind === 'THAWED' ? 'THAWING' : 'STORED',
): StashCandidate {
  const a = { first_frozen_at: null, thawed_at: null, ...anchors };
  const d = guidanceDates(profile, kind, a);
  return {
    id,
    amountMl,
    status,
    kind,
    pumpedAt: a.pumped_at,
    firstFrozenAt: a.first_frozen_at,
    thawedAt: a.thawed_at,
    locationName: kind,
    locationShort: kind,
    bestUseAt: d.bestUseAt,
    limitAt: d.limitAt,
  };
}

const iso = (offsetMin: number) => new Date(now + offsetMin * 60_000).toISOString();

describe('the ranking (MILK_STASH §6b)', () => {
  const fresh = candidate('fresh', 'ROOM', 74, { pumped_at: iso(-42) });
  const thawed = candidate('thawed', 'THAWED', 118, {
    pumped_at: iso(-30 * 24 * 60),
    first_frozen_at: iso(-29 * 24 * 60),
    thawed_at: iso(-5 * 60),
  });
  const fridgeOld = candidate('fridgeOld', 'FRIDGE', 148, { pumped_at: iso(-2 * 24 * 60) });
  const fridgeNew = candidate('fridgeNew', 'FRIDGE', 148, { pumped_at: iso(-3 * 60) });
  const frozenSoon = candidate('frozenSoon', 'FREEZER', 118, {
    pumped_at: iso(-161 * 24 * 60),
    first_frozen_at: iso(-160 * 24 * 60),
  });
  const frozenLate = candidate('frozenLate', 'DEEP_FREEZER', 118, {
    pumped_at: iso(-10 * 24 * 60),
    first_frozen_at: iso(-9 * 24 * 60),
  });

  it('is fresh → thawed → fridge (oldest pumped) → frozen (earliest best use)', () => {
    const order = rankForUse(
      [frozenLate, fridgeNew, frozenSoon, thawed, fridgeOld, fresh],
      now,
      f,
    ).map(c => c.id);
    expect(order).toEqual([
      'fresh',
      'thawed',
      'fridgeOld',
      'fridgeNew',
      'frozenSoon',
      'frozenLate',
    ]);
  });

  it('never suggests a container under 30 ml or past its own limit, but keeps it in the list', () => {
    const tiny = candidate('tiny', 'ROOM', 20, { pumped_at: iso(-5) });
    const past = candidate('past', 'FRIDGE', 200, { pumped_at: iso(-6 * 24 * 60) });
    const ranked = rankForUse([past, tiny, fridgeNew], now, f);
    expect(ranked.map(c => c.id)).toEqual(['fridgeNew', 'tiny', 'past']);
    expect(ranked[1]).toMatchObject({ suggested: false, whyNot: 'under_min' });
    expect(ranked[2]).toMatchObject({ suggested: false, whyNot: 'past_limit' });
    expect(ranked[0]).toMatchObject({ suggested: true, whyNot: null });
  });

  it('a frozen container with no freeze date is listed, not suggested, and says what it needs', () => {
    const undated = candidate('undated', 'FREEZER', 118, {
      pumped_at: iso(-20 * 24 * 60),
      first_frozen_at: null,
    });
    const [r] = rankForUse([undated], now, f);
    expect(r).toMatchObject({ suggested: false, whyNot: 'date_needed' });
    expect(r?.reason).toBe('Frozen · freeze date needed · needs thawing');
  });

  it('gives every candidate the reason the parent reads (§6b table)', () => {
    expect(reasonLine(fresh, now, f)).toBe(
      'Out since 2:18 PM · nothing to thaw or warm · use within 3h 18m',
    );
    expect(reasonLine(thawed, now, f)).toBe(
      'Thawed · use by 10:00 AM · thawed milk does not go back in the freezer',
    );
    expect(reasonLine(fridgeOld, now, f)).toBe('Fridge · pumped Wed · 2 days left');
    expect(reasonLine(frozenSoon, now, f)).toBe(
      'Frozen Jan 3 · best use in 23 days · needs thawing',
    );
    expect(reasonLine(fresh, now, { ...f, clock24: true })).toContain('Out since 14:18');
  });

  it('chips read Fresh · Thawing · Fridge · Frozen', () => {
    expect(rankForUse([fresh, thawed, fridgeOld, frozenSoon], now, f).map(c => c.chip)).toEqual([
      'Fresh',
      'Thawing',
      'Fridge',
      'Frozen',
    ]);
  });

  it('the use-first net is frozen within 30 days and fresh within 48 h, by best use', () => {
    const soon = useSoon([frozenLate, frozenSoon, fridgeOld, fridgeNew, fresh, thawed], now);
    expect(soon.map(c => c.id)).toEqual(['fresh', 'thawed', 'fridgeOld', 'frozenSoon']);
  });
});
