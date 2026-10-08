/**
 * EVERY DOOR THAT LOGS ASKS WHETHER THIS PERSON MAY (the 2026-10-08 scenario finding: a view only
 * member's phone wrote new entries, timers, stash moves and list lines locally; the server refused
 * every op as FORBIDDEN, `sync_apply_op` 0128, and the entry lived on that one phone behind a FAILED
 * outbox row).
 *
 * The call sites are React components and hooks that node cannot render, so this reads the source,
 * as the other `*.scan.test.ts` files do. Two layers:
 *
 *   1. ONE GUARD ON THE WRITE PATH. `useWriteContext().context()` refuses through `writeGate`, and
 *      it is the only way a screen, sheet or door writes: the read context is used only by the two
 *      reads that need it, and a file that opens the database itself and imports a writer is one of
 *      a short list, each with its reason. The doors from outside the app (links, coins, a reminder)
 *      ask before they act, so they land on Today instead of opening anything.
 *   2. THE CONTROLS ARE NOT THERE. The +, the tiles' tap, a timer's stop, pause and switch, the
 *      Schedule's Log now and Skip, the stash's Add milk, and the lists' add and tick controls.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = join(dirname(fileURLToPath(import.meta.url)), '..');

/** The file with its comments taken out and its whitespace folded, as the other scans read. */
const flatText = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');
const flat = (...p: string[]): string => flatText(readFileSync(join(src, ...p), 'utf8'));

function sources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) sources(p, out);
    else if (/\.tsx?$/.test(name) && !/\.test\.ts$/.test(name) && !/\.d\.ts$/.test(name))
      out.push(p);
  }
  return out;
}
const all = sources(src).map(p => ({
  path: relative(src, p).split('\\').join('/'),
  text: flatText(readFileSync(p, 'utf8')),
}));

describe('1. the write funnel refuses a view only member', () => {
  const funnel = flat('sheets', 'quick', 'useWriteContext.ts');

  it('reads the role of the family on screen through core’s rule', () => {
    expect(funnel).toContain('const canLog = roleCanLog(account?.memberships[0]?.role);');
    expect(flat('household', 'useCanLog.ts')).toContain(
      'return canLog(account?.memberships[0]?.role);',
    );
  });

  it('opens nothing to write with for them: `context()` is the gate, with one toast', () => {
    expect(funnel).toContain('const context = useCallback( () => writeGate( canLog,');
    expect(funnel).toContain("haptic('warning'); toast.show(sentence);");
    expect(funnel).toContain('readContext, ), [canLog, readContext, toast], );');
    expect(flat('sheets', 'quick', 'writeGate.ts')).toContain(
      'if (!canLog) { refuse(VIEW_ONLY_NO_LOG); return null; } return open();',
    );
  });

  it('keeps the ungated read context for the two reads every member makes, and nobody else', () => {
    const readers = all
      .filter(f => f.text.includes('readContext()'))
      .map(f => f.path)
      .sort();
    expect(readers).toEqual([
      // where it is made (CuddleCue's two readers, the sharing switches and the import's count,
      // are not in NibbleCue)
      'sheets/quick/useWriteContext.ts',
    ]);
  });

  it('turns every quick sheet’s Save off for them, and every timer action goes through it', () => {
    expect(flat('sheets', 'quick', 'useQuickWrite.ts')).toContain(
      'const ready = householdId !== null && userId !== null && canLog &&',
    );
    const timers = flat('sheets', 'quick', 'useTimerActions.ts');
    expect(timers).toContain('const { context, announce, say } = useWriteContext();');
    expect(timers).not.toContain('openLocalDb');
  });

  /*
    A FILE THAT OPENS THE DATABASE ITSELF AND IMPORTS A WRITER would be a second write path that
    nothing here refuses. Each that does is here with its reason; a new one fails until it says why.
  */
  it('has no second write path: a screen that opens the database itself writes nothing new', () => {
    // NibbleCue's own writer (`nibble/writes.ts`) and its folder are scanned like CuddleCue's
    const writers =
      /from '(?:\.\.\/)+(?:data\/(activities|timers|stash|lists|supplies|schedule|care|vaccines|locations|duty|import|messages|privacy|entries|entryPhotos)|nibble\/writes)'/;
    const own = all
      .filter(
        f =>
          /^(app|screens|sheets|notifications|widgets|tags|lists|stash|quick|tour|nibble)\//.test(
            f.path,
          ) &&
          f.text.includes('openLocalDb()') &&
          writers.test(f.text),
      )
      .map(f => f.path)
      .sort();
    expect(own).toEqual(
      [
        // (CuddleCue's StashScreen, PlansSheet and TourProvider are not in NibbleCue)
        // the developer inspector, on the in-app test server outside production only
        'sheets/SyncInspectorSheet.tsx',
        // a photo on an entry the editor already lets this person change (`readOnly`); and entry
        // photos are off (`entryPhotoSwitch.ts`)
        'sheets/entry/EntryPhotoRow.tsx',
        // a child's rhythms copied after the server answered: owner and parent only (0002)
        'sheets/household/AddChildSheet.tsx',
        // its Save asks `canChangeEntry` and writes through `context()`; a viewer reads it
        'sheets/quick/edit/EditEntrySheet.tsx',
        // the household's volume unit: owner and parent only (`canChange`)
        'sheets/quick/prefs.ts',
      ].sort(),
    );
  });
});

describe('1. the doors from outside the app ask first, and land on Today', () => {
  /*
    NibbleCue's links only navigate (`LinkRouter.tsx`: no coins, widgets, live timers or quick
    links, and no reminders to answer), so there is nothing a link could log before it asks. What
    is held is that the router stays that way: it opens nothing to write with.
  */
  it('a link only lands on a page: the router has no way to write', () => {
    const router = flat('app', 'LinkRouter.tsx');
    expect(router).not.toContain('useWriteContext');
    expect(router).not.toContain('openLocalDb');
    expect(router).not.toMatch(/from '\.\.\/(data|nibble)\//);
    expect(router).toContain("nav.navigate('Tabs', { screen: 'Today' }, BACK_TO_TABS);");
  });

  it('the shell: the + grid, a capture sheet and the stash save are never shown to them', () => {
    const shell = flat('app', 'ShellProvider.tsx');
    expect(shell).toContain(
      "if (!canLogRef.current && logsNew(overlay)) { haptic('warning'); toast.show(VIEW_ONLY_NO_LOG); return; }",
    );
    // first thing in `open`, before anything is put away or placed
    const open = shell.indexOf('const open = useCallback( (overlay: ShellOverlay) => {');
    expect(shell.indexOf('logsNew(overlay)')).toBeGreaterThan(open);
    expect(shell.indexOf('logsNew(overlay)')).toBeLessThan(
      shell.indexOf('questions.dismiss()', open),
    );
  });
});

describe('2. the controls that log are not there for them', () => {
  it('the + in the tab bar', () => {
    const nav = flat('app', 'navigation.tsx');
    expect(nav).toContain('const canLog = useCanLog();');
    expect(nav).toContain("hideQuickLog={currentKey !== 'today' || !canLog}");
  });

  it('NibbleCue’s Today: no serve, swap, skip or profile edit, and the log button hidden', () => {
    const today = flat('screens', 'nibble', 'TodayScreen.tsx');
    expect(today).toContain('const canLog = useCanLog();');
    expect(today).toContain('<Screen testID="today" logButton={canLog}>');
    // before the first bite, starting the plan is the page under it (NotStarted.tsx)
    expect(flat('screens', 'nibble', 'NotStarted.tsx')).toContain('{canLog ? (');
    expect(today).toContain('{canLog && skipMarkId ? (');
    expect(today).toContain('canEdit={canLog && v.childId !== null}');
    expect(today).toContain('{!canLog ? <Caption>{TODAY.viewOnly}</Caption> : null}');
  });

  it('NibbleCue’s Plan, Foods, a food and the allergens: no edit, add or try for them', () => {
    const plan = flat('screens', 'nibble', 'PlanTabScreen.tsx');
    expect(plan).toContain('const canLog = useCanLog();');
    expect(plan).toContain('const editable = canLog && (full || index < FREE_PLAN_DAYS);');
    expect(plan).toContain('canEdit={canLog && item !== null');
    const foods = flat('screens', 'nibble', 'FoodsScreen.tsx');
    expect(foods).toContain('const canLog = useCanLog();');
    expect(foods).toContain('{canLog ? (');
    const food = flat('screens', 'nibble', 'FoodScreen.tsx');
    expect(food).toContain('{canLog && v.profile !== null ? (');
    expect(food).toContain('{canLog && custom ? (');
    expect(flat('screens', 'nibble', 'AllergensScreen.tsx')).toContain('{canLog && v.profile ? (');
  });

  it('NibbleCue’s writes all go through the one funnel', () => {
    const writes = flat('nibble', 'useNibbleWrites.ts');
    expect(writes).toContain('const w = useWriteContext();');
    expect(writes).not.toContain('openLocalDb');
  });

  it('the tile and the running row read without a press (packages/ui)', () => {
    const ui = join(src, '..', '..', '..', 'packages', 'ui', 'src', 'components');
    const tile = flatText(readFileSync(join(ui, 'QuickAction.tsx'), 'utf8'));
    expect(tile).toContain('if (readOnly) return ( <View accessible accessibilityLabel={spoken}');
    expect(tile).toContain("`${readOnly ? '' : 'Log '}${label}");
    const also = flatText(readFileSync(join(ui, 'AlsoRunning.tsx'), 'utf8'));
    expect(also).toContain('if (!item.onOpen) return ( <View accessible');
  });

  // (no Schedule and no milk stash page in NibbleCue)
  it('the shared shopping list: no Add, no tick, no stepper, no Clear, no On list', () => {
    const shopping = flat('screens', 'lists', 'ShoppingScreen.tsx');
    expect(shopping).toContain('readOnly={!canLog}');
    expect(shopping).toContain('{canLog ? ( <View testID="shopping.add">');
    expect(shopping).toContain('{ready && canLog && low.length > 0 ? (');
    expect(shopping).toContain('{...(canLog ? { right: ( <CaptionAction');
    const row = flat('screens', 'lists', 'ListRow.tsx');
    expect(row).toContain('disabled={readOnly}');
    expect(row).toContain('enabled={!checked && !readOnly}');
    expect(row).toContain('{checked || readOnly ? (');
    // (no chores checklist, TasksScreen, in NibbleCue)
    const supplies = flat('screens', 'lists', 'SuppliesScreen.tsx');
    expect(supplies).toContain('trailing={ canLog ? ( <OnListToggle');
    expect(supplies).toContain('{canLog ? ( <Button label={SUPPLIES.addSupply}');
  });
});
