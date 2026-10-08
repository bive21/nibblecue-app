/**
 * THE APP'S HALF OF THE MOTION GATE (docs/DESIGN_SYSTEM.md §7.1; packages/ui `MotionGate.tsx`).
 * The design system's loops ask whether their page is in front; this suite holds the app to
 * telling them — every page's content inside a gate that follows the navigator's focus — and holds
 * the app's own clocks to the same rule. No renderer here, so the source is read.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const src = join(dirname(fileURLToPath(import.meta.url)), '..');
const flat = (...p: string[]): string =>
  readFileSync(join(src, ...p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

describe('every page tells its loops whether it is in front', () => {
  const screen = flat('app', 'Screen.tsx');

  it('wraps the whole page — bar, content, overlay and sticky strip — in a gate on focus', () => {
    expect(screen).toContain('const focused = useIsFocused();');
    expect(screen).toContain('return ( <MotionGate active={focused}>');
    expect(screen.trimEnd()).toMatch(/<\/View> <\/MotionGate> \); \}/);
  });

  it('asks the navigator and the app from a screen’s own body with the same rule', () => {
    const awake = flat('app', 'useScreenAwake.ts');
    expect(awake).toContain('const focused = useIsFocused();');
    expect(awake).toContain('const appActive = useAppActive();');
    expect(awake).toContain('return motionAwake({ focused, appActive });');
  });
});

describe('the app’s own clocks stop when nobody can see them', () => {
  // (CuddleCue's Today timer cards are not in NibbleCue: its Today draws no running timer)
  it('the Family page’s one-second countdown runs only while it is in front', () => {
    const family = flat('screens', 'more', 'FamilyScreen.tsx');
    expect(family).toContain('const awake = useScreenAwake();');
    expect(family).toContain(
      'if (!awake) return; setNow(Date.now()); const timer = setInterval(() => setNow(Date.now()), 1000);',
    );
  });

  // (no tour and no Schedule in NibbleCue, so neither's clock is here)
});

/**
 * ONE SECOND-BY-SECOND CLOCK PER RUNNING TIMER ON THE SCREEN (2026-09-27). The digits tick (§7), so
 * each timer drawn has one: its card, its "Also running" row, or its row in the sticky bar — never
 * two of those at once, since the cards rest while the bar shows. The long-run ask under each card
 * ran a second one of its own to answer a question that turns at an hour at the soonest, so Today
 * with one timer running re-rendered twice a second, with two four times, with three six. It reads
 * the clock when its answer can change now (`longRunNextChangeMs` in core, whose test holds the
 * answer steady until then): a pump timed for three hours wakes it 60 times instead of 10,800.
 */
describe('the one-second tick lives only where digits are drawn', () => {
  const ui = join(src, '..', '..', '..', 'packages', 'ui', 'src');
  const sources = (root: string): string[] =>
    readdirSync(root, { withFileTypes: true }).flatMap(e =>
      e.isDirectory()
        ? sources(join(root, e.name))
        : /\.tsx?$/.test(e.name) && !/\.test\.ts$/.test(e.name)
          ? [join(root, e.name)]
          : [],
    );

  it('is called by the timer card, an "Also running" row, a timer bar row and the start row’s preview, and nothing else', () => {
    const callers = [...sources(src), ...sources(ui)]
      .filter(f => /useTimerNow\(/.test(readFileSync(f, 'utf8')))
      .map(f => relative(join(src, '..', '..', '..'), f))
      .sort();
    expect(callers).toEqual([
      // (no Today timer bar in NibbleCue)
      // the start row's preview (2026-09-29): a timer's digits already counting from a start the
      // parent chose, drawn only while that start is chosen — the row over it reads the minute
      'apps/mobile/src/sheets/quick/StartedRow.tsx',
      'packages/ui/src/components/AlsoRunning.tsx',
      // where the hook itself lives
      'packages/ui/src/components/TimerCard.tsx',
    ]);
  });

  it('the long-run ask wakes when its answer can change, and no sooner', () => {
    const card = flat('sheets', 'quick', 'LongRunCard.tsx');
    expect(card).not.toContain('useTimerNow');
    expect(card).not.toContain('setInterval');
    expect(card).toContain('const wakeAt = longRunNextChangeMs({ ...run, nowMs: now });');
    expect(card).toContain('const ask = longRunning({ ...run, nowMs: now });');
    // and only while its page is in front, like every other clock here
    expect(card).toContain('const awake = useMotionAwake();');
  });
});

describe('the plan’s context changes when its answer does, not with the minute', () => {
  const plan = flat('plan', 'PlanProvider.tsx');

  it('derives on the minute, and hands readers a new value only when a field they read is new', () => {
    expect(plan).toContain(
      '}, [account, accountReadAt, dismissed, summarySeen, promptsSeen, tick]);',
    );
    // `decides` is a field a reader sees too (2026-09-28: the gate sheet asks it); it changes with
    // the account, never with the minute
    expect(plan).toContain(
      // NibbleCue's provider also carries `cuddleTier`: the caregiver seats are CuddleCue's plan's
      '[ status, tier, daysLeft, expiresAt, computedAt, cuddleTier, decides, card, prompt, dismissThreeDays, markSummarySeen, markPromptSeen, ],',
    );
    // the value is built from the fields, never from the minute's object
    expect(plan).not.toContain('...plan,');
  });
});

// (CuddleCue's tour context checks are not here: NibbleCue's `src/tour/` is a stand-in.)
