/**
 * The Sleep outlook card's words, mapped from an outlook the engine already computed.
 * No second prediction: a null clock stays off the card, and a gap does not become an awake count.
 */
import { describe, expect, it } from 'vitest';
import { BANNED } from './foresight.banned';
import { napArrangement, napFace, napPassedLine, type NapFace } from './napFace';
import { napOutlook, type NapOutlook, type SleepLog } from './naps';
import {
  NAP_HEADER,
  napsTodayCount,
  SLEEP_ACTIVE_LEARNING,
  SLEEP_AROUND,
  SLEEP_BEDTIME,
  SLEEP_ESTIMATE,
  SLEEP_LEARNING,
  SLEEP_LEARNING_BODY,
  SLEEP_NEXT_NAP,
  SLEEP_PASSED,
  SLEEP_STALE,
  SLEEP_STALE_MORE,
  SLEEP_TYPICAL,
  SLEEP_UNAVAILABLE,
  SLEEP_USUAL_WAKE,
  sleepStaleWake,
} from './naps.copy';

const H = 60 * 60_000;
const M = 60_000;
const DAY = 24 * H;
const DAY0 = Date.parse('2026-09-01T00:00:00.000Z');
const dayStartOf = (ms: number): number => Math.floor((ms - DAY0) / DAY) * DAY + DAY0;
const at = (d: number, h: number, m = 0): number => DAY0 + d * DAY + h * H + m * M;

const ordinaryDay = (d: number): SleepLog[] => [
  { startMs: at(d - 1, 19), endMs: at(d, 7), kind: 'NIGHT' },
  { startMs: at(d, 9), endMs: at(d, 10), kind: 'NAP' },
  { startMs: at(d, 13), endMs: at(d, 14, 30), kind: 'NAP' },
];
const week = (days: number): SleepLog[] =>
  Array.from({ length: days }, (_, i) => ordinaryDay(i + 1)).flat();

function blank(over: Partial<NapOutlook> = {}): NapOutlook {
  return {
    state: 'awake',
    position: 1,
    awakeSinceMs: null,
    awakeForMs: null,
    asleepSinceMs: null,
    asleepForMs: null,
    awakeMs: null,
    samples: 0,
    basis: 'pooled',
    nextKind: null,
    usualStartMs: null,
    nextAtMs: null,
    usualNapMs: null,
    napSamples: 0,
    lastingNapMs: null,
    lastingSamples: 0,
    lastingBasis: 'pooled',
    outlastedSome: false,
    wakeAtMs: null,
    usualMorningMs: null,
    morningSamples: 0,
    gap: false,
    napsToday: 0,
    napsPerDay: null,
    totalSamples: 0,
    days: 0,
    windowStartMs: null,
    windowEndMs: null,
    windowSamples: 0,
    windowCaught: 0,
    windowJudged: 0,
    ...over,
  };
}

function pair(face: NapFace) {
  expect(face.kind).toBe('pair');
  if (face.kind !== 'pair') throw new Error('expected a pair');
  return face;
}

describe('the sleep outlook card reads the engine, and does not invent a clock', () => {
  it('names the card Sleep outlook, and counts naps without a usual beside them', () => {
    expect(NAP_HEADER).toBe('Sleep outlook');
    expect(napsTodayCount(0)).toBe('0 naps today');
    expect(napsTodayCount(1)).toBe('1 nap today');
    expect(napsTodayCount(2)).toBe('2 naps today');
  });

  it('an active nap: Asleep, the usual wake-up, and the naps that set that length', () => {
    const face = pair(
      napFace(
        blank({
          state: 'asleep',
          nextKind: 'nap',
          asleepSinceMs: at(1, 12, 55),
          wakeAtMs: at(1, 14, 25),
          usualNapMs: 90 * M,
          napSamples: 6,
        }),
      ),
    );
    expect(face.asleep).toBe(true);
    expect(face.statusIcon).toBe('moon');
    expect(face.log).toBe(false);
    expect(face.right).toMatchObject({
      kind: 'time',
      label: SLEEP_USUAL_WAKE,
      qualifier: SLEEP_AROUND,
      atMs: at(1, 14, 25),
      icon: 'clock',
      connector: true,
      passed: false,
    });
    expect(face.rows.map(r => r.label)).toEqual(['Started', 'Nap length', 'Recent naps']);
    expect(face.rows[2]?.text).toBe('6 logged');
    expect(face.provenance).toBe(SLEEP_ESTIMATE);
  });

  it('awake before the next nap names that nap, from the log rather than a routine', () => {
    const o = napOutlook(
      [...week(6), { startMs: at(6, 19), endMs: at(7, 7), kind: 'NIGHT' }],
      at(7, 8),
      dayStartOf,
    );
    const face = pair(napFace(o));
    expect(face.asleep).toBe(false);
    expect(face.statusIcon).toBe('sun');
    expect(face.right.kind).toBe('time');
    if (face.right.kind === 'time') {
      expect(face.right.label).toBe(SLEEP_NEXT_NAP);
      expect(face.right.qualifier).toBe(SLEEP_AROUND);
      expect(face.right.connector).toBe(true);
      expect(face.right.icon).toBe('moon');
    }
    expect(face.rows.map(r => r.label)).toEqual(['Last woke', 'Time awake', 'Based on']);
    expect(face.provenance).toBe(SLEEP_ESTIMATE);
  });

  it('bedtime from the log says Around, the same estimate, not a planned routine', () => {
    const face = pair(
      napFace(
        blank({
          state: 'awake',
          nextKind: 'night',
          nextAtMs: at(1, 19),
          awakeSinceMs: at(1, 16),
          awakeMs: 3 * H,
          samples: 8,
          basis: 'position',
        }),
      ),
    );
    expect(face.right).toMatchObject({
      kind: 'time',
      label: SLEEP_BEDTIME,
      qualifier: SLEEP_AROUND,
      connector: true,
    });
    expect(face.provenance).toBe(SLEEP_ESTIMATE);
  });

  it('a night that is running names the morning, and a lie-in keeps that morning as typical', () => {
    const running = pair(
      napFace(
        blank({
          state: 'asleep',
          nextKind: 'night',
          asleepSinceMs: at(1, 22, 30),
          wakeAtMs: at(2, 7),
          usualMorningMs: at(2, 7),
          morningSamples: 7,
        }),
      ),
    );
    expect(running.right).toMatchObject({
      kind: 'time',
      label: SLEEP_USUAL_WAKE,
      qualifier: SLEEP_AROUND,
      icon: 'sun',
      connector: true,
      passed: false,
    });

    const late = pair(
      napFace(
        blank({
          state: 'asleep',
          nextKind: 'night',
          asleepSinceMs: at(1, 22, 30),
          wakeAtMs: null,
          usualMorningMs: at(2, 7),
          morningSamples: 7,
        }),
      ),
    );
    expect(late.right).toMatchObject({
      kind: 'time',
      label: SLEEP_USUAL_WAKE,
      qualifier: SLEEP_TYPICAL,
      connector: false,
      passed: true,
    });
    expect(napPassedLine(true)).toBe(SLEEP_PASSED);
    expect(napPassedLine(false)).toBeNull();
  });

  it('awake in the night shows the morning as context, with no arrow toward it', () => {
    const face = pair(
      napFace(
        blank({
          state: 'awake',
          nextKind: 'night',
          nextAtMs: null,
          awakeSinceMs: at(2, 1, 15),
          usualMorningMs: at(2, 7),
          morningSamples: 6,
        }),
      ),
    );
    // the sun for awake, and the one honest name — no "Morning pattern" over it (2026-10-06)
    expect(face.statusIcon).toBe('sun');
    expect(face.right).toMatchObject({
      kind: 'time',
      label: SLEEP_USUAL_WAKE,
      description: null,
      icon: 'sun',
      connector: false,
    });
    expect(face.log).toBe(false);
  });

  it('a gap asks for a sleep update and does not count the hours awake', () => {
    const face = napFace(
      blank({
        state: 'awake',
        gap: true,
        awakeSinceMs: at(1, 9, 55),
        awakeForMs: 8 * H,
        awakeMs: 2 * H,
        nextAtMs: null,
      }),
    );
    expect(face.kind).toBe('calm');
    if (face.kind !== 'calm') return;
    expect(face.tone).toBe('stale');
    expect(face.title).toBe(SLEEP_STALE);
    expect(face.wakeAtMs).toBe(at(1, 9, 55));
    expect(face.expanded).toBe(SLEEP_STALE_MORE);
    expect(face.log).toBe(true);
    expect(face.rows).toEqual([]);
    expect(sleepStaleWake('9:55 AM, Yesterday')).toBe('Last wake-up logged at 9:55 AM, Yesterday');
  });

  it('an evening gap still carries the usual bedtime, under the fold', () => {
    const face = napFace(
      blank({
        state: 'awake',
        gap: true,
        basis: 'clock',
        nextKind: 'night',
        awakeSinceMs: at(1, 9),
        nextAtMs: at(1, 19),
        samples: 6,
      }),
    );
    expect(face.kind).toBe('calm');
    if (face.kind !== 'calm') return;
    expect(face.rows.map(r => r.label)).toEqual(['Usual bedtime', 'Based on']);
    expect(face.provenance).toBe(SLEEP_ESTIMATE);
  });

  it('a thin log says it is still building, and a running sleep stays on the timer', () => {
    const learning = napFace(blank({ state: 'unknown', totalSamples: 1, days: 1 }));
    expect(learning.kind).toBe('calm');
    if (learning.kind === 'calm') {
      expect(learning.tone).toBe('learning');
      expect(learning.title).toBe(SLEEP_LEARNING);
      expect(learning.helper).toBe(SLEEP_LEARNING_BODY);
      expect(learning.expanded).toContain('1 wake window');
      expect(learning.log).toBe(true);
    }

    const asleep = pair(
      napFace(blank({ state: 'asleep', asleepSinceMs: at(1, 12), nextKind: 'nap' })),
    );
    expect(asleep.right).toMatchObject({ kind: 'note', message: SLEEP_ACTIVE_LEARNING });
    expect(asleep.log).toBe(false);

    const noEnd = pair(
      napFace(
        blank({
          state: 'asleep',
          nextKind: 'nap',
          asleepSinceMs: at(1, 12),
          usualNapMs: 40 * M,
          wakeAtMs: null,
          napSamples: 2,
        }),
      ),
    );
    expect(noEnd.right).toMatchObject({ kind: 'note', message: SLEEP_UNAVAILABLE });
  });

  it('stacks on a narrow card and at large text, and keeps the connector on a wide one', () => {
    // the arrow wherever the two columns sit side by side at 300 or more (the owner, 2026-10-06:
    // "where is the arrow in the middle?") — a 390 phone's ~327 inset has it — and not before the
    // width is known
    expect(napArrangement(0, 1, true)).toEqual({ stack: false, connector: false });
    expect(napArrangement(327, 1, true)).toEqual({ stack: false, connector: true });
    expect(napArrangement(380, 1, true)).toEqual({ stack: false, connector: true });
    expect(napArrangement(290, 1, true)).toEqual({ stack: true, connector: false });
    expect(napArrangement(310, 1, true)).toEqual({ stack: false, connector: true });
    expect(napArrangement(360, 2, true)).toEqual({ stack: true, connector: false });
    expect(napArrangement(360, 1, false)).toEqual({ stack: false, connector: false });
  });

  it('diagnoses nothing', () => {
    const said = [
      NAP_HEADER,
      SLEEP_STALE,
      SLEEP_STALE_MORE,
      SLEEP_LEARNING,
      SLEEP_LEARNING_BODY,
      SLEEP_PASSED,
      SLEEP_ESTIMATE,
      napsTodayCount(3),
    ].join(' ');
    for (const word of BANNED) expect(said.toLowerCase(), word).not.toContain(word);
    expect(said.toLowerCase()).not.toContain('more than');
    expect(said.toLowerCase()).not.toContain('longer');
  });
});
