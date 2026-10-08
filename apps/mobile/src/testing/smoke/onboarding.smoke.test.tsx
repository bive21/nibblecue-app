/**
 * THE BOOT SMOKE TEST, SETUP: an account verified but with no family yet opens on NibbleCue's
 * one-page setup (you, your baby, the birth date), with its invite-code door.
 */
import { expect, it } from 'vitest';
import App from '../../../App';
import { verifiedWithoutHousehold } from './account';
import { mount } from './mount';

it('verified with no family yet: lands on the one-page setup', async () => {
  await verifiedWithoutHousehold();
  const app = await mount(<App />);
  await app.until('setup', () => app.has('onboard'), 15_000);
  expect(app.has('onboard.name')).toBe(true);
  expect(app.has('onboard.child')).toBe(true);
  expect(app.has('onboard.finish')).toBe(true);
  expect(app.has('onboard.code')).toBe(true);
  expect(app.has('error.screen')).toBe(false);
  await app.unmount();
});
