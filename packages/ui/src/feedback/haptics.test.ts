import { afterEach, describe, expect, it } from 'vitest';
import {
  haptic,
  hapticsEnabled,
  setHapticsDriver,
  setHapticsEnabled,
  type HapticKind,
} from './haptics';

afterEach(() => {
  setHapticsDriver(null);
  setHapticsEnabled(true);
});

describe('haptic (one call for everything that is felt)', () => {
  it('does nothing until the app installs a driver — node, tests, a phone with no motor', () => {
    expect(() => haptic('thud')).not.toThrow();
  });

  it('hands each kind to the driver the app installed', () => {
    const felt: HapticKind[] = [];
    setHapticsDriver(k => felt.push(k));
    haptic('tick');
    haptic('double');
    expect(felt).toEqual(['tick', 'double']);
  });

  it("the parent's switch turns every one of them off, and back on", () => {
    const felt: HapticKind[] = [];
    setHapticsDriver(k => felt.push(k));
    setHapticsEnabled(false);
    expect(hapticsEnabled()).toBe(false);
    haptic('tap');
    setHapticsEnabled(true);
    haptic('success');
    expect(felt).toEqual(['success']);
  });

  it('never throws, whatever the driver does: a haptic is decoration', () => {
    setHapticsDriver(() => {
      throw new Error('no motor');
    });
    expect(() => haptic('warning')).not.toThrow();
  });
});
