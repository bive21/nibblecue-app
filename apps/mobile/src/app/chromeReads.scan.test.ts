/**
 * WHAT A SAVE COSTS THE PAGES BEHIND IT, PART TWO (2026-09-28; `saveCost.scan.test.ts` is part
 * one). Every page a parent has opened keeps its top bar mounted — each tab stays behind the bar,
 * and a pushed page keeps the one under it — and the shell keeps fifteen overlays mounted. A save
 * from + opens the grid, opens a sheet, writes, closes the sheet and runs a flush, and every one of
 * those steps used to re-render every bar and every overlay. What stops it is who reads what, which
 * a node suite can only see in the source.
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

describe('a page’s top bar reads what it draws, and nothing more', () => {
  const screen = flat('app', 'Screen.tsx');

  it('reads the chip it draws, never the whole queue', () => {
    expect(screen).toContain('const syncChip = useSyncChip(online);');
    expect(screen).toContain('sync={syncChip}');
    expect(screen).not.toContain('useSyncStatus');
  });

  it('reads its own two overlays, never every sheet that opens', () => {
    expect(screen).toContain('const open = useShellBarOpen();');
    expect(screen).toContain("childExpanded={open === 'child'}");
    expect(screen).toContain("accountExpanded={open === 'account'}");
    expect(screen).not.toContain('useShellOpen');
  });

  it('is handed that value by the shell, which changes it only with those two', () => {
    const shell = flat('app', 'ShellProvider.tsx');
    expect(shell).toContain(
      "const barOpen = openKind === 'child' || openKind === 'account' ? openKind : null;",
    );
    expect(shell).toContain('<ShellBarOpenContext.Provider value={barOpen}>');
  });
});

describe('the shell’s overlays redraw when their own props do', () => {
  const shell = flat('app', 'ShellProvider.tsx');
  const drawn = [
    'AccountPopover',
    'ChildSwitcherSheet',
    'AddChildSheet',
    'ChildPhotoSheet',
    'QuickEntrySheet',
    // (CuddleCue's StashSaveSheet and NotificationsSheet: no milk stash UI or reminders here)
    'AppearanceSheet',
    'AboutSheet',
    'SyncInspectorSheet',
    'PlanPromptSheet',
    'GateSheet',
  ];

  it('memoises every overlay it draws', () => {
    for (const name of drawn) {
      expect(shell, name).toContain(`const ${name} = memo(${name}Body);`);
      expect(shell, name).toContain(`<${name} `);
    }
    // the edit sheet is memoised where it is defined: the shell's import of it is pinned wiring
    expect(flat('sheets', 'quick', 'edit', 'EditEntrySheet.tsx')).toContain(
      'export const EditEntrySheet = memo(EditEntrySheetBody);',
    );
  });

  it('hands them only values that hold still while they are not the one opening or closing', () => {
    // the coin's question is one object while it is up, and `null` while it is not
    expect(shell).toContain('ask={coinAsk}');
    expect(shell).toContain(
      "const coinAsk = useMemo( () => (ov?.kind === 'coinChild' ? { subject: ov.subject, onPick: ov.then } : null), [ov], );",
    );
    // every dismissal is the shell's one stable close
    expect(shell).toContain('const closeOverlay = useCallback(() => {');
    expect(shell).toContain('const closeGate = useCallback(() => {');
    expect(shell).not.toMatch(/onClose=\{\(\) =>/);
  });
});

describe('the other readers of the queue read their answer too', () => {
  it('the banner’s provider reads the banner', () => {
    const provider = flat('sync', 'SyncProvider.tsx');
    expect(provider).toContain('const call = useSyncBannerCall();');
    expect(provider).not.toContain('useSyncStatus');
  });

  it('each answer is a primitive, so React compares it by value', () => {
    const status = flat('sync', 'status.ts');
    expect(status).toContain(
      'const read = useCallback(() => chipKey(chipFor(syncStatus.get(), online)), [online]);',
    );
    expect(status).toContain(
      'const read = () => bannerKey(syncBannerFrom(syncStatus.get(), Date.now()));',
    );
    expect(status).toContain('const read = () => unsyncedCount(syncStatus.get());');
  });
});

describe('the selected child’s value changes only when something in it does', () => {
  it('reads the clock through one function for the app’s life, not a fresh default each render', () => {
    const child = flat('household', 'ChildContext.tsx');
    expect(child).toContain('const systemNow = (): number => Date.now();');
    expect(child).toContain('now = systemNow,');
    expect(child).not.toContain('now = () => Date.now()');
  });
});
