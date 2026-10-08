/**
 * Mounting the app for the boot smoke test, and reading it the way a test can: what the page says,
 * which `testID`s are on it, and a tap. React's own `act` drives it, so every effect, timer and
 * promise the app starts runs before a read. Waiting fails the moment the error page comes up
 * (`app/ErrorScreen.tsx`), with what it said, rather than at the timeout.
 */
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

export interface Mounted {
  /** Everything the page says, as one string. */
  text(): string;
  /** Whether a `testID` is on the page (react-native-web writes it as `data-testid`). */
  has(testId: string): boolean;
  /** Waits until `ok()` holds, letting effects, timers and promises run; throws on timeout. */
  until(what: string, ok: () => boolean, ms?: number): Promise<void>;
  /** Taps the control with this `testID`, the way a finger does on react-native-web. */
  press(testId: string): Promise<void>;
  unmount(): Promise<void>;
}

export async function mount(element: ReactElement): Promise<Mounted> {
  const host = document.createElement('div');
  document.body.appendChild(host);
  let root: Root | null = null;
  await act(async () => {
    root = createRoot(host);
    root.render(element);
  });
  // the whole document, not just the host: a sheet is a Modal, which react-native-web draws in a
  // portal on `document.body`, outside the node the app was mounted in
  const text = (): string => document.body.textContent ?? '';
  const has = (testId: string): boolean =>
    document.body.querySelector(`[data-testid="${testId}"]`) !== null;
  return {
    text,
    has,
    async until(what, ok, ms = 10_000) {
      const end = Date.now() + ms;
      while (!ok()) {
        if (has('error.screen'))
          throw new Error(`the error screen came up waiting for ${what}:\n${text()}`);
        if (Date.now() > end)
          throw new Error(`timed out waiting for ${what}; the page says:\n${text()}`);
        await act(async () => {
          await new Promise(resolve => setTimeout(resolve, 25));
        });
      }
    },
    async press(testId) {
      const el = document.body.querySelector(`[data-testid="${testId}"]`);
      if (el === null) throw new Error(`nothing on the page has testID ${testId}:\n${text()}`);
      await act(async () => {
        for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
          el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0 }));
      });
    },
    async unmount() {
      await act(async () => root?.unmount());
      host.remove();
    },
  };
}
