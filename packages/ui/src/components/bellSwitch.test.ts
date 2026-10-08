/**
 * THE BELL SWITCH (the owner, 2026-09-25, of the "that's cool" list, idea 5). Two halves, the way
 * this package tests anything that moves: the picture at every point of its four values is PURE
 * (`bellSwitch.ts`) and is watched here frame by frame, on the same curves and the same frames the
 * component hands the native driver; what can only be seen on a device — that it is one switch to
 * a screen reader, runs on the native driver, and keeps still under reduce motion and in the amber
 * theme — is held by tripwires over `BellSwitch.tsx` and `Row.tsx`, because this suite has no
 * renderer (`interaction.test.ts` says why that is the honest instrument).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  ASLEEP_DEG,
  BELL_EASE,
  BELL_MAPPINGS,
  BELL_MS,
  BELL_OUTLINE,
  BELL_SIZE,
  bellAwake,
  bellFrames,
  bellGeometry,
  bellLean,
  bellPicture,
  bellPlan,
  bellPointOnKnob,
  bellRest,
  bellValuesAt,
  bellZs,
  BELL_CLAPPER,
  restValues,
  type BellMapping,
  type BellPicture,
  type BellValues,
} from './bellSwitch';
import { sampleFrame } from './keyframes';
import type { Frame } from './dayNightSwitch';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
/** Comments out: the component explains its own rules, and a scan must not read the explanation. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const g = bellGeometry();

/** The highest point a cubic Bézier easing reaches — how far past its target it carries a value. */
function peakOf([, y1, , y2]: readonly [number, number, number, number]): number {
  let peak = 0;
  for (let i = 0; i <= 2000; i += 1) {
    const s = i / 2000;
    peak = Math.max(peak, 3 * (1 - s) ** 2 * s * y1 + 3 * (1 - s) * s * s * y2 + s ** 3);
  }
  return peak;
}

interface Shot {
  ms: number;
  v: BellValues;
  p: BellPicture;
}

/** A move from rest at `from` to `to`, watched every 4 ms until it is over and a little after. */
function film(bell: BellMapping, from: boolean, to: boolean): Shot[] {
  const start = restValues(bellRest(from, bell));
  const plan = bellPlan(to, bell, false);
  const shots: Shot[] = [];
  for (let ms = 0; ms <= plan.total + 40; ms += 4) {
    const v = bellValuesAt(start, plan, ms);
    shots.push({ ms, v, p: bellPicture(g, bell, v) });
  }
  return shots;
}

const DIRECTIONS = BELL_MAPPINGS.flatMap(bell =>
  [true, false].map(to => ({ bell, from: !to, to })),
);
const name = (d: { bell: BellMapping; to: boolean }) => `${d.bell}, turned ${d.to ? 'on' : 'off'}`;

describe('the size of it', () => {
  it('is a pill with a round knob inside it, in a target no smaller than 44', () => {
    expect(g.knob).toBe(BELL_SIZE.height - 2 * BELL_SIZE.inset);
    expect(g.travel).toBe(BELL_SIZE.width - g.knob - 2 * BELL_SIZE.inset);
    expect(g.width).toBeGreaterThanOrEqual(44);
    // the pill is 32 tall; the Pressable round it is the 44 (CLAUDE.md §6)
    const src = withoutComments(read('BellSwitch.tsx')).replace(/\s+/g, ' ');
    expect(src).toContain('minHeight: t.hit.min, minWidth: t.hit.min');
  });

  it('draws the bell on the knob with room round it, and hangs it from its crown', () => {
    expect(g.box).toBeLessThan(g.knob);
    expect(g.boxInset).toBeGreaterThan(0);
    // the crown is above the middle: that is what makes a swing a swing
    expect(g.hang.x).toBe(0);
    expect(g.hang.y).toBeLessThan(-g.box / 4);
  });
});

describe('what the bell means by on', () => {
  it('is awake when a reminder is on, and asleep when it is off', () => {
    expect(bellAwake(true, 'awake-when-on')).toBe(true);
    expect(bellAwake(false, 'awake-when-on')).toBe(false);
  });

  it('is asleep when quiet hours are on, and awake when they are off', () => {
    expect(bellAwake(true, 'asleep-when-on')).toBe(false);
    expect(bellAwake(false, 'asleep-when-on')).toBe(true);
  });

  it('is an ordinary switch either way: the knob is right, and filled, when it is on', () => {
    for (const bell of BELL_MAPPINGS) {
      for (const value of [true, false]) {
        const p = bellPicture(g, bell, restValues(bellRest(value, bell)));
        expect(p.knobX, `${bell} ${value}`).toBe(value ? g.travel : 0);
        expect(p.on, `${bell} ${value}`).toBe(value ? 1 : 0);
      }
    }
  });

  it('lies over at rest when asleep, stands upright when awake, and is still either way', () => {
    for (const bell of BELL_MAPPINGS) {
      for (const value of [true, false]) {
        const p = bellPicture(g, bell, restValues(bellRest(value, bell)));
        const at = `${bell} ${value}`;
        expect(Math.abs(p.tip), at).toBe(bellAwake(value, bell) ? 0 : ASLEEP_DEG);
        expect(p.swing, at).toBeCloseTo(0, 12);
        expect(p.clapper, at).toBeCloseTo(0, 12);
        for (const z of p.zs) expect(z.opacity, at).toBe(0);
      }
    }
  });

  it('falls the way it was going: over the end of the pill it sleeps at', () => {
    // asleep at the LEFT (a reminder, off): the top carries on left, counter-clockwise
    expect(bellLean('awake-when-on')).toBe(-1);
    expect(bellPicture(g, 'awake-when-on', restValues(bellRest(false, 'awake-when-on'))).tip).toBe(
      -ASLEEP_DEG,
    );
    // asleep at the RIGHT (quiet hours, on): the mirror of it
    expect(bellLean('asleep-when-on')).toBe(1);
    expect(bellPicture(g, 'asleep-when-on', restValues(bellRest(true, 'asleep-when-on'))).tip).toBe(
      ASLEEP_DEG,
    );
  });
});

describe('what a change does', () => {
  it('rings when the bell wakes and drifts off when it sleeps, never both', () => {
    for (const bell of BELL_MAPPINGS)
      for (const value of [true, false]) {
        const plan = bellPlan(value, bell, false);
        expect(plan.act).toBe(bellAwake(value, bell) ? 'wake' : 'sleep');
        expect(plan.ring !== null, `${bell} ${value}`).toBe(plan.act === 'wake');
        expect(plan.z !== null, `${bell} ${value}`).toBe(plan.act === 'sleep');
      }
  });

  it('under reduce motion or in the amber theme, sets the end state and moves nothing', () => {
    for (const bell of BELL_MAPPINGS)
      for (const value of [true, false]) {
        const plan = bellPlan(value, bell, true);
        expect(plan.animate).toBe(false);
        expect(plan.total).toBe(0);
        expect(plan.to).toEqual(bellRest(value, bell));
        // the picture IS the end state, whenever it is asked
        const from = restValues(bellRest(!value, bell));
        expect(bellValuesAt(from, plan, 0)).toEqual(restValues(bellRest(value, bell)));
      }
  });

  it('is over quickly: the ring in under 0.8 s, the "z"s a little over a second', () => {
    expect(bellPlan(true, 'awake-when-on', false).total).toBeLessThanOrEqual(800);
    expect(bellPlan(false, 'awake-when-on', false).total).toBeLessThanOrEqual(1100);
    // the knob itself takes the platform switch's own quarter second
    expect(BELL_MS.slide).toBeLessThanOrEqual(260);
  });

  it('rings as the knob arrives, not after it: the swings are the knob stopping', () => {
    expect(BELL_MS.ringDelay).toBeLessThan(BELL_MS.slide);
    expect(BELL_MS.tipDelay).toBeLessThan(BELL_MS.slide);
  });
});

describe('the curves', () => {
  it('stops the knob dead and stands the bell up without overshooting', () => {
    expect(peakOf(BELL_EASE.slide)).toBeLessThanOrEqual(1);
    expect(peakOf(BELL_EASE.right)).toBeLessThanOrEqual(1);
  });

  it('lets the bell rock as it lands on its side, a few degrees past and back', () => {
    const past = (peakOf(BELL_EASE.tip) - 1) * ASLEEP_DEG;
    expect(past).toBeGreaterThan(3);
    expect(past).toBeLessThan(12);
  });

  it('keeps every curve a function of time', () => {
    for (const e of Object.values(BELL_EASE)) {
      expect(e[0]).toBeGreaterThanOrEqual(0);
      expect(e[2]).toBeLessThanOrEqual(1);
    }
  });
});

describe('every move, frame by frame', () => {
  it.each(DIRECTIONS)('$bell, on → $to: keeps the knob on its track, moving one way', d => {
    const shots = film(d.bell, d.from, d.to);
    for (let i = 1; i < shots.length; i += 1) {
      const [a, b] = [shots[i - 1]?.p.knobX ?? 0, shots[i]?.p.knobX ?? 0];
      expect(b >= a === d.to || a === b, name(d)).toBe(true);
      expect(b).toBeGreaterThanOrEqual(0);
      expect(b).toBeLessThanOrEqual(g.travel);
    }
  });

  it.each(DIRECTIONS)('$bell, on → $to: keeps every point of the bell on its knob', d => {
    const r = g.knob / 2 - 0.5;
    for (const { ms, p } of film(d.bell, d.from, d.to)) {
      for (const pt of BELL_OUTLINE) {
        const clapper =
          Math.hypot(pt.x - BELL_CLAPPER.cx, pt.y - BELL_CLAPPER.cy) <= BELL_CLAPPER.r + 1e-9;
        const on = bellPointOnKnob(g, pt, p.tip, clapper ? p.clapper : p.swing);
        expect(Math.hypot(on.x, on.y), `${name(d)} at ${ms} ms`).toBeLessThanOrEqual(r);
      }
    }
  });

  it.each(DIRECTIONS)('$bell, on → $to: ends exactly at rest', d => {
    const last = film(d.bell, d.from, d.to).at(-1);
    const rest = bellPicture(g, d.bell, restValues(bellRest(d.to, d.bell)));
    expect(last?.p.knobX).toBeCloseTo(rest.knobX, 9);
    expect(last?.p.tip).toBeCloseTo(rest.tip, 9);
    expect(last?.p.swing).toBeCloseTo(0, 9);
    for (const z of last?.p.zs ?? []) expect(z.opacity).toBeCloseTo(0, 9);
  });
});

describe('waking: it stands up and rings', () => {
  const wakes = DIRECTIONS.filter(d => bellAwake(d.to, d.bell));

  it.each(wakes)(
    '$bell, on → $to: stands up while the knob slides, before the ring is at its fullest',
    d => {
      const shots = film(d.bell, d.from, d.to);
      const fullest = shots.reduce((a, b) => (Math.abs(b.p.swing) > Math.abs(a.p.swing) ? b : a));
      // upright (within a few degrees) by the time the biggest swing comes
      expect(Math.abs(fullest.p.tip)).toBeLessThan(5);
      expect(Math.abs(fullest.p.swing)).toBeGreaterThan(12);
    },
  );

  it.each(wakes)(
    '$bell, on → $to: swings first the way the knob was going, then back, dying away',
    d => {
      const swings = film(d.bell, d.from, d.to).map(s => s.p.swing);
      const first = swings.find(s => Math.abs(s) > 2) ?? 0;
      // arriving at the right end the bottom carries on right: counter-clockwise, and the mirror
      expect(Math.sign(first)).toBe(d.to ? -1 : 1);
      expect(Math.sign(first)).toBe(bellLean(d.bell));
      // it swings through upright at least three times: three swings, not a lean
      let crossings = 0;
      let side = 0;
      for (const s of swings) {
        if (Math.abs(s) < 0.5) continue;
        if (side !== 0 && Math.sign(s) !== side) crossings += 1;
        side = Math.sign(s);
      }
      expect(crossings).toBeGreaterThanOrEqual(3);
    },
  );

  it.each(wakes)(
    '$bell, on → $to: lets the clapper lag and swing wider, so it strikes the rim',
    d => {
      const shots = film(d.bell, d.from, d.to);
      const peakAt = (key: 'swing' | 'clapper') =>
        shots.reduce((a, b) => (Math.abs(b.p[key]) > Math.abs(a.p[key]) ? b : a));
      expect(Math.abs(peakAt('clapper').p.clapper)).toBeGreaterThan(
        Math.abs(peakAt('swing').p.swing),
      );
      expect(peakAt('clapper').ms).toBeGreaterThan(peakAt('swing').ms);
    },
  );

  it.each(wakes)('$bell, on → $to: draws no "z" while it wakes', d => {
    for (const { p } of film(d.bell, d.from, d.to)) for (const z of p.zs) expect(z.opacity).toBe(0);
  });
});

describe('falling asleep: it tips over, rocks, and two "z"s drift up', () => {
  const sleeps = DIRECTIONS.filter(d => !bellAwake(d.to, d.bell));

  it.each(sleeps)(
    '$bell, on → $to: tips over the end it stops at, past its rest a little, and back',
    d => {
      const tips = film(d.bell, d.from, d.to).map(s => s.p.tip);
      const lean = bellLean(d.bell);
      const furthest = Math.max(...tips.map(x => x * lean));
      expect(furthest).toBeGreaterThan(ASLEEP_DEG + 3);
      expect(furthest).toBeLessThan(ASLEEP_DEG + 12);
      expect((tips.at(-1) ?? 0) * lean).toBeCloseTo(ASLEEP_DEG, 6);
      // it never tips the other way first
      for (const x of tips) expect(x * lean).toBeGreaterThanOrEqual(-1e-9);
    },
  );

  it.each(sleeps)(
    '$bell, on → $to: lets the "z"s out only once it is down, one after the other',
    d => {
      const shots = film(d.bell, d.from, d.to);
      for (const { ms, p } of shots)
        if (p.zs.some(z => z.opacity > 0.05))
          expect(Math.abs(p.tip), `${name(d)} at ${ms} ms`).toBeGreaterThan(ASLEEP_DEG * 0.9);
      const firstSeen = (i: number) => shots.find(s => (s.p.zs[i]?.opacity ?? 0) > 0.5)?.ms ?? -1;
      expect(firstSeen(0)).toBeGreaterThan(0);
      expect(firstSeen(1)).toBeGreaterThan(firstSeen(0));
      // each is seen whole at some point, and neither is left behind
      for (let i = 0; i < 2; i += 1)
        expect(Math.max(...shots.map(s => s.p.zs[i]?.opacity ?? 0))).toBeGreaterThan(0.95);
    },
  );

  it.each(sleeps)('$bell, on → $to: sends the "z"s up and toward the open track, growing', d => {
    for (const z of bellZs(g, d.bell)) {
      expect(z.to.y).toBeLessThan(z.from.y);
      // away from the knob at the end it sleeps at: right of it at the left end, and the mirror
      expect(Math.sign(z.to.x - z.from.x)).toBe(-bellLean(d.bell));
      expect(z.at + z.life).toBeLessThanOrEqual(1);
    }
    // whenever both show, the one further along is higher and larger — "zZ" — and they never touch
    let both = 0;
    for (const { ms, p } of film(d.bell, d.from, d.to)) {
      const [a, b] = p.zs;
      if (!a || !b || a.opacity < 0.3 || b.opacity < 0.3) continue;
      both += 1;
      const at = `${name(d)} at ${ms} ms`;
      expect(a.y, at).toBeLessThan(b.y);
      expect(a.size, at).toBeGreaterThan(b.size);
      expect(Math.hypot(a.x - b.x, a.y - b.y), at).toBeGreaterThan((a.size + b.size) / 2);
    }
    expect(both).toBeGreaterThan(0);
  });

  it.each(sleeps)(
    '$bell, on → $to: keeps the "z"s over the switch’s own ground: above the pill, within its ends',
    d => {
      for (const { ms, p } of film(d.bell, d.from, d.to))
        for (const z of p.zs) {
          if (z.opacity <= 0.05) continue;
          const at = `${name(d)} at ${ms} ms`;
          // never over the words beside the switch
          expect(z.x - z.size / 2, at).toBeGreaterThanOrEqual(0);
          expect(z.x + z.size / 2, at).toBeLessThanOrEqual(g.width);
          // above the pill, on the ground whose ink `theme/bell.ts` measures — not on the track
          expect(z.y + z.size / 2, at).toBeLessThanOrEqual(0.5);
          // and inside the row: the target's own 6 pt and less than a row's padding above it
          expect(z.y - z.size / 2, at).toBeGreaterThanOrEqual(-14);
        }
    },
  );
});

describe('the frames handed to interpolate', () => {
  const EVERY: readonly [string, Frame][] = BELL_MAPPINGS.flatMap(bell => {
    const f = bellFrames(g, bell);
    return [
      ...Object.entries(f).filter((e): e is [string, Frame] => !Array.isArray(e[1])),
      ...f.zs.flatMap((z, i): [string, Frame][] =>
        Object.entries(z).map(([k, fr]) => [`z${i} ${k}`, fr as Frame]),
      ),
    ].map(([k, fr]): [string, Frame] => [`${bell} ${k}`, fr]);
  });

  it('are frames Animated can read: in order, one output per input, inside their value', () => {
    for (const [n, fr] of EVERY) {
      expect(fr.inputRange.length, n).toBe(fr.outputRange.length);
      expect(fr.inputRange.length, n).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < fr.inputRange.length; i += 1)
        expect(fr.inputRange[i] ?? 0, n).toBeGreaterThan(fr.inputRange[i - 1] ?? 0);
      expect(fr.inputRange[0] ?? -1, n).toBeGreaterThanOrEqual(0);
      expect(fr.inputRange[fr.inputRange.length - 1] ?? 2, n).toBeLessThanOrEqual(1);
    }
  });

  it('only lets the tip follow its overshoot; everything else is clamped', () => {
    for (const [n, fr] of EVERY)
      expect(fr.extrapolate, n).toBe(n.endsWith(' tip') ? 'extend' : 'clamp');
  });

  it('resets each clock only where its layer is still and unseen', () => {
    // the component sets `ring` to 0 as a wake starts and `z` to 0 as a sleep starts: both
    // frames draw the same nothing at 0 as at rest, so the reset cannot be seen
    for (const bell of BELL_MAPPINGS) {
      const f = bellFrames(g, bell);
      expect(sampleFrame(f.swing, 0)).toBe(sampleFrame(f.swing, 1));
      expect(sampleFrame(f.clapper, 0)).toBe(sampleFrame(f.clapper, 1));
      for (const z of f.zs) {
        expect(sampleFrame(z.opacity, 0)).toBe(0);
        expect(sampleFrame(z.opacity, 1)).toBe(0);
      }
    }
  });
});

describe('the component, where a device would be needed to see it', () => {
  const src = withoutComments(read('BellSwitch.tsx'));
  const flat = src.replace(/\s+/g, ' ');

  it('is one switch: its role, its checked state, a required name, one press', () => {
    expect(flat).toContain('accessibilityRole="switch"');
    expect(flat).toContain('accessibilityState={{ checked: value, disabled }}');
    expect(flat).toMatch(/accessibilityLabel: string;/);
    expect(flat).toMatch(/bell: BellMapping;/);
    expect(flat).toContain('onValueChange(!value);');
  });

  it('draws the picture untouchable and hidden from assistive technology', () => {
    expect(flat).toMatch(
      /<View pointerEvents="none" importantForAccessibility="no-hide-descendants" accessibilityElementsHidden/,
    );
  });

  it('is felt as `Switch` is: a tap, once, in the press handler, after the flip', () => {
    // after, for the reason `Switch.tsx` gives: the flip may be the one that turns vibration on
    expect(flat).toContain("onPress={() => { onValueChange(!value); haptic('tap'); }}");
    expect(flat.split('haptic(').length - 1).toBe(1);
    expect(flat).not.toMatch(/expo-haptics/);
  });

  it('keeps still under reduce motion and in the amber theme, and draws no "z" there', () => {
    expect(flat).toContain("const still = t.reduceMotion || t.theme === 'night';");
    expect(flat).toContain('const plan = bellPlan(value, bell, still);');
    expect(flat).toContain("{t.theme === 'night' ? null : anim.placed.map(");
  });

  it('runs on the native driver, opacity and transforms only', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    // nothing animated is a width, a color or a position the layout has to redo
    expect(flat).not.toMatch(/(width|height|left|top|backgroundColor): (num|Animated)\(/);
  });

  it('takes its colors from the palette through `bellColors`, never a literal', () => {
    expect(flat).toContain('const c = bellColors(t.color);');
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});

describe('Row: a switch row may draw its switch as the bell', () => {
  const row = read('Row.tsx');
  const code = withoutComments(row);

  it('draws it in the same hidden, untouchable wrapper as the platform switch', () => {
    expect(row).toMatch(/<View\s+pointerEvents="none"[\s\S]{0,400}?<BellSwitch/);
    expect(row).toMatch(/accessibilityElementsHidden[\s\S]{0,400}?<BellSwitch/);
    expect(code.replace(/\s+/g, ' ')).toContain(
      '<BellSwitch value={switchValue} onValueChange={onSwitch} bell={switchBell} accessibilityLabel={title} disabled={disabled} />',
    );
  });

  it('keeps the platform switch for every row that does not ask', () => {
    // the bell first, then setup's pour (`pourSwitch.test.ts`, 2026-09-27), and the platform
    // switch for every row that asks for neither
    const flat = code.replace(/\s+/g, ' ');
    expect(flat).toContain('{switchBell !== undefined ? ( <BellSwitch');
    expect(flat).toContain(
      ') : ( <Switch value={switchValue} onValueChange={onSwitch} accessibilityLabel={title} disabled={disabled} /> )}',
    );
  });

  it('is felt once when a row flips it: by the row, never by the bell inside it as well', () => {
    // the bell's own press cannot run inside the untouchable wrapper (held above), so the row's
    // one handler — which flips and then taps — is the only thing that fires, bell or no bell
    // (a LOCKED row is felt as a warning in place of the tap, 2026-10-01: `callSites.test.ts`)
    const flat = code.replace(/\s+/g, ' ');
    expect(flat).toContain(
      ": isSwitch ? () => { onSwitch(!switchValue); haptic('tap'); } : onPress;",
    );
    expect(flat.split('haptic(').length - 1).toBe(1);
  });
});
