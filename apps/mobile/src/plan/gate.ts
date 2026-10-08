/**
 * What the plan surfaces say (docs/PRICING.md §6; docs/AUTH_AND_TRIAL.md §4, §6 A7;
 * docs/BRANDING.md §2 "Paywall"; docs/DESIGN_SYSTEM.md §9, §21). Pure, so the sentence a gate
 * opens with and the sentence the Plan page leads with can be tested for every gate in the
 * matrix and every plan status without a screen.
 *
 * The title is the tier name the app hands in (read from brand.json, never typed here), the
 * `why` line is the one written for THAT feature — never a generic "go Plus" — and the two
 * lists come from the plan matrix's own generators, so the Free column is the truthful list of
 * what every plan keeps and the Plus column can never carry a bill-of-rights item. No price,
 * no countdown, no scarcity: the store shows the price when it is on sale.
 *
 * Each list item is two things (the owner, 2026-09-27: the lists were *"very crowded with
 * text"*): the matrix's `short` name, which `PlanLists` draws in its grid, and the whole
 * sentence, which it hands a screen reader as the item's label — so the page got shorter and
 * nothing was taken out of what it says.
 *
 * Why every line passes through `asCopy`: the matrix and the token tables were written with a
 * typographic dash ("Night mode — the amber screen…") until 2026-09-30, and the app's copy rule
 * (§9) is that a parent at 3 a.m. never reads one. The tables say it in their own words now, and
 * `noDash.test.ts` holds them to it; this stays as the net under them, so a spaced dash that ever
 * came back would be drawn as the middle dot, the app's separator, on every surface at once.
 *
 * Why the Plan page's copy is written per status rather than "Plus" or "Free": §21 — an enum
 * value is not copy — and the truth differs by state. A subscription canceled at the store is
 * still Plus but will NOT renew; a store trial counts down; a billing retry is not a renewal.
 * "Renews through the store" is said only when it is true (CLAUDE.md rule 14: cancellation is
 * never obstructed, and never pretended away). Nothing here decides entitlement — `tier` and
 * `daysLeft` come from the snapshot the server computed — it only chooses words.
 */
import {
  FEATURES,
  freeFeatures,
  GATES,
  plusFeatures,
  type FeatureKey,
  type PlanSnapshot,
} from '@nibblecue/core';

/** A table line as copy: the typographic dash the matrix is written with becomes the app's middle dot. */
export const asCopy = (s: string): string => s.replace(/\s[—–-]\s/g, ' · ');

/** A feature in its two sizes: the grid's few words, and the sentence they stand for. */
export interface PlanWords {
  /** The matrix's `short`: what the plan lists' grid draws beside the glyph. */
  short: string;
  /** The whole line — `why ?? label` for Plus, `label` for Free — as the item's spoken label. */
  full: string;
}

/** One item of a plan list, as copy: which feature, and its words in both sizes. */
export interface PlanLine extends PlanWords {
  key: FeatureKey;
}

export interface GateCopy {
  /** The sheet's title: the tier name. */
  title: string;
  /** The reason line for the feature the parent walked into. */
  why: string;
  /** What the tier adds, from the matrix. */
  plus: PlanLine[];
  /** What every plan keeps, from the matrix — never a list of absences. */
  free: PlanLine[];
}

/**
 * The widgets line where the phone's widgets are the home screen's alone (Android: no lock-screen
 * widget; docs/WIDGETS.md §8). Since 2026-09-30 Android has the live timer too, a running timer in
 * the notification shade, counting (`notifications/liveTimers.ts`), so the line names it. Here and
 * not in `platform.ts` so a node test can read it: that file asks React Native which phone it is on.
 */
export const HOME_SCREEN_WIDGETS_WHY = 'Widgets on your home screen, and the live timer';

/**
 * And that line in both sizes, for the plan lists: the matrix's own short name, which is true on
 * this phone now, and the sentence that says where the widgets are.
 */
export const HOME_SCREEN_WIDGETS: PlanWords = {
  short: 'Widgets and live timer',
  full: HOME_SCREEN_WIDGETS_WHY,
};

/**
 * The two lists every plan surface shows, from the matrix, as copy: each item the feature's
 * `short` name and its whole sentence. `absent` is what this platform does not have
 * (`plan/platform.ts`): left out of what Plus adds, never sold. `worded` is what it has in another
 * shape — Android's widgets are the home screen's alone — and the words that say so, both sizes of
 * them, take the matrix's place.
 */
export function planLists(
  absent: readonly FeatureKey[] = [],
  worded: Readonly<Partial<Record<FeatureKey, PlanWords>>> = {},
): { plus: PlanLine[]; free: PlanLine[] } {
  const missing = new Set(absent);
  const item = (key: FeatureKey, full: string, own?: PlanWords): PlanLine => ({
    key,
    short: asCopy(own?.short ?? FEATURES[key].short),
    full: asCopy(own?.full ?? full),
  });
  return {
    // a feature this platform has in another shape keeps its place in the list, in its own words
    plus: plusFeatures()
      .filter(k => !missing.has(k))
      .map(k => item(k, FEATURES[k].why ?? FEATURES[k].label, worded[k])),
    free: freeFeatures().map(k => item(k, FEATURES[k].label)),
  };
}

export function gateCopy(
  feature: FeatureKey,
  plusName: string,
  absent: readonly FeatureKey[] = [],
  worded: Readonly<Partial<Record<FeatureKey, PlanWords>>> = {},
): GateCopy {
  const f = FEATURES[feature];
  return {
    title: plusName,
    why: asCopy(worded[feature]?.full ?? f.why ?? f.label),
    ...planLists(absent, worded),
  };
}

/**
 * THE QUIET "PLUS" TAG, in words and tone (2026-09-28): what a Plus surface wears while it is on only
 * because of the 14-day preview (`PlusTag`, `usePlusTag`). One word and the calm `info` tone, the
 * fixed cool hue badge-tone.ts keeps for a status that is simply there, so it can never be read as
 * a warning, a price or a countdown, and it is never a lock: the thing it sits on works. A design
 * system row that draws its own badge (`Row`, `Swatch`, `SkinTile`) is handed this same pair, so
 * every tag in the app says the same word in the same color.
 */
export const PREVIEW_TAG = { label: 'Plus', tone: 'info' } as const;

/**
 * A surface's spoken name with the tag in it, read where the eye reads it: "Nap outlook, Plus". A
 * tag the eye sees and a screen reader skips would tell two parents two different things.
 */
export const withPlusTag = (label: string, tagged: boolean): string =>
  tagged ? `${label}, ${PREVIEW_TAG.label}` : label;

/**
 * THE GATE SHEET FOR SOMEONE WHO DOES NOT DECIDE (2026-09-28). The plan is bought for the household
 * (migration 0101) by the owner or a parent; a caregiver or a view-only seat tapping a lock used to
 * meet the whole offer, prices and all, for a decision that is not theirs. They are told what the
 * feature is and what Plus holds, as anyone is, and this one plain line in place of the offer.
 */
export const gateNotYours = (plusName: string): string =>
  `${plusName} is chosen by a parent in your household.`;

/**
 * WHAT THE FREE PLAN KEEPS, AS A NUMBER, on the Plan page of a household on Free (2026-09-28): "Your
 * household has logged 1,234 entries since Sep 14. The app shows the last 7 days, and every entry is
 * in your download." The window hides entries from the screens, never from the download (the bill of
 * rights, `exportData`), and a parent deciding whether the window matters should hear both halves
 * at once, with the download one tap under it. The days are the matrix's `history` limit, handed in
 * and never typed; nothing is said about a household that has logged nothing.
 */
export function freeKeptLine(
  logged: number,
  since: string,
  freeHistoryDays: number,
): string | null {
  if (logged <= 0) return null;
  const entries = logged === 1 ? '1 entry' : `${logged.toLocaleString('en-US')} entries`;
  return (
    `Your household has logged ${entries} since ${since}. ` +
    `The app shows the last ${freeHistoryDays} days, and every entry is in your download.`
  );
}

/** The day of the household's first entry as the Plan page says it: "Sep 14", with the year once it is not this one. */
export function sinceLabel(firstMs: number, nowMs: number, timeZone?: string): string {
  const zone = timeZone ? { timeZone } : {};
  const year = (ms: number) =>
    new Intl.DateTimeFormat('en-US', { year: 'numeric', ...zone }).format(new Date(ms));
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(year(firstMs) === year(nowMs) ? {} : { year: 'numeric' }),
    ...zone,
  }).format(new Date(firstMs));
}

/** The feature behind a gated surface id (`GATES`), or null for a surface the matrix does not know. */
export function featureForSurface(surface: string): FeatureKey | null {
  return GATES.find(g => g.surface === surface)?.feature ?? null;
}

/**
 * The Plan page's status card. `kind` names the card for a test id, never for a person; the
 * number in a heading or a body is handed back separately so the screen can render it through
 * <Numeric> and put the words after it.
 */
export interface PlanStatusCopy {
  kind: 'welcome' | 'counting' | 'grace' | 'plus' | 'free';
  /** A leading day count for the heading, or null when the heading is words only. */
  headingDays: number | null;
  heading: string;
  /** A leading day count for the body, or null. */
  bodyDays: number | null;
  body: string;
}

const dayWord = (n: number): string => (n === 1 ? 'day' : 'days');

export function planStatusCopy(
  plan: Pick<PlanSnapshot, 'status' | 'tier' | 'daysLeft'>,
  plusName: string,
): PlanStatusCopy {
  if (plan.status === 'WELCOME') {
    const n = plan.daysLeft ?? 0;
    return {
      kind: 'welcome',
      headingDays: n,
      heading: ` ${dayWord(n)} of ${plusName} left`,
      bodyDays: null,
      body: 'No card, nothing to cancel. After that the free plan keeps working and nothing is deleted.',
    };
  }
  if (plan.tier === 'PLUS' && plan.daysLeft !== null) {
    // a store trial or a subscription canceled at the store: entitled, counting down, and
    // whether it continues is decided at the store — so "renews" is never promised here
    const n = plan.daysLeft;
    return {
      kind: 'counting',
      headingDays: null,
      heading: plusName,
      bodyDays: n,
      body: ` ${dayWord(n)} left in this period. What comes next is managed through the store, and nothing you logged is deleted either way.`,
    };
  }
  if (plan.tier === 'PLUS' && plan.status === 'GRACE') {
    return {
      kind: 'grace',
      headingDays: null,
      heading: plusName,
      bodyDays: null,
      body: 'The store could not take the last payment and is trying again. Nothing here changes while it does; a card is updated in the store, not here.',
    };
  }
  if (plan.tier === 'PLUS') {
    return {
      kind: 'plus',
      headingDays: null,
      heading: plusName,
      bodyDays: null,
      body: 'Renews through the store.',
    };
  }
  return {
    kind: 'free',
    headingDays: null,
    heading: 'Free plan',
    bodyDays: null,
    // "is kept", not "is here": the Plan page says under this line that the app shows the last few
    // days (`freeKeptLine`), and "everything is here" beside it would be the one untrue sentence
    body: 'Everything you logged is kept. Logging, reminders, the stash and the full download stay free.',
  };
}
