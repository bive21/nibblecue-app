/**
 * docs/VACCINES.md §11 `copy.test.ts`: no banned phrase in any immunisation string, the
 * `PAST_WINDOW` chip never on a warn or crit token, no number followed by ml, every mention
 * of a pediatrician deferring to them — and the lint proved against sentences that break it.
 */
import { describe, expect, it } from 'vitest';
import {
  bannedHits,
  chipTone,
  defersToPediatrician,
  reminderBody,
  STATUS_TONE,
  statusLabel,
  VACCINE_BANNED,
  VACCINE_COPY,
  windowLine,
} from './copy';
import { correctedAgeLabel, correctedAgeLine } from './preterm';
import { doseById, doseLongName, doseShortName, VACCINE_PROFILE } from './profile';
import { doseWindow, monthsRange } from './window';

const fmt = (d: string) => d;
const strings = (): string[] => {
  const out: string[] = [];
  for (const v of Object.values(VACCINE_COPY)) {
    if (typeof v === 'string') out.push(v);
    else if (typeof v === 'function') {
      const f = v as (...a: never[]) => string;
      try {
        out.push((f as (...a: unknown[]) => string)('CDC_CHILD_US', '2026_01'));
        out.push((f as (...a: unknown[]) => string)(6, 9));
        out.push((f as (...a: unknown[]) => string)('2 month visit', 5));
        out.push((f as (...a: unknown[]) => string)('3 mo 1 w'));
        out.push((f as (...a: unknown[]) => string)(VACCINE_PROFILE));
      } catch {
        /* an arity mismatch is fine */
      }
    }
  }
  out.push(...Object.values(VACCINE_PROFILE.statusLabels));
  out.push(VACCINE_PROFILE.disclaimer, VACCINE_PROFILE.reminders.copyTemplate);
  out.push(reminderBody(VACCINE_PROFILE.reminders.copyTemplate, '2 month visit', 5));
  for (const d of VACCINE_PROFILE.doses) {
    out.push(windowLine(d, doseWindow('2026-03-04', d), fmt), monthsRange(d));
    out.push(doseShortName(VACCINE_PROFILE, d), doseLongName(VACCINE_PROFILE, d));
    if (d.note) out.push(d.note);
  }
  for (const v of Object.values(VACCINE_PROFILE.vaccines)) out.push(v.name, v.short, v.note ?? '');
  out.push(correctedAgeLine('2026-03-04', '2026-05-06', '2026-08-10') ?? '');
  return out.filter(s => s.length > 0);
};

describe('the vaccine copy', () => {
  it('scans a real number of sentences and none carries a banned phrase', () => {
    const all = strings();
    expect(all.length).toBeGreaterThan(120);
    for (const s of all) expect(bannedHits(s), s).toEqual([]);
  });

  it('every sentence that names a pediatrician defers to them', () => {
    for (const s of strings()) expect(defersToPediatrician(s), s).toBe(true);
  });

  /**
   * THE COLOR RULE, AS AMENDED BY THE OWNER ON 2026-09-26: red only in the week before a date
   * (`soon.ts`), a calm blue the rest of the time. So no status is warn or crit on its own — the
   * table is calm or neutral throughout, and `chipTone` is the one place crit comes from.
   */
  it('PAST_WINDOW is the neutral token; no status is warn or crit by itself', () => {
    expect(STATUS_TONE.PAST_WINDOW).toBe('neutral');
    expect(Object.values(STATUS_TONE)).not.toContain('warn');
    expect(Object.values(STATUS_TONE)).not.toContain('crit');
    // the open window, the plan and the window ahead are the calm blue
    expect([STATUS_TONE.DUE, STATUS_TONE.PLANNED, STATUS_TONE.UPCOMING]).toEqual([
      'info',
      'info',
      'info',
    ]);
  });

  it('red is only ever the SOON week, and never a closed window or a record', () => {
    const statuses = Object.keys(STATUS_TONE) as (keyof typeof STATUS_TONE)[];
    for (const s of statuses) expect(chipTone(s, false), s).not.toBe('crit');
    const red = statuses.filter(s => chipTone(s, true) === 'crit');
    expect(red.sort()).toEqual(['DUE', 'PLANNED', 'UPCOMING']);
    expect(chipTone('PAST_WINDOW', true)).toBe('neutral');
  });

  it('the red week says when in plain words, and nothing about lateness', () => {
    expect(VACCINE_COPY.soonChip(0)).toBe('Today');
    expect(VACCINE_COPY.soonChip(1)).toBe('Tomorrow');
    expect(VACCINE_COPY.soonChip(5)).toBe('In 5 days');
    expect(VACCINE_COPY.soonChip(7)).toBe('In 7 days');
    for (let d = 0; d <= 7; d++) expect(bannedHits(VACCINE_COPY.soonChip(d))).toEqual([]);
  });

  it('the exact strings of §1.1', () => {
    expect(VACCINE_COPY.header).toBe('Vaccines');
    expect(VACCINE_COPY.subtitle('CDC_CHILD_US', '2026_01')).toBe(
      'Published routine schedule · CDC_CHILD_US 2026_01',
    );
    expect(VACCINE_COPY.countsLine(6, 9)).toBe('6 of 9 recorded');
    expect(VACCINE_COPY.nextVisitLine('2 month visit', 5)).toBe(
      '2 month visit · 5 doses in the published schedule',
    );
    expect(VACCINE_COPY.parentAdded).toBe('Added by you, not in the published schedule');
    expect(VACCINE_COPY.empty).toBe(
      'Nothing recorded yet. Add what your pediatrician gave at each visit.',
    );
    const rv1 = doseById(VACCINE_PROFILE, 'rv_1');
    if (rv1 === undefined) throw new Error('rv_1');
    expect(windowLine(rv1, doseWindow('2026-03-04', rv1), d => d)).toBe(
      'Published window 2–3.5 months · 2026-05-04 – 2026-06-19',
    );
    const flu = doseById(VACCINE_PROFILE, 'flu_annual');
    if (flu === undefined) throw new Error('flu');
    expect(windowLine(flu, doseWindow('2026-03-04', flu), d => d)).toBe(
      'Published window from 6 months',
    );
    expect(VACCINE_COPY.footer(VACCINE_PROFILE)).toBe(
      'Published routine schedule CDC_CHILD_US 2026_01, effective 2026-01-15. CDC Child and Adolescent Immunization Schedule, United States. Records as entered by the household.',
    );
    expect(statusLabel(VACCINE_PROFILE, 'PLANNED', '2026-03-04', d => `Mar ${d.slice(-1)}`)).toBe(
      'Planned Mar 4',
    );
    expect(statusLabel(VACCINE_PROFILE, 'PAST_WINDOW', null, d => d)).toBe('Past published window');
    expect(reminderBody(VACCINE_PROFILE.reminders.copyTemplate, '2 month visit', 5)).toBe(
      '2 month visit is coming up: 5 doses in the published schedule. Check the plan with your pediatrician.',
    );
  });

  it('the corrected-age line appears only for a baby born two weeks or more early, and shifts nothing', () => {
    expect(correctedAgeLine('2026-03-04', null, '2026-08-10')).toBeNull();
    expect(correctedAgeLine('2026-03-04', '2026-03-14', '2026-08-10')).toBeNull();
    expect(correctedAgeLine('2026-03-04', '2026-05-06', '2026-08-10')).toBe(
      'This schedule uses age from birth, as published. Counting from the due date you gave, your baby is 3 mo 0 w.',
    );
    expect(correctedAgeLabel('2026-05-06', '2026-05-01')).toBe('0 w');
    expect(correctedAgeLabel('2026-05-06', '2026-06-10')).toBe('1 mo 0 w');
  });

  it('the lint is not vacuous', () => {
    expect(bannedHits('Your child is behind on the schedule')).toEqual(['behind']);
    expect(bannedHits('Too late for this dose')).toEqual(['late', 'too late']);
    expect(bannedHits('a dose of 0.5 ml')).toEqual(['dose of', 'mL']);
    expect(bannedHits('It is safe to wait')).toEqual(['safe']);
    expect(bannedHits('Later today')).toEqual([]);
    expect(bannedHits('We recommend a catch-up plan')).toEqual(['catch-up', 'we recommend']);
    expect(defersToPediatrician('Ask your pediatrician about the dose amount')).toBe(false);
    expect(defersToPediatrician("Your pediatrician's plan takes priority.")).toBe(true);
    expect(VACCINE_BANNED).toContain('up to date');
  });
});
