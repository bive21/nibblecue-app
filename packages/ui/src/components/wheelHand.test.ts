/**
 * THE DAY WHEEL'S CLOCK HAND (`wheelHand.ts`, `WheelHand.tsx`; the owner's delight list,
 * 2026-09-26). The arithmetic is walked here — where now is, which way the sweep turns and how long
 * it takes — and so is the ink, against every ground the hand can land on in every theme and
 * scheme. What only a device can show (the sweep on the native driver, the hand under the houses)
 * is held by tripwires over the component files, because this suite has no renderer.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { layoutWheel, type DayWindow } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { SCHEME_NAMES } from '../theme/appearance';
import { AA_GRAPHIC, composite, contrastRatio, parseColor } from '../theme/contrast';
import { resolvePalette, themeNames, themes } from '../theme/theme';
import {
  clockwiseDeg,
  HAND_SWEEP,
  handInk,
  handReach,
  handSweep,
  nowBearing,
  WHEEL_HAND,
} from './wheelHand';

const here = dirname(fileURLToPath(import.meta.url));
/** Comments out, whitespace flattened: a scan reads what the code does, not what it says. */
const code = (file: string): string =>
  readFileSync(join(here, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

const WINDOW: DayWindow = { wake: '07:00', bed: '19:30' };
const hm = (h: number, m = 0) => h * 60 + m;

describe('where now is on the ring', () => {
  it('points exactly where a stop planned for that minute is drawn', () => {
    for (const minutes of [hm(7), hm(8, 13), hm(14, 30), hm(19, 30), hm(23, 5), hm(3, 40)]) {
      const layout = layoutWheel([{ key: 'x', minutes, activity: 'bottle' }], WINDOW);
      const stop = layout.stops[0];
      expect(stop, String(minutes)).toBeDefined();
      expect(nowBearing(layout, minutes)).toBeCloseTo(stop?.deg ?? -1, 9);
    }
  });

  it('stands on the sun at wake time and on the moon at bedtime', () => {
    const layout = layoutWheel([], WINDOW);
    expect(nowBearing(layout, hm(7))).toBeCloseTo(layout.wakeDeg, 9);
    expect(nowBearing(layout, hm(19, 30))).toBeCloseTo(layout.bedDeg, 9);
  });
});

describe('the sweep: clockwise from the wake mark, and never longer than 900 ms', () => {
  const layout = layoutWheel([], WINDOW);
  const wake = layout.wakeDeg;

  it('measures clockwise distances in [0, 360)', () => {
    expect(clockwiseDeg(320, 20)).toBe(60);
    expect(clockwiseDeg(20, 320)).toBe(300);
    expect(clockwiseDeg(90, 90)).toBe(0);
    expect(clockwiseDeg(-30, 30)).toBe(60);
  });

  it('sets off from the wake mark and lands on now, turning the way a clock does', () => {
    for (let minutes = 0; minutes < 1440; minutes += 7) {
      const now = nowBearing(layout, minutes);
      const s = handSweep(wake, now);
      expect(s.from).toBe(wake);
      const travel = s.to - s.from;
      expect(travel).toBeGreaterThanOrEqual(0);
      expect(travel).toBeLessThan(360);
      // unwrapped, but the same bearing
      expect((((s.to - now) % 360) + 360) % 360).toBeCloseTo(0, 6);
      expect(s.durationMs).toBeGreaterThanOrEqual(HAND_SWEEP.minMs);
      expect(s.durationMs).toBeLessThanOrEqual(900);
    }
  });

  it('takes longer the further it goes', () => {
    const noon = handSweep(wake, nowBearing(layout, hm(12)));
    const evening = handSweep(wake, nowBearing(layout, hm(18)));
    expect(evening.durationMs).toBeGreaterThan(noon.durationMs);
    // a hand a few minutes past wake is barely a flick
    expect(handSweep(wake, nowBearing(layout, hm(7, 10))).durationMs).toBeLessThan(340);
  });

  it('at five in the morning, goes the long way round: yesterday since waking, and the night', () => {
    const s = handSweep(wake, nowBearing(layout, hm(5)));
    expect(s.to - s.from).toBeGreaterThan(300);
    expect(s.durationMs).toBeLessThanOrEqual(900);
  });

  it('eases out onto the minute, with no overshoot to come back from', () => {
    const [x1, y1, x2, y2] = HAND_SWEEP.ease;
    expect([x1, x2].every(x => x >= 0 && x <= 1)).toBe(true);
    // both control points at or under 1: the curve never passes the bearing it lands on
    expect(y1).toBeLessThanOrEqual(1);
    expect(y2).toBeLessThanOrEqual(1);
  });
});

describe('the drawing: from the hub’s edge to the ring, thin, with a dot at the tip', () => {
  it('spends no ink under the hub, and ends on the track', () => {
    expect(handReach(112, 84)).toEqual({ inner: 84, outer: 112 });
    // a hub that somehow outgrew the ring draws nothing rather than a line pointing inward
    expect(handReach(40, 60)).toEqual({ inner: 40, outer: 40 });
  });

  it('is 2 pt thin, with a tip that reads on the 12 pt night band', () => {
    expect(WHEEL_HAND.stroke).toBe(2);
    expect(WHEEL_HAND.tip * 2).toBeGreaterThan(WHEEL_HAND.stroke);
    expect(WHEEL_HAND.tip * 2).toBeLessThan(12);
    expect(WHEEL_HAND.alpha).toBeGreaterThan(0);
    expect(WHEEL_HAND.alpha).toBeLessThan(1);
  });
});

/**
 * THE INK, WHERE IT LANDS. The hand is drawn on the card (`surfaceSolid`, which `DayWheelCard`
 * paints) and its dot on the ring's track: the hairline day arc (`line` over the card) or the night
 * band (`sleepSoft`, opaque). Everywhere, at the hand's share, 3:1 — a mark (WCAG 1.4.11) — in all
 * three themes and all six schemes.
 */
describe('3:1 on everything it lands on, in every theme and scheme', () => {
  const cases = themeNames.flatMap(theme => SCHEME_NAMES.map(scheme => ({ theme, scheme })));

  it.each(cases)('$theme / $scheme', ({ theme, scheme }) => {
    const p = resolvePalette(theme, scheme);
    const ink = handInk(p, theme);
    expect(parseColor(ink).a).toBe(1);
    const grounds = {
      card: p.surfaceSolid,
      dayTrack: composite(p.surfaceSolid, p.line),
      nightBand: p.sleepSoft,
    };
    for (const [name, ground] of Object.entries(grounds)) {
      const landed = composite(ground, ink, WHEEL_HAND.alpha);
      expect(contrastRatio(landed, ground), name).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
  });

  it('is the accent in light and dark, and the night palette’s own amber in Night', () => {
    for (const scheme of SCHEME_NAMES) {
      for (const theme of ['light', 'dark'] as const) {
        const p = resolvePalette(theme, scheme);
        expect(handInk(p, theme)).toBe(p.accent);
      }
      // the resolved night palette carries the SCHEME's accent for its buttons; the hand does not
      expect(handInk(resolvePalette('night', scheme), 'night')).toBe(themes.night.accent);
    }
    const { r, b } = parseColor(themes.night.accent);
    expect(b).toBeLessThanOrEqual(r);
  });
});

describe('the component: under everything, on the native driver, still when asked', () => {
  const hand = code('WheelHand.tsx');
  const wheel = code('ScheduleWheel.tsx');

  it('turns on the native driver, from the wake mark, on the ease-out', () => {
    expect(hand).toContain('useNativeDriver: true');
    expect(hand).toContain('handSweep(wakeDeg, latest.current)');
    expect(hand).toContain('Easing.bezier(...HAND_SWEEP.ease)');
  });

  it('sets each minute rather than animating it', () => {
    expect(hand).toContain('if (!sweeping.current) angle.setValue(deg);');
  });

  it('draws the end state under reduce motion and in the amber Night', () => {
    expect(hand).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(hand).toContain('new Animated.Value(still ? deg : wakeDeg)');
  });

  it('takes no touch and says nothing to a screen reader', () => {
    expect(hand).toContain('pointerEvents="none"');
    expect(hand).toContain('accessibilityElementsHidden');
    expect(hand).toContain('importantForAccessibility="no-hide-descendants"');
  });

  it('is drawn straight after the track: under the ends, the houses, the captions and the hub', () => {
    const at = wheel.indexOf('<WheelHand');
    expect(at).toBeGreaterThan(wheel.indexOf('</Svg>'));
    expect(at).toBeLessThan(wheel.indexOf('<EndMark'));
    expect(at).toBeLessThan(wheel.indexOf('<WheelStopView'));
    expect(at).toBeLessThan(wheel.indexOf('styles.hub'));
  });

  it('is off unless a caller asks: the prop defaults to none', () => {
    expect(wheel).toContain('nowMinutes = null,');
    expect(wheel).toContain('{nowMinutes === null ? null : ( <WheelHand');
  });
});
