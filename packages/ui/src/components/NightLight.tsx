/**
 * NightLight — the whole screen as a warm, dim glow to see by in a dark room (the owner,
 * 2026-09-25, of the "that's cool" list: *"might not necessarily be useful, but it's cool … Let's
 * try doing everything"*). An amber light on near-black, a little above the middle of the screen;
 * a finger dragged up brightens it and warms it toward gold, dragged down dims it to an ember; a
 * tap or a swipe down closes it (`nightLight.ts` tells the three apart and says why the swipe
 * needed telling apart). The app's screen around it hides the status bar, keeps the phone awake
 * where it can and remembers the level; this draws the light and reads the finger.
 *
 * IT CANNOT GO WHITE. The colors are clamped in `theme/nightLight.ts` — at its brightest the heart
 * of the light is a golden amber, never blue-white and never white — and the level is clamped
 * here, so no drag and no accessibility action can reach past that. The phone's own backlight is
 * not this component's to change: that is `expo-brightness`, a native module, and this ships as
 * an over-the-air update.
 *
 * WHAT MOVES IS THE PARENT'S FINGER AND NOTHING ELSE. The golden glow is one layer over the ember
 * with its opacity set to the level; a drag sets that value frame by frame (opacity only, and no
 * React render per frame), and there is no animation of its own — no pulse, no flicker, no
 * breathing. So reduce motion changes nothing here, and neither does the amber Night theme beyond
 * its colors: it gets the light built from the night palette's own roles.
 *
 * TO ASSISTIVE TECHNOLOGY IT IS ONE ADJUSTABLE ELEMENT: its name, its level as a value ("40
 * percent", in the caller's words), swipe up or down to change it a tenth at a time, double tap
 * to close, and the escape gesture to close. The line of words at the foot says the same to the
 * eye. The design system types no copy: every word comes from the caller.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  StyleSheet,
  useWindowDimensions,
  View,
  type AccessibilityActionEvent,
} from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { haptic } from '../feedback/haptics';
import { nightLightFor, type NightLightGlow } from '../theme/nightLight';
import { useTheme } from '../theme/ThemeProvider';
import {
  clampLevel,
  endReached,
  GLOW_STOPS,
  levelAfterDrag,
  levelPercent,
  NIGHT_LIGHT_LEVEL,
  nightLightGeometry,
  releaseOf,
  stepLevel,
  type NightLightGeometry,
} from './nightLight';
import { AppText, CHROME_FONT_CAP } from './Text';

// the level's arithmetic is `nightLight.ts`'s; the app reads it from `@nibblecue/ui/layout`

export interface NightLightProps {
  /**
   * 0 (the dimmest ember) to 1 (the brightest it may be). Null while the app is still reading the
   * level it saved: the room stays dark for that moment rather than flashing the default first.
   */
  level: number | null;
  /** The level a parent settled on — a drag's lift, or an accessibility step. Never every frame. */
  onLevel: (level: number) => void;
  /** A tap, a swipe down, the accessibility activate or escape. */
  onClose: () => void;
  /** Its name to assistive technology. */
  label: string;
  /** The line at the foot: how to use it, for a finger ("drag", "tap"). */
  hint: string;
  /**
   * The same, for a screen reader, which has its own gestures for an adjustable element (swipe up
   * or down to change it, double tap to activate) — so the words a finger needs would be wrong.
   */
  accessibilityHint: string;
  /** The level in words, for the accessibility value ("40 percent"). */
  valueText: (percent: number) => string;
  /** The safe-area bottom inset in points; the app knows it and this package does not. */
  bottomInset: number;
  testID?: string;
}

const ACTIONS = [
  { name: 'increment' },
  { name: 'decrement' },
  { name: 'activate' },
  { name: 'escape' },
] as const;

/** Not useId(): its output contains ':', which is not valid in an SVG fragment identifier. */
let instances = 0;

export function NightLight({
  level,
  onLevel,
  onClose,
  label,
  hint,
  accessibilityHint,
  valueText,
  bottomInset,
  testID,
}: NightLightProps) {
  const t = useTheme();
  const uid = useRef<string | null>(null);
  if (uid.current === null) uid.current = `cc-nightlight-${(instances += 1)}`;
  const id = uid.current;
  const { width, height } = useWindowDimensions();
  const scene = nightLightFor(t.theme);
  const g = useMemo(
    () => nightLightGeometry(width, height, bottomInset),
    [width, height, bottomInset],
  );

  const first = clampLevel(level ?? NIGHT_LIGHT_LEVEL.start);
  // the golden glow's opacity IS the level
  const bright = useRef(new Animated.Value(first)).current;
  // the level on the screen right now, where the finger went down, and whether it is still down
  const shown = useRef(first);
  const from = useRef(first);
  const downAt = useRef(0);
  const dragging = useRef(false);
  const [percent, setPercent] = useState(levelPercent(first));
  // the latest callbacks and height, for a responder that is made once
  const latest = useRef({ onLevel, onClose, height });
  useEffect(() => {
    latest.current = { onLevel, onClose, height };
  });

  // a level that arrives from outside — the saved one, read after the first frame — is shown at
  // once, unless a finger is on the glass, which wins
  useEffect(() => {
    if (level === null || dragging.current) return;
    const v = clampLevel(level);
    shown.current = v;
    bright.setValue(v);
    setPercent(levelPercent(v));
  }, [bright, level]);

  const responder = useMemo(() => {
    const settle = (v: number) => {
      shown.current = v;
      bright.setValue(v);
      setPercent(levelPercent(v));
      latest.current.onLevel(v);
    };
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragging.current = true;
        from.current = shown.current;
        downAt.current = Date.now();
      },
      onPanResponderMove: (_e, gesture) => {
        const next = levelAfterDrag(from.current, gesture.dy, latest.current.height);
        // one tick as the travel stops doing anything, at either end
        if (endReached(shown.current, next) !== null) haptic('tick');
        shown.current = next;
        bright.setValue(next);
      },
      onPanResponderRelease: (_e, gesture) => {
        dragging.current = false;
        const lift = releaseOf({
          dx: gesture.dx,
          dy: gesture.dy,
          vy: gesture.vy,
          ms: Date.now() - downAt.current,
        });
        if (lift === 'adjust') {
          settle(shown.current);
          return;
        }
        // a tap or a swipe closes it AT THE LEVEL IT WAS OPENED AT: the swipe's own dimming on
        // the way down was not a request to dim the light for next time
        shown.current = from.current;
        bright.setValue(from.current);
        latest.current.onClose();
      },
      // the system took the gesture (a call, a notification pulled down): keep what was set
      onPanResponderTerminate: () => {
        dragging.current = false;
        settle(shown.current);
      },
    });
  }, [bright]);

  const onAction = (e: AccessibilityActionEvent) => {
    const name = e.nativeEvent.actionName;
    if (name === 'increment' || name === 'decrement') {
      const v = stepLevel(shown.current, name === 'increment' ? 1 : -1);
      shown.current = v;
      bright.setValue(v);
      setPercent(levelPercent(v));
      onLevel(v);
    } else if (name === 'activate' || name === 'escape') {
      onClose();
    }
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityValue={{ min: 0, max: 100, now: percent, text: valueText(percent) }}
      accessibilityActions={ACTIONS}
      onAccessibilityAction={onAction}
      onAccessibilityEscape={onClose}
      style={[styles.root, { backgroundColor: scene.ground }]}
      {...responder.panHandlers}
      {...(testID ? { testID } : {})}
    >
      {level === null ? null : (
        <View pointerEvents="none" style={StyleSheet.absoluteFill}>
          <Glow glow={scene.dim} r={g.dimR} g={g} id={`${id}-ember`} />
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: bright }]}>
            <Glow glow={scene.bright} r={g.brightR} g={g} id={`${id}-gold`} />
          </Animated.View>
        </View>
      )}
      <View
        pointerEvents="none"
        style={[styles.hint, { bottom: g.hintBottom, paddingHorizontal: t.space.xxl }]}
      >
        {/* two lines at the chrome cap at most: `HINT_BAND` is that much room, and the glow is
            sized never to reach it, so these words are always on the bare ground */}
        <AppText
          variant="bodySm"
          color={scene.hint}
          align="center"
          numberOfLines={2}
          maxFontSizeMultiplier={CHROME_FONT_CAP}
        >
          {hint}
        </AppText>
      </View>
    </View>
  );
}

/** One glow: a disc of radial gradient, from its core through its halo to the ground. */
function Glow({
  glow,
  r,
  g,
  id,
}: {
  glow: NightLightGlow;
  r: number;
  g: NightLightGeometry;
  id: string;
}) {
  if (!(r > 0)) return null;
  return (
    <Svg width={g.width} height={g.height} style={StyleSheet.absoluteFill}>
      <Defs>
        <RadialGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          cx={g.cx}
          cy={g.cy}
          r={r}
          fx={g.cx}
          fy={g.cy}
        >
          {GLOW_STOPS.map(s => (
            <Stop
              key={s.offset}
              offset={s.offset}
              stopColor={s.at === 'core' ? glow.core : glow.halo}
              stopOpacity={s.opacity}
            />
          ))}
        </RadialGradient>
      </Defs>
      <Circle cx={g.cx} cy={g.cy} r={r} fill={`url(#${id})`} />
    </Svg>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  hint: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
});
