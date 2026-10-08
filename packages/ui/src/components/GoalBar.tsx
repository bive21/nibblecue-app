/**
 * GoalBar — a daily goal's progress line that says, once the day reaches the goal, that it has
 * (the owner, 2026-09-26: *"possible tummy time animation idea: when goal is achieved, make it more
 * celebratory"*). `goalBurst.ts` has the moment's numbers.
 *
 * AT REST it is `ProgressLine`, exactly as the tummy-time goal drew it, and — while `reached` — a
 * small check on the bar's end in the bar's own color, and the caller's `words` under it ("Today's
 * goal: done"). WHEN THE APP SAYS THE MOMENT IS NOW (a new `moment`), it plays once: the bar fills
 * the rest of the way from where the day stood, the check pops, a few sparkles burst up out of it
 * and fade, and the words rise into place. WHEN is the app's to decide — a crossing it saw, once
 * per baby per day, after any sheet over it has gone — and this only draws it.
 *
 * Decoration, declared as such: the bar, the check and the sparkles are hidden from assistive
 * technology and take no touch, because the words round them carry the same facts; `words` is text
 * and is read. No haptic (`goalBurst.ts` says why). Transforms and opacity on the native driver.
 * Reduce motion and the amber Night (`motionStill`): the end state only — nothing fills, pops, is
 * thrown or glows, and the check is drawn in the night palette's own ink.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Icon } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { SPARKLE_PATH } from './dayNightSwitch';
import {
  GOAL_BURST_MS,
  GOAL_MARK,
  GOAL_MARK_CHECK,
  GOAL_SPARKS,
  goalBurstFrames,
} from './goalBurst';
import { num } from './PictureToggle';
import { PROGRESS_LINE_HEIGHT, ProgressLine } from './ProgressLine';
import { BodySm } from './Text';
import { motionStill } from './tickDraw';

/** The moment to play: a new `id` plays it once, the fill starting at `from` (0–1). */
export interface GoalMoment {
  id: number;
  from: number;
  /** When the app decided it (ms): a bar that mounts after it would have ended plays nothing. */
  at: number;
  /** How long to wait before it starts — a sheet over the bar sliding away. */
  delayMs?: number;
}

/** Whether a moment decided at `m.at` is still to be seen `now`, rather than already over. */
export const goalMomentLive = (m: GoalMoment, now: number): boolean =>
  now - m.at <= (m.delayMs ?? 0) + GOAL_BURST_MS;

export interface GoalBarProps {
  /** How full the bar is, 0–1 (`goalProgress`). */
  value: number;
  /** The bar's fill, the check's disc and the sparkles: the module's own ink. */
  color: string;
  /** The day has reached the goal: the check on the end, and the words under it. */
  reached: boolean;
  /** The moment, when the app says it is now; null otherwise. */
  moment?: GoalMoment | null;
  /** Said under the bar while the goal is reached — a plain fact, never praise. */
  words?: string;
  /** The line's own id, as `ProgressLine` carried it. */
  testID?: string;
}

export function GoalBar({ value, color, reached, moment = null, words, testID }: GoalBarProps) {
  const t = useTheme();
  const still = motionStill(t.reduceMotion, t.theme);
  const v = useRef(new Animated.Value(1)).current;
  const [playing, setPlaying] = useState<GoalMoment | null>(null);
  const played = useRef<number | null>(null);

  // a new moment starts from its first frame — a layout effect, so the frame that brings it never
  // shows the full bar first; one already played, or one that would already be over when handed
  // to a bar that has just mounted, is never played
  useLayoutEffect(() => {
    if (moment === null || moment.id === played.current) return;
    played.current = moment.id;
    if (still || !reached || !goalMomentLive(moment, Date.now())) return;
    v.setValue(0);
    setPlaying(moment);
  }, [moment, still, reached, v]);

  useEffect(() => {
    if (playing === null) return undefined;
    const run = Animated.timing(v, {
      toValue: 1,
      duration: GOAL_BURST_MS,
      delay: playing.delayMs ?? 0,
      easing: Easing.linear,
      useNativeDriver: true,
    });
    run.start(({ finished }) => {
      if (finished) setPlaying(null);
    });
    // the bar going away, or the next moment: at rest, never half way
    return () => {
      run.stop();
      v.setValue(1);
    };
  }, [playing, v]);

  // reduce motion or Night arriving mid-moment: the end state at once
  useEffect(() => {
    if (still && playing !== null) setPlaying(null);
  }, [still, playing]);

  const parts = useMemo(() => {
    if (playing === null) return null;
    const f = goalBurstFrames(playing.from);
    return {
      fill: { transform: [{ scaleX: num(v, f.fill) }] },
      mark: { transform: [{ scale: num(v, f.mark) }] },
      sparks: f.sparks.map(s => ({
        opacity: num(v, s.opacity),
        transform: [
          { translateX: num(v, s.x) },
          { translateY: num(v, s.y) },
          { scale: num(v, s.scale) },
        ],
      })),
      words: { opacity: num(v, f.words.opacity), transform: [{ translateY: num(v, f.words.y) }] },
    };
  }, [playing, v]);

  const moving = parts !== null && !still;
  // the check reads on the disc as the card's own ground does against the module's ink
  const ground = t.color.surfaceSolid;

  return (
    <View style={words !== undefined && reached ? { gap: t.space.xs } : undefined}>
      <View>
        {/* while it fills, the line under the moving fill is the empty track */}
        <ProgressLine value={moving ? 0 : value} color={color} {...(testID ? { testID } : {})} />
        {moving ? (
          <View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.fillBox, { height: PROGRESS_LINE_HEIGHT, borderRadius: t.radius.pill }]}
          >
            <Animated.View style={[styles.fill, { backgroundColor: color }, parts.fill]} />
          </View>
        ) : null}
        {moving
          ? GOAL_SPARKS.map((s, i) => (
              <Animated.View
                key={i}
                pointerEvents="none"
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
                style={[
                  styles.abs,
                  {
                    right: GOAL_MARK / 2 - s.size / 2,
                    top: PROGRESS_LINE_HEIGHT / 2 - s.size / 2,
                    width: s.size,
                    height: s.size,
                  },
                  parts.sparks[i],
                ]}
              >
                <Svg width={s.size} height={s.size} viewBox="0 0 10 10">
                  <Path d={SPARKLE_PATH} fill={color} />
                </Svg>
              </Animated.View>
            ))
          : null}
        {reached ? (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[
              styles.abs,
              styles.mark,
              {
                right: 0,
                top: (PROGRESS_LINE_HEIGHT - GOAL_MARK) / 2,
                width: GOAL_MARK,
                height: GOAL_MARK,
                borderRadius: GOAL_MARK / 2,
                backgroundColor: color,
                borderColor: ground,
              },
              moving ? parts.mark : null,
            ]}
            {...(testID ? { testID: `${testID}.done` } : {})}
          >
            <Icon name="check" size={GOAL_MARK_CHECK} color={ground} />
          </Animated.View>
        ) : null}
      </View>
      {words !== undefined && reached ? (
        <Animated.View style={moving ? parts.words : null}>
          <BodySm ink="text2" numberOfLines={1} {...(testID ? { testID: `${testID}.words` } : {})}>
            {words}
          </BodySm>
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  abs: { position: 'absolute' },
  fillBox: { position: 'absolute', left: 0, right: 0, top: 0, overflow: 'hidden' },
  // the whole track's width, grown from its left end: the fill's share is its scale
  fill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, transformOrigin: 'left' },
  mark: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
});
