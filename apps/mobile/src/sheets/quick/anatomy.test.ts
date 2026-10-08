/**
 * The Quick Entry anatomy, pinned (PRODUCT_SPEC.md §5.2).
 *
 * There is no React Native renderer in this workspace — every vitest project here is
 * `environment: 'node'` and collects `src/**\/*.test.ts` — so a sheet cannot be mounted and
 * asserted on. What CAN be asserted is the source: §5.2's six parts, in order, in one file.
 *
 * The scan looks for CODE, not for the numbered comments that label each part. A tripwire
 * that matched its own explanatory comment is a tripwire that passes when the code beneath it
 * has been deleted, and this repository has produced that bug three times already.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { bylineText, BYLINE_BANNED } from './byline';

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, 'QuickEntry.tsx'), 'utf8');

/** Strip comments so no assertion below can be satisfied by prose describing the code. */
function code(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

const BODY = code(source);

/** Where each part's defining token first appears, or -1. */
const at = (needle: string, text = BODY): number => text.indexOf(needle);

describe('the six parts are all present', () => {
  const parts: Array<[string, string]> = [
    ['1 the time row', '<TimeRow'],
    ['2 and 3 the module fields', '? children(atMs) : children'],
    ['4 the primary save', 'saveLabel'],
    ['5 the byline', 'bylineText('],
    ['6 save as favorite', 'onSaveFavorite'],
  ];

  for (const [name, token] of parts) {
    it(`has ${name}`, () => {
      expect(at(token)).toBeGreaterThan(-1);
    });
  }
});

describe('and they are in §5.2 order', () => {
  it('time, then fields, then save, then the byline', () => {
    const time = at('<TimeRow');
    const fields = at('? children(atMs) : children');
    const save = at('testID="quick.save"');
    const byline = at('bylineText(');

    expect(time).toBeLessThan(fields);
    expect(fields).toBeLessThan(save);
    expect(save).toBeLessThan(byline);
  });

  it('puts anything secondary BENEATH the primary, never above it', () => {
    const below = at("typeof belowSave === 'function' ? belowSave(atMs) : belowSave");
    expect(below).toBeGreaterThan(-1);
    expect(at('testID="quick.save"')).toBeLessThan(below);
  });

  /**
   * A SECOND SAVE BENEATH THE PRIMARY SAVES AT THE ROW'S TIME (the audit of 2026-09-24, feeding
   * C3): the pump's "Choose where it goes" had only the opening instant, so a session backdated
   * an hour was stored ending now — and its container's dates ran late, the unsafe direction.
   */
  it('hands anything beneath the save the same resolved time the save gets', () => {
    expect(BODY).toMatch(/belowSave\?: ReactNode \| \(\(atMs: number\) => ReactNode\);/);
    expect(BODY).toContain('onPress={() => void onSave(atMs)}');
    expect(BODY).toContain('belowSave(atMs)');
  });

  it('puts the inline error above the save button, where it is read before the tap', () => {
    expect(at('testID="quick.error"')).toBeLessThan(at('testID="quick.save"'));
  });
});

describe('the rules the skeleton exists to enforce', () => {
  it('never reads a live clock for a preset: presets resolve against the sheet’s open time', () => {
    expect(BODY).toContain('resolvePreset(preset, openedAtMs');
    expect(BODY).not.toMatch(/new Date\(\)/);
  });

  /**
   * THE ONE LIVE CLOCK IS THE CUSTOM PICK'S ANCHOR (the audit of 2026-09-24, care C4). Rolled back
   * against the moment the sheet opened, a 2:05 picked at 2:07 on a sheet opened at 2:00 was
   * "later than now" and saved as 2:05 YESTERDAY, with nothing on the time row to say so. It is
   * rolled back against whichever is later, the real clock or the opening.
   */
  it('routes a picked time through applyCustom against the later of now and the opening', () => {
    expect(BODY).toContain('const nowMs = Date.now();');
    expect(BODY).toContain('applyCustom(picked, Math.max(nowMs, openedAtMs), timeZone)');
    expect(BODY.match(/Date\.now\(\)/g)).toHaveLength(1);
  });

  /**
   * CUSTOM OPENS THE CLOCK ONCE (2026-10-05). TimeRow calls `onPreset('custom')` then `onCustom`.
   * Opening the picker from both asked for the clock twice on every finished form (pump end time
   * first), and only the first pick was kept. The picker lives on `onCustom` alone; `onPreset`
   * only keeps the chip and unlocks an anchored end.
   */
  it('opens the custom clock only through onCustom, never again from onPreset', () => {
    expect(BODY).toContain('onCustom={() => void pickCustom()}');
    expect(BODY).not.toMatch(/if\s*\(\s*next\s*===\s*['"]custom['"]\s*\)/);
    expect(BODY).not.toMatch(/setPreset\(next\);\s*if\s*\(/);
  });

  /**
   * …AND A CORRECTION'S PICK ON THE DAY NEAREST THE TIME IT CORRECTS (`sheets/quick/edit`; the care
   * audit, C5): 3:05 PM picked on Tuesday's 3:00 PM feed is Tuesday's, never today's — read against
   * the same one clock.
   */
  it('places a picked time on an entry being corrected by the nearest day', () => {
    expect(BODY).toContain('const editing = useEditBinding() !== null;');
    expect(BODY).toContain('? pickedNear(picked, endAtMs, nowMs, timeZone)');
    expect(BODY).toContain(': applyCustom(picked, Math.max(nowMs, openedAtMs), timeZone)');
  });

  /**
   * A SHEET THAT PUTS THE FORM AWAY KEEPS ITS TIME (the audit of 2026-09-24, timers 20). The
   * temperature and growth histories and the medicine sheet's Add replace this form; the time
   * lived in here and went back to Now with it.
   */
  it('lets the sheet hold the time row’s state, and keeps its own only when it does not', () => {
    expect(BODY).toMatch(/export function useQuickTime\(endRow = false\): QuickTimeState/);
    expect(BODY).toContain('const own = useQuickTime(lengthMinutes !== undefined);');
    expect(BODY).toContain('= time ?? own;');
    // no second copy of the state inside the form
    expect(BODY.match(/useState<Preset>/g)).toHaveLength(1);
  });

  /**
   * A SLOT THAT IS OVER STARTS THE ROW AT ITS OWN TIME (the owner, 2026-09-25: "yes pre-fill the
   * slot's time when tapping a past slot") — read where the state is made, so the sheets that hold
   * their time get it too, and resolved like a picked time: no second clock, no preset of its own.
   * A row that is an END is anchored to the slot until touched, against the same opening.
   */
  it('starts the row on Custom at a slot’s time, where the state is made, with no clock read', () => {
    expect(BODY).toContain('const slotAtMs = useSlotBinding()?.atMs ?? null;');
    // an entry being corrected starts on its own time the same way, and before a slot's
    expect(BODY).toContain('const editAtMs = useEditBinding()?.form.rowAtMs ?? null;');
    expect(BODY).toContain('const startAtMs = editAtMs ?? slotAtMs;');
    expect(BODY).toContain("useState<Preset>(startAtMs === null ? 'now' : 'custom')");
    expect(BODY).toContain('endRow && editAtMs === null ? slotAtMs : null,');
    // a pre-filled instant is a Custom time like a picked one: the presets are unchanged
    expect(BODY).toContain('resolvePreset(preset, openedAtMs, customMs)');
    // and an anchored end is capped at the opening, never a clock read at render
    expect(BODY).toContain('finishedEnd(rowAtMs, anchorMs, lengthMinutes, openedAtMs)');
  });

  /**
   * A MEASUREMENT'S DAY IS MIDDAY IN THE HOUSEHOLD'S ZONE (PRODUCT_SPEC §6.9) — today included,
   * which used to be saved at the moment the sheet opened, and a picked day, which used to be
   * midday in the phone's zone.
   */
  it('writes a date row as midday on the household’s day, never the phone’s', () => {
    expect(BODY).toContain('middayOfDay(openedAtMs, timeZone)');
    // a custom instant — a picked day, already midday, or a slot's time — is its day's midday
    expect(BODY).toContain('middayOfDay(customMs, timeZone)');
    expect(BODY).toContain('onPickDate(measuredDayKey(atMs, timeZone))');
    expect(BODY).toContain('middayOn(picked, timeZone)');
    expect(BODY).not.toMatch(/new Date\(y/);
    expect(BODY).not.toContain('dayKeyOf(');
  });

  it('leaves the previous choice alone when the picker is dismissed', () => {
    expect(BODY).toContain('if (picked)');
  });

  it('gives the error line the alert role, so a screen reader announces it', () => {
    expect(BODY).toMatch(/accessibilityRole="alert"/);
  });
});

/**
 * A FORM FOR SOMETHING ALREADY FINISHED KEEPS THE ANATOMY (the owner, 2026-09-25: "… Sticky 'Save
 * sleep' button"). Part 4 is pinned to the sheet's foot — all of part 4, in its order, through ONE
 * placement, so a sticky Save can never lose the error over it or the secondary action beneath it.
 * Its time row is every sheet's one row since 2026-09-26 (the owner: "the options should show in 1
 * row"), with its eyebrow naming the END.
 */
describe('a finished form keeps the anatomy', () => {
  it('pins the whole of part 4 to the sheet’s foot when asked, and only then', () => {
    expect(BODY).toContain('stickySave ? <SheetFooter>{node}</SheetFooter> : node;');
    const placed = BODY.slice(BODY.indexOf('{placeSave('));
    const error = placed.indexOf('testID="quick.error"');
    const save = placed.indexOf('testID="quick.save"');
    const below = placed.indexOf("typeof belowSave === 'function' ? belowSave(atMs) : belowSave");
    expect(error).toBeGreaterThan(-1);
    expect(error).toBeLessThan(save);
    expect(save).toBeLessThan(below);
    // the byline is the form's, not the foot's
    expect(placed.indexOf('bylineText(')).toBeGreaterThan(below);
    expect(BODY).toContain('stickySave = false,');
  });

  it('draws the same one row as every other sheet, named by the form, with no variant of its own', () => {
    expect(BODY).toContain('{...(timeLabel !== undefined ? { label: timeLabel } : {})}');
    expect(BODY).not.toContain('resolvedLabel');
    expect(BODY).not.toContain('presetLabels');
    expect(BODY).not.toContain('FINISHED_PRESETS');
  });

  it('hands the row, the fields and the save ONE instant — the row’s, or its anchored end', () => {
    // the row's answer, or an END row's anchored end (`finishedEnd`); no form reads it otherwise
    expect(BODY).toContain('const atMs = endAtMs;');
    expect(BODY).not.toContain('resolveAt');
    expect(BODY).toContain('value={atMs}');
    expect(BODY).toContain('? children(atMs) : children');
    expect(BODY).toContain('onPress={() => void onSave(atMs)}');
  });
});

describe('the scan is not vacuous', () => {
  // Every ordering assertion above must FAIL against a file whose parts are out of order. A
  // tripwire nobody has seen fail is a tripwire nobody should trust.
  const scrambled = code(`
    export function Bad() {
      return (
        <View>
          <BodySm>{bylineText(name, online)}</BodySm>
          <Button testID="quick.save" label={saveLabel} />
          <View>{children}</View>
          <TimeRow value={atMs} />
        </View>
      );
    }
  `);

  it('catches a byline that drifted above the save button', () => {
    expect(at('bylineText(', scrambled)).toBeLessThan(at('testID="quick.save"', scrambled));
  });

  it('catches a time row that drifted below the fields', () => {
    expect(at('<TimeRow', scrambled)).toBeGreaterThan(at('? children(atMs) : children', scrambled));
  });

  it('catches a live clock', () => {
    expect(code('const now = Date.now();')).toMatch(/Date\.now\(\)/);
  });
});

describe('bylineText (§5.2 part 5)', () => {
  it('names the caregiver and says the entry syncs', () => {
    expect(bylineText('Dana', true)).toBe(
      'Logged as Dana · saves immediately, syncs to the household',
    );
  });

  it('offline, says the log is SAFE rather than that something went wrong', () => {
    expect(bylineText('Dana', false)).toBe('Logged as Dana · saved on this phone, queued for sync');
  });

  it('never uses a word that would read as a failure', () => {
    for (const online of [true, false]) {
      const text = bylineText('Dana', online).toLowerCase();
      for (const banned of BYLINE_BANNED) expect(text).not.toContain(banned);
    }
  });

  it('degrades without a display name rather than printing "Logged as undefined"', () => {
    expect(bylineText('', true)).toBe('Logged · saves immediately, syncs to the household');
    expect(bylineText('   ', true)).toBe('Logged · saves immediately, syncs to the household');
  });

  it('trims a name with stray whitespace', () => {
    expect(bylineText('  Dana  ', true)).toContain('Logged as Dana ·');
  });
});

/**
 * A START SAYS ITS TIME ONCE — BEFORE THE TAP WHERE IT CAN, AFTER IT WHERE IT COULD NOT.
 *
 * On 2026-09-16 the owner took the toast off every start ("when clicking start pumping, there is an
 * empty white small box that shows up … don't let this shown for an activity started (not
 * ended)"). The next day the empty box turned out to be the toast host collapsing EVERY toast, a
 * save's too (`ui/toast.tsx`, fixed 2026-09-17), and on 2026-09-29 the owner asked for the start's
 * time back: "we had starting time confirmation … the feedback says that this is helpful".
 *
 * So the rule is two halves. `start` itself still toasts nothing but the refusal: a start made from
 * the start row said its time on its own Start before the tap ("Start sleep from 9:31 PM"). A start
 * whose time was on no screen before the tap — a Start tile that starts on its tap, a CueCoin — is
 * confirmed by its caller through `confirmStart`: the time, and Change, and no Undo (the running
 * card's stop and Discard are the way back from a start, which wrote no entry to take back).
 */
describe('a start says its time once', () => {
  const actions = code(readFileSync(join(here, 'useTimerActions.ts'), 'utf8'));
  const start = actions.slice(
    actions.indexOf('const start = useCallback'),
    actions.indexOf('const confirmStart = useCallback'),
  );
  const confirm = actions.slice(
    actions.indexOf('const confirmStart = useCallback'),
    actions.indexOf('const finishPump = useCallback'),
  );

  it('says nothing from the start itself, and still refuses a second timer out loud', () => {
    expect(start.length).toBeGreaterThan(0);
    expect(start).not.toMatch(/\bsay\(\s*$/m);
    expect(start).not.toContain('timerStarted');
    expect(start).not.toContain('started ${clock}');
    expect(start).not.toContain('TIMER_START');
    // the one sentence a start may produce is the refusal
    expect(start).toContain('say(alreadyRunning(');
  });

  it('confirms a one-tap start with its time and Undo, and nothing to feel (2026-10-06)', () => {
    expect(confirm.length).toBeGreaterThan(0);
    expect(confirm).toContain(
      'TIMER_START.started(words.noun, formatClock(c.startedAtMs, c.clock24, c.timeZone), names)',
    );
    expect(confirm).toContain(
      '{ secondary: { label: TIMER_START.undo, onPress: () => void undo() }, queue: true }',
    );
    // Undo discards the timers the start wrote, and writes no entry
    expect(confirm).toContain('discardTimer(db, systemClock, { ...write, timerId })');
    expect(confirm).not.toContain('haptic(');
    expect(confirm).not.toContain('announce(');
  });

  it('is called by no start in NibbleCue, which has no timer sheet', () => {
    const read = (f: string) => code(readFileSync(join(here, f), 'utf8'));
    // (CuddleCue's pump, tummy, sleep and breastfeed sheets and its coin router are its callers;
    // none is in NibbleCue, whose link router starts nothing)
    const callers: Record<string, number> = {
      '../../app/LinkRouter.tsx': 0,
    };
    for (const [f, n] of Object.entries(callers))
      expect(read(f).split('confirmStart(').length - 1, f).toBe(n);
  });

  it('still announces what a STOP wrote, with its Undo', () => {
    expect(actions).toContain('announce(');
    expect(actions).toContain('savedDuration(');
  });
});
