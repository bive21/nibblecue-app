import { MAX_HOUSEHOLDS } from '@nibblecue/core';
/**
 * EVERY WORD OF THE WAY INTO SOMEBODY ELSE'S HOUSEHOLD, in one table (the owner's report of
 * 2026-09-29: *"there was no text saying if i joined or not, or even for me that i needed to sign
 * up … after joining the household, add confirmation text and if it's not signed up then create an
 * account or sign in"*).
 *
 * One table so the first screen, the code sheet, Verify, the join page, the confirmation and the
 * refusals say one thing one way, and so the prototype's block 126 and its logic checks can be held
 * to these very strings (prototype/audit/logic-suite.js reads this file). The voice is the app's:
 * short sentences, US English, no dashes, nothing a parent at 3 a.m. has to read twice. Each
 * refusal says what happened and then what to do next.
 *
 * Household names are used bare, as the Ended screen uses them (`core/accounts/standing.ts`): a
 * household is named "Dana's family" unless its owner renamed it, so "You joined Dana's family"
 * reads as a sentence. A name the server did not give falls back to words that need none.
 */
import type { Role } from '@nibblecue/core';
import type { NotUsedWhy } from '../../auth/join';

/** How a role reads in the middle of a sentence: "as a caregiver", "with view only access". */
const AS_ROLE: Record<Role, string> = {
  OWNER: 'as the owner',
  PARENT: 'as a parent',
  CAREGIVER: 'as a caregiver',
  VIEW_ONLY: 'with view only access',
};

/** What the joiner may do, said to them (core's `ROLE_DETAILS` says it to the inviter). */
const YOU_CAN: Record<Role, string> = {
  OWNER: 'You can do everything, including the plan.',
  PARENT: 'You can log and correct anything, set the routine and invite people.',
  CAREGIVER: 'You can log, and correct your own entries. You get reminders only while you’re on.',
  VIEW_ONLY: 'You can see the day. You can’t log or change anything.',
};

/** A seat's length as a person says it, for the lengths Family offers and any other. */
export function seatLength(hours: number): string {
  if (hours === 6) return 'six hours';
  if (hours === 24) return 'one day';
  if (hours === 24 * 7) return 'one week';
  if (hours === 24 * 30) return '30 days';
  if (hours % 24 === 0) return hours / 24 === 1 ? 'one day' : `${hours / 24} days`;
  return hours === 1 ? 'one hour' : `${hours} hours`;
}

/** "the household" when the server gave no name, the bare name otherwise. */
const named = (household: string): string => (household.trim() === '' ? '' : household.trim());

export const JOIN = {
  /* ---------------------------------------------------------------- the first screen */
  door: {
    title: 'Invited by your family?',
    body: 'Caregivers get their own login. Never share one.',
    /** The button that opens the code entry (it said "Use an invite code" until 2026-09-29). */
    button: 'Join a household',
  },
  /** AUTH while an invite is held: the card at the top, the heading, the line under it. */
  auth: {
    saved: (household: string): string =>
      named(household) === ''
        ? 'Your invite is saved.'
        : `Your invite to ${named(household)} is saved.`,
    createTitle: 'Create an account to join',
    signInTitle: 'Sign in to join',
    createBlurb: 'You need your own account to join. Once your email is confirmed, you’re in.',
    signInBlurb: 'Sign in with your own account, and you’re in.',
    cardTitle: 'Joining a household',
    cardBody: (household: string): string =>
      named(household) === ''
        ? 'You join as soon as you’re signed in.'
        : `You join ${named(household)} as soon as you’re signed in.`,
    differentCode: 'Enter a different code',
    forget: 'Don’t join',
  },

  /* ---------------------------------------------------------------- the code sheet */
  sheet: {
    title: 'Join a household',
    /**
     * SIX LETTERS FOR FIVE MINUTES since 0144 (the owner, 2026-09-29), and the link as the other
     * way in (0140): a code is read out or typed, a link is tapped or pasted, and both land in
     * this one sheet. Where the code is made is said the way the handoff guide says it: Family is
     * More's first Household row again since 2026-09-29 ("behind their initial at the top" for the
     * two days it was the avatar menu's).
     */
    lede:
      'Type the 6 letters from the person who invited you, or paste the link they sent. They ' +
      'make a code from More → Family. A code lasts 5 minutes.',
    /**
     * A PARENT ALREADY, SAID BEFORE THE CODE IS TYPED (the owner, 2026-10-08: "if I can't, you need
     * to write this … when joining as a parent with existing household"). An account is a parent in
     * one family at most (0153), so a parent's code from another family would only be refused.
     */
    parentRule: (household: string): string =>
      `${named(household) === '' ? 'You’re a parent in your own family' : `You’re a parent in ${named(household)}`}. An account can be a parent in one family only, so a code for another family needs to be for a caregiver or view only.`,
    field: 'Invite code, 6 letters',
    /** Signed out: the code is checked, and nothing is joined yet. */
    check: 'Continue',
    /** Signed in with no household: the code joins. */
    join: 'Join household',
    /** Reads the clipboard once, on the tap: a code or a link, or a whole message holding one. */
    paste: 'Paste code or link',
    pasteEmpty: 'Nothing to paste. Copy the code or the link first.',
    pasteNothing: 'That is not a code or an invite link. Copy it again and paste.',
    cancel: 'Cancel',
    incomplete: 'Enter all 6 letters of the code.',
    footnote:
      'Everyone gets their own login. A parent can change or remove your access at any time.',
  },
  /** The sheet once a code checked out, signed out: whose it is, and that an account comes next. */
  found: {
    title: (household: string): string =>
      named(household) === '' ? 'Your code is saved' : `This code is for ${named(household)}`,
    invited: (inviter: string, role: Role): string =>
      inviter.trim() === ''
        ? `You’re invited ${AS_ROLE[role]}.`
        : `${inviter.trim()} invited you ${AS_ROLE[role]}.`,
    seat: (hours: number): string =>
      `Your access lasts ${seatLength(hours)} from when you join, then ends by itself.`,
    needAccount: 'To join, you need your own account. Your invite is saved while you make one.',
    /** When the server could not check the code (a server older than the app): honest, no name. */
    unchecked:
      'To join, you need your own account. We check the code and add you as soon as you’re signed in.',
    create: 'Create an account to join',
    signIn: 'Sign in to join',
    different: 'Use a different code',
  },
  /** The sheet for somebody already in a household (from Family): the rule, and the way round it. */
  inHousehold: {
    title: 'Join another household',
    body: (current: string): string =>
      named(current) === ''
        ? `You’re in ${MAX_HOUSEHOLDS} families already, the most an account can be in.`
        : `You’re in ${named(current)} and other families, ${MAX_HOUSEHOLDS} in all, the most an account can be in.`,
    workaround: 'To join another, leave one of your families first, from Family in More.',
    /**
     * NOBODY ELSE IS IN IT (0143; the owner, 2026-09-29): a household set up by mistake is left,
     * not worked round with a second account. Said in place of the workaround, with the way out as
     * the button under it (`leaveFirst`), which opens Family's confirmation.
     */
    alone: (current: string): string =>
      named(current) === ''
        ? 'Nobody else is in your household, so you can leave it and then join with a code.'
        : `Nobody else is in ${named(current)}, so you can leave it and then join with a code.`,
    leaveFirst: (current: string): string =>
      named(current) === '' ? 'Leave your household first' : `Leave ${named(current)} first`,
    close: 'Close',
    /**
     * Family's own door to it: a row like Leave this household's, in the same group (the owner,
     * 2026-09-30: "Why join another household is not a button, it just look different"), its line
     * saying how one joins.
     */
    familyButton: 'Join another household',
    familyDetail: 'With an invite code or link',
  },

  /* ---------------------------------------------------------------- the link, sent */
  /**
   * THE MESSAGE A LINK GOES OUT IN (the owner, 2026-09-29: *"Make sure the email invite also works,
   * and bypasses the need to enter 6 random digit"*). It used to be the bare `cuddlecue://` address,
   * which most mail and message apps show as plain text. Now: who and where, a link that is a link
   * everywhere, and the way in when it will not open the app (paste it in Join a household).
   * `app` is the brand's name, read from brand.json by the caller.
   */
  share: {
    message: (inviter: string, household: string, app: string, link: string): string => {
      const who = inviter.trim();
      const where = named(household) === '' ? 'their household' : named(household);
      const opening =
        who === ''
          ? `You’re invited to join ${where} on ${app}.`
          : `${who} invited you to join ${where} on ${app}.`;
      return [
        opening,
        `Tap to join: ${link}`,
        `It works once, for 48 hours. If the link does not open ${app}, open it, tap Join a household, and paste this message.`,
      ].join('\n\n');
    },
    /** Family, once the link went out. */
    sent: 'Link shared. It works once, for 48 hours.',
    /**
     * INVITING A PARENT, the rule said where the role is picked (the owner, 2026-10-08): somebody
     * who is a parent in another family already cannot take this seat (0153).
     */
    parentRule:
      'An account can be a parent in one family only. If they’re already a parent in another family, invite them as a caregiver instead.',
  },

  /* ---------------------------------------------------------------- Verify */
  verify: (household: string): string =>
    named(household) === ''
      ? 'Your invite is saved. Open the email on this phone, and you join right away.'
      : `Your invite to ${named(household)} is saved. Open the email on this phone, and you join right away.`,

  /* ---------------------------------------------------------------- the join page */
  joining: {
    eyebrow: 'Invitation',
    title: (household: string): string =>
      named(household) === '' ? 'Joining your household' : `Joining ${named(household)}`,
    blurb: 'One moment. We’re adding you now.',
    retry: 'Try again',
    newCode: 'Enter a new code',
    setUpInstead: 'Set up a new household instead',
    notNow: 'Not now',
  },

  /* ---------------------------------------------------------------- the confirmation */
  joined: {
    eyebrow: 'You’re in',
    title: (household: string): string =>
      named(household) === '' ? 'You joined the household' : `You joined ${named(household)}`,
    role: (role: Role): string => `You’re in ${AS_ROLE[role]}. ${YOU_CAN[role]}`,
    seat: (hours: number): string =>
      `Your access lasts ${seatLength(hours)} from now, then ends by itself.`,
    nameLabel: 'Your name',
    nameHelp: 'This is what everyone in the household sees on the entries you log.',
    continue: 'Continue',
    /** Only after a name could not be saved: go on with the name the account has. */
    skip: 'Keep my current name',
    nameFailed: 'Your name was not saved. Check your connection, then try again.',
  },
  /** An invite held while signing in to an account that already has a household. */
  notUsed: {
    eyebrow: 'Invitation',
    title: 'Your invite was not used',
    body: (current: string, invited: string, why?: NotUsedWhy): string => {
      const here = named(current);
      const there = named(invited);
      if (here !== '' && there !== '' && here === there) return `You’re already in ${here}.`;
      const notUsed =
        there === '' ? 'This invite was not used.' : `Your invite to ${there} was not used.`;
      switch (why) {
        // 0153: a parent in one family joins any other as a caregiver (or view only)
        case 'parent_elsewhere':
          return `${here === '' ? 'You’re a parent in your own family' : `You’re a parent in ${here}`}, and an account can be a parent in one family. ${notUsed}`;
        case 'limit':
          return `${here === '' ? 'You’re already in a household' : `You’re already in ${here}`}, and ${MAX_HOUSEHOLDS} families are the most an account can be in. ${notUsed}`;
        case 'dead':
          return there === ''
            ? 'This invite no longer works, so it was not used.'
            : `Your invite to ${there} no longer works, so it was not used.`;
        default:
          return `${here === '' ? 'You’re already in a household' : `You’re already in ${here}`}. ${notUsed}`;
      }
    },
    /** What to do about it, for a reason that has a way through other than leaving. */
    next: (why?: NotUsedWhy): string | null =>
      why === 'parent_elsewhere'
        ? 'Ask the person who invited you for a caregiver invite. It joins you to their family and keeps yours.'
        : why === 'dead'
          ? 'Ask the person who invited you for a new code.'
          : null,
    /**
     * …and nobody else is in the household they are in (0143): leaving it is the way through. The
     * invite itself is gone from the phone by now, so the next step is a new code.
     */
    alone: (current: string): string =>
      named(current) === ''
        ? 'Nobody else is in your household, so you can leave it. Then join with a new code.'
        : `Nobody else is in ${named(current)}, so you can leave it. Then join with a new code.`,
    ok: 'OK',
  },

  /* ---------------------------------------------------------------- what went wrong, and what next */
  refusal: {
    /** Wrong, used, expired, revoked, unknown: the server never says which (ACCOUNTS.md §3.5). */
    wrongCode: 'That code did not work. Check the 6 letters, or ask for a new code.',
    link: 'This invite no longer works. Ask the person who invited you for a new code.',
    own: 'That is your own invite. Share it with the person joining.',
    codeExpired:
      'That code has expired. Codes last 5 minutes, so ask the person who invited you for a new one.',
    linkExpired: 'This invite has expired. Ask the person who invited you for a new code.',
    /**
     * A caregiver's or a viewer's seat, and a household whose Plus is not on now (0139). Nothing
     * is spent: once the household turns Plus on, the same invite works. `role` is null when
     * nothing checked the invite before the join refused it.
     */
    needsPlus: (household: string, role: Role | null): string => {
      const seat =
        role === 'VIEW_ONLY'
          ? 'View only access'
          : role === 'CAREGIVER'
            ? 'A caregiver’s seat'
            : 'This invite';
      const who = named(household) === '' ? 'the household' : named(household);
      return `${seat} comes with the Plus plan, and ${who} doesn’t have it on right now. Ask the person who invited you.`;
    },
    rateLimited: 'Too many tries. Wait ten minutes, then try again.',
    /** Signed out, this connection's ten wrong codes an hour (0140): a link still works. */
    connectionLimited:
      'Too many wrong codes from this connection. Try again in an hour, or ask for an invite link.',
    /** Everybody's thousand wrong codes in ten minutes (0140): codes wait, links do not. */
    codesPaused:
      'Invite codes are paused for a few minutes. Try again soon, or ask for an invite link.',
    offline: 'No connection. Check your network and try again.',
    offlineHeld: (household: string): string =>
      named(household) === ''
        ? 'No connection. We’ll add you as soon as you’re back online.'
        : `No connection. We’ll add you to ${named(household)} as soon as you’re back online.`,
    unverified: 'Confirm your email first, then try the code again.',
    /** 0153: five families at most, and a parent in one of them. */
    householdLimit: `You’re in ${MAX_HOUSEHOLDS} families already, the most an account can be in. Leave one first.`,
    parentElsewhere:
      'You’re already a parent in your own family, and an account can be a parent in one family only. Ask them to invite you as a caregiver instead.',
    failed: 'Something went wrong. Please try again.',
  },
} as const;
