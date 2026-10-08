/**
 * Disclosure (docs/DESIGN_SYSTEM.md §6): one line the reader can open, and the explanation
 * under it when they do.
 *
 * It exists because a screen full of true, careful sentences is a screen nobody reads. The
 * nudge sheet was four paragraphs of "what these are", "what arrives, and how" and "our
 * usual" wrapped around seven chips, and the chips are the whole point of it (the owner,
 * 2026-09-15: "only keep what's a must and the rest we can have like, click for more info").
 * What the app promises is that the explanation is always THERE — never that it is always in
 * the way.
 *
 * Closed is the default and closed is the honest state: the summary is a question the reader
 * can leave unasked. `expandable`/`expanded` go to assistive tech so the control announces
 * what it does before it is pressed, and the whole 44pt row is the target.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Badge } from './Badge';
import type { BadgeTone } from './badge-tone';
import { BodySm, BodyStrong } from './Text';

export interface DisclosureProps {
  /** The one line that is always visible. A question or a noun, never a command. */
  summary: string;
  children: ReactNode;
  /** Open on first render — for a screen where the detail is the point. */
  defaultOpen?: boolean;
  /**
   * CONTROLLED, when an owner needs to open it from elsewhere — the tummy-time sheet opens its
   * day's entries on an upward drag of the sheet's handle as well as on this row. With `open`
   * given, the row reports taps through `onToggle` and draws what it is told; without it the
   * row keeps its own state, exactly as before.
   */
  open?: boolean;
  onToggle?: (open: boolean) => void;
  /**
   * THE WORDS AT THE TOP OF THE ROW, for a disclosure that sits directly under the block it is
   * about — setup's "Where these starting points come from", under the rhythm rows (the owner,
   * 2026-09-25: *"remove vertical spacing or top padding from the how often thyrhm to 'Where these
   * starting points come from.'"*). The row keeps its whole 44pt target; the height the words do
   * not fill goes UNDER them rather than half above, so nothing sits between the line and what it
   * explains. It moves no target: the rows above keep theirs, and nothing overlaps.
   *
   * Off everywhere else. Centered is the row at rest, and a line with a heading or a gap above it
   * has nothing to sit flush against.
   */
  flush?: boolean;
  /**
   * A STATUS WORD AFTER THE SUMMARY, as a `Row` carries one after its title: Reports' "See the
   * charts" wears the app's quiet "Plus" tag during the 14-day preview (2026-09-28). It is spoken
   * with the summary ("See the charts, Plus"), so a screen reader hears what the eye sees, and it
   * takes no tap of its own: the whole row is still the one target.
   */
  badge?: { label: string; tone?: BadgeTone };
  /**
   * THE SUMMARY AS A CARD TITLE, centered in the row the way a plain disclosure is. Reports' See
   * the charts and Usual windows are a pair, and a link-sized line on one of them sat higher than
   * the title on the other (2026-10-03).
   */
  prominent?: boolean;
  /** A glyph before the summary, centered on the words. The row stays the one target. */
  leading?: ReactNode;
  /**
   * SIZE TO THE WORDS. The 44pt target stays, as hit slop, so a line under a block does not
   * grow a band of empty padding above and below it (Reports' "What they say to ask", the
   * owner, 2026-10-03).
   */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function Disclosure({
  summary,
  children,
  defaultOpen,
  open: controlled,
  onToggle,
  flush = false,
  badge,
  prominent = false,
  leading,
  compact = false,
  style,
  testID,
}: DisclosureProps) {
  const t = useTheme();
  const [own, setOwn] = useState(defaultOpen === true);
  const open = controlled ?? own;
  const toggle = () => {
    const next = !open;
    if (controlled === undefined) setOwn(next);
    onToggle?.(next);
  };
  const slop = compact ? Math.max(0, Math.ceil((t.hit.min - t.type.bodySm.lineHeight) / 2)) : 0;
  return (
    <View style={style}>
      <Pressable
        accessibilityRole="button"
        {...(badge ? { accessibilityLabel: `${summary}, ${badge.label}` } : {})}
        accessibilityState={{ expanded: open }}
        accessibilityHint={open ? undefined : summary}
        onPress={toggle}
        {...(compact ? { hitSlop: { top: slop, bottom: slop, left: 0, right: 0 } } : {})}
        style={({ pressed }) => [
          // the 44pt target is the Pressable; the line of words sits in it, centered at rest and
          // at the top when `flush`, with the chevron centered on the words either way.
          // compact keeps that target in the slop, so the row does not paint the padding.
          compact
            ? null
            : { minHeight: t.hit.min, justifyContent: flush ? 'flex-start' : 'center' },
          { opacity: pressed ? 0.7 : 1 },
        ]}
        {...(testID ? { testID } : {})}
      >
        <View style={[styles.row, { gap: t.space.sm }]}>
          {leading ?? null}
          {prominent ? (
            <BodyStrong style={styles.summary}>{summary}</BodyStrong>
          ) : (
            <BodySm ink="accent2" style={styles.summary}>
              {summary}
            </BodySm>
          )}
          {badge ? (
            <Badge
              label={badge.label}
              {...(badge.tone ? { tone: badge.tone } : {})}
              style={styles.badge}
              {...(testID ? { testID: `${testID}.badge` } : {})}
            />
          ) : null}
          {/* the chevron turns a quarter when it is open — the one place the state is a shape */}
          <Icon name={open ? 'up' : 'down'} size={16} color={t.color.accent2} />
        </View>
      </Pressable>
      {open ? <View style={{ gap: t.space.sm, paddingBottom: t.space.sm }}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  summary: { flex: 1 },
  badge: { alignSelf: 'center' },
});
