/**
 * What the module sheets say (PRODUCT_SPEC.md §6, §16).
 *
 * Copy lives in one file per feature in this app so it can be scanned, and this is the file
 * where the scan matters most: three of these strings are the product's medical-safety
 * promises, written where a parent will actually read them rather than buried in a policy.
 *
 *   * **Medicine** — the app never calculates or suggests a dose. Not with a disclaimer, not
 *     behind a toggle (CLAUDE.md rule 4).
 *   * **Temperature** — recorded as measured. No threshold, no color, no "fever" (§6.8).
 *   * **Solids** — reactions are recorded verbatim. No allergy assessment (§6.6).
 *
 * `copy.test.ts` scans every string here against `BANNED_CLINICAL`. That list is exported
 * rather than written into the test so the rule and its enforcement cannot drift apart, and
 * the test proves the scan catches a sentence that breaks it.
 *
 * Voice: sentence case, plain, US English, never clinical. The reader is a parent at 3 a.m.
 */

import {
  lengthLabel,
  sideMinutes,
  weightLabel,
  type LengthUnit,
  type WeightUnit,
} from '@nibblecue/core';
import {
  agoLabel,
  agoLongLabel,
  agoSpoken,
  CUSTOM_LABEL,
  NOW_LABEL,
} from '@nibblecue/ui/timePresets';

/** The hint under a sheet's fields. Verbatim from the spec where the spec gives words. */
export const HINTS = {
  /** §6.7. The single most important sentence in the app. */
  med: 'Only what you enter is recorded. The app never calculates or suggests a dose.',
  /** §6.8. */
  temp: 'Recorded as measured, with no interpretation.',
  /**
   * §6.9. The same promise as `temp`, and for the same reason: a percentile is a comparison
   * to a population, and reading one out is a clinical judgment (CLAUDE.md rules 1 and 3).
   * Reports draw the household's own measurements over time, which is arithmetic on entries.
   */
  growth: 'Recorded as you measured it. No percentile, no curve and no comparison.',
  /* §6.6's promise lives with the solids sheet now (`FOOD_LINES.hint`): the owner asked for the
     word "Reactions" to go (2026-09-24), and the sheet was the only thing that read this. */
  /** §6.1, the stash row. */
  stash: 'Oldest first',
} as const;

/**
 * Words and phrases no string in a logging sheet may contain.
 *
 * Two families. The first would make the app interpret a measurement — a fever label, a
 * judgement about an amount, an assessment of a reaction. The second would make it advise:
 * a dose, a recommendation, a schedule the app invented. Either one crosses the line the
 * brief draws in §3 and CLAUDE.md draws in rules 1 through 5.
 */
export const BANNED_CLINICAL = [
  'fever',
  'normal range',
  'too much',
  'too little',
  'not enough',
  'recommended dose',
  'recommended amount',
  'suggested dose',
  'should take',
  'should have',
  'you should',
  'we recommend',
  'healthy',
  'unhealthy',
  'concerning',
  'abnormal',
  'diagnos',
  'allergic to',
  'per kg',
  'by weight',
] as const;

/**
 * THE DIAPER COLOR CHIPS, in their order and their words — the values `diaper_details.color`
 * holds. One list for the diaper sheet and the entry editor, so a chip added to one cannot be
 * missing from the other (it was two copies held equal by a test that read the sheet's source).
 */
export const DIAPER_COLORS = ['Yellow', 'Green', 'Brown', 'Black', 'Red'] as const;

/** The diaper kinds as a parent reads them (§6.4). */
export const DIAPER_LABEL = {
  WET: 'Wet',
  DIRTY: 'Dirty',
  BOTH: 'Wet + dirty',
  DRY: 'Dry',
} as const;

/** The bottle kinds a sheet offers. MIXED and OTHER are edit-only (§6.1). */
export const BOTTLE_KIND_LABEL = {
  EBM: 'Breast milk',
  FORMULA: 'Formula',
  WATER: 'Water',
  MIXED: 'Mixed',
  OTHER: 'Other',
} as const;

/** Which bottle kinds the NEW-entry sheet shows; the other two are reachable only from an edit. */
export const BOTTLE_KINDS_ON_SHEET = ['EBM', 'FORMULA', 'WATER'] as const;

/** `Saved: bath at 6:40 PM` (§6.10). `clock` is already formatted by the caller. */
export const savedAt = (what: string, clock: string): string => `Saved: ${what} at ${clock}`;

/** `Saved: wet + dirty diaper at 1:02 PM` (§6.4). */
export const savedDiaper = (kind: keyof typeof DIAPER_LABEL, clock: string): string =>
  savedAt(`${DIAPER_LABEL[kind].toLowerCase()} diaper`, clock);

/**
 * THE DIAPER'S ONE SAVE (the owner's Option 2 board, 2026-10-05: "Save diaper"). From 2026-09-15 it
 * named the kind — `Save wet diaper` — because the one-tap tiles read as a choice a new parent had
 * not finished; the kind is now its own checked tile right above, so the button says the sheet's
 * one action and the toast still names the kind (`savedDiaper`).
 */
export const SAVE_DIAPER = 'Save diaper';
export const DIAPER_QUESTION = 'What was in the diaper?';

/**
 * THE KINDS AS THE DIAPER SHEET'S PICTURE WRITES THEM (the owner, 2026-09-26: "wet, dirt, both, and
 * dry"): one short word each, along the pill a small diaper hops across (`DiaperToggle`). Only Both
 * is new — "Wet + dirty" does not fit a quarter of a phone's width beside a diaper, and "Both" is
 * what the spec's own choice has always said (PRODUCT_SPEC.md §6.4). What is SAVED and read back is
 * unchanged: the Save button, the toast and every log line still say `DIAPER_LABEL`'s "Wet + dirty".
 */
export const DIAPER_KIND_WORD = { ...DIAPER_LABEL, BOTH: 'Both' } as const;
/**
 * What a screen reader says for each: the word — first, so "Both" is still a name a parent can say
 * to voice control — and, for Both, what it means.
 */
export const DIAPER_KIND_NAME = { ...DIAPER_KIND_WORD, BOTH: 'Both, wet and dirty' } as const;

export const RASH_NOTED = 'Rash noted';

/**
 * The breastfeed's completed and edit forms (the owner's Option 2, 2026-10-05). A start worked back
 * from the minutes of a feed typed in after the fact is said as approximate; a timed feed's is not.
 */
export const FEED_FORM = {
  endedAt: 'Ended at',
  started: 'Started',
  ended: 'Ended',
  firstSide: 'First side',
  approx: (range: string): string => `Approx. start ${range}`,
  endBeforeStart: 'Ended has to be after started.',
} as const;

/** The sleep's completed and edit forms (the owner's Option 2, 2026-10-05). */
export const SLEEP_FORM = {
  kind: 'Nap or night',
  fellAsleep: 'Fell asleep',
  wokeUp: 'Woke up',
  duration: 'Duration',
  /** `Sleep time · 1:43 PM → 2:28 PM`: both ends, and never the length a second time. */
  range: (range: string): string => `Sleep time · ${range}`,
  endBeforeStart: 'Woke up has to be after fell asleep.',
} as const;

/**
 * THE DIAPER'S OPTIONAL DETAILS, FOLDED (the owner's Option 2, 2026-10-05): one row, "Color, rash &
 * note", that opens onto three compact rows. Collapsed on an edit, it says what was saved, "Brown ·
 * Rash noted · Note added", so a folded detail is never read as an empty one.
 */
export const DIAPER_OPTIONAL = {
  title: 'Color, rash & note',
  color: 'Stool color',
  noColor: 'None',
  note: 'Note',
  noteAdded: 'Note added',
  addNote: 'Add',
  summary: (color: string | null, rash: boolean, note: boolean): string | null => {
    const parts = [color, rash ? RASH_NOTED : null, note ? 'Note added' : null].filter(
      (p): p is string => p !== null,
    );
    return parts.length === 0 ? null : parts.join(' · ');
  },
} as const;

/** The same fact as `RASH_NOTED`, worded for the tail of a row that already names the kind. */
export const RASH_NOTED_TAIL = 'rash noted';

/**
 * A log row's detail line for a diaper: what was in it, and the rash tick when it was set —
 * `Wet · rash noted`.
 *
 * The switch has been saved since the first release and nothing read it back, so the activity log
 * showed `Wet` for an entry where the parent had explicitly written down a rash (the owner,
 * 2026-09-19: "where should it be shown on for user to look back?"). It lives here, beside
 * `DIAPER_LABEL`, rather than in `screens/today/rows.ts`, so the wording is one exported string a
 * test can hold — and it repeats the tick, nothing else: no severity, no site, no reading of it.
 */
export const diaperDetailLine = (
  kindLabel: string | undefined,
  rash: boolean,
): string | undefined => {
  const parts = [kindLabel, rash ? RASH_NOTED_TAIL : undefined].filter(
    (part): part is string => part !== undefined && part !== '',
  );
  return parts.length === 0 ? undefined : parts.join(' · ');
};

/* ---------- the timer sheets: two ways in (§6.2, §6.3, §6.5, §6.10; DESIGN_SYSTEM §15) ---------- */

/**
 * Every timed module offers the same pair of path tiles — time it live, or enter one already
 * done — and nothing below them asks for input until one is chosen (the owner, 2026-09-15:
 * "you basically just pick one at a time"; §15.1 says why a form under a Start button reads
 * as the rest of the page).
 *
 * NOTHING IS WRITTEN UNDER THE PAIR (the owner, 2026-09-26: remove "Two ways in: time it live,
 * or enter one you have already done." — the two cards already say both ways, each in its own
 * words, and a line repeating them was the longest thing on four sheets).
 *
 * AND NOTHING UNDER EITHER TITLE (the owner, the same day: *"remove the description text 'time
 * each side, even locked' … for all module, this is pretty self explanatory and not needed"*). Each
 * route is its title and its glyph — a play mark, a clock (`PathCard`); the consequence lines are
 * gone from every module, and a screen reader hears the title alone.
 */
export const TIMER_PATH = {
  pump: { start: { title: 'Start pumping' }, manual: { title: 'Already finished' } },
  breastfeed: { start: { title: 'Start feeding' }, manual: { title: 'Already finished' } },
  sleep: { start: { title: 'Start sleeping' }, manual: { title: 'Already finished' } },
  tummy: { start: { title: 'Start tummy time' }, manual: { title: 'Already finished' } },
} as const;
/** The live path's title in the household's own word: "Start tummy time", "Start playtime". */
export const startTimerTitle = (word: string): string => `Start ${word}`;

/**
 * THE DAILY GOAL, ON THE SHEET THAT LOGS TOWARD IT (the owner, 2026-09-19: "When clicking tummy
 * time module add the ability to set how many tummy time minutes in a day as target"). The chips
 * are the same row the Schedule tab offers and write the same setting; the line over them is the
 * day so far. Nothing here says how much a baby should get: the number is the household's, and
 * the bar only ever shows their own minutes over it (CLAUDE.md §2).
 */
export const GOAL_SHEET = {
  header: 'Daily goal',
  /** Under the header while nothing is chosen — an invitation, not a default. */
  none: 'Pick a goal and the card on Today shows how far the day has come.',
  /** The row the goal's chips open from (2026-09-29): set once, changed rarely, so out of the way. */
  change: 'Change daily goal',
  set: 'Set a daily goal',
  /** The day's entries, reachable by the row or by dragging the sheet up. */
  history: (n: number): string => `Today’s entries · ${n}`,
  historyEmpty: 'Nothing logged yet today.',
  /** One entry: when it started and how long it ran. */
  entry: (clock: string, duration: string): string => `${clock} · ${duration}`,
} as const;

/**
 * WHEN A TIMER STARTED, ON EVERY TIMER (the owner, 2026-09-29: *"we had starting time confirmation
 * when starting sleeping, pumping, and tummytime/playtime. This was removed, but the feedback says
 * that this is helpful. especially since there were distractions, so when start activity, user can
 * easily choose what the start time was"*; `startWhen.ts` has the rules and the history).
 *
 * IT GREW OUT OF SLEEP'S OWN (the owner, 2026-09-18: *"no option to schedule ongoing sleep … i dont
 * want to add a third option as that makes it too much"*). They were right that the case is the
 * ordinary one, a parent who put the baby down forty minutes ago and only now has a hand free, and
 * that it is not a third kind of anything: it is the SAME live timer with an earlier start. Sleep's
 * answer was one chip, "Started · Now", that opened the clock wheel. The answer now is the
 * same row on all four timers — `Now · −5m · −10m · Custom` over the Start, and
 * the same chips on one line under the two path tiles (`shortcut`) — so a parent who has used it
 * once knows it everywhere, and "ten minutes ago" is one tap rather than a wheel to turn.
 *
 * EVERY SENTENCE HERE IS ABOUT THE TIMER, never the baby: when it started, how long it has run, and
 * what the app did with a start it could not take. `copy.test.ts` scans them with the rest.
 */
export const TIMER_START = {
  /** The eyebrow over the row: what its time is, as every time row names its own. */
  label: 'Started',
  /**
   * The chips, in their order (`START_CHOICES`), in the app's one set of time words
   * (`timePresets.ts`, the owner, 2026-10-06: "make it uniform in the whole app"): it was
   * `Now · −5m · −10m · Custom`. `Custom` still opens the wheel.
   */
  choice: {
    now: NOW_LABEL,
    m5: agoLabel(5),
    m15: agoLabel(15),
    m30: agoLabel(30),
    earlier: CUSTOM_LABEL,
  },
  /**
   * The same chips spelled out, `−5 min · −15 min · −30 min`, drawn wherever every slot holds them
   * with room to spare (the owner, 2026-10-08: "when there is clear space for the text, show -5
   * min, -15 min, -30 min, and custom instead. Keep it short if it does not fit"; `SlotRow`).
   */
  choiceLong: {
    now: NOW_LABEL,
    m5: agoLongLabel(5),
    m15: agoLongLabel(15),
    m30: agoLongLabel(30),
    earlier: CUSTOM_LABEL,
  },
  /** What a screen reader hears for each: whole words, and what `Custom` does. */
  spoken: {
    now: 'Now',
    m5: agoSpoken(5),
    m15: agoSpoken(15),
    m30: agoSpoken(30),
    earlier: 'Custom, choose the time',
  },
  /** The line under the two path tiles: the way in to a start that is already under way. */
  shortcut: 'Started earlier?',
  /**
   * THE START SAYS WHAT IT WILL DO, because the two are different acts: `Start sleep`, `Start
   * sleep from 9:31 PM`, `Start pumping from 9:31 PM`, `Start left from 9:31 PM`.
   */
  button: (verb: string, clock: string | null): string =>
    clock === null ? `Start ${verb}` : `Start ${verb} from ${clock}`,
  /** The consequence, in words, before the tap: never a surprise on the timer card. */
  already: (state: string, duration: string): string =>
    `${state} ${duration} already. The timer counts from then.`,
  /**
   * A START HELD AT THE END OF THE LAST ENTRY OF ITS KIND (`startWhen.ts`), said before the tap:
   * `The last sleep ended at 9:35 PM, so the timer counts from then.` With two babies or more the
   * sentence names the one it is about, twice rather than with a pronoun the app cannot know.
   */
  held: (what: string, clock: string, name: string | null): string =>
    name === null
      ? `The last ${what} ended at ${clock}, so the timer counts from then.`
      : `${name}’s last ${what} ended at ${clock}, so ${name}’s timer counts from then.`,
  /**
   * UNDER "STARTED EARLIER?" WHEN A CHIP IS FADED because its start would fall inside the last
   * entry of the kind (`shortcutHeld`, 2026-10-08): `The last pump session ended at 9:35 PM, so a
   * start can’t be earlier than that.` With several babies the earliest of their ends is the one said.
   */
  heldShortcut: (what: string, clock: string, several: boolean): string =>
    several
      ? `Each baby’s last ${what} ended at ${clock} or later, so a start can’t be earlier than that.`
      : `The last ${what} ended at ${clock}, so a start can’t be earlier than that.`,
  /** A time further back than the earlier-start limit, refused, and the way that fits it. */
  tooEarly: (limit: string): string =>
    `That is more than ${limit} ago. If it has ended, use Already finished.`,
  /**
   * THE CONFIRMATION, FOR A START WHOSE TIME WAS NOT ON THE SCREEN BEFORE THE TAP: a Start tile that
   * starts on the tap (pumping, tummy time) and a CueCoin. `Pumping started at 9:41 PM`, with the
   * babies named when the household has more than one: `Sleep started at 9:41 PM for Emma`.
   */
  started: (noun: string, clock: string, names: readonly string[]): string =>
    names.length === 0
      ? `${noun} started at ${clock}`
      : `${noun} started at ${clock} for ${namesAnd(names)}`,
  /**
   * THE TOAST'S ACTION: UNDO (the owner, 2026-10-06: "once clicked, and it brings to main menu,
   * show the option to undo, which if user misclicks, they can easily remove it"). It was Change,
   * which opened the timer's sheet; a start is one tap now, so the way back is one tap too.
   */
  undo: 'Undo',
  /** What the toast says once Undo has taken the start back. */
  undone: (noun: string): string => `${noun} removed`,
} as const;

/**
 * EACH TIMER'S OWN WORDS IN THE START ROW: the verb its Start button carries ("Start pumping"), the
 * state its consequence line opens with ("Pumping 10m already"), what its last entry is called
 * ("the last pump session") and its name in the confirmation ("Pumping started at 9:41 PM"). Tummy
 * time takes the household's word, "Playtime" once it has graduated (`useModuleLabels`).
 */
export interface StartWords {
  verb: string;
  state: string;
  what: string;
  noun: string;
}

export function startWordsFor(
  type: keyof typeof TIMER_WORD,
  tummy: { label: string; word: string },
): StartWords {
  switch (type) {
    case 'sleep':
      return { verb: 'sleep', state: 'Asleep', what: 'sleep', noun: 'Sleep' };
    case 'pump':
      return { verb: 'pumping', state: 'Pumping', what: 'pump session', noun: 'Pumping' };
    case 'breastfeed':
      return { verb: 'feeding', state: 'Feeding', what: 'feed', noun: 'Feeding' };
    case 'tummy':
      return { verb: tummy.word, state: tummy.label, what: tummy.word, noun: tummy.label };
  }
}

/**
 * THE MANUAL SLEEP'S OWN TWO ENDS, WRITTEN OUT (the owner, 2026-09-22: *"if i select already
 * finish when it starts 30m in ago, how can the sleeping duration be more than date? that means
 * it happens in the future"*).
 *
 * It does not: the time row on this path is when the baby WOKE, and the length counts backwards
 * from it, so a 90-minute sleep that ended half an hour ago began two hours ago. But the sheet
 * showed one time and one number and left the parent to work out which way the arrow pointed —
 * and the one they arrived at was the wrong one, which makes it the sheet's fault. Both ends on
 * one line, under the stepper that changes them, and there is nothing left to infer.
 *
 * AND THE LENGTH ON THE SAME LINE (the owner, 2026-09-25: "One compact confirmation line / 8:47 PM
 * → 9:22 PM · 35 min asleep"): the whole entry in one sentence, the way Save will write it. The
 * length is the app's own duration (`35m`, `1h 20m` — the words every other screen uses for a
 * length); "asleep" is a length, never a judgement of one.
 */
export const SLEEP_WINDOW = (from: string, to: string, duration: string): string =>
  `${from} → ${to} · ${duration} asleep`;

/**
 * THE SAME ONE LINE FOR EVERY OTHER FINISHED FORM — tummy time, a feed, a pump session:
 * `8:22 PM → 9:22 PM · 1h`. Built by each sheet from the bounds its Save writes.
 */
export const spanLine = (from: string, to: string, duration: string): string =>
  `${from} → ${to} · ${duration}`;

/**
 * WHAT EACH SHEET'S TIME IS, OVER ITS TIME ROW (the owner, 2026-09-26, on the bottle: *"the time is
 * shown of when it's setup, but instead of just 'time' it should say 'feeding start time'"*; and
 * on the diaper: *"same thing with logging bottle"*). The row under it is the same on every sheet —
 * `Now · −15m · −30m · Custom`, then the time — so this word is the one thing that tells a
 * parent which moment they are setting.
 *
 *   * bottle — the owner's own words: a bottle takes a while, and the time is when it BEGAN.
 *   * diaper — "Changed at": the moment the row records is the change, and a parent at 3 a.m. may
 *     otherwise wonder whether it means when they noticed. Two words, the length of "Time".
 *   * bath, solids — "Bath time", "Meal time": the everyday names for when each happened.
 *   * medicine — "Given at"; temperature — "Taken at": when the dose went in, when the reading was
 *     taken, never when the sheet was opened.
 *
 * Growth is a DATE row and keeps its own "Measured on" (`MEASURED_ON`); the finished forms of the
 * timed modules say their END (`FINISHED`).
 */
export const TIME_LABEL = {
  bottle: 'Feeding start time',
  diaper: 'Changed at',
  bath: 'Bath time',
  solids: 'Meal time',
  med: 'Given at',
  temp: 'Taken at',
} as const;

/**
 * A FORM FOR SOMETHING ALREADY FINISHED, IN WORDS (the owner, 2026-09-25, with a screenshot of the
 * sleep form: "… the minutes indicator with minus and plus sign should clearly says that it's for
 * the sleeping duration. and the 'Now' '-15min' '-30min' is for when the baby wake up").
 *
 * Every finished form says the same things in the same places: WHEN it ended (the eyebrow over the
 * time row, whose chips and time are every sheet's), HOW LONG (a label over the stepper that sets
 * it), and the whole entry on one line.
 *
 * "END TIME" ON EVERY FINISHED FORM, AND "WOKE UP AT" ON THE SLEEP (the owner, 2026-09-26, on the
 * pump: *"it would make more sense to do 'end time' now since we are recording 'already finished'
 * event"*). A feed, tummy time and a pump session all ask the same question the same way. The sleep
 * keeps its own words because they were the owner's complaint in the first place — "the 'Now'
 * '-15min' '-30min' is for when the baby wake up. this was not very clear" — and "End time" over a
 * sleep would say less than "Woke up at" does. (Until 2026-09-26 the time was also said in a
 * sentence under the chips — "Wake-up time: 9:22 PM"; it is at the row's end now, and the eyebrow
 * is that sentence's first half.)
 */
export const FINISHED = {
  sleep: {
    when: 'Woke up at',
    /** The start clock on the confirmation line has no other role word. */
    fellAsleep: 'Fell asleep',
    length: 'Slept for',
    save: 'Save sleep',
  },
  tummy: { when: 'End time', length: 'How long' },
  breastfeed: { when: 'End time', save: 'Save feed' },
  pump: { when: 'Finished' },
} as const;

/** The collapsed note on a finished form: a row that opens into the field (the owner's "+ Add note"). */
export const ADD_NOTE = 'Add note';

/**
 * 45 MINUTES, NOT 90 (the owner, same message: "by default naps shouldn't be 90 minutes, it is
 * too long"). It is the number the stepper opens on and nothing else — a starting position for
 * the arrows, chosen so the common correction is one or two taps rather than six.
 */
export const SLEEP_DEFAULT_MINUTES = 45;
/*
  The pump's finished form asked for a START until 2026-09-26 — "Start time", a first chip of
  "Just finished", a hint under the row ("When the session began — the length below counts from
  here.") and a sentence when a start had to move ("That would still be going, …"). Its row is the
  END now, like every finished form's (`FINISHED.pump`, `pumpForm.ts`), and the owner asked for the
  hint to go: *"remove the text 'when the session began — the l....' serves no purpose"*.
*/
export const PUMP_HOW_LONG = 'How long';

/**
 * WHEN THE SESSION STARTED, SAID ONCE, AS HOW LONG'S OWN SECOND LINE (the owner, 2026-10-01, of the
 * pump's "Already finished" form: *"there are too much numbers"*). The form drew `8:20 AM → 8:39 AM
 * · 19m` under How long: the end the End time row already shows and the length How long already
 * shows. The one number it added was the start, the end less How long, which is also what tells a
 * parent the length counts back from the end. So the start alone, quietly, in the row that moves it.
 */
export const pumpStarted = (clock: string): string => `Started ${clock}`;

/**
 * THE PUMP'S AMOUNT, BY SIDE OR AS ONE TOTAL: one small switch on both forms that finish a session
 * (the owner, 2026-10-01: *"fix the UI, because right now, there are too much numbers, especially
 * with the grey bar that you put"*; `PumpAmounts`, which has the whole account). By side, the two
 * sides are the steppers and the total is said once, as plain words; Total only, the total is the
 * one stepper. `by` names the switch for a screen reader; `totalSaid` is the readout heard whole.
 */
export const PUMP_AMOUNT = {
  by: 'How your pump reports it',
  side: 'By side',
  total: 'Total only',
  left: 'Left',
  right: 'Right',
  totalWord: 'Total',
  totalSaid: (amount: string): string => `Total, ${amount}`,
} as const;
/**
 * THE BOTTLE SHEET'S TWO NUMBERS, IN THE ORDER A PARENT READS THEM OFF THE BOTTLE (the owner,
 * 2026-09-25): what was made up in it, and — under `Some left` — what was still in it. `Took 3 oz`
 * is their difference, said beneath so the two are checkable at a glance, and where the milk came
 * out of the stash, that the stash is drawn on the full bottle (what was POURED, not what the baby
 * drank: `data/stash.ts` §7a). A fact about the entry, never advice about the milk that is left.
 */
export const BOTTLE_AMOUNT = 'In the bottle';
export const BOTTLE_LEFT = 'Left in the bottle';
export const bottleTook = (amount: string, fromStash: boolean): string =>
  fromStash ? `Took ${amount} · the stash is drawn on the full bottle` : `Took ${amount}`;

/**
 * AN ORDINAL IN US ENGLISH: 1st, 2nd, 3rd, 4th … 11th, 12th, 13th … 21st, 22nd, 23rd … 111th.
 * The teens are the trap: eleven, twelve and thirteen take "th" whatever their last digit says.
 */
export function ordinal(n: number): string {
  const k = Math.max(0, Math.trunc(n));
  const teen = k % 100 >= 11 && k % 100 <= 13;
  const suffix = teen ? 'th' : (['th', 'st', 'nd', 'rd'][k % 10] ?? 'th');
  return `${String(k)}${suffix}`;
}

/**
 * THE PUMP SHEET'S HEAD, ON ONE ROW (the owner, 2026-09-26: *"in logging pump, last session and
 * today make it in 1 row otherwise it's too much. it can say 5th (of the day) - last ((7.18am -
 * 2.5 oz) (in one block)), total 13oz. all in one row."*):
 *
 *   5th today · [Last 7:18 AM · 2.5 oz] · 13 oz total
 *
 * Facts only, all of them counts and sums of the household's own sessions: how many there have been
 * today, said as the owner said it — the place of the last one in the day, so "5th today" is five
 * sessions so far — the last session's time and amount as ONE block, and today's total. The words
 * over two `Row`s ("Last session", "Today") are gone; the order is the owner's. A day with no
 * session yet says so in place of the count, and has no total to add up. Every amount and clock
 * arrives formatted in the household's units and clock (`volumeLabel`, `formatClock`).
 */
export const PUMP_HEAD = {
  count: (n: number): string => `${ordinal(n)} today`,
  noneToday: 'None yet today',
  never: 'No sessions yet',
  /** The one block: `Last 7:18 AM · 2.5 oz`, or `Last yesterday 9:40 PM · 3 oz`. */
  last: (when: string, amount: string): string => `Last ${when} · ${amount}`,
  total: (amount: string): string => `${amount} total`,
} as const;

/**
 * THE SAME ROW, AS SENTENCES FOR A SCREEN READER — "5th today · …" read aloud is shorthand, and
 * the ordinal needs saying for what it counts. Everything arrives formatted.
 */
export function pumpHeadSpoken(
  today: { sessions: number; total: string },
  last: { when: string; amount: string } | null,
): string {
  if (last === null) return 'No pump sessions yet.';
  const lastSentence = `The last was ${last.when}, ${last.amount}.`;
  if (today.sessions === 0) return `No pump sessions yet today. ${lastSentence}`;
  const count = `${String(today.sessions)} pump ${today.sessions === 1 ? 'session' : 'sessions'}`;
  return `${count} today, ${today.total} in total. ${lastSentence}`;
}

/* ---------- bath (Addendum C.1; the prototype's final bath sheet) ---------- */

export const BATH_HAIR = 'Hair';
/**
 * "NOT THIS TIME" READ AS "SKIP THIS BATH" (the owner, 2026-09-18: "in the bath module, not this
 * time is unecesary, if user want to skip scheduled bath, they can do so from the schedule
 * today's list and next activity").
 *
 * They read the control as a way out of a scheduled bath, and they were right that it would be
 * the wrong place for one — skipping a slot belongs to the row on Today and on Schedule, which
 * is where it already is. But this is the HAIR question, and "not this time" is what made it
 * ambiguous: on its own, next to Washed, it could be read as answering either. Hair gets washed
 * two or three times a week against a daily bath, so the fact is worth keeping and the wording
 * is what had to go.
 *
 * AND "WASHED" SAYS WHAT WAS (the owner, 2026-09-26: "i should say Hair washed, to make it
 * clearer"): on the bath's picture the word stands alone on the water, with nothing beside it to
 * say it is the hair's. "Not washed", beside "Hair washed", needs no second "hair".
 */
export const BATH_HAIR_LABEL = { washed: 'Hair washed', not: 'Not washed' } as const;
/** `Last bath yesterday at 6:40 PM` / `Last bath 4 days ago at 6:40 PM`. Both already formatted. */
export const lastBathLine = (when: string, clock: string): string =>
  `Last bath ${when} at ${clock}`;

/* ---------- temperature (§6.8) ---------- */

export const TEMP_READING = 'Reading';
export const TEMP_SCALE = 'Scale';
export const TEMP_METHOD = 'Method';
export const TEMP_METHODS = ['Axillary', 'Forehead', 'Ear', 'Rectal'] as const;
export type TempMethodValue = (typeof TEMP_METHODS)[number];
/**
 * THE WORDS A PARENT READS FOR EACH METHOD, and what a screen reader hears (the owner, 2026-09-26:
 * *"some user (me included) dont know without googling what axillary is or rectal"*).
 *
 * THE STORED VALUE NEVER CHANGES — `Axillary` is what every saved reading, the sync, the import and
 * the report already hold — only the word it is shown as. "Armpit", because it is what a parent
 * says and what the American Academy of Pediatrics writes beside the clinical word ("axillary
 * (armpit)"); the screen reader hears both, "Armpit (axillary)", so a parent on the phone to a
 * nurse who says "axillary" can find the one they chose. "Rectal" STAYS on the chip: it is the word
 * on every thermometer's box and the one a nurse asks about, and a gentler one ("Bottom") is vague
 * on its own — the diaper beside it (`TEMP_METHOD_ICON`) says where, and a screen reader hears the
 * AAP's own gloss, "Rectal (in the bottom)". Forehead and Ear were plain already.
 */
export const TEMP_METHOD_WORDS: Readonly<
  Record<TempMethodValue, { label: string; spoken: string }>
> = {
  Axillary: { label: 'Armpit', spoken: 'Armpit (axillary)' },
  Forehead: { label: 'Forehead', spoken: 'Forehead' },
  Ear: { label: 'Ear', spoken: 'Ear' },
  Rectal: { label: 'Rectal', spoken: 'Rectal (in the bottom)' },
};
/**
 * A stored method as a parent reads it — "Armpit" for `Axillary` — anywhere the app writes one back
 * (the Log's row, the reading history). A value this build does not know is shown as it was saved.
 */
export const tempMethodWord = (stored: string): string => {
  const hit = TEMP_METHODS.find(m => m.toLowerCase() === stored.trim().toLowerCase());
  return hit === undefined ? stored : TEMP_METHOD_WORDS[hit].label;
};
/**
 * THE LINE BESIDE A READING. It is the parent's own words and nothing here reads them back: no
 * list to tick, no scoring, no prompt. "What else you noticed" asks for an observation; it does
 * not ask the parent to classify anything, and the app never offers to (CLAUDE.md §2).
 */
export const TEMP_NOTE = 'Note';
export const TEMP_NOTE_HINT = 'What else you noticed, when it started';
/** The same field on a sleep and on a diaper, where the context is ordinary rather than clinical. */
export const ENTRY_NOTE = 'Note';
export const ENTRY_NOTE_HINT = 'Optional';
/** `Saved: 98.6 °F at 1:02 PM`. `reading` is already formatted with its scale. */
export const savedTemp = (reading: string, clock: string): string => savedAt(reading, clock);

/* ---------- growth (§6.9) ---------- */

export const GROWTH = {
  question: 'What did you measure?',
  weight: 'Weight',
  weightLb: 'Weight, pounds',
  weightOz: 'Weight, ounces',
  lb: 'lb',
  oz: 'oz',
  length: 'Length',
  head: 'Head',
  /** The in / cm switch's name to a screen reader: which numbers it is the unit of. */
  lengthUnit: 'Length and head in',
  /** The lb / kg switch's name to a screen reader. */
  weightUnit: 'Weight in',
  save: 'Save measurement',
} as const;

/**
 * `7 lb 4 oz · 20.5 in` — whichever of the three were taken, in the viewer's units, spelled the
 * way Reports, the growth history and the visit summary spell them (core `weightLabel`,
 * `lengthLabel`).
 */
export function growthSummary(
  m: { weightG: number | null; lengthMm: number | null; headMm: number | null },
  weightUnit: WeightUnit,
  lengthUnit: LengthUnit,
): string {
  const parts: string[] = [];
  if (m.weightG !== null) parts.push(weightLabel(m.weightG, weightUnit));
  if (m.lengthMm !== null) parts.push(lengthLabel(m.lengthMm, lengthUnit));
  if (m.headMm !== null) parts.push(`head ${lengthLabel(m.headMm, lengthUnit)}`);
  return parts.join(' · ');
}

/** `Saved: 7 lb 4.0 oz · 20.5 in at 1:02 PM`. */
export const savedGrowth = (summary: string, clock: string): string => savedAt(summary, clock);

/* ---------- multiples (docs/MULTIPLES.md §2, §3) ---------- */

export const LOGGING_FOR = 'Logging for';
/** `Emma and Liam`, `Emma, Liam and Noor` — the babies an entry is for, in a sentence. */
export const namesAnd = (names: readonly string[]): string =>
  names.length <= 2
    ? names.join(' and ')
    : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
/**
 * `Emma and Liam each get their own entry` — under the Logging-for row while Both / All n is the
 * choice (the owner, 2026-09-25). A sheet no longer OPENS on Both (`loggingForStart.ts`), so when
 * it is on Both a parent chose it, and the sheet says in words who the entry is for — a
 * highlighted chip alone is color alone (CLAUDE.md §6) — and that each baby gets an entry of their
 * own, never one row between them (MULTIPLES §1).
 */
export const eachOwnEntry = (names: readonly string[]): string =>
  `${namesAnd(names)} each get their own entry`;
/** The date row's label on a measurement sheet, where a minute would be a false precision. */
export const MEASURED_ON = 'Measured on';
/** `Logged for Emma and Liam` — one toast for the pair, whose Undo removes both. */
export const loggedFor = (names: readonly string[]): string => `Logged for ${namesAnd(names)}`;
/** The shortcut on the toast: `+ Liam`. */
export const plusChild = (name: string): string => `+ ${name}`;
export const UNDO_BOTH = 'Undo both';
/**
 * `Emma and Liam had different bottles` / `Same amount for both` (§2, the bottle). It splits the
 * sheet into one bottle per baby — and one leftover each, under `Some left` — so it names bottles
 * now that the sheet's numbers are the bottle and what was left in it (the owner, 2026-09-25).
 */
export const differentAmounts = (names: readonly string[]): string =>
  `${names.join(' and ')} had different bottles`;
export const SAME_AMOUNT = 'Same amount for both';
/** `Emma on the left, Liam on the right` (§2, tandem). */
export const tandemSides = (left: string, right: string): string =>
  `${left} on the left, ${right} on the right`;
export const SWAP_SIDES = 'Swap sides';
export const START_TANDEM = 'Start tandem';
/**
 * THE FIRST SIDE, SLID TO (the owner, 2026-09-26: "starting breastfeeding, user has to select start
 * left or start right, but what about user has to swipe to left or right from a button in the middle
 * that needs to be dragged"). One baby's live feed asks for its side with `SideSlider`: the two
 * words at its ends; what each end does, which is its button's name and the slider's action for it —
 * the words the two buttons it replaced carried, so a screen reader hears what it always heard; and
 * the slider's own name and hint, which a screen reader reads and a finger never needs.
 */
export const START_SIDE = {
  label: 'First side',
  hint: 'Swipe left or right to choose the first side',
  words: { left: 'Left', right: 'Right' },
  actions: { left: 'Start left', right: 'Start right' },
} as const;
/**
 * ALL 3 ON A LIVE FEED (2026-09-25): a feed timer is one baby's, or a tandem pair's. With three
 * babies chosen on the Logging-for row — which now sits over the live path too — the sheet asks
 * for one, where "Start left" used to start the first baby's timer alone under a row that said
 * All 3.
 */
export const PICK_ONE_TO_TIME = 'Pick one baby above to time a feed.';
/**
 * A TANDEM FEED TYPED IN WITH ONE SIDE EMPTY (2026-09-25): refused rather than written as a feed
 * for the baby on the empty side (`manualFeedBlock`) — and the way out said in the same breath.
 */
export const TANDEM_SIDE_EMPTY =
  'A tandem feed needs minutes on both sides. Only one baby fed? Pick them under Logging for.';

/**
 * THE TANDEM FEED, TYPED IN, SAYS WHAT IT IS (the owner, 2026-09-25: "i logged already finished
 * breastfeeding ended just now, with left 30 min, and right 30 min. but on the log short desc it
 * says '30 min - 30 min' … it should say 1 hr ago, for 1hr").
 *
 * For one baby it does. The thirty was the TANDEM form's: with two babies and Logging for on Both,
 * "Already finished" records one baby on each breast, so each baby got one side, over the longer
 * side's span. That is what a tandem feed is (MULTIPLES §2; the prototype's tandem card), and the
 * form said so only in the captions over the two steppers. It says it now, in a card of its own,
 * before a minute is typed, and the Save names it.
 *
 * AND IT NO LONGER OFFERS "JUST EMMA" (the owner, 2026-09-25: a sheet on Both starts on ONE baby
 * now — `loggingForStart.ts`). The card carried `Only one baby fed? Just Emma · Just Liam` while
 * Both was where the sheet OPENED, so a parent who meant one baby's feed found themselves in a
 * tandem they had not chosen and needed a way out of it. A tandem form is now one a parent asked
 * for, by tapping Both on the Logging-for row — the row that holds Emma and Liam as well, at the
 * top of the same sheet. Two more buttons doing exactly what its chips do was the sheet repeating
 * itself, and the empty-side refusal still names the way out (`TANDEM_SIDE_EMPTY`).
 */
export const TANDEM_MANUAL = {
  title: 'Tandem feed',
  body: (left: string, right: string): string =>
    `Both babies at once: ${left} on the left, ${right} on the right. Each gets the minutes on their own side.`,
  save: 'Save tandem feed',
} as const;

/**
 * `8:52 PM → 9:22 PM · Emma 30m, Liam 20m` — a tandem feed's one line: the session, and what each
 * baby is written with, so "30m" can never be read as the whole of one baby's hour.
 */
export const tandemSpanLine = (
  from: string,
  to: string,
  left: { name: string; duration: string },
  right: { name: string; duration: string },
): string => `${from} → ${to} · ${left.name} ${left.duration}, ${right.name} ${right.duration}`;

/* ---------- the timer modules (§6.2, §6.3, §6.5, §6.10) ---------- */

export const SLEEP_KIND_LABEL = { NAP: 'Nap', NIGHT: 'Night' } as const;

/** `Saved: nap 1h 35m` (§6.5); `Saved: tummy time 12m`. `duration` is already formatted. */
export const savedDuration = (what: string, duration: string): string =>
  `Saved: ${what} ${duration}`;

/** `Saved: 14 min · L 8 / R 6` (§6.2). Whole minutes. */
export const savedBreastfeed = (totalMin: number, leftMin: number, rightMin: number): string =>
  `Saved: ${totalMin} min · L ${leftMin} / R ${rightMin}`;

/**
 * The same toast from a timer's banked seconds, with sides that add up to the total
 * (`sideMinutes`): 7m 30s a side is `Saved: 15 min · L 8 / R 7`, not `L 8 / R 8`.
 */
export const savedBreastfeedSides = (leftSeconds: number, rightSeconds: number): string => {
  const m = sideMinutes(leftSeconds, rightSeconds);
  return savedBreastfeed(m.total, m.left, m.right);
};

/** `Pump saved: 7.5 oz in 18m` (§6.3). */
/** `Pump saved: 4 oz in 18m`, or `Pump saved: 4 oz` for a session logged with no length (a
 *  Schedule slot's one tap): "in 0m" is a sentence about nothing. */
export const pumpSaved = (amount: string, duration: string | null): string =>
  duration === null ? `Pump saved: ${amount}` : `Pump saved: ${amount} in ${duration}`;

export const SESSION_DISCARDED = 'Session discarded';
export const STASH_ALREADY = 'This session is already in the stash';
/**
 * THE PUMP'S SECOND BUTTON SAYS WHAT HAPPENS NEXT (the owner, 2026-09-30: *"Save and store or
 * feed, that is not a very nice name. Think about this and find the fix for the name."*). It was
 * "Save and add to stash" until 2026-09-28, which named one of the three answers the next sheet
 * offers, and then "Save and store or feed", which named two of them and read as a list.
 *
 * It saves nothing by itself: it opens the sheet that asks where the milk goes (store it all, feed
 * some, feed it all; `StashSaveSheet`, titled "Where it goes"), and that sheet's own button writes
 * the session. So the button names the step it opens, in the words of that sheet's title.
 *
 * AND IT LEADS ON BOTH FORMS THAT FINISH A SESSION (the owner, 2026-10-01, of "Already finished":
 * *"where is the option to feed some / stash like there would be in start pumping?"*). The stopped
 * timer put it first, as the primary; the finished form put "Save session" first and this under it
 * with a line of explanation, and a parent logging after the fact did not find it. Both forms end
 * with the same two buttons now, in this order (`PumpFinishButtons`), and the line is gone: the
 * button says what comes next.
 */
export const CHOOSE_WHERE_IT_GOES = 'Choose where it goes';

/**
 * THE PUMP'S TWO PAGES (the owner's pumping redesign, 2026-10-05): page 1 is the session, page 2
 * what its milk is for. Sentence case throughout, and no "Milk plan" heading over the three
 * purposes: the three words are the question.
 */
export const PUMP_PAGE = {
  ways: 'How are you logging this pump?',
  amount: 'Amount pumped',
  total: 'Total',
  sides: 'Left & right',
  left: 'Left',
  right: 'Right',
  sidesTotal: (amount: string): string => `Total ${amount}`,
  finished: 'Finished',
  duration: 'Duration',
  started: 'Started',
  ended: 'Ended',
  purpose: 'What this milk is for',
  // SAID FOR WHAT HAPPENS TO THE MILK (the owner, 2026-10-06: "rename to make it easier to
  // understand and add icons"): only the pump is logged, it goes into the stash, or it is a bottle
  session: 'Pump only',
  store: 'Save to stash',
  feed: 'Bottle feed',
  save: 'Save pump',
  /** Back on page 1 from page 2's Edit, the way to page 2 again: navigation, never a save. */
  done: 'Done',
  today: (amount: string): string => `Today ${amount}`,
  last: (clock: string): string => `Last ${clock}`,
} as const;

/**
 * THE PUMP'S OTHER WAY TO FINISH, on both forms: the session written as it is, nothing stored and
 * nothing fed. The primary where the household keeps no stash, the second button where it does.
 * It saves at no amount too: a session nobody measured is still a session, with its length, and
 * the schedule's next pump counts from it. A total typed on its own is written as that total.
 */
export const SAVE_SESSION_ONLY = 'Save session only';

/** `A sleep timer is already running for Emma` — one timer per (type, child) (WP5.4). */
export const alreadyRunning = (what: string, child: string | null): string =>
  child === null
    ? `A ${what} timer is already running`
    : `A ${what} timer is already running for ${child}`;

/** The timer's word in a sentence: "sleep", "breastfeed", "pump", "tummy time". */
export const TIMER_WORD = {
  sleep: 'sleep',
  breastfeed: 'breastfeed',
  pump: 'pump',
  tummy: 'tummy time',
} as const;

/** `Saved: 4 oz breast milk at 1:02 PM` (§6.1). `amount` carries its own unit. */
export const savedBottle = (
  amount: string,
  kind: keyof typeof BOTTLE_KIND_LABEL,
  clock: string,
): string => savedAt(`${amount} ${BOTTLE_KIND_LABEL[kind].toLowerCase()}`, clock);

/**
 * THE LONG-RUN ASK (the owner, 2026-09-20: *"add the prompt when activities are still ongoing
 * and ask to adjust… when this happens, send the warning ask if it's ended and the option to
 * adjust the correct end time"*). The arithmetic is `packages/core/schedule/longRun.ts`.
 *
 * EVERY SENTENCE HERE IS ABOUT A TIMER, and that is the whole of what keeps it inside
 * CLAUDE.md §2. "This pump timer has been running 2h 30m" is a fact about a row in this app.
 * "Pumping for two hours is too long" would be a claim about a person doing a thing, which is
 * not the app's to make however sensible it sounds — some sessions really do run long, and the
 * only honest move is to ask rather than to tell. So: no "too long", no "should", no
 * "unusual", nothing about the baby, and the first option offered is that it IS still going.
 *
 * `copy.test.ts` scans these against `BANNED_CLINICAL` with everything else in this file.
 */
/**
 * The gerund each timer's question needs: "Still pumping?", not "Still pump?".
 *
 * Tummy time is the odd one and the reason this is a function rather than a second map. It has
 * no verb — and it is the one module a household can rename ("Playtime"), so the word in the
 * question has to be the household's own. `on <their word>` reads right for both.
 */
const TIMER_GERUND = {
  sleep: 'sleeping',
  breastfeed: 'breastfeeding',
  pump: 'pumping',
  tummy: 'on tummy time',
} as const;

export const longRunTitleWord = (type: keyof typeof TIMER_GERUND, noun: string): string =>
  type === 'tummy' ? `on ${noun}` : TIMER_GERUND[type];

export const LONG_RUN = {
  /** The strip's question, never a verdict. `longRunTitleWord` supplies the verb. */
  title: (word: string): string => `Still ${word}?`,
  /**
   * THE ELAPSED IS HEARD, NEVER SHOWN (the owner, 2026-09-30: *"The info how long is running is
   * duplicate because it shows exactly that on top of it"*). The timer card right above the strip
   * counts it; a screen reader, which reads the strip on its own, hears it with the question:
   * "Still pumping? Running 4 hours 20 minutes".
   */
  running: (elapsed: string): string => `Running ${elapsed}`,
  stillGoing: 'Still going',
  ended: 'It ended',
  /**
   * WHAT THE PICKER BEHIND "IT ENDED" IS FOR, SAID BY THE PICKER (2026-09-30). The strip lost its
   * "If it ended earlier, set when it stopped." with the rest of its second and third rows, so the
   * wheel names its own job: the question over the iPhone's wheel, and the answer on the button
   * that sets it, which is the one words slot Android's own clock dialog has (`timePicker.tsx`).
   */
  pickTitle: 'When did it end?',
  pickSet: 'Set end time',
  /**
   * Refused: the picker can hand back a time before the timer started. These three are every end
   * the app refuses, from "It ended" and from the running sheet's End time alike (`timerEnd.ts`).
   */
  endTooEarly: 'That is before the timer started',
  endInFuture: 'That is later than now',
  /**
   * A FEED'S SIDES WERE STILL COUNTING AT THAT TIME (2026-09-29): before the side that is timing now
   * began, or, on a paused feed, sooner after the start than its sides' minutes add up to. A stop
   * there would save more side minutes than the feed lasted, so it is refused, and the sentence
   * says what the parent can do about it rather than which number it broke.
   */
  endStillCounting: 'The feed timer was still counting then. Pick a later time.',
} as const;

/**
 * A stopped pump's start, refused: a start after the stop is a session that ends before it begins,
 * which the server never takes (`startBeforeStop`). The same shape as the long-run card's refusal
 * of an end before the start, above.
 */
export const START_AFTER_STOP = 'That is after the timer stopped';

/**
 * A RUNNING TIMER'S TWO TIMES, SIDE BY SIDE (the owner, 2026-09-29: *"on an ongoing timer for
 * pumping, i see the option to "correct start time" as i try to stop it, but what happens if it
 * should already be ended x minutes ago? … dont make it on a new row, instead cut the correct start
 * time by half and do the other half to do what we want"*). Sleep, a feed and tummy time
 * still draw the pair. A running pump does not, since 2026-10-03: its sheet asks when it ended
 * (`PUMP_ENDED`).
 *
 * "Correct the start time" was a whole row that named an act. The pair names the two times instead,
 * as every other time in a sheet is named by what it is ("End time" on every finished form): the
 * start's clock under *Start time*, and under *End time* the word *Now* while the timer runs, which
 * is when it will end if nothing is done, or a stopped pump's stop. A tap on either opens the wheel
 * on that time. A screen reader hears the time with its name, and the hint says what a tap does.
 */
export const RUNNING_TIMES = {
  start: 'Start time',
  end: 'End time',
  /** A timer still running ends when it is stopped: now. */
  now: 'Now',
  /** `Start time, 9:31 PM` */
  startSpoken: (clock: string): string => `Start time, ${clock}`,
  startHint: 'Change when it started',
  /** `End time, now` while it runs · `End time, 9:50 PM` once a pump is stopped */
  endSpoken: (clock: string | null): string => `End time, ${clock ?? 'now'}`,
  endHint: 'Set when it ended',
} as const;

/**
 * WHEN A RUNNING PUMP ENDED (the owner, 2026-10-03). The start row's chips belong before the timer
 * starts. Stopping a pump that ran on is the other question, so this sheet asks it with the same
 * shape of chips: Now, which is already chosen, then −5m, −15m and Custom.
 * Fifteen, not the start row's ten: a stop noticed late is usually further back than a start was.
 * A screen reader hears the whole words. `pumpEnd.ts` places an offset; `timerEnd.ts` accepts it.
 */
export const PUMP_ENDED = {
  /** The eyebrow over the row, as Started is over the start. */
  label: 'Ended',
  choice: {
    now: NOW_LABEL,
    m5: agoLabel(5),
    m15: agoLabel(15),
    m30: agoLabel(30),
    earlier: CUSTOM_LABEL,
  },
  /** Spelled out where the slots hold it (`TIMER_START.choiceLong`). */
  choiceLong: {
    now: NOW_LABEL,
    m5: agoLongLabel(5),
    m15: agoLongLabel(15),
    m30: agoLongLabel(30),
    earlier: CUSTOM_LABEL,
  },
  spoken: {
    now: 'Now',
    m5: agoSpoken(5),
    m15: agoSpoken(15),
    m30: agoSpoken(30),
    earlier: 'Custom, choose the time',
  },
} as const;

/**
 * ASLEEP OR PLAYING, NEVER BOTH (the owner, 2026-09-27: *"if baby sleeping, then they cannot be
 * playing. when user try to add tummy time or playtime when baby is sleeping, ask if you would like
 * us to end sleeping log?"*; `sleepPlay.ts` has the rule). The question before tummy time is
 * started or saved over the same baby's running sleep — and before a sleep is started over their
 * running tummy time. It says what the app is about to write, a timer ended, and nothing about the
 * baby: no reason, no "should", no "wake".
 *
 * `word` is the household's word inside a sentence ("tummy time", "playtime"), and `at` a clock
 * only when the end is not the moment of the tap (`endIsNow`).
 */
export const SLEEP_PLAY = {
  /** `Emma is asleep` */
  asleep: (name: string): string => `${name} is asleep`,
  /** `End the sleep to start tummy time?` · `End the sleep at 2:45 PM to save playtime?` */
  endSleep: (word: string, verb: 'start' | 'save', at: string | null): string =>
    `End the sleep${at === null ? '' : ` at ${at}`} to ${verb} ${word}?`,
  endSleepButton: 'End sleep',
  /** `Emma is on tummy time` · `Emma is on playtime` — the long-run card's own "on <word>" */
  playing: (name: string, word: string): string => `${name} is ${longRunTitleWord('tummy', word)}`,
  /** `End tummy time to start the sleep?` · `End playtime at 1:20 PM to start the sleep?` */
  endPlay: (word: string, at: string | null): string =>
    `End ${word}${at === null ? '' : ` at ${at}`} to start the sleep?`,
  /** `End tummy time` · `End playtime` */
  endPlayButton: (word: string): string => `End ${word}`,
  cancel: 'Cancel',
  /** A baby with no name yet. */
  someone: 'Your baby',
} as const;
