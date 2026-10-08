/**
 * WHEN A RUNNING PUMP ENDED (`pumpEnd.ts`, `PumpEndedRow.tsx`; the owner, 2026-10-03). The start is
 * chosen before the timer starts. Stopping one asks when it ended: Just now, already chosen, then
 * 5 min ago, 15 min ago and Earlier. An offset is placed at the tap. Four chips fit one line on a
 * 360 dp phone, the same sum the start row is held to (`startedRow.test.ts`).
 */
import { hit, space, type as typeScale } from '@nibblecue/ui/theme';
import { describe, expect, it } from 'vitest';
import { shippedFace } from '../../testing/ttf';
import { PUMP_ENDED } from './copy';
import {
  PUMP_END_CHOICES,
  PUMP_END_OFFSET_MIN,
  pumpEndOffset,
  type PumpEndChoice,
} from './pumpEnd';

const MIN = 60_000;

describe('an end offset is placed when it is tapped', () => {
  const tap = Date.UTC(2026, 9, 3, 21, 41);

  it('counts five, fifteen and thirty back from the tap, and nowhere else', () => {
    expect(PUMP_END_OFFSET_MIN).toEqual({ m5: 5, m15: 15, m30: 30 });
    expect(pumpEndOffset('m30', tap)).toBe(tap - 30 * MIN);
    expect(pumpEndOffset('m5', tap)).toBe(tap - 5 * MIN);
    expect(pumpEndOffset('m15', tap)).toBe(tap - 15 * MIN);
    // a second reading of the same tap is the same instant: the sheet sitting open does not move it
    expect(pumpEndOffset('m15', tap)).toBe(pumpEndOffset('m15', tap));
  });

  it('is not the start row’s ten', () => {
    expect(PUMP_END_CHOICES).toEqual(['now', 'm5', 'm15', 'm30', 'earlier']);
    expect(PUMP_END_CHOICES.map(c => PUMP_ENDED.choice[c])).toEqual([
      'Now',
      '\u22125m',
      '\u221215m',
      '\u221230m',
      'Custom',
    ]);
  });
});

describe('four end chips fit one line on a 390-wide phone', () => {
  const regular = shippedFace('hankenRegular');
  const bold = shippedFace('hankenBold');
  const words = typeScale.bodySm.fontSize;
  const EDGE = 1;
  const CHECK = 12;
  const PRESET_PAD_X = 9;
  // the handoff's ordinary phone (2026-10-06): 390 wide. Narrower, the preset row wraps as a group
  const body = 390 - 2 * space.xxl;

  /** A `preset` chip, as Chip.tsx draws one (2026-10-06): its edge, 9 of air each side, the check when chosen, the words. */
  const chipWidth = (label: string, selected: boolean): number => {
    const text = (selected ? bold(label) : regular(label)) * words;
    const check = selected ? CHECK + space.xs : 0;
    return Math.max(hit.min, 2 * EDGE + 2 * (PRESET_PAD_X - EDGE) + check + text);
  };

  it.each(PUMP_END_CHOICES.map(c => [c] as const))(
    'the row, with %s chosen',
    (chosen: PumpEndChoice) => {
      const width =
        PUMP_END_CHOICES.reduce(
          (sum, c) => sum + chipWidth(PUMP_ENDED.choice[c], c === chosen),
          0,
        ) +
        (PUMP_END_CHOICES.length - 1) * space.sm;
      expect(width).toBeLessThanOrEqual(body);
    },
  );
});

// (CuddleCue's running panel, which draws the pump's end chips, is not in NibbleCue: its wiring checks went with it.)
