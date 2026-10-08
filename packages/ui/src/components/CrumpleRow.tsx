/**
 * CrumpleRow — a list row that crumples into a paper ball when its entry is deleted, and uncrumples
 * back into place when the delete is undone (the owner, 2026-09-26, "agreed"). `crumple.ts` holds
 * every number and tests it; this file only hands them to three values and two small drawings.
 *
 * Wrap a row in it, in a list whose rows can go and come back, and tell it what the row is doing:
 *
 *   - `rest` — the row, exactly as it was: two plain wrappers and nothing else, no clip, no layer;
 *   - `crumpling` — the content squeezes toward its middle and fades under a few creases, a paper
 *     ball forms where it was, drops a little, rolls and fades, and the row's room closes so the
 *     rows below slide up. It is out of reach of touch and of assistive technology from the first
 *     frame: the entry is already deleted, and the toast says so;
 *   - `uncrumpling` — the room opens, the ball is back in its place, and it unfolds into the row.
 *     Offered at once: it is what the parent just asked for.
 *
 * `onSettled` says a move finished — the crumpled row can leave the list; the uncrumpled one is at
 * rest. A change of phase mid-move turns it round from where it is.
 *
 * THE ROOM IS THE ONE VALUE ON THE JAVASCRIPT DRIVER, because a height is layout (`RollDown` says
 * the same); the squeeze, the ball and its drop are transforms and opacities on the native driver.
 * The content is MEASURED, not guessed: laid out in normal flow inside the room, whose height a
 * transform never changes — so a row that arrives uncrumpling measures itself inside a room of no
 * height, invisible, and the room opens to exactly that.
 *
 * WHAT IT NEVER DOES: touch the data. The caller deletes, and the caller's data brings the row back;
 * this only draws what already happened. REDUCE MOTION AND THE AMBER NIGHT (`motionStill`) play
 * nothing: a crumpling row is simply gone, an uncrumpling one simply there.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import {
  CRUMPLE_BALL,
  CRUMPLE_BALL_CREASE,
  CRUMPLE_BALL_CREASES,
  CRUMPLE_BALL_EDGE,
  CRUMPLE_BALL_OUTLINE,
  CRUMPLE_BALL_POSE,
  CRUMPLE_CREASE_STROKE,
  CRUMPLE_GONE,
  CRUMPLE_REST,
  crumpleCreases,
  crumpleFrames,
  crumpleInks,
  crumplePoseAt,
  planCrumple,
  planUncrumple,
  type CrumplePlan,
  type CrumplePose,
  type CrumpleTrack,
} from './crumple';
import { deg, num } from './PictureToggle';
import { motionStill } from './tickDraw';

export type CrumplePhase = 'rest' | 'crumpling' | 'uncrumpling';

export interface CrumpleRowProps {
  /** What the row is doing (see the header). */
  phase: CrumplePhase;
  /** A crumple that waited for a sheet to leave starts this many ms late (`CRUMPLE_AFTER_SHEET_MS`). */
  after?: number;
  /** A move finished: a crumpled row can leave the list, an uncrumpled one is at rest. */
  onSettled?: (phase: Exclude<CrumplePhase, 'rest'>) => void;
  children: ReactNode;
  testID?: string;
}

const VIEW_BOX = `0 0 ${CRUMPLE_BALL} ${CRUMPLE_BALL}`;

/** One track of a plan as a timing on its driver. */
const timing = (v: Animated.Value, t: CrumpleTrack, useNativeDriver: boolean) =>
  Animated.timing(v, {
    toValue: t.to,
    duration: t.duration,
    delay: t.delay,
    easing: Easing.bezier(...t.ease),
    useNativeDriver,
  });

export function CrumpleRow({ phase, after = 0, onSettled, children, testID }: CrumpleRowProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  const inks = crumpleInks(t.color);

  // the content's own size, as last laid out — a transform never changes it
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (ev: LayoutChangeEvent) => {
    const { width, height } = ev.nativeEvent.layout;
    setSize(s =>
      s !== null && Math.abs(s.w - width) < 0.5 && Math.abs(s.h - height) < 0.5
        ? s
        : { w: width, h: height },
    );
  };

  // a row that ARRIVES uncrumpling is an undone delete whose crumple had finished: the ball, no room
  const [born] = useState<CrumplePose>(() =>
    phase === 'uncrumpling' ? CRUMPLE_BALL_POSE : CRUMPLE_REST,
  );
  const c = useRef(new Animated.Value(born.c)).current;
  const d = useRef(new Animated.Value(born.d)).current;
  const e = useRef(new Animated.Value(born.e)).current;
  // the move in flight and when it set off; the pose the last move left the row in
  const motion = useRef<{ plan: CrumplePlan; startedAt: number } | null>(null);
  const resting = useRef<CrumplePose>(born);
  // read when a move starts or ends, never as dependencies: a caller's fresh arrow each render must
  // not restart the move it is being told about
  const settledRef = useRef(onSettled);
  const afterRef = useRef(after);
  useEffect(() => {
    settledRef.current = onSettled;
    afterRef.current = after;
  });

  useEffect(() => {
    const land = (pose: CrumplePose) => {
      motion.current = null;
      resting.current = pose;
      c.setValue(pose.c);
      d.setValue(pose.d);
      e.setValue(pose.e);
    };
    if (phase === 'rest') {
      land(CRUMPLE_REST);
      return undefined;
    }
    // nothing may move — or a crumple with nothing measured to squeeze: the end state, and done
    if (still || (size === null && phase === 'crumpling')) {
      land(phase === 'crumpling' ? CRUMPLE_GONE : CRUMPLE_REST);
      settledRef.current?.(phase);
      return undefined;
    }
    // an undone row measures itself inside its room of no height first
    if (size === null) return undefined;
    const now = Date.now();
    const m = motion.current;
    const from = m === null ? resting.current : crumplePoseAt(m.plan, now - m.startedAt);
    const plan = phase === 'crumpling' ? planCrumple(from, afterRef.current) : planUncrumple(from);
    motion.current = { plan, startedAt: now };
    const run = Animated.parallel([
      timing(c, plan.c, true),
      timing(d, plan.d, true),
      // the room is layout: the JavaScript driver
      timing(e, plan.e, false),
    ]);
    run.start(({ finished }) => {
      if (!finished) return;
      motion.current = null;
      resting.current = phase === 'crumpling' ? CRUMPLE_GONE : CRUMPLE_REST;
      settledRef.current?.(phase);
    });
    // a new phase, reduce motion, Night, a new size or the row going away: stop where it is
    return () => run.stop();
  }, [phase, still, size, c, d, e]);

  // drawing a move: the room is clipped and the paper is drawn. Follows the phase in the same
  // render, so a crumple's first frame is already clipped and already out of reach
  const moving = phase !== 'rest' && !still;
  const gone = phase === 'crumpling';
  // built only for a row that is moving: a page of rows at rest carries none of it
  const anim = useMemo(() => {
    if (!moving) return null;
    const w = size?.w ?? 0;
    const h = size?.h ?? 0;
    const frames = crumpleFrames(w, h);
    // the squeeze, applied innermost-first as React Native composes a transform list: scaled,
    // then skewed, then turned — built twice, for the content and for the creases over it
    const squeeze = () => [
      { rotate: deg(c, frames.content.rotate) },
      { skewX: deg(c, frames.content.skewX) },
      { scaleX: num(c, frames.content.scaleX) },
      { scaleY: num(c, frames.content.scaleY) },
    ];
    return {
      creases: crumpleCreases(w, h),
      room: { height: num(e, frames.height) },
      content: { opacity: num(c, frames.content.opacity), transform: squeeze() },
      folds: { opacity: num(c, frames.creases.opacity), transform: squeeze() },
      ball: {
        opacity: Animated.multiply(num(c, frames.ball.opacity), num(d, frames.drop.opacity)),
        // moved, then turned about its own middle — rolled by the drop, settled by the squeeze
        transform: [
          { translateX: num(d, frames.drop.x) },
          { translateY: num(d, frames.drop.y) },
          { rotate: deg(d, frames.drop.rotate) },
          { rotate: deg(c, frames.ball.rotate) },
          { scale: num(c, frames.ball.scale) },
        ],
      },
    };
  }, [moving, size, c, d, e]);
  return (
    <Animated.View
      style={anim !== null ? [styles.room, anim.room] : null}
      pointerEvents={gone ? 'none' : 'auto'}
      {...(gone
        ? {
            accessibilityElementsHidden: true,
            importantForAccessibility: 'no-hide-descendants' as const,
          }
        : {})}
      {...(testID ? { testID } : {})}
    >
      <Animated.View onLayout={onLayout} style={anim !== null ? anim.content : null}>
        {children}
      </Animated.View>
      {anim !== null && size !== null ? (
        <>
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.layer, { width: size.w, height: size.h }, anim.folds]}
          >
            <Svg width={size.w} height={size.h} fill="none">
              {anim.creases.map(line => (
                <Path
                  key={line}
                  d={line}
                  stroke={inks.crease}
                  strokeWidth={CRUMPLE_CREASE_STROKE}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}
            </Svg>
          </Animated.View>
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.layer,
              {
                left: size.w / 2 - CRUMPLE_BALL / 2,
                top: size.h / 2 - CRUMPLE_BALL / 2,
                width: CRUMPLE_BALL,
                height: CRUMPLE_BALL,
              },
              anim.ball,
            ]}
          >
            <Svg width={CRUMPLE_BALL} height={CRUMPLE_BALL} viewBox={VIEW_BOX}>
              <Path
                d={CRUMPLE_BALL_OUTLINE}
                fill={inks.paper}
                stroke={inks.edge}
                strokeWidth={CRUMPLE_BALL_EDGE}
                strokeLinejoin="round"
              />
              <Path
                d={CRUMPLE_BALL_CREASES}
                fill="none"
                stroke={inks.crease}
                strokeWidth={CRUMPLE_BALL_CREASE}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </Svg>
          </Animated.View>
        </>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // the row's room, clipped while it moves: a ball still falling as the room closes is cut by its
  // floor rather than drawn over the next row
  room: { overflow: 'hidden' },
  layer: { position: 'absolute', left: 0, top: 0 },
});
