/**
 * THE BOOT SMOKE TEST, SIGNED IN: an account made through the in-app test backend with a family,
 * then the real `App` mounted on it, offline. It lands on Today, which asks for the baby's food
 * setup; that page opens; and each tab in the bar is tapped and has to draw its own screen: every
 * tab's screen and every provider above it, mounted together, which no other test does.
 */
import { expect, it } from 'vitest';
import App from '../../../App';
import { signedInWithHousehold } from './account';
import { mount } from './mount';

it('signed in with a family: lands on Today, the food setup opens, and every tab mounts', async () => {
  await signedInWithHousehold();
  const app = await mount(<App />);
  await app.until('Today', () => app.has('today'), 15_000);
  await app.until('the food setup card', () => app.has('today.setup'));
  // each tab's own screen, reached by its cell in the bar, as a thumb reaches it
  for (const [tab, screen] of [
    ['plan', 'plantab'],
    ['foods', 'foods'],
    ['shopping', 'shopping'],
    ['more', 'more'],
  ] as const) {
    await app.press(`tab.${tab}`);
    await app.until(`the ${tab} tab`, () => app.has(screen));
  }
  await app.press('tab.today');
  await app.until('Today again', () => app.has('today.setup'));
  // and the food setup opens from it, on its first question
  await app.press('today.setup.start');
  await app.until('the food setup', () => app.has('profile'));
  expect(app.has('profile.next')).toBe(true);
  expect(app.has('error.screen')).toBe(false);
  await app.unmount();
});
