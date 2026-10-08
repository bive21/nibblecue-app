/**
 * A CONTROL THAT BREATHES ONCE WHEN IT BECOMES THE THING TO TAP (the owner, 2026-09-26, of setup's
 * Continue). The breath and the rule are PURE (`nudge.ts`) and held here; that it is once per
 * mount, armed only after the control has arrived, still under reduce motion and in the amber
 * Night, a transform on the native driver and nothing a finger or a screen reader meets, is held
 * by tripwires over `Nudge.tsx` (no renderer here — `interaction.test.ts` says why).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sampleFrame } from './keyframes';
import { NUDGE_ARM_MS, NUDGE_KEYS, NUDGE_MS, NUDGE_SWELL, nudgeFrames, nudges } from './nudge';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const STEPS = Array.from({ length: 401 }, (_, i) => i / 400);

describe('when it breathes', () => {
  it('when the cue turns true, once the control has arrived, the first time only', () => {
    expect(nudges(false, true, true, false, false)).toBe(true);
    // already true: a page that arrives ready breathes nothing
    expect(nudges(true, true, true, false, false)).toBe(false);
    // turning false is not a cue
    expect(nudges(true, false, true, false, false)).toBe(false);
    // before it is armed: a value the page wrote as it opened is not the parent's answer
    expect(nudges(false, true, false, false, false)).toBe(false);
    // and once: an answer undone and given again does not breathe a second time
    expect(nudges(false, true, true, true, false)).toBe(false);
  });

  it('never under reduce motion or in the amber Night', () => {
    expect(nudges(false, true, true, false, true)).toBe(false);
  });
});

describe('the breath', () => {
  const scale = nudgeFrames().scale;
  const values = STEPS.map(t => sampleFrame(scale, t));

  it('starts and ends at the control’s own size', () => {
    expect(NUDGE_KEYS[0]).toEqual([0, 1]);
    expect(NUDGE_KEYS[NUDGE_KEYS.length - 1]).toEqual([1, 1]);
    expect(values[0]).toBe(1);
    expect(values[values.length - 1]).toBe(1);
  });

  it('is small: a three-per-cent swell and the barest settle under its size', () => {
    expect(Math.max(...values)).toBeCloseTo(NUDGE_SWELL, 9);
    expect(NUDGE_SWELL).toBeLessThanOrEqual(1.04);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0.99);
  });

  it('is short, and armed only after the page it is on has finished arriving', () => {
    expect(NUDGE_MS).toBeLessThanOrEqual(600);
    expect(NUDGE_ARM_MS).toBeGreaterThanOrEqual(300);
    expect(NUDGE_ARM_MS).toBeLessThanOrEqual(600);
  });
});

describe('the component (tripwires over Nudge.tsx)', () => {
  const src = withoutComments(read('Nudge.tsx'));
  const flat = src.replace(/\s+/g, ' ');

  it('remembers the cue it opened with, arms after NUDGE_ARM_MS, and breathes once', () => {
    expect(flat).toContain('const was = useRef(cue);');
    expect(flat).toContain('armed.current = true; }, NUDGE_ARM_MS);');
    expect(flat).toContain(
      'const play = nudges(was.current, cue, armed.current, done.current, still);',
    );
    expect(flat).toContain('done.current = true;');
  });

  it('starts afresh on a new page without remounting what it wraps', () => {
    // the page it opens with is remembered, disarmed, and armed again once it has arrived
    expect(flat).toContain(
      'was.current = cue; armed.current = false; done.current = false; breath.setValue(1);',
    );
    expect(flat).toContain('}, [page, breath]);');
    // and it never keys its own child: the control inside is the same control on every page
    expect(flat).not.toMatch(/key=/);
    // the page's reset runs before the cue is answered, in the commit the page changes in
    expect(flat.indexOf('}, [page, breath]);')).toBeLessThan(flat.indexOf('const play = nudges('));
  });

  it('is still under reduce motion and in the amber Night, and never left mid-breath', () => {
    expect(flat).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(flat).toContain('run.stop(); breath.setValue(1);');
  });

  it('only scales — never a sideways shake, which reads as "wrong" — on the native driver', () => {
    expect(flat).toContain('transform: [{ scale: num(breath, nudgeFrames().scale) }]');
    expect(flat).not.toMatch(/translateX|translateY|rotate/);
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
  });

  it('adds nothing a finger or a screen reader meets, and is not felt', () => {
    expect(src).not.toMatch(/accessibilityLabel|accessibilityRole|accessible\b|onPress|haptic/);
  });
});
