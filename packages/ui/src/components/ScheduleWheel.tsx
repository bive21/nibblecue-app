/**
 * THE SCHEDULE WHEEL — the day as a ring, drawn once and used twice (the owner, 2026-09-21, with
 * a mockup): as a PREVIEW at the end of setup, and as the LIVE day on Routine. The two differ in
 * the badge they wear, the words around them and whether a stop opens anything; the picture is
 * this file, and there is deliberately no second implementation of it anywhere.
 *
 * WHAT IT DRAWS, from the outside in:
 *
 *  · a hairline ring, split into the waking arc and the night arc. The night takes the top and
 *    wears the sleep tint, which is the same pair `DayCard`'s strip uses — so the two pictures of
 *    the household's day mean the same thing without a legend between them.
 *  · the sun and the moon on the two ends of the waking arc, each with its time beside it.
 *  · one HOUSE per stop, sitting ON the ring like a bead on a string, carrying one small colored
 *    disc per activity SIDE BY SIDE — the owner, 2026-09-21, on the first build's overlapping
 *    dots: *"put them under the same house, and just how the module icons paralleled"*. Which
 *    activities share a house is `layoutWheel`'s decision, not this file's: the hour a parent
 *    reads as one round, then whatever the ring's own scale cannot keep apart.
 *  · the time just outside the house. `layoutWheel` decides which stops are too close to caption
 *    at all; a crowded one keeps its house and loses its words, never the other way round.
 *  · the middle: a figure, a caption, and up to two pills naming the rhythms behind the ring.
 *
 * THE GEOMETRY IS NOT IN HERE. Every angle comes from `@nibblecue/core`'s `layoutWheel`, which is
 * pure and tested in node; this file turns degrees into points and points into views. That seam
 * is the reason the collision rule can be proved rather than eyeballed.
 *
 * NOTHING IS SAID BY COLOR ALONE (CLAUDE.md §6): every stop writes its own time, every bubble
 * carries a glyph, the two ends carry a word, and the whole ring has one spoken description built
 * by the caller — the ring itself is `accessibilityElementsHidden`, because a screen reader
 * hearing eleven unlabeled dots learns nothing.
 *
 * A STOP MOVES RATHER THAN BLINKING. `WheelStopView` springs from wherever it was to wherever it
 * now is, so a slot the engine pushed later slides round the ring — and holds still under reduced
 * motion, where an animation is the thing the reader asked not to have.
 *
 * THE PREVIEW CAN DRAW ITSELF, ONCE (`entrance`; the owner, 2026-09-26, of setup's "How often?").
 * Asked to, the ring waits undrawn until the caller says `draw`, then sweeps clockwise from the sun
 * and pops every house on as the sweep reaches it, the moon at bedtime and the middle's words
 * first (`wheelDraw.ts` has the plan and every number). `rest` is the default and is exactly the
 * wheel as it always was: Routine never asks, and nothing on the live ring moves because of this.
 * The two arcs are drawn by a dash on the JavaScript driver (a path prop — `tickDraw.ts` says why),
 * everything else by one native clock; under reduce motion and in the amber Night the ring is
 * simply drawn.
 */
import { WHEEL_DIRECTION, type ModuleId, type WheelLayout, type WheelStop } from '@nibblecue/core';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useCategory, useTheme } from '../theme/ThemeProvider';
import { Icon, iconForModule } from '../icons/Icon';
import { ILLUSTRATED_MIN_SIZE } from '../icons/illustrated';
import { num, type AnimatedStyle } from './PictureToggle';
import { AppText, BodySm, Meta } from './Text';
import { motionStill } from './tickDraw';
import {
  arcFrames,
  arcLength,
  hubFrames,
  popWindowFrames,
  wheelDrawPlan,
  WHEEL_SWEEP_EASE,
  WHEEL_SWEEP_MS,
  type ArcDraw,
  type WheelEntrance,
} from './wheelDraw';
import { WheelHand } from './WheelHand';
import { nowBearing } from './wheelHand';

/** How a wheel is drawn: at rest (the default), waiting to be drawn in, or drawing itself in. */
export type { WheelEntrance } from './wheelDraw';
import {
  arcPath,
  wheelPoint,
  placeCaptions,
  CAPTION_H_ONE,
  CAPTION_WIDTH,
  HOUSE_H,
  type CaptionPlacement,
  type WheelHouse,
} from './wheelGeometry';

/** The ring's own thickness. A hairline reads as a guide; this reads as a track. */
const RING = 3;
/**
 * THE THREE RADII, AS FRACTIONS OF THE BOX, so the whole wheel scales with the card and the
 * clearances hold at every width. They were numbers once and the numbers collided on a narrow
 * phone: the middle grew into the bubbles.
 *
 *   · the RING at 0.36 of the box — the mockup's proportion, and what leaves room outside it;
 *   · a caption just outside its house — beside it at the sides, above or below it at the top
 *     and the foot (`captionBox`), and never past the edge of the box;
 *   · the MIDDLE 28 inside the ring, which clears a bubble's inner edge by half its own height.
 */
const RING_FRACTION = 0.34;
const HUB_IN = 28;
/** The sun and the moon sit further out than a stop's caption, so the two never share a line. */
/**
 * The sun and the moon are discs ON the ring, like every other house, and their captions are
 * placed from their own edge by the same pass. They used to be drawn at a fixed 48 points
 * further out with a caption clamped beside them, which is how "7:00 AM Wake" came to sit on
 * top of a stop's house at the top left of the owner's ring.
 */
const END_D = 26;
/** Below this the wheel is a smudge, so the card gives it a floor and lets the page scroll. */
const MIN_SIZE = 250;
const MAX_SIZE = 360;

/**
 * THE HOUSE — one stop's container, whatever is in it.
 *
 * Every stop draws the same capsule: an opaque bead the ring passes behind, with one small disc
 * per activity inside it, in that activity's own hue, laid out in a row. A stop with one thing in
 * it is a circle; a stop with three is a capsule three discs wide. That is the whole of the
 * owner's fix — the first build overlapped the discs by eight points to save room and the result,
 * on their phone, was a smudge with three captions printed through it.
 *
 * THE SIZES ARE BOUNDED BY THE RING, not by taste. Two stops an hour apart in the waking day are
 * about 23° of arc apart, which at phone width is a little under fifty points of chord; a house of
 * at most three cells is sixty-six wide, so the third cell becomes a COUNT rather than a fourth
 * disc and a busy hour stays one readable bead instead of a row of them.
 *
 * `HOUSE_H`, `CAPTION_WIDTH` and `CAPTION_H` are imported rather than declared here: `captionBox`
 * needs the same three numbers this file's rendering does, and a second copy of any of them is a
 * second place to change when the first one moves (`wheelGeometry.ts`).
 */
const CELL = 18;
/**
 * THE OWNER'S PICTURE, NOT THE OLD GLYPH (2026-09-26: *"Why does the Web use old icon?? Remove
 * this everywhere."*). The house's disc drew an 11 pt line glyph — the only module icon left in
 * the app below the size `Icon` draws the owner's picture at. At the picture threshold it is the
 * picture every other surface shows, filling its 18 pt soft disc with a hairline of hue around it.
 */
const CELL_ICON = ILLUSTRATED_MIN_SIZE;
const CELL_GAP = 2;
const HOUSE_PAD = 4;
const COUNT_W = 16;
/** The space between a done stop's check and its time. */
const CHECK_GAP = 3;
/** A caption's alignment as a row's main axis — the check travels with the words. */
const ALIGN_TO_FLEX = {
  left: 'flex-start',
  center: 'center',
  right: 'flex-end',
} as const;
const MAX_CELLS = 3;

/** An arc's dash offset can be driven; `Path`'s own props cannot. */
const AnimatedPath = Animated.createAnimatedComponent(Path);
const SWEEP_EASE = Easing.bezier(...WHEEL_SWEEP_EASE);

/** What an entrance hands a house, a caption, an end or the middle: its pop, or nothing at rest. */
interface Enter {
  body: AnimatedStyle;
  caption: AnimatedStyle;
}

export interface ScheduleWheelPill {
  key: string;
  activity: ModuleId;
  label: string;
}

export interface ScheduleWheelProps {
  layout: WheelLayout;
  /** `HH:MM` → the phone's own clock. The wheel never decides 12 or 24 hour. */
  clockOf: (hhmm: string) => string;
  /** The figure in the middle and the line under it — "12h 30m" / "Wake to bedtime". */
  centerValue: string;
  centerCaption: string;
  /** Up to two rhythms named in the middle, each with its own glyph. */
  pills?: readonly ScheduleWheelPill[];
  /** The words on the two ends of the waking arc. */
  wakeWord: string;
  bedWord: string;
  /** The word under a stop's time, where it has one — a medicine's name, "Bath". */
  noteOf?: (stop: WheelStop) => string | undefined;
  /** What a reader hears for one stop. The caller owns the module words, so it owns this. */
  nameOf: (stop: WheelStop) => string;
  /** One sentence describing the whole ring, for a reader who cannot see it. */
  accessibilityLabel: string;
  /** Live mode only: tapping a stop opens the editor behind it. */
  onPressStop?: (stop: WheelStop) => void;
  /** What a reader hears about what the tap will do — "Opens this rhythm". */
  pressHint?: string;
  /** What an empty ring says instead of drawing nothing. */
  emptyLine?: string;
  /**
   * THE PREVIEW'S ENTRANCE (`wheelDraw.ts`): `rest`, the default, draws the ring as it always was;
   * `waiting` holds it undrawn; `draw` draws it in, once, and it stays drawn. Setup's preview only.
   */
  entrance?: WheelEntrance;
  /**
   * NOW, in minutes since local midnight — TODAY's live ring only. Given, a clock hand runs from
   * under the hub to the minute on the ring, sweeping there from the wake mark as the ring appears
   * (`WheelHand`). Absent — the default, and what the setup preview and any other day pass — there
   * is no hand at all.
   */
  nowMinutes?: number | null | undefined;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function ScheduleWheel({
  layout,
  clockOf,
  centerValue,
  centerCaption,
  pills = [],
  wakeWord,
  bedWord,
  noteOf,
  nameOf,
  accessibilityLabel,
  onPressStop,
  pressHint,
  emptyLine,
  entrance = 'rest',
  nowMinutes = null,
  style,
  testID = 'wheel',
}: ScheduleWheelProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = Math.round(e.nativeEvent.layout.width);
    setWidth(prev => (prev === w ? prev : w));
  };

  const size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, width || MIN_SIZE));
  const c = size / 2;
  const r = size * RING_FRACTION;
  const hub = r - HUB_IN;
  /**
   * NOTHING IS DRAWN UNTIL THE BOX HAS BEEN MEASURED.
   *
   * Every stop holds its position in an animated value that springs to wherever the geometry
   * says it now is — which is the point of the thing (a slot the engine moves slides round the
   * ring). Drawn at the fallback size first and then re-measured, that spring fires on MOUNT and
   * the whole ring visibly expands into place, once, for no reason. One frame of an empty box is
   * cheaper and says nothing false.
   */
  const measured = width > 0;

  const night = t.color.sleepSoft;
  const dayTrack = t.color.line;

  /* THE TWO ARCS. The waking one is the ring's own line; the night one is the sleep tint, wider,
     so the change of scale the geometry makes (core's `wheel.ts` says why) is visible. */
  const wakeDeg = layout.wakeDeg;
  const bedDeg = layout.bedDeg;

  /**
   * EVERY CAPTION ON THE RING IS PLACED AT ONCE, HERE, BEFORE ANYTHING IS DRAWN.
   *
   * It used to be each stop's own business: `captionBox` took one house and returned a box beside
   * it, and a stop that cleared its OWN house knew nothing about the house of the stop forty
   * minutes later, about the caption already standing where it wanted to go, or about the sun and
   * the moon. Worse, a box that ran past the card's edge was clamped back inside it — which at the
   * ring's right flank put it straight back on top of the house it had just cleared. That is the
   * owner's screenshot of 2026-09-22: "3:15 PM", "5:15 PM" and "7:15 PM" printed through their own
   * houses, on a ring built from ordinary two-hour intervals.
   *
   * `placeCaptions` knows every house rectangle before it places any caption, tries a stop's
   * outward side and then above, below and inward, and takes the first that lands inside the card
   * clear of every house and every caption already standing. The sun and the moon go first and are
   * never dropped; a stop that fits nowhere keeps its house and loses its words.
   */
  const houses: WheelHouse[] = useMemo(() => {
    const ends: WheelHouse[] = [
      {
        deg: wakeDeg,
        ...wheelPoint(wakeDeg, r, c, c),
        width: END_D,
        priority: 0,
        required: true,
        compactHeight: CAPTION_H_ONE,
      },
      {
        deg: bedDeg,
        ...wheelPoint(bedDeg, r, c, c),
        width: END_D,
        priority: 0,
        required: true,
        compactHeight: CAPTION_H_ONE,
      },
    ];
    /* A stop core has already hidden (its time would be a lie at this angle) is a house with no
       caption to place — it still has to be AVOIDED, so it goes in the list and simply asks for
       nothing. A busier stop outranks a quieter one: where only one of two can be captioned, the
       one standing for three things says more than the one standing for one. */
    const stops: WheelHouse[] = layout.stops.map(stop => ({
      deg: stop.deg,
      ...wheelPoint(stop.deg, r, c, c),
      width: houseWidth(cellsOf(stop.activities)),
      priority: stop.labelHidden ? Number.POSITIVE_INFINITY : 1 - stop.entries.length / 100,
      // crowded, it keeps its time and leaves the "to 6:30 PM" line out, before losing both
      compactHeight: CAPTION_H_ONE,
    }));
    return [...ends, ...stops];
  }, [layout.stops, wakeDeg, bedDeg, r, c]);

  // the hub is an obstacle too: it is drawn over the captions, so one standing on it is cut off
  const placements = useMemo(
    () => placeCaptions(houses, size, { x: c, y: c, r: hub }),
    [houses, size, c, hub],
  );
  const stopPlacement = (i: number): CaptionPlacement | null =>
    layout.stops[i]?.labelHidden === true ? null : (placements[i + 2] ?? null);

  /*
    THE ENTRANCE (`wheelDraw.ts`). Two values, both 1 at rest — the ring drawn — and both held at 0
    while an entrance waits: `sweep` draws the two arcs by their dashes (the JavaScript driver: a
    path prop) and `clock` pops everything else, each in its own window (the native driver). The
    entrance plays once: `drawn` latches, and a wheel that has been seen drawn — played through,
    cut short, or shown at rest because nothing may move — is never drawn again.
  */
  const animate = entrance !== 'rest' && !still;
  const sweep = useRef(new Animated.Value(entrance === 'rest' ? 1 : 0)).current;
  const clock = useRef(new Animated.Value(entrance === 'rest' ? 1 : 0)).current;
  const drawn = useRef(entrance === 'rest');
  const plan = useMemo(
    () =>
      wheelDrawPlan(
        wakeDeg,
        bedDeg,
        layout.stops.map(s => ({ key: s.key, deg: s.deg })),
        WHEEL_DIRECTION,
      ),
    [wakeDeg, bedDeg, layout.stops],
  );
  // read by the effect when it starts, never a reason to restart one: a ring re-laid out mid-draw
  // pops its houses where they now are, on the clock that is already running
  const planMs = useRef(plan.totalMs);
  planMs.current = plan.totalMs;
  useLayoutEffect(() => {
    if (entrance === 'rest' || still || drawn.current) {
      drawn.current = true;
      sweep.setValue(1);
      clock.setValue(1);
      return;
    }
    // waiting, or asked to draw before the box has been measured: nothing drawn yet
    sweep.setValue(0);
    clock.setValue(0);
    if (entrance === 'waiting' || !measured) return;
    const run = Animated.parallel([
      Animated.timing(sweep, {
        toValue: 1,
        duration: WHEEL_SWEEP_MS,
        easing: SWEEP_EASE,
        // a dash offset is a prop of the path, not a style: the native driver cannot carry it
        useNativeDriver: false,
      }),
      Animated.timing(clock, {
        toValue: 1,
        duration: planMs.current,
        // every pop's frames carry their own easing, in their own window of this clock
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]);
    run.start(({ finished }) => {
      if (finished) drawn.current = true;
    });
    // reduce motion, Night, or the ring going away mid-draw: drawn, never half way
    return () => {
      run.stop();
      drawn.current = true;
      sweep.setValue(1);
      clock.setValue(1);
    };
  }, [entrance, still, measured, sweep, clock]);

  const enter = useMemo(() => {
    if (!animate) return null;
    const pop = (at: number): Enter => {
      const f = popWindowFrames(at, plan.totalMs);
      const opacity = num(clock, f.opacity);
      return {
        body: { opacity, transform: [{ scale: num(clock, f.scale) }] },
        caption: { opacity },
      };
    };
    const h = hubFrames(plan.totalMs);
    const arcs = arcFrames(
      plan.dayShare,
      { length: arcLength(wakeDeg, bedDeg, r, WHEEL_DIRECTION), stroke: RING },
      { length: arcLength(bedDeg, wakeDeg, r, WHEEL_DIRECTION), stroke: RING * 4 },
    );
    return {
      sun: pop(0),
      moon: pop(plan.moonAt),
      stops: new Map(plan.stops.map(s => [s.key, pop(s.at)])),
      hub: { opacity: num(clock, h.opacity), transform: [{ scale: num(clock, h.scale) }] },
      day: arcs.day,
      night: arcs.night,
    };
  }, [animate, plan, clock, wakeDeg, bedDeg, r]);

  /** One arc: drawn in by its dash while an entrance is asked for, and plainly otherwise. */
  const arc = (d: string, stroke: string, strokeWidth: number, drawIn: ArcDraw | null) =>
    drawIn === null ? (
      <Path d={d} stroke={stroke} strokeWidth={strokeWidth} strokeLinecap="round" fill="none" />
    ) : (
      <AnimatedPath
        d={d}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        fill="none"
        strokeDasharray={[...drawIn.dasharray]}
        strokeDashoffset={num(sweep, drawIn.offset)}
      />
    );

  return (
    <View
      onLayout={onLayout}
      style={[styles.wrap, style]}
      accessible
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <View
        style={{ width: size, height: size }}
        /* the picture is decorative: its facts are the label above and the rows the card draws */
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        {measured ? (
          <>
            <Svg width={size} height={size} style={StyleSheet.absoluteFill}>
              {/* THE NIGHT FIRST, WIDER AND SOFTER, then the waking track over it: the day is the
              line a parent follows and the night is the band it passes through. */}
              {arc(
                arcPath(bedDeg, wakeDeg, r, c, c, WHEEL_DIRECTION),
                night,
                RING * 4,
                enter?.night ?? null,
              )}
              {arc(
                arcPath(wakeDeg, bedDeg, r, c, c, WHEEL_DIRECTION),
                dayTrack,
                RING,
                enter?.day ?? null,
              )}
            </Svg>

            {/* NOW, UNDER EVERYTHING ELSE: drawn straight after the track, so every house, both
                ends, every caption and the hub are drawn over it — the hand can pass behind a word
                but never across one. Today's ring only (`nowMinutes`); off by default. */}
            {nowMinutes === null ? null : (
              <WheelHand
                size={size}
                c={c}
                r={r}
                hub={hub}
                wakeDeg={wakeDeg}
                deg={nowBearing(layout, nowMinutes)}
                testID={`${testID}.now`}
              />
            )}

            {/* THE TWO ENDS, each a small disc with its word and its time beside it */}
            <EndMark
              deg={wakeDeg}
              r={r}
              c={c}
              placement={placements[0] ?? null}
              icon="sun"
              word={wakeWord}
              time={clockOf(layout.window.wake)}
              tint={t.color.milkSoft}
              ink={t.color.milk}
              {...(enter ? { enter: enter.sun } : {})}
              testID={`${testID}.wake`}
            />
            <EndMark
              deg={bedDeg}
              r={r}
              c={c}
              placement={placements[1] ?? null}
              icon="moon"
              word={bedWord}
              time={clockOf(layout.window.bed)}
              tint={t.color.sleepSoft}
              ink={t.color.sleep}
              {...(enter ? { enter: enter.moon } : {})}
              testID={`${testID}.bed`}
            />

            {layout.stops.map((stop, i) => {
              const pop = enter?.stops.get(stop.key);
              return (
                <WheelStopView
                  key={stop.key}
                  stop={stop}
                  r={r}
                  c={c}
                  placement={stopPlacement(i)}
                  clockOf={clockOf}
                  note={noteOf?.(stop)}
                  name={nameOf(stop)}
                  {...(pressHint === undefined ? {} : { hint: pressHint })}
                  {...(onPressStop ? { onPress: () => onPressStop(stop) } : {})}
                  {...(pop === undefined ? {} : { enter: pop })}
                  testID={`${testID}.stop.${stop.hhmm}`}
                />
              );
            })}

            {/* THE MIDDLE: the figure, its caption, and the rhythms behind the ring */}
            <Animated.View
              style={[
                styles.hub,
                {
                  width: hub * 2,
                  height: hub * 2,
                  left: c - hub,
                  top: c - hub,
                  borderRadius: hub,
                  backgroundColor: t.color.accentSoft,
                  gap: t.space.xs,
                  padding: t.space.lg,
                },
                enter?.hub,
              ]}
              testID={`${testID}.hub`}
            >
              {layout.stops.length === 0 && emptyLine !== undefined ? (
                <BodySm ink="text2" align="center">
                  {emptyLine}
                </BodySm>
              ) : (
                <>
                  <AppText variant="figure" numeric style={styles.center}>
                    {centerValue}
                  </AppText>
                  <Meta align="center">{centerCaption}</Meta>
                  {pills.slice(0, 2).map(p => (
                    <WheelPill key={p.key} pill={p} />
                  ))}
                </>
              )}
            </Animated.View>
          </>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------- the parts */

function EndMark({
  deg,
  r,
  c,
  placement,
  icon,
  word,
  time,
  tint,
  ink,
  enter,
  testID,
}: {
  deg: number;
  r: number;
  c: number;
  /** Where the ring's own caption pass put this one. Never null: the ends are `required`. */
  placement: CaptionPlacement | null;
  icon: 'sun' | 'moon';
  word: string;
  time: string;
  tint: string;
  ink: string;
  /** Its pop and its caption's fade, while the ring draws itself in; nothing at rest. */
  enter?: Enter;
  testID: string;
}) {
  const t = useTheme();
  const at = wheelPoint(deg, r, c, c);
  const D = END_D;
  return (
    <>
      <Animated.View
        style={[
          styles.dot,
          {
            width: D,
            height: D,
            borderRadius: D / 2,
            left: at.x - D / 2,
            top: at.y - D / 2,
            backgroundColor: tint,
            borderColor: t.color.surfaceSolid,
          },
          enter?.body,
        ]}
        testID={testID}
      >
        <Icon name={icon} size={15} color={ink} />
      </Animated.View>
      {placement === null ? null : (
        <Animated.View
          style={[
            styles.caption,
            { width: CAPTION_WIDTH, left: placement.left, top: placement.top },
            enter?.caption,
          ]}
        >
          <AppText
            variant="bodyStrong"
            numeric
            align={placement.align}
            style={[styles.time, { textAlign: placement.align }]}
          >
            {time}
          </AppText>
          {/* a crowded end keeps its time and leaves its word out (`placeCaptions`) */}
          {placement.compact === true ? null : <Meta align={placement.align}>{word}</Meta>}
        </Animated.View>
      )}
    </>
  );
}

function WheelPill({ pill }: { pill: ScheduleWheelPill }) {
  const t = useTheme();
  const cat = useCategory(pill.activity);
  return (
    <View
      style={[
        styles.pill,
        {
          gap: t.space.xs,
          paddingVertical: 3,
          paddingHorizontal: t.space.sm,
          borderRadius: t.radius.pill,
          backgroundColor: t.color.surfaceSolid,
        },
      ]}
    >
      {/* the picture, as in the house — at 13 pt this was the old line glyph */}
      <Icon name={iconForModule(pill.activity)} size={ILLUSTRATED_MIN_SIZE} color={cat.fg} />
      <Meta numberOfLines={1} style={styles.pillLabel}>
        {pill.label}
      </Meta>
    </View>
  );
}

/**
 * ONE STOP, AND THE ANIMATION THE OWNER ASKED FOR.
 *
 * The position is held in two animated values rather than recomputed into a style every render,
 * so a stop whose angle changed — a slot the engine pushed later after a logged entry, a rhythm
 * the parent just edited — springs across instead of jumping. `layoutWheel` keys a live stop by
 * its rule and its ordinal (`liveEntries`), which is what keeps this node mounted across the
 * move; a key that carried the instant would unmount and remount, and a remount cannot animate.
 */
function WheelStopView({
  stop,
  r,
  c,
  placement,
  clockOf,
  note,
  name,
  hint,
  onPress,
  enter,
  testID,
}: {
  stop: WheelStop;
  r: number;
  c: number;
  /** Where the ring's own caption pass put this one, or null where it found nowhere clear. */
  placement: CaptionPlacement | null;
  clockOf: (hhmm: string) => string;
  note?: string | undefined;
  name: string;
  hint?: string | undefined;
  onPress?: () => void;
  /**
   * Its pop and its caption's fade while the ring draws itself in. Drawn on views of their OWN,
   * inside the ones the springs move, so each view is fed by one animation's values only — the
   * springs were on the JavaScript driver when this was written, and one view's style may not be
   * fed by both drivers. Both are on the native one now (see the springs below).
   */
  enter?: Enter;
  testID: string;
}) {
  const t = useTheme();
  const at = wheelPoint(stop.deg, r, c, c);
  const cells = cellsOf(stop.activities);
  const width = houseWidth(cells);
  /**
   * THE CAPTION SITS JUST OUTSIDE ITS OWN HOUSE, on the side away from the middle, and never
   * through it. It used to sit at one fixed radius for every stop, centered on its point — which
   * at the ring's sides put "1:15 PM" straight across a three-cell house sixty-six points wide,
   * and at the left edge ran "7:30 PM" off the card (the owner's screenshot, 2026-09-21).
   * `captionBox` measures from the house's real edge instead, aligns the text away from the
   * center, and keeps the box inside the wheel. A crowded stop still keeps its house and loses
   * only its words — `layoutWheel` decides that, against the other stops AND the sun and moon.
   */
  /**
   * THE CAPTION IS NOT THIS STOP'S DECISION ANY MORE. `ScheduleWheel` places every caption on the
   * ring in one pass, against every house and every caption already standing, because a stop that
   * only ever checked its OWN house is exactly how a ring of ordinary two-hour intervals came out
   * with three captions printed through three houses (the owner's screenshot, 2026-09-22). Null
   * means the pass found nowhere clear: the house stays, the words go.
   */
  const box = placement ?? { left: at.x, top: at.y, align: 'center' as const };
  const captioned = placement !== null;

  const x = useRef(new Animated.Value(at.x)).current;
  const y = useRef(new Animated.Value(at.y)).current;
  const cx = useRef(new Animated.Value(box.left)).current;
  const cy = useRef(new Animated.Value(box.top)).current;
  const still = t.reduceMotion;
  useEffect(() => {
    const pairs: [Animated.Value, number][] = [
      [x, at.x],
      [y, at.y],
      [cx, box.left],
      [cy, box.top],
    ];
    if (still) {
      for (const [v, to] of pairs) v.setValue(to);
      return;
    }
    /*
      ON THE NATIVE DRIVER (docs/DESIGN_SYSTEM.md §7.1). All four values only ever feed a
      `translateX` / `translateY` — the house's, through `Animated.subtract`, and the caption's — so
      nothing here needs the JavaScript driver, and it used to cost the most there: a change to the
      routine springs every stop on the ring at once, four values each, so a twelve-stop ring was
      forty-eight springs stepped in JavaScript on every frame while a finger held a stepper.
    */
    const anims = pairs.map(([v, to]) =>
      Animated.spring(v, {
        toValue: to,
        damping: 18,
        stiffness: 140,
        mass: 0.9,
        useNativeDriver: true,
      }),
    );
    Animated.parallel(anims).start();
  }, [at.x, at.y, box.left, box.top, still, x, y, cx, cy]);

  const house = <StopHouse cells={cells} dashed={stop.optional} done={stop.done} width={width} />;
  const body =
    enter === undefined ? house : <Animated.View style={enter.body}>{house}</Animated.View>;
  const words = (
    <>
      {/* THE CHECK IS THE STATE, the ink only agrees with it. A parent who cannot tell the
          greens apart still reads a done stop, which is the rule for every state in this app. */}
      <View
        style={[styles.captionTime, { justifyContent: ALIGN_TO_FLEX[box.align], gap: CHECK_GAP }]}
      >
        {stop.done ? <Icon name="check" size={12} color={t.color.good} /> : null}
        <BodySm numeric style={styles.time}>
          {clockOf(stop.hhmm)}
        </BodySm>
      </View>
      {note === undefined || placement?.compact === true ? null : (
        <Meta align={box.align} numberOfLines={1}>
          {note}
        </Meta>
      )}
    </>
  );

  return (
    <>
      <Animated.View
        style={[
          styles.stop,
          {
            width,
            height: HOUSE_H,
            transform: [
              { translateX: Animated.subtract(x, width / 2) },
              { translateY: Animated.subtract(y, HOUSE_H / 2) },
            ],
          },
        ]}
      >
        {onPress === undefined ? (
          body
        ) : (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={name}
            {...(hint === undefined ? {} : { accessibilityHint: hint })}
            hitSlop={t.space.md}
            onPress={onPress}
            style={({ pressed }) => [styles.press, { opacity: pressed ? 0.65 : 1 }]}
            testID={testID}
          >
            {body}
          </Pressable>
        )}
      </Animated.View>
      {captioned ? (
        <Animated.View
          style={[
            styles.caption,
            {
              width: CAPTION_WIDTH,
              transform: [{ translateX: cx }, { translateY: cy }],
            },
          ]}
        >
          {enter === undefined ? (
            words
          ) : (
            <Animated.View style={enter.caption}>{words}</Animated.View>
          )}
        </Animated.View>
      ) : null}
    </>
  );
}

/**
 * `captionBox` — where a stop's caption goes, placed from the house's real edge outward so it
 * can never cross the house — lives in `wheelGeometry.ts` now, with `wheelPoint` and `arcPath`,
 * for the same reason they do: the node suite cannot parse a file that imports React Native, and
 * a caption printed through a house (the owner's screenshot, 2026-09-22) is exactly the kind of
 * placement bug a swept test catches before a device does (`scheduleWheelCaption.test.ts`).
 */

/**
 * WHAT ONE HOUSE HOLDS: a disc per activity, or — past the third — the count of what did not fit.
 * Three discs is the ring's limit (`MAX_CELLS` says why), and counting the rest is better than
 * dropping it silently: "and two more things at eight o'clock" is a fact a parent can act on.
 */
type HouseCell = { key: string; activity: ModuleId } | { key: string; more: number };

function cellsOf(activities: readonly ModuleId[]): HouseCell[] {
  if (activities.length <= MAX_CELLS) return activities.map(a => ({ key: a, activity: a }));
  const shown = activities.slice(0, MAX_CELLS - 1).map(a => ({ key: a, activity: a }));
  return [...shown, { key: '+', more: activities.length - shown.length }];
}

/** Wide enough for what is in it, and no wider — the ring has to fit the neighbours too. */
function houseWidth(cells: readonly HouseCell[]): number {
  const inner = cells.reduce((w, cell) => w + ('activity' in cell ? CELL : COUNT_W), 0);
  return inner + Math.max(0, cells.length - 1) * CELL_GAP + HOUSE_PAD * 2;
}

/**
 * THE HOUSE. An opaque capsule, so the ring's track runs behind it rather than through it, with
 * the activities in a row inside. It is the same shape for one thing as for three, which is what
 * makes a busy hour read as one moment in the day instead of a pile-up.
 *
 * An OPTIONAL stop — a "twice a day" the app spread across the window, which the household may or
 * may not do — wears a dashed edge and nothing else. It is not marked late, not colored differently
 * and never counted against anyone (CLAUDE.md §2: the app records, it does not judge).
 *
 * A DONE stop (the `actual` view only) wears a heavier edge in the "good" ink. The colour alone
 * never carries it: the caption above the house prints a check beside the time, so the state is
 * legible without seeing the hue at all (DESIGN_SYSTEM §accessibility).
 */
function StopHouse({
  cells,
  dashed,
  done,
  width,
}: {
  cells: readonly HouseCell[];
  dashed: boolean;
  done: boolean;
  width: number;
}) {
  const t = useTheme();
  return (
    <View
      style={[
        styles.house,
        {
          width,
          height: HOUSE_H,
          borderRadius: HOUSE_H / 2,
          paddingHorizontal: HOUSE_PAD,
          gap: CELL_GAP,
          backgroundColor: t.color.surfaceSolid,
          borderWidth: done ? 2.5 : 1.5,
          borderColor: done ? t.color.good : dashed ? t.color.text3 : t.color.line,
          borderStyle: dashed && !done ? 'dashed' : 'solid',
        },
      ]}
    >
      {cells.map(cell =>
        'activity' in cell ? (
          <StopCell key={cell.key} activity={cell.activity} />
        ) : (
          <Meta key={cell.key} align="center" style={[styles.more, { width: COUNT_W }]}>
            {`+${cell.more}`}
          </Meta>
        ),
      )}
    </View>
  );
}

/** One activity inside a house, in its own module hue. */
function StopCell({ activity }: { activity: ModuleId }) {
  const cat = useCategory(activity);
  return (
    <View
      style={[
        styles.cell,
        { width: CELL, height: CELL, borderRadius: CELL / 2, backgroundColor: cat.soft },
      ]}
    >
      <Icon name={iconForModule(activity)} size={CELL_ICON} color={cat.fg} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  dot: { position: 'absolute', alignItems: 'center', justifyContent: 'center', borderWidth: 2 },
  caption: { position: 'absolute' },
  captionTime: { flexDirection: 'row', alignItems: 'center' },
  time: { fontSize: 13, lineHeight: 17 },
  stop: { position: 'absolute', left: 0, top: 0 },
  press: { alignItems: 'center', justifyContent: 'center' },
  house: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  cell: { alignItems: 'center', justifyContent: 'center' },
  more: { fontSize: 11 },
  hub: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  center: { fontSize: 26, lineHeight: 30 },
  pill: { flexDirection: 'row', alignItems: 'center', maxWidth: '100%' },
  pillLabel: { fontSize: 11.5, flexShrink: 1 },
});
