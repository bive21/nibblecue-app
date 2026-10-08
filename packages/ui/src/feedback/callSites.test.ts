/**
 * WHAT THE DESIGN SYSTEM'S CONTROLS FEEL LIKE, AND WHERE (the owner, 2026-09-25, of the "that's
 * cool" list: "a soft tick per stepper step, a firm tap on Save, a double tap when a timer starts,
 * a click at each theme-switch stop … Let's try doing everything").
 *
 * Two halves, the way this package tests anything a thumb touches. The RULES are pure and are run
 * here — which tap on an option is felt as what (`choice.ts`), and how close two stepper ticks may
 * be (`tickDue`). Where each control CALLS them can only be seen in its source, because this suite
 * has no renderer (`components/interaction.test.ts` says why a tripwire is the honest instrument),
 * so each call site is pinned by the line that makes it: the kind it fires, that it fires in the
 * press handler and nowhere else, and that it fires once.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { TICK_MIN_GAP_MS, tickDue, REPEAT_FAST_MS } from '../components/stepperMath';
import { choiceHaptic, feelChoice } from './choice';
import { setHapticsDriver, setHapticsEnabled, type HapticKind } from './haptics';

const here = dirname(fileURLToPath(import.meta.url));
const components = join(here, '..', 'components');
/** Comments out, whitespace flattened: a comment may quote the call it explains. */
const code = (file: string): string =>
  readFileSync(join(components, file), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');
const count = (src: string, needle: string): number => src.split(needle).length - 1;

afterEach(() => {
  setHapticsDriver(null);
  setHapticsEnabled(true);
});

describe('choosing one of a few (choice.ts)', () => {
  it('warns on a locked option, feels nothing on the chosen one, and the control’s kind on a new one', () => {
    for (const kind of ['tap', 'tick'] as const) {
      expect(choiceHaptic({ locked: false, current: false, kind })).toBe(kind);
      expect(choiceHaptic({ locked: false, current: true, kind })).toBeNull();
      // the lock wins, whatever else is true: nothing is chosen, and the gate opens
      expect(choiceHaptic({ locked: true, current: false, kind })).toBe('warning');
      expect(choiceHaptic({ locked: true, current: true, kind })).toBe('warning');
    }
  });

  it('is felt through the one haptic() call, once per tap, and not at all when nothing moved', () => {
    const felt: HapticKind[] = [];
    setHapticsDriver(k => felt.push(k));
    feelChoice({ locked: false, current: false, kind: 'tick' });
    feelChoice({ locked: false, current: true, kind: 'tick' });
    feelChoice({ locked: true, current: false, kind: 'tap' });
    expect(felt).toEqual(['tick', 'warning']);
  });

  it('is silent when the parent has turned vibration off', () => {
    const felt: HapticKind[] = [];
    setHapticsDriver(k => felt.push(k));
    setHapticsEnabled(false);
    feelChoice({ locked: true, current: false, kind: 'tap' });
    expect(felt).toEqual([]);
  });
});

describe('the stepper’s tick (tickDue)', () => {
  it('feels the first step, and every step at least 40 ms after the last one felt', () => {
    expect(TICK_MIN_GAP_MS).toBe(40);
    expect(tickDue(null, 1_000)).toBe(true);
    expect(tickDue(1_000, 1_039)).toBe(false);
    expect(tickDue(1_000, 1_040)).toBe(true);
  });

  it('never holds back a step of the hold: the fastest repeat is well above the floor', () => {
    // every step of a hold is felt — the floor is for what is faster than any hold
    expect(REPEAT_FAST_MS).toBeGreaterThanOrEqual(TICK_MIN_GAP_MS);
    let last: number | null = null;
    let ticks = 0;
    for (let at = 0; at <= 600; at += REPEAT_FAST_MS) {
      if (tickDue(last, at)) {
        last = at;
        ticks += 1;
      }
    }
    expect(ticks).toBe(600 / REPEAT_FAST_MS + 1);
  });

  it('thins a burst to one tick per 40 ms rather than a buzz', () => {
    let last: number | null = null;
    const felt: number[] = [];
    // ten steps in 50 ms: a thumb drumming, or a stalled run catching up
    for (let at = 0; at < 50; at += 5) {
      if (tickDue(last, at)) {
        last = at;
        felt.push(at);
      }
    }
    expect(felt).toEqual([0, 40]);
  });

  it('is not silenced by a clock that went backwards', () => {
    expect(tickDue(10_000, 5_000)).toBe(true);
  });
});

describe('where each control is felt (tripwires over the source)', () => {
  it('steppers: a tick per step that moved, from the one step both steppers share', () => {
    const number = code('NumberStepper.tsx');
    const fire = number.slice(number.indexOf('export function useStepFire'));
    const refused = fire.indexOf('if (disabled || !canStep(from, delta, min, max)) return false;');
    const felt = fire.indexOf(
      "if (tickDue(felt.current, at)) { felt.current = at; haptic('tick'); }",
    );
    // after the bound check — a refused step is not felt — and before the value is reported
    expect(refused).toBeGreaterThan(-1);
    expect(felt).toBeGreaterThan(refused);
    expect(felt).toBeLessThan(fire.indexOf('onChange(next);'));
    expect(count(number, 'haptic(')).toBe(1);
    // the round stepper steps through the same `useStepFire`, so it is felt there and only there
    const round = code('RoundStepper.tsx');
    expect(round).toContain('useStepFire({ value, min, max, places, disabled, onChange })');
    expect(round).not.toContain('haptic(');
  });

  /**
   * THE RULER'S DRAG (2026-09-26): one tick per step the needle crosses, never closer than the
   * stepper's own floor — its − and + are the stepper's, and feel as they always did.
   */
  /**
   * THE MOMENT MILK LANDS IN THE STASH (2026-09-26): seen, not felt. The save that starts it was
   * felt once, as `success`, in the app's one write funnel; a second `success` at the landing, half
   * a second later, was a double buzz.
   */
  it('drop celebration: felt as nothing — the save was felt once, where every save is', () => {
    const drop = code('DropCelebration.tsx');
    expect(count(drop, 'haptic(')).toBe(0);
    expect(drop).not.toContain("from '../feedback/haptics'");
    expect(drop).toContain('const still = motionStill(t.reduceMotion, t.theme) || screenReader;');
  });

  it('ruler: a tick per step crossed under the needle, on the stepper’s floor, from one place', () => {
    const ruler = code('NumberRuler.tsx');
    const cross = ruler.slice(ruler.indexOf('const cross = (index: number): void => {'));
    expect(cross).toContain(
      "if (tickDue(felt.current, at)) { felt.current = at; haptic('tick'); }",
    );
    expect(count(ruler, 'haptic(')).toBe(1);
    expect(count(ruler, "haptic('tick')")).toBe(1);
  });

  /**
   * AFTER THE FLIP, NOT BEFORE IT: the Vibration switch is one of these, and a tap made after it
   * is handed on is felt as vibration arrives on and not felt as it goes off. Before, it would be
   * the other way round — silent turning on, a buzz turning off.
   */
  it('Switch: a tap as it flips, in its one press handler, after the flip', () => {
    const src = code('Switch.tsx');
    expect(src).toContain("onPress={() => { onValueChange(!value); haptic('tap'); }}");
    expect(count(src, 'haptic(')).toBe(1);
  });

  it('Row: a row that is a switch is felt as one, and a row that opens something is not', () => {
    const src = code('Row.tsx');
    expect(src).toContain(
      ": isSwitch ? () => { onSwitch(!switchValue); haptic('tap'); } : onPress;",
    );
    expect(count(src, 'haptic(')).toBe(1);
  });

  /**
   * A LOCKED ROW (2026-10-01; the Appearance sheet's Shape and Log row, which the owner made Plus):
   * felt as every locked option is, a `warning`, before the press is reported, and in PLACE of the
   * flip's `tap`, so a locked switch row is felt once and never twice.
   */
  it('Row: a locked row warns once, in place of the flip, and still reports the press', () => {
    const src = code('Row.tsx');
    expect(src).toContain(
      "const handlePress = locked ? () => { feelChoice({ locked, current: selected === true, kind: 'tap' }); if (isSwitch) onSwitch(!switchValue); else onPress?.(); } : isSwitch ?",
    );
    expect(count(src, 'feelChoice(')).toBe(1);
    expect(choiceHaptic({ locked: true, current: false, kind: 'tap' })).toBe('warning');
  });

  it('SegmentedControl: a tap on a new pill, a warning on a locked one, nothing on the chosen one', () => {
    const src = code('SegmentedControl.tsx');
    expect(src).toContain(
      "onPress={() => { feelChoice({ locked: o.locked === true, current: on, kind: 'tap' }); if (!on) onChange(o.value); else onReselect?.(o.value); }}",
    );
    expect(count(src, 'feelChoice(')).toBe(1);
  });

  it('Swatch: a tap on a new palette, a warning on a locked one — and the press still reports', () => {
    const src = code('Swatch.tsx');
    expect(src).toContain(
      "onPress={() => { feelChoice({ locked, current: selected, kind: 'tap' }); onPress(); }}",
    );
    expect(count(src, 'feelChoice(')).toBe(1);
  });

  it('ThemeSkyToggle: a tick for a new stop, a warning for a locked one, once per tap', () => {
    const src = code('ThemeSkyToggle.tsx');
    expect(src).toMatch(
      /feelChoice\(\{ locked: locked\?\.\[stop\] === true, current: stop === value, kind: 'tick',? \}\); onChange\(stop\);/,
    );
    // once: in the press handler, not in the effect that rolls the knob when `value` arrives
    expect(count(src, 'feelChoice(')).toBe(1);
    expect(src).not.toContain('haptic(');
  });

  it('DayNightSwitch: a tick as it flips, once', () => {
    const src = code('DayNightSwitch.tsx');
    expect(src).toContain("onPress={() => { haptic('tick'); onValueChange(!value); }}");
    expect(count(src, 'haptic(')).toBe(1);
  });

  it('Toast: a tap on Undo, and nothing on the action beside it', () => {
    const src = code('Toast.tsx');
    expect(src).toContain(
      "if (a.slot === 'undo') haptic('tap'); a.onPress(); onDismissRef.current();",
    );
    expect(count(src, 'haptic(')).toBe(1);
  });

  it('never on navigation or scrolling: the tab bar, the top bar and the sheet stay still', () => {
    for (const file of ['TabBar.tsx', 'TopBar.tsx', 'BottomSheet.tsx']) {
      const src = code(file);
      expect(src, file).not.toContain('haptic(');
      expect(src, file).not.toContain('feelChoice(');
    }
  });
});

describe('the package never reaches for the motor itself', () => {
  it('imports expo-haptics nowhere: the app installs the driver (haptics.ts says why)', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap(name => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(name) ? [p] : [];
      });
    const files = walk(join(here, '..'));
    expect(files.length).toBeGreaterThan(50);
    for (const f of files) {
      if (f.endsWith('callSites.test.ts')) continue;
      expect(readFileSync(f, 'utf8'), f).not.toMatch(/['"]expo-haptics['"]/);
    }
  });
});
