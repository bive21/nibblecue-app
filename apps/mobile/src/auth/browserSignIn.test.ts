import { BRAND } from '@nibblecue/brand';
import { createClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { failureSentence } from '../screens/auth/copy';
import {
  oauthReturn,
  signInThroughBrowser,
  type AuthBrowser,
  type BrowserSheetResult,
} from './browserSignIn';
import { AuthFailure } from './providers/types';

/**
 * GOOGLE SIGN-IN THROUGH THE BROWSER SHEET (`browserSignIn.ts`; the owner, 2026-09-27). The flow
 * runs here against the supabase-js the app ships, with PKCE on as the app sets it
 * (`supabase/client.ts`), a fake Auth server behind `fetch` and a fake browser sheet — so what is
 * checked is what a phone does: the authorize address, the return address, the exchange and the
 * verifier it is made with, and the one word the screen reads for each way it can end.
 */

const URL_ = 'https://abcdefghijklmnopqrst.supabase.co';
const KEY = 'sb_publishable_test';
const RETURN = `${BRAND.urlScheme}://auth/callback`;

const b64url = (buf: Buffer) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/**
 * A client over a fake Auth server. `token` answers the code exchange: a session by default, or
 * whatever the test hands in (an error body, or a thrown network failure).
 */
function world(token?: () => Response | Promise<Response>) {
  const map = new Map<string, string>();
  const storage = {
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => void map.set(k, v),
    removeItem: async (k: string) => void map.delete(k),
  };
  /** Every token request the fake Auth server answered, with its body. */
  const exchanges: { code: string; verifier: string }[] = [];
  const fetchFn = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const json = (status: number, body: object) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    if (url.includes('/auth/v1/token') && url.includes('grant_type=pkce')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as {
        auth_code: string;
        code_verifier: string;
      };
      exchanges.push({ code: body.auth_code, verifier: body.code_verifier });
      if (token) return token();
      const now = Math.floor(Date.now() / 1000);
      return json(200, {
        access_token: 'access-google',
        refresh_token: 'refresh-google',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: now + 3600,
        user: {
          id: '11111111-1111-4111-8111-111111111111',
          aud: 'authenticated',
          role: 'authenticated',
          email: 'parent@example.com',
          email_confirmed_at: new Date().toISOString(),
          app_metadata: { provider: 'google' },
          user_metadata: {},
          created_at: new Date().toISOString(),
        },
      });
    }
    // a password reset while the sheet is open: another PKCE flow, with a newer verifier
    if (url.includes('/auth/v1/recover')) return json(200, {});
    return json(404, { message: `unexpected ${url}` });
  };
  const client = createClient(URL_, KEY, {
    auth: { storage, flowType: 'pkce', autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchFn },
  });
  return { client, exchanges };
}

/** A browser sheet that records what it was opened on and comes back as it is told. */
function sheet(answer: (opened: string) => BrowserSheetResult | Promise<BrowserSheetResult>) {
  const opened: string[] = [];
  const browser: AuthBrowser = {
    openAuthSession: async (url, returnUrl) => {
      expect(returnUrl).toBe(RETURN);
      opened.push(url);
      return answer(url);
    },
  };
  return { browser, opened };
}

const failureOf = async (p: Promise<unknown>): Promise<string> => {
  try {
    await p;
  } catch (err) {
    if (err instanceof AuthFailure) return err.code;
    throw err;
  }
  throw new Error('expected the sign-in to fail');
};

describe('the return address', () => {
  it('carries a code to exchange, and the flow id when Auth adds one', () => {
    expect(oauthReturn(`${RETURN}?code=abc`)).toEqual({ kind: 'code', code: 'abc', flowId: null });
    expect(oauthReturn(`${RETURN}?code=abc&sb_flow_id=f1`)).toEqual({
      kind: 'code',
      code: 'abc',
      flowId: 'f1',
    });
  });

  it('is a choice, not a fault, when the parent said no on Google’s page', () => {
    expect(
      oauthReturn(`${RETURN}?error=access_denied&error_description=The+user+denied+the+request`),
    ).toEqual({ kind: 'refused', failure: 'cancelled' });
    expect(oauthReturn(`${RETURN}#error=access_denied`)).toEqual({
      kind: 'refused',
      failure: 'cancelled',
    });
  });

  it('knows an address that already has an account, by code or by the words', () => {
    for (const code of ['email_exists', 'user_already_exists', 'identity_already_exists'])
      expect(oauthReturn(`${RETURN}?error=server_error&error_code=${code}`)).toEqual({
        kind: 'refused',
        failure: 'account_exists',
      });
    expect(
      oauthReturn(
        `${RETURN}?error=server_error&error_description=Multiple+accounts+with+the+same+email+address`,
      ),
    ).toEqual({ kind: 'refused', failure: 'account_exists' });
  });

  it('is anything else Auth refused with, or nothing at all', () => {
    expect(oauthReturn(`${RETURN}?error=server_error&error_code=unexpected_failure`)).toEqual({
      kind: 'refused',
      failure: 'unknown',
    });
    expect(oauthReturn(RETURN)).toEqual({ kind: 'empty' });
  });
});

describe('the sign-in, against the supabase-js the app ships', () => {
  it('opens Google’s page through the project, and comes back signed in', async () => {
    const w = world();
    const { browser, opened } = sheet(() => ({ type: 'success', url: `${RETURN}?code=c-google` }));
    const session = await signInThroughBrowser({
      auth: w.client.auth,
      browser,
      provider: 'google',
      returnUrl: RETURN,
    });
    expect(session.access_token).toBe('access-google');
    expect(session.user.email).toBe('parent@example.com');

    const page = new URL(opened[0] ?? '');
    expect(`${page.origin}${page.pathname}`).toBe(`${URL_}/auth/v1/authorize`);
    expect(page.searchParams.get('provider')).toBe('google');
    expect(page.searchParams.get('redirect_to')).toBe(RETURN);
    expect(page.searchParams.get('code_challenge_method')).toBe('s256');
    // the verifier sent with the code is the one behind this page's challenge: PKCE, end to end
    const sent = w.exchanges[0];
    expect(sent?.code).toBe('c-google');
    expect(
      b64url(
        createHash('sha256')
          .update(sent?.verifier ?? '')
          .digest(),
      ),
    ).toBe(page.searchParams.get('code_challenge'));
  });

  it('exchanges with its own verifier even when a reset email’s flow began while the page was open', async () => {
    const w = world();
    const { browser, opened } = sheet(async () => {
      await w.client.auth.resetPasswordForEmail('parent@example.com', { redirectTo: RETURN });
      return { type: 'success', url: `${RETURN}?code=c-google` };
    });
    await signInThroughBrowser({
      auth: w.client.auth,
      browser,
      provider: 'google',
      returnUrl: RETURN,
    });
    const challenge = new URL(opened[0] ?? '').searchParams.get('code_challenge');
    const verifier = w.exchanges[0]?.verifier ?? '';
    expect(b64url(createHash('sha256').update(verifier).digest())).toBe(challenge);
  });

  it('tells the provider while the page is open, and when it closes', async () => {
    const w = world();
    const seen: boolean[] = [];
    const { browser } = sheet(() => {
      expect(seen).toEqual([true]);
      return { type: 'success', url: `${RETURN}?code=c` };
    });
    await signInThroughBrowser({
      auth: w.client.auth,
      browser,
      provider: 'google',
      returnUrl: RETURN,
      onWaiting: waiting => seen.push(waiting),
    });
    expect(seen).toEqual([true, false]);
  });

  it('says nothing when the page is closed or refused: the parent’s choice', async () => {
    for (const answer of [
      { type: 'cancel' },
      { type: 'dismiss' },
      { type: 'success', url: `${RETURN}?error=access_denied` },
    ]) {
      const w = world();
      const { browser } = sheet(() => answer);
      expect(
        await failureOf(
          signInThroughBrowser({
            auth: w.client.auth,
            browser,
            provider: 'google',
            returnUrl: RETURN,
          }),
        ),
      ).toBe('cancelled');
      expect(w.exchanges).toEqual([]);
    }
  });

  it('says the address has an account when Auth would not join it', async () => {
    const w = world();
    const { browser } = sheet(() => ({
      type: 'success',
      url: `${RETURN}?error=server_error&error_code=email_exists&error_description=x`,
    }));
    const code = await failureOf(
      signInThroughBrowser({ auth: w.client.auth, browser, provider: 'google', returnUrl: RETURN }),
    );
    expect(code).toBe('account_exists');
    expect(failureSentence(new AuthFailure('account_exists'))).toBe(
      'This email already has an account. Sign in with your email and password.',
    );
  });

  it('says there is no connection when the code cannot reach Auth', async () => {
    const w = world(() => {
      throw new TypeError('Network request failed');
    });
    const { browser } = sheet(() => ({ type: 'success', url: `${RETURN}?code=c` }));
    expect(
      await failureOf(
        signInThroughBrowser({
          auth: w.client.auth,
          browser,
          provider: 'google',
          returnUrl: RETURN,
        }),
      ),
    ).toBe('offline');
  });

  it('says only "something went wrong" for a refused exchange, with none of Auth’s own words', async () => {
    const w = world(
      () =>
        new Response(
          JSON.stringify({
            code: 'flow_state_expired',
            message: 'invalid flow state, flow state has expired',
          }),
          { status: 400, headers: { 'content-type': 'application/json' } },
        ),
    );
    const { browser } = sheet(() => ({ type: 'success', url: `${RETURN}?code=c` }));
    const code = await failureOf(
      signInThroughBrowser({ auth: w.client.auth, browser, provider: 'google', returnUrl: RETURN }),
    );
    expect(code).toBe('unknown');
    expect(failureSentence(new AuthFailure('unknown'))).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('says only "something went wrong" when the sheet cannot open at all', async () => {
    const w = world();
    const { browser } = sheet(() => Promise.reject(new Error('WebBrowser is already open')));
    expect(
      await failureOf(
        signInThroughBrowser({
          auth: w.client.auth,
          browser,
          provider: 'google',
          returnUrl: RETURN,
        }),
      ),
    ).toBe('unknown');
  });
});

/**
 * THE PROVIDER'S HALF, read as source: `SupabaseAuthProvider` imports the keystore and cannot load
 * in node (`failureCode.ts` says the same of it).
 */
describe('the Supabase provider', () => {
  const flat = readFileSync(join(__dirname, 'providers/supabase.ts'), 'utf8').replace(/\s+/g, ' ');

  it('offers Google and Apple from the owner switches, and builds Apple natively on iPhone', () => {
    expect(flat).toContain('this.socialSignIn = socialMethodsOf(social, Platform.OS);');
    expect(flat).toContain("from '../socialSignIn'");
    expect(flat).toContain('signInWithAppleNative');
    expect(flat).toContain("provider: 'apple'");
    const index = readFileSync(join(__dirname, 'providers/index.ts'), 'utf8');
    expect(index).toContain('apple: env.appleSignIn');
    expect(index).toContain('appleAndroid: env.appleAndroidSignIn');
  });

  it('keeps the not-configured answer as the backstop behind a missing button', () => {
    expect(flat).toContain(
      "if (!this.socialSignIn.has('google')) throw new AuthFailure('provider_not_configured', 'Google sign-in is not set up yet');",
    );
    expect(flat).toContain(
      "if (!this.socialSignIn.has('apple')) throw new AuthFailure('provider_not_configured', 'Sign in with Apple is not set up yet');",
    );
  });

  it('leaves the sheet’s own return address to the sheet, so one code is never exchanged twice', () => {
    expect(flat).toContain(
      "if (this.browserSheetOpen && url.startsWith(AUTH_CALLBACK)) return { kind: 'ignored' };",
    );
    expect(flat).toContain('returnUrl: AUTH_CALLBACK,');
  });
});
