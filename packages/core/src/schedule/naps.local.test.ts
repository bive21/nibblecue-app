/**
 * The nap outlook read on the clock each sleep happened on (`naps.local.ts`): nothing changes at
 * home, a trip becomes a clock change the engine already knows, and the three rules at a zone
 * change hold.
 */
import { describe, expect, it } from 'vitest';
import { localDayBounds, zonedToUtc, zoneOffsetMs } from '../today/day';
import { replay } from './naps.bench';
import { napOutlookOnLocalClocks, zoneClocks, type LocalClocks } from './naps.local';
import { napOutlook, type SleepLog } from './naps';
import { DEFAULT_SIM, simDayStartOf, simulatePopulation } from './naps.sim';

const NY = 'America/New_York';
const PARIS = 'Europe/Paris';
const MIN = 60_000;
const H = 60 * MIN;

/** The instant `zone`'s wall clock reads y-mo-d h:m. */
const wall = (zone: string, y: number, mo: number, d: number, h: number, m = 0): number =>
  zonedToUtc(zone, y, mo, d, h, m);

/**
 * One ordinary day on `zone`'s clock: the night from 7 p.m. the evening before to 7 a.m., naps
 * 9:00–10:00 and 1:00–2:30.
 */
function ordinaryDay(zone: string, y: number, mo: number, d: number): SleepLog[] {
  return [
    { startMs: wall(zone, y, mo, d - 1, 19), endMs: wall(zone, y, mo, d, 7), kind: 'NIGHT' },
    { startMs: wall(zone, y, mo, d, 9), endMs: wall(zone, y, mo, d, 10), kind: 'NAP' },
    { startMs: wall(zone, y, mo, d, 13), endMs: wall(zone, y, mo, d, 14, 30), kind: 'NAP' },
  ];
}
const days = (zone: string, y: number, mo: number, from: number, to: number): SleepLog[] =>
  Array.from({ length: to - from + 1 }, (_, i) => ordinaryDay(zone, y, mo, from + i)).flat();

const inZone = (zone: string) => (ms: number) => localDayBounds(zone, ms).startMs;

describe('at home it changes nothing', () => {
  it('gives the same outlook as the engine read in the home zone', () => {
    // a September week in New York, no clock change inside it
    const logs = [
      ...days(NY, 2026, 9, 2, 8),
      { startMs: wall(NY, 2026, 9, 8, 19), endMs: wall(NY, 2026, 9, 9, 7), kind: 'NIGHT' as const },
    ];
    for (const nowMs of [
      wall(NY, 2026, 9, 9, 7, 30),
      wall(NY, 2026, 9, 8, 21),
      wall(NY, 2026, 9, 8, 9, 20),
    ]) {
      expect(napOutlookOnLocalClocks(logs, nowMs, zoneClocks([], NY))).toEqual(
        napOutlook(logs, nowMs, inZone(NY)),
      );
    }
  });

  it('and over a simulated population, glance for glance', () => {
    // the bench's households live on UTC days, so a phone that never left UTC is the same engine
    const pop = simulatePopulation(4242, 4, 150, 420, 21, DEFAULT_SIM);
    const home: LocalClocks = zoneClocks([], 'UTC');
    const plain = replay(pop);
    const local = replay(pop, (logs, nowMs) => napOutlookOnLocalClocks(logs, nowMs, home));
    expect(local.asked).toBe(plain.asked);
    expect(local.scored).toEqual(plain.scored);
    // (the bench's day really is the UTC day, or this would be comparing two different things)
    expect(simDayStartOf(Date.UTC(2026, 0, 9, 15))).toBe(Date.UTC(2026, 0, 9));
  }, 60_000);
});

describe('a trip is a clock change', () => {
  // a week at home in New York, then Paris, six hours ahead, where the baby is on the new clock
  // within three days
  const flight = wall(NY, 2026, 9, 9, 8); // noticed by the phone at 2 p.m. Paris time
  const clocks = zoneClocks([{ fromMs: flight, zone: PARIS }], NY);
  const logs = [
    ...days(NY, 2026, 9, 2, 8),
    // the last night at home ends at 7 a.m. New York — 1 p.m. in Paris
    { startMs: wall(NY, 2026, 9, 8, 19), endMs: wall(NY, 2026, 9, 9, 7), kind: 'NIGHT' as const },
    // and the first night in Paris starts at 7 p.m. Paris, a long travel day later
    ...days(PARIS, 2026, 9, 10, 12),
    {
      startMs: wall(PARIS, 2026, 9, 12, 19),
      endMs: wall(PARIS, 2026, 9, 13, 7),
      kind: 'NIGHT' as const,
    },
  ];

  it('puts the next nap at the usual time on the clock where the baby is', () => {
    const o = napOutlookOnLocalClocks(logs, wall(PARIS, 2026, 9, 13, 7, 30), clocks);
    expect(o.nextKind).toBe('nap');
    expect(o.position).toBe(1);
    expect(Math.abs((o.nextAtMs as number) - wall(PARIS, 2026, 9, 13, 9))).toBeLessThanOrEqual(
      5 * MIN,
    );
    expect(o.awakeForMs).toBe(30 * MIN);
  });

  it('ends the night at the usual morning on that clock', () => {
    const o = napOutlookOnLocalClocks(
      logs.slice(0, -1).concat({
        startMs: wall(PARIS, 2026, 9, 12, 19),
        endMs: null,
        kind: 'NIGHT',
      }),
      wall(PARIS, 2026, 9, 13, 3),
      clocks,
    );
    expect(o.state).toBe('asleep');
    expect(
      Math.abs((o.usualMorningMs as number) - wall(PARIS, 2026, 9, 13, 7)),
    ).toBeLessThanOrEqual(5 * MIN);
    expect(o.asleepForMs).toBe(8 * H);
  });

  it('stays on the clock of the last sleep logged until the first sleep after landing', () => {
    // two hours after the phone noticed Paris, nothing logged since the New York night
    const home = logs.filter(s => s.startMs < flight);
    const nowMs = flight + 2 * H;
    const o = napOutlookOnLocalClocks(home, nowMs, clocks);
    // how long the baby has been awake is the real three hours, not three plus six
    expect(o.awakeForMs).toBe(3 * H);
    expect(o.awakeSinceMs).toBe(wall(NY, 2026, 9, 9, 7));
    // and the answer is the one the home clock gives: the baby's body is still on it
    expect(o.nextAtMs).toBe(napOutlook(home, nowMs, inZone(NY)).nextAtMs);
  });
});

describe('the new clock starts with the first night slept there', () => {
  // home in New York; the phone notices Paris at 2 p.m. Paris time on the day of the flight
  const flight = wall(NY, 2026, 9, 9, 8);
  const clocks = zoneClocks([{ fromMs: flight, zone: PARIS }], NY);
  const home = [
    ...days(NY, 2026, 9, 2, 8),
    { startMs: wall(NY, 2026, 9, 8, 19), endMs: wall(NY, 2026, 9, 9, 7), kind: 'NIGHT' as const },
  ];
  // a nap after landing, 4 p.m. in Paris — 10 a.m. on the clock the baby's body is still on
  const landingNap = {
    startMs: wall(PARIS, 2026, 9, 9, 16),
    endMs: wall(PARIS, 2026, 9, 9, 17),
    kind: 'NAP' as const,
  };

  it('keeps the landing day on the clock the baby left', () => {
    const nowMs = wall(PARIS, 2026, 9, 9, 17, 30);
    const logs = [...home, landingNap];
    expect(napOutlookOnLocalClocks(logs, nowMs, clocks)).toEqual(
      napOutlook(logs, nowMs, inZone(NY)),
    );
  });

  it('reads the first night there, and the morning after it, on the new clock', () => {
    const night = {
      startMs: wall(PARIS, 2026, 9, 9, 19, 30),
      endMs: wall(PARIS, 2026, 9, 10, 7),
      kind: 'NIGHT' as const,
    };
    const o = napOutlookOnLocalClocks(
      [...home, landingNap, night],
      wall(PARIS, 2026, 9, 10, 7, 30),
      clocks,
    );
    // the usual first nap is two hours after a seven o'clock morning, and nine on the wall — here
    expect(Math.abs((o.nextAtMs as number) - wall(PARIS, 2026, 9, 10, 9))).toBeLessThanOrEqual(
      5 * MIN,
    );
  });
});

describe('a flight west that lands sooner than the time difference', () => {
  // Paris is home; the phone notices New York at 10:30 a.m. Paris — 4:30 a.m. in New York
  const switched = wall(PARIS, 2026, 9, 9, 10, 30);
  const clocks = zoneClocks([{ fromMs: switched, zone: NY }], PARIS);
  const before = [
    ...days(PARIS, 2026, 9, 2, 8),
    {
      startMs: wall(PARIS, 2026, 9, 8, 19),
      endMs: wall(PARIS, 2026, 9, 9, 7),
      kind: 'NIGHT' as const,
    },
    {
      startMs: wall(PARIS, 2026, 9, 9, 9),
      endMs: wall(PARIS, 2026, 9, 9, 10),
      kind: 'NAP' as const,
    },
  ];
  // a nap two hours later: 6 a.m. on New York's clock, four hours BEFORE the last nap ended on
  // Paris's — so it waits in Paris rather than running the log backwards
  const onBoard = {
    startMs: wall(PARIS, 2026, 9, 9, 12),
    endMs: wall(PARIS, 2026, 9, 9, 13),
    kind: 'NAP' as const,
  };

  it('keeps the log in order and the awake time real', () => {
    const nowMs = wall(PARIS, 2026, 9, 9, 14);
    const o = napOutlookOnLocalClocks([...before, onBoard], nowMs, clocks);
    expect(o.gap).toBe(false);
    expect(o.awakeSinceMs).toBe(onBoard.endMs);
    expect(o.awakeForMs).toBe(1 * H);
    expect(o.nextAtMs).not.toBeNull();
    expect(Number.isFinite(o.nextAtMs as number)).toBe(true);
  });

  it('takes the new clock at the first sleep that can', () => {
    // the first night in New York, twelve real hours after the nap on board
    const night = { startMs: wall(NY, 2026, 9, 9, 19), endMs: null, kind: 'NIGHT' as const };
    const nowMs = wall(NY, 2026, 9, 9, 20);
    const o = napOutlookOnLocalClocks([...before, onBoard, night], nowMs, clocks);
    expect(o.state).toBe('asleep');
    expect(o.asleepSinceMs).toBe(night.startMs);
    expect(o.asleepForMs).toBe(1 * H);
  });
});

describe('the morning the clocks spring forward', () => {
  // New York moves from EST to EDT at 2 a.m. on 2027-03-14
  const logs = [
    ...days(NY, 2027, 3, 4, 13),
    { startMs: wall(NY, 2027, 3, 13, 19), endMs: wall(NY, 2027, 3, 14, 7), kind: 'NIGHT' as const },
  ];
  it('is read by the clock on the wall: the first nap is still at nine', () => {
    expect(zoneOffsetMs(NY, wall(NY, 2027, 3, 13, 12))).toBe(-5 * H);
    expect(zoneOffsetMs(NY, wall(NY, 2027, 3, 14, 12))).toBe(-4 * H);
    const o = napOutlookOnLocalClocks(logs, wall(NY, 2027, 3, 14, 7, 30), zoneClocks([], NY));
    expect(Math.abs((o.nextAtMs as number) - wall(NY, 2027, 3, 14, 9))).toBeLessThanOrEqual(
      1 * MIN,
    );
    // and the half hour awake is a half hour, on the real clock
    expect(o.awakeForMs).toBe(30 * MIN);
  });
});

describe('the clocks for a real phone', () => {
  it('read offsets from the zone rules, and a zone the runtime cannot read as UTC', () => {
    const c = zoneClocks([{ fromMs: 0, zone: PARIS }], NY);
    const at = Date.UTC(2026, 8, 23, 12);
    expect(c.offsetMs(PARIS, at)).toBe(2 * H);
    expect(c.offsetMs(PARIS, at + 1)).toBe(2 * H); // remembered, and the same
    expect(c.offsetMs(NY, at)).toBe(-4 * H);
    expect(c.offsetMs('Not/AZone', at)).toBe(0);
    expect(c.offsetMs('Not/AZone', at + H)).toBe(0); // and it stays so without being asked again
    // an instant no clock can read is not a zone no clock can read: Paris is still Paris after it
    expect(c.offsetMs(PARIS, Number.NaN)).toBe(0);
    expect(c.offsetMs(PARIS, at)).toBe(2 * H);
    expect(c.zoneAt(-1)).toBe(NY);
    expect(c.zoneAt(at)).toBe(PARIS);
  });
});
