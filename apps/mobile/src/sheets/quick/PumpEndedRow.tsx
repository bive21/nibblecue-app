/**
 * WHEN A RUNNING PUMP ENDED, the start row's own anatomy asking the other question (the owner,
 * 2026-10-03). Not `StartedRow`: that row is when a timer began, and its words and its four chips
 * are pinned to the start. This one is only the pump's stop sheet.
 *
 *   ENDED                                                9:26 PM
 *   (Now) (−5m) (✓ −15m) (Custom)
 *
 * The clock at the eyebrow's end is the end the chips come to. While nothing earlier is chosen it
 * is the minute now, which is when a save would end the session. Four chips fit one line on a
 * 360 dp phone (`pumpEnd.test.ts`); at a larger text size the line wraps.
 */
import { SlotRow, formatClock, Label, Numeric, useTheme } from '@nibblecue/ui';
import { StyleSheet, View } from 'react-native';
import { useMinuteTick } from '../../time/useMinuteTick';
import { PUMP_ENDED } from './copy';
import { PUMP_END_CHOICES, isPumpEndOffset, pumpEndOffset, type PumpEndChoice } from './pumpEnd';

export interface PumpEndedRowProps {
  choice: PumpEndChoice;
  /**
   * The end a chip or the card's stop placed, or null while the pump is still running. Null draws
   * the minute clock: "Now" is not a stored instant.
   */
  atMs: number | null;
  onChoose: (choice: PumpEndChoice) => void;
  clock24: boolean;
  timeZone: string;
  disabled?: boolean;
  /**
   * When the pump began: an offset chip whose end would come before it is faded and takes no tap
   * (the owner, 2026-10-06: "in pumping module, the 30min does not work"). A pump started ten
   * minutes ago cannot have ended thirty minutes ago, and the refusal used to be a toast hidden
   * behind this very sheet, so the chip seemed simply dead.
   */
  startedAtMs?: number;
  testID: string;
}

/** The eyebrow, the time the end comes to, and the four chips. */
export function PumpEndedRow({
  choice,
  atMs,
  onChoose,
  clock24,
  timeZone,
  disabled = false,
  startedAtMs,
  testID,
}: PumpEndedRowProps) {
  const t = useTheme();
  // the minute every clock in the app moves on, and only while no end is placed
  const minute = useMinuteTick({ onWrite: false });
  const clock = formatClock(atMs ?? minute, clock24, timeZone);
  return (
    <View style={{ gap: t.space.sm }} testID={testID}>
      <View style={[styles.head, { gap: t.space.md }]}>
        <Label>{PUMP_ENDED.label}</Label>
        <Numeric
          variant="bodySm"
          ink="text"
          accessibilityLabel={`${PUMP_ENDED.label}, ${clock}`}
          testID={`${testID}-clock`}
        >
          {clock}
        </Numeric>
      </View>
      {/* the five share the row equally, left edge to right (`SlotRow`, 2026-10-06) */}
      <SlotRow
        accessibilityLabel={PUMP_ENDED.label}
        options={PUMP_END_CHOICES.map(c => ({
          value: c,
          label: PUMP_ENDED.choice[c],
          longLabel: PUMP_ENDED.choiceLong[c],
          accessibilityLabel: PUMP_ENDED.spoken[c],
          ...(c === 'earlier' ? { accessibilityHint: 'Opens a time picker' } : {}),
          // an end before the pump began cannot be chosen (see `startedAtMs`)
          ...(startedAtMs !== undefined &&
          isPumpEndOffset(c) &&
          pumpEndOffset(c, minute) <= startedAtMs
            ? { disabled: true }
            : {}),
        }))}
        value={choice}
        disabled={disabled}
        onChange={onChoose}
        module="pump"
        small
        gap={6}
        slotTestID={c => `${testID}-${c}`}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /** The eyebrow and the time it comes to: the label at the left, the clock at the right. */
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  /** One line of chips, wrapping (never clipping, never scrolling) where the type is large. */
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
});
