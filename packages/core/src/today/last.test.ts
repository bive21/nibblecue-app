import { describe, expect, it } from 'vitest';
import { zonedToUtc } from './day';
import { lastAtFor, lastByModule, latestFirst, recencyMs } from './last';
import { newestFirst, type ActiveTimer, type TodayActivity } from './rows';
import { todayTotals } from './totals';
import { localDayBounds } from './day';

const TZ = 'America/Los_Angeles';
const at = (h: number, m = 0, day = 14): number => zonedToUtc(TZ, 2026, 9, day, h, m);

let seq = 0;
function row(
  over: Partial<TodayActivity> & Pick<TodayActivity, 'type' | 'startMs'>,
): TodayActivity {
  seq += 1;
  return {
    id: `a${seq}`,
    childId: 'kid',
    endMs: null,
    isPrivate: false,
    createdBy: 'dana',
    ...over,
  };
}

describe('lastByModule', () => {
  it('picks the newest entry of each type', () => {
    const older = row({ type: 'bottle', startMs: at(8), consumedMl: 120 });
    const newer = row({ type: 'bottle', startMs: at(11), consumedMl: 90 });
    const diaper = row({ type: 'diaper', startMs: at(9), diaperKind: 'WET' });

    const last = lastByModule([older, newer, diaper]);
    expect(last.bottle?.id).toBe(newer.id);
    expect(last.diaper?.id).toBe(diaper.id);
    expect(last.sleep).toBeUndefined();
  });

  it('reaches back past today — a caregiver taking over at 6 a.m. still sees last night', () => {
    const lastNight = row({ type: 'bottle', startMs: at(22, 0, 13), consumedMl: 150 });
    expect(lastByModule([lastNight]).bottle?.id).toBe(lastNight.id);
  });

  it('keeps a DRY diaper as the last diaper even though it is not counted (D4)', () => {
    const wet = row({ type: 'diaper', startMs: at(9), diaperKind: 'WET' });
    const dry = row({ type: 'diaper', startMs: at(11), diaperKind: 'DRY' });
    const rows = [wet, dry];

    // the two rules are independent and both hold for the same row
    expect(lastByModule(rows).diaper?.id).toBe(dry.id);
    expect(todayTotals(rows, [], localDayBounds(TZ, at(12)), at(12)).diapers).toBe(1);
  });

  it('the last bottle is the last bottle of MILK — water is logged, never the last feed (M7)', () => {
    const milk = row({ type: 'bottle', startMs: at(3), consumedMl: 120, bottleKind: 'EBM' });
    const water = row({ type: 'bottle', startMs: at(5, 50), consumedMl: 60, bottleKind: 'WATER' });
    // a feeding tile beside the word "due" reads 3:00, not the water at 5:50
    expect(lastByModule([milk, water]).bottle?.id).toBe(milk.id);
    // water alone is no feed at all
    expect(lastByModule([water]).bottle).toBeUndefined();
    // and a bottle with no kind recorded is still a feed
    const unknown = row({ type: 'bottle', startMs: at(6), consumedMl: 90, bottleKind: null });
    expect(lastByModule([milk, water, unknown]).bottle?.id).toBe(unknown.id);
  });

  it('is order-independent — the caller need not sort first', () => {
    const a = row({ type: 'bottle', startMs: at(8) });
    const b = row({ type: 'bottle', startMs: at(11) });
    expect(lastByModule([a, b]).bottle?.id).toBe(b.id);
    expect(lastByModule([b, a]).bottle?.id).toBe(b.id);
  });

  /**
   * THE OWNER, 2026-09-26: "i added 2 min left 2 min right, but it keeps showing as 'Now · 0m'".
   * A feed started and finished at once by mistake (10:00:00–10:00:05), then the real one typed in
   * at 10:00:40 as "Already finished", 2 + 2 minutes: 9:56:40–10:00:40. By start the mistap was
   * the last feed and the typed-in one could never be; it is the one that happened last.
   */
  it('takes the entry that ENDED last, so a feed typed in afterwards is the last feed', () => {
    const s = 1000;
    const mistap = row({
      type: 'breastfeed',
      startMs: at(10),
      endMs: at(10) + 5 * s,
      leftSeconds: 5,
      rightSeconds: 0,
    });
    const typed = row({
      type: 'breastfeed',
      startMs: at(10) + 40 * s - 4 * 60 * s,
      endMs: at(10) + 40 * s,
      leftSeconds: 120,
      rightSeconds: 120,
    });
    expect(lastByModule([mistap, typed]).breastfeed?.id).toBe(typed.id);
    expect(lastByModule([typed, mistap]).breastfeed?.id).toBe(typed.id);
    // and the elapsed is still counted from ITS start (the owner, 2026-09-16)
    expect(lastAtFor('breastfeed', lastByModule([mistap, typed]), [])).toEqual({
      lastAtMs: typed.startMs,
    });
  });

  it('does the same for a sleep, a pump and tummy time typed in over a short timed one', () => {
    for (const type of ['sleep', 'pump', 'tummy'] as const) {
      const timed = row({ type, startMs: at(14), endMs: at(14) + 10_000 });
      const typed = row({ type, startMs: at(13, 45), endMs: at(14, 1) });
      expect(lastByModule([timed, typed])[type]?.id, type).toBe(typed.id);
    }
  });

  it('changes nothing for entries that do not overlap, nor for point entries', () => {
    const nap = row({ type: 'sleep', startMs: at(9), endMs: at(10) });
    const later = row({ type: 'sleep', startMs: at(13), endMs: at(13, 20) });
    expect(lastByModule([later, nap]).sleep?.id).toBe(later.id);
    // an open entry (no end) ranks by its start, as a bottle or a diaper does
    const open = row({ type: 'sleep', startMs: at(15), endMs: null });
    expect(lastByModule([later, open, nap]).sleep?.id).toBe(open.id);
    expect(recencyMs(open)).toBe(at(15));
    expect(recencyMs(later)).toBe(at(13, 20));
  });
});

describe('latestFirst', () => {
  it('orders by the end, then the start, then the id — stable either way round', () => {
    const a = { id: 'aaa', startMs: 1000, endMs: 5000 };
    const b = { id: 'bbb', startMs: 3000, endMs: 4000 };
    const c = { id: 'ccc', startMs: 3000, endMs: 5000 };
    const d = { id: 'ddd', startMs: 3000, endMs: 5000 };
    expect(latestFirst([a, b, c, d]).map(r => r.id)).toEqual(['ddd', 'ccc', 'aaa', 'bbb']);
    expect(latestFirst([d, c, b, a]).map(r => r.id)).toEqual(['ddd', 'ccc', 'aaa', 'bbb']);
  });
});

describe('newestFirst', () => {
  it('breaks a tie deterministically so two entries at one instant never swap', () => {
    const a = { id: 'aaa', startMs: 1000 };
    const b = { id: 'bbb', startMs: 1000 };
    expect(newestFirst([a, b]).map(r => r.id)).toEqual(['bbb', 'aaa']);
    expect(newestFirst([b, a]).map(r => r.id)).toEqual(['bbb', 'aaa']);
  });

  it('does not mutate its input', () => {
    const rows = [
      { id: 'a', startMs: 1 },
      { id: 'b', startMs: 2 },
    ];
    newestFirst(rows);
    expect(rows.map(r => r.id)).toEqual(['a', 'b']);
  });
});

describe('lastAtFor', () => {
  const running: ActiveTimer[] = [
    { id: 't1', type: 'sleep', childId: 'kid', startedAtMs: at(11, 30), startedBy: 'dana' },
  ];

  it('reports a running timer ahead of any finished entry', () => {
    const finished = row({ type: 'sleep', startMs: at(8), endMs: at(9) });
    const last = lastByModule([finished]);
    expect(lastAtFor('sleep', last, running)).toEqual({ runningSince: at(11, 30) });
  });

  /**
   * THE START, for every activity — the owner, 2026-09-16 ("use the start time for the
   * calculation"). A pump from 8:50 to 9:25 logged the moment it ended used to read "Now", which
   * is true of the tap and useless about the pump; "35m" is the fact a parent is looking for. The
   * same instant anchors the schedule (`intervalAnchor`), so the tile and the next slot agree.
   */
  it('uses the START of a finished timed activity, not its end', () => {
    const nap = row({ type: 'sleep', startMs: at(10), endMs: at(11, 35) });
    expect(lastAtFor('sleep', lastByModule([nap]), [])).toEqual({ lastAtMs: at(10) });
    const pump = row({ type: 'pump', startMs: at(20, 50), endMs: at(21, 25) });
    expect(lastAtFor('pump', lastByModule([pump]), [])).toEqual({ lastAtMs: at(20, 50) });
  });

  it('uses the start for an instantaneous entry, which has no end', () => {
    const diaper = row({ type: 'diaper', startMs: at(9), diaperKind: 'WET' });
    expect(lastAtFor('diaper', lastByModule([diaper]), [])).toEqual({ lastAtMs: at(9) });
  });

  it('returns null when the module has never been logged', () => {
    expect(lastAtFor('solids', {}, [])).toBeNull();
  });
});
