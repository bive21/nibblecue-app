/**
 * THE FIRST SECOND, IN THE ORDER THAT GETS TODAY ON SCREEN SOONEST (2026-09-28; the owner: *"app
 * needs to run as smooth as fast and as light as possible"*).
 *
 * Three things the first frame and Today's first reads wait on used to start only when whatever
 * came before them had finished: the five font files (not asked for until the accounts provider had
 * built its clients), the database (not opened until the session, the account and the whole tree
 * under them had mounted), and the launch's own small reads (one after another). Each is started as
 * early as it can be known to be wanted now. Nothing here can be timed without a phone, so the
 * order is what is held, by source, as `providers.test.ts` holds the provider ladder.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const mobile = join(here, '..', '..');
const code = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/gm, '$1 ');
const flat = (path: string): string => code(readFileSync(path, 'utf8')).replace(/\s+/g, ' ');

describe('the faces are asked for as the bundle evaluates', () => {
  const app = code(readFileSync(join(mobile, 'App.tsx'), 'utf8'));

  it('at the top level of the root, before the root component — not in an effect', () => {
    expect(app).toMatch(/^void preloadAppFonts\(\);$/m);
    expect(app.indexOf('void preloadAppFonts();')).toBeLessThan(
      app.indexOf('export default function App'),
    );
    expect(app).toContain("import { preloadAppFonts } from './src/appearance/fonts';");
  });

  it('once, through expo-font, whose own hook still decides when the faces are in', () => {
    const fonts = flat(join(here, '..', 'appearance', 'fonts.ts'));
    expect(fonts).toContain('asked ??= loadAsync(APP_FONTS).catch(() => undefined);');
    expect(fonts).toContain('const [loaded, error] = useFonts(APP_FONTS);');
  });
});

describe('the launch opens the database, and asks for its reads, as soon as it knows', () => {
  const auth = flat(join(here, '..', 'auth', 'AuthContext.tsx'));
  const boot = auth.slice(auth.indexOf('const cached = await p.auth.restoreSession();'));

  it('starts opening the database the moment a session is on the phone, never awaiting it', () => {
    // the family on screen's file (0153): chosen, then opened, the launch awaiting neither
    expect(boot).toContain('if (cached) void openFamilyDb(cached.user.id).catch(() => undefined);');
    // after any teardown the launch finishes first, whose latch refuses it
    expect(auth.indexOf('await resumeInterruptedTeardown(')).toBeLessThan(
      auth.indexOf('if (cached) void openFamilyDb('),
    );
  });

  it('starts the account’s cache, a ticked box and the quarantine before it awaits the first read', () => {
    const first = boot.indexOf('const remembered = await prefsStore.get(LAST_HOUSEHOLD(');
    for (const started of [
      'const accountRead = cached ? prefsStore.get(ACCOUNT_CACHE) : null;',
      'const tickedRead =',
      'const parkedRead = quarantine.pending();',
    ]) {
      const at = boot.indexOf(started);
      expect(at, started).toBeGreaterThan(-1);
      expect(at, started).toBeLessThan(first);
    }
    // and takes each where it was always taken, all before the first phase
    const phase = boot.indexOf('setSessionState(state);');
    for (const taken of [
      'const raw = await accountRead;',
      'const ticked = await tickedRead;',
      'setQuarantined(await parkedRead);',
    ]) {
      expect(boot.indexOf(taken), taken).toBeGreaterThan(first);
      expect(boot.indexOf(taken), taken).toBeLessThan(phase);
    }
  });
});
