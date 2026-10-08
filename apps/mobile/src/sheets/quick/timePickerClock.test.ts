/**
 * The iPhone's Done must keep the spinner's last turn, not the render's (`timePickerClock.ts`).
 * Android never hits this path: its dialog settles inside `onValueChange` with the event's Date.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dateFromWallClock, settleWallClock, wallClockFromDate } from './timePickerClock';

const here = dirname(fileURLToPath(import.meta.url));
const pickerSrc = () => readFileSync(join(here, 'timePicker.tsx'), 'utf8');
const datePickerSrc = () => readFileSync(join(here, 'datePicker.tsx'), 'utf8');

describe('wall clock ↔ Date for the platform picker', () => {
  it('reads only hour and minute, and writes them onto the day of now', () => {
    const at = Date.parse('2026-10-03T12:34:56.789Z');
    const d = dateFromWallClock({ hours: 8, minutes: 0 }, at);
    expect(wallClockFromDate(d)).toEqual({ hours: 8, minutes: 0 });
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });

  it('keeps a spun time when Done fires before React re-renders (the iPhone race)', () => {
    // opening: the wheel started on the timer's "now" (8:25); the parent spun to 8:00
    const opening = dateFromWallClock(
      { hours: 8, minutes: 25 },
      Date.parse('2026-10-03T12:00:00Z'),
    );
    const spun = dateFromWallClock({ hours: 8, minutes: 0 }, Date.parse('2026-10-03T12:00:00Z'));
    // a ref holds the spinner's last report; the button's closure still has `opening`
    const latest = spun;
    expect(settleWallClock(latest)).toEqual({ hours: 8, minutes: 0 });
    // the stale closure would have kept 8:25 — that is the bug Done used to ship
    expect(wallClockFromDate(opening)).toEqual({ hours: 8, minutes: 25 });
  });

  it('dismisses when nothing was ever chosen', () => {
    expect(settleWallClock(null)).toBeNull();
  });
});

describe('the iOS Done button reads the spinner through a ref, not a render closure', () => {
  it('time picker: onValueChange writes the ref, Done settles from it', () => {
    const src = pickerSrc().replace(/\s+/g, ' ');
    expect(src).toContain('iosRef.current = d');
    expect(src).toContain('settle(settleWallClock(iosRef.current))');
    // the old bug: Done closed over the React state Date from the last paint
    expect(src).not.toContain('settle(fromDate(ios))');
    expect(src).not.toContain('onPress={() => settle(fromDate(ios))}');
  });

  it('date picker keeps the same rule on its Done', () => {
    const src = datePickerSrc().replace(/\s+/g, ' ');
    expect(src).toContain('iosRef.current = next');
    expect(src).toContain('settle(iosRef.current ? dayKeyOf(iosRef.current.value) : null)');
    expect(src).not.toContain('settle(dayKeyOf(ios.value))');
  });
});
