/**
 * EVERY DOOR TO A TAB GOES BACK TO THE TABS, NEVER STACKS A SECOND ONE (`backToTabs.ts`).
 *
 * In React Navigation 7 a `navigate('Tabs', …)` without `pop` pushes a new tab navigator when a
 * page is open over the tabs. The tour found it first (the owner, 2026-09-25: "go back to schedule
 * … when im already in the schedule page"), and a deep link, a reminder, the celebration sheet and
 * Supplies' shopping list button all did the same. This reads every source file the way the other
 * wiring tests here do (vitest runs in node, without React Native) and fails on a call to the
 * Tabs route that does not pass `BACK_TO_TABS`. `tour/pagesOver.test.ts` proves the object itself
 * against the real router.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BACK_TO_TABS } from './backToTabs';

const src = join(dirname(fileURLToPath(import.meta.url)), '..');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Each `<something>.navigate('Tabs', …)` call in a file, from its name to its closing paren. */
function tabCalls(text: string): string[] {
  const calls: string[] = [];
  const opener = /\b\w+\.navigate\(\s*['"]Tabs['"]/g;
  for (let m = opener.exec(text); m !== null; m = opener.exec(text)) {
    let depth = 0;
    let end = text.indexOf('(', m.index);
    for (; end < text.length; end += 1) {
      if (text[end] === '(') depth += 1;
      else if (text[end] === ')' && (depth -= 1) === 0) break;
    }
    calls.push(text.slice(m.index, end + 1));
  }
  return calls;
}

describe('going to a tab', () => {
  it('pops back to the tabs already in the stack', () => {
    expect(BACK_TO_TABS).toEqual({ pop: true });
  });

  it('passes BACK_TO_TABS on every call to the Tabs route in the app', () => {
    const found: string[] = [];
    const bare: string[] = [];
    for (const file of sources(src)) {
      for (const call of tabCalls(readFileSync(file, 'utf8'))) {
        const where = `${relative(src, file)}: ${call.replace(/\s+/g, ' ')}`;
        found.push(where);
        if (!call.includes('BACK_TO_TABS')) bare.push(where);
      }
    }
    // the scan itself must see the calls it is guarding, or it proves nothing
    // (NibbleCue has 8 such calls on 2026-10-08; CuddleCue's tour, reminders and stash had more)
    expect(found.length).toBeGreaterThanOrEqual(8);
    expect(bare).toEqual([]);
  });

  it('catches a bare call, so the check above can fail', () => {
    expect(tabCalls("nav.navigate('Tabs', { screen: 'Today' });")).toEqual([
      "nav.navigate('Tabs', { screen: 'Today' })",
    ]);
    expect(
      tabCalls(
        "nav.navigate(\n  'Tabs',\n  { screen: 'Stash', params: { id: f(1) } },\n  BACK_TO_TABS,\n);",
      )[0],
    ).toContain('BACK_TO_TABS');
  });
});
