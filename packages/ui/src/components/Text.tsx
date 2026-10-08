/**
 * Type roles (docs/DESIGN_SYSTEM.md §4, §19): one face for words, one for numbers. Every
 * time, duration, volume, count and identifier goes through `Numeric` (mono, tabular figures)
 * so digits sit still while they change; prose and headings use the UI face. Body copy scales
 * with the OS uncapped; chrome roles are capped at 1.6 (docs/MOBILE.md §9).
 */
import { Children, type ReactNode } from 'react';
import {
  Text as RNText,
  StyleSheet,
  type StyleProp,
  type TextProps,
  type TextStyle,
} from 'react-native';
import { accentInk } from '../theme/moduleAccent';
import { useTheme } from '../theme/ThemeProvider';
import { keepClockWhole } from './timeFormat';

export type TextRole =
  | 'display'
  | 'tabTitle'
  | 'h1'
  | 'h2'
  | 'statValue'
  | 'figure'
  | 'figureXl'
  | 'figureLg'
  | 'figureMd'
  | 'bodyStrong'
  | 'body'
  | 'bodySm'
  | 'meta'
  | 'label'
  | 'caption'
  | 'badge';
/** Palette inks a role may use; a filled card passes its own ink through `color`. */
export type Ink =
  'text' | 'text2' | 'text3' | 'accent' | 'accent2' | 'good' | 'warn' | 'crit' | 'onAccent';

/**
 * How far a chrome role is allowed to grow with the OS font scale (docs/MOBILE.md §9). Exported
 * because a component that budgets a line's WIDTH has to scale the size the same way the Text
 * that draws it will (QuickAction.tsx).
 */
export const CHROME_FONT_CAP = 1.6;

const CHROME_ROLES: ReadonlySet<TextRole> = new Set([
  'label',
  'caption',
  'badge',
  'meta',
  'statValue',
  // a headline figure is chrome for the same reason a stat value is: it is a number in a box of
  // a fixed height, and letting it grow uncapped is how a card's own words get pushed out of it
  'figure',
  'figureXl',
  'figureLg',
  'figureMd',
  'display',
]);

export interface AppTextProps extends Omit<TextProps, 'style'> {
  /** The type role (§4). Named `variant` because React Native's own `role` prop is the ARIA role. */
  variant?: TextRole;
  ink?: Ink;
  /** A literal color, only when the ground is not a palette ground (a gradient card, a filled tile). */
  color?: string;
  /** Tabular mono digits regardless of role. */
  numeric?: boolean;
  align?: TextStyle['textAlign'];
  style?: StyleProp<TextStyle>;
}

export function AppText({
  variant = 'body',
  ink = 'text',
  color,
  numeric,
  align,
  style,
  children,
  ...rest
}: AppTextProps) {
  const t = useTheme();
  const spec = t.type[variant];
  const monoRole = spec.fontFamily.startsWith(t.type.families.mono);
  const mono = numeric || monoRole;
  const chrome = CHROME_ROLES.has(variant);
  const base: TextStyle = {
    fontSize: spec.fontSize,
    ...('lineHeight' in spec && spec.lineHeight ? { lineHeight: spec.lineHeight } : {}),
    ...('letterSpacing' in spec && spec.letterSpacing !== undefined
      ? { letterSpacing: spec.letterSpacing }
      : {}),
    ...('textTransform' in spec && spec.textTransform ? { textTransform: spec.textTransform } : {}),
    // ACCENT AS WORDS IS ALWAYS READABLE (the owner, 2026-10-06: "the Edit … shows in very light
    // color. it should be the darker version of module color"): on a log sheet the accent is the
    // module's pastel fill, too pale to read as text, so words asking for it take `accent2`, the
    // accent's own ink (`moduleAccent.ts`). A scheme's accent reads already and is kept.
    color: color ?? (ink === 'accent' ? accentInk(t.color) : t.color[ink]),
    ...(align ? { textAlign: align } : {}),
    ...(t.fontsReady
      ? { fontFamily: numeric && !monoRole ? t.type.numeric.fontFamily : spec.fontFamily }
      : weightFallback(variant)),
    ...(mono ? { fontVariant: ['tabular-nums'] as TextStyle['fontVariant'] } : {}),
  };
  return (
    <RNText
      allowFontScaling
      {...(chrome ? { maxFontSizeMultiplier: CHROME_FONT_CAP } : {})}
      style={[styles.reset, base, style]}
      {...rest}
    >
      {keepClocksWhole(children)}
    </RNText>
  );
}

/**
 * A CLOCK TIME IS NEVER BROKEN BEFORE ITS AM/PM (`keepClockWhole`, timeFormat.ts), in whatever a
 * Text draws. Only the words this Text holds itself are touched; a nested Text glues its own.
 */
function keepClocksWhole(children: ReactNode): ReactNode {
  if (typeof children === 'string') return keepClockWhole(children);
  if (!Array.isArray(children)) return children;
  return Children.map(children, c => (typeof c === 'string' ? keepClockWhole(c) : c));
}

/** Until the faces load (or in a test), keep the weight hierarchy with the system font. */
function weightFallback(variant: TextRole): TextStyle {
  switch (variant) {
    case 'display':
    case 'statValue':
      return { fontWeight: '600' };
    case 'tabTitle':
    case 'h1':
    case 'h2':
    case 'figure':
      return { fontWeight: '800' };
    case 'figureXl':
    case 'figureLg':
    case 'figureMd':
      return { fontWeight: '700' };
    case 'bodyStrong':
      return { fontWeight: '700' };
    case 'caption':
    case 'label':
    case 'badge':
      return { fontWeight: '700' };
    default:
      return { fontWeight: '400' };
  }
}

type RoleProps = Omit<AppTextProps, 'variant'>;
export const Display = (p: RoleProps) => <AppText variant="display" numeric {...p} />;
/**
 * A TAB PAGE'S TITLE, 28 (docs/DESIGN_SYSTEM.md §4.1 rule 1, 2026-09-30): the page the tab bar
 * reaches, with no back arrow. A page opened from another page is named with `H1`, 23, whether
 * `Screen` draws it in the pushed bar or the page draws it itself. No screen passes either a
 * `fontSize` (`textRoles.scan.test.ts`): a title that needs another size needs another role.
 */
export const TabTitle = (p: RoleProps) => (
  <AppText variant="tabTitle" accessibilityRole="header" {...p} />
);
export const H1 = (p: RoleProps) => <AppText variant="h1" accessibilityRole="header" {...p} />;
export const H2 = (p: RoleProps) => <AppText variant="h2" accessibilityRole="header" {...p} />;
export const Body = (p: RoleProps) => <AppText variant="body" {...p} />;
export const BodyStrong = (p: RoleProps) => <AppText variant="bodyStrong" {...p} />;
export const BodySm = (p: RoleProps) => <AppText variant="bodySm" ink="text2" {...p} />;
export const Meta = (p: RoleProps) => <AppText variant="meta" ink="text2" {...p} />;
/** The uppercase mono eyebrow above a section; a label is `text2` (§12 rule 5), never `text3`. */
export const Label = (p: RoleProps) => <AppText variant="label" ink="text2" {...p} />;
/**
 * The same eyebrow in the UI face (§4 `caption`), for a page that is mostly captions over cards.
 * `text2` for the same reason `Label` is: a heading a reader has to squint at is not decoration,
 * so it never drops to `text3`.
 */
export const Caption = (p: RoleProps) => <AppText variant="caption" ink="text2" {...p} />;
/** Any number a person reads: mono, tabular, in whichever role. */
export const Numeric = (p: AppTextProps) => <AppText numeric {...p} />;

const styles = StyleSheet.create({ reset: { includeFontPadding: false } });
