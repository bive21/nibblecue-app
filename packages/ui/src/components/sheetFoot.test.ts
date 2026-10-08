/**
 * THE SHEET'S FOOT, read off the source (the owner, 2026-09-25: "… Sticky 'Save sleep' button").
 *
 * No renderer here; the lines below are the ones each promise rests on — the foot is filled from
 * the body, drawn under the scroller and above the opener's own footer, and let go on unmount; the
 * sheet gives way to the keyboard rather than running off the top. (The finished forms' time row,
 * once tested here too, is one row on every sheet since 2026-09-26: `timeRow.test.ts`.)
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const code = (f: string): string =>
  readFileSync(join(here, f), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/\s+/g, ' ');

describe('SheetFooter: the body pins its Save to the sheet’s foot', () => {
  const src = code('BottomSheet.tsx');

  it('hands the body a slot, and draws what is pinned under the scroller', () => {
    expect(src).toContain(
      '<FooterSlotContext.Provider value={slot}>{children}</FooterSlotContext.Provider>',
    );
    const scroller = src.indexOf('</ScrollView>');
    const pins = src.indexOf('{pins.map(([id, node]) => (');
    expect(scroller).toBeGreaterThan(-1);
    expect(pins).toBeGreaterThan(scroller);
    // the opener's own footer (a slot's Skip) stays BENEATH the form's Save
    expect(src.indexOf('{footer}', pins)).toBeGreaterThan(pins);
  });

  it('re-sends the node on every render, lets it go on unmount, and falls back to in place', () => {
    // re-sent inside the log sheet's tint it was made in: the foot is outside the body's providers
    // (2026-09-26: "breastfeed already finish still at the theme color"; `moduleButton.test.ts`)
    expect(src).toContain(
      'useLayoutEffect(() => { slot?.put(id, tint === null ? children : <ModuleTheme module={tint}>{children}</ModuleTheme>); });',
    );
    expect(src).toContain('useLayoutEffect(() => () => slot?.drop(id), [slot, id]);');
    expect(src).toContain('return slot === null ? <>{children}</> : null;');
  });

  it('keeps the slot stable, so a pin re-renders the foot and not the form', () => {
    expect(src).toMatch(/const slot = useMemo<FooterSlot>\([\s\S]*?\[\],\s*\);/);
  });

  it('gives way to the keyboard instead of running off the top of the window', () => {
    expect(src).toContain("sheet: { width: '100%', flexDirection: 'column', flexShrink: 1 },");
  });
});
