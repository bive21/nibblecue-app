import { HAS_SERVER_MIGRATIONS, SERVER_MIGRATIONS } from '../testing/serverMigrations';
import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  formatInviteCode,
  heldInviteExpired,
  INVITE_CLAIM_LIFETIME_MS,
  INVITE_CODE_ALPHABET,
  INVITE_CODE_BLOCKED_WORDS,
  INVITE_CODE_LENGTH,
  INVITE_CODE_LIFETIME_MS,
  INVITE_LINK_LIFETIME_MS,
  inviteCodeHasBlockedWord,
  inviteCodeIn,
  inviteLifetimeMs,
  isCompleteInviteCode,
  normalizeInviteCode,
  showAttemptsLeft,
} from './invite-code';

const DIR = `${SERVER_MIGRATIONS}/`;
const migration = (name: string): string => readFileSync(DIR + name, 'utf8');

/** The statements, with the `--` commentary stripped, so an explanation cannot pass for SQL. */
const statements = (sql: string): string => sql.replace(/--[^\n]*/g, ' ');

/**
 * The LAST migration that defines `fn`, as statements. A merged migration is never edited, so the
 * newest definition is the one a database runs; reading it here means the next change to a code's
 * shape or life is checked without this file naming it.
 */
function latestDefining(fn: string): { file: string; sql: string } {
  // `create … function`, so a later `comment on function` does not count as a definition
  const pattern = new RegExp(
    `create\\s+(?:or\\s+replace\\s+)?function\\s+${fn.replace('.', '\\.')}\\s*\\(`,
  );
  const file = readdirSync(DIR)
    .filter(f => /^\d+_.+\.sql$/.test(f))
    .sort()
    .filter(f => pattern.test(statements(migration(f))))
    .at(-1);
  expect(file, `a migration that defines ${fn}`).toBeDefined();
  return { file: file as string, sql: statements(migration(file as string)) };
}

/**
 * How many codes contain none of `words`, counted exactly: the state is the longest end of the
 * code so far that could still grow into a word, and a code is dropped the moment a word ends in
 * it. 26^6 by brute force is 309 million strings; this is a few thousand steps.
 */
function codesWithout(words: readonly string[]): number {
  const starts = new Set<string>(['']);
  for (const w of words) for (let i = 1; i < w.length; i += 1) starts.add(w.slice(0, i));
  const step = (state: string, letter: string): string | null => {
    const s = state + letter;
    for (let i = 0; i < s.length; i += 1) if (words.includes(s.slice(i))) return null;
    for (let i = 0; i <= s.length; i += 1) if (starts.has(s.slice(i))) return s.slice(i);
    return '';
  };
  let counts = new Map<string, number>([['', 1]]);
  for (let n = 0; n < INVITE_CODE_LENGTH; n += 1) {
    const next = new Map<string, number>();
    for (const [state, k] of counts) {
      for (const letter of INVITE_CODE_ALPHABET) {
        const to = step(state, letter);
        if (to !== null) next.set(to, (next.get(to) ?? 0) + k);
      }
    }
    counts = next;
  }
  return [...counts.values()].reduce((a, b) => a + b, 0);
}

describe('the invite code field (ACCOUNTS.md §3.5)', () => {
  it.skipIf(!HAS_SERVER_MIGRATIONS)(
    'is six letters, A to Z, exactly as the server makes and takes them',
    () => {
      expect(INVITE_CODE_LENGTH).toBe(6);
      expect(INVITE_CODE_ALPHABET).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ');
      expect(INVITE_CODE_ALPHABET.length ** INVITE_CODE_LENGTH).toBe(308_915_776);
      // `app.new_invite_code` makes codes of exactly these letters and `app.is_invite_code` takes
      // exactly these (0144): a drift here would have the phone drop a letter the server sends
      const made = latestDefining('app.new_invite_code').sql;
      expect(made).toContain(`alphabet constant text := '${INVITE_CODE_ALPHABET}';`);
      expect(made).toContain(`while length(v_code) < ${INVITE_CODE_LENGTH} loop`);
      // a byte below 234 (9 × 26) and its remainder: every letter equally likely
      expect(made).toContain('if v_byte < 234 and');
      expect(made).toContain('v_byte % 26 + 1');
      expect(latestDefining('app.is_invite_code').sql).toContain(
        `select p_code ~ '^[${INVITE_CODE_ALPHABET}]{${INVITE_CODE_LENGTH}}$'`,
      );
    },
  );

  it('keeps the letters only, upper case, in order, at most six', () => {
    expect(normalizeInviteCode('wdj')).toBe('WDJ');
    expect(normalizeInviteCode('WDJ-B')).toBe('WDJB');
    expect(normalizeInviteCode('wd jb ma')).toBe('WDJBMA');
    expect(normalizeInviteCode('WDJBMAK')).toBe('WDJBMA');
    // a vowel is a letter like any other now; a digit or a mark is never part of a code
    expect(normalizeInviteCode('AE1I')).toBe('AEI');
    expect(normalizeInviteCode('123456')).toBe('');
    expect(normalizeInviteCode('')).toBe('');
  });

  it('finds the code in a pasted message only in a shape a sentence does not make', () => {
    // in capitals, as Family shows it, with or without its dash or a space
    expect(inviteCodeIn('Your code is WDJ-BMA. It works once.')).toBe('WDJBMA');
    expect(inviteCodeIn('Dana invited you. Code WDJ BMA, for 5 minutes.')).toBe('WDJBMA');
    expect(inviteCodeIn('WDJBMA')).toBe('WDJBMA');
    expect(inviteCodeIn('code:WDJ\u2013BMA')).toBe('WDJBMA');
    // in any case with its dash
    expect(inviteCodeIn('Dana: our code is wdj-bma')).toBe('WDJBMA');
    // the whole text, alone
    expect(inviteCodeIn('wdjbma')).toBe('WDJBMA');
    expect(inviteCodeIn('  wdj bma\n')).toBe('WDJBMA');
    expect(normalizeInviteCode('Dana invited you. Code WDJ-BMA, for 5 minutes.')).toBe('WDJBMA');
    // half typed, or too long
    expect(inviteCodeIn('WDJ')).toBeNull();
    expect(inviteCodeIn('WDJBMAK')).toBeNull();
    expect(inviteCodeIn('WDJ-BMAK')).toBeNull();
    // every six-letter word is a well-formed code, so a sentence is never read for its letters
    expect(inviteCodeIn('see you at dinner')).toBeNull();
    expect(inviteCodeIn('please join us tonight')).toBeNull();
    expect(inviteCodeIn('the code is wdj bma')).toBeNull();
    // a run of capitals inside a link's token is not a code standing alone
    expect(
      inviteCodeIn('https://example.test/app/invite/#k3J9ABCDEF2mZa8pLr0sTuVwXyZ12'),
    ).toBeNull();
  });

  it('is complete at exactly six letters', () => {
    expect(isCompleteInviteCode('WDJBMA')).toBe(true);
    expect(isCompleteInviteCode('AEIOUY')).toBe(true);
    expect(isCompleteInviteCode('WDJBM')).toBe(false);
    expect(isCompleteInviteCode('WDJBMAK')).toBe(false);
    // the eight letters of 0140 and the six digits before it
    expect(isCompleteInviteCode('WDJBMJHT')).toBe(false);
    expect(isCompleteInviteCode('123456')).toBe(false);
    expect(isCompleteInviteCode('WDJBM1')).toBe(false);
    expect(isCompleteInviteCode('wdjbma')).toBe(false);
    expect(isCompleteInviteCode(normalizeInviteCode('wdj-bma'))).toBe(true);
  });

  it('reads as two threes', () => {
    expect(formatInviteCode('WDJBMA')).toBe('WDJ-BMA');
    expect(formatInviteCode('WDJ')).toBe('WDJ');
  });

  it('shows attempts remaining only from the third failure', () => {
    expect(showAttemptsLeft(0)).toBe(false);
    expect(showAttemptsLeft(2)).toBe(false);
    expect(showAttemptsLeft(3)).toBe(true);
    expect(showAttemptsLeft(4)).toBe(true);
  });
});

describe('the words a code never holds (0144)', () => {
  it('is a short list of words that fit in a code, none inside another, none twice', () => {
    for (const word of INVITE_CODE_BLOCKED_WORDS) {
      // three letters at the least (two would take a code in forty out), six at the most (a longer
      // word never fits)
      expect(word, word).toMatch(/^[A-Z]{3,6}$/);
      for (const other of INVITE_CODE_BLOCKED_WORDS) {
        if (other !== word) expect(word.includes(other), `${word} holds ${other}`).toBe(false);
      }
    }
    expect(new Set(INVITE_CODE_BLOCKED_WORDS).size).toBe(INVITE_CODE_BLOCKED_WORDS.length);
    expect(INVITE_CODE_BLOCKED_WORDS.length).toBeLessThanOrEqual(60);
  });

  it('finds a word anywhere in a code, across the dash too, in any case', () => {
    expect(inviteCodeHasBlockedWord('FUCKXY')).toBe(true);
    expect(inviteCodeHasBlockedWord('XYZASS')).toBe(true);
    expect(inviteCodeHasBlockedWord(normalizeInviteCode('KIL-LQX'))).toBe(true);
    expect(inviteCodeHasBlockedWord('qdiexr')).toBe(true);
    expect(inviteCodeHasBlockedWord('WDJBMA')).toBe(false);
    expect(inviteCodeHasBlockedWord('KQRSTV')).toBe(false);
    expect(inviteCodeHasBlockedWord('NGZBFC')).toBe(false);
  });

  it('is a courtesy that costs the space a quarter of one percent: 753,876 codes of 308,915,776', () => {
    const clean = codesWithout(INVITE_CODE_BLOCKED_WORDS);
    expect(clean).toBe(308_161_900);
    expect(308_915_776 - clean).toBe(753_876);
    expect((308_915_776 - clean) / 308_915_776).toBeLessThan(0.0025);
    // and the counting is right on a case worked by hand: KKK can start in four places, so by
    // inclusion and exclusion 4·26³ − (3·26² + 2·26 + 1) + (2·26 + 2) − 1 = 68,276 codes hold it
    expect(4 * 26 ** 3 - (3 * 26 ** 2 + 2 * 26 + 1) + (2 * 26 + 2) - 1).toBe(68_276);
    expect(codesWithout(['KKK'])).toBe(26 ** 6 - 68_276);
  });
});

describe('how long an invite lives, and what the phone may conclude from its own clock', () => {
  const MIN = 60_000;
  const HOUR = 60 * MIN;
  const HELD = Date.parse('2026-09-26T09:00:00Z');

  it.skipIf(!HAS_SERVER_MIGRATIONS)(
    'is the server’s own two intervals, read out of the migration that last set them',
    () => {
      // `create_invite` (0008, restated by 0140 and 0144) stamps expires_at; a drift here would have
      // the phone call a live code dead, or keep sending a dead one
      const sql = latestDefining('public.create_invite').sql;
      expect(sql).toContain("v_exp := now() + interval '5 minutes';");
      expect(sql).toContain("v_exp := now() + interval '48 hours';");
      expect(INVITE_CODE_LIFETIME_MS).toBe(5 * MIN);
      expect(INVITE_LINK_LIFETIME_MS).toBe(48 * HOUR);
      expect(inviteLifetimeMs('code')).toBe(INVITE_CODE_LIFETIME_MS);
      expect(inviteLifetimeMs('link')).toBe(INVITE_LINK_LIFETIME_MS);
    },
  );

  it.skipIf(!HAS_SERVER_MIGRATIONS)(
    'gives a code checked before the account the claim `check_invite` makes: a link’s 48 hours',
    () => {
      // 0139 turns a right code into a link-kind invite; the phone holds its token as a link
      expect(migration('0139_join_checked_before_the_account.sql')).toContain(
        "v_expires := now() + interval '48 hours';",
      );
      expect(latestDefining('public.check_invite').sql).toContain(
        "v_expires := now() + interval '48 hours';",
      );
      expect(INVITE_CLAIM_LIFETIME_MS).toBe(48 * HOUR);
      expect(INVITE_CLAIM_LIFETIME_MS).toBe(inviteLifetimeMs('link'));
    },
  );

  it('calls a held code dead once five minutes have passed since the phone took it', () => {
    expect(heldInviteExpired('code', HELD, HELD)).toBe(false);
    expect(heldInviteExpired('code', HELD, HELD + 4 * MIN + 59_999)).toBe(false);
    // the code was made no later than it was typed, so at +5 min it is past its expiry whatever
    // the server's clock says
    expect(heldInviteExpired('code', HELD, HELD + 5 * MIN)).toBe(true);
    // the owner's first day: the email took twenty minutes to arrive
    expect(heldInviteExpired('code', HELD, HELD + 20 * MIN)).toBe(true);
  });

  it('gives a held link its own 48 hours', () => {
    expect(heldInviteExpired('link', HELD, HELD + 20 * MIN)).toBe(false);
    expect(heldInviteExpired('link', HELD, HELD + 47 * HOUR)).toBe(false);
    expect(heldInviteExpired('link', HELD, HELD + 48 * HOUR)).toBe(true);
  });

  it('never calls one dead because the clock went backwards: the server decides then', () => {
    expect(heldInviteExpired('code', HELD, HELD - 3 * HOUR)).toBe(false);
    expect(heldInviteExpired('link', HELD, HELD - 72 * HOUR)).toBe(false);
  });
});
