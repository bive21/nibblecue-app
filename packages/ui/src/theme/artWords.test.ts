/**
 * THE BOXES THE RENDERER READS THE OWNER'S PICTURES UNDER ARE THE CARD'S OWN (2026-09-27).
 *
 * `artWords.ts` restates a running card's geometry so a node script can read it without the rest of
 * the design system; the type-only imports there hold it to the card's and the stop pill's own
 * constants, and this holds it to the theme — and holds the layout to the heights Today budgets for
 * (`apps/mobile/src/screens/today/layout.ts`), so the card the renderer measures is the card a
 * parent sees.
 */
import { describe, expect, it } from 'vitest';
import { formatElapsed, TIMER_STOP_CAPTION, timerTotalsLine } from '../components/timeFormat';
import {
  ART_WORD_PHONES,
  ART_WORD_SAMPLE,
  ART_WORD_TIMERS,
  ART_WORDS,
  artWordCard,
  type ArtWordLine,
} from './artWords';
import { space, type } from './theme';

/** Today's line boxes at 1× type, as `layout.ts` budgets them: h2 23, display 31, meta 16. */
const H2 = 23;
const META = 16;
const plain: ArtWordLine[] = [
  { name: 'title', width: 80, height: H2 },
  { name: 'numeral', width: 130, height: ART_WORDS.numeral.line },
  { name: 'started', width: 100, height: META },
];
const feed: ArtWordLine[] = [
  { name: 'title', width: 120, height: H2 },
  { name: 'numeral', width: 130, height: ART_WORDS.numeral.line },
  { name: 'totals', width: 140, height: META },
  { name: 'started', width: 100, height: META },
];
const caption = { width: 50, chars: 7 };

describe('the running card, as the renderer lays it out', () => {
  it('restates the theme exactly', () => {
    expect(ART_WORDS.gutter).toBe(space.xxl);
    expect(ART_WORDS.inset).toBe(space.lg);
    expect(ART_WORDS.beside).toBe(space.md);
    expect(ART_WORDS.between).toBe(space.xs);
    expect(ART_WORDS.aboveRow).toBe(space.sm);
    expect(ART_WORDS.rowGap).toBe(space.md);
    expect(ART_WORDS.stop).toMatchObject({
      side: space.xl,
      space: space.sm,
      size: type.bodySm.fontSize,
      face: type.bodySm.fontFamily,
    });
    // weight 600 over the Regular face: measured in the Bold, the wider a platform may draw
    expect(ART_WORDS.switch).toMatchObject({
      side: space.xl,
      space: space.sm,
      size: type.bodySm.fontSize,
      face: type.bodyStrong.fontFamily,
    });
    expect(ART_WORDS.title).toEqual({ size: type.h2.fontSize, face: type.h2.fontFamily });
    // the card holds the elapsed's line to its size (`TimerCard`: the prototype's line-height 1)
    expect(ART_WORDS.numeral).toEqual({
      size: type.display.fontSize,
      face: type.display.fontFamily,
      line: type.display.fontSize,
    });
    // `Numeric` at `meta` sets the totals in the numeric face, not the meta one
    expect(ART_WORDS.totals).toEqual({ size: type.meta.fontSize, face: type.numeric.fontFamily });
    expect(ART_WORDS.started).toEqual({ size: type.meta.fontSize, face: type.meta.fontFamily });
  });

  it('is the height Today budgets for: 100 for a timer, 160 for a feed with its switch row', () => {
    expect(artWordCard({ phone: 390, caption, lines: plain }).height).toBe(100);
    const withRow = artWordCard({
      phone: 390,
      caption,
      lines: feed,
      switchWords: { width: 90, height: 17 },
    });
    expect(withRow.height).toBe(160);
  });

  it('is a row taller where the pause disc will not fit beside the switch', () => {
    const at = (phone: number) =>
      artWordCard({ phone, caption, lines: feed, switchWords: { width: 90, height: 17 } });
    // the switch is 14 + 16 + 6 + 90 + 14 = 140, then 8 and the 44 disc: 192 of column
    expect(at(430).column).toBeGreaterThan(192);
    expect(at(430).height).toBe(160);
    expect(at(320).column).toBeLessThan(192);
    expect(at(320).height).toBe(160 + ART_WORDS.row + ART_WORDS.rowGap);
  });

  it('cuts the title at the column, and wraps every other line there a row at a time', () => {
    const card = artWordCard({
      phone: 360,
      caption,
      lines: [
        { name: 'title', width: 400, height: H2 },
        { name: 'numeral', width: 130, height: ART_WORDS.numeral.line },
        { name: 'started', width: 250, height: META },
      ],
    });
    const [title, numeral, started] = card.boxes;
    const edge = ART_WORDS.inset + card.column;
    expect(title).toMatchObject({ x1: edge, y1: ART_WORDS.inset + H2 });
    expect(numeral?.x1).toBe(ART_WORDS.inset + 130);
    expect(started?.x1).toBe(edge);
    expect((started?.y1 ?? 0) - (started?.y0 ?? 0)).toBe(2 * META);
    expect(card.height).toBe(100 + META);
  });

  it('never lets a box past the column the stop pill leaves, on any phone', () => {
    for (let phone = ART_WORD_PHONES.from; phone <= ART_WORD_PHONES.to; phone += 1) {
      const card = artWordCard({
        phone,
        caption,
        lines: feed.map(l => ({ ...l, width: l.width * 3 })),
        switchWords: { width: 90, height: 17 },
      });
      const stop =
        2 * ART_WORDS.stop.side +
        ART_WORDS.stop.mark +
        ART_WORDS.stop.space +
        caption.width +
        ART_WORDS.stop.tracking * caption.chars;
      expect(card.width).toBe(phone - 2 * space.xxl);
      expect(card.column).toBeCloseTo(card.width - 2 * space.lg - stop - space.md, 9);
      for (const box of card.boxes)
        expect(box.x1, `${phone}: ${box.name}`).toBeLessThanOrEqual(
          ART_WORDS.inset + card.column + 1e-9,
        );
    }
  });

  it('puts the switch’s words on the pill’s ink, and every other line on the picture', () => {
    const card = artWordCard({
      phone: 390,
      caption,
      lines: feed,
      switchWords: { width: 90, height: 17 },
    });
    expect(card.boxes.map(b => [b.name, b.fill])).toEqual([
      ['title', 0],
      ['numeral', 0],
      ['totals', 0],
      ['started', 0],
      ['switch', ART_WORDS.switch.fill],
    ]);
  });
});

describe('what it is measured with', () => {
  it('is every running timer, since every one of them draws a picture', () => {
    // every timer has a stop caption; the stack's order of kinds, which this read until 2026-09-27,
    // is gone (the timers are in the order they were started)
    expect([...ART_WORD_TIMERS].sort()).toEqual(Object.keys(TIMER_STOP_CAPTION).sort());
  });

  it('writes the longest elapsed the card draws under a hundred hours', () => {
    const longest = formatElapsed(ART_WORD_SAMPLE.elapsedMs, 'live');
    expect(longest).toBe('12m 05s');
    for (const ms of [
      5_000,
      9 * 60_000 + 59_000,
      59 * 60_000 + 59_000,
      99 * 3_600_000 + 59 * 60_000,
    ])
      expect(formatElapsed(ms, 'live').length).toBeLessThanOrEqual(longest.length);
  });

  it('ends a feed’s totals on its longest word, and names a twelve-letter name', () => {
    const { sides } = ART_WORD_SAMPLE;
    const line = timerTotalsLine(sides, sides.active);
    expect(line).toBe('L 12m · R 18m · on right');
    for (const other of ['left', null] as const)
      expect(timerTotalsLine(sides, other).length).toBeLessThanOrEqual(line.length);
    expect(ART_WORD_SAMPLE.name).toHaveLength(12);
  });
});
