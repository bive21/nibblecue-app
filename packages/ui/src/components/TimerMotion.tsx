/**
 * TimerMotion — the running cards' small moves (the owner, 2026-09-26: *"makes the app look more
 * fun"*), drawn over the card's picture and under its words. `timerMotion.ts` holds every number
 * and says what each move is; this only hands the frames to views, on the native driver.
 *
 *   A SLEEP, NAP OR NIGHT: "z"s drift up out of the air above the sleeping baby, in the picture's
 *     own deepest hue (the owner, 2026-09-27: *"yes show zzz at night too"*; until then a daytime
 *     nap's only).
 *
 * That is the one move left. The pump's two bottles went at the owner's word, and the moon's
 * breath and the tummy-time push-up with the old pictures they were measured on (the owner,
 * 2026-09-26: *"keep the zzz animation you have for sleeping, but the pumping animation doesnot
 * mean much, you can remove this"*; `timerMotion.ts` says why the other two went too).
 *
 * THE "Z"S ARE THE PICTURE'S INK, NOT THE CARD'S. They were white on the old teal sky; the new
 * sleeping picture is lavender, where white measures 2:1 against the sky and 1.2:1 over its
 * sparkles. Drawn in the picture's own deepest hue — `CardArt.veilColor`, measured from the file by
 * `render-card-art.mjs`, the ink the old pump bottles' outline took — they clear 5:1 on every pixel
 * they cross, and read as part of the drawing rather than a sticker on it. The app's test walks
 * every frame of every "z" over the owner's pixels (`apps/mobile/src/ui/cardArtParts.test.ts`).
 *
 * THE LAYER CLIPS TO THE CARD'S CORNERS, the way the motif's does: the card itself cannot hide its
 * overflow without hiding its own shadow (`shadows.ts`).
 *
 * DECORATION, TO EVERYTHING BUT THE EYE: no touches, hidden from assistive technology, and nothing
 * it draws is information — the card's words carry the whole of what is running. Reduce motion
 * and the amber Night draw no "z" at all (`timerMoves`), over Night's own dim picture too.
 */
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import type { ArtParts, CardArt } from '../theme/artInk';
import { useTheme } from '../theme/ThemeProvider';
import { Z_PATH, Z_STROKE, Z_VIEWBOX } from './bellSwitch';
import type { Rect as Box } from './cardArtFit';
import { useMotionActive } from './MotionGate';
import { deg, num, type AnimatedStyle } from './PictureToggle';
import type { TimerType } from './StopButton';
import { artPlacement, timerMoves, Z_DRIFT, zFrames } from './timerMotion';

export interface TimerMotionProps {
  type: TimerType;
  /** The picture as the card draws it: in the amber Night its Night version, which is still. */
  art: CardArt | null;
  /** The card's corner radius: the layer clips to it. */
  radius: number;
}

/**
 * One whole turn of a clock, looped on the native driver; a clock never eases — its frames do.
 *
 * IT TURNS ONLY WHILE SOMEBODY CAN SEE IT (`useMotionActive`, docs/DESIGN_SYSTEM.md §7.1): Today
 * stays mounted behind the other tabs, and a nap can run for two hours with the phone in a pocket.
 * Paused, it rests at the start of its turn — the frames' own rest — and starts again from there.
 */
function useLoopClock(cycleMs: number): Animated.Value {
  const clock = useRef(new Animated.Value(0)).current;
  const turning = useMotionActive();
  useEffect(() => {
    if (!turning) return undefined;
    const loop = Animated.loop(
      Animated.timing(clock, {
        toValue: 1,
        duration: cycleMs,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    // the card going away, the move being switched off (reduce motion, Night), or the page
    // leaving the front
    return () => {
      loop.stop();
      clock.setValue(0);
    };
  }, [clock, cycleMs, turning]);
  return clock;
}

/**
 * Memoised on what it draws: the card re-renders every second to tick its digits, and a layer that
 * restarted its clock with every tick would never get past its first frame.
 */
export const TimerMotion = memo(
  function TimerMotion({ type, art, radius }: TimerMotionProps) {
    const t = useTheme();
    const [box, setBox] = useState<Box | null>(null);
    const moves = timerMoves({ type, art, theme: t.theme, reduceMotion: t.reduceMotion });
    const picture = t.theme === 'night' ? null : art;
    const zs = picture?.parts?.zs;
    if (!moves.zs || picture === null || zs === undefined) return null;
    const onLayout = (e: LayoutChangeEvent) => {
      const { width, height } = e.nativeEvent.layout;
      setBox(prev =>
        prev && prev.width === width && prev.height === height ? prev : { width, height },
      );
    };
    return (
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        onLayout={onLayout}
        style={[StyleSheet.absoluteFill, styles.clip, { borderRadius: radius }]}
      >
        {box ? <DriftingZs art={picture} box={box} path={zs} /> : null}
      </View>
    );
  },
  (a, b) => a.type === b.type && a.art === b.art && a.radius === b.radius,
);

/* ------------------------------------------------------------------------------ the "z"s */

function DriftingZs({
  art,
  box,
  path,
}: {
  art: CardArt;
  box: Box;
  path: NonNullable<ArtParts['zs']>;
}) {
  const clock = useLoopClock(Z_DRIFT.cycleMs);
  const pl = artPlacement(box, art);
  const { s, left, top } = pl;
  const zs = useMemo(
    () =>
      zFrames({ s, left, top }, path).map(z => {
        const style: AnimatedStyle = {
          opacity: num(clock, z.opacity),
          transform: [
            { translateX: num(clock, z.x) },
            { translateY: num(clock, z.y) },
            { rotate: deg(clock, z.turn) },
            { scale: num(clock, z.scale) },
          ],
        };
        return { z, style };
      }),
    [clock, s, left, top, path],
  );
  return (
    <>
      {zs.map(({ z, style }, i) => (
        <Animated.View
          // three "z"s on one path, told apart by when they leave
          key={i}
          style={[
            styles.abs,
            {
              left: z.born.x - z.size / 2,
              top: z.born.y - z.size / 2,
              width: z.size,
              height: z.size,
            },
            style,
          ]}
        >
          {/* the bell switch's own "z", so the app's sleep is drawn one way — in the picture's ink */}
          <Svg width={z.size} height={z.size} viewBox={Z_VIEWBOX}>
            <Path
              d={Z_PATH}
              fill="none"
              stroke={art.veilColor}
              strokeWidth={Z_STROKE}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Animated.View>
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
  abs: { position: 'absolute' },
});
