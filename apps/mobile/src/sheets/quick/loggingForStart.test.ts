/**
 * WHERE THE LOGGING-FOR ROW STARTS, as a table (the owner, 2026-09-25: "for module with multiple
 * babies, I think so. Analyze in real life scenario what is the better choice").
 *
 * With the top bar on Both, a sheet starts ON BOTH wherever the module fans out (the owner,
 * 2026-09-30: "Logging for by default should be for both if the both is on"), and on the baby who
 * is up next for a medicine, a breastfeed (the owner, the same day: "Breastfeed on single baby
 * still make more sense imo") and what measures one child. A slot's own baby and a bar on one
 * baby still decide, exactly as before. The up-next tables below are that rule's.
 */
import { describe, expect, it } from 'vitest';
import {
  BABY_TYPES,
  groupLast,
  groupOf,
  loggingForStart,
  NO_RECENCY,
  startsOnAll,
  upNext,
  type GroupLast,
  type Recency,
} from './loggingForStart';
import { ALL } from './save';

const emma = { id: 'emma' };
const liam = { id: 'liam' };
const noor = { id: 'noor' };
const twins = [emma, liam];

const at = (hhmm: string): number => Date.parse(`2026-09-25T${hhmm}:00Z`);

/** Each baby's last entry of the group, as a table; a baby left out has never been logged. */
const lastOf =
  (table: Record<string, GroupLast>) =>
  (id: string): GroupLast =>
    table[id] ?? null;

/** The bar on Both, no slot: the case this rule was written for. */
const onBoth = (table: Record<string, GroupLast>, children = twins) =>
  loggingForStart({
    children,
    isAll: true,
    selectedId: null,
    slotChildId: null,
    lastOf: lastOf(table),
  });

describe('a bar on Both starts on the baby who is up next — never on Both', () => {
  it('the baby whose last entry is the older one', () => {
    expect(onBoth({ emma: at('14:00'), liam: at('13:30') })).toBe('liam');
    expect(onBoth({ emma: at('13:00'), liam: at('14:00') })).toBe('emma');
  });

  it('makes the sequential case zero taps: Emma’s feed, then the sheet starts on Liam', () => {
    // both fed this morning, Emma first
    const table: Record<string, GroupLast> = { emma: at('08:00'), liam: at('08:20') };
    expect(onBoth(table)).toBe('emma');
    // 11:00 — Emma's feed is logged; the sheet opened again starts on Liam
    table['emma'] = at('11:00');
    expect(onBoth(table)).toBe('liam');
    // 11:20 — Liam's is logged; next time it is Emma again
    table['liam'] = at('11:20');
    expect(onBoth(table)).toBe('emma');
  });

  it('gives a tie to the first child in the household’s order', () => {
    // one Both save writes the same start for each baby
    expect(onBoth({ emma: at('09:00'), liam: at('09:00') })).toBe('emma');
    expect(onBoth({ emma: at('09:00'), liam: at('09:00') }, [liam, emma])).toBe('liam');
  });

  it('reads the household’s order, not the ids’', () => {
    expect(onBoth({}, [liam, emma])).toBe('liam');
    expect(onBoth({ emma: at('10:00'), liam: at('10:00') }, [liam, emma])).toBe('liam');
  });

  it('starts on the first child when nobody has logged the module yet', () => {
    expect(onBoth({})).toBe('emma');
  });

  /**
   * NEVER LOGGED IS NOT "UP NEXT" (`loggingForStart.ts` says why): the toddler of a newborn who is
   * never breastfed, the twin who is not the one on medicine — a sheet that started on them would
   * start there every time.
   */
  it('passes over a baby who has never had one, for the baby who has', () => {
    expect(onBoth({ emma: at('14:00') })).toBe('emma');
    expect(onBoth({ liam: at('14:00') })).toBe('liam');
    expect(onBoth({ liam: at('14:00'), noor: at('12:00') }, [emma, liam, noor])).toBe('noor');
  });

  it('counts a timer running now as the newest entry there is', () => {
    // Emma nursing: Liam is up next, whenever his last feed was
    expect(onBoth({ emma: 'running', liam: at('06:00') })).toBe('liam');
    expect(onBoth({ emma: at('06:00'), liam: 'running' })).toBe('emma');
    // both running: the tie rule
    expect(onBoth({ emma: 'running', liam: 'running' })).toBe('emma');
    // a running timer is still an entry: the baby with none is passed over
    expect(onBoth({ emma: 'running' })).toBe('emma');
  });

  it('works the same for All 3', () => {
    const three = [emma, liam, noor];
    expect(onBoth({ emma: at('10:00'), liam: at('09:00'), noor: at('11:00') }, three)).toBe('liam');
    expect(onBoth({ emma: at('10:00'), liam: 'running', noor: at('10:00') }, three)).toBe('emma');
  });

  it('never answers Both / All for a household that has two babies or more', () => {
    const values: GroupLast[] = [null, 'running', at('08:00'), at('09:00')];
    for (const e of values)
      for (const l of values) {
        const start = onBoth({ emma: e, liam: l });
        expect(start).not.toBe(ALL);
        expect(['emma', 'liam']).toContain(start);
      }
  });
});

describe('what already decided keeps deciding', () => {
  it('a slot starts on the slot’s own baby, whatever the bar shows', () => {
    const table = lastOf({ emma: at('08:00'), liam: at('13:00') });
    // on Both, where up next would be Emma
    expect(
      loggingForStart({
        children: twins,
        isAll: true,
        selectedId: null,
        slotChildId: 'liam',
        lastOf: table,
      }),
    ).toBe('liam');
    // on the other baby
    expect(
      loggingForStart({
        children: twins,
        isAll: false,
        selectedId: 'emma',
        slotChildId: 'liam',
        lastOf: table,
      }),
    ).toBe('liam');
  });

  it('a household slot, or one for a baby no longer here, leaves it to the bar', () => {
    const table = lastOf({ emma: at('13:00'), liam: at('08:00') });
    for (const slotChildId of [null, 'gone']) {
      expect(
        loggingForStart({
          children: twins,
          isAll: true,
          selectedId: null,
          slotChildId,
          lastOf: table,
        }),
      ).toBe('liam');
      expect(
        loggingForStart({
          children: twins,
          isAll: false,
          selectedId: 'emma',
          slotChildId,
          lastOf: table,
        }),
      ).toBe('emma');
    }
  });

  it('a bar on one baby starts on that baby, even when the other is up next', () => {
    expect(
      loggingForStart({
        children: twins,
        isAll: false,
        selectedId: 'emma',
        slotChildId: null,
        lastOf: lastOf({ emma: at('14:00'), liam: at('08:00') }),
      }),
    ).toBe('emma');
  });

  it('a household with one baby, or none, has nothing to choose', () => {
    const none = lastOf({});
    expect(
      loggingForStart({
        children: [emma],
        isAll: false,
        selectedId: 'emma',
        slotChildId: null,
        lastOf: none,
      }),
    ).toBe('emma');
    // nobody at all: the save plan says so ("nobody"), rather than a child being invented
    expect(
      loggingForStart({
        children: [],
        isAll: false,
        selectedId: null,
        slotChildId: null,
        lastOf: none,
      }),
    ).toBe(ALL);
    expect(
      loggingForStart({
        children: [],
        isAll: true,
        selectedId: null,
        slotChildId: null,
        lastOf: none,
      }),
    ).toBe(ALL);
  });
});

describe('the group a module is read across', () => {
  it('is read ahead for every activity a baby can have — never the household’s pump', () => {
    for (const id of [
      'bottle',
      'breastfeed',
      'diaper',
      'sleep',
      'tummy',
      'solids',
      'med',
      'bath',
      'growth',
      'temp',
    ] as const)
      expect(BABY_TYPES).toContain(id);
    expect(BABY_TYPES).not.toContain('pump');
  });

  it('reads both feeds for either feed, as the feeding tiles do', () => {
    expect(groupOf('bottle')).toEqual(['bottle', 'breastfeed']);
    expect(groupOf('breastfeed')).toEqual(['bottle', 'breastfeed']);
  });

  it('reads every other activity on its own, and nothing for a module that is not one', () => {
    for (const id of [
      'diaper',
      'sleep',
      'tummy',
      'solids',
      'med',
      'bath',
      'growth',
      'temp',
    ] as const)
      expect(groupOf(id)).toEqual([id]);
    expect(groupOf('stash')).toEqual([]);
    expect(groupOf('vaccine')).toEqual([]);
  });

  const recency: Recency = {
    lastAt: {
      // Emma: a breastfeed at 7 and a bottle at 10; a diaper at 9
      emma: { breastfeed: at('07:00'), bottle: at('10:00'), diaper: at('09:00') },
      // Liam: a bottle at 8, a diaper at 11
      liam: { bottle: at('08:00'), diaper: at('11:00') },
    },
    running: [],
  };

  it('takes a baby’s newest entry of either feed', () => {
    expect(groupLast(recency, 'breastfeed', 'emma')).toBe(at('10:00'));
    expect(groupLast(recency, 'bottle', 'emma')).toBe(at('10:00'));
    expect(groupLast(recency, 'breastfeed', 'liam')).toBe(at('08:00'));
    expect(groupLast(recency, 'diaper', 'liam')).toBe(at('11:00'));
    expect(groupLast(recency, 'sleep', 'liam')).toBeNull();
    expect(groupLast(recency, 'bottle', 'noor')).toBeNull();
  });

  it('so a breastfeed sheet on Both starts on the baby fed longest ago, either way', () => {
    const start = (moduleId: 'bottle' | 'breastfeed' | 'diaper') =>
      upNext(twins, id => groupLast(recency, moduleId, id));
    expect(start('breastfeed')).toBe('liam');
    expect(start('bottle')).toBe('liam');
    expect(start('diaper')).toBe('emma');
  });

  it('counts a running timer of the group for its own baby only', () => {
    const nursing: Recency = {
      ...recency,
      running: [
        { type: 'breastfeed', childId: 'liam' },
        // a pump is the household's: it is nobody's feed
        { type: 'pump', childId: null },
      ],
    };
    expect(groupLast(nursing, 'bottle', 'liam')).toBe('running');
    expect(groupLast(nursing, 'breastfeed', 'liam')).toBe('running');
    expect(groupLast(nursing, 'bottle', 'emma')).toBe(at('10:00'));
    // Liam nursing: a bottle sheet on Both starts on Emma
    expect(upNext(twins, id => groupLast(nursing, 'bottle', id))).toBe('emma');
    // a feed running is not a sleep
    expect(groupLast(nursing, 'sleep', 'liam')).toBeNull();
    expect(groupLast(nursing, 'pump', 'emma')).toBeNull();
  });

  it('knows nothing before the read has come back, and then starts on the first child', () => {
    expect(groupLast(NO_RECENCY, 'bottle', 'emma')).toBeNull();
    expect(upNext(twins, id => groupLast(NO_RECENCY, 'bottle', id))).toBe('emma');
    expect(upNext([], () => null)).toBeNull();
  });
});

describe('a bar on Both starts on Both where the module fans out (the owner, 2026-09-30)', () => {
  const start = (startOnAll: boolean, over: Partial<Parameters<typeof loggingForStart>[0]> = {}) =>
    loggingForStart({
      children: twins,
      isAll: true,
      selectedId: null,
      slotChildId: null,
      lastOf: lastOf({ emma: at('14:00'), liam: at('13:30') }),
      startOnAll,
      ...over,
    });

  it('starts on Both for a sleep, a bottle, a diaper: every module whose row offers it', () => {
    for (const m of ['sleep', 'bottle', 'diaper', 'solids', 'tummy', 'bath'] as const)
      expect(startsOnAll(m, true), m).toBe(true);
    expect(start(true)).toBe(ALL);
  });

  it('but a medicine starts on the baby up next: a dose for the wrong twin can cost a real one', () => {
    expect(startsOnAll('med', true)).toBe(false);
    expect(start(startsOnAll('med', true))).toBe('liam');
  });

  /**
   * A BREASTFEED ON BOTH IS A TANDEM (the owner, 2026-09-30: "Breastfeed on single baby still make
   * more sense imo"): one baby on each breast, which a parent chooses, never a sheet. It starts on
   * the baby fed longest ago, by bottle or breast, and Both stays one tap away on the row.
   */
  it('and so does a breastfeed: on Both it would be a tandem nobody chose', () => {
    expect(startsOnAll('breastfeed', true)).toBe(false);
    expect(start(startsOnAll('breastfeed', true))).toBe('liam');
    // the feeding group: Emma's bottle at 15:00 makes Liam, breastfed at 14:00, the one up next
    const recency: Recency = {
      lastAt: { emma: { bottle: at('15:00') }, liam: { breastfeed: at('14:00') } },
      running: [],
    };
    expect(
      start(startsOnAll('breastfeed', true), {
        lastOf: id => groupLast(recency, 'breastfeed', id),
      }),
    ).toBe('liam');
    // Emma nursing now: the sheet opened again starts on Liam
    const nursing: Recency = { ...recency, running: [{ type: 'breastfeed', childId: 'emma' }] };
    expect(
      start(startsOnAll('breastfeed', true), {
        lastOf: id => groupLast(nursing, 'breastfeed', id),
      }),
    ).toBe('liam');
    // a bottle still starts on Both: one stepper, and a split when the amounts differ
    expect(startsOnAll('bottle', true)).toBe(true);
  });

  it('and a module that cannot fan out never starts on a Both it does not offer', () => {
    expect(startsOnAll('growth', false)).toBe(false);
    expect(startsOnAll('temp', false)).toBe(false);
  });

  it('a slot still starts on its own baby, and a bar on one baby on that baby', () => {
    expect(start(true, { slotChildId: 'emma' })).toBe('emma');
    expect(start(true, { isAll: false, selectedId: 'liam' })).toBe('liam');
  });

  it('a household with one baby has no Both to start on', () => {
    expect(start(true, { children: [emma] })).toBe('emma');
  });
});
