/**
 * HOW MANY SHEETS AND POPOVERS ARE UP, ANYWHERE IN THE APP (2026-09-28).
 *
 * The shell knows the overlays it owns (`useShellOpen` in the app), and a screen's own sheets are
 * its own: Today's Edit for the Log row, the nap card's method, the catch-up card's list. Something
 * that must never rise over another sheet (the celebration sheet, which speaks first) has to know
 * about every one of them, and asking each screen to report would be a report some screen forgets.
 * So every `BottomSheet` and `Popover` counts itself here while it is meant to be up, and a reader
 * asks one number.
 *
 * WHILE IT IS MEANT TO BE UP: from `visible` going true to `visible` going false, not to the end of
 * its exit. A sheet on its way out is not a sheet in the way.
 */
import { createContext, useSyncExternalStore, type ReactNode } from 'react';

let up = 0;
/** The sheets up, in the order they came up: the last is the one in front. */
const stack: object[] = [];
const readers = new Set<() => void>();

const tell = (): void => {
  for (const r of [...readers]) r();
};

/** A sheet or popover is up: counted until the returned function is called, once. */
export function noteSheetUp(key?: object): () => void {
  up += 1;
  if (key !== undefined) stack.push(key);
  tell();
  let gone = false;
  return () => {
    if (gone) return;
    gone = true;
    up -= 1;
    if (key !== undefined) {
      const at = stack.lastIndexOf(key);
      if (at >= 0) stack.splice(at, 1);
    }
    tell();
  };
}

const frontSheet = (): object | undefined => stack[stack.length - 1];

/** The sheet in front, by the key it came up with (`BottomSheet`). */
export function useFrontSheet(): object | undefined {
  return useSyncExternalStore(subscribe, frontSheet, frontSheet);
}

/**
 * THE TOAST, HANDED TO THE SHEET IN FRONT (2026-10-06: "the 30min does not work … make sure all the
 * buttons work"). A sheet is a native modal, drawn over everything the app draws, the toast host
 * included — so a sentence said while a sheet was up, a refusal above all, was said under it and
 * nobody saw it. The app's toast provider puts the toast here; the sheet in front draws it over
 * itself, and the host under the sheets draws nothing while one is up.
 */
export const SheetToastContext = createContext<ReactNode>(null);

/** The number up right now. */
export const sheetsUpNow = (): number => up;

function subscribe(reader: () => void): () => void {
  readers.add(reader);
  return () => {
    readers.delete(reader);
  };
}

/** How many sheets and popovers are up, re-rendering the reader only when the number changes. */
export function useSheetsUp(): number {
  return useSyncExternalStore(subscribe, sheetsUpNow, sheetsUpNow);
}
