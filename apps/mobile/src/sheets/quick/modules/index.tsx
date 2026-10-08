/**
 * One module id → its capture sheet (docs/plans/WP5.md WP5.3–WP5.5).
 *
 * The registry's `capture` kind says how a module is captured; this is where each kind gets a
 * body. A module without a body says so in the sheet rather than showing a blank one.
 *
 * EVERY QUICK-LOGGABLE MODULE IS IN THIS TABLE, and `moduleReach.test.ts` fails the build if
 * one is not: a module a household can turn on and then never reach is the defect the owner
 * found by turning Growth on and looking for it (2026-09-15).
 */
import { MODULE_BY_ID, type ModuleId } from '@nibblecue/core';
import type { ComponentType } from 'react';
import { EmptyState, isTintModule, MODULE_ICON, ModuleTheme } from '@nibblecue/ui';
import type { ModuleSheetProps } from './common';
import { SolidsSheet } from './SolidsSheet';
import { WellbeingSheet } from './WellbeingSheet';

/** The modules that have a real sheet. Exported so a test can pin it against the registry. */
/**
 * NIBBLECUE LOGS MEALS, and only meals: the solids sheet is CuddleCue's own (docs/SOLIDS.md),
 * so a meal logged here reads and edits the same in both apps. Every other module's entries are
 * CuddleCue's to log; NibbleCue only reads the milk and diaper ones (docs/SERVER.md).
 */
export const CAPTURE_SHEETS: Partial<Record<ModuleId, ComponentType<ModuleSheetProps>>> = {
  solids: SolidsSheet,
  // CuddleCue's Health note (its migration 0160): what a parent noticed is ONE entry in both apps.
  // NibbleCue opens it from "Something you noticed" and adds the foods it followed in a record of
  // its own (docs/SERVER.md).
  wellbeing: WellbeingSheet,
};

export function ModuleSheetBody({ moduleId, ...rest }: ModuleSheetProps & { moduleId: ModuleId }) {
  const Sheet = CAPTURE_SHEETS[moduleId];
  /*
    EVERY LOG SHEET WEARS ITS MODULE'S COLOR, all of it (the owner, 2026-10-06, the same day as the
    rule below it was made: "for all logging already finished, and logging any modules: the color
    should follow the preset module color, instead of user selection theme color. i think it will
    look more uniform"). The morning's rule put every sheet on the household's scheme, because a
    module-colored Save under scheme-colored chips clashed; this keeps it ONE rule the other way:
    `ModuleTheme` swaps the whole accent family, so the Save, the time chips, the steppers and the
    toggles are the module's together (`theme/moduleAccent.ts`, measured). Night keeps its amber.
    The body is the one place every log sheet passes through, the + button's and an edit's alike.
  */
  if (Sheet)
    return (
      <ModuleTheme module={isTintModule(moduleId) ? moduleId : null}>
        <Sheet {...rest} />
      </ModuleTheme>
    );
  const def = MODULE_BY_ID[moduleId];
  return (
    <EmptyState
      icon={MODULE_ICON[def.icon] ?? 'note'}
      title={`${def.label} logging is not in this build yet`}
      body="Everything else keeps working, and nothing you logged is affected."
    />
  );
}
