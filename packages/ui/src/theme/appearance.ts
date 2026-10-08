/**
 * The appearance a screen renders with, resolved in ONE place (docs/DESIGN_SYSTEM.md §3, §11,
 * §13; UX_AUDIT R-5). Inputs: the stored preference, the OS scheme, and what the plan allows.
 * Ordering: the theme decides the structural palette; the scheme overlays its ten roles;
 * night reclaims its grounds; the skin changes material only. An unknown stored value falls
 * back to the default rather than rendering unstyled, and a plan that no longer includes a
 * paid look takes it back — night lands on DARK, never light (PREFLIGHT.md, the split re-run).
 */
import {
  DEFAULT_SCHEME,
  gradients,
  isSchemeName,
  resolvePalette,
  schemes,
  type Palette,
  type SchemeName,
  type ThemeName,
} from './theme';
import {
  DEFAULT_SKIN,
  isSkinName,
  SKINS,
  skinForTheme,
  type SkinName,
  type SkinTokens,
} from './skins';

export type ThemeChoice = 'system' | 'light' | 'dark' | 'night';
/**
 * The tab bar's three label layouts (§23.1). Every household gets `rounded` — all labels, same
 * size — and there is no setting for it: `DEFAULT_APPEARANCE` starts there and `parseAppearance`
 * forces it (the owner, 2026-09-18: "all labels 0 tab labels"). `icons` and `focus` stay because
 * `tabLayout.ts` is built on all three and putting the choice back is one line in the parser.
 */
export type TabLabelPolicy = 'icons' | 'focus' | 'rounded';
/**
 * The Quick row's shape (§16, §23.2). Pebble is the owner's settled default.
 *
 * `cards` — the tall three-across tile with the disc breaking its top edge — was the fourth and
 * is gone (the owner, 2026-09-16: "remove cards module completely, it does not work at all").
 * Anyone stored on it lands on the default, the way `soft` before it did (`parseAppearance`).
 */
export type QuickShape = 'bubble' | 'pebble' | 'capsule';

/**
 * THE SHAPE EVERY PLAN PAINTS: the default, and since 2026-10-01 the only free one (the owner: *"make
 * shapes other than pebble also a plus feature, same with horizontal slider"*). Bubble and Capsule
 * are sold under `themes`, beside the colors and Liquid Glass, and a plan without it paints this in
 * their place (`resolveAppearance`). A role, not a name, as `DEFAULT_SCHEME` and `DEFAULT_SKIN` are:
 * the free shape is whichever one is the default.
 */
export const DEFAULT_SHAPE: QuickShape = 'pebble';

/**
 * AUTOMATIC DARK — the app dimming itself in the evening (the owner, 2026-09-20: *"Add the
 * option to turn on automatic dark mode at certain times (night) or follow Chiara's bed time.
 * Add it to setting and ask this on onboarding"*).
 *
 *  - `off`      nothing happens; the stored theme is the whole answer. The default.
 *  - `times`    between `from` and `to`, every day, wrapping past midnight.
 *  - `bedtime`  between the household's own bed time and its wake time — the pair already on
 *               the Routine page, so moving bedtime moves this with it and there is no second
 *               place to keep in step.
 *
 * `theme` is what the window PAINTS: dark, or the amber night look. Night is part of Plus and
 * the existing `nightTheme` gate covers it — a window set to night on a free plan paints dark,
 * exactly as a stored night theme does, and says so. Dark is not sold and never will be (the
 * bill of rights, CLAUDE.md §4), so scheduling it is free on every plan: a right you have to
 * ask for by hand at 10 p.m. is still the right, and charging for the clock would be charging
 * for dark mode through the side door.
 */
export type AutoDarkMode = 'off' | 'times' | 'bedtime';
/** What the window may paint. Never `light` — see `autoDarkThemeAt`: this only ever dims. */
export type AutoDarkTheme = 'dark' | 'night';

export interface AutoDarkPrefs {
  mode: AutoDarkMode;
  /**
   * `HH:MM` local wall times, used by `times` — and by `bedtime` as its fallback, before the
   * household's row has been read (a first launch, an onboarding still in progress, a device
   * that has not pulled yet). A fallback that is the parent's own last answer is better than
   * a blank evening, and it is replaced the moment the real pair arrives.
   */
  from: string;
  to: string;
  theme: AutoDarkTheme;
}

/**
 * Off, with the evening a parent would most likely choose already filled in, so turning it on
 * is one tap and not a form. 20:00–07:00 is not a claim about anyone's baby; it is where the
 * two chips start.
 */
export const DEFAULT_AUTO_DARK: AutoDarkPrefs = {
  mode: 'off',
  from: '20:00',
  to: '07:00',
  theme: 'dark',
};

export const AUTO_DARK_MODES: AutoDarkMode[] = ['off', 'times', 'bedtime'];
export const AUTO_DARK_THEMES: AutoDarkTheme[] = ['dark', 'night'];

/**
 * CALM MOTION (2026-09-28). The owner asked, as a new parent would: *"how is the operational of the
 * app itself? Is it hard? Is it too animated? Is it too much?"* Logging was easy; what was too much
 * was around it — a diaper logged from the + button spent about 1.2 s animating across some eight
 * motions. Calm motion is the app keeping still, the way the phone's own Reduce Motion asks it to:
 * pictures and celebrations hold their end state and sheets open and close at once.
 *
 *  - `off`     the app moves as it was designed to (unless the phone itself asks for less). THE
 *              DEFAULT since 2026-10-06 (the owner: "by default calm motion is off"): the motion is
 *              part of how the app feels, and a parent who wants less finds it in Appearance;
 *  - `night`   still from 9 p.m. to 8 a.m. on the phone's clock, the hours a parent is up with one
 *              hand free and a baby in the other. The default from 2026-09-28 to 2026-10-06;
 *  - `always`  still at every hour.
 *
 * It is what `reduceMotion` means to the design system (`reducesMotion` below, handed to
 * `ThemeProvider`), so every rule that already keeps still for the phone's setting keeps still for
 * this one: `motionStill`, `loopRuns`, the sheet, the toast, the popover, navigation. It is a
 * preference of this phone and nothing else, free on every plan: how the app moves in a parent's
 * hand is not a look and not a feature, and no plan decides it.
 */
export type CalmMotion = 'off' | 'night' | 'always';
export const CALM_MOTIONS: CalmMotion[] = ['off', 'night', 'always'];

/**
 * Whether the app keeps still right now. `phone` is the platform's own Reduce Motion, which always
 * wins; `daytime` is the phone's clock, asked by whoever owns one (the app reads `isDaytimeHour` in
 * core), so this stays pure and a test can put the phone at 3 a.m.
 */
export function reducesMotion(p: { phone: boolean; calm: CalmMotion; daytime: boolean }): boolean {
  return p.phone || p.calm === 'always' || (p.calm === 'night' && !p.daytime);
}

export interface AppearancePrefs {
  theme: ThemeChoice;
  scheme: SchemeName;
  skin: SkinName;
  tabs: TabLabelPolicy;
  shape: QuickShape;
  /**
   * Whether Today's Log row SLIDES sideways instead of wrapping into a grid (§16, §23.2).
   *
   * Off for everyone, including a household that already has a stored appearance: a sideways row
   * hides most of the modules the household chose behind a swipe, and nothing on the screen says
   * they are there (the owner, 2026-09-18: "log slider is confusing, by default it should not be
   * slider, keep it like initial version where it shows 3 column for the log module, and how ever
   * many columns is needed. keep the slider optional if user wants to have the slider on, on the
   * theme page"). The wrapping grid shows every tile at once and grows a row at a time.
   *
   * TURNING IT ON IS PART OF PLUS SINCE 2026-10-01 (the owner: *"make shapes other than pebble also
   * a plus feature, same with horizontal slider"*), sold under `themes` with the colors, Liquid
   * Glass and the shapes. This field used to say it was free on every plan, because gating it would
   * have been gating the fix to a complaint, and that fix is still everyone's: the complaint was the
   * slider being the DEFAULT, and the default, the wrapping grid, is what every plan paints. What is
   * sold is the departure from it. A plan without `themes` paints the grid whatever is stored here,
   * and the stored `true` is kept for when Plus comes back (`resolveAppearance`).
   */
  logSlider: boolean;
  /**
   * The evening dim, if the household asked for one. Device-level like everything else here:
   * two parents on two phones can want different things of their own screens at 10 p.m., and
   * neither is a fact about the baby.
   */
  autoDark: AutoDarkPrefs;
  /**
   * Calm motion (`CalmMotion`): still at night, always, or never beyond what the phone asks. Per
   * phone like the rest of this record, never the household's: one parent's hand is not the other's.
   */
  calmMotion: CalmMotion;
  /**
   * WHETHER A PARENT PICKED `calmMotion` ON THE ROW, rather than it being the old default. Every
   * phone saved `night` with the rest of its record while At night was the default, so a stored
   * `night` alone cannot say who chose it; one without this mark is read as Off (`parseAppearance`).
   */
  calmMotionChosen: boolean;
}

/**
 * What the app looks like before anybody has chosen anything (the owner, 2026-09-16: "light
 * theme, pebble shape and liquid glass should be the default when a user first downloads").
 *
 * THEME IS `light`, NOT `system`: MATCH PHONE STARTS OFF (the owner, 2026-09-16, and again on
 * 2026-09-27: *"i dont think i want to enable match phone, let users decide it for themselves"*).
 * Following the OS is the safer engineering default and it is the wrong product default here: the
 * first screen a parent sees should be the one the brand was designed against, not whichever of
 * three themes their phone happens to be in tonight. Match phone is the switch under the theme in
 * Appearance, one tap for a parent who wants it, and like light and dark it is free on every plan
 * (the bill of rights). A household that already turned it on keeps it: only a MISSING or unknown
 * stored theme becomes `light` (`parseAppearance`), and nothing rewrites a stored `system`.
 *
 * `scheme` is `DEFAULT_SCHEME`, Ocean since 2026-09-27 (`theme.ts` has the history), and the only
 * scheme a plan without `themes` paints.
 *
 * `glass` and `pebble` are the owner's settled look. They cost nothing on either platform — the
 * skin falls back to an opaque surface where the platform cannot blur (`skins.ts`) — and the
 * contrast sweep covers every theme × scheme × skin, so no default here can ship unreadable.
 */
export const DEFAULT_APPEARANCE: AppearancePrefs = {
  theme: 'light',
  scheme: DEFAULT_SCHEME,
  skin: 'glass',
  // EVERY TAB LABELED, and not a choice (the owner, 2026-09-18: "all labels 0 tab labels");
  // `parseAppearance` forces it too. Five unlabeled glyphs is a guessing game on a first launch,
  // which is why Focus replaced icons only on 2026-09-17, and all labels replaced both a day later.
  tabs: 'rounded',
  shape: DEFAULT_SHAPE,
  // the wrapping grid, not the slider (see the field): the owner's default, for everyone
  logSlider: false,
  // nothing dims itself until a parent says so
  autoDark: DEFAULT_AUTO_DARK,
  // the app moves as designed until a parent asks for less (the owner, 2026-10-06; `CalmMotion`)
  calmMotion: 'off',
  calmMotionChosen: false,
};

export const THEME_CHOICES: ThemeChoice[] = ['system', 'light', 'dark', 'night'];
export const TAB_POLICIES: TabLabelPolicy[] = ['icons', 'focus', 'rounded'];
export const QUICK_SHAPES: QuickShape[] = ['pebble', 'bubble', 'capsule'];
export const SCHEME_NAMES = Object.keys(schemes) as SchemeName[];

const oneOf = <T extends string>(list: readonly T[], v: unknown, fallback: T): T =>
  list.includes(v as T) ? (v as T) : fallback;

/* ------------------------------------------------------- the automatic dim, in one place */

/**
 * `HH:MM` → minutes since local midnight, or null. Deliberately a COPY of the three lines
 * `today/dayWindow.ts` uses rather than an import: packages/ui does not depend on
 * packages/core and gaining a dependency for a regular expression would be the wrong trade.
 * `autoDark.test.ts` pins the two against each other so they cannot drift apart silently.
 */
const minutesOf = (hhmm: unknown): number | null => {
  if (typeof hhmm !== 'string') return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2}(?:\.\d+)?)?$/.exec(hhmm.trim());
  if (m === null) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

const timeOr = (value: unknown, fallback: string): string => {
  const mins = minutesOf(value);
  if (mins === null) return fallback;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
};

/**
 * Whether a minute of the local day is inside `[from, to)`.
 *
 * IT WRAPS, because an evening window almost always does — 20:00 to 07:00 is the normal case,
 * not the edge one. `from === to` reads as NEVER rather than always: the failure where a
 * mis-set pair leaves the app permanently dim is one a parent has to hunt through settings to
 * undo, and the failure where it simply never fires is one they notice the same evening.
 */
export function withinDimWindow(minuteOfDay: number, from: string, to: string): boolean {
  const a = minutesOf(from);
  const b = minutesOf(to);
  if (a === null || b === null || a === b) return false;
  return a < b ? minuteOfDay >= a && minuteOfDay < b : minuteOfDay >= a || minuteOfDay < b;
}

/** The household's own wake/bed pair, when the caller has read it. `bedtime` mode's input. */
export interface DimBedtime {
  wake: string;
  bed: string;
}

/**
 * The pair the window actually runs on: the household's bed → wake for `bedtime`, the stored
 * chips for `times`, and the stored chips again when `bedtime` is chosen but nothing has been
 * read yet. Null when the mode is off.
 */
export function autoDarkWindow(
  auto: AutoDarkPrefs,
  bedtime: DimBedtime | null,
): { from: string; to: string } | null {
  if (auto.mode === 'off') return null;
  if (auto.mode === 'bedtime' && bedtime !== null) {
    return { from: bedtime.bed, to: bedtime.wake };
  }
  return { from: auto.from, to: auto.to };
}

/**
 * The stored chips brought into step with a bed time the parent is setting on the SAME screen.
 *
 * It exists for onboarding. There, `bedtime` mode is chosen before the household — and therefore
 * before its wake/bed row — exists, so the window would run on whatever the chips happened to
 * hold until the first sync. Copying the pair the parent is looking at into the fallback makes
 * the evening right from the first night, and it is overwritten by the real row the moment
 * there is one (`autoDarkWindow` prefers a read pair over the chips, always).
 */
export const withBedtimeFallback = (auto: AutoDarkPrefs, bedtime: DimBedtime): AutoDarkPrefs =>
  auto.mode === 'bedtime' ? { ...auto, from: bedtime.bed, to: bedtime.wake } : auto;

/**
 * What the automatic window wants painted right now, or null for "nothing, leave the stored
 * choice alone". `nowMinutes` is minutes since LOCAL midnight — the device's own clock, not
 * the household's time zone, because this is about the room the phone is in.
 *
 * Pure, and the whole of the decision: the provider does the ticking and hands the answer to
 * `resolveAppearance`, so every rule about when the app dims is testable in node.
 */
export function autoDarkThemeAt(
  auto: AutoDarkPrefs,
  nowMinutes: number,
  bedtime: DimBedtime | null,
): AutoDarkTheme | null {
  const window = autoDarkWindow(auto, bedtime);
  if (window === null) return null;
  return withinDimWindow(nowMinutes, window.from, window.to) ? auto.theme : null;
}

/**
 * IT ONLY EVER DIMS. `light < dark < night`, and the window applies only when it would move
 * DOWN this list — a parent already on night at 10 p.m. is not dragged up to dark because
 * their window says dark, and a parent on dark all day is not thrown into light at noon.
 *
 * "Automatic dark mode" is a switch that makes the evening darker. A switch that could also
 * make the app BRIGHTER than the theme the parent chose would be a second, invisible theme
 * control fighting the first one, and the loser would always be the explicit choice.
 */
const DIMNESS: Record<ThemeName, number> = { light: 0, dark: 1, night: 2 };

function calmMotionOf(o: Record<string, unknown>): CalmMotion {
  const stored = oneOf(CALM_MOTIONS, o.calmMotion, DEFAULT_APPEARANCE.calmMotion);
  return stored === 'night' && o.calmMotionChosen !== true ? 'off' : stored;
}

/** Whatever was stored — an older client, a removed key, a corrupt value — becomes a valid preference. */
export function parseAppearance(raw: unknown): AppearancePrefs {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    theme: oneOf(THEME_CHOICES, o.theme, DEFAULT_APPEARANCE.theme),
    scheme: isSchemeName(o.scheme) ? o.scheme : DEFAULT_APPEARANCE.scheme,
    skin: isSkinName(o.skin) ? o.skin : DEFAULT_APPEARANCE.skin,
    /**
     * ALWAYS `rounded` — every tab labeled, same size (the owner, 2026-09-18: "all labels 0 tab
     * labels": all labels, zero tab-label settings).
     *
     * Forced rather than defaulted, and that is the point: a household that chose "Icons only"
     * before the setting was removed would otherwise be stranded on an unlabeled bar with no
     * control left to change it. `TabLabelPolicy` and the three layouts stay — `tabLayout.ts`
     * is built on them and the labeled case is one of them — so this is the ONE line that
     * decides it, and putting the choice back is putting this line back.
     */
    tabs: 'rounded',
    // "soft" and "cards" are removed shapes (§16.2): anyone stored on one lands on the default
    shape: oneOf(QUICK_SHAPES, o.shape, DEFAULT_APPEARANCE.shape),
    // ONLY a stored `true` turns the slider on. Every other value — missing, null, the string
    // "true", a number — is the default, which is off. That is the point of the owner's decision:
    // a household that has never been asked gets the grid, and so does one whose stored
    // appearance predates this field entirely.
    logSlider: o.logSlider === true,
    autoDark: parseAutoDark(o.autoDark),
    // one of the three answers, or the default, Off. A `night` nobody picked is the old default
    // saved along with the rest of the record (At night was the default until 2026-10-06), and is
    // Off now like a new phone; Always was never a default, so whoever stored it chose it
    calmMotion: calmMotionOf(o),
    calmMotionChosen: o.calmMotionChosen === true,
  };
}

/**
 * The evening dim out of whatever was stored. Every field falls back on its own, so a build
 * that stored only a mode still reads as a valid window, and a corrupt time is the default
 * time rather than a window that never opens or never closes.
 */
export function parseAutoDark(raw: unknown): AutoDarkPrefs {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  return {
    mode: oneOf(AUTO_DARK_MODES, o.mode, DEFAULT_AUTO_DARK.mode),
    from: timeOr(o.from, DEFAULT_AUTO_DARK.from),
    to: timeOr(o.to, DEFAULT_AUTO_DARK.to),
    theme: oneOf(AUTO_DARK_THEMES, o.theme, DEFAULT_AUTO_DARK.theme),
  };
}

/** What the plan allows (`can('nightTheme', tier)`, `can('themes', tier)`), decided by the caller. */
export interface AppearanceEntitlements {
  nightTheme: boolean;
  /**
   * Every color scheme but the default, and the Liquid Glass look; since 2026-10-01 every shape but
   * the default, and the Log row that swipes sideways (the owner: "make shapes other than pebble
   * also a plus feature, same with horizontal slider").
   */
  themes: boolean;
}

export const FREE_APPEARANCE: AppearanceEntitlements = { nightTheme: false, themes: false };
export const PLUS_APPEARANCE: AppearanceEntitlements = { nightTheme: true, themes: true };

export interface Gradients {
  brand: readonly [string, string];
  milk: readonly [string, string];
  sleep: readonly [string, string];
  rose: readonly [string, string];
  clay: readonly [string, string];
}

export interface ResolvedAppearance {
  prefs: AppearancePrefs;
  /** The structural theme actually painted. */
  theme: ThemeName;
  scheme: SchemeName;
  skin: SkinName;
  tabs: TabLabelPolicy;
  /** The Quick row's shape actually painted: the stored one, or `DEFAULT_SHAPE` where the plan took it back. */
  shape: QuickShape;
  /**
   * Whether the Log row actually slides: the stored switch, or off where the plan took it back.
   * It was hoisted here as "a layout preference no plan takes back" until 2026-10-01, when the
   * owner made it Plus ("same with horizontal slider"); it is taken back like a color now.
   */
  logSlider: boolean;
  palette: Palette;
  gradient: Gradients;
  /** The label color on the brand gradient: always white (§11). */
  onGradient: string;
  /** Material, radius and elevation after the theme's own rules (night flattens everything). */
  skinTokens: SkinTokens;
  /**
   * Which stored choices the plan took back. The Appearance sheet shows what is PAINTED as chosen
   * and draws the lock on what was taken back; `shape` and `logSlider` joined on 2026-10-01.
   */
  tookBack: { night: boolean; scheme: boolean; skin: boolean; shape: boolean; logSlider: boolean };
  /**
   * The automatic evening dim's account of itself, so a settings row can say what is true
   * rather than recomputing the clock for itself:
   *
   *   `open`      the window is open right now
   *   `active`    …and it is what is being painted (it is not, when the stored theme is
   *               already as dim or dimmer — see `DIMNESS`)
   *   `theme`     what the window would paint, after the plan; null when it is off or shut
   *   `tookBack`  it asked for night and the plan does not include it, so it painted dark
   */
  autoDark: { open: boolean; active: boolean; theme: ThemeName | null; tookBack: boolean };
}

export function resolveAppearance(
  prefs: AppearancePrefs,
  system: 'light' | 'dark',
  entitled: AppearanceEntitlements = PLUS_APPEARANCE,
  /**
   * What the automatic window wants right now — `autoDarkThemeAt(prefs.autoDark, …)`, computed
   * by whoever owns a clock. It is passed IN rather than read here so this function stays pure
   * and a test can put the app at 3 a.m. without touching `Date`.
   */
  auto: AutoDarkTheme | null = null,
  /**
   * A THEME PAINTED OVER THE STORED ONE, AND NEVER STORED (2026-09-25): setup's "Try me" preview,
   * which the provider holds in memory only, so an app killed while it is on comes back to the
   * parent's own theme rather than to the preview. It stands in for `prefs.theme` in everything
   * below — the OS default for `system`, the plan taking night back, the evening dim that only
   * ever darkens — so it paints exactly what the same choice made for real would paint, and the
   * gates are the same gates. `prefs` itself is untouched, and is what `resolved.prefs` reports.
   * Null, the default, paints the stored choice.
   */
  preview: ThemeChoice | null = null,
): ResolvedAppearance {
  const choice: ThemeChoice = preview ?? prefs.theme;
  const wantsNight = choice === 'night';
  const nightTakenBack = wantsNight && !entitled.nightTheme;
  // what the choice paints on its own — the stored theme, or the preview laid over it
  const chosen: ThemeName = wantsNight
    ? nightTakenBack
      ? 'dark'
      : 'night'
    : choice === 'system'
      ? system
      : choice;
  // the window gets the same take-back the stored choice gets, and for the same reason
  const autoTookBack = auto === 'night' && !entitled.nightTheme;
  const autoTheme: ThemeName | null = auto === null ? null : autoTookBack ? 'dark' : auto;
  const autoActive = autoTheme !== null && DIMNESS[autoTheme] > DIMNESS[chosen];
  const theme: ThemeName = autoActive && autoTheme !== null ? autoTheme : chosen;
  // a key that reached here without the parser (a retired `sage`, say) paints the default rather
  // than throwing; it is not "taken back" — no plan sold it — so `tookBack.scheme` stays false
  const stored: SchemeName = isSchemeName(prefs.scheme) ? prefs.scheme : DEFAULT_SCHEME;
  // THE FREE SCHEME IS WHICHEVER ONE IS THE DEFAULT, never a name: Reef was free until it stopped
  // being the default (2026-09-27), and is sold now like the other four
  const schemeTakenBack = stored !== DEFAULT_SCHEME && !entitled.themes;
  const skinTakenBack = prefs.skin !== DEFAULT_SKIN && !entitled.themes;
  const scheme: SchemeName = schemeTakenBack ? DEFAULT_SCHEME : stored;
  const skin: SkinName = skinTakenBack ? DEFAULT_SKIN : prefs.skin;
  // THE SHAPES AND THE SIDEWAYS LOG ROW, TAKEN BACK LIKE A COLOR (the owner, 2026-10-01: "make shapes
  // other than pebble also a plus feature, same with horizontal slider"): a plan without `themes`
  // paints Pebble and the wrapping grid, and `prefs` keeps the parent's own choice, so it is painted
  // again the day Plus is. A removed shape that reached here without the parser (`cards`) paints the
  // default and is not "taken back", for the scheme's reason above: no plan ever sold it.
  const storedShape: QuickShape = oneOf(QUICK_SHAPES, prefs.shape, DEFAULT_SHAPE);
  const shapeTakenBack = storedShape !== DEFAULT_SHAPE && !entitled.themes;
  const shape: QuickShape = shapeTakenBack ? DEFAULT_SHAPE : storedShape;
  const sliderTakenBack = prefs.logSlider === true && !entitled.themes;
  const logSlider = prefs.logSlider === true && !sliderTakenBack;
  const overlay = schemes[scheme][theme === 'light' ? 'light' : 'dark'];
  const g = gradients[theme];
  return {
    prefs,
    theme,
    scheme,
    skin,
    tabs: prefs.tabs,
    shape,
    logSlider,
    palette: resolvePalette(theme, scheme),
    gradient: {
      // night replaces every gradient with its own dim pair so nothing glows (§2)
      brand: theme === 'night' ? g.brand : [overlay.g1, overlay.g2],
      milk: g.milk,
      sleep: g.sleep,
      rose: g.rose,
      clay: g.clay,
    },
    onGradient: overlay.onGradient,
    skinTokens: skinForTheme(SKINS[skin], theme),
    tookBack: {
      night: nightTakenBack,
      scheme: schemeTakenBack,
      skin: skinTakenBack,
      shape: shapeTakenBack,
      logSlider: sliderTakenBack,
    },
    autoDark: {
      open: auto !== null,
      active: autoActive,
      theme: autoTheme,
      tookBack: autoTookBack,
    },
  };
}

/** The status bar and the OS keyboard follow the painted theme, never the OS. */
export const statusBarStyleFor = (theme: ThemeName): 'light' | 'dark' =>
  theme === 'light' ? 'dark' : 'light';
