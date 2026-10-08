/**
 * HOW THE DATABASE CHANGES FILE, read from the code that does it (`db/index.ts`, which imports
 * expo-sqlite and so cannot run in node). Since 0153 a family's file is closed and another opened
 * while the app runs, and each rule below is a way that went wrong on the owner's phone or would
 * have (2026-10-08: "database is locked" after the switcher; a second account's push refused).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'index.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
  .replace(/\s+/g, ' ');
const body = (start: string): string => {
  const at = src.indexOf(start);
  expect(at, start).toBeGreaterThan(-1);
  const next = src.indexOf(' function ', at + start.length);
  return src.slice(at, next === -1 ? undefined : next);
};

describe('a change of file', () => {
  it('moves the name before it lets the old handle go, so no open lands on the old file', () => {
    const select = body('async function select(');
    const moved = select.indexOf('fileName = name;');
    const closed = select.indexOf('await closeHandle();');
    expect(moved).toBeGreaterThan(-1);
    expect(moved).toBeLessThan(closed);
  });

  it('runs one at a time, teardowns too, and an open waits for the one under way', () => {
    expect(src).toContain(
      'export function selectLocalDbHousehold(householdId: string | null): Promise<void> { return serially(() => select(householdId)); }',
    );
    expect(body('export function closeAndDeleteLocalDb(')).toContain(
      'stopLocalDb(); return serially(deleteOnScreen);',
    );
    expect(body('export function closeAndDeleteEveryLocalDb(')).toContain(
      'stopLocalDb(); return serially(deleteEvery);',
    );
    const open = body('export function openLocalDb(');
    // the latch first, then the wait, then the handle
    expect(open.indexOf('assertCanOpen();')).toBeLessThan(open.indexOf('pending.then('));
    expect(open.indexOf('pending.then(')).toBeLessThan(open.indexOf('if (!handle)'));
  });

  it('closes a handle through its own close, which lets the work on it finish first', () => {
    expect(body('async function closeHandle(')).toContain('await (await opening).db.close();');
    expect(src).not.toContain('.raw.closeAsync()');
  });

  it('sets the busy timeout before the switch to WAL, on every open', () => {
    const opens = src.match(/execAsync\(`[^`]*journal_mode[^`]*`\)/g) ?? [];
    expect(opens).toHaveLength(2);
    for (const o of opens)
      expect(o.indexOf('${BUSY_PRAGMA}')).toBeLessThan(o.indexOf('journal_mode'));
  });
});

describe('the install id', () => {
  it('goes at a sign-out or a deletion, with every file', () => {
    expect(body('async function deleteEvery(')).toContain(
      'AsyncStorage.multiRemove([KNOWN_FILES_KEY, LEGACY_OWNER_KEY, INSTALL_ID_KEY])',
    );
  });

  it('stays across a switch and when one family leaves the phone', () => {
    expect(body('async function select(')).not.toContain('INSTALL_ID_KEY');
    expect(body('async function deleteOnScreen(')).not.toContain('INSTALL_ID_KEY');
  });
});
