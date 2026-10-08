/**
 * THE THEME WAITS FOR THE MORNING (the owner, 2026-09-29: *"i moved to night / dark, but the
 * screen didnt change because the night mode was on. this is fine, but for users who didnt know
 * might think this was broken … perhaps users arent able to play with theme when automatic night
 * mode is on, rather than letting them change but nothing happens"*).
 *
 * `themeHold` decides it and is pure, so every combination is walked here against the real
 * resolver and the real clock rule: every stored theme, the phone light or dark, automatic night
 * mode off, on and waiting for the evening, or open, dimming to Dark or to Night, on a plan with
 * Night and on one without, on a 12-hour and a 24-hour clock. What is proved is the owner's
 * sentence rather than a copy of the function: the toggle is held exactly when some tap on it
 * would change nothing on the screen, and a toggle that is not held has no such tap.
 *
 * The sheet is read, never imported (it pulls in React Native); its wiring is held by tripwires
 * at the foot, the way `themeToggle.test.ts` holds the rest of the Theme section.
 */
import {
  autoDarkThemeAt,
  autoDarkWindow,
  DEFAULT_APPEARANCE,
  FREE_APPEARANCE,
  PLUS_APPEARANCE,
  resolveAppearance,
  SCHEME_NAMES,
  THEME_CHOICES,
  type AppearanceEntitlements,
  type AppearancePrefs,
  type AutoDarkTheme,
  type ThemeChoice,
} from '@nibblecue/ui/appearance';
import { SKY_STOPS } from '@nibblecue/ui/layout';
import { SKINS, skinForTheme } from '@nibblecue/ui/skins';
import { resolvePalette } from '@nibblecue/ui/theme';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { AUTO_DARK_COPY, isAutoDarkLocked, isLocked, themeHold, themeStop } from './options';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, p), 'utf8');
/** Comments out: the sheet explains its rules, and a scan must not read the explanation. */
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const sheet = code(read('AppearanceSheet.tsx'));
const flat = sheet.replace(/\s+/g, ' ');

const at = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

/** Automatic night mode off, on and waiting for the evening, or open. */
type Evening = 'off' | 'shut' | 'open';
const EVENINGS: readonly Evening[] = ['off', 'shut', 'open'];
/** When the phone is looked at: 11 p.m. inside the 8 p.m. to 6 a.m. window, noon outside it. */
const NOW: Record<Evening, number> = { off: at('23:00'), shut: at('12:00'), open: at('23:00') };
const DIMS: readonly AutoDarkTheme[] = ['dark', 'night'];
const PHONES = ['light', 'dark'] as const;
const PLANS = [
  ['a free plan', FREE_APPEARANCE],
  ['Plus', PLUS_APPEARANCE],
] as const;

interface Case {
  name: string;
  stored: ThemeChoice;
  phone: 'light' | 'dark';
  entitled: AppearanceEntitlements;
  dimTo: AutoDarkTheme;
  evening: Evening;
  clock24: boolean;
  prefs: AppearancePrefs;
}

const prefsFor = (
  stored: ThemeChoice,
  dimTo: AutoDarkTheme,
  evening: Evening,
): AppearancePrefs => ({
  ...DEFAULT_APPEARANCE,
  theme: stored,
  autoDark: {
    mode: evening === 'off' ? 'off' : 'times',
    from: '20:00',
    to: '06:00',
    theme: dimTo,
  },
});

/** What the app paints for these prefs at this minute: the provider's own two steps, in node. */
const paint = (c: Case, prefs: AppearancePrefs = c.prefs, minute: number = NOW[c.evening]) =>
  resolveAppearance(prefs, c.phone, c.entitled, autoDarkThemeAt(prefs.autoDark, minute, null));

/** The sheet's own call: the resolver's window over no bed time (this household sets times). */
const holdFor = (c: Case, prefs: AppearancePrefs = c.prefs, minute: number = NOW[c.evening]) =>
  themeHold({
    stored: prefs.theme,
    resolved: paint(c, prefs, minute),
    phone: c.phone,
    entitled: c.entitled,
    dimWindow: autoDarkWindow(prefs.autoDark, null),
    clock24: c.clock24,
  });

const CASES: Case[] = THEME_CHOICES.flatMap(stored =>
  PHONES.flatMap(phone =>
    PLANS.flatMap(([plan, entitled]) =>
      DIMS.flatMap(dimTo =>
        EVENINGS.flatMap(evening =>
          [false, true].map(clock24 => ({
            name: [
              `${stored} on a ${phone} phone`,
              plan,
              `dim to ${dimTo}`,
              `window ${evening}`,
              ...(clock24 ? ['24h'] : []),
            ].join(', '),
            stored,
            phone,
            entitled,
            dimTo,
            evening,
            clock24,
            prefs: prefsFor(stored, dimTo, evening),
          })),
        ),
      ),
    ),
  ),
);

describe('the toggle is held exactly when a tap on it would change nothing on the screen', () => {
  it('walks every combination', () => {
    expect(CASES).toHaveLength(THEME_CHOICES.length * 2 * 2 * 2 * 3 * 2);
    // and the walk reaches both answers, and the one open window that is not held
    expect(CASES.some(c => holdFor(c).held)).toBe(true);
    expect(CASES.some(c => c.evening === 'open' && !holdFor(c).held)).toBe(true);
  });

  it('holds when, and only when, some tap the parent can make would be swallowed', () => {
    for (const c of CASES) {
      const painted = paint(c);
      const hold = holdFor(c);
      // a stop other than the one it rests on, not sold on this plan, whose tap paints what is
      // already on the screen: the owner's "moved to night / dark, but the screen didnt change"
      const swallowed = SKY_STOPS.filter(
        stop =>
          stop !== hold.stop &&
          !isLocked('theme', stop, c.entitled) &&
          paint(c, { ...c.prefs, theme: stop }).theme === painted.theme,
      );
      expect(hold.held, c.name).toBe(swallowed.length > 0);
    }
  });

  it('never holds with automatic night mode off, or before the evening', () => {
    for (const c of CASES.filter(x => x.evening !== 'open'))
      expect(holdFor(c).held, c.name).toBe(false);
  });

  /**
   * THE ONE OPEN WINDOW THAT IS NOT HELD: a Night of the parent's own outranks a window that dims
   * to Dark, so the window is painting nothing, and every tap shows (Dark paints Dark; Light lets
   * the window's Dark in, and then it holds). A control whose change can be seen is never held.
   */
  it('lets a Night of the parent’s own, outranking a window that dims to Dark, be changed', () => {
    const own = CASES.filter(
      c =>
        c.evening === 'open' && c.stored === 'night' && c.dimTo === 'dark' && c.entitled.nightTheme,
    );
    expect(own.length).toBeGreaterThan(0);
    for (const c of own) {
      expect(holdFor(c).held, c.name).toBe(false);
      expect(paint(c, { ...c.prefs, theme: 'dark' }).theme).toBe('dark');
      expect(holdFor(c, { ...c.prefs, theme: 'light' }).held).toBe(true);
    }
  });
});

describe('what the toggle and Match phone show', () => {
  it('rests on the look on the screen, held or not, for every combination', () => {
    for (const c of CASES) expect(holdFor(c).stop, c.name).toBe(paint(c).theme);
  });

  it('rests on the parent’s own choice whenever nothing holds it: `themeStop`, as before', () => {
    for (const c of CASES) {
      const hold = holdFor(c);
      if (hold.held) continue;
      const painted = paint(c);
      expect(hold.stop, c.name).toBe(themeStop(c.stored, painted.tookBack, c.phone));
    }
  });

  it('reads Match phone on only while the look really is following the phone', () => {
    for (const c of CASES) {
      const hold = holdFor(c);
      expect(hold.matchPhone, c.name).toBe(c.stored === 'system' && !hold.held);
      if (hold.matchPhone) expect(paint(c).theme, c.name).toBe(c.phone);
    }
  });

  /**
   * NOTHING STORED MOVES, and the parent's own choice comes back at once: in the morning, or the
   * moment automatic night mode is turned off with the sheet open. The toggle then rests on the
   * stored choice, as the plan paints it, and nothing is held.
   */
  it('gives the parent’s own choice back in the morning, or as soon as it is turned off', () => {
    for (const c of CASES.filter(x => holdFor(x).held)) {
      const morning = holdFor(c, c.prefs, at('06:00'));
      const off = holdFor(c, { ...c.prefs, autoDark: { ...c.prefs.autoDark, mode: 'off' } });
      for (const back of [morning, off]) {
        expect(back.held, c.name).toBe(false);
        expect(back.line).toBeNull();
        expect(back.stop, c.name).toBe(themeStop(c.stored, paint(c).tookBack, c.phone));
        expect(back.matchPhone, c.name).toBe(c.stored === 'system');
      }
    }
  });
});

describe('the line over a held toggle', () => {
  it('is there only while held, and says until when on the phone’s own clock', () => {
    for (const c of CASES) {
      const hold = holdFor(c);
      if (!hold.held) {
        expect(hold.line, c.name).toBeNull();
        expect(hold.until, c.name).toBeNull();
        continue;
      }
      // the window runs 8 p.m. to 6 a.m.: its end, written the way this phone writes a time
      expect(hold.until, c.name).toBe(c.clock24 ? '06:00' : '6:00 AM');
      expect(hold.line, c.name).toMatch(
        new RegExp(`^Automatic night mode is on until ${hold.until ?? ''}\\. `),
      );
    }
  });

  /**
   * IT NAMES DIM TO ONLY WHERE DIM TO WOULD CHANGE THE SCREEN. Naming a control whose change
   * cannot be seen would be the owner's evening one control further down: on a plan without Night
   * the other look is sold, and under a Night of the parent's own either look paints Night.
   */
  it('names Dim to only where its other look would repaint, and always the way out', () => {
    for (const c of CASES) {
      const hold = holdFor(c);
      if (hold.line === null) continue;
      const other: AutoDarkTheme = c.dimTo === 'dark' ? 'night' : 'dark';
      const shows =
        !isAutoDarkLocked(other, c.entitled) &&
        paint(c, { ...c.prefs, autoDark: { ...c.prefs.autoDark, theme: other } }).theme !==
          paint(c).theme;
      expect(hold.line.includes('Dim to'), c.name).toBe(shows);
      expect(hold.line.endsWith(shows ? AUTO_DARK_COPY.heldDimTo : AUTO_DARK_COPY.heldOff)).toBe(
        true,
      );
      expect(hold.line.toLowerCase(), c.name).toContain('turn it off to change the theme now');
    }
  });

  it('says the time the bed time pair ends, when the window follows it', () => {
    const c = CASES.find(x => x.evening === 'open' && x.stored === 'light' && !x.clock24);
    if (c === undefined) throw new Error('no open case');
    const auto = { ...c.prefs.autoDark, mode: 'bedtime' as const };
    const hold = themeHold({
      stored: 'light',
      resolved: paint(c),
      phone: c.phone,
      entitled: c.entitled,
      dimWindow: autoDarkWindow(auto, { wake: '06:45', bed: '19:30' }),
      clock24: false,
    });
    expect(hold.until).toBe('6:45 AM');
    expect(hold.line?.startsWith('Automatic night mode is on until 6:45 AM.')).toBe(true);
  });

  it('leaves the time out rather than guess, when the end cannot be known', () => {
    const c = CASES.find(x => x.evening === 'open' && x.stored === 'light');
    if (c === undefined) throw new Error('no open case');
    for (const dimWindow of [null, { from: '20:00', to: 'soon' }, { from: '20:00', to: '25:00' }]) {
      const hold = themeHold({
        stored: 'light',
        resolved: paint(c),
        phone: c.phone,
        entitled: c.entitled,
        dimWindow,
        clock24: false,
      });
      expect(hold.held).toBe(true);
      expect(hold.until).toBeNull();
      expect(hold.line?.startsWith('Automatic night mode is on. ')).toBe(true);
      expect(hold.line).not.toMatch(/\d/);
    }
  });
});

describe('what the line says', () => {
  const lines = [
    AUTO_DARK_COPY.heldOn('6:00 AM'),
    AUTO_DARK_COPY.heldOn('12:45 PM'),
    AUTO_DARK_COPY.heldOn('06:00'),
    AUTO_DARK_COPY.heldOn(null),
  ].flatMap(on => [`${on} ${AUTO_DARK_COPY.heldDimTo}`, `${on} ${AUTO_DARK_COPY.heldOff}`]);

  it('is two sentences at most, short, plain, in sentence case, with no dashes', () => {
    for (const line of lines) {
      expect(
        line.split(/[.!?](?:\s|$)/).filter(s => s.trim() !== '').length,
        line,
      ).toBeLessThanOrEqual(2);
      expect(line.length, line).toBeLessThanOrEqual(120);
      expect(line, line).not.toMatch(/[—–]| - /);
      expect(line, line).not.toContain('!');
      expect(line[0], line).toBe(line[0]?.toUpperCase());
    }
  });

  it('calls the free control Automatic night mode, and never names the sold look', () => {
    for (const line of lines) {
      expect(line, line).toContain('Automatic night mode');
      // "night mode" only ever inside the free control's own name (nightName.test.ts)
      expect(/night mode/i.test(line.replace(/automatic night mode/gi, '')), line).toBe(false);
      // lower case "night" is the time of day; the amber look, Night, is not what is being said
      expect(line, line).not.toMatch(/\bNight\b/);
      expect(line, line).not.toMatch(/Plus|price|upgrade/i);
    }
  });

  it('is US English and says nothing about the baby', () => {
    for (const line of lines) {
      expect(line, line).not.toMatch(/colour|favourite|cancelled|grey|centre|analyse|customise/i);
      expect(line, line).not.toMatch(/\bshould\b|your baby|asleep|bedtime is/i);
    }
  });
});

/**
 * WHAT IS NEVER HELD, AND THE PREMISE IT RESTS ON. A control whose change can be seen is never
 * held, and while the window is open the screen is Dark or Night. Color and Design both still show
 * there, so neither is held; if a change to the palette or the skins ever made one of them
 * invisible under either look, these fail, and that control joins the two that are.
 */
describe('Color and Design stay live under Dark and under Night', () => {
  it('a color repaints both: the whole palette under Dark, the accents under Night', () => {
    for (const theme of ['dark', 'night'] as const) {
      // `accent2` is the preview's current tab, its glyph, its word and its dot (TabBar.tsx)
      const tabs = new Set(SCHEME_NAMES.map(s => resolvePalette(theme, s).accent2));
      expect(tabs.size, theme).toBe(SCHEME_NAMES.length);
    }
  });

  it('a design repaints both: its material under Dark, its corners under Night', () => {
    const glass = (theme: 'dark' | 'night') => skinForTheme(SKINS.glass, theme);
    const paper = (theme: 'dark' | 'night') => skinForTheme(SKINS.paper, theme);
    expect(glass('dark').surface).not.toEqual(paper('dark').surface);
    for (const theme of ['dark', 'night'] as const)
      expect(glass(theme).radius, theme).not.toEqual(paper(theme).radius);
  });

  it('so the sheet holds the two theme controls and nothing else', () => {
    expect(sheet.match(/\bdisabled=/g)).toHaveLength(2);
    expect(sheet.match(/\bdisabled=\{hold\.held\}/g)).toHaveLength(2);
    // Dim to, in the automatic control, is the way to change the look tonight: never held
    const call = flat.slice(
      flat.indexOf('<AutoDarkControls'),
      flat.indexOf('testID="appearance.sheet.auto_dark"'),
    );
    expect(call).not.toContain('hold');
  });
});

describe('the sheet (tripwires over AppearanceSheet.tsx)', () => {
  it('asks `themeHold` with the resolver’s own window over the same bed time read', () => {
    expect(flat).toContain("const bedtime = useDimBedtime(prefs.autoDark.mode === 'bedtime');");
    expect(flat).toContain('dimWindow: autoDarkWindow(prefs.autoDark, bedtime),');
    expect(flat).toContain('clock24: deviceClock24(),');
  });

  it('holds the toggle and says why to a screen reader, and Match phone with it', () => {
    expect(flat).toContain('value={hold.stop}');
    expect(flat).toContain(
      'disabled={hold.held} {...(hold.line !== null ? { disabledHint: hold.line } : {})}',
    );
    expect(flat).toContain('switchValue={hold.matchPhone}');
    expect(flat).toContain(
      'disabled={hold.held} {...(hold.line !== null ? { accessibilityHint: hold.line } : {})}',
    );
  });

  it('draws the line above the toggle, in the words the held controls speak', () => {
    expect(flat).toContain(
      '{hold.line !== null ? ( <BodySm ink="text" testID="appearance.sheet.auto_now">',
    );
    expect(flat).toContain('testID="appearance.sheet.auto_now"> {hold.line} </BodySm> ) : null}');
    const line = sheet.indexOf('appearance.sheet.auto_now');
    expect(line).toBeGreaterThan(sheet.indexOf('<Label>Theme</Label>'));
    expect(line).toBeLessThan(sheet.indexOf('<ThemeSkyToggle'));
    // and the old note under Match phone, which explained a disagreement that is gone, is gone
    expect(sheet).not.toContain('resolved.autoDark.active');
    expect(sheet).not.toContain('activeNote');
  });
});
