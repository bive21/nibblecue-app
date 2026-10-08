/**
 * A wall-clock time as a parent reads it. Carried over from CuddleCue's `sheets/care/careTimes.ts`
 * (the two functions the appearance settings read; the rest of that file is CuddleCue's care items).
 */
export function clockOf(hhmm: string, clock24: boolean): string {
  const [h, m] = hhmm.split(':');
  const hour = Number(h);
  const minute = m ?? '00';
  if (clock24 || !Number.isFinite(hour)) return hhmm;
  const ap = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${minute} ${ap}`;
}

/** The wall clock a picker hands back, as `HH:MM`. */
export const hhmmOf = (hours: number, minutes: number): string =>
  `${String(Math.max(0, Math.min(23, hours))).padStart(2, '0')}:${String(Math.max(0, Math.min(59, minutes))).padStart(2, '0')}`;
