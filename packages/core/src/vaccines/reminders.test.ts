/**
 * docs/VACCINES.md §9 and §11 (`I-vax-5`'s node half): one row per recipient per visit per
 * offset, 09:00 in the home zone, a planned date moves it, a recorded visit drops out, the
 * seasonal "visit" never reminds, nothing that has passed is sent late, and no payload names
 * a vaccine, a provider or a child.
 */
import { describe, expect, it } from 'vitest';
import { zonedToUtc } from '../today/day';
import { VACCINE_PROFILE } from './profile';
import { planVisitReminders, visitDeepLink, type VisitReminderInput } from './reminders';

const TZ = 'America/New_York';
const EMMA = 'cccccccc-0000-4000-8000-0000000000e1';
const LIAM = 'cccccccc-0000-4000-8000-0000000000e2';
const DANA = 'bbbbbbbb-0000-4000-8000-000000000001';
const BRAD = 'bbbbbbbb-0000-4000-8000-000000000002';
// Emma born 2026-03-04: the 2 month visit's earliest window opens 2026-05-04
const base = (over: Partial<VisitReminderInput> = {}): VisitReminderInput => ({
  profile: VACCINE_PROFILE,
  timeZone: TZ,
  nowMs: zonedToUtc(TZ, 2026, 4, 1, 12),
  children: [{ id: EMMA, birth_date: '2026-03-04' }],
  records: [
    { child_id: EMMA, dose_id: 'hepb_1', status: 'GIVEN', occurred_on: '2026-03-05' },
    { child_id: EMMA, dose_id: 'hepb_2', status: 'GIVEN', occurred_on: '2026-04-06' },
  ],
  tracking: [],
  recipients: [DANA, BRAD],
  deepLinkFor: id => `x://vaccines?child=${id}`,
  ...over,
});
const forVisit = (rows: ReturnType<typeof planVisitReminders>, key: string) =>
  rows.filter(r => r.visit_key === key);

describe('planVisitReminders', () => {
  it('the 2 month visit: two recipients × two offsets, at 09:00 home time, 14 and 2 days before May 4', () => {
    const rows = forVisit(planVisitReminders(base()), 'm2');
    expect(rows).toHaveLength(4);
    expect(new Set(rows.map(r => r.user_id))).toEqual(new Set([DANA, BRAD]));
    const dana = rows.filter(r => r.user_id === DANA).sort((a, b) => b.offset_days - a.offset_days);
    expect(dana.map(r => r.offset_days)).toEqual([14, 2]);
    expect(dana.map(r => r.fire_at)).toEqual([
      new Date(zonedToUtc(TZ, 2026, 4, 20, 9)).toISOString(),
      new Date(zonedToUtc(TZ, 2026, 5, 2, 9)).toISOString(),
    ]);
    // hepb_2 (1–2 months) belongs to the visit and is already recorded: five doses remain
    expect(dana[0]).toMatchObject({
      child_id: EMMA,
      visit_label: '2 month visit',
      dose_count: 5,
      deep_link: `x://vaccines?child=${EMMA}`,
    });
  });

  it('every visit with an open dose gets rows, not only the first; the seasonal visit never does', () => {
    const rows = planVisitReminders(
      base({ tracking: [{ child_id: EMMA, dose_id: 'flu_annual' }] }),
    );
    const keys = new Set(rows.map(r => r.visit_key));
    expect(keys.has('m2')).toBe(true);
    expect(keys.has('m4')).toBe(true);
    expect(keys.has('annual')).toBe(false);
    // the birth visit is fully recorded (hepb_1; rsv is off): no rows
    expect(keys.has('birth')).toBe(false);
  });

  it('a recorded visit is not in the set (the RPC then cancels its rows as satisfied)', () => {
    const rows = planVisitReminders(
      base({
        records: [
          ...base().records,
          ...['rv_1', 'dtap_1', 'hib_1', 'pcv_1', 'ipv_1'].map(dose_id => ({
            child_id: EMMA,
            dose_id,
            status: 'GIVEN' as const,
            occurred_on: '2026-05-06',
          })),
        ],
      }),
    );
    expect(forVisit(rows, 'm2')).toHaveLength(0);
    // a SKIPPED and a DECLINED dose close their slots too
    const rows2 = planVisitReminders(
      base({
        records: [
          ...base().records,
          { child_id: EMMA, dose_id: 'rv_1', status: 'SKIPPED', occurred_on: null },
          { child_id: EMMA, dose_id: 'dtap_1', status: 'DECLINED', occurred_on: null },
          { child_id: EMMA, dose_id: 'hib_1', status: 'GIVEN', occurred_on: '2026-05-06' },
          { child_id: EMMA, dose_id: 'pcv_1', status: 'GIVEN', occurred_on: '2026-05-06' },
          { child_id: EMMA, dose_id: 'ipv_1', status: 'GIVEN', occurred_on: '2026-05-06' },
        ],
      }),
    );
    expect(forVisit(rows2, 'm2')).toHaveLength(0);
  });

  it('a planned date moves the reminder with it, and the count names the doses still open', () => {
    const rows = planVisitReminders(
      base({
        records: [
          ...base().records,
          { child_id: EMMA, dose_id: 'rv_1', status: 'PLANNED', occurred_on: '2026-05-20' },
        ],
      }),
    );
    const dana = forVisit(rows, 'm2')
      .filter(r => r.user_id === DANA)
      .sort((a, b) => b.offset_days - a.offset_days);
    expect(dana.map(r => r.fire_at)).toEqual([
      new Date(zonedToUtc(TZ, 2026, 5, 6, 9)).toISOString(),
      new Date(zonedToUtc(TZ, 2026, 5, 18, 9)).toISOString(),
    ]);
    expect(dana[0]?.dose_count).toBe(4);
  });

  it('a visit planned in full still reminds, on the date the parent set', () => {
    const rows = planVisitReminders(
      base({
        records: [
          ...base().records,
          ...['rv_1', 'dtap_1', 'hib_1', 'pcv_1', 'ipv_1'].map(dose_id => ({
            child_id: EMMA,
            dose_id,
            status: 'PLANNED' as const,
            occurred_on: '2026-05-20',
          })),
        ],
      }),
    );
    const dana = forVisit(rows, 'm2')
      .filter(r => r.user_id === DANA)
      .sort((a, b) => b.offset_days - a.offset_days);
    expect(dana.map(r => r.offset_days)).toEqual([14, 2]);
    expect(dana.map(r => r.fire_at)).toEqual([
      new Date(zonedToUtc(TZ, 2026, 5, 6, 9)).toISOString(),
      new Date(zonedToUtc(TZ, 2026, 5, 18, 9)).toISOString(),
    ]);
    expect(dana[0]?.dose_count).toBe(5);
  });

  /**
   * The other half of the planned date (the owner, 2026-09-18: a plan is for a date that has
   * not happened). Once that date HAS happened it is a record of what the parent decided, not
   * the next appointment, and anchoring on it used to take the visit's rows away altogether:
   * both offsets land before `nowMs` and are skipped, so a visit with open doses and a stale
   * plan was reminded about by nobody. It falls back to the published window start instead,
   * which is §9's rule for a visit with no planned date — which is what this one now is.
   */
  it('a planned date that has already passed falls back to the published window start', () => {
    const rows = planVisitReminders(
      base({
        // now 2026-06-20; the 6 month visit's window opens 2026-09-04
        nowMs: zonedToUtc(TZ, 2026, 6, 20, 12),
        records: [
          ...base().records,
          { child_id: EMMA, dose_id: 'rv_3', status: 'PLANNED', occurred_on: '2026-06-01' },
        ],
        tracking: [{ child_id: EMMA, dose_id: 'rv_3' }],
      }),
    );
    const dana = forVisit(rows, 'm6')
      .filter(r => r.user_id === DANA)
      .sort((a, b) => b.offset_days - a.offset_days);
    expect(dana.map(r => r.offset_days)).toEqual([14, 2]);
    expect(dana.map(r => r.fire_at)).toEqual([
      new Date(zonedToUtc(TZ, 2026, 8, 21, 9)).toISOString(),
      new Date(zonedToUtc(TZ, 2026, 9, 2, 9)).toISOString(),
    ]);
    // …while a date still ahead of today keeps the reminder on it
    const ahead = planVisitReminders(
      base({
        nowMs: zonedToUtc(TZ, 2026, 6, 20, 12),
        records: [
          ...base().records,
          { child_id: EMMA, dose_id: 'rv_3', status: 'PLANNED', occurred_on: '2026-09-25' },
        ],
        tracking: [{ child_id: EMMA, dose_id: 'rv_3' }],
      }),
    );
    expect(
      forVisit(ahead, 'm6')
        .filter(r => r.user_id === DANA)
        .map(r => r.fire_at)
        .sort(),
    ).toEqual(
      [
        new Date(zonedToUtc(TZ, 2026, 9, 11, 9)).toISOString(),
        new Date(zonedToUtc(TZ, 2026, 9, 23, 9)).toISOString(),
      ].sort(),
    );
  });

  it('a moment that has passed is never sent late: once inside the 2-day offset only the later row remains, and past the window none', () => {
    const inside = planVisitReminders(base({ nowMs: zonedToUtc(TZ, 2026, 4, 25, 12) }));
    expect(forVisit(inside, 'm2').map(r => r.offset_days)).toEqual([2, 2]);
    const past = planVisitReminders(base({ nowMs: zonedToUtc(TZ, 2026, 5, 10, 12) }));
    expect(forVisit(past, 'm2')).toHaveLength(0);
    // …while the 4 month visit (window from July 4) still has both
    expect(
      forVisit(past, 'm4')
        .map(r => r.offset_days)
        .sort(),
    ).toEqual([14, 14, 2, 2]);
  });

  it('two children are two sets of rows; no recipient means no rows; nothing names a vaccine or a provider', () => {
    const rows = planVisitReminders(
      base({
        children: [
          { id: EMMA, birth_date: '2026-03-04' },
          { id: LIAM, birth_date: '2026-03-04' },
        ],
        records: [
          ...base().records,
          { child_id: LIAM, dose_id: 'hepb_1', status: 'GIVEN', occurred_on: '2026-03-05' },
          { child_id: LIAM, dose_id: 'hepb_2', status: 'GIVEN', occurred_on: '2026-04-06' },
        ],
      }),
    );
    expect(forVisit(rows, 'm2').filter(r => r.child_id === LIAM)).toHaveLength(4);
    // …and a child with hepb_2 still open is reminded from THAT window, the visit's earliest
    const early = planVisitReminders(base({ records: [] }));
    expect(forVisit(early, 'm2').map(r => r.offset_days)).toEqual([2, 2]);
    expect(planVisitReminders(base({ recipients: [] }))).toEqual([]);
    const text = JSON.stringify(rows);
    for (const v of Object.values(VACCINE_PROFILE.vaccines)) {
      expect(text).not.toContain(v.name);
      expect(text).not.toContain(v.short);
    }
    expect(text).not.toMatch(/provider|Emma|Liam/);
  });

  it('fills the profile’s own link template', () => {
    expect(visitDeepLink(VACCINE_PROFILE.reminders.deepLink, 'app', EMMA)).toBe(
      `app://vaccines?child=${EMMA}`,
    );
  });
});
