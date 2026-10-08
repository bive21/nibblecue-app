/**
 * CALM MOTION (2026-09-28): the owner asked whether the app was "too animated … too much" for a new
 * parent, and at 3 a.m. it was. The setting itself is the design system's (`reducesMotion`, tested
 * there); this suite holds the app's half: the row's words and states, where the row sits, that it
 * is free and this phone's alone, and that the one effective answer is what the design system is
 * told. The sheet and the provider are read, never imported: they pull in React Native.
 */
import { DAYTIME, FEATURES, GATES } from '@nibblecue/core';
import { DEFAULT_APPEARANCE } from '@nibblecue/ui/appearance';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CALM_MOTION_COPY,
  CALM_MOTION_OPTIONS,
  calmMotionView,
  calmNightLine,
  hourWords,
} from './calmMotion';

const here = dirname(fileURLToPath(import.meta.url));
/** Comments out and whitespace folded: a scan must read the code, not its explanation. */
const code = (p: string): string =>
  readFileSync(join(here, p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

/** Every sentence the row can show, in every state it can be in. */
const everyLine = [
  CALM_MOTION_COPY.title,
  ...CALM_MOTION_OPTIONS.map(o => o.label),
  ...(['off', 'night', 'always'] as const).flatMap(calm =>
    [true, false].flatMap(phone => [true, false].map(h24 => calmMotionView(calm, phone, h24).line)),
  ),
];

describe('the row’s words', () => {
  it('says what a parent will see, in the owner’s words', () => {
    expect(CALM_MOTION_COPY.title).toBe('Calm motion');
    expect(CALM_MOTION_OPTIONS.map(o => o.label)).toEqual(['Off', 'At night', 'Always']);
    expect(CALM_MOTION_OPTIONS.map(o => o.value)).toEqual(['off', 'night', 'always']);
    expect(CALM_MOTION_COPY.off).toBe('Off: the app moves as it was designed to.');
    expect(CALM_MOTION_COPY.always).toBe('Always: still at every hour.');
    expect(CALM_MOTION_COPY.phone).toBe(
      'On in your phone’s settings, so the app keeps still at every hour.',
    );
  });

  it('explains what it is, and that logging is untouched (the owner, 2026-10-06)', () => {
    const about = CALM_MOTION_COPY.about;
    expect(about).toMatch(/^For less movement on the screen\./);
    expect(about).toContain('sheets open at once');
    expect(about).toContain('Logging, timers and reminders work exactly the same.');
    expect(about).not.toMatch(/[-‐‑‒–—―]/);
    expect(about).not.toMatch(/reduce motion/i);
    expect(code('CalmMotionRow.tsx')).toContain('{CALM_MOTION_COPY.about}');
  });

  it('holds no dash of any kind, and stays short, in sentence case', () => {
    for (const line of everyLine) {
      expect(line, line).not.toMatch(/[-‐‑‒–—―]/);
      expect(line.length, line).toBeLessThanOrEqual(100);
      // sentence case: a capital to start each sentence and none after it but the clock's AM/PM
      expect(line[0], line).toBe(line[0]?.toUpperCase());
      const inner = line
        .slice(1)
        .replace(/\b[AP]M\b/g, '')
        .replace(/\. [A-Z]/g, '. x');
      expect(inner, line).not.toMatch(/ [A-Z]/);
    }
  });

  it('is US English and never borrows the phone’s own name for its setting', () => {
    for (const line of everyLine) {
      expect(line, line).not.toMatch(/colour|behaviour|favourite|programme/i);
      // "Reduce Motion" is the phone's switch; a parent who met both would take them for one
      expect(line, line).not.toMatch(/reduce motion/i);
    }
  });
});

describe('At night names its hours, from the one pair every quiet rule keeps', () => {
  it('reads 9 PM to 8 AM on a 12 hour phone and 21:00 to 08:00 on a 24 hour one', () => {
    expect(calmNightLine(false)).toBe('from 9 PM to 8 AM.');
    expect(calmNightLine(true)).toBe('from 21:00 to 08:00.');
  });

  it('is built from the daytime’s own hours, never a second pair of numbers', () => {
    expect(calmNightLine(false)).toBe(
      `from ${hourWords(DAYTIME.untilHour, false)} to ${hourWords(DAYTIME.fromHour, false)}.`,
    );
    expect(code('calmMotion.ts')).not.toMatch(/\b(21|9)\s*(PM|:00)/);
  });

  it('says a whole hour the way the phone’s clock does', () => {
    expect(hourWords(0, false)).toBe('12 AM');
    expect(hourWords(12, false)).toBe('12 PM');
    expect(hourWords(8, false)).toBe('8 AM');
    expect(hourWords(8, true)).toBe('08:00');
    expect(hourWords(21, true)).toBe('21:00');
  });
});

describe('what the row shows', () => {
  it('shows the stored answer, with its one line; At night names its hours', () => {
    expect(calmMotionView('off', false, false)).toEqual({
      value: 'off',
      disabled: false,
      line: CALM_MOTION_COPY.off,
    });
    expect(calmMotionView('always', false, false)).toEqual({
      value: 'always',
      disabled: false,
      line: CALM_MOTION_COPY.always,
    });
    expect(calmMotionView('night', false, false)).toEqual({
      value: 'night',
      disabled: false,
      line: 'At night: still from 9 PM to 8 AM.',
    });
  });

  it('shows Always, takes no tap and says so when the phone itself asks for less motion', () => {
    for (const calm of ['off', 'night', 'always'] as const) {
      const view = calmMotionView(calm, true, false);
      expect(view.value, calm).toBe('always');
      expect(view.disabled, calm).toBe(true);
      expect(view.line, calm).toBe(CALM_MOTION_COPY.phone);
    }
  });

  it('starts every phone on Off (the owner, 2026-10-06)', () => {
    expect(DEFAULT_APPEARANCE.calmMotion).toBe('off');
  });
});

describe('where it sits, and how it is wired', () => {
  const sheet = code('AppearanceSheet.tsx');
  const row = code('CalmMotionRow.tsx');
  const provider = code('AppearanceProvider.tsx');

  it('is on the Appearance sheet once, under Vibration and before Design', () => {
    expect(sheet).toContain("import { CalmMotionRow } from './CalmMotionRow';");
    expect(sheet.match(/<CalmMotionRow \/>/g) ?? []).toHaveLength(1);
    const at = sheet.indexOf('<CalmMotionRow />');
    expect(at).toBeGreaterThan(sheet.indexOf('<HapticsRow />'));
    expect(at).toBeLessThan(sheet.indexOf('<Label>Design</Label>'));
  });

  it('is a title, the three answers and one line, and a tap is a live `set`', () => {
    expect(row).toContain('<Label>{CALM_MOTION_COPY.title}</Label>');
    expect(row).toContain(
      '<SegmentedControl label={CALM_MOTION_COPY.title} options={CALM_MOTION_OPTIONS} value={view.value} onChange={calmMotion => set({ calmMotion, calmMotionChosen: true })} disabled={view.disabled} testID="appearance.sheet.calm.mode" />',
    );
    expect(row).toContain('<BodySm testID="appearance.sheet.calm.note">{view.line}</BodySm>');
    expect(row).toContain(
      'const view = calmMotionView(prefs.calmMotion, osReduceMotion, deviceClock24());',
    );
  });

  it('is free on every plan: no gate, no lock, no plan read', () => {
    expect(GATES.map(g => `${g.surface} ${g.feature}`).join(' ')).not.toMatch(/calm|motion/i);
    expect(Object.keys(FEATURES).join(' ')).not.toMatch(/calm|motion/i);
    expect(row).not.toMatch(/openGate|isLocked|usePlan|can\(|locked/);
  });

  it('tells the design system the one effective answer: the phone, Always, or At night after nine', () => {
    expect(provider).toContain('const daytime = useDaytime();');
    expect(provider).toContain(
      'const reduceMotion = reducesMotion({ phone: osReduceMotion, calm: prefs?.calmMotion ?? DEFAULT_APPEARANCE.calmMotion, daytime, });',
    );
    expect(provider).toContain(
      '<ThemeProvider appearance={resolved} fontsReady={fontsReady} reduceMotion={reduceMotion}',
    );
    // and whether that stillness is the app's Calm motion alone, not the phone's (2026-10-06): the
    // diaper hops slower under Calm motion and holds still for the phone's Reduce Motion
    expect(provider).toContain('calmMotion={!osReduceMotion}');
    // the phone's own setting only ever reaches the design system through that one answer
    expect(provider).toContain(
      "AccessibilityInfo.addEventListener('reduceMotionChanged', setOsReduceMotion)",
    );
    expect(provider).not.toContain('reduceMotion={osReduceMotion}');
    // and it is decided before the sunset, which asks it too
    expect(provider.indexOf('const reduceMotion = reducesMotion(')).toBeLessThan(
      provider.indexOf('reduceMotion, });'),
    );
  });

  it('reads the phone’s daytime off the app’s one minute clock, never a timer of its own', () => {
    const daytime = readFileSync(join(here, '..', 'time', 'useDaytime.ts'), 'utf8');
    expect(daytime).toContain(
      'useSyncExternalStore(subscribeToMinuteClock, readDaytime, readDaytime)',
    );
    expect(daytime).not.toMatch(/setTimeout|setInterval/);
  });
});
