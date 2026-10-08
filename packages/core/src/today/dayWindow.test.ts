/**
 * The household's waking window, and the nap-vs-night word that comes out of it.
 *
 * Every case here is the owner's own example or a boundary of it. There is no number in this
 * suite that came from anywhere but a household's two settings, which is the whole point: this is
 * classification against what a parent said, not a judgement about sleep.
 */
import { describe, expect, it } from 'vitest';
import { zonedToUtc } from './day';
import {
  DEFAULT_DAY_WINDOW,
  isAwakeAt,
  dayBands,
  dayPosition,
  sleepKindAt,
  sleepKindLabel,
  sleepKindOf,
  windowTimeOr,
} from './dayWindow';

const TZ = 'America/Los_Angeles';
const at = (h: number, m = 0) => zonedToUtc(TZ, 2026, 9, 18, h, m);
/** The owner's example: "wake time 8am, and bed time 9pm". */
const OWNERS = { wake: '08:00', bed: '21:00' };

describe('the waking window', () => {
  it('is the owner’s example, inclusive at wake and exclusive at bed', () => {
    expect(isAwakeAt(8 * 60, OWNERS)).toBe(true); // 8:00 — the day has started
    expect(isAwakeAt(20 * 60 + 59, OWNERS)).toBe(true); // 8:59 pm — still the day
    expect(isAwakeAt(21 * 60, OWNERS)).toBe(false); // 9:00 pm — bedtime IS night
    expect(isAwakeAt(7 * 60 + 59, OWNERS)).toBe(false); // 7:59 am — still the night
  });

  it('wraps for a household whose window crosses midnight', () => {
    const night = { wake: '20:00', bed: '08:00' };
    expect(isAwakeAt(22 * 60, night)).toBe(true);
    expect(isAwakeAt(2 * 60, night)).toBe(true);
    expect(isAwakeAt(12 * 60, night)).toBe(false);
  });

  it('reads an equal pair as always awake, never as never awake', () => {
    // the safe direction: the wrong word, rather than the wrong word AND a day with no naps
    expect(isAwakeAt(3 * 60, { wake: '09:00', bed: '09:00' })).toBe(true);
  });

  it('falls back per field for anything unparseable, so a bad string cannot empty a report', () => {
    for (const bad of ['', 'nine', '25:00', '09:61', '9-30'])
      expect(isAwakeAt(12 * 60, { wake: bad, bed: bad })).toBe(
        isAwakeAt(12 * 60, DEFAULT_DAY_WINDOW),
      );
  });
});

describe('the kind, and the word for it', () => {
  it('calls a sleep inside the window a nap and one outside it night sleep', () => {
    expect(sleepKindAt(TZ, at(13), OWNERS)).toBe('NAP');
    expect(sleepKindAt(TZ, at(21, 30), OWNERS)).toBe('NIGHT');
    expect(sleepKindAt(TZ, at(3), OWNERS)).toBe('NIGHT');
  });

  it('reads the START, so a night that ends after sunrise is still a night', () => {
    // begun 9:05 pm, woken 6 am: the end is inside nobody's window and would file as a nap
    expect(sleepKindAt(TZ, at(21, 5), OWNERS)).toBe('NIGHT');
  });

  it('files an evening doze as night sleep, because the household said the day ends at 9', () => {
    // 8:50 pm is inside the window, so this is a NAP — the app does not second-guess the parent
    expect(sleepKindAt(TZ, at(20, 50), OWNERS)).toBe('NAP');
    // and one ten minutes later is not
    expect(sleepKindAt(TZ, at(21, 10), OWNERS)).toBe('NIGHT');
  });

  it('files a sleep that runs on past bedtime as the night, whenever it began (2026-10-07)', () => {
    const H = 3_600_000;
    // the owner's screenshot: down at 8:23 pm, up at 9:03 am, saved as "Nap 12h 40m"
    expect(sleepKindAt(TZ, at(20, 23), OWNERS, at(20, 23) + 12 * H + 40 * 60_000)).toBe('NIGHT');
    // an evening doze over by bedtime is still the nap its start says
    expect(sleepKindAt(TZ, at(20, 23), OWNERS, at(20, 53))).toBe('NAP');
    // reaching bedtime exactly is not going past it
    expect(sleepKindAt(TZ, at(20, 30), OWNERS, at(21))).toBe('NAP');
    expect(sleepKindAt(TZ, at(20, 30), OWNERS, at(21, 1))).toBe('NIGHT');
    // an afternoon nap, however long, that is over before 9 pm
    expect(sleepKindAt(TZ, at(13), OWNERS, at(16))).toBe('NAP');
    // a window crossing midnight: awake 20:00 to 08:00 the next morning, bed at 08:00
    const nightShift = { wake: '20:00', bed: '08:00' };
    expect(sleepKindAt(TZ, at(22), nightShift, at(23))).toBe('NAP');
    expect(sleepKindAt(TZ, at(22), nightShift, at(22) + 11 * H)).toBe('NIGHT');
    // always awake has no bedtime to cross
    expect(sleepKindAt(TZ, at(13), { wake: '08:00', bed: '08:00' }, at(13) + 20 * H)).toBe('NAP');
    // and a stored kind still wins over the span
    expect(sleepKindOf('NAP', TZ, at(20, 23), OWNERS, at(20, 23) + 12 * H)).toBe('NAP');
    expect(sleepKindOf(null, TZ, at(20, 23), OWNERS, at(20, 23) + 12 * H)).toBe('NIGHT');
  });

  it('says it in words, and never says "night" alone', () => {
    expect(sleepKindLabel('NAP')).toBe('Nap');
    expect(sleepKindLabel('NIGHT')).toBe('Night sleep');
  });

  it('lets a stored kind win, and only fills a blank from the window', () => {
    // a baby who slept through from six: the parent said NIGHT and the entry keeps it
    expect(sleepKindOf('NIGHT', TZ, at(18), OWNERS)).toBe('NIGHT');
    expect(sleepKindOf('NAP', TZ, at(23), OWNERS)).toBe('NAP');
    expect(sleepKindOf(null, TZ, at(18), OWNERS)).toBe('NAP');
    expect(sleepKindOf(undefined, TZ, at(23), OWNERS)).toBe('NIGHT');
  });
});

describe('windowTimeOr — the stored row in either shape', () => {
  it('takes Postgres time and the picker short form to the same string', () => {
    // 0095 stores `time`, and `to_jsonb` prints it with seconds; a local write puts back the
    // short form. Both have to read as one value or a label flickers after a sync.
    expect(windowTimeOr('07:00:00', '09:00')).toBe('07:00');
    expect(windowTimeOr('07:00', '09:00')).toBe('07:00');
    expect(windowTimeOr('21:00:00.000000', '09:00')).toBe('21:00');
    expect(windowTimeOr('7:05', '09:00')).toBe('07:05');
    expect(windowTimeOr(' 08:30 ', '09:00')).toBe('08:30');
  });

  it('falls back rather than throwing on anything it cannot read', () => {
    for (const bad of [null, undefined, '', 'evening', '24:00', '12:60', '7', 7, {}, []]) {
      expect(windowTimeOr(bad, '19:30')).toBe('19:30');
    }
  });

  it('round-trips through the window the rule reads', () => {
    const w = {
      wake: windowTimeOr('08:00:00', DEFAULT_DAY_WINDOW.wake),
      bed: windowTimeOr('21:00:00', DEFAULT_DAY_WINDOW.bed),
    };
    // the owner's own example: 8am to 9pm, so a 2 p.m. sleep is a nap and a 10 p.m. one is not
    expect(sleepKindAt('UTC', Date.parse('2026-09-18T14:00:00.000Z'), w)).toBe('NAP');
    expect(sleepKindAt('UTC', Date.parse('2026-09-18T22:00:00.000Z'), w)).toBe('NIGHT');
  });
});

/**
 * THE DAY AS A PICTURE. The band is the one part of the wake/bed setting that can be wrong
 * without looking wrong — a household whose window wraps past midnight is awake at both ENDS of
 * a midnight-to-midnight track, and a drawing that got that backwards would look plausible to
 * everyone except the night-shift parent it is wrong for.
 */
describe('the day band', () => {
  const total = (bands: readonly { from: number; to: number }[]) =>
    bands.reduce((sum, b) => sum + (b.to - b.from), 0);

  it('covers the whole track, in order, with nothing overlapping', () => {
    for (const w of [
      { wake: '07:00', bed: '19:30' },
      { wake: '20:00', bed: '08:00' },
      { wake: '00:00', bed: '12:00' },
      { wake: '12:00', bed: '00:00' },
    ]) {
      const bands = dayBands(w);
      expect(total(bands), JSON.stringify(w)).toBeCloseTo(1, 6);
      expect(bands[0]?.from, JSON.stringify(w)).toBe(0);
      expect(bands.at(-1)?.to, JSON.stringify(w)).toBe(1);
      for (let i = 1; i < bands.length; i++) expect(bands[i]?.from).toBe(bands[i - 1]?.to);
    }
  });

  it('an ordinary day is night, awake, night', () => {
    const bands = dayBands({ wake: '07:00', bed: '19:30' });
    expect(bands.map(b => b.kind)).toEqual(['night', 'awake', 'night']);
    expect(bands[1]?.from).toBeCloseTo(7 / 24, 6);
    expect(bands[1]?.to).toBeCloseTo(19.5 / 24, 6);
  });

  it('a wrapped window is awake at BOTH ends, with the night in the middle', () => {
    const bands = dayBands({ wake: '20:00', bed: '08:00' });
    expect(bands.map(b => b.kind)).toEqual(['awake', 'night', 'awake']);
    expect(bands[0]?.to).toBeCloseTo(8 / 24, 6);
    expect(bands[2]?.from).toBeCloseTo(20 / 24, 6);
  });

  it('drops the zero-width piece a midnight edge would produce', () => {
    expect(dayBands({ wake: '00:00', bed: '12:00' }).map(b => b.kind)).toEqual(['awake', 'night']);
    expect(dayBands({ wake: '12:00', bed: '00:00' }).map(b => b.kind)).toEqual(['night', 'awake']);
  });

  it('agrees with isAwakeAt, minute by minute, wrapped or not', () => {
    for (const w of [
      { wake: '07:00', bed: '19:30' },
      { wake: '20:00', bed: '08:00' },
      { wake: '09:00', bed: '09:00' },
    ]) {
      const bands = dayBands(w);
      for (let m = 0; m < 1440; m += 7) {
        const at = m / 1440;
        const band = bands.find(b => at >= b.from && at < b.to) ?? bands.at(-1);
        expect(band?.kind === 'awake', `${JSON.stringify(w)} @${m}`).toBe(isAwakeAt(m, w));
      }
    }
  });

  it('places a time along the track, and reads nonsense as midnight', () => {
    expect(dayPosition('06:00')).toBeCloseTo(0.25, 6);
    expect(dayPosition('18:00')).toBeCloseTo(0.75, 6);
    expect(dayPosition('nonsense')).toBe(0);
  });
});
