/**
 * A TOKEN-CARRYING AUTH LINK IS REFUSED WHILE SOMEBODY IS SIGNED IN (the WP15 security review,
 * 2026-10-08): `setSession` with a link's own tokens would otherwise move a signed-in phone into
 * whichever account made the link. Source scan, because the provider needs a live Supabase client.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(join(__dirname, 'supabase.ts'), 'utf8');

describe('a link carrying its own tokens', () => {
  it('asks whether a session exists before setSession, and is ignored when one does', () => {
    const branch = src.slice(src.indexOf('hash.access_token && hash.refresh_token'));
    const guard = branch.indexOf(
      "if ((await this.restoreSession()) !== null) return { kind: 'ignored' };",
    );
    const set = branch.indexOf('this.client.auth.setSession(');
    expect(guard, 'the guard is there').toBeGreaterThan(0);
    expect(set, 'setSession is still the sign-in').toBeGreaterThan(0);
    expect(guard, 'the guard runs first').toBeLessThan(set);
  });

  it('is the only place a link sets a session', () => {
    expect(src.match(/auth\.setSession\(/g)?.length).toBe(1);
  });
});
