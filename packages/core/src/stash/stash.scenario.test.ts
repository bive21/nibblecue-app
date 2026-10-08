/**
 * The pure halves of two faults the stash sweep of 2026-09-24 found by living real days in
 * `apps/mobile/src/scenarios/stash.scenario.test.ts` — held here too, next to the code, so the
 * rule is a table test and not only the last line of a week-long scenario.
 *
 *   1. A bag a minute past its window read "use today" on its reason line (calendar days round a
 *      date that passed this morning to 0), beside "past best use" on its badge.
 *   2. The overdraw rewrite keyed its USE on the intent, so a bottle that walked two bags and was
 *      refused on the SECOND sent a USE the server already had (the first bag's), and the second
 *      bag kept milk that was in a bottle.
 */
import { describe, expect, it } from 'vitest';
import { MILK_GUIDANCE } from '../guidance';
import { deriveOpId } from '../sync/ids';
import { rewriteOverdraw } from '../sync/overdraw';
import type { PushOp } from '../sync/types';
import { guidanceDates } from './guidance';
import { reasonLine, type StashCandidate } from './ranking';

const TZ = 'America/Los_Angeles';
const profile = MILK_GUIDANCE.CDC_US['2026_01'];
const format = { timeZone: TZ, clock24: false };

/** A bag in `kind`, pumped (and, for a freezer, frozen) at `at`, dated by the profile. */
function bag(kind: 'FRIDGE' | 'FREEZER', at: string): StashCandidate {
  const anchors = {
    pumped_at: at,
    first_frozen_at: kind === 'FREEZER' ? at : null,
    thawed_at: null,
  };
  const dates = guidanceDates(profile, kind, anchors);
  return {
    id: 'bag',
    amountMl: 118,
    status: 'STORED',
    kind,
    pumpedAt: at,
    firstFrozenAt: anchors.first_frozen_at,
    thawedAt: null,
    locationName: null,
    locationShort: null,
    bestUseAt: dates.bestUseAt,
    limitAt: dates.limitAt,
  };
}

describe('the reason line on the day a window ends', () => {
  // pumped Mon 2026-09-21 07:00 PDT: four days in the fridge end Fri 07:00 PDT (14:00Z)
  const fridge = bag('FRIDGE', '2026-09-21T14:00:00.000Z');
  // frozen 2026-03-01 08:00 PST: about six months end on 2026-08-31 in the morning
  const frozen = bag('FREEZER', '2026-03-01T16:00:00.000Z');
  const hourBefore = (b: StashCandidate) => (b.bestUseAt as number) - 60 * 60_000;
  const minuteAfter = (b: StashCandidate) => (b.bestUseAt as number) + 60_000;

  it.each([
    ['fridge, an hour before', fridge, hourBefore(fridge), 'Fridge · pumped Mon · use today'],
    ['fridge, a minute after', fridge, minuteAfter(fridge), 'Fridge · pumped Mon · past best use'],
    [
      'freezer, an hour before',
      frozen,
      hourBefore(frozen),
      'Frozen Mar 1 · best use today · needs thawing',
    ],
    [
      'freezer, a minute after',
      frozen,
      minuteAfter(frozen),
      'Frozen Mar 1 · past best use · needs thawing',
    ],
  ])('%s', (_label, b, nowMs, line) => {
    expect(reasonLine(b, nowMs, format)).toBe(line);
  });
});

describe('rewriting an overdrawn draw', () => {
  const INTENT = '5f9a1c3e-8b24-4d7a-9e06-1c2b3a4d5e6f';
  const draw = (tag: string, deltaMl: number): PushOp => ({
    client_op_id: deriveOpId(INTENT, tag),
    entity: 'milk_txn',
    op: 'CREATE',
    entity_id: deriveOpId(INTENT, tag),
    household_id: 'aaaaaaaa-0000-4000-8000-000000000001',
    payload: {
      container_id: `container-${tag}`,
      kind: 'USE',
      delta_ml: deltaMl,
      activity_id: 'eeeeeeee-0000-4000-8000-000000000001',
      occurred_at: '2026-09-22T01:10:00.000Z',
    },
  });

  it('keeps a one-bag bottle’s ids exactly as they were', () => {
    const [use, adjust] = rewriteOverdraw(draw('use', -118), 32, INTENT);
    expect(use.client_op_id).toBe(deriveOpId(INTENT, 'use'));
    expect(adjust.client_op_id).toBe(deriveOpId(INTENT, 'adj'));
  });

  it('rewrites the second bag of a walk under ITS OWN key, never the first bag’s', () => {
    const first = draw('use', -150);
    const second = draw('use2', -57);
    const [use, adjust] = rewriteOverdraw(second, 56, INTENT);
    expect(use.client_op_id).toBe(second.client_op_id);
    expect(use.client_op_id).not.toBe(first.client_op_id);
    expect(use.entity_id).toBe(second.entity_id);
    expect(use.payload).toMatchObject({ container_id: 'container-use2', delta_ml: -56 });
    expect(adjust.payload).toMatchObject({ container_id: 'container-use2', delta_ml: -1 });
    // and two bags refused in one bottle never share an ADJUST
    const [, thirdAdjust] = rewriteOverdraw(draw('use3', -40), 10, INTENT);
    expect(
      new Set([adjust.client_op_id, thirdAdjust.client_op_id, deriveOpId(INTENT, 'adj')]).size,
    ).toBe(3);
    // a replay after a kill is byte-identical
    expect(JSON.stringify(rewriteOverdraw(second, 56, INTENT))).toBe(JSON.stringify([use, adjust]));
  });
});
