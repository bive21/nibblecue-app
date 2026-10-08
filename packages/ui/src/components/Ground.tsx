/**
 * The lit ground, drawn (docs/DESIGN_SYSTEM.md §1, §13; theme/ground.ts): three soft radial
 * washes behind every screen, four soft-tint orbs behind glass, and — on the first-run screens —
 * the DOODLE PATTERN, two dozen faint nursery glyphs the owner asked for on 2026-09-21 (`pattern`),
 * or the four large hero glyphs that came before it (`motif`). This file is a mapper
 * and holds no arithmetic: every number comes from `theme/ground.ts`, which is pure so that
 * `theme/contrast.test.ts` can composite it and `theme/ground.test.ts` can measure the
 * composition. There is no renderer in this workspace, so anything decided here rather than
 * there is a number nothing can check.
 *
 * It returns null whenever both `groundWash` and `orbAlpha` are 0 — Paper, and every skin in
 * night — and there is no `theme ===` anywhere in it. skins.ts and `skinForTheme` already carry
 * that decision, and a conditional repeating it is just a second place for the two to disagree.
 *
 * INERT AND CLIPPED (the two traps this codebase has already shipped once, Surface.tsx:111-119):
 * every layer is `pointerEvents="none"`, because a decoration that swallows a tap is a control
 * that does nothing; and the root carries `overflow: 'hidden'`, because a child with only a
 * borderRadius is NOT clipped in React Native. Neither view has a radius, so the clip is a plain
 * rectangle and costs nothing. The whole layer is hidden from assistive technology: it carries no
 * information, and four unnamed images in the reading order would be four stops that say nothing.
 */
import { memo, useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Rect, Stop } from 'react-native-svg';
import { motif, motifAlpha, orbs, pattern, patternAlpha, washes } from '../theme/ground';
import { useTheme } from '../theme/ThemeProvider';
import { Icon } from '../icons/Icon';

/** SVG def ids are global to the document, so two mounted Grounds must not collide. */
let instances = 0;

/** The motif is lit, not slid in: 420ms of opacity and nothing that moves (docs/MOBILE.md motion). */
const FADE_MS = 420;
const FADE_DELAY_MS = 90;

export interface GroundProps {
  width: number;
  height: number;
  /** The first-run glyphs. Off by default: in the app the ground is washes and orbs only. */
  motif?: boolean;
  /**
   * THE DOODLE PATTERN, the first-run background the owner asked for on 2026-09-21 — two dozen
   * small nursery glyphs on a brick grid (`theme/ground.ts`). It WINS over `motif`, because the
   * two are the same job: one faint ink treatment behind a page, never two stacked into an ink
   * nothing measured. The hero plan stays where it is — it is the lit ground's measured busiest
   * point, and putting the old look back is this one flag.
   *
   * It does not need a lit skin. The washes and the orbs are the skin's and are zero on Paper,
   * the default; the pattern is the screen's own and draws on any skin but night.
   */
  pattern?: boolean;
}

/*
  MEMOIZED ON ITS SIZE AND ITS TWO FLAGS (docs/DESIGN_SYSTEM.md §7.1). Every Screen draws one, and
  the doodle pattern is thirty-six glyphs — a view and an SVG each — so without this every render of
  the page above it (a sync chip, a timer folding into its bar, a minute tick on Today) re-rendered
  all thirty-six for a picture that had not changed. The theme still reaches it through context.
*/
export const Ground = memo(function Ground({
  width,
  height,
  motif: withMotif = false,
  pattern: withPattern = false,
}: GroundProps) {
  const t = useTheme();
  const w = t.skinTokens.groundWash;
  const a = t.skinTokens.orbAlpha;
  // Not useId(): its output contains ':', which is not valid in an SVG fragment identifier.
  const uid = useRef<string | null>(null);
  if (uid.current === null) uid.current = `cc-ground-${(instances += 1)}`;
  // Constructed AT 1 under reduce motion rather than animated with duration 0, which would still
  // schedule a frame: there is no path here that shows a half-faded screen.
  const fade = useRef(new Animated.Value(t.reduceMotion ? 1 : 0)).current;

  useEffect(() => {
    // setValue(1) BEFORE returning, not just `return`. This effect re-runs when reduceMotion
    // changes, and React runs the previous run's cleanup first — `a.stop()`. So a parent who
    // turns reduce motion on while the fade is in flight would otherwise freeze the motif at
    // whatever opacity it had reached, for the life of the mount, and turning it on at the
    // wrong moment leaves the ground blank.
    if (t.reduceMotion) {
      fade.setValue(1);
      return;
    }
    const a = Animated.timing(fade, {
      toValue: 1,
      duration: FADE_MS,
      delay: FADE_DELAY_MS,
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [fade, t.reduceMotion]);

  const doodles = withPattern ? pattern(width, height) : [];
  const doodleInk = patternAlpha(t.theme);
  const lit = w > 0 || a > 0;
  if (!lit && (doodles.length === 0 || doodleInk <= 0)) return null;
  const wash = washes(width, height, w);
  const blobs = orbs(width, height, a);
  // one ink treatment at a time: the pattern replaces the hero glyphs where it draws
  const glyphs = withMotif && !withPattern ? motif(width, height, w) : [];
  const ink = motifAlpha(w);
  const id = uid.current;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[StyleSheet.absoluteFill, styles.clip]}
    >
      {/* The washes are painted at full strength on frame one: a page whose background slides
          in is a page with a loading state. Only the glyphs fade. */}
      {lit ? (
        <Svg width={width} height={height} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            {wash.map(g => (
              <RadialGradient
                key={g.key}
                id={`${id}-${g.key}`}
                // without this, rx/ry are read as fractions of the bounding box and every
                // ellipse comes out a circle
                gradientUnits="userSpaceOnUse"
                cx={g.cx}
                cy={g.cy}
                rx={g.rx}
                ry={g.ry}
                fx={g.cx}
                fy={g.cy}
              >
                {/* Both stops carry the SAME color, the far one at zero opacity. Never the keyword
                  `transparent`, which fades through black on some backends. */}
                <Stop offset="0" stopColor={t.color[g.token]} stopOpacity={g.alpha} />
                <Stop offset={g.fade} stopColor={t.color[g.token]} stopOpacity={0} />
              </RadialGradient>
            ))}
          </Defs>
          {wash.map(g => (
            <Rect
              key={g.key}
              x={0}
              y={0}
              width={width}
              height={height}
              fill={`url(#${id}-${g.key})`}
            />
          ))}
          {/* The orbs: a blurred disc is a radial gradient whose stops ARE the blur profile
            (theme/ground.ts orbStops), painted after the washes and under the motif. */}
          <Defs>
            {blobs.map(o => (
              <RadialGradient
                key={o.key}
                id={`${id}-orb-${o.key}`}
                gradientUnits="userSpaceOnUse"
                cx={o.cx}
                cy={o.cy}
                r={o.reach}
                fx={o.cx}
                fy={o.cy}
              >
                {o.stops.map((st, i) => (
                  <Stop
                    key={i}
                    offset={st.offset}
                    stopColor={t.color[o.token]}
                    stopOpacity={st.alpha}
                  />
                ))}
              </RadialGradient>
            ))}
          </Defs>
          {blobs.map(o => (
            <Circle key={o.key} cx={o.cx} cy={o.cy} r={o.reach} fill={`url(#${id}-orb-${o.key})`} />
          ))}
        </Svg>
      ) : null}

      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { opacity: fade }]}>
        {glyphs.map(m => (
          <View
            key={m.key}
            pointerEvents="none"
            // Icon has neither an opacity nor a style prop, so the wrapper carries both. This
            // opacity is exactly the composite groundComposites() hands the contrast matrix.
            style={{
              position: 'absolute',
              left: m.x,
              top: m.y,
              width: m.size,
              height: m.size,
              opacity: ink,
              transform: [{ rotate: `${m.rotate}deg` }],
            }}
          >
            <Icon name={m.glyph} size={m.size} color={t.color[m.ink]} strokeWidth={m.strokeWidth} />
          </View>
        ))}
        {/* THE DOODLES. Same wrapper, same fade, same rule: the opacity here is exactly the alpha
            `patternComposites()` hands the contrast matrix, so what a parent reads over a glyph is
            a color a test has measured. */}
        {doodleInk > 0
          ? doodles.map(d => (
              <View
                key={d.key}
                pointerEvents="none"
                style={{
                  position: 'absolute',
                  left: d.x,
                  top: d.y,
                  width: d.size,
                  height: d.size,
                  opacity: doodleInk,
                  transform: [{ rotate: `${d.rotate}deg` }],
                }}
              >
                <Icon
                  name={d.glyph}
                  size={d.size}
                  color={t.color[d.ink]}
                  strokeWidth={d.strokeWidth}
                />
              </View>
            ))
          : null}
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  clip: { overflow: 'hidden' },
});
