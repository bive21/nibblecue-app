/**
 * FoodPlate — the solids sheet's little plate: every food on the list is a morsel on it, dropped in
 * as the parent writes it and lifted off as they take it away (`foodPlate.ts` has the numbers,
 * the colors and why each is what it is; the owner's delight list, 2026-09-26).
 *
 * FRAME BY FRAME. A food arrives: its morsel falls into its place in the row (220 ms, gravity),
 * squashes, bounces four points and hops once more (440 ms in all), and the others glide aside to
 * keep the row centered (260 ms). The landing is felt once — `haptic('tap')` at 220 ms, one per
 * change however many foods it brought. A food leaves: its morsel lifts off and fades (240 ms)
 * while the rest close up. Past six, the rest are a "+3" chip beside the plate.
 *
 * DECORATION, MIRRORING THE LIST. The list is the control and the only thing assistive technology
 * hears; this is hidden from it and takes no touches. What the plate was drawn with at first is
 * simply there — a sheet never plays a move nobody asked for. Reduce motion and the amber Night
 * set every end state and play nothing; Night draws from the night palette with no shadow.
 * Opacity and transforms only, on the native driver.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Ellipse } from 'react-native-svg';
import { haptic } from '../feedback/haptics';
import { useTheme } from '../theme/ThemeProvider';
import type { Frame } from './dayNightSwitch';
import {
  dropFrames,
  landMs,
  liftFrames,
  MORSEL,
  morselColors,
  morselInitial,
  PLATE,
  PLATE_CHIP,
  PLATE_MOTION,
  PLATE_STRIP,
  plateChange,
  plateColors,
  platePicture,
  type PlateFood,
  type PlateMorsel,
  type PlatePicture,
} from './foodPlate';
import { AppText } from './Text';
import { motionStill } from './tickDraw';

export interface FoodPlateProps {
  /** The list's lines, in order: the ones with a name are on the plate. */
  foods: readonly PlateFood[];
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

const EASE = Easing.bezier(...PLATE_MOTION.ease);
const num = (v: Animated.Value, f: Frame) =>
  v.interpolate({
    inputRange: [...f.inputRange],
    outputRange: [...f.outputRange],
    extrapolate: f.extrapolate,
  });

export function FoodPlate({ foods, style, testID }: FoodPlateProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  const c = plateColors(t.color, t.theme);
  // the list's lines arrive as a new array on every keystroke; the plate changes only when a
  // food's place or its first letter does, so that is what it is keyed by
  const sig = foods.map(f => `${f.key}\u0000${morselInitial(f.name)}`).join('\u0001');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `sig` is `foods`, read for what the plate draws
  const picture = useMemo(() => platePicture(foods), [sig]);

  // what the plate showed last, the morsels on their way off, and the drops still to be played
  const shown = useRef<PlatePicture | null>(null);
  const [leaving, setLeaving] = useState<PlateMorsel[]>([]);
  const [arriving] = useState(() => new Set<string>());
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const change = plateChange(shown.current, picture);
  if (!still) for (const key of change.arrived) arriving.add(key);

  useEffect(() => {
    const was = shown.current;
    shown.current = picture;
    const { arrived, left } = plateChange(was, picture);
    // one landing felt for one change of the list, however many foods it brought
    if (arrived.length > 0) {
      if (still) haptic('tap');
      else {
        const timer = setTimeout(() => {
          timers.current.delete(timer);
          haptic('tap');
        }, landMs());
        timers.current.add(timer);
      }
    }
    if (left.length === 0 || still) return;
    setLeaving(l => [...l.filter(m => !left.some(g => g.key === m.key)), ...left]);
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setLeaving(l => l.filter(m => !left.some(g => g.key === m.key)));
    }, PLATE_MOTION.liftMs);
    timers.current.add(timer);
  }, [picture, still]);

  // the plate going away takes its timers with it
  useEffect(() => {
    const own = timers.current;
    return () => {
      for (const timer of own) clearTimeout(timer);
      own.clear();
    };
  }, []);

  const onPlate = new Set(picture.morsels.map(m => m.key));
  const lifting = still ? [] : leaving.filter(m => !onPlate.has(m.key));

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ width: PLATE_STRIP.width, height: PLATE_STRIP.height }, style]}
      {...(testID === undefined ? {} : { testID })}
    >
      <Svg width={PLATE_STRIP.width} height={PLATE_STRIP.height} style={StyleSheet.absoluteFill}>
        {c.shadow === null ? null : (
          <Ellipse
            cx={PLATE.cx}
            cy={PLATE.cy + PLATE.ry + 0.5}
            rx={PLATE.rx - 4}
            ry={PLATE.shadowRy}
            fill={c.shadow}
          />
        )}
        <Ellipse
          cx={PLATE.cx}
          cy={PLATE.cy}
          rx={PLATE.rx}
          ry={PLATE.ry}
          fill={c.face}
          stroke={c.rim}
          strokeWidth={PLATE.rim}
        />
        <Ellipse
          cx={PLATE.cx}
          cy={PLATE.cy + 1}
          rx={PLATE.wellRx}
          ry={PLATE.wellRy}
          fill={c.well}
        />
      </Svg>
      {lifting.map(m => (
        <Morsel key={`${m.key}:off`} morsel={m} mode="lift" still={still} />
      ))}
      {picture.morsels.map(m => (
        <Morsel
          key={m.key}
          morsel={m}
          mode={arriving.has(m.key) ? 'drop' : 'rest'}
          onPlayed={() => arriving.delete(m.key)}
          still={still}
        />
      ))}
      {picture.more > 0 ? (
        <View
          style={[
            styles.chip,
            {
              left: PLATE_CHIP.left,
              top: PLATE.cy - PLATE_CHIP.height / 2,
              width: PLATE_CHIP.width,
              height: PLATE_CHIP.height,
              borderRadius: t.radius.pill,
              backgroundColor: c.chip,
              borderColor: c.chipEdge,
            },
          ]}
        >
          <AppText
            variant="meta"
            color={c.chipText}
            numeric
            align="center"
            // a11y-fixed-scale: a count in a chip of fixed size; the plate is decoration, and the
            // list beside it says it in words
            maxFontSizeMultiplier={1.15}
          >
            {`+${picture.more}`}
          </AppText>
        </View>
      ) : null}
    </View>
  );
}

/**
 * ONE MORSEL: where it stands (glided there when the row moves), and the one move it was mounted
 * for — a drop, a lift, or none.
 */
function Morsel({
  morsel,
  mode,
  still,
  onPlayed,
}: {
  morsel: PlateMorsel;
  mode: 'drop' | 'lift' | 'rest';
  still: boolean;
  onPlayed?: () => void;
}) {
  const t = useTheme();
  const c = plateColors(t.color, t.theme);
  const m = morselColors(t.color, morsel.role);
  // constructed where its first frame belongs: at its place, or above it for a drop
  const [x] = useState(() => new Animated.Value(morsel.x));
  const [y] = useState(() => new Animated.Value(morsel.y));
  const [move] = useState(() => new Animated.Value(mode === 'rest' || still ? 1 : 0));
  const [frames] = useState(() => (mode === 'lift' ? liftFrames() : dropFrames()));

  // the one move it was mounted for
  useEffect(() => {
    if (mode === 'rest' || still) {
      move.setValue(1);
      onPlayed?.();
      return undefined;
    }
    const run = Animated.timing(move, {
      toValue: 1,
      duration: mode === 'lift' ? PLATE_MOTION.liftMs : PLATE_MOTION.dropMs,
      // the frames carry their own curves: the fall is gravity, the bounces half cosines
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (finished) onPlayed?.();
    });
    return () => run.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a morsel plays the move it was mounted for once; a new move is a new morsel
  }, []);

  // the row moving: glide to the new place, or step there when nothing moves. A lifting morsel
  // stays where it left from; one that is placed again mid-glide sets off from where it is
  const [lifts] = useState(() => mode === 'lift');
  const placed = useRef({ x: morsel.x, y: morsel.y });
  const glide = useRef<Animated.CompositeAnimation | null>(null);
  useEffect(() => {
    const was = placed.current;
    const moved = was.x !== morsel.x || was.y !== morsel.y;
    placed.current = { x: morsel.x, y: morsel.y };
    if (still || lifts) {
      glide.current?.stop();
      glide.current = null;
      x.setValue(morsel.x);
      y.setValue(morsel.y);
      return;
    }
    if (!moved) return;
    glide.current?.stop();
    const timing = (v: Animated.Value, toValue: number) =>
      Animated.timing(v, {
        toValue,
        duration: PLATE_MOTION.glideMs,
        easing: EASE,
        useNativeDriver: true,
      });
    glide.current = Animated.parallel([timing(x, morsel.x), timing(y, morsel.y)]);
    glide.current.start();
  }, [morsel.x, morsel.y, still, lifts, x, y]);
  useEffect(() => () => glide.current?.stop(), []);

  const r = MORSEL.d / 2;
  // built once per morsel: every re-render of the sheet (a keystroke) keeps the same nodes, so a
  // drop in flight on the native side is never re-attached
  const pose = useMemo(() => {
    const f = frames;
    const at = {
      translateX: Animated.subtract(x, r),
      translateY: Animated.add(Animated.subtract(y, r), num(move, f.y)),
    };
    return 'scale' in f
      ? {
          opacity: num(move, f.opacity),
          transform: [
            { translateX: at.translateX },
            { translateY: at.translateY },
            { scale: num(move, f.scale) },
          ],
        }
      : {
          opacity: num(move, f.opacity),
          transform: [
            { translateX: at.translateX },
            { translateY: at.translateY },
            { scaleX: num(move, f.scaleX) },
            { scaleY: num(move, f.scaleY) },
          ],
        };
  }, [frames, move, r, x, y]);

  return (
    <Animated.View
      style={[
        styles.morsel,
        {
          width: MORSEL.d,
          height: MORSEL.d,
          borderRadius: r,
          borderWidth: MORSEL.rim,
          backgroundColor: m.fill,
          borderColor: m.rim,
          ...pose,
        },
      ]}
    >
      {/* a11y-fixed-scale: one letter in a morsel of fixed size; the plate is decoration, and the
          list beside it says every food */}
      <AppText variant="label" color={c.letter} align="center" maxFontSizeMultiplier={1}>
        {morsel.initial}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  morsel: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chip: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
