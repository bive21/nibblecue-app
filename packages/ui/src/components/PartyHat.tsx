/**
 * PartyHat — the small party hat a baby's avatar wears in the top bar on the day it turns a whole
 * number of months (the owner, 2026-09-26: "agreed" … "lets try … apply it, and if i dont like it
 * then i will let you know"). The drawing, the pop and every rule they keep are in `partyHat.ts`;
 * its colors, measured, in `theme/partyHat.ts`. This hands them to one SVG and one value.
 *
 * DRAWN OVER THE HEAD IT IS WORN ON, in the head's own coordinates: the caller passes the circle
 * it drew (`cx`, `cy`, `r`) and the hat's view is placed round the hat alone — its box is the
 * hat's, keyline and all — so the chip's layout never learns the hat is there. The keyline is drawn
 * first, as the cone stroked twice its width with round joins and the pom-pom's own ring, and the
 * cone, its bands and the pom-pom over it; the pom-pom's ring is drawn over the cone's tip, so the
 * pom-pom stands off the cone as well as off the ground.
 *
 * THE POP IS DECIDED ONCE, WHEN THE HAT FIRST APPEARS (`hatArrival`): the value starts at 0 and
 * runs to 1 a beat later, on the native driver, and the hat grows out of the middle of its base
 * past full size and settles. A hat that appears `still`, or under REDUCE MOTION, or in the AMBER
 * NIGHT (`motionStill`), is at 1 from its first frame and never moves. It never stops half way:
 * leaving the screen, or reduce motion arriving mid-pop, stops the run and sets the hat whole.
 *
 * TO EVERYTHING BUT THE EYE IT IS NOT THERE: no touches (`pointerEvents="none"`, so the chip's own
 * press is untouched), hidden from assistive technology, no name. What it means is said in the
 * chip's own name (`childChipLabel`).
 */
import { memo, useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Circle, Polygon } from 'react-native-svg';
import { partyHatColors } from '../theme/partyHat';
import { useTheme } from '../theme/ThemeProvider';
import type { Frame } from './dayNightSwitch';
import {
  HAT_POP,
  HAT_POP_FRAMES,
  hatArrival,
  hatGeometry,
  hatPoints,
  type HatEntrance,
} from './partyHat';
import { motionStill } from './tickDraw';

export interface PartyHatProps {
  /** The head's center and radius, in the coordinates of the view the hat is drawn in. */
  cx: number;
  cy: number;
  r: number;
  /** Degrees clockwise from upright (`hatTilt`). */
  tilt: number;
  /** How it arrives, read once as it first appears: `pop` plays the pop, `still` is simply there. */
  entrance: HatEntrance;
  testID?: string;
}

const EASE = Easing.bezier(...HAT_POP.ease);

// copies, because `interpolate` is typed for mutable arrays and the frames are frozen data
const drive = (v: Animated.Value, fr: Frame) =>
  v.interpolate({
    inputRange: [...fr.inputRange],
    outputRange: [...fr.outputRange],
    extrapolate: fr.extrapolate,
  });

function PartyHatBase({ cx, cy, r, tilt, entrance, testID }: PartyHatProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  const g = useMemo(() => hatGeometry({ cx, cy, r }, tilt), [cx, cy, r, tilt]);
  const c = partyHatColors(t.color, t.theme);
  // the arrival is the FIRST one: a `pop` that later becomes `still` must not play it again
  const arrival = useRef(hatArrival(entrance, still)).current;
  const pop = useRef(new Animated.Value(arrival.from)).current;

  useEffect(() => {
    if (!arrival.animate) return;
    // from nothing, every time this runs: a run the cleanup below finished early starts over
    pop.setValue(0);
    const run = Animated.timing(pop, {
      toValue: 1,
      delay: arrival.delay,
      duration: arrival.duration,
      easing: EASE,
      useNativeDriver: true,
    });
    run.start();
    // the chip going away: stopped AND whole, never frozen part-grown
    return () => {
      run.stop();
      pop.setValue(1);
    };
  }, [arrival, pop]);

  // reduce motion or the amber Night arriving while it pops: whole, at once
  useEffect(() => {
    if (still) pop.setValue(1);
  }, [still, pop]);

  const motion = useMemo(
    () => ({
      opacity: drive(pop, HAT_POP_FRAMES.opacity),
      transform: [{ scale: drive(pop, HAT_POP_FRAMES.scale) }],
    }),
    [pop],
  );

  const { box } = g;
  return (
    <Animated.View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={[
        styles.hat,
        {
          left: box.x,
          top: box.y,
          width: box.width,
          height: box.height,
          // it grows out of the middle of its base, where it meets the head
          transformOrigin: [g.pivot.x - box.x, g.pivot.y - box.y, 0],
        },
        motion,
      ]}
      {...(testID ? { testID } : {})}
    >
      <Svg
        width={box.width}
        height={box.height}
        viewBox={`${box.x} ${box.y} ${box.width} ${box.height}`}
      >
        <Polygon
          points={hatPoints(g.cone)}
          fill={c.halo}
          stroke={c.halo}
          strokeWidth={2 * g.halo}
          strokeLinejoin="round"
        />
        <Polygon points={hatPoints(g.cone)} fill={c.cone} />
        {g.stripes.map((band, i) => (
          <Polygon key={i} points={hatPoints(band)} fill={c.stripe} />
        ))}
        <Circle cx={g.pom.cx} cy={g.pom.cy} r={g.pom.r + g.halo} fill={c.halo} />
        <Circle cx={g.pom.cx} cy={g.pom.cy} r={g.pom.r} fill={c.pom} />
      </Svg>
    </Animated.View>
  );
}

/** Memoized on its props: the chip re-renders with the bar, and the hat has nothing new to draw. */
export const PartyHat = memo(PartyHatBase);

const styles = StyleSheet.create({
  hat: { position: 'absolute' },
});
