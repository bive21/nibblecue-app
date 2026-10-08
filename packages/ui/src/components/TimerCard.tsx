/**
 * The NOW card (docs/DESIGN_SYSTEM.md §5 "TimerCard", §2 "Gradients": a RUNNING timer is the
 * one loud thing on the screen). Rich by type — sleep and tummy time on the sleep gradient,
 * a breastfeed on rose, pumping on milk — with the gradient's white ink in light and dark and
 * the amber text ink in night, where every gradient is already a dim pair.
 *
 * Elapsed is arithmetic on the row's timestamps (docs/MOBILE.md §6): a once-a-second tick
 * re-renders, it never accumulates. The digits tick, they never animate (§7). Secondary
 * lines on the gradient are the pure ink at full opacity — hierarchy by size, never by
 * opacity (§12 rule 2).
 *
 * THE SHAPE THE OWNER DREW (2026-09-16, with two screenshots): the state, the elapsed and the
 * start time down the left; the sleeping moon in the MIDDLE (`TimerArt`, decorative and hidden
 * from assistive technology); and the stop control as a solid PILL on the right, aligned to the
 * card's foot — mark and caption side by side, rather than a 52 ring with its caption beside it.
 *
 * IT IS A ROW, AND THAT IS THE WHOLE OF WHY IT IS SHORT. The first pass stacked the pill under
 * the words and the card came out 161 px tall for three lines of type (the owner, same day:
 * "the now module is too high. make it a lot shorter (like almost half). put the logo in the
 * middle, and the button on the right side with bottom alignment"). Beside the words, the pill
 * costs nothing: the card is the text block's height, 100 px, and a household running two
 * timers gets both above the fold instead of one.
 *
 * THE HEIGHT IS THE TEXT BLOCK'S, AND NOTHING ELSE CAN ADD TO IT. The motif is absolutely
 * positioned behind the words — so a wide caption ("Woke up") cannot squeeze it into a
 * taller box, and two cards running at once are exactly the same height whatever is in them
 * (the owner, 2026-09-16: "why is it taller than sleeping, make it height locked, and know
 * that text can go over the logo if needed"). Text over the motif is fine and intended: the
 * motif is at a fraction of the ink's opacity and carries nothing a reader needs.
 *
 * AND IT NAMES A CHILD ONLY WHEN THERE IS MORE THAN ONE. `childName` is optional now: a
 * one-baby household reads "Sleeping", not "Chiara F is sleeping" (the owner, same day), which
 * is a name they already know on a card about the only person it could be about. Two babies and
 * the name comes back, because then it is the fact that matters most.
 *
 * Accessibility (docs/MOBILE.md §9): the text block speaks as ONE element whose label is a
 * sentence — "Sleep timer, 1 hour 12 minutes, started 1:40 PM by Dana" — role `timer` on iOS,
 * a polite live region on Android, and the sentence moves on a 30 s bucket so a screen reader
 * is not interrupted each second. The labelled element is a transparent overlay on the block,
 * not the block itself: Android forwards every descendant text change to the nearest
 * live-region ancestor as a subtree change and TalkBack re-speaks the region each time, so
 * with the ticking digits INSIDE the region the 30 s bucket would be a fiction. The overlay
 * has no text children, its description changes only with the bucket, and it covers the
 * block so touch exploration still lands on the timer; the visual block is hidden from the
 * tree. The breastfeed pills are siblings of the labelled element, never children — an
 * accessible view is one element to VoiceOver and swallows any control inside it.
 *
 * AND A SLEEP'S CARD MOVES A LITTLE (the owner, 2026-09-26: *"makes the app look more fun"*), in a
 * layer over the picture and under the words (`TimerMotion`): "z"s drift up out of the air above
 * the sleeping baby — for every sleep, nap or night, since 2026-09-27 (*"yes show zzz at night
 * too"*). Decoration only — hidden from assistive technology, tied to no number — and still under
 * reduce motion and in the amber Night (`timerMotion.ts` has every number and every rule). The
 * pump's two bottles are gone (the same day: *"the pumping animation doesnot mean much, you can
 * remove this"*), and the moon's breath and the push-up went with the pictures they were measured
 * on. The stop itself is held, not tapped (`StopButton`, `stopHold.ts`), and carries
 * `${testID}.stop`.
 *
 * AND WHEN SEVERAL RUN AT ONCE, TWO OF THEM ARE THIS CARD (the owner, 2026-09-26: *"running more
 * than 3 timer at the same time makes the display full"*; 2026-09-27: *"the hero … should show 2
 * full background timer"*). Today draws the two started first as this card and folds the rest into
 * one "Also running" card of compact rows (`AlsoRunning`, `timerStack.ts`); the running sheet always
 * draws its own timer here, whole.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { artForTheme, artInkColor, type CardArt } from '../theme/artInk';
import { withAlpha } from '../theme/contrast';
import { Icon } from '../icons/Icon';
import { CardArtLayer } from './CardArtLayer';
import { useMotionAwake } from './MotionGate';
import { coverBorderBox } from './surfacePadding';
import { shadowFor } from './Surface';
import { StopButton, type TimerType } from './StopButton';
import { AppText, Display, Meta, Numeric } from './Text';
import { TimerArt } from './TimerArt';
import { TimerMotion } from './TimerMotion';
import {
  announceBucket,
  announceTimer,
  breastfeedTotals,
  formatClock,
  formatElapsed,
  TIMER_STOP_CAPTION,
  timerElapsed,
  timerStartedLine,
  timerSwitchLine,
  timerTitle,
  timerTotalsLine,
  type BreastfeedSides,
} from './timeFormat';

export type TimerSides = BreastfeedSides;

/**
 * THE ACTION ROW'S LAYOUT HEIGHT — geometry, not a token, and the number `layout.ts` in the app
 * budgets for the fold. It is 34 and it stays 34 (the Today polish brief, 2026-09-20: "card height
 * must not change"), while the controls in the row DRAW at 42 and 44: they overlap the row's
 * edges by a few points each side with negative vertical margins, into the card's own padding,
 * which is what a control sitting ON a card rather than IN a column looks like. hitSlop lifts
 * the target to 44+ either way.
 */
export const TIMER_PILL_HEIGHT = 34;
/** The side-switch pill as drawn: 42 tall, the brief's "42–44". */
export const TIMER_SWITCH_HEIGHT = 42;
/** The icon-only pause/resume disc as drawn: a 44 target on its own. */
export const TIMER_PAUSE_SIZE = 44;
/** The swap glyph before the side switch's words. */
export const TIMER_SWITCH_GLYPH = 16;
/** The overlay treatment: the ink at 22% with a 55% hairline — a control that reads as ON the card. */
export const TIMER_OVERLAY_FILL_ALPHA = 0.22;
export const TIMER_OVERLAY_EDGE_ALPHA = 0.55;
/** The motif's box, centred behind the card and clipped by it. */
const ART_WIDTH = 116;
const ART_HEIGHT = 96;

export interface TimerCardProps {
  type: TimerType;
  /** Epoch ms. */
  startedAt: number;
  pausedMs?: number;
  /** Breastfeeding only: per-side totals and which side is open. */
  sides?: TimerSides;
  /** Only in a household with more than one child: the card names no one otherwise. */
  childName?: string;
  startedByName?: string;
  /** An injectable clock (tests, stories). When absent the card ticks itself once a second. */
  now?: number;
  clock24: boolean;
  /** The person's own zone (`profiles.time_zone`); the device zone when omitted. */
  timeZone?: string;
  onStop: () => void;
  onSwitch?: () => void;
  onPause?: () => void;
  /** Breastfeeding's "Finish"; falls back to onStop. */
  onFinish?: () => void;
  /** Overrides the default caption ("Woke up", "Finish", "Stop"). */
  stopCaption?: string;
  /**
   * NO STOP BUTTON: a pump stopped in its own sheet, whose output form is right under the card
   * (the owner, 2026-10-06: "the button 'Enter output below' … serves no purpose. remove").
   */
  hideStop?: boolean;
  /**
   * THE OWNER'S OWN BACKGROUND for this card, replacing the gradient and the motif both (their
   * four files, 2026-09-18). `null` keeps the gradient alone, which is what every timer without
   * artwork still does. See `Card.art` and `CardArtLayer`.
   */
  art?: CardArt | null;
  /**
   * THE HOUSEHOLD'S OWN WORD for the module, when it has one: "Playtime" once a baby has
   * graduated from tummy time (`packages/core/src/modules/variants.ts`). The registry's word
   * when absent. It names the card and the timer in the live-region sentence and the stop
   * control's accessible name; the stop caption is the caller's as before.
   */
  typeLabel?: string;
  /**
   * THE STOP, HANDED OUT TO BE WRAPPED, and handed back unchanged by default: the first-run tour
   * marks the stop of the timer its first card started while it runs (the owner, 2026-09-28: *"if
   * user started something for step 1, make sure tutorial tells user to stop it too by holding the
   * button and save entry"*), and a mark has to sit inside the control it points at to ride a
   * scroll with it. The app's `TourSpot` is what goes round it; this package knows nothing of the
   * tour, as the tab bar's `wrapCell` knows nothing of it either.
   */
  wrapStop?: (stop: ReactNode) => ReactNode;
  /**
   * A tap on the card itself, not on stop, pause or the side switch. Today uses it for a running
   * sleep, the same sheet Also running already opens.
   */
  onOpen?: () => void;
  testID?: string;
}

const TYPE_LABEL: Record<TimerType, string> = {
  sleep: 'Sleep',
  breastfeed: 'Breastfeeding',
  pump: 'Pump',
  tummy: 'Tummy time',
};

/** The stop as it is, for every card nobody wraps (`wrapStop`). */
const passThrough = (stop: ReactNode): ReactNode => stop;

/**
 * Display tick only (MOBILE.md §6 rule 3): stopped in the background, re-read on resume.
 * Exported for the sticky timer bar, which counts the same seconds off the same rows.
 *
 * AND STOPPED WHILE ITS PAGE IS NOT IN FRONT (`useMotionAwake`; docs/DESIGN_SYSTEM.md §7.1). The
 * tabs stay mounted, so a nap timed on Today used to re-render its card every second for a parent
 * who had gone to the Schedule. Elapsed is arithmetic on the row's timestamps, so nothing is lost:
 * the moment the page is in front again (or the app is), the clock is read afresh and the digits
 * are right on the first frame. Reduce motion and Night do NOT stop it — digits are information,
 * and they tick rather than animate (§7).
 */
export function useTimerNow(injected: number | undefined): number {
  const awake = useMotionAwake();
  const [now, setNow] = useState(() => injected ?? Date.now());
  useEffect(() => {
    if (injected !== undefined || !awake) return;
    setNow(Date.now());
    return onSecond(setNow);
  }, [injected, awake]);
  return injected ?? now;
}

/*
  ONE SECOND HAND FOR EVERY RUNNING TIMER (the owner, 2026-10-06: "make sure app runs lightly").
  Each card, each "Also running" row and the sticky bar had an interval of its own, so two timers
  and the bar were three timers firing out of step — three commits a second, and digits that moved
  a few hundred milliseconds apart. Now one interval runs while anything is listening and hands the
  same instant to all of them in one callback, which React renders as one commit.
*/
const listeners = new Set<(ms: number) => void>();
let hand: ReturnType<typeof setInterval> | null = null;
function onSecond(listener: (ms: number) => void): () => void {
  listeners.add(listener);
  if (hand === null) {
    hand = setInterval(() => {
      const ms = Date.now();
      for (const l of listeners) l(ms);
    }, 1000);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && hand !== null) {
      clearInterval(hand);
      hand = null;
    }
  };
}

export function TimerCard({
  type,
  startedAt,
  pausedMs = 0,
  sides,
  childName,
  startedByName,
  now: injectedNow,
  clock24,
  timeZone,
  onStop,
  onSwitch,
  onPause,
  onFinish,
  stopCaption,
  hideStop = false,
  testID,
  art,
  typeLabel,
  wrapStop,
  onOpen,
}: TimerCardProps) {
  const t = useTheme();
  const now = useTimerNow(injectedNow);
  const kindLabel = typeLabel ?? TYPE_LABEL[type];
  /**
   * THE PICTURE THIS THEME DRAWS, by `Card`'s own rule (`artForTheme`): the owner's in light and in
   * dark, where every timer picture is drawn for white words already (a shade deeper there,
   * `CardArtLayer`), and in the amber Night its Night version (2026-09-29), the same drawing dim in
   * the module's one amber tone, since a full-bleed rose is the brightest thing the app could hand
   * someone at 3 a.m. A build without that version falls back to the dim gradient pair and its
   * motif, as Night always did.
   */
  const picture = artForTheme(art, t.theme);
  // the ink belongs to the GROUND, and over artwork the ground is the owner's, not the theme's
  const ink = picture ? artInkColor(picture.ink) : t.isNight ? t.color.text : t.onGradient;
  const gradient =
    type === 'breastfeed' ? t.gradient.rose : type === 'pump' ? t.gradient.milk : t.gradient.sleep;
  const hue = gradient[1];

  const totals = type === 'breastfeed' && sides ? breastfeedTotals(sides, now) : null;
  const elapsedMs = totals ? totals.totalMs : timerElapsed(startedAt, pausedMs, now);
  const startedClock = formatClock(startedAt, clock24, timeZone);

  // what is happening, in the fewest words that are still true (`timerTitle` says why the
  // child's name is there only when the household has more than one)
  const title = timerTitle(type, childName, typeLabel);

  // the live-region sentence moves on a 30 s bucket, never with the tick: it is recomputed
  // from the bucket rather than from `now`, so the memo's inputs are the sentence's inputs
  const bucket = announceBucket(now);
  const announcement = useMemo(
    () =>
      announceTimer({
        typeLabel: kindLabel,
        elapsedMs:
          type === 'breastfeed' && sides
            ? breastfeedTotals(sides, bucket).totalMs
            : timerElapsed(startedAt, pausedMs, bucket),
        startedClock,
        ...(startedByName ? { byName: startedByName } : {}),
      }),
    [kindLabel, type, sides, startedAt, pausedMs, bucket, startedClock, startedByName],
  );

  const shadow: ViewStyle = shadowFor(t.skinTokens.surface, hue, t.isNight);
  // kept between ticks, so the memoized picture layer is not handed a new box every second
  const artCover = useMemo(() => coverBorderBox(0, t.radius.m), [t.radius.m]);
  /**
   * THE OVERLAY PILL (the Today polish brief, 2026-09-20): the ink at 22% over the gradient with a
   * 55% hairline of the same ink, so the control reads as a translucent thing sitting on the
   * card. On a light or dark theme that ink is the gradient's white; in night it is the amber
   * text ink, which keeps the room dim. The pill draws 42 tall in a row whose layout height is
   * 34 (`TIMER_PILL_HEIGHT` says why): the 4pt it overhangs on each side lands in the card's own
   * padding and moves nothing.
   */
  // kept between ticks (as `artCover` is): rebuilt only when the ink or the theme changes, so
  // the one-second render hands the native views the same styles and the same gradient
  const { pill, disc } = useMemo(() => {
    const overlay: ViewStyle = {
      backgroundColor: withAlpha(ink, TIMER_OVERLAY_FILL_ALPHA),
      borderWidth: 1,
      borderColor: withAlpha(ink, TIMER_OVERLAY_EDGE_ALPHA),
    };
    return {
      pill: {
        ...overlay,
        borderRadius: t.radius.pill,
        paddingHorizontal: t.space.xl,
        minHeight: TIMER_SWITCH_HEIGHT,
        marginVertical: -(TIMER_SWITCH_HEIGHT - TIMER_PILL_HEIGHT) / 2,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: t.space.sm,
      } satisfies ViewStyle,
      disc: {
        ...overlay,
        width: TIMER_PAUSE_SIZE,
        height: TIMER_PAUSE_SIZE,
        borderRadius: TIMER_PAUSE_SIZE / 2,
        marginVertical: -(TIMER_PAUSE_SIZE - TIMER_PILL_HEIGHT) / 2,
        alignItems: 'center',
        justifyContent: 'center',
      } satisfies ViewStyle,
    };
  }, [ink, t.radius.pill, t.space.xl, t.space.sm]);
  const gradientColors = useMemo(() => [...gradient] as const, [gradient]);

  const shellStyle = [
    styles.card,
    // its own fill under the gradient: an elevated box with no background has a
    // rectangular outline on Android, and its shadow shows as a square behind the card
    {
      borderRadius: t.radius.m,
      padding: t.space.lg,
      gap: t.space.md,
      backgroundColor: gradient[0],
    },
    shadow,
  ];
  // accessible false so stop, pause and the side switch stay their own controls. A tap that
  // starts on the card and not on those controls opens the sheet.
  const Shell = onOpen ? Pressable : View;
  return (
    <Shell
      style={shellStyle}
      {...(onOpen ? { accessible: false as const, onPress: onOpen } : {})}
      {...(testID ? { testID } : {})}
    >
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: t.radius.m }]}
      />
      {/* THE OWNER'S PICTURE, over the gradient and under every word. The gradient stays under
          it deliberately: it is what the card shows for the frame or two before a bundled image
          decodes, and a rose card that flashes white first is worse than one that never had a
          picture.

          IT FILLS THE CARD'S OWN BOX, AND NOT A POINT MORE. Yoga offsets an absolute child by
          its parent's BORDER only — never by its padding (yoga/algorithm/AbsoluteLayout.cpp:
          `top` + `computeInlineStartBorder`) — so `top: 0` inside this padded, borderless card
          is the card's own edge, and the LinearGradient above, which has always used
          `absoluteFill`, has always reached it. The layer was briefly pulled out by the padding
          on the belief that Yoga insets it, and that outset painted the picture 11pt OUTSIDE the
          card on every side: two running cards overlapped, each looked 22pt taller and wider
          than its layout, and the owner sent the screenshot (2026-09-18: "the breastfeeding and
          sleeping tabs are too big and overlapping"). A border width of 0 is the honest input
          to `coverBorderBox`, and it hands back the radius unchanged. */}
      {picture ? <CardArtLayer art={picture} cover={artCover} /> : null}
      {/* THE MIDDLE: the motif, behind the words and out of the layout entirely, so nothing it
          is or is not can change the card's height. It never speaks (`TimerArt` says why it is
          drawn), and the clip lives on this layer rather than on the card — a view that hides
          its overflow hides its own shadow with it (`shadows.ts`).

          IT GIVES WAY TO A PICTURE. The motif is the app's stand-in for an illustration; the
          owner's artwork IS the illustration, and drawing both puts a flat moon on top of a
          drawn one. */}
      {picture ? null : (
        <View
          pointerEvents="none"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, styles.art, { borderRadius: t.radius.m }]}
        >
          <TimerArt type={type} color={ink} width={ART_WIDTH} height={ART_HEIGHT} />
        </View>
      )}
      {/* THE SMALL MOVE, over the picture and under every word: a sleep's "z"s. It draws nothing
          where nothing moves. */}
      <TimerMotion type={type} art={picture} radius={t.radius.m} />
      {/* THE WORDS ARE NOT CAPPED HERE, though the picture's measured content column would allow
          it. The cap wrapped the breastfeed totals line onto a second row, which made the card
          taller, which made the (height-fitted) picture larger and its crop deeper — the exact
          "size is too big" the owner saw. The body is bounded by the stop pill beside it, which on
          the rose is roughly the column the rose was measured to.

          IT IS NOT ON THE PICTURES OF 2026-09-26, whose drawings begin a third of the way across:
          "12m 05s" alone is 130 pt at 31, and its last glyph lands on the sleeping baby's cloud,
          where the veil has all but faded. So the words are measured where they LAND rather than
          where the column ends — every line of this block is a box in `theme/artWords.ts`, and
          `pnpm check:card-art` reads the owner's pixels under each box at every phone width. A
          line added here is a box added there, or the check cannot see it. The stash and shopping
          cards keep their cap in `Card`, where 72% is generous and nothing beside the words is
          competing. */}
      <View style={[styles.body, { gap: t.space.sm }]}>
        <View style={styles.block}>
          <View
            style={{ gap: t.space.xs }}
            importantForAccessibility="no-hide-descendants"
            accessibilityElementsHidden
          >
            <AppText variant="h2" color={ink} numberOfLines={1}>
              {title}
            </AppText>
            {/* the prototype's line-height: 1 — the numeral sits tight so the card stays the content's height */}
            <Display color={ink} style={{ lineHeight: t.type.display.fontSize }}>
              {formatElapsed(elapsedMs, 'live')}
            </Display>
            {totals ? (
              <Numeric variant="meta" color={ink}>
                {timerTotalsLine(totals, sides?.active)}
              </Numeric>
            ) : null}
            <Meta color={ink}>{timerStartedLine(startedClock, startedByName)}</Meta>
          </View>
          <View
            accessible
            accessibilityLabel={announcement}
            {...(Platform.OS === 'ios' ? { accessibilityRole: 'timer' as const } : {})}
            {...(Platform.OS === 'android' ? { accessibilityLiveRegion: 'polite' as const } : {})}
            pointerEvents="none"
            style={StyleSheet.absoluteFill}
          />
        </View>
        {type === 'breastfeed' && (onSwitch || onPause) ? (
          <View style={[styles.actions, { gap: t.space.md, minHeight: TIMER_PILL_HEIGHT }]}>
            {/* THE SIDE SWITCH: the swap glyph, then the words, on the overlay pill. Same place,
                same behaviour as before; only the treatment changed (the brief, 2026-09-20). */}
            {onSwitch ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={timerSwitchLine(sides?.active)}
                onPress={onSwitch}
                hitSlop={t.space.xs}
                style={({ pressed }) => [pill, { opacity: pressed ? 0.8 : 1 }]}
              >
                <Icon name="move" size={TIMER_SWITCH_GLYPH} color={ink} />
                <AppText variant="bodySm" color={ink} style={styles.pillText}>
                  {timerSwitchLine(sides?.active)}
                </AppText>
              </Pressable>
            ) : null}
            {/* PAUSE IS A GLYPH: the two bars, or the play triangle while paused, in a 44 disc of
                the same overlay. The spoken name still says the word — "Pause" / "Resume" — and
                the sticky timer bar keeps its own control with the same names. */}
            {onPause ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={sides?.active ? 'Pause' : 'Resume'}
                onPress={onPause}
                style={({ pressed }) => [disc, { opacity: pressed ? 0.8 : 1 }]}
              >
                <Icon name={sides?.active ? 'pause' : 'play'} size={18} color={ink} />
              </Pressable>
            ) : null}
          </View>
        ) : null}
      </View>
      {/* THE RIGHT, at the foot: the one control that ends the record */}
      {hideStop ? null : (
        <View style={styles.stopRow}>
          {(wrapStop ?? passThrough)(
            <StopButton
              caption={stopCaption ?? TIMER_STOP_CAPTION[type]}
              onPress={type === 'breastfeed' && onFinish ? onFinish : onStop}
              layout="pill"
              onGradient
              module={type}
              translucent={picture !== null}
              accessibilityLabel={`${stopCaption ?? TIMER_STOP_CAPTION[type]}, ends the ${kindLabel.toLowerCase()} timer`}
              {...(testID ? { testID: `${testID}.stop` } : {})}
            />,
          )}
        </View>
      )}
    </Shell>
  );
}

const styles = StyleSheet.create({
  // THREE COLUMNS, and every one of them bottom-aligned to the card's foot (the owner,
  // 2026-09-16): the words, the motif, the button. The card's height is the words' height,
  // which is what halved it — stacking the button under them cost 61 px for nothing.
  card: { flexDirection: 'row', alignItems: 'flex-end', overflow: 'visible' },
  body: { flex: 1, minWidth: 0 },
  // relative, so the labelled overlay can fill exactly the text block
  block: { alignSelf: 'stretch' },
  // centred across the card, sitting on its foot, behind everything
  art: { alignItems: 'center', justifyContent: 'flex-end', overflow: 'hidden' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  stopRow: { flexShrink: 0 },
  pillText: { fontWeight: '600' },
});
