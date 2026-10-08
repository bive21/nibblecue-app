/**
 * StepHeader (docs/DESIGN_SYSTEM.md §4, §6): the header rhythm every first-run screen lacked.
 * An eyebrow — one small glyph and one small-caps word — then the H1, then an optional blurb,
 * with an optional progress track above. It exists because `Screen` puts ONE uniform 11pt gap
 * between every child it is handed, so a heading, its sub-line and the first form field were
 * spaced identically and nothing grouped. This gives the top of a screen its own internal
 * rhythm without touching Screen's column gap, which every screen in the product shares.
 *
 * THE EYEBROW GLYPH IS ALWAYS `accent2`, AND NEVER A CATEGORY HUE. Over the fully decorated
 * first-run ground `accent2` measures 6.04:1, with enormous headroom; `milk` as a glyph on a
 * motif stroke measures 2.99:1 — one hundredth UNDER the 3.0 graphic floor. A category hue here
 * would look like an improvement and would fail the gate, so the number is written down.
 * Category hue belongs on a Row, on a surface, where the matrix already covers it.
 *
 * The glyph carries no accessible name, so `Icon` already hides it from assistive technology
 * (Icon.tsx:38-41) and the eyebrow WORD is the accessible content. `H1` brings its own header
 * role. The label takes `flexShrink: 1` so the eyebrow row wraps rather than clips at 200% type.
 *
 * THE BLURB IS THE HINT, `BodySm` (the owner's rule 3 of 2026-09-30, up for their review:
 * docs/DESIGN_SYSTEM.md §4.1). It was `Body` in `text2`, so every sign-in and setup page explained
 * itself a size over the rest of the app, where an intro line is 13 on 19.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/paths';
import { useTheme } from '../theme/ThemeProvider';
import { BodySm, H1, Label } from './Text';

export interface StepHeaderProps {
  icon: IconName;
  /**
   * The small line over the heading, with the glyph beside it. **Optional**, and left out where
   * it would only say the heading again — the sign-up screen read "Create account" over "Create
   * your account" (the owner, 2026-09-21: "remove the top smaller CREATE ACCOUNT, this is
   * repetitive"). Without it the glyph goes too: a glyph alone over a heading is decoration.
   */
  eyebrow?: string;
  title: string;
  blurb?: string;
  /** The progress track, on the screens that have one. */
  track?: ReactNode;
  /**
   * A PICTURE OVER THE EYEBROW, standing in for its glyph (2026-09-26: setup's welcome, where the
   * sun comes up over "Welcome" — `Sunrise`). Drawn above the eyebrow word, and the small glyph is
   * then left out: a picture of the sun beside a glyph of the sun is the same thing twice. The
   * picture is the caller's and must be decoration — the word and the heading carry the page.
   */
  art?: ReactNode;
  titleTestID?: string;
}

export function StepHeader({
  icon,
  eyebrow,
  title,
  blurb,
  track,
  art,
  titleTestID,
}: StepHeaderProps) {
  const t = useTheme();
  return (
    <View style={{ gap: t.space.md }}>
      {track}
      {/* the eyebrow is tight to its heading (sm); the blurb sits slightly apart (md) */}
      <View style={{ gap: t.space.sm }}>
        {art ?? null}
        {eyebrow === undefined ? null : (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: t.space.sm }}>
            {art === undefined ? <Icon name={icon} size={18} color={t.color.accent2} /> : null}
            <Label style={{ flexShrink: 1 }}>{eyebrow}</Label>
          </View>
        )}
        <H1 {...(titleTestID ? { testID: titleTestID } : {})}>{title}</H1>
      </View>
      {blurb ? <BodySm>{blurb}</BodySm> : null}
    </View>
  );
}
