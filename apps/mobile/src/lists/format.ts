/**
 * `9:00 PM` from an `HH:MM`, on the viewer's clock, without inventing a date.
 *
 * Shared by the checklist screen, its sheet and Today's strip. It lives here rather than on
 * the screen so the sheet does not import the screen that renders it: Metro warned about that
 * cycle on every boot, and a cycle's imports are `undefined` until the second module finishes
 * evaluating, which is the kind of bug that shows up only in a release bundle.
 */
import { formatClock } from '@nibblecue/ui';

export function clockFor(hhmm: string, clock24: boolean): string {
  const [h, m] = hhmm.split(':');
  const at = new Date(2000, 0, 1, Number(h ?? 0), Number(m ?? 0));
  return formatClock(at.getTime(), clock24);
}
