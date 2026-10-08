/**
 * docs/VACCINES.md §10: the export rows are what was entered and the published window — no
 * summary, no count of anything missing, no interpretation — with the profile footer.
 */
import { describe, expect, it } from 'vitest';
import { bannedHits } from './copy';
import { exportFooter, exportRows } from './export';
import type { DoseView } from './nextVisit';
import { doseById, VACCINE_PROFILE } from './profile';
import { doseStatus } from './status';
import { doseWindow } from './window';

const view = (
  id: string,
  record: DoseView['record'],
  today = '2026-05-10',
): DoseView & { fields: null } => {
  const dose = doseById(VACCINE_PROFILE, id);
  if (dose === undefined) throw new Error(id);
  const window = doseWindow('2026-03-04', dose);
  return {
    dose,
    record,
    window,
    status: doseStatus({ dose, record, window, today, tracked: true }),
    fields: null,
  };
};

describe('exportRows', () => {
  it('one row per scheduled dose with what was entered, and the parent-added rows apart', () => {
    const { scheduled, parentAdded } = exportRows(
      VACCINE_PROFILE,
      [
        {
          ...view('hepb_1', { status: 'GIVEN', occurred_on: '2026-03-05' }),
          fields: { provider: 'Riverside Pediatrics', site: 'left thigh', lot: 'A1' },
        },
        view('dtap_1', null),
      ],
      [
        {
          custom_name: 'Travel vaccine',
          status: 'GIVEN',
          occurred_on: '2026-04-01',
          provider: null,
          site: null,
          lot: null,
        },
      ],
      d => d,
    );
    expect(scheduled).toEqual([
      {
        vaccine: 'Hepatitis B',
        dose: '1',
        dateGiven: '2026-03-05',
        provider: 'Riverside Pediatrics',
        site: 'left thigh',
        lot: 'A1',
        status: 'Given',
        window: 'Published window birth–1 month · 2026-03-04 – 2026-04-04',
      },
      {
        vaccine: 'Diphtheria, tetanus, pertussis',
        dose: '1',
        dateGiven: '',
        provider: '',
        site: '',
        lot: '',
        status: 'Due now',
        window: 'Published window 2–3 months · 2026-05-04 – 2026-06-04',
      },
    ]);
    expect(parentAdded).toEqual([
      {
        vaccine: 'Travel vaccine',
        dose: '',
        dateGiven: '2026-04-01',
        provider: '',
        site: '',
        lot: '',
        status: 'Given',
        window: 'Added by you, not in the published schedule',
      },
    ]);
    for (const r of [...scheduled, ...parentAdded])
      for (const v of Object.values(r)) expect(bannedHits(v)).toEqual([]);
    expect(exportFooter(VACCINE_PROFILE)).toContain('Records as entered by the household.');
  });
});
