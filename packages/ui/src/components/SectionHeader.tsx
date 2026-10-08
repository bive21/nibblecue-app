/**
 * SectionHeader (docs/DESIGN_SYSTEM.md §6, §12 rule 5, §23.1): the 18pt eyebrow that separates
 * sections — the mono `label` role in `text2` as a header, with an optional action on the right
 * as a text button in `accent2` (the ink that clears 4.5:1 on every ground; `accent` measures
 * 4.31:1 in the rose scheme). The action's pressable IS 44pt tall and wide (docs/MOBILE.md §8),
 * but it takes only one line of layout: the extra height is pulled back with negative vertical
 * margins, so the header keeps its rhythm — a 44pt row between every section would double the
 * page — while the target stays honest. hitSlop was not enough here: a 13pt line with 11pt of
 * slop is 38, and the slop band is silently lost on Android when it leaves the parent's bounds.
 * The arrow glyph goes on the action because the reference has exactly one link per heading,
 * and a locked action shows its lock before the tap. `variant="title"` is the prototype's later
 * sentence-case heading (16/800, "stops the page looking like a spreadsheet") kept as a switch
 * so the choice can be made by looking rather than by re-plumbing every screen.
 *
 * TWO MORE, FOR A PAGE'S OWN NAME (docs/DESIGN_SYSTEM.md §4.1 rule 1, 2026-09-30): `page` is the
 * heading of a page opened from another page, drawn in its content with an action beside it (Care
 * items' Add, To do's Add, Vaccines' Add), and it is `H1`, 23, the pushed bar's own size; `tab` is
 * a tab page's title, `TabTitle`, 28 (More, Reports). A page title was the 18 section title on six
 * pages, a third size for the one job.
 *
 * `trailing` is the one door OUT of this file: a screen that has to put something AROUND the
 * header's action (the first-run tour outlines the Shopping list's Share on its own) draws a
 * `SectionActionButton`, wraps it, and hands it back through the slot. It lands in the same
 * right-hand cluster, pulled back the same way, so the wrapped control and the header's own are
 * one control.
 */
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { Icon, type IconProps } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { IconButton } from './IconButton';
import { AppText, H1, Label, Numeric, TabTitle } from './Text';

export interface SectionAction {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string;
  /** Behind Plus: the lock glyph and a hint, before the tap. The press still fires. */
  locked?: boolean;
}

/** A glyph-only secondary control. The label is what a screen reader says; nothing draws it. */
export interface SectionIconAction {
  icon: IconProps['name'];
  accessibilityLabel: string;
  onPress: () => void;
}

const isIconAction = (a: SectionAction | SectionIconAction): a is SectionIconAction => 'icon' in a;

export interface SectionActionButtonProps {
  label: string;
  onPress: () => void;
  accessibilityLabel?: string | undefined;
  /** Behind Plus: the lock glyph and a hint, before the tap. The press still fires. */
  locked?: boolean | undefined;
  style?: StyleProp<ViewStyle> | undefined;
  testID?: string | undefined;
}

/**
 * THE HEADER'S TEXT ACTION ON ITS OWN: one bodySm line in `accent2` with the chevron, on a
 * pressable that is 44pt tall and wide. It carries NO pull-back of its own — the header that
 * places it gives the extra height back to the row, because only the header knows the rhythm it
 * is keeping — so on its own it is a plain 44pt control, and its box is the box a wrapper round
 * it measures.
 *
 * Exported for the one thing the header cannot do from the inside: let a screen put something
 * around its action. The first-run tour rings the Shopping list's Share by itself rather than
 * the heading it sits in (the owner, 2026-09-19: "just purple border the share button, not the
 * whole row"); the screen draws this, wraps it, and hands it back through `trailing`. The label
 * secondary below still draws its own copy of this pressable — `interaction.test.ts` pins that
 * branch's text — so a change to the look is made here and there together.
 */
export function SectionActionButton({
  label,
  onPress,
  accessibilityLabel,
  locked,
  style,
  testID,
}: SectionActionButtonProps) {
  const t = useTheme();
  const lineHeight = t.type.bodySm.lineHeight;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      {...(locked ? { accessibilityHint: 'Included with Plus' } : {})}
      onPress={onPress}
      style={({ pressed }) => [
        styles.action,
        {
          minHeight: t.hit.min,
          minWidth: t.hit.min,
          gap: t.space.xs,
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
      {...(testID ? { testID } : {})}
    >
      <AppText
        variant="bodyStrong"
        ink="accent2"
        style={{ fontSize: t.type.bodySm.fontSize, lineHeight }}
      >
        {label}
      </AppText>
      <Icon name={locked ? 'lock' : 'chev'} size={13} color={t.color.accent2} />
    </Pressable>
  );
}

export interface SectionHeaderProps {
  title: string;
  /**
   * How many things are under this heading, in the mono face on the right (the prototype's
   * `<span class="mono">` beside a store name). `text2`, never `text3`: a number a person reads
   * is text (§12 rule 5).
   */
  count?: number;
  action?: SectionAction;
  /**
   * A second control to the LEFT of `action`, in the same right-hand cluster.
   *
   * AS A GLYPH it is the same 34pt circle the top bar's controls use, so it reads as chrome
   * rather than as a second link. AS A LABEL it is now drawn exactly like `action` — `accent2`
   * with the chevron — because the owner asked for it by name (2026-09-18: "'Edit' should be
   * right next to schedule, make it shown like 'Edit>'"). It used to be `text2` with no arrow
   * on the reasoning that a heading should keep one obvious link; on Today's Baby care strip
   * that made the one control a parent needs — which of the three cells show — the faintest
   * thing in the row, and `space-between` pushed it into the middle of the header where it
   * belonged to neither the title nor the link. Both are fixed by the cluster below.
   */
  secondaryAction?: SectionAction | SectionIconAction;
  /**
   * A control the SCREEN has drawn, at the end of the same right-hand cluster: a
   * `SectionActionButton` inside whatever the screen has to wrap it in (a tour spot, which the
   * design system cannot know about). The header pulls it back like its own action, so the
   * row keeps one line; the wrapper measures the control's full 44pt box.
   */
  trailing?: ReactNode;
  /**
   * `eyebrow` (default) is the small-caps label; `title` the sentence-case section title (h2),
   * which heads every group on What you track and Reports and on no other page (one heading kind
   * per page, docs/DESIGN_SYSTEM.md §4.1 rule 2); `page` a pushed page's own name drawn in its
   * content (h1, 23); `tab` a tab page's (28).
   */
  variant?: 'eyebrow' | 'title' | 'page' | 'tab';
  /**
   * TIGHTER, for a page that is nothing but sections. Today is six or seven headings one under
   * the other, and at the standard rhythm the eyebrows alone cost about a sixth of the screen
   * (the owner, 2026-09-16: "the top bottom padding margin for 'log menu', 'next activities
   * menu' 'care' menu is too high, bring them a little closer together so you see more in the
   * home page display"). A page with two or three sections keeps the standard rhythm, where the
   * air is what separates them rather than what is between you and the next thing.
   */
  tight?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function SectionHeader({
  title,
  count,
  action,
  secondaryAction,
  trailing,
  variant = 'eyebrow',
  tight = false,
  style,
  testID,
}: SectionHeaderProps) {
  const t = useTheme();
  // the action's text is one bodySm line; the pressable is 44 tall and gives the difference
  // back to the row so the header stays one line in the page's rhythm
  const lineHeight = t.type.bodySm.lineHeight;
  const pullBack = (t.hit.min - lineHeight) / 2;
  return (
    <View
      style={[
        styles.row,
        {
          marginTop: tight ? t.space.lg : t.space.xxl,
          marginBottom: tight ? t.space.xs : t.space.md,
          gap: t.space.md,
        },
        style,
      ]}
      {...(testID ? { testID } : {})}
    >
      {variant === 'tab' ? (
        <TabTitle style={styles.title}>{title}</TabTitle>
      ) : variant === 'page' ? (
        <H1 style={styles.title}>{title}</H1>
      ) : variant === 'title' ? (
        <AppText variant="h2" accessibilityRole="header" style={styles.title}>
          {title}
        </AppText>
      ) : (
        <Label accessibilityRole="header" style={styles.title}>
          {title}
        </Label>
      )}
      {count === undefined ? null : (
        <Numeric variant="bodySm" ink="text2" align="right" style={styles.count}>
          {String(count)}
        </Numeric>
      )}
      {/*
        THE RIGHT-HAND CLUSTER. `space-between` on the row put the title at the start, the
        action at the end and anything in between in the MIDDLE of the header — which is where
        Baby care's "Edit" sat, a third of the way across, next to nothing. Wrapping the two in
        one flex-none group puts them together at the end, so "Edit › Schedule ›" reads as the
        pair it is (the owner, 2026-09-18). An empty group renders nothing and costs nothing.
      */}
      <View style={[styles.cluster, { gap: t.space.md }]}>
        {secondaryAction && isIconAction(secondaryAction) ? (
          <IconButton
            icon={secondaryAction.icon}
            accessibilityLabel={secondaryAction.accessibilityLabel}
            onPress={secondaryAction.onPress}
            // the circle is 34 and the row is one line of type: the pressable's 44 comes from
            // IconButton's own hitSlop, so the header's rhythm is untouched
            style={{ marginVertical: -pullBack }}
            {...(testID ? { testID: `${testID}.secondary` } : {})}
          />
        ) : secondaryAction ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={secondaryAction.accessibilityLabel ?? secondaryAction.label}
            onPress={secondaryAction.onPress}
            style={({ pressed }) => [
              styles.action,
              {
                minHeight: t.hit.min,
                minWidth: t.hit.min,
                marginVertical: -pullBack,
                gap: t.space.xs,
                opacity: pressed ? 0.7 : 1,
              },
            ]}
            {...(testID ? { testID: `${testID}.secondary` } : {})}
          >
            <AppText
              variant="bodyStrong"
              ink="accent2"
              style={{ fontSize: t.type.bodySm.fontSize, lineHeight }}
            >
              {secondaryAction.label}
            </AppText>
            <Icon name="chev" size={13} color={t.color.accent2} />
          </Pressable>
        ) : null}
        {action ? (
          <SectionActionButton
            label={action.label}
            onPress={action.onPress}
            accessibilityLabel={action.accessibilityLabel}
            locked={action.locked}
            style={{ marginVertical: -pullBack }}
          />
        ) : null}
        {/* the screen's control is pulled back by a wrapper OUTSIDE whatever the screen wrapped
            it in, so the row keeps its line and the screen's wrapper still holds the full box */}
        {trailing ? <View style={{ marginVertical: -pullBack }}>{trailing}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { flexShrink: 1 },
  count: { flexShrink: 0 },
  cluster: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexShrink: 0,
  },
});
