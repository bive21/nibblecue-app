/**
 * THE BOOT SMOKE TEST, NOT STARTED YET (the owner, 2026-10-08: "i answered not started yet, and the
 * next question was can your baby swallow food... how do you know about this if you have not
 * started"). A five-month-old whose family has not begun: the setup asks only what a parent can
 * have seen, nothing about swallowing; the plan waits for the signs; Today is a getting-ready page
 * with the signs kept and the first days previewed; and one tap starts the plan with a first-day
 * card that says what to watch for.
 */
import { expect, it } from 'vitest';
import App from '../../../App';
import { signedInWithHousehold } from './account';
import { mount } from './mount';

it('not started yet: signs a parent can see, a plan that waits, and a first day on one tap', async () => {
  await signedInWithHousehold(155);
  const app = await mount(<App />);
  await app.until('Today', () => app.has('today.setup'), 15_000);
  await app.press('today.setup.start');
  await app.until('the food setup', () => app.has('setup.next'));
  await app.press('setup.next');
  await app.until('the first question', () => app.has('setup.where.not_yet'));
  await app.press('setup.where.not_yet');
  await app.press('setup.next');
  await app.until('the signs', () => app.has('setup.sign.head'));
  expect(app.text()).not.toMatch(/swallow/i);
  await app.press('setup.sign.head');
  await app.press('setup.when.signs');
  // how to offer, family food, then allergens (no foods-tried step before the first bite)
  for (let step = 0; step < 3; step++) {
    await app.press('setup.next');
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  expect(app.has('setup.tried.sweet-potato')).toBe(false);
  await app.press('setup.next');
  await app.until('the setup summary', () => app.has('setup.summary'), 15_000);
  await app.press('setup.today');
  await app.until('the getting-ready page', () => app.has('today.signs'), 15_000);
  expect(app.has('today.preview')).toBe(true);
  expect(app.has('today.getready')).toBe(true);
  await app.press('today.ready');
  await app.until('the first food day', () => app.has('today.firstday'), 15_000);
  expect(app.text()).toMatch(/swallowed/);
  expect(app.has('error.screen')).toBe(false);
  await app.unmount();
});
