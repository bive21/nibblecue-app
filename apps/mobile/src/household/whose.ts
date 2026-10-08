/**
 * WHOSE A SLOT IS, WITH MORE THAN ONE BABY IN VIEW (the owner, 2026-09-30, of Up next on Both:
 * *"When on both at once selection, up next shows whose list? At the moment, it does not say whose…
 * But it still should say for who even for both?"*; and of the Schedule on Both).
 *
 * On Both, the list holds each baby's own rhythm (a twin's copied rules are her own) beside the ones
 * the household set for everybody, and two rows reading "Feeding 11:18 PM" said nothing about which
 * baby was fed and which was waiting. The row wears the answer as a label (`NameTag`):
 *
 * - a rule for one baby: that baby's name;
 * - a rule for everybody about a baby's day: the Both chip's own word ("Both", or "All 3");
 * - a rule about the parent (a pump): nobody's, and no label;
 * - one baby in view: no label on anything, as before. The chip at the top already says whose.
 */
import { allChildrenLabel, MODULE_BY_ID, type ModuleId } from '@nibblecue/core';

export interface WhoseView {
  isAll: boolean;
  children: readonly { id: string; name: string }[];
}

export function slotWhose(
  rule: { childId: string | null; activity: string },
  view: WhoseView,
): string | null {
  if (!view.isAll || view.children.length < 2) return null;
  if (rule.childId !== null) return view.children.find(c => c.id === rule.childId)?.name ?? null;
  // a household rule about the parent is not a baby's (the same line the look-back draws)
  if (MODULE_BY_ID[rule.activity as ModuleId]?.group === 'mom') return null;
  return allChildrenLabel(view.children.length);
}
