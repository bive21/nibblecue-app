/**
 * The decorative motif on a running timer card (the owner, 2026-09-16, with the artwork
 * attached: "add the graphic attached … this is the icon that can be added as background").
 *
 * IT IS DRAWN, NOT SHIPPED. The owner's artwork is a raster illustration; a PNG on this card
 * would need one file per theme to sit on three different gradients, and it would sit at a
 * fixed size on a card whose height moves with dynamic type. Drawing it takes the card's own
 * ink — white on the light and dark gradients, amber in night — at the opacity a background
 * wants, so it is right in every theme by construction and there is no asset to keep in step.
 * If the owner wants their exact illustration instead, it belongs in `assets/brand/kit` and is
 * rendered by `tools/brand/render-artwork.mjs` like the rest of the kit (docs/BRANDING.md §4).
 *
 * IT IS BACKGROUND, NOT INFORMATION. `pointerEvents` never reaches it, assistive technology
 * never sees it, and nothing it draws is said only here: the card's words carry the whole of
 * what is running, for how long and since when. A parent who cannot see it loses nothing.
 *
 * The sleeping moon on its cloud is the sleep card's; the other timers take the cloud alone, so
 * every running card has the same weight in the corner without a pump card claiming a baby is
 * asleep.
 */
import { memo } from 'react';
import Svg, { Circle, Ellipse, G, Path, Rect } from 'react-native-svg';
import type { TimerType } from './StopButton';

export interface TimerArtProps {
  type: TimerType;
  /** The card's own ink: white on the gradients, amber in night. */
  color: string;
  width: number;
  height: number;
}

/** Faint enough to stay behind the words, present enough to be a picture and not a smudge. */
const CLOUD_OPACITY = 0.22;
const FACE_OPACITY = 0.5;

// memoized on its four props: the card around it re-renders every second to tick its digits
export const TimerArt = memo(function TimerArt({ type, color, width, height }: TimerArtProps) {
  const sleeping = type === 'sleep';
  return (
    <Svg width={width} height={height} viewBox="0 0 120 104" fill="none">
      {/* the zzz, above and to the right — sleep only */}
      {sleeping ? (
        <G
          stroke={color}
          strokeWidth={3.4}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={FACE_OPACITY}
        >
          <Path d="M74 26h9l-9 11h9" />
          <Path d="M92 4h12l-12 15h12" />
        </G>
      ) : null}

      {/* the head: a round moon resting on the cloud */}
      {sleeping ? (
        <G>
          <Circle cx={52} cy={48} r={29} fill={color} opacity={CLOUD_OPACITY + 0.08} />
          <G
            stroke={color}
            strokeWidth={3.2}
            strokeLinecap="round"
            fill="none"
            opacity={FACE_OPACITY}
          >
            {/* the curl on the forehead */}
            <Path d="M46 32a6 6 0 1 0 6-6" />
            {/* two closed eyes and a small mouth */}
            <Path d="M38 50q5 7 10 0" />
            <Path d="M58 50q5 7 10 0" />
            <Path d="M49 62q4 5 8 0" />
          </G>
          <Ellipse cx={34} cy={58} rx={5} ry={3.4} fill={color} opacity={0.3} />
          <Ellipse cx={72} cy={58} rx={5} ry={3.4} fill={color} opacity={0.3} />
        </G>
      ) : null}

      {/* the cloud: four lobes over a rounded base, on every timer */}
      <G fill={color} opacity={CLOUD_OPACITY}>
        <Circle cx={24} cy={80} r={16} />
        <Circle cx={50} cy={74} r={21} />
        <Circle cx={82} cy={78} r={19} />
        <Circle cx={102} cy={86} r={13} />
        <Rect x={8} y={80} width={104} height={22} rx={11} />
      </G>
    </Svg>
  );
});
