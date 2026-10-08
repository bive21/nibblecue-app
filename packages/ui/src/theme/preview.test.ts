/**
 * A PREVIEW IS PAINTED, NEVER STORED (2026-09-25) — `resolveAppearance`'s fifth argument.
 *
 * Setup's "Try me" used to write its dark theme as the stored choice, so an app killed with the
 * preview on came back dark and the parent's own theme was gone from the device. The provider
 * now holds the preview in memory and hands it to the resolver, which lays it over the stored
 * choice. These hold the two halves of that promise in the one place that decides what is
 * painted: the preview paints exactly what the same choice made for real would — through the same
 * OS default, the same plan gate and the same only-ever-darker evening dim — and the stored
 * choice it is laid over comes back out untouched.
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  FREE_APPEARANCE,
  PLUS_APPEARANCE,
  resolveAppearance,
  THEME_CHOICES,
  type AppearancePrefs,
  type AutoDarkTheme,
  type ResolvedAppearance,
} from './appearance';
import { DEFAULT_SCHEME } from './theme';

/** Everything the resolver paints, with the stored choice it reports back blanked out. */
const painted = (r: ResolvedAppearance) => ({ ...r, prefs: null });

const stored = (theme: AppearancePrefs['theme']): AppearancePrefs => ({
  ...DEFAULT_APPEARANCE,
  theme,
  // a paid look too, so the plan's other take-backs are in play and must not move. REEF, not
  // Ocean: Ocean became the free default on 2026-09-27, and a free scheme is never taken back
  scheme: 'reef',
});

describe('the stored look these cases are built on', () => {
  it('carries a scheme the free plan takes back', () => {
    expect(stored('light').scheme).not.toBe(DEFAULT_SCHEME);
    expect(resolveAppearance(stored('light'), 'light', FREE_APPEARANCE).tookBack.scheme).toBe(true);
  });
});

const SYSTEMS = ['light', 'dark'] as const;
const PLANS = [PLUS_APPEARANCE, FREE_APPEARANCE] as const;
const WINDOWS: readonly (AutoDarkTheme | null)[] = [null, 'dark', 'night'];

describe('resolveAppearance with a preview', () => {
  it('paints over the stored theme, and reports the stored choice back untouched', () => {
    const prefs = stored('light');
    const r = resolveAppearance(prefs, 'light', PLUS_APPEARANCE, null, 'dark');
    expect(r.theme).toBe('dark');
    // the SAME object: nothing about the stored choice was copied, changed or replaced
    expect(r.prefs).toBe(prefs);
    expect(r.prefs.theme).toBe('light');
  });

  it('paints exactly what the same choice STORED would paint, in every case', () => {
    // the whole promise in one sweep: the OS default, the plan gate (night → dark on a free
    // plan, the paid scheme taken back) and the evening dim all treat a preview as the choice
    for (const base of THEME_CHOICES)
      for (const preview of THEME_CHOICES)
        for (const system of SYSTEMS)
          for (const plan of PLANS)
            for (const auto of WINDOWS) {
              const shown = resolveAppearance(stored(base), system, plan, auto, preview);
              const asIfChosen = resolveAppearance(stored(preview), system, plan, auto);
              const where = `${base} under ${preview}, ${system} phone, auto ${auto}`;
              expect(painted(shown), where).toEqual(painted(asIfChosen));
              expect(shown.prefs.theme, where).toBe(base);
            }
  });

  it('is gated like any choice: a night preview on a free plan paints dark, and says so', () => {
    const r = resolveAppearance(stored('light'), 'light', FREE_APPEARANCE, null, 'night');
    expect(r.theme).toBe('dark');
    expect(r.tookBack.night).toBe(true);
  });

  it('is only ever darkened by the evening dim, never brightened', () => {
    // a window that wants night takes a dark preview further down…
    expect(
      resolveAppearance(stored('light'), 'light', PLUS_APPEARANCE, 'night', 'dark').theme,
    ).toBe('night');
    // …and a window that wants only dark leaves a night preview where it is
    expect(
      resolveAppearance(stored('light'), 'light', PLUS_APPEARANCE, 'dark', 'night').theme,
    ).toBe('night');
  });

  it('paints the stored choice, exactly as before, when there is no preview', () => {
    for (const base of THEME_CHOICES)
      for (const system of SYSTEMS)
        for (const plan of PLANS)
          for (const auto of WINDOWS)
            expect(resolveAppearance(stored(base), system, plan, auto, null)).toEqual(
              resolveAppearance(stored(base), system, plan, auto),
            );
  });
});
