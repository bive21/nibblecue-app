import { describe, expect, it } from 'vitest';
import type { Suggestion } from './coach';
import { coachCompare, coachDaypart, coachEvidence } from './copy';

const base = { activity: 'bottle', ruleId: 'r1', driftMinutes: 35 } as const;
const day: Suggestion = {
  ...base,
  id: 'interval:r1:180',
  kind: 'interval',
  samples: 57,
  currentMinutes: 180,
  observedMinutes: 143,
  apply: { verb: 'setInterval', ruleId: 'r1', everyMinutes: 145 },
};
const night: Suggestion = {
  ...base,
  id: 'nightInterval:r1:240',
  kind: 'nightInterval',
  samples: 6,
  currentMinutes: 240,
  observedMinutes: 104,
  apply: {
    verb: 'setNight',
    ruleId: 'r1',
    nightEveryMinutes: 105,
    nightFrom: '19:30',
    nightTo: '07:00',
  },
};

describe('the compact comparison keeps three numbers apart (Option 1, 2026-10-05)', () => {
  it('says the setting, what Use writes, and the log’s own middle', () => {
    expect(coachCompare(day, 'day')).toMatchObject({
      current: '3h',
      proposed: '2h 25m',
      usually: 'Usually 2h 23m',
    });
    expect(coachCompare(night, 'night')).toMatchObject({
      current: '4h',
      proposed: '1h 45m',
      usually: 'Usually 1h 44m',
    });
  });

  it('files a card under its daypart, and an interval with no night of its own as both', () => {
    expect(coachDaypart(day, true)).toBe('day');
    expect(coachDaypart(day, false)).toBe('allDay');
    expect(coachDaypart(night, true)).toBe('night');
    expect(coachDaypart({ ...day, kind: 'slotTime' }, true)).toBeNull();
  });

  it('names the count for what it is, and what Use sets', () => {
    expect(coachEvidence(day, 'day')).toBe(
      'Day: usually every 2h 23m, the middle of 57 gaps between entries in the last 14 days. Set to every 3h; Use sets every 2h 25m.',
    );
  });

  it('has no comparison for a card that does not set an interval', () => {
    expect(
      coachCompare({ ...day, apply: { verb: 'openRhythm', activity: 'bottle' } }, 'day'),
    ).toBeNull();
  });
});
