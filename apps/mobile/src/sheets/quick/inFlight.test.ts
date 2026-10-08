/**
 * THE DOUBLE TAP IS ONE WRITE (care M1, timers 16 and 17): two requests for the same timer that
 * overlap run once, and the key is free again as soon as the first settles — so a failed stop can
 * be retried and a later, deliberate one is not refused.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { createInFlight, endKey, startKey } from './inFlight';

const here = dirname(fileURLToPath(import.meta.url));

describe('createInFlight', () => {
  it('runs a second overlapping request for the same key zero times', async () => {
    const guard = createInFlight();
    let writes = 0;
    let release: () => void = () => undefined;
    const slow = () =>
      new Promise<string>(resolve => {
        writes += 1;
        release = () => resolve('written');
      });
    const first = guard.run('end:t1', slow);
    const second = guard.run('end:t1', slow);
    expect(await second).toBeNull();
    expect(guard.has('end:t1')).toBe(true);
    release();
    expect(await first).toBe('written');
    expect(writes).toBe(1);
    expect(guard.has('end:t1')).toBe(false);
  });

  it('lets different timers write at once — two twins stopped together are two stops', async () => {
    const guard = createInFlight();
    const [a, b] = await Promise.all([
      guard.run(endKey('emma-sleep'), () => Promise.resolve(1)),
      guard.run(endKey('liam-sleep'), () => Promise.resolve(2)),
    ]);
    expect([a, b]).toEqual([1, 2]);
  });

  it('lets the key go when the write fails, so the parent can try again', async () => {
    const guard = createInFlight();
    await expect(guard.run('end:t1', () => Promise.reject(new Error('disk')))).rejects.toThrow(
      'disk',
    );
    expect(await guard.run('end:t1', () => Promise.resolve('second try'))).toBe('second try');
  });

  it('keys a start by kind and child, with the pump as the household’s', () => {
    expect(startKey('sleep', 'emma')).toBe('start:sleep:emma');
    expect(startKey('pump', null)).toBe('start:pump:household');
    expect(startKey('sleep', 'emma')).not.toBe(startKey('sleep', 'liam'));
  });
});

describe('every timer write goes through the one set', () => {
  const actions = readFileSync(join(here, 'useTimerActions.ts'), 'utf8');

  it('guards start, stop, the pump’s finish and discard', () => {
    expect(actions).toContain('timerWrites.run(startKey(args.type, args.childId)');
    // stop, the running pump's finish and discard all hold the SAME key: one timer ends once
    expect(actions.match(/timerWrites\.run\(endKey\(timer\.id\)/g)?.length ?? 0).toBe(3);
    expect(actions).toContain(
      'return timer === null ? write() : timerWrites.run(endKey(timer.id), write);',
    );
  });
});
