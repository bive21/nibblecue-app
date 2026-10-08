/**
 * docs/VACCINES.md §11 `nextVisit.test.ts`: grouping by visit, the earliest window start
 * wins, a visit whose doses are all GIVEN / SKIPPED / DECLINED is skipped, a PLANNED visit
 * stays next and carries the earliest planned date, an untracked seasonal dose is ignored,
 * and the seasonal visit is never next.
 */
import { describe, expect, it } from 'vitest';
import { byVisit, nextVisit, openVisits, recordedCount, type DoseView } from './nextVisit';
import { VACCINE_PROFILE } from './profile';
import { doseStatus, isOpen, isTracked, type RecordLike } from './status';
import { doseWindow } from './window';

const BIRTH = '2026-03-04';

function views(
  today: string,
  records: Record<string, RecordLike>,
  tracking: ReadonlySet<string> = new Set(),
): DoseView[] {
  return VACCINE_PROFILE.doses.map(dose => {
    const window = doseWindow(BIRTH, dose);
    const record = records[dose.id] ?? null;
    const tracked = isTracked(dose, tracking);
    return { dose, record, window, status: doseStatus({ dose, record, window, today, tracked }) };
  });
}
const given: RecordLike = { status: 'GIVEN', occurred_on: '2026-03-05' };

describe('nextVisit', () => {
  it('a newborn: the birth visit, its one routine dose, open today', () => {
    const nv = nextVisit(VACCINE_PROFILE, views('2026-03-04', {}));
    expect(nv).toMatchObject({ key: 'birth', label: 'Birth', from: '2026-03-04', open: true });
    expect(nv?.doses.map(v => v.dose.id)).toEqual(['hepb_1']);
  });

  it('with the birth dose recorded, the 2 month visit with its five doses in profile order', () => {
    const nv = nextVisit(VACCINE_PROFILE, views('2026-03-10', { hepb_1: given }));
    expect(nv).toMatchObject({
      key: 'm2',
      label: '2 month visit',
      from: '2026-04-04',
      open: false,
    });
    expect(nv?.doses.map(v => v.dose.id)).toEqual([
      'hepb_2',
      'rv_1',
      'dtap_1',
      'hib_1',
      'pcv_1',
      'ipv_1',
    ]);
    expect(nv?.doses.length).toBe(6);
  });

  it('a visit whose doses are all GIVEN / SKIPPED / DECLINED is skipped; a planned dose keeps it', () => {
    const nv = nextVisit(
      VACCINE_PROFILE,
      views('2026-05-10', {
        hepb_1: given,
        hepb_2: { status: 'SKIPPED', occurred_on: null },
        rv_1: { status: 'DECLINED', occurred_on: null },
        dtap_1: given,
        hib_1: given,
        pcv_1: given,
        ipv_1: { status: 'PLANNED', occurred_on: '2026-05-20' },
      }),
    );
    // the last 2 month dose is planned, not given, so that visit is still next
    expect(nv).toMatchObject({ key: 'm2', plannedOn: '2026-05-20', open: false });
    expect(nv?.doses.map(v => v.dose.id)).toEqual(['ipv_1']);
    const m2 = nextVisit(
      VACCINE_PROFILE,
      views('2026-05-10', {
        hepb_1: given,
        ipv_1: { status: 'PLANNED', occurred_on: '2026-05-20' },
      }),
    );
    expect(m2).toMatchObject({ key: 'm2', plannedOn: '2026-05-20' });
    // doses with no record are the ones named; the planned one is the date beside them
    expect(m2?.doses.map(v => v.dose.id)).not.toContain('ipv_1');
  });

  /**
   * A plan is an appointment, so its date is normally AHEAD of today — which the date picker
   * refused until 2026-09-18. These pin that a future date changes nothing about the shape of
   * the answer: the visit is still ordered by its published window, its open doses are still
   * the ones with no record, and the date the parent chose is carried beside them for the
   * reminder planner and Today's card.
   */
  it('a planned date in the FUTURE is carried, and orders nothing', () => {
    const nv = nextVisit(
      VACCINE_PROFILE,
      views('2026-05-10', {
        hepb_1: given,
        ipv_1: { status: 'PLANNED', occurred_on: '2026-06-20' },
      }),
    );
    expect(nv).toMatchObject({
      key: 'm2',
      // the window start, never the planned date: the visit sorts where the schedule puts it
      from: '2026-04-04',
      plannedOn: '2026-06-20',
      open: true,
    });
    expect(nv?.doses.map(v => v.dose.id)).not.toContain('ipv_1');
    // the listed doses are the open ones — a window's description, never a record
    expect(nv?.doses.every(v => isOpen(v.status))).toBe(true);
    // every visit the household still has something open in keeps its own `from`, never ''
    const all = openVisits(
      VACCINE_PROFILE,
      views('2026-05-10', { ipv_1: { status: 'PLANNED', occurred_on: '2030-01-01' } }),
    );
    expect(all.map(v => v.from)).toEqual([...all.map(v => v.from)].sort());
    expect(all.every(v => v.from !== '')).toBe(true);
  });

  /**
   * Planning every remaining dose used to take the visit out of this set, so Next visit
   * jumped to the one after it and the 14/2-day reminders went with it. The owner
   * (2026-10-04): planning means the visit is still not done. The visit stays, ordered by
   * its published window, and `plannedOn` is the earliest date the parent set.
   */
  it('a visit planned in full stays next, and the earliest planned date is on it', () => {
    const records: Record<string, RecordLike> = { hepb_1: given };
    for (const id of ['hepb_2', 'rv_1', 'dtap_1', 'hib_1', 'pcv_1', 'ipv_1']) {
      records[id] = { status: 'PLANNED', occurred_on: '2026-06-20' };
    }
    records['dtap_1'] = { status: 'PLANNED', occurred_on: '2026-06-01' };
    records['ipv_1'] = { status: 'PLANNED', occurred_on: '2026-07-01' };
    const nv = nextVisit(VACCINE_PROFILE, views('2026-05-10', records));
    expect(nv).toMatchObject({
      key: 'm2',
      label: '2 month visit',
      // the window start, never the appointment: a later plan must not hide this visit
      from: '2026-04-04',
      plannedOn: '2026-06-01',
      open: false,
    });
    expect(nv?.doses.map(v => v.dose.id)).toEqual([
      'hepb_2',
      'rv_1',
      'dtap_1',
      'hib_1',
      'pcv_1',
      'ipv_1',
    ]);
    expect(nv?.doses.every(v => v.status === 'PLANNED')).toBe(true);
    const keys = openVisits(VACCINE_PROFILE, views('2026-05-10', records)).map(v => v.key);
    expect(keys[0]).toBe('m2');
    expect(keys).toContain('m4');
  });

  /**
   * The owner's screen (2026-10-04): the 6 month doses are PLANNED for a date still ahead,
   * and Next visit was showing the 12 month visit. The planned visit stays, with that date.
   */
  it('the 6 month visit planned in full stays ahead of the 12 month visit', () => {
    const records: Record<string, RecordLike> = {};
    for (const d of VACCINE_PROFILE.doses) {
      if (d.type !== 'routine') continue;
      if (d.visit === 'm6') records[d.id] = { status: 'PLANNED', occurred_on: '2026-11-05' };
      else if (d.visit === 'birth' || d.visit === 'm2' || d.visit === 'm4') records[d.id] = given;
    }
    const nv = nextVisit(VACCINE_PROFILE, views('2026-10-04', records));
    expect(nv).toMatchObject({
      key: 'm6',
      label: '6 month visit',
      from: '2026-09-04',
      plannedOn: '2026-11-05',
      open: false,
    });
    expect(nv?.doses.map(v => v.dose.id)).toEqual(['hepb_3', 'dtap_3', 'pcv_3', 'ipv_3']);
    expect(openVisits(VACCINE_PROFILE, views('2026-10-04', records)).map(v => v.key)[0]).toBe('m6');
  });

  it('an unrecorded dose past its window keeps its visit next — shown, never judged', () => {
    const nv = nextVisit(VACCINE_PROFILE, views('2026-08-01', {}));
    expect(nv?.key).toBe('birth');
    expect(nv?.doses[0]?.status).toBe('PAST_WINDOW');
    expect(nv?.open).toBe(true);
  });

  it('untracked seasonal doses are ignored, and the seasonal visit is never next even when on', () => {
    const everything: Record<string, RecordLike> = {};
    for (const d of VACCINE_PROFILE.doses) if (d.type === 'routine') everything[d.id] = given;
    expect(nextVisit(VACCINE_PROFILE, views('2030-01-01', everything))).toBeNull();
    expect(
      nextVisit(
        VACCINE_PROFILE,
        views('2030-01-01', everything, new Set(['flu_annual', 'covid_season'])),
      ),
    ).toBeNull();
    // a conditional dose turned on is an ordinary open dose of its visit
    const withRv3 = nextVisit(VACCINE_PROFILE, views('2030-01-01', everything, new Set(['rv_3'])));
    expect(withRv3?.key).toBe('m6');
  });

  it('the count is records among routine doses, and the by-visit list follows the profile', () => {
    const v = views('2026-05-10', { hepb_1: given, dtap_1: given });
    expect(recordedCount(v)).toEqual({ recorded: 2, total: 27 });
    const groups = byVisit(VACCINE_PROFILE, v);
    expect(groups.map(g => g.key)).toEqual([
      'birth',
      'm2',
      'm4',
      'm6',
      'm12',
      'm15',
      'm18',
      'y4_6',
      'annual',
    ]);
    expect(groups[1]?.doses.length).toBe(6);
  });
});
