/**
 * EmptyCart — the empty shopping list's picture (the owner, 2026-09-26: *"add animation in shopping
 * list to make it more fun"*): an empty cart on a soft disc of the household's color, a bottle
 * tipped over it with a dotted path down into the basket, and two sparkles. `emptyCart.ts` has the
 * placing and why it is an empty cart; this draws it, still, in whatever theme is on.
 *
 * FROM THE ICON SET: the `cart`, `bottle` and `plus` drawings the app draws everywhere else, looked
 * up exactly as `Icon` looks them up (the owner's own file first), placed in one SVG and inked from
 * the palette — the accent, its tint, and the bottle module's own ink, whose detail lines take the
 * half strength every two-tone glyph gives them. So the amber Night draws it from the night's
 * colors like everything else, and a new color scheme recolors it with nothing re-drawn.
 *
 * It is a picture beside the empty state's words, which say everything it does: hidden from
 * assistive technology and from touch.
 */
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect } from 'react-native-svg';
import { ICON_SECONDARY_ALPHA } from '../icons/Icon';
import { ICON_PATHS, type IconDef, type IconName } from '../icons/paths';
import { CUSTOM_ICON_PATHS } from '../icons/paths.custom';
import { withAlpha } from '../theme/contrast';
import { useCategory } from '../theme/ThemeProvider';
import { useAccent } from '../theme/useAccent';
import {
  EMPTY_CART,
  EMPTY_CART_BOX,
  emptyCartPath,
  glyphTransform,
  type PlacedGlyph,
} from './emptyCart';

export interface EmptyCartProps {
  testID?: string;
}

export function EmptyCart({ testID }: EmptyCartProps) {
  const a = useAccent();
  // the bottle in its own module's ink, as it is drawn on every bottle tile and row
  const bottle = useCategory('bottle');
  const { width, height } = EMPTY_CART_BOX;
  const art = EMPTY_CART;
  return (
    <View
      pointerEvents="none"
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      style={{ width, height }}
      {...(testID ? { testID } : {})}
    >
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Circle cx={art.disc.cx} cy={art.disc.cy} r={art.disc.r} fill={a.tint} />
        <Path
          d={emptyCartPath(art)}
          stroke={bottle.fg}
          strokeWidth={art.pathStroke}
          strokeLinecap="round"
          strokeDasharray={[...art.pathDash]}
          fill="none"
        />
        <Glyph name="cart" at={art.cart} ink={a.accent} />
        <Glyph name="bottle" at={art.bottle} ink={bottle.fg} />
        {art.sparkles.map(s => (
          <Glyph key={`${s.x}-${s.y}`} name="plus" at={s} ink={a.accent} />
        ))}
      </Svg>
    </View>
  );
}

/** One of the set's drawings, placed and inked: the same lookup, the same two tones as `Icon`. */
function Glyph({ name, at, ink }: { name: IconName; at: PlacedGlyph; ink: string }) {
  const def: IconDef = CUSTOM_ICON_PATHS[name] ?? ICON_PATHS[name];
  const soft = withAlpha(ink, ICON_SECONDARY_ALPHA);
  const filled = def.fill === 'currentColor';
  const fillOf = (fill: string | undefined): string =>
    fill === 'currentColor'
      ? ink
      : fill === 'secondaryColor'
        ? soft
        : (fill ?? (filled ? ink : 'none'));
  const strokeOf = (tone: string | undefined) => (tone === 'secondary' ? { stroke: soft } : {});
  return (
    <G
      transform={glyphTransform(at)}
      fill={filled ? ink : 'none'}
      stroke={filled ? 'none' : ink}
      strokeWidth={filled ? 0 : at.stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {def.elements.map((el, i) => {
        switch (el.type) {
          case 'path':
            return (
              <Path
                key={i}
                d={el.d}
                fill={fillOf(el.fill)}
                opacity={el.opacity ?? 1}
                {...strokeOf(el.tone)}
              />
            );
          case 'circle':
            return (
              <Circle
                key={i}
                cx={el.cx}
                cy={el.cy}
                r={el.r}
                fill={fillOf(el.fill)}
                {...strokeOf(el.tone)}
              />
            );
          case 'rect':
            return (
              <Rect
                key={i}
                x={el.x}
                y={el.y}
                width={el.width}
                height={el.height}
                rx={el.rx ?? 0}
                fill={fillOf(el.fill)}
                {...strokeOf(el.tone)}
              />
            );
          case 'line':
            return (
              <Line key={i} x1={el.x1} y1={el.y1} x2={el.x2} y2={el.y2} {...strokeOf(el.tone)} />
            );
        }
      })}
    </G>
  );
}
