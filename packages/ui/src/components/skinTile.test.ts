/**
 * THE DESIGN TILES (the owner, 2026-09-25: *"separate it into 2 sections options, left and right;
 * and then has a 'preview' of what it is"*). The room each tile has, the picture in it and the way
 * the chosen mark arrives are PURE (`skinTile.ts`) and are walked here at every half point of body
 * the Appearance sheet can have; what only a device can show — that the picture is drawn in the
 * tile's own design through the real material, is inert, is one button to a screen reader and
 * moves on the native driver only when it may — is held by tripwires over `SkinTile.tsx`, because
 * this suite has no renderer (`interaction.test.ts` says why that is the honest instrument).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { easeAt } from './themeSkyToggle';
import {
  SKIN_TILE,
  SKIN_TILE_FRAMES,
  SKIN_TILE_MOTION,
  skinTileGeometry,
  skinTilePair,
} from './skinTile';
import type { Frame } from './dayNightSwitch';

const here = dirname(fileURLToPath(import.meta.url));
const code = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const src = code(readFileSync(join(here, 'SkinTile.tsx'), 'utf8'));
const flat = src.replace(/\s+/g, ' ');

/** The sheet's body: the window less `space.xxl` each side — 272 on a 308 pt window, 394 on a 430. */
const ROOMS = Array.from({ length: (430 - 272) * 2 + 1 }, (_, i) => 272 + i / 2);

/** `Animated.Value#interpolate` with `clamp`, for a frame. */
const at = (f: Frame, x: number): number => {
  const xs = f.inputRange;
  const ys = f.outputRange;
  if (x <= (xs[0] ?? 0)) return ys[0] ?? 0;
  for (let i = 1; i < xs.length; i += 1) {
    const x0 = xs[i - 1] ?? 0;
    const x1 = xs[i] ?? 0;
    if (x <= x1)
      return (ys[i - 1] ?? 0) + ((ys[i] ?? 0) - (ys[i - 1] ?? 0)) * ((x - x0) / (x1 - x0));
  }
  return ys[ys.length - 1] ?? 0;
};

describe('two equal tiles across the body', () => {
  it('fills the room exactly, two tiles and the gap, and stops growing past a large phone', () => {
    for (const room of ROOMS) {
      const p = skinTilePair(room);
      expect(2 * p.tile + p.gap).toBeCloseTo(Math.min(room, SKIN_TILE.maxRoom), 6);
    }
    expect(skinTilePair(700).total).toBe(SKIN_TILE.maxRoom);
  });

  it('makes each tile a target far past 44 pt in both directions, at the narrowest body', () => {
    const g = skinTileGeometry(skinTilePair(272).tile);
    expect(g.tile).toBeGreaterThanOrEqual(2 * 44);
    expect(g.framed).toBeGreaterThanOrEqual(44);
  });
});

describe('the picture is the app, small', () => {
  it('keeps the sample’s own shape, so nothing in it is stretched', () => {
    for (const room of ROOMS) {
      const g = skinTileGeometry(skinTilePair(room).tile);
      const ratio = SKIN_TILE.sample.height / SKIN_TILE.sample.width;
      // the window's height is rounded to the half point; the scaled sample covers it to within one
      expect(Math.abs(g.window.height - g.window.width * ratio)).toBeLessThanOrEqual(0.25);
      expect(g.window.width).toBeCloseTo(SKIN_TILE.sample.width * g.scale, 6);
      expect(g.framed).toBeCloseTo(g.window.height + 2 * g.frame, 6);
    }
  });

  it('is scaled like the pinned preview: small, and still a real reduction at a large phone', () => {
    for (const room of ROOMS) {
      const { scale } = skinTileGeometry(skinTilePair(room).tile);
      expect(scale).toBeGreaterThan(0.35);
      expect(scale).toBeLessThan(0.65);
    }
  });

  it('sits the window inside the ring and the clear air, never under them', () => {
    const g = skinTileGeometry(skinTilePair(339).tile);
    expect(g.frame).toBe(SKIN_TILE.ring + SKIN_TILE.clear);
    expect(g.window.width).toBeCloseTo(g.tile - 2 * g.frame, 6);
  });

  it('puts the badge in the top right corner of the window, and keeps it to a corner', () => {
    for (const room of ROOMS) {
      const g = skinTileGeometry(skinTilePair(room).tile);
      // inside the window, in from both of its edges
      expect(g.badge.top).toBeGreaterThan(g.frame);
      expect(g.badge.right).toBeGreaterThan(g.frame);
      expect(g.badge.top + g.badge.size).toBeLessThan(g.frame + g.window.height / 2);
      expect(g.badge.right + g.badge.size).toBeLessThan(g.frame + g.window.width / 2);
      // a corner of the picture, never a lid on it
      const covered = (g.badge.size * g.badge.size) / (g.window.width * g.window.height);
      expect(covered).toBeLessThan(0.08);
      expect(g.badge.glyph).toBeLessThan(g.badge.size);
    }
  });
});

describe('the chosen mark arrives', () => {
  const f = SKIN_TILE_FRAMES;

  it('is nothing at 0 and exactly itself at 1', () => {
    expect(at(f.ring, 0)).toBe(0);
    expect(at(f.badge, 0)).toBe(0);
    expect(at(f.ring, 1)).toBe(1);
    expect(at(f.badge, 1)).toBe(1);
    expect(at(f.badgeScale, 1)).toBe(1);
  });

  it('pops the check past full size and settles it back, and never shows it at nothing', () => {
    const samples = Array.from({ length: 101 }, (_, i) => at(f.badgeScale, i / 100));
    expect(Math.max(...samples)).toBeGreaterThan(1.05);
    expect(Math.max(...samples)).toBeLessThan(1.2);
    expect(Math.min(...samples)).toBeGreaterThan(0);
    // and the badge is fully drawn before its swell, so it is not a faint thing growing
    expect(at(f.badge, 0.6)).toBe(1);
  });

  it('never drives an opacity past fully on, on a curve that does not overshoot', () => {
    for (const fr of [f.ring, f.badge]) {
      expect(Math.max(...fr.outputRange)).toBeLessThanOrEqual(1);
      expect(Math.min(...fr.outputRange)).toBeGreaterThanOrEqual(0);
      expect(fr.extrapolate).toBe('clamp');
    }
    for (let i = 0; i <= 100; i += 1) {
      const y = easeAt(SKIN_TILE_MOTION.ease, i / 100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  it('goes faster than it comes, and both inside a quarter of a second or so', () => {
    expect(SKIN_TILE_MOTION.outMs).toBeLessThan(SKIN_TILE_MOTION.inMs);
    expect(SKIN_TILE_MOTION.inMs).toBeLessThanOrEqual(300);
  });
});

describe('the tile (tripwires over SkinTile.tsx)', () => {
  it('draws its picture in its own design, through the resolver’s own call', () => {
    expect(flat).toContain('skinTokens: skinForTheme(SKINS[skin], t.theme)');
    expect(flat).toContain(
      '<ThemeProvider appearance={look} fontsReady={t.fontsReady} reduceMotion={t.reduceMotion}>',
    );
    // over the app's ground for that design, laid out at the sample's size and scaled down
    expect(flat).toContain('<Ground width={sample.width} height={sample.height} />');
    expect(flat).toContain('transform: [{ scale: g.scale }]');
    expect(flat).toContain("transformOrigin: 'top left'");
    // on the page every screen is painted on
    expect(flat).toContain('backgroundColor: t.color.paper');
  });

  it('keeps the picture out of the way: no touch, and nothing for a screen reader to land on', () => {
    expect(flat).toMatch(
      /<View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"/,
    );
  });

  it('is one button, named like the row it replaced, selected where the row said On', () => {
    expect(flat).toContain('accessibilityRole="button"');
    // named as a row is, a status word after the name when there is one (the app's quiet "Plus"
    // tag during the preview, 2026-09-28), as a `Row`'s badge is spoken after its title
    expect(flat).toContain(
      'accessibilityLabel={rowLabel({ title: label, ...(status ? { badge: status.label } : {}), detail: description, })}',
    );
    expect(flat).toContain('accessibilityState={{ selected, disabled: false }}');
    expect(flat).toContain('...(locked && lockedHint ? { accessibilityHint: lockedHint } : {})');
  });

  it('marks the choice with a ring and a check glyph, and a sold one with a lock before the tap', () => {
    expect(flat).toContain('borderColor: marks.ring');
    expect(flat).toContain('<Icon name="check"');
    expect(flat).toContain('{locked && !selected ? (');
    expect(flat).toContain('<Icon name="lock" size={badge.glyph} color={marks.lock} />');
  });

  it('moves on the native driver, and not at all under reduce motion or in the amber theme', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).toContain('const still = t.reduceMotion || t.isNight;');
    expect(flat).toMatch(/if \(still\) \{ on\.setValue\(selected \? 1 : 0\);/);
    // opacity and scale, and nothing a layout pass would have to follow
    expect(flat).not.toMatch(/(width|height|left|top|margin\w*): drive\(/);
  });

  it('is felt by the one rule every option follows: a choice, a refusal, or nothing', () => {
    // `feedback/choice.ts`, as the swatches and the segmented control call it: once, in the press
    // handler, before the choice is reported
    expect(flat).toContain(
      "onPress={() => { feelChoice({ locked, current: selected, kind: 'tap' }); onPress(); }}",
    );
    expect(flat.split('feelChoice(').length - 1).toBe(1);
    expect(flat).not.toContain('haptic(');
  });
});
