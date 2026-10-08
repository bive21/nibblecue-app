/**
 * THE BOOT SMOKE TEST, THE CORE LOOP: the real `App` on a new family, the baby's food setup
 * finished with its defaults, Today showing the plan's first meal, and that meal served in the
 * sheet's taps (Served, how it went, Save), after which Today marks it served. Every layer at once:
 * the screens, the plan built on the phone, the write through the outbox, the re-read.
 */
import { expect, it } from 'vitest';
import App from '../../../App';
import { signedInWithHousehold } from './account';
import { mount } from './mount';

it('a new family: the food setup, the first plan, and a meal served in a few taps', async () => {
  // about seven months old: past the start of solids
  await signedInWithHousehold(214);
  const app = await mount(<App />);
  await app.until('Today', () => app.has('today.setup'), 15_000);
  await app.press('today.setup.start');
  await app.until('the food setup', () => app.has('profile.next'));
  // six questions, each with a default: Next through them, then "See the plan"
  for (let step = 0; step < 6; step++) {
    await app.press('profile.next');
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  await app.until('the first plan on Today', () => app.has('today.meal.breakfast'), 15_000);
  expect(app.has('today.setup')).toBe(false);
  await app.press('today.serve.breakfast');
  await app.until('the serve sheet', () => app.has('serve.save'));
  await app.press('serve.meal.liked');
  await app.press('serve.save');
  await app.until('breakfast served', () => app.text().includes('Served again'), 15_000);
  expect(app.has('error.screen')).toBe(false);
  await app.unmount();
});
