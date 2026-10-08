/**
 * THE ONE QUESTION EVERY LOOP ASKS: is anybody looking? (`motionGate.ts` has the rules and says why;
 * docs/DESIGN_SYSTEM.md §7.1.)
 *
 *   `MotionGate`         a screen says whether it is the one in front. The app's `Screen` wraps every
 *                        page in one, open while the navigator has it focused; gates nest, so a gate
 *                        inside a closed one is closed. Outside any gate — a sheet the shell draws
 *                        over everything, the tab bar, the boot screen — the answer is "in front".
 *   `useAppActive`       the app is open: one `AppState` listener for every reader, started by the
 *                        first and stopped with the last, so forty loops cost one subscription.
 *   `useMotionAwake`     in front and open: for a clock that feeds only the eye but is information
 *                        (a timer's digits) or a promise that something is happening (a loader).
 *   `useMotionActive`    awake, and neither reduce motion nor the amber Night: for a decorative loop.
 *
 * A LOOP READS ONE OF THE LAST TWO AND STARTS ITS CLOCK ONLY WHILE IT IS TRUE. It keeps what it
 * DRAWS on its own still rule, so a paused loop is drawn exactly as it would be mid-rest and nothing
 * on the screen changes shape when the page comes back to the front.
 */
import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, type AppStateStatus, type NativeEventSubscription } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { appPutAway, gateOpen, loopRuns, motionAwake } from './motionGate';

/** In front, unless a gate above says otherwise. */
const GateContext = createContext(true);

export interface MotionGateProps {
  /** This part of the tree is on screen: the page is the navigator's focused one. */
  active: boolean;
  children: ReactNode;
}

/** Tells every loop beneath it whether its page is the one in front. */
export function MotionGate({ active, children }: MotionGateProps) {
  const outer = useContext(GateContext);
  return <GateContext.Provider value={gateOpen(outer, active)}>{children}</GateContext.Provider>;
}

/* ------------------------------------------------------------- one AppState listener for all */

const readers = new Set<() => void>();
let subscription: NativeEventSubscription | null = null;
/** The last state the listener heard; read only while it is listening. */
let heard: AppStateStatus | null = null;

function subscribe(reader: () => void): () => void {
  readers.add(reader);
  if (subscription === null) {
    heard = AppState.currentState;
    subscription = AppState.addEventListener('change', state => {
      heard = state;
      for (const r of [...readers]) r();
    });
  }
  return () => {
    readers.delete(reader);
    if (readers.size > 0 || subscription === null) return;
    subscription.remove();
    subscription = null;
    heard = null;
  };
}

// a boolean, so React re-renders a reader only when open and put away actually swap
const readActive = (): boolean =>
  !appPutAway(subscription === null ? AppState.currentState : heard);

/** Whether the app is open in front of the parent (`appPutAway` says what "put away" is). */
export function useAppActive(): boolean {
  return useSyncExternalStore(subscribe, readActive, readActive);
}

/** Whether this page is the one in front, by the gates above it (true outside every gate). */
export function useScreenInFront(): boolean {
  return useContext(GateContext);
}

/** In front and open: a clock that feeds only the eye may run (`motionAwake`). */
export function useMotionAwake(): boolean {
  const focused = useScreenInFront();
  const appActive = useAppActive();
  return motionAwake({ focused, appActive });
}

/** Awake and not still: a decorative loop may turn (`loopRuns`). */
export function useMotionActive(): boolean {
  const t = useTheme();
  const focused = useScreenInFront();
  const appActive = useAppActive();
  return loopRuns({ focused, appActive, reduceMotion: t.reduceMotion, theme: t.theme });
}
