/**
 * HOLD TO STOP (2026-09-26): the ring's shape, its draw, its timing and the whole of what the button
 * does, as the table `holdStep` is — every event in every phase, walked in node — and tripwires over
 * `StopButton.tsx` for what only a phone can show: that a screen reader's activate stops at once,
 * that the button adds no haptic of its own, and that the ring is the only thing the native driver
 * cannot carry.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hit, space } from '../theme/theme';
import {
  drainMs,
  fillMs,
  HOLD,
  HOLD_COPY,
  HOLD_RING,
  holdRing,
  holdRingFrames,
  holdStep,
  popFrame,
  ringDrawn,
  type HoldEffect,
  type HoldEvent,
  type HoldPhase,
} from './stopHold';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const button = withoutComments(read('StopButton.tsx'));
const flat = button.replace(/\s+/g, ' ');
const card = withoutComments(read('TimerCard.tsx')).replace(/\s+/g, ' ');

const PHASES: readonly HoldPhase[] = ['rest', 'filling', 'draining', 'held'];
const EVENTS: readonly HoldEvent[] = [
  'press',
  'release',
  'cancel',
  'filled',
  'drained',
  'activate',
];

/** A run of events from rest, and every effect it asked for, in order. */
function play(
  events: readonly HoldEvent[],
  still = false,
): { phase: HoldPhase; effects: HoldEffect[] } {
  let phase: HoldPhase = 'rest';
  const effects: HoldEffect[] = [];
  for (const e of events) {
    const step = holdStep(phase, e, still);
    phase = step.phase;
    effects.push(...step.effects);
  }
  return { phase, effects };
}
const stops = (effects: readonly HoldEffect[]) => effects.filter(e => e === 'stop').length;

/* ----------------------------------------------------------------------------- the ring */

describe('the ring runs round the inside of the button', () => {
  // the pill on a card (44 tall, as wide as its words), the sticky bar's (36), the ring layouts' discs
  const BUTTONS = [
    [150, 44],
    [96, 44],
    [180, 44],
    [120, 36],
    [52, 52],
    [46, 46],
    [76, 76],
  ] as const;

  it('starts at the top middle and closes on itself, clockwise, round ends as quarter turns', () => {
    for (const [w, h] of BUTTONS) {
      const r = holdRing(w, h);
      expect(r.path.startsWith(`M${w / 2} `), `${w}×${h}`).toBe(true);
      expect(r.path.endsWith('Z')).toBe(true);
      // four quarter turns, each clockwise (sweep 1), never a half turn left to the renderer
      const arcs = r.path.match(/A[^A-Z]*/g) ?? [];
      expect(arcs).toHaveLength(4);
      for (const a of arcs) expect(a.split(' ')[4], a).toBe('1');
    }
  });

  it('is as long as its straight runs and its two round ends', () => {
    for (const [w, h] of BUTTONS) {
      const r = holdRing(w, h);
      const inset = HOLD_RING.inset + HOLD_RING.stroke / 2;
      const radius = h / 2 - inset;
      const straight = Math.max(0, w - 2 * inset - 2 * radius);
      expect(r.length).toBeCloseTo(2 * straight + 2 * Math.PI * radius, 6);
    }
    // a disc is all round end
    expect(holdRing(52, 52).length).toBeCloseTo(2 * Math.PI * (26 - 2.5), 6);
  });

  it('stays on the button: its outer edge `inset` inside, never outside', () => {
    for (const [w, h] of BUTTONS) {
      const r = holdRing(w, h);
      const nums = (r.path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
      // every coordinate the path names (the arcs' radii included) is inside the button
      for (const v of nums) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(Math.max(w, h));
      }
      const inner = HOLD_RING.inset + HOLD_RING.stroke / 2;
      const ys = [...r.path.matchAll(/[MHA][^A-Z]*/g)].flatMap(m => {
        const parts = m[0].slice(1).trim().split(' ').map(Number);
        return m[0][0] === 'A' ? [parts[6] ?? 0] : m[0][0] === 'M' ? [parts[1] ?? 0] : [];
      });
      for (const y of ys) {
        expect(y).toBeGreaterThanOrEqual(inner - 1e-9);
        expect(y).toBeLessThanOrEqual(h - inner + 1e-9);
      }
    }
  });

  it('is never narrower than round, whatever a first frame measures', () => {
    const r = holdRing(10, 44);
    expect(r.length).toBeCloseTo(holdRing(44, 44).length, 6);
    expect(Number.isFinite(holdRing(0, 0).length)).toBe(true);
  });

  it('draws nothing at rest — not a cap’s dot — the whole loop at the end, and evenly between', () => {
    for (const [w, h] of BUTTONS) {
      const r = holdRing(w, h);
      // at rest the loop sits wholly in the gap, round caps and all
      expect(ringDrawn(r, 0)).toBe(0);
      expect(r.from).toBeGreaterThanOrEqual(r.length + HOLD_RING.stroke / 2);
      expect(r.dasharray[1]).toBeGreaterThan(r.length + HOLD_RING.stroke);
      expect(ringDrawn(r, 1)).toBeCloseTo(r.length, 9);
      // an even fill: a progress indicator says how much is left, and an eased one would lie
      let last = -1;
      for (let i = 1; i <= 100; i += 1) {
        const drawn = ringDrawn(r, i / 100);
        expect(drawn).toBeGreaterThan(last);
        last = drawn;
      }
      expect(ringDrawn(r, 0.5)).toBeCloseTo(r.length * 0.5 - (HOLD_RING.stroke / 2) * 0.5, 6);
    }
  });

  it('is framed for `interpolate`: the offset clamped, the track there only while the hold is', () => {
    const r = holdRing(150, 44);
    const f = holdRingFrames(r);
    expect(f.offset).toEqual({
      inputRange: [0, 1],
      outputRange: [r.from, 0],
      extrapolate: 'clamp',
    });
    expect(f.track.outputRange[0]).toBe(0);
    expect(f.track.outputRange.slice(1)).toEqual([1, 1]);
    expect(f.track.extrapolate).toBe('clamp');
  });
});

/* ---------------------------------------------------------------------------- the timing */

describe('the timing', () => {
  it('holds a little over half a second, runs back in under a fifth, hints for a second and a half', () => {
    expect(HOLD.fillMs).toBe(600);
    expect(HOLD.drainMs).toBe(180);
    expect(HOLD.hintMs).toBe(1500);
    expect(HOLD.hintInMs + HOLD.hintOutMs).toBeLessThan(HOLD.hintMs);
  });

  it('fills the rest from where the ring stands, and runs back its share', () => {
    expect(fillMs(0)).toBe(600);
    expect(fillMs(0.5)).toBe(300);
    expect(fillMs(1)).toBe(0);
    expect(drainMs(1)).toBe(180);
    expect(drainMs(0.5)).toBe(90);
    expect(drainMs(0)).toBe(0);
    // nothing out of range, and nothing that is not a number, reaches a timer
    for (const p of [-1, 2, Number.NaN]) {
      expect(fillMs(p)).toBeGreaterThanOrEqual(0);
      expect(fillMs(p)).toBeLessThanOrEqual(600);
      expect(drainMs(p)).toBeGreaterThanOrEqual(0);
      expect(drainMs(p)).toBeLessThanOrEqual(180);
    }
  });

  it('swells once as the ring closes, and ends exactly where it began', () => {
    const f = popFrame();
    expect(f.outputRange[0]).toBe(1);
    expect(f.outputRange[f.outputRange.length - 1]).toBe(1);
    expect(Math.max(...f.outputRange)).toBe(HOLD.popScale);
    expect(HOLD.popScale).toBeLessThanOrEqual(1.06);
  });
});

/* ------------------------------------------------------------------------- the behavior */

describe('what the button does', () => {
  it('stops once for a hold that closes the ring, and not again when the finger lifts', () => {
    const r = play(['press', 'filled', 'release']);
    expect(stops(r.effects)).toBe(1);
    expect(r.phase).toBe('rest');
    // and the lift clears the ring without a hint: the press did what it was for
    expect(r.effects).toEqual(['fill', 'stop', 'pop', 'clear']);
  });

  it('does not stop for a tap: it runs the ring back and says why', () => {
    const r = play(['press', 'release', 'drained']);
    expect(stops(r.effects)).toBe(0);
    expect(r.effects).toEqual(['fill', 'drain', 'hint']);
    expect(r.phase).toBe('rest');
  });

  it('runs the ring back and says nothing when the page takes the touch for a scroll', () => {
    const r = play(['press', 'cancel', 'drained']);
    expect(stops(r.effects)).toBe(0);
    expect(r.effects).toEqual(['fill', 'drain']);
    expect(play(['press', 'cancel'], true).effects).toEqual(['fill', 'clear']);
    // and a hold that has already stopped simply clears
    expect(play(['press', 'filled', 'cancel']).effects).toEqual(['fill', 'stop', 'pop', 'clear']);
  });

  it('never stops for any run of taps, however quick', () => {
    const taps: HoldEvent[] = [];
    for (let i = 0; i < 6; i += 1) taps.push('press', 'release');
    const r = play(taps);
    expect(stops(r.effects)).toBe(0);
    expect(r.effects.filter(e => e === 'hint')).toHaveLength(6);
  });

  it('picks the ring up where it stands when a finger comes back while it runs back', () => {
    const r = play(['press', 'release', 'press']);
    expect(r.phase).toBe('filling');
    expect(r.effects.at(-1)).toBe('fill');
    // and closing it from there is one stop
    expect(stops(play(['press', 'release', 'press', 'filled']).effects)).toBe(1);
  });

  it('stops at once for a screen reader, with no hold, and only once', () => {
    expect(play(['activate']).effects).toEqual(['stop']);
    // mid-hold (a pass-through gesture), it clears the ring first, and holds until the lift
    const through = play(['press', 'activate']);
    expect(through.effects).toEqual(['fill', 'clear', 'stop']);
    expect(through.phase).toBe('held');
    expect(stops(play(['press', 'activate', 'activate', 'filled', 'release']).effects)).toBe(1);
    // while a tap's ring runs back, the finger is already up
    expect(play(['press', 'release', 'activate'])).toEqual({
      phase: 'rest',
      effects: ['fill', 'drain', 'hint', 'clear', 'stop'],
    });
    // over a hold that has already stopped, it does nothing
    const r = play(['press', 'filled', 'activate']);
    expect(stops(r.effects)).toBe(1);
  });

  it('ignores a ring closing or running back after it no longer matters', () => {
    for (const phase of PHASES) {
      if (phase !== 'filling') expect(holdStep(phase, 'filled', false).effects).toEqual([]);
      if (phase !== 'draining') expect(holdStep(phase, 'drained', false).effects).toEqual([]);
    }
  });

  it('makes at most one stop between a finger coming down and it lifting, whatever arrives', () => {
    // every sequence of up to five events that starts with a press and ends with a lift
    const inner = EVENTS.filter(e => e !== 'press' && e !== 'release' && e !== 'cancel');
    const runs: HoldEvent[][] = [[]];
    for (let n = 0; n < 3; n += 1)
      for (const r of [...runs]) for (const e of inner) runs.push([...r, e]);
    for (const still of [false, true])
      for (const middle of runs) {
        const r = play(['press', ...middle, 'release'], still);
        expect(stops(r.effects), `${still} ${middle.join(',')}`).toBeLessThanOrEqual(1);
      }
  });

  it('keeps the hold and the ring under reduce motion and in Night — only the flourish goes', () => {
    // still: the ring still fills — it is how long is left, not a decoration
    expect(play(['press'], true).effects).toEqual(['fill']);
    // no swell as it closes
    expect(play(['press', 'filled'], true).effects).toEqual(['fill', 'stop']);
    // and a ring let go of clears rather than running back, with the hint all the same
    const r = play(['press', 'release'], true);
    expect(r.effects).toEqual(['fill', 'clear', 'hint']);
    expect(r.phase).toBe('rest');
    for (const phase of PHASES)
      for (const event of EVENTS)
        expect(holdStep(phase, event, true).effects, `${phase}/${event}`).not.toContain('pop');
  });

  it('answers every event in every phase with a phase it knows', () => {
    for (const still of [false, true])
      for (const phase of PHASES)
        for (const event of EVENTS) expect(PHASES).toContain(holdStep(phase, event, still).phase);
  });
});

/* ----------------------------------------------------------------------------- the words */

describe('the words', () => {
  it('say what to do, plainly, and tell a screen reader it need not hold', () => {
    expect(HOLD_COPY.hint).toBe('Hold to stop');
    expect(HOLD_COPY.a11yHint).toMatch(/^Double tap to stop at once/);
    for (const s of Object.values(HOLD_COPY)) {
      expect(s).not.toMatch(/!|colour|cancelled|please/i);
      expect(s[0]).toBe(s[0]?.toUpperCase());
    }
  });
});

/* ------------------------------------------------------- the component (tripwires) */

describe('StopButton (tripwires over the source)', () => {
  it('stops at once for VoiceOver’s double tap and TalkBack’s, each in its own form', () => {
    expect(flat).toContain("Platform.OS === 'ios' ? { onAccessibilityTap: activate }");
    expect(flat).toContain("accessibilityActions: [{ name: 'activate' as const }]");
    expect(flat).toContain("if (e.nativeEvent.actionName === 'activate') activate();");
    expect(flat).toContain('...activateProps(hold.handlers.activate),');
    expect(flat).toContain('accessibilityHint: HOLD_COPY.a11yHint,');
    expect(flat).toContain("accessibilityRole: 'button' as const,");
  });

  it('holds with the finger and ignores the finger’s own press; a press with no finger stops', () => {
    expect(flat).toContain(
      "onPressIn: () => { touch.current += 1; touched.current = true; tapped.current = false; dispatch('press'); },",
    );
    // a lift is a tap only when the finger's own onPress came; anything else is a cancel
    expect(flat).toContain("dispatch(tapped.current ? 'release' : 'cancel');");
    expect(flat).toContain('if (touch.current !== mine) return;');
    expect(flat).toContain(
      'onPress: () => { if (touched.current) { tapped.current = true; return; } activate(); },',
    );
    expect(flat).toContain("if (finished) dispatch('filled');");
    // the caller's stop is made in exactly one place: the table's `stop`
    expect(flat).toContain("case 'stop': latest.current.onStop(); return;");
    expect(button.match(/onStop\(\)/g)).toHaveLength(1);
  });

  it('adds no haptic: a stop is felt as the thud of the entry it writes, once', () => {
    expect(button).not.toContain('haptic(');
    expect(button).not.toContain('feelChoice(');
  });

  it('drives only the ring on JavaScript, and the swell and the hint on the native driver', () => {
    expect(button.match(/useNativeDriver: false/g)).toHaveLength(2);
    expect(flat).toMatch(/duration: fillMs\(p\), easing: Easing\.linear, useNativeDriver: false/);
    expect(flat).toMatch(/duration: drainMs\(p\), easing: DRAIN_EASE, useNativeDriver: false/);
    expect(button.match(/useNativeDriver: true/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('keeps the flourish out where nothing may move, and reads the rule from the theme', () => {
    expect(flat).toContain('const still = motionStill(t.reduceMotion, t.theme);');
    expect(flat).toContain('<Animated.View style={still ? null : popStyle}>');
    expect(flat).toContain('const fading = !latest.current.still;');
  });

  it('keeps a 44 pt target: the pill is `hit.min` tall with a slop round it', () => {
    expect(flat).toContain('minHeight: t.hit.min,');
    expect(flat).toContain('hitSlop={t.space.xs}');
    // the sticky bar's 36 pt pill, lifted to 44 by the slop
    expect(hit.min - 8 + 2 * space.xs).toBeGreaterThanOrEqual(44);
  });

  it('draws the ring and the hint in the theme’s own colors, the hint hidden from the tree', () => {
    expect(flat).toContain('const holdInk = stopHoldColors(t.color, t.theme, module);');
    expect(flat).toContain('{HOLD_COPY.hint}');
    expect(button).not.toMatch(/['"`]#[0-9a-fA-F]{3,8}['"`]/);
    expect(button).not.toMatch(/['"`](rgb|rgba|hsl|hsla)\(/);
  });

  it('keeps the caller’s id, and the card hands its stop one of its own', () => {
    expect(flat).toContain('...(testID ? { testID } : {}),');
    expect(card).toContain('{...(testID ? { testID: `${testID}.stop` } : {})}');
  });
});
