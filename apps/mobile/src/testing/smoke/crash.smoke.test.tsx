/**
 * THE ERROR PAGE AND THE CRASH QUEUE, RENDERED (docs/CRASH_REPORTS.md): a component that throws
 * while it draws brings up the calm page in place of the app, the crash is on the phone's queue with
 * the baby's name taken out, and "Try again" mounts everything below the page afresh.
 */
import { expect, it } from 'vitest';
import { Text } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ErrorScreen } from '../../app/ErrorScreen';
import { noteCrashNames, noteCrashRoute } from '../../crash/context';
import { CRASH_COPY } from '../../crash/copy';
import { crashStore } from '../../crash/deviceStore';
import { loadCrashes } from '../../crash/store';
import { mount } from './mount';

let explode = true;
function Fragile() {
  if (explode) throw new TypeError('Emma cannot be drawn');
  return <Text testID="fragile.ok">drawn</Text>;
}

it('a render error: the calm page comes up, the crash is queued with no name in it, and Try again remounts', async () => {
  noteCrashNames(['Emma']);
  noteCrashRoute('Today');
  const app = await mount(
    <SafeAreaProvider>
      <ErrorScreen>
        <Fragile />
      </ErrorScreen>
    </SafeAreaProvider>,
  );
  await app.until('the error page', () => app.has('error.screen'));
  expect(app.text()).toContain(CRASH_COPY.body);
  expect(app.text()).not.toContain('Emma');

  // the write is not waited for by the page (`crash/record.ts`), so the queue is read until it lands
  let queued = await loadCrashes(crashStore, Date.now());
  for (let i = 0; i < 40 && queued.length === 0; i++) {
    await new Promise(resolve => setTimeout(resolve, 25));
    queued = await loadCrashes(crashStore, Date.now());
  }
  expect(queued).toHaveLength(1);
  expect(queued[0]).toMatchObject({
    error_name: 'TypeError',
    message: '[name] cannot be drawn',
    source: 'render',
    fatal: true,
    route: 'Today',
    platform: 'web',
  });
  expect(queued[0]?.stack).toContain('components: Fragile');

  explode = false;
  await app.press('error.retry');
  await app.until('the page drawn again', () => app.has('fragile.ok'));
  expect(app.has('error.screen')).toBe(false);
  await app.unmount();
});
