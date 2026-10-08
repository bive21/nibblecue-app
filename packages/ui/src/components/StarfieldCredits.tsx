/**
 * StarfieldCredits — the About sheet's hidden page (the owner, 2026-09-25, of the "that's cool"
 * list: *"might not necessarily be useful, but it's cool … Let's try doing everything"*). Seven
 * taps on the wordmark (`countTap`) open a night sky of slowly drifting stars with the credits in
 * the middle of it: the name, who made it, a line of thanks, and how to close it — which is a tap
 * anywhere, or Back.
 *
 * WHAT MOVES. Three layers of stars drift up at three speeds, far ones slowest (`starfield.ts`),
 * each looped on the native driver with a transform and nothing else; the words and their panel
 * stay still in the middle. REDUCE MOTION holds the stars where they are — the same sky, still
 * (docs/DESIGN_SYSTEM.md §7) — and so does the AMBER NIGHT THEME, which also draws the stars from
 * the night palette's own inks and puts no glow round any of them (`theme/starfield.ts`). The
 * sheet's own fade in and out is the Modal's, and is off under either.
 *
 * TO ASSISTIVE TECHNOLOGY IT IS ONE BUTTON: its name is the credits themselves, read in order, and
 * activating it closes the page. The sky is scenery, hidden and untouchable. Every word comes from
 * the caller — the About sheet reads the names from the brand package — and none is typed here.
 */
import { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Modal,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { starfieldFor, type StarfieldScene } from '../theme/starfield';
import { useTheme } from '../theme/ThemeProvider';
import { SPARKLE_PATH } from './dayNightSwitch';
import { useMotionAwake } from './MotionGate';
import { driftFrames, starfield, STARFIELD_LAYERS, type StarLayer } from './starfield';
import { AppText } from './Text';
import { useModalGate } from './useModalGate';

/** The tap counting, for the sheet that hides this; the numbers stay in `starfield.ts`. */
export { countTap, tapFeel, type TapRun } from './starfield';

export interface StarfieldCreditsProps {
  visible: boolean;
  onClose: () => void;
  /** The name at the head of the credits. */
  title: string;
  /** The lines under it, in order. */
  lines: readonly string[];
  /** The small line at the foot: how to close it, for a finger. */
  hint: string;
  /** The same for a screen reader, which closes it with its own gesture. */
  accessibilityHint: string;
  testID?: string;
}

/** Not useId(): its output contains ':', which is not valid in an SVG fragment identifier. */
let instances = 0;

export function StarfieldCredits({
  visible: asked,
  onClose,
  title,
  lines,
  hint,
  accessibilityHint,
  testID,
}: StarfieldCreditsProps) {
  // on an iPhone, never presented while another modal is still going (`modalGate.ts`)
  const visible = useModalGate(asked, 300);
  const t = useTheme();
  const uid = useRef<string | null>(null);
  if (uid.current === null) uid.current = `cc-starfield-${(instances += 1)}`;
  const id = uid.current;
  const { width, height } = useWindowDimensions();
  const scene = starfieldFor(t.theme);
  // nothing drifts for a phone that asked for reduced motion, or in the amber theme at 3 a.m.
  const still = t.reduceMotion || t.theme === 'night';
  const layers = useMemo(() => starfield(width, height), [width, height]);
  const drift = useRef(STARFIELD_LAYERS.map(() => new Animated.Value(0))).current;
  // the app put away (or its page left the front): the sky stops drifting until it can be seen
  // (`useMotionAwake`, docs/DESIGN_SYSTEM.md §7.1)
  const awake = useMotionAwake();

  useEffect(() => {
    if (!visible || still) {
      // held where the sky began, so a still sky is the same sky every time it opens
      for (const v of drift) v.setValue(0);
      return undefined;
    }
    if (!awake) {
      // back to where the sky begins while nobody is looking: a native loop goes round from
      // wherever its value stood when it started, so one resumed half way would jump every lap
      for (const v of drift) v.setValue(0);
      return undefined;
    }
    const runs = STARFIELD_LAYERS.map((layer, i) =>
      Animated.loop(
        Animated.timing(drift[i] as Animated.Value, {
          toValue: 1,
          duration: layer.periodMs,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ),
    );
    for (const run of runs) run.start();
    return () => {
      for (const run of runs) run.stop();
    };
  }, [drift, still, visible, awake]);

  const frames = driftFrames(height);

  return (
    <Modal
      visible={visible}
      transparent
      animationType={still ? 'none' : 'fade'}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[title, ...lines].join('. ')}
        accessibilityHint={accessibilityHint}
        onPress={onClose}
        style={styles.fill}
        {...(testID ? { testID } : {})}
      >
        <View
          pointerEvents="none"
          importantForAccessibility="no-hide-descendants"
          accessibilityElementsHidden
          style={StyleSheet.absoluteFill}
        >
          <Svg width={width} height={height} style={StyleSheet.absoluteFill}>
            <Defs>
              <SvgLinearGradient
                id={`${id}-sky`}
                gradientUnits="userSpaceOnUse"
                x1={0}
                y1={0}
                x2={0}
                y2={height}
              >
                <Stop offset={0} stopColor={scene.sky[0]} />
                <Stop offset={1} stopColor={scene.sky[1]} />
              </SvgLinearGradient>
            </Defs>
            <Rect x={0} y={0} width={width} height={height} fill={`url(#${id}-sky)`} />
          </Svg>
          {layers.map((layer, i) => (
            <Animated.View
              key={layer.key}
              style={[
                styles.layer,
                {
                  height: height * 2,
                  transform: [
                    {
                      translateY: (drift[i] as Animated.Value).interpolate({
                        inputRange: frames.inputRange,
                        outputRange: frames.outputRange,
                      }),
                    },
                  ],
                },
              ]}
            >
              {/* the same stars twice, one screen apart: the loop's last frame is its first */}
              <StarTile layer={layer} scene={scene} width={width} height={height} top={0} />
              <StarTile layer={layer} scene={scene} width={width} height={height} top={height} />
            </Animated.View>
          ))}
        </View>

        <View pointerEvents="none" style={[styles.center, { padding: t.space.xxl }]}>
          <View
            style={[
              styles.panel,
              {
                backgroundColor: scene.panel,
                borderRadius: t.radius.xl,
                paddingHorizontal: t.space.xxl,
                paddingVertical: t.space.xxxl,
                gap: t.space.md,
              },
            ]}
          >
            <AppText variant="h1" color={scene.title} align="center">
              {title}
            </AppText>
            {lines.map(line => (
              <AppText key={line} variant="body" color={scene.text} align="center">
                {line}
              </AppText>
            ))}
            <AppText
              variant="meta"
              color={scene.hint}
              align="center"
              style={{ marginTop: t.space.md }}
            >
              {hint}
            </AppText>
          </View>
        </View>
      </Pressable>
    </Modal>
  );
}

/** One screen's worth of one layer: dots, or setup's sparkle with a faint light round it. */
function StarTile({
  layer,
  scene,
  width,
  height,
  top,
}: {
  layer: StarLayer;
  scene: StarfieldScene;
  width: number;
  height: number;
  top: number;
}) {
  const glow = scene.glow;
  return (
    <Svg width={width} height={height} style={[styles.tile, { top }]}>
      {layer.stars.map(s =>
        layer.kind === 'dot' ? (
          <Circle
            key={`${s.x}-${s.y}`}
            cx={s.x}
            cy={s.y}
            r={s.size / 2}
            fill={scene.star}
            opacity={s.alpha}
          />
        ) : (
          <G key={`${s.x}-${s.y}`} opacity={s.alpha}>
            {glow === null ? null : <Circle cx={s.x} cy={s.y} r={s.size} fill={glow} />}
            <G
              transform={`translate(${s.x - s.size / 2} ${s.y - s.size / 2}) scale(${s.size / 10})`}
            >
              <Path d={SPARKLE_PATH} fill={scene.sparkle} />
            </G>
          </G>
        ),
      )}
    </Svg>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  layer: { position: 'absolute', top: 0, left: 0, right: 0 },
  tile: { position: 'absolute', left: 0 },
  center: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  panel: { maxWidth: 360, alignItems: 'center' },
});
