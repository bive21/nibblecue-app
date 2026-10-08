/**
 * The manual breastfeed form's two rules, pure so each is a table test (the audit of 2026-09-24,
 * feeding C11 and C12). `BreastfeedSheet` draws the form; this decides what it writes — and the
 * line it opens with (`lastSessionHint`).
 */
import { agoLabel } from '@nibblecue/core';
import { manualBounds } from '../timerMath';

export type Side = 'LEFT' | 'RIGHT';

/**
 * THE LINE AT THE TOP OF THE SHEET (§6.2): `Last session started on the left · 3h 10m ago`, from
 * the last feed's own row — a fact for the parent to pick the next side by, never a side the app
 * picks for them.
 *
 * `agoLabel`, NOT `${sinceLabel(…)} ago` (the feeding sweep of 2026-09-24). The sheet built the
 * suffix itself, and under a minute `sinceLabel` says `Now`, so a feed started on the wrong side,
 * finished at once and started again read "Last session started on the left · Now ago" — the exact
 * sentence `agoLabel` was written to stop (`since.ts`). Past a minute nothing changes.
 */
export function lastSessionHint(
  last: { first_side: string | null; start_at: string },
  openedAtMs: number,
): string {
  const side = last.first_side === 'RIGHT' ? 'right' : last.first_side === 'LEFT' ? 'left' : null;
  const ago = agoLabel(Date.parse(last.start_at), openedAtMs);
  return side ? `Last session started on the ${side} · ${ago}` : `Last session · ${ago}`;
}

/**
 * THE SIDE A MANUAL FEED RECORDS AS FIRST (C12): the only side with minutes, or — both had
 * minutes — the side the parent picked, else none. It was "left" whenever the left had any
 * minutes, and the next sheet reads `first_side` back as "Last session started on the left",
 * which is what a parent picks the next side by. A side the parent did not say is not written.
 */
export function manualFirstSide(
  leftMin: number,
  rightMin: number,
  picked: Side | null,
): Side | null {
  if (leftMin > 0 && rightMin > 0) return picked;
  if (leftMin > 0) return 'LEFT';
  if (rightMin > 0) return 'RIGHT';
  return null;
}

export interface FeedEntryFields {
  quantity: number;
  detail: { first_side: Side; left_seconds: number; right_seconds: number };
}

/**
 * EACH TWIN'S OWN SIDE, AND ONLY FOR A TANDEM PAIR (C11). A tandem feed is one baby on each
 * breast, so the left baby gets the left minutes and the right baby the right. It was applied to
 * EVERY fan-out: with "All 3" there is no pair, no baby is `left`, and every one of them was
 * written with the right side's minutes — the left's were dropped. Without the pair there is no
 * per-child split, and each baby gets the feed as entered (undefined: the save's own fields).
 */
export function tandemPerChild(
  pair: { left: string | null; right: string | null } | null,
  leftMin: number,
  rightMin: number,
): ((childId: string) => FeedEntryFields) | undefined {
  if (pair === null) return undefined;
  return childId => {
    const onLeft = childId === pair.left;
    const mins = onLeft ? leftMin : rightMin;
    return {
      quantity: mins,
      detail: {
        first_side: onLeft ? 'LEFT' : 'RIGHT',
        left_seconds: onLeft ? mins * 60 : 0,
        right_seconds: onLeft ? 0 : mins * 60,
      },
    };
  };
}

export interface ManualFeedInput {
  /** When the feed ENDED — the time row's answer. */
  endMs: number;
  leftMin: number;
  rightMin: number;
  /** "Which side first?", or null when the parent did not say. */
  firstPicked: Side | null;
  /** The tandem pair — one baby on each side — or null for one baby (or for All n). */
  pair: { left: string | null; right: string | null } | null;
  /**
   * THE PAUSE A TIMED FEED HELD, in minutes — only when the sheet is correcting one (edit mode,
   * `sheets/quick/edit/forms.ts`). A feed timed with Pause spans longer than its two sides; the form
   * keeps that gap between its start and its end, so correcting a side moves the start by what the
   * side moved and the pause is not squeezed out of the entry. Absent, a feed spans its minutes.
   */
  pausedMinutes?: number;
}

export interface ManualFeed {
  startMs: number;
  endMs: number;
  /** Every minute at the breast, both sides: the entry's `quantity`, and the toast's total. */
  total: number;
  /** How long the entry spans, in minutes: what the line on the form says and the save writes. */
  spanMinutes: number;
  fields: {
    quantity: number;
    detail: { first_side: Side | null; left_seconds: number; right_seconds: number };
  };
  /** A tandem pair's split — each baby its own side (`tandemPerChild`); absent otherwise. */
  perChild?: (childId: string) => FeedEntryFields;
}

/** Why the manual form cannot be saved as it stands. */
export type ManualFeedBlock = 'no-minutes' | 'tandem-side-empty';

/**
 * WHETHER SAVE IS LIVE — the sheet's `saveDisabled`, as a rule (the owner, 2026-09-25: "logging
 * breastfeeding already finished, does not get recorded in activity log").
 *
 * Nothing at all is not a feed. And A TANDEM FEED WITH A SIDE LEFT AT NOUGHT IS NOT A TANDEM FEED:
 * a tandem is one baby on each breast, so an empty side is a baby who was not fed. It used to be
 * saved all the same — the baby on the empty side was written a feed of 0 minutes spanning the
 * whole session, which the Log reads by its span ("8:30 PM Breastfeed · 30m · right first", for a
 * baby who had nothing), while the baby who did feed had only the one side, never the feed the
 * parent had typed. It is refused now, with the reason on the form and one baby a tap away.
 */
export function manualFeedBlock(
  leftMin: number,
  rightMin: number,
  tandem: boolean,
): ManualFeedBlock | null {
  if (leftMin + rightMin <= 0) return 'no-minutes';
  if (tandem && (leftMin <= 0 || rightMin <= 0)) return 'tandem-side-empty';
  return null;
}

/**
 * WHAT A MANUAL FEED WRITES — the whole of the sheet's Save, pure, so the line on the form and the
 * entry it writes are one computation and each rule is a table test.
 */
export function manualFeed(input: ManualFeedInput): ManualFeed {
  const { endMs, leftMin, rightMin, firstPicked, pair } = input;
  const total = leftMin + rightMin;
  const spanMinutes =
    (pair ? Math.max(leftMin, rightMin) : total) + Math.max(0, input.pausedMinutes ?? 0);
  const perChild = tandemPerChild(pair, leftMin, rightMin);
  return {
    startMs: manualBounds(endMs, spanMinutes).startMs,
    endMs,
    total,
    spanMinutes,
    fields: {
      quantity: total,
      detail: {
        first_side: manualFirstSide(leftMin, rightMin, firstPicked),
        left_seconds: leftMin * 60,
        right_seconds: rightMin * 60,
      },
    },
    ...(perChild ? { perChild } : {}),
  };
}
