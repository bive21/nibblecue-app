/**
 * ONE STOP MARK ON EVERY TIMER (the owner, 2026-09-27: *"in the pumping, tummy time, sleeping timer,
 * create a universal stop icon, instead of using whatever that is. make sure stop has same icons"*).
 *
 * These tests cannot render React Native, so the rule is held where it is made: the glyph itself (the
 * universal stop square, big enough to read at the pill's 20 pt), the button (every mark it draws is
 * `STOP_MARK`, and it takes no timer type that could pick another), and every place that draws the
 * button (none hands it a mark). Sleep's "Woke up", pumping's and tummy time's "Stop" and a feed's
 * "Finish" all come through `StopButton` — on Today's cards and in the running sheets through
 * `TimerCard`, on the sticky bar through the app's `TimerBar` — so the same mark is on all of them.
 * The prototype holds the same rule in `prototype/audit/logic-suite.js`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ICON_PATHS } from '../icons/paths';
import type { STOP_MARK as STOP_MARK_CONST, STOP_PILL_MARK as PILL_CONST } from './StopButton';

/*
  `StopButton.tsx` is React Native, which node cannot load, so its two numbers are held the way
  `theme/artWords.ts` holds them: by type, so `tsc` fails this file the day either changes, and by the
  source text below.
*/
const STOP_MARK = 'stop' satisfies typeof STOP_MARK_CONST;
const STOP_PILL_MARK = 20 satisfies typeof PILL_CONST;

function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error('repository root (pnpm-workspace.yaml) not found');
    dir = up;
  }
}

function tsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) {
      if (entry !== 'node_modules') out.push(...tsxFiles(path));
    } else if (entry.endsWith('.tsx') && !/\.test\.tsx$/.test(entry)) {
      out.push(path);
    }
  }
  return out;
}

const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const ROOT = repoRoot();
const flat = (path: string) => withoutComments(readFileSync(path, 'utf8')).replace(/\s+/g, ' ');
const button = flat(join(ROOT, 'packages/ui/src/components/StopButton.tsx'));

describe('the stop mark', () => {
  it('is the universal stop symbol: a filled square with soft corners, centered in its box', () => {
    expect(button).toContain("export const STOP_MARK = 'stop' satisfies IconName;");
    expect(button).toContain('export const STOP_PILL_MARK = 20;');
    const def = ICON_PATHS[STOP_MARK];
    expect(def.viewBox).toBe('0 0 24 24');
    expect(def.fill).toBe('currentColor');
    expect(def.elements).toHaveLength(1);
    const square = def.elements[0];
    if (square?.type !== 'rect') throw new Error(`the stop is a ${square?.type}, not a square`);
    expect(square.width).toBe(square.height);
    expect(square.x + square.width / 2).toBe(12);
    expect(square.y + square.height / 2).toBe(12);
    // soft corners, never so round that it reads as a circle — a quarter of the side
    const round = (square.rx ?? 0) / square.width;
    expect(round).toBeGreaterThanOrEqual(0.15);
    expect(round).toBeLessThanOrEqual(0.3);
  });

  it('reads as a square at the pill’s 20 pt, not the 8 pt dot the smaller square came out as', () => {
    const square = ICON_PATHS[STOP_MARK].elements[0];
    if (square?.type !== 'rect') throw new Error('the stop is not a square');
    // 12 of the 24 units: 10 pt across on the running card's pill and the sticky bar's
    expect(square.width).toBe(12);
    expect((square.width / 24) * STOP_PILL_MARK).toBe(10);
  });
});

describe('every timer’s stop button draws the same mark', () => {
  it('draws STOP_MARK and nothing else, in every layout', () => {
    const icons = [...button.matchAll(/<Icon\b([^>]*?)\/>/g)].map(m => m[1] ?? '');
    // the pill's mark, and the ring's for the card and sheet layouts
    expect(icons).toHaveLength(2);
    for (const props of icons) expect(props).toMatch(/^ name=\{STOP_MARK\} /);
    // no lookup that could pick a mark per timer
    expect(button).not.toMatch(/STOP_MARK\s*\[/);
  });

  it('takes no timer type and no mark, so no timer can be handed one of its own', () => {
    const props = /export interface StopButtonProps \{(.*?)\}/.exec(button)?.[1];
    expect(props).toBeDefined();
    expect(props).not.toMatch(/\b(type|timer|mark|icon|glyph|name)\??:/);
    expect(props).not.toContain('TimerType');
  });

  it('is drawn by the running card, which hands it no mark', () => {
    const sites: string[] = [];
    for (const dir of ['packages/ui/src', 'apps/mobile/src']) {
      for (const file of tsxFiles(join(ROOT, dir))) {
        const source = flat(file);
        for (const [, props] of source.matchAll(/<StopButton\b(.*?)\/>/g)) {
          sites.push(relative(ROOT, file));
          expect(props, relative(ROOT, file)).not.toMatch(/\s(type|timer|mark|icon|glyph|name)=/);
        }
      }
    }
    // TimerCard carries every timer's stop. NibbleCue has no timer bar (CuddleCue's Today was not
    // carried over), so the card is the one place; a new place that draws a stop joins this list
    expect(sites.sort()).toEqual(['packages/ui/src/components/TimerCard.tsx']);
  });
});
