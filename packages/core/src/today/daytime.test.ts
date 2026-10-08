/**
 * The phone's daytime: one pair of hours. What matters here is that the pair IS the trial sheets'
 * pair (a second one would drift), and that the edges fall where the words on the Appearance sheet
 * say they do: from 9 PM to 8 AM is the night.
 */
import { describe, expect, it } from 'vitest';
import { PROMPT_TIMING } from '../plan/welcome';
import { DAYTIME, isDaytimeHour, nearestDaytimeHour, nextDaytimeHour } from './daytime';

describe('the daytime', () => {
  it('is the trial sheets’ own hours, not a second pair', () => {
    expect(DAYTIME.fromHour).toBe(PROMPT_TIMING.fromHour);
    expect(DAYTIME.untilHour).toBe(PROMPT_TIMING.untilHour);
    expect(DAYTIME).toEqual({ fromHour: 8, untilHour: 21 });
  });

  it('opens at 8 in the morning and closes at 9 in the evening', () => {
    expect(isDaytimeHour(7)).toBe(false);
    expect(isDaytimeHour(8)).toBe(true);
    expect(isDaytimeHour(14)).toBe(true);
    expect(isDaytimeHour(20)).toBe(true);
    expect(isDaytimeHour(21)).toBe(false);
    expect(isDaytimeHour(23)).toBe(false);
    expect(isDaytimeHour(0)).toBe(false);
    expect(isDaytimeHour(3)).toBe(false);
  });

  it('is thirteen hours of the twenty-four', () => {
    expect(Array.from({ length: 24 }, (_, h) => h).filter(isDaytimeHour)).toHaveLength(13);
  });
});

describe('a daytime hour to choose, for what rises by itself', () => {
  it('reads an hour stored before the picker was narrowed as the daytime hour nearest it', () => {
    expect(nearestDaytimeHour(6)).toBe(8);
    expect(nearestDaytimeHour(0)).toBe(8);
    expect(nearestDaytimeHour(8)).toBe(8);
    expect(nearestDaytimeHour(18)).toBe(18);
    expect(nearestDaytimeHour(20)).toBe(20);
    expect(nearestDaytimeHour(21)).toBe(20);
    expect(nearestDaytimeHour(23)).toBe(20);
  });

  it('steps through the daytime only, the last hour wrapping to the first', () => {
    const seen: number[] = [];
    let h: number = DAYTIME.fromHour;
    for (let i = 0; i < 13; i++) {
      seen.push(h);
      h = nextDaytimeHour(h);
    }
    expect(seen).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]);
    expect(h).toBe(8);
    expect(seen.every(isDaytimeHour)).toBe(true);
    // a night hour steps from where it reads, never into the night
    expect(nextDaytimeHour(22)).toBe(8);
    expect(nextDaytimeHour(5)).toBe(9);
  });
});
