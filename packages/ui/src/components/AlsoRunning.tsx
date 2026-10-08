/**
 * AlsoRunning — every running timer after the first two, as one card of compact rows under Today's
 * two timer cards (the owner, 2026-09-26: *"the rest collapse into an 'Also running' card with
 * compact rows using the same flat circular icons as the Log chips"*; 2026-09-27: *"if running 3,
 * then it should show the also running for the third"*; `timerStack.ts` has the stack, the order
 * and the reasons).
 *
 * A ROW is the tap target and no taller (`ALSO_RUNNING.row`, 44 pt): the Log's own chip
 * (`ModuleDisc`), the household's word for the module — "Playtime" once tummy time has graduated —
 * with the baby's name after it only where there is somebody else it could be, the elapsed in the
 * mono face, ticking, and a chevron that says the row goes somewhere. The whole row OPENS that
 * timer's own sheet, where it is corrected and stopped. There is no stop on a row: a stop one
 * mis-tap from the row above it is how a two-hour nap ends at twenty minutes, and the card and the
 * sheet already carry the held one (`StopButton`).
 *
 * THE TICK LIVES IN THE ROW (docs/DESIGN_SYSTEM.md §7.1 rule 4): each row counts its own seconds
 * off its own timestamps with the card's hook (`useTimerNow`), so Today does not re-render with
 * them, and it stops with the page — the rows sit inside the same `MotionGate` as the card, closed
 * while the page is scrolled past them, where the sticky timer bar carries every clock. A stopped
 * pump waiting on its output form is handed the frozen instant, as the card is.
 *
 * ACCESSIBILITY: each row is one button whose name is the timer and how long it has run — "Sleep
 * timer for Liam, 1 hour 2 minutes" — in words, never glyphs, and a hint that it opens the timer.
 * The name moves with the minute, not the second (`announceElapsed`), so a screen reader resting on
 * a row is not re-read every tick. The label is a header over the rows.
 */
import type { ModuleId } from '@nibblecue/core';
import { Pressable, StyleSheet, View } from 'react-native';
import { Icon } from '../icons/Icon';
import { useTheme } from '../theme/ThemeProvider';
import { Card } from './Card';
import { ModuleDisc } from './ModuleDisc';
import type { TimerType } from './StopButton';
import { BodyStrong, Label, Numeric } from './Text';
import { breastfeedTotals, formatElapsed, timerElapsed, type BreastfeedSides } from './timeFormat';
import { useTimerNow } from './TimerCard';
import {
  ALSO_RUNNING,
  ALSO_RUNNING_TITLE,
  alsoRunningSpoken,
  alsoRunningTitle,
} from './timerStack';

export interface AlsoRunningItem {
  id: string;
  type: TimerType;
  /** Epoch ms. */
  startedAtMs: number;
  pausedMs: number;
  /** Breastfeeding only: the per-side totals, so the row counts what the card would. */
  sides?: BreastfeedSides;
  /** A frozen clock: a stopped pump's, while its output form is open (`stopped.ts` in the app). */
  now?: number;
  /** The household's word for the module: "Sleep", "Pump", "Playtime". */
  word: string;
  /** Only in a household with more than one child: the row names no one otherwise. */
  childName?: string;
  /**
   * Opens this timer's own sheet. Absent for somebody who may not log (a view only member): the
   * row still says what runs and for how long, and is not a button, with no chevron.
   */
  onOpen?: () => void;
}

export interface AlsoRunningProps {
  /** The timers after the first two, in the stack's order (`timerStack`). Nothing is drawn for none. */
  items: readonly AlsoRunningItem[];
  /** The card's id; each row is `${testID}.${type}`. */
  testID?: string;
}

export function AlsoRunning({ items, testID }: AlsoRunningProps) {
  const t = useTheme();
  if (items.length === 0) return null;
  return (
    <Card padded={false} style={{ paddingTop: ALSO_RUNNING.top }} {...(testID ? { testID } : {})}>
      <Label
        accessibilityRole="header"
        style={[styles.label, { lineHeight: ALSO_RUNNING.label, paddingHorizontal: t.space.lg }]}
      >
        {ALSO_RUNNING_TITLE}
      </Label>
      {items.map((item, i) => (
        <AlsoRunningRow
          key={item.id}
          item={item}
          first={i === 0}
          {...(testID ? { testID: `${testID}.${item.type}` } : {})}
        />
      ))}
    </Card>
  );
}

function AlsoRunningRow({
  item,
  first,
  testID,
}: {
  item: AlsoRunningItem;
  first: boolean;
  testID?: string;
}) {
  const t = useTheme();
  // the card's own tick: stopped with the page, frozen for a stopped pump (see the header)
  const now = useTimerNow(item.now);
  const elapsedMs =
    item.type === 'breastfeed' && item.sides
      ? breastfeedTotals(item.sides, now).totalMs
      : timerElapsed(item.startedAtMs, item.pausedMs, now);
  const paused = item.type === 'breastfeed' && item.sides?.active === null;
  const title = alsoRunningTitle(item.word, item.childName);
  const spoken = alsoRunningSpoken({
    word: item.word,
    ...(item.childName ? { childName: item.childName } : {}),
    elapsedMs,
    paused,
  });
  const rowStyle = [
    styles.row,
    {
      minHeight: ALSO_RUNNING.row,
      paddingHorizontal: t.space.lg,
      gap: t.space.md,
      // a hairline between rows, never above the first: the label is its own separation
      borderTopWidth: first ? 0 : StyleSheet.hairlineWidth,
      borderTopColor: t.color.line,
    },
  ];
  const content = (
    <>
      <ModuleDisc moduleId={item.type as ModuleId} />
      <View style={styles.grow}>
        <BodyStrong numberOfLines={1}>{title}</BodyStrong>
      </View>
      <Numeric variant="bodySm" ink="text2" numberOfLines={1}>
        {formatElapsed(elapsedMs, 'live')}
      </Numeric>
      {item.onOpen ? <Icon name="chev" size={13} color={t.color.text3} /> : null}
    </>
  );
  // nothing to open: a row to read (see `onOpen`)
  if (!item.onOpen)
    return (
      <View accessible accessibilityLabel={spoken} style={rowStyle} {...(testID ? { testID } : {})}>
        {content}
      </View>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={spoken}
      accessibilityHint="Opens the timer"
      onPress={item.onOpen}
      style={({ pressed }) => [...rowStyle, { opacity: pressed ? 0.8 : 1 }]}
      {...(testID ? { testID } : {})}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  label: { alignSelf: 'stretch' },
  row: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1, minWidth: 0 },
});
