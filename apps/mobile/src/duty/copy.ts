/**
 * WHO'S ON — every sentence the feature says (the owner, 2026-09-23: "this needs to be proper and
 * easy for user to do"). Plain, short, and read by a parent at 3 a.m.: who gets the reminders,
 * until when, and what happens to everyone else's phone. `duty.test.ts` holds every string here
 * to the banned list and to the brand rule — the product name is never typed (CLAUDE.md §1).
 *
 * NOTHING HERE IS ABOUT THE BABY. A shift moves a reminder the household set from one phone to
 * another; no sentence says a baby needs anything, and none says anyone should be on.
 */
export const DUTY = {
  title: 'Who’s on',
  tonight: 'Who’s on tonight?',
  tonightHint: 'They get the reminders. Everyone else’s phone stays quiet.',
  lede: 'One person gets the reminders until the time you pick, and everyone else’s phone stays quiet. It ends by itself.',
  who: 'Who',
  until: 'Until',
  morning: 'Morning',
  bedtime: 'Bedtime',
  hours: (n: number) => `${n} hours`,
  /** A temporary caregiver's own end: the moment their access does (H4). */
  access: 'Until access ends',
  otherTime: 'Other time',
  split: 'Split the night',
  /*
    NOT "WITHOUT ANYONE WAKING UP TO DO IT" any more (the handoff audit's C1). The second half's
    phone takes over at the split — and, with an every-few-hours rhythm, it says "You're on" then,
    because its copy of the log may be hours old. A promise the app could not keep is gone.
  */
  splitHint: 'Hand over halfway, at the time you pick.',
  then: 'Then',
  from: 'From',
  start: 'Start',
  save: 'Save',
  endNow: 'End now',
  endAnyway: 'End anyway',
  handOverTo: 'Hand over to',
  handOverLabel: (name: string) => `Hand over to ${name}, from now`,
  notTonight: 'Not tonight',
  choose: 'More options',
  sameAsLastNight: 'Same as last night',
  you: 'You',
  someone: 'Someone',
  pumpNote: 'Pumping reminders stay with whoever pumps.',
  refused: 'That couldn’t be saved. Check the times and try again.',
  /** On Today's row, and on the card on the Reminders page and on Family (2026-09-29). */
  takeOver: 'Take over',
  takeOverLabel: (name: string) => `Take over from ${name}`,
  // notifications off on the phone that is, or will be, on (H3)
  notificationsOff: 'Notifications are off on this phone',
  turnOn: 'Turn on',
  /**
   * The card's caption, on the Reminders page and on Family — the name the handoff guide sends a
   * parent to (`guides/handoffCopy.ts`).
   */
  caption: 'Who gets reminders',
  nobodyOn: 'Nobody’s on',
  nobodyOnHint: (baby: string) =>
    `Put one person on for a night or an afternoon, and only their phone gets the reminders for ${baby}.`,
  putSomeoneOn: 'Put someone on',
  change: 'Change',
  /** Today by day, nobody on — the door outside the evening (U2). */
  idleLine: 'Nobody’s on · every parent gets their own reminders',
} as const;

/**
 * WHAT WAS LOGGED SINCE THE PERSON ON TOOK OVER — the look-back from Up next (`lookBack.ts`; the
 * owner, 2026-09-29). Read by a parent who has just woken up: what, when and by whom, and nothing
 * about how the baby is. No dashes (the owner reads one as "too AI"), US English.
 */
export const LOOK_BACK = {
  /** The link under the row: "What’s been logged since 10:00 PM". */
  button: (since: string): string => `What’s been logged since ${since}`,
  /** Its spoken name: whose stretch, from when. */
  label: (name: string, since: string): string =>
    `See everything logged since ${name} took over at ${since}`,
  hint: 'Shows each entry, with who logged it',
  /** The sheet: "Since Sam took over at 10:00 PM", or the time alone when the name is not known. */
  title: (name: string | null, since: string): string =>
    name === null ? `Since ${since}` : `Since ${name} took over at ${since}`,
  running: 'Running now',
  runningFor: (elapsed: string): string => `Running for ${elapsed}`,
  logged: 'Logged',
  /** Nothing in the stretch: what the phone knows, never what happened. */
  empty: (since: string): string => `Nothing logged since ${since} has reached this phone yet.`,
  openLog: 'Open the log',
  you: 'You',
  someone: 'Someone',
} as const;

/**
 * WHY START IS GREYED OUT, or why a change was refused — in the words of what to do next (the
 * handoff audit's M3 and U7). "Check the times and try again" was said to a parent who had picked
 * no times at all: Take over at 6:50 with the shift ending at 7:00 is a shift of ten minutes.
 */
export function refusedText(problem: string | null): string {
  switch (problem) {
    case 'tooShort':
      return 'That’s under 15 minutes. Pick a later time.';
    case 'ended':
      return 'That time has already passed. Pick a later one.';
    case 'tooLong':
      return 'A shift runs a day at most. Pick an earlier time.';
    case 'pastAccess':
      return 'Their access ends before then. Pick an earlier time, or “Until access ends”.';
    case 'notEligible':
      return 'They can’t be put on. Their access has ended or changed.';
    case 'empty':
      return 'Pick who is on, and until when.';
    default:
      return DUTY.refused;
  }
}

/** "Set by Sam at 9:40 PM" / "Set by you at 9:40 PM" — who decided this, and when (U12). */
export const setByLine = (name: string, isViewer: boolean, clock: string): string =>
  `Set by ${isViewer ? 'you' : name} at ${clock}`;

/**
 * THE PHONE THAT LOST A CLASH, TOLD WHO WON (M1): two phones changed who's on at once, and the
 * server kept the one written knowing the list it replaced.
 */
export const overruledText = (name: string): string => `${name} just changed who’s on`;

/** "You're on for Ada" — the alert at the start of this phone's half of a split night (C1). */
export function dutyAlertCopy(input: { babies: string; until: string }): {
  title: string;
  body: string;
} {
  return {
    title: `You’re on for ${input.babies || 'the baby'}`,
    body: `Until ${input.until}. Open the app so this phone has the latest times.`,
  };
}

/** "Sam" / "Sam and Nana" — whose phones this one is waiting for. */
export function namesWord(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? DUTY.someone;
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** "Sam's phone" / "Sam and Nana's phones" — one possessive for one or several people. */
const phonesOf = (who: string | readonly string[]): { words: string; several: boolean } => {
  const names = typeof who === 'string' ? [who] : who;
  return {
    words: `${namesWord(names)}’s phone${names.length > 1 ? 's' : ''}`,
    several: names.length > 1,
  };
};

/**
 * WHILE ANOTHER PHONE HAS NOT CONFIRMED (0115; the handoff audit's H1). The phone that set a list
 * keeps ringing until the person on has it, and says so — the sentence a parent reads before they
 * put the phone down, and the reason it may ring tonight after all.
 */
export const waitingLine = (who: string | readonly string[]): string => {
  const p = phonesOf(who);
  return `Waiting for ${p.words}. Yours keeps the reminders until ${p.several ? 'they have' : 'it has'} this.`;
};

/** A phone neither on nor covering, while the person on has not confirmed: it is not quiet yet. */
export const notYetLine = (who: string): string =>
  `${who}’s phone hasn’t picked this up yet. This phone keeps its own reminders until it does.`;

/**
 * "END NOW" AT NIGHT (H1): the other phones may still think someone is on, and stay quiet. So the
 * phone that ended it keeps the reminders until they have the change — said before, not after.
 * `onName` is who is on now, or null when it is the viewer.
 */
export function endAtNightWarning(input: {
  others: readonly string[];
  onName: string | null;
  clock: string;
}): string {
  const p = phonesOf(input.others);
  const who = input.onName === null ? 'you’re' : `${input.onName}’s`;
  return `${p.words} may still think ${who} on. Yours keeps the reminders until ${
    p.several ? 'they have' : 'it has'
  } the change, or until ${input.clock}. To stop yours ringing, hand over instead.`;
}

/**
 * THE WARNING THE SHEET SHOWS BEFORE "END NOW", or null when it ends at once — what the sheet
 * decides and says, in one place (`WhoIsOnSheet.tsx`; the scenarios ask it too).
 *
 * ONLY WHEN ANOTHER PARENT'S PHONE MAY BE LEFT QUIET (2026-09-29). The warning is about the phones
 * that may still think someone is on and stay quiet for it, which this phone then covers
 * (`routeFor`). The phone of the person on is never one of them: it thinks ITS person is on, and
 * rings. So a parent ending the other parent's night, with no third parent, was told "Someone’s
 * phone may still think Sam’s on. Yours keeps the reminders until it has the change": there is no
 * such phone, and this phone does not keep them.
 */
export function endNowWarning(input: {
  current: { userId: string; untilMs: number } | null;
  /** When the whole arrangement ends. */
  endsAt: number | null;
  viewerId: string | null;
  /** The parents who can be on (`DutyState.parents`). */
  parents: ReadonlySet<string>;
  /** From an hour before bedtime until the morning, in the household's zone (`isTonight`). */
  tonight: boolean;
  nameOf: (userId: string) => string;
  clock: (ms: number) => string;
}): string | null {
  const { current } = input;
  if (current === null || !input.tonight) return null;
  const others = [...input.parents].filter(p => p !== input.viewerId && p !== current.userId);
  if (others.length === 0) return null;
  return endAtNightWarning({
    others: others.map(input.nameOf),
    onName: current.userId === input.viewerId ? null : input.nameOf(current.userId),
    clock: input.clock(input.endsAt ?? current.untilMs),
  });
}

/** The toast after "End now": everyone's own reminders again — once the other phones have it. */
export const endedToast = (waiting: boolean): string =>
  waiting ? `${ENDED_TOAST}, once the other phones have it` : ENDED_TOAST;

/** "Ada", "Emma and Liam", or "the babies" — whose reminders these are. */
export function babyWord(names: readonly string[]): string {
  const clean = names.map(n => n.trim()).filter(n => n.length > 0);
  if (clean.length === 1) return clean[0] ?? 'the baby';
  if (clean.length === 2) return `${clean[0]} and ${clean[1]}`;
  return clean.length === 0 ? 'the baby' : 'the babies';
}

/** "You’re on until 7:00 AM" / "Sam’s on until 7:00 AM". */
export const onUntil = (name: string, isViewer: boolean, clock: string): string =>
  isViewer ? `You’re on until ${clock}` : `${name}’s on until ${clock}`;

/** "then Sam from 2:00 AM" — the second half of a split night. */
export const thenFrom = (name: string, isViewer: boolean, clock: string): string =>
  `then ${isViewer ? 'you' : name} from ${clock}`;

/** What this phone does while the shift runs — the line under the status. */
export function phoneLine(input: {
  viewerOnNow: boolean;
  viewerLater: boolean;
  laterAt: string | null;
  endsAt: string;
  baby: string;
  /** This phone is ringing in place of these phones, which have not confirmed (H1). */
  waitingFor?: string | readonly string[] | null;
  /** The person on has not confirmed, and this phone is not the one covering for them. */
  notYet?: string | null;
  /** The viewer is on, or next, and this phone cannot show a notification (H3). */
  osOff?: boolean;
  /**
   * WHETHER THIS PHONE HAS REMINDERS OF ITS OWN when nobody is on: a parent's does, a caregiver's
   * does not (`remindedByDefault`). Absent: it does.
   */
  ownReminders?: boolean;
}): string {
  if ((input.viewerOnNow || input.viewerLater) && input.osOff === true)
    return `${DUTY.notificationsOff}.`;
  if (input.viewerOnNow) return `Your phone gets every reminder for ${input.baby}.`;
  if (input.waitingFor !== undefined && input.waitingFor !== null)
    return waitingLine(input.waitingFor);
  if (input.viewerLater && input.laterAt !== null)
    return `Your phone takes over at ${input.laterAt}.`;
  /*
    A CAREGIVER WHO IS NOT ON IS QUIET AFTER THE SHIFT TOO (2026-09-29; the Reminders page's U11,
    on Today's row): "until 7:00 AM" promised a nanny's phone would ring after 7, and it never does
    unless they are put on. Nor does it keep "its own reminders" while the person on catches up.
  */
  if (input.ownReminders === false) return `This phone stays quiet for ${input.baby}.`;
  if (input.notYet !== undefined && input.notYet !== null) return notYetLine(input.notYet);
  return `This phone stays quiet for ${input.baby} until ${input.endsAt}.`;
}

/**
 * The sheet's own summary of what pressing Start will do — the whole night in one sentence, the
 * split's second half included, so the second person never reads "yours stays quiet" about a night
 * they take half of (the audit's U8).
 */
export function startSummary(input: {
  name: string;
  isViewer: boolean;
  baby: string;
  until: string;
  /** The split night's second half: who, from when, until when. */
  then?: { name: string; isViewer: boolean; from: string; until: string } | null;
}): string {
  const whose = input.isViewer ? 'Your phone' : `${input.name}’s phone`;
  const then = input.then ?? null;
  const head = `${whose} gets every reminder for ${input.baby} until ${input.until}, each at its time, even in quiet hours.`;
  if (then !== null) {
    const next = then.isViewer ? 'yours' : `${then.name}’s`;
    const rest = input.isViewer || then.isViewer ? '' : ' Yours stays quiet.';
    return `${head} Then ${next}, from ${then.from} until ${then.until}.${rest}`;
  }
  return `${head}${input.isViewer ? '' : ' Yours stays quiet.'}`;
}

/**
 * WHEN ANOTHER PHONE FOLLOWS — said plainly, because phones only sync while the app is open, and
 * said the same way for a parent as for a caregiver (the audit's H1: the old sentence warned only
 * for caregivers, and a parent's phone with quiet hours set held the 2 a.m. reminder until 7). The
 * phone that sets it keeps the reminders until the other phone confirms (0115), so the sentence
 * says what to do: ask them to open the app.
 */
export function syncNote(input: {
  name: string;
  isViewer: boolean;
  onlyWhileOn?: boolean;
  /**
   * This phone cannot show a notification. Putting yourself on from it quiets nobody else until it
   * can (`newDutyList`'s `writerCanRing`), and the sentence says so rather than "go quiet".
   */
  osOff?: boolean;
}): string {
  if (input.isViewer && input.osOff === true)
    return 'Other phones keep their own reminders until this phone can show them.';
  if (input.isViewer) return 'Other phones go quiet once the app opens on them.';
  return `${input.name}’s phone takes over once the app opens on it. Ask ${input.name} to open it. Until then, yours keeps the reminders.`;
}

/** The toast after a change. */
export const startedToast = (name: string, isViewer: boolean, clock: string): string =>
  onUntil(name, isViewer, clock);
export const ENDED_TOAST = 'Nobody’s on. Everyone gets their own reminders again';

export interface DutyStatusInput {
  current: { userId: string; untilMs: number } | null;
  next: { userId: string; fromMs: number; untilMs: number } | null;
  viewerId: string | null;
  nameOf: (userId: string) => string;
  clock: (ms: number) => string;
  endsAt: number;
  baby: string;
  /** Whom this phone is ringing in place of (`dutyWait`), by name — "Waiting for Sam's phone". */
  waitingFor?: string | readonly string[] | null;
  /** Whose phone has not confirmed, when this phone is not covering for them. */
  notYet?: string | null;
  /** The viewer is on or next, and notifications are off on this phone. */
  osOff?: boolean;
  /** This phone has reminders of its own when nobody is on (a parent's). Absent: it does. */
  ownReminders?: boolean;
}

/**
 * THE TWO LINES EVERY PHONE SHOWS WHILE A SHIFT RUNS: who is on and until when (and who takes
 * over, for a split night), and what THIS phone is doing about it — the second line is the one a
 * parent checks before putting the phone down, so it says it in so many words.
 */
export function dutyStatus(input: DutyStatusInput): { title: string; line: string } | null {
  const { current, next, viewerId, nameOf, clock } = input;
  const endsAt = clock(input.endsAt);
  if (current === null && next === null) return null;
  const line = phoneLine({
    viewerOnNow: current !== null && current.userId === viewerId,
    viewerLater: next !== null && next.userId === viewerId,
    laterAt: next === null ? null : clock(next.fromMs),
    endsAt,
    baby: input.baby,
    waitingFor: input.waitingFor ?? null,
    notYet: input.notYet ?? null,
    osOff: input.osOff ?? false,
    ownReminders: input.ownReminders ?? true,
  });
  if (current === null && next !== null) {
    const isViewer = next.userId === viewerId;
    const who = isViewer ? 'You’re' : `${nameOf(next.userId)}’s`;
    return { title: `${who} on from ${clock(next.fromMs)} until ${clock(next.untilMs)}`, line };
  }
  if (current === null) return null;
  const head = onUntil(nameOf(current.userId), current.userId === viewerId, clock(current.untilMs));
  const tail =
    next === null
      ? ''
      : `, ${thenFrom(nameOf(next.userId), next.userId === viewerId, clock(next.fromMs))}`;
  return { title: `${head}${tail}`, line };
}

/**
 * WHERE EVERY PHONE'S REMINDERS GO, ONE LINE A PERSON — the Reminders page's answer to the owner's
 * question (2026-09-23: "how to easily 'manage' where these notifications are being sent to"), and
 * Family's since 2026-09-29, which draws the same card.
 *
 * It restates `deliveryFor` in words, for the baby's reminders: while someone is on, their phone
 * gets every one and every other phone is quiet until the arrangement ends; otherwise each parent
 * gets the kinds they chose, a caregiver only while on, and a view-only member never. What a
 * parent cannot see from their own phone is what the OTHER phones do, and that is the part this
 * list exists to say. Pumping is not in it — it stays with whoever pumps, and the page says so
 * under the list.
 */
export type AudienceState =
  'on' | 'later' | 'quiet' | 'own' | 'onlyWhileOn' | 'never' | 'waiting' | 'covering';

export interface AudiencePerson {
  id: string;
  name: string | null;
  role: string;
  isViewer: boolean;
}

export interface AudienceRow {
  id: string;
  name: string;
  state: AudienceState;
  line: string;
}

export function audienceRows(input: {
  people: readonly AudiencePerson[];
  viewOnly: readonly AudiencePerson[];
  current: { userId: string; untilMs: number } | null;
  next: { userId: string; fromMs: number } | null;
  endsAt: number | null;
  clock: (ms: number) => string;
  /** The people named whose phones have not confirmed (0115): "until their phone has it". */
  unconfirmed?: readonly string[];
  /** This phone is ringing in their place. */
  standingIn?: boolean;
  /**
   * WHETHER THE VIEWER'S OWN LEVELS ARE UNDER THE CARD — on the Reminders page they are, so their
   * line points down at them. On Family nothing about reminders is below it (2026-09-29), and
   * "below" would send a parent looking at the Children card. Absent: they are.
   */
  levelsBelow?: boolean;
}): AudienceRow[] {
  const { current, next, clock } = input;
  const unconfirmed = new Set(input.unconfirmed ?? []);
  const nameOf = (p: AudiencePerson) => (p.isViewer ? DUTY.you : (p.name ?? DUTY.someone));
  const rows = input.people.map((p): AudienceRow => {
    if (current !== null && current.userId === p.id)
      return unconfirmed.has(p.id)
        ? {
            id: p.id,
            name: nameOf(p),
            state: 'waiting',
            line: `From when their phone has it, until ${clock(current.untilMs)}`,
          }
        : {
            id: p.id,
            name: nameOf(p),
            state: 'on',
            line: `Every reminder until ${clock(current.untilMs)}`,
          };
    if (next !== null && next.userId === p.id)
      return {
        id: p.id,
        name: nameOf(p),
        state: 'later',
        line: `Takes over at ${clock(next.fromMs)}`,
      };
    if (p.isViewer && input.standingIn === true)
      return {
        id: p.id,
        name: nameOf(p),
        state: 'covering',
        line: 'Every reminder, until the other phone has it',
      };
    // A CAREGIVER WHO IS NOT ON IS QUIET AFTER THE SHIFT TOO (U11): "Quiet until 7:00" promised
    // their phone would ring after 7, and it never does unless they are put on
    if (current !== null && input.endsAt !== null && (p.role === 'OWNER' || p.role === 'PARENT'))
      return {
        id: p.id,
        name: nameOf(p),
        state: 'quiet',
        line: `Quiet until ${clock(input.endsAt)}`,
      };
    if (p.role === 'OWNER' || p.role === 'PARENT')
      return {
        id: p.id,
        name: nameOf(p),
        state: 'own',
        line: p.isViewer
          ? input.levelsBelow === false
            ? 'The reminders you chose'
            : 'The reminders you chose below'
          : 'The reminders they chose',
      };
    return { id: p.id, name: nameOf(p), state: 'onlyWhileOn', line: 'Only while on' };
  });
  const never = input.viewOnly.map((p): AudienceRow => ({
    id: p.id,
    name: nameOf(p),
    state: 'never',
    line: 'Never · view only',
  }));
  return [...rows, ...never];
}
