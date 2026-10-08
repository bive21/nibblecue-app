/**
 * TODAY'S SKY AS NUMBERS (`liveSky.ts`; the owner, 2026-09-25). Which sky an hour has — with the
 * edges tested on both sides of every change, because an off-by-one there is a dawn that arrives
 * a minute late forever — how the sky changes, and where its stars sit, which is never under
 * anything a parent reads or taps. The colors are measured in `theme/liveSky.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { space } from '../theme/theme';
import {
  BELL_SIZE,
  liveSkyGeometry,
  SKY_CHECK_MS,
  SKY_FADE_MS,
  SKY_FOOT,
  STAR_FOOT,
  SKY_PHASE_STARTS,
  skyMove,
  skyPhaseAt,
  skyPhaseIn,
  STAR_CLEARANCE,
} from './liveSky';
import {
  chipMaxWidth,
  markSize,
  TOP_BAR_AVATAR,
  TOP_BAR_GAP,
  TOP_BAR_GUTTER,
  TOP_BAR_MIN_HEIGHT,
} from './topBarLayout';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const at = (h: number, m = 0) => h * 60 + m;

describe('which sky an hour has', () => {
  it('turns at five, eight, six in the evening and nine — exactly on the minute', () => {
    const edges: [number, string, string][] = [
      [at(5), 'night', 'dawn'],
      [at(8), 'dawn', 'day'],
      [at(18), 'day', 'dusk'],
      [at(21), 'dusk', 'night'],
    ];
    for (const [minute, before, after] of edges) {
      expect(skyPhaseAt(minute - 1), `a minute before ${minute}`).toBe(before);
      expect(skyPhaseAt(minute), `at ${minute}`).toBe(after);
    }
  });

  it('is night across midnight, on both sides of it', () => {
    expect(skyPhaseAt(at(23, 59))).toBe('night');
    expect(skyPhaseAt(0)).toBe('night');
    expect(skyPhaseAt(at(3, 30))).toBe('night');
    expect(skyPhaseAt(at(4, 59))).toBe('night');
  });

  it('meets the day in order, with nothing out of place', () => {
    const froms = SKY_PHASE_STARTS.map(s => s.from);
    expect([...froms].sort((a, b) => a - b)).toEqual(froms);
    expect(SKY_PHASE_STARTS.map(s => s.phase)).toEqual(['dawn', 'day', 'dusk', 'night']);
  });

  it('folds any count of minutes into one day, and a nonsense one into midnight', () => {
    expect(skyPhaseAt(at(24 + 9))).toBe('day');
    expect(skyPhaseAt(-60)).toBe('night'); // 11 p.m. the day before
    expect(skyPhaseAt(-at(18))).toBe('dawn'); // eighteen hours before midnight: 6 a.m.
    expect(skyPhaseAt(Number.NaN)).toBe('night');
  });
});

describe('the hour is read on the household’s clock', () => {
  // 2026-09-25 12:30 UTC: evening in Auckland, morning in Los Angeles, midday in London
  const instant = Date.UTC(2026, 8, 25, 12, 30);

  it('reads the same instant as a different sky in each zone', () => {
    expect(skyPhaseIn('Pacific/Auckland', instant)).toBe('night'); // 00:30 the next day
    expect(skyPhaseIn('America/Los_Angeles', instant)).toBe('dawn'); // 05:30
    expect(skyPhaseIn('Europe/London', instant)).toBe('day'); // 13:30
    expect(skyPhaseIn('Asia/Kolkata', instant)).toBe('dusk'); // 18:00, on the edge
  });

  it('follows a clock that changed for summer time', () => {
    // London left summer time at 01:00 UTC on 2026-10-25: 07:30 UTC is 07:30 there after it,
    // and was 08:30 the day before
    expect(skyPhaseIn('Europe/London', Date.UTC(2026, 9, 24, 7, 30))).toBe('day');
    expect(skyPhaseIn('Europe/London', Date.UTC(2026, 9, 25, 7, 30))).toBe('dawn');
  });

  it('falls back to the phone’s clock for a zone it does not know, rather than throwing', () => {
    expect(() => skyPhaseIn('Not/AZone', instant)).not.toThrow();
    expect(['dawn', 'day', 'dusk', 'night']).toContain(skyPhaseIn('Not/AZone', instant));
  });

  it('looks once a minute: a sky is never more than a minute late for its hour', () => {
    expect(SKY_CHECK_MS).toBe(60_000);
  });
});

describe('how one sky gives way to the next', () => {
  it('fades over three seconds when it may move', () => {
    expect(skyMove({ reduceMotion: false, night: false })).toEqual({
      animate: true,
      duration: SKY_FADE_MS,
    });
    expect(SKY_FADE_MS).toBeGreaterThanOrEqual(2000);
  });

  it('is simply there under reduce motion, and in the amber Night theme', () => {
    for (const opts of [
      { reduceMotion: true, night: false },
      { reduceMotion: false, night: true },
      { reduceMotion: true, night: true },
    ])
      expect(skyMove(opts)).toEqual({ animate: false, duration: 0 });
  });
});

/** The bar's controls, as boxes in the band's coordinates, at their widest. */
function controls(width: number, height: number) {
  const rowBottom = height - space.md;
  const rowTop = rowBottom - (TOP_BAR_AVATAR + 2 * space.xs);
  const mark = markSize(width);
  const avatarLeft = width - TOP_BAR_GUTTER - TOP_BAR_AVATAR;
  const bellLeft = avatarLeft - TOP_BAR_GAP - BELL_SIZE;
  return {
    rowTop,
    rowBottom,
    boxes: [
      { name: 'chip', left: TOP_BAR_GUTTER, right: TOP_BAR_GUTTER + chipMaxWidth(width) },
      { name: 'mark', left: width / 2 - mark / 2, right: width / 2 + mark / 2 },
      { name: 'bell', left: bellLeft, right: bellLeft + BELL_SIZE },
      { name: 'avatar', left: avatarLeft, right: avatarLeft + TOP_BAR_AVATAR },
    ],
  };
}

const WIDTHS = [320, 360, 375, 390, 393, 414, 430, 600, 768, 1024];
/** The bar's height at the phones' real status-bar insets, and with the chip grown to its cap. */
const HEIGHTS = [0, 24, 47, 59].flatMap(inset => [
  inset + TOP_BAR_MIN_HEIGHT + 1,
  inset + TOP_BAR_MIN_HEIGHT + 18,
]);

describe('where the stars sit', () => {
  it('keeps every star clear of every control, whatever the phone', () => {
    for (const width of WIDTHS)
      for (const height of HEIGHTS) {
        const g = liveSkyGeometry(width, height);
        const c = controls(width, height);
        for (const s of g.stars) {
          const left = s.x - s.size / 2;
          const right = s.x + s.size / 2;
          for (const box of c.boxes) {
            const clear = right + STAR_CLEARANCE <= box.left || left - STAR_CLEARANCE >= box.right;
            expect(clear, `${width}×${height}: a star at ${s.x} under the ${box.name}`).toBe(true);
          }
        }
      }
  });

  it('keeps them in the controls’ row, above the fade, and never in the status bar', () => {
    for (const width of WIDTHS)
      for (const height of HEIGHTS) {
        const g = liveSkyGeometry(width, height);
        const c = controls(width, height);
        for (const s of g.stars) {
          expect(s.y - s.size / 2).toBeGreaterThanOrEqual(c.rowTop);
          // wholly above the fade, so a star is never half dissolved into the page
          expect(s.y + s.size / 2).toBeLessThanOrEqual(height - STAR_FOOT);
        }
      }
  });

  it('puts a few on every phone, and never more than five', () => {
    for (const width of WIDTHS) {
      const n = liveSkyGeometry(width, 47 + TOP_BAR_MIN_HEIGHT + 1).stars.length;
      expect(n, `${width}`).toBeGreaterThanOrEqual(3);
      expect(n, `${width}`).toBeLessThanOrEqual(5);
    }
  });

  it('leaves the left gap out where the chip’s cap and the mark leave no room for it', () => {
    expect(liveSkyGeometry(320, 77).gaps.left).toBeNull();
    expect(liveSkyGeometry(430, 77).gaps.left).not.toBeNull();
  });

  it('draws nothing at all before the bar has a size', () => {
    expect(liveSkyGeometry(0, 0).stars).toEqual([]);
    expect(liveSkyGeometry(0, 0).fadeFrom).toBe(0);
  });
});

describe('the fade into the page', () => {
  it('begins SKY_FOOT points above the bottom of the bar and ends at it', () => {
    for (const height of HEIGHTS.filter(h => h > 0)) {
      const g = liveSkyGeometry(390, height);
      expect(g.fadeFrom * height).toBeCloseTo(height - SKY_FOOT, 6);
    }
  });

  it('lives inside the bar, so the sky never reaches the page’s own words', () => {
    // the band is the bar's box (Screen.tsx `barBackdrop`): the fade is part of it
    expect(SKY_FOOT).toBeLessThan(TOP_BAR_MIN_HEIGHT);
  });
});

/* -------------------------------------------------------------------- the component */

const component = read('LiveSky.tsx');
/** Code only: comments out, whitespace collapsed. */
const flat = component
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  .replace(/\s+/g, ' ');

describe('the component (tripwires over LiveSky.tsx)', () => {
  it('is scenery: no touches, nothing for a screen reader', () => {
    expect(flat).toMatch(
      /pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden/,
    );
    expect(flat).not.toContain('<Pressable');
    expect(flat).not.toContain('accessibilityLabel');
  });

  it('fades on the native driver, opacity only, and lets the old sky go once covered', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    expect(flat).toContain('{ opacity: fade }');
    expect(flat).not.toMatch(/transform:/);
    expect(flat).not.toContain('Animated.loop');
  });

  it('asks the arithmetic whether it may move: reduce motion and amber Night draw it outright', () => {
    expect(flat).toContain("skyMove({ reduceMotion: t.reduceMotion, night: t.theme === 'night' })");
    expect(flat).toContain('move.animate');
  });

  it('draws the theme’s sky for the phase, and nothing typed', () => {
    expect(flat).toContain('liveSkyFor(t.theme, shown.base, t.color.accent)');
    expect(flat).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
    expect(flat).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
  });

  it('borrows setup’s sparkle, so the sky is the switch’s picture language', () => {
    expect(flat).toContain("import { SPARKLE_PATH } from './dayNightSwitch';");
  });

  it('asks for nothing Expo Go does not carry', () => {
    const imports = [...component.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    for (const source of imports)
      expect(
        ['react', 'react-native', 'react-native-svg'].includes(source ?? '') ||
          /^\./.test(source ?? ''),
        source,
      ).toBe(true);
  });

  it('is exported with the design system’s components, its hour with it', () => {
    expect(read('core.ts')).toContain("export * from './LiveSky';");
    // `skyPhaseAt` left this line on 2026-09-26: nothing imported it through the barrel
    expect(flat).toContain("export { SKY_CHECK_MS, skyPhaseIn, type SkyPhase } from './liveSky';");
  });

  it('knows the bell’s size as IconButton draws it', () => {
    expect(read('IconButton.tsx')).toMatch(/size = 34,/);
    expect(BELL_SIZE).toBe(34);
  });
});
