/**
 * ModuleTint — "the buttons in here log this module" (`theme/moduleButton.ts` has the owner's words
 * and the reasoning). A log sheet puts its body inside one, and every `primary` Button under it —
 * the Save, a Start, the running panel's — is drawn in the module's deep ink instead of the scheme's
 * gradient. Nothing else changes: secondary, ghost and danger buttons keep their own paint, and a
 * Button outside a ModuleTint is exactly the Button it always was, so Settings, the Plan and every
 * other sheet keep the household's accent without being told to.
 *
 * A context rather than a prop on each Button because the buttons live in a dozen files under the
 * sheet (the save row, each module's Start, the pump's running panel, the time picker's Done), and
 * a prop would have to be threaded through every one of them and remembered by the next. The sheet
 * is what knows the module; the button only has to ask.
 *
 * A CONTEXT DOES NOT TRAVEL ON ITS OWN, and that is the one way a log button lost its color (the
 * owner, 2026-09-26: *"breastfeed already finish still at the theme color. i think you missed
 * updating it … sleeping alreayd finish also still follow theme color"*). React hands a context to
 * what is RENDERED under the provider, not to what was CREATED there, and every "Already finished"
 * form pins its Save to the sheet's foot (`SheetFooter`): the button is made inside this tint and
 * drawn by the sheet, outside it — so it asked, heard nothing, and drew the scheme's gradient. A
 * slot that carries a node out of the body has to carry the tint with it (`useModuleTint`, read
 * where the node is made; `SheetFooter` does exactly that).
 */
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { moduleAccentPalette, moduleSoft } from '../theme/moduleAccent';
import { type ModuleButtonPaint, type TintModule } from '../theme/moduleButton';
import type { Palette } from '../theme/theme';
import { PaletteOverride, useTheme } from '../theme/ThemeProvider';

const ModuleTintContext = createContext<TintModule | null>(null);

export interface ModuleTintProps {
  /** The module the sheet logs; null (or a module with no ink) leaves every button as it was. */
  module: TintModule | null;
  children: ReactNode;
}

export function ModuleTint({ module, children }: ModuleTintProps) {
  return <ModuleTintContext.Provider value={module}>{children}</ModuleTintContext.Provider>;
}

/**
 * The module the buttons here log, or null outside a log sheet: for a slot that draws a node
 * somewhere else in the tree and has to put the same tint back round it there (see the header).
 */
export function useModuleTint(): TintModule | null {
  return useContext(ModuleTintContext);
}

/**
 * The paint a primary Button here takes: the module's soft pastel with the page's words on it, the
 * same fill as a chosen chip (`ModuleTheme`'s palette, 2026-10-06: "much softer"), or null for the
 * theme's own (and in Night).
 */
export function useModuleButtonPaint(): ModuleButtonPaint | null {
  const module = useContext(ModuleTintContext);
  const t = useTheme();
  return useMemo(() => {
    if (module === null || t.theme === 'night') return null;
    // from the module's own colors, so a lone ModuleTint paints the same as one in a ModuleTheme
    const soft = moduleSoft(t.color, module, t.theme);
    return { fill: soft.fill, ink: soft.onFill, edge: null };
  }, [module, t.color, t.theme]);
}

/**
 * A LOG SHEET IN ITS MODULE'S COLOR, all of it (the owner, 2026-10-06; `theme/moduleAccent.ts`):
 * the palette's accent family becomes the module's, so every chip, stepper, toggle and link follows,
 * and the primary buttons take the module's measured paint through `ModuleTint` as before. Null
 * leaves the sheet in the household's scheme.
 */
export function ModuleTheme({ module, children }: ModuleTintProps) {
  const { theme } = useTheme();
  const swap = useCallback(
    (p: Palette) => (module === null ? p : moduleAccentPalette(p, module, theme)),
    [module, theme],
  );
  return (
    <PaletteOverride palette={swap}>
      <ModuleTint module={module}>{children}</ModuleTint>
    </PaletteOverride>
  );
}
