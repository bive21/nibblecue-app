/**
 * The liquid glass of a Log tile on Android, drawn (the owner, 2026-10-01: *"make the liquid glass
 * effect inside each the border of the quick log modules"*). A mapper and nothing else: every
 * number, every color and every shape is `theme/tileGlass.ts`'s, which is pure so the contrast of
 * every word over it can be measured in node (`tileGlass.test.ts`).
 *
 * WHERE IT IS MOUNTED. Inside the tile's own edge and under its content: in `Surface`'s clipping
 * decoration layer for a pebble and a capsule (after the fill, before the edge, which is drawn
 * last over everything), and inside a bubble's ring, before its picture. It takes no touch and is
 * hidden from assistive technology: it says nothing a word on the tile does not.
 *
 * TWO PARTS, FOR ONE REASON. The body's density — the tint thickening from the translucent top to
 * whole by `DENSE_AT` — is a fraction of the height, so it is a gradient that needs no size and is
 * right on the tile's first frame: the body a word sits on is never a frame late. The shade, the
 * sheen and the rim are shapes concentric with the tile's corners, in points, so they are one small
 * SVG drawn once the tile has measured itself — `PlaceRim`'s and `Ground`'s way, explicit sizes and
 * user-space gradients — and a frame after the body, which is light arriving, not a jump.
 *
 * STILL, AND CHEAP. Memoized on the drawing's key and its room, so a tile re-rendered by the
 * minute's tick, a count rolling or a press redraws nothing (the press and the roll are transforms
 * on the native driver, which never reach React). No animation, no per-frame work, one gradient view
 * and one SVG of at most three shapes per tile.
 */
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from 'react-native-svg';
import { withAlpha } from '../theme/contrast';
import { tileGlassShapes, type GlassRoom, type TileGlassSpec } from '../theme/tileGlass';

/** Not useId(): its output contains ':', which is not valid in an SVG fragment identifier. */
let instances = 0;

export interface TileGlassProps extends GlassRoom {
  glass: TileGlassSpec;
}

function TileGlassBase({ glass, radius, edge, foot }: TileGlassProps) {
  const uid = useRef<string | null>(null);
  if (uid.current === null) uid.current = `cc-glass-${(instances += 1)}`;
  const id = uid.current;
  const [size, setSize] = useState<{ w: number; h: number } | null>(null);
  const onLayout = (e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    if (size === null || Math.abs(width - size.w) > 0.5 || Math.abs(height - size.h) > 0.5)
      setSize({ w: width, h: height });
  };
  const density = glass.layers.find(l => l.kind === 'density');
  const shapes =
    size === null ? [] : tileGlassShapes(glass, size.w, size.h, { radius, edge, foot });
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      onLayout={onLayout}
      style={StyleSheet.absoluteFill}
    >
      {/* The body's density: the alpha is in the colors, one color thickening — never `transparent`,
          which fades through black on some backends — and past its last stop it holds whole. */}
      {density ? (
        <LinearGradient
          colors={density.stops.map(s => withAlpha(density.color, s.alpha)) as [string, string]}
          locations={density.stops.map(s => s.offset) as [number, number]}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {size !== null && shapes.length > 0 ? (
        <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            {shapes.map(s => (
              <SvgLinearGradient
                key={s.kind}
                id={`${id}-${s.kind}`}
                // in the drawing's own points, top to bottom: a ramp the shape holds past either end
                gradientUnits="userSpaceOnUse"
                x1={0}
                y1={s.y1}
                x2={0}
                y2={s.y2}
              >
                {s.stops.map((st, i) => (
                  <Stop key={i} offset={st.offset} stopColor={s.color} stopOpacity={st.alpha} />
                ))}
              </SvgLinearGradient>
            ))}
          </Defs>
          {shapes.map(s => (
            <Rect
              key={s.kind}
              x={s.x}
              y={s.y}
              width={s.width}
              height={s.height}
              rx={s.r}
              ry={s.r}
              {...(s.stroke > 0
                ? { fill: 'none', stroke: `url(#${id}-${s.kind})`, strokeWidth: s.stroke }
                : { fill: `url(#${id}-${s.kind})` })}
            />
          ))}
        </Svg>
      ) : null}
    </View>
  );
}

/** The drawing changes only with its key and its room, which are all values (`theme/tileGlass.ts`). */
const sameGlass = (a: TileGlassProps, b: TileGlassProps): boolean =>
  a.glass.key === b.glass.key && a.radius === b.radius && a.edge === b.edge && a.foot === b.foot;

export const TileGlass = memo(TileGlassBase, sameGlass);
