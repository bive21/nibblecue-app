/**
 * `useModalGate(visible, leaveMs)`: the `visible` a native modal should actually use (`modalGate.ts`
 * says why). On an iPhone, a modal asked to open while another is leaving opens once none is; one
 * let go counts as leaving for its exit and the system's dismissal. Elsewhere it is `visible` itself.
 *
 * THE SAME TAP, BOTH WAYS (2026-10-07, the owner: "the mark as used in milk stash still produces
 * error in my iphone"). The first version registered a modal as leaving only on the render AFTER it
 * was let go, and let a modal asked to open look at the gate in the render it was asked in — so a
 * tap that closes one sheet and opens another ("Use for a bottle" on a stored bag) found the gate
 * empty, and the two crossed exactly as before. Now the leave is registered in the very effect that
 * sees `visible` drop, and an opening modal looks at the gate a tick later, once every effect of
 * that commit — the closing sheet's leave among them — has run, whatever order the tree runs them
 * in. A modal that mounts already visible goes through the same tick: the cost is one frame.
 */
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { IOS_DISMISS_MS, gateVisibility, modalGate } from './modalGate';

export function useModalGate(visible: boolean, exitMs = 0): boolean {
  const ios = Platform.OS === 'ios';
  const [shown, setShown] = useState(() => visible && !ios);
  const shownRef = useRef(shown);
  shownRef.current = shown;
  useEffect(() => {
    if (!ios) {
      setShown(visible);
      return undefined;
    }
    return gateVisibility(modalGate, visible, shownRef.current, exitMs + IOS_DISMISS_MS, setShown);
  }, [visible, ios, exitMs]);
  return ios ? shown : visible;
}
