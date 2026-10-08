/**
 * AUTOMATIC NIGHT MODE AS A SUNSET (the owner, 2026-09-25, of the "that's cool" list). When the
 * evening window opens or closes on its own while the app is on screen, the repaint fades over
 * about two seconds instead of snapping. Two halves, because the provider cannot be rendered here
 * (this suite runs in node, and React Native does not): every rule the fade obeys is pure
 * (`sunset.ts`) and is walked here, and tripwires over `AppearanceProvider.tsx` and
 * `useAutoDark.ts` hold how those rules are wired — the clock is the only cause that fades, the
 * held answer goes through the one resolver, and the veil is a flat, inert, native-driven layer.
 */
import {
  DEFAULT_APPEARANCE,
  FREE_APPEARANCE,
  PLUS_APPEARANCE,
  resolveAppearance,
  type AutoDarkTheme,
} from '@nibblecue/ui/appearance';
import { themes, type ThemeName } from '@nibblecue/ui/theme';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CLOCK_GAP_MAX_MS,
  paintedAuto,
  SUNSET,
  SUNSET_EASE,
  SUNSET_TOTAL_MS,
  sunsetFor,
  sunsetStep,
  tickCause,
  type AnswerCause,
  type RepaintFacts,
  type Sunset,
} from './sunset';

const here = dirname(fileURLToPath(import.meta.url));
/** Comments out: the files explain the rules they wire, and a scan must not read the prose. */
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const flat = (file: string): string =>
  code(readFileSync(join(here, file), 'utf8')).replace(/\s+/g, ' ');
const provider = flat('AppearanceProvider.tsx');
const hook = flat('useAutoDark.ts');

const CAUSES: AnswerCause[] = ['clock', 'input', 'resume'];
const THEMES: ThemeName[] = ['light', 'dark', 'night'];

describe('only the clock fades', () => {
  const base: RepaintFacts = {
    cause: 'clock',
    live: true,
    from: 'light',
    to: 'dark',
    reduceMotion: false,
  };

  it('fades the window’s own flip, on the app’s own tree, to a look that is not the one on screen', () => {
    expect(sunsetFor(base)).toBe(true);
    // the morning too: the window closing is the same edge crossed the other way
    expect(sunsetFor({ ...base, from: 'dark', to: 'light' })).toBe(true);
  });

  it('never fades a tap, a launch or a wake-up: the parent is waiting for the result', () => {
    expect(sunsetFor({ ...base, cause: 'input' })).toBe(false);
    expect(sunsetFor({ ...base, cause: 'resume' })).toBe(false);
  });

  it('never fades before the app’s own tree is on screen', () => {
    expect(sunsetFor({ ...base, live: false })).toBe(false);
  });

  it('never fades under reduce motion: the repaint is instant, as it always was', () => {
    expect(sunsetFor({ ...base, reduceMotion: true })).toBe(false);
  });

  it('never fades into the picture already on screen, which would be a flicker', () => {
    for (const theme of THEMES) expect(sunsetFor({ ...base, from: theme, to: theme })).toBe(false);
  });

  it('is exactly that rule, over every combination', () => {
    for (const cause of CAUSES)
      for (const live of [true, false])
        for (const reduceMotion of [true, false])
          for (const from of THEMES)
            for (const to of THEMES) {
              const f = { cause, live, reduceMotion, from, to };
              expect(sunsetFor(f)).toBe(cause === 'clock' && live && !reduceMotion && from !== to);
            }
  });

  it('fades into the amber Night and out of it: it is a slow dim, and nothing in it glows', () => {
    expect(sunsetFor({ ...base, from: 'light', to: 'night' })).toBe(true);
    expect(sunsetFor({ ...base, from: 'night', to: 'light' })).toBe(true);
    // the veil is the old look's page, a flat color: into Night it is the day's, out of it
    // Night's own near-black — never a light that was not already on the screen, and never a
    // gradient or a glow (the veil's own tripwire below: opacity is all that moves)
    expect(provider).toContain('ground: resolved.palette.paper');
  });
});

describe('what a minute tick means', () => {
  it('is the clock only while the app has been in front of the parent since the last look', () => {
    expect(tickCause({ appState: 'active', away: false, sinceLastLook: 60_000 })).toBe('clock');
    expect(tickCause({ appState: 'active', away: false, sinceLastLook: CLOCK_GAP_MAX_MS })).toBe(
      'clock',
    );
  });

  it('is a wake-up when the app is not active, left since the last look, or the gap is long', () => {
    expect(tickCause({ appState: 'background', away: false, sinceLastLook: 60_000 })).toBe(
      'resume',
    );
    expect(tickCause({ appState: 'inactive', away: false, sinceLastLook: 60_000 })).toBe('resume');
    // the timer's callback ran on the way back, before the AppState event said so
    expect(tickCause({ appState: 'active', away: true, sinceLastLook: 60_000 })).toBe('resume');
    // the timer did not run for a while: the phone was locked
    expect(
      tickCause({ appState: 'active', away: false, sinceLastLook: CLOCK_GAP_MAX_MS + 1 }),
    ).toBe('resume');
  });

  it('allows a minute and a margin, and no more', () => {
    expect(CLOCK_GAP_MAX_MS).toBeGreaterThan(60_000);
    expect(CLOCK_GAP_MAX_MS).toBeLessThan(120_000);
  });
});

describe('the veil', () => {
  const prefs = DEFAULT_APPEARANCE;
  const start = (id: number, hold: AutoDarkTheme | null = null) =>
    ({ type: 'start', id, hold, ground: themes.light.paper, prefs }) as const;

  it('dims, is let go under full cover, lifts, and is gone', () => {
    let s: Sunset<typeof prefs> | null = sunsetStep(null, start(1));
    expect(s).toMatchObject({ id: 1, phase: 'dusk', hold: null, ground: themes.light.paper });
    s = sunsetStep(s, { type: 'covered', id: 1 });
    expect(s?.phase).toBe('dawn');
    s = sunsetStep(s, { type: 'cleared', id: 1 });
    expect(s).toBeNull();
  });

  it('paints the answer being left while the page dims, and the clock’s own from full cover on', () => {
    const dusk = sunsetStep(null, start(1, null));
    // the evening is arriving: the page stays light (no window) while the veil rises
    expect(paintedAuto(dusk, 'dark')).toBeNull();
    const dawn = sunsetStep(dusk, { type: 'covered', id: 1 });
    expect(paintedAuto(dawn, 'dark')).toBe('dark');
    expect(paintedAuto(null, 'night')).toBe('night');
    // the morning: the window is closing, and the evening's look is held until the veil is whole
    expect(paintedAuto(sunsetStep(null, start(2, 'night')), null)).toBe('night');
  });

  it('ignores a late callback from an older sunset', () => {
    const s = sunsetStep(null, start(2));
    expect(sunsetStep(s, { type: 'covered', id: 1 })).toBe(s);
    const dawn = sunsetStep(s, { type: 'covered', id: 2 });
    expect(sunsetStep(dawn, { type: 'cleared', id: 1 })).toBe(dawn);
    // and a phase's callback only ends its own phase
    expect(sunsetStep(s, { type: 'cleared', id: 2 })).toBe(s);
    expect(sunsetStep(dawn, { type: 'covered', id: 2 })).toBe(dawn);
  });

  it('is simply gone on an abort, whatever it was doing', () => {
    const dusk = sunsetStep(null, start(3));
    expect(sunsetStep(dusk, { type: 'abort' })).toBeNull();
    expect(sunsetStep(sunsetStep(dusk, { type: 'covered', id: 3 }), { type: 'abort' })).toBeNull();
    expect(sunsetStep(null, { type: 'abort' })).toBeNull();
  });

  it('does not fade twice: a second flip during a sunset paints the answer at once', () => {
    expect(sunsetStep(sunsetStep(null, start(4)), start(5))).toBeNull();
  });
});

describe('about two seconds', () => {
  it('takes about two seconds from the tick to the last of the veil', () => {
    expect(SUNSET_TOTAL_MS).toBe(SUNSET.duskMs + SUNSET.settleMs + SUNSET.dawnMs);
    expect(SUNSET_TOTAL_MS).toBeGreaterThanOrEqual(1800);
    expect(SUNSET_TOTAL_MS).toBeLessThanOrEqual(2200);
  });

  it('spends most of it on the new look arriving, not on the old one leaving', () => {
    expect(SUNSET.dawnMs).toBeGreaterThan(2 * SUNSET.duskMs);
    // a beat for a whole-app repaint to land under full cover, and no more than a beat
    expect(SUNSET.settleMs).toBeGreaterThan(0);
    expect(SUNSET.settleMs).toBeLessThanOrEqual(150);
  });

  it('eases both halves without overshooting: an opacity past whole means nothing', () => {
    for (const [x1, y1, x2, y2] of Object.values(SUNSET_EASE)) {
      for (const v of [x1, y1, x2, y2]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe('the resolver decides what each answer paints (a real run, no React)', () => {
  const evening = { ...DEFAULT_APPEARANCE, theme: 'light' as const };

  it('repaints when a window to dark opens over light — so that flip may fade', () => {
    const from = resolveAppearance(evening, 'light', PLUS_APPEARANCE, null).theme;
    const to = resolveAppearance(evening, 'light', PLUS_APPEARANCE, 'dark').theme;
    expect(sunsetFor({ cause: 'clock', live: true, reduceMotion: false, from, to })).toBe(true);
  });

  it('repaints nothing when the household is already dark — so it does not fade', () => {
    const dark = { ...DEFAULT_APPEARANCE, theme: 'dark' as const };
    const from = resolveAppearance(dark, 'light', PLUS_APPEARANCE, null).theme;
    const to = resolveAppearance(dark, 'light', PLUS_APPEARANCE, 'dark').theme;
    expect(sunsetFor({ cause: 'clock', live: true, reduceMotion: false, from, to })).toBe(false);
  });

  it('fades to the dark a free plan paints when the window asked for Night', () => {
    const to = resolveAppearance(evening, 'light', FREE_APPEARANCE, 'night').theme;
    expect(to).toBe('dark');
    expect(sunsetFor({ cause: 'clock', live: true, reduceMotion: false, from: 'light', to })).toBe(
      true,
    );
  });
});

describe('how it is wired (tripwires over AppearanceProvider.tsx and useAutoDark.ts)', () => {
  it('holds the answer being left in the one resolver call, never a second picture of the app', () => {
    expect(provider).toContain('const autoTheme = paintedAuto(sunset, decided.theme);');
    expect(provider).toContain(
      'resolveAppearance(prefs ?? DEFAULT_APPEARANCE, system, entitled, autoTheme, preview)',
    );
  });

  it('decides during render, so the first frame after the tick is already right', () => {
    expect(provider).toContain('if (answer !== decided) {');
    expect(provider).toContain('setDecided(answer);');
    expect(provider).toContain('cause: answer.cause');
    expect(provider).toContain('live: prefs !== null && fontsReady');
  });

  it('lets a tap or reduce motion end a sunset at once', () => {
    expect(provider).toMatch(
      /else if \(sunset !== null && \(reduceMotion \|\| sunset\.prefs !== prefs\)\) \{ setSunset\(s => sunsetStep\(s, \{ type: 'abort' \}\)\);/,
    );
    // and the app leaving the foreground
    expect(provider).toContain(
      "if (s !== 'active') setSunset(prev => sunsetStep(prev, { type: 'abort' }));",
    );
  });

  it('draws the veil flat, inert and hidden, over the whole app, on the native driver', () => {
    expect(provider).toMatch(
      /<Animated\.View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style=\{\[StyleSheet\.absoluteFill, \{ backgroundColor: sunset\.ground, opacity: veil \}\]\}/,
    );
    expect(provider.match(/useNativeDriver: true/g)).toHaveLength(2);
    // opacity is the only thing that animates: no transform, no color, no layout
    expect(provider).not.toMatch(/veil\.interpolate/);
    // and the app sits in one box with it, always, so a veil coming and going remounts nothing
    expect(provider).toContain('<View style={styles.fill}> {children} {sunset ? (');
  });

  it('tells the clock from a wake-up in the hook, and says so with every new answer', () => {
    expect(hook).toContain(
      'export function useAutoDarkTheme(auto: AutoDarkPrefs): AutoDarkAnswer {',
    );
    expect(hook).toContain('const cause = tickCause({');
    expect(hook).toContain("settle(look(), 'resume');");
    expect(hook).toContain("settle(look(), 'input');");
    // a new object only when the look changes, so the identical minutes are still nothing
    expect(hook).toContain(
      'setAnswer(prev => (prev.theme === next ? prev : { theme: next, cause }))',
    );
  });
});
