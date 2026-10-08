import milkCdcUs2026_01 from './milk-guidance.cdc_us.2026_01.json';
import vaccineCdcChildUs2026_01 from './vaccine-guidance.cdc_child_us.2026_01.json';

/**
 * Versioned published guidance (CLAUDE.md §2.5). Milk-storage windows and the routine
 * immunisation schedule come from these files, displayed with their source and date. A
 * household is pinned to a profile and a version (`households.guidance_profile`,
 * `guidance_version`); changing guidance means adding a new file here and bumping the
 * household, never editing a value in code or in an old version. WP6 and WP8 add the
 * loaders (`bestUseAt`, `limitAt`, the vaccine window maths) on top of this data.
 */
export type MilkGuidanceProfile = typeof milkCdcUs2026_01;

export const MILK_GUIDANCE = {
  CDC_US: { '2026_01': milkCdcUs2026_01 },
} as const;

export const VACCINE_GUIDANCE = {
  CDC_CHILD_US: { '2026_01': vaccineCdcChildUs2026_01 },
} as const;

/**
 * The published rhythms (`rhythm.ts` says at length why they are a file and not constants). The
 * third table under the same rule as the first two: quoted, versioned, and shown with its source
 * wherever a value from it appears — per rhythm, because more than one publisher is involved.
 */
export * from './rhythm';
