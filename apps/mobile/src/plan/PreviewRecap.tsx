/**
 * THE RECAP LINE, where a card wants it drawn and not worded: Today's "preview ended" card
 * (2026-09-28). The words are `previewRecap` (`promptCopy.ts`), the count under them this phone's
 * own (`plusUsage.ts`); the trial-end sheets word it through `promptCopy` with the rest of their
 * copy. Nothing is drawn while the count is read, and nothing when nothing was used: a card that
 * says "In your preview:" and then nothing would be a reproach.
 */
import { BodySm } from '@nibblecue/ui';
import { usePlusUsage } from './PlusTag';
import { previewRecap } from './promptCopy';

export function PreviewRecapLine({ testID }: { testID: string }) {
  const line = previewRecap(usePlusUsage(true));
  return line === null ? null : <BodySm testID={testID}>{line}</BodySm>;
}
