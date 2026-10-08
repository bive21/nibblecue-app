/**
 * THE TIME ROW IS ONE ROW (the owner, 2026-09-26: *"the options should show in 1 row, 'Now',
 * '~15 min', '~30 min' 'Custom' then the actual hour"*; and of the pump's finished form: *"they're
 * not on the same row"*).
 *
 * No renderer here, so two kinds of check: the source says what the row is made of, and the sum
 * says it fits. The sum is made the way `diaperToggle.test.ts` makes its own — the chips' words
 * measured in the faces the app ships, read out of their TTFs (Hanken Grotesk Regular, and Bold
 * for the selected chip's words; IBM Plex Mono, 0.6 em a figure, for the clock) — and each chip
 * as Chip.tsx draws a `compact` one.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hit, space } from '../theme/theme';
import { LONG_CLEAR, SLOT_EDGE, slotWordsFit } from './slotFit';
import { PRESET_LABELS, PRESET_LONG_LABELS, PRESETS, type Preset } from './timePresets';

const here = dirname(fileURLToPath(import.meta.url));
const code = (f: string): string =>
  readFileSync(join(here, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ');

describe('the row, read off the source', () => {
  const src = code('TimeRow.tsx');
  const slots = code('SlotRow.tsx');

  it('draws the four presets on the shared equal-slot row, with a sentence for a screen reader', () => {
    expect(src).toContain('<SlotRow');
    expect(src).toContain('options={PRESETS.map(p => ({');
    expect(src).toContain('label: PRESET_LABELS[p],');
    expect(src).toContain('accessibilityLabel: `${name}, ${PRESET_SPOKEN[p].toLowerCase()}`,');
    expect(src).not.toContain('<Chip');
  });

  it('says its name on the left and its answer on the right, as words: Custom is the one door', () => {
    expect(src).toContain('{`${dayWord(value, now, timeZone)} · ${clock}`}');
    // the owner, 2026-10-06: the time and the Custom chip did the same thing; Custom is kept
    expect(src).not.toContain('onPress={custom}');
    expect(src).not.toContain('<Pressable');
    expect(src).toContain('accessibilityLabel={`${name}, ${clock}`}');
    // the pump says its time beside the Duration instead
    expect(src).toContain("const showClock = layout !== 'inline' || clockUnder;");
  });

  it('calls onPreset then onCustom for custom, and only onPreset for the others', () => {
    expect(src).toContain("onPreset('custom', resolvePreset('custom', now, value));");
    expect(src).toContain('onCustom?.();');
    expect(src).toContain(
      "onChange={p => (p === 'custom' ? custom() : onPreset(p, resolvePreset(p, now)))}",
    );
  });

  it('gives every slot the same share of the row, and changes only colors when one is chosen', () => {
    expect(slots).toContain('flexGrow: 1,');
    expect(slots).toContain('flexBasis: 0,');
    expect(slots).toContain('minWidth: 0,');
    // one border in every state; no check, no bold, no size that depends on the state
    expect(slots).toContain('borderWidth: EDGE,');
    expect(slots).not.toContain('name="check"');
    expect(slots).not.toContain('bodyStrong');
    expect(slots).toContain('backgroundColor: on ? paint.on : paint.rest,');
    // a timer's chips wear its module's colors, measured in `slotRow.test.ts`
    expect(slots).toContain('moduleSlotPaint(t.color, module, t.theme)');
    expect(slots).toContain('accessibilityState={{ checked: on, selected: on, disabled: off }}');
  });
});

describe('the compact chip keeps its reach', () => {
  const chip = code('Chip.tsx');

  it('is the small pill, 28 tall, reaching 44 through its slop and never narrower than 44', () => {
    expect(chip).toContain('const small = smallAsked || compact;');
    expect(chip).toContain('minWidth: t.hit.min - 2 * EDGE,');
    expect(chip).toContain('const slop = Math.max(0, Math.ceil((t.hit.min - height) / 2));');
    expect(hit.min).toBe(44);
  });

  it('only takes in the air beside the words and between the check and the words', () => {
    expect(chip).toContain('? t.space.sm');
    expect(chip).toContain('gap: bare ? 0 : compact ? t.space.xs : t.space.sm,');
  });

  it('still says selected with the check and the bold face, never color alone', () => {
    expect(chip).toContain('<Icon name="check" size={glyph} color={ink} />');
    expect(chip).toContain("variant={selected ? 'bodyStrong' : 'bodySm'}");
  });
});

/**
 * EVERY WORD FITS ITS SLOT AT 320 DP (the owner's handoff, 2026-10-06: "every label fits on one
 * line across 320/360/390/430dp"). The row is the sheet's body less nothing: four equal slots of
 * `(body − 3 × 8) / 4`, each with a 1-point edge and 2 of air either side of its words, measured in
 * the face the app ships (Hanken Grotesk Regular, at the slot's 14).
 */
describe('the four words fit their equal slots from 320 dp up', () => {
  const ems: Record<Preset, number> = { now: 2.001, m15: 2.508, m30: 2.508, custom: 3.472 };
  const SIZE = 14;
  const needs = (p: Preset) => 2 * 1 + 2 * 2 + ems[p] * SIZE;

  it('measures the words it was measured for', () => {
    expect(PRESETS.map(p => PRESET_LABELS[p])).toEqual(['Now', '\u221215m', '\u221230m', 'Custom']);
  });

  it.each([320, 360, 390, 430])('at %i', width => {
    const body = width - 2 * space.xxl;
    const slot = (body - 3 * 8) / 4;
    for (const p of PRESETS) expect(needs(p), p).toBeLessThanOrEqual(slot);
  });
});

/**
 * LONG WORDS WHERE THERE IS ROOM (the owner, 2026-10-08: "when there is clear space for the text,
 * show -5 min, -15 min, -30 min, and custom instead. Keep it short if it does not fit. This applies
 * to all modules"). The row measures itself and each long word on the phone, then decides with
 * `slotWordsFit`, one spelling for the whole row.
 */
describe('the time row spells its minutes out where every slot holds them', () => {
  const src = code('TimeRow.tsx');
  const slots = code('SlotRow.tsx');

  it('hands the long words to the row, and the screen reader still hears whole words', () => {
    expect(PRESETS.map(p => PRESET_LONG_LABELS[p])).toEqual([
      'Now',
      '−15 min',
      '−30 min',
      'Custom',
    ]);
    expect(src).toContain('longLabel: PRESET_LONG_LABELS[p],');
    expect(src).toContain('accessibilityLabel: `${name}, ${PRESET_SPOKEN[p].toLowerCase()}`,');
  });

  it('measures the row and each long word, hidden from touch and a screen reader', () => {
    expect(slots).toContain('onLayout: onRowLayout');
    expect(slots).toContain("<View key={o.value} onLayout={measured(o.longLabel ?? '')}");
    expect(slots).toContain(
      'pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants"',
    );
    expect(slots).toContain('{long && o.longLabel !== undefined ? o.longLabel : o.label}');
  });

  it('decides from the measured widths, all or nothing, and keeps the long words until measured', () => {
    const base = { perLine: 4, gap: 8, air: 2 };
    // a 354-point body (390 wide): slots of 82.5, room 82.5 − 2 − 4 − LONG_CLEAR
    const room = (354 - 3 * 8) / 4 - 2 * SLOT_EDGE - 2 * 2 - LONG_CLEAR;
    expect(slotWordsFit({ ...base, rowWidth: 354, wordWidths: [40, room] })).toBe(true);
    expect(slotWordsFit({ ...base, rowWidth: 354, wordWidths: [40, room + 0.5] })).toBe(false);
    // not measured yet: the long words, the likelier answer at an ordinary width
    expect(slotWordsFit({ ...base, rowWidth: null, wordWidths: [500] })).toBe(true);
    expect(slotWordsFit({ ...base, rowWidth: 354, wordWidths: [40, null] })).toBe(true);
    // two to a line at a large text size have twice the room
    expect(slotWordsFit({ ...base, perLine: 2, rowWidth: 284, wordWidths: [120] })).toBe(true);
  });
});
