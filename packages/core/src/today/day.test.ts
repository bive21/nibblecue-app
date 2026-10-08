import { describe, expect, it, vi } from 'vitest';
import {
  localDayBounds,
  localDayKey,
  overlapMs,
  shiftDay,
  wallClock,
  zonedToUtc,
  zoneOffsetMs,
} from './day';

const H = 3_600_000;
const QUARTER_HOUR = 15 * 60_000;

describe('wallClock and zoneOffsetMs', () => {
  it('reads the same instant differently in two zones', () => {
    // 2026-09-14T22:30:00Z
    const at = Date.UTC(2026, 8, 14, 22, 30, 0);
    expect(wallClock('UTC', at)).toMatchObject({ year: 2026, month: 9, day: 14, hour: 22 });
    // Los Angeles is UTC-7 in September: still the 14th, 15:30
    expect(wallClock('America/Los_Angeles', at)).toMatchObject({ day: 14, hour: 15 });
    // Auckland is UTC+12 in September: already the 15th, 10:30
    expect(wallClock('Pacific/Auckland', at)).toMatchObject({ day: 15, hour: 10 });
  });

  it('reports offsets east-positive', () => {
    const at = Date.UTC(2026, 8, 14, 22, 30, 0);
    expect(zoneOffsetMs('UTC', at)).toBe(0);
    expect(zoneOffsetMs('America/Los_Angeles', at)).toBe(-7 * H);
    expect(zoneOffsetMs('Pacific/Auckland', at)).toBe(12 * H);
  });

  it('tracks a zone across its own DST change', () => {
    // US DST ends 2026-11-01. Los Angeles is -7 before and -8 after.
    expect(zoneOffsetMs('America/Los_Angeles', Date.UTC(2026, 9, 15, 12))).toBe(-7 * H);
    expect(zoneOffsetMs('America/Los_Angeles', Date.UTC(2026, 10, 15, 12))).toBe(-8 * H);
  });
});

describe('zonedToUtc — the backwards direction', () => {
  it('round-trips every hour of an ordinary day', () => {
    for (let hour = 0; hour < 24; hour++) {
      const ts = zonedToUtc('America/Los_Angeles', 2026, 9, 14, hour);
      expect(wallClock('America/Los_Angeles', ts).hour).toBe(hour);
    }
  });

  it('round-trips across a spring-forward day, resolving the hour that does not exist forward', () => {
    // US DST begins 2026-03-08: local 02:00 jumps to 03:00, so 02:xx never happens.
    for (let hour = 0; hour < 24; hour++) {
      const ts = zonedToUtc('America/Los_Angeles', 2026, 3, 8, hour);
      const got = wallClock('America/Los_Angeles', ts).hour;
      if (hour === 2)
        expect(got).toBe(3); // the gap resolves to the instant clocks jump TO
      else expect(got).toBe(hour);
    }
  });

  it('returns the earlier instant when a wall-clock time happens twice', () => {
    // US DST ends 2026-11-01: local 01:00 occurs at 08:00Z (PDT) and again at 09:00Z (PST).
    expect(zonedToUtc('America/Los_Angeles', 2026, 11, 1, 1)).toBe(Date.UTC(2026, 10, 1, 8));
  });
});

describe('the day whose midnight does not exist', () => {
  // Not hypothetical. Santiago moves its clocks AT midnight: on 2026-09-06 the local day
  // jumps straight from 23:59:59 on the 5th to 01:00:00, so 00:00 never happens. An earlier
  // implementation returned an instant an hour BEFORE the jump here, which would have put
  // the first hour of the day inside the previous day as well and double-counted it.
  const tz = 'America/Santiago';

  it('starts that day at 01:00 local, the instant the clock jumps to', () => {
    const noon = zonedToUtc(tz, 2026, 9, 6, 12);
    const b = localDayBounds(tz, noon);
    expect(wallClock(tz, b.startMs)).toMatchObject({ year: 2026, month: 9, day: 6, hour: 1 });
  });

  it('makes that day 23 hours, and leaves no gap against the day before', () => {
    const b = localDayBounds(tz, zonedToUtc(tz, 2026, 9, 6, 12));
    expect(b.endMs - b.startMs).toBe(23 * H);

    const prev = shiftDay(tz, zonedToUtc(tz, 2026, 9, 6, 12), -1);
    // the previous day ends exactly where this one begins: no hour belongs to both, none to
    // neither
    expect(prev.endMs).toBe(b.startMs);
  });
});

describe('localDayBounds', () => {
  it('is exactly 24 hours on an ordinary day', () => {
    const b = localDayBounds('America/Los_Angeles', Date.UTC(2026, 8, 14, 22, 30));
    expect(b.endMs - b.startMs).toBe(24 * H);
  });

  it('is 23 hours on a spring-forward day and 25 on a fall-back day', () => {
    const spring = localDayBounds(
      'America/Los_Angeles',
      zonedToUtc('America/Los_Angeles', 2026, 3, 8, 12),
    );
    expect(spring.endMs - spring.startMs).toBe(23 * H);

    const fall = localDayBounds(
      'America/Los_Angeles',
      zonedToUtc('America/Los_Angeles', 2026, 11, 1, 12),
    );
    expect(fall.endMs - fall.startMs).toBe(25 * H);
  });

  it('starts at local midnight, not UTC midnight', () => {
    const b = localDayBounds('America/Los_Angeles', Date.UTC(2026, 8, 14, 22, 30));
    expect(wallClock('America/Los_Angeles', b.startMs)).toMatchObject({ hour: 0, minute: 0 });
    expect(b.startMs % (24 * H)).not.toBe(0);
  });

  it('is half-open: midnight belongs to the day beginning', () => {
    const b = localDayBounds('UTC', Date.UTC(2026, 8, 14, 12));
    const next = localDayBounds('UTC', b.endMs);
    expect(next.startMs).toBe(b.endMs);
    expect(overlapMs(b.endMs, b.endMs + 1, b)).toBe(0);
    expect(overlapMs(b.endMs, b.endMs + 1, next)).toBe(1);
  });

  it('puts one instant on different days for two households, and both are right', () => {
    // 22:30Z on the 14th: still the 14th in LA, already the 15th in Auckland.
    const at = Date.UTC(2026, 8, 14, 22, 30);
    expect(localDayKey('America/Los_Angeles', at)).toBe('2026-09-14');
    expect(localDayKey('Pacific/Auckland', at)).toBe('2026-09-15');
  });
});

describe('shiftDay', () => {
  it('walks backwards over a month boundary', () => {
    const at = zonedToUtc('America/Los_Angeles', 2026, 9, 1, 9);
    const prev = shiftDay('America/Los_Angeles', at, -1);
    expect(localDayKey('America/Los_Angeles', prev.startMs)).toBe('2026-08-31');
  });

  it('walks over a DST boundary without landing on the wrong day', () => {
    // noon the day after spring-forward, stepping back one day
    const at = zonedToUtc('America/Los_Angeles', 2026, 3, 9, 12);
    const prev = shiftDay('America/Los_Angeles', at, -1);
    expect(localDayKey('America/Los_Angeles', prev.startMs)).toBe('2026-03-08');
    expect(prev.endMs - prev.startMs).toBe(23 * H);
  });
});

describe('overlapMs — the midnight-crossing rule (D2)', () => {
  const tz = 'America/Los_Angeles';
  const night = localDayBounds(tz, zonedToUtc(tz, 2026, 9, 14, 12));
  const morning = localDayBounds(tz, zonedToUtc(tz, 2026, 9, 15, 12));
  const from = zonedToUtc(tz, 2026, 9, 14, 23, 30);
  const to = zonedToUtc(tz, 2026, 9, 15, 7, 0);

  it('splits a sleep across the two days it touches', () => {
    expect(overlapMs(from, to, night)).toBe(30 * 60_000);
    expect(overlapMs(from, to, morning)).toBe(7 * H);
  });

  it('sums to the sleep exactly once — no double count, no loss', () => {
    expect(overlapMs(from, to, night) + overlapMs(from, to, morning)).toBe(to - from);
  });

  it('gives nothing to a day the range does not touch', () => {
    const before = localDayBounds(tz, zonedToUtc(tz, 2026, 9, 13, 12));
    expect(overlapMs(from, to, before)).toBe(0);
  });

  it('clips a still-running sleep to the part that has already happened', () => {
    const now = zonedToUtc(tz, 2026, 9, 15, 2, 0);
    expect(overlapMs(from, now, night)).toBe(30 * 60_000);
    expect(overlapMs(from, now, morning)).toBe(2 * H);
  });
});

/*
  THE REMEMBERED OFFSET, HELD TO `Intl` ITSELF (2026-09-28). `wallClock` and `zoneOffsetMs` used to
  format every instant they were handed; they now read the zone's offset once per quarter hour of
  UTC and do arithmetic. The reference below is the old reading — one `formatToParts` per question,
  through its own formatter, with nothing remembered — and every answer is compared with it, around
  every 2026 transition of zones chosen for the ways a quarter hour could go wrong: a whole-hour
  change (New York, London), a half-hour one (Lord Howe), half-hour and three-quarter offsets
  (Kolkata, Chatham, St. John's), a transition at local midnight (Santiago).
*/
const referenceFormatters = new Map<string, Intl.DateTimeFormat>();

function referenceWall(timeZone: string, atMs: number) {
  let f = referenceFormatters.get(timeZone);
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    referenceFormatters.set(timeZone, f);
  }
  const parts = f.formatToParts(new Date(atMs));
  const get = (type: string): number => Number(parts.find(p => p.type === type)?.value ?? 0);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function referenceOffset(timeZone: string, atMs: number): number {
  const w = referenceWall(timeZone, atMs);
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return asUtc - Math.floor(atMs / 1000) * 1000;
}

function referenceZonedToUtc(timeZone: string, y: number, mo: number, d: number, h = 0, mi = 0) {
  const target = Date.UTC(y, mo - 1, d, h, mi);
  const o1 = referenceOffset(timeZone, target);
  const t1 = target - o1;
  if (referenceOffset(timeZone, t1) === o1) return t1;
  const o2 = referenceOffset(timeZone, t1);
  const t2 = target - o2;
  if (referenceOffset(timeZone, t2) === o2) return t2;
  return Math.max(t1, t2);
}

function referenceDayBounds(timeZone: string, nowMs: number) {
  const w = referenceWall(timeZone, nowMs);
  const startMs = referenceZonedToUtc(timeZone, w.year, w.month, w.day);
  const n = referenceWall(timeZone, startMs + 26 * H);
  return { startMs, endMs: referenceZonedToUtc(timeZone, n.year, n.month, n.day) };
}

/** Every instant in [fromMs, toMs) at which the zone's offset changes, found to the second. */
function transitionsIn(timeZone: string, fromMs: number, toMs: number): number[] {
  const out: number[] = [];
  const step = 24 * H; // transitions are months apart; a day's step cannot step over two
  let prev = referenceOffset(timeZone, fromMs);
  for (let t = fromMs + step; t < toMs; t += step) {
    const o = referenceOffset(timeZone, t);
    if (o === prev) continue;
    let lo = t - step;
    let hi = t;
    while (hi - lo > 1000) {
      const mid = lo + Math.floor((hi - lo) / 2000) * 1000;
      if (referenceOffset(timeZone, mid) === o) hi = mid;
      else lo = mid;
    }
    out.push(hi);
    prev = o;
  }
  return out;
}

/** The first, a middle and the last instant of every quarter hour within `hours` of `aroundMs`. */
function quarterHoursAround(aroundMs: number, hours: number): number[] {
  const first = Math.floor((aroundMs - hours * H) / QUARTER_HOUR) * QUARTER_HOUR;
  const out: number[] = [];
  for (let q = first; q <= aroundMs + hours * H; q += QUARTER_HOUR) {
    out.push(q, q + 7 * 60_000 + 30_000, q + QUARTER_HOUR - 1);
  }
  return out;
}

function expectSameAsIntl(timeZone: string, instants: readonly number[]): void {
  for (const at of instants) {
    const where = `${timeZone} at ${new Date(at).toISOString()}`;
    expect(wallClock(timeZone, at), where).toEqual(referenceWall(timeZone, at));
    expect(zoneOffsetMs(timeZone, at), where).toBe(referenceOffset(timeZone, at));
    expect(localDayBounds(timeZone, at), where).toEqual(referenceDayBounds(timeZone, at));
  }
}

const YEAR_2026 = [Date.UTC(2026, 0, 1), Date.UTC(2027, 0, 1)] as const;

describe('the offset remembered per quarter hour reads exactly what Intl reads', () => {
  const zones: readonly (readonly [string, number])[] = [
    ['America/New_York', 2],
    ['Europe/London', 2],
    ['Australia/Lord_Howe', 2], // +10:30, and a daylight saving of half an hour
    ['Asia/Kolkata', 0], // +5:30 all year: local midnight is half past a UTC hour
    ['Pacific/Chatham', 2], // +12:45 and +13:45
    ['America/St_Johns', 2], // -3:30 and -2:30
    ['America/Santiago', 2], // its clocks change at midnight
  ];

  for (const [zone, count] of zones) {
    it(`${zone}: every quarter hour around each of 2026's transitions, cold and warm`, () => {
      const found = transitionsIn(zone, ...YEAR_2026);
      // not vacuous: the sweep below really does cross the transitions the zone has
      expect(found).toHaveLength(count);
      // an ordinary midnight too, so a zone with no transition is still swept across a day edge
      const midnight = referenceZonedToUtc(zone, 2026, 9, 28);
      for (const around of [...found, midnight]) {
        const instants = quarterHoursAround(around, 30);
        expectSameAsIntl(zone, instants); // forwards, mostly unread quarter hours
        expectSameAsIntl(zone, [...instants].reverse()); // backwards, every one remembered
      }
    });

    it(`${zone}: every quarter hour of the wall clock turns back into the instant Intl finds`, () => {
      // gaps and repeats included: the spring-forward hour resolves forward, the repeated hour to
      // its first reading, exactly as the formatter-per-call version resolved them
      for (const around of transitionsIn(zone, ...YEAR_2026)) {
        const w = referenceWall(zone, around);
        for (let day = w.day - 1; day <= w.day + 1; day++) {
          for (let minutes = 0; minutes < 24 * 60; minutes += 15) {
            const h = Math.floor(minutes / 60);
            const mi = minutes % 60;
            expect(zonedToUtc(zone, w.year, w.month, day, h, mi), `${zone} ${day} ${h}:${mi}`).toBe(
              referenceZonedToUtc(zone, w.year, w.month, day, h, mi),
            );
          }
        }
      }
    });
  }

  it('reads a quarter hour a transition falls inside instant by instant', () => {
    // St. John's changed its clocks at 00:01 local until 2011 — 03:31 and 02:31 UTC, a minute past
    // the half hour — so a quarter hour of UTC then held two offsets. It must not be remembered as
    // one: every second either side of the change reads what Intl reads.
    const zone = 'America/St_Johns';
    const found = transitionsIn(zone, Date.UTC(2010, 0, 1), Date.UTC(2011, 0, 1));
    expect(found).toHaveLength(2);
    for (const t of found) {
      expect(t % QUARTER_HOUR).not.toBe(0);
      const instants: number[] = [];
      for (let s = -120; s <= 120; s++) instants.push(t + s * 1000);
      expectSameAsIntl(zone, instants);
      expectSameAsIntl(zone, [...instants].reverse());
    }
  });

  it('agrees with Intl on the seconds of an offset that is not a whole minute', () => {
    // New York before standard time was four hours, fifty-six minutes and two seconds behind UTC
    const at = Date.UTC(1880, 0, 1, 12, 0, 30);
    expect(zoneOffsetMs('America/New_York', at)).toBe(referenceOffset('America/New_York', at));
    expect(wallClock('America/New_York', at)).toEqual(referenceWall('America/New_York', at));
  });

  it('asks Intl nothing for a quarter hour it has read, and forgets the oldest past its cap', () => {
    const zone = 'Europe/Paris';
    const spy = vi.spyOn(Intl.DateTimeFormat.prototype, 'formatToParts');
    try {
      const first = Date.UTC(2026, 0, 1);
      zoneOffsetMs(zone, first);
      spy.mockClear();
      // the same quarter hour, and another instant inside it: nothing new is asked
      wallClock(zone, first + 60_000);
      localDayKey(zone, first + 14 * 60_000);
      expect(spy).not.toHaveBeenCalled();

      // fifty-two days of quarter hours, more than the zone keeps: the first is read again, the
      // newest is not — the memory is bounded and nothing it answers comes out wrong
      const n = 5000;
      for (let k = 1; k <= n; k++) zoneOffsetMs(zone, first + k * QUARTER_HOUR);
      spy.mockClear();
      zoneOffsetMs(zone, first + n * QUARTER_HOUR);
      expect(spy).not.toHaveBeenCalled();
      expect(zoneOffsetMs(zone, first)).toBe(referenceOffset(zone, first));
      expect(spy).toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
    const sample = [1, 777, 2500, 4999].map(k => Date.UTC(2026, 0, 1) + k * QUARTER_HOUR + 1234);
    expectSameAsIntl(zone, sample);
  });
});
