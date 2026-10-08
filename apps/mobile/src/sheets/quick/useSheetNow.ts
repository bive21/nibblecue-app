/**
 * "NOW", HELD BY A FORM WHOSE SAVE DEPENDS ON IT — so the line that says what Save will write and
 * the Save itself read the SAME instant.
 *
 * The pump's manual session is the case (2026-09-25): an end that would be later than now is held
 * at now (`pumpSession`; the row has been the END since 2026-09-26). Read `Date.now()` in the line
 * and again in the Save, and the two can straddle that moment — a line that promised 9:04 → 9:22
 * over a save that wrote 9:05 → 9:23. Both read this value instead. It ticks
 * every 15 s, so the line keeps up with the clock, and it is never ahead of the real one: an end
 * clamped to it is never in the future.
 */
import { useEffect, useState } from 'react';

export const SHEET_NOW_TICK_MS = 15_000;

export function useSheetNow(everyMs: number = SHEET_NOW_TICK_MS): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
