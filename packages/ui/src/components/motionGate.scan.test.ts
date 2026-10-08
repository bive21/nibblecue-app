/**
 * EVERY LOOP ASKS THE GATE (docs/DESIGN_SYSTEM.md §7.1). This suite cannot render React Native, so
 * what only a phone can show — a loop that keeps turning for a page nobody is looking at — is held
 * by tripwires over the source: every file in this package that starts an `Animated.loop` either
 * asks `useMotionActive` / `useMotionAwake` itself or is handed the answer by its caller, and the
 * running cards' once-a-second tick stops with its page.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const read = (f: string): string => readFileSync(join(here, f), 'utf8');
const withoutComments = (src: string): string =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
const flat = (f: string): string => withoutComments(read(f)).replace(/\s+/g, ' ');

/**
 * A LOOP THAT IS HANDED ITS ANSWER instead of asking: the caller already knows more than the gate
 * does (the Schedule knows whether the dot's row is scrolled into view), so it passes `running`.
 */
const HANDED: Record<string, string> = {
  'SoonDot.tsx': 'const breathes = shown && !still && running;',
};

const loopFiles = readdirSync(here)
  .filter(f => f.endsWith('.tsx'))
  .filter(f => withoutComments(read(f)).includes('Animated.loop('));

describe('every loop in the design system stops when nobody can see it', () => {
  it('finds the loops it is guarding (a rename must not empty this test)', () => {
    // six since 2026-09-26: `Skeleton.tsx`, drawn by no screen, went in the dead-code sweep
    expect(loopFiles.length).toBeGreaterThanOrEqual(6);
    for (const f of [
      'PathCard.tsx',
      'TimerMotion.tsx',
      'LogoLoader.tsx',
      'SoonDot.tsx',
      'StarfieldCredits.tsx',
      'StopButton.tsx',
    ])
      expect(loopFiles, f).toContain(f);
  });

  it('asks the gate, or is handed the answer by a caller that knows more', () => {
    for (const f of loopFiles) {
      const src = flat(f);
      const asks = /\buseMotion(Active|Awake)\(\)/.test(src);
      const handed = HANDED[f];
      expect(asks || (handed !== undefined && src.includes(handed)), f).toBe(true);
    }
  });

  it('keeps what a paused loop DRAWS on its still rule, and only its clock on the gate', () => {
    // the Start breath is drawn while nothing is chosen; its clock turns only while awake
    expect(flat('PathCard.tsx')).toContain('const turning = breathing && awake;');
    expect(flat('PathCard.tsx')).toContain('}, [turning, pulse]);');
    // the stop's ring is drawn by its motion rule, and pulses only while awake
    expect(flat('StopButton.tsx')).toContain('const pulsing = animatePulse && awake;');
    // the running card's one loop, the nap's "z"s: its clock turns only while active
    expect(flat('TimerMotion.tsx')).toContain('if (!turning) return undefined;');
    expect(flat('TimerMotion.tsx')).toContain('const turning = useMotionActive();');
  });

  it('starts a resumed native loop from its beginning, never half way round', () => {
    // a native loop repeats from wherever its value stood when it started; a loop paused mid-turn
    // is put back to its start while nobody is looking
    const loader = flat('LogoLoader.tsx');
    expect(loader).toContain(
      'if (!awake) { travel.setValue(0); breath.setValue(1); return undefined; }',
    );
    const sky = flat('StarfieldCredits.tsx');
    expect(sky).toContain(
      'if (!awake) { for (const v of drift) v.setValue(0); return undefined; }',
    );
  });

  it('lets a loader breathe under reduce motion and in Night, but never out of sight', () => {
    // the loader is the promise that something is happening: awake, not active
    expect(flat('LogoLoader.tsx')).toContain('const awake = useMotionAwake();');
    expect(flat('LogoLoader.tsx')).not.toContain('useMotionActive()');
  });
});

describe('the running card’s tick', () => {
  const card = flat('TimerCard.tsx');

  it('stops with its page and with the app, and reads the clock afresh when it is back', () => {
    expect(card).toContain('const awake = useMotionAwake();');
    expect(card).toContain('if (injected !== undefined || !awake) return; setNow(Date.now());');
    // one clock, not two: the app's state reaches it through the gate, not a listener of its own
    expect(card).not.toContain('AppState');
  });

  it('never stops for reduce motion or Night: digits are information, not motion', () => {
    const tick = card.slice(card.indexOf('export function useTimerNow'));
    expect(tick.slice(0, tick.indexOf('return injected ?? now;'))).not.toMatch(
      /useMotionActive|reduceMotion|motionStill/,
    );
  });

  it('keeps what does not change with the second out of the second’s re-render', () => {
    for (const [f, name] of [
      ['StopButton.tsx', 'StopButton'],
      ['TimerArt.tsx', 'TimerArt'],
      ['CardArtLayer.tsx', 'CardArtLayer'],
      ['TimerMotion.tsx', 'TimerMotion'],
    ] as const)
      expect(flat(f), f).toContain(`export const ${name} = memo(`);
    expect(card).toContain(
      'const artCover = useMemo(() => coverBorderBox(0, t.radius.m), [t.radius.m]);',
    );
    expect(card).toContain('<CardArtLayer art={picture} cover={artCover} />');
  });
});

describe('the page’s ground', () => {
  it('is memoized, so a page re-render does not redraw its thirty-six doodles', () => {
    expect(flat('Ground.tsx')).toContain('export const Ground = memo(function Ground(');
  });
});

describe('the gate itself', () => {
  const gate = flat('MotionGate.tsx');

  it('listens to the app state once, for every reader', () => {
    expect(gate.match(/AppState\.addEventListener\(/g) ?? []).toHaveLength(1);
    expect(gate).toContain('useSyncExternalStore(subscribe, readActive, readActive)');
    expect(gate).toContain('subscription.remove();');
  });

  it('nests: a gate inside a closed gate is closed', () => {
    expect(gate).toContain('value={gateOpen(outer, active)}');
  });

  it('is open outside every gate, so a sheet over the app is never paused by mistake', () => {
    expect(gate).toContain('const GateContext = createContext(true);');
  });

  it('asks for nothing Expo Go does not carry', () => {
    const imports = [...withoutComments(read('MotionGate.tsx')).matchAll(/from '([^']+)'/g)].map(
      m => m[1],
    );
    for (const source of imports)
      expect(
        ['react', 'react-native'].includes(source ?? '') || /^\./.test(source ?? ''),
        source,
      ).toBe(true);
  });
});
