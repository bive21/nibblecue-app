/**
 * PaperPlane — the plane the shopping list's Share folds and throws (the owner, 2026-09-25, of the
 * "that's cool" list; made to be SEEN on 2026-09-26: *"the share button animation looks very
 * minimal, like its not showing anything. make it look more better and feel better"*).
 * `paperPlane.ts` has every frame, why the first one read as nothing, and the tests that hold it.
 *
 * IT IS A LAYER OVER THE PAGE, not a sticker on the button. The caller puts it in the screen's
 * overlay (`Screen`'s `overlay`: over the scroller, clipped to it), hands it the Share button's view
 * and where the glyph sits in that view, and bumps `launch` on the tap. On each new number it
 * measures the two in the window — once, on the tap, while the page is still — and throws one plane
 * from the glyph across the page. The first plane lived beside the button INSIDE the ScrollView,
 * which clipped it at the top bar's edge a third of the way into its climb.
 *
 * IT TELLS THE CALLER WHEN IT HAS GONE, AND NOTHING ELSE (`onLanded`; the owner, 2026-09-26: *"can
 * we wait until animation complete, then pop up show up?"*). The share sheet waits for that: asked
 * for over a plane still flying, it froze the plane under it on Android and took it away unseen. It
 * is called once for every launch this is handed — when the run ends, finished or stopped, and at
 * once for a launch that throws nothing (reduce motion, the amber night, a plane already up, a button
 * that is not on the screen) — so the caller never waits on a plane nobody will see. The caller feels
 * the tap on its own clock (`planeLaunch`), and keeps a timer of its own in case the end is lost.
 *
 * ONE PLANE AT A TIME. A number that arrives while one is in the air is let go, not saved for later:
 * the caller already lets a second tap go until its plane has landed and its sheet has been asked for
 * (the app's `shareButton`), and this is the same rule where the drawing is.
 *
 * NOTHING IS LEFT BEHIND. The flight clears itself when its run ends, finished or stopped, and by
 * then it has faded off the page: the sheet rises over a list at rest, and closes onto one.
 *
 * REDUCE MOTION AND THE AMBER NIGHT draw nothing (`motionStill`): no plane, and the caller's sheet
 * opens on the tap. Nothing is lost — the plane says nothing the sheet does not.
 *
 * DECORATION ONLY: `pointerEvents="none"` and hidden from assistive technology, so it can never take
 * a tap meant for anything under it or be read out. Its colors are the household's accent, as
 * everything colored on these pages is (`lists/parts.tsx`): the paper and the wing in the accent,
 * the paper's back and the plane's fold a tone away (`AccentTheme.dark`), the crease pressed in the
 * accent's own ink, the trail in the accent — the inks that draw its outline measured at 3:1 on the
 * page and on the button in the tests.
 *
 * Opacity and transforms on the native driver, one value for the whole of it, and one turn per view
 * (`paperPlane.ts` says why a tilted fold is three views here).
 */
import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useAccent } from '../theme/useAccent';
import { useTheme } from '../theme/ThemeProvider';
import type { Frame } from './dayNightSwitch';
import {
  CORNER_PERSPECTIVE,
  cornerPath,
  cornerViewBox,
  PLANE_BOX,
  PLANE_CORNERS,
  PLANE_FOLD,
  PLANE_GRID,
  PLANE_MS,
  PLANE_PERSPECTIVE,
  PLANE_UNIT,
  PLANE_WING,
  paperPlaneFrames,
  planeTrail,
  SHEET_BODY,
  SHEET_CREASE_PATH,
  TRAIL_DOT,
  type PlaneCorner,
  type TrailDot,
} from './paperPlane';
import { motionStill } from './tickDraw';

export interface PaperPlaneProps {
  /** Each new number throws one plane. The value it is first given throws none. */
  launch: number;
  /** The view the plane leaves from: the Share button's own box. Measured on the throw. */
  from: RefObject<View | null>;
  /** Where the glyph is in that view — the paper comes out of this point (`planeOrigin`). */
  at: { x: number; y: number };
  /**
   * Called once for each launch, with its number: when its plane has gone — the run finished or
   * stopped — or at once when it throws none. What the share sheet waits for.
   */
  onLanded?: (launch: number) => void;
}

/** One throw: which launch it answers, and the glyph's center in this layer. */
interface Flight {
  id: number;
  x: number;
  y: number;
}

type AnimatedStyle = Animated.WithAnimatedObject<ViewStyle>;

const VIEW_BOX = `0 0 ${PLANE_GRID} ${PLANE_GRID}`;
/** The paper's edge, stroked in its own fill: it closes the hairline between the sheet and a corner. */
const SEAM = 0.5;
const CORNERS: readonly PlaneCorner[] = [PLANE_CORNERS.top, PLANE_CORNERS.bottom];

export function PaperPlane({ launch, from, at, onLanded }: PaperPlaneProps) {
  const t = useTheme();
  const a = useAccent();
  const still = motionStill(t.reduceMotion, t.theme);
  const p = useRef(new Animated.Value(0)).current;
  // the layer itself, measured against the button so the plane starts on the glyph
  const sky = useRef<View>(null);
  // the launch this has already answered: the first value, and then each one after it
  const seen = useRef(launch);
  // a plane is in the air: a launch that arrives now is let go
  const airborne = useRef(false);
  const [flight, setFlight] = useState<Flight | null>(null);
  // the latest callback, read when a plane lands: the host's closure may change every render
  const landed = useRef(onLanded);
  landed.current = onLanded;

  useEffect(() => {
    if (launch === seen.current) return;
    seen.current = launch;
    // a launch that throws nothing has nothing to wait for: it lands on the spot
    const none = () => landed.current?.(launch);
    if (still || airborne.current) {
      none();
      return;
    }
    const layer = sky.current;
    const button = from.current;
    if (layer === null || button === null) {
      none();
      return;
    }
    layer.measureInWindow((lx, ly) => {
      button.measureInWindow((bx, by, bw, bh) => {
        // a button with no box is not on the screen to throw from
        if (bw <= 0 || bh <= 0) {
          none();
          return;
        }
        airborne.current = true;
        setFlight({ id: launch, x: bx - lx + at.x, y: by - ly + at.y });
      });
    });
  }, [launch, still, from, at.x, at.y]);

  useEffect(() => {
    if (flight === null) return;
    const id = flight.id;
    p.setValue(0);
    const run = Animated.timing(p, {
      toValue: 1,
      duration: PLANE_MS,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    // finished or stopped, the plane is gone: nothing is left on the page either way, and the
    // caller hears it — the share sheet it has been holding opens now, over a list at rest
    run.start(() => {
      airborne.current = false;
      setFlight(f => (f !== null && f.id === id ? null : f));
      landed.current?.(id);
    });
    return () => run.stop();
  }, [flight, p]);

  const anim = useMemo(() => {
    const f = paperPlaneFrames();
    const num = (fr: Frame) =>
      p.interpolate({
        inputRange: [...fr.inputRange],
        outputRange: [...fr.outputRange],
        extrapolate: fr.extrapolate,
      });
    const deg = (fr: Frame) =>
      p.interpolate({
        inputRange: [...fr.inputRange],
        outputRange: fr.outputRange.map(d => `${d}deg`),
        extrapolate: fr.extrapolate,
      });
    // the whole plane box: where it is, which way it points, how big, and the bank
    const fly: AnimatedStyle = {
      opacity: num(f.opacity),
      transform: [
        { translateX: num(f.x) },
        { translateY: num(f.y) },
        { rotate: deg(f.turn) },
        { scale: num(f.scale) },
        { scaleX: num(f.scaleX) },
        { scaleY: num(f.scaleY) },
      ],
    };
    // the sheet folding in half, and the plane opening, about the one crease; the camera leads
    const sheet: AnimatedStyle = {
      opacity: num(f.sheetOpacity),
      transform: [{ perspective: PLANE_PERSPECTIVE }, { rotateX: deg(f.sheetHalve) }],
    };
    const open: AnimatedStyle = {
      opacity: num(f.planeOpacity),
      transform: [{ perspective: PLANE_PERSPECTIVE }, { rotateX: deg(f.planeOpen) }],
    };
    const corner = (c: PlaneCorner): { lift: AnimatedStyle; land: AnimatedStyle } => {
      const k = f.corners[c.name];
      return {
        lift: {
          opacity: num(k.liftOpacity),
          transform: [{ perspective: CORNER_PERSPECTIVE }, { rotateY: deg(k.lift) }],
        },
        land: {
          opacity: num(k.landOpacity),
          transform: [{ perspective: CORNER_PERSPECTIVE }, { rotateY: deg(k.land) }],
        },
      };
    };
    // each dot shows once the plane has passed it and fades, shrinking, where it was left
    const dot = (d: TrailDot): AnimatedStyle => ({
      opacity: num(d.opacity),
      transform: [{ scale: num(d.scale) }],
    });
    const trail = planeTrail().map(d => ({ key: `dot${d.s}`, x: d.x, y: d.y, style: dot(d) }));
    return {
      fly,
      sheet,
      open,
      corners: { top: corner(PLANE_CORNERS.top), bottom: corner(PLANE_CORNERS.bottom) },
      trail,
    };
  }, [p]);

  return (
    <View
      ref={sky}
      collapsable={false}
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={StyleSheet.absoluteFill}
    >
      {flight === null || still ? null : (
        <>
          {/* the trail first, so the plane flies over the dots it leaves */}
          {anim.trail.map(d => (
            <Animated.View
              key={d.key}
              style={[
                styles.dot,
                {
                  left: flight.x + d.x - TRAIL_DOT / 2,
                  top: flight.y + d.y - TRAIL_DOT / 2,
                  backgroundColor: a.accent,
                },
                d.style,
              ]}
            />
          ))}
          <Animated.View
            style={[
              styles.box,
              { left: flight.x - PLANE_BOX / 2, top: flight.y - PLANE_BOX / 2 },
              anim.fly,
            ]}
          >
            <Animated.View style={[StyleSheet.absoluteFill, anim.sheet]}>
              <Svg width={PLANE_BOX} height={PLANE_BOX} viewBox={VIEW_BOX}>
                <Path
                  d={SHEET_BODY}
                  fill={a.accent}
                  stroke={a.accent}
                  strokeWidth={SEAM}
                  strokeLinejoin="round"
                />
                {/* the crease it is about to be folded along: a detail, so half strength */}
                <Path
                  d={SHEET_CREASE_PATH}
                  stroke={a.onAccent}
                  strokeWidth={0.6}
                  strokeLinecap="round"
                  opacity={0.45}
                />
              </Svg>
              {CORNERS.map(c => {
                const side = c.square.size * PLANE_UNIT;
                const turn = anim.corners[c.name];
                /*
                  A FOLD ABOUT THE DIAGONAL, AS THREE VIEWS: turned by the tilt, so its `rotateY`
                  is about the fold line; and its drawing turned back, so at rest it lies where it
                  was drawn. The corner as it was lifts to edge on; its mirror, the paper's back,
                  comes down from edge on onto the sheet.
                */
                return (
                  <View
                    key={c.name}
                    style={[
                      styles.corner,
                      {
                        left: c.square.x * PLANE_UNIT,
                        top: c.square.y * PLANE_UNIT,
                        width: side,
                        height: side,
                        transform: [{ rotate: `${c.tilt}deg` }],
                      },
                    ]}
                  >
                    <Animated.View style={[StyleSheet.absoluteFill, turn.lift]}>
                      <View
                        style={[
                          StyleSheet.absoluteFill,
                          { transform: [{ rotate: `${-c.tilt}deg` }] },
                        ]}
                      >
                        <Svg width={side} height={side} viewBox={cornerViewBox(c)}>
                          <Path
                            d={cornerPath(c.flat)}
                            fill={a.accent}
                            stroke={a.accent}
                            strokeWidth={SEAM}
                            strokeLinejoin="round"
                          />
                        </Svg>
                      </View>
                    </Animated.View>
                    <Animated.View style={[StyleSheet.absoluteFill, turn.land]}>
                      <View
                        style={[
                          StyleSheet.absoluteFill,
                          { transform: [{ rotate: `${-c.tilt}deg` }] },
                        ]}
                      >
                        <Svg width={side} height={side} viewBox={cornerViewBox(c)}>
                          <Path
                            d={cornerPath(c.folded)}
                            fill={a.dark}
                            stroke={a.dark}
                            strokeWidth={SEAM}
                            strokeLinejoin="round"
                          />
                        </Svg>
                      </View>
                    </Animated.View>
                  </View>
                );
              })}
            </Animated.View>
            <Animated.View style={[StyleSheet.absoluteFill, anim.open]}>
              <Svg width={PLANE_BOX} height={PLANE_BOX} viewBox={VIEW_BOX}>
                <Path d={PLANE_WING} fill={a.accent} />
                <Path d={PLANE_FOLD} fill={a.dark} />
              </Svg>
            </Animated.View>
          </Animated.View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { position: 'absolute', width: PLANE_BOX, height: PLANE_BOX },
  corner: { position: 'absolute' },
  dot: { position: 'absolute', width: TRAIL_DOT, height: TRAIL_DOT, borderRadius: TRAIL_DOT / 2 },
});
