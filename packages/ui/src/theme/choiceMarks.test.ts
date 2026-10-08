/**
 * THE MARKS ON A CHOICE, MEASURED (`choiceMarks.ts`; the owner, 2026-09-25: the Appearance
 * sheet's colors as one row of swatches and its designs as two preview tiles). A mark that says
 * "this one" is the part of the control that shows its state, so it clears 3:1 against what it is
 * drawn next to (WCAG 1.4.11) — here, in every theme and every scheme, against the sheet it rings
 * and the picture it sits on, rather than on the eye's word for it (docs/PREFLIGHT.md).
 */
import { describe, expect, it } from 'vitest';
import { SCHEME_NAMES } from './appearance';
import { choiceMarks } from './choiceMarks';
import { AA_GRAPHIC, composite, contrastRatio } from './contrast';
import { ORB_PLAN } from './ground';
import { materialBase, SKINS, skinForTheme, type SkinName } from './skins';
import { resolvePalette, type Palette, type ThemeName } from './theme';

const THEMES: readonly ThemeName[] = ['light', 'dark', 'night'];
const SKIN_LIST = Object.keys(SKINS) as SkinName[];

const every = (fn: (p: Palette, theme: ThemeName, scheme: string) => void) => {
  for (const theme of THEMES)
    for (const scheme of SCHEME_NAMES) fn(resolvePalette(theme, scheme), theme, scheme);
};

/**
 * What the sheet under a mark is painted, both ways a skin can paint it: its own alpha over the
 * page where the platform blurs (iOS), opaque where it cannot (Android, `Surface.tsx`). The page
 * under a translucent sheet is taken as the `paper` every screen is painted on.
 */
const sheetGrounds = (p: Palette, theme: ThemeName): string[] =>
  SKIN_LIST.flatMap(skin => {
    const sheet = skinForTheme(SKINS[skin], theme).sheet;
    const base = materialBase(p, sheet);
    return [composite(p.paper, base, sheet.alpha), composite(p.paper, base, 1)];
  });

/**
 * What the picture under a badge can be at the window's top right corner: the page, and the page
 * under each of the lit ground's orbs at its peak in this theme — the Glass tile's rose orb sits
 * exactly there.
 */
const pictureGrounds = (p: Palette, theme: ThemeName): string[] => {
  const peak = skinForTheme(SKINS.glass, theme).orbAlpha;
  return [p.paper, ...ORB_PLAN.map(o => composite(p.paper, p[o.token as keyof Palette], peak))];
};

describe('the chosen mark', () => {
  it('rings the chosen option in an ink the sheet around it cannot swallow', () => {
    every((p, theme, scheme) => {
      const marks = choiceMarks(p);
      for (const g of sheetGrounds(p, theme))
        expect(contrastRatio(marks.ring, g), `${theme} ${scheme} on ${g}`).toBeGreaterThanOrEqual(
          AA_GRAPHIC,
        );
    });
  });

  it('draws the check so it reads on its badge', () => {
    every((p, theme, scheme) => {
      const marks = choiceMarks(p);
      expect(contrastRatio(marks.check, marks.badge), `${theme} ${scheme}`).toBeGreaterThanOrEqual(
        AA_GRAPHIC,
      );
    });
  });

  it('keeps the badge distinct from the picture under it, with a clear ring of its own', () => {
    every((p, theme, scheme) => {
      const marks = choiceMarks(p);
      for (const g of pictureGrounds(p, theme))
        expect(contrastRatio(marks.badge, g), `${theme} ${scheme} on ${g}`).toBeGreaterThanOrEqual(
          AA_GRAPHIC,
        );
      // the clear ring is the badge's opposite: whatever the picture is, one of the two edges shows
      expect(contrastRatio(marks.ringGap, marks.badge)).toBeGreaterThanOrEqual(AA_GRAPHIC);
    });
  });
});

describe('the lock on a sold option', () => {
  it('reads on its own disc, whatever it is drawn over', () => {
    every((p, theme, scheme) => {
      const marks = choiceMarks(p);
      expect(
        contrastRatio(marks.lock, marks.lockDisc),
        `${theme} ${scheme}`,
      ).toBeGreaterThanOrEqual(AA_GRAPHIC);
    });
  });
});

describe('nothing here is a new color', () => {
  it('is the palette’s own roles, so night’s marks are night’s amber and nothing brighter', () => {
    every(p => {
      const marks = choiceMarks(p);
      const roles = new Set<string>([p.text, p.text2, p.surfaceSolid, p.line]);
      for (const v of Object.values(marks)) expect(roles.has(v)).toBe(true);
    });
  });
});
