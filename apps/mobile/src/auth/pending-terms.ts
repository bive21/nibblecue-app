/**
 * A CHECKED BOX, HELD UNTIL THERE IS A SESSION TO RECORD IT AGAINST.
 *
 * The sign-up page (`AuthScreen`) is where a parent checks the box and reads the Terms of Use
 * and the Privacy Policy — the owner, 2026-09-22: *"it does not need an individual page"* for
 * the ordinary case, so the acceptance screen the app used to show right after verification is
 * no longer the first thing a new sign-up meets. But the version that was actually accepted has
 * to be recorded through `accept_terms`, which needs an authenticated caller — and for an email
 * sign-up, there is no session at all until the emailed link is opened, which can happen after
 * the app is killed, the phone is restarted, or the household hands it to the other parent. So
 * the checkbox writes this record the moment sign-up succeeds, and `AuthContext` drains it the
 * moment a session for that address exists — before the phase machine ever asks whether terms
 * are accepted, so the ordinary path never sees the fallback screen at all.
 *
 * KEYED BY EMAIL, NOT BY USER ID, because email is the only identity that exists at the moment
 * the box is checked — an email sign-up has no user id until the link is opened. It survives a
 * sign-out the same way every other preference not on the device-level list does
 * (`prefs/index.ts`): swept, because it belongs to a person's attempt to sign up and not to the
 * device.
 */
import { z } from 'zod';
import type { KeyValueStore } from '../prefs';

const Pending = z.object({ version: z.number().int().positive() });
export type PendingTermsAcceptance = z.infer<typeof Pending>;

/** Case and surrounding space are not part of an address; two spellings must land on one key. */
const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const pendingTermsKey = (email: string): string => `pending_terms:${normalizeEmail(email)}`;

export async function savePendingTermsAcceptance(
  store: KeyValueStore,
  email: string,
  version: number,
): Promise<void> {
  await store.set(pendingTermsKey(email), JSON.stringify({ version }));
}

export async function loadPendingTermsAcceptance(
  store: KeyValueStore,
  email: string,
): Promise<PendingTermsAcceptance | null> {
  const raw = await store.get(pendingTermsKey(email));
  if (!raw) return null;
  try {
    const parsed = Pending.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export const clearPendingTermsAcceptance = (store: KeyValueStore, email: string): Promise<void> =>
  store.remove(pendingTermsKey(email));
