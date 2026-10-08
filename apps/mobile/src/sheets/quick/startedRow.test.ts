/**
 * THE START ROW, READ OFF ITS SOURCE AND MEASURED IN THE FACES THE APP SHIPS (the owner, 2026-09-29:
 * *"make the ui look better than before for starting activities from starting before now"*;
 * `StartedRow.tsx`). No renderer runs in this suite, so two kinds of check, as `timeRow.test.ts`
 * makes for the time row: what the row is made of, and the sum that says it fits.
 *
 * WHY ONE LINE: the owner asked the time row every sheet has for its choices "in 1 row" (2026-09-26),
 * and a row of four small chips is that row's own anatomy. On a 360-wide phone the sheet leaves 324
 * points between its two 18-point gutters; four chips fit with any one of them chosen (its check and
 * bold face added), the clock rides on the eyebrow's line, and at a larger text size the row wraps
 * rather than clipping or scrolling. The line under the tiles — "Started earlier?" and three chips —
 * fits the same 324.
 */
import { LONG_CLEAR, slotWordsFit } from '@nibblecue/ui/slotFit';
import { space } from '@nibblecue/ui/theme';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { shippedFace } from '../../testing/ttf';
import { PUMP_ENDED, TIMER_START } from './copy';
import { START_CHOICES, START_SHORTCUTS } from './startWhen';

const here = dirname(fileURLToPath(import.meta.url));
/** Comments out, whitespace flattened: the file explains itself, and a scan must not read that. */
const code = (f: string): string =>
  readFileSync(join(here, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');
const row = code('StartedRow.tsx');

describe('the row, read off the source', () => {
  it('draws the five on the shared equal-slot row, with a sentence for a screen reader', () => {
    expect(row).toContain(
      '<SlotRow accessibilityLabel={TIMER_START.label} options={START_CHOICES.map(c => ({',
    );
    expect(row).toContain('label: TIMER_START.choice[c],');
    expect(row).toContain('accessibilityLabel: TIMER_START.spoken[c],');
    expect(row).toContain(
      "...(c === 'earlier' ? { accessibilityHint: 'Opens a time picker' } : {}),",
    );
    expect(row).toContain('value={choice}');
    expect(row).toContain('slotTestID={c => `${testID}-${c}`}');
  });

  it('says the time the chips come to beside its name, and names it for a screen reader', () => {
    const head = row.slice(row.indexOf('<Label>{TIMER_START.label}</Label>'));
    expect(head.indexOf('accessibilityLabel={`${TIMER_START.label}, ${clock}`}')).toBeGreaterThan(
      -1,
    );
    expect(row).toContain(
      "head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }",
    );
  });

  it('wraps at a large text size rather than clipping or scrolling', () => {
    expect(row).toContain("row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' }");
    expect(row).not.toContain('ScrollView');
    expect(row).not.toContain('numberOfLines');
  });

  it('puts the line under the tiles in the same words, each chip heard as one phrase', () => {
    expect(row).toContain('{TIMER_START.shortcut}');
    expect(row).toContain('options={START_SHORTCUTS.map(c => ({');
    expect(row).toContain(
      'accessibilityLabel: `${TIMER_START.label} ${TIMER_START.spoken[c].toLowerCase()}`,',
    );
    expect(`${TIMER_START.label} ${TIMER_START.spoken.m15.toLowerCase()}`).toBe(
      'Started 15 minutes ago',
    );
  });

  it('shows the count-up already running for a start earlier than the tap, and hides the ticking from a screen reader', () => {
    expect(row).toContain('{chosen !== null ? ( <StartPreview');
    expect(row).toContain("{formatElapsed(elapsedMs, 'clock')}");
    expect(row).toContain(
      '<View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">',
    );
    // the digits in the palette's `text`, which reads on every module's soft tint; the pill in the
    // module's own color, the glyph in its ink
    expect(row).toContain('<Surface radius="pill" tint={cat.soft} hue={cat.fg}');
    expect(row).toContain('<Icon name="play" size={12} color={cat.fg} />');
    expect(row).toContain('<Numeric variant="bodyStrong" ink="text"');
    // one clock a second where the digits are drawn, stopped while the sheet is not in front
    // (`useTimerNow`) — and only there: the row over it moves on the app's one minute clock
    expect(row).toContain('const elapsedMs = Math.max(0, useTimerNow(undefined) - startMs);');
    expect(row.split('useTimerNow(').length - 1).toBe(1);
    expect(row).toContain('const now = useMinuteTick({ onWrite: false });');
  });

  it('says a refusal as an alert, in words', () => {
    expect(row).toContain('<BodySm ink="text" accessibilityRole="alert" testID={testID}>');
    expect(row).toContain('{TIMER_START.tooEarly(durationLabel(limitMs))}');
  });
});

describe('five equal slots hold their words from 320 dp up, and so does the line under the tiles', () => {
  const regular = shippedFace('hankenRegular');
  // a SlotRow at its small size: 13 points, a 1-point edge and 2 of air each side, 6 between slots
  const SIZE = 13;
  const needs = (label: string) => 2 * 1 + 2 * 2 + regular(label) * SIZE;
  const slot = (width: number, count: number) => (width - 2 * space.xxl - (count - 1) * 6) / count;

  it('measures the words it was measured for', () => {
    expect(START_CHOICES.map(c => TIMER_START.choice[c])).toEqual([
      'Now',
      '\u22125m',
      '\u221215m',
      '\u221230m',
      'Custom',
    ]);
  });

  it.each([320, 360, 390, 430])('at %i', width => {
    for (const c of START_CHOICES)
      expect(needs(TIMER_START.choice[c]), c).toBeLessThanOrEqual(
        slot(width, START_CHOICES.length),
      );
    for (const c of START_SHORTCUTS)
      expect(needs(TIMER_START.choice[c]), c).toBeLessThanOrEqual(
        slot(width, START_SHORTCUTS.length),
      );
  });
});

/**
 * THE OWNER'S REPORT, 2026-10-08: "the button to start pump −30m does not work". A one-tap chip whose
 * start would be held at the end of the last entry of the kind is faded before the tap, and a line
 * says why (`shortcutHeld`, `startWhen.test.ts` does the arithmetic). The three sheets whose chip
 * starts at once hand in where each baby's last entry ended; a feed's chip opens its StartBlock,
 * which says the hold before its own Start, and hands in nothing.
 */
describe('a "Started earlier?" chip that would be held is faded, and said', () => {
  it('fades an offset the hold would move, never Custom, and says why under the row', () => {
    expect(row).toContain(
      'const floor = held === undefined ? null : shortcutFloor(held.lastEnds);',
    );
    expect(row).toContain(
      'const faded = (c: EarlierChoice) => isOffset(c) && shortcutHeld(c, floor, now);',
    );
    expect(row).toContain('...(faded(c) ? { disabled: true } : {}),');
    expect(row).toContain('{held !== undefined && floor !== null && anyFaded ? (');
    expect(row).toContain('{TIMER_START.heldShortcut(');
    expect(TIMER_START.heldShortcut('pump session', '9:21 PM', false)).toBe(
      'The last pump session ended at 9:21 PM, so a start can\u2019t be earlier than that.',
    );
  });

  // (CuddleCue's pump, sleep, tummy and breastfeed sheets hand the chips their last ends; none is
  // in NibbleCue)
});

/**
 * LONG WORDS WHERE THERE IS ROOM (the owner, 2026-10-08: "when there is clear space for the text,
 * show -5 min, -15 min, -30 min, and custom instead. Keep it short if it does not fit. This applies
 * to all modules"). `SlotRow` measures on the phone; here the same sum (`slotWordsFit`) is made in the
 * face the app ships, at the owner's 390-wide phone and at the narrow end.
 */
describe('the chips spell their minutes out where the row holds them', () => {
  const regular = shippedFace('hankenRegular');
  const SIZE = 13;
  const body = (width: number) => width - 2 * space.xxl;
  const fits = (width: number, words: readonly string[]) =>
    slotWordsFit({
      rowWidth: body(width),
      perLine: words.length,
      gap: 6,
      air: 2,
      wordWidths: words.map(w => regular(w) * SIZE),
    });

  it('has the long words, with the same true minus, and a screen reader still hears whole words', () => {
    expect(START_CHOICES.map(c => TIMER_START.choiceLong[c])).toEqual([
      'Now',
      '\u22125 min',
      '\u221215 min',
      '\u221230 min',
      'Custom',
    ]);
    expect(PUMP_ENDED.choiceLong).toEqual(TIMER_START.choiceLong);
    expect(row.split('longLabel: TIMER_START.choiceLong[c],').length - 1).toBe(2);
    expect(row.split('accessibilityLabel: TIMER_START.spoken[c],').length - 1).toBe(1);
    expect(code('PumpEndedRow.tsx')).toContain('longLabel: PUMP_ENDED.choiceLong[c],');
  });

  it('spells them out on the owner’s 390-wide phone: the four under the tiles and the five', () => {
    expect(
      fits(
        390,
        START_SHORTCUTS.map(c => TIMER_START.choiceLong[c]),
      ),
    ).toBe(true);
    expect(
      fits(
        390,
        START_CHOICES.map(c => TIMER_START.choiceLong[c]),
      ),
    ).toBe(true);
  });

  it('keeps them short where five slots cannot hold them with room to spare', () => {
    expect(
      fits(
        320,
        START_CHOICES.map(c => TIMER_START.choiceLong[c]),
      ),
    ).toBe(false);
    expect(LONG_CLEAR).toBeGreaterThan(0);
  });
});
