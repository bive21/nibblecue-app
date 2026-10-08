/**
 * WHAT "SCHEDULE FROM YOUR LOG" SAYS.
 *
 * Every line here is one of three things: the household's own times, how many days or gaps those
 * times came from, and what the routine says now. None has a baby as its subject, and none calls
 * a time early or late, a gap long or short, or a week good or better — the coach's rule
 * (`coach/copy.ts`), held by `fromLog.test.ts` against `BANNED` and the same list of comparisons,
 * and by `labels.test.ts`, which reads every string in this folder.
 *
 * THE LEDE SAYS WHAT IT IS BEFORE THE FIRST ROW, for the reason the coach's does: a page that
 * proposes feed times in a baby app is one misreading from looking like advice, so it says it is
 * the household's own week before it says anything else.
 */
import { foresightGap } from './foresight.copy';
import type { FromLogActivity, FromLogClock, FromLogRhythm, FromLogShape } from './fromLog';

export const FROM_LOG_TITLE = 'Schedule from your log';
export const FROM_LOG_LEDE =
  'Your last 7 days of entries, laid out as a schedule. It is your own week, not advice, and ' +
  'nothing changes until you choose it.';

export const FROM_LOG_NOUN: Readonly<Record<FromLogActivity, string>> = {
  feeding: 'Feeding',
  pump: 'Pumping',
  solids: 'Solids',
};
export const FROM_LOG_DAY = 'Your day';
export const FROM_LOG_NAPS = 'Naps';
export const FROM_LOG_NIGHTS = 'Nights';
/**
 * What the routine is set to. "Now" on its own read as this moment (the owner, 2026-10-03).
 * "Suggestion" was the other name considered for the week, and it is the wrong one: this page
 * hands the household's own times back, and a suggestion would sound like advice.
 */
export const FROM_LOG_NOW = 'Set now';
export const FROM_LOG_SAME = 'Already the same';

/** A withheld number on the locked page: a dash the width of a time, never an empty space. */
export const FROM_LOG_HIDDEN = '––:––';

/** "7:00 AM · 10:05 AM · 1:10 PM" or "Every 3h 05m" — the proposal, on the household's clock. */
export function fromLogShape(shape: FromLogShape, clock: (hhmm: string) => string): string {
  switch (shape.kind) {
    case 'times':
      return `${shape.times.map(clock).join(' · ')}${shape.weekdays ? ' · weekdays' : ''}`;
    case 'every':
      return `Every ${foresightGap(shape.everyMinutes * 60_000)}`;
    case 'none':
      return 'Stays as it is';
  }
}

/** The same line with the numbers taken out, for the locked page: the shape, never a blank. */
export function fromLogShapeLocked(shape: FromLogShape): string {
  switch (shape.kind) {
    case 'times':
      return `${shape.times.map(() => FROM_LOG_HIDDEN).join(' · ')}${shape.weekdays ? ' · weekdays' : ''}`;
    case 'every':
      return 'Every –h ––m';
    case 'none':
      return 'Stays as it is';
  }
}

/**
 * What a proposal rests on, with its count — always drawn beside it, never behind a tap. `night`
 * is whether the row sets its night too (`diff.ts` `nightProposal`), and then the night's count
 * is beside it as well.
 */
export function fromLogEvidence(r: FromLogRhythm, night = false): string {
  switch (r.shape.kind) {
    case 'times':
      return `Each came within 45 minutes on at least ${r.samples} of the ${r.ofDays} ${
        r.shape.weekdays ? 'weekdays' : 'days'
      }`;
    case 'every':
      return `The middle of ${r.samples} gaps between entries in the day${
        night && r.night !== null ? `, and of ${r.night.gaps} at night` : ''
      }`;
    case 'none':
      return r.shape.reason === 'fewEntries'
        ? `Logged in the day on ${r.days} of the ${r.ofDays} days so far`
        : 'No clock time or gap held steady across the week';
  }
}

/** "6:45 AM – 7:45 PM". */
export const fromLogDayLine = (wake: string, bed: string): string => `${wake} – ${bed}`;

/** The nights' count, for whichever of the two ends the log says. */
export function fromLogDayEvidence(wake: FromLogClock, bed: FromLogClock): string {
  if (wake.at !== null && bed.at !== null) {
    return `Within 45 minutes on ${wake.days} of the 7 mornings and ${bed.days} of the 7 evenings`;
  }
  if (bed.at !== null) return `Bedtime within 45 minutes on ${bed.days} of the 7 evenings`;
  if (wake.at !== null) return `Waking within 45 minutes on ${wake.days} of the 7 mornings`;
  return 'Your nights did not come back to one time steadily';
}

export const FROM_LOG_NAPS_LINE =
  'Not set here. The nap outlook on Today follows each wake-up, which a clock time cannot.';
/**
 * THE NIGHTS, AS A TAP LEAVES THEM. On demand, unless a rhythm already runs a night interval of its
 * own: that one follows the week's own nights (`follows`, the owner, 2026-09-29), and nothing else
 * is started between bedtime and the morning.
 */
export const fromLogNightsLine = (bed: string, wake: string, follows = false): string =>
  follows
    ? `Between ${bed} and ${wake}, a night rhythm you set yourself follows your own nights. Nothing else is set.`
    : `On demand: nothing here is set between ${bed} and ${wake}.`;
export const FROM_LOG_LEFT_ALONE =
  'Medicines, diapers, bath, tummy time and vaccines stay as they are.';

export const fromLogBuiltFrom = (entries: number, days: number): string =>
  `${entries} ${entries === 1 ? 'entry' : 'entries'} on ${days} of the last 7 days`;

/**
 * What the last 7 days came back to. When the week would change the row, this label and
 * the time sit in a tinted band under Set now. The count of days or gaps sits under that
 * band, and a row that stays as it is has no band (the owner, 2026-10-03).
 */
export const FROM_LOG_FROM = 'From your week';
export const FROM_LOG_HOW = 'How this is worked out';
export const FROM_LOG_USE = 'Use this schedule';
export const FROM_LOG_NOT_NOW = 'Not now';
export const FROM_LOG_APPLIED = 'Schedule set from your log';
export const FROM_LOG_UNDONE = 'Back to the schedule you had';
export const FROM_LOG_FAILED = 'The routine could not be changed just now, so nothing was.';
export const FROM_LOG_UNDO_PARTIAL =
  'Some of it could not be put back. Manage shows what is set now.';
export const FROM_LOG_NOT_READY_BODY =
  'Once there is a week of entries, this lays your own times out as a schedule you can take or leave.';
export const FROM_LOG_NO_CHANGES = 'Your routine already matches your last 7 days.';
export const FROM_LOG_NOTHING_STEADY =
  'Nothing in your last 7 days came back to set times or a steady gap, so nothing here would change.';
export const FROM_LOG_PICK_CHILD =
  'Choose one child at the top to lay out a schedule from their own entries.';
/** The same, as a row's detail line. */
export const FROM_LOG_PICK_CHILD_SHORT = 'Choose one child at the top';

/** Before a week of entries: how long, and nothing else. */
export const fromLogToGo = (days: number): string =>
  `${days} more day${days === 1 ? '' : 's'} of entries and this can lay out your week as a schedule.`;

/* ------------------------------------------------------------------ the offer and the door */

export const FROM_LOG_OFFER_TITLE = 'Your week, as a schedule';
/**
 * The Schedule card's one line (the owner, 2026-10-03). The sentence of every change
 * (`fromLogOfferBody`) was too long to invite a tap, and "recommended" is not a word this
 * page may use: the rhythm is the household's own week, shown back.
 */
export const FROM_LOG_OFFER_INVITE =
  'See the rhythm your week shows. Nothing changes until you choose it.';
/** The offer's clause for a day that would move. */
export const FROM_LOG_OFFER_DAY = 'your day';
/**
 * One clause per change, lower-case, for the offer's single sentence. `night` is the night
 * interval the change would also write (`diff.ts` `nightProposal`), when it would.
 */
export function fromLogOfferPart(r: FromLogRhythm, night: number | null = null): string | null {
  const noun = FROM_LOG_NOUN[r.activity].toLowerCase();
  switch (r.shape.kind) {
    case 'times':
      return `${noun} at ${r.shape.times.length} set time${r.shape.times.length === 1 ? '' : 's'}`;
    case 'every':
      return `${noun} every ${foresightGap(r.shape.everyMinutes * 60_000)}${
        night === null ? '' : `, ${foresightGap(night * 60_000)} at night`
      }`;
    case 'none':
      return null;
  }
}
/** "Feeding at 5 set times and pumping every 3h 30m, from your last 7 days. …" */
export function fromLogOfferBody(parts: readonly string[]): string {
  const shown = parts.slice(0, 2);
  const more = parts.length - shown.length;
  const list =
    shown.length === 2 && more === 0
      ? `${shown[0]} and ${shown[1]}`
      : `${shown.join(', ')}${more > 0 ? ` and ${more} more` : ''}`;
  const lead = list.length > 0 ? list.charAt(0).toUpperCase() + list.slice(1) : 'Your own times';
  return `${lead}, from your last 7 days. Nothing changes until you choose it.`;
}
/**
 * The offer card's line on a plan without it. It ended "It is part of Plus." beside the card's own
 * locked "Plus" chip, which says so already (2026-09-29, the owner of a badge and a sentence saying
 * the same thing: "this is repetitive").
 */
export const FROM_LOG_OFFER_LOCKED =
  'Your last 7 days are enough to lay out a schedule from your own times.';
/**
 * Under the page's locked "Use this schedule": only why it is locked. The offer's whole sentence
 * stood here and said the page's own lede again, one screen apart.
 */
export const FROM_LOG_USE_LOCKED = 'Using it is part of Plus.';
export const FROM_LOG_OFFER_CTA = 'See it';
export const FROM_LOG_OFFER_HIDDEN = 'Hidden for two weeks. It is in Manage whenever you want it.';

/**
 * The Routine page's row: what it is, and where it stands. `steady` is whether anything in the
 * week settled enough to propose — a routine cannot "match" a week that said nothing.
 */
export function fromLogRoutineDetail(
  ready: boolean,
  daysToGo: number,
  changes: number,
  steady = true,
): string {
  if (!ready) return `${daysToGo} more day${daysToGo === 1 ? '' : 's'} of entries`;
  if (!steady) return 'Nothing steady enough to set yet';
  if (changes === 0) return 'Your routine matches your last 7 days';
  return `${changes} change${changes === 1 ? '' : 's'} from your last 7 days`;
}

/**
 * HOW IT IS WORKED OUT, in the page's own words. Every boundary here is one the app chose and the
 * household did not — the argument `naps.copy.ts` and the coach make for printing their own.
 */
export const FROM_LOG_METHOD =
  'Read from the 7 days before today, on your household’s clock. A time goes in when your ' +
  'entries came within 45 minutes of it on at least 5 of the 7 days, or 4 of the 5 weekdays ' +
  'for something you only log on weekdays. An every-so-often rhythm goes in when there are at ' +
  'least 6 gaps between entries in the day and the middle half of them sit within a third of the ' +
  'usual gap; when both would fit, it takes whichever was closer to your own entries that week. ' +
  'Two entries within 30 minutes count once. Your day runs from the waking to the bedtime your ' +
  'nights came back to, and moving it moves the night on your other rhythms too, as in Manage. ' +
  'A night you already set to every few hours takes the middle of your gaps that began between ' +
  'bedtime and an hour before waking, once there are 6 of them on at least 5 of the 7 nights. ' +
  'Every other night stays on demand, naps follow the nap outlook, and medicines, diapers, bath, ' +
  'tummy time and vaccines are left alone. Nothing here reads your baby, only your own entries.';
