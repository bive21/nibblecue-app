/**
 * ColorDot — a small filled dot with a thin ring, drawn before a chip's word where the choice IS a
 * color (the owner, 2026-09-26, of the diaper sheet's colors: *"Optional: (yellow color icon)
 * yellow, (green color icon) green, etc."*). It goes in a `Chip`'s glyph place (`iconNode`), so the
 * chip keeps every state it draws: its word always, and — while it is selected — the check in the
 * dot's place, the accent fill and the bold face, never the color alone (docs/DESIGN_SYSTEM.md §12
 * rule 7).
 *
 * It takes its two colors from the caller, who reads them from `theme/` (`stoolDotsFor`), where
 * they are measured against the chip they sit on; this file writes none. It is a picture inside a
 * control, so it is not a control itself: assistive technology reads the chip's word and nothing
 * here.
 */
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

/**
 * The dot's size and its ring: a little under the small chip's 12 pt glyph, so a chip with a dot is
 * the width it was with a glyph, and a ring a point and a quarter wide — enough to be seen round a
 * yellow on white, not enough to read as a second color.
 */
export const COLOR_DOT = { size: 11, ring: 1.25 } as const;

export interface ColorDotProps {
  fill: string;
  ring: string;
  testID?: string;
}

export function ColorDot({ fill, ring, testID }: ColorDotProps) {
  const t = useTheme();
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={{
        width: COLOR_DOT.size,
        height: COLOR_DOT.size,
        borderRadius: t.radius.pill,
        backgroundColor: fill,
        borderWidth: COLOR_DOT.ring,
        borderColor: ring,
      }}
      {...(testID ? { testID } : {})}
    />
  );
}
