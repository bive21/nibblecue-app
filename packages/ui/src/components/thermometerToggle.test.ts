/**
 * THE THERMOMETER (the owner, 2026-09-26: the temperature sheet's °F / °C as a real dual-scale
 * thermometer — °F printed above the bore, °C below, a silver column standing at the reading, and a
 * pair of radios choosing which scale is read). The geometry, the placement, the tag's odometer,
 * the planner and the frames are PURE (`thermometerToggle.ts`) and are sampled here as
 * `Animated.Value#interpolate` would sample them; what only a device can show is held by tripwires
 * over `ThermometerToggle.tsx`. And one thing is held that is not about pixels at all: nothing here
 * may interpret a temperature — the column is the parent's number on a ruler.
 */
import { displayToTemp, tempToDisplay } from '@nibblecue/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { type Frame } from './dayNightSwitch';
import { moveMs, THEME_SKY_MS } from './themeSkyToggle';
import {
  digitAt,
  FLIP_SLACK,
  GLASS,
  GLASS_RUN,
  GLIDE,
  glideMs,
  GLYPH_ROOM,
  glyphBox,
  INK_OFFSET,
  inkBox,
  insideGlass,
  levelOf,
  MONO,
  PAIR,
  planThermometer,
  PRINTED,
  readingDigits,
  readingText,
  restCell,
  rollSequence,
  rollTo,
  SCALE_STOPS,
  SCALE_TYPE,
  scaleIndex,
  sideAt,
  storedAt,
  tagShift,
  THERMOMETER_SIZE,
  thermometerFrames,
  thermometerGeometry,
  thermometerLayout,
  thermometerStill,
  WHEEL_CELLS,
  WHEEL_CLICK,
  WHEEL_STAGGER_MS,
  type FlipMotion,
  type ScaleStop,
  type ThermometerChange,
  type ThermometerGeometry,
} from './thermometerToggle';

// every width the sheet can have, at five text sizes: pure arithmetic, but a few seconds on a
// machine busy with other suites, so it gets room past vitest's 5 s default — the walks are
// deterministic, and room is all a slow machine needs
vi.setConfig({ testTimeout: 30_000 });

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
/** Comments out: the component explains its own rules, and a scan must not read the explanation. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const component = withoutComments(read('ThermometerToggle.tsx'));
const flat = component.replace(/\s+/g, ' ');
const pure = withoutComments(read('thermometerToggle.ts'));

/** The symbols the temperature sheet passes: a FIXTURE — the component never types one. */
const LABELS: Record<ScaleStop, string> = { f: '°F', c: '°C' };

/** Every width the quick sheet's body can be, half a point apart, and two a larger phone gives. */
const WIDTHS = [
  ...Array.from(
    { length: (THERMOMETER_SIZE.maxWidth - THERMOMETER_SIZE.minWidth) * 2 + 1 },
    (_, i) => THERMOMETER_SIZE.minWidth + i / 2,
  ),
  430,
  768,
];
/** The phone's text size: smaller than usual, usual, larger, the floor, and past the chrome cap. */
const SCALES = [0.85, 1, 1.15, 1.25, 1.3, 2];

/** `Animated.Value#interpolate` for one number: piecewise-linear, clamped or extended past the ends. */
function sample(fr: Frame, p: number): number {
  const xs = fr.inputRange;
  const ys = fr.outputRange;
  const last = xs.length - 1;
  const seg = (i: number) => {
    const [x0, x1, y0, y1] = [xs[i] ?? 0, xs[i + 1] ?? 1, ys[i] ?? 0, ys[i + 1] ?? 0];
    return y0 + ((p - x0) / (x1 - x0)) * (y1 - y0);
  };
  if (p <= (xs[0] ?? 0)) return fr.extrapolate === 'clamp' ? (ys[0] ?? 0) : seg(0);
  if (p >= (xs[last] ?? 1)) return fr.extrapolate === 'clamp' ? (ys[last] ?? 0) : seg(last - 1);
  let i = 0;
  while ((xs[i + 1] ?? 1) < p) i += 1;
  return seg(i);
}

/** Where the column's tip stands for a level, as the component draws it. */
const tipAt = (g: ThermometerGeometry, level: number) =>
  g.run.to + sample(thermometerFrames(g).columnX, level);
/** A graduation's two ends, as the component draws them: °F grows up from the bore, °C down. */
const tickEnds = (g: ThermometerGeometry, s: ScaleStop, length: number) =>
  s === 'f'
    ? [g.bore.top - GLASS.tickGap - length, g.bore.top - GLASS.tickGap]
    : [
        g.bore.top + g.bore.height + GLASS.tickGap,
        g.bore.top + g.bore.height + GLASS.tickGap + length,
      ];
/** Every ink box the rows draw: each scale's symbol and numbers. */
const inks = (g: ThermometerGeometry) =>
  SCALE_STOPS.flatMap(s =>
    [g.symbol[s], ...g.labels[s]].map(p => ({
      s,
      p,
      box: inkBox(p, g.row[s].baseline, g.type.size),
    })),
  );

describe('the size of it', () => {
  it('is a row at most 60 tall, whose two radios are each a 44 pt target both ways, at every width', () => {
    const { height, cell } = THERMOMETER_SIZE;
    // the owner: "always make things shorter when you can" — and the task's ceiling of 60
    expect(height).toBeLessThanOrEqual(60);
    expect(height).toBeGreaterThanOrEqual(44);
    expect(cell).toBeGreaterThanOrEqual(44);
    for (const width of WIDTHS) {
      const g = thermometerGeometry(width, LABELS);
      // the pair is the row's last 2 × cell, beside the glass and the gap
      expect(g.pair.left + 2 * cell, `at ${width}`).toBeCloseTo(g.width, 9);
      expect(g.glass + THERMOMETER_SIZE.gap + 2 * cell).toBeCloseTo(g.width, 9);
      // the track is the segmented control's 44, inside the row
      expect(g.pair.track.height).toBe(PAIR.track);
      expect(g.pair.track.top).toBeGreaterThanOrEqual(0);
      expect(g.pair.track.top + g.pair.track.height).toBeLessThanOrEqual(g.height);
    }
    // each radio is a flex half of a pair 2 × cell wide and the row tall
    expect(flat).toContain(
      'style={[styles.pair, { width: 2 * THERMOMETER_SIZE.cell, height: g.height }]}',
    );
    expect(flat).toContain('style={styles.zone}');
    expect(component).toMatch(/zone: \{ flex: 1 \}/);
    expect(component).toMatch(/zones: \{ flexDirection: 'row' \}/);
  });

  it('draws each chip over its own radio, and the pair’s words fit their chips at the chrome cap', () => {
    const g = thermometerGeometry(324, LABELS);
    const { chip } = g.pair;
    for (const s of SCALE_STOPS) {
      const left = chip.left + scaleIndex(s) * chip.travel;
      const zone = scaleIndex(s) * THERMOMETER_SIZE.cell;
      expect(left).toBeGreaterThanOrEqual(zone);
      expect(left + chip.width).toBeLessThanOrEqual(zone + THERMOMETER_SIZE.cell);
      // the segmented control's own words — 13, the UI face, a bound of 0.6 em a character — at
      // the chrome cap, with `space.xs` either side (the face's own "°C" is 1.13 em, so the bound
      // is two points wider than the word at the cap)
      const wide = [...LABELS[s]].length * 0.6 * 13 * SCALE_TYPE.ceiling;
      expect(wide + 2 * 4, s).toBeLessThanOrEqual(chip.width);
    }
    expect(chip.height).toBe(PAIR.track - 2 * PAIR.pad);
    expect(flat).toContain('maxFontSizeMultiplier={CHROME_FONT_CAP}');
  });

  it('takes the room it is given, and stops growing past a phone’s width', () => {
    expect(thermometerGeometry(324, LABELS).width).toBe(324);
    expect(thermometerGeometry(768, LABELS).width).toBe(THERMOMETER_SIZE.maxWidth);
    // a first frame's zero still lays out a pair and a glass
    expect(thermometerGeometry(0, LABELS).glass).toBeGreaterThanOrEqual(THERMOMETER_SIZE.height);
  });

  it('fits everything at 1.25× the phone’s text size at every width, 1.3× from 300, never past the chrome cap', () => {
    for (const width of WIDTHS) {
      const g = thermometerGeometry(width, LABELS);
      expect(g.fits, `at ${width}`).toBe(true);
      expect(g.cap, `at ${width}`).toBeGreaterThanOrEqual(1.25);
      if (width >= 300) expect(g.cap, `at ${width}`).toBeGreaterThanOrEqual(SCALE_TYPE.floor);
      expect(g.cap).toBeLessThanOrEqual(SCALE_TYPE.ceiling);
    }
    expect(read('Text.tsx')).toContain(`export const CHROME_FONT_CAP = ${SCALE_TYPE.ceiling};`);
  });

  it('finds the cap by halving because the fit only tightens as the text grows', () => {
    for (const width of [
      THERMOMETER_SIZE.minWidth,
      284,
      300,
      324,
      339,
      360,
      THERMOMETER_SIZE.maxWidth,
    ]) {
      const sizes = Array.from({ length: 111 }, (_, i) => 0.5 + i / 100);
      const fit = sizes.map(s => thermometerLayout(width, LABELS, s).fits);
      const last = fit.lastIndexOf(true);
      expect(fit.slice(0, last + 1).every(Boolean), `at ${width}`).toBe(true);
      expect(thermometerGeometry(width, LABELS).cap, `at ${width}`).toBeCloseTo(
        sizes[last] ?? 1,
        9,
      );
    }
  });

  it('is laid out at the phone’s own text size, as far as the cap, and fits at every one of them', () => {
    for (const width of WIDTHS)
      for (const fontScale of SCALES) {
        const g = thermometerGeometry(width, LABELS, fontScale);
        expect(g.scale).toBeCloseTo(Math.min(fontScale, g.cap), 9);
        expect(g.fits, `at ${width}, ×${fontScale}`).toBe(true);
      }
    const g = thermometerGeometry(324, LABELS, 1);
    expect(g.type.size).toBe(SCALE_TYPE.size);
    expect(g.tag.size).toBe(SCALE_TYPE.tag);
  });

  it('prints a number every 2 °F and every 1 °C at the size most parents use, on every phone', () => {
    // a 360 dp Android's body, a 375 pt iPhone's, and larger
    for (const width of [324, 339, 354, 360, 394]) {
      const g = thermometerGeometry(width, LABELS, 1);
      expect(g.every, `at ${width}`).toEqual({ f: 2, c: 1 });
      expect(g.labels.f.map(p => p.text)).toEqual(['96', '98', '100', '102', '104', '106']);
      expect(g.labels.c.map(p => p.text)).toEqual(['35', '36', '37', '38', '39', '40', '41']);
    }
  });
});

describe('the glass: every mark on it, inside it', () => {
  it('writes every number and both symbols inside the glass, clear of the rim, at every width and size', () => {
    for (const width of WIDTHS)
      for (const fontScale of SCALES) {
        const g = thermometerGeometry(width, LABELS, fontScale);
        const m = g.rim + GLASS.margin;
        for (const { s, p, box } of inks(g)) {
          const at = `${s} ${p.text} at ${width}, ×${fontScale}`;
          for (const [x, y] of [
            [box.left, box.top],
            [box.right, box.top],
            [box.left, box.bottom],
            [box.right, box.bottom],
          ] as const)
            expect(insideGlass(g.glass, g.height, x, y, m), at).toBe(true);
        }
      }
  });

  it('keeps the numbers of a row apart, and clear of the row’s symbol', () => {
    for (const width of WIDTHS)
      for (const fontScale of SCALES) {
        const g = thermometerGeometry(width, LABELS, fontScale);
        for (const s of SCALE_STOPS) {
          const row = [g.symbol[s], ...g.labels[s]];
          for (let i = 1; i < row.length; i += 1) {
            const a = row[i - 1];
            const b = row[i];
            expect(
              (b?.left ?? 0) - ((a?.left ?? 0) + (a?.width ?? 0)),
              `${s} at ${width}, ×${fontScale}`,
            ).toBeGreaterThanOrEqual(GLASS.labelGap - 1e-9);
          }
        }
      }
  });

  it('draws every graduation inside the glass, between the bore and its row’s numbers, and apart', () => {
    for (const width of WIDTHS)
      for (const fontScale of [1, 1.3]) {
        const g = thermometerGeometry(width, LABELS, fontScale);
        const m = g.rim + GLASS.margin;
        for (const s of SCALE_STOPS) {
          const xs = g.ticks[s].map(t => t.x);
          for (const tick of g.ticks[s]) {
            const [y1, y2] = tickEnds(g, s, tick.length);
            expect(insideGlass(g.glass, g.height, tick.x, y1 ?? 0, m)).toBe(true);
            expect(insideGlass(g.glass, g.height, tick.x, y2 ?? 0, m)).toBe(true);
            // °F above the bore, °C below it, and never into the numbers' ink
            if (s === 'f') expect(y1 ?? 0).toBeGreaterThanOrEqual(g.height / 2 - INK_OFFSET);
            else expect(y2 ?? 0).toBeLessThanOrEqual(g.height / 2 + INK_OFFSET);
            expect(tick.x).toBeGreaterThan(g.bulb.cx + g.bulb.r);
          }
          for (let i = 1; i < xs.length; i += 1)
            expect((xs[i] ?? 0) - (xs[i - 1] ?? 0), `${s} at ${width}`).toBeGreaterThanOrEqual(
              GLASS.tickRoom,
            );
        }
      }
  });

  it('seats the bulb inside the glass’s left end, and runs the bore from it to inside the right end', () => {
    for (const width of WIDTHS) {
      const g = thermometerGeometry(width, LABELS);
      const m = g.rim + GLASS.margin;
      expect(g.bulb.cy).toBe(g.height / 2);
      for (const dy of [-g.bulb.r, 0, g.bulb.r])
        expect(
          insideGlass(
            g.glass,
            g.height,
            g.bulb.cx - Math.sqrt(g.bulb.r ** 2 - dy ** 2),
            g.bulb.cy + dy,
            m,
          ),
        ).toBe(true);
      expect(g.bore.left).toBe(g.bulb.cx);
      expect(insideGlass(g.glass, g.height, g.bore.right, g.bore.top, m)).toBe(true);
      expect(insideGlass(g.glass, g.height, g.bore.right, g.bore.top + g.bore.height, m)).toBe(
        true,
      );
      // the run starts clear of the bulb, and the bore holds the whole of it
      expect(g.run.from).toBeGreaterThanOrEqual(g.bulb.cx + g.bulb.r + GLASS.neck);
      expect(g.run.to).toBeLessThan(g.bore.right);
      // the symbols are printed over and under the bulb, clear of it
      for (const s of SCALE_STOPS) expect(g.symbol[s].x).toBe(g.bulb.cx);
      expect(INK_OFFSET).toBeGreaterThan(g.bulb.r);
    }
  });

  it('keeps the tag inside the glass wherever the column stands, and clear of both rows', () => {
    for (const width of WIDTHS)
      for (const fontScale of SCALES) {
        const g = thermometerGeometry(width, LABELS, fontScale);
        const f = thermometerFrames(g);
        const m = g.rim + GLASS.margin;
        // at the top of the run, the far end of the tag is still inside the round end
        const right = sample(f.tagX, 1) + g.tag.width;
        const at = `at ${width}, ×${fontScale}`;
        expect(insideGlass(g.glass, g.height, right, g.tag.top, m), at).toBe(true);
        expect(insideGlass(g.glass, g.height, right, g.tag.top + g.tag.height, m), at).toBe(true);
        // and it never reaches the numbers' ink above or below
        expect(g.tag.top, at).toBeGreaterThanOrEqual(g.height / 2 - INK_OFFSET);
        expect(g.tag.top + g.tag.height, at).toBeLessThanOrEqual(g.height / 2 + INK_OFFSET);
        // the widest reading — "110.0" — fits its window, with the padding either side
        expect(5 * g.tag.slot + 2 * GLASS.tagPad).toBeCloseTo(g.tag.width, 9);
        expect(g.tag.cell).toBeGreaterThanOrEqual(MONO.line * g.tag.size);
        expect(g.tag.height).toBe(g.tag.cell + 2);
      }
  });
});

describe('the two scales are one line, laid out in the unit the app stores', () => {
  it('prints 95 °F over 35 °C, and 104 °F over 40 °C, at the same point', () => {
    const g = thermometerGeometry(324, LABELS);
    const at = (s: ScaleStop, v: number) => g.ticks[s].find(t => t.value === v)?.x;
    expect(at('f', 95)).toBeCloseTo(at('c', 35) ?? NaN, 9);
    expect(at('f', 104)).toBeCloseTo(at('c', 40) ?? NaN, 9);
    expect(at('f', 95)).toBeCloseTo(g.run.from, 9);
    expect(at('f', 106)).toBeCloseTo(g.run.to, 9);
  });

  it('puts every mark where the app would store its number, by core’s own conversion', () => {
    for (const width of [THERMOMETER_SIZE.minWidth, 324, THERMOMETER_SIZE.maxWidth]) {
      const g = thermometerGeometry(width, LABELS);
      const perStored = (g.run.to - g.run.from) / (GLASS_RUN.to - GLASS_RUN.from);
      for (const s of SCALE_STOPS)
        for (const tick of g.ticks[s]) {
          // where a saved reading of exactly this number would stand the column: on the mark
          const x = g.run.from + (displayToTemp(tick.value, s) - GLASS_RUN.from) * perStored;
          expect(tick.x).toBeCloseTo(x, 9);
          expect(tipAt(g, levelOf(tick.value, s))).toBeCloseTo(tick.x, 9);
          // and within half a stored hundredth of the exact scale: the TEST may do the
          // arithmetic of degrees the control never does, to check core's placement against it
          const exact = s === 'f' ? ((tick.value - 32) * 500) / 9 : tick.value * 100;
          const ideal = g.run.from + (exact - GLASS_RUN.from) * perStored;
          expect(Math.abs(tick.x - ideal), `${s} ${tick.value} at ${width}`).toBeLessThanOrEqual(
            0.5 * perStored + 1e-9,
          );
        }
    }
    // and the run is exactly the printed range, stored
    expect(GLASS_RUN).toEqual({ from: displayToTemp(95, 'f'), to: displayToTemp(106, 'f') });
    expect(storedAt(37, 'c')).toBe(displayToTemp(37, 'c'));
  });

  it('graduates each scale evenly, every mark a step of its own degrees, numbered on its long ones', () => {
    for (const width of [THERMOMETER_SIZE.minWidth, 324, THERMOMETER_SIZE.maxWidth])
      for (const fontScale of [1, 1.3]) {
        const g = thermometerGeometry(width, LABELS, fontScale);
        const perStored = (g.run.to - g.run.from) / (GLASS_RUN.to - GLASS_RUN.from);
        for (const s of SCALE_STOPS) {
          const { from, to, tick } = PRINTED[s];
          const ticks = g.ticks[s];
          expect(ticks[0]?.value).toBe(from);
          expect(ticks[ticks.length - 1]?.value).toBe(to);
          expect(ticks).toHaveLength(Math.round((to - from) / tick) + 1);
          // even to a stored hundredth of a degree — a third of a point at the widest — which is
          // core's rounding and nothing else
          const nominal = (s === 'f' ? (tick * 500) / 9 : tick * 100) * perStored;
          const gaps = ticks.slice(1).map((t, i) => t.x - (ticks[i]?.x ?? 0));
          for (const d of gaps) expect(Math.abs(d - nominal)).toBeLessThanOrEqual(perStored + 1e-9);
          // a number on every long mark and on nothing else, each a whole multiple of its step
          const numbered = new Set(g.labels[s].map(p => p.value));
          for (const t of ticks) expect(t.length === GLASS.tick.long).toBe(numbered.has(t.value));
          for (const p of g.labels[s]) {
            expect(p.value % g.every[s]).toBe(0);
            expect(p.text).toBe(String(p.value));
          }
          expect(PRINTED[s].every).toContain(g.every[s]);
        }
      }
  });
});

describe('the column: the reading, and nothing else', () => {
  it('stands where the reading is — a pure function of the number and its scale', () => {
    expect(levelOf(95, 'f')).toBe(0);
    expect(levelOf(35, 'c')).toBe(0);
    expect(levelOf(106, 'f')).toBe(1);
    expect(levelOf(98.6, 'f')).toBe(levelOf(37, 'c'));
    expect(levelOf(104, 'f')).toBe(levelOf(40, 'c'));
    expect(levelOf(98.6, 'f')).toBe(levelOf(98.6, 'f'));
    // a warmer reading never stands lower
    for (let f10 = 900; f10 < 1100; f10 += 1)
      expect(levelOf((f10 + 1) / 10, 'f')).toBeGreaterThanOrEqual(levelOf(f10 / 10, 'f'));
    // the same place at every width: the level is the geometry's input, never its output
    for (const width of [THERMOMETER_SIZE.minWidth, 324, THERMOMETER_SIZE.maxWidth]) {
      const g = thermometerGeometry(width, LABELS);
      const x98 = g.ticks.f.find(t => t.value === 98)?.x ?? NaN;
      expect(tipAt(g, levelOf(98, 'f'))).toBeCloseTo(x98, 9);
    }
  });

  it('lands a reading and its conversion on the same point, as far as the sheet’s rounding lets it', () => {
    // every tenth of a degree the stepper allows in either scale, converted by core as the sheet
    // converts it: the two readings of one stored value land within FLIP_SLACK of each other
    const stored = new Set<number>();
    for (let c10 = 320; c10 <= 430; c10 += 1) stored.add(displayToTemp(c10 / 10, 'c'));
    for (let f10 = 900; f10 <= 1100; f10 += 1) stored.add(displayToTemp(f10 / 10, 'f'));
    const span = GLASS_RUN.to - GLASS_RUN.from;
    for (const h of stored) {
      const [f, c] = [tempToDisplay(h, 'f'), tempToDisplay(h, 'c')];
      expect(Math.abs(levelOf(f, 'f') - levelOf(c, 'c')) * span, `${h}`).toBeLessThanOrEqual(
        FLIP_SLACK,
      );
    }
    // and where both readings are exact, exactly
    for (const [f, c] of [
      [95, 35],
      [98.6, 37],
      [100.4, 38],
      [104, 40],
    ] as const)
      expect(levelOf(f, 'f')).toBe(levelOf(c, 'c'));
  });

  it('pins a reading past either end of the glass at that end', () => {
    for (const [reading, s, level] of [
      [90, 'f', 0],
      [94.9, 'f', 0],
      [32, 'c', 0],
      [106.1, 'f', 1],
      [110, 'f', 1],
      [43, 'c', 1],
      [Number.NaN, 'c', 0],
    ] as const)
      expect(levelOf(reading, s), `${reading} ${s}`).toBe(level);
    const g = thermometerGeometry(324, LABELS);
    expect(tipAt(g, levelOf(110, 'f'))).toBeCloseTo(g.run.to, 9);
    expect(tipAt(g, levelOf(32, 'c'))).toBeCloseTo(g.run.from, 9);
  });
});

describe('the tag', () => {
  /*
    THE DOTTED LINE (the owner, 2026-09-26, with a screenshot of a white capsule after the column
    with a dotted line in it: "was it just unfinished?"). Each digit was set in a box exactly one
    advance wide with one line allowed, and a digit a hair wider than its box on a phone is drawn as
    an ellipsis. Every character is now set in a box a character wider either side of its cell, and
    clipped rather than ellipsized.
  */
  it('sets every character of the tag in a box wider than the digit, centered on its cell', () => {
    for (const width of [THERMOMETER_SIZE.minWidth, 324, THERMOMETER_SIZE.maxWidth])
      for (const fontScale of [1, 1.3]) {
        const g = thermometerGeometry(width, LABELS, fontScale);
        const box = glyphBox(g.tag.slot);
        expect(box.width).toBeCloseTo((1 + 2 * GLYPH_ROOM) * g.tag.slot, 9);
        expect(box.width).toBeGreaterThan(g.tag.slot);
        // centered: as much room left of the cell as right of it
        expect(box.left + box.width / 2).toBeCloseTo(g.tag.slot / 2, 9);
      }
    expect(GLYPH_ROOM).toBeGreaterThanOrEqual(1);
    // what the component draws: every wheel's digits and the point through the one wide cell, and
    // no character on the glass ellipsized
    expect(flat).toContain('const box = glyphBox(tag.slot);');
    expect(flat).toContain('{DIGIT_CELLS.map((d, k) => tagGlyph(d, k))}');
    expect(flat).toContain("{tagGlyph('.')}");
    expect(flat).toContain('{ left: box.left, width: box.width, height: tag.cell }');
    expect(flat).toContain('numberOfLines={1} ellipsizeMode="clip" allowFontScaling={false}');
  });

  it('is outlined in the column’s own color: the reading’s end, not a capsule after it', () => {
    expect(flat).toContain('borderColor: pic.tagEdge,');
    expect(flat).not.toContain('borderColor: pic.tick');
  });

  it('spells a reading the way the sheet’s toast does: one decimal, no zero in front, centered', () => {
    expect(readingText(readingDigits(98.6))).toBe('98.6');
    expect(readingText(readingDigits(37))).toBe('37.0');
    expect(readingText(readingDigits(104))).toBe('104.0');
    expect(readingText(readingDigits(110))).toBe('110.0');
    expect(readingText(readingDigits(0.5))).toBe('0.5');
    // "98.6" moves half a character left, into the middle of a tag cut for "100.4"
    expect(tagShift(readingDigits(98.6))).toBe(-0.5);
    expect(tagShift(readingDigits(104))).toBe(-0);
  });

  it('rolls 98.6 °F down to 37.0 °C like a counter running backwards', () => {
    const from = readingDigits(98.6).digits.map(restCell);
    const to = readingDigits(37).digits.map((d, i) => rollTo(from[i] ?? 0, d, 'down'));
    const seq = from.map((c, i) => rollSequence(c, to[i] ?? c));
    expect(seq[0]).toEqual([0]); // the hundreds: not lit, and not moving
    expect(seq[1]).toEqual([9, 8, 7, 6, 5, 4, 3]); // the tens
    expect(seq[2]).toEqual([8, 7]); // the ones
    expect(seq[3]).toEqual([6, 5, 4, 3, 2, 1, 0]); // the tenths
  });

  it('rolls it back up to 98.6 °F the same way round, forwards', () => {
    const from = readingDigits(37).digits.map(restCell);
    const to = readingDigits(98.6).digits.map((d, i) => rollTo(from[i] ?? 0, d, 'up'));
    const seq = from.map((c, i) => rollSequence(c, to[i] ?? c));
    expect(seq[1]).toEqual([3, 4, 5, 6, 7, 8, 9]);
    expect(seq[2]).toEqual([7, 8]);
    expect(seq[3]).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('wraps a wheel through 9 and 0 as a counter does, and fades a wheel that falls out of use', () => {
    // 104.0 °F is 40.0 °C: every wheel still rolls DOWN, the tens through 9 on its way to 4
    const from = readingDigits(104).digits.map(restCell);
    const to = readingDigits(40).digits.map((d, i) => rollTo(from[i] ?? 0, d, 'down'));
    const seq = from.map((c, i) => rollSequence(c, to[i] ?? c));
    expect(seq[0]).toEqual([1, 0]);
    expect(seq[1]).toEqual([0, 9, 8, 7, 6, 5, 4]);
    expect(seq[2]).toEqual([4, 3, 2, 1, 0]);
    expect(seq[3]).toEqual([0]);
    expect(readingDigits(40).lit[0]).toBe(false);
  });

  it('ends every conversion the sheet can make on exactly the converted reading', () => {
    for (let c10 = 320; c10 <= 430; c10 += 1) {
      const hundredths = displayToTemp(c10 / 10, 'c');
      const [cRead, fRead] = [tempToDisplay(hundredths, 'c'), tempToDisplay(hundredths, 'f')];
      for (const [a, b] of [
        [fRead, cRead],
        [cRead, fRead],
      ] as const) {
        const roll = b < a ? 'down' : 'up';
        const from = readingDigits(a).digits.map(restCell);
        const to = readingDigits(b).digits.map((d, i) => rollTo(from[i] ?? 0, d, roll));
        expect(readingText({ ...readingDigits(b), digits: to.map(digitAt) })).toBe(
          readingText(readingDigits(b)),
        );
        for (const [i, cell] of to.entries()) {
          const moved = cell - (from[i] ?? 0);
          // never more than nine cells, and every wheel the same way round
          expect(Math.abs(moved)).toBeLessThanOrEqual(9);
          if (moved !== 0) expect(Math.sign(moved)).toBe(roll === 'down' ? -1 : 1);
          expect(cell).toBeGreaterThanOrEqual(0);
          expect(cell).toBeLessThan(WHEEL_CELLS);
        }
      }
    }
  });

  it('keeps every wheel on its strip through any run of flips turned round mid-way', () => {
    let cells = readingDigits(98.6).digits.map(restCell);
    let reading = 98.6;
    for (let flip = 0; flip < 50; flip += 1) {
      const next = reading === 98.6 ? 37 : 98.6;
      const roll = next < reading ? 'down' : 'up';
      cells = readingDigits(next).digits.map((d, i) => rollTo(cells[i] ?? 0, d, roll));
      for (const c of cells) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThan(WHEEL_CELLS);
      }
      reading = next;
    }
  });
});

/** A change as the component hands it to the planner: a tapped flip from 98.6 °F, by default. */
const change = (over: Partial<ThermometerChange>): ThermometerChange => ({
  was: { stop: 'f', reading: 98.6 },
  now: { stop: 'c', reading: 37 },
  tapped: true,
  still: false,
  level: levelOf(98.6, 'f'),
  cells: readingDigits(98.6).digits.map(restCell),
  flip: null,
  travel: 140,
  at: 0,
  ...over,
});
const step = (from: number, to: number, stop: ScaleStop = 'c') =>
  change({
    was: { stop, reading: from },
    now: { stop, reading: to },
    tapped: false,
    level: levelOf(from, stop),
    cells: readingDigits(from).digits.map(restCell),
  });

describe('what a change does', () => {
  it('flips a tapped scale without moving the column: the ink turns, the chip slides, the tag rolls', () => {
    const plan = planThermometer(change({}));
    // the temperature did not change, so the column is left exactly where it is
    expect(plan.level).toBeNull();
    expect(plan.side).toEqual({ to: 1, from: 0, animate: true, duration: THEME_SKY_MS });
    expect(plan.roll).toBe(true);
    expect(plan.wheels.map(digitAt)).toEqual([0, 3, 7, 0]);
    // the wheels click into place one after another, left to right, the last as the chip lands
    for (let i = 1; i < plan.wheelMs.length; i += 1)
      expect((plan.wheelMs[i] ?? 0) - (plan.wheelMs[i - 1] ?? 0)).toBe(WHEEL_STAGGER_MS);
    expect(plan.wheelMs[plan.wheelMs.length - 1]).toBe(plan.duration);
    expect(plan.clicks).toEqual([0, -WHEEL_CLICK.cells, -WHEEL_CLICK.cells, -WHEEL_CLICK.cells]);
  });

  it('leaves the column where it was sent for every flip the sheet can make', () => {
    for (let c10 = 320; c10 <= 430; c10 += 1) {
      const h = displayToTemp(c10 / 10, 'c');
      for (const [a, b] of [
        ['f', 'c'],
        ['c', 'f'],
      ] as const) {
        const plan = planThermometer(
          change({
            was: { stop: a, reading: tempToDisplay(h, a) },
            now: { stop: b, reading: tempToDisplay(h, b) },
            level: levelOf(tempToDisplay(h, a), a),
          }),
        );
        expect(plan.level, `${h} ${a}→${b}`).toBeNull();
      }
    }
  });

  it('sets, never rolls, a scale that arrives without a tap — the saved scale loading late', () => {
    const plan = planThermometer(change({ tapped: false }));
    expect(plan.level).toBeNull();
    expect(plan.side).toEqual({ to: 1, from: 1, animate: false, duration: 0 });
    expect(plan.roll).toBe(false);
    expect(plan.wheels).toEqual(readingDigits(37).digits.map(restCell));
    expect(plan.clicks.every(c => c === 0)).toBe(true);
  });

  it('glides the column to a new reading, and sets the tag’s digits and leaves the scale alone', () => {
    const plan = planThermometer(step(37, 37.1));
    expect(plan.level?.to).toBe(levelOf(37.1, 'c'));
    expect(plan.level?.animate).toBe(true);
    expect(plan.level?.duration).toBe(glideMs((levelOf(37.1, 'c') - levelOf(37, 'c')) * 140));
    expect(plan.side).toBeNull();
    expect(plan.roll).toBe(false);
    expect(plan.wheels.map(digitAt)).toEqual([0, 3, 7, 1]);
    // a step past the end of the glass moves nothing: the column is already pinned there
    expect(planThermometer(step(43, 42.9)).level).toBeNull();
  });

  it('leaves a flip under way to finish when the stepper steps, and a glide when the scale flips', () => {
    const flip: FlipMotion = { from: 0, to: 'c', startedAt: 0, duration: THEME_SKY_MS };
    expect(planThermometer({ ...step(37, 37.1), flip, at: 200 }).side).toBeNull();
    // the column was sent to 37.1 °C, and the parent flips to °F mid-glide: it keeps gliding there
    const mid = planThermometer(
      change({
        was: { stop: 'c', reading: 37.1 },
        now: { stop: 'f', reading: 98.8 },
        level: levelOf(37.1, 'c'),
      }),
    );
    expect(mid.level).toBeNull();
    expect(mid.side?.animate).toBe(true);
  });

  it('moves the column when a flip comes with a different temperature — never the sheet’s case', () => {
    const plan = planThermometer(change({ now: { stop: 'c', reading: 39 } }));
    expect(plan.level?.to).toBe(levelOf(39, 'c'));
    expect(plan.level?.animate).toBe(true);
  });

  it('turns a flip round mid-way from where it is estimated to be', () => {
    const flip: FlipMotion = { from: 0, to: 'c', startedAt: 1000, duration: THEME_SKY_MS };
    const at = 1000 + THEME_SKY_MS / 4;
    const plan = planThermometer(
      change({
        flip,
        at,
        was: { stop: 'c', reading: 37 },
        now: { stop: 'f', reading: 98.6 },
        level: levelOf(37, 'c'),
        cells: readingDigits(37).digits.map((d, i) =>
          rollTo(restCell([0, 9, 8, 6][i] ?? 0), d, 'down'),
        ),
      }),
    );
    expect(plan.side?.from).toBeCloseTo(sideAt(flip, at), 9);
    expect(plan.side?.duration).toBe(moveMs(Math.abs(0 - (plan.side?.from ?? 0))));
    expect(plan.side?.duration ?? 0).toBeLessThan(THEME_SKY_MS);
    // and the wheels go back to where they started
    expect(plan.wheels).toEqual(readingDigits(98.6).digits.map(restCell));
  });

  it('times a glide by its distance: quick for a step, never long for a jump', () => {
    expect(glideMs(0)).toBe(GLIDE.min);
    expect(glideMs(1.3)).toBeLessThan(GLIDE.min + 5);
    expect(glideMs(1000)).toBe(GLIDE.max);
    for (let p = 0; p < 300; p += 1) expect(glideMs(p + 1)).toBeGreaterThanOrEqual(glideMs(p));
    // it sets off at speed and settles: an ease-out, so a held stepper is followed, not pulsed after
    const [x1, y1, x2, y2] = GLIDE.ease;
    expect(y1 / x1).toBeGreaterThan(1);
    expect(y2).toBe(1);
    expect(x2).toBeLessThan(1);
  });
});

describe('reduce motion, and the amber night', () => {
  it('is still under reduce motion or in the night theme, and moves otherwise', () => {
    expect(thermometerStill(true, 'light')).toBe(true);
    expect(thermometerStill(false, 'night')).toBe(true);
    expect(thermometerStill(false, 'dark')).toBe(false);
  });

  it('sets every end state and animates nothing — and a flip still leaves the column where it was', () => {
    const flip = planThermometer(change({ still: true }));
    expect(flip.level).toEqual({ to: levelOf(98.6, 'f'), animate: false, duration: 0 });
    expect(flip.side).toEqual({ to: 1, from: 1, animate: false, duration: 0 });
    expect(flip.roll).toBe(false);
    expect(readingText({ ...readingDigits(37), digits: flip.wheels.map(digitAt) })).toBe('37.0');
    const glide = planThermometer({ ...step(37, 38.5), still: true });
    expect(glide.level).toEqual({ to: levelOf(38.5, 'c'), animate: false, duration: 0 });
    expect(glide.side).toEqual({ to: 1, from: 1, animate: false, duration: 0 });
  });

  it('sets the column and the scale when reduce motion arrives mid-move, so neither freezes half way', () => {
    const flip: FlipMotion = { from: 0, to: 'c', startedAt: 0, duration: THEME_SKY_MS };
    const plan = planThermometer(
      change({
        flip,
        at: 200,
        was: { stop: 'c', reading: 37 },
        now: { stop: 'c', reading: 37 },
        level: levelOf(37, 'c'),
        still: true,
      }),
    );
    expect(plan.level).toEqual({ to: levelOf(37, 'c'), animate: false, duration: 0 });
    expect(plan.side?.to).toBe(1);
    expect(plan.side?.animate).toBe(false);
  });

  it('reads both from the theme, and draws no highlight on the bulb in the amber night', () => {
    expect(flat).toContain('const still = thermometerStill(t.reduceMotion, t.theme);');
    expect(flat).toContain('const pic = thermometerFor(t.theme);');
    expect(flat).toContain('{pic.highlight ? ( <Defs>');
    // a set is a set: no run is started for a move the plan did not animate
    expect(flat).toContain('} else level.setValue(plan.level.to);');
    expect(flat).toContain('side.setValue(plan.side.to);');
    expect(flat).toMatch(/if \(!plan\.roll\) \{ wheels\.forEach\(\(w, i\) => w\.setValue/);
  });
});

describe('the frames', () => {
  it('are frames Animated can read: in order, one output per input, and clamped', () => {
    const f = thermometerFrames(thermometerGeometry(324, LABELS));
    for (const [name, fr] of Object.entries({
      columnX: f.columnX,
      tagX: f.tagX,
      boldF: f.bold.f,
      boldC: f.bold.c,
      quietF: f.quiet.f,
      quietC: f.quiet.c,
      chipX: f.chipX,
    })) {
      expect(fr.inputRange.length, name).toBe(fr.outputRange.length);
      for (let i = 1; i < fr.inputRange.length; i += 1)
        expect(fr.inputRange[i] ?? 0, name).toBeGreaterThan(fr.inputRange[i - 1] ?? 0);
      expect(fr.extrapolate, name).toBe('clamp');
    }
  });

  it('stands the tip at the run’s ends, and the tag rides it the whole way', () => {
    for (const width of [THERMOMETER_SIZE.minWidth, 324, THERMOMETER_SIZE.maxWidth]) {
      const g = thermometerGeometry(width, LABELS);
      const f = thermometerFrames(g);
      expect(tipAt(g, 0)).toBeCloseTo(g.run.from, 9);
      expect(tipAt(g, 1)).toBeCloseTo(g.run.to, 9);
      for (let p = 0; p <= 1; p += 0.01)
        expect(sample(f.tagX, p) - tipAt(g, p), `at ${p}`).toBeCloseTo(GLASS.tipGap, 9);
    }
  });

  it('shows each row in exactly one ink at rest, and the chip over the chosen radio', () => {
    const g = thermometerGeometry(324, LABELS);
    const f = thermometerFrames(g);
    for (const s of SCALE_STOPS) {
      const at = scaleIndex(s);
      // read: its full ink whole and its quiet ink gone; the other the other way round
      expect(sample(f.bold[s], at)).toBe(1);
      expect(sample(f.quiet[s], at)).toBe(0);
      expect(sample(f.bold[s], 1 - at)).toBe(0);
      expect(sample(f.quiet[s], 1 - at)).toBe(1);
      for (let p = 0; p <= 1; p += 0.05)
        expect(sample(f.bold[s], p) + sample(f.quiet[s], p)).toBeCloseTo(1, 9);
      expect(sample(f.chipX, at)).toBe(at * g.pair.chip.travel);
    }
  });
});

describe('it never interprets a temperature (CLAUDE.md §2 rules 1 and 3)', () => {
  it('takes no reading to lay out the glass: the reading only ever places the column', () => {
    // the geometry takes a width and the symbols; the level, a reading and its scale
    expect(thermometerGeometry.length).toBe(2);
    expect(levelOf.length).toBe(2);
    // and the picture's colors take the theme alone (theme/thermometer.ts)
    expect(flat).toContain('const pic = thermometerFor(t.theme);');
    expect(flat).not.toMatch(/thermometerFor\([^)]*reading/);
  });

  it('marks no particular temperature: the glass is its two printed runs and nothing else', () => {
    for (const width of [THERMOMETER_SIZE.minWidth, 324, THERMOMETER_SIZE.maxWidth]) {
      const g = thermometerGeometry(width, LABELS);
      for (const s of SCALE_STOPS) {
        // the ticks are exactly the arithmetic run, and every long one is a printed number's
        const values = g.ticks[s].map(t => t.value);
        const { from, to, tick } = PRINTED[s];
        expect(values).toEqual(
          Array.from({ length: Math.round((to - from) / tick) + 1 }, (_, i) =>
            Number((from + i * tick).toFixed(1)),
          ),
        );
      }
    }
    // no mark at a "normal" — the arrow a clinical thermometer prints at 98.6 °F / 37 °C
    expect(pure).not.toMatch(/98\.6|37\.0|\b37\b(?!\.)/);
  });

  it('writes no word about what a number means, and does no arithmetic of degrees', () => {
    for (const src of [component, pure]) {
      expect(src).not.toMatch(/\b(fever|normal|high|low|hot|cold|warm|safe|danger|alarm)\b/i);
      // the sheet converts (core's tempToDisplay); the glass is placed by core's displayToTemp
      expect(src).not.toMatch(/tempToDisplay|\* 9|\* 1\.8|\/ 5|\/ 1\.8|\+ 32|- 32/);
    }
    // core's conversion is called in one place, to place a mark: never to change a reading shown
    expect(component).not.toContain('displayToTemp');
    expect(pure.match(/displayToTemp\(/g)).toHaveLength(1);
    expect(pure).toContain(
      'export const storedAt = (value: number, scale: ScaleStop): number => displayToTemp(value, scale);',
    );
  });
});

describe('the component (tripwires over ThermometerToggle.tsx)', () => {
  it('is one radio group with a name, and two radios that each say what they are', () => {
    expect(flat).toContain('accessibilityRole="radiogroup"');
    expect(flat).toContain('accessibilityLabel={label}');
    expect(flat).toContain('accessibilityRole="radio"');
    expect(flat).toContain('accessibilityLabel={labels[scale]}');
    expect(flat).toContain(
      'accessibilityState={{ checked: scale === value, selected: scale === value, disabled, }}',
    );
    expect(component.split('<Pressable')).toHaveLength(2);
    expect(flat).toContain('{SCALE_STOPS.map(scale => ( <Pressable');
  });

  it('keeps the segmented control’s ids: <testID>.f and <testID>.c', () => {
    expect(flat).toContain('testID: `${testID}.${scale}`');
    expect(SCALE_STOPS).toEqual(['f', 'c']);
  });

  it('ignores a tap on the chosen scale, and is felt and arms the roll for the other', () => {
    expect(flat).toContain(
      "const current = scale === value; feelChoice({ locked: false, current, kind: 'tap' }); if (current) return; armed.current = { stop: scale, at: Date.now() }; onChange(scale);",
    );
    expect(flat).toContain('onPress={() => choose(scale)}');
    expect(component).toContain("import { feelChoice } from '../feedback/choice';");
    // once, in the press handler — never again as the chip slides or the wheels roll
    expect(flat.split('feelChoice(')).toHaveLength(2);
    expect(flat).not.toContain('haptic(');
    // armed only there: a scale that arrives without a tap is set, never rolled
    expect(flat.split('armed.current = {')).toHaveLength(2);
    expect(flat).toContain(
      'const tapped = tap !== null && tap.stop === value && now - tap.at <= TAP_WINDOW_MS;',
    );
  });

  it('hides both drawings — the glass and the pair — from touch and from assistive technology', () => {
    expect(
      flat.match(
        /pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden/g,
      ),
    ).toHaveLength(2);
  });

  it('draws the scale that is read in the full ink and the bold face, the other in the quiet ink', () => {
    expect(flat).toContain("variant={read ? 'statValue' : 'body'} numeric");
    expect(flat).toContain('read ? pic.ink : pic.quiet');
    expect(flat).toContain('{SCALE_STOPS.flatMap(scale => [row(scale, false), row(scale, true)])}');
    // the pair is the segmented control's own colors
    expect(flat).toContain('color={read ? t.color.text : t.color.text2}');
    expect(flat).toContain('backgroundColor: t.color.surface2');
    expect(flat).toContain('backgroundColor: t.color.surfaceSolid');
  });

  it('runs every frame on the native driver: opacity and transforms only', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    const fed = [...flat.matchAll(/(\w+): (?:num\(|Animated\.(?:add|multiply)\()/g)].map(m => m[1]);
    expect(fed.length).toBeGreaterThan(0);
    for (const prop of fed) expect(['opacity', 'translateX', 'translateY'], prop).toContain(prop);
    expect(flat).toContain('const drawn: AnimatedStyle[] = lit.map(l => ({ opacity: l }));');
  });

  it('asks for nothing Expo Go does not carry: React Native, react-native-svg, and its own files', () => {
    const imports = [...component.matchAll(/from '([^']+)'/g)].map(m => m[1]);
    for (const source of imports)
      expect(
        ['react', 'react-native', 'react-native-svg', '@nibblecue/core'].includes(source ?? '') ||
          /^\./.test(source ?? ''),
        source,
      ).toBe(true);
    expect(component).toContain("import type { TempUnit } from '@nibblecue/core';");
  });

  it('writes no color and no symbol of its own: the picture’s colors, the theme’s, the caller’s labels', () => {
    for (const src of [component, pure]) {
      expect(src).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
      expect(src).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
      expect(src).not.toMatch(/['"`]°[FC]['"`]/);
    }
    expect(flat).toContain('borderColor: t.color.line2');
    expect(flat).toContain('allowFontScaling={false}');
  });

  it('is exported with the design system’s other controls, and its arithmetic is not', () => {
    expect(read('core.ts')).toContain("export * from './ThermometerToggle';");
    expect(read('core.ts')).not.toContain("'./thermometerToggle'");
  });
});
