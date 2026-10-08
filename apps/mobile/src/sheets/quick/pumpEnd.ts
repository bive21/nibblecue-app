/**
 * WHEN A RUNNING PUMP ENDED (the owner, 2026-10-03). The start is chosen before the timer starts.
 * The sheet that stops a pump asks the other question: the session ran on, and the parent is saying
 * when it finished. The chips are the start row's shape with a wider step, because a forgotten stop
 * is often a quarter of an hour, not ten minutes: Now, −5m, −15m, Custom.
 *
 * AN OFFSET IS PLACED WHEN IT IS TAPPED, as a start's is (`offsetPick`). "−15m" tapped at
 * 9:41 is 9:26, and stays 9:26 however long the sheet then sits open. Whether that instant can be
 * the end is not decided here: `timerEnd.ts` is the only rule, and it refuses an end before the
 * start or later than now.
 *
 * "JUST NOW" IS NOT AN INSTANT. Nothing is stored. The end is the stop the card already has, or
 * the moment the session is saved (`PumpOutput.finish`).
 */
export type PumpEndChoice = 'now' | 'm5' | 'm15' | 'm30' | 'earlier';
/** A chip other than "Now": an end the parent said was earlier. */
export type PumpEndOffset = 'm5' | 'm15' | 'm30';

/** The row's chips, in their order. */
// −30m since 2026-10-06: the row has the room, and a stop noticed late is often that far back
export const PUMP_END_CHOICES: readonly PumpEndChoice[] = ['now', 'm5', 'm15', 'm30', 'earlier'];

export const PUMP_END_OFFSET_MIN: Readonly<Record<PumpEndOffset, number>> = {
  m5: 5,
  m15: 15,
  m30: 30,
};

const MIN = 60_000;

export const isPumpEndOffset = (c: PumpEndChoice): c is PumpEndOffset =>
  c === 'm5' || c === 'm15' || c === 'm30';

/** An offset chip, placed when it is tapped: that many minutes before the tap. */
export function pumpEndOffset(choice: PumpEndOffset, tapMs: number): number {
  return tapMs - PUMP_END_OFFSET_MIN[choice] * MIN;
}
