/**
 * The invite code as typed or pasted (ACCOUNTS.md §3.5). Whether a code WORKS is decided on the
 * server; the client shapes input, and knows one thing on its own — the clock below.
 *
 * SIX LETTERS, A TO Z, FOR FIVE MINUTES since migration 0144 (the owner, 2026-09-29: *"I think 8
 * digit is excessive, just make it alphabetical with 6 digits, so 26^6, and dont make it 15
 * minutes, but maybe just 5 minutes."*). 26^6 is 308,915,776 codes, read out as two threes
 * ("WDJ-BMA"); case, spaces and the dash are ignored, and there are no digits, so one keyboard does
 * it. Five minutes is enough because only TYPING the code has to happen inside them: a code checked
 * before the account becomes a 48-hour claim (0139, below). Until 0144 a code was eight letters from
 * twenty consonants for fifteen minutes (0140), and before that six digits; SECURITY.md §3.3 has
 * what a guesser gets from each. `invite-code.test.ts` reads the alphabet, the length and the
 * lifetime out of the migration that last set them, so the phone and the server cannot drift apart
 * unseen.
 */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
export const INVITE_CODE_LENGTH = 6;

const CODE = /^[A-Z]{6}$/;
/** Half a code: what is read out before the dash. */
const HALF = INVITE_CODE_LENGTH / 2;

/**
 * THE WORDS A CODE NEVER HOLDS (2026-09-29, with the six letters). Of all twenty-six letters a
 * random code can spell a word, and a parent reads the code aloud to another parent, so
 * `app.new_invite_code` (0144) draws again whenever a code CONTAINS one of these, anywhere, across
 * the dash too; the in-app test backend (`auth/providers/mock.ts`) draws from this very list.
 *
 * A courtesy, not a filter the security depends on: it takes 753,876 of the 308,915,776 codes out
 * (0.24%), and a code typed with one of these in it is simply a wrong code. Every entry is three to
 * six capital letters (a longer word never fits in a code; a shorter one would take too many codes
 * out), and none contains another (it would add nothing); `invite-code.test.ts` holds both, and
 * the count. packages/db's `invite-code-words.test.ts` holds the migration's copy,
 * `app.invite_code_blocked_words()`, equal to this one in the same order, and prints the function
 * to paste when they differ.
 *
 * TO CHANGE IT: edit the list and write a NEW migration that redefines
 * `app.invite_code_blocked_words()` with the same list (never edit 0144).
 */
export const INVITE_CODE_BLOCKED_WORDS: readonly string[] = [
  // swearing
  'FUCK',
  'FUK',
  'SHIT',
  'PISS',
  'CUNT',
  'COCK',
  'DICK',
  'TWAT',
  'WANK',
  'ARSE',
  'ASS',
  // sex
  'SEX',
  'CUM',
  'JIZZ',
  'PORN',
  'ORGY',
  'BOOB',
  'TIT',
  'ANAL',
  'ANUS',
  'PENIS',
  'PUSSY',
  'DILDO',
  'BONER',
  'HORNY',
  // abuse aimed at women
  'SLUT',
  'WHORE',
  'BITCH',
  // slurs
  'NIGGER',
  'NIGGA',
  'KIKE',
  'GOOK',
  'SPIC',
  'CHINK',
  'COON',
  'PAKI',
  'WOP',
  'JAP',
  'BEANER',
  'FAG',
  'DYKE',
  'TRANNY',
  'RETARD',
  // harm and hate
  'KILL',
  'RAPE',
  'DIE',
  'DEAD',
  'NAZI',
  'KKK',
];

/**
 * Whether a code holds one of the words above anywhere in it: `app.invite_code_has_blocked_word`
 * (0144), which the integration suite runs against this on the same codes.
 */
export function inviteCodeHasBlockedWord(code: string): boolean {
  const upper = code.toUpperCase();
  return INVITE_CODE_BLOCKED_WORDS.some(word => upper.includes(word));
}

/*
  WHERE A CODE IS IN A MESSAGE. Every six-letter word is a well-formed code now, so a sentence is
  never read for its letters: "see you at dinner" is not SEEYOU. A code is taken out of a text only
  in a shape a sentence does not make by accident, in this order:

    1. in capitals, standing alone: "WDJ-BMA" as Family shows it, "WDJ BMA", "WDJBMA";
    2. in any case with its dash, standing alone: "wdj-bma";
    3. the whole text, give or take spaces and the dash: "wdjbma", " wdj bma ".

  Standing alone is no letter, digit or underscore on either side, so a run of capitals inside a
  link's token is never one. Any dash a phone or a message puts there counts as the dash.
*/
const IN_CAPITALS =
  /(?:^|[^A-Za-z0-9_])([A-Z]{3})(?:[-\u2010-\u2015]| )?([A-Z]{3})(?![A-Za-z0-9_])/;
const WITH_ITS_DASH =
  /(?:^|[^A-Za-z0-9_])([A-Za-z]{3})[-\u2010-\u2015]([A-Za-z]{3})(?![A-Za-z0-9_])/;
const THE_WHOLE_TEXT = /^\s*([A-Za-z]{3})(?:[-\u2010-\u2015]|\s+)?([A-Za-z]{3})\s*$/;

/**
 * The whole code, if the text holds one: what a pasted message or a pasted code gives. Null when it
 * does not, which is also what a half-typed code gives.
 */
export function inviteCodeIn(text: string): string | null {
  const m = IN_CAPITALS.exec(text) ?? WITH_ITS_DASH.exec(text) ?? THE_WHOLE_TEXT.exec(text);
  return m ? `${m[1]}${m[2]}`.toUpperCase() : null;
}

/**
 * What the field holds after a keystroke or a paste: a code found in pasted text as it is, and
 * otherwise the letters in order, upper case, at most six. Anything else is dropped (a code never
 * has a digit or a mark, so a key that is one is never part of one), and so are the dash and the
 * spaces a person or a message adds.
 */
export function normalizeInviteCode(input: string): string {
  const found = inviteCodeIn(input);
  if (found) return found;
  let out = '';
  for (const ch of input.toUpperCase()) {
    if (INVITE_CODE_ALPHABET.includes(ch)) out += ch;
    if (out.length === INVITE_CODE_LENGTH) break;
  }
  return out;
}

export const isCompleteInviteCode = (code: string): boolean => CODE.test(code);

/** As a person reads it out or copies it: two threes, "WDJ-BMA". */
export const formatInviteCode = (code: string): string =>
  code.length > HALF ? `${code.slice(0, HALF)}-${code.slice(HALF)}` : code;

/** The sheet shows attempts remaining only after the third failure (ACCOUNTS.md §3.5). */
export const showAttemptsLeft = (failures: number): boolean => failures >= 3;

/**
 * HOW LONG AN INVITE LIVES, counted from the moment it is MADE (`create_invite`, migration 0008,
 * restated by 0140 and 0144): a code 5 minutes (15 until 0144), a link 48 hours, and either one
 * works once. `invite-code.test.ts` reads the two intervals out of the migration that last set
 * them, so the server and this file cannot drift apart unseen.
 */
export const INVITE_CODE_LIFETIME_MS = 5 * 60_000;
export const INVITE_LINK_LIFETIME_MS = 48 * 60 * 60_000;

/**
 * A CODE CHECKED BEFORE THE ACCOUNT EXISTS BECOMES A CLAIM (`check_invite`, migration 0139; the
 * owner's report of 2026-09-29). A code lived 15 minutes then, five now, and the confirmation
 * email can take an hour, so a partner who typed the code first and then waited for the email came
 * back to a dead code. The server answers a right code with a token that lasts as long as a link,
 * and the phone holds that token — a `'link'` in the terms below — from then on. It is why five
 * minutes is enough: only the typing has to happen inside them. `invite-code.test.ts` reads the
 * interval out of the migration.
 */
export const INVITE_CLAIM_LIFETIME_MS = INVITE_LINK_LIFETIME_MS;

/** What a phone can be holding for a household: a code somebody typed, or a link's token. */
export type InviteKind = 'code' | 'link';

export const inviteLifetimeMs = (kind: InviteKind): number =>
  kind === 'code' ? INVITE_CODE_LIFETIME_MS : INVITE_LINK_LIFETIME_MS;

/**
 * WHETHER AN INVITE THIS PHONE HAS BEEN HOLDING IS CERTAINLY DEAD (the first-day trace,
 * 2026-09-25).
 *
 * A partner types the code on the first screen, creates an account and waits for the confirmation
 * email; the invite waits on the phone meanwhile (`apps/mobile/src/auth/held-invite.ts`), and on
 * Android the wait easily outlasts the app's process. The server is still the only judge of whether
 * a code works, and it never says why one did not. What the phone can know by itself is narrower
 * and certain: the invite was made no later than `heldAt`, the moment the phone took it, so once a
 * whole lifetime has passed since then it has expired, whatever else is true. Sending it anyway
 * would spend one of the five tries a person gets in ten minutes.
 *
 * A clock that went backwards reads as "not yet": the server decides then, as it always did.
 */
export function heldInviteExpired(kind: InviteKind, heldAt: number, now: number): boolean {
  return now - heldAt >= inviteLifetimeMs(kind);
}
