/**
 * The one provider every component reads tokens through (docs/MOBILE.md §4, §5). The app
 * resolves the appearance (stored choice + OS scheme + plan) and hands the result in; nothing
 * below this line reads a preference, an entitlement or the OS. A change here repaints the
 * whole tree — it is a token swap, never a remount, so in-progress form state survives a
 * scheme change (§11 "Storage and application").
 */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { PixelRatio } from 'react-native';
import {
  resolveAppearance,
  DEFAULT_APPEARANCE,
  PLUS_APPEARANCE,
  type ResolvedAppearance,
} from './appearance';
import { discFor, hit, moduleColor, space, type as typeScale, type Palette } from './theme';
import type { SkinTokens } from './skins';

export interface ThemeValue extends ResolvedAppearance {
  /** Shorthand for the most-read fields. */
  color: Palette;
  radius: SkinTokens['radius'];
  space: typeof space;
  hit: typeof hit;
  type: typeof typeScale;
  /** The OS font scale, capped for chrome (docs/MOBILE.md §9): 1.6 for chrome, uncapped for body. */
  fontScale: { body: number; chrome: number };
  /** True once the two faces are registered; until then text renders in the system face. */
  fontsReady: boolean;
  /** Whether the OS asked for reduced motion. */
  reduceMotion: boolean;
  /**
   * STILL ONLY BECAUSE OF THE APP'S OWN CALM MOTION, not the phone's Reduce Motion (2026-10-06, the
   * owner: "diaper hop should still be active even in calm motion, just make it slower"). A
   * picture that is the answer itself — the diaper hopping to Wet — may move, slower, when this is
   * true; when the PHONE asks for reduced motion it never does.
   */
  calmMotion: boolean;
  isNight: boolean;
}

const ThemeContext = createContext<ThemeValue | null>(null);

/**
 * A SUBTREE'S OWN READING OF THE THEME: the parent's value with its palette swapped (`ModuleTheme`,
 * a log sheet in its module's color). Everything else, the appearance included, is the parent's.
 */
export function PaletteOverride({
  palette,
  children,
}: {
  palette: (parent: Palette) => Palette;
  children: ReactNode;
}) {
  const parent = useTheme();
  const value = useMemo<ThemeValue>(() => {
    const color = palette(parent.color);
    return color === parent.color ? parent : { ...parent, color, palette: color };
  }, [parent, palette]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export const CHROME_FONT_SCALE_CAP = 1.6;

export interface ThemeProviderProps {
  appearance?: ResolvedAppearance;
  fontsReady?: boolean;
  reduceMotion?: boolean;
  /** `reduceMotion` comes from the app's Calm motion alone (`ThemeValue.calmMotion`). */
  calmMotion?: boolean;
  children: ReactNode;
}

export function ThemeProvider({
  appearance,
  fontsReady = false,
  reduceMotion = false,
  calmMotion = false,
  children,
}: ThemeProviderProps) {
  const resolved = appearance ?? resolveAppearance(DEFAULT_APPEARANCE, 'light', PLUS_APPEARANCE);
  const value = useMemo<ThemeValue>(() => {
    const scale = PixelRatio.getFontScale();
    return {
      ...resolved,
      color: resolved.palette,
      radius: resolved.skinTokens.radius,
      space,
      hit,
      type: typeScale,
      fontScale: { body: scale, chrome: Math.min(scale, CHROME_FONT_SCALE_CAP) },
      fontsReady,
      reduceMotion,
      calmMotion: reduceMotion && calmMotion,
      isNight: resolved.theme === 'night',
    };
  }, [resolved, fontsReady, reduceMotion, calmMotion]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  const v = useContext(ThemeContext);
  if (!v) throw new Error('useTheme() outside <ThemeProvider>');
  return v;
}

export type CategoryRole = (typeof moduleColor)[keyof typeof moduleColor];

/** A module's hue and its soft companion, as the theme paints them (§2 "each category hue"). */
export function categoryColors(color: Palette, role: CategoryRole): { fg: string; soft: string } {
  /*
    ONE LOOKUP, NOT A SWITCH (2026-09-22). Every role now names a `<role>` / `<role>Soft` pair in
    the palette, so the mapping is the name itself. The switch it replaces had to be edited by
    hand for each role and had already drifted once — `crit` borrowed `milkSoft` because medicine
    had no soft of its own. The owner's color reference gave the seven modules their own hues and
    moved medicine and bath off the two they were colliding with, so every role is now a real
    pair and there is nothing left to special-case.
  */
  return { fg: color[role], soft: color[`${role}Soft` as keyof Palette] };
}

/**
 * By module id, for the tiles, rows, stat cards and chart series (`categoryColorByModule`).
 *
 * `disc` IS THE OWNER'S REFERENCE SWATCH AND NOTHING ELSE PAINTS IT (2026-09-22). `soft` is a
 * theme role — it is composited over the page at the skin's tint alpha wherever it fills a
 * shape, so what reaches the screen is a *dilution* of a hue, which is why the reference sheet
 * kept not showing up on the phone even after every module was moved onto its hue. A holder
 * takes `disc` at full strength and gets the hex off the sheet; `null` in night, where seven
 * saturated circles are the one thing the amber screen exists to avoid, and there the holder
 * falls back to the composite it always drew.
 */
export function useCategory(moduleId: keyof typeof moduleColor): {
  fg: string;
  soft: string;
  disc: string | null;
  role: CategoryRole;
} {
  const { color, isNight } = useTheme();
  const role = moduleColor[moduleId];
  return {
    ...categoryColors(color, role),
    disc: discFor(moduleId, isNight ? 'night' : 'light'),
    role,
  };
}
