/**
 * What a schedule reminder says (docs/NOTIFICATIONS.md §9): a time and an activity, never a
 * judgment about intake, sleep or supply. The child's name appears only when the household has
 * more than one active child.
 *
 * IN CORE SO THE PHONE AND THE SERVER SAY THE SAME WORDS (2026-09-24). The phone's local reminder
 * and the server's push for the same slot (`supabase/functions/_shared/push.ts`) are one
 * notification to the parent — the push even takes the local one's place in the shade — so they
 * are written by one function. `apps/mobile/src/notifications/copy.ts` re-exports it, and its
 * test holds every sentence to the banned list.
 *
 * WORDS THAT READ TRUE EARLY, ON TIME OR A LITTLE LATE (2026-09-28). A reminder rings five minutes
 * before its slot now (the owner: *"when up next is coming (5 minutes before)"*, core
 * `COMING_UP_LEAD_MS`), but the same words also arrive at the slot's own time (a slot the phone
 * heard of less than five minutes before it, a server push, a snooze) and a little after it (an
 * Android alarm the phone let slip). So a title names the thing and the slot's clock time,
 * "Feeding at 1:00 PM", and never counts down to it: "in 5 minutes" is false in two of those three,
 * and "due" said five minutes early reads as now. The clock the title carries is dropped from the
 * body it used to end, rather than said twice. Where the old words already read true at any of
 * those moments (a medicine's "Daily 8:00 AM reminder", a cadence's "6:30 PM · today") they stand.
 */
import { MODULES } from '../modules/module-registry';
import { intervalLabel, ruleLabel } from './labels';
import type { Occurrence, Rule } from './types';

export interface ReminderFormat {
  clock: (ms: number) => string;
  /** `5 oz` in the viewer's unit, or null for no target. */
  quantity: (ml: number | null) => string | null;
  childName: (childId: string | null) => string | null;
  multiChild: boolean;
  /**
   * WHEN THIS RULE'S KIND WAS LAST LOGGED, and whose it was (2026-10-08; the owner: "on your
   * routine is useless … it can say … 'Ada slept at 8:36 PM yesterday'"): the phone's own log, or
   * `null` for nothing logged yet. Absent where the log is not at hand (the server's push), and the
   * body then says what it always said.
   */
  lastOf?: (rule: Rule) => { atMs: number; who: string | null } | null;
  /** `today`, `yesterday`, or `on Sun`: the day of `ms`, as the plan's clock reads it. */
  dayOf?: (ms: number) => string;
}

const label = (activity: string): string => MODULES.find(m => m.id === activity)?.label ?? activity;
/**
 * The rule's own word: its name when it has one, "Feeding" for any feeding rule (a set time on
 * the feeding card is written on the bottle side and answered by either kind of feed, so
 * "Bottle due" would name the wrong thing), else the module's — the same `ruleLabel` the day
 * list and Up next use, so a reminder never says a word the screen does not.
 */
const nameOf = (r: Rule): string => ruleLabel(r, label(r.activity));

/** A relative slot is named for what it is: a sleep after waking is a nap window, else the module. */
const relativeName = (r: Rule): string =>
  r.activity === 'sleep' ? 'Nap window' : label(r.activity);

export interface ReminderCopy {
  title: string;
  body: string;
}

/** "Feeding at 1:00 PM", "Feeding at 1:00 PM · Emma": the thing and the slot's own clock time. */
const titleAt = (o: Occurrence, fmt: ReminderFormat, name: string): string => {
  const who = fmt.multiChild ? fmt.childName(o.rule.childId) : null;
  return `${name} at ${fmt.clock(o.atMs)}${who ? ` · ${who}` : ''}`;
};

export function reminderCopy(o: Occurrence, fmt: ReminderFormat): ReminderCopy {
  const r = o.rule;
  const who = fmt.multiChild ? fmt.childName(r.childId) : null;
  const suffix = who ? ` · ${who}` : '';
  switch (r.ruleType) {
    case 'INTERVAL':
      return {
        title: titleAt(o, fmt, nameOf(r)),
        body: `${intervalLabel(r.everyMinutes ?? 0)} from your last session`,
      };
    case 'RELATIVE': {
      const what =
        r.relativeTo === 'BEDTIME'
          ? 'before bedtime'
          : r.relativeTo === 'LAST_FEED'
            ? 'after the last feed'
            : 'after wake';
      return {
        title: titleAt(o, fmt, relativeName(r)),
        body: `About ${intervalLabel(Math.abs(r.offsetMinutes ?? 0))} ${what}`,
      };
    }
    case 'CADENCE':
      return {
        title: `${nameOf(r)}${suffix}`,
        body: `${fmt.clock(o.atMs)} · today`,
      };
    case 'FIXED': {
      if (r.activity === 'med') {
        return {
          title: `${nameOf(r)}${suffix}`,
          body: `Daily ${fmt.clock(o.atMs)} reminder`,
        };
      }
      const target = fmt.quantity(r.targetQuantity);
      return {
        title: titleAt(o, fmt, nameOf(r)),
        // the clock is in the title; with no target, the body is the last one logged, from the log
        body: target ? `Target ${target}` : (lastLoggedLine(r, fmt) ?? 'On your routine'),
      };
    }
  }
}

/** The kind's word for "nothing logged yet". */
const KIND_WORD: Record<string, string> = {
  sleep: 'sleep',
  solids: 'solids',
  bottle: 'feed',
  breastfeed: 'feed',
  bath: 'bath',
  pump: 'pumping',
};

/**
 * THE LAST ONE, FROM THE LOG, for a set time with no target: "Ada slept at 8:36 PM yesterday",
 * "Ada last had solids at 11:40 AM today", "Last pump at 7:10 AM today". A fact about the log and
 * when, never what the baby needs or should do. Null where the log is not at hand.
 */
export function lastLoggedLine(r: Rule, fmt: ReminderFormat): string | null {
  if (fmt.lastOf === undefined) return null;
  const last = fmt.lastOf(r);
  const word = KIND_WORD[r.activity] ?? label(r.activity).toLowerCase();
  if (last === null) return `No ${word} logged yet`;
  const when = `${fmt.clock(last.atMs)} ${fmt.dayOf?.(last.atMs) ?? ''}`.trim();
  const who = last.who;
  switch (r.activity) {
    case 'sleep':
      return who ? `${who} slept at ${when}` : `Last sleep at ${when}`;
    case 'solids':
      return who ? `${who} last had solids at ${when}` : `Last solids at ${when}`;
    case 'bottle':
    case 'breastfeed':
      return who ? `${who} last fed at ${when}` : `Last feed at ${when}`;
    case 'bath':
      return who ? `${who}’s last bath was at ${when}` : `Last bath at ${when}`;
    case 'pump':
      return `Last pump at ${when}`;
    default:
      return `Last ${word} at ${when}`;
  }
}

/**
 * "NOT LOGGED YET?" — THE ONE FOLLOW-UP A PHONE MAY RING FOR AN OPEN SLOT (2026-09-28), fifteen
 * minutes after its time, for a feed, a medicine or a pump (`apps/mobile/src/notifications/plan.ts`
 * decides when, and whether at all).
 *
 * IT ASKS, IT DOES NOT CLAIM. The slot is open on this phone, which is not the same as nobody having
 * done it: a partner's entry may not have reached this phone yet. So the sentence is a question about
 * the LOG and a way to answer it, never a statement that something was not done, and nothing about
 * the baby. The title is the slot's own, the thing and its clock time, so it reads as the same slot
 * the reminder named (a medicine's name included, which its reminder carries without a clock).
 */
export function notLoggedYetCopy(o: Occurrence, fmt: ReminderFormat): ReminderCopy {
  const r = o.rule;
  return {
    title: titleAt(o, fmt, r.ruleType === 'RELATIVE' ? relativeName(r) : nameOf(r)),
    body: 'Not logged yet? Tap Log it once it’s done.',
  };
}
