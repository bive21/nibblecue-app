import { describe, expect, it } from 'vitest';
import {
  CALM_MOTIONS,
  DEFAULT_APPEARANCE,
  DEFAULT_AUTO_DARK,
  DEFAULT_SHAPE,
  FREE_APPEARANCE,
  parseAppearance,
  PLUS_APPEARANCE,
  QUICK_SHAPES,
  reducesMotion,
  resolveAppearance,
  SCHEME_NAMES,
  statusBarStyleFor,
  THEME_CHOICES,
  type CalmMotion,
  type QuickShape,
} from './appearance';
import { SKINS } from './skins';
import {
  DEFAULT_SCHEME,
  gradients,
  resolvePalette,
  schemes,
  themes,
  type SchemeName,
} from './theme';

describe('parseAppearance — whatever was stored becomes a valid preference', () => {
  it('falls back per field, never as a whole', () => {
    expect(parseAppearance(undefined)).toEqual(DEFAULT_APPEARANCE);
    const stored = {
      theme: 'night',
      scheme: 'ocean',
      skin: 'paper',
      tabs: 'rounded',
      shape: 'bubble',
      logSlider: true,
    } as const;
    expect(parseAppearance(stored)).toEqual({
      ...stored,
      autoDark: DEFAULT_AUTO_DARK,
      calmMotion: 'off',
      calmMotionChosen: false,
    });
    // THE TAB POLICY IS FORCED, not defaulted (the owner, 2026-09-18: "all labels 0 tab
    // labels"). A household stored on "Icons only" before the setting was removed must not be
    // stranded on an unlabeled bar with nothing left to change it, so the parser overrules the
    // stored value rather than merely preferring its own default.
    expect(parseAppearance({ ...stored, tabs: 'icons' }).tabs).toBe('rounded');
    expect(parseAppearance({ ...stored, tabs: 'focus' }).tabs).toBe('rounded');
    // THE LOG ROW IS OFF UNLESS A STORED `true` SAYS OTHERWISE (the owner, 2026-09-18). Missing
    // is off — which is every household that predates the field, not only a new install — and so
    // is any value that is not the boolean: a stored "true" is a string an older writer left.
    expect(parseAppearance({ ...stored, logSlider: undefined }).logSlider).toBe(false);
    expect(parseAppearance({ ...stored, logSlider: 'true' }).logSlider).toBe(false);
    expect(parseAppearance({ ...stored, logSlider: 1 }).logSlider).toBe(false);
    expect(DEFAULT_APPEARANCE.logSlider).toBe(false);
    // an unknown scheme — one removed in a later release, as `twilight` was on 2026-09-21 — lands
    // on the default instead of rendering unstyled
    expect(parseAppearance({ theme: 'dark', scheme: 'lavender', skin: 'glass' })).toEqual({
      ...DEFAULT_APPEARANCE,
      theme: 'dark',
      skin: 'glass',
    });
    // …and so do the keys retired on 2026-09-27, per field: the theme and the design beside them
    // are the household's and stay exactly as stored
    for (const scheme of ['sage', 'clay', 'twilight', 'constructor'])
      expect(parseAppearance({ theme: 'night', scheme, skin: 'glass' }), scheme).toEqual({
        ...DEFAULT_APPEARANCE,
        theme: 'night',
        scheme: DEFAULT_SCHEME,
        skin: 'glass',
      });
    // Reef was the default until 2026-09-27 and is still a scheme: a stored reef is kept
    expect(parseAppearance({ scheme: 'reef' }).scheme).toBe('reef');
    // "soft" was a removed Quick shape; "sentence" and "mono" removed tab policies
    expect(parseAppearance({ shape: 'soft', tabs: 'sentence' })).toMatchObject({
      shape: DEFAULT_APPEARANCE.shape,
      tabs: DEFAULT_APPEARANCE.tabs,
    });
    expect(parseAppearance('garbage')).toEqual(DEFAULT_APPEARANCE);
    expect(parseAppearance({ theme: 42 })).toEqual(DEFAULT_APPEARANCE);
  });
});

/**
 * CALM MOTION (2026-09-28): off by default since 2026-10-06, at night, or always. It is what
 * `reduceMotion` means to the design system, so the whole setting is this one answer.
 */
describe('calm motion — the app moves as designed unless a parent asks for less', () => {
  it('is off for everyone, a phone whose appearance predates the field included', () => {
    expect(CALM_MOTIONS).toEqual(['off', 'night', 'always']);
    expect(DEFAULT_APPEARANCE.calmMotion).toBe('off');
    expect(parseAppearance(undefined).calmMotion).toBe('off');
    expect(parseAppearance({ theme: 'dark' }).calmMotion).toBe('off');
  });

  it('keeps each answer a parent picked, and reads anything else as the default', () => {
    for (const calm of CALM_MOTIONS)
      expect(parseAppearance({ calmMotion: calm, calmMotionChosen: true }).calmMotion).toBe(calm);
    for (const junk of ['sometimes', 'Always', true, 1, null, { mode: 'always' }])
      expect(parseAppearance({ calmMotion: junk }).calmMotion, String(junk)).toBe('off');
  });

  it('reads the old default, a `night` nobody picked, as Off — and keeps a picked one', () => {
    expect(parseAppearance({ calmMotion: 'night' }).calmMotion).toBe('off');
    expect(parseAppearance({ calmMotion: 'night', calmMotionChosen: true }).calmMotion).toBe(
      'night',
    );
    // Always was never a default: whoever stored it chose it
    expect(parseAppearance({ calmMotion: 'always' }).calmMotion).toBe('always');
  });

  it('keeps still at night on "At night", at every hour on "Always", never on "Off"', () => {
    const at = (calm: CalmMotion, daytime: boolean) =>
      reducesMotion({ phone: false, calm, daytime });
    expect(at('night', false)).toBe(true);
    expect(at('night', true)).toBe(false);
    expect(at('always', true)).toBe(true);
    expect(at('always', false)).toBe(true);
    expect(at('off', false)).toBe(false);
    expect(at('off', true)).toBe(false);
  });

  it('never moves what the phone’s own Reduce Motion keeps still, whatever is chosen here', () => {
    for (const calm of CALM_MOTIONS)
      for (const daytime of [true, false])
        expect(reducesMotion({ phone: true, calm, daytime }), `${calm} ${daytime}`).toBe(true);
  });
});

describe('resolveAppearance — theme, then scheme, then night reclaims its grounds', () => {
  it('system follows the OS between light and dark; night is only ever explicit', () => {
    // the DEFAULT is `light`, not `system` (the owner, 2026-09-16), so `system` is asked for by
    // name here — following the OS is still exactly one tap away in Appearance
    const system = { ...DEFAULT_APPEARANCE, theme: 'system' as const };
    expect(resolveAppearance(system, 'dark').theme).toBe('dark');
    expect(resolveAppearance(system, 'light').theme).toBe('light');
    expect(resolveAppearance({ ...DEFAULT_APPEARANCE, theme: 'light' }, 'dark').theme).toBe(
      'light',
    );
    expect(resolveAppearance({ ...DEFAULT_APPEARANCE, theme: 'night' }, 'light').theme).toBe(
      'night',
    );
  });

  it('overlays exactly the ten scheme roles and never a semantic or category hue', () => {
    const r = resolveAppearance(
      { ...DEFAULT_APPEARANCE, theme: 'light', scheme: 'ocean' },
      'light',
    );
    const o = schemes.ocean.light;
    expect(r.palette.accent).toBe(o.accent);
    expect(r.palette.app).toBe(o.app);
    expect(r.gradient.brand).toEqual([o.g1, o.g2]);
    for (const k of [
      'good',
      'warn',
      'crit',
      'milk',
      'sleep',
      'rose',
      'diaper',
      'olive',
      'cyan',
      'text',
      'text2',
      'text3',
      'line',
      'surface',
    ] as const) {
      expect(r.palette[k], k).toBe(themes.light[k]);
    }
  });

  it('night keeps its own grounds whatever the scheme, and dims every gradient', () => {
    const r = resolveAppearance(
      { ...DEFAULT_APPEARANCE, theme: 'night', scheme: 'rose', skin: 'glass' },
      'light',
    );
    expect(r.palette.app).toBe(themes.night.app);
    expect(r.palette.accent).toBe(schemes.rose.dark.accent);
    expect(r.gradient.brand).toEqual(gradients.night.brand);
    expect(r.gradient.milk).toEqual(gradients.night.milk);
    // and the material goes flat: no blur, no specular, no shadow, no wash
    expect(r.skinTokens.surface).toMatchObject({
      alpha: 1,
      blur: 0,
      specular: false,
      shadow: 'none',
    });
    expect(r.skinTokens.groundWash).toBe(0);
    expect(r.skinTokens.orbAlpha).toBe(0);
    expect(r.skinTokens.radius).toEqual(SKINS.glass.radius); // the radius stays the skin's
  });

  it('a plan that no longer includes a paid look takes it back: night lands on dark, never light', () => {
    const prefs = {
      ...DEFAULT_APPEARANCE,
      theme: 'night' as const,
      // REEF, because it is the case that changed: the default until 2026-09-27, and sold since —
      // the free scheme is whichever one is the default, never a name
      scheme: 'reef' as const,
      // GLASS is the paid look now, not Paper. Soft was removed on 2026-09-18 and Paper
      // inherited the default — and the default is what "free" means for a skin, so a test
      // that took Paper back was testing a skin nobody pays for.
      skin: 'glass' as const,
    };
    const plus = resolveAppearance(prefs, 'light', PLUS_APPEARANCE);
    expect(plus).toMatchObject({
      theme: 'night',
      scheme: 'reef',
      skin: 'glass',
      tookBack: { night: false, scheme: false, skin: false },
    });
    const free = resolveAppearance(prefs, 'light', FREE_APPEARANCE);
    expect(free).toMatchObject({
      theme: 'dark',
      scheme: DEFAULT_SCHEME,
      skin: 'paper',
      tookBack: { night: true, scheme: true, skin: true },
    });
    // NibbleCue's default and free scheme is Sunny (the owner, 2026-10-08: the main color tells the
    // two apps apart); CuddleCue's is Ocean
    expect(free.scheme).toBe('sunny');
    expect(free.palette).toEqual(resolvePalette('dark', 'sunny'));
    // the stored choice is untouched, so a later upgrade restores it
    expect(free.prefs).toEqual(prefs);
    // every scheme but the default is sold, and the default never is
    for (const scheme of SCHEME_NAMES) {
      const r = resolveAppearance({ ...DEFAULT_APPEARANCE, scheme }, 'light', FREE_APPEARANCE);
      expect(r.scheme, scheme).toBe(DEFAULT_SCHEME);
      expect(r.tookBack.scheme, scheme).toBe(scheme !== DEFAULT_SCHEME);
    }
    // dark and light are never taken back: they are legibility, not taste
    expect(
      resolveAppearance({ ...DEFAULT_APPEARANCE, theme: 'dark' }, 'light', FREE_APPEARANCE).theme,
    ).toBe('dark');
  });

  /**
   * THE SHAPES AND THE SIDEWAYS LOG ROW, TAKEN BACK LIKE A COLOR (the owner, 2026-10-01: "make
   * shapes other than pebble also a plus feature, same with horizontal slider"). Pebble and the
   * wrapping grid are what every plan paints; the parent's own choice stays stored, so the day Plus
   * comes back it is painted again with nothing to choose twice.
   */
  it('a plan without themes paints Pebble and the wrapping grid, and keeps what was chosen', () => {
    expect(DEFAULT_SHAPE).toBe('pebble');
    expect(DEFAULT_APPEARANCE.shape).toBe(DEFAULT_SHAPE);
    expect(DEFAULT_APPEARANCE.logSlider).toBe(false);
    for (const shape of QUICK_SHAPES)
      for (const logSlider of [false, true]) {
        const prefs = { ...DEFAULT_APPEARANCE, shape, logSlider };
        const name = `${shape}, swipe ${logSlider}`;
        const plus = resolveAppearance(prefs, 'light', PLUS_APPEARANCE);
        expect(plus.shape, name).toBe(shape);
        expect(plus.logSlider, name).toBe(logSlider);
        expect(plus.tookBack, name).toMatchObject({ shape: false, logSlider: false });
        const free = resolveAppearance(prefs, 'light', FREE_APPEARANCE);
        expect(free.shape, name).toBe(DEFAULT_SHAPE);
        expect(free.logSlider, name).toBe(false);
        expect(free.tookBack.shape, name).toBe(shape !== DEFAULT_SHAPE);
        expect(free.tookBack.logSlider, name).toBe(logSlider);
        // nothing stored is touched: Plus again paints exactly what the parent chose
        expect(free.prefs, name).toEqual(prefs);
        expect(resolveAppearance(free.prefs, 'light', PLUS_APPEARANCE).shape, name).toBe(shape);
      }
    // the looks' own entitlement decides it, never Night's
    const sliding = { ...DEFAULT_APPEARANCE, shape: 'bubble' as const, logSlider: true };
    expect(resolveAppearance(sliding, 'light', { nightTheme: true, themes: false })).toMatchObject({
      shape: 'pebble',
      logSlider: false,
      tookBack: { shape: true, logSlider: true },
    });
    expect(resolveAppearance(sliding, 'light', { nightTheme: false, themes: true })).toMatchObject({
      shape: 'bubble',
      logSlider: true,
      tookBack: { shape: false, logSlider: false },
    });
    // and a first launch on the free plan has nothing of its layout to take back
    expect(resolveAppearance(DEFAULT_APPEARANCE, 'light', FREE_APPEARANCE).tookBack).toMatchObject({
      shape: false,
      logSlider: false,
    });
  });

  it('paints Pebble for a removed shape that never went through the parser, and takes nothing back', () => {
    // `cards` and `soft` were shapes once (§16.2); nobody was ever sold one, so neither is "taken back"
    for (const removed of ['cards', 'soft', 'toString'])
      for (const entitled of [PLUS_APPEARANCE, FREE_APPEARANCE]) {
        const prefs = { ...DEFAULT_APPEARANCE, shape: removed as QuickShape };
        const r = resolveAppearance(prefs, 'light', entitled);
        expect(r.shape, removed).toBe(DEFAULT_SHAPE);
        expect(r.tookBack.shape, removed).toBe(false);
      }
  });

  it('paints the default for a retired key that never went through the parser, and never throws', () => {
    for (const retired of ['sage', 'clay', 'twilight', 'toString']) {
      const prefs = { ...DEFAULT_APPEARANCE, scheme: retired as SchemeName };
      for (const entitled of [PLUS_APPEARANCE, FREE_APPEARANCE])
        for (const theme of ['light', 'dark', 'night'] as const) {
          const r = resolveAppearance({ ...prefs, theme }, 'light', entitled);
          expect(r.scheme, retired).toBe(DEFAULT_SCHEME);
          // the painted theme, which a free plan turns from night to dark
          expect(r.palette).toEqual(resolvePalette(r.theme, DEFAULT_SCHEME));
          // nothing was sold here, so nothing was taken back
          expect(r.tookBack.scheme, retired).toBe(false);
        }
    }
  });

  it('the label on the brand gradient is always white; the status bar follows the painted theme', () => {
    for (const scheme of Object.keys(schemes) as (keyof typeof schemes)[]) {
      for (const theme of ['light', 'dark'] as const) {
        expect(
          resolveAppearance({ ...DEFAULT_APPEARANCE, theme, scheme }, 'light').onGradient,
        ).toBe('#FFFFFF');
      }
    }
    expect(statusBarStyleFor('light')).toBe('dark');
    expect(statusBarStyleFor('dark')).toBe('light');
    expect(statusBarStyleFor('night')).toBe('light');
  });
});

describe('what the app looks like before anybody has chosen (the owner, 2026-09-16)', () => {
  it('opens light, in glass, with pebble tiles', () => {
    expect(DEFAULT_APPEARANCE.theme).toBe('light');
    expect(DEFAULT_APPEARANCE.skin).toBe('glass');
    expect(DEFAULT_APPEARANCE.shape).toBe('pebble');
  });

  it('is `light` rather than `system` on purpose, and dark is still one tap away', () => {
    // the first screen a parent sees should be the one the brand was designed against, not
    // whichever of three themes their phone happens to be in tonight
    expect(DEFAULT_APPEARANCE.theme).not.toBe('system');
    expect(THEME_CHOICES).toContain('system');
    expect(THEME_CHOICES).toContain('dark');
  });

  it('starts with Match phone off and leaves a household that turned it on alone (2026-09-27)', () => {
    // "let users decide it for themselves": nothing stored is Light, never `system`…
    expect(parseAppearance(undefined).theme).toBe('light');
    expect(parseAppearance({}).theme).toBe('light');
    expect(parseAppearance({ theme: 'auto' }).theme).toBe('light');
    // …and a parent who chose to follow the phone keeps following it, on either OS setting
    expect(parseAppearance({ theme: 'system' }).theme).toBe('system');
    expect(resolveAppearance(parseAppearance({ theme: 'system' }), 'dark').theme).toBe('dark');
    // the default scheme on a first launch is Sunny (NibbleCue; CuddleCue's is Ocean), and it is free
    expect(DEFAULT_APPEARANCE.scheme).toBe('sunny');
    expect(resolveAppearance(DEFAULT_APPEARANCE, 'dark', FREE_APPEARANCE)).toMatchObject({
      theme: 'light',
      scheme: 'sunny',
      tookBack: { scheme: false },
    });
  });
});
