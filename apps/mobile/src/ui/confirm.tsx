/**
 * `useConfirm`: THE APP'S OWN CONFIRMATION, ASKED FROM WHERE IT IS MOUNTED (the owner, 2026-09-29:
 * *"the confirmation box is not in our ordinary design, im from android, and it look like an old
 * text box that android has"*; docs/DESIGN_SYSTEM.md §5.1). No screen, sheet or hook in the app
 * calls React Native's `Alert` any more (`confirm.scan.test.ts` fails the build if one does).
 *
 *     const confirm = useConfirm();
 *     const ok = await confirm.ask({ title, body, action, destructive });
 *     …
 *     {confirm.element}
 *
 * `ask` resolves true on the action and false on anything else (`confirmQueue` in the design
 * system has the rules); `element` is the sheet that asks, and it is mounted WHERE THE QUESTION IS
 * ASKED FROM, like `useTimePicker`'s picker:
 *
 *   - from a screen, on the screen;
 *   - from inside a sheet, INSIDE THAT SHEET. On iOS a React Native Modal presents from the view
 *     controller its host view sits in; mounted beside an open BottomSheet it is refused by UIKit
 *     without a word, and the question never appears. `confirm.scan.test.ts` holds every element
 *     to this, beside the time picker's own scan.
 *   - from nowhere in particular — a CueCoin's start, a toast's "+ Liam" after its sheet has gone —
 *     through the shell (`useShell().confirm`), which puts whatever is up away first and asks when
 *     it has gone, as it opens every overlay.
 *
 * A question whose element is not on the screen is Cancel at once, and one still up when its screen
 * or sheet goes is Cancel then: never a promise that waits for ever on a sheet nobody can see.
 */
import {
  ConfirmSheet,
  confirmQueue,
  SHEET_DURATION_MS,
  type Confirm,
  type ConfirmQueue,
  type ConfirmSheetProps,
} from '@nibblecue/ui';
import { useState, useSyncExternalStore, type ReactNode } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export interface ConfirmHost {
  /** Asks; resolves with the answer. The same function for the host's whole life. */
  ask: Confirm;
  /** The sheet that asks: mounted where the question is asked from (see the header). */
  element: ReactNode;
}

/** The design system's sheet, clear of the phone's own buttons (every sheet is: `sheets.test.ts`). */
export function ConfirmHostSheet(props: Omit<ConfirmSheetProps, 'bottomInset'>) {
  const insets = useSafeAreaInsets();
  return <ConfirmSheet {...props} bottomInset={insets.bottom} />;
}

/** The sheet, subscribed to its queue: the only thing that redraws when a question comes and goes. */
function QueuedConfirm({ queue, testID }: { queue: ConfirmQueue; testID: string }) {
  const request = useSyncExternalStore(queue.subscribe, queue.current, queue.current);
  return <ConfirmHostSheet request={request} onAnswer={queue.answer} testID={testID} />;
}

export function useConfirm(testID = 'confirm'): ConfirmHost {
  // one queue for the host's life; the next question waits out the last one's slide away
  const [queue] = useState(() => confirmQueue({ gapMs: SHEET_DURATION_MS }));
  return { ask: queue.ask, element: <QueuedConfirm queue={queue} testID={testID} /> };
}
