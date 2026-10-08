/**
 * LiveSky — the sky behind Today's top bar, in the colors of the hour (the owner, 2026-09-25, of
 * the "that's cool" list: *"might not necessarily be useful, but it's cool … Let's try doing
 * everything. I will then review"*). Dawn early in the morning, a clear day, a warm dusk, and a
 * night sky with a few still stars; the hour is the app's to read (`skyPhaseIn`, asked once a
 * minute by `useSkyPhase` while Today is in front), and this component only draws the phase it is
 * handed.
 *
 * WHERE IT SITS. `Screen` hands it the top bar's own box (`barBackdrop`) and draws the bar over it,
 * so the sky is exactly as tall as the bar — the status-bar inset, the row, the padding — and
 * fades into the page over the last `SKY_FOOT` points of it. It never reaches the page's own
 * words; the only things on it are the bar's, and `theme/liveSky.test.ts` measures every one of
 * them over every color the sky can be, fade and all. Behind Today's bar and no other: every other
 * screen draws its own bar over the plain ground.
 *
 * WHAT MOVES: ONE FADE, FOUR TIMES A DAY. When the phase changes, the new sky is laid over the old
 * one and fades in over three seconds on the native driver (opacity only), and the old one is let
 * go once it is covered. Nothing else moves: no drifting cloud, no twinkling star, no sun crossing
 * — a picture that moved all day on the screen a parent opens most would be a picture they learned
 * to resent. REDUCE MOTION and the AMBER NIGHT THEME both skip the fade and draw the new sky
 * outright (`skyMove`); in amber Night the sky is the night palette's flat `page` for every hour,
 * with no stars (`theme/liveSky.ts`).
 *
 * IT IS DECORATION TO EVERYTHING BUT THE EYE: `pointerEvents="none"`, hidden from assistive
 * technology, and it says nothing a parent needs — the clock on the phone is what tells the time.
 * It is weather rather than branding, so it may be on Today (CLAUDE.md §7 keeps the brand off it,
 * because the chrome belongs to the baby): it names nothing, sells nothing and holds no word.
 */
import { memo, useEffect, useRef, useState, type ReactNode } from 'react';
import { Animated, Easing, StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, {
  Circle,
  Defs,
  G,
  LinearGradient as SvgLinearGradient,
  Path,
  Rect,
  Stop,
} from 'react-native-svg';
import { liveSkyFor, type LiveSkyScene } from '../theme/liveSky';
import { useTheme } from '../theme/ThemeProvider';
import { SPARKLE_PATH } from './dayNightSwitch';
import { liveSkyGeometry, skyMove, type LiveSkyGeometry, type SkyPhase } from './liveSky';

/** The hour's arithmetic, for the app's clock; the numbers themselves stay in `liveSky.ts`. */
export { SKY_CHECK_MS, skyPhaseIn, type SkyPhase } from './liveSky';

export interface LiveSkyProps {
  /** The sky the hour has, read by the app on the household's clock (`skyPhaseIn`). */
  phase: SkyPhase;
  testID?: string;
}

/** Not useId(): its output contains ':', which is not valid in an SVG fragment identifier. */
let instances = 0;

/**
 * What is on the screen: the sky at rest, and the one fading in over it while a phase changes.
 * Each fade carries its OWN value, made when the fade begins, so a new one always starts from
 * nothing — a value reused from the last fade would show the new sky at full strength for the
 * frame before it was reset.
 */
interface Shown {
  base: SkyPhase;
  next: SkyPhase | null;
  fade: Animated.Value | null;
}

/**
 * Memoised: Today re-renders whenever anything on it changes — a timer, a sync, a new entry — and
 * hands the bar a new element each time; the sky only has to draw again when the hour, the size
 * or the theme does (the theme reaches it through context, which a memo does not block).
 */
export const LiveSky = memo(function LiveSky({ phase, testID }: LiveSkyProps) {
  const t = useTheme();
  const uid = useRef<string | null>(null);
  if (uid.current === null) uid.current = `cc-livesky-${(instances += 1)}`;
  const id = uid.current;
  const move = skyMove({ reduceMotion: t.reduceMotion, night: t.theme === 'night' });

  /*
    THE PHASE, AS STATE DERIVED DURING RENDER (React's "storing information from previous
    renders", as `ThemeSkyToggle` holds its latch): a new phase is laid over the old one in the
    same render that brings it, so there is never a frame of the new sky at the wrong strength.
    Still — reduce motion, amber Night — it simply replaces the old one; and a fade in flight when
    motion is turned off is finished on the spot, never left half way.
  */
  const [shown, setShown] = useState<Shown>({ base: phase, next: null, fade: null });
  const heading = shown.next ?? shown.base;
  if (heading !== phase) {
    setShown(
      move.animate
        ? { base: heading, next: phase, fade: new Animated.Value(0) }
        : { base: phase, next: null, fade: null },
    );
  } else if (!move.animate && shown.next !== null) {
    setShown({ base: shown.next, next: null, fade: null });
  }

  const fade = shown.fade;
  useEffect(() => {
    if (fade === null) return undefined;
    const run = Animated.timing(fade, {
      toValue: 1,
      duration: move.duration,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: true,
    });
    // covered: the old sky can go, and the new one is the sky at rest
    run.start(({ finished }) => {
      if (finished)
        setShown(s => (s.fade === fade ? { base: s.next ?? s.base, next: null, fade: null } : s));
    });
    // a newer phase, or the sky going away: stop where it is
    return () => run.stop();
  }, [fade, move.duration]);

  const [size, setSize] = useState<{ width: number; height: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setSize(s => (s !== null && s.width === width && s.height === height ? s : { width, height }));
  };
  const g = size === null ? null : liveSkyGeometry(size.width, size.height);

  let picture: ReactNode = null;
  if (g !== null && g.width > 0 && g.height > 0) {
    picture = (
      <>
        <SkyPicture
          scene={liveSkyFor(t.theme, shown.base, t.color.accent)}
          g={g}
          id={`${id}-base`}
        />
        {shown.next !== null && fade !== null ? (
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]}>
            <SkyPicture
              scene={liveSkyFor(t.theme, shown.next, t.color.accent)}
              g={g}
              id={`${id}-next`}
            />
          </Animated.View>
        ) : null}
      </>
    );
  }

  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      onLayout={onLayout}
      style={StyleSheet.absoluteFill}
      {...(testID ? { testID } : {})}
    >
      {picture}
    </View>
  );
});

/**
 * ONE SKY: its gradient from overhead to the horizon, fading into the page over the foot of the
 * bar, and its stars where it has any — setup's sparkle and plain dots, in the gaps between the
 * controls (`liveSkyGeometry`), never under one.
 */
function SkyPicture({ scene, g, id }: { scene: LiveSkyScene; g: LiveSkyGeometry; id: string }) {
  const star = scene.star;
  return (
    <Svg width={g.width} height={g.height} style={StyleSheet.absoluteFill}>
      <Defs>
        <SvgLinearGradient
          id={id}
          gradientUnits="userSpaceOnUse"
          x1={0}
          y1={0}
          x2={0}
          y2={g.height}
        >
          <Stop offset={0} stopColor={scene.sky[0]} stopOpacity={1} />
          <Stop offset={g.fadeFrom} stopColor={scene.sky[1]} stopOpacity={1} />
          {/* EASED OUT, so the foot melts into the page rather than ending on a line (2026-10-06) */}
          <Stop
            offset={g.fadeFrom + (1 - g.fadeFrom) * 0.5}
            stopColor={scene.sky[1]}
            stopOpacity={0.3}
          />
          <Stop offset={1} stopColor={scene.sky[1]} stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Rect x={0} y={0} width={g.width} height={g.height} fill={`url(#${id})`} />
      {star === null
        ? null
        : g.stars.map(s =>
            s.kind === 'dot' ? (
              <Circle key={`${s.x}-${s.y}`} cx={s.x} cy={s.y} r={s.size / 2} fill={star} />
            ) : (
              <G
                key={`${s.x}-${s.y}`}
                transform={`translate(${s.x - s.size / 2} ${s.y - s.size / 2}) scale(${s.size / 10})`}
              >
                <Path d={SPARKLE_PATH} fill={star} />
              </G>
            ),
          )}
    </Svg>
  );
}
