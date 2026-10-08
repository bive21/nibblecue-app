/**
 * WHERE THE LOGGING-FOR ROW STARTS, WIRED (the owner, 2026-09-25: "for module with multiple
 * babies, I think so. Analyze in real life scenario what is the better choice").
 *
 * The rule is a table (`loggingForStart.test.ts`). What is held here, by reading the sources the
 * way the other sheet tests in this tree do (vitest runs in node, without React Native), is the
 * wiring around it:
 *
 *   * nothing can make a sheet show one baby and then another — the row's first value is
 *     `useState`'s initializer, from data the host read before the sheet was asked for, and
 *     nothing but the parent's tap changes it;
 *   * every child-scoped sheet starts through that one rule, and every one draws the row — the
 *     timer sheets over BOTH of their paths, because their start buttons write on the tap;
 *   * a sheet's default save on Both is one baby's, so its toast still carries "+ Liam".
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { groupLast, loggingForStart, type Recency } from './loggingForStart';
import { otherChild, savePlan, selectionFor } from './save';

const here = dirname(fileURLToPath(import.meta.url));
/** A source with its comments taken out, flattened to one line. */
const code = (...p: string[]): string =>
  readFileSync(join(here, ...p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

/** `CAPTURE_SHEETS` read as text: importing it would pull React Native into a node test. */
function captureSheets(): Record<string, string> {
  const src = readFileSync(join(here, 'modules', 'index.tsx'), 'utf8');
  const table = src.slice(
    src.indexOf('CAPTURE_SHEETS'),
    src.indexOf('export function ModuleSheetBody'),
  );
  const out: Record<string, string> = {};
  for (const m of table.matchAll(/^\s{2}([a-z]+):\s*([A-Z][A-Za-z]+)/gm))
    out[m[1] as string] = m[2] as string;
  return out;
}

const TIMER_SHEETS = ['SleepSheet', 'BreastfeedSheet', 'TummySheet'];

describe('the row decides once, before the sheet paints, and never moves by itself', () => {
  const hook = code('useLoggingFor.ts');

  it('takes its first value from the rule, in useState’s initializer', () => {
    expect(hook).toContain('const recency = useRecency();');
    expect(hook).toContain('useState<string>(() => loggingForStart({');
    expect(hook).toContain('lastOf: childId => groupLast(recency, moduleId, childId),');
  });

  it('reads nothing asynchronously and sets nothing afterwards: only a tap moves it', () => {
    expect(hook).not.toContain('useEffect');
    expect(hook).not.toContain('openLocalDb');
    expect(hook).not.toContain('useLocalQuery');
    expect(hook).not.toMatch(/setValue\(/);
  });

  it('is handed what the host already read, around the sheet it mounts', () => {
    const host = code('..', '..', 'app', 'QuickEntrySheet.tsx');
    expect(host).toContain('const recency = useRecencyRead();');
    const provider = host.indexOf('<RecencyContext.Provider value={recency}>');
    expect(provider).toBeGreaterThan(-1);
    expect(provider).toBeLessThan(host.indexOf('<ModuleSheetBody'));
  });

  it('keeps that read current on every write, every pulled row and every timer', () => {
    const read = code('recency.ts');
    expect(read).toContain('keys.household(householdId)');
    expect(read).toContain(
      'await lastStartByChild(db, householdId, viewerId, childIds, BABY_TYPES)',
    );
    expect(read).toContain('const running = useAllRunningTimers();');
  });
});

describe('every child-scoped sheet starts through the rule, and draws the row', () => {
  const sheets = captureSheets();

  it('reads the table it checks', () => {
    // NibbleCue's two capture sheets (CuddleCue's bottle, feed, pump, diaper, sleep and the rest
    // are not in it), both child-scoped
    expect(Object.keys(sheets).sort()).toEqual(['solids', 'wellbeing']);
  });

  for (const [moduleId, component] of Object.entries(captureSheets())) {
    if (moduleId === 'pump') continue;
    it(`${moduleId}: the row, started by useLoggingFor`, () => {
      const src = code('modules', `${component}.tsx`);
      if (TIMER_SHEETS.includes(component)) {
        // the timer sheets reach it through `useTimerSheet`, and draw it over everything
        expect(src).toContain(`useTimerSheet(`);
        expect(src).toContain('<LoggingForRow');
        expect(src).not.toContain('loggingFor=');
      } else if (component === 'DiaperSheet') {
        // the diaper draws its own form (Option 2, 2026-10-05), the row over it
        expect(src).toContain(`useLoggingFor('diaper')`);
        expect(src).toContain(
          '<LoggingForRow options={lf.options} value={lf.value} onChange={lf.setValue} />',
        );
      } else {
        expect(src).toContain(`useLoggingFor('${moduleId}')`);
        expect(src).toContain(
          'loggingFor={{ options: lf.options, value: lf.value, onChange: lf.setValue }}',
        );
      }
    });
  }

  // (no timer sheets in NibbleCue, so no running panel to show who over)

  it('the form draws the row, and on Both the row says who in words', () => {
    expect(code('QuickEntry.tsx')).toContain('<LoggingForRow');
    const row = code('LoggingForRow.tsx');
    expect(row).toContain('{value === ALL && sayWhoOnAll ? (');
    expect(row).toContain('{eachOwnEntry(names)}');
  });
});

describe('on Both, the default save is one baby’s — and "+ Liam" is still one tap', () => {
  const twins = [
    { id: 'emma', name: 'Emma' },
    { id: 'liam', name: 'Liam' },
  ];
  // Emma was fed at 11:00, Liam at 11:20
  const recency: Recency = {
    lastAt: {
      emma: { bottle: Date.parse('2026-09-25T11:00:00Z') },
      liam: { breastfeed: Date.parse('2026-09-25T11:20:00Z') },
    },
    running: [],
  };

  it('writes one entry, for the baby up next, with the other one on the toast', () => {
    for (const moduleId of ['bottle', 'breastfeed'] as const) {
      const start = loggingForStart({
        children: twins,
        isAll: true,
        selectedId: null,
        slotChildId: null,
        lastOf: id => groupLast(recency, moduleId, id),
      });
      const plan = savePlan(moduleId, { children: twins, ...selectionFor(start) });
      expect(plan).toEqual({ kind: 'one', childId: 'emma' });
      expect(otherChild(moduleId, twins, 'emma')?.name).toBe('Liam');
    }
  });

  it('and Both, chosen on the row, still writes one entry each', () => {
    expect(savePlan('diaper', { children: twins, ...selectionFor('all') })).toEqual({
      kind: 'each',
      childIds: ['emma', 'liam'],
    });
  });
});
