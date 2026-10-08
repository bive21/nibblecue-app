import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { rule } from './fixtures';
import { intervalLabel, ruleLabel, SCHEDULE_HINTS } from './labels';
import { seriesTimes, repeatsOn } from './repeat';
import { ruleShapeError } from './validate';

describe('labels (SCHEDULE_LOGIC §9)', () => {
  it('presets are durations only', () => {
    expect([90, 120, 150, 180, 240, 45].map(intervalLabel)).toEqual([
      '1.5h',
      '2h',
      '2.5h',
      '3h',
      '4h',
      '45m',
    ]);
  });
  it('a rule goes by its own name, "Feeding" for any feeding rule, else the module', () => {
    const feed = rule({ id: 'f', activity: 'bottle', ruleType: 'INTERVAL', everyMinutes: 180 });
    expect(ruleLabel(feed, 'Bottle')).toBe('Feeding');
    // a fixed bottle READ "Bottle" until 2026-09-19; either kind of feed has closed its slot
    // since 2026-09-18 (`feedEitherKind`), and the set-times card titles it "Feeding" — so the
    // day list, Up next and the reminder say the word the card says
    expect(ruleLabel({ ...feed, ruleType: 'FIXED' }, 'Bottle')).toBe('Feeding');
    expect(ruleLabel({ ...feed, activity: 'breastfeed', ruleType: 'FIXED' }, 'Breastfeed')).toBe(
      'Feeding',
    );
    expect(ruleLabel({ ...feed, ruleType: 'FIXED', name: 'Dream feed' }, 'Bottle')).toBe(
      'Dream feed',
    );
    expect(ruleLabel({ ...feed, name: 'Vitamin D' }, 'Medicine')).toBe('Vitamin D');
    expect(ruleLabel(rule({ id: 'p', activity: 'pump', ruleType: 'INTERVAL' }), 'Pump')).toBe(
      'Pump',
    );
  });

  it('every string in this folder avoids the judgment phrases (SCHEDULE_LOGIC "Overdue states")', () => {
    const dir = __dirname;
    const banned =
      /hungry|overdue|should (eat|feed|be)|needs a feed|time to feed|may need|your baby (is|needs)|try harder|doing great/i;
    // `*.banned.ts` is the one exemption, and it is the scanner's own blind spot rather than a
    // loophole: a file that LISTS the phrases we refuse to write ("should be", "low supply") is
    // data for this very check, and scanning it fails the build for containing the ban it exists
    // to enforce. Nothing but a list of forbidden strings may take the suffix.
    for (const f of readdirSync(dir).filter(
      f =>
        f.endsWith('.ts') &&
        !f.endsWith('.test.ts') &&
        !f.endsWith('.banned.ts') &&
        f !== 'fixtures.ts',
    )) {
      const src = readFileSync(join(dir, f), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
      const strings = [...src.matchAll(/(['"`])((?:\\.|(?!\1)[^\\])*)\1/g)].map(m => m[2] ?? '');
      for (const s of strings) expect(s, `${f}: ${s}`).not.toMatch(banned);
    }
    expect(SCHEDULE_HINTS.arithmetic).toBe(
      'Missed slots are arithmetic, not a verdict. Nothing here scores you.',
    );
  });
});

describe('repeat and series', () => {
  it('repeatsOn follows the four kinds', () => {
    expect([0, 1, 5, 6].map(d => repeatsOn({ repeat: 'WEEKDAYS', repeatDays: null }, d))).toEqual([
      false,
      true,
      true,
      false,
    ]);
    expect([0, 1, 6].map(d => repeatsOn({ repeat: 'WEEKENDS', repeatDays: null }, d))).toEqual([
      true,
      false,
      true,
    ]);
    expect(repeatsOn({ repeat: 'CUSTOM', repeatDays: [2] }, 2)).toBe(true);
    expect(repeatsOn({ repeat: 'CUSTOM', repeatDays: null }, 2)).toBe(false);
  });
  it('a set of times lays a day out from first + every + last, twelve at most', () => {
    expect(seriesTimes('07:00', 180, '21:00')).toEqual([
      '07:00',
      '10:00',
      '13:00',
      '16:00',
      '19:00',
    ]);
    expect(seriesTimes('07:00', 5, '23:59')).toHaveLength(12);
  });
});

describe('rule shape (0001 rule_shape, night_shape, miss_window_sane)', () => {
  it('refuses what the database would', () => {
    expect(ruleShapeError(rule({ id: 'a', activity: 'bottle', ruleType: 'FIXED' }))).toBe(
      'A fixed item needs a time of day.',
    );
    expect(
      ruleShapeError(rule({ id: 'b', activity: 'pump', ruleType: 'INTERVAL', everyMinutes: 10 })),
    ).toMatch(/between 30 minutes/);
    expect(
      ruleShapeError(
        rule({ id: 'c', activity: 'bath', ruleType: 'CADENCE', atLocalTime: '18:30' }),
      ),
    ).toMatch(/every so many days/);
    expect(
      ruleShapeError(
        rule({
          id: 'd',
          activity: 'pump',
          ruleType: 'INTERVAL',
          everyMinutes: 180,
          nightMode: 'LONGER',
          nightFrom: '23:00',
          nightTo: '06:00',
        }),
      ),
    ).toMatch(/longer overnight/);
    expect(
      ruleShapeError(rule({ id: 'e', activity: 'med', ruleType: 'FIXED', atLocalTime: '08:00' })),
    ).toMatch(/name on the bottle/);
    expect(
      ruleShapeError(
        rule({
          id: 'f',
          activity: 'med',
          ruleType: 'FIXED',
          atLocalTime: '08:00',
          name: 'Vitamin D drops',
        }),
      ),
    ).toBeNull();
    expect(
      ruleShapeError(
        rule({
          id: 'g',
          activity: 'bath',
          ruleType: 'CADENCE',
          atLocalTime: '18:30',
          repeatDays: [2, 6],
        }),
      ),
    ).toBeNull();
  });
});
