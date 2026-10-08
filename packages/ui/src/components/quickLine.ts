/**
 * A Quick tile's words, shortened rather than truncated (the owner, 2026-09-15, with the
 * phone in hand: "the dots dots cannot happen"). `14h 27m · Bo…` and `13h 14m · …` are worse
 * than nothing — the same rule the tile header already states for the count — so the line is
 * built to fit instead of being clipped by `numberOfLines`.
 *
 * What it gives up, in order: the count, then the MINUTES of an elapsed past an hour, then the
 * SPACES AROUND THE MIDDOT, then the detail. "14h" instead of "14h 27m" loses nothing a parent
 * acts on at fourteen hours, and `sinceLabel` already drops minutes past a day for that reason;
 * the full text stays in the tile's accessible name either way.
 *
 * THE SPACES ARE A RUNG OF THEIR OWN because in a monospace they are not spacing, they are two
 * whole characters: ` · ` is 3 of the 12 a pebble holds — a quarter of the line — where `·`
 * alone still draws with a third of an em of air on either side, because the middot sits
 * centered in its own 0.6 em cell. `58m·1.5 oz` is 10 characters and keeps BOTH facts; the rung
 * it replaced threw the detail away whole and left `58m`. It is the last thing tried before a
 * fact is lost, and only then — a tile with room sets the line with its spaces.
 *
 * The budget is MEASURED, from the width the tile reports (`quickScale.ts` `lineBudget`, which
 * has the arithmetic and the faces' own advances). The constants below are what a tile uses for
 * its first frame, before layout; they are the 390pt reference phone the design system measures
 * on — a pebble draws `13h 15m · 9m` whole there, a bubble (4 across) clipped `13h 14m · 9m`
 * after ten characters.
 *
 * THE COUNT IS NOT ON THIS LINE at all — it is the corner chip (QuickAction.tsx says why). The
 * `cards` shape was the last one that put it here, and it is gone.
 *
 * AND THE LINE CARRIES THE CAPITAL, because it is a whole line of its own: `Running`, `Due now`,
 * `Add one` (the owner, 2026-09-19: "'running' in lowercase … does not feel professional"). Only
 * the first character, and only where the line STARTS with the word — `9h · missed` and
 * `Now · 4 oz` are untouched, because there the elapsed is what starts the line. `firstUpper` in
 * core's `since.ts` says why the words themselves stay lowercase.
 */
import { compactSince, firstUpper } from '@nibblecue/core';
import type { QuickShape } from '../theme/appearance';

/**
 * `firstUpper` is re-exported here because this file is where a tile's line is decided, and the
 * app's other standalone-line render points reach for the same helper (core's `since.ts` says
 * why the words themselves stay lowercase).
 */
export { compactSince, firstUpper };

/** What separates a tile's two facts; the same middot the rest of the app joins with. */
export const TILE_SEP = ' · ';
/** The same separator with its spaces given up, for a line that would otherwise lose a fact. */
export const TILE_SEP_TIGHT = '·';

export const QUICK_LINE_BUDGET: Record<QuickShape, number> = {
  bubble: 10,
  pebble: 12,
  capsule: 24,
};

const width = (s: string): number => Array.from(s).length;

/**
 * `1h 18m` → `1h`, at ANY hour — more than `compactSince` gives up, and only on an alert line.
 * `compactSince` keeps the minutes under ten hours because there they are the whole point of a
 * line that carries nothing else; on an alert line they are competing with the word that says
 * what the colour means, and the hour alone still answers "how long ago".
 */
const hoursOnly = (s: string): string => s.replace(/^(\d+h)\s+\d+m$/, '$1');
const join = (...parts: (string | undefined)[]): string => parts.filter(Boolean).join(TILE_SEP);
const joinTight = (...parts: (string | undefined)[]): string =>
  parts.filter(Boolean).join(TILE_SEP_TIGHT);

/**
 * `9m · 4 oz` — how long ago, then what it was. Shortened to fit: the elapsed's minutes go
 * first, then the detail. The elapsed itself is never dropped; it is the tile's whole point.
 */
export function tileLine(
  since: string | undefined,
  detail: string | undefined,
  budget: number,
): string {
  return firstUpper(fitLine(since, detail, budget));
}

/**
 * The same line WITHOUT the capital, for the one caller that puts it mid-line: `tileAlert` joins
 * the elapsed and the alert word itself, and `9h · missed` keeps its lowercase "missed" because
 * the line starts with the duration.
 */
function fitLine(
  since: string | undefined,
  detail: string | undefined,
  budget: number,
  spell = true,
): string {
  const compact = compactSince(since ?? '');
  const ago = spelledSince(since, false);
  // only a line that starts with an elapsed is spelled: a word, or a detail standing alone, is
  // not — and an alert's own word never is (`fitAlert` asks for the bare ladder)
  const spells = spell && ago !== since;
  for (const line of [
    // the spelled line first, where the tile has room for it, then the same facts saying "ago"
    // in the short form — the word that tells the elapsed from a length — then the bare forms
    ...(spells
      ? [
          join(spelledSince(since, true), spelledDetail(detail)),
          join(ago, detail),
          joinTight(ago, detail),
        ]
      : []),
    join(since, detail),
    join(compact, detail),
    joinTight(compact, detail),
  ]) {
    if (width(line) <= budget) return line;
  }
  return compact;
}

/**
 * THE ELAPSED SAID AS AN ELAPSED (the owner, 2026-09-25, of a tile reading `39m · 23m`: "when it
 * fit, last done time should say 39min ago - x min"). Two bare numbers side by side leave a parent
 * to work out which is the time since and which is the length; "ago" says it. `spelled` writes the
 * minutes out (`39 min ago`), for a tile with room; otherwise the short form keeps its unit and
 * gains the word (`39m ago`, `2h 3m ago`). Anything that is not an elapsed — `Now`, `running`, an
 * alert's word handed through `fitLine` — is left exactly as it came.
 */
export function spelledSince(since: string | undefined, spelled: boolean): string | undefined {
  if (since === undefined || since === '') return since;
  const minutes = /^(\d+)m$/.exec(since);
  if (minutes) return spelled ? `${minutes[1]} min ago` : `${since} ago`;
  if (/^\d+[hd]( \d+m)?$/.test(since)) return `${since} ago`;
  return since;
}

/** `23m` → `23 min`, for the spelled line only; an amount, a kind or `1h 35m` is left as it is. */
export function spelledDetail(detail: string | undefined): string | undefined {
  if (detail === undefined || detail === '') return detail;
  const minutes = /^(\d+)m$/.exec(detail);
  return minutes ? `${minutes[1]} min` : detail;
}

/**
 * An alert's words, WITH THE ELAPSED STILL ON THE LINE: `1h 18m · due now`.
 *
 * The alert used to replace the elapsed outright, so the moment a bottle came due its tile
 * stopped saying when the last one was — exactly when a parent wants that number most (the
 * owner, 2026-09-16: "the brown and red border alert still doesn't show the time it was last
 * done … show the time since that's elapsed"). The colour and the word say the STATE; the
 * elapsed says the FACT, and losing the fact to make room for the state is the wrong trade.
 *
 * What it gives up, in order — the same order the ordinary line uses, so a tile never changes
 * shape for a reason a parent cannot see: the long form of the alert for its short one, then the
 * elapsed's MINUTES (`hoursOnly`, which goes further than `compactSince` because here the minutes
 * are competing with a word rather than standing alone), then the SPACES around the middot, then
 * the elapsed altogether. A tile with no elapsed yet (nothing logged) simply shows the alert, as
 * it always did.
 */
export function tileAlert(
  why: string,
  short: string | undefined,
  budget: number,
  since?: string,
): string {
  return firstUpper(fitAlert(why, short, budget, since));
}

function fitAlert(why: string, short: string | undefined, budget: number, since?: string): string {
  const word = short ?? why;
  if (since === undefined || since === '') {
    return width(why) <= budget ? why : fitLine(word, undefined, budget, false);
  }
  for (const line of [
    join(since, why),
    join(since, word),
    join(hoursOnly(since), word),
    joinTight(hoursOnly(since), word),
  ]) {
    if (width(line) <= budget) return line;
  }
  // the elapsed is the first thing on the line and the last thing to go: a state with no fact
  // behind it is what this function exists to avoid, but a clipped line is worse
  return width(word) <= budget ? word : compactSince(since);
}
