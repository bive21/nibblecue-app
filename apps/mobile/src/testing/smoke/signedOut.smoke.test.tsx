/**
 * THE BOOT SMOKE TEST, FIRST LAUNCH (docs/PREFLIGHT.md §8): the real `App`, every provider and the
 * root navigator, mounted with nobody signed in, lands on sign in (docs/AUTH_AND_TRIAL.md §2).
 * `vitest.smoke.config.mts` says what is substituted to run it in node.
 */
import { expect, it } from 'vitest';
import App from '../../../App';
import { mount } from './mount';

it('signed out: the app mounts and lands on sign in', async () => {
  const app = await mount(<App />);
  await app.until('the sign-in screen', () => app.has('auth'), 15_000);
  expect(app.has('error.screen')).toBe(false);
  await app.unmount();
});
