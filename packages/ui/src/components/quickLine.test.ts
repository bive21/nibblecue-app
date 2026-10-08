import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { compactSince, QUICK_LINE_BUDGET, tileAlert, tileLine } from './quickLine';

const len = (s: string) => Array.from(s).length;

describe('compactSince', () => {
  it('drops the minutes only past ten hours: under that they are the whole point', () => {
    expect(compactSince('13h 14m')).toBe('13h');
    expect(compactSince('2h 42m')).toBe('2h 42m');
    expect(compactSince('9h 59m')).toBe('9h 59m');
    expect(compactSince('10h 01m')).toBe('10h');
    expect(compactSince('45m')).toBe('45m');
    expect(compactSince('Now')).toBe('Now');
    expect(compactSince('3d')).toBe('3d');
    expect(compactSince('nothing in 14h 30m')).toBe('nothing in 14h');
    expect(compactSince('14h')).toBe('14h');
  });
});

describe('the tile line fits, and never ends in an ellipsis', () => {
  it('keeps everything when everything fits', () => {
    expect(tileLine('9m', '4 oz', QUICK_LINE_BUDGET.bubble)).toBe('9m · 4 oz');
    expect(tileLine('Now', '4 oz', QUICK_LINE_BUDGET.bubble)).toBe('Now · 4 oz');
    expect(tileLine('13h 15m', '9m', QUICK_LINE_BUDGET.pebble)).toBe('13h 15m · 9m');
  });

  /**
   * A pebble's line is the elapsed and the detail; the count is the corner chip, on every shape,
   * because at 11px on a shared line it was the smallest type on the screen and a "120 ml"
   * bottle simply lost it (the owner, 2026-09-16).
   */
  it('keeps the pebble budget at the measured twelve', () => {
    expect(QUICK_LINE_BUDGET.pebble).toBe(12);
    for (const detail of ['4 oz', 'Both', '35m', 'Wet', '120 ml']) {
      const line = tileLine(undefined, detail, QUICK_LINE_BUDGET.pebble);
      expect(line, detail).toBe(detail);
      expect(len(line)).toBeLessThanOrEqual(QUICK_LINE_BUDGET.pebble);
    }
  });

  it('drops the elapsed’s minutes before it drops the detail — the owner’s two screenshots', () => {
    // a card clipped `14h 27m · Both`; a bubble clipped `13h 14m · 9m`
    expect(tileLine('14h 27m', 'Both', QUICK_LINE_BUDGET.pebble)).toBe('14h · Both');
    expect(tileLine('13h 14m', '9m', QUICK_LINE_BUDGET.bubble)).toBe('13h · 9m');
    expect(tileLine('14h 26m', 'Both', QUICK_LINE_BUDGET.bubble)).toBe('14h · Both');
  });

  /**
   * THE SPACES GO BEFORE A FACT DOES. In a monospace ` · ` is not spacing, it is two whole
   * characters of the twelve a pebble holds, and `3h 56m·Both` says both things where
   * `3h 56m` says one. The rung is the last one tried, so a tile with room keeps its spaces.
   */
  it('gives up the separator’s spaces before it gives up the detail', () => {
    expect(tileLine('3h 56m', 'Both', QUICK_LINE_BUDGET.pebble)).toBe('3h 56m·Both');
    expect(tileLine('58m', '1.5 oz', 11)).toBe('58m·1.5 oz');
    expect(tileLine('1h 1m', 'Both', 11)).toBe('1h 1m·Both');
    // and only then: at ten there is no arrangement that holds both, so the elapsed stands alone
    expect(tileLine('3h 56m', 'Both', 10)).toBe('3h 56m');
    // the capsule has room for the spaces, so it keeps them — and for "ago" (2026-09-25)
    expect(tileLine('3h 56m', '4 oz', QUICK_LINE_BUDGET.capsule)).toBe('3h 56m ago · 4 oz');
  });

  it('spends its room on the spaces first, never the tight form for its own sake', () => {
    for (const [since, detail] of [
      ['58m', '1.5 oz'],
      ['13h 15m', '9m'],
      ['9m', '4 oz'],
    ] as const) {
      expect(tileLine(since, detail, 24)).toContain(' · ');
    }
  });

  it('drops the detail last, and only when the compact elapsed still does not fit', () => {
    expect(tileLine('14h 27m', 'a very long detail', QUICK_LINE_BUDGET.bubble)).toBe('14h');
    expect(tileLine(undefined, '4 oz', QUICK_LINE_BUDGET.bubble)).toBe('4 oz');
    expect(tileLine(undefined, undefined, QUICK_LINE_BUDGET.bubble)).toBe('');
  });

  it('every real tile line fits its shape’s budget', () => {
    const sinces = [
      'Now',
      '9m',
      '59m',
      '1h',
      '3h 56m',
      '9h 59m',
      '13h 14m',
      '14h 27m',
      '25h',
      '3d',
      'running',
    ];
    const details = ['4 oz', 'Both', '1h 35m', '9m', '17m', 'Wet', '3.6 oz'];
    for (const [shape, budget] of Object.entries(QUICK_LINE_BUDGET)) {
      for (const since of sinces) {
        for (const detail of details) {
          const line = tileLine(since, detail, budget);
          expect(len(line), `${shape}: ${line}`).toBeLessThanOrEqual(budget);
        }
      }
    }
  });

  it('an alert’s short form fits the narrowest tile there is', () => {
    for (const why of ['not logged', 'due now', 'over 4h', 'over 45m']) {
      expect(len(tileLine(why, undefined, QUICK_LINE_BUDGET.bubble))).toBeLessThanOrEqual(
        QUICK_LINE_BUDGET.bubble,
      );
    }
  });
});

describe('an alert says as much as the tile can hold', () => {
  it('keeps the whole sentence where there is room, and the short form where there is not', () => {
    expect(tileAlert('not logged', undefined, QUICK_LINE_BUDGET.pebble)).toBe('Not logged');
    expect(tileAlert('due now', undefined, QUICK_LINE_BUDGET.bubble)).toBe('Due now');
    expect(tileAlert('2h 30m since the last feed', 'over 2h', QUICK_LINE_BUDGET.pebble)).toBe(
      'Over 2h',
    );
    expect(tileAlert('nothing logged in 1h 45m', 'over 1h', QUICK_LINE_BUDGET.bubble)).toBe(
      'Over 1h',
    );
    // a capsule is wide enough for the sentence itself
    expect(tileAlert('nothing logged in 1h 45m', 'over 1h', QUICK_LINE_BUDGET.capsule)).toBe(
      'Nothing logged in 1h 45m',
    );
  });
});

/**
 * THE LINE IS A LINE OF ITS OWN, so it starts with a capital — `Running`, `Due now`, `Add one`
 * (the owner, 2026-09-19: "'running' in lowercase … does not feel professional"). The words
 * themselves stay lowercase in `SCHEDULE` and in `quickAlertFor`, because several of them are
 * also joined INTO a line, and `firstUpper` is applied where the line is built rather than where
 * the word is written (core's `since.ts` says why at length).
 */
describe('a tile line starts with a capital, and only its first character', () => {
  it('capitalizes the word that starts the line', () => {
    expect(tileLine('running', undefined, QUICK_LINE_BUDGET.pebble)).toBe('Running');
    // the never-logged line fits the twelve-character tile whole; the bubble takes the one word
    expect(tileAlert('never logged', 'never', QUICK_LINE_BUDGET.pebble)).toBe('Never logged');
    expect(tileAlert('never logged', 'never', QUICK_LINE_BUDGET.bubble)).toBe('Never');
    expect(tileAlert('missed', 'missed', QUICK_LINE_BUDGET.pebble)).toBe('Missed');
  });

  it('leaves a word that sits mid-line alone, because the line starts elsewhere', () => {
    // the elapsed starts these lines, so "missed" and "due now" stay as they are
    expect(tileAlert('not logged', 'missed', QUICK_LINE_BUDGET.pebble, '14h 26m')).toBe(
      '14h · missed',
    );
    expect(tileAlert('due now', 'due now', QUICK_LINE_BUDGET.capsule, '1h 18m')).toBe(
      '1h 18m · due now',
    );
    expect(tileLine('Now', '4 oz', QUICK_LINE_BUDGET.bubble)).toBe('Now · 4 oz');
  });

  it('changes nothing else: not the width, not a name, not an empty line', () => {
    for (const [why, short] of [
      ['due now', 'due'],
      ['Vitamin D · missed', 'missed'],
      ['2h 30m since the last feed', '2h 30m'],
    ] as const) {
      for (const budget of Object.values(QUICK_LINE_BUDGET)) {
        expect(len(tileAlert(why, short, budget))).toBeLessThanOrEqual(budget);
      }
    }
    // a proper noun is already capital and a line that starts with a number is untouched
    expect(tileAlert('Vitamin D · missed', 'missed', QUICK_LINE_BUDGET.capsule)).toBe(
      'Vitamin D · missed',
    );
    // an elapsed standing alone says what it is, where it fits (2026-09-25)
    expect(tileLine('14h 27m', undefined, QUICK_LINE_BUDGET.pebble)).toBe('14h 27m ago');
    expect(tileLine(undefined, undefined, QUICK_LINE_BUDGET.bubble)).toBe('');
  });
});

/**
 * An alert keeps the elapsed (the owner, 2026-09-16). The colour and the word say the state; the
 * number says the fact, and a tile that drops the fact the moment it turns amber has thrown away
 * what the parent came to read.
 */
describe('tileAlert keeps the elapsed on the line', () => {
  it('shows both where both fit', () => {
    expect(tileAlert('due now', 'due now', QUICK_LINE_BUDGET.capsule, '1h 18m')).toBe(
      '1h 18m · due now',
    );
  });

  it('gives up the long form, then the elapsed’s minutes, before either fact', () => {
    // a pebble holds 12: `1h 18m · due now` is 16, `1h 18m · due` is 12
    expect(tileAlert('due now', 'due', QUICK_LINE_BUDGET.pebble, '1h 18m')).toBe('1h 18m · due');
    // and past ten hours the minutes go, so the word still fits beside the hour
    expect(tileAlert('not logged', 'missed', QUICK_LINE_BUDGET.pebble, '14h 26m')).toBe(
      '14h · missed',
    );
    for (const line of [
      tileAlert('due now', 'due', QUICK_LINE_BUDGET.pebble, '1h 18m'),
      tileAlert('not logged', 'missed', QUICK_LINE_BUDGET.pebble, '14h 26m'),
    ]) {
      expect(len(line)).toBeLessThanOrEqual(QUICK_LINE_BUDGET.pebble);
    }
  });

  it('gives up the separator’s spaces before the elapsed itself', () => {
    // ten characters: `14h · missed` is twelve and `14h·missed` is ten, so the hour survives
    expect(tileAlert('not logged', 'missed', 10, '14h 26m')).toBe('14h·missed');
    // and `1h · due` is eight, so at nine it keeps its spaces and only gives them up at seven
    expect(tileAlert('due now', 'due', 9, '1h 18m')).toBe('1h · due');
    expect(tileAlert('due now', 'due', 7, '1h 18m')).toBe('1h·due');
  });

  it('prefers the alert’s short form to dropping the elapsed', () => {
    const line = tileAlert('Vitamin D · missed', 'missed', QUICK_LINE_BUDGET.pebble, '4h 30m');
    expect(line).toContain('4h');
    expect(line).toContain('missed');
    expect(len(line)).toBeLessThanOrEqual(QUICK_LINE_BUDGET.pebble);
  });

  it('shows the alert alone when nothing has been logged yet', () => {
    expect(tileAlert('not logged', 'not logged', QUICK_LINE_BUDGET.pebble)).toBe('Not logged');
    expect(tileAlert('not logged', 'not logged', QUICK_LINE_BUDGET.pebble, '')).toBe('Not logged');
  });

  it('never ends in an ellipsis, at any budget, for every real pairing', () => {
    const whys = ['due now', 'not logged', 'Vitamin D · missed', '2h 30m since the last feed'];
    const shorts = ['due', 'missed', '2h 30m', '3 days'];
    const sinces = [undefined, '', 'Now', '9m', '1h 18m', '14h 27m', '3 days'];
    for (const budget of Object.values(QUICK_LINE_BUDGET)) {
      for (const why of whys) {
        for (const short of shorts) {
          for (const since of sinces) {
            const line = tileAlert(why, short, budget, since);
            expect(line).not.toContain('…');
            // the floor: a budget too small for even the short word still returns something
            expect(line.length).toBeGreaterThan(0);
          }
        }
      }
    }
  });
});

/**
 * THE ELAPSED SAID AS AN ELAPSED (the owner, 2026-09-25, of a tile reading `39m · 23m`: "when it
 * fit, last done time should say 39min ago - x min"). Two bare numbers leave a parent to work out
 * which is the time since and which is the length; "ago" says it.
 */
describe('a tile with room says "ago"', () => {
  it('spells the minutes where the whole line fits', () => {
    expect(tileLine('39m', '23m', QUICK_LINE_BUDGET.capsule)).toBe('39 min ago · 23 min');
    expect(tileLine('9m', '4 oz', QUICK_LINE_BUDGET.capsule)).toBe('9 min ago · 4 oz');
    expect(tileLine('2h 3m', '1h 35m', QUICK_LINE_BUDGET.capsule)).toBe('2h 3m ago · 1h 35m');
  });

  it('keeps "ago" in the short form before it gives it up, on a narrower tile', () => {
    expect(tileLine('39m', '23m', 13)).toBe('39m ago · 23m');
    expect(tileLine('39m', '23m', 11)).toBe('39m ago·23m');
    // and only then the bare line it always drew
    expect(tileLine('39m', '23m', 10)).toBe('39m · 23m');
  });

  it('never spells a word, a detail on its own, or an alert', () => {
    expect(tileLine('Now', '4 oz', QUICK_LINE_BUDGET.capsule)).toBe('Now · 4 oz');
    expect(tileLine('running', undefined, QUICK_LINE_BUDGET.capsule)).toBe('Running');
    expect(tileLine(undefined, '35m', QUICK_LINE_BUDGET.capsule)).toBe('35m');
    expect(tileAlert('2h 30m since the last feed', '2h 30m', 10)).toBe('2h 30m');
    expect(tileAlert('due now', 'due now', QUICK_LINE_BUDGET.capsule, '1h 18m')).toBe(
      '1h 18m · due now',
    );
  });

  it('holds every line it draws to the budget', () => {
    for (const [since, detail] of [
      ['39m', '23m'],
      ['2h 3m', '4 oz'],
      ['14h 27m', 'Both'],
    ] as const) {
      for (const budget of [9, 10, 11, 12, 13, 16, 24]) {
        expect(
          len(tileLine(since, detail, budget)),
          `${since} ${detail} @${budget}`,
        ).toBeLessThanOrEqual(Math.max(budget, len(since)));
      }
    }
  });
});

/**
 * AN ALERT STANDS BESIDE THE TILE'S OWN ELAPSED, and the tile takes no other (the owner,
 * 2026-09-27: "i updated breastfeed, but it still updated bottle too last activity as well"). The
 * tile once took a second elapsed for its alert line — the last feed of either kind — and a
 * breastfeed turned a Bottle tile that had never had a bottle into "Now · never logged".
 */
describe('QuickAction.tsx has one elapsed per tile (tripwire)', () => {
  const component = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'QuickAction.tsx'),
    'utf8',
  )
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

  it('takes no elapsed but its own, and draws every alert line beside it', () => {
    expect(component).not.toContain('alertSinceLabel');
    const alerts = component.split('tileAlert(').length - 1;
    expect(alerts).toBeGreaterThan(0);
    expect(component.split("sinceLabel === 'running' ? undefined : sinceLabel").length - 1).toBe(
      alerts,
    );
  });

  it('reads "Never logged" alone on a tile with nothing of its own', () => {
    expect(tileAlert('never logged', 'never', QUICK_LINE_BUDGET.capsule, undefined)).toBe(
      'Never logged',
    );
  });
});
