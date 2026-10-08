import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MILK_GUIDANCE } from '../guidance';
import {
  bestUseBadge,
  calendarDaysUntil,
  conditionWindows,
  guidanceDates,
  milkCondition,
} from './guidance';

const profile = MILK_GUIDANCE.CDC_US['2026_01'];
const TZ = 'America/New_York';
const MIN = 60_000;
const T0 = '2026-06-12T14:00:00.000Z';
const base = { pumped_at: '2026-06-10T09:30:00.000Z', first_frozen_at: T0, thawed_at: null };

describe('guidance dates (MILK_STASH §5, TESTING §2.7)', () => {
  it('anchors each condition where the profile says: pumped, first frozen, or thawed', () => {
    expect(guidanceDates(profile, 'ROOM', base).anchorField).toBe('pumped_at');
    expect(guidanceDates(profile, 'FRIDGE', base).anchorField).toBe('pumped_at');
    expect(guidanceDates(profile, 'FREEZER', base).anchorField).toBe('first_frozen_at');
    expect(guidanceDates(profile, 'DEEP_FREEZER', base).anchorField).toBe('first_frozen_at');
    expect(guidanceDates(profile, 'THAWED', base).anchorField).toBe('thawed_at');
  });

  it('returns best use and the guidance limit as two separate values', () => {
    const d = guidanceDates(profile, 'FREEZER', base);
    expect(d.bestUseMinutes).toBe(263520);
    expect(d.limitMinutes).toBe(525600);
    expect(d.bestUseAt).toBe(Date.parse(T0) + 263520 * MIN);
    expect(d.limitAt).toBe(Date.parse(T0) + 525600 * MIN);
    expect(d.bestUseAt).not.toBe(d.limitAt);
    // and for the conditions where the two coincide they are still two fields
    const f = guidanceDates(profile, 'FRIDGE', base);
    expect(f.bestUseAt).toBe(Date.parse(base.pumped_at) + 5760 * MIN);
    expect(f.limitAt).toBe(f.bestUseAt);
  });

  it('gives a frozen container with no freeze date null and a reason, never a guessed date', () => {
    const d = guidanceDates(profile, 'FREEZER', { ...base, first_frozen_at: null });
    expect(d.anchorAt).toBe(null);
    expect(d.bestUseAt).toBe(null);
    expect(d.limitAt).toBe(null);
    expect(d.missing).toBe('MISSING_FREEZE_DATE');
    const t = guidanceDates(profile, 'THAWED', { ...base, thawed_at: null });
    expect(t.missing).toBe('MISSING_THAW_DATE');
    expect(t.bestUseAt).toBe(null);
  });

  it('moving freezer → freezer changes neither date (acceptance test 12)', () => {
    const a = guidanceDates(profile, 'FREEZER', base);
    const b = guidanceDates(profile, 'DEEP_FREEZER', base);
    expect(b.bestUseAt).toBe(a.bestUseAt);
    expect(b.limitAt).toBe(a.limitAt);
  });

  it('echoes the profile and version for attribution, and reads labels from the file', () => {
    const d = guidanceDates(profile, 'ROOM', base);
    expect(d.profile).toBe('CDC_US');
    expect(d.version).toBe('2026_01');
    expect(conditionWindows(profile, 'ROOM')).toEqual({
      label: 'Room temperature',
      detail: 'up to 77°F / 25°C',
      bestUseMinutes: 240,
      limitMinutes: 240,
    });
  });

  it('refuses a condition the profile does not know rather than inventing a window', () => {
    expect(() => guidanceDates(profile, 'CUPBOARD' as never, base)).toThrow(RangeError);
  });
});

describe('thawed milk moved on to the plain fridge (acceptance 12.5, stash finding 7)', () => {
  const thawedAt = '2026-09-23T14:05:00.000Z';
  const thawed = { ...base, thawed_at: thawedAt };

  it('is dated by the THAWED condition: 24 hours from the thaw, not four days from the pump', () => {
    const d = guidanceDates(profile, 'FRIDGE', thawed);
    expect(d).toMatchObject({
      kind: 'THAWED',
      anchorField: 'thawed_at',
      anchorAt: Date.parse(thawedAt),
      bestUseAt: Date.parse(thawedAt) + 1440 * MIN,
      limitAt: Date.parse(thawedAt) + 1440 * MIN,
      missing: null,
    });
    // exactly the dates it had in the thawing place, so the move changes nothing a parent reads
    expect(d).toEqual(guidanceDates(profile, 'THAWED', thawed));
  });

  it('leaves milk that was never thawed on the fridge clock', () => {
    expect(milkCondition('FRIDGE', null)).toBe('FRIDGE');
    expect(guidanceDates(profile, 'FRIDGE', base)).toMatchObject({
      kind: 'FRIDGE',
      anchorField: 'pumped_at',
    });
  });

  it('invents no room-temperature window for thawed milk, and a freezer keeps its freeze date', () => {
    // the file has no "thawed, at room temperature" condition: ROOM stays ROOM, from the pump
    expect(milkCondition('ROOM', thawedAt)).toBe('ROOM');
    expect(guidanceDates(profile, 'ROOM', thawed).anchorField).toBe('pumped_at');
    for (const k of ['FREEZER', 'DEEP_FREEZER'] as const) {
      expect(milkCondition(k, thawedAt)).toBe(k);
      expect(guidanceDates(profile, k, thawed).bestUseAt).toBe(
        guidanceDates(profile, k, base).bestUseAt,
      );
    }
    expect(milkCondition('THAWED', null)).toBe('THAWED');
  });
});

describe('calendar days and the badge (§6g)', () => {
  const now = Date.parse('2026-06-12T23:30:00-04:00'); // 11:30 PM New York
  it('counts local calendar days, so 40 minutes before midnight the next day is 1 day', () => {
    expect(calendarDaysUntil(now + 40 * MIN, now, TZ)).toBe(1);
    // 11:30 PM plus 26 hours is 1:30 AM two mornings on
    expect(calendarDaysUntil(now + 26 * 60 * MIN, now, TZ)).toBe(2);
    expect(calendarDaysUntil(now - 24 * 60 * MIN, now, TZ)).toBe(-1);
    expect(calendarDaysUntil(now, now, TZ)).toBe(0);
  });
  it('is past best use, then hours, then critical days, then warn days, then nothing', () => {
    expect(bestUseBadge(now - 1, now, TZ)).toEqual({ label: 'past best use', tone: 'crit' });
    expect(bestUseBadge(now + 3 * 60 * MIN, now, TZ)).toEqual({ label: '3h', tone: 'crit' });
    expect(bestUseBadge(now + 5 * 24 * 60 * MIN, now, TZ)).toEqual({ label: '5d', tone: 'crit' });
    expect(bestUseBadge(now + 24 * 24 * 60 * MIN, now, TZ)).toEqual({ label: '24d', tone: 'warn' });
    expect(bestUseBadge(now + 45 * 24 * 60 * MIN, now, TZ)).toBe(null);
    expect(bestUseBadge(null, now, TZ)).toBe(null);
  });

  /**
   * A FRIDGE CONTAINER IS NOT CRITICAL ON THE DAY IT IS STORED (the owner, on a phone,
   * 2026-09-18: "why is it showing as past best use? is this a bug or miscalculation?").
   *
   * It was a miscalculation. Seven days and thirty days are the FREEZER's proportions; a
   * refrigerator's whole window is four days, so every fridge container was inside "seven days
   * of best use" the moment it existed and wore the same red as milk that is genuinely past its
   * date. The bands are a share of the condition's own window now, floored by the old numbers so
   * the freezer is untouched.
   */
  it('scales the badge to the condition’s own window rather than the freezer’s', () => {
    const DAY = 24 * 60 * MIN;
    const FRIDGE = 5760; // minutes, from the CDC profile: four days
    const FREEZER = 263520; // ~six months
    // fresh milk, three days of its four left: nothing to say
    expect(bestUseBadge(now + 3 * DAY, now, TZ, FRIDGE)).toBe(null);
    // half the window gone: worth a word, not an alarm
    expect(bestUseBadge(now + 2 * DAY, now, TZ, FRIDGE)).toEqual({ label: '2d', tone: 'warn' });
    // the last quarter: critical, which is what the red is for
    expect(bestUseBadge(now + 1 * DAY, now, TZ, FRIDGE)).toEqual({ label: '1d', tone: 'crit' });
    // and the freezer keeps the bands it always had — a quarter of six months is 46 days, so
    // the absolute seven still wins
    expect(bestUseBadge(now + 5 * DAY, now, TZ, FREEZER)).toEqual({ label: '5d', tone: 'crit' });
    expect(bestUseBadge(now + 24 * DAY, now, TZ, FREEZER)).toEqual({ label: '24d', tone: 'warn' });
    expect(bestUseBadge(now + 45 * DAY, now, TZ, FREEZER)).toBe(null);
    // no window in hand: the old behavior, rather than no badge at all
    expect(bestUseBadge(now + 3 * DAY, now, TZ)).toEqual({ label: '3d', tone: 'crit' });
  });
});

describe('vocabulary (MILK_STASH §13)', () => {
  it('no string in the stash module says a banned word, or tells a parent what to do', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const banned = [...profile.display.neverSay, 'should', 'must', 'recommend', 'throw'];
    const strings: string[] = [];
    for (const f of readdirSync(here)) {
      if (!f.endsWith('.ts') || f.endsWith('.test.ts')) continue;
      const src = readFileSync(join(here, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
      for (const m of src.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)) strings.push(m[2] ?? '');
    }
    expect(strings.length).toBeGreaterThan(20);
    for (const s of strings)
      for (const word of banned)
        expect(new RegExp(`\\b${word}\\b`, 'i').test(s), `"${s}" contains "${word}"`).toBe(false);
  });
});
