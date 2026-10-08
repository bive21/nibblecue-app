/**
 * The marks on the two sign-in buttons (the owner, 2026-09-26). Handed to `Button`'s `leading`,
 * which passes the size its own glyph would be drawn at and its ink. Decorative: the button's
 * label already says "Continue with Google" or "Continue with Apple", so a reader never hears
 * the logo twice.
 */
import Svg, { Path } from 'react-native-svg';

import { APPLE_MARK, GOOGLE_G } from './providerMarks.art';

/** Google's "G" in its four standard colors, whatever the theme (providerMarks.art.ts says why). */
export function GoogleMark({ size }: { size: number }) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox={GOOGLE_G.viewBox}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {GOOGLE_G.paths.map(p => (
        <Path key={p.fill} d={p.d} fill={p.fill} />
      ))}
    </Svg>
  );
}

/** Apple's mark, in the button's ink — Apple's guidelines draw it the color of the title. */
export function AppleMark({ size, color }: { size: number; color: string }) {
  return (
    <Svg
      // the mark is taller than wide (814 × 1000); held to the glyph's height, as a glyph is
      width={Math.round(size * 0.814)}
      height={size}
      viewBox={APPLE_MARK.viewBox}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Path d={APPLE_MARK.d} fill={color} />
    </Svg>
  );
}
