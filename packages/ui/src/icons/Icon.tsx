/**
 * Every icon renders at an EXPLICIT size — an icon with no size is a bug (docs/DESIGN_SYSTEM.md
 * §5 "Icons"), so `size` is required. Stroke icons take the current text color by default;
 * pass `color` to paint from a category or the accent. Decorative by default: a control that
 * is only an icon gets its label from the pressable around it.
 *
 * The drawing comes from the owner's own set first (`paths.custom.ts`, generated from the SVGs
 * in `assets/brand/kit/08-icons` by tools/ui/import-icons.mjs) and from the built-in sprite
 * for every name that has no file there — so the set is replaced one glyph at a time, by name,
 * and an override reaches every screen that draws that name.
 */
import { MODULE_BY_ID, type ModuleId } from '@nibblecue/core';
import { Image } from 'react-native';
import Svg, { Circle, Line, Path, Rect } from 'react-native-svg';
import { withAlpha } from '../theme/contrast';
import { useTheme } from '../theme/ThemeProvider';
import { drawIllustrated, illustratedTier, type IllustratedName } from './illustrated';
import { ILLUSTRATED_ICONS } from './illustrated.assets';
import { ICON_PATHS, type IconName, type IconTone } from './paths';
import { CUSTOM_ICON_PATHS } from './paths.custom';

/**
 * THE SECOND TONE'S STRENGTH. The owner's icons are drawn in two tones of one hue — a dark ink
 * for the silhouette and a lighter one for the detail (a bottle's measure marks, the water in
 * the tub) — and they asked for that to survive (2026-09-19: "I want to have a two tone color
 * for each module icon"). The app has one color per module and repaints every glyph in it, so
 * the second tone is the SAME color at half strength: over the module's soft disc that reads as
 * the lighter tint they drew, on a row it reads as a quieter line of the same hue, and it
 * follows every scheme, dark mode and night without a second table of colors to keep in step.
 * Half, because their own pairs sit close to it (#208FB3 → #75C8E4 is the main ink mixed about
 * halfway to white), and because the detail stays a detail: it must never carry a fact alone.
 */
export const ICON_SECONDARY_ALPHA = 0.5;

export interface IconProps {
  name: IconName;
  /** Timeline/row 15–16, quick tile 18, nav 20–23, next card 21, stop ring 26 (§5). */
  size: number;
  color?: string;
  /** The second tone of a two-tone glyph; the primary at half strength when omitted. */
  secondary?: string;
  /** Override the sprite's stroke width (1.7 on the 24px grid). */
  strokeWidth?: number;
  accessibilityLabel?: string;
  testID?: string;
}

export function Icon({
  name,
  size,
  color,
  secondary,
  strokeWidth,
  accessibilityLabel,
  testID,
}: IconProps) {
  const { color: palette } = useTheme();

  /*
    THE OWNER'S ILLUSTRATED SET, WHERE IT IS BIG ENOUGH TO READ (`illustrated.ts` has the
    measurement and the threshold). A picture cannot be repainted, so `color`, `secondary` and
    `strokeWidth` do not apply to it — that is why the small sizes keep the glyph rather than
    scaling a four-color drawing down to a timeline row, where it becomes a smudge.

    The label and testID behave identically either way, so no screen and no test has to know
    which one it got. The tier is the render made for this size (`illustratedTier`); React Native
    picks its density file for the screen.
  */
  const illustration = drawIllustrated(name, size)
    ? ILLUSTRATED_ICONS[name as IllustratedName][illustratedTier(size)]
    : undefined;
  if (illustration !== undefined) {
    return (
      <Image
        source={illustration}
        style={{ width: size, height: size }}
        resizeMode="contain"
        accessible={!!accessibilityLabel}
        {...(accessibilityLabel
          ? { accessibilityLabel, accessibilityRole: 'image' as const }
          : { accessibilityElementsHidden: true, importantForAccessibility: 'no' as const })}
        {...(testID ? { testID } : {})}
      />
    );
  }

  const def = CUSTOM_ICON_PATHS[name] ?? ICON_PATHS[name];
  const ink = color ?? palette.text;
  const soft = secondary ?? withAlpha(ink, ICON_SECONDARY_ALPHA);
  const filled = def.fill === 'currentColor';
  const sw = strokeWidth ?? def.strokeWidth ?? 1.7;
  // a fill names its tone; anything else is the sprite's own literal or the icon's default
  const fillOf = (fill: string | undefined): string =>
    fill === 'currentColor'
      ? ink
      : fill === 'secondaryColor'
        ? soft
        : (fill ?? (filled ? ink : 'none'));
  // a secondary STROKE is set on the element; every other element inherits the root's ink
  const strokeOf = (tone: IconTone | undefined) => (tone === 'secondary' ? { stroke: soft } : {});
  return (
    <Svg
      width={size}
      height={size}
      viewBox={def.viewBox}
      fill={filled ? ink : 'none'}
      stroke={filled ? 'none' : ink}
      strokeWidth={filled ? 0 : sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      accessible={!!accessibilityLabel}
      {...(accessibilityLabel
        ? { accessibilityLabel, accessibilityRole: 'image' as const }
        : { accessibilityElementsHidden: true, importantForAccessibility: 'no' as const })}
      {...(testID ? { testID } : {})}
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
    </Svg>
  );
}

/**
 * The module registry's icon names map onto the sprite one-to-one except these three.
 *
 * `box` — THE MILK STASH — IS DRAWN AS THE OWNER'S MILK-STORAGE PICTURE (the owner, 2026-09-26:
 * "milk stash icon in the onboarding page, still uses old icon, make sure these are all removed,
 * and we use the new icons only"). Every other module row in setup and What you track shows the
 * owner's illustrated set; the stash alone kept the line-drawn cardboard box, which is not in it.
 * The registry's key stays `box` (it is a row in the database's module table too, and renaming it
 * is a migration for no reader); what it DRAWS is the milk-storage container from the set.
 */
export const MODULE_ICON: Record<string, IconName> = {
  bottle: 'bottle',
  breast: 'breast',
  pump: 'pump',
  diaper: 'diaper',
  sleep: 'sleep',
  solids: 'solids',
  med: 'med',
  water: 'water',
  growth: 'growth',
  temp: 'temp',
  tummy: 'tummy',
  bath: 'bath',
  star: 'star',
  note: 'note',
  box: 'supply-milk-storage',
  heart: 'breast',
  shield: 'shield',
};

/**
 * The registry's icon name → the sprite's; `note` when a module has no glyph of its own. (It lived
 * in `MiniCard.tsx`, the LAST-event card no screen drew after 2026-09-15, until that card went on
 * 2026-09-26.)
 */
export const iconForModule = (moduleId: ModuleId): IconName =>
  MODULE_ICON[MODULE_BY_ID[moduleId].icon] ?? 'note';
