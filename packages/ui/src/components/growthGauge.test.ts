/**
 * THE GROWTH SHEET'S TAPE AND SCALE (`growthGauge.ts`, `GrowthGauges.tsx`; the owner's delight
 * list, 2026-09-26). Every mark is placed and read back here, the needle's swing is walked on the
 * spring the phone runs, and every color is measured against what it lands on in all 54
 * appearances — and held to NEUTRAL: nothing on either picture may say a length is long or a
 * weight is light (CLAUDE.md §2 rules 1 and 3). What only a device can show is held by tripwires
 * over the component, because this suite has no renderer.
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
import { AA_GRAPHIC, AA_TEXT, composite, contrastRatio } from '../theme/contrast';
import { materialBase, SKIN_NAMES } from '../theme/skins';
import { themeNames, themes, type Palette } from '../theme/theme';
import {
  DIAL,
  DIAL_SCALE,
  dialBearing,
  dialFacePath,
  dialMarks,
  dialNumbers,
  dialPoint,
  gaugeColors,
  gaugeStill,
  markerArriveMs,
  markerGlideMs,
  NEEDLE_SPRING,
  needleAt,
  TAPE,
  RULER_SCALE,
  tapeMarks,
  rulerNumbers,
  rulerX,
  type DialUnit,
  type RulerUnit,
} from './growthGauge';

const here = dirname(fileURLToPath(import.meta.url));
const component = readFileSync(join(here, 'GrowthGauges.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  .replace(/\s+/g, ' ');

const RULER_UNITS: RulerUnit[] = ['cm', 'in'];
const DIAL_UNITS: DialUnit[] = ['kg', 'lb'];
/** The quick sheet's body at the narrowest proven phone, a common one, and the widest. */
const WIDTHS = [272, 324, 339, 400];

describe('the ruler: a tape from zero, graduated in the sheet’s own unit', () => {
  it('numbers every 20 cm to 120 and every 10 in to 50, from zero', () => {
    expect(rulerNumbers('cm', 324).map(m => m.value)).toEqual([0, 20, 40, 60, 80, 100, 120]);
    expect(rulerNumbers('in', 324).map(m => m.value)).toEqual([0, 10, 20, 30, 40, 50]);
  });

  it('marks every 5 cm (long every 10) and every inch (long every 5)', () => {
    const cm = tapeMarks('cm', 324);
    expect(cm).toHaveLength(RULER_SCALE.cm.max / 5 + 1);
    expect(cm.filter(m => m.long).map(m => m.value)).toEqual(
      Array.from({ length: 14 }, (_, i) => i * 10),
    );
    expect(tapeMarks('in', 324)).toHaveLength(53);
  });

  it('places zero and the far end inside the tape, a length where it belongs, and pins past it', () => {
    for (const unit of RULER_UNITS) {
      for (const w of WIDTHS) {
        expect(rulerX(0, unit, w)).toBe(TAPE.inset);
        expect(rulerX(RULER_SCALE[unit].max, unit, w)).toBe(w - TAPE.inset);
        expect(rulerX(RULER_SCALE[unit].max * 2, unit, w)).toBe(w - TAPE.inset);
        expect(rulerX(-5, unit, w)).toBe(TAPE.inset);
        const half = rulerX(RULER_SCALE[unit].max / 2, unit, w);
        expect(half).toBeCloseTo(w / 2, 6);
      }
    }
  });

  it('keeps every number’s box clear of the next one’s, at the narrowest phone and the largest text', () => {
    for (const unit of RULER_UNITS) {
      const n = rulerNumbers(unit, WIDTHS[0] ?? 272);
      for (let i = 1; i < n.length; i += 1) {
        const gap = (n[i]?.x ?? 0) - (n[i - 1]?.x ?? 0);
        // three digits at 10 pt grown 1.3×, mono (0.6 em a digit)
        expect(gap).toBeGreaterThan(3 * 0.6 * TAPE.numberSize * TAPE.numberGrow);
      }
      // the unit beside the zero ends before the next number starts
      const unitEnd = rulerX(0, unit, 272) + 7 + 2 * 0.6 * TAPE.numberSize * TAPE.numberGrow;
      const next = n[1]?.x ?? 0;
      expect(unitEnd).toBeLessThan(next - 1.5 * 0.6 * TAPE.numberSize * TAPE.numberGrow);
    }
  });

  it('keeps the marks and the numbers inside the tape, and under its top edge', () => {
    expect(TAPE.tapeTop + TAPE.majorTick).toBeLessThan(TAPE.numberTop);
    expect(TAPE.numberTop + TAPE.numberHeight).toBeLessThanOrEqual(TAPE.tapeTop + TAPE.tapeHeight);
    expect(TAPE.tapeTop + TAPE.tapeHeight).toBeLessThanOrEqual(TAPE.height);
    // the marker's cap stands on the tape, inside the picture
    expect(TAPE.tapeTop - TAPE.cap - 1).toBeGreaterThanOrEqual(0);
  });
});

describe('the scale: a dial from zero, 150° round', () => {
  it('points at zero on the left stop and at the end on the right, and pins past it', () => {
    for (const unit of DIAL_UNITS) {
      expect(dialBearing(0, unit)).toBe(-DIAL.half);
      expect(dialBearing(DIAL_SCALE[unit].max, unit)).toBe(DIAL.half);
      expect(dialBearing(DIAL_SCALE[unit].max + 40, unit)).toBe(DIAL.half);
      expect(dialBearing(-1, unit)).toBe(-DIAL.half);
    }
    // 7 lb 4 oz is 7.25 lb, a little way round
    expect(dialBearing(7.25, 'lb')).toBeCloseTo(-75 + (150 * 7.25) / 70, 9);
  });

  it('numbers 0–30 kg every 10 and 0–60 lb every 20', () => {
    expect(dialNumbers('kg').map(m => m.value)).toEqual([0, 10, 20, 30]);
    expect(dialNumbers('lb').map(m => m.value)).toEqual([0, 20, 40, 60]);
    expect(dialMarks('kg')).toHaveLength(31);
    expect(dialMarks('lb')).toHaveLength(36);
  });

  it('keeps every mark, number and the needle inside the box, and the numbers off the foot', () => {
    for (const unit of DIAL_UNITS) {
      for (const m of dialMarks(unit)) {
        const p = dialPoint(m.bearing, DIAL.r);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(DIAL.width);
        expect(p.y).toBeGreaterThanOrEqual(0);
      }
      for (const m of dialNumbers(unit)) {
        const p = dialPoint(m.bearing, DIAL.numberR);
        expect(p.x - DIAL.numberBox / 2).toBeGreaterThanOrEqual(0);
        expect(p.x + DIAL.numberBox / 2).toBeLessThanOrEqual(DIAL.width);
        expect(p.y + DIAL.numberHeight / 2).toBeLessThan(DIAL.py);
        // clear of the long marks' inner ends
        expect(DIAL.numberR + DIAL.numberHeight / 2).toBeLessThan(DIAL.r - DIAL.majorTick);
      }
    }
    for (const b of [-DIAL.half, 0, DIAL.half]) {
      const tip = dialPoint(b, DIAL.needle);
      expect(tip.y).toBeGreaterThanOrEqual(0);
      expect(tip.x).toBeGreaterThanOrEqual(0);
      expect(tip.x).toBeLessThanOrEqual(DIAL.width);
    }
    expect(DIAL.py + DIAL.hub).toBeLessThanOrEqual(DIAL.height);
    expect(dialFacePath()).toBe('M6 64A64 64 0 0 1 134 64Z');
  });
});

describe('the moves: the marker slides in, the needle swings and settles', () => {
  it('slides the marker in from zero in 280–700 ms, longer the further it goes', () => {
    expect(markerArriveMs(0)).toBe(280);
    expect(markerArriveMs(1)).toBe(700);
    expect(markerArriveMs(2)).toBe(700);
    expect(markerArriveMs(0.4)).toBeGreaterThan(markerArriveMs(0.2));
  });

  it('glides a step in 160–420 ms by the points it travels', () => {
    expect(markerGlideMs(0)).toBe(160);
    expect(markerGlideMs(-10)).toBe(190);
    expect(markerGlideMs(500)).toBe(420);
  });

  it('settles the needle within 2% of its swing by about half a second', () => {
    for (const [from, to] of [
      [-75, -50],
      [-75, 30],
      [-20, 10],
    ] as const) {
      const swing = Math.abs(to - from);
      expect(needleAt(from, to, 0)).toBeCloseTo(from, 9);
      for (let ms = 520; ms <= 1500; ms += 20)
        expect(Math.abs(needleAt(from, to, ms) - to)).toBeLessThan(0.02 * swing);
      // …and it has not arrived at once: it is still on its way a few frames in
      expect(Math.abs(needleAt(from, to, 60) - to)).toBeGreaterThan(0.5 * swing);
    }
  });

  it('passes the weight by about a sixth of the swing — once, and much less the second time', () => {
    const from = -75;
    const to = 0;
    const path = Array.from({ length: 800 }, (_, ms) => needleAt(from, to, ms));
    const peak = Math.max(...path);
    expect(peak - to).toBeGreaterThan(0.12 * 75);
    expect(peak - to).toBeLessThan(0.2 * 75);
    // the second pass is on the other side, and small
    const after = path.slice(path.indexOf(peak));
    expect(Math.min(...after) - to).toBeGreaterThan(-0.04 * 75);
  });

  it('runs the spring the phone is handed', () => {
    expect(component).toContain('...NEEDLE_SPRING,');
    expect(NEEDLE_SPRING).toEqual({ stiffness: 256, damping: 16, mass: 1 });
  });

  it('draws the reading where it is under reduce motion and in the amber Night', () => {
    expect(gaugeStill(true, 'light')).toBe(true);
    expect(gaugeStill(false, 'night')).toBe(true);
    expect(gaugeStill(false, 'dark')).toBe(false);
    expect(component).toContain('const still = gaugeStill(t.reduceMotion, t.theme);');
    expect(component).toContain('new Animated.Value(still ? bearing : -DIAL.half)');
    expect(component).toContain('x.setValue(to);');
  });
});

/**
 * NEUTRAL, AND LEGIBLE. The tape and the face are a surface; their edge is a mark on the sheet —
 * and on the measurement's own box they have sat in since 2026-09-26 (`surface2`); the graduations
 * are marks and the numbers text on the fill; the marker and the needle are marks on the fill and on
 * the sheet (the marker's cap stands above the tape).
 */
describe('the colors: neutral roles, 3:1 marks and 4.5:1 numbers in all 54 appearances', () => {
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
    const c = gaugeColors(p, theme);
    const sheets = [
      ...[p.app, p.paper, p.page].map(g => composite(g, materialBase(p, s.sheet), s.sheet.alpha)),
      // since 2026-09-26 each gauge sits in its measurement's own box on the growth sheet
      p.surface2,
    ];
    for (const sheet of sheets) {
      expect(contrastRatio(c.rim, sheet), 'rim').toBeGreaterThanOrEqual(AA_GRAPHIC);
      expect(contrastRatio(c.pointer, sheet), 'marker cap').toBeGreaterThanOrEqual(AA_GRAPHIC);
    }
    expect(contrastRatio(c.tick, c.fill), 'marks').toBeGreaterThanOrEqual(AA_GRAPHIC);
    expect(contrastRatio(c.number, c.fill), 'numbers').toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio(c.pointer, c.fill), 'pointer').toBeGreaterThanOrEqual(AA_GRAPHIC);
  });

  it('wears no module hue and no status hue — nothing that could say good, bad or big', () => {
    const meaningful: (keyof Palette)[] = [
      'good',
      'warn',
      'crit',
      'dangerFill',
      'accent',
      'accent2',
      'diaper',
      'milk',
      'sleep',
      'rose',
      'olive',
      'cyan',
      'feed',
      'pump',
      'solids',
      'health',
      'tummy',
      'breastfeed',
      'med',
      'bath',
    ];
    for (const theme of themeNames) {
      const p = themes[theme];
      const c = gaugeColors(p, theme);
      const used = new Set(Object.values(c).map(v => v.toLowerCase()));
      for (const role of meaningful) expect(used.has(p[role].toLowerCase()), role).toBe(false);
    }
    // and the colors take the theme only: the reading is not an input
    expect(gaugeColors.length).toBe(2);
  });
});

describe('the component: decoration attached to the value, on the native driver', () => {
  it('reads the value it is handed, never a stepper', () => {
    expect(component).not.toContain('NumberStepper');
    expect(component).toContain('const to = width > 0 ? rulerX(value, unit, width) : TAPE.inset;');
    expect(component).toContain('const bearing = dialBearing(value, unit);');
  });

  it('is hidden from assistive technology and from touch', () => {
    expect(component).toContain("pointerEvents: 'none'");
    expect(component).toContain('accessibilityElementsHidden: true');
    expect(component).toContain("importantForAccessibility: 'no-hide-descendants'");
  });

  it('moves on the native driver, and meets the stops rather than passing them', () => {
    expect(component.match(/useNativeDriver: true/g)?.length).toBeGreaterThanOrEqual(2);
    expect(component).toContain("extrapolate: 'clamp',");
  });
});
