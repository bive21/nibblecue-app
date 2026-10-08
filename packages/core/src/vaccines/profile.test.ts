/**
 * The profile as data (docs/VACCINES.md §2): the pin-to-profile mapping is the same on the
 * device, in the worker and in SQL; a mirrored row reads back as the file; a broken row is
 * nothing rather than half a schedule.
 */
import { HAS_SERVER_MIGRATIONS, serverMigration } from '../testing/serverMigrations';
import { describe, expect, it } from 'vitest';
import {
  profileFromRow,
  resolveVaccineProfile,
  VACCINE_PROFILE,
  VACCINE_PROFILE_FOR,
  vaccineProfileIdFor,
  type VaccineProfileRow,
} from './profile';

const rowOf = (over: Partial<VaccineProfileRow> = {}): VaccineProfileRow => ({
  profile: 'CDC_CHILD_US',
  version: '2026_09',
  effective_date: '2026-09-01',
  source: VACCINE_PROFILE.source,
  source_url: VACCINE_PROFILE.sourceUrl,
  disclaimer: VACCINE_PROFILE.disclaimer,
  coverage: VACCINE_PROFILE.coverage,
  vaccines: JSON.stringify(VACCINE_PROFILE.vaccines),
  visits: JSON.stringify(VACCINE_PROFILE.visits),
  doses: JSON.stringify(
    VACCINE_PROFILE.doses.map(d => (d.id === 'hepb_1' ? { ...d, toMonths: 2 } : d)),
  ),
  ...over,
});

describe('the pin → immunisation profile mapping', () => {
  it.skipIf(!HAS_SERVER_MIGRATIONS)(
    'is the one app.vaccine_profile(h) applies in SQL (0004), entry for entry',
    () => {
      const sql = serverMigration('0004_guidance_profiles.sql');
      for (const [milk, vax] of Object.entries(VACCINE_PROFILE_FOR)) {
        // the generated migration dollar-quotes its strings
        expect(sql).toMatch(new RegExp(`when \\$g\\$${milk}\\$g\\$ then \\$g\\$${vax}\\$g\\$`));
      }
      expect(vaccineProfileIdFor('CDC_US')).toBe('CDC_CHILD_US');
      expect(vaccineProfileIdFor('NHS_UK')).toBeNull();
      expect(vaccineProfileIdFor(null)).toBeNull();
    },
  );
});

describe('profileFromRow / resolveVaccineProfile', () => {
  it('reads a mirrored row back as the file, JSON text or parsed, with the bundled copy around it', () => {
    const p = profileFromRow(rowOf());
    expect(p?.version).toBe('2026_09');
    expect(p?.doses.find(d => d.id === 'hepb_1')?.toMonths).toBe(2);
    expect(p?.statusLabels).toEqual(VACCINE_PROFILE.statusLabels);
    expect(p?.reminders.offsetsDays).toEqual(VACCINE_PROFILE.reminders.offsetsDays);
    const parsed = profileFromRow(rowOf({ doses: VACCINE_PROFILE.doses }));
    expect(parsed?.doses).toHaveLength(VACCINE_PROFILE.doses.length);
  });

  it('a row that does not parse is null — never half a schedule', () => {
    expect(profileFromRow(rowOf({ doses: 'not json' }))).toBeNull();
    expect(profileFromRow(rowOf({ doses: JSON.stringify([{ id: 'x' }]) }))).toBeNull();
    expect(profileFromRow(rowOf({ effective_date: 'September' }))).toBeNull();
  });

  it('the pinned version this build ships wins; an unknown version falls to the mirror; no pin, nothing', () => {
    let asked = 0;
    const mirror = () => {
      asked += 1;
      return rowOf();
    };
    const bundled = resolveVaccineProfile(
      { guidance_profile: 'CDC_US', guidance_version: '2026_01' },
      mirror,
    );
    expect(bundled).toEqual(VACCINE_PROFILE);
    expect(asked).toBe(0);
    const mirrored = resolveVaccineProfile(
      { guidance_profile: 'CDC_US', guidance_version: '2026_09' },
      mirror,
    );
    expect(mirrored?.version).toBe('2026_09');
    expect(asked).toBe(1);
    expect(
      resolveVaccineProfile(
        { guidance_profile: 'CDC_US', guidance_version: '2027_01' },
        () => undefined,
      ),
    ).toBeNull();
    expect(
      resolveVaccineProfile({ guidance_profile: null, guidance_version: '2026_01' }, mirror),
    ).toBeNull();
    expect(
      resolveVaccineProfile({ guidance_profile: 'NHS_UK', guidance_version: '2026_01' }, mirror),
    ).toBeNull();
  });
});
