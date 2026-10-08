/**
 * Which schedule a household reads (docs/VACCINES.md §2.2): the bundled copy for the pinned
 * version this build ships, the mirrored row for one it does not, and nothing for a pin the
 * device has never seen.
 */
import { VACCINE_PROFILE } from '@nibblecue/core';
import { afterEach, describe, expect, it } from 'vitest';
import { HOUSEHOLD, seedHousehold } from '../testing/fixtures';
import { guidancePin, vaccineProfileFor } from './vaccineGuidance';

const restores: (() => void)[] = [];
afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

describe('vaccineProfileFor', () => {
  it('a household with no pin yet reads the server defaults, and so the bundled profile', async () => {
    const f = await seedHousehold();
    restores.push(f.restoreIds);
    expect(await guidancePin(f.db, HOUSEHOLD)).toEqual({
      guidance_profile: 'CDC_US',
      guidance_version: '2026_01',
    });
    expect(await vaccineProfileFor(f.db, HOUSEHOLD)).toEqual(VACCINE_PROFILE);
  });

  it('a pin this build does not ship falls to the mirrored row, and to nothing without one', async () => {
    const f = await seedHousehold();
    restores.push(f.restoreIds);
    await f.db.run(
      `update households set guidance_profile = 'CDC_US', guidance_version = '2026_09' where id = ?`,
      [HOUSEHOLD],
    );
    expect(await vaccineProfileFor(f.db, HOUSEHOLD)).toBeNull();
    await f.db.run(
      `insert into vaccine_guidance_profiles (profile, version, effective_date, source, source_url, disclaimer, coverage, vaccines, visits, doses, created_at)
       values ('CDC_CHILD_US', '2026_09', '2026-09-01', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        VACCINE_PROFILE.source,
        VACCINE_PROFILE.sourceUrl,
        VACCINE_PROFILE.disclaimer,
        VACCINE_PROFILE.coverage,
        JSON.stringify(VACCINE_PROFILE.vaccines),
        JSON.stringify(VACCINE_PROFILE.visits),
        JSON.stringify(
          VACCINE_PROFILE.doses.map(d => (d.id === 'hepb_1' ? { ...d, toMonths: 2 } : d)),
        ),
        '2026-09-01T00:00:00.000Z',
      ],
    );
    const p = await vaccineProfileFor(f.db, HOUSEHOLD);
    expect(p?.version).toBe('2026_09');
    expect(p?.doses.find(d => d.id === 'hepb_1')?.toMonths).toBe(2);
    expect(p?.reminders).toEqual(VACCINE_PROFILE.reminders);
    // a region this build has no mapping for is nothing, never a guess
    await f.db.run(`update households set guidance_profile = 'NHS_UK' where id = ?`, [HOUSEHOLD]);
    expect(await vaccineProfileFor(f.db, HOUSEHOLD)).toBeNull();
  });
});
