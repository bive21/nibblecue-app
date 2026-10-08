/**
 * How wide a Quick tile is, and how far one swipe moves the row. Pure, so it is tested in node
 * and shared by QuickAction and QuickRow.
 *
 * The card-shaped half of this file — the 1.6 chrome cap, the height that grew with dynamic
 * type, the drop to two columns at 1.3 — went with the `cards` shape (the owner, 2026-09-16:
 * "remove cards module completely"). The three shapes that remain wrap their labels instead of
 * growing a fixed box, so there is nothing left to scale.
 */
/**
 * THE LOG ROW SCROLLS SIDEWAYS (the owner, 2026-09-16: "the log needs redesign since it's very
 * inconvenient, make it into a horizontal slider instead").
 *
 * It wrapped, then it paged behind an arrow, and neither was right. Wrapped, a household with
 * eight tiles got three rows of Log before anything else on Today; paged, reaching the eighth
 * was two taps on a chevron nobody expects to be a pager. A thumb already knows how to push a
 * row sideways, and the tile half-off the right edge says there are more without a control.
 *
 * `tileWidth` is what makes it read as a row rather than a carousel: the tiles are sized so
 * exactly `per` of them fit the width the row was given, so the first screen is the same grid
 * it always was and the rest is simply further along. Pure, because "how wide is a tile" is
 * arithmetic and a phone is a poor place to check it.
 */
export const tileWidth = (rowWidth: number, per: number, gap: number): number => {
  if (per <= 0) return 0;
  // THE PEEK IS THE AFFORDANCE (the owner, 2026-09-16: "add something that user will know that
  // it is slidable"). Three tiles that fit EXACTLY leave a row that looks complete and still,
  // and nothing on a phone says "push me" like the edge of the next thing. So the tiles are
  // sized for `per + PEEK` of them: three whole ones and a slice of the fourth, which is the
  // same cue a magazine rack gives. It costs each tile about a tenth of its width.
  return Math.max(0, (rowWidth - gap * per) / (per + TILE_PEEK));
};

/** How much of the next tile shows past the edge — enough to read as a tile, not as a sliver. */
export const TILE_PEEK = 0.22;

/** What one swipe moves: a tile and the gap after it, so a tile never stops half-shown. */
export const tileStride = (rowWidth: number, per: number, gap: number): number =>
  tileWidth(rowWidth, per, gap) + gap;

/**
 * HOW MANY CHARACTERS A TILE'S LINE HOLDS, which is the question `quickLine.ts` used to answer
 * with a constant read off one screenshot of one phone.
 *
 * That number went stale the day the line moved into a pill (QuickAction.tsx, the owner's
 * mockup of 2026-09-19: "add a darker overlay … on the text 'running' or '9h missed'"). The
 * pill took `space.md` off each side of the line and nothing lowered the budget to match, so a
 * pebble kept building twelve-character lines into eleven characters of room — `58m · 1.5…`
 * and `1h 1m · B…`, the ellipsis this whole mechanism exists to prevent. The arithmetic, with
 * the reference phone's numbers:
 *
 *   390pt screen − 2×18 gutter = 354 content · +2×4 the grid's negative margin = 362
 *   ÷ 3 columns = 120.67 · − 2×4 cell padding      = 112.67  the tile
 *   − 2×6 the pebble's own padding                 = 100.67  inside the card
 *   − 2×8 the pill's padding                       =  84.67  for the words
 *   `58m · 1.5 oz` in IBM Plex Mono at 12          =  86.40   ← 1.7pt too wide
 *
 * So the budget is measured now, not remembered: the tile reports its width, this says how many
 * characters fit it, and a narrow phone, a wide one and a font scale all get an honest answer.
 * The constants in `QUICK_LINE_BUDGET` stay as the value for the first frame, before layout.
 *
 * The advances are the faces' own, read out of the TTFs the app ships (apps/mobile fonts.ts):
 * IBM Plex Mono is a monospace, so 0.600 em a glyph is exact and can never be wrong. Hanken
 * Grotesk Bold is proportional, and 0.53 is the bound over the LINES an alert can be, not over
 * its widest glyph — the lines that are long enough for the bound to bite run 0.472
 * ("14h · missed"), 0.488 ("1h 18m · due") and 0.500 ("Never logged"), while the ones that are
 * denser are short enough that no budget reaches them ("Due now" is 0.561 over seven
 * characters, half a pebble's line).
 *
 * Bounding the glyph instead of the line is what "Never logged" cannot afford: at 0.58 it is
 * charged 83pt for a line the face sets in 72, so on a 360pt phone it would be shortened to
 * "Never" on a tile with five points to spare. The one string that can beat the bound is a
 * care item a caregiver NAMED — `MWM · missed` and the like — and two things already stand
 * behind it: the ladder shortens a name that does not fit to its fixed short word long before
 * the width matters, and `numberOfLines={1}` is still on the line as the last resort it has
 * always been.
 */
export const ADVANCE = { mono: 0.6, ui: 0.53 } as const;
export type TileFace = keyof typeof ADVANCE;

/**
 * THE MONO LINE IS TRACKED IN, and this is the "unnecessarily long spacing" the owner saw
 * (2026-09-19). A monospace sets `58m · 1.5 oz` on twelve identical 0.6 em cells, so the
 * narrow glyphs — the middot, the space, `1`, `.` — each carry a third of an em of air they
 * did not ask for, and the line reads as letter-spaced even though nothing spaced it. −0.3 at
 * 12px is 2.5% of the em: the digits still sit in their tabular column, the line stops looking
 * stretched, and it buys back a character on a 360pt phone.
 *
 * The UI face is proportional and already fits its own words, so it is set at its natural
 * tracking; only the mono line takes this.
 */
export const TILE_TRACKING = -0.3;

/**
 * How many characters of `face` fit `width` points at `fontSize`, tracking included.
 *
 * React Native adds `letterSpacing` after every character, the last one included, so n
 * characters occupy n × (advance + tracking) — which is also why the tracking cannot simply be
 * folded into the advance by the caller.
 */
export const lineBudget = (
  width: number,
  fontSize: number,
  face: TileFace = 'mono',
  tracking = 0,
): number => {
  const per = fontSize * ADVANCE[face] + tracking;
  if (!(width > 0) || per <= 0) return 0;
  return Math.max(1, Math.floor(width / per));
};
