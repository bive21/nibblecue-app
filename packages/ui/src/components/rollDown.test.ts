/**
 * THE ROW THAT ROLLS DOWN FROM UNDER A CONTROL (the owner, 2026-09-26, of the bottle sheet's
 * leftover: *"instead of instantly summon, it rolls down from the button aboe ive (some left)"*).
 * The phases, the clock and the frames are PURE (`rollDown.ts`) and sampled here as
 * `Animated.Value#interpolate` samples them. That the height rides the JavaScript driver and
 * nothing else does, that the content is out of reach on its way up and out of the tree when rolled
 * up, and that nothing moves under reduce motion or in the amber Night, are held by tripwires over
 * `RollDown.tsx`, since this suite has no renderer (`interaction.test.ts`).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import tokens from '../theme/design-tokens.json';
import { themeNames } from '../theme/theme';
import type { Frame } from './dayNightSwitch';
import {
  planRoll,
  ROLL_DOWN_MS,
  ROLL_EASE,
  ROLL_FADE,
  ROLL_UP_MS,
  rollAt,
  rollClipped,
  rollDrawn,
  rollFrames,
  rollHidden,
  rollMs,
  rollPhase,
  rollSettled,
  type RollPhase,
} from './rollDown';
import { easeAt } from './themeSkyToggle';
import { motionStill } from './tickDraw';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const component = withoutComments(read('RollDown.tsx'));
const flat = component.replace(/\s+/g, ' ');

function sample(fr: Frame, p: number): number {
  const xs = fr.inputRange;
  const ys = fr.outputRange;
  const last = xs.length - 1;
  if (p <= (xs[0] ?? 0)) return ys[0] ?? 0;
  if (p >= (xs[last] ?? 1)) return ys[last] ?? 0;
  let i = 0;
  while ((xs[i + 1] ?? 1) < p) i += 1;
  const [x0, x1, y0, y1] = [xs[i] ?? 0, xs[i + 1] ?? 1, ys[i] ?? 0, ys[i + 1] ?? 0];
  return y0 + ((p - x0) / (x1 - x0)) * (y1 - y0);
}

const STEPS = Array.from({ length: 1001 }, (_, i) => i / 1000);
const PHASES: readonly RollPhase[] = ['closed', 'opening', 'open', 'closing'];
/** The leftover's own heights: one row and its line, a twin's two rows, triplets' three. */
const HEIGHTS = [0, 44, 72, 131, 190];

describe('the phases', () => {
  it('rolls down on open and up on close, and turns round mid-move from where it is', () => {
    expect(rollPhase('closed', true, false)).toBe('opening');
    expect(rollPhase('open', false, false)).toBe('closing');
    // a change of mind mid-move goes back the way it came, never to rest in one jump
    expect(rollPhase('closing', true, false)).toBe('opening');
    expect(rollPhase('opening', false, false)).toBe('closing');
    // an answer that did not change moves nothing
    expect(rollPhase('open', true, false)).toBe('open');
    expect(rollPhase('closed', false, false)).toBe('closed');
  });

  it('comes to rest where the move was going, and only a move comes to rest', () => {
    expect(rollSettled('opening')).toBe('open');
    expect(rollSettled('closing')).toBe('closed');
    expect(rollSettled('open')).toBe('open');
    expect(rollSettled('closed')).toBe('closed');
  });

  it('is simply there or not when nothing may move — even over a move in flight', () => {
    for (const phase of PHASES) {
      expect(rollPhase(phase, true, true), phase).toBe('open');
      expect(rollPhase(phase, false, true), phase).toBe('closed');
    }
    // and nothing may move under reduce motion, or at all in the amber Night
    for (const theme of themeNames) {
      expect(motionStill(true, theme), theme).toBe(true);
      expect(motionStill(false, theme), theme).toBe(theme === 'night');
    }
  });

  it('is in the tree only while it is showing, and out of reach from the moment it leaves', () => {
    expect(PHASES.filter(rollDrawn)).toEqual(['opening', 'open', 'closing']);
    // a roll-up keeps drawing it, but no finger and no screen reader can reach it
    expect(PHASES.filter(rollHidden)).toEqual(['closing']);
    // a roll-down is offered at once: it is what the parent just asked for
    expect(rollHidden('opening')).toBe(false);
    // clipped only while moving: at rest open the content lays itself out
    expect(PHASES.filter(rollClipped)).toEqual(['opening', 'closing']);
  });
});

describe('the clock', () => {
  it('rolls down in 280 ms and up in 250, on the sheet’s own curve', () => {
    for (const ms of [ROLL_DOWN_MS, ROLL_UP_MS]) {
      expect(ms).toBeGreaterThanOrEqual(250);
      expect(ms).toBeLessThanOrEqual(300);
    }
    expect(ROLL_UP_MS).toBeLessThan(ROLL_DOWN_MS);
    expect(rollMs(1, 1)).toBe(ROLL_DOWN_MS);
    expect(rollMs(1, 0)).toBe(ROLL_UP_MS);
    // §7's curve, read from the token rather than a copy of it
    const sheet = /cubic-bezier\(([^)]+)\)/.exec(tokens.motion.sheet)?.[1] ?? '';
    expect(sheet.split(',').map(Number)).toEqual([...ROLL_EASE]);
  });

  it('lands softly and never overshoots: the curve stays inside its two ends', () => {
    for (const x of STEPS) {
      const y = easeAt(ROLL_EASE, x);
      expect(y, `at ${x}`).toBeGreaterThanOrEqual(0);
      expect(y, `at ${x}`).toBeLessThanOrEqual(1);
    }
    // a quick start and a long landing: more than half the way in the first third of the time
    expect(easeAt(ROLL_EASE, 1 / 3)).toBeGreaterThan(0.5);
  });

  it('takes less time for less of the way, and none for none', () => {
    expect(rollMs(0, 1)).toBe(0);
    expect(rollMs(0.5, 1)).toBeLessThan(ROLL_DOWN_MS);
    expect(rollMs(0.5, 1)).toBeGreaterThan(ROLL_DOWN_MS / 3);
    for (let d = 0.05; d <= 1; d += 0.05) expect(rollMs(d, 0)).toBeLessThanOrEqual(rollMs(d, 1));
  });

  it('sets off from its end at rest, and turns round from where it is mid-move', () => {
    expect(planRoll(null, 0, 1, 1000)).toEqual({ from: 0, to: 1, duration: ROLL_DOWN_MS });
    expect(planRoll(null, 1, 0, 1000)).toEqual({ from: 1, to: 0, duration: ROLL_UP_MS });
    // Some left, then Finished it 100 ms into the roll-down: back up from where the row had got to
    const down = { from: 0, to: 1 as const, startedAt: 1000, duration: ROLL_DOWN_MS };
    const back = planRoll(down, 1, 0, 1100);
    expect(back.from).toBeCloseTo(rollAt(down, 1100), 9);
    expect(back.from).toBeGreaterThan(0);
    expect(back.from).toBeLessThan(1);
    expect(back.duration).toBeLessThan(ROLL_UP_MS);
    // a move that has finished is rest: the next one sets off from the end it reached
    expect(planRoll(down, 1, 0, 1000 + ROLL_DOWN_MS).from).toBe(1);
  });
});

describe('the frames', () => {
  it('takes no room rolled up and exactly the content’s rolled down, and moves what is under it smoothly', () => {
    for (const h of HEIGHTS) {
      const f = rollFrames(h);
      expect(sample(f.height, 0)).toBe(0);
      expect(sample(f.height, 1)).toBe(h);
      // never shrinking on the way down, so nothing under it steps back up
      for (let i = 1; i < STEPS.length; i += 1)
        expect(sample(f.height, STEPS[i] ?? 0)).toBeGreaterThanOrEqual(
          sample(f.height, STEPS[i - 1] ?? 0),
        );
    }
  });

  it('comes out from under the control: its bottom edge rides the clip’s bottom edge all the way', () => {
    for (const h of HEIGHTS) {
      const f = rollFrames(h);
      for (const p of STEPS) {
        const top = sample(f.slide, p);
        expect(top + h, `${h} at ${p}`).toBeCloseTo(sample(f.height, p), 9);
        // and its top is never below the clip's top: no gap opens under the control
        expect(top, `${h} at ${p}`).toBeLessThanOrEqual(0);
      }
      expect(sample(f.slide, 1)).toBe(0);
    }
  });

  it('fades in as it comes, whole from 60% of the way, and never flickers', () => {
    const f = rollFrames(72);
    expect(sample(f.opacity, 0)).toBe(0);
    expect(sample(f.opacity, ROLL_FADE)).toBe(1);
    expect(sample(f.opacity, 1)).toBe(1);
    for (let i = 1; i < STEPS.length; i += 1)
      expect(sample(f.opacity, STEPS[i] ?? 0)).toBeGreaterThanOrEqual(
        sample(f.opacity, STEPS[i - 1] ?? 0),
      );
  });

  it('draws nothing for a height it has not measured, and nothing past the ends', () => {
    for (const h of [Number.NaN, -10, Number.POSITIVE_INFINITY]) {
      const f = rollFrames(h);
      expect(f.height.outputRange).toEqual([0, 0]);
    }
    for (const fr of Object.values(rollFrames(72))) {
      expect(fr.inputRange.length).toBe(fr.outputRange.length);
      for (let i = 1; i < fr.inputRange.length; i += 1)
        expect(fr.inputRange[i] ?? 0).toBeGreaterThan(fr.inputRange[i - 1] ?? 0);
      expect(fr.extrapolate).toBe('clamp');
    }
  });
});

describe('the component (tripwires over RollDown.tsx)', () => {
  it('runs the height on the JavaScript driver and only the slide and fade on the native one', () => {
    expect(flat).toMatch(
      /Animated\.timing\(extent, \{ toValue: to, duration: p\.duration, easing: EASE, useNativeDriver: false, \}\)/,
    );
    expect(flat).toMatch(
      /Animated\.timing\(roll, \{ toValue: to, duration: p\.duration, easing: EASE, useNativeDriver: true, \}\)/,
    );
    expect(flat.match(/useNativeDriver: false/g)).toHaveLength(1);
    // the height is the clip's, from `extent`; the slide and the fade are the content's, from `roll`
    expect(flat).toContain('clip: { height: num(extent, f.height) },');
    expect(flat).toContain('opacity: num(roll, f.opacity),');
    expect(flat).toContain('transform: [{ translateY: num(roll, f.slide) }],');
    expect(flat).toContain("clip: { overflow: 'hidden' },");
  });

  it('follows the answer in the render it changes in, and turns round where it is', () => {
    expect(flat).toContain('setPhase(rollPhase(phase, open, still));');
    expect(flat).toContain('const p = planRoll(motion.current, at.current, to, now);');
    expect(flat).toContain('return () => run.stop();');
    // a finish settles only the move it belongs to
    expect(flat).toContain(
      'if (finished) setPhase(current => (current === phase ? rollSettled(current) : current));',
    );
  });

  it('measures the content before it rolls, and afresh each time it comes down', () => {
    expect(flat).toContain('onLayout={onLayout}');
    expect(flat).toContain('if (height === null) return undefined;');
    expect(flat).toContain("if (phase === 'closed' && !measureAhead) setHeight(null);");
  });

  /**
   * MEASURED AHEAD (the Sleep outlook's What this means, 2026-10-05): closed, the content is laid
   * out unseen — no opacity, no touch, no screen reader, out of the column's flow — so the height is
   * known and the roll starts with the tap, instead of a blank frame or two while it is measured.
   */
  it('can measure ahead, unseen and out of reach, so a roll starts with the tap', () => {
    expect(flat).toContain('if (!rollDrawn(phase) && !measureAhead) return null;');
    // shut, the outer view is the unseen copy; the inner one measures either way
    expect(flat).toContain(
      'style={!drawn ? styles.ahead : clipped ? [styles.clip, anim.clip] : null}',
    );
    expect(flat).toContain(
      "...(!drawn ? { pointerEvents: 'none' as const, accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const, } : {})",
    );
    expect(flat).toContain('onLayout={onLayout}');
    expect(flat).toContain(
      "ahead: { position: 'absolute', left: 0, right: 0, top: 0, opacity: 0 }",
    );
  });

  /**
   * ONE TREE OPEN OR SHUT (2026-10-06): the unseen copy and the drawn roll are the same two views,
   * so a tap never unmounts the rows and mounts them again — the stutter that came back on every
   * open, not only the first.
   */
  it('keeps one tree open or shut, so a toggle never remounts the content', () => {
    // exactly one return of the two views: no second tree for the unseen copy
    expect(flat.split('<Animated.View').length - 1).toBe(2);
    expect(flat).not.toContain('if (!rollDrawn(phase)) {');
  });

  it('is out of the tree rolled up, and out of reach of touch and screen readers on the way', () => {
    // rolled up, nothing is drawn — unless measured ahead, unseen (above)
    expect(flat).toContain('if (!rollDrawn(phase) && !measureAhead) return null;');
    expect(flat).toContain("pointerEvents={hidden ? 'none' : 'auto'}");
    expect(flat).toMatch(
      /\.\.\.\(hidden \? \{ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' as const, \} : \{\}\)/,
    );
  });

  it('rolls away what was there, not what the answer changed it to', () => {
    expect(flat).toContain('if (open) kept.current = children;');
    expect(flat).toContain('{open || !drawn ? children : kept.current}');
  });

  it('moves nothing under reduce motion or in the amber Night', () => {
    expect(flat).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    // at rest, and when still, the values are set rather than run
    expect(flat).toContain('extent.setValue(end);');
    expect(flat).toContain('roll.setValue(end);');
  });

  it('is exported with the design system’s other controls, and its arithmetic stays out of the barrel', () => {
    expect(read('core.ts')).toContain("export * from './RollDown';");
    expect(read('core.ts')).not.toContain("'./rollDown'");
  });
});
