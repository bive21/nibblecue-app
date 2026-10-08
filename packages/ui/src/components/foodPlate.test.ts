/**
 * THE SOLIDS SHEET'S PLATE (`foodPlate.ts`, `FoodPlate.tsx`; the owner's delight list,
 * 2026-09-26). Its picture is the list — walked here for every length of list — its moves are
 * walked frame by frame the way the native driver draws them, and its colors are measured against
 * everything they land on in every skin, scheme and theme. What only a device can show is held by
 * tripwires over the component, because this suite has no renderer.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_APPEARANCE,
  PLUS_APPEARANCE,
  resolveAppearance,
  SCHEME_NAMES,
} from '../theme/appearance';
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio, parseColor } from '../theme/contrast';
import { materialBase, SKIN_NAMES } from '../theme/skins';
import { themeNames, themes } from '../theme/theme';
import { sampleFrame } from './keyframes';
import {
  dropFrames,
  landMs,
  liftFrames,
  MORSEL,
  MORSEL_ROLES,
  morselColors,
  morselInitial,
  morselRest,
  morselRole,
  PLATE,
  PLATE_CHIP,
  PLATE_MOTION,
  PLATE_STRIP,
  plateChange,
  plateColors,
  platePicture,
  type PlateFood,
} from './foodPlate';

const here = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(join(here, 'FoodPlate.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  .replace(/\s+/g, ' ');

const foods = (...names: string[]): PlateFood[] => names.map((name, i) => ({ key: `l${i}`, name }));

describe('the plate is the list, drawn', () => {
  it('puts one morsel per named food, in the list’s order, with the food’s first letter', () => {
    const p = platePicture(foods('banana', '', '  pear', 'Oatmeal'));
    expect(p.morsels.map(m => m.initial)).toEqual(['B', 'P', 'O']);
    expect(p.morsels.map(m => m.key)).toEqual(['l0', 'l2', 'l3']);
    expect(p.more).toBe(0);
  });

  it('stands six on the plate and counts the rest beside it', () => {
    const p = platePicture(foods('a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i'));
    expect(p.morsels).toHaveLength(MORSEL.max);
    expect(p.more).toBe(3);
    expect(platePicture(foods()).morsels).toHaveLength(0);
  });

  it('keeps a morsel as its name is typed: same key, same letter, same color', () => {
    const typed = ['B', 'Ba', 'Ban', 'Bana', 'Banana'].map(n => platePicture(foods(n)).morsels[0]);
    for (const m of typed) {
      expect(m?.key).toBe('l0');
      expect(m?.initial).toBe('B');
      expect(m?.role).toBe(typed[0]?.role);
    }
  });

  it('writes one character, in capitals, whatever the name starts with', () => {
    expect(morselInitial('  ñame')).toBe('Ñ');
    expect(morselInitial('🍌 banana')).toBe('🍌');
    expect(morselInitial('   ')).toBe('');
  });

  it('colors a morsel by its first letter only, from six module pairs', () => {
    expect(new Set('ABCDEFGHIJKL'.split('').map(morselRole)).size).toBe(MORSEL_ROLES.length);
    expect(morselRole('B')).toBe(morselRole('B'));
    // nothing about the amount, the food or anything else reaches the color
    expect(morselRole.length).toBe(1);
  });
});

describe('the row sits on the plate, centered, whatever it holds', () => {
  it('centers every row on the plate and keeps each morsel inside the plate’s rim', () => {
    for (let n = 1; n <= MORSEL.max; n += 1) {
      const xs = Array.from({ length: n }, (_, i) => morselRest(i, n).x);
      const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
      expect(mid).toBeCloseTo(PLATE.cx, 6);
      for (let i = 0; i < n; i += 1) {
        const { x, y } = morselRest(i, n);
        expect(Math.abs(x - PLATE.cx) + MORSEL.d / 2).toBeLessThanOrEqual(PLATE.rx);
        // its foot on the well, its top inside the strip
        expect(y + MORSEL.d / 2).toBeGreaterThan(PLATE.cy - PLATE.wellRy);
        expect(y + MORSEL.d / 2).toBeLessThan(PLATE.cy + PLATE.wellRy);
        expect(y - MORSEL.d / 2).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('keeps neighbors apart enough to read as pieces, close enough to read as a pile', () => {
    expect(MORSEL.gap).toBeLessThan(MORSEL.d);
    expect(MORSEL.gap).toBeGreaterThan(MORSEL.d * 0.8);
  });

  it('fits the strip: the plate, its shadow and the chip, no taller than 56 pt', () => {
    expect(PLATE_STRIP.height).toBeLessThanOrEqual(56);
    expect(PLATE.cx - PLATE.rx).toBeGreaterThanOrEqual(0);
    expect(PLATE.cy + PLATE.ry + 0.5 + PLATE.shadowRy).toBeLessThanOrEqual(PLATE_STRIP.height);
    expect(PLATE_CHIP.left).toBeGreaterThan(PLATE.cx + PLATE.rx);
    expect(PLATE_CHIP.left + PLATE_CHIP.width).toBeLessThanOrEqual(PLATE_STRIP.width);
  });
});

describe('what changes, and what is felt', () => {
  it('drops nothing on the first draw: a plate that opens full opens still', () => {
    expect(plateChange(null, platePicture(foods('a', 'b')))).toEqual({ arrived: [], left: [] });
  });

  it('drops a food as it is written and lifts it as it goes, by its line', () => {
    const one = platePicture(foods('a'));
    const two = platePicture(foods('a', 'b'));
    expect(plateChange(one, two).arrived).toEqual(['l1']);
    expect(plateChange(two, one).left.map(m => m.key)).toEqual(['l1']);
    // a food typed into a line that had none arrives; a name cleared leaves
    const blank = platePicture([
      { key: 'l0', name: 'a' },
      { key: 'l1', name: '' },
    ]);
    expect(plateChange(blank, two).arrived).toEqual(['l1']);
  });

  it('is felt when the food lands, which is half way through its drop', () => {
    expect(landMs()).toBe(220);
    expect(component).toContain("haptic('tap')");
    expect(component).toContain('}, landMs());');
    // once per change, not once per morsel
    expect(component).toContain('if (arrived.length > 0) {');
  });
});

describe('the drop: gravity, a squash, a bounce, a hop — 440 ms', () => {
  const f = dropFrames();
  const land = PLATE_MOTION.landAt;
  const at = (fr: typeof f.y, u: number) => sampleFrame(fr, u);

  it('starts above its place, unseen, and ends exactly in it', () => {
    expect(at(f.y, 0)).toBe(-MORSEL.fall);
    expect(at(f.opacity, 0)).toBe(0);
    expect(at(f.y, 1)).toBe(0);
    expect(at(f.opacity, 1)).toBe(1);
    expect(at(f.scaleX, 1)).toBe(1);
    expect(at(f.scaleY, 1)).toBe(1);
  });

  it('falls faster and faster, and touches the plate at the landing', () => {
    let last = -MORSEL.fall;
    let lastStep = 0;
    for (let k = 1; k <= 40; k += 1) {
      const y = at(f.y, (k / 40) * land);
      expect(y).toBeGreaterThan(last);
      const step = y - last;
      expect(step).toBeGreaterThanOrEqual(lastStep - 1e-9);
      last = y;
      lastStep = step;
    }
    expect(at(f.y, land)).toBeCloseTo(0, 9);
  });

  it('bounces up no more than four points, never sinks into the plate, and settles', () => {
    for (let k = 0; k <= 400; k += 1) {
      const u = land + ((1 - land) * k) / 400;
      const y = at(f.y, u);
      expect(y).toBeLessThanOrEqual(1e-9);
      expect(y).toBeGreaterThanOrEqual(-MORSEL.bounce - 1e-9);
    }
    expect(Math.min(...[0.6, 0.68, 0.76].map(u => at(f.y, u)))).toBeCloseTo(-MORSEL.bounce, 6);
  });

  it('squashes only at the landing, and only a little', () => {
    expect(at(f.scaleY, land)).toBeGreaterThan(0.8);
    expect(at(f.scaleX, land)).toBeLessThan(1.15);
    expect(at(f.scaleY, land / 2)).toBe(1);
  });

  it('hands `interpolate` inputs it accepts', () => {
    for (const fr of [f.y, f.opacity, f.scaleX, f.scaleY]) {
      for (let k = 1; k < fr.inputRange.length; k += 1)
        expect(fr.inputRange[k] ?? 0).toBeGreaterThan(fr.inputRange[k - 1] ?? 0);
      expect(fr.inputRange[0]).toBe(0);
      expect(fr.inputRange[fr.inputRange.length - 1]).toBe(1);
    }
  });
});

describe('the lift: up and away', () => {
  const f = liftFrames();
  it('rises the lift’s height and is gone at the end, never coming back down', () => {
    expect(sampleFrame(f.y, 0)).toBe(0);
    expect(sampleFrame(f.y, 1)).toBeCloseTo(-MORSEL.lift, 6);
    expect(sampleFrame(f.opacity, 1)).toBe(0);
    let last = 1;
    for (let k = 0; k <= 50; k += 1) {
      const y = sampleFrame(f.y, k / 50);
      expect(y).toBeLessThanOrEqual(last + 1e-9);
      last = y;
    }
    expect(PLATE_MOTION.liftMs).toBeLessThan(PLATE_MOTION.dropMs);
  });
});

/**
 * THE COLORS, WHERE THEY LAND. The plate's rim is a mark on the sheet it stands on — the sheet's
 * material over the page, in every skin, scheme and theme; each morsel's rim is a mark on the
 * plate's well and face; its letter is text on its fill; the chip's words are text on the chip.
 */
describe('3:1 for every mark and 4.5:1 for every letter, in all 54 appearances', () => {
  const cases = SKIN_NAMES.flatMap(skin =>
    SCHEME_NAMES.flatMap(scheme => themeNames.map(theme => ({ skin, scheme, theme }))),
  );

  it.each(cases)('$skin / $scheme / $theme', ({ skin, scheme, theme }) => {
    const r = resolveAppearance(
      { ...DEFAULT_APPEARANCE, theme, scheme, skin },
      'light',
      PLUS_APPEARANCE,
    );
    const p = r.palette;
    const s = r.skinTokens;
    const c = plateColors(p, theme);
    const sheets = [p.app, p.paper, p.page].map(g =>
      composite(g, materialBase(p, s.sheet), s.sheet.alpha),
    );
    for (const sheet of sheets)
      expect(contrastRatio(c.rim, sheet), `rim on ${sheet}`).toBeGreaterThanOrEqual(AA_GRAPHIC);
    for (const role of MORSEL_ROLES) {
      const m = morselColors(p, role);
      expect(parseColor(m.fill).a).toBe(1);
      expect(contrastRatio(c.letter, m.fill), `${role} letter`).toBeGreaterThanOrEqual(AA_TEXT);
      for (const ground of [c.well, c.face])
        expect(contrastRatio(m.rim, ground), `${role} rim`).toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
    expect(contrastRatio(c.chipText, c.chip)).toBeGreaterThanOrEqual(AA_TEXT);
    for (const sheet of sheets)
      expect(contrastRatio(c.chipEdge, sheet)).toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it('draws the amber Night from the night palette only, with no shadow and no blue', () => {
    const own = new Set(Object.values(themes.night).map(v => v.toLowerCase()));
    const c = plateColors(themes.night, 'night');
    expect(c.shadow).toBeNull();
    for (const v of [c.face, c.well, c.rim, c.letter, c.chip, c.chipEdge, c.chipText])
      expect(own.has(v.toLowerCase()), v).toBe(true);
    for (const role of MORSEL_ROLES) {
      const m = morselColors(themes.night, role);
      for (const v of [m.fill, m.rim]) {
        expect(own.has(v.toLowerCase()), v).toBe(true);
        const { r, b } = parseColor(v);
        expect(b, v).toBeLessThanOrEqual(r);
      }
    }
  });
});

describe('the component: decoration, on the native driver, still when asked', () => {
  it('is hidden from assistive technology and takes no touches', () => {
    expect(component).toContain('pointerEvents="none"');
    expect(component).toContain('accessibilityElementsHidden');
    expect(component).toContain('importantForAccessibility="no-hide-descendants"');
  });

  it('moves on the native driver, and sets every end state when nothing may move', () => {
    expect(component).toContain('useNativeDriver: true');
    expect(component).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(component).toContain("if (mode === 'rest' || still) {");
    expect(component).toContain('if (left.length === 0 || still) return;');
  });
});
