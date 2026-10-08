/**
 * EVERY SHEET AND POPOVER COUNTS ITSELF WHILE IT IS UP (2026-09-28), so what must never rise over
 * one (the celebration sheet) can ask one number instead of every screen remembering to report.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { noteSheetUp, sheetsUpNow, SheetToastContext } from './sheetsUp';

const here = dirname(fileURLToPath(import.meta.url));
const flat = (file: string): string =>
  readFileSync(join(here, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

describe('the count', () => {
  it('goes up while a sheet is up and down when it goes, and a second goodbye changes nothing', () => {
    const before = sheetsUpNow();
    const a = noteSheetUp();
    const b = noteSheetUp();
    expect(sheetsUpNow()).toBe(before + 2);
    a();
    a();
    expect(sheetsUpNow()).toBe(before + 1);
    b();
    expect(sheetsUpNow()).toBe(before);
  });
});

describe('who counts', () => {
  it('is every bottom sheet and every popover, from `visible` to `visible`', () => {
    expect(flat('Popover.tsx')).toContain(
      'useEffect(() => (visible ? noteSheetUp() : undefined), [visible]);',
    );
    // a sheet comes up with a key of its own, so the one in front can draw the toast over itself
    expect(flat('BottomSheet.tsx')).toContain(
      'useEffect(() => (visible ? noteSheetUp(sheetKey) : undefined), [visible, sheetKey]);',
    );
  });
});

describe('the toast over the sheet in front', () => {
  it('is handed to the sheet in front, which draws it over itself', () => {
    expect(SheetToastContext).toBeDefined();
    const sheet = flat('BottomSheet.tsx');
    expect(sheet).toContain('const inFront = useFrontSheet() === sheetKey;');
    expect(sheet).toContain('{inFront && sheetToast !== null ? (');
  });
});
