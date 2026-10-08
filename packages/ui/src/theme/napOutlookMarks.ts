/**
 * THE SLEEP OUTLOOK MARKS — a picture on the card, not a scheme color.
 *
 * The awake sun is yellow. Summary icons (next nap, wake-up, asleep now) sit on a solid
 * circular disc that stays lavender by day and dims at Night, so it stays distinct from the
 * inset's `accentSoft` wash (the owner, 2026-10-05: restore the tiles). Neither yellow nor
 * lavender follows the household accent: `accent2` would repaint the sun teal in Reef.
 *
 * They stay the same yellow and the same lavender in light and dark. Night keeps the yellow
 * and dims the disc so a light circle is not a lamp on the amber paper.
 */
import type { ThemeName } from './theme';

export interface NapOutlookMarks {
  /** The awake-now sun. Yellow in every theme, including Night. */
  sun: string;
  /** The solid circular tile behind each summary icon. */
  disc: string;
  /** The solid moon (and clock ink) drawn on that disc. */
  moon: string;
}

/**
 * Sampled from the Now and next reference (2026-10-04). The sun is the yellow in that
 * picture (`#FDB538`). The disc is its lavender (`#D4D7FD`). The moon is one step deeper
 * than the picture's `#4F74ED` so the crescent clears 3:1 on the disc (`napOutlookMarks.test.ts`).
 */
const DAY: NapOutlookMarks = {
  sun: '#FDB538',
  disc: '#D4D7FD',
  moon: '#456ADE',
};

/** The same sun. The disc is a purple that still reads on the amber ground, not a lamp. */
const NIGHT: NapOutlookMarks = {
  sun: '#FDB538',
  disc: '#6E64B4',
  moon: '#E6E2FF',
};

export function napOutlookMarks(theme: ThemeName): NapOutlookMarks {
  return theme === 'night' ? NIGHT : DAY;
}
