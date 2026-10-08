/**
 * DropCelebration — a thing dropped into its place, with a little ceremony (docs/DESIGN_SYSTEM.md
 * §5, §7; the owner, 2026-09-26: *"for new mom's, adding to milk stash is quite a proud moment …
 * lets do some animation"*). The design system knows nothing about milk: the caller hands in what
 * drops (`item`), where it lands (`target`), the words that rise (`label`, the amount as a fact) and
 * which kind of motes burst (`motes`). `dropCelebration.ts` has the whole script, frame by frame, and
 * its test.
 *
 * ONE CLOCK, THE NATIVE DRIVER. One `Animated.Value` runs from 0 to `DROP_MS.total` in linear time,
 * and every part — the veil, the card, the fall and the bounces, the motes, the rising amount — is
 * an interpolation of it: opacity and transforms only, off the JS thread. `onDone` is called when it
 * is over — by the animation's own end, or by a timer a little after it, whichever comes first, so a
 * sheet is never left waiting on it.
 *
 * IT IS FELT AS NOTHING. The save that starts it was already felt, once, as `success`, in the app's
 * one write funnel (`useWriteContext`'s `announce`: one haptic per save, there and nowhere else). A
 * second `success` half a second later, at the landing, read on a phone as a double buzz — the
 * shape an error has — so the landing is seen, not felt.
 *
 * IT DOES NOT PLAY — `onDone` is called at once and nothing is drawn — under reduce motion (the
 * phone's, or Calm motion's, which is at night by default), in the amber Night where nothing moves
 * or glows (`motionStill`), and with a screen reader on (`useScreenReaderOn`), to which it would be
 * a second of nothing: the caller's own toast is what says what was added. When it does play,
 * `onPlay` says so as it starts, so a caller that keeps it to once a day spends the day only on a
 * moment somebody saw.
 *
 * IT NEVER STANDS IN THE WAY (2026-09-28). It was a Modal of its own, and a Modal is a window: for
 * its 1.44 s every tap on the sheet under it went nowhere and Back did nothing, on every stash add,
 * and a pumping parent adds six or eight a day. It is a plain layer now, `pointerEvents="none"`
 * from its root down, drawn over the sheet through the sheet's own `overlay` (`BottomSheet`): the
 * parent can close the sheet through it, by Back, the scrim or Close, and the moment simply goes
 * with the sheet. It is decoration to everything but the eye, hidden from assistive technology.
 */
import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTheme } from '../theme/ThemeProvider';
import {
  DROP_ITEM_TOP,
  DROP_LANDING,
  DROP_MS,
  DROP_STAGE,
  DROP_TARGET_TOP,
  itemFall,
  itemOpacity,
  itemTurn,
  labelOpacity,
  labelRise,
  moteKeys,
  motes,
  SPARKLE_PATH,
  stageOpacity,
  targetScale,
  type Keys,
  type MoteKind,
} from './dropCelebration';
import { POPOVER_SCRIM_OPACITY } from './Scrim';
import { motionStill } from './tickDraw';
import { Numeric } from './Text';
import { useScreenReaderOn } from './useScreenReader';

export interface DropPlay {
  /** A new object starts the moment; the same one keeps it going. */
  id: number;
}

export interface DropCelebrationProps {
  /** The moment to play, or null for none. */
  play: DropPlay | null;
  /** What drops: at most `DROP_STAGE.item.height` tall. */
  item: ReactNode;
  /** Where it lands: `DROP_STAGE.target` in size. */
  target: ReactNode;
  /** The words that rise from it — the amount, as a fact: "+5 oz". */
  label: string;
  motes: MoteKind;
  /** The motes' color: a graphic on the card, measured by the caller that chooses it. */
  moteColor: string;
  /** The moment is over (or was never going to play): the caller carries on. */
  onDone: () => void;
  /** The moment has started to play — never called when it is not going to (see the header). */
  onPlay?: () => void;
  testID?: string;
}

/** How long past its own end the moment waits for the animation's callback before carrying on. */
const DONE_SLACK_MS = 300;

export function DropCelebration({
  play,
  item,
  target,
  label,
  motes: moteKind,
  moteColor,
  onDone,
  onPlay,
  testID,
}: DropCelebrationProps) {
  const t = useTheme();
  const screenReader = useScreenReaderOn();
  const still = motionStill(t.reduceMotion, t.theme) || screenReader;
  const clock = useRef(new Animated.Value(0)).current;
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const playRef = useRef(onPlay);
  playRef.current = onPlay;
  const id = play?.id ?? null;

  useEffect(() => {
    if (id === null) return undefined;
    let over = false;
    const finish = (): void => {
      if (over) return;
      over = true;
      doneRef.current();
    };
    if (still) {
      finish();
      return undefined;
    }
    clock.setValue(0);
    const run = Animated.timing(clock, {
      toValue: DROP_MS.total,
      duration: DROP_MS.total,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    playRef.current?.();
    run.start(() => finish());
    const safety = setTimeout(finish, DROP_MS.total + DONE_SLACK_MS);
    return () => {
      clearTimeout(safety);
      run.stop();
      over = true;
    };
    // a screen reader turned on mid-way runs this again, and the moment ends at once
  }, [id, still, clock]);

  /*
    EVERY PART'S INTERPOLATION, BUILT ONCE per kind of mote, not per render: the sheet under the
    moment re-renders while it plays (its toast, its own state), and a fresh node handed to a view
    mid-animation is a node the native driver has to be told about again.
  */
  const parts = useMemo(() => {
    const drive = (k: Keys) => clock.interpolate({ inputRange: k.input, outputRange: k.output });
    const fade = drive(stageOpacity());
    const turn = itemTurn();
    return {
      fade,
      veil: Animated.multiply(fade, POPOVER_SCRIM_OPACITY),
      card: drive(targetScale()),
      fall: drive(itemFall()),
      turn: clock.interpolate({
        inputRange: turn.input,
        outputRange: turn.output.map(d => `${d}deg`),
      }),
      item: drive(itemOpacity()),
      label: drive(labelOpacity()),
      rise: drive(labelRise()),
      motes: motes(moteKind).map(m => {
        const k = moteKeys(m, moteKind);
        return {
          m,
          x: drive(k.x),
          y: drive(k.y),
          scale: drive(k.scale),
          opacity: drive(k.opacity),
        };
      }),
    };
  }, [clock, moteKind]);

  if (id === null || still) return null;

  const itemWidth = DROP_STAGE.item.height * 0.75;
  /*
    NOT A MODAL, and touch-transparent from the root down (the header says why): it is drawn where
    the caller puts it (over a sheet, through the sheet's `overlay`), and every tap goes through it
    to what is under it, as Back goes to the sheet.
  */
  return (
    <View
      pointerEvents="none"
      style={StyleSheet.absoluteFill}
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      {...(testID ? { testID } : {})}
    >
      {/* the veil: the sheet stays in view under it, a little quieter */}
      <Animated.View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          // the popover's own dim: the ink at a token opacity, never an rgba string (§12 rule 1)
          { backgroundColor: t.color.text, opacity: parts.veil },
        ]}
      />
      <View style={styles.center} pointerEvents="none">
        <Animated.View
          style={{ width: DROP_STAGE.width, height: DROP_STAGE.height, opacity: parts.fade }}
        >
          {/* the place's card, at the foot of the stage */}
          <Animated.View
            style={[
              styles.abs,
              {
                left: (DROP_STAGE.width - DROP_STAGE.target.width) / 2,
                top: DROP_TARGET_TOP,
                width: DROP_STAGE.target.width,
                height: DROP_STAGE.target.height,
                transform: [{ scale: parts.card }],
              },
            ]}
          >
            {target}
          </Animated.View>
          {/* the motes, from where it lands */}
          {parts.motes.map(({ m, x, y, scale, opacity }, i) => {
            return (
              <Animated.View
                key={i}
                style={[
                  styles.abs,
                  {
                    left: DROP_LANDING.x - m.size,
                    top: DROP_LANDING.y - m.size,
                    width: m.size * 2,
                    height: m.size * 2,
                    opacity,
                    transform: [{ translateX: x }, { translateY: y }, { scale }],
                  },
                ]}
              >
                <Svg width={m.size * 2} height={m.size * 2} viewBox="0 0 10 10">
                  {moteKind === 'sparkle' ? (
                    <Path d={SPARKLE_PATH} fill={moteColor} />
                  ) : (
                    <Circle cx={5} cy={5} r={2.6} fill={moteColor} />
                  )}
                </Svg>
              </Animated.View>
            );
          })}
          {/* what drops: it falls, turning a little, lands on the card and bounces */}
          <Animated.View
            style={[
              styles.abs,
              styles.foot,
              {
                left: DROP_LANDING.x - itemWidth / 2,
                top: DROP_ITEM_TOP,
                width: itemWidth,
                height: DROP_STAGE.item.height,
                opacity: parts.item,
                transform: [{ translateY: parts.fall }, { rotate: parts.turn }],
              },
            ]}
          >
            {item}
          </Animated.View>
          {/* the amount, as a fact, rising from above it */}
          <Animated.View
            style={[
              styles.abs,
              styles.labelRow,
              {
                top: DROP_STAGE.label.top,
                opacity: parts.label,
                transform: [{ translateY: parts.rise }],
              },
            ]}
          >
            <View
              style={{
                backgroundColor: t.color.surfaceSolid,
                borderRadius: t.radius.pill,
                paddingHorizontal: t.space.lg,
                paddingVertical: t.space.xs,
              }}
            >
              <Numeric
                variant="statValue"
                ink="text"
                {...(testID ? { testID: `${testID}.amount` } : {})}
              >
                {label}
              </Numeric>
            </View>
          </Animated.View>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  abs: { position: 'absolute' },
  foot: { alignItems: 'center', justifyContent: 'flex-end' },
  labelRow: { left: 0, right: 0, alignItems: 'center' },
});
