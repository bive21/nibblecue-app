/**
 * The appearance surfaces' option lists and their gate arithmetic (docs/DESIGN_SYSTEM.md §11
 * "Storage and application", §13, §14, §21, §23.1, §23.2; docs/PRICING.md §6; PRODUCT_SPEC
 * Addendum L4). Pure: the sheet renders these lists and asks `isLocked` before a tap, so what
 * is sold is decided in one place, and every label is readable by a test without React Native.
 *
 * Why the labels live here rather than on the enum: §21 — an enum value is not copy.
 * `system` reads "Match phone" and `rounded` reads "All labels"; the value still goes to
 * storage untouched. Why light and dark are never locked whatever the plan says: they are the
 * bill of rights (`baseThemes`, fixed) and `resolveAppearance` never takes them back either,
 * so a lock here would promise a gate that does not exist. Only night, the five non-default
 * schemes, the paid skin and, since 2026-10-01, the shapes but Pebble and the sideways log row
 * can be locked, and the resolver already paints the fallback for a stored choice the plan no
 * longer includes. (The sentence that said so in words, `tookBackNote`, was the appearance
 * popover's; it went with the popover on 2026-09-26.)
 *
 * Why the theme control is bound to `shownTheme` and not to the stored choice: a free
 * household whose stored theme is night (anyone who used it during the 14 days) is painted
 * dark. The sheet's sky toggle would rest its knob on Night — the amber picture over a screen
 * painted dark — covering the lock drawn beside the crescent, which is the one thing that says
 * Night is sold before the tap (docs/PRICING.md §6), and telling a screen reader Night is on when
 * it is not. (The segmented control the toggle replaced on 2026-09-25 had the sharper version of
 * this: it ignored a tap on its checked option, so a checked, locked Night could never open the
 * gate at all.) Binding to what is painted keeps the lock visible and reachable and the a11y
 * state true; the scheme and skin controls use `resolved.scheme` / `resolved.skin` for the same
 * reason. And since 2026-09-29 the same goes for the evening window: while automatic night mode
 * decides the look, the toggle rests on that look and is held (`themeHold`, at the foot).
 */
import { windowTimeOr, type FeatureKey } from '@nibblecue/core';
import {
  DEFAULT_SHAPE,
  FREE_APPEARANCE,
  parseAppearance,
  QUICK_SHAPES,
  SCHEME_NAMES,
  TAB_POLICIES,
  THEME_CHOICES,
  type AppearanceEntitlements,
  type AutoDarkMode,
  type AutoDarkTheme,
  type QuickShape,
  type ResolvedAppearance,
  type TabLabelPolicy,
  type ThemeChoice,
} from '@nibblecue/ui/appearance';
import { DEFAULT_SKIN, SKIN_NAMES, SKINS, type SkinName } from '@nibblecue/ui/skins';
import { DEFAULT_SCHEME, schemes, type SchemeName, type ThemeName } from '@nibblecue/ui/theme';
import { asCopy } from '../plan/gate';
import { clockOf } from '../lib/clock';

export interface AppearanceOption<T extends string> {
  value: T;
  label: string;
  note: string;
}

/**
 * Which list a control is picking from. `logRow` is the Log row's switch read as the list of its
 * two answers (`LogRowLayout`), so the one switch asks the same three questions every list on the
 * sheet asks: `isLocked`, `isPlusLook` and `gateFor`.
 */
export type OptionKind = 'theme' | 'scheme' | 'skin' | 'shape' | 'tabs' | 'logRow';

/**
 * THE LOG ROW'S TWO ANSWERS (2026-10-01): its switch off is the wrapping grid, every tile on the page
 * at once, the default and free on every plan; on is the sideways swipe, part of Plus since the
 * owner's *"make shapes other than pebble also a plus feature, same with horizontal slider"*.
 */
export type LogRowLayout = 'grid' | 'swipe';

/** The answer a position of the Log row's switch stands for. */
export const logRowOf = (on: boolean): LogRowLayout => (on ? 'swipe' : 'grid');

const THEME_COPY: Record<ThemeChoice, { label: string; note: string }> = {
  system: { label: 'Match phone', note: 'Light or dark, whichever your phone is using' },
  light: { label: 'Light', note: 'Bright, for the day' },
  dark: { label: 'Dark', note: 'Deep, for the evening' },
  night: { label: 'Night', note: 'Dim amber for 2 a.m.' },
};

export const THEME_OPTIONS: AppearanceOption<ThemeChoice>[] = THEME_CHOICES.map(value => ({
  value,
  ...THEME_COPY[value],
}));

/**
 * THE SHEET'S THEME TOGGLE, IN THESE SAME WORDS (the owner, 2026-09-25: *"Make 3 a 3 way toggle:
 * left day, middle night, right dark"*). Its three stops are the three looks, each written on the
 * sky in its own word from `THEME_COPY`. "Match phone" is not a fourth stop: following the phone
 * is not a look but whether the look follows the phone at all, so it is the switch row under the
 * toggle, and it reads its title and its line from `THEME_COPY` too.
 */
export const THEME_STOP_LABELS: Record<ThemeName, string> = {
  light: THEME_COPY.light.label,
  night: THEME_COPY.night.label,
  dark: THEME_COPY.dark.label,
};

export const MATCH_PHONE = THEME_COPY.system;

// the scheme and skin notes are the token tables'; they pass through `asCopy`, the net that would
// turn a typographic dash into the app's middle dot, as the plan matrix's lines do. The SHEET prints
// neither since 2026-09-25 — its colors are one row of named swatches and its designs are two
// pictures (the owner: "remove the description text below the color name"). A design's note is
// still what a screen reader hears for its picture; a scheme's note is kept as the table's
// description of the palette and printed nowhere now

export const SCHEME_OPTIONS: AppearanceOption<SchemeName>[] = SCHEME_NAMES.map(value => ({
  value,
  label: schemes[value].name,
  note: asCopy(schemes[value].note),
}));

export const SKIN_OPTIONS: AppearanceOption<SkinName>[] = SKIN_NAMES.map(value => ({
  value,
  label: SKINS[value].label,
  note: asCopy(SKINS[value].note),
}));

/**
 * THE SHEET'S TWO DESIGN TILES, LEFT TO RIGHT (the owner, 2026-09-25: *"separate it into 2 sections
 * options, left and right; and then has a 'preview' of what it is"*). The two skin options, with
 * the DEFAULT FIRST: it is the free one and the one every household starts
 * on, so the picture on the left is what the parent already has and the one on the right is the
 * other way the app can look — which on the free plan is also the one carrying the lock.
 *
 * Derived from `DEFAULT_SKIN` rather than written out, so if the default ever moves the tiles
 * follow it. The note is kept although the tile does not print it: the picture says it to the eye,
 * and the note says it to a screen reader, which cannot see the picture.
 */
export const DESIGN_OPTIONS: AppearanceOption<SkinName>[] = [
  ...SKIN_OPTIONS.filter(o => o.value === DEFAULT_SKIN),
  ...SKIN_OPTIONS.filter(o => o.value !== DEFAULT_SKIN),
];

// PEBBLE NO LONGER SAYS "SLIDING SIDEWAYS" (2026-10-01). It was written when every pebble row slid;
// since 2026-09-18 the row wraps unless the Log row's switch says otherwise, and since 2026-10-01
// that switch is Plus while Pebble is free, so the free shape's line no longer names a sold layout
const SHAPE_COPY: Record<QuickShape, { label: string; note: string }> = {
  pebble: { label: 'Pebble', note: 'Round icons, three across' },
  bubble: { label: 'Bubble', note: 'Quick actions as circles, four across' },
  capsule: { label: 'Capsule', note: 'Wide pills, two columns, all of them on the page' },
};

export const SHAPE_OPTIONS: AppearanceOption<QuickShape>[] = QUICK_SHAPES.map(value => ({
  value,
  ...SHAPE_COPY[value],
}));

/**
 * THE THREE LAYOUTS' NAMES, and the one a household can have. There has been no tab-label setting
 * since 2026-09-18 (the owner: "all labels 0 tab labels"): `DEFAULT_APPEARANCE` starts on
 * `rounded` and `parseAppearance` forces it, so no Appearance surface offers a choice and the
 * option list is that one layout. The other two keep their names here because `tabLayout.ts` still
 * draws all three — putting the choice back is the parser's one line, and these words with it.
 */
const TAB_COPY: Record<TabLabelPolicy, { label: string; note: string }> = {
  icons: { label: 'Icons only', note: 'The reference, no labels' },
  focus: { label: 'Focus', note: 'Current tab full size, the rest smaller' },
  rounded: { label: 'All labels', note: 'Every tab labeled, same size' },
};

/** What a household gets: the layout `parseAppearance` forces, whatever was stored. */
const TAB_GIVEN = parseAppearance({}).tabs;

export const TAB_OPTIONS: AppearanceOption<TabLabelPolicy>[] = TAB_POLICIES.filter(
  value => value === TAB_GIVEN,
).map(value => ({
  value,
  ...TAB_COPY[value],
}));

/**
 * Whether choosing `value` is behind the paywall for this plan. Light, dark and "match phone" are
 * never sold (the bill of rights), and neither is the tab layout, which is not a choice at all.
 *
 * THE SHAPES AND THE SIDEWAYS LOG ROW ARE SOLD SINCE 2026-10-01 (the owner: *"make shapes other
 * than pebble also a plus feature, same with horizontal slider"*). Until then this said "Shape and
 * tab labels are never sold", and the Log row's switch called itself "a layout preference, not one
 * of the six color schemes or the two paid skins". Both are `themes` now, the colors' and Liquid
 * Glass's own gate: Bubble and Capsule are locked where Pebble, the default, is not, and the swipe
 * is locked where the wrapping grid, the default, is not. The free one is the DEFAULT, never a name,
 * as with the schemes and the skins.
 */
export function isLocked(
  kind: OptionKind,
  value: string,
  entitled: AppearanceEntitlements,
): boolean {
  switch (kind) {
    case 'theme':
      return value === 'night' && !entitled.nightTheme;
    case 'scheme':
      return value !== DEFAULT_SCHEME && !entitled.themes;
    case 'skin':
      return value !== DEFAULT_SKIN && !entitled.themes;
    case 'shape':
      return value !== DEFAULT_SHAPE && !entitled.themes;
    case 'logRow':
      return value === 'swipe' && !entitled.themes;
    case 'tabs':
      return false;
  }
}

/**
 * WHETHER `value` IS ONE OF THE LOOKS PLUS SELLS, whatever this household's plan: Night, a color
 * other than the default, a design other than the default, and since 2026-10-01 a shape other than
 * Pebble and the sideways log row. The options the quiet "Plus" tag marks during the 14-day preview
 * (2026-09-28), asked of the same `isLocked` the locks are drawn from, on the free plan's
 * entitlements, so the tag and the lock can never disagree about which is which.
 */
export const isPlusLook = (kind: OptionKind, value: string): boolean =>
  isLocked(kind, value, FREE_APPEARANCE);

/** The feature a locked option's tap opens the paywall for; null for lists nothing is sold in. */
export function gateFor(kind: OptionKind): FeatureKey | null {
  switch (kind) {
    case 'theme':
      return 'nightTheme';
    case 'scheme':
    case 'skin':
    case 'shape':
    case 'logRow':
      return 'themes';
    case 'tabs':
      return null;
  }
}

/**
 * The theme option a control shows as checked: the stored choice, unless the plan took night
 * back — then the dark the resolver paints instead, so the locked "Night" keeps its lock in view
 * and stays tappable.
 */
export function shownTheme(
  stored: ThemeChoice,
  tookBack: Pick<ResolvedAppearance['tookBack'], 'night'>,
): ThemeChoice {
  return tookBack.night ? 'dark' : stored;
}

/**
 * Where the sheet's theme toggle rests: `shownTheme`'s answer, except that a household following
 * the phone rests on the light or dark the phone is using. The toggle has no stop for
 * "whichever", and the phone has always picked one of its three — so that is the one it shows.
 */
export function themeStop(
  stored: ThemeChoice,
  tookBack: Pick<ResolvedAppearance['tookBack'], 'night'>,
  phone: 'light' | 'dark',
): ThemeName {
  const shown = shownTheme(stored, tookBack);
  return shown === 'system' ? phone : shown;
}

/** Exported: the sheet names the theme the automatic window is painting. */
export const THEME_WORD: Record<ThemeName, string> = {
  light: 'Light',
  dark: 'Dark',
  night: 'Night',
};

/** The preview's caption: "Lilac · Dark" — what is painted, not what is stored. */
export function appearanceSummary(resolved: Pick<ResolvedAppearance, 'scheme' | 'theme'>): string {
  return `${schemes[resolved.scheme].name} · ${THEME_WORD[resolved.theme]}`;
}

/* ------------------------------------------------------------- the automatic evening dim */

/**
 * WHAT THE AUTOMATIC DIM SAYS (the owner, 2026-09-20: *"Add the option to turn on automatic dark
 * mode at certain times (night) or follow Chiara's bed time. Add it to setting and ask this on
 * onboarding"*).
 *
 * Here for the same reason every other label on this page is: the Appearance sheet and the
 * onboarding step render the SAME control (`AutoDarkControls`), and two copies of "Bed time"
 * are two copies to reword. The arithmetic behind the words — when the window is open, which
 * pair it runs on, whether it may paint at all — is in `@nibblecue/ui/appearance` and is
 * tested without React.
 *
 * WHAT IT IS NOT SAYING. Not that a baby should be asleep, not that the parent should be, and
 * not that anything is wrong with either. It is a screen brightness preference with a clock on
 * it, and `bedtimeFollows` reads the household's OWN two times back to them.
 *
 * AUTOMATIC NIGHT MODE SINCE 2026-09-25 (the owner: *"automatic dark -> automatic night mode.
 * reword 'god dark on its own in the eveing, and come back in the morning. this is a little to
 * long, and make it more clear"*). One heading for both surfaces, because both draw this control.
 *
 * THE WORD "NIGHT" MEANS TWO THINGS NOW, and the lines below are written so neither lies. In the
 * heading it is the time of day; as a LOOK, "Night" is still the dim amber theme, part of Plus,
 * in the Theme control and in "Dim to" (`night`, `nightFree`, `nightTookBack`). Setup never offers
 * the look (`offerLook={false}`) and dims to dark, which is free, and the lede says "Dark" first.
 *
 * THE LEDE IS TRUE FOR ALL THREE ANSWERS. It describes what the control does rather than what
 * the app is doing now, so it holds under Off; "at night" is the evening a set pair or the bed
 * time bounds; and "back" rather than "light", because the window only ever dims — in the morning
 * the app returns to the parent's own look, which for a household on dark or following a dark
 * phone is not light at all.
 */
export const AUTO_DARK_COPY = {
  header: 'Automatic night mode',
  lede: 'Dark at night, back in the morning.',
  off: 'Off',
  times: 'Set times',
  bedtime: 'Bed time',
  from: 'From',
  to: 'To',
  dimTo: 'Dim to',
  dark: 'Dark',
  night: 'Night',
  /** Setup's live preview only (the owner, 2026-09-22): a look, not a promise — one tap shows
   * the screen in dark and a second tap brings it back, so the question answers itself.
   *
   * THE WORDS BESIDE A DAY/NIGHT SWITCH since 2026-09-25, and they no longer change with it:
   * "Back to normal" was the button's second label, and a switch says which way it is set with
   * its knob. The spoken name keeps the visible words at its start, so a parent who says "tap
   * Try me" to voice control reaches the same control a sighted parent sees. */
  tryMe: 'Try me',
  tryMeLabel: 'Try me: preview dark mode',
  tryMeHint: 'Turns the app dark so you can see it. Turn it off to switch back.',
  /** The household's own pair, read back — never a time the app chose for them. */
  bedtimeFollows: (bed: string, wake: string): string => `Dim from ${bed} to ${wake}.`,
  bedtimeWaiting: (from: string, to: string): string =>
    `No bed time set yet, so ${from} to ${to} until there is one.`,
  bedtimeWhere: 'Follows the bed time on Schedule → Manage; move it there and this moves with it.',
  /**
   * THE ONE SENTENCE THAT KEEPS THE TWO CONTROLS FROM LOOKING LIKE THEY FIGHT. A parent who
   * has chosen dark and then turns this on has to be told, before they wonder, that nothing
   * will happen — `resolveAppearance` only ever dims, and the screen should say so rather
   * than leave it to be discovered.
   */
  onlyDims: 'It only ever makes the app darker. On dark or night already, nothing changes.',
  /** Soft note when from === to: `withinDimWindow` treats that pair as never dim. */
  sameTimes: 'Same start and end means the app never dims.',
  onNow: 'On now',
  /**
   * THE LINE OVER A HELD THEME (2026-09-29; `themeHold` has when and why the Theme toggle is held).
   * Two sentences, never more. The first is always the same shape: that it is on, and until when,
   * the end of the window the app is running on, on this phone's clock. When that end cannot be
   * known the time is left out rather than guessed.
   *
   * The second says what to do instead, and names only what would work. Dim to, where it can
   * change what is on the screen: Night is on this plan, and the parent's own look is not already
   * Night (the window only ever dims, so a Night of their own outranks either answer). Otherwise
   * only the way out. Pointing at a control whose change could not be seen would be the owner's
   * evening again, one control further down the page.
   *
   * It replaced `activeNote` ("Automatic night mode is on, so the app is showing Dark right
   * now."), which explained a toggle resting on the stored choice over a dimmer screen. The toggle
   * shows the screen's own look now, so there is nothing left to explain but the way out. "Night"
   * is not written in it: lower case, "night" is the time of day, as in the control's own name.
   */
  heldOn: (until: string | null): string =>
    until === null ? 'Automatic night mode is on.' : `Automatic night mode is on until ${until}.`,
  heldDimTo: 'Pick how night looks under Dim to, or turn it off to change the theme now.',
  heldOff: 'Turn it off to change the theme now.',
  /**
   * What a locked Night on "Dim to" says after its name, to a screen reader: the Theme toggle's own
   * hint on the same sheet, word for word, because it is the same look behind the same gate.
   */
  lockedHint: (plusName: string): string => `Included with ${plusName}`,
  /** Night is sold; the clock is not. Both halves are said, because only one of them is a gate. */
  nightFree: (plusName: string): string =>
    `Dimming to dark is free on every plan. Night is part of ${plusName}.`,
  nightTookBack: (plusName: string): string =>
    `Night is part of ${plusName}, so the evening dims to dark instead.`,
} as const;

/**
 * The three modes as a segmented control reads them. `off` first and selected by default: a
 * household that has never been asked has not asked for anything.
 */
export const AUTO_DARK_MODE_OPTIONS: AppearanceOption<AutoDarkMode>[] = [
  { value: 'off', label: AUTO_DARK_COPY.off, note: 'Nothing changes on its own' },
  { value: 'times', label: AUTO_DARK_COPY.times, note: 'Between two times you pick' },
  { value: 'bedtime', label: AUTO_DARK_COPY.bedtime, note: 'Between bed time and wake time' },
];

export const AUTO_DARK_THEME_OPTIONS: AppearanceOption<AutoDarkTheme>[] = [
  { value: 'dark', label: AUTO_DARK_COPY.dark, note: 'Deep, for the evening' },
  { value: 'night', label: AUTO_DARK_COPY.night, note: 'Dim amber for 2 a.m.' },
];

/**
 * "DIM TO" IS A TOGGLE OF TWO SKIES (the owner, 2026-09-26: *"in theme selection if automatic night
 * mode is on, the dim to should be a toggle like previously but only bettwen dark or night"*): the
 * Theme toggle's own Night and Dark (`DIM_STOPS` in the design system), each written on its sky in
 * the word the option list above gives it — one list, so the words cannot drift from the options.
 */
export const DIM_TO_LABELS = Object.fromEntries(
  AUTO_DARK_THEME_OPTIONS.map(o => [o.value, o.label]),
) as Record<AutoDarkTheme, string>;

/**
 * Whether choosing a look for the window is behind the paywall. It is the SAME question
 * `isLocked('theme', …)` answers, deliberately routed through the same entitlement: night is
 * night whether a parent taps it or a clock does, and dark is the bill of rights either way.
 * A second gate key would be a second thing to forget when the plan matrix changes.
 */
export const isAutoDarkLocked = (value: AutoDarkTheme, entitled: AppearanceEntitlements): boolean =>
  isLocked('theme', value, entitled);

/* ------------------------------------------------- the theme, held while the evening decides */

/**
 * THE THEME WAITS FOR THE MORNING (the owner, 2026-09-29: *"The time was around 11pm, and
 * automatic night mode was on, i went to appearance page, the theme was still on Day (day
 * setting), and i moved to night / dark, but the screen didnt change because the night mode was
 * on. this is fine, but for users who didnt know might think this was broken. think about a fix
 * for this, perhaps users arent able to play with theme when automatic night mode is on, rather
 * than letting them change but nothing happens."*).
 *
 * THIS REVERSES A DECISION, AND ON PURPOSE. Until now the Theme toggle stayed on the STORED
 * choice while the window covered it (the knob on Light over a dark screen), because the stored
 * choice is what the parent picked and what a tap changes, and moving the knob would have shown
 * a choice nobody made. One line under Match phone said why the two disagreed (`activeNote`).
 * The owner's evening is what that cost. The line was read after the tap, not before it, and the
 * tap did nothing that could be seen: a control that takes a tap and shows nothing reads as
 * broken, however true the sentence under it. The argument that it would show a choice nobody
 * made does not survive either: the look on the screen is one the parent did choose, under
 * Automatic night mode. So while the window decides the look, the toggle rests on the look that
 * IS on the screen and is held: dimmed, untappable, and saying why, to the eye above it and to a
 * screen reader on it. Nothing stored moves. The parent's own choice comes back the moment the
 * window closes or automatic night mode is turned off, and the knob rolls back to it.
 *
 * WHEN IT HOLDS: the window is open AND its look is the one painted. That is exactly the case in
 * which some tap on the toggle would change nothing on the screen. The window only ever dims, so
 * under a window dimming to Dark a tap on Light paints Dark, and under one dimming to Night every
 * tap paints Night. `themeHold.test.ts` walks every combination against the resolver to hold that
 * equivalence. The one open window that does not hold is a parent's own Night outranking a window
 * that dims to Dark. There every tap shows (Dark paints Dark, and Light lets the window's Dark
 * in, which then holds), so nothing is held, because a control whose change can be seen is never
 * held.
 *
 * MATCH PHONE IS HELD WITH IT, and reads off: while the window decides, the look is not following
 * the phone, and a switch that said it was would be the same disagreement the toggle had.
 *
 * NOTHING ELSE ON THE SHEET IS HELD. Color shows under Dark (the whole palette) and under Night,
 * which takes the scheme's accents (the preview's current tab, and every switch, chip and icon on
 * this sheet). Design shows under Dark (its material) and under Night, where the material is
 * flattened but its corners and its rules are not. The test holds both premises against the
 * palette and skin tables, so a change that made either invisible would fail there first. Dim to
 * is the control that changes the look tonight, and it is never held.
 *
 * HELD, NOT LOCKED. `isLocked` is the plan's word, for an option that is sold. A held control is
 * sold to nobody: it is waiting for the morning, and nothing about what a plan includes moves.
 * Light and dark are free on every plan, Night is part of Plus, and both stay so.
 */
export interface ThemeHoldInput {
  /** The stored choice, `prefs.theme`. */
  stored: ThemeChoice;
  /** What the resolver painted: its theme, what the plan took back, the window's own account. */
  resolved: Pick<ResolvedAppearance, 'theme' | 'tookBack' | 'autoDark'>;
  /** The light or dark the phone is using. */
  phone: 'light' | 'dark';
  entitled: AppearanceEntitlements;
  /**
   * The pair the window runs on: `autoDarkWindow(prefs.autoDark, bedtime)`, the resolver's own
   * function over the same read of the bed time (`useDimBedtime`), so the time the sheet names is
   * the one the app is using. Null when there is none.
   */
  dimWindow: { from: string; to: string } | null;
  /** Whether this phone writes time on a 24-hour clock (`deviceClock24`). */
  clock24: boolean;
}

export interface ThemeHold {
  /** The Theme toggle and Match phone are held, always together: they answer one question. */
  held: boolean;
  /** Where the toggle rests: the look on the screen, held or not. */
  stop: ThemeName;
  /** Whether Match phone reads on: whether the look is following the phone right now. */
  matchPhone: boolean;
  /** The window's end on this phone's clock ("6:00 AM"); null when nothing is held, or unknown. */
  until: string | null;
  /** The line over the toggle, and what a screen reader hears on a held control; null if none. */
  line: string | null;
}

export function themeHold({
  stored,
  resolved,
  phone,
  entitled,
  dimWindow,
  clock24,
}: ThemeHoldInput): ThemeHold {
  const dim = resolved.autoDark;
  // the window is open and its look is what is painted: the look the resolver chose because of
  // it, or the same look the parent's own choice paints anyway
  const held = dim.open && dim.theme !== null && resolved.theme === dim.theme;
  if (!held) {
    return {
      held: false,
      stop: themeStop(stored, resolved.tookBack, phone),
      matchPhone: stored === 'system',
      until: null,
      line: null,
    };
  }
  // the codebase's own reader of an HH:MM, and '' for anything it cannot read: never a guess
  const end = dimWindow === null ? '' : windowTimeOr(dimWindow.to, '');
  const until = end === '' ? null : clockOf(end, clock24);
  // Dim to can change what is on the screen only when its other look can be chosen (Night is on
  // this plan) and would paint (the parent's own look is not already Night, which outranks both)
  const dimToShows = entitled.nightTheme && stored !== 'night';
  const instead = dimToShows ? AUTO_DARK_COPY.heldDimTo : AUTO_DARK_COPY.heldOff;
  return {
    held: true,
    stop: resolved.theme,
    matchPhone: false,
    until,
    line: `${AUTO_DARK_COPY.heldOn(until)} ${instead}`,
  };
}
