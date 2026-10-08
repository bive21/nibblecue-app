/**
 * TimelineItem (docs/DESIGN_SYSTEM.md §5, §6 "stacked text lines are blocks", docs/MOBILE.md
 * §4, §9): a 58pt time column (start over end for a range, mono, in the same `bodySm` mono the
 * other time columns on Today use and centered against the row's block — the Today polish brief,
 * 2026-09-20; it was the smaller `meta` in the secondary ink), the module's 32pt flat circular
 * chip (`ModuleDisc`, which Today's "Also running" rows draw too), then title / detail /
 * attribution — each its own block, so nothing runs
 * together into "Nap · 1h 51mMia · Emma". The baby's name is a label on the title's own line
 * (`childName`, below). `queued` is the warn Badge — the measured badge ink on
 * the amber tint, pill geometry, §12 rule 7 — AND the word; `isPrivate` is a lock glyph AND
 * "Private to you" — a state is never color alone. The whole row is the control (a tap opens the
 * entry; the Activity log's long press deletes it); a hairline below separates it from the next.
 *
 * A ROW WITH A `swipe` SLIDES LEFT TO SHOW IT (the owner, 2026-09-29: *"add the ability where user
 * can swipe or bring the log row to the left and it shows the button option to delete"*). The row
 * is wrapped in the app's one swipe (`SwipeRow`, as the shopping list's lines are), with the action
 * drawn behind it only while it is out; a screen reader never needs the gesture, because the same
 * action is the row's own custom accessibility action — VoiceOver offers it on a swipe up or down,
 * TalkBack in its actions menu. What the action does (the log asks first) is the caller's; a row
 * with no `swipe` is exactly the row it always was.
 */
import type { ModuleId } from '@nibblecue/core';
import { useRef } from 'react';
import {
  Pressable,
  StyleSheet,
  View,
  type AccessibilityActionEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Icon } from '../icons/Icon';
import type { IconName } from '../icons/paths';
import { useTheme } from '../theme/ThemeProvider';
import { Badge } from './Badge';
import { ModuleDisc } from './ModuleDisc';
import { NameTag } from './NameTag';
import { SwipeRow, type SwipeRowHandle } from './SwipeRow';
import { BodySm, BodyStrong, Meta, Numeric } from './Text';

/** The screen reader's name for a row's swipe action, whatever the caller calls it on screen. */
export const TIMELINE_SWIPE_ACTION = 'swipeAction';

/** A row that slides left to show an action (the log's Delete). Every word is the caller's. */
export interface TimelineSwipe {
  /** The action's word, behind the row and in a screen reader's actions: `Delete`. */
  label: string;
  /** What a screen reader hears for the button behind the row, naming the entry. */
  accessibilityLabel: string;
  /**
   * Asked for by the button behind the row, or by a screen reader's action on the row itself. It is
   * handed the row, which stays out until the caller sends it home (`SwipeRowHandle.shut`).
   */
  onAction: (row: SwipeRowHandle) => void;
  /** The button behind the row. */
  testID: string;
}

/** A row asked for its action by a screen reader before its swipe was ever drawn: already home. */
const HOME: SwipeRowHandle = { shut: () => undefined };

/**
 * THE CLOCK COLUMN, and the number is arithmetic rather than taste (2026-09-20).
 *
 * It was 58, and a twelve-hour clock does not fit in it: `11:31 AM` is eight glyphs of IBM Plex
 * Mono, whose advance is 0.6 em, so at `bodySm` (13) it wants 62.4 pt. Every afternoon row in
 * Up next therefore ended `11:31 …` (the owner, 2026-09-20, with a screenshot), and the log
 * below it wrapped instead — the same bug wearing two faces, because that list has no
 * `numberOfLines` to truncate with.
 *
 * 70 is the eight glyphs plus a little for hinting. It is shared so the two lists' clocks line
 * up down the page, which is the whole reason a fixed column exists here.
 */
export const TIMELINE_TIME_COLUMN = 70;

/**
 * …AND IT GROWS WITH THE READER'S TYPE. A fixed column is a truncation waiting for somebody's
 * accessibility setting: dynamic type is UNCAPPED for body copy in this app (docs/MOBILE.md
 * §9), so at 1.3× the same eight glyphs want 81 pt. Multiplying by the scale keeps every row in
 * the table the same width — which is what alignment needs — without ever clipping the number.
 * Never below 1: a phone set under 1.0 does not get a narrower column, it gets more air.
 */
export const timeColumnWidth = (bodyScale: number): number =>
  Math.round(TIMELINE_TIME_COLUMN * Math.max(1, bodyScale));

export interface TimelineItemProps {
  moduleId: ModuleId;
  /** "8:04 PM" — already in the reader's clock and zone. */
  startLabel: string;
  /** For a range (sleep): the end, stacked under the start. */
  endLabel?: string;
  title: string;
  detail?: string;
  byInitials?: string;
  byName?: string;
  /** The child, for a multiples household ("Mia"): a label beside the title. */
  childName?: string;
  /** Written locally, not yet synced. */
  queued?: boolean;
  isPrivate?: boolean;
  icon?: IconName;
  onPress: () => void;
  onLongPress?: () => void;
  /** Slide left to show this action (see the header); absent, the row does not swipe. */
  swipe?: TimelineSwipe;
  /** False on the last row of a group. */
  divider?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

export function TimelineItem({
  moduleId,
  startLabel,
  endLabel,
  title,
  detail,
  byInitials,
  byName,
  childName,
  queued,
  isPrivate,
  icon,
  onPress,
  onLongPress,
  swipe,
  divider = true,
  accessibilityLabel,
  style,
  testID,
}: TimelineItemProps) {
  const t = useTheme();
  // the row's swipe, for the action a screen reader asks of the row itself
  const swiped = useRef<SwipeRowHandle>(null);
  // who logged it, on its own line; the baby is the label on the title's (see below)
  const who = byName ?? byInitials;
  const spoken =
    accessibilityLabel ??
    [
      childName ? `${title} for ${childName}` : title,
      endLabel ? `${startLabel} to ${endLabel}` : startLabel,
      detail,
      who ? `by ${who}` : undefined,
      queued ? 'queued for sync' : undefined,
      isPrivate ? 'private to you' : undefined,
    ]
      .filter(Boolean)
      .join(', ');
  const onSwipeAction = (e: AccessibilityActionEvent) => {
    if (swipe !== undefined && e.nativeEvent.actionName === TIMELINE_SWIPE_ACTION)
      swipe.onAction(swiped.current ?? HOME);
  };
  const row = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens the entry"
      // the swipe's action, for a screen reader that never swipes: the row's own, by its word
      {...(swipe !== undefined
        ? {
            accessibilityActions: [{ name: TIMELINE_SWIPE_ACTION, label: swipe.label }],
            onAccessibilityAction: onSwipeAction,
          }
        : {})}
      onPress={onPress}
      {...(onLongPress ? { onLongPress } : {})}
      style={({ pressed }) => [
        styles.row,
        {
          gap: t.space.lg,
          /* sm, not lg (the owner, 2026-09-23, of Today's log: "fix the top and bottom padding.
             This is too tall"): the same row height the Up next table was cut to on 2026-09-21,
             so the two lists on Today are one rhythm. The 44 floor still holds the target. */
          paddingVertical: t.space.sm,
          minHeight: t.hit.min,
          opacity: pressed ? 0.8 : 1,
          borderBottomWidth: divider ? StyleSheet.hairlineWidth : 0,
          borderBottomColor: t.color.line,
        },
        style,
      ]}
      {...(testID ? { testID } : {})}
    >
      {/* THE TIME IS ONE BLOCK, CENTERED: start over end for a range, the pair as a whole sitting
          in the middle of the title-and-detail block beside it, whatever its line count */}
      <View style={[styles.time, { width: timeColumnWidth(t.fontScale.body) }]}>
        <Numeric variant="bodySm" ink="text">
          {startLabel}
        </Numeric>
        {endLabel ? (
          <Numeric variant="bodySm" ink="text">
            {endLabel}
          </Numeric>
        ) : null}
      </View>
      <ModuleDisc moduleId={moduleId} {...(icon ? { icon } : {})} />
      <View style={[styles.body, { gap: t.space.xs }]}>
        <View style={[styles.titleRow, { gap: t.space.sm }]}>
          <BodyStrong style={styles.title}>{title}</BodyStrong>
          {/* THE BABY'S NAME IS A LABEL BESIDE THE MODULE'S (the owner, 2026-09-30, of Today's log
              on Both: "The baby name should be a label next to the module name (diaper, bottle).
              Makes it easier to see and save the row space"). It was the row's last line, under
              the detail, so every row on Both was three lines. The same label Up next and the
              Schedule's slots wear (`NameTag`). */}
          {childName ? (
            <NameTag name={childName} {...(testID ? { testID: `${testID}.child` } : {})} />
          ) : null}
          {/* no accessibilityLabel on the badge: the row's sentence already says "queued for sync",
              and a labelled badge would become a second element inside the button */}
          {queued ? <Badge label="queued" tone="warn" /> : null}
        </View>
        {detail ? <BodySm>{detail}</BodySm> : null}
        {who ? <Meta>{who}</Meta> : null}
        {isPrivate ? (
          <View style={[styles.privateRow, { gap: t.space.xs }]}>
            <Icon name="lock" size={12} color={t.color.text2} />
            <Meta>Private to you</Meta>
          </View>
        ) : null}
      </View>
      <View style={styles.edit}>
        <Icon name="edit" size={15} color={t.color.text3} />
      </View>
    </Pressable>
  );
  if (swipe === undefined) return row;
  return (
    <SwipeRow
      ref={swiped}
      label={swipe.label}
      accessibilityLabel={swipe.accessibilityLabel}
      onAction={swipe.onAction}
      // one element with its own actions: nothing hidden under it for a screen reader to meet
      backing="out"
      actionTestID={swipe.testID}
    >
      {row}
    </SwipeRow>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-start', width: '100%' },
  time: {
    flexShrink: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  title: { flexShrink: 1 },
  privateRow: { flexDirection: 'row', alignItems: 'center' },
  edit: { flexShrink: 0 },
});
