import { describe, expect, it } from 'vitest';
import {
  dayAndClock,
  EVENT_PRESET_LABEL,
  EVENT_PRESETS,
  eventInstant,
  eventTimeAt,
  eventTimeChosen,
  eventTimePicked,
  eventTimeStart,
  rangeWords,
  spanMinutes,
  spanValid,
  withEnd,
  withMinutes,
  withStart,
} from './completedTime';

const TZ = 'America/New_York';
const at = (iso: string) => Date.parse(iso);
const MIN = 60_000;
// a plain 12-hour clock in the household's zone, for reading the lines
const clock = (ms: number) =>
  new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone: TZ }).format(
    new Date(ms),
  );
const NOW = at('2026-10-05T14:28:00-04:00');

describe('the four presets', () => {
  it('read exactly Now / \u221215m / \u221230m / Custom, the app\u2019s one time row', () => {
    expect(EVENT_PRESETS.map(p => EVENT_PRESET_LABEL[p])).toEqual([
      'Now',
      '\u221215m',
      '\u221230m',
      'Custom',
    ]);
  });

  it('Now is the moment of the save, never the moment the sheet opened', () => {
    const s = eventTimeStart(null);
    expect(eventInstant(s, NOW)).toBe(NOW);
    expect(eventInstant(s, NOW + 10 * MIN)).toBe(NOW + 10 * MIN);
  });

  it('15 and 30 min ago are placed when tapped, and stay put', () => {
    const s = eventTimeChosen('m15', NOW);
    expect(eventInstant(s, NOW + 5 * MIN)).toBe(NOW - 15 * MIN);
    expect(eventInstant(eventTimeChosen('m30', NOW), NOW)).toBe(NOW - 30 * MIN);
  });

  it('a picked date and time can be an earlier day, and never later than now', () => {
    const lastNight = at('2026-10-04T21:10:00-04:00');
    expect(eventInstant(eventTimePicked(lastNight, NOW), NOW)).toBe(lastNight);
    expect(eventInstant(eventTimePicked(NOW + 60 * MIN, NOW), NOW + 90 * MIN)).toBe(NOW);
  });

  it('a slot that is over starts the entry at the slot until the row is touched', () => {
    const slot = at('2026-10-05T13:00:00-04:00');
    expect(eventInstant(eventTimeStart(slot), NOW, 45)).toBe(slot + 45 * MIN);
    // a moment, not a span: the slot itself
    expect(eventInstant(eventTimeStart(slot), NOW, 0)).toBe(slot);
  });

  it('an edit opens on the saved instant', () => {
    const saved = at('2026-10-05T13:50:00-04:00');
    expect(eventInstant(eventTimeAt(saved), NOW)).toBe(saved);
  });
});

describe('the day and the clock', () => {
  it('says Today, Yesterday or the date', () => {
    expect(dayAndClock(NOW, NOW, TZ, clock)).toBe('Today · 2:28 PM');
    expect(dayAndClock(at('2026-10-04T20:59:00-04:00'), NOW, TZ, clock)).toBe(
      'Yesterday · 8:59 PM',
    );
    expect(dayAndClock(at('2026-10-02T08:00:00-04:00'), NOW, TZ, clock)).toBe('Oct 2 · 8:00 AM');
    // an edit always says the saved entry's own date
    expect(dayAndClock(NOW, NOW, TZ, clock, true)).toBe('Oct 5 · 2:28 PM');
  });

  it('a range on one day is two clocks; across midnight each end names its day', () => {
    expect(rangeWords(NOW - 45 * MIN, NOW, NOW, TZ, clock)).toBe('1:43 PM → 2:28 PM');
    expect(
      rangeWords(at('2026-10-04T20:59:00-04:00'), at('2026-10-05T14:27:00-04:00'), NOW, TZ, clock),
    ).toBe('Oct 4 · 8:59 PM → Oct 5 · 2:27 PM');
  });
});

describe('a saved span, corrected', () => {
  const saved = {
    startMs: at('2026-10-04T20:59:00-04:00'),
    endMs: at('2026-10-05T14:27:00-04:00'),
  };

  it('derives the Duration from the two instants', () => {
    expect(spanMinutes(saved)).toBe(17 * 60 + 28);
  });

  it('moving either end keeps the other, and the Duration follows', () => {
    const later = withStart(saved, at('2026-10-04T21:30:00-04:00'));
    expect(later.endMs).toBe(saved.endMs);
    expect(spanMinutes(later)).toBe(16 * 60 + 57);
    const earlier = withEnd(saved, at('2026-10-05T06:00:00-04:00'));
    expect(earlier.startMs).toBe(saved.startMs);
    expect(spanMinutes(earlier)).toBe(9 * 60 + 1);
  });

  it('moving the Duration keeps the end and moves the start', () => {
    const d = withMinutes(saved, 600);
    expect(d.endMs).toBe(saved.endMs);
    expect(spanMinutes(d)).toBe(600);
  });

  it('an end before its start cannot be saved', () => {
    expect(spanValid(withEnd(saved, saved.startMs - MIN))).toBe(false);
    expect(spanValid(saved)).toBe(true);
  });
});
