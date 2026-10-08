import { BRAND } from '@nibblecue/brand';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { emailNotAuthorized, failureSentence } from '../screens/auth/copy';
import { authFailureCodeOf } from './failureCode';
import { AuthFailure } from './providers/types';

/**
 * THE TWO EMAIL REFUSALS GET THEIR OWN SENTENCES (the first sign-ups on production, 2026-09-25).
 * The project's built-in sender mails only its organization's members, so anybody else's sign-up
 * failed with "Email address not authorized"; and it sends two emails an hour for the whole
 * project. Both read "Something went wrong. Please try again." The classifier is pure; the second
 * block runs the supabase-js the app ships against a fake Auth server, in both of the error shapes
 * GoTrue answers with, so the fields read here are the fields a phone actually gets.
 */

describe('what an auth error is called', () => {
  it('knows the address the sender will not mail, by code or by message', () => {
    expect(authFailureCodeOf({ code: 'email_address_not_authorized', status: 400 })).toBe(
      'email_not_authorized',
    );
    // a 5xx loses the code on the way through auth-js; the message survives
    expect(authFailureCodeOf({ status: 500, message: 'Email address not authorized' })).toBe(
      'email_not_authorized',
    );
    expect(authFailureCodeOf({ message: 'email address not authorised' })).toBe(
      'email_not_authorized',
    );
  });

  it('tells the email limit from every other limit', () => {
    expect(authFailureCodeOf({ code: 'over_email_send_rate_limit', status: 429 })).toBe(
      'email_rate_limited',
    );
    expect(authFailureCodeOf({ status: 429, message: 'email rate limit exceeded' })).toBe(
      'email_rate_limited',
    );
    // any other 429 is still the ordinary "too many tries"
    expect(authFailureCodeOf({ code: 'over_request_rate_limit', status: 429 })).toBe(
      'rate_limited',
    );
    expect(authFailureCodeOf({ status: 429, message: 'Request rate limit reached' })).toBe(
      'rate_limited',
    );
  });

  it('keeps every answer it already gave', () => {
    expect(authFailureCodeOf({ code: 'invalid_credentials', status: 400 })).toBe(
      'invalid_credentials',
    );
    expect(authFailureCodeOf({ code: 'email_not_confirmed', status: 400 })).toBe(
      'email_not_verified',
    );
    expect(authFailureCodeOf({ code: 'user_already_exists', status: 422 })).toBe('email_taken');
    expect(authFailureCodeOf({ code: 'email_exists', status: 422 })).toBe('email_taken');
    expect(authFailureCodeOf({ code: 'weak_password', status: 422 })).toBe('weak_password');
    expect(authFailureCodeOf({ status: 0, message: 'Network request failed' })).toBe('offline');
    expect(authFailureCodeOf({ status: 400, message: 'Something odd' })).toBe('unknown');
    expect(authFailureCodeOf(null)).toBe('offline');
  });
});

describe('what the parent reads for them', () => {
  const named = emailNotAuthorized(BRAND.appDisplayName);
  const unnamed = failureSentence(new AuthFailure('email_not_authorized'));
  const emailLimit = failureSentence(new AuthFailure('email_rate_limited'));

  it('says what to do next, in the words that were asked for', () => {
    expect(named).toBe(
      `This email can’t get sign-up emails from ${BRAND.appDisplayName} yet. Ask the account owner to add it, or use another email.`,
    );
    expect(emailLimit).toBe(
      'Too many emails were sent in the last hour. Please wait an hour, then try again.',
    );
    expect(unnamed).not.toBe(failureSentence(new AuthFailure('unknown')));
  });

  it('names the app only where the brand may be shown: the sign-up page supplies it', () => {
    // BRANDING.md §2 (packages/brand/src/placement.test.ts): the shared table may not carry the
    // name, and the door in may — and it is the only screen this refusal can reach
    expect(unnamed).toBe(
      'This email can’t get sign-up emails yet. Ask the account owner to add it, or use another email.',
    );
    const auth = readFileSync(join(__dirname, '../screens/auth/AuthScreen.tsx'), 'utf8');
    expect(auth.replace(/\s+/g, ' ')).toContain(
      "} else if (err instanceof AuthFailure && err.code === 'email_not_authorized') {",
    );
    expect(auth).toContain('setError(emailNotAuthorized(BRAND.appDisplayName));');
  });

  it('names no provider, mailer or account structure', () => {
    for (const s of [named, unnamed, emailLimit])
      expect(s).not.toMatch(/supabase|smtp|organi[sz]ation|server/i);
  });

  it('is what the real provider throws: toFailure goes through this classifier', () => {
    const provider = readFileSync(join(__dirname, 'providers/supabase.ts'), 'utf8');
    expect(provider.replace(/\s+/g, ' ')).toContain('const code = authFailureCodeOf(err);');
  });
});

/* ------------------------------------------------------------ the errors a phone gets back */

const URL_ = 'https://abcdefghijklmnopqrst.supabase.co';
const KEY = 'sb_publishable_test';

/** A sign-up against Auth answering `status` with `body` — and the API-version header if asked. */
async function signUpAnswered(status: number, body: object, apiVersion?: string) {
  const map = new Map<string, string>();
  const storage = {
    getItem: async (k: string) => map.get(k) ?? null,
    setItem: async (k: string, v: string) => void map.set(k, v),
    removeItem: async (k: string) => void map.delete(k),
  };
  const fetchFn = async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: {
        'content-type': 'application/json',
        ...(apiVersion ? { 'x-supabase-api-version': apiVersion } : {}),
      },
    });
  const client = createClient(URL_, KEY, {
    auth: { storage, flowType: 'pkce', autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchFn },
  });
  const { error } = await client.auth.signUp({
    email: 'sam@example.com',
    password: 'correct horse battery',
  });
  return error;
}

describe('what supabase-js hands back for each (as shipped)', () => {
  it('an address the sender will not mail, in the current error shape', async () => {
    const error = await signUpAnswered(
      400,
      { code: 'email_address_not_authorized', message: 'Email address not authorized' },
      '2024-01-01',
    );
    expect(authFailureCodeOf(error)).toBe('email_not_authorized');
  });

  it('the same, in the older shape', async () => {
    const error = await signUpAnswered(400, {
      code: 400,
      error_code: 'email_address_not_authorized',
      msg: 'Email address not authorized',
    });
    expect(authFailureCodeOf(error)).toBe('email_not_authorized');
  });

  it('the hour’s emails used up', async () => {
    const error = await signUpAnswered(
      429,
      { code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' },
      '2024-01-01',
    );
    expect(authFailureCodeOf(error)).toBe('email_rate_limited');
    const legacy = await signUpAnswered(429, {
      code: 429,
      error_code: 'over_email_send_rate_limit',
      msg: 'email rate limit exceeded',
    });
    expect(authFailureCodeOf(legacy)).toBe('email_rate_limited');
  });

  it('a refusal that came back as a server fault still says which it was', async () => {
    const error = await signUpAnswered(500, { msg: 'Email address not authorized' });
    expect(error?.name).toBe('AuthRetryableFetchError');
    expect(authFailureCodeOf(error)).toBe('email_not_authorized');
  });
});
