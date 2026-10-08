/**
 * The wheel's plane geometry. Two claims, and the second one is a bug that shipped once in this
 * file's first draft: an arc drawn the wrong way round is the waking day painted in the night's
 * color, and nothing but a test tells you so without a device.
 */
import { describe, expect, it } from 'vitest';
import { nightArcDeg, WHEEL_DIRECTION, WHEEL_WAKE_DEG } from '@nibblecue/core';
import { arcPath, wheelPoint } from './wheelGeometry';

/** The five numbers of an `A` command: rx ry rot large sweep. */
const flags = (d: string): { large: string; sweep: string } => {
  const m = /A [\d.-]+ [\d.-]+ 0 (\d) (\d) /.exec(d);
  return { large: m?.[1] ?? '', sweep: m?.[2] ?? '' };
};

describe('bearings become points', () => {
  it('puts twelve o’clock at the top and three o’clock at the right', () => {
    const top = wheelPoint(0, 100, 0, 0);
    expect(top.x).toBeCloseTo(0, 6);
    expect(top.y).toBeCloseTo(-100, 6);
    const right = wheelPoint(90, 100, 0, 0);
    expect(right.x).toBeCloseTo(100, 6);
    expect(right.y).toBeCloseTo(0, 6);
  });

  it('measures from the center it is given', () => {
    const p = wheelPoint(180, 40, 160, 160);
    expect(p.x).toBeCloseTo(160, 6);
    expect(p.y).toBeCloseTo(200, 6);
  });
});

describe('an arc travels the way the ring runs', () => {
  /* the sun at the top left and the day running clockwise from it, so the night is the short band
     that closes the loop and the waking day is the long way round. The ring is clock-scaled
     (core's `nightArcDeg`): a 6-to-8 day is two thirds of it, which is the case this file has to
     draw without painting one arc over the other. */
  const wake = WHEEL_WAKE_DEG;
  const bed =
    (WHEEL_WAKE_DEG +
      WHEEL_DIRECTION * (360 - nightArcDeg({ wake: '06:00', bed: '22:00' })) +
      360) %
    360;

  it('takes the long way for the waking day and the short way for the night', () => {
    const day = flags(arcPath(wake, bed, 100, 120, 120, WHEEL_DIRECTION));
    const night = flags(arcPath(bed, wake, 100, 120, 120, WHEEL_DIRECTION));
    // the day has the greater part of the ring, so it is the large arc; the night is what is left
    expect(day.large).toBe('1');
    expect(night.large).toBe('0');
    // and BOTH run the same way round, which is what keeps them from painting over each other
    expect(day.sweep).toBe(night.sweep);
    expect(day.sweep).toBe(WHEEL_DIRECTION > 0 ? '1' : '0');
  });

  it('flips the sweep flag with the direction, and nothing else', () => {
    expect(flags(arcPath(0, 90, 50, 0, 0, 1)).sweep).toBe('1');
    expect(flags(arcPath(0, 90, 50, 0, 0, -1)).sweep).toBe('0');
    // 0° to 90° is a quarter turn clockwise and three quarters counter-clockwise
    expect(flags(arcPath(0, 90, 50, 0, 0, 1)).large).toBe('0');
    expect(flags(arcPath(0, 90, 50, 0, 0, -1)).large).toBe('1');
  });

  it('starts and ends on the two bearings it was given', () => {
    const d = arcPath(0, 180, 100, 120, 120, 1);
    expect(d.startsWith('M 120 20')).toBe(true);
    expect(d.endsWith('120 220')).toBe(true);
  });
});
