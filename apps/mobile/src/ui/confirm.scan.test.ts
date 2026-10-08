/**
 * EVERY QUESTION IS THE APP'S OWN CONFIRMATION, MOUNTED WHERE IOS CAN PRESENT IT (the owner,
 * 2026-09-29, turning pumping off on an Android phone: *"the confirmation box is not in our ordinary
 * design … it look like an old text box that android has. why does this not follow our design?"*).
 *
 *   1. NO NATIVE DIALOG. No file in the app or the design system calls React Native's `Alert` —
 *      not `Alert.alert`, not `Alert.prompt`, not an import of it. A question is `useConfirm` (a
 *      screen's or a sheet's) or the shell's `confirm`, both the design system's `ConfirmSheet`.
 *   2. MOUNTED WHERE IT IS ASKED FROM. On iOS the confirmation's element is a Modal, and React
 *      Native presents a Modal from the view controller its host view sits in: mounted beside an
 *      open BottomSheet, UIKit refuses it without a word and the question never shows (the time
 *      picker's own scan, `sheets/quick/timePicker.test.ts`, says how that reached a phone). So:
 *        - a file that draws a BottomSheet mounts its confirmation INSIDE one, like its pickers;
 *        - a form with no sheet of its own is drawn only inside the capture sheets' BottomSheet
 *          (`ModuleSheetBody`), so its confirmation is in that sheet;
 *        - a screen mounts its confirmation on the screen, inside `<Screen>`;
 *        - and every host mounts the element it asks through: a question whose sheet is not on the
 *          screen is answered Cancel at once (`confirmQueue`), which is safe and silent, and wrong.
 *   3. THE SHELL'S OWN (a coin's, a toast's) is one overlay among the shell's, put up only once
 *      whatever was before it has gone, and answered Cancel when anything else takes the screen.
 *
 * There is no renderer in this workspace, so all of it is read from the source, with the comments
 * taken out so a sentence about a dialog can neither satisfy nor trip a check.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..');
const uiSrc = join(src, '..', '..', '..', 'packages', 'ui', 'src');

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

/** Comments out, so a sentence about a dialog can neither satisfy nor trip the check. */
const code = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const flat = (text: string): string => code(text).replace(/\s+/g, ' ');

const name = (path: string): string => relative(src, path).split('\\').join('/');

/** Each `<Tag …>` … `</Tag>` as [open, close] offsets, in order. */
function spans(body: string, tag: string): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  const open = new RegExp(`<${tag}\\b`, 'g');
  for (let m = open.exec(body); m !== null; m = open.exec(body)) {
    const close = body.indexOf(`</${tag}>`, m.index);
    if (close > m.index) out.push([m.index, close]);
  }
  return out;
}

const inside = (at: number, within: Array<[number, number]>): boolean =>
  within.some(([open, close]) => at > open && at < close);

const app = sources(src).map(path => ({ path, body: code(readFileSync(path, 'utf8')) }));

describe('no native dialog anywhere in the app or the design system', () => {
  const all = [
    ...app,
    ...sources(uiSrc).map(path => ({ path, body: code(readFileSync(path, 'utf8')) })),
  ];

  it('reads the files it guards (a scan that matched nothing would pass for ever)', () => {
    expect(all.length).toBeGreaterThan(400);
    expect(all.map(f => name(f.path))).toEqual(
      expect.arrayContaining(['screens/nibble/AllergensScreen.tsx', 'ui/confirm.tsx']),
    );
  });

  it('calls no Alert.alert or Alert.prompt, and imports no Alert from React Native', () => {
    const offenders = all
      .filter(
        f =>
          /\bAlert\s*\.\s*(alert|prompt)\s*\(/.test(f.body) ||
          /import\s*\{[^}]*\bAlert\b[^}]*\}\s*from\s*'react-native'/.test(f.body),
      )
      .map(f => name(f.path));
    expect(offenders, offenders.join(', ')).toEqual([]);
  });

  it('keeps no stand-in for it: the phone’s dialog helper is gone', () => {
    expect(app.map(f => name(f.path))).not.toContain('screens/timeline/askAlert.ts');
    expect(app.filter(f => /\baskAlert\b/.test(f.body)).map(f => name(f.path))).toEqual([]);
  });
});

/* ------------------------------------------------------------------ where each one is mounted */

/** Every `const x = useConfirm(…)` in a file, by the name it is held under. */
const hostsIn = (body: string): string[] =>
  [...body.matchAll(/const\s+(\w+)\s*=\s*useConfirm\(/g)].map(m => m[1] ?? '');

const hosts = app
  .filter(f => !name(f.path).startsWith('ui/confirm.tsx'))
  .flatMap(f => hostsIn(f.body).map(host => ({ ...f, host })));

const elementAt = (body: string, host: string): number[] =>
  [...body.matchAll(new RegExp(`\\{\\s*${host}\\.element\\s*\\}`, 'g'))].map(m => m.index ?? -1);

describe('a confirmation is mounted where it is asked from (iOS presents it from there)', () => {
  it('finds the hosts it guards: every page and sheet that asks', () => {
    // NibbleCue's three (CuddleCue's community, What you track, setup's rhythm, Routine, Schedule,
    // Log, Today and its bottle, sleep and tummy sheets are not in it)
    expect(hosts.map(h => name(h.path)).sort()).toEqual([
      'screens/account/AccountScreen.tsx',
      'screens/more/FamilyScreen.tsx',
      'screens/nibble/AllergensScreen.tsx',
    ]);
  });

  it.each(hosts.map(h => [`${name(h.path)} (${h.host})`, h] as const))(
    '%s mounts the element it asks through',
    (_label, h) => {
      expect(
        elementAt(h.body, h.host).length,
        `{${h.host}.element} is never drawn`,
      ).toBeGreaterThan(0);
    },
  );

  it.each(hosts.map(h => [name(h.path), h] as const))(
    '%s mounts it in the right place',
    (file, h) => {
      const at = elementAt(h.body, h.host);
      const sheets = spans(h.body, 'BottomSheet');
      if (sheets.length > 0) {
        // a file with a sheet of its own: inside it, as its pickers are
        for (const i of at)
          expect(inside(i, sheets), `${file}: outside every <BottomSheet>`).toBe(true);
      } else if (file.startsWith('sheets/quick/modules/')) {
        // a capture form: drawn only through the registry, which the hosts below keep in their sheet
        expect(h.body).toMatch(/export function \w+Sheet\(/);
      } else {
        // a page: on the page, inside its <Screen>, never in a sheet a component beside it draws
        const screens = spans(h.body, 'Screen');
        expect(screens.length, `${file}: draws no <Screen>`).toBeGreaterThan(0);
        for (const i of at) expect(inside(i, screens), `${file}: outside its <Screen>`).toBe(true);
      }
    },
  );

  it('draws every capture form, and the confirmation in it, inside the sheet that hosts it', () => {
    const drawers = app.filter(f => /<ModuleSheetBody\b/.test(f.body));
    expect(drawers.map(f => name(f.path)).sort()).toEqual([
      'app/QuickEntrySheet.tsx',
      'sheets/quick/edit/EditEntrySheet.tsx',
    ]);
    for (const f of drawers) {
      const sheets = spans(f.body, 'BottomSheet');
      for (const m of f.body.matchAll(/<ModuleSheetBody\b/g))
        expect(inside(m.index ?? -1, sheets), `${name(f.path)}: a form outside its sheet`).toBe(
          true,
        );
    }
    // and every capture form is reached only through the registry the hosts draw
    const direct = app
      .filter(f => /<(SolidsSheet|WellbeingSheet)\b/.test(f.body))
      .map(f => name(f.path));
    expect(direct).toEqual([]);
  });
});

/* ------------------------------------------------------------------------------ the shell's own */

describe('the shell’s own questions (a coin’s start, a toast’s "+ Liam")', () => {
  const shell = flat(readFileSync(join(src, 'app', 'ShellProvider.tsx'), 'utf8'));
  const api = flat(readFileSync(join(src, 'app', 'shell.ts'), 'utf8'));

  it('asks through the design system’s sheet, one overlay among the rest', () => {
    expect(api).toContain('confirm: Confirm;');
    expect(shell).toContain('const [questions] = useState(() => confirmQueue());');
    expect(shell).toContain('confirm: questions.ask,');
    expect(shell).toContain(
      '<ShellConfirmSheet request={ov?.kind === \'confirm\' ? ov.request : null} onAnswer={questions.answer} testID="shell.confirm" />',
    );
  });

  it('puts a question up through `open`, which waits for whatever is leaving, and away without ending a coin’s flow', () => {
    expect(shell).toContain("else placeQuestion.current.open({ kind: 'confirm', request });");
    const close = shell.slice(shell.indexOf('const closeQuestion = useCallback('));
    expect(close.slice(0, close.indexOf('}, [noteLeaving]);'))).not.toContain('clearWriteOrigin');
  });

  it('answers Cancel for a question anything else takes the screen from', () => {
    expect(shell).toContain("if (overlay.kind !== 'confirm') questions.dismiss();");
    const gate = shell.slice(shell.indexOf('const openGate = useCallback('));
    expect(gate.slice(0, 80)).toContain('questions.dismiss();');
    const closeAll = shell.slice(shell.indexOf('const closeAll = useCallback('));
    expect(closeAll.slice(0, 80)).toContain('questions.dismiss();');
  });

  it('is what a timer’s question falls back to', () => {
    // (CuddleCue's tummy sheet's toast asks through it too; no tummy sheet in NibbleCue)
    const actions = flat(readFileSync(join(src, 'sheets', 'quick', 'useTimerActions.ts'), 'utf8'));
    expect(actions).toContain('const question = ask ?? shell.confirm;');
  });
});
