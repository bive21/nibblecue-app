import { describe, expect, it } from 'vitest';
import { MILK_GUIDANCE, VACCINE_GUIDANCE } from './index';

/** The map's keys must be the file's own profile and version, so a lookup can never lie. */
describe('guidance profiles', () => {
  it('are keyed by the profile and version each file declares about itself', () => {
    for (const [profile, versions] of Object.entries(MILK_GUIDANCE)) {
      for (const [version, file] of Object.entries(versions)) {
        expect(file.profile).toBe(profile);
        expect(file.version).toBe(version);
      }
    }
    for (const [profile, versions] of Object.entries(VACCINE_GUIDANCE)) {
      for (const [version, file] of Object.entries(versions)) {
        expect(file.profile).toBe(profile);
        expect(file.version).toBe(version);
      }
    }
  });

  it('carry a source, a date and a disclaimer to show beside every window', () => {
    for (const file of [
      MILK_GUIDANCE.CDC_US['2026_01'],
      VACCINE_GUIDANCE.CDC_CHILD_US['2026_01'],
    ]) {
      expect(file.source.length).toBeGreaterThan(0);
      expect(file.sourceUrl).toMatch(/^https:\/\//);
      expect(file.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(file.disclaimer.length).toBeGreaterThan(0);
    }
  });

  it('keeps best-use and the guidance limit as two separate numbers (00-BRIEF.md rule 2)', () => {
    for (const [name, c] of Object.entries(MILK_GUIDANCE.CDC_US['2026_01'].conditions)) {
      expect(c.bestUseMinutes, `${name}.bestUseMinutes`).toBeGreaterThan(0);
      expect(c.guidanceLimitMinutes, `${name}.guidanceLimitMinutes`).toBeGreaterThanOrEqual(
        c.bestUseMinutes,
      );
    }
  });
});
