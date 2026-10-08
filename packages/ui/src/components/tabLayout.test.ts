import { describe, expect, it } from 'vitest';
import type { TabLabelPolicy } from '../theme/appearance';
import { hit } from '../theme/theme';
import {
  estimateLabelWidth,
  FAB_GAP,
  FAB_SIZE,
  GLYPH_WIDTH_EM,
  TAB_BAR_INSET,
  TAB_BAR_PADDING,
  TAB_KEYS,
  TAB_BAR_MAX_CELLS,
  TAB_LABEL_MIN,
  TAB_LABELS,
  TAB_TYPE,
  tabLayout,
  tabBarHeight,
  tabDotClearance,
  TAB_CELL_PAD,
} from './tabLayout';

/**
 * The five the bar draws by default (TAB_BAR_MAX_CELLS), in bar order. Reports moved into More and
 * Community is feature-flagged, so the eight-character labels — "Shopping" and "Schedule" — are
 * what decide the fit here.
 *
 * Every cell the bar draws is labelled (`tabItems`), so this row IS the drawn one, with the
 * longest names the seven destinations have.
 */
const LABELS = ['Today', 'Stash', 'Shopping', 'Schedule', 'Reports', 'More'];
/** The index of the label that decides the fit when it is the current tab. */
const WIDEST = LABELS.indexOf('Schedule');
/**
 * Every set the bar could draw, so no combination of the six overflows — at the MAXIMUM count
 * and at one below it, because the cells are no longer all the same width. A five-cell bar is
 * three cells to the left of the log button and two to its right (`leftCellCount`), so the
 * left-hand three are the narrowest cells the bar ever draws and are what a label has to fit.
 */
const combos = (keys: readonly string[], k: number): string[][] =>
  k === 0 ? [[]] : keys.flatMap((x, i) => combos(keys.slice(i + 1), k - 1).map(c => [x, ...c]));
const setsOf = (k: number): string[][] =>
  combos(TAB_KEYS, k).map(ks => ks.map(k2 => TAB_LABELS[k2 as keyof typeof TAB_LABELS]));
const SETS = [...setsOf(TAB_BAR_MAX_CELLS), ...setsOf(TAB_BAR_MAX_CELLS - 1)];
const POLICIES: TabLabelPolicy[] = ['icons', 'focus', 'rounded'];
const WIDTHS = [375, 430];
const SCALES = [1, 1.6];

describe('tabLayout — the WP3 acceptance test: no tab label overflows its cell', () => {
  for (const policy of POLICIES) {
    for (const width of WIDTHS) {
      for (const scale of SCALES) {
        it(`${policy} at ${width}px, font scale ${scale}: every cell fits, readably, for every current tab`, () => {
          for (let current = 0; current < LABELS.length; current++) {
            const { cells } = tabLayout(LABELS, width, policy, scale, current);
            expect(cells).toHaveLength(LABELS.length);
            for (const cell of cells) {
              expect(cell.overflow).toBe(false);
              expect(estimateLabelWidth(cell.label, cell.fontSize)).toBeLessThanOrEqual(cell.width);
              // a drawn label is never below the floor, and never above what the policy asked for
              if (cell.nominalFontSize > 0) {
                expect(cell.fontSize).toBeGreaterThanOrEqual(
                  Math.min(TAB_LABEL_MIN, cell.nominalFontSize),
                );
                expect(cell.fontSize).toBeLessThanOrEqual(cell.nominalFontSize);
              }
            }
          }
        });
      }
    }
  }

  /**
   * A REDUCTION IS EXPLICIT, NEVER SILENT, and at six labelled cells there is one. Six cells
   * share what four used to, so "Shopping" and "Schedule" come down a step even at 430 — which
   * is the fit doing its job, not a defect. What must hold is that the drop is reported
   * (`fitted`, and the row's `fit`), that it is the same factor for every label, and that
   * nothing lands under the readable floor. The bar's DEFAULT policy is `icons`, which draws no
   * label at all and is why six cells read as a comfortable row rather than a crowded one.
   */
  it('reports every reduction rather than shrinking a label quietly', () => {
    for (const policy of POLICIES) {
      for (let current = 0; current < LABELS.length; current++) {
        const { cells, fit } = tabLayout(LABELS, 430, policy, 1, current);
        cells.forEach((c, i) => {
          const spec = i === current ? TAB_TYPE[policy].current : TAB_TYPE[policy].rest;
          expect(c.nominalFontSize).toBe(spec.size);
          expect(c.weight).toBe(spec.weight);
          expect(c.fitted).toBe(c.fontSize < c.nominalFontSize);
          if (c.nominalFontSize > 0) expect(c.fontSize).toBeGreaterThanOrEqual(TAB_LABEL_MIN);
        });
        // icons draw no label, so there is nothing to reduce and the factor stays 1
        if (policy === 'icons') expect(fit).toBe(1);
      }
    }
  });

  it('a four-cell bar still draws every label at the size its policy asks for', () => {
    // the reduction above is the price of SIX names, not of the arithmetic: drop to four — a
    // household with no stash and no Community — and nothing is fitted at either width
    const four = ['Today', 'Shopping', 'Schedule', 'More'];
    for (const width of WIDTHS) {
      for (let current = 0; current < four.length; current++) {
        const { cells, fit } = tabLayout(four, width, 'focus', 1, current);
        expect(fit, `${width}`).toBe(1);
        cells.forEach(c => expect(c.fitted).toBe(false));
      }
    }
  });
});

describe('tabLayout — geometry', () => {
  it('divides the bar equally, after the inset and the padding', () => {
    const { cells, fabWidth, cellWidth, innerWidth } = tabLayout(LABELS, 430, 'focus', 1, 0);
    // the layout reports the button's own size rather than a number typed twice; what matters
    // about the size itself is the floor below, not which value it currently is
    expect(fabWidth).toBe(FAB_SIZE);
    expect(innerWidth).toBe(430 - 2 * TAB_BAR_INSET - 2 * TAB_BAR_PADDING);
    // THE BUTTON TAKES NO ROOM IN THE ROW: it stands above the bar (tabLayout.ts), so the
    // cells share the whole of it and every glyph sits on the same pitch
    expect(cellWidth).toBeCloseTo(innerWidth / LABELS.length, 6);
    for (const c of cells) expect(c.width).toBeCloseTo(innerWidth / LABELS.length, 6);
    // and the button clears the bar rather than being cut into it
    expect(FAB_GAP).toBeGreaterThan(0);
    /*
      IT NEVER GOES UNDER THE MINIMUM TAP TARGET. It went from 48 to 44 so a screen's own
      floating action could share the corner with it (the owner, 2026-09-19: "make the + quick
      log button smaller and add supplies higher, so they dont clash"), and 44 is the floor —
      `hit.min`, the rule every control in this app is held to (CLAUDE.md §6). This is the
      assertion that stops the next trim going past it.
    */
    expect(FAB_SIZE).toBeGreaterThanOrEqual(hit.min);
  });

  it('never goes negative on a width too small for the bar', () => {
    const { cells } = tabLayout(LABELS, 40, 'focus', 1, 0);
    for (const c of cells) {
      expect(c.width).toBe(0);
      // and says so: a cell with no room is an overflow, not a hidden label
      expect(c.overflow).toBe(true);
    }
  });

  it('handles no labels and an out-of-range current index without throwing', () => {
    expect(tabLayout([], 375, 'focus', 1, 0).cells).toEqual([]);
    expect(tabLayout([], 375, 'focus', 1, 0).fit).toBe(1);
    const { cells } = tabLayout(LABELS, 375, 'focus', 1, 9);
    for (const c of cells) expect(c.weight).toBe(600);
  });

  it('estimates width as characters × size × the documented average glyph width', () => {
    expect(estimateLabelWidth('Today', 10)).toBeCloseTo(5 * 10 * GLYPH_WIDTH_EM, 6);
    // code points, not UTF-16 units: an emoji is one character wide, not two
    expect(estimateLabelWidth('👶', 10)).toBeCloseTo(GLYPH_WIDTH_EM * 10, 6);
  });

  it('an unlabelled cell costs nothing: an empty label never sets the row’s fit', () => {
    // nothing in the app passes one any more, but the arithmetic must not divide by a
    // zero-width label if a caller ever does
    const drawn = ['Today', 'Stash', 'Schedule', ''];
    const { cells, fit } = tabLayout(drawn, 375, 'focus', 1, 2);
    expect(fit).toBe(1);
    expect(cells[3]!.overflow).toBe(false);
    expect(cells[3]!.width).toBeCloseTo(cells[0]!.width, 6);
  });
});

describe('tabLayout — the three policies choose the label and nothing else', () => {
  it('icons: font size 0 for every cell, at every width and scale', () => {
    for (const width of WIDTHS) {
      for (const scale of SCALES) {
        const { cells, fit } = tabLayout(LABELS, width, 'icons', scale, 2);
        expect(fit).toBe(1);
        for (const c of cells) {
          expect(c.fontSize).toBe(0);
          expect(c.nominalFontSize).toBe(0);
          expect(c.fitted).toBe(false);
          expect(c.overflow).toBe(false);
        }
      }
    }
  });

  it('focus: the current cell is 11.5/800, the others 9.5/600', () => {
    for (let current = 0; current < LABELS.length; current++) {
      const { cells } = tabLayout(LABELS, 430, 'focus', 1, current);
      cells.forEach((c, i) => {
        if (i === current) {
          expect(c.fontSize).toBe(11.5);
          expect(c.weight).toBe(800);
        } else {
          expect(c.fontSize).toBe(9.5);
          expect(c.weight).toBe(600);
        }
      });
    }
  });

  it('focus at 375: six cells no longer call on the fit, and the OS scale still does', () => {
    // 331px over six cells is 55.2 each, because the log button is no longer in the row — it
    // was 46.5 when the button split the bar, and an eight-character label as the CURRENT tab
    // ("Shopping" at 11.5 estimates 51.5) had to come down a step. It fits now.
    for (let current = 0; current < LABELS.length; current++) {
      const layout = tabLayout(LABELS, 375, 'focus', 1, current);
      expect(layout.fit, `current=${LABELS[current]}`).toBe(1);
      layout.cells.forEach(c => {
        expect(c.fontSize).toBe(c.nominalFontSize);
        expect(c.overflow).toBe(false);
      });
    }

    const { cells, cellWidth, fit } = tabLayout(LABELS, 375, 'focus', 1.6, WIDEST);
    const widest = cells[WIDEST]!;
    expect(fit).toBeLessThan(1);
    expect(widest.fitted).toBe(true);
    expect(widest.nominalFontSize).toBeCloseTo(11.5 * 1.6, 9);
    expect(widest.weight).toBe(800);
    expect(estimateLabelWidth('Schedule', widest.fontSize)).toBeLessThanOrEqual(cellWidth);
    // the rest come down with it (one factor for the row), never below the floor, never above it
    cells
      .filter((_, i) => i !== WIDEST)
      .forEach(c => {
        expect(c.fontSize).toBeGreaterThanOrEqual(TAB_LABEL_MIN);
        expect(c.fontSize).toBeLessThan(widest.fontSize);
      });
  });

  it('rounded: every label the same size; the current one is heavier, never larger', () => {
    const { cells } = tabLayout(LABELS, 430, 'rounded', 1, 1);
    const sizes = new Set(cells.map(c => c.fontSize));
    expect(sizes.size).toBe(1);
    expect(cells[1]!.weight).toBe(800);
    cells.filter((_, i) => i !== 1).forEach(c => expect(c.weight).toBe(700));
  });

  it('scales with the OS up to the cap when there is room', () => {
    const { cells, fit } = tabLayout(['Today', 'More', 'Log', 'Cal', 'Day'], 430, 'focus', 1.6, 1);
    expect(fit).toBe(1);
    expect(cells[1]!.fontSize).toBeCloseTo(11.5 * 1.6, 9);
    expect(cells[0]!.fontSize).toBeCloseTo(9.5 * 1.6, 9);
  });

  it('honors an OS scale below 1: the label is drawn smaller than the floor, because the OS asked', () => {
    const { cells } = tabLayout(LABELS, 430, 'focus', 0.85, 0);
    expect(cells[1]!.fontSize).toBeCloseTo(9.5 * 0.85, 9);
    expect(cells[1]!.overflow).toBe(false);
  });
});

describe('tabLayout — the hierarchy survives the fit at every width and scale', () => {
  for (const width of WIDTHS) {
    for (const scale of SCALES) {
      it(`focus at ${width} × ${scale}: the current label is never smaller than an inactive one`, () => {
        for (let current = 0; current < LABELS.length; current++) {
          const { cells } = tabLayout(LABELS, width, 'focus', scale, current);
          const cur = cells[current]!;
          cells
            .filter((_, i) => i !== current)
            .forEach(c => {
              expect(c.fontSize).toBeLessThanOrEqual(cur.fontSize);
              // and strictly smaller unless both sit on the floor
              if (cur.fontSize > TAB_LABEL_MIN) expect(c.fontSize).toBeLessThan(cur.fontSize);
            });
        }
      });

      it(`rounded at ${width} × ${scale}: every tab labelled at the same size`, () => {
        for (let current = 0; current < LABELS.length; current++) {
          const { cells } = tabLayout(LABELS, width, 'rounded', scale, current);
          expect(new Set(cells.map(c => c.fontSize)).size).toBe(1);
        }
      });
    }
  }

  it('the case that inverted: 375 × 1.6 with the widest label current keeps it on top', () => {
    const { cells } = tabLayout(LABELS, 375, 'focus', 1.6, WIDEST);
    const widest = cells[WIDEST]!;
    // the current tab is never smaller than an inactive one, whatever the fit did to the row
    cells
      .filter((_, i) => i !== WIDEST)
      .forEach(c => expect(c.fontSize).toBeLessThan(widest.fontSize));
    expect(new Set(cells.filter((_, i) => i !== WIDEST).map(c => c.fontSize)).size).toBe(1);
    const at430 = tabLayout(LABELS, 430, 'focus', 1.6, WIDEST).cells;
    expect(at430[WIDEST]!.fontSize).toBeGreaterThan(at430[0]!.fontSize);
  });

  it('one factor for the row: every inactive label shares a size, and so does every rounded label', () => {
    const { cells, fit } = tabLayout(LABELS, 375, 'focus', 1.6, WIDEST);
    expect(fit).toBeLessThan(1);
    expect(new Set(cells.filter((_, i) => i !== WIDEST).map(c => c.fontSize)).size).toBe(1);
    for (const c of cells) expect(c.fitted).toBe(true);
    // a SHORT label as the current tab does not save the row: "Shopping" and "Schedule" are
    // still on it, and one factor covers the widest of them all
    expect(tabLayout(LABELS, 375, 'focus', 1.6, 0).fit).toBeLessThan(1);
  });
});

describe('tabLayout — a locale with longer words is flagged, not hidden', () => {
  it('flags overflow rather than shrinking a label below the floor', () => {
    const long = ['Heute', 'Zeitplan', 'Berichte', 'Gemeinschaftsforum', 'Mehr'];
    const { cells } = tabLayout(long, 375, 'focus', 1, 3);
    const c = cells[3]!;
    expect(c.fontSize).toBe(TAB_LABEL_MIN);
    expect(c.fitted).toBe(true);
    expect(c.overflow).toBe(true);
    // the rest of the bar is readable: on the floor, and inside their cells
    cells
      .filter((_, i) => i !== 3)
      .forEach(x => {
        expect(x.overflow).toBe(false);
        expect(x.fontSize).toBe(TAB_LABEL_MIN);
      });
  });
});

describe('the bar’s height and the dot (the prototype’s block 12040; the owner, 2026-09-15)', () => {
  it('icons only is shorter than a labelled bar: it carries no line of type', () => {
    expect(tabBarHeight('icons')).toBe(51);
    expect(tabBarHeight('focus')).toBe(69);
    expect(tabBarHeight('rounded')).toBe(66);
    expect(tabBarHeight('icons')).toBeLessThan(tabBarHeight('focus'));
  });
  it('the dot clears the label by 4 px under a labelled policy, the glyph by 1 under icons', () => {
    expect(tabDotClearance('focus')).toBe(4);
    expect(tabDotClearance('rounded')).toBe(4);
    expect(tabDotClearance('icons')).toBe(1);
    expect(TAB_CELL_PAD.focus.bottom).toBeGreaterThan(TAB_CELL_PAD.focus.top);
  });
});

describe('the bar draws at most six of the seven destinations', () => {
  /**
   * EVERY CELL THE SAME WIDTH, AT EVERY COUNT — which is what the bar reads as when it looks
   * right (the owner, 2026-09-16: "fix the menu bar on the bottom (today stash shopping),
   * redesign this as this looks very bad"). It could not be done while the log button sat in
   * the row: a button in the middle divides the bar in two, and two halves hold the same number
   * of cells only at an EVEN count, so five destinations gave three narrow cells and two wide
   * ones. The button stands above the bar now, and the row is simply divided.
   */
  it('gives every cell the same width whatever it holds, odd count or even', () => {
    for (const n of [3, 4, 5, 6]) {
      const { cells, cellWidth, innerWidth } = tabLayout(LABELS.slice(0, n), 375, 'icons', 1, 0);
      expect(cells).toHaveLength(n);
      for (const c of cells) expect(c.width, `${n} cells`).toBeCloseTo(cellWidth, 6);
      // and they fill the bar: no slack anywhere, so the outer cells reach its rim
      expect(cells.reduce((w, c) => w + c.width, 0)).toBeCloseTo(innerWidth, 6);
    }
  });

  it('gets WIDER cells than it had, because the button left the row', () => {
    const five = tabLayout(LABELS.slice(0, 5), 375, 'icons', 1, 0);
    // the old arithmetic: half of (inner − the button) shared by the fuller side's three cells
    const before = (five.innerWidth - (FAB_SIZE + 4)) / 2 / 3;
    expect(five.cellWidth).toBeGreaterThan(before);
  });

  it('and every set of them fits, readably, at both widths and both scales', () => {
    // NibbleCue's five destinations (Today, Plan, Foods, Shopping, More) are always all drawn,
    // under the bar's six-cell cap, so the one set the bar can draw is all five of them
    expect(TAB_KEYS).toHaveLength(5);
    expect(TAB_BAR_MAX_CELLS).toBe(6);
    expect(SETS).toHaveLength(1);
    for (const labels of SETS) {
      for (const policy of POLICIES) {
        for (const width of WIDTHS) {
          for (const scale of SCALES) {
            for (let current = 0; current < labels.length; current++) {
              const { cells } = tabLayout(labels, width, policy, scale, current);
              for (const cell of cells) {
                expect(cell.overflow, `${labels.join()} ${policy} ${width} ${scale}`).toBe(false);
                if (cell.nominalFontSize > 0)
                  expect(cell.fontSize).toBeGreaterThanOrEqual(TAB_LABEL_MIN);
              }
            }
          }
        }
      }
    }
  });
});
