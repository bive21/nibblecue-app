/**
 * NO SETUP FLASH AFTER A SIGN-IN (the owner, 2026-10-08). Right after a sign-in the account has
 * not been read yet; "not read" used to fall through to `onboarding`, so somebody with a family
 * saw "Setup takes about 5 minutes" for a moment. Read from the code that decides the phase.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const flat = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'AuthContext.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\s+/g, ' ');
const phase = flat.slice(flat.indexOf('const phase: Phase = useMemo(() => {'));

describe('the first screen after a sign-in', () => {
  it('is the loading screen until the account has been asked for, never setup', () => {
    const ready = phase.indexOf("return 'ready';");
    const wait = phase.indexOf(
      "if (account === null && accountAskedFor !== sessionState.session.user.id) return 'booting';",
    );
    const setup = phase.indexOf("return 'onboarding';");
    expect(ready).toBeGreaterThan(-1);
    expect(wait).toBeGreaterThan(ready);
    expect(setup).toBeGreaterThan(wait);
  });

  it('counts a read that failed as asked, and gives up on one that never answers', () => {
    const refresh = flat.slice(flat.indexOf('const refreshAccount = useCallback('));
    expect(refresh).toContain(
      'state = await providers.api.bootstrapState(); } catch (err) { setAccountAskedFor(userId);',
    );
    expect(flat).toContain('const FIRST_READ_WAIT_MS = 8_000;');
    expect(flat).toContain(
      'const t = setTimeout(() => setAccountAskedFor(waitingFor), FIRST_READ_WAIT_MS);',
    );
  });

  it('forgets the answer at a sign-out, so the next person waits for their own', () => {
    expect(flat).toContain('setAccount(null); setAccountReadFor(null); setAccountAskedFor(null);');
  });
});
