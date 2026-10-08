/**
 * THE TIME RULES OF THE COMPLETED-LOG FORMS (the owner's Option 2 "Soft groups", 2026-10-05:
 * diaper, breastfeed and sleep, logged and edited). Pure, so each rule is a table test
 * (`completedTime.test.ts`); `completedForm.tsx` and the three sheets draw them.
 *
 * NOW IS NOW AT THE SAVE. The quick forms resolved every preset against the moment the sheet
 * opened; the redesign asks that "Now" be the moment it is saved, so a sheet left open while a
 * baby settled does not write a stale time. 15 and −30m are placed when they are TAPPED —
 * "it ended fifteen minutes ago" is said at the tap — and Custom is a picked date and time.
 *
 * A SLOT THAT IS OVER keeps its rule (`finishedEnd`): until the row is touched, a row that is an
 * END stands one length after the slot, so the entry starts at the slot's own minute.
 */
import { localDayKey } from '@nibblecue/core';
import { PRESET_LABELS, PRESET_LONG_LABELS } from '@nibblecue/ui/timePresets';
import { finishedEnd, MIN } from './timerMath';

export type EventPreset = 'now' | 'm15' | 'm30' | 'custom';

/** The four chips under a new entry's time row, in the order they are drawn. */
/**
 * The four chips under a new entry's time row, in the order they are drawn — the app's one time
 * row (`SlotRow`, the owner's handoff of 2026-10-06: exactly four, sharing the row equally; the
 * −60m of earlier that day went with it, since four equal pills already fill the line).
 */
export const EVENT_PRESETS: readonly EventPreset[] = ['now', 'm15', 'm30', 'custom'];

/** Their words: the app's one set (`timePresets.ts`), so these forms read as the quick sheets do. */
export const EVENT_PRESET_LABEL: Readonly<Record<EventPreset, string>> = PRESET_LABELS;
/** The same spelled out, where every slot holds them (`SlotRow`'s `longLabel`, 2026-10-08). */
export const EVENT_PRESET_LONG_LABEL: Readonly<Record<EventPreset, string>> = PRESET_LONG_LABELS;

/** What a screen reader hears for each. */
export const EVENT_PRESET_SPOKEN: Readonly<Record<EventPreset, string>> = {
  now: 'Now',
  m15: '15 minutes ago',
  m30: '30 minutes ago',
  custom: 'Choose a date and time',
};

export interface EventTime {
  preset: EventPreset;
  /** The instant chosen for 15 / −30m or Custom; null for Now. */
  atMs: number | null;
  /** A slot that is over, while the row is untouched: the entry starts here (`finishedEnd`). */
  anchorMs: number | null;
}

/** A new entry's row as the sheet opens: Now, or the slot's time when opened on a slot that is over. */
export function eventTimeStart(slotAtMs: number | null): EventTime {
  return slotAtMs === null
    ? { preset: 'now', atMs: null, anchorMs: null }
    : { preset: 'custom', atMs: null, anchorMs: slotAtMs };
}

/** An entry being corrected: its own saved instant, and no preset at all. */
export function eventTimeAt(savedMs: number): EventTime {
  return { preset: 'custom', atMs: savedMs, anchorMs: null };
}

const EVENT_OFFSET_MIN = { m15: 15, m30: 30 } as const;

/** A chip tapped: 15 and 30 are placed against the tap. Custom is set by `eventTimePicked`. */
export function eventTimeChosen(preset: Exclude<EventPreset, 'custom'>, tapMs: number): EventTime {
  if (preset === 'now') return { preset, atMs: null, anchorMs: null };
  return { preset, atMs: tapMs - EVENT_OFFSET_MIN[preset] * MIN, anchorMs: null };
}

/** A date and time picked: never later than now (an event that is over cannot be in the future). */
export function eventTimePicked(pickedMs: number, nowMs: number): EventTime {
  return { preset: 'custom', atMs: Math.min(pickedMs, nowMs), anchorMs: null };
}

/**
 * THE INSTANT THE ROW MEANS at `nowMs`: Now is `nowMs`; a chosen instant is itself, never later
 * than now; a row still anchored to a slot is one length after the slot (`finishedEnd`).
 */
export function eventInstant(s: EventTime, nowMs: number, lengthMinutes = 0): number {
  if (s.anchorMs !== null) return finishedEnd(s.anchorMs, s.anchorMs, lengthMinutes, nowMs);
  if (s.preset === 'now' || s.atMs === null) return nowMs;
  return Math.min(s.atMs, nowMs);
}

const monthDay = new Map<string, Intl.DateTimeFormat>();
function monthDayIn(timeZone: string): Intl.DateTimeFormat {
  const hit = monthDay.get(timeZone);
  if (hit) return hit;
  const f = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone });
  monthDay.set(timeZone, f);
  return f;
}

/** `Today`, `Yesterday`, or `Oct 4`, in the household's own days. */
export function dayWord(atMs: number, nowMs: number, timeZone: string): string {
  const day = localDayKey(timeZone, atMs);
  if (day === localDayKey(timeZone, nowMs)) return 'Today';
  if (day === localDayKey(timeZone, nowMs - 24 * 3_600_000)) return 'Yesterday';
  return monthDayIn(timeZone).format(new Date(atMs));
}

/**
 * `Today · 2:28 PM`: the day and the clock, as the row shows them. `explicit` (an edit: the saved
 * entry's own date, never a word relative to now) is always `Oct 5 · 2:28 PM`.
 */
export function dayAndClock(
  atMs: number,
  nowMs: number,
  timeZone: string,
  clock: (ms: number) => string,
  explicit = false,
): string {
  const day = explicit
    ? monthDayIn(timeZone).format(new Date(atMs))
    : dayWord(atMs, nowMs, timeZone);
  return `${day} · ${clock(atMs)}`;
}

/**
 * A RANGE ON ONE LINE: `1:43 PM → 2:28 PM`, and when it crosses a day each end names its own,
 * `Oct 4 · 9:00 PM → Oct 5 · 6:00 AM` — never an overnight range that reads as one afternoon.
 */
export function rangeWords(
  startMs: number,
  endMs: number,
  nowMs: number,
  timeZone: string,
  clock: (ms: number) => string,
): string {
  if (localDayKey(timeZone, startMs) === localDayKey(timeZone, endMs))
    return `${clock(startMs)} → ${clock(endMs)}`;
  const day = (ms: number) => {
    const w = dayWord(ms, nowMs, timeZone);
    return w === 'Today' || w === 'Yesterday' ? monthDayIn(timeZone).format(new Date(ms)) : w;
  };
  return `${day(startMs)} · ${clock(startMs)} → ${day(endMs)} · ${clock(endMs)}`;
}

/* ------------------------------------------------------- an explicit start and end, corrected */

/** A saved sleep (or a timed feed) as two explicit instants: one draft, one source of truth. */
export interface SpanDraft {
  startMs: number;
  endMs: number;
}

/** Whole minutes between the two, the Duration the form shows. */
export const spanMinutes = (d: SpanDraft): number => Math.round((d.endMs - d.startMs) / MIN);

/** The start moved: the end stays, and the Duration is what they now say. */
export const withStart = (d: SpanDraft, startMs: number): SpanDraft => ({ ...d, startMs });

/** The end moved: the start stays, and the Duration is what they now say. */
export const withEnd = (d: SpanDraft, endMs: number): SpanDraft => ({ ...d, endMs });

/** The Duration moved: the end stays where it is and the start moves (the logging form's model). */
export const withMinutes = (d: SpanDraft, minutes: number): SpanDraft => ({
  ...d,
  startMs: d.endMs - Math.max(0, Math.round(minutes)) * MIN,
});

/** Only a span that ends after it starts can be saved. */
export const spanValid = (d: SpanDraft): boolean => d.endMs > d.startMs;
