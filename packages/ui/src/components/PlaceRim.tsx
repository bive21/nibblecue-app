/**
 * PlaceRim — a storage place's picture at the rim of a surface (the owner, 2026-09-26: *"why do you
 * only have the new background image in milk stash only for frozen, this is a fun one, and it
 * should be on every category"*). Frost was the first (2026-09-25, of the "that's cool" list); it
 * is now one of five, and this component draws all of them:
 *
 *   - ROOM, a counter: a warm glow at the edge like a little sunbeam, two shafts of light and a
 *     couple of motes in them;
 *   - FRIDGE: a faint cool mist and beads of condensation, one of which ran a little way down;
 *   - FREEZER: frost — a glaze of rime, two ferns growing in from each edge, a glint each side;
 *   - DEEP_FREEZER: heavier frost — three ferns a side and a bluer rim;
 *   - THAWED: meltwater — the frost's drops resting where they ran, their wet lines, a bead.
 *
 * The design system knows nothing about milk: this is the rim of something, dressed as a place, and
 * the caller says which (`kind`, one of the five `PlaceKind`s; any other draws nothing). Every
 * number is `placeRim.ts`'s and `frostRim.ts`'s, tested in node; every color is `theme/frost.ts`'s
 * and `theme/placeRim.ts`'s, measured there.
 *
 * IT MOVES ONLY ON A CHANGE, AND ONCE. A picture that first appears is drawn at rest — a list of a
 * hundred rows opens still — and only a cue, a change the caller saw happen, plays (`rimPlan`):
 * frost creeps in edges first and melts from the middle out, its water running off, or THAWS and
 * leaves its water; every other picture arrives in one flourish of at most 600 ms and then sits
 * still; a picture that is not frost fades as it leaves, under the sheet that caused the change.
 * Nothing loops. A second picture of the same thing that mounts while a change plays JOINS it.
 *
 * STILL WHEN IT MUST BE. Reduce motion draws the end of any change, set directly, and so does the
 * amber Night theme, whose pictures are a dim rim in the night palette's own roles with nothing
 * that shines — no glint, no highlight, no sunbeam.
 *
 * NEVER UNDER A WORD. The picture lives in two strips, one down each side of the host, exactly as
 * wide as its side padding and as tall as its content — the caller hands its own padding in as
 * `inset` — or, for a card whose words leave its right side empty, in ONE strip down the right, as
 * wide as that emptiness (`sides="right"` and `rimZone`, which measures it). The palettes are
 * measured as if a word did reach them (every ink a card writes clears its floor over every wash
 * at its densest), so nothing rests on the geometry alone. At a card's rounded corners the caller
 * says so (`corners`) and the picture is clipped to them, which no piece of it ever reaches.
 *
 * DECORATION TO EVERYTHING BUT THE EYE: absolutely placed behind the host's content (the caller
 * renders it FIRST), `pointerEvents="none"`, and hidden from assistive technology.
 *
 * WHAT IT COSTS, because a list can hold a hundred of these: at rest a picture is one small SVG per
 * strip — no filter, no animated value — built from geometry memoized per host shape, and the
 * component is memoized on its props, so a screen re-rendering every minute redraws none of them.
 * Nothing animated is built until a change plays, and the moving layer goes when it ends; every
 * frame is opacity and transforms on the native driver, off the JS thread.
 */
import { Fragment, memo, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Animated,
  Easing,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type ViewStyle,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { deepFrostFor, frostFor, splitAlpha, type FrostPalette } from '../theme/frost';
import {
  DEW_PALETTES,
  GLOW_PALETTES,
  MELT_PALETTES,
  rimWash,
  type WashStops,
} from '../theme/placeRim';
import type { PlaceKind } from '../theme/placeTones';
import type { ThemeName } from '../theme/theme';
import { useTheme } from '../theme/ThemeProvider';
import { SPARKLE_PATH, type Frame } from './dayNightSwitch';
import {
  DROP,
  DROP_GLINT,
  DROP_PATH,
  FERN_STROKE,
  SPARKLE_BOX,
  THAW_TRAIL,
  TRAIL_WIDTH,
  frostCalm,
  type DropFrames,
  type FrostCorners,
  type FrostGeometry,
  type FrostInset,
  type FrostSide,
  type MotionFrames,
  type PieceFrames,
} from './frostRim';
import {
  placeRimLook,
  placeRimShow,
  rimClip,
  rimGeometry,
  rimMotion,
  rimPlan,
  type ArriveFrames,
  type Bead,
  type FrostLook,
  type PlaceRimCue,
  type RimGeometry,
  type RimSides,
  type Strip,
  type Wash,
} from './placeRim';

/** The cue, the host's shape and which sides, for a caller; the arithmetic is `placeRim.ts`. */
export type { FrostCorners, FrostInset } from './frostRim';
export type { PlaceRimCue, RimSides } from './placeRim';
/** A card's empty right side, measured, as the strip its picture is drawn in. */
export { placeRimLook, rimZone } from './placeRim';

export interface PlaceRimProps {
  /** The place whose picture the host wears now: a `PlaceKind`; anything else draws nothing. */
  kind: string | null;
  /** A change the caller saw happen, to be shown as a motion; absent, the look is simply drawn. */
  cue?: PlaceRimCue | null;
  /** The host's own padding: the picture stays inside it, beside the words and never under them. */
  inset: FrostInset;
  /** The ends of the host that are a card's rounded corners: clipped there, and nowhere else. */
  corners?: FrostCorners;
  /** Down both sides (a row), or down the right only (a card whose right side is empty). */
  sides?: RimSides;
}

type AnimatedStyle = Animated.WithAnimatedObject<ViewStyle>;

/** Not useId(): its output contains ':', which is not valid in an SVG fragment identifier. */
let instances = 0;

function PlaceRimBase({ kind, cue = null, inset, corners, sides = 'both' }: PlaceRimProps) {
  const t = useTheme();
  const uid = useRef<string | null>(null);
  if (uid.current === null) uid.current = `cc-rim-${(instances += 1)}`;
  const id = uid.current;
  const look = placeRimLook(kind);
  const calm = frostCalm(t.theme, t.reduceMotion);
  const [height, setHeight] = useState(0);
  // a change that has run its course asks for one more render, which draws the look it ended on
  const [, settle] = useState(0);
  const insetX = inset.x;
  const insetY = inset.y;
  const round = corners?.radius ?? 0;
  const roundTop = corners?.top ?? false;
  const roundBottom = corners?.bottom ?? false;
  /*
    EVERY PICTURE THIS HOST MAY DRAW, built once per shape: at rest it needs one, and a change the
    two it runs between. A cache rather than a single value because which two is not known until a
    cue arrives, and a row re-rendered by the minute's tick must not rebuild a fern. The corners are
    part of the shape: a piece at a card's rounded corner is placed clear of it (`clearBand`).
  */
  const geometry = useMemo(() => {
    if (height <= 0) return null;
    const made = new Map<PlaceKind, RimGeometry>();
    const clipped = { radius: round, top: roundTop, bottom: roundBottom };
    return (l: PlaceKind): RimGeometry => {
      const had = made.get(l);
      if (had !== undefined) return had;
      const g = rimGeometry(l, height, { x: insetX, y: insetY }, sides, clipped);
      made.set(l, g);
      return g;
    };
  }, [height, insetX, insetY, sides, round, roundTop, roundBottom]);
  // the clock is read here on purpose: what to draw depends on how far a change has got, and a
  // picture that mounts part way through one joins it (`placeRimShow`)
  const show = placeRimShow(look, cue, Date.now(), calm);
  if (show.kind === 'still' && show.look === null) return null;
  const clip = rimClip(corners, sides);

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h !== height) setHeight(h);
  };

  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      onLayout={onLayout}
      style={[
        StyleSheet.absoluteFill,
        clip === null
          ? null
          : {
              overflow: 'hidden',
              borderTopLeftRadius: clip.topLeft,
              borderTopRightRadius: clip.topRight,
              borderBottomLeftRadius: clip.bottomLeft,
              borderBottomRightRadius: clip.bottomRight,
            },
      ]}
    >
      {geometry === null ? null : show.kind === 'play' ? (
        <Moving
          // one layer per cue: a new change starts a new motion, a re-render continues this one
          key={`${show.from ?? 'new'}>${show.to}:${cue?.startAt ?? 0}`}
          from={show.from}
          to={show.to}
          at={show.at}
          geometry={geometry}
          theme={t.theme}
          id={id}
          onDone={() => settle(n => n + 1)}
        />
      ) : show.kind === 'still' && show.look !== null ? (
        <Still g={geometry(show.look)} theme={t.theme} id={`${id}-still`} />
      ) : null}
    </View>
  );
}

const sameCorners = (a: FrostCorners | undefined, b: FrostCorners | undefined): boolean =>
  a === b ||
  (a !== undefined &&
    b !== undefined &&
    a.radius === b.radius &&
    a.top === b.top &&
    a.bottom === b.bottom);

/**
 * THE PROPS THAT CHANGE THE PICTURE, compared by value: a caller writes its inset and its corners
 * as literals, so a row re-rendered for any other reason hands in new objects with the same
 * numbers, and a picture redrawn for that would be a hundred SVGs redrawn for nothing.
 */
const sameRim = (a: PlaceRimProps, b: PlaceRimProps): boolean =>
  a.kind === b.kind &&
  (a.cue ?? null) === (b.cue ?? null) &&
  a.inset.x === b.inset.x &&
  a.inset.y === b.inset.y &&
  (a.sides ?? 'both') === (b.sides ?? 'both') &&
  sameCorners(a.corners, b.corners);

export const PlaceRim = memo(PlaceRimBase, sameRim);

/* ------------------------------------------------------------------------------ the parts */

/** A side's strip: the host's side padding (or its empty right side), as tall as its content. */
const stripStyle = (strip: Strip, side: FrostSide): ViewStyle => ({
  position: 'absolute',
  top: strip.top,
  width: strip.width,
  height: strip.height,
  ...(side === 'left' ? { left: 0 } : { right: 0 }),
});

/** The palette of a frost look, light or heavy. */
const frostPaint = (look: PlaceKind, theme: ThemeName): FrostPalette =>
  look === 'DEEP_FREEZER' ? deepFrostFor(theme) : frostFor(theme);

/** The wash: a half-ellipse on the edge in the picture's own color, faded by its own stops. */
function WashFill({
  strip,
  wash,
  side,
  color,
  stops,
  gradientId,
}: {
  strip: Strip;
  wash: Wash;
  side: FrostSide;
  color: string;
  stops: WashStops;
  gradientId: string;
}) {
  const { rgb, alpha } = splitAlpha(color);
  const cx = side === 'left' ? 0 : strip.width;
  return (
    <>
      <Defs>
        <RadialGradient
          id={gradientId}
          gradientUnits="userSpaceOnUse"
          cx={cx}
          cy={wash.cy}
          fx={cx}
          fy={wash.cy}
          rx={wash.rx}
          ry={wash.ry}
        >
          {stops.map(([offset, strength]) => (
            <Stop key={offset} offset={offset} stopColor={rgb} stopOpacity={alpha * strength} />
          ))}
        </RadialGradient>
      </Defs>
      <Rect x={0} y={0} width={strip.width} height={strip.height} fill={`url(#${gradientId})`} />
    </>
  );
}

/** A bead of water: its body, and the light caught high on its left (none in night). */
function BeadShape({
  cx,
  cy,
  r,
  fill,
  highlight,
}: {
  cx: number;
  cy: number;
  r: number;
  fill: string;
  highlight: string | null;
}) {
  return (
    <>
      <Circle cx={cx} cy={cy} r={r} fill={fill} />
      {highlight ? (
        <Circle cx={cx - r * 0.36} cy={cy - r * 0.36} r={r * 0.34} fill={highlight} />
      ) : null}
    </>
  );
}

/** A droplet at rest in a strip: the teardrop, centered on (x, y), and its glint. */
function DropShape({
  x,
  y,
  fill,
  glint,
}: {
  x: number;
  y: number;
  fill: string;
  glint: string | null;
}) {
  const left = x - DROP.width / 2;
  const top = y - DROP.height / 2;
  return (
    <>
      <Path d={DROP_PATH} fill={fill} transform={`translate(${left} ${top})`} />
      {glint ? (
        <Circle cx={left + DROP_GLINT.cx} cy={top + DROP_GLINT.cy} r={DROP_GLINT.r} fill={glint} />
      ) : null}
    </>
  );
}

/** A shaft of light's gradient, from its root (full) to its tip (nothing), in any coordinates. */
function RayGradient({
  id,
  x1,
  y1,
  x2,
  y2,
  color,
}: {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
}) {
  const { rgb, alpha } = splitAlpha(color);
  return (
    <Defs>
      <LinearGradient id={id} gradientUnits="userSpaceOnUse" x1={x1} y1={y1} x2={x2} y2={y2}>
        <Stop offset={0} stopColor={rgb} stopOpacity={alpha} />
        <Stop offset={0.6} stopColor={rgb} stopOpacity={alpha * 0.45} />
        <Stop offset={1} stopColor={rgb} stopOpacity={0} />
      </LinearGradient>
    </Defs>
  );
}

/**
 * A PICTURE AT REST: each strip in ONE SVG — its wash and every piece on it — because a list can
 * hold a hundred of these, and one drawing a strip is the least there can be. Memoized on its
 * geometry, so nothing here is rebuilt unless the host's shape or the look changes.
 */
const Still = memo(function Still({
  g,
  theme,
  id,
}: {
  g: RimGeometry;
  theme: ThemeName;
  id: string;
}) {
  const wash = rimWash(g.look, theme);
  return (
    <>
      {g.sides.map(side => (
        <View key={side} style={stripStyle(g.strip, side)}>
          <Svg width={g.strip.width} height={g.strip.height}>
            <WashFill
              strip={g.strip}
              wash={g.wash}
              side={side}
              color={wash.color}
              stops={wash.stops}
              gradientId={`${id}-${side}`}
            />
            <StillPieces g={g} side={side} theme={theme} id={`${id}-${side}`} />
          </Svg>
        </View>
      ))}
    </>
  );
});

/** Everything on one strip but its wash, for the look at rest. */
function StillPieces({
  g,
  side,
  theme,
  id,
}: {
  g: RimGeometry;
  side: FrostSide;
  theme: ThemeName;
  id: string;
}) {
  switch (g.look) {
    case 'FREEZER':
    case 'DEEP_FREEZER': {
      const p = frostPaint(g.look, theme);
      const sparkle = p.sparkle;
      return (
        <>
          {g.frost.ferns.map((fern, i) =>
            fern.side === side ? (
              <Path
                key={`fern-${i}`}
                d={fern.dStrip}
                stroke={p.fern}
                strokeWidth={FERN_STROKE}
                strokeLinecap="round"
                fill="none"
              />
            ) : null,
          )}
          {sparkle
            ? g.frost.sparkles.map((s, i) =>
                s.side === side ? (
                  <Path
                    key={`sparkle-${i}`}
                    d={SPARKLE_PATH}
                    fill={sparkle}
                    transform={`translate(${s.cx - s.size / 2} ${s.cy - s.size / 2}) scale(${s.size / SPARKLE_BOX})`}
                  />
                ) : null,
              )
            : null}
        </>
      );
    }
    case 'FRIDGE': {
      const p = DEW_PALETTES[theme];
      const run = g.runner;
      return (
        <>
          {g.beads.map((b, i) =>
            b.side === side ? (
              <BeadShape
                key={`bead-${i}`}
                cx={b.cx}
                cy={b.cy}
                r={b.r}
                fill={p.bead}
                highlight={p.highlight}
              />
            ) : null,
          )}
          {run !== null && run.side === side ? (
            <>
              <Rect
                x={run.cx - TRAIL_WIDTH / 2}
                y={run.y0}
                width={TRAIL_WIDTH}
                height={run.y1 - run.y0}
                rx={TRAIL_WIDTH / 2}
                fill={p.trail}
              />
              <BeadShape cx={run.cx} cy={run.y1} r={run.r} fill={p.bead} highlight={p.highlight} />
            </>
          ) : null}
        </>
      );
    }
    case 'ROOM': {
      const p = GLOW_PALETTES[theme];
      const ray = p.ray;
      const mote = p.mote;
      return (
        <>
          {ray
            ? g.rays.map((r, i) =>
                r.side === side ? (
                  <Fragment key={`ray-${i}`}>
                    <RayGradient
                      id={`${id}-ray-${i}`}
                      x1={r.root.x}
                      y1={r.root.y}
                      x2={r.tip.x}
                      y2={r.tip.y}
                      color={ray}
                    />
                    <Path d={r.dStrip} fill={`url(#${id}-ray-${i})`} />
                  </Fragment>
                ) : null,
              )
            : null}
          {mote
            ? g.motes.map((m, i) =>
                m.side === side ? (
                  <Circle key={`mote-${i}`} cx={m.cx} cy={m.cy} r={m.r} fill={mote} />
                ) : null,
              )
            : null}
        </>
      );
    }
    case 'THAWED': {
      const p = MELT_PALETTES[theme];
      return (
        <>
          {g.drops.map((d, i) =>
            d.side === side ? (
              <Fragment key={`drop-${i}`}>
                <Rect
                  x={d.x - TRAIL_WIDTH / 2}
                  y={d.y0}
                  width={TRAIL_WIDTH}
                  height={d.y1 - d.y0}
                  rx={TRAIL_WIDTH / 2}
                  fill={p.trail}
                  opacity={THAW_TRAIL}
                />
                <DropShape x={d.x} y={d.y1} fill={p.drop} glint={p.dropGlint} />
              </Fragment>
            ) : null,
          )}
          {g.beads.map((b, i) =>
            b.side === side ? (
              <BeadShape
                key={`bead-${i}`}
                cx={b.cx}
                cy={b.cy}
                r={b.r}
                fill={p.bead}
                highlight={p.highlight}
              />
            ) : null,
          )}
        </>
      );
    }
  }
}

/* ----------------------------------------------------------------------------- the motion */

interface MovingProps {
  from: PlaceKind | null;
  to: PlaceKind;
  /** How far into the change to begin, 0–1: a picture that mounts late joins where it has got. */
  at: number;
  geometry: (look: PlaceKind) => RimGeometry;
  theme: ThemeName;
  id: string;
  onDone: () => void;
}

/** One number's frames, handed to the clock. */
type Num = (x: Frame) => Animated.AnimatedInterpolation<number>;

/**
 * A CHANGE IN MOTION: every layer of it on ONE clock, which runs linearly from where the change has
 * got to its end — the easing is in the frames (`placeRim.ts`, `frostRim.ts`), so joining part way
 * is setting the clock, not replaying a curve.
 */
function Moving({ from, to, at, geometry, theme, id, onDone }: MovingProps) {
  // where this layer began: a parent re-render hands a later `at`, which must not restart it
  const start = useRef(at).current;
  const clock = useRef(new Animated.Value(start)).current;
  const done = useRef(onDone);
  done.current = onDone;
  // built once per change: the plan, and every frame of it (`placeRimShow` plays only a change
  // that has one, so a null here is a picture already at rest)
  const motion = useMemo(() => {
    const plan = rimPlan(from, to);
    return plan === null
      ? null
      : rimMotion(plan, from === null ? null : geometry(from), geometry(to));
  }, [from, to, geometry]);
  const total = motion?.plan.total ?? 0;

  useEffect(() => {
    const run = Animated.timing(clock, {
      toValue: 1,
      duration: Math.max(0, (1 - start) * total),
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (finished) done.current();
    });
    // reduce motion switched on, the theme gone to Night, or the row gone: stop where it is
    return () => run.stop();
  }, [clock, start, total]);

  /*
    EVERY PIECE IS A VIEW OF THE ONE CLOCK, and each frame's view is made ONCE: a re-render in the
    middle of a change hands the same frames back (they are memoized with the change above), so it
    gets the same animated nodes back, and nothing on the native driver is torn down and rebuilt
    under a motion that is running. Copies of the ranges, because `interpolate` wants mutable arrays
    and the frames are frozen data.
  */
  const num: Num = useMemo(() => {
    const made = new WeakMap<Frame, Animated.AnimatedInterpolation<number>>();
    return (x: Frame) => {
      const had = made.get(x);
      if (had !== undefined) return had;
      const node = clock.interpolate({
        inputRange: [...x.inputRange],
        outputRange: [...x.outputRange],
        extrapolate: x.extrapolate,
      });
      made.set(x, node);
      return node;
    };
  }, [clock]);

  if (motion === null) return null;
  /*
    BOTTOM TO TOP AS THE STILL PICTURE IS: every wash under every piece. So the arriving picture's
    wash goes under the frost that is melting or thawing, and its pieces over it — which is what
    lets a thaw's last frame be the meltwater picture exactly, its sheen beneath the drops the frost
    left rather than a film over them that vanishes when the motion hands over to the still.
  */
  return (
    <>
      {/* the picture that is leaving, when it is not frost: it fades under the closing sheet */}
      {motion.fade !== null && from !== null ? (
        <Animated.View style={[StyleSheet.absoluteFill, { opacity: num(motion.fade) }]}>
          <Still g={geometry(from)} theme={theme} id={`${id}-fade`} />
        </Animated.View>
      ) : null}
      {motion.arrive !== null ? (
        <Arriving
          part="wash"
          g={geometry(to)}
          frames={motion.arrive}
          theme={theme}
          id={`${id}-arrive`}
          num={num}
        />
      ) : null}
      {motion.frost !== null ? (
        <FrostMoving
          look={motion.frost.look}
          g={motion.frost.g}
          sides={geometry(to).sides}
          frames={motion.frost.frames}
          theme={theme}
          id={`${id}-frost`}
          num={num}
        />
      ) : null}
      {motion.arrive !== null ? (
        <Arriving
          part="pieces"
          g={geometry(to)}
          frames={motion.arrive}
          theme={theme}
          id={`${id}-arrive`}
          num={num}
        />
      ) : null}
    </>
  );
}

const piece = (num: Num, p: PieceFrames): AnimatedStyle => ({
  opacity: num(p.opacity),
  transform: [{ scale: num(p.scale) }],
});

/** A wash in motion: it spreads from its edge (or retreats to it) and fades. */
function MovingWash({
  strip,
  wash,
  side,
  color,
  stops,
  frames,
  gradientId,
  num,
}: {
  strip: Strip;
  wash: Wash;
  side: FrostSide;
  color: string;
  stops: WashStops;
  frames: PieceFrames;
  gradientId: string;
  num: Num;
}) {
  const w = strip.width;
  const S = strip.height;
  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: 0,
          top: 0,
          width: w,
          height: S,
          transformOrigin: [side === 'left' ? 0 : w, S / 2, 0],
        },
        { opacity: num(frames.opacity), transform: [{ scaleX: num(frames.scale) }] },
      ]}
    >
      <Svg width={w} height={S}>
        <WashFill
          strip={strip}
          wash={wash}
          side={side}
          color={color}
          stops={stops}
          gradientId={gradientId}
        />
      </Svg>
    </Animated.View>
  );
}

/** A bead in motion: it pops in about its own middle. */
function MovingBead({
  b,
  frames,
  fill,
  highlight,
  num,
}: {
  b: Bead;
  frames: PieceFrames;
  fill: string;
  highlight: string | null;
  num: Num;
}) {
  const size = b.r * 2;
  return (
    <Animated.View
      style={[
        { position: 'absolute', left: b.cx - b.r, top: b.cy - b.r, width: size, height: size },
        piece(num, frames),
      ]}
    >
      <Svg width={size} height={size}>
        <BeadShape cx={b.r} cy={b.r} r={b.r} fill={fill} highlight={highlight} />
      </Svg>
    </Animated.View>
  );
}

/**
 * A DROP (or a bead) THAT RUNS: the wet line behind it, anchored at the top of its run and growing
 * down after it, and the drop itself, carried down its line. `shape` draws the drop in its own box.
 */
function MovingRun({
  x,
  y0,
  y1,
  box,
  frames,
  trail,
  shape,
  num,
}: {
  x: number;
  y0: number;
  y1: number;
  box: { width: number; height: number };
  frames: DropFrames;
  trail: string;
  shape: ReactNode;
  num: Num;
}) {
  return (
    <>
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: x - TRAIL_WIDTH / 2,
            top: y0,
            width: TRAIL_WIDTH,
            height: y1 - y0,
            borderRadius: TRAIL_WIDTH / 2,
            backgroundColor: trail,
            transformOrigin: [TRAIL_WIDTH / 2, 0, 0],
          },
          { opacity: num(frames.trailOpacity), transform: [{ scaleY: num(frames.trail) }] },
        ]}
      />
      <Animated.View
        style={[
          {
            position: 'absolute',
            left: x - box.width / 2,
            top: y0 - box.height / 2,
            width: box.width,
            height: box.height,
          },
          {
            opacity: num(frames.opacity),
            transform: [
              { translateY: num(frames.y) },
              { scaleY: num(frames.stretch) },
              { scale: num(frames.scale) },
            ],
          },
        ]}
      >
        {shape}
      </Animated.View>
    </>
  );
}

/** A droplet drawn in its own box, for a view that carries it. */
function DropBox({ fill, glint }: { fill: string; glint: string | null }) {
  return (
    <Svg width={DROP.width} height={DROP.height}>
      <Path d={DROP_PATH} fill={fill} />
      {glint ? (
        <Circle cx={DROP_GLINT.cx} cy={DROP_GLINT.cy} r={DROP_GLINT.r} fill={glint} />
      ) : null}
    </Svg>
  );
}

/**
 * FROST IN MOTION, as it has always moved: the glaze creeping in from each edge (or retreating to
 * it), each fern growing from its root (or shrinking back), the glints twinkling on (or going out
 * first), and in a melt or a thaw the droplets forming, hanging and running down.
 */
function FrostMoving({
  look,
  g,
  sides,
  frames,
  theme,
  id,
  num,
}: {
  look: FrostLook;
  g: FrostGeometry;
  sides: readonly FrostSide[];
  frames: MotionFrames;
  theme: ThemeName;
  id: string;
  num: Num;
}) {
  const p = frostPaint(look, theme);
  const wash = rimWash(look, theme);
  const { sparkle, drop, trail } = p;
  const glint = p.dropGlint ?? drop;
  return (
    <>
      {sides.map(side => (
        <View key={side} style={stripStyle(g.strip, side)}>
          {/* the glaze grows in from its edge, and retreats to it */}
          <MovingWash
            strip={g.strip}
            wash={g.glaze}
            side={side}
            color={wash.color}
            stops={wash.stops}
            frames={frames.glaze[side]}
            gradientId={`${id}-${side}`}
            num={num}
          />
          {/* each fern grows from its root on the edge, and shrinks back to it */}
          {g.ferns.map((fern, i) => {
            const f = frames.ferns[i];
            if (fern.side !== side || f === undefined) return null;
            return (
              <Animated.View
                key={`fern-${i}`}
                style={[
                  {
                    position: 'absolute',
                    left: fern.box.left,
                    top: fern.box.top,
                    width: fern.box.width,
                    height: fern.box.height,
                    transformOrigin: [fern.origin.x, fern.origin.y, 0],
                  },
                  piece(num, f),
                ]}
              >
                <Svg width={fern.box.width} height={fern.box.height}>
                  <Path
                    d={fern.d}
                    stroke={p.fern}
                    strokeWidth={FERN_STROKE}
                    strokeLinecap="round"
                    fill="none"
                  />
                </Svg>
              </Animated.View>
            );
          })}
          {sparkle
            ? g.sparkles.map((s, i) => {
                const f = frames.sparkles[i];
                if (s.side !== side || f === undefined) return null;
                return (
                  <Animated.View
                    key={`sparkle-${i}`}
                    style={[
                      {
                        position: 'absolute',
                        left: s.cx - s.size / 2,
                        top: s.cy - s.size / 2,
                        width: s.size,
                        height: s.size,
                      },
                      piece(num, f),
                    ]}
                  >
                    <Svg
                      width={s.size}
                      height={s.size}
                      viewBox={`0 0 ${SPARKLE_BOX} ${SPARKLE_BOX}`}
                    >
                      <Path d={SPARKLE_PATH} fill={sparkle} />
                    </Svg>
                  </Animated.View>
                );
              })
            : null}
          {/* the droplets, over everything: the frost is gone from under them when they run */}
          {drop && trail && glint
            ? g.drops.map((d, i) => {
                const f = frames.drops[i];
                if (d.side !== side || f === undefined) return null;
                return (
                  <MovingRun
                    key={`drop-${i}`}
                    x={d.x}
                    y0={d.y0}
                    y1={d.y1}
                    box={DROP}
                    frames={f}
                    trail={trail}
                    shape={<DropBox fill={drop} glint={glint} />}
                    num={num}
                  />
                );
              })
            : null}
        </View>
      ))}
    </>
  );
}

/**
 * A picture that is not frost, arriving: its wash spreading in, then its pieces, once. Drawn in two
 * `part`s, so a frost melting or thawing away can sit between them (`Moving`).
 */
function Arriving({
  part,
  g,
  frames,
  theme,
  id,
  num,
}: {
  part: 'wash' | 'pieces';
  g: RimGeometry;
  frames: ArriveFrames;
  theme: ThemeName;
  id: string;
  num: Num;
}) {
  const wash = rimWash(g.look, theme);
  return (
    <>
      {g.sides.map(side => (
        <View key={side} style={stripStyle(g.strip, side)}>
          {part === 'wash' ? (
            <MovingWash
              strip={g.strip}
              wash={g.wash}
              side={side}
              color={wash.color}
              stops={wash.stops}
              frames={frames.wash}
              gradientId={`${id}-${side}`}
              num={num}
            />
          ) : (
            <ArrivingPieces
              g={g}
              frames={frames}
              side={side}
              theme={theme}
              id={`${id}-${side}`}
              num={num}
            />
          )}
        </View>
      ))}
    </>
  );
}

function ArrivingPieces({
  g,
  frames,
  side,
  theme,
  id,
  num,
}: {
  g: RimGeometry;
  frames: ArriveFrames;
  side: FrostSide;
  theme: ThemeName;
  id: string;
  num: Num;
}) {
  if (g.look === 'FRIDGE' && frames.look === 'FRIDGE') {
    const p = DEW_PALETTES[theme];
    const run = g.runner;
    return (
      <>
        {g.beads.map((b, i) => {
          const f = frames.beads[i];
          if (b.side !== side || f === undefined) return null;
          return (
            <MovingBead
              key={`bead-${i}`}
              b={b}
              frames={f}
              fill={p.bead}
              highlight={p.highlight}
              num={num}
            />
          );
        })}
        {run !== null && run.side === side && frames.runner !== null ? (
          <MovingRun
            x={run.cx}
            y0={run.y0}
            y1={run.y1}
            box={{ width: run.r * 2, height: run.r * 2 }}
            frames={frames.runner}
            trail={p.trail}
            shape={
              <Svg width={run.r * 2} height={run.r * 2}>
                <BeadShape cx={run.r} cy={run.r} r={run.r} fill={p.bead} highlight={p.highlight} />
              </Svg>
            }
            num={num}
          />
        ) : null}
      </>
    );
  }
  if (g.look === 'ROOM' && frames.look === 'ROOM') {
    const p = GLOW_PALETTES[theme];
    const ray = p.ray;
    const mote = p.mote;
    return (
      <>
        {ray
          ? g.rays.map((r, i) => {
              const f = frames.rays[i];
              if (r.side !== side || f === undefined) return null;
              return (
                <Animated.View
                  key={`ray-${i}`}
                  style={[
                    {
                      position: 'absolute',
                      left: r.box.left,
                      top: r.box.top,
                      width: r.box.width,
                      height: r.box.height,
                      transformOrigin: [r.origin.x, r.origin.y, 0],
                    },
                    piece(num, f),
                  ]}
                >
                  <Svg width={r.box.width} height={r.box.height}>
                    <RayGradient
                      id={`${id}-ray-${i}`}
                      x1={r.origin.x}
                      y1={r.origin.y}
                      x2={r.tip.x - r.box.left}
                      y2={r.tip.y - r.box.top}
                      color={ray}
                    />
                    <Path d={r.d} fill={`url(#${id}-ray-${i})`} />
                  </Svg>
                </Animated.View>
              );
            })
          : null}
        {mote
          ? g.motes.map((m, i) => {
              const f = frames.motes[i];
              if (m.side !== side || f === undefined) return null;
              return (
                <Animated.View
                  key={`mote-${i}`}
                  style={{
                    position: 'absolute',
                    left: m.cx - m.r,
                    top: m.cy - m.r,
                    width: m.r * 2,
                    height: m.r * 2,
                    borderRadius: m.r,
                    backgroundColor: mote,
                    opacity: num(f),
                  }}
                />
              );
            })
          : null}
      </>
    );
  }
  if (g.look === 'THAWED' && frames.look === 'THAWED') {
    const p = MELT_PALETTES[theme];
    return (
      <>
        {g.drops.map((d, i) => {
          const f = frames.drops[i];
          if (d.side !== side || f === undefined) return null;
          return (
            <MovingRun
              key={`drop-${i}`}
              x={d.x}
              y0={d.y0}
              y1={d.y1}
              box={DROP}
              frames={f}
              trail={p.trail}
              shape={<DropBox fill={p.drop} glint={p.dropGlint} />}
              num={num}
            />
          );
        })}
        {g.beads.map((b, i) => {
          const f = frames.beads[i];
          if (b.side !== side || f === undefined) return null;
          return (
            <MovingBead
              key={`bead-${i}`}
              b={b}
              frames={f}
              fill={p.bead}
              highlight={p.highlight}
              num={num}
            />
          );
        })}
      </>
    );
  }
  return null;
}
