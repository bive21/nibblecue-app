import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { linkExchange } from './linkExchange';
import {
  FLOW_SLOT_PREFIX,
  SESSION_SLOT,
  keyedSessionStorage,
  slotFor,
  type Cipher,
  type LocalKv,
  type SecureKv,
  type SessionStorage,
} from './sessionStorage';

/**
 * AN EMAILED LINK MUST STILL SIGN THE PARENT IN AFTER THE APP HAS RESTARTED (2026-09-24).
 *
 * These run the REAL supabase-js client (the version the app ships) over a fake Auth server, with
 * the app's storage adapter under it: sign up (or ask for a password reset), let the app start
 * again the way it does when the link opens it cold, then open the link. The exchange must carry
 * the verifier whose challenge went out with the request — which is exactly what the one-slot
 * adapter lost, and the first test shows it losing it.
 */

const URL_ = 'https://abcdefghijklmnopqrst.supabase.co';
const KEY = 'sb_publishable_test';
const CALLBACK = 'cuddlecue://auth/callback';
const RECOVERY = 'cuddlecue://auth/recovery';

function memory() {
  const secureMap = new Map<string, string>();
  const localMap = new Map<string, string>();
  const secure: SecureKv = {
    get: async k => secureMap.get(k) ?? null,
    set: async (k, v) => void secureMap.set(k, v),
    delete: async k => void secureMap.delete(k),
  };
  const local: LocalKv = {
    getItem: async k => localMap.get(k) ?? null,
    setItem: async (k, v) => void localMap.set(k, v),
    removeItem: async k => void localMap.delete(k),
    getAllKeys: async () => [...localMap.keys()],
    multiRemove: async keys => keys.forEach(k => localMap.delete(k)),
  };
  // reversible and keyed, so a wrong key or a missing one reads as nothing, as AES would
  const cipher: Cipher = {
    newKey: () => 'k'.repeat(64),
    encrypt: (key, plain) => `${key.slice(0, 4)}:${Buffer.from(plain).toString('base64')}`,
    decrypt: (key, body) => {
      const [tag, b64] = body.split(':');
      if (tag !== key.slice(0, 4) || b64 === undefined) throw new Error('bad key');
      return Buffer.from(b64, 'base64').toString();
    },
  };
  return { secure, local, cipher, secureMap, localMap };
}

/** What the app shipped until 2026-09-24: one slot, whatever the key. Kept to prove the test bites. */
function oneSlot(): SessionStorage {
  let slot: string | null = null;
  return {
    getItem: async () => slot,
    setItem: async (_name, value) => void (slot = value),
    removeItem: async () => void (slot = null),
  };
}

const b64url = (buf: Buffer) =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** A fake Auth server: records what it was sent, answers like GoTrue with confirmations on. */
function fakeAuth() {
  const seen: { path: string; query: URLSearchParams; body: Record<string, unknown> }[] = [];
  const user = {
    id: '11111111-1111-1111-1111-111111111111',
    aud: 'authenticated',
    role: 'authenticated',
    email: 'dana@example.com',
    email_confirmed_at: '2026-09-24T12:00:00Z',
    app_metadata: {},
    user_metadata: {},
    identities: [{ id: 'i1', provider: 'email' }],
    created_at: '2026-09-24T11:59:00Z',
  };
  const fetchFn = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(
      typeof input === 'string' ? input : input instanceof URL ? input : input.url,
    );
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : {};
    seen.push({ path: url.pathname, query: url.searchParams, body });
    const json = (x: unknown, status = 200) =>
      new Response(JSON.stringify(x), { status, headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/auth/v1/signup') {
      // confirmations on: a user, no session
      return json({
        ...user,
        email_confirmed_at: null,
        confirmation_sent_at: '2026-09-24T12:00:00Z',
      });
    }
    if (url.pathname === '/auth/v1/recover' || url.pathname === '/auth/v1/resend') return json({});
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
      // GoTrue checks the verifier against the challenge of the email that was opened — here
      // always the newest one, which is the one a parent taps
      const verifier = String(body['code_verifier'] ?? '');
      const challenge = seen.findLast(s => s.body['code_challenge'])?.body['code_challenge'];
      const expected = b64url(createHash('sha256').update(verifier).digest());
      if (!verifier || expected !== challenge) {
        return json({ code: 'bad_code_verifier', msg: 'code challenge does not match' }, 400);
      }
      return json({
        access_token: 'at',
        token_type: 'bearer',
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        refresh_token: 'rt',
        user,
      });
    }
    return json({ msg: `no route ${url.pathname}` }, 404);
  };
  return { seen, fetchFn };
}

function client(storage: SessionStorage, fetchFn: typeof fetch) {
  return createClient(URL_, KEY, {
    auth: {
      storage,
      flowType: 'pkce',
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
    },
    global: { fetch: fetchFn },
  });
}

/** The return address Auth would redirect to: the one the request asked for, plus the code. */
function linkFrom(seen: ReturnType<typeof fakeAuth>['seen'], path: string, code: string): string {
  const asked = seen.find(s => s.path === path);
  const redirect = asked?.query.get('redirect_to') ?? String(asked?.body['redirect_to'] ?? '');
  expect(redirect, 'the request named a return address').not.toBe('');
  return `${redirect}${redirect.includes('?') ? '&' : '?'}code=${code}`;
}

async function openLink(storage: SessionStorage, fetchFn: typeof fetch, link: string) {
  // a cold start: a new client over the same storage, which checks for a session on the way up
  const cold = client(storage, fetchFn);
  await cold.auth.getSession();
  const ex = linkExchange(link);
  expect(ex).not.toBeNull();
  return cold.auth.exchangeCodeForSession(
    ex!.code,
    ex!.flowId ? { flowId: ex!.flowId } : undefined,
  );
}

describe('the sign-in state supabase-js keeps on the phone', () => {
  it('the one-slot adapter loses the verifier before the link is opened (why this file exists)', async () => {
    const auth = fakeAuth();
    const storage = oneSlot();
    await client(storage, auth.fetchFn).auth.signUp({
      email: 'dana@example.com',
      password: 'correct horse battery',
      options: { emailRedirectTo: CALLBACK },
    });
    const { data, error } = await openLink(
      storage,
      auth.fetchFn,
      linkFrom(auth.seen, '/auth/v1/signup', 'c1'),
    );
    expect(data.session).toBeNull();
    expect(error).not.toBeNull();
  });

  it('a sign-up confirmation opened after a cold start signs the parent in', async () => {
    const auth = fakeAuth();
    const m = memory();
    const storage = keyedSessionStorage({ ...m, keyName: 'cc.supabase.session.key' });
    const first = client(storage, auth.fetchFn);
    const signUp = await first.auth.signUp({
      email: 'dana@example.com',
      password: 'correct horse battery',
      options: { emailRedirectTo: CALLBACK },
    });
    expect(signUp.data.session).toBeNull();
    // the verifier is waiting in a slot of its own, and the session slot is empty
    expect([...m.localMap.keys()].some(k => k.startsWith(FLOW_SLOT_PREFIX))).toBe(true);
    expect(m.localMap.has(SESSION_SLOT)).toBe(false);

    const { data, error } = await openLink(
      storage,
      auth.fetchFn,
      linkFrom(auth.seen, '/auth/v1/signup', 'c2'),
    );
    expect(error).toBeNull();
    expect(data.session?.access_token).toBe('at');
    // the session is where the app's restoreSession() reads it, and the spent verifier is gone
    expect(JSON.parse((await storage.getItem()) ?? '{}').access_token).toBe('at');
    expect(await storage.getItem(slotFor(undefined))).not.toBeNull();
  });

  it('a password-reset link opened later still reaches the new-password step', async () => {
    const auth = fakeAuth();
    const storage = keyedSessionStorage({ ...memory(), keyName: 'cc.supabase.session.key' });
    await client(storage, auth.fetchFn).auth.resetPasswordForEmail('dana@example.com', {
      redirectTo: RECOVERY,
    });
    const link = linkFrom(auth.seen, '/auth/v1/recover', 'c3');
    expect(link.startsWith(RECOVERY)).toBe(true);
    const { data, error } = await openLink(storage, auth.fetchFn, link);
    expect(error).toBeNull();
    expect(data.session).not.toBeNull();
    // auth-js marks the verifier of a reset, and the exchange says so (not in its public type)
    expect((data as { redirectType?: string | null }).redirectType).toBe('recovery');
  });

  it('after "Resend the email", the newest link signs in', async () => {
    const auth = fakeAuth();
    const storage = keyedSessionStorage({ ...memory(), keyName: 'cc.supabase.session.key' });
    const c = client(storage, auth.fetchFn);
    await c.auth.signUp({
      email: 'dana@example.com',
      password: 'correct horse battery',
      options: { emailRedirectTo: CALLBACK },
    });
    await c.auth.resend({
      type: 'signup',
      email: 'dana@example.com',
      options: { emailRedirectTo: CALLBACK },
    });
    // the return address carries no flow id unless the client opts in, so the exchange uses the
    // newest verifier — the one the newest email was sent with
    const link = `${CALLBACK}?code=c5`;
    expect(linkExchange(link)).toEqual({ code: 'c5', flowId: null });
    const { error } = await openLink(storage, auth.fetchFn, link);
    expect(error).toBeNull();
  });

  it('reads a flow id when the return address carries one', () => {
    expect(linkExchange(`${CALLBACK}?code=c6&sb_flow_id=${'a'.repeat(32)}`)).toEqual({
      code: 'c6',
      flowId: 'a'.repeat(32),
    });
    expect(linkExchange(`${CALLBACK}#access_token=x&refresh_token=y`)).toBeNull();
  });

  it('the sign-out teardown removes every slot and the key', async () => {
    const m = memory();
    const storage = keyedSessionStorage({ ...m, keyName: 'cc.supabase.session.key' });
    await storage.setItem('sb-x-auth-token', '{"access_token":"a"}');
    await storage.setItem('sb-x-auth-token-flow-abc-code-verifier', '"v"');
    await storage.setItem('sb-x-auth-token-code-verifier', '"v"');
    await storage.removeItem();
    expect(m.localMap.size).toBe(0);
    expect(m.secureMap.size).toBe(0);
  });

  it('supabase-js removing one key removes that slot only, and keeps the key for the others', async () => {
    const m = memory();
    const storage = keyedSessionStorage({ ...m, keyName: 'cc.supabase.session.key' });
    await storage.setItem('sb-x-auth-token', '{"access_token":"a"}');
    await storage.setItem('sb-x-auth-token-code-verifier', '"v"');
    await storage.removeItem('sb-x-auth-token');
    expect(await storage.getItem('sb-x-auth-token')).toBeNull();
    expect(await storage.getItem('sb-x-auth-token-code-verifier')).toBe('"v"');
  });
});
