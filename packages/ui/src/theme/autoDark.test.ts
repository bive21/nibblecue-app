/**
 * THE AUTOMATIC EVENING DIM (the owner, 2026-09-20: *"Add the option to turn on automatic dark
 * mode at certain times (night) or follow Chiara's bed time"*).
 *
 * Every rule that decides when the app dims itself is a pure function in `appearance.ts`, and
 * this is where they are held. The provider owns a clock and nothing else; if a case can be
 * written here it does not need a rendered screen to be proved.
 */
import { describe, expect, it } from 'vitest';
import {
  AUTO_DARK_MODES,
  DEFAULT_APPEARANCE,
  DEFAULT_AUTO_DARK,
  FREE_APPEARANCE,
  PLUS_APPEARANCE,
  autoDarkThemeAt,
  autoDarkWindow,
  parseAppearance,
  parseAutoDark,
  resolveAppearance,
  withBedtimeFallback,
  withinDimWindow,
  type AutoDarkPrefs,
} from './appearance';

const at = (hhmm: string): number => {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};
const auto = (patch: Partial<AutoDarkPrefs> = {}): AutoDarkPrefs => ({
  ...DEFAULT_AUTO_DARK,
  ...patch,
});

describe('withinDimWindow — an evening window wraps, and a broken one never fires', () => {
  it('holds from the start through midnight to the end, exclusive at the end', () => {
    const inside = (hhmm: string) => withinDimWindow(at(hhmm), '20:00', '07:00');
    expect(inside('19:59')).toBe(false);
    expect(inside('20:00')).toBe(true);
    expect(inside('23:59')).toBe(true);
    expect(inside('00:00')).toBe(true);
    expect(inside('03:00')).toBe(true);
    expect(inside('06:59')).toBe(true);
    // EXCLUSIVE at the end, the same way every other window in this codebase is: a parent who
    // says the dim ends at 7 expects a light app at 7:00, not at 7:01.
    expect(inside('07:00')).toBe(false);
    expect(inside('12:00')).toBe(false);
  });

  it('handles a window that does not wrap', () => {
    const inside = (hhmm: string) => withinDimWindow(at(hhmm), '13:00', '15:00');
    expect(inside('12:59')).toBe(false);
    expect(inside('13:00')).toBe(true);
    expect(inside('14:59')).toBe(true);
    expect(inside('15:00')).toBe(false);
    expect(inside('23:00')).toBe(false);
  });

  /**
   * AN EQUAL PAIR IS NEVER, NOT ALWAYS — the opposite of `isAwakeAt`, on purpose. There, the
   * failure is one wrong word on an entry; here, a permanently dim app is something a parent
   * has to hunt through settings to undo, and a window that never fires is one they notice
   * the same evening.
   */
  it('never fires when the two times are the same, or unreadable', () => {
    for (const hhmm of ['00:00', '09:30', '20:00']) {
      expect(withinDimWindow(at(hhmm), '20:00', '20:00')).toBe(false);
    }
    expect(withinDimWindow(at('21:00'), 'evening', '07:00')).toBe(false);
    expect(withinDimWindow(at('21:00'), '25:00', '07:00')).toBe(false);
    // (`isAwakeAt` in packages/core reads an equal pair the OTHER way, as always awake. The
    // two are neighbours and this is the line where they deliberately disagree; its own test
    // pins that side. No import across the package line for one assertion.)
  });
});

describe('autoDarkWindow — which pair the window runs on', () => {
  const bedtime = { wake: '06:30', bed: '19:45' };

  it('is null when the mode is off, whatever the times say', () => {
    expect(autoDarkWindow(auto({ mode: 'off' }), bedtime)).toBeNull();
  });

  it('uses the stored chips for `times`, even when a bed time is known', () => {
    expect(autoDarkWindow(auto({ mode: 'times' }), bedtime)).toEqual({
      from: '20:00',
      to: '07:00',
    });
  });

  /** Bed → wake: the baby's night, inverted from the household's own waking window. */
  it('uses the household bed time for `bedtime`', () => {
    expect(autoDarkWindow(auto({ mode: 'bedtime' }), bedtime)).toEqual({
      from: '19:45',
      to: '06:30',
    });
  });

  /**
   * NO ROW YET IS NOT A BROKEN WINDOW. A first launch, an onboarding still in progress, or a
   * device that has not pulled the household's settings falls back to the parent's own chips
   * rather than to nothing — and is replaced the moment the real pair arrives.
   */
  it('falls back to the stored chips when the bed time has not been read', () => {
    expect(autoDarkWindow(auto({ mode: 'bedtime', from: '21:00', to: '06:00' }), null)).toEqual({
      from: '21:00',
      to: '06:00',
    });
  });
});

describe('withBedtimeFallback — setup answers before the household exists', () => {
  const pair = { wake: '06:30', bed: '19:45' };

  it('copies the pair into the chips for `bedtime`, and leaves every other mode alone', () => {
    expect(withBedtimeFallback(auto({ mode: 'bedtime' }), pair)).toEqual({
      ...DEFAULT_AUTO_DARK,
      mode: 'bedtime',
      from: '19:45',
      to: '06:30',
    });
    expect(withBedtimeFallback(auto({ mode: 'times' }), pair)).toEqual(auto({ mode: 'times' }));
    expect(withBedtimeFallback(auto({ mode: 'off' }), pair)).toEqual(DEFAULT_AUTO_DARK);
  });

  it('is only a fallback: a real pair still wins once there is one', () => {
    const seeded = withBedtimeFallback(auto({ mode: 'bedtime' }), pair);
    expect(autoDarkWindow(seeded, { wake: '07:15', bed: '20:30' })).toEqual({
      from: '20:30',
      to: '07:15',
    });
  });
});

describe('autoDarkThemeAt — what the clock asks for', () => {
  it('asks for nothing when it is off', () => {
    expect(autoDarkThemeAt(auto({ mode: 'off' }), at('23:00'), null)).toBeNull();
  });

  it('asks for the chosen look inside the window and nothing outside it', () => {
    const a = auto({ mode: 'times', theme: 'night' });
    expect(autoDarkThemeAt(a, at('22:00'), null)).toBe('night');
    expect(autoDarkThemeAt(a, at('05:00'), null)).toBe('night');
    expect(autoDarkThemeAt(a, at('09:00'), null)).toBeNull();
  });

  it('follows the bed time when asked to', () => {
    const a = auto({ mode: 'bedtime', theme: 'dark' });
    const bed = { wake: '07:00', bed: '19:30' };
    expect(autoDarkThemeAt(a, at('19:29'), bed)).toBeNull();
    expect(autoDarkThemeAt(a, at('19:30'), bed)).toBe('dark');
    // move bedtime and the dim moves with it — there is no second place to keep in step
    expect(autoDarkThemeAt(a, at('19:30'), { wake: '07:00', bed: '21:00' })).toBeNull();
  });
});

describe('resolveAppearance — the window only ever dims', () => {
  const light = { ...DEFAULT_APPEARANCE, theme: 'light' as const };

  it('paints the window over light, and leaves the stored choice alone outside it', () => {
    expect(resolveAppearance(light, 'light', PLUS_APPEARANCE, 'dark').theme).toBe('dark');
    expect(resolveAppearance(light, 'light', PLUS_APPEARANCE, null).theme).toBe('light');
  });

  it('paints over a system-light phone, and over a system-dark one too when it wants night', () => {
    const system = { ...DEFAULT_APPEARANCE, theme: 'system' as const };
    expect(resolveAppearance(system, 'light', PLUS_APPEARANCE, 'dark').theme).toBe('dark');
    expect(resolveAppearance(system, 'dark', PLUS_APPEARANCE, 'night').theme).toBe('night');
  });

  /**
   * THE RULE THE WHOLE FEATURE TURNS ON. An automatic switch that could make the app BRIGHTER
   * than the theme the parent chose would be a second, invisible theme control fighting the
   * first one — and the loser would always be the explicit choice.
   */
  it('never brightens: a stored dark or night outranks a window that wants less', () => {
    const dark = { ...DEFAULT_APPEARANCE, theme: 'dark' as const };
    const night = { ...DEFAULT_APPEARANCE, theme: 'night' as const };
    expect(resolveAppearance(dark, 'light', PLUS_APPEARANCE, 'dark').theme).toBe('dark');
    expect(resolveAppearance(dark, 'light', PLUS_APPEARANCE, 'dark').autoDark.active).toBe(false);
    expect(resolveAppearance(night, 'light', PLUS_APPEARANCE, 'dark').theme).toBe('night');
    expect(resolveAppearance(night, 'light', PLUS_APPEARANCE, 'night').theme).toBe('night');
    // dark → night IS a dim, so it still applies
    expect(resolveAppearance(dark, 'light', PLUS_APPEARANCE, 'night').theme).toBe('night');
    expect(resolveAppearance(dark, 'light', PLUS_APPEARANCE, 'night').autoDark.active).toBe(true);
  });

  /**
   * NIGHT IS SOLD AND THE CLOCK IS NOT. A free household's window set to night paints dark —
   * the same landing the resolver already gives a stored night theme — and says so, so the
   * settings row can tell them in words instead of silently doing something else.
   */
  it('takes night back on a free plan and lands on dark, never light', () => {
    const r = resolveAppearance(light, 'light', FREE_APPEARANCE, 'night');
    expect(r.theme).toBe('dark');
    expect(r.autoDark).toEqual({ open: true, active: true, theme: 'dark', tookBack: true });
    // the STORED theme was never night, so the stored take-back note stays silent
    expect(r.tookBack.night).toBe(false);
    // ...and dark on a free plan is not taken back at all: it is the bill of rights
    expect(resolveAppearance(light, 'light', FREE_APPEARANCE, 'dark').theme).toBe('dark');
    expect(resolveAppearance(light, 'light', FREE_APPEARANCE, 'dark').autoDark.tookBack).toBe(
      false,
    );
  });

  it('reports a shut window as shut', () => {
    expect(resolveAppearance(light, 'light', PLUS_APPEARANCE).autoDark).toEqual({
      open: false,
      active: false,
      theme: null,
      tookBack: false,
    });
  });
});

describe('parseAutoDark — whatever was stored becomes a usable window', () => {
  it('falls back per field', () => {
    expect(parseAutoDark(undefined)).toEqual(DEFAULT_AUTO_DARK);
    expect(parseAutoDark({ mode: 'bedtime', from: '21:15', to: '06:45', theme: 'night' })).toEqual({
      mode: 'bedtime',
      from: '21:15',
      to: '06:45',
      theme: 'night',
    });
    expect(parseAutoDark({ mode: 'on' }).mode).toBe('off');
    expect(parseAutoDark({ theme: 'light' }).theme).toBe('dark');
    expect(parseAutoDark({ from: 'nine' }).from).toBe(DEFAULT_AUTO_DARK.from);
    // the server prints a `time` column as `20:00:00`; both shapes come out of the same field
    expect(parseAutoDark({ from: '20:00:00' }).from).toBe('20:00');
    expect(parseAutoDark({ from: '9:05' }).from).toBe('09:05');
  });

  it('is off for every household that predates the field', () => {
    expect(parseAppearance({ theme: 'dark' }).autoDark).toEqual(DEFAULT_AUTO_DARK);
    expect(DEFAULT_AUTO_DARK.mode).toBe('off');
    expect(AUTO_DARK_MODES[0]).toBe('off');
  });
});
