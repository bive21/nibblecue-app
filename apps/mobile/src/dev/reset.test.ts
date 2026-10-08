/**
 * "Start fresh" — the dev-only wipe (the owner, 2026-09-17: "how do i reset my expo history i
 * want to start fresh like i would just have downloaded the app").
 *
 * `resetDevice` reaches AsyncStorage, SecureStore and expo-sqlite, so the node suite cannot run
 * it (`packages/ui/components/interaction.test.ts` records why a source tripwire is the honest
 * instrument here). The part that CAN be run — `MockBackend.reset`, including the save-in-flight
 * race — is tested for real in `auth/providers/mock.test.ts`.
 *
 * What these hold is the reason the tool exists at all: that it clears MORE than a sign-out,
 * and that it clears every owner rather than a list of prefixes that will go stale.
 */
import { DEVICE_LEVEL_KEYS } from '../prefs';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const reset = readFileSync(join(here, 'reset.ts'), 'utf8');
const more = readFileSync(join(here, '../screens/more/MoreScreen.tsx'), 'utf8');
const keychain = readFileSync(join(here, '../auth/keychain.ts'), 'utf8');

describe('it clears every owner, not a list of prefixes', () => {
  it('wipes the whole key-value store rather than the prefixes it knows about today', () => {
    // an owner added next month is covered by clear() and silently missed by a prefix list
    expect(reset).toContain('AsyncStorage.clear()');
    expect(reset).not.toContain("'prefs:'");
    expect(reset).not.toContain("'mock:'");
  });

  it('takes the database, the keystore and the scheduled reminders too', () => {
    expect(reset).toContain('closeAndDeleteEveryLocalDb()');
    expect(reset).toContain('clearKeystoreForReset()');
    expect(reset).toContain('cancelNotifications()');
  });

  it('empties every keystore key this app writes, since SecureStore cannot enumerate them', () => {
    // the list has to sit beside KEYS or it goes stale silently
    expect(keychain).toContain('Object.values(KEYS).map(k => secure.delete(k))');
    // and every Supabase slot — the session and any pending emailed link's (sessionStorage.ts)
    expect(keychain).toContain('await supabaseSessionStorage.removeItem();');
  });
});

describe('it goes further than a sign-out, which is the whole point', () => {
  it('is a different thing from signOut, and does not just call it', () => {
    // sign-out keeps the device-level preferences and the fake server standing, on purpose
    expect(reset).not.toContain('signOut');
    expect(DEVICE_LEVEL_KEYS.size).toBeGreaterThan(0);
  });

  it('resets the fake server FIRST, before anything it could save over', () => {
    // the function body only: the doc above it names the same calls in prose
    const body = reset.slice(reset.indexOf('export async function resetDevice'));
    expect(body).not.toBe('');
    const order = [
      'mock?.reset()',
      'cancelNotifications()',
      'closeAndDeleteEveryLocalDb()',
      'AsyncStorage.clear()',
    ];
    const at = order.map(s => body.indexOf(s));
    for (const i of at) expect(i).toBeGreaterThan(-1);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });
});

describe('the door to it', () => {
  it('sits in the dev section of More, which is already gated on mock and non-production', () => {
    expect(more).toContain('testID="more.dev.start_fresh"');
    const dev = more.indexOf("{mock && env.stage !== 'production' && session ? (");
    const row = more.indexOf('testID="more.dev.start_fresh"');
    expect(dev).toBeGreaterThan(-1);
    expect(row).toBeGreaterThan(dev);
  });

  it('says a restart is needed instead of pretending to be one', () => {
    // there is no expo-updates in this app, so nothing can reload the bundle; the providers
    // already in memory would keep serving the world that was just deleted
    expect(more).toContain('Close the app completely and reopen it.');
  });
});
