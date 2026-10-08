/**
 * THE SIX BOXES FIT (migration 0144): on every phone width the app supports, at every text size a
 * reader can pick, the row of boxes stays inside the sheet and every letter inside its box —
 * measured against the face the app ships, not a guess. Eight boxes (0140) floored at 28 pt on a
 * 320 pt phone and ran 6 pt past the sheet's margin; six are 38 pt there.
 */
import { INVITE_CODE_ALPHABET, INVITE_CODE_LENGTH } from '@nibblecue/core';
import { space, type as typeScale } from '@nibblecue/ui/theme';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { shippedFace } from '../testing/ttf';
import {
  BOX_EDGE,
  BOX_MAX,
  boxWidthFor,
  LETTER_EM,
  letterScaleCap,
  rowWidthFor,
} from './joinCodeBoxes';

/** Every phone width the app supports, and every text size a reader can pick (`summaryFit`). */
const PHONES = [320, 360, 375, 390, 393, 412, 414, 428, 430];
const OS_SCALES = [0.85, 1, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 2, 3.1];
const LETTER_SIZE = typeScale.statValue.fontSize;
const mono = shippedFace('monoSemiBold');
/** The widest capital the face sets, in em. */
const WIDEST = Math.max(...[...INVITE_CODE_ALPHABET].map(ch => mono(ch)));

describe('the code sheet’s six boxes', () => {
  it('are laid out for six, in two threes', () => {
    expect(INVITE_CODE_LENGTH).toBe(6);
    const sheet = readFileSync(
      fileURLToPath(new URL('./JoinCodeSheet.tsx', import.meta.url)),
      'utf8',
    );
    expect(sheet).toContain('const GROUP = INVITE_CODE_LENGTH / 2;');
    expect(sheet).toContain('const boxWidth = boxWidthFor(width, t.space);');
    expect(sheet).toContain(
      'maxFontSizeMultiplier={letterScaleCap(boxWidth, t.type.statValue.fontSize)}',
    );
    expect(sheet).toContain('borderWidth: BOX_EDGE');
  });

  it('fit the sheet on every phone: 38 pt each on a 320 pt phone, 46 from 375', () => {
    for (const phone of PHONES) {
      const box = boxWidthFor(phone, space);
      // the sheet's own gutter either side is all the room there is
      expect(rowWidthFor(box, space), `${phone} pt`).toBeLessThanOrEqual(phone - 2 * space.xxl);
    }
    expect(boxWidthFor(320, space)).toBe(38);
    expect(boxWidthFor(360, space)).toBe(45);
    expect(boxWidthFor(375, space)).toBe(BOX_MAX);
  });

  it('hold every letter at every text size, and never shrink one at the size most phones use', () => {
    // the face is monospaced: what the box is sized by is what the TTF says
    expect(WIDEST).toBeCloseTo(LETTER_EM, 3);
    for (const phone of PHONES) {
      const box = boxWidthFor(phone, space);
      const cap = letterScaleCap(box, LETTER_SIZE);
      expect(cap, `${phone} pt`).toBeGreaterThan(2);
      for (const os of OS_SCALES) {
        const drawn = Math.min(os, cap);
        expect(WIDEST * LETTER_SIZE * drawn, `${phone} pt at ×${os}`).toBeLessThanOrEqual(
          box - 2 * BOX_EDGE + 1e-9,
        );
      }
    }
    // the cap only ever bites on the narrowest phone at the very largest text
    expect(letterScaleCap(boxWidthFor(320, space), LETTER_SIZE)).toBeLessThan(3.1);
    for (const phone of PHONES.filter(p => p >= 360))
      expect(letterScaleCap(boxWidthFor(phone, space), LETTER_SIZE)).toBeGreaterThan(3.1);
  });
});

/*
  THE CODE IS SENT BY JOIN, NEVER BY ITS LAST LETTER, AND IS LOCKED ON ITS WAY (the owner,
  2026-10-08: "dont auto submit … so that users can still change if there is a typo, and when
  loading, block out the text field … so that the code cant be changed anymore while it's loading").
*/
describe('the code sheet sends on Join only, and locks while sending', () => {
  const sheet = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), 'JoinCodeSheet.tsx'),
    'utf8',
  );
  const onChange = sheet.slice(
    sheet.indexOf('const onChange = (raw: string)'),
    sheet.indexOf('const paste = async'),
  );
  const paste = sheet.slice(sheet.indexOf('const paste = async'), sheet.indexOf('// six boxes'));

  it('typing or pasting a code never sends it', () => {
    expect(onChange).not.toContain('submit(');
    expect(paste).not.toContain('submit(');
    expect(sheet).toContain('onPress={() => submit(code)}');
  });

  it('while a code is on its way the field and the boxes take nothing', () => {
    expect(onChange).toContain('if (busy) return;');
    expect(sheet).toContain('editable={!busy}');
    expect(sheet).toContain('disabled={busy}');
  });
});
