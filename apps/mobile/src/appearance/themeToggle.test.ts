/**
 * THE APPEARANCE SHEET'S THEME, AS A PICTURE (the owner, 2026-09-25: *"Make 3 a 3 way toggle:
 * left day, middle night, right dark"*, in setup's sun-and-moon switch, with the chosen look's
 * word on it). The toggle's own geometry, frames and colors are proved in `packages/ui`
 * (`themeSkyToggle.test.ts`, `sky.test.ts`). What is left is the app's half, which no pure
 * function in the design system can see: that the sheet draws the toggle and not the segmented
 * control, that it rests on what is painted, that "Match phone" survived as a switch of its own,
 * that Night still goes through the one gate, and that the words the app REALLY passes fit the
 * pill at every width the sheet can have.
 */
import {
  DEFAULT_APPEARANCE,
  FREE_APPEARANCE,
  PLUS_APPEARANCE,
  resolveAppearance,
  THEME_CHOICES,
} from '@nibblecue/ui/appearance';
import {
  DIM_STOPS,
  SKY_STOPS,
  THEME_SKY_SIZE,
  themeSkyGeometry,
  WORD_TYPE,
  wordScaleCap,
} from '@nibblecue/ui/layout';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DIM_TO_LABELS,
  isLocked,
  MATCH_PHONE,
  shownTheme,
  THEME_OPTIONS,
  THEME_STOP_LABELS,
  themeStop,
} from './options';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p: string) => readFileSync(join(here, p), 'utf8');
/** Comments out: the sheet explains its rules, and a scan must not read the explanation. */
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const sheet = code(read('AppearanceSheet.tsx'));
const flat = sheet.replace(/\s+/g, ' ');

const option = (value: string) => THEME_OPTIONS.find(o => o.value === value);

describe('the words on the toggle are the words the sheet always used', () => {
  it('names the three stops with the theme options’ own labels', () => {
    expect(THEME_STOP_LABELS).toEqual({ light: 'Light', night: 'Night', dark: 'Dark' });
    for (const stop of SKY_STOPS) expect(THEME_STOP_LABELS[stop]).toBe(option(stop)?.label);
  });

  it('keeps "Match phone" and its line, from the same table, for the row under it', () => {
    expect(MATCH_PHONE.label).toBe('Match phone');
    expect(MATCH_PHONE.label).toBe(option('system')?.label);
    expect(MATCH_PHONE.note).toBe(option('system')?.note);
  });
});

describe('where the knob rests', () => {
  it('rests on what is painted, for every stored choice, phone and plan', () => {
    // with no evening window open, the look on the screen is exactly the stop the knob is on
    for (const stored of THEME_CHOICES)
      for (const phone of ['light', 'dark'] as const)
        for (const entitled of [FREE_APPEARANCE, PLUS_APPEARANCE]) {
          const resolved = resolveAppearance(
            { ...DEFAULT_APPEARANCE, theme: stored },
            phone,
            entitled,
          );
          expect(themeStop(stored, resolved.tookBack, phone), `${stored}, ${phone} phone`).toBe(
            resolved.theme,
          );
        }
  });

  it('follows the phone while "Match phone" is on, and never rests on a locked Night', () => {
    expect(themeStop('system', { night: false }, 'light')).toBe('light');
    expect(themeStop('system', { night: false }, 'dark')).toBe('dark');
    // a stored Night the free plan took back rests on the dark that is painted, so the lock
    // drawn beside Night's crescent stays in view and a tap on it can open the gate
    const stored = 'night' as const;
    const tookBack = { night: isLocked('theme', stored, FREE_APPEARANCE) };
    expect(themeStop(stored, tookBack, 'light')).toBe('dark');
    expect(themeStop(stored, tookBack, 'light')).toBe(shownTheme(stored, tookBack));
  });
});

describe('the Theme section of the sheet', () => {
  it('draws the sky toggle, and no segmented control anywhere on the sheet', () => {
    expect(sheet).toContain('<ThemeSkyToggle');
    expect(sheet).not.toContain('SegmentedControl');
    // under the section's own label, and above the automatic window it is the first answer to
    expect(sheet.indexOf('<Label>Theme</Label>')).toBeLessThan(sheet.indexOf('<ThemeSkyToggle'));
    expect(sheet.indexOf('<ThemeSkyToggle')).toBeLessThan(sheet.indexOf('<AutoDarkControls'));
  });

  it('rests on `themeHold`, reads its words from options.ts, and has the sheet’s own width', () => {
    expect(flat).toContain('label="Theme"');
    expect(flat).toContain('labels={THEME_STOP_LABELS}');
    // `themeStop` while nothing holds it, the look on the screen while automatic night mode
    // decides it (2026-09-29): both inside `themeHold`, walked in themeHold.test.ts
    expect(flat).toContain('value={hold.stop}');
    expect(flat).toContain(
      'const hold = themeHold({ stored: prefs.theme, resolved, phone: system, entitled, dimWindow: autoDarkWindow(prefs.autoDark, bedtime), clock24: deviceClock24(), });',
    );
    expect(flat).toContain('width={bodyWidth}');
    expect(flat).toContain('const bodyWidth = Math.max(0, win.width - 2 * t.space.xxl);');
    // the preview is the same width as ever: one number for the sheet's body
    expect(flat).toContain('<AppearancePreview width={bodyWidth} />');
    expect(flat).toContain('testID="appearance.sheet.theme"');
  });

  it('sends every tap through `pick`, so a locked Night opens the gate and changes nothing', () => {
    expect(flat).toContain("onChange={v => pick('theme', v, { theme: v })}");
    // pick: a locked choice opens the gate over the sheet and returns before `set`
    expect(flat).toMatch(
      /if \(isLocked\(kind, value, entitled\)\) \{ const feature = gateFor\(kind\); if \(feature\) shell\.openGate\(feature\); return; \} set\(patch\);/,
    );
    // and the lock is drawn before the tap, from the same answer, with the sheet's own words
    expect(flat).toContain("const nightLocked = isLocked('theme', 'night', entitled);");
    expect(flat).toContain('locked={{ night: nightLocked }}');
    expect(flat).toContain('lockedHint={hint}');
    expect(flat).toContain('const hint = `Included with ${plusName}`;');
  });

  it('keeps "Match phone" as a switch row directly under the toggle', () => {
    const toggle = sheet.indexOf('<ThemeSkyToggle');
    const row = sheet.indexOf('testID="appearance.sheet.theme.system"');
    expect(row).toBeGreaterThan(toggle);
    expect(row).toBeLessThan(sheet.indexOf('appearance.sheet.night_note'));
    expect(flat).toContain('title={MATCH_PHONE.label}');
    expect(flat).toContain('detail={MATCH_PHONE.note}');
    // on while the look follows the phone; off, and held with the toggle, while automatic night
    // mode decides the look (2026-09-29)
    expect(flat).toContain('switchValue={hold.matchPhone}');
    // off keeps the look the phone is showing, so nothing on the screen moves
    expect(flat).toContain("onSwitch={on => set({ theme: on ? 'system' : system })}");
    expect(flat).toContain('const { prefs, resolved, entitled, system, set } = useAppearance();');
  });

  it('keeps the night note under Theme, and the held line above the toggle', () => {
    expect(flat).toContain('testID="appearance.sheet.night_note"');
    expect(flat).toContain('`Night is part of ${plusName}.');
    // the line saying automatic night mode is on is read BEFORE the toggle it explains
    const line = sheet.indexOf('testID="appearance.sheet.auto_now"');
    expect(line).toBeGreaterThan(sheet.indexOf('<Label>Theme</Label>'));
    expect(line).toBeLessThan(sheet.indexOf('<ThemeSkyToggle'));
  });
});

describe('the words the app passes fit the pill, at every width the sheet can have', () => {
  // the sheet's body is the window less 2 × space.xxl: 272 on a 308 pt window, 360 on a 396 one,
  // and the pill stops growing there
  const widths = Array.from(
    { length: (THEME_SKY_SIZE.maxWidth - THEME_SKY_SIZE.minWidth) * 2 + 1 },
    (_, i) => THEME_SKY_SIZE.minWidth + i / 2,
  );

  it('grows with the phone’s text to at least 1.3× before it stops, locked or not', () => {
    for (const locked of [{}, { night: true }])
      for (const width of [...widths, 394, 430]) {
        const cap = wordScaleCap(themeSkyGeometry(width, locked), THEME_STOP_LABELS);
        expect(cap, `at ${width}`).toBeGreaterThanOrEqual(WORD_TYPE.floor);
      }
  });

  // "Dim to" (2026-09-26) is the same pill with two stops, as wide as the same body
  it('and so do "Dim to"’s two words, on its two stops, with Night locked or not', () => {
    for (const locked of [{}, { night: true }])
      for (const width of [...widths, 394, 430]) {
        const cap = wordScaleCap(themeSkyGeometry(width, locked, DIM_STOPS), DIM_TO_LABELS);
        expect(cap, `at ${width}`).toBeGreaterThanOrEqual(WORD_TYPE.floor);
      }
  });
});
