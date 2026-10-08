/**
 * PULL TODAY DOWN TO SYNC (`pullToSync.ts`; the owner, 2026-09-26). The sync itself is the engine's
 * and is tested with it; what is held here is what the pull promises a parent — the same two halves
 * as "Sync now", in order; a spinner that turns long enough to be seen and never longer than a
 * limit, whatever the network does; and nothing that can throw into the page. Where the page wires
 * it is held by tripwires over `Screen.tsx` and `TodayScreen.tsx`, because this suite renders
 * nothing.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PULL_SYNC, syncFromPull } from './pullToSync';

const here = dirname(fileURLToPath(import.meta.url));
const flat = (...parts: string[]): string =>
  readFileSync(join(here, ...parts), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

/** A clock the test turns by hand: every `sleep` is a timer that fires when the clock passes it. */
function manualClock() {
  let now = 0;
  const timers: { at: number; fire: () => void }[] = [];
  return {
    sleep: (ms: number) =>
      new Promise<void>(resolve => {
        timers.push({ at: now + ms, fire: resolve });
      }),
    async advance(ms: number) {
      now += ms;
      for (const t of timers.filter(x => x.at <= now)) t.fire();
      for (let i = 0; i < 10; i += 1) await Promise.resolve();
    },
  };
}

describe('the pull', () => {
  it('sends what this phone owes, then reads what the others wrote — “Sync now”', async () => {
    const calls: string[] = [];
    const clock = manualClock();
    const runtime = {
      dueNow: async () => {
        calls.push('due');
      },
      flush: async (reason: string) => {
        calls.push(`flush:${reason}`);
      },
      pullNow: async () => {
        calls.push('pull');
      },
    };
    let done = false;
    void syncFromPull(runtime as never, clock.sleep).then(() => {
      done = true;
    });
    await clock.advance(0);
    // EVERYTHING it owes: what waits out a retry's backoff is made due before the send (2026-09-28)
    expect(calls).toEqual(['due', 'flush:manual', 'pull']);
    // a sync that is over at once is still seen: the spinner turns its minimum
    expect(done).toBe(false);
    await clock.advance(PULL_SYNC.minMs);
    expect(done).toBe(true);
  });

  /**
   * THE OWNER'S "7 QUEUED" (2026-09-28). A pull sent only what was already due, so entries waiting
   * out a retry's backoff stayed queued behind a spinner that said it had synced. The wait is
   * cleared first; and a wait that could not be cleared never stops the send.
   */
  it('sends what waits out a backoff too, and sends anyway if that cannot be cleared', async () => {
    const calls: string[] = [];
    const clock = manualClock();
    const runtime = {
      dueNow: () => Promise.reject(new Error('database busy')),
      flush: async (reason: string) => {
        calls.push(`flush:${reason}`);
      },
      pullNow: async () => {
        calls.push('pull');
      },
    };
    void syncFromPull(runtime as never, clock.sleep);
    await clock.advance(0);
    expect(calls).toEqual(['flush:manual', 'pull']);
  });

  it('lets the page go after its limit, however long the network takes', async () => {
    const clock = manualClock();
    const runtime = {
      flush: () => new Promise<void>(() => undefined), // a connection that never answers
      pullNow: async () => undefined,
    };
    let done = false;
    void syncFromPull(runtime as never, clock.sleep).then(() => {
      done = true;
    });
    await clock.advance(PULL_SYNC.maxMs - 1);
    expect(done).toBe(false);
    await clock.advance(1);
    expect(done).toBe(true);
  });

  it('never throws into the page, whatever the sync does', async () => {
    const clock = manualClock();
    const runtime = {
      flush: () => Promise.reject(new Error('offline')),
      pullNow: () => Promise.reject(new Error('offline')),
    };
    const pull = syncFromPull(runtime as never, clock.sleep);
    await clock.advance(PULL_SYNC.minMs);
    await expect(pull).resolves.toBeUndefined();
    const thrower = {
      flush: () => {
        throw new Error('boom');
      },
      pullNow: async () => undefined,
    };
    const again = syncFromPull(thrower as never, clock.sleep);
    await clock.advance(PULL_SYNC.minMs);
    await expect(again).resolves.toBeUndefined();
  });

  it('with no engine to ask, is only the spinner’s short turn', async () => {
    const clock = manualClock();
    let done = false;
    void syncFromPull(null, clock.sleep).then(() => {
      done = true;
    });
    await clock.advance(PULL_SYNC.minMs - 1);
    expect(done).toBe(false);
    await clock.advance(1);
    expect(done).toBe(true);
  });

  it('turns long enough to be seen and short enough never to be waited on', () => {
    expect(PULL_SYNC.minMs).toBeGreaterThanOrEqual(400);
    expect(PULL_SYNC.minMs).toBeLessThanOrEqual(1_000);
    expect(PULL_SYNC.maxMs).toBeLessThanOrEqual(10_000);
  });
});

describe('where the page wires it (tripwires)', () => {
  const screen = flat('..', 'app', 'Screen.tsx');

  // (CuddleCue's Today asks for it; NibbleCue's Today, `screens/nibble/TodayScreen.tsx`, does not
  // yet, so no NibbleCue page is pulled to sync. The page's half is held for when one asks.)
  it('is only where a page asks for it', () => {
    expect(screen).toContain('pullToSync = false,');
    expect(screen).toContain('const pulls = pullToSync && scroll;');
  });

  it('is the platform’s own refresh control, in the theme’s ink, starting the one sync', () => {
    expect(screen).toContain(
      '<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={spinner.ink} colors={[spinner.ink]} progressBackgroundColor={spinner.disc} {...(hides ? { progressViewOffset: padTop } : {})} />',
    );
    expect(screen).toContain('const spinner = pullSpinnerColors(t.color, t.theme);');
    expect(screen).toContain('void syncFromPull(noSync ? null : syncRuntime()).then(() => {');
    // the developer switch that promises nothing talks to the server is kept
    expect(screen).toContain("const noSync = env.off.has('sync');");
    // one sync at a time, however many pulls
    expect(screen).toContain('if (syncing.current) return;');
  });

  it('hands the heart the pull on the native side, and every frame of it', () => {
    expect(screen).toContain('const heart = useMarkPull(scrollY);');
    // the same value moves the bar aside as the page scrolls (Screen.tsx `barShift`), so a page
    // with the top bar drives it on the native side whether or not it can be pulled
    expect(screen).toContain(
      'const nativeY = scrollY ?? (heartMoves || hides ? heart.offset : undefined);',
    );
    expect(screen).toContain(
      'Animated.event([{ nativeEvent: { contentOffset: { y: nativeY } } }], { useNativeDriver: true, listener: report, })',
    );
    expect(screen).toContain('scrollEventThrottle={nativeY ? 16 : 48}');
    expect(screen).toContain('onScrollBeginDrag: () => heart.beginDrag(syncing.current),');
    expect(screen).toContain(
      'onScrollEndDrag: (e: NativeSyntheticEvent<NativeScrollEvent>) => heart.endDrag(e.nativeEvent.contentOffset.y),',
    );
    expect(screen).toContain(
      '{...(pulls && heart.style !== undefined ? { markMotion: heart.style } : {})}',
    );
  });

  // (no Night light in NibbleCue, so the heart keeps no hidden door)
});
