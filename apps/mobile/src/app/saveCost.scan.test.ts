/**
 * WHAT ONE SAVE COSTS THE SCREENS BEHIND IT (2026-09-28). The owner, testing in Expo Go on Android,
 * found the app laggy after every save: a bottle re-ran Today's reads, and each read that landed
 * re-rendered whatever held it and re-ran every sum and schedule below. The engine's own cost is
 * core's (`schedule/recompute.budget.test.ts`); the passes are counted in `data/store.test.ts`
 * and what a read that came back unchanged lands as in `data/sameValue.test.ts`. What is pinned
 * here is the wiring those tests cannot see without a renderer: who reads what, and who is
 * mounted at all. No renderer in this suite, so the source is read.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = join(dirname(fileURLToPath(import.meta.url)), '..');
const flat = (...p: string[]): string =>
  readFileSync(join(src, ...p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

/*
  CuddleCue's Today (its care list and `useTodayData`), the Quick Log grid, the widget publisher and
  the next-up shade are not in NibbleCue, so their wiring checks are not here.
*/
describe('a read that came back unchanged changes nothing', () => {
  it('lands through `landed`', () => {
    const query = flat('data', 'useLocalQuery.ts');
    expect(query).toContain('setValue(held => landed(held, next, initial, same))');
    expect(query).toContain('same: (held: T, next: T) => boolean = sameValue,');
  });
});
