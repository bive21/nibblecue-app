/**
 * What every module sheet is handed by the dispatcher (modules/index.tsx).
 *
 * `openedAtMs` is the instant the sheet opened — every time preset resolves against it, never
 * a live clock (QuickEntry.tsx says why). `timeZone` is the HOUSEHOLD's (core/today/day.ts:
 * both parents must see the same day). `onDone` closes the sheet after a committed save.
 */
import type { QuickEntryPreset } from '../../../app/shell';

export interface ModuleSheetProps {
  openedAtMs: number;
  timeZone: string;
  clock24: boolean;
  /** Handed by another surface — the bottle sheet pointed at a container (WP6). Usually null. */
  preset?: QuickEntryPreset | null;
  /**
   * True once the parent has dragged the sheet's handle UP (`BottomSheet.onExpand`): a sheet
   * with more to show — the tummy-time sheet's day of entries — opens it on this. A sheet with
   * nothing more ignores it.
   */
  expanded?: boolean;
  onDone: () => void;
}
