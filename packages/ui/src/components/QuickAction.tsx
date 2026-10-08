/**
 * The Quick tile (docs/DESIGN_SYSTEM.md §16, §23.2; docs/PRODUCT_SPEC.md §3.4), in the three
 * shapes the household can choose. Every shape answers the same three questions in one glance:
 * WHAT to log (the icon and the label), what the LAST one was and how long ago (`37m · 4 oz`,
 * or `Running`), and how many TODAY (`3×`). The owner's rule (2026-09-15): the last-and-since
 * are ONE line, never two, and a count is never a sentence a tile can truncate — `4 times t…`
 * is worse than nothing.
 *
 * All three (bubble, pebble, capsule) carry the count as a small corner chip, out of the flow,
 * so no tile gets taller (the prototype's block 58).
 *
 * THERE WAS A FOURTH. `cards` — the 136 pt three-across tile with a disc breaking its top edge
 * and the elapsed as a headline number at the foot — is gone (the owner, 2026-09-16: "remove
 * cards module completely, it does not work at all"). It was the only shape that reserved a
 * blank line, the only one that grew with dynamic type instead of wrapping, and the only one
 * whose fill needed a ramp of its own; every one of those was a rule the other three did not
 * have, and its going takes `cardRamp.ts` and the card half of `quickScale.ts` with it.
 *
 * NOTHING ON A TILE IS EVER CLIPPED. Every line is built to the width THIS TILE MEASURED by
 * quickLine.ts, which gives up the count, then the minutes of an elapsed past an hour, then the
 * spaces around the middot, then the detail — `14h · Both`, never `14h 27m · Bo…` (the owner,
 * 2026-09-15). The width is measured rather than assumed because the assumption went stale the
 * day this line moved into a pill: `tileChrome` below and `quickScale.ts` `lineBudget` have the
 * arithmetic, and the ellipses the owner photographed on 2026-09-19 are what a stale one costs.
 *
 * THE COUNT ROLLS WHEN IT RISES (the owner, 2026-09-26, "agreed"; `countRoll.ts`): given
 * `countRoll`, a new entry turns the chip's digits like an odometer and the tile swells a little
 * and settles. Never on the first render, a child switch or a new day — the caller's `scope` says
 * what the number counts — and never under a sheet: a rise waits for the cover to lift
 * (`CountHoldContext`, said by the app round the row).
 *
 * A CAPSULE'S WORDS ARE MEASURED AND NEVER CUT (the owner, 2026-09-26: *"check the text warp in
 * capsule mode, it still shows "....." on my display"*; `quickCapsule.ts` has the whole account).
 * Its name is drawn at the size that fits — the phone's own, or smaller, never below 11, on two
 * lines at most and broken only between words; its count sits at the end of the second row, beside
 * the line or under it, never over the name; and nothing in a capsule is held to a number of lines,
 * so a line the budget got wrong wraps instead of ending in "…".
 *
 * ON ANDROID'S GLASS, EVERY SHAPE IS A PIECE OF LIQUID GLASS INSIDE ITS OWN EDGE (the owner,
 * 2026-10-01: *"android liquid glass still dont look too glassy on the modules, except for the
 * modified radius"*; theme/tileGlass.ts): a rim of light inside the edge, a sheen along the top and a
 * shade at the foot, each kept clear of every word but the name. A pebble's body also lets the ground
 * through around its picture and is the whole tint from its name down; a capsule's body stays whole
 * under its line and its due and late words; a bubble's opaque disc takes its light around its
 * picture. The iPhone and Paper draw what they drew.
 */
import type { ModuleId } from '@nibblecue/core';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/paths';
import type { QuickShape } from '../theme/appearance';
import { composite } from '../theme/contrast';
import { TINT_EDGE, tintAlphaFor } from '../theme/skins';
import { useCategory, useTheme } from '../theme/ThemeProvider';
import { ALERT_PILL_ALPHA, tileAlertInk } from '../theme/tileAlertInk';
import { tileGlass } from '../theme/tileGlass';
import { countLine } from './countRoll';
import {
  CAPSULE_CHIP_GAP,
  capsuleChrome,
  capsuleLabelFit,
  capsuleSecondRow,
  capsuleTextWidth,
  capsuleTileWidth,
  countChipWidth,
  QUICK_GRID_PAD,
  QUICK_HOLDER_CAPSULE,
} from './quickCapsule';
import { firstUpper, QUICK_LINE_BUDGET, tileAlert, tileLine } from './quickLine';
import { lineBudget, TILE_TRACKING } from './quickScale';
import { RollingCount, useCountRoll, type CountRollOptions } from './RollingCount';
import { Surface } from './Surface';
import { AppText, CHROME_FONT_CAP, Numeric } from './Text';
import { TileGlass } from './TileGlass';

/**
 * The bubble's disc (the owner, 2026-09-15, twice: bigger, and the tile's own gutters tighter,
 * "better than showing empty"). 72 in an 89pt cell at 390 leaves the label its width and the
 * disc the rest; the words keep their role and their size — a tile is tapped by its disc.
 */
export const QUICK_BUBBLE = 72;
/** 44 of the 72pt disc, up from 30 (the owner, 2026-09-22: "make the icons bigger,
 *  since it still looks too small and the space is there"). */
export const QUICK_BUBBLE_GLYPH = 44;
/**
 * The gutter each three-row tile keeps for itself; a bubble's disc takes the room instead. (The
 * grid's pad and the capsule's holder live with the capsule's arithmetic, `quickCapsule.ts`, which
 * measures with them; they are exported here as they always were.)
 */
export { QUICK_GRID_PAD, QUICK_HOLDER_CAPSULE };
export const QUICK_BUBBLE_GRID_PAD = 2;
export const QUICK_PEBBLE_MIN_HEIGHT = 76;
export const QUICK_CAPSULE_MIN_HEIGHT = 50;
/** 44, up from 32 (the owner's mockup, 2026-09-19: "increase the icon's size"). */
export const QUICK_HOLDER_PEBBLE = 44;
/** 30 of the 44pt holder, up from 22 — the same instruction. */
export const QUICK_PEBBLE_GLYPH = 30;
/** 24 of the 36pt holder, up from 18 — the same instruction. */
export const QUICK_CAPSULE_GLYPH = 24;
/**
 * The `!` disc a late line carries, and the gap after it: chrome on the line's own row, so the
 * budget has to pay for it or a late tile is the one shape that still clips.
 */
export const QUICK_BANG = 16;
/**
 * What a tile spends on its own edges before a word is set, at the theme's default spacing —
 * the subtraction `quickScale.ts` `lineBudget` documents, gathered here because these are this
 * file's own paddings and nothing else should have to know them.
 *
 * `border` is an allowance rather than a measurement: `Surface` draws a hairline pair (about 1)
 * and an alert raises it to 2, per side. Rounding it up costs a fraction of a character and
 * never an ellipsis, which is the trade this whole mechanism is for.
 */
const tileChrome = (
  shape: QuickShape,
  space: { xs: number; sm: number; md: number; xl: number },
  alerting: boolean,
  late: boolean,
): number => {
  const border = alerting ? 4 : 2;
  switch (shape) {
    // the line spans the tile: a bubble has no card round it and no pill under the words
    case 'bubble':
      return 0;
    // the card's own gutters, then the pill's, then the `!` disc a late line carries
    case 'pebble':
      return border + 2 * space.sm + 2 * space.sm + (late ? QUICK_BANG + space.xs : 0);
    // a capsule sets its line beside the icon rather than in a pill, so it pays for the icon,
    // the gutter after it and the tile's own two (`quickCapsule.ts`, which measures its words)
    default:
      return capsuleChrome(alerting);
  }
};

/** The More tile: a neutral tile in the module's slot, opening the Quick Log sheet. */
export const QUICK_MORE = 'more';
export type QuickTileId = ModuleId | typeof QUICK_MORE;

/**
 * Where the count chip sits per shape: over the disc's shoulder on a bubble, the tile's own
 * corner on a pebble — and on a capsule, not in a corner at all but at the end of its second row
 * (2026-09-26): a capsule's name runs to the right edge of its column, and a chip in the corner sat
 * on the end of a long one ("Breastfe[3×]" at 1.3× text on a 360 dp phone).
 *
 * IT IS A CHIP AND NOT A SUFFIX. The count used to ride the description line as ` · 3×` at 11px —
 * the smallest type on the screen, and the first thing the line gave up when the detail was long,
 * so "120 ml" simply lost it (the owner, 2026-09-16: "the indications how many times it's done in
 * each log module can be slightly bigger"). As a chip it can be bigger, and it cannot be dropped:
 * on a capsule it sits beside the line or, where they do not both fit, on a row under it.
 */
const CHIP_CORNER: Record<Exclude<QuickShape, 'capsule'>, ViewStyle> = {
  bubble: { top: 0, right: 2 },
  pebble: { top: 6, right: 7 },
};

export interface QuickAlert {
  /**
   * `late` is a slot the household set and missed (red, with a mark); `due` is one that is open
   * (amber); `prompt` is an invitation on a module nothing has ever been logged for — drawn in
   * the tile's own color with no ring and no mark, because there is no state to report, only
   * a first entry to ask for. A prompt is never a verdict, and the tile must not look like one.
   */
  level: 'due' | 'late' | 'prompt';
  /** What is true, not what it means: "due now", "nothing logged in 4h 30m". */
  why: string;
  /**
   * The same fact in the width a tile has — "over 4h". A pebble's line is about a dozen
   * characters, a bubble's ten, so a sentence goes to the accessible name and this goes on the
   * line. Optional: a `why` that already fits ("due now", "not logged") needs nothing.
   */
  short?: string;
}

export interface QuickActionProps {
  moduleId: QuickTileId;
  label: string;
  icon: IconName;
  onPress: () => void;
  /** Time since the last entry, the bare duration ("2h 10m") — or "running" while a timer runs. */
  sinceLabel?: string;
  /** What the last one was — "4 oz", "Both", "1h 35m", "5 oz" — beside the since, on one line. */
  detail?: string;
  /**
   * How many have been logged today: `3×` — on a card's description line, as a corner chip on
   * the other shapes. A tally of what happened, never "3rd": the tile is a record, and a parent
   * reading an ordinal at a glance could act as though the feed were already logged.
   */
  countToday?: number;
  /**
   * THE COUNT ROLLS WHEN IT RISES (`countRoll.ts`): what the count is a count of (`scope` — a
   * change of it is never a roll). Whether something covers the tile is `CountHoldContext`'s, said
   * round the row: a rise waits for it to lift. Absent, the count simply changes, as it does in
   * the Quick Log grid.
   */
  countRoll?: CountRollOptions;
  alert?: QuickAlert;
  /** Overrides the household's shape (the Quick Log sheet is always a grid). */
  shape?: QuickShape;
  /** Defaults to "Log <label>, last <detail> <since> ago, <n> times today, <due|late>: <why>". */
  accessibilityLabel?: string;
  disabled?: boolean;
  /**
   * A TILE TO READ, NOT TO TAP: everything it says (the last one, the count, what is due) and no
   * press at all, for somebody who may not log (a view only member; the app's `useCanLog`). Not
   * `disabled`: a faded tile says "not now", and for them it is never; the tile is simply a card.
   * `onPress` is not called; its spoken name drops the "Log".
   */
  readOnly?: boolean;
  testID?: string;
}

/** `3×` — the count as a tile shows it. */
export const countMark = (n: number): string => `${n}×`;

/**
 * `37m · 4 oz` — the since first, then what it was; `Running` alone while a timer runs.
 *
 * A WHOLE LINE, so it takes the capital (`firstUpper`): this is the line Today's Baby care cells
 * draw, and `running` in lowercase under a cell's name is the thing the owner asked to fix
 * (2026-09-19). The capital lands on the first character only, so `37m · 4 oz` is unchanged —
 * there the elapsed starts the line and the detail is mid-line.
 */
export function lastLine(sinceLabel?: string, detail?: string): string {
  return firstUpper([sinceLabel, detail].filter(Boolean).join(' · '));
}

export function QuickAction(props: QuickActionProps) {
  const {
    moduleId,
    label,
    icon,
    onPress,
    sinceLabel,
    detail,
    countToday,
    countRoll,
    alert,
    shape,
    accessibilityLabel,
    disabled,
    readOnly = false,
    testID,
  } = props;
  const t = useTheme();
  const category = useCategory(moduleId === QUICK_MORE ? 'note' : moduleId);
  // the More tile is neutral: the prototype's `--c: var(--text-2); --c-soft: var(--surface-2)`
  const cat =
    moduleId === QUICK_MORE ? { fg: t.color.text2, soft: t.color.surface2, disc: null } : category;
  const resolvedShape: QuickShape = shape ?? t.shape;
  /**
   * THE TILE'S LIQUID GLASS, on Android's Glass and nowhere else (the owner, 2026-10-01: *"make the
   * liquid glass effect inside each the border of the quick log modules"*; theme/tileGlass.ts): a
   * rim, a sheen and a shade inside the tile's own edge, and on a pebble a body that lets the ground
   * through at the top. `null` on the iPhone and on Paper, which draw exactly what they drew. `fill`
   * is what the body is made of: the tint, or a bubble's disc; `crown` the band along the top that
   * holds no word but the name, where one shape needs saying.
   */
  const glassOf = (fill: string, crown?: number) =>
    tileGlass({
      skin: t.skinTokens.name,
      theme: t.theme,
      platform: Platform.OS,
      shape: resolvedShape,
      palette: t.color,
      fill,
      hue: cat.fg,
      ...(crown === undefined ? {} : { crown }),
    });
  const win = useWindowDimensions();
  /**
   * The width the row gave this tile, which is the only honest input to "how many characters
   * fit". Measured on the tile's own outer box: `QuickRow` sizes the cell, the screen owns the
   * gutter, and neither is knowable from in here.
   */
  const [tileW, setTileW] = useState(0);
  const onTileLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (Math.abs(w - tileW) > 0.5) setTileW(w);
  };
  const scale = useRef(new Animated.Value(1)).current;
  const press = (to: number) => {
    if (disabled || t.reduceMotion) return;
    Animated.timing(scale, { toValue: to, duration: 90, useNativeDriver: true }).start();
  };
  // a prompt has no alert ink: no ring, no mark — and its line is in the QUIET ink, because
  // "Never logged" in the full text ink read as a reproach on every tile of a new household
  // (the owner, 2026-09-21: "the font for initial 'never logged' should not be black")
  const alertInk = alert
    ? alert.level === 'late'
      ? t.color.crit
      : alert.level === 'due'
        ? t.color.warn
        : null
    : null;
  /**
   * A PROMPT READS LIKE THE ORDINARY LINE: the quiet ink and the ordinary weight (the owner,
   * 2026-09-21: "change the quick log 'never logged' color font to what it usually be
   * (grey-ish)"). Only a real due or late slot is allowed to shout — "Never logged" in bold
   * near-black is a reproach on every tile of a household that has not started yet.
   */
  const prompt = alert?.level === 'prompt';
  const alertTextInk = alert?.level === 'late' ? 'crit' : alert?.level === 'due' ? 'warn' : 'text2';
  /**
   * THE DUE AND LATE WORDS' OWN INK (theme/tileAlertInk.ts): the alert hue, deepened only as far
   * as the ground it lands on needs for 4.5:1. The ring and the pill keep the token itself; the
   * words are text, and a red pill under red words had them at 3.55:1 (the Glass review,
   * 2026-10-01). `null` for a prompt, which keeps the quiet ink.
   */
  const alertWordColor = useMemo(
    () =>
      alertInk
        ? tileAlertInk({
            ink: alertInk,
            soft: cat.soft,
            shape: resolvedShape,
            palette: t.color,
            skin: t.skinTokens,
            theme: t.theme,
          })
        : null,
    [alertInk, cat.soft, resolvedShape, t.color, t.skinTokens, t.theme],
  );
  const alertWords = alertWordColor ? { color: alertWordColor } : ({ ink: alertTextInk } as const);
  const count = countToday && countToday > 0 ? countToday : 0;
  // what the chip draws — the old number while a rise waits under a sheet — and the roll and the
  // tile's pulse that carry it to the new one (`RollingCount.tsx`)
  const tally = useCountRoll(count, countRoll);
  // the press and the pulse are one scale: a tile pressed as its count rolls still settles at 1
  const tileScale = useMemo(() => Animated.multiply(scale, tally.pulse), [scale, tally.pulse]);

  /*
    THE BUDGET IS MEASURED, NOT REMEMBERED (quickScale.ts `lineBudget` has the arithmetic and
    the reason). `QUICK_LINE_BUDGET` was read off one screenshot of one 390pt phone, and the
    pill this line now sits in — added the same day — took `space.md` off each side of it
    without anything lowering the number to match: a pebble went on building twelve-character
    lines into eleven characters of room, which is `58m · 1.5…` and `1h 1m · B…` (the owner,
    2026-09-19), the ellipsis quickLine.ts exists to prevent.

    So the tile reports its own width and the budget follows from it — which also means a 360pt
    phone, a 430pt phone and a font scale each get an honest answer instead of the reference
    phone's. The constant is what the first frame uses, before layout.

    TWO BUDGETS, because the two lines are set in different faces: the ordinary line is mono
    (`Numeric`, so the digits sit still while they tick) at a flat 0.6 em a character, and the
    alert line is the proportional UI face, whose words are narrower. One budget for both would
    charge "Never logged" the monospace's price and shorten it to "Never" on a tile that had
    room for it all along.
  */
  const fontScale = Math.min(win.fontScale, CHROME_FONT_CAP);
  const metaSize = t.type.meta.fontSize * fontScale;
  /*
    A CAPSULE'S FIRST FRAME IS MEASURED FROM THE WINDOW, not read off the reference phone: its
    remembered budget was 24 characters, a line twice the width of a 360 dp phone's column, and the
    frame before the tile had measured itself drew it — as "…", while it was held to one line.
  */
  const tileNow = tileW > 0 ? tileW : resolvedShape === 'capsule' ? capsuleTileWidth(win.width) : 0;
  const textWidth = Math.max(
    0,
    tileNow - tileChrome(resolvedShape, t.space, !!alertInk, alert?.level === 'late'),
  );
  const budget =
    tileNow > 0
      ? lineBudget(textWidth, metaSize, 'mono', TILE_TRACKING)
      : QUICK_LINE_BUDGET[resolvedShape];
  const alertBudget =
    tileNow > 0 ? lineBudget(textWidth, metaSize, 'ui') : QUICK_LINE_BUDGET[resolvedShape];
  const line = tileLine(sinceLabel, detail, budget);
  // an alert KEEPS the elapsed and adds its word, held to the same width (quickLine.ts says why).
  // It is this tile's own elapsed and nobody else's: a feeding tile once stood its alert beside the
  // last feed of either kind, and a breastfeed moved the Bottle tile's time (the owner, 2026-09-27)
  const alertLine = alert
    ? tileAlert(
        alert.why,
        alert.short,
        alertBudget,
        sinceLabel === 'running' ? undefined : sinceLabel,
      )
    : undefined;
  const spoken =
    accessibilityLabel ??
    `${readOnly ? '' : 'Log '}${label}${
      sinceLabel === 'running'
        ? ', running'
        : line
          ? `, last ${[detail, sinceLabel ? `${sinceLabel} ago` : ''].filter(Boolean).join(' ')}`
          : ''
    }${count ? `, ${count} ${count === 1 ? 'time' : 'times'} today` : ''}${
      alert
        ? alert.level === 'prompt'
          ? `, ${alert.why}`
          : `, ${alert.level === 'late' ? 'late' : 'due'}: ${alert.why}`
        : ''
    }`;

  // the count's chip: in the corner, out of the flow, so no tile gets taller — or, on a capsule, at
  // the end of the second row (see the capsule below). It draws the number SHOWN, which is the
  // count itself except for the moment a rise waits under a sheet
  const chipOf = (place: ViewStyle) =>
    tally.shown > 0 ? (
      <Animated.View
        pointerEvents="none"
        style={[
          styles.chip,
          place,
          {
            backgroundColor: t.color.surfaceSolid,
            borderColor: t.color.line,
            borderRadius: t.radius.s,
          },
          // the day's first entry: the chip arrives with its wheel (`RollingCount.tsx`)
          tally.appear !== null ? { opacity: tally.appear } : null,
        ]}
      >
        <RollingCount
          text={countMark(tally.shown)}
          move={tally.move}
          wheels={tally.wheels}
          textStyle={styles.chipText}
          line={countLine(fontScale)}
        />
      </Animated.View>
    ) : null;
  const chip = resolvedShape === 'capsule' ? null : chipOf(CHIP_CORNER[resolvedShape]);

  // the one line under a bubble / pebble / capsule: the reason when there is one, else
  // the since and what it was
  const subLine = alertLine ? (
    <AppText
      variant="meta"
      {...alertWords}
      align="center"
      numberOfLines={1}
      {...(prompt ? {} : { style: styles.bold })}
    >
      {alertLine}
    </AppText>
  ) : line ? (
    <Numeric variant="meta" ink="text2" align="center" numberOfLines={1} style={styles.tracked}>
      {line}
    </Numeric>
  ) : null;

  /**
   * THE LINE IN A PILL, on the pebble (the owner's mockup, 2026-09-19: "add a darker overlay…
   * on the text 'running' or '9h missed'"). A step of the category into its own soft tint under
   * an ordinary line; a step of the ALERT color under a due or late one, with a red disc and a
   * mark ahead of a late line, which is the mockup's "!" and also the one thing that says late
   * without the color (CLAUDE.md §6: nothing by color alone — the word is still there too).
   */
  const pill = subLine ? (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: composite(
            cat.soft,
            alertInk ?? cat.fg,
            alertInk ? ALERT_PILL_ALPHA : 0.14,
          ),
          borderRadius: t.radius.pill,
          // `sm`, not `md`: two `md` gutters were 16 of the 100pt a pebble has inside its card,
          // and the line they left was narrower than the twelve characters quickLine.ts was
          // building into it. At 6 the pill still reads as a pill and the words get the room.
          paddingHorizontal: t.space.sm,
          gap: t.space.xs,
        },
      ]}
    >
      {alert?.level === 'late' ? (
        <View style={[styles.bang, { backgroundColor: t.color.dangerFill }]}>
          <AppText variant="meta" color={t.onGradient} style={styles.bangText}>
            !
          </AppText>
        </View>
      ) : null}
      {subLine}
    </View>
  ) : null;

  let body: ReactNode;
  if (resolvedShape === 'bubble') {
    const ring = alertInk ? 2.5 : 1;
    /*
      ONE VIEW. The tint is the circle's own background, composited to an OPAQUE color at the
      skin's tintAlpha, with the ring as its border and the hue shadow as an `elevation`.

      THE ALPHA IS `tintAlphaFor(…, false)` AND NOT `tintAlpha`. Glass's 55% buys "the lit ground
      reads through a soft tint" only where a blur evens that ground out first, and this disc
      carries no BlurView on any platform — it is a plain opaque view, by the argument below. So
      55% here was never translucency, it was a category hue diluted to 55% of itself against a
      lit ground made of the same four soft tokens: the one shape where the household's choice of
      color has the least to show for it, and the owner's "too similar to the background"
      (2026-09-18). At full strength the disc is the token the design system already measures
      every glyph and label against, so nothing about the ink changes with it.

      The opaque fill is not a simplification, it is the condition the shadow needs. Android
      draws an elevation shadow under the view as a coarsely tessellated ring straddling the
      outline; an opaque circle hides the inner half of that ring, a translucent one shows it
      through — a darker band inside the ring whose inner edge is the tessellation itself: the
      OCTAGON the owner photographed, through three versions that each fixed a different piece
      of radius arithmetic and could not have fixed this, because nothing in this file draws it.
      shadows.ts has the account and the other cure (a box-shadow, painted outside the box
      only), which Surface uses because a card wants to stay translucent; a 56pt disc over the
      flat ground loses nothing by being one opaque color.

      ITS GLASS GOES ON TOP OF THAT OPAQUE FILL, never under it (Android's Glass, 2026-10-01;
      theme/tileGlass.ts): drawn inside the ring, over the disc and under the picture — the sheen in
      the band above the picture, the shade in the band below it, the rim against the ring. The
      shadow under the disc still meets one opaque circle, and nothing under the picture changes.
    */
    const disc = cat.disc ?? composite(t.color.app, cat.soft, tintAlphaFor(t.skinTokens, false));
    // the bands inside the ring above and below the picture: where the disc's light may be
    const band = (QUICK_BUBBLE - 2 * ring - QUICK_BUBBLE_GLYPH) / 2;
    const glass = glassOf(disc, band);
    body = (
      <View style={[styles.bubble, { gap: t.space.sm, paddingVertical: t.space.xs }]}>
        <View
          style={[
            styles.circle,
            {
              backgroundColor: disc,
              borderColor: alertInk ?? composite(cat.disc ?? cat.soft, cat.fg, TINT_EDGE),
              borderWidth: ring,
            },
            t.skinTokens.surface.shadow === 'hue' && !t.isNight
              ? {
                  shadowColor: cat.fg,
                  shadowOpacity: 0.3,
                  shadowRadius: 12,
                  shadowOffset: { width: 0, height: 8 },
                  elevation: 3,
                }
              : null,
          ]}
        >
          {glass ? (
            <TileGlass glass={glass} radius={QUICK_BUBBLE / 2} edge={0} foot={band} />
          ) : null}
          <Icon name={icon} size={QUICK_BUBBLE_GLYPH} color={cat.fg} />
        </View>
        <AppText variant="bodySm" ink="text" align="center" style={styles.semibold}>
          {label}
        </AppText>
        {subLine}
        {chip}
      </View>
    );
  } else if (resolvedShape === 'pebble') {
    body = (
      <Surface
        radius="l"
        tint={cat.soft}
        hue={cat.fg}
        glass={glassOf(cat.soft)}
        style={[
          styles.pebble,
          { paddingVertical: t.space.lg, paddingHorizontal: t.space.sm },
          alertInk ? { borderColor: alertInk, borderWidth: 2 } : null,
        ]}
      >
        <View style={[styles.center, { gap: t.space.sm }]}>
          <View
            style={[
              styles.holder32,
              { backgroundColor: cat.disc ?? composite(cat.soft, cat.fg, 0.2) },
            ]}
          >
            <Icon name={icon} size={QUICK_PEBBLE_GLYPH} color={cat.fg} />
          </View>
          {/**
           * THE NAME AND ITS LINE ARE ONE THING, so they sit tighter to each other than either
           * does to the glyph (the owner, 2026-09-17: "the gap between the module name to the
           * timing info is too big/high. make the distance between the 2 rows closer"). One
           * `gap` across all three spaced "Bottle" from "Now · 4 oz" exactly as far as it
           * spaced the icon from the name, so the tile read as three stacked items rather than
           * a glyph above a two-line caption.
           */}
          <View style={[styles.center, { gap: t.space.xs }]}>
            <AppText variant="bodySm" ink="text" align="center" style={styles.bold}>
              {label}
            </AppText>
            {pill}
          </View>
        </View>
        {chip}
      </Surface>
    );
  } else {
    /*
      THE CAPSULE, MEASURED (`quickCapsule.ts`). The name at the size that fits its column — the
      phone's own, or smaller down to 11, on two lines at most, broken only between words — drawn
      with the phone's text scaling turned OFF, because the size already has it in it and scaling
      it again would undo the fit. The count at the end of the second row, beside the line when the
      line still says enough in the room it leaves and on a row of its own when not, so it is never
      drawn over the name. And no Text in here is held to a number of lines: a line the budget got
      wrong wraps rather than ending in "…".
    */
    const capsuleWords = capsuleTextWidth(tileNow, !!alertInk);
    const nameFit = capsuleLabelFit(label, capsuleWords, win.fontScale);
    const chipWide = tally.shown > 0 ? countChipWidth(Math.max(count, tally.shown), fontScale) : 0;
    const second = alert
      ? capsuleSecondRow(capsuleWords, chipWide, 'ui', metaSize, b =>
          tileAlert(alert.why, alert.short, b, sinceLabel === 'running' ? undefined : sinceLabel),
        )
      : capsuleSecondRow(capsuleWords, chipWide, 'mono', metaSize, b =>
          tileLine(sinceLabel, detail, b),
        );
    const capsuleChip = chipOf(styles.chipInRow);
    body = (
      <Surface
        radius="pill"
        tint={cat.soft}
        hue={cat.fg}
        // its line and its due and late words are on its body, never above its name's first line
        glass={glassOf(cat.soft, t.space.sm + nameFit.lineHeight)}
        style={[
          styles.capsule,
          { paddingVertical: t.space.sm, paddingLeft: t.space.sm, paddingRight: t.space.xl },
        ]}
      >
        <View style={[styles.capsuleRow, { gap: t.space.md }]}>
          <View
            style={[
              styles.holder36,
              { backgroundColor: cat.disc ?? composite(cat.soft, cat.fg, 0.2) },
              alertInk ? { borderColor: alertInk, borderWidth: 2.5 } : null,
            ]}
          >
            <Icon name={icon} size={QUICK_CAPSULE_GLYPH} color={cat.fg} />
          </View>
          <View style={styles.capsuleText}>
            <AppText
              variant="bodySm"
              ink="text"
              allowFontScaling={false}
              style={[styles.bold, { fontSize: nameFit.size, lineHeight: nameFit.lineHeight }]}
            >
              {label}
            </AppText>
            {second.line || capsuleChip ? (
              <View
                style={[styles.capsuleSecond, { columnGap: CAPSULE_CHIP_GAP, rowGap: t.space.xs }]}
              >
                {!second.line ? null : alert ? (
                  <AppText
                    variant="meta"
                    {...alertWords}
                    allowFontScaling={false}
                    style={[
                      styles.capsuleLine,
                      { fontSize: second.size },
                      prompt ? null : styles.bold,
                    ]}
                  >
                    {second.line}
                  </AppText>
                ) : (
                  <Numeric
                    variant="meta"
                    ink="text2"
                    allowFontScaling={false}
                    style={[styles.tracked, styles.capsuleLine, { fontSize: second.size }]}
                  >
                    {second.line}
                  </Numeric>
                )}
                {capsuleChip}
              </View>
            ) : null}
          </View>
        </View>
      </Surface>
    );
  }

  if (readOnly)
    return (
      <View
        accessible
        accessibilityLabel={spoken}
        onLayout={onTileLayout}
        style={styles.stretch}
        {...(testID ? { testID } : {})}
      >
        {body}
      </View>
    );

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      onPressIn={() => press(0.97)}
      onPressOut={() => press(1)}
      onLayout={onTileLayout}
      style={[styles.stretch, { opacity: disabled ? 0.5 : 1 }]}
      {...(testID ? { testID } : {})}
    >
      <Animated.View style={[styles.stretch, { transform: [{ scale: tileScale }] }]}>
        {body}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stretch: { alignSelf: 'stretch' },
  bubble: { alignItems: 'center', minWidth: QUICK_BUBBLE },
  circle: {
    width: QUICK_BUBBLE,
    height: QUICK_BUBBLE,
    borderRadius: QUICK_BUBBLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // `flexGrow` is what makes a scrolled row one height: the tallest tile sets it and the rest
  // fill to it, so More — which has no line under its label — is not a shorter box than Bottle
  // (the owner, 2026-09-16). In a grid the parent is content-height, so it changes nothing.
  pebble: { minHeight: QUICK_PEBBLE_MIN_HEIGHT, justifyContent: 'center', flexGrow: 1 },
  center: { alignItems: 'center', justifyContent: 'center' },
  holder32: {
    width: QUICK_HOLDER_PEBBLE,
    height: QUICK_HOLDER_PEBBLE,
    borderRadius: QUICK_HOLDER_PEBBLE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  holder36: {
    width: QUICK_HOLDER_CAPSULE,
    height: QUICK_HOLDER_CAPSULE,
    borderRadius: QUICK_HOLDER_CAPSULE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  capsule: { minHeight: QUICK_CAPSULE_MIN_HEIGHT, justifyContent: 'center', flexGrow: 1 },
  capsuleRow: { flexDirection: 'row', alignItems: 'center' },
  capsuleText: { flex: 1, minWidth: 0 },
  // the line and the count: one row while they fit side by side, the count wrapping under it when
  // they do not — never over it, and never over the name above
  capsuleSecond: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  // a line wider than the row wraps inside it rather than pushing the count off the capsule
  capsuleLine: { flexShrink: 1 },
  bold: { fontWeight: '700' },
  semibold: { fontWeight: '600' },
  /** quickScale.ts TILE_TRACKING: the monospace's own air, taken back off the line. */
  tracked: { letterSpacing: TILE_TRACKING },
  pill: { flexDirection: 'row', alignItems: 'center', minHeight: 22, maxWidth: '100%' },
  bang: {
    width: QUICK_BANG,
    height: QUICK_BANG,
    borderRadius: QUICK_BANG / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bangText: { fontWeight: '800', lineHeight: 14, fontSize: 11 },
  chip: {
    position: 'absolute',
    borderWidth: 1,
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  // on a capsule the chip is in the second row's flow, and as tall as the line it sits beside
  chipInRow: { position: 'relative', paddingVertical: 0 },
  // 11.5, not 10: at 10 the count was the smallest type on the screen and read as a smudge
  // (the owner, 2026-09-16: "the indications how many times it's done can be slightly bigger").
  // The chip is out of the flow, so its size costs no tile any room.
  chipText: { fontSize: 11.5, fontWeight: '700', lineHeight: 14 },
});
