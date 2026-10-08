/**
 * THE TIME PICKER IS MOUNTED INSIDE THE SHEET THAT OPENS IT (the owner, 2026-09-29: in To-do,
 * after "Any time", "Pick a time" could not be tapped again).
 *
 * On iOS `useTimePicker`'s `element` is a Modal, and React Native presents a Modal from the view
 * controller its host view sits in (`UIView+React` `reactViewController`). Mounted beside a
 * BottomSheet, that is the screen's controller, which is already presenting the sheet, so UIKit
 * refuses the picker and says nothing: the chip takes the tap and no picker ever appears. Mounted
 * inside the sheet, it presents from the sheet's own controller. Android's picker is a dialog of
 * its own and works either way, which is how this reached a phone.
 *
 * There is no renderer in this workspace, so the rule is read from the source: in every file that
 * draws a BottomSheet and a picker's `element`, the element sits between a sheet's open and close
 * tags. A file with no sheet of its own (a module form, a screen) is left alone: its element is
 * inside whatever the file is rendered in.
 *
 * THE APP'S OWN CONFIRMATION IS HELD TO THE SAME RULE (2026-09-29, when every question stopped
 * being the phone's `Alert`): `useConfirm`'s `element` is a Modal too, so in a file that draws a
 * BottomSheet it sits inside one here, and `ui/confirm.scan.test.ts` holds the rest — the pages that
 * mount it on the page, and the capture forms whose sheet is their host's.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..', '..');

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return name.endsWith('.tsx') ? [path] : [];
  });
}

/** Comments out, so a sentence about the element can neither satisfy nor trip the check. */
const code = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

/** Each `<BottomSheet …>` … `</BottomSheet>` as [open, close] offsets, in order. */
function sheetSpans(body: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  const open = /<BottomSheet\b/g;
  for (let m = open.exec(body); m !== null; m = open.exec(body)) {
    const close = body.indexOf('</BottomSheet>', m.index);
    if (close > m.index) spans.push([m.index, close]);
  }
  return spans;
}

/**
 * `{picker.element}`, `{timePicker.element}`, and a confirmation's `{confirm.element}`: not global,
 * so `.test` keeps no state between files.
 */
const pickerElement = /\{\s*\w*([pP]icker|[cC]onfirm)\.element\s*\}/;

const cases = tsxFiles(src)
  .map(path => ({ path, body: code(readFileSync(path, 'utf8')) }))
  .filter(f => /<BottomSheet\b/.test(f.body) && pickerElement.test(f.body));

describe('a time picker opened from a sheet is mounted in that sheet (iOS presents it from there)', () => {
  it('finds the files it guards (a scan that matched nothing would pass forever)', () => {
    const names = cases.map(f => relative(src, f.path));
    expect(names).toEqual(
      // NibbleCue's (CuddleCue's Reminders page and who's-on sheet are not in it)
      expect.arrayContaining(['sheets/lists/TaskSheet.tsx', 'screens/nibble/AllergensScreen.tsx']),
    );
  });

  it.each(cases.map(f => [relative(src, f.path), f.body] as const))('%s', (_name, body) => {
    const spans = sheetSpans(body);
    for (const m of body.matchAll(new RegExp(pickerElement.source, 'g'))) {
      const at = m.index;
      expect(
        spans.some(([open, close]) => at > open && at < close),
        `${m[0]} at offset ${at} is outside every <BottomSheet>`,
      ).toBe(true);
    }
  });
});
