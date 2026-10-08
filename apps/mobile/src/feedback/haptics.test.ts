/**
 * THE APP'S HALF OF HAPTICS (the owner, 2026-09-25, of the "that's cool" list: "a soft tick per
 * stepper step, a firm tap on Save, a double tap when a timer starts, a click at each theme-switch
 * stop … Let's try doing everything. I will then review").
 *
 * Three things are proved here in node, with no phone and no native module:
 *
 *   THE MOTOR — what each kind asks expo-haptics for (`motor.ts`), handed a recorder in its place;
 *   THE SWITCH — the parent's Vibration setting: its key, its default, its round trip, that it
 *     outlives a sign-out, and the order launch does things in (`setting.ts`);
 *   THE CALL SITES — where the app makes something felt, read off the source, because this suite
 *     cannot render a sheet (`packages/ui/src/components/interaction.test.ts` says why a tripwire
 *     is the honest instrument). The design system's own controls are pinned in
 *     `packages/ui/src/feedback/callSites.test.ts`.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  haptic,
  hapticsEnabled,
  setHapticsDriver,
  setHapticsEnabled,
  type HapticKind,
} from '@nibblecue/ui/haptics';
import { afterEach, describe, expect, it } from 'vitest';
import {
  clearForHouseholdEnd,
  clearForSignOut,
  DEVICE_LEVEL_KEYS,
  memoryStore,
  survivesSignOut,
  type KeyValueStore,
} from '../prefs';
import { clearStopped, markStopped } from '../sheets/quick/stopped';
import { createHapticsDriver, DOUBLE_GAP_MS, feltFor, PULSE_MS, type HapticsMotor } from './motor';
import {
  bootHaptics,
  chooseHaptics,
  HAPTICS_DEFAULT,
  HAPTICS_KEY,
  hapticsOn,
  loadHaptics,
  parseHaptics,
  subscribeHaptics,
} from './setting';

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, '..');
const mobile = join(src, '..');
/** Comments out, whitespace flattened: a comment may quote the call it explains. */
const code = (path: string): string =>
  readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');
const count = (text: string, needle: string): number => text.split(needle).length - 1;

afterEach(() => {
  setHapticsDriver(null);
  setHapticsEnabled(true);
});

/* ------------------------------------------------------------------------------ the motor */

/** expo-haptics' shape, recording what it was asked for. Its enums' values are expo-haptics' own. */
function recorder(fail?: 'reject' | 'throw') {
  const calls: string[] = [];
  const act = (name: string): Promise<void> => {
    if (fail === 'throw') throw new Error('no motor');
    calls.push(name);
    return fail === 'reject' ? Promise.reject(new Error('no vibrator')) : Promise.resolve();
  };
  const motor: HapticsMotor = {
    selectionAsync: () => act('selection'),
    impactAsync: style => act(`impact:${style}`),
    notificationAsync: type => act(`notification:${type}`),
    ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
    NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
  };
  return { motor, calls };
}

/** A clock the test moves, and a timer queue it runs by hand. */
function rig(fail?: 'reject' | 'throw') {
  const { motor, calls } = recorder(fail);
  let clock = 1_000;
  const queued: { at: number; fn: () => void }[] = [];
  const driver = createHapticsDriver({
    motor,
    later: (fn, ms) => queued.push({ at: clock + ms, fn }),
    now: () => clock,
  });
  const advance = (ms: number) => {
    clock += ms;
    for (const q of queued.filter(x => x.at <= clock)) {
      queued.splice(queued.indexOf(q), 1);
      q.fn();
    }
  };
  return { driver, calls, advance, queued };
}

describe('the motor: what each kind asks expo-haptics for', () => {
  it('on Android uses touch feedback, which the system withholds when haptics are off', () => {
    const calls: string[] = [];
    const motor: HapticsMotor = {
      selectionAsync: () => Promise.resolve(),
      impactAsync: () => {
        calls.push('impact');
        return Promise.resolve();
      },
      notificationAsync: () => Promise.resolve(),
      ImpactFeedbackStyle: { Light: 'light', Medium: 'medium' },
      NotificationFeedbackType: { Success: 'success', Warning: 'warning' },
      performAndroidHapticsAsync: type => {
        calls.push(type);
        return Promise.resolve();
      },
      AndroidHaptics: {
        Clock_Tick: 'clock-tick',
        Context_Click: 'context-click',
        Confirm: 'confirm',
        Reject: 'reject',
      },
    };
    const driver = createHapticsDriver({
      motor,
      platform: 'android',
      later: () => undefined,
      now: () => 1,
    });
    driver('tap');
    driver('warning');
    expect(calls).toEqual(['context-click', 'reject']);
    expect(calls).not.toContain('impact');
  });

  it('maps every meaning to its call', () => {
    const table: Record<HapticKind, string[]> = {
      tick: ['selection'],
      tap: ['impact:light'],
      thud: ['impact:medium'],
      double: ['impact:light'],
      success: ['notification:success'],
      warning: ['notification:warning'],
    };
    for (const [kind, expected] of Object.entries(table) as [HapticKind, string[]][]) {
      const r = rig();
      r.driver(kind);
      expect(r.calls, kind).toEqual(expected);
    }
  });

  it('plays a double as two light taps, 90 ms apart', () => {
    const r = rig();
    r.driver('double');
    expect(r.calls).toEqual(['impact:light']);
    expect(r.queued.map(q => q.at - 1_000)).toEqual([DOUBLE_GAP_MS]);
    r.advance(DOUBLE_GAP_MS - 1);
    expect(r.calls).toHaveLength(1);
    r.advance(1);
    expect(r.calls).toEqual(['impact:light', 'impact:light']);
    expect(DOUBLE_GAP_MS).toBe(90);
  });

  it('feels the same kind asked for twice at once only once — both twins’ timers starting', () => {
    const r = rig();
    r.driver('double');
    r.advance(8);
    r.driver('double');
    r.advance(200);
    expect(r.calls).toEqual(['impact:light', 'impact:light']);
    // a start a moment later is its own start
    r.driver('double');
    expect(r.calls).toHaveLength(3);
    expect(feltFor('double')).toBe(DOUBLE_GAP_MS + PULSE_MS);
  });

  it('lets every tick the stepper lets through, and never merges two different kinds', () => {
    const r = rig();
    for (let i = 0; i < 5; i += 1) {
      r.driver('tick');
      r.advance(PULSE_MS);
    }
    expect(r.calls).toEqual(Array(5).fill('selection'));
    const s = rig();
    s.driver('tap');
    s.driver('thud');
    expect(s.calls).toEqual(['impact:light', 'impact:medium']);
  });

  it('is not silenced by a clock that went backwards', () => {
    const { motor, calls } = recorder();
    let clock = 10_000;
    const driver = createHapticsDriver({ motor, later: () => undefined, now: () => clock });
    driver('thud');
    clock = 5_000;
    driver('thud');
    expect(calls).toEqual(['impact:medium', 'impact:medium']);
  });

  it('never leaves a rejection behind: a phone with no vibrator is simply still', async () => {
    const unhandled: unknown[] = [];
    const listen = (e: unknown) => unhandled.push(e);
    process.on('unhandledRejection', listen);
    try {
      const r = rig('reject');
      r.driver('warning');
      r.driver('double');
      r.advance(DOUBLE_GAP_MS);
      await new Promise(resolve => setTimeout(resolve, 10));
      expect(r.calls).toHaveLength(3);
      expect(unhandled).toEqual([]);
    } finally {
      process.off('unhandledRejection', listen);
    }
  });

  it('never throws, even when the motor throws before it can reject', () => {
    const r = rig('throw');
    expect(() => r.driver('tap')).not.toThrow();
    expect(() => r.driver('double')).not.toThrow();
    expect(() => r.advance(DOUBLE_GAP_MS)).not.toThrow();
  });

  it('is what haptic() drives, and the parent’s switch turns it off', () => {
    const r = rig();
    setHapticsDriver(r.driver);
    haptic('thud');
    setHapticsEnabled(false);
    haptic('warning');
    expect(r.calls).toEqual(['impact:medium']);
  });
});

/* ----------------------------------------------------------------------------- the switch */

describe('the Vibration setting', () => {
  it('is on until it is turned off, and only an explicit off is off', () => {
    expect(HAPTICS_DEFAULT).toBe(true);
    expect(parseHaptics(null)).toBe(true);
    expect(parseHaptics('1')).toBe(true);
    expect(parseHaptics('0')).toBe(false);
    expect(parseHaptics('garbled')).toBe(true);
  });

  it('is device-level: it outlives a sign-out and a household leaving the phone', async () => {
    expect(HAPTICS_KEY).toBe('haptics');
    expect(DEVICE_LEVEL_KEYS.has(HAPTICS_KEY)).toBe(true);
    expect(survivesSignOut(HAPTICS_KEY)).toBe(true);
    const store = memoryStore({ [HAPTICS_KEY]: '0', last_child_id: 'c1' });
    await clearForSignOut(store);
    expect(await store.keys()).toEqual([HAPTICS_KEY]);
    await clearForHouseholdEnd(store, 'u1');
    expect(await loadHaptics(store)).toBe(false);
  });

  it('round-trips through the store, and a store that cannot be read is the default', async () => {
    const store = memoryStore();
    expect(await loadHaptics(store)).toBe(true);
    await chooseHaptics(store, false);
    expect(await store.get(HAPTICS_KEY)).toBe('0');
    expect(await loadHaptics(store)).toBe(false);
    await chooseHaptics(store, true);
    expect(await store.get(HAPTICS_KEY)).toBe('1');
    const broken: KeyValueStore = {
      ...memoryStore(),
      get: () => Promise.reject(new Error('storage unavailable')),
    };
    expect(await loadHaptics(broken)).toBe(true);
  });

  it('takes effect before anything waits, and tells the row', async () => {
    const store = memoryStore();
    let heard = 0;
    const off = subscribeHaptics(() => (heard += 1));
    const pending = chooseHaptics(store, false);
    // the design system's switch has moved before the write has even started to land
    expect(hapticsEnabled()).toBe(false);
    expect(hapticsOn()).toBe(false);
    expect(heard).toBe(1);
    await pending;
    off();
    await chooseHaptics(store, true);
    expect(heard).toBe(1);
  });

  it('keeps the choice for this launch when the store cannot write it', async () => {
    const broken: KeyValueStore = {
      ...memoryStore(),
      set: () => Promise.reject(new Error('disk full')),
    };
    await expect(chooseHaptics(broken, false)).resolves.toBeUndefined();
    expect(hapticsEnabled()).toBe(false);
  });
});

describe('launch: the stored choice first, then the motor', () => {
  it('installs the motor only once a parent’s "off" is already in force', async () => {
    const store = memoryStore({ [HAPTICS_KEY]: '0' });
    const seenAtInstall: boolean[] = [];
    await bootHaptics(store, () => seenAtInstall.push(hapticsEnabled()));
    expect(seenAtInstall).toEqual([false]);
    expect(hapticsOn()).toBe(false);
  });

  it('is on at launch with nothing stored', async () => {
    setHapticsEnabled(false);
    let installed = 0;
    await bootHaptics(memoryStore(), () => (installed += 1));
    expect(installed).toBe(1);
    expect(hapticsEnabled()).toBe(true);
  });

  it('lets a choice made while the read was still out win over the read', async () => {
    let answer: (v: string | null) => void = () => undefined;
    const slow: KeyValueStore = {
      ...memoryStore(),
      get: () =>
        new Promise<string | null>(resolve => {
          answer = resolve;
        }),
    };
    const booting = bootHaptics(slow, () => undefined);
    await chooseHaptics(memoryStore(), true);
    answer('0');
    await booting;
    expect(hapticsEnabled()).toBe(true);
  });
});

/* ------------------------------------------------------------------------ the call sites */

describe('where the app makes something felt (tripwires over the source)', () => {
  it('installs the motor once, as the root mounts, from a guarded lookup', () => {
    const app = code(join(mobile, 'App.tsx'));
    expect(app).toContain("import { startHaptics } from './src/feedback/native';");
    expect(app).toContain('useEffect(() => void startHaptics(), []);');
    expect(count(app, 'startHaptics(')).toBe(1);
    const native = code(join(here, 'native.ts'));
    // at run time, inside a try: a build without the native side is still, never dead
    expect(native).toMatch(/try \{ const mod = require\('expo-haptics'\)/);
    expect(native).toContain('setHapticsDriver( createHapticsDriver({');
    expect(native).toContain('return bootHaptics(prefsStore, () => { installHapticsMotor(); })');
  });

  it('reaches for expo-haptics in exactly one place, and never by a static import', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap(name => {
        const p = join(dir, name);
        return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(name) ? [p] : [];
      });
    const files = [...walk(src), join(mobile, 'App.tsx'), join(mobile, 'index.ts')];
    expect(files.length).toBeGreaterThan(200);
    const reaching = files.filter(
      f => !f.endsWith('.test.ts') && /['"]expo-haptics['"]/.test(code(f)),
    );
    expect(reaching.map(f => f.slice(src.length + 1))).toEqual(['feedback/native.ts']);
    for (const f of reaching) expect(code(f)).not.toMatch(/from 'expo-haptics'/);
  });

  it('puts the Vibration row on the Appearance sheet, right under the Log row', () => {
    const row = code(join(here, 'HapticsRow.tsx'));
    expect(row).toContain("title: 'Vibration',");
    expect(row).toContain("detail: 'A light tap when you save, step or start a timer',");
    expect(row).toContain('testID="appearance.sheet.haptics"');
    expect(row).toContain('switchValue={on}');
    expect(row).toContain('onSwitch={next => void chooseHaptics(prefsStore, next)}');
    expect(row).toContain('const on = useHapticsOn();');
    const sheet = code(join(src, 'appearance', 'AppearanceSheet.tsx'));
    expect(sheet).toContain("import { HapticsRow } from '../feedback/HapticsRow';");
    expect(count(sheet, '<HapticsRow />')).toBe(1);
    const at = sheet.indexOf('<HapticsRow />');
    expect(at).toBeGreaterThan(sheet.indexOf('testID="appearance.sheet.logSlider"'));
    // and before the next section, which since the sheet's reorder the same day (Theme first,
    // Design last — `appearance/sheet.test.ts`) is Design rather than Theme
    expect(at).toBeLessThan(sheet.indexOf('<Label>Design</Label>'));
    expect(sheet.indexOf('<Label>Log row</Label>')).toBeGreaterThan(
      sheet.indexOf('<Label>Theme</Label>'),
    );
  });

  /**
   * ONE SOFT "DONE" PER SAVE (the owner, 2026-09-26, "agreed", of the Save whose words give way to a
   * check: "a soft haptic('success')"). It replaced the firm `thud` of 2026-09-25 rather than joining
   * it: a save is felt ONCE, in the funnel every committed write goes through, and the check the
   * Save draws is felt as nothing — `Button` never calls `haptic` (`packages/ui` callSites.test.ts).
   */
  it('feels every committed save once, as success, in the one funnel, and never one that was not', () => {
    const ctx = code(join(src, 'sheets', 'quick', 'useWriteContext.ts'));
    const announce = ctx.slice(ctx.indexOf('const announce = useCallback('));
    const committed = announce.indexOf('if (!outcome.committed) return;');
    const done = announce.indexOf("haptic('success');");
    expect(committed).toBeGreaterThan(-1);
    expect(done).toBeGreaterThan(committed);
    // before the toast that says what was written, which every committed save shows
    expect(done).toBeLessThan(announce.indexOf('toast.show(sentence'));
    expect(count(ctx, "haptic('success')")).toBe(1);
    // exactly ONE haptic on a committed save: the firm thud is gone, not doubled up with it
    expect(ctx).not.toContain("haptic('thud')");
    const felt = announce.slice(committed, announce.indexOf('toast.show(sentence'));
    expect(count(felt, 'haptic(')).toBe(1);
    // and the sheet host that shows the Save's check, and the form that draws it, feel nothing
    for (const file of [
      join(src, 'app', 'QuickEntrySheet.tsx'),
      join(src, 'sheets', 'quick', 'QuickEntry.tsx'),
      join(src, 'sheets', 'quick', 'saveTick.ts'),
    ])
      expect(code(file), file).not.toContain('haptic(');
    // an Undo that could not be made says so, and is felt as refused
    expect(ctx).toContain(
      "} catch (err) { haptic('warning'); toast.show(err instanceof Error ? err.message : 'That could not be undone');",
    );
  });

  it('doubles on a timer start that was written, warns on one that was refused', () => {
    const actions = code(join(src, 'sheets', 'quick', 'useTimerActions.ts'));
    // a callback runs to the next one. `stop` has sat above `start` since the sleep/play question
    // (2026-09-27): `start` ends a running rival through it, so it must be declared first
    const callback = (name: string): string => {
      const head = `const ${name} = useCallback`;
      const from = actions.indexOf(head);
      const next = actions.indexOf(' = useCallback', from + head.length);
      return actions.slice(from, next === -1 ? undefined : next);
    };
    const start = callback('start');
    expect(start).not.toBe('');
    expect(start).toContain(
      "if (clash) { haptic('warning'); say(alreadyRunning(wordOf(args.type), args.childName)); return null; }",
    );
    expect(start).toContain(
      "if (outcome.committed) { haptic('double'); } else { haptic('warning'); say(alreadyRunning(wordOf(args.type), args.childName)); }",
    );
    // a stop is felt as the entry it wrote (`success`), through `announce` — never a second time
    const rest = actions.slice(actions.indexOf('const stop = useCallback')).replace(start, '');
    expect(rest).not.toContain('haptic(');
    expect(rest).toContain('announce(outcome, sentence);');
    expect(count(actions, "haptic('double')")).toBe(1);
  });

  it('thuds on a pump’s stop, once, in the one store every pump stop goes through', () => {
    const stopped = code(join(src, 'sheets', 'quick', 'stopped.ts'));
    expect(stopped).toContain(
      "if (stops.get(timerId) === atMs) return; stops.set(timerId, atMs); haptic('thud'); announce();",
    );
    const felt: HapticKind[] = [];
    setHapticsDriver(k => felt.push(k));
    try {
      markStopped('pump-felt', 1_000);
      // the same stop again changes nothing, and is felt as nothing
      markStopped('pump-felt', 1_000);
      expect(felt).toEqual(['thud']);
    } finally {
      clearStopped('pump-felt');
    }
  });

  /**
   * A SAVE OR A STOP THE APP REFUSES, AND SAYS SO: an end the session cannot have had, from the
   * long-run card's "It ended" or the running sheet's End time (CuddleCue's stash's two refusals are not in NibbleCue). (A timer start's refusal is pinned
   * above; a start time CORRECTED past a pump's stop is a correction rather than a save or a stop,
   * and is left as the sentence alone.)
   */
  it('warns on every refused save or stop, beside the sentence that explains it', () => {
    const refusals: [string, string][] = [
      // "It ended" and the running sheet's End time: the one end rule both call (`timerEnd.ts`)
      [join(src, 'sheets', 'quick', 'timerEnd.ts'), 'deps.say(END_REFUSED[refused])'],
      // (CuddleCue's two stash refusals, StashSaveSheet and AddStashSheet: no stash UI here)
    ];
    for (const [file, sentence] of refusals) {
      const text = code(file);
      expect(text, file).toContain(`haptic('warning'); ${sentence}`);
      expect(count(text, 'haptic('), file).toBe(1);
    }
  });
});
