/**
 * THE SHARED END RULE (`timerEnd.ts`), WIRED TO THE APP: the timer actions' stop, the toast, and,
 * from Today only, the pump's output form. One hook, so the long-run card's **It ended** and the
 * running sheet's **End time** cannot be wired to different stops, toasts or forms.
 *
 * `inSheet` is the pump's case (feeding C8 / timers 1): inside the pump's own sheet the output form
 * is already on the screen, and opening the sheet over itself used to close it and let the stop go.
 */
import { useShell } from '../../app/shell';
import type { TimerNow } from '../../db/queries/today';
import { useToast } from '../../ui/toast';
import { endTimerAt, type EndOutcome } from './timerEnd';
import { useTimerActions } from './useTimerActions';

export function useEndTimer({
  inSheet,
  onEnded,
}: {
  inSheet: boolean;
  onEnded?: (() => void) | undefined;
}): (timer: TimerNow, endMs: number) => Promise<EndOutcome> {
  const actions = useTimerActions();
  const toast = useToast();
  const shell = useShell();
  return (timer, endMs) =>
    endTimerAt(timer, endMs, Date.now(), {
      stop: actions.stop,
      say: sentence => toast.show(sentence),
      ...(inSheet ? {} : { openOutput: () => shell.openQuickEntry('pump') }),
      ...(onEnded ? { onEnded } : {}),
    });
}
