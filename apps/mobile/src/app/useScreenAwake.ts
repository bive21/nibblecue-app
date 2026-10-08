/**
 * THE MOTION GATE'S QUESTION, ASKED FROM A SCREEN'S OWN BODY (docs/DESIGN_SYSTEM.md §7.1).
 *
 * `Screen` wraps each page's content in a `MotionGate`, so anything drawn INSIDE a page reads
 * `useMotionAwake()` and learns whether the page is in front. A screen component's own hooks run
 * above that gate — the page renders its `Screen`, not the other way round — so a clock kept there
 * asks the navigator directly: this page focused, and the app open. Same rule, same answer
 * (`motionAwake`), one hop further up.
 */
import { motionAwake, useAppActive } from '@nibblecue/ui';
import { useIsFocused } from '@react-navigation/native';

/** This page is in front and the app is open: a clock that only feeds the eye may run. */
export function useScreenAwake(): boolean {
  const focused = useIsFocused();
  const appActive = useAppActive();
  return motionAwake({ focused, appActive });
}
