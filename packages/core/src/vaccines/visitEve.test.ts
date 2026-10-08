/**
 * THE DAY BEFORE A PLANNED VISIT (`visitEve.ts`, 2026-09-28): which planned visits get the phone's
 * own reminder, when it rings, what it says and where a tap on it goes. Held here: 09:00 the day
 * before on the phone's own clock (across a clock change too), nothing for a visit today or past,
 * one notification per day however many babies, the nearest few only, the week the summary row is
 * offered in, and words that pass every line the vaccine copy and the reminder copy hold.
 */
import { describe, expect, it } from 'vitest';
import { zonedToUtc } from '../today/day';
import { bannedHits, defersToPediatrician } from './copy';
import { addDays } from './date';
import { SOON_DAYS } from './soon';
import {
  planVisitEves,
  plannedVisitWithin,
  upcomingPlannedDates,
  VISIT_EVE_COPY,
  VISIT_EVE_LOCAL_TIME,
  VISIT_EVE_MAX,
  VISIT_SUMMARY_PATH,
  visitEveAt,
  visitSummaryPath,
  type PlannedVisitDay,
  type VisitEveInput,
} from './visitEve';

const TZ = 'America/New_York';
const EMMA = 'cccccccc-0000-4000-8000-0000000000e1';
const LIAM = 'cccccccc-0000-4000-8000-0000000000e2';
const TODAY = '2026-10-01';
/** A wall-clock instant in New York, October 2026. */
const at = (day: number, hh: number, mm = 0): number => zonedToUtc(TZ, 2026, 10, day, hh, mm);
const visit = (date: string, childId = EMMA, childName = 'Emma'): PlannedVisitDay => ({
  childId,
  childName,
  date,
});
const plan = (over: Partial<VisitEveInput> = {}) =>
  planVisitEves({
    visits: [visit('2026-10-03')],
    timeZone: TZ,
    nowMs: at(1, 12),
    summary: true,
    ...over,
  });

describe('which dates count', () => {
  it('keeps the planned dates from today on, earliest first, each once', () => {
    expect(
      upcomingPlannedDates(
        ['2026-10-09', '2026-10-01', '2026-09-30', null, undefined, 'soon', '2026-10-09'],
        TODAY,
      ),
    ).toEqual(['2026-10-01', '2026-10-09']);
  });

  it('offers the summary for the owner’s week: today to seven days ahead, both ends in', () => {
    expect(SOON_DAYS).toBe(7);
    expect(plannedVisitWithin([TODAY], TODAY)).toBe(TODAY);
    expect(plannedVisitWithin([addDays(TODAY, 7)], TODAY)).toBe(addDays(TODAY, 7));
    expect(plannedVisitWithin([addDays(TODAY, 8)], TODAY)).toBeNull();
    // a visit that has happened is a record, not an appointment
    expect(plannedVisitWithin([addDays(TODAY, -1)], TODAY)).toBeNull();
    // the nearest wins, whatever the order the records came in
    expect(plannedVisitWithin([addDays(TODAY, 6), addDays(TODAY, 2)], TODAY)).toBe(
      addDays(TODAY, 2),
    );
    expect(plannedVisitWithin([], TODAY)).toBeNull();
  });
});

describe('when it rings', () => {
  it('the day before the visit, at 09:00 on the phone’s own clock', () => {
    expect(VISIT_EVE_LOCAL_TIME).toBe('09:00');
    expect(visitEveAt('2026-10-03', TZ)).toBe(at(2, 9));
    const [eve] = plan();
    expect(eve).toMatchObject({ date: '2026-10-03', atMs: at(2, 9), dayStartMs: at(3, 0) });
    // the same visit read in another zone rings at that zone's 09:00, not New York's
    expect(visitEveAt('2026-10-03', 'Europe/Berlin')).toBe(
      zonedToUtc('Europe/Berlin', 2026, 10, 2, 9),
    );
  });

  it('keeps 09:00 across a clock change the night before', () => {
    // New York falls back at 2:00 AM on Sunday 2026-11-01: a Monday visit's day before is that Sunday
    expect(visitEveAt('2026-11-02', TZ)).toBe(zonedToUtc(TZ, 2026, 11, 1, 9));
    expect(visitEveAt('2026-11-02', TZ) - visitEveAt('2026-11-01', TZ)).toBe(25 * 3_600_000);
  });

  it('never for a visit today or one that has happened: their day before is gone', () => {
    expect(plan({ visits: [visit(TODAY)] })).toEqual([]);
    expect(plan({ visits: [visit('2026-09-20')] })).toEqual([]);
  });

  it('is still returned the day before, after 09:00, with its moment past — the plan decides', () => {
    // planned at noon for tomorrow: 09:00 this morning has gone. The plan keeps a rung reminder in
    // the shade and never schedules one that did not ring (it would ring at once).
    const [eve] = plan({ visits: [visit('2026-10-02')], nowMs: at(1, 12) });
    expect(eve?.atMs).toBe(at(1, 9));
    expect((eve?.atMs ?? Infinity) < at(1, 12)).toBe(true);
  });

  it('one notification a day, naming every baby planned for it, and the nearest few only', () => {
    const twins = plan({
      visits: [
        visit('2026-10-03'),
        visit('2026-10-03', LIAM, 'Liam'),
        // the same baby's two records on one day are one visit
        visit('2026-10-03'),
      ],
    });
    expect(twins).toHaveLength(1);
    expect(twins[0]?.childIds).toEqual([EMMA, LIAM]);
    expect(twins[0]?.title).toBe('Visit tomorrow for Emma and Liam');
    expect(twins[0]?.body).toBe('Your summaries are ready to show.');
    // the tap opens the first baby's summary; its sheet switches between them
    expect(twins[0]?.path).toBe(visitSummaryPath(EMMA));

    expect(VISIT_EVE_MAX).toBe(2);
    const many = plan({
      visits: ['2026-12-01', '2026-10-05', '2026-11-01', '2026-10-03'].map(d => visit(d)),
    });
    expect(many.map(e => e.date)).toEqual(['2026-10-03', '2026-10-05']);
  });
});

describe('what it says, and where a tap goes', () => {
  it('names the day and the baby, and says the summary is ready when the plan includes it', () => {
    const [eve] = plan();
    expect(eve).toMatchObject({
      opens: 'summary',
      title: 'Visit tomorrow for Emma',
      body: 'Your summary is ready to show.',
      path: `${VISIT_SUMMARY_PATH}?child=${EMMA}`,
    });
  });

  it('without the summary, says what the tap does open: the vaccine record', () => {
    const [eve] = plan({ summary: false });
    expect(eve).toMatchObject({ opens: 'record', body: 'The vaccine record is ready to show.' });
    // the same link: the app's deep-link table sends it to the Vaccines page on this plan
    expect(eve?.path).toBe(visitSummaryPath(EMMA));
  });

  it('a baby with no name yet is still a visit', () => {
    expect(VISIT_EVE_COPY.title([''])).toBe('Visit tomorrow');
    expect(VISIT_EVE_COPY.title(['Emma', 'Liam', 'Noah'])).toBe(
      'Visit tomorrow for Emma, Liam and Noah',
    );
  });

  /**
   * THE LINE (docs/VACCINES.md §1.2, and the owner's brief for this reminder): never a dose, never
   * "due", nothing the vaccine lint bans, no pediatrician sentence that does not defer to them, no
   * dash, and none of the words a reminder may not use (`notifications.test.ts`).
   */
  it('passes every line the vaccine copy and the reminder copy hold, in every variant', () => {
    const sentences = [
      ...[[], [''], ['Emma'], ['Emma', 'Liam'], ['Emma', 'Liam', 'Noah']].map(n =>
        VISIT_EVE_COPY.title(n),
      ),
      ...[1, 2, 3].flatMap(n => [VISIT_EVE_COPY.summary(n), VISIT_EVE_COPY.record(n)]),
    ];
    const REMINDER_BANNED =
      /\b(due|dose|doses|overdue|late|missed|should|must|need|needs|recommend|behind|shot)\b/i;
    for (const s of sentences) {
      expect(bannedHits(s), s).toEqual([]);
      expect(defersToPediatrician(s), s).toBe(true);
      expect(s, s).not.toMatch(REMINDER_BANNED);
      // no dash of any kind: a hyphen, an en dash, an em dash
      expect(s, s).not.toMatch(/[-–—]/);
      // sentence case: one capital to open, and none after it but a name
      expect(s[0], s).toBe(s[0]?.toUpperCase());
    }
    // the lint is not vacuous
    expect('Dose due tomorrow').toMatch(REMINDER_BANNED);
  });

  it('the path carries the child as a query the deep-link table reads, and nothing else', () => {
    expect(visitSummaryPath(EMMA)).toBe(`vaccines/summary?child=${EMMA}`);
    // a child id is data, never a way to add a parameter
    expect(visitSummaryPath('a&range=30d')).toBe('vaccines/summary?child=a%26range%3D30d');
  });
});
