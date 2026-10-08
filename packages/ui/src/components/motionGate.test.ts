import { describe, expect, it } from 'vitest';
import type { ThemeName } from '../theme/theme';
import { appPutAway, gateOpen, loopRuns, motionAwake } from './motionGate';

const THEMES: ThemeName[] = ['light', 'dark', 'night'];

describe('appPutAway: which app states stop a loop', () => {
  it('stops in the background and behind the system sheet', () => {
    expect(appPutAway('background')).toBe(true);
    expect(appPutAway('inactive')).toBe(true);
  });

  it('runs when active, and when the phone has not answered yet', () => {
    // a loop that never hears a change must not be put away forever
    for (const s of ['active', 'unknown', 'extension', null, undefined]) {
      expect(appPutAway(s)).toBe(false);
    }
  });
});

describe('gateOpen: nested gates', () => {
  it('is open only when every gate above is', () => {
    expect(gateOpen(true, true)).toBe(true);
    expect(gateOpen(true, false)).toBe(false);
    expect(gateOpen(false, true)).toBe(false);
    expect(gateOpen(false, false)).toBe(false);
  });
});

describe('motionAwake: a clock that feeds only the eye', () => {
  it('runs only while the screen is in front and the app is open', () => {
    expect(motionAwake({ focused: true, appActive: true })).toBe(true);
    expect(motionAwake({ focused: false, appActive: true })).toBe(false);
    expect(motionAwake({ focused: true, appActive: false })).toBe(false);
    expect(motionAwake({ focused: false, appActive: false })).toBe(false);
  });
});

describe('loopRuns: a decorative loop', () => {
  it('turns only when awake and neither reduce motion nor Night asks for stillness', () => {
    for (const focused of [true, false]) {
      for (const appActive of [true, false]) {
        for (const reduceMotion of [true, false]) {
          for (const theme of THEMES) {
            const runs = loopRuns({ focused, appActive, reduceMotion, theme });
            expect(runs).toBe(focused && appActive && !reduceMotion && theme !== 'night');
          }
        }
      }
    }
  });

  it('is never on when a timer digit would stop: awake is the weaker of the two', () => {
    // every state where a loop runs is one where the ticking digits run too — never the reverse
    for (const focused of [true, false]) {
      for (const appActive of [true, false]) {
        for (const reduceMotion of [true, false]) {
          for (const theme of THEMES) {
            if (loopRuns({ focused, appActive, reduceMotion, theme })) {
              expect(motionAwake({ focused, appActive })).toBe(true);
            }
          }
        }
      }
    }
    expect(loopRuns({ focused: true, appActive: true, reduceMotion: true, theme: 'light' })).toBe(
      false,
    );
    expect(motionAwake({ focused: true, appActive: true })).toBe(true);
  });
});
