/**
 * MODULE ICONS THAT WAKE UP (the owner, 2026-09-25, of the "that's cool" list, idea 7). Two halves,
 * the way this package tests anything that moves: every pose of every move is PURE
 * (`wakingIcon.ts`) and is sampled here exactly as `interpolate` would sample it; what can only be
 * seen on a device — that it runs on the native driver, plays once on the way on and never
 * otherwise, and honors reduce motion and the amber night theme — is held by tripwires over
 * `WakingIcon.tsx`, because this suite has no renderer (`interaction.test.ts` says why that is the
 * honest instrument).
 */
import { MODULE_BY_ID, MODULES, type ModuleId } from '@nibblecue/core';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { sampleFrame } from './keyframes';
import {
  MODULE_WAKE,
  posed,
  ROW_ICON,
  WAKE_MOVES,
  wakeFrames,
  wakePose,
  wakes,
  type WakeMove,
  type WakePose,
} from './wakingIcon';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(here, f), 'utf8');
/** Comments out: the component explains its own rules, and a scan must not read the explanation. */
const withoutComments = (text: string): string =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');

const MOVES = Object.keys(WAKE_MOVES) as WakeMove[];
const SIZE = ROW_ICON.glyph;
/** A pose every 1/400 of the move: 1.5 ms of a 600 ms move. */
const STEPS = Array.from({ length: 401 }, (_, i) => i / 400);
const posesOf = (move: WakeMove): WakePose[] => STEPS.map(t => wakePose(move, t, SIZE));
const max = (xs: readonly number[]) => Math.max(...xs);
const min = (xs: readonly number[]) => Math.min(...xs);

describe('every module has its move', () => {
  it('covers every module in the registry, and every id the type still carries', () => {
    for (const m of MODULES) expect(WAKE_MOVES[MODULE_WAKE[m.id]], m.id).toBeDefined();
    // the retired ids are never offered, but a `Record<ModuleId, …>` cannot leave one out
    for (const id of Object.keys(MODULE_BY_ID) as ModuleId[])
      expect(MODULE_WAKE[id], id).toBeDefined();
  });

  it('gives each module a picker offers a move of its own', () => {
    const moves = MODULES.map(m => MODULE_WAKE[m.id]);
    expect(new Set(moves).size).toBe(moves.length);
  });

  it('makes the moves the owner asked for, of the things the icons draw', () => {
    const own: Partial<Record<ModuleId, WakeMove>> = {
      bottle: 'pour',
      sleep: 'sway',
      diaper: 'hop',
      pump: 'pulse',
      bath: 'splash',
      med: 'shake',
      growth: 'stretch',
      solids: 'lift',
      breastfeed: 'nod',
      tummy: 'roll',
    };
    for (const [id, move] of Object.entries(own))
      expect(MODULE_WAKE[id as ModuleId], id).toBe(move);
  });
});

describe('each move is what its name says', () => {
  it('pours: the bottle tips well over about its base, holds, and comes back upright', () => {
    const p = posesOf('pour');
    expect(max(p.map(x => x.rotate))).toBeGreaterThanOrEqual(25);
    expect(WAKE_MOVES.pour.pivot.y).toBeGreaterThan(0.3);
    // held tipped for a moment: a fifth of the move stays past 20°
    expect(p.filter(x => x.rotate > 20).length / p.length).toBeGreaterThan(0.2);
  });

  it('sways: hung from a point above it, swinging both ways, each swing smaller', () => {
    expect(WAKE_MOVES.sway.pivot.y).toBeLessThan(-0.5);
    const keys = WAKE_MOVES.sway.rotate ?? [];
    const peaks = keys.slice(1, -1).map(([, v]) => v);
    for (let i = 1; i < peaks.length; i += 1) {
      expect(Math.sign(peaks[i] ?? 0)).toBe(-Math.sign(peaks[i - 1] ?? 0));
      expect(Math.abs(peaks[i] ?? 0)).toBeLessThan(Math.abs(peaks[i - 1] ?? 0));
    }
  });

  it('hops: it leaves the ground, and squashes as it lands', () => {
    const p = posesOf('hop');
    expect(min(p.map(x => x.ty))).toBeLessThan(-0.25 * SIZE);
    // wider than tall at the landing, taller than wide on the way up
    expect(p.some(x => x.sx > 1.05 && x.sy < 0.9)).toBe(true);
    expect(p.some(x => x.sy > x.sx && x.ty < -1)).toBe(true);
  });

  it('pulses: it grows and shrinks, twice', () => {
    const scale = posesOf('pulse').map(x => x.sx);
    let peaks = 0;
    for (let i = 1; i < scale.length - 1; i += 1)
      if (
        (scale[i] ?? 1) > 1.05 &&
        (scale[i] ?? 1) >= (scale[i - 1] ?? 1) &&
        (scale[i] ?? 1) > (scale[i + 1] ?? 1)
      )
        peaks += 1;
    expect(peaks).toBe(2);
    // a pulse grows evenly: never a stretch
    for (const x of posesOf('pulse')) expect(x.sx).toBeCloseTo(x.sy, 12);
  });

  it('splashes: the tub tips up about one foot, not its middle', () => {
    expect(Math.abs(WAKE_MOVES.splash.pivot.x)).toBeGreaterThan(0.3);
    expect(min(posesOf('splash').map(x => x.rotate))).toBeLessThan(-10);
  });

  it('shakes: quick, both ways, three times or more, dying away', () => {
    const keys = (WAKE_MOVES.shake.rotate ?? []).slice(1, -1).map(([, v]) => v);
    expect(keys.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < keys.length; i += 1)
      expect(Math.sign(keys[i] ?? 0)).toBe(-Math.sign(keys[i - 1] ?? 0));
    expect(Math.abs(keys[keys.length - 1] ?? 0)).toBeLessThan(Math.abs(keys[0] ?? 0));
  });

  it('stretches: growth gets taller from its feet, more than it gets wider', () => {
    const p = posesOf('stretch');
    expect(max(p.map(x => x.sy))).toBeGreaterThan(1.15);
    expect(WAKE_MOVES.stretch.pivot.y).toBe(0.5);
    const tallest = p.reduce((a, b) => (b.sy > a.sy ? b : a));
    expect(tallest.sx).toBeLessThan(1);
  });

  it('lifts, nods and rolls: the spoon rises, the nod dips, the roll turns all the way over', () => {
    expect(min(posesOf('lift').map(x => x.ty))).toBeLessThan(-0.2 * SIZE);
    expect(max(posesOf('nod').map(x => x.rotate))).toBeGreaterThan(5);
    expect(max(posesOf('nod').map(x => x.rotate))).toBeLessThan(15);
    const roll = posesOf('roll').map(x => x.rotate);
    expect(max(roll) - min(roll)).toBeGreaterThanOrEqual(360);
  });
});

describe('the rules every move keeps', () => {
  it('is short: no move lasts over 600 ms', () => {
    for (const move of MOVES) expect(WAKE_MOVES[move].ms, move).toBeLessThanOrEqual(600);
  });

  it('starts and ends at rest, so a move cut short is set straight back to where it began', () => {
    for (const move of MOVES) {
      for (const t of [0, 1]) {
        const p = wakePose(move, t, SIZE);
        expect(p.tx, `${move} tx at ${t}`).toBeCloseTo(0, 12);
        expect(p.ty, `${move} ty at ${t}`).toBeCloseTo(0, 12);
        expect(p.sx, `${move} sx at ${t}`).toBeCloseTo(1, 12);
        expect(p.sy, `${move} sy at ${t}`).toBeCloseTo(1, 12);
        // a whole turn is where it began: the roll ends at 360°
        expect(((p.rotate % 360) + 360) % 360, `${move} turn at ${t}`).toBeCloseTo(0, 9);
      }
    }
  });

  it('stays inside the chip it is drawn in, at every frame, every corner', () => {
    // the row's chip is 32 pt and clips (`overflow: 'hidden'`), and the glyph is 16 in its middle
    const half = ROW_ICON.chip / 2;
    const g = ROW_ICON.glyph / 2;
    for (const move of MOVES) {
      const pivot = { x: WAKE_MOVES[move].pivot.x * SIZE, y: WAKE_MOVES[move].pivot.y * SIZE };
      for (const [i, pose] of posesOf(move).entries())
        for (const corner of [
          { x: -g, y: -g },
          { x: g, y: -g },
          { x: -g, y: g },
          { x: g, y: g },
        ]) {
          const p = posed(pose, pivot, corner);
          const at = `${move} at ${STEPS[i]}`;
          expect(Math.abs(p.x), at).toBeLessThanOrEqual(half - 0.5);
          expect(Math.abs(p.y), at).toBeLessThanOrEqual(half - 0.5);
        }
    }
  });

  it('is small: no move carries the icon more than a third of itself from where it sits', () => {
    for (const move of MOVES)
      for (const p of posesOf(move)) {
        expect(Math.hypot(p.tx, p.ty), move).toBeLessThanOrEqual(SIZE / 3);
        expect(Math.max(p.sx, p.sy), move).toBeLessThanOrEqual(1.25);
        expect(Math.min(p.sx, p.sy), move).toBeGreaterThanOrEqual(0.85);
      }
  });

  it('hands interpolate frames it can read, and they draw the same move', () => {
    for (const move of MOVES) {
      const f = wakeFrames(move, SIZE);
      for (const [name, fr] of Object.entries({
        tx: f.tx,
        ty: f.ty,
        rotate: f.rotate,
        sx: f.sx,
        sy: f.sy,
      })) {
        expect(fr.inputRange.length, `${move} ${name}`).toBe(fr.outputRange.length);
        expect(fr.inputRange.length, `${move} ${name}`).toBeGreaterThanOrEqual(2);
        for (let i = 1; i < fr.inputRange.length; i += 1)
          expect(fr.inputRange[i] ?? 0).toBeGreaterThan(fr.inputRange[i - 1] ?? 0);
        expect(fr.inputRange[0] ?? -1).toBeGreaterThanOrEqual(0);
        expect(fr.inputRange[fr.inputRange.length - 1] ?? 2).toBeLessThanOrEqual(1);
        // clamped: nothing is meant to carry past its own last point
        expect(fr.extrapolate, `${move} ${name}`).toBe('clamp');
      }
      for (const t of STEPS) {
        const p = wakePose(move, t, SIZE);
        expect(sampleFrame(f.tx, t), `${move} tx`).toBeCloseTo(p.tx, 0);
        expect(sampleFrame(f.ty, t), `${move} ty`).toBeCloseTo(p.ty, 0);
        expect(Math.abs(sampleFrame(f.rotate, t) - p.rotate), `${move} rotate`).toBeLessThan(2.5);
        expect(Math.abs(sampleFrame(f.sx, t) - p.sx), `${move} sx`).toBeLessThan(0.02);
        expect(Math.abs(sampleFrame(f.sy, t) - p.sy), `${move} sy`).toBeLessThan(0.02);
      }
      expect(f.pivot).toEqual({
        x: WAKE_MOVES[move].pivot.x * SIZE,
        y: WAKE_MOVES[move].pivot.y * SIZE,
      });
    }
  });
});

describe('when it plays', () => {
  it('only on the way on: not on the way off, not when nothing changed', () => {
    expect(wakes(false, true, false)).toBe(true);
    expect(wakes(true, false, false)).toBe(false);
    expect(wakes(true, true, false)).toBe(false);
    expect(wakes(false, false, false)).toBe(false);
  });

  it('never under reduce motion or in the amber night theme', () => {
    expect(wakes(false, true, true)).toBe(false);
  });
});

describe('the component, where a device would be needed to see it', () => {
  const src = withoutComments(read('WakingIcon.tsx'));
  const flat = src.replace(/\s+/g, ' ');

  it('never plays on mount: it remembers the value it opened with', () => {
    expect(flat).toContain('const was = useRef(on);');
    expect(flat).toContain('const play = wakes(was.current, on, still);');
  });

  it('is still under reduce motion and in the amber theme', () => {
    expect(flat).toContain("const still = t.reduceMotion || t.theme === 'night';");
  });

  it('runs on the native driver, transforms only, and never stops half way', () => {
    expect(flat).toContain('useNativeDriver: true');
    expect(flat).not.toContain('useNativeDriver: false');
    expect(flat).not.toMatch(/opacity:/);
    expect(flat).toContain('run.stop(); progress.setValue(1);');
    // at rest the value is 1, which every move's frames hold at rest
    expect(flat).toContain('new Animated.Value(1)');
  });

  it('takes a move of the caller’s choosing, and a delay it holds at rest through (2026-09-26)', () => {
    // setup's supplies list: every category hops when its row is first filled, a beat after its
    // sheet has gone — the module's own move is still the default everywhere else
    expect(flat).toContain('const move = chosen ?? MODULE_WAKE[module];');
    expect(flat).toContain('delay = 0,');
    expect(flat).toContain('duration: WAKE_MOVES[move].ms, delay,');
    // a new delay is not a reason to play again: `wakes` only answers a change of `on`
    expect(flat).toContain('}, [delay, move, on, progress, still]);');
    for (const move of MOVES) {
      expect(wakePose(move, 0, SIZE)).toEqual({ tx: 0, ty: 0, rotate: 0, sx: 1, sy: 1 });
    }
  });

  it('takes no touch and adds nothing a screen reader meets', () => {
    expect(flat).toContain('<Animated.View pointerEvents="none"');
    expect(flat).not.toMatch(/accessibilityLabel|accessibilityRole|accessible\b/);
  });

  it('turns and grows about the move’s pivot: out to it, turn, stretch, and back', () => {
    const order = [
      '{ translateX: x }',
      '{ translateY: y }',
      '{ rotate: deg(f.rotate) }',
      '{ scaleX: num(f.sx) }',
      '{ scaleY: num(f.sy) }',
      '{ translateX: -x }',
      '{ translateY: -y }',
    ].map(s => flat.indexOf(s));
    for (const i of order) expect(i).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});

describe('where a row draws the icon', () => {
  it('hands Row its own glyph, at Row’s size and in Row’s ink, inside WakingIcon', () => {
    const flat = withoutComments(read('WakingIcon.tsx')).replace(/\s+/g, ' ');
    // `icon` still goes to Row: it is what makes Row draw the chip and its tint at all
    expect(flat).toContain('return { icon: glyph, iconNode: <RowGlyph');
    expect(flat).toContain('ink={tint?.fg ?? null}');
    // Row's own rule for the glyph's ink: the tint's hue, else `text2` on the neutral chip
    expect(flat).toContain(
      '<WakingIcon module={module} on={on} size={ROW_ICON.glyph}> <Icon name={glyph} size={ROW_ICON.glyph} color={ink ?? t.color.text2} /> </WakingIcon>',
    );
    const row = withoutComments(read('Row.tsx'));
    expect(row).toContain(
      'const chip = tint ?? { fg: t.color.text2, soft: t.color.surface2, disc: null };',
    );
  });

  it('is Row’s own chip and glyph size, and the chip clips', () => {
    const row = withoutComments(read('Row.tsx'));
    expect(row).toContain(`const ICON_CHIP = ${ROW_ICON.chip};`);
    expect(row).toContain(
      `{iconNode ?? <Icon name={icon} size={${ROW_ICON.glyph}} color={chip.fg} />}`,
    );
    expect(row).toMatch(/chip: \{[^}]*overflow: 'hidden'/);
  });
});
