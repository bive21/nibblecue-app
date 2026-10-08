/**
 * The first run's three layout primitives (docs/DESIGN_SYSTEM.md §6). They exist because
 * `Screen` puts ONE uniform gap of `t.space.lg` between every child it is handed, and that gap
 * is shared by Today, Reports, More and the form sheets, so it cannot be changed for one flow
 * (docs/COLLABORATION.md: a shared file is not edited for a local need).
 *
 * The trick is that a flex gap applies only BETWEEN siblings. Give `Screen` exactly ONE child —
 * a `Sheet` — and its 11pt gap has nothing left to space, so the Sheet's own 18pt becomes the
 * page rhythm and `Group` supplies 6 / 8 / 11 inside a section. Eighteen loose children at one
 * uniform spacing become nine sections with internal structure, and Screen is untouched.
 *
 * `FormError` is the one that is load-bearing rather than cosmetic. Every status string in the
 * first run goes through it, because a status ink cannot sit on the lit ground: `crit` measures
 * 3.79 to 4.39:1 directly on it, and 4.35:1 over the doodle pattern, against a 4.5 floor. It was a
 * box until 2026-09-30, a solid surface with a flag glyph, and the box was what kept it off the
 * ground. It is the app's one error line now (the owner's rule 4, below), and what keeps it off
 * the ground is WHERE it is drawn: on the card of the form it is about, where crit measures 5.16:1
 * at the least, or on `ErrorPanel` where a page has no card to give it. `first-run/ground-usage.
 * test.ts` fails the build for a `FormError` with neither round it, and for a loose `ink="crit"`.
 */
import { BodySm, Card, useTheme } from '@nibblecue/ui';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

export interface SheetProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  /**
   * A WINDOW RATHER THAN A PAGE: one message and one button, centred in the space it has.
   *
   * The heads-up, the welcome and the age-gate refusal are not forms — they are a single thing
   * to read and a single thing to do. Pinned to the top they left two thirds of the screen
   * empty below them and read as a page that had failed to load the rest (the owner,
   * 2026-09-17: "it is way to full and too high. Does not look nice at all"). The Screen's
   * scroller already grows to fill, so centring here costs nothing and still scrolls when the
   * type is large.
   */
  center?: boolean;
}

/** The page rhythm: one child for Screen, 18pt between the sections inside it. */
export function Sheet({ children, center, style, testID }: SheetProps) {
  const t = useTheme();
  return (
    <View
      style={[{ gap: t.space.xxl }, center ? styles.center : null, style]}
      {...(testID ? { testID } : {})}
    >
      {children}
    </View>
  );
}

export interface GroupProps {
  children: ReactNode;
  /** sm = a footnote to the thing above it; md = one row of alternatives; lg = a form. */
  gap?: 'sm' | 'md' | 'lg';
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** A section's internal spacing. Things that belong together sit closer than 18pt. */
export function Group({ children, gap = 'md', style, testID }: GroupProps) {
  const t = useTheme();
  return (
    <View style={[{ gap: t.space[gap] }, style]} {...(testID ? { testID } : {})}>
      {children}
    </View>
  );
}

export interface FormErrorProps {
  /**
   * ReactNode, not string. Every number a parent reads goes through `Numeric` (the mono face
   * with tabular figures), and an error is not exempt — the age gate's refusal names a threshold.
   * Typing this as `string` quietly forced that one numeral back into the body face.
   */
  children: ReactNode;
  testID?: string;
}

/**
 * ONE ERROR, ONE SMALL RED LINE (docs/DESIGN_SYSTEM.md §4.1 rule 4; the owner, 2026-09-30, up for
 * their review): `BodySm` in `crit`, as a field's own error and every sheet's failed save are,
 * announced the moment it appears. It was a boxed banner, a solid surface with a flag glyph, the
 * one error in the app drawn a size up and in a box; the owner asked for the same line as
 * everywhere else. The words carry the meaning, so the red is never the only signal (§8).
 *
 * IT IS DRAWN ON A CARD, NEVER BARE ON THE PAGE (see this file's header): inside the card of the
 * form it is about, as the sign-in page's and the reset page's always were, or on `ErrorPanel`.
 */
export function FormError({ children, testID }: FormErrorProps) {
  return (
    <BodySm
      ink="crit"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      {...(testID ? { testID } : {})}
    >
      {children}
    </BodySm>
  );
}

export interface ErrorPanelProps {
  /** A refusal is being said: the card is drawn behind the children, and they move in onto it. */
  shown: boolean;
  /** The refusal (`FormError`, only while `shown`) and the control it answers. */
  children: ReactNode;
  testID?: string;
}

/**
 * A CARD THAT COMES WITH A REFUSAL, for the one place a form's error has no card to sit on:
 * setup's steps, where the questions are the page and a card round every one of them would be a
 * redesign nobody asked for. While a refusal is said, a card is drawn BEHIND the refusal and what
 * it answers (the role question, or the step's Continue), and they move in onto it; otherwise
 * nothing is drawn and the page is exactly as it was.
 *
 * BEHIND, NOT ROUND: the card is a sibling laid under the children rather than their parent, so
 * the control keeps its place in the tree and is never mounted again when the refusal comes and
 * goes: a screen reader's focus on Continue stays on Continue (`OnboardingScreen` keeps the same
 * button from step to step for the same reason).
 */
export function ErrorPanel({ shown, children, testID }: ErrorPanelProps) {
  const t = useTheme();
  return (
    <View {...(testID ? { testID } : {})}>
      {shown ? <Card padded={false} style={StyleSheet.absoluteFill} /> : null}
      <View style={[{ gap: t.space.md }, shown ? { padding: t.space.xl } : null]}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
});
