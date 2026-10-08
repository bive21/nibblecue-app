import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { INVITE_CODE_LENGTH } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import {
  EMAIL_LOOKS_WRONG,
  EMAIL_NEEDED,
  emailEntryError,
  checkRefusalSentence,
  CODE_MINUTES,
  EMAIL_LINK_LIFETIME,
  FORCED_SIGN_OUT,
  FORCED_SIGN_OUT_HOUSEHOLD,
  forcedSignOutSentence,
  INVITE_FAILED,
  inviteLapseSentence,
  inviteRefusal,
  joinProblemSentence,
  LINK_HOURS,
  linkProblemNotice,
} from './copy';
import { JOIN } from './joinCopy';

/**
 * THE AUTH SCREENS' WORDS AFTER THE FIRST-DAY TRACE (2026-09-25): how long an emailed link lasts,
 * what a dead link or a dead invite is called, and the one sentence a forced sign-out gets. The
 * screens are `.tsx` over React Native, so their wiring is read as source, the way
 * `AuthScreen.test.ts` reads the consent box.
 */
const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string) => readFileSync(join(here, rel), 'utf8');
const stripComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const flat = (rel: string) => stripComments(read(rel)).replace(/\s+/g, ' ');

describe('an emailed link lasts an hour, and every screen that says so says an hour', () => {
  it('is Supabase Auth’s default Email OTP expiration, 3600 s, in words', () => {
    expect(EMAIL_LINK_LIFETIME).toBe('an hour');
  });

  it('is what Verify and the reset page say', () => {
    expect(flat('VerifyScreen.tsx')).toContain(
      '{`The link works once and expires in ${EMAIL_LINK_LIFETIME}.`}',
    );
    expect(flat('ResetPasswordScreen.tsx')).toContain(
      'blurb={`We will email you a link. It works once and expires in ${EMAIL_LINK_LIFETIME}.`}',
    );
  });

  it('offers no emailed sign-in link: a forgotten password is reset (the owner, 2026-09-27)', () => {
    const auth = flat('AuthScreen.tsx');
    expect(auth).not.toContain('Email me a sign-in link instead');
    expect(auth).not.toContain('sendMagicLink');
    expect(auth).toContain('label="Forgot password?"');
  });

  it('never gives a link a code’s life: 15 minutes until 0144, 5 since, and an email an hour', () => {
    // every auth screen, and the sheets a signed-out parent can open
    const files = [
      ...readdirSync(here)
        .filter(f => f.endsWith('.tsx'))
        .map(f => join(here, f)),
    ];
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      expect(src, f).not.toMatch(/link[^`'"]*\b1?5 minutes|\b1?5 minutes[^`'"]*link/i);
    }
  });
});

describe('the sentence a forced sign-out lands on', () => {
  it('is one sentence that says why, in the parent’s words', () => {
    expect(FORCED_SIGN_OUT).toMatch(/^[A-Z][^.]*\.$/);
    expect(FORCED_SIGN_OUT).toContain('because');
    expect(FORCED_SIGN_OUT).not.toMatch(/session|token|server|supabase/i);
  });

  it('is what AUTH shows for it — the sentence chosen by why it happened', () => {
    expect(flat('AuthScreen.tsx')).toContain(
      "{forcedSignOut ? notice(forcedSignOutSentence(forcedSignOut), 'auth.forced_notice') : null}",
    );
    expect(forcedSignOutSentence('session')).toBe(FORCED_SIGN_OUT);
    expect(forcedSignOutSentence('household')).toBe(FORCED_SIGN_OUT_HOUSEHOLD);
  });
});

/**
 * THE SIGN-OUT A REFUSED PULL FALLS BACK TO (2026-09-25; `auth/mirror.ts`): the household's entries
 * stopped coming, and the account could not be read to say why. It used to land on AUTH with no
 * sentence at all. The reader may have been removed, may be a sitter whose evening ran out, or may
 * be a parent hit by a server fault — so it holds the Ended screen's rule: every reason possible,
 * none asserted, nobody blamed.
 */
describe('the sentence a household the phone could not confirm lands on', () => {
  it('says why in one sentence, then what to do in one more', () => {
    const [why, next, ...rest] = FORCED_SIGN_OUT_HOUSEHOLD.split(/(?<=\.) /);
    expect(rest).toEqual([]);
    expect(why).toMatch(/^You were signed out because [^.]*\.$/);
    expect(next).toMatch(/^Sign in again\b[^.]*\.$/);
  });

  it('names no system, and says nothing the app does not know', () => {
    expect(FORCED_SIGN_OUT_HOUSEHOLD).not.toMatch(/session|token|server|supabase|sync|error/i);
    // the words the Ended screen is held to (core's standing.test.ts), for the same reason
    for (const word of [
      'removed',
      'kicked',
      'revoked',
      'expired',
      'denied',
      'no longer allowed',
      'lost',
      'deleted',
    ])
      expect(FORCED_SIGN_OUT_HOUSEHOLD.toLowerCase(), word).not.toContain(word);
    // and it is not the other sentence: this sign-in did not stop being valid
    expect(FORCED_SIGN_OUT_HOUSEHOLD).not.toBe(FORCED_SIGN_OUT);
    expect(FORCED_SIGN_OUT_HOUSEHOLD).not.toContain('no longer valid');
    expect(FORCED_SIGN_OUT_HOUSEHOLD).toContain('household');
  });
});

describe('an emailed link that did not work is said where the parent is looking', () => {
  it('on AUTH, which turns to its sign-in side where the two ways on are', () => {
    const auth = flat('AuthScreen.tsx');
    expect(auth).toContain(
      "{linkProblem ? notice(linkProblemNotice(linkProblem, 'auth'), 'auth.link_problem') : null}",
    );
    expect(auth).toContain("if (linkProblem !== null) setMode('signin');");
    // a new link sent is a new link: the notice about the old one goes — sent from the reset page
    // now, the one emailed way back in since the sign-in link went (2026-09-27)
    expect(flat('ResetPasswordScreen.tsx')).toContain('actions.clearLinkProblem();');
  });

  it('on Verify, above the resend it names', () => {
    const verify = flat('VerifyScreen.tsx');
    expect(verify).toContain("linkProblemNotice(linkProblem, 'verify')");
    expect(verify).toContain('testID="verify.link_problem"');
    expect(verify.indexOf('verify.link_problem')).toBeLessThan(verify.indexOf('verify.resend'));
    expect(verify).toContain('actions.clearLinkProblem();');
    // always a way back to AUTH on iPhone (no system Back; goBack is not enough after a deep link)
    expect(verify).toContain('label="Back to sign in"');
    expect(verify).toContain('testID="verify.back"');
    expect(verify).toContain('backToSignIn');
    // with a link problem, Back is secondary (not ghost) so it is hard to miss
    expect(verify).toContain("variant={linkProblem ? 'secondary' : 'ghost'}");
    expect(verify.indexOf('verify.back')).toBeLessThan(verify.indexOf('verify.mock_open_link'));
  });

  it('Verify expired copy leads with sign-in (confirmation often already landed)', () => {
    expect(linkProblemNotice({ flow: 'sign_in', reason: 'expired' }, 'verify')).toBe(
      'That link has expired or was already used. Sign in with your password, or tap Resend the email.',
    );
  });
});

describe('a held invite that stopped working', () => {
  it('asks for a fresh code, and a clock-expired one says how long codes last', () => {
    const code = inviteLapseSentence({ reason: 'expired', kind: 'code' });
    expect(code).toBe(
      'That code has expired. Codes last 5 minutes, so ask the person who invited you for a new one.',
    );
    // a link — or a code checked before the account, which is held as one (0139) — is "this
    // invite", never a mechanism the person did not use
    expect(inviteLapseSentence({ reason: 'expired', kind: 'link' })).toBe(
      'This invite has expired. Ask the person who invited you for a new code.',
    );
    // a refusal says what the code sheet says, identical for every reason (ACCOUNTS.md §3.5)
    expect(inviteLapseSentence({ reason: 'refused', kind: 'code' })).toBe(INVITE_FAILED);
    expect(inviteLapseSentence({ reason: 'own', kind: 'code' })).toBe(JOIN.refusal.own);
    expect(
      inviteLapseSentence({
        reason: 'needs_plus',
        kind: 'link',
        household: 'Dana’s family',
        role: 'CAREGIVER',
      }),
    ).toBe(JOIN.refusal.needsPlus('Dana’s family', 'CAREGIVER'));
    for (const lapse of [
      { reason: 'expired', kind: 'code' },
      { reason: 'expired', kind: 'link' },
      { reason: 'refused', kind: 'code' },
      { reason: 'refused', kind: 'link' },
      { reason: 'needs_plus', kind: 'link' },
    ] as const)
      expect(inviteLapseSentence(lapse), JSON.stringify(lapse)).toMatch(/[Aa]sk /);
    // and none has a dash in it (the owner's voice: short sentences, no dashes)
    for (const reason of ['expired', 'refused', 'own', 'needs_plus'] as const)
      for (const kind of ['code', 'link'] as const)
        expect(inviteLapseSentence({ reason, kind })).not.toMatch(/[‒–—―]| - /);
  });

  it('is said on AUTH too, when it ran out before the account existed', () => {
    expect(flat('AuthScreen.tsx')).toContain(
      "{inviteLapse ? notice(inviteLapseSentence(inviteLapse), 'auth.invite_lapsed') : null}",
    );
  });
});

describe('one table for a refused join, shared by the code sheet and the join page', () => {
  it('clears the invite only when the server will never take it from this person', () => {
    expect(inviteRefusal({ status: 404, error: 'invalid_invite' })).toEqual({
      sentence: INVITE_FAILED,
      invite: 'refused',
    });
    expect(inviteRefusal({ status: 409, error: 'own_invite' }).invite).toBe('refused');
    expect(inviteRefusal({ status: 409, error: 'already_member' }).invite).toBe('joined');
    // nothing was decided about the code itself: a limit, an unconfirmed address, a fault
    expect(inviteRefusal({ status: 429, error: 'rate_limited' }).invite).toBe('kept');
    expect(inviteRefusal({ status: 401, error: 'unverified_email' })).toEqual({
      sentence: 'Confirm your email first, then try the code again.',
      invite: 'kept',
    });
    // a join is only offered to a confirmed address: any other 401 is a lapsed token, never a
    // reason to go looking for an email (2026-09-27)
    expect(inviteRefusal({ status: 401, error: 'unauthenticated' })).toEqual({
      sentence: 'Something went wrong. Please try again.',
      invite: 'kept',
    });
    expect(inviteRefusal({ status: 500, error: 'server_error' }).invite).toBe('kept');
  });

  it('keeps the sheet’s own sentences, word for word', () => {
    expect(inviteRefusal({ status: 429, error: 'rate_limited' }).sentence).toBe(
      'Too many tries. Wait ten minutes, then try again.',
    );
    expect(inviteRefusal({ status: 409, error: 'already_member' }).sentence).toBe(
      'You are already in that household.',
    );
    expect(inviteRefusal({ status: 409, error: 'own_invite' }).sentence).toBe(
      'That is your own invite. Share it with the person joining.',
    );
    // 0139's two: neither decides anything about the invite itself
    expect(inviteRefusal({ status: 409, error: 'in_another_household' })).toEqual({
      sentence: JOIN.inHousehold.body(''),
      invite: 'kept',
    });
    expect(inviteRefusal({ status: 403, error: 'needs_plus' }).invite).toBe('kept');
    // the sheet says a refusal where the code was typed; the account-first read for a used code
    // lives in the one join (`auth/join.ts` `redeemInvite`, join.test.ts)
    const sheet = stripComments(read('../../sheets/JoinCodeSheet.tsx')).replace(/\s+/g, ' ');
    // a link pasted or tapped into the sheet (0140) is refused as a link that no longer works,
    // never as a code with the wrong letters
    expect(sheet).toContain(
      "setError( outcome.reason === 'own' ? JOIN.refusal.own : 'token' in ask ? JOIN.refusal.link : INVITE_FAILED, );",
    );
    expect(sheet).toContain(
      "setError( 'token' in ask && outcome.reason === 'wrong' ? JOIN.refusal.link : checkRefusalSentence(outcome), );",
    );
  });
});

describe('the join’s words: what happened, then what next, and never a dash', () => {
  /**
   * Every string the table holds, with its functions called on a name and on none. A function
   * takes names or a number of hours, never both, so each is called with the shapes it can take —
   * one that throws on a shape is not given that shape — and every one must answer to at least one.
   */
  const words = (): string[] => {
    const out: string[] = [];
    const visit = (v: unknown): void => {
      if (typeof v === 'string') out.push(v);
      else if (typeof v === 'function') {
        const f = v as (...a: unknown[]) => unknown;
        let answered = 0;
        for (const args of [
          ['Dana’s family', 'CAREGIVER'],
          ['', 'VIEW_ONLY'],
          ['Dana', 'PARENT'],
          [6],
          [24 * 7],
          ['Dana’s family', 'Sam’s family'],
        ]) {
          let said: unknown;
          try {
            said = f(...args);
          } catch (e) {
            if (e instanceof TypeError) continue;
            throw e;
          }
          answered += 1;
          visit(said);
        }
        expect(answered, f.toString()).toBeGreaterThan(0);
      } else if (typeof v === 'object' && v !== null) Object.values(v).forEach(visit);
    };
    visit(JOIN);
    return out.filter(s => s !== '');
  };

  it('says no dash anywhere a person reads, and spells US English', () => {
    const all = words();
    expect(all.length).toBeGreaterThan(40);
    for (const s of all) {
      expect(s, s).not.toMatch(/[‒–—―]| - /);
      for (const uk of ['colour', 'cancelled', 'favourite', 'grey', 'centre', 'analyse'])
        expect(s.toLowerCase(), s).not.toContain(uk);
    }
    // and none names a system: no server, no Supabase, no token, no claim, no HTTP
    for (const s of all)
      expect(s.toLowerCase(), s).not.toMatch(/\b(server|supabase|token|claim|http|rpc)\b/);
  });

  it('holds every lifetime and every count of letters it states to core’s', () => {
    expect(JOIN.sheet.lede).toContain(`${CODE_MINUTES} minutes`);
    expect(JOIN.refusal.codeExpired).toContain(`${CODE_MINUTES} minutes`);
    expect(CODE_MINUTES).toBe(5);
    expect(LINK_HOURS).toBe(48);
    // six letters since 0144, said the same way everywhere a person reads the count
    for (const s of [
      JOIN.sheet.lede,
      JOIN.sheet.field,
      JOIN.sheet.incomplete,
      JOIN.refusal.wrongCode,
    ])
      expect(s, s).toContain(`${INVITE_CODE_LENGTH} letters`);
    expect(INVITE_CODE_LENGTH).toBe(6);
  });

  it('names the household when it is known, and reads as a sentence when it is not', () => {
    expect(JOIN.found.title('Dana’s family')).toBe('This code is for Dana’s family');
    expect(JOIN.found.title('')).toBe('Your code is saved');
    expect(JOIN.auth.saved('Dana’s family')).toBe('Your invite to Dana’s family is saved.');
    expect(JOIN.auth.saved('')).toBe('Your invite is saved.');
    expect(JOIN.joined.title('Dana’s family')).toBe('You joined Dana’s family');
    expect(JOIN.joined.title('  ')).toBe('You joined the household');
    expect(JOIN.found.invited('Dana', 'CAREGIVER')).toBe('Dana invited you as a caregiver.');
    expect(JOIN.found.invited('', 'VIEW_ONLY')).toBe('You’re invited with view only access.');
    expect(JOIN.joined.role('PARENT')).toMatch(/^You’re in as a parent\. You can log/);
    expect(JOIN.joined.seat(6)).toBe('Your access lasts six hours from now, then ends by itself.');
    expect(JOIN.found.seat(24 * 30)).toContain('30 days');
  });

  it('tells the five-family limit plainly, and the same household as already in (0153)', () => {
    expect(JOIN.notUsed.body('Dana’s family', 'Sam’s family', 'limit')).toBe(
      'You’re already in Dana’s family, and 5 families are the most an account can be in. Your invite to Sam’s family was not used.',
    );
    // the limit is said only when it is the reason (2026-10-07: it was said to a parent in one family)
    expect(JOIN.notUsed.body('Bradley’s family', 'Sam’s family', 'parent_elsewhere')).toBe(
      'You’re a parent in Bradley’s family, and an account can be a parent in one family. Your invite to Sam’s family was not used.',
    );
    expect(JOIN.notUsed.next('parent_elsewhere')).toMatch(/caregiver invite/);
    expect(JOIN.notUsed.body('Dana’s family', 'Sam’s family')).toBe(
      'You’re already in Dana’s family. Your invite to Sam’s family was not used.',
    );
    expect(JOIN.notUsed.body('Dana’s family', 'Sam’s family', 'dead')).toBe(
      'Your invite to Sam’s family no longer works, so it was not used.',
    );
    for (const why of ['parent_elsewhere', 'in_one', 'dead'] as const)
      expect(JOIN.notUsed.body('Dana’s family', 'Sam’s family', why)).not.toMatch(/5 families/);
    expect(JOIN.notUsed.body('Dana’s family', 'Dana’s family')).toBe(
      'You’re already in Dana’s family.',
    );
    expect(JOIN.notUsed.body('', '')).toContain('This invite was not used.');
    expect(JOIN.inHousehold.body('Dana’s family')).toBe(
      'You’re in Dana’s family and other families, 5 in all, the most an account can be in.',
    );
    // and the way through, which is leaving one: no second account any more
    expect(JOIN.inHousehold.workaround).toMatch(/leave one of your families first/);
    expect(JOIN.refusal.householdLimit).toMatch(/^You’re in 5 families already/);
    expect(JOIN.refusal.parentElsewhere).toMatch(/as a caregiver instead\.$/);
  });

  it('names the seat a Plus refusal is about', () => {
    expect(JOIN.refusal.needsPlus('Dana’s family', 'CAREGIVER')).toBe(
      'A caregiver’s seat comes with the Plus plan, and Dana’s family doesn’t have it on right now. Ask the person who invited you.',
    );
    expect(JOIN.refusal.needsPlus('', 'VIEW_ONLY')).toMatch(/^View only access comes with/);
    expect(JOIN.refusal.needsPlus('', null)).toMatch(/^This invite comes with .* the household /);
  });

  it('says every refused check where the code was typed, and each kept problem with its next step', () => {
    expect(checkRefusalSentence({ kind: 'refused', reason: 'wrong', preview: null })).toBe(
      INVITE_FAILED,
    );
    expect(checkRefusalSentence({ kind: 'refused', reason: 'rate_limited', preview: null })).toBe(
      JOIN.refusal.rateLimited,
    );
    expect(checkRefusalSentence({ kind: 'refused', reason: 'failed', preview: null })).toBe(
      JOIN.refusal.failed,
    );
    expect(
      checkRefusalSentence({
        kind: 'refused',
        reason: 'needs_plus',
        preview: {
          household_name: 'Dana’s family',
          inviter_name: 'Dana',
          role: 'CAREGIVER',
          seat_hours: 6,
        },
      }),
    ).toContain('Dana’s family');
    expect(joinProblemSentence('offline', 'Dana’s family', null)).toBe(
      'No connection. We’ll add you to Dana’s family as soon as you’re back online.',
    );
    expect(joinProblemSentence('rate_limited', '', null)).toBe(JOIN.refusal.rateLimited);
    expect(joinProblemSentence('unverified', '', null)).toBe(JOIN.refusal.unverified);
    expect(joinProblemSentence('failed', '', null)).toBe(JOIN.refusal.failed);
    expect(joinProblemSentence('needs_plus', '', 'CAREGIVER')).toMatch(/Plus plan/);
  });
});

describe('a typed email that fails the shape says so', () => {
  it('asks for an address when the field is empty', () => {
    expect(emailEntryError('')).toBe(EMAIL_NEEDED);
    expect(emailEntryError('   ')).toBe(EMAIL_NEEDED);
  });

  it('names a bad shape, including a missing dot before com', () => {
    expect(emailEntryError('Bradley.iversen21+45@gmailcom')).toBe(EMAIL_LOOKS_WRONG);
    expect(emailEntryError('not-an-email')).toBe(EMAIL_LOOKS_WRONG);
    expect(EMAIL_LOOKS_WRONG).toContain('name@email.com');
  });

  it('accepts a normal address', () => {
    expect(emailEntryError('Bradley.iversen21+45@gmail.com')).toBeNull();
  });
});
