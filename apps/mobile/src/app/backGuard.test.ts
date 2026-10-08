/**
 * NO BACK WHILE A PAGE IS STILL SLIDING (the owner, 2026-10-01, Android: Family opened from More and
 * closed at once with Back left the screen black until Expo Go was closed; `backGuard.ts` has the
 * account). The hold is pure (`backHold.ts`), so node holds it to its rules here, and the wiring
 * that makes the app use it is read from the files that carry it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { BACK_HOLD_MS, createBackHold } from './backHold';

const here = dirname(fileURLToPath(import.meta.url));
const flat = (rel: string) => readFileSync(join(here, rel), 'utf8').replace(/\s+/g, ' ');

/** A phone for the hold: a clock, a timer queue and Android's Back, all by hand. */
function phone(withBack = true) {
  let now = 1_000;
  const timers: { at: number; run: () => void; live: boolean }[] = [];
  const listeners: (() => boolean)[] = [];
  const hold = createBackHold({
    listen: held => {
      if (!withBack) return null;
      listeners.push(held);
      return { remove: () => listeners.splice(listeners.indexOf(held), 1) };
    },
    schedule: (run, ms) => {
      const t = { at: now + ms, run, live: true };
      timers.push(t);
      return t;
    },
    cancel: t => {
      (t as { live: boolean }).live = false;
    },
    now: () => now,
  });
  return {
    hold,
    /** Android asks the newest listener first; true is handled. */
    back: (): 'held' | 'navigates' =>
      [...listeners].reverse().some(l => l()) ? 'held' : 'navigates',
    listeners: () => listeners.length,
    advance: (ms: number) => {
      now += ms;
      for (const t of timers)
        if (t.live && t.at <= now) {
          t.live = false;
          t.run();
        }
    },
  };
}

describe('a Back while a page slides', () => {
  it('is held from the slide’s start to its end, and works the moment the last slide ends', () => {
    const p = phone();
    expect(p.back()).toBe('navigates');
    // a push: the page coming in and the page going out both start
    p.hold.hold();
    p.hold.hold();
    expect(p.hold.held()).toBe(true);
    expect(p.back()).toBe('held');
    p.advance(200);
    p.hold.end();
    expect(p.back()).toBe('held');
    p.hold.end();
    expect(p.hold.held()).toBe(false);
    expect(p.back()).toBe('navigates');
    expect(p.listeners()).toBe(0);
  });

  it('lets go after BACK_HOLD_MS whatever happens, so a lost end never leaves Back dead', () => {
    const p = phone();
    p.hold.hold();
    p.advance(BACK_HOLD_MS - 1);
    expect(p.back()).toBe('held');
    p.advance(1);
    expect(p.hold.held()).toBe(false);
    expect(p.back()).toBe('navigates');
    expect(p.listeners()).toBe(0);
    // and an end that comes late changes nothing
    p.hold.end();
    expect(p.back()).toBe('navigates');
  });

  it('holds no longer than any slide takes, and long enough for the longest', () => {
    // Android 13's push and pop are 450 ms; a hold is never felt as a stuck button
    expect(BACK_HOLD_MS).toBeGreaterThan(450);
    expect(BACK_HOLD_MS).toBeLessThanOrEqual(800);
  });

  it('counts from the last slide to start: a second push restarts the hold', () => {
    const p = phone();
    p.hold.hold();
    p.advance(600);
    p.hold.hold();
    p.advance(600);
    expect(p.back()).toBe('held');
    p.advance(100);
    expect(p.back()).toBe('navigates');
  });

  it('listens once, however many pages slide, and only while one does', () => {
    const p = phone();
    expect(p.listeners()).toBe(0);
    p.hold.hold();
    p.hold.hold();
    p.hold.hold();
    expect(p.listeners()).toBe(1);
    p.hold.release();
    expect(p.listeners()).toBe(0);
  });

  it('on a phone with no Back button, only answers whether a page is sliding', () => {
    const p = phone(false);
    p.hold.hold();
    expect(p.hold.held()).toBe(true);
    expect(p.listeners()).toBe(0);
    p.hold.end();
    expect(p.hold.held()).toBe(false);
  });
});

describe('the app holds Back while its pages slide', () => {
  it('holds from every root page’s transition start to its end', () => {
    const nav = flat('navigation.tsx');
    expect(nav).toContain("import { endHold, holdBack } from './backGuard';");
    expect(nav).toContain(
      'screenListeners={{ transitionStart: holdBack, transitionEnd: endHold }}',
    );
  });

  it('adds its Back listener on Android only, when a slide starts', () => {
    const guard = flat('backGuard.ts');
    expect(guard).toContain(
      "listen: held => Platform.OS === 'android' ? BackHandler.addEventListener('hardwareBackPress', held) : null,",
    );
  });

  it('keeps a page’s own back arrow still while the page slides in', () => {
    const screen = flat('Screen.tsx');
    expect(screen).toContain('onPress={() => { if (!backHeld()) nav.goBack(); }}');
  });

  it('draws the tabs as plain views, so a Back has no tab fragment to rebuild', () => {
    expect(flat('navigation.tsx')).toContain('detachInactiveScreens={false}');
  });
});
