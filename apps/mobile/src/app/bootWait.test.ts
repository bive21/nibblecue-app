/**
 * THE LOADER'S TWO WIRES IN THE APP (the owner, 2026-09-26: *"if there is [a page where it's
 * loading], our loading icon shuold be our logo spinning non stop in an infinity shape"*):
 *
 *   1. the root hands the design system the mark, ONCE, before the first frame — without it every
 *      loader in the app quietly stays the platform's spinner, and nothing else would say so;
 *   2. the boot wait keeps the ground it always had and shows the loader only after a delay, so a
 *      quick launch never flashes one.
 *
 * NOT A RENDER TEST: the mobile suite runs in node and cannot parse React Native
 * (`providers.test.ts` says why that is the honest instrument). It reads the three files and the
 * design system's own numbers — the delay is imported, not copied.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LOADER_DELAY_MS, LOADER_FADE_MS, LOADER_SIZE, loaderMotion } from '@nibblecue/ui/layout';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const mobile = join(here, '..', '..');
const read = (p: string): string => readFileSync(p, 'utf8');
/** Comments are prose about the rules; a call named in one is not a call that runs. */
const code = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/gm, '$1 ');
const flat = (text: string): string => code(text).replace(/\s+/g, ' ');

describe('the root installs the mark for the loader', () => {
  const app = code(read(join(mobile, 'App.tsx')));

  it('hands over the delivered mark, from the brand assets, exactly once', () => {
    expect(app.match(/setLoaderMark\(/g)).toHaveLength(1);
    expect(app).toContain('setLoaderMark(MARK_SOURCE);');
    expect(app).toMatch(/import \{ MARK_SOURCE \} from '\.\/src\/brand\/assets';/);
    expect(app).toMatch(/import \{[^}]*\bsetLoaderMark\b[^}]*\} from '@nibblecue\/ui';/);
  });

  it('as the bundle evaluates — at the top level, before the root component — not in an effect', () => {
    // a line of its own, unindented: nothing wraps it, so it has run before anything renders
    expect(app).toMatch(/^setLoaderMark\(MARK_SOURCE\);$/m);
    expect(app.indexOf('setLoaderMark(MARK_SOURCE)')).toBeLessThan(
      app.indexOf('export default function App'),
    );
  });
});

describe('the boot wait', () => {
  const nav = flat(read(join(here, 'navigation.tsx')));
  const wait = flat(read(join(here, 'BootWait.tsx')));

  it('is what the navigator shows while the session is read', () => {
    expect(nav).toContain("if (phase === 'booting') return <BootWait />;");
    expect(nav).toContain("import { BootWait } from './BootWait';");
  });

  it('keeps the id and the ground the first frame after the splash always had', () => {
    expect(wait).toContain(
      '<View style={[styles.fill, { backgroundColor: t.color.app }]} testID="booting">',
    );
    expect(wait).toContain("fill: { flex: 1, alignItems: 'center', justifyContent: 'center' }");
  });

  it('shows nothing but that ground until the wait has lasted, and forgets the timer if it never does', () => {
    expect(wait).toContain('const [waited, setWaited] = useState(false);');
    expect(wait).toContain('const timer = setTimeout(() => setWaited(true), LOADER_DELAY_MS);');
    expect(wait).toContain('return () => clearTimeout(timer);');
    expect(wait).toMatch(/\{waited \? \( <Animated\.View[^>]*> <LogoLoader variant="large"/);
    // long enough that a quick launch is over first; short of the second a parent starts to wonder
    expect(LOADER_DELAY_MS).toBeGreaterThanOrEqual(300);
    expect(LOADER_DELAY_MS).toBeLessThanOrEqual(600);
  });

  it('draws the full-color mark, as a screen of its own — never tinted like a control', () => {
    expect(wait).toContain('<LogoLoader variant="large" testID="booting.loader" />');
    expect(wait).not.toMatch(/<LogoLoader[^>]*tint=/);
    // and the large loader fits the narrowest phone the app supports, with room either side
    expect(LOADER_SIZE.large.box.width).toBeLessThanOrEqual(320 - 2 * 16);
  });

  it('fades it in on the native driver, and not at all where nothing may move', () => {
    expect(wait).toContain("const still = loaderMotion(t.reduceMotion, t.theme) === 'breathe';");
    expect(wait).toContain('if (!waited || still) return;');
    expect(wait).toMatch(
      /Animated\.timing\(shown, \{ toValue: 1, duration: LOADER_FADE_MS, useNativeDriver: true, \}\)/,
    );
    expect(wait).toContain('style={still ? null : { opacity: shown }}');
    expect(LOADER_FADE_MS).toBeLessThanOrEqual(300);
    expect(loaderMotion(true, 'light')).toBe('breathe');
    expect(loaderMotion(false, 'night')).toBe('breathe');
  });
});
