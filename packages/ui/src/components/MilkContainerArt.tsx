/**
 * MilkContainerArt — a storage bag, a storage bottle or a lidded container, with milk in it to a
 * level (docs/DESIGN_SYSTEM.md §5; the owner, 2026-09-26: *"make the bag bottle container, a more
 * interesting option"*). One small SVG: the empty glass, the milk clipped to the container's own
 * outline with a line at its surface, then the outline, the zip band, cap or lid, and the fine
 * details over all of it. Every number is `milkContainers.ts`'s, every color `theme/milkContainers.ts`'s.
 *
 * DECORATION TO A SCREEN READER: the control that holds it says what it is in words ("Bag",
 * "Bottle", "Container"), so the drawing is hidden from assistive technology.
 */
import { memo, useRef } from 'react';
import Svg, { ClipPath, Defs, G, Line, Path, Rect } from 'react-native-svg';
import { milkContainerPaintFor } from '../theme/milkContainers';
import { useTheme } from '../theme/ThemeProvider';
import { MILK_ART, MILK_SHAPE_ART, milkLevelY, type MilkShape } from './milkContainers';

export interface MilkContainerArtProps {
  shape: MilkShape;
  /** How full, 0–1: drawn as it is (the picker eases it there). */
  fill: number;
  /** Its height in points; its width follows the drawing's 48 × 64 grid. */
  height: number;
}

/** Not useId(): its output contains ':', which is not valid in an SVG fragment identifier. */
let instances = 0;

function MilkContainerArtBase({ shape, fill, height }: MilkContainerArtProps) {
  const t = useTheme();
  const uid = useRef<string | null>(null);
  if (uid.current === null) uid.current = `cc-milk-${(instances += 1)}`;
  const paint = milkContainerPaintFor(t.theme);
  const art = MILK_SHAPE_ART[shape];
  const level = milkLevelY(art.well, fill);
  const width = (height * MILK_ART.width) / MILK_ART.height;
  return (
    <Svg
      width={width}
      height={height}
      viewBox={`0 0 ${MILK_ART.width} ${MILK_ART.height}`}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <ClipPath id={uid.current}>
          <Path d={art.body} />
        </ClipPath>
      </Defs>
      <Path d={art.body} fill={paint.glass} />
      {level < art.well.bottom ? (
        <G clipPath={`url(#${uid.current})`}>
          <Rect
            x={0}
            y={level}
            width={MILK_ART.width}
            height={MILK_ART.height - level}
            fill={paint.milk}
          />
          <Line
            x1={0}
            x2={MILK_ART.width}
            y1={level}
            y2={level}
            stroke={paint.surface}
            strokeWidth={1.6}
          />
        </G>
      ) : null}
      <Path
        d={art.body}
        fill="none"
        stroke={paint.line}
        strokeWidth={MILK_ART.stroke}
        strokeLinejoin="round"
      />
      <Path
        d={art.cap}
        fill={paint.cap}
        stroke={paint.line}
        strokeWidth={MILK_ART.stroke}
        strokeLinejoin="round"
      />
      <Path
        d={art.details}
        fill="none"
        stroke={paint.line}
        strokeWidth={1.2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Memoized on its three props: a sheet re-rendered for any other reason redraws none of them. */
export const MilkContainerArt = memo(MilkContainerArtBase);
