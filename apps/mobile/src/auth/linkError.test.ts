import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { linkProblemNotice } from '../screens/auth/copy';
import { authLinkProblem, exchangeProblem, linkFlow } from './linkError';
import { linkExchange } from './linkExchange';

/**
 * AN EXPIRED OR USED EMAIL LINK SAYS SO (the first-day trace, 2026-09-25). Auth sends the parent
 * back to the app with the reason in the return address, and the app used to drop it on the floor.
 * The first block reads return addresses in the shapes Auth writes them; the second runs the REAL
 * supabase-js client the app ships against a fake Auth server, so the errors `exchangeProblem`
 * reads are the ones a phone actually gets back.
 */

const CALLBACK = 'cuddlecue://auth/callback';
const RECOVERY = 'cuddlecue://auth/recovery';
const EXPIRED =
  'error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired';

describe('what the return address says', () => {
  it('reads the trace’s own link: expired or used, in the query', () => {
    expect(authLinkProblem(`${CALLBACK}?${EXPIRED}`)).toEqual({
      flow: 'sign_in',
      reason: 'expired',
    });
  });

  it('reads it from the fragment too, where the implicit flow puts it', () => {
    expect(authLinkProblem(`${CALLBACK}#${EXPIRED}`)).toEqual({
      flow: 'sign_in',
      reason: 'expired',
    });
    // and with an empty query in front of the fragment
    expect(authLinkProblem(`${CALLBACK}?#${EXPIRED}`)).toMatchObject({ reason: 'expired' });
  });

  it('knows a reset link from a sign-in link by where it comes back to', () => {
    expect(authLinkProblem(`${RECOVERY}?${EXPIRED}`)).toEqual({
      flow: 'recovery',
      reason: 'expired',
    });
    expect(linkFlow(`${RECOVERY}?code=abc`)).toBe('recovery');
    expect(linkFlow(RECOVERY)).toBe('recovery');
    expect(linkFlow(`${CALLBACK}?code=abc`)).toBe('sign_in');
    // a path that only starts with the word is not the recovery route
    expect(linkFlow('cuddlecue://auth/recoveryish?x=1')).toBe('sign_in');
  });

  it('calls any other error a link that could not sign in, rather than guessing it expired', () => {
    expect(
      authLinkProblem(
        `${CALLBACK}?error=server_error&error_code=unexpected_failure&error_description=Database+error`,
      ),
    ).toEqual({ flow: 'sign_in', reason: 'failed' });
    expect(authLinkProblem(`${CALLBACK}?error_description=Something+odd`)).toEqual({
      flow: 'sign_in',
      reason: 'failed',
    });
    // Auth's words are enough on their own when it leaves the code out
    expect(authLinkProblem(`${CALLBACK}?error_description=Token+has+expired`)).toMatchObject({
      reason: 'expired',
    });
  });

  it('reports nothing for a link that carries a code or tokens: that is the exchange’s to judge', () => {
    expect(authLinkProblem(`${CALLBACK}?code=6f1c2`)).toBeNull();
    expect(authLinkProblem(`${RECOVERY}?code=6f1c2`)).toBeNull();
    expect(authLinkProblem(`${CALLBACK}#access_token=a&refresh_token=r&type=signup`)).toBeNull();
    expect(authLinkProblem(CALLBACK)).toBeNull();
  });
});

describe('every problem has plain words and a way on, on both screens that show it', () => {
  it('says what happened, then what to do', () => {
    for (const flow of ['sign_in', 'recovery'] as const)
      for (const reason of ['expired', 'offline', 'failed'] as const)
        for (const on of ['auth', 'verify'] as const) {
          const line = linkProblemNotice({ flow, reason }, on);
          // two sentences: what happened, then what to do
          expect(line, `${flow}/${reason}/${on}`).toMatch(/^[A-Z][^.]*\. [A-Z][^.]*\.$/);
          expect(line.length, line).toBeLessThanOrEqual(120);
          // US English, sentence case, and no system named (screens/auth/copy.ts)
          expect(line).not.toMatch(/supabase|token|OTP|PKCE|server/i);
        }
  });

  it('uses the words the trace asked for', () => {
    expect(linkProblemNotice({ flow: 'sign_in', reason: 'expired' }, 'auth')).toBe(
      'That link has expired or was already used. Sign in, or tap Forgot password? for a new link.',
    );
    // Verify: sign-in first — the address is often already confirmed; Resend is the fallback
    expect(linkProblemNotice({ flow: 'sign_in', reason: 'expired' }, 'verify')).toBe(
      'That link has expired or was already used. Sign in with your password, or tap Resend the email.',
    );
    // a reset link points at the button that sends a new one
    expect(linkProblemNotice({ flow: 'recovery', reason: 'expired' }, 'auth')).toContain(
      'Forgot password?',
    );
  });
});

/* ---------------------------------------------------------------------------------------------- */

const URL_ = 'https://abcdefghijklmnopqrst.supabase.co';
const KEY = 'sb_publishable_test';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => void map.set(k, v),
    removeItem: async (k: string) => void map.delete(k),
  };
}

/** Auth with confirmations on, answering the code exchange with whatever `exchange` returns. */
function fakeAuth(exchange: () => Response | Promise<Response>) {
  return async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input : input.url,
    );
    void init;
    if (url.pathname === '/auth/v1/signup')
      return new Response(
        JSON.stringify({
          id: '11111111-1111-1111-1111-111111111111',
          email: 'mia@example.com',
          email_confirmed_at: null,
          identities: [{ id: 'i1' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    if (url.pathname === '/auth/v1/token') return exchange();
    return new Response('{}', { status: 404 });
  };
}

/** GoTrue's error body: the HTTP code, the stable `error_code`, and a sentence. */
const goTrueError = (status: number, errorCode: string, msg: string) => () =>
  new Response(JSON.stringify({ code: status, error_code: errorCode, msg }), {
    status,
    headers: { 'content-type': 'application/json' },
  });

async function exchanged(fetchFn: typeof fetch, link: string, signUpFirst = true) {
  const client = createClient(URL_, KEY, {
    auth: {
      storage: memoryStorage(),
      flowType: 'pkce',
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: { fetch: fetchFn },
  });
  // sign-up is what stores the verifier the emailed link is exchanged with
  if (signUpFirst)
    await client.auth.signUp({
      email: 'mia@example.com',
      password: 'correct horse battery',
      options: { emailRedirectTo: CALLBACK },
    });
  const code = linkExchange(link)?.code ?? '';
  return client.auth.exchangeCodeForSession(code);
}

describe('what a failed exchange on the phone is called (supabase-js as shipped)', () => {
  it('a code whose few minutes ran out: expired', async () => {
    const link = `${CALLBACK}?code=c0de`;
    const { error } = await exchanged(
      fakeAuth(
        goTrueError(400, 'flow_state_expired', 'invalid flow state, flow state has expired'),
      ),
      link,
    );
    expect(error).not.toBeNull();
    expect(exchangeProblem(link, error)).toEqual({ flow: 'sign_in', reason: 'expired' });
  });

  it('a code already exchanged, or from an older email: expired', async () => {
    const link = `${RECOVERY}?code=c0de`;
    for (const [code, msg] of [
      ['flow_state_not_found', 'invalid flow state, no valid flow state found'],
      ['bad_code_verifier', 'code challenge does not match previously saved code verifier'],
    ] as const) {
      const { error } = await exchanged(fakeAuth(goTrueError(400, code, msg)), link);
      expect(exchangeProblem(link, error), code).toEqual({ flow: 'recovery', reason: 'expired' });
    }
  });

  it('no signal: offline, so the words say to open the same link again', async () => {
    const link = `${CALLBACK}?code=c0de`;
    const { error } = await exchanged(
      fakeAuth(() => {
        throw new TypeError('Network request failed');
      }),
      link,
    );
    expect(error?.name).toBe('AuthRetryableFetchError');
    expect(exchangeProblem(link, error)).toEqual({ flow: 'sign_in', reason: 'offline' });
    // and Auth itself falling over reads the same way
    const down = await exchanged(fakeAuth(goTrueError(503, 'unexpected_failure', 'down')), link);
    expect(exchangeProblem(link, down.error)).toEqual({ flow: 'sign_in', reason: 'offline' });
  });

  it('a link opened on a phone that never asked for it: could not sign in here', async () => {
    const link = `${CALLBACK}?code=c0de`;
    // no sign-up on this client, so no verifier: a different phone, or storage cleared since
    const { error } = await exchanged(
      fakeAuth(() => new Response('{}', { status: 500 })),
      link,
      false,
    );
    expect(error?.name).toBe('AuthPKCECodeVerifierMissingError');
    expect(exchangeProblem(link, error)).toEqual({ flow: 'sign_in', reason: 'failed' });
  });

  it('something thrown that is not an auth error at all is the network, never "expired"', () => {
    expect(exchangeProblem(`${CALLBACK}?code=x`, new TypeError('boom'))).toEqual({
      flow: 'sign_in',
      reason: 'offline',
    });
    expect(exchangeProblem(`${CALLBACK}?code=x`, 'weird')).toEqual({
      flow: 'sign_in',
      reason: 'offline',
    });
  });
});
