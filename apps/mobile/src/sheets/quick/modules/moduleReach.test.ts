/**
 * EVERY MODULE A HOUSEHOLD CAN TURN ON HAS A WAY IN.
 *
 * The owner turned Growth on in Setup, saw it listed in "What you track", and then could not
 * find it anywhere in the app (2026-09-15). It was not a missing screen so much as a missing
 * question: `quickLog: false` is the right answer for a module with a screen of its own
 * (Vaccines, Milk stash) and a dead end for one without (Growth, Milestones, Mom self-care —
 * all three, and Milestones even had a finished sheet nobody could open).
 *
 * The eye cannot audit this: every one of those modules looked correct in the registry, in
 * Setup, in the totals and in the timeline. A table can, so here it is — the two ways in
 * named explicitly, and any module that has neither fails the build with its own label.
 */
import { MODULES, type ModuleId } from '@nibblecue/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));

/*
  NIBBLECUE LOGS TWO MODULES (2026-10-08). The registry (`MODULES`, core) is CuddleCue's and is
  shared: its `quickLog` flags say what CuddleCue's + grid lists. NibbleCue has no grid: its + opens
  the solids sheet itself (`shell.openQuickLog`), and what a parent noticed is written by its own
  Noticed page as the same Health note entry (`nibble/writes.ts`). Every other module is one
  NibbleCue only reads, from CuddleCue's log. So the table here is NibbleCue's: each module it logs
  has a way in, named, and the capture sheets it ships are exactly those.
*/
const LOGGED: Readonly<Record<string, { file: string; needle: string }>> = {
  solids: {
    file: 'app/ShellProvider.tsx',
    needle: "openQuickLog: () => open({ kind: 'quickentry', moduleId: 'solids' })",
  },
  wellbeing: { file: 'nibble/writes.ts', needle: "type: 'wellbeing'," },
};

/** `CAPTURE_SHEETS` read as text: importing it would pull React Native into a node test. */
function sheetKeys(): Set<string> {
  const src = readFileSync(join(here, 'index.tsx'), 'utf8');
  const table = src.slice(
    src.indexOf('CAPTURE_SHEETS'),
    src.indexOf('export function ModuleSheetBody'),
  );
  const keys = new Set<string>();
  for (const m of table.matchAll(/^\s{2}([a-z]+):\s*[A-Z]/gm)) keys.add(m[1] as string);
  return keys;
}

describe('every module NibbleCue logs is reachable', () => {
  const sheets = sheetKeys();
  const app = join(here, '..', '..', '..');
  const flat = (rel: string) => readFileSync(join(app, rel), 'utf8').replace(/\s+/g, ' ');

  it('the scan finds the table it claims to read', () => {
    // a regex that silently matched nothing would make every assertion below vacuous
    expect([...sheets].sort()).toEqual(['solids', 'wellbeing']);
  });

  it('names a module of the registry for each, and a way in for each', () => {
    for (const [id, way] of Object.entries(LOGGED)) {
      expect(
        MODULES.some(m => m.id === (id as ModuleId)),
        id,
      ).toBe(true);
      expect(flat(way.file), `${id}: ${way.file}`).toContain(way.needle.replace(/\s+/g, ' '));
    }
  });

  it('ships a capture sheet only for a module it logs', () => {
    const extra = [...sheets].filter(id => !(id in LOGGED));
    expect(extra, `sheet for a module NibbleCue does not log: ${extra.join(', ')}`).toEqual([]);
  });

  it('the + opens solids, from Today only, for someone who may log', () => {
    expect(flat('app/navigation.tsx')).toContain('onQuickLog={shell.openQuickLog}');
    expect(flat('app/navigation.tsx')).toContain(
      "hideQuickLog={currentKey !== 'today' || !canLog}",
    );
  });
});
