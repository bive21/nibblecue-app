/**
 * THE THERMOMETER'S COLORS — glass, a bore, a column of mercury, two printed scales and a tag
 * (`ThermometerToggle`, the temperature sheet's °F / °C drawn as a dual-scale thermometer; the
 * owner, 2026-09-26).
 *
 * THE COLUMN IS SILVER, BECAUSE MERCURY IS, AND BECAUSE IT MUST NOT BE RED. The column stands at
 * the parent's reading, and a red column beside a baby's temperature would be a picture of heat —
 * a fever said by a color instead of a word, exactly the interpretation CLAUDE.md §2 rules 1 and 3
 * forbid. So the column is a neutral slate in light, a pale silver in dark and the night palette's
 * own quiet ink in amber: no hue that means hot, cold, good or bad, and ONE color at every reading
 * — nothing here takes the reading as an input (`thermometerFor` takes only the theme).
 * `thermometer.test.ts` holds it to neutral.
 *
 * UNLIKE THE SKIES, IT FOLLOWS THE THEME. `sky.ts` keeps its pictures the same in light and dark
 * because the theme toggle is what changes the theme, and a sky drawn from the palette would
 * change palette half way through its own roll. Nothing about this control changes the theme, so
 * it may be painted for the page around it like any other control — and must be: a pale glass on
 * a dark sheet would be the brightest thing on it at 3 a.m. Only the rim is the theme's `line2`,
 * and the pair of radios beside the glass is the segmented control's own theme colors.
 *
 * WHAT IS MEASURED (`thermometer.test.ts`):
 *   - the NUMBERS on the glass are text, and both scales carry information — the quiet one is the
 *     other scale's reading of the same column — so `ink` AND `quiet` clear 4.5:1 on both stops of
 *     the glass; the tag's digits clear it on the tag;
 *   - the GRADUATIONS are the scale a column is read against (WCAG 1.4.11): 3:1 on the glass;
 *   - the TAG at the column's tip is outlined in the column's own body color (`tagEdge`), 3:1 on the
 *     tag and on the glass: it is the reading's end, carrying its number, and the eye reads it as
 *     part of the column. It was outlined in the graduations' gray until 2026-09-26, and on the
 *     owner's phone, with its digits cut to ellipses (`ThermometerToggle.tsx` says why), it read
 *     as a hollow white capsule with a dotted line in it — a thing of its own, after the column;
 *   - the COLUMN is what the reading is drawn as: 3:1 against the empty bore it stands in, and the
 *     bulb 3:1 against the glass round it.
 *
 * NIGHT (the amber theme) is built from the night palette's roles and nothing else, and draws no
 * highlight on the bulb: nothing glows at 3 a.m., and nothing moves (`thermometerStill`).
 */
import { themes, type ThemeName } from './theme';

export interface ThermometerPicture {
  /** The glass, top to bottom. */
  glass: readonly [string, string];
  /** The empty bore the column stands in. */
  bore: string;
  /** The mercury: the bulb's highlight, then the body the column and the bulb are drawn in. */
  mercury: readonly [string, string];
  /** The scale that is read — its numbers and its symbol — and the tag's digits. */
  ink: string;
  /** The other scale's numbers and symbol: the picture's `text2`, quieter and still read as text. */
  quiet: string;
  /** The graduations. */
  tick: string;
  /** The tag's ground: it covers the bore and the graduations it rides over. */
  tag: string;
  /** The tag's outline: the column's own body color, so the tag reads as the column's end. */
  tagEdge: string;
  /** Whether the bulb's highlight is drawn: false only in the amber theme. */
  highlight: boolean;
}

/** A cool glass on a light page, with a slate column: the whole picture close to gray. */
export const THERMOMETER_LIGHT: ThermometerPicture = {
  glass: ['#F4F7FA', '#E4EAF0'],
  bore: '#D3DBE4',
  mercury: ['#8C99A8', '#5B6878'],
  ink: '#1D2733',
  quiet: '#56616E',
  tick: '#77828F',
  tag: '#FFFFFF',
  tagEdge: '#5B6878',
  highlight: true,
};

/** A smoked glass on a dark page, with a pale silver column. */
export const THERMOMETER_DARK: ThermometerPicture = {
  glass: ['#26303A', '#1D252E'],
  bore: '#323E4A',
  mercury: ['#D6DEE7', '#AEB9C6'],
  ink: '#EEF3F7',
  quiet: '#A4AFBB',
  tick: '#7A8692',
  tag: '#161D24',
  tagEdge: '#AEB9C6',
  highlight: true,
};

const amber = themes.night;

/**
 * The amber theme's thermometer, from the night palette's roles only: its grounds for the glass,
 * its page for the bore and the tag, its quiet inks for the column and the graduations, and its
 * text and text2 for the two scales.
 */
export const THERMOMETER_AMBER: ThermometerPicture = {
  glass: [amber.surface3, amber.surface2],
  bore: amber.page,
  mercury: [amber.text2, amber.text3],
  ink: amber.text,
  quiet: amber.text2,
  tick: amber.text3,
  tag: amber.page,
  tagEdge: amber.text3,
  highlight: false,
};

/** The thermometer's colors for the theme being painted. */
export const thermometerFor = (theme: ThemeName): ThermometerPicture =>
  theme === 'night' ? THERMOMETER_AMBER : theme === 'dark' ? THERMOMETER_DARK : THERMOMETER_LIGHT;
