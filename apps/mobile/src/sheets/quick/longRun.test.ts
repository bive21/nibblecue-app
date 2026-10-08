/**
 * THE LONG-RUN ASK, on the two surfaces that draw it (the owner, 2026-09-20: *"add the prompt
 * when activities are still ongoing and ask to adjust… send the warning ask if it's ended and
 * the option to adjust the correct end time"*).
 *
 * The arithmetic has its own suite in `packages/core/src/schedule/longRun.test.ts`. What is
 * held here is everything the app could get wrong around it: whether the ask reaches both
 * places a running timer is shown, whether it writes the instant the parent chose or the one
 * the clock happens to say, and — the part that matters most — whether the words stay a
 * question about a timer rather than a verdict about a person (CLAUDE.md §2, rules 1 and 3).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LONG_RUN, longRunTitleWord } from './copy';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(resolve(here, rel), 'utf8');
const code = (rel: string): string =>
  read(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

describe('the words are a question about a timer', () => {
  const sentences = [
    LONG_RUN.title(longRunTitleWord('pump', 'pump')),
    LONG_RUN.title(longRunTitleWord('sleep', 'sleep')),
    LONG_RUN.title(longRunTitleWord('tummy', 'playtime')),
    LONG_RUN.running('2 hours 30 minutes'),
    LONG_RUN.stillGoing,
    LONG_RUN.ended,
    LONG_RUN.pickTitle,
    LONG_RUN.pickSet,
  ];

  /**
   * THE LIST THAT MATTERS. Every one of these is a sentence the app is NOT entitled to say:
   * "too long" and "should" are judgments on how a person feeds or rests a baby, "unusual" and
   * "not normal" are comparisons to a population, and anything naming the baby makes the timer
   * a statement about them. A stopwatch left running is an app problem; the rest is not.
   */
  it('never tells a parent that a session is wrong, long, or unusual', () => {
    for (const s of sentences) {
      const lower = s.toLowerCase();
      for (const banned of [
        'too long',
        'too much',
        'should',
        'unusual',
        'not normal',
        'abnormal',
        'incorrect',
        'wrong',
        'baby',
        'your child',
        'safe',
        'risk',
      ]) {
        expect(lower, `"${s}" says "${banned}"`).not.toContain(banned);
      }
    }
  });

  it('asks rather than tells, and offers "still going" first', () => {
    expect(LONG_RUN.title(longRunTitleWord('pump', 'pump'))).toBe('Still pumping?');
    expect(LONG_RUN.title(longRunTitleWord('sleep', 'sleep'))).toBe('Still sleeping?');
    // tummy time has no verb, and it is the module a household can rename
    expect(LONG_RUN.title(longRunTitleWord('tummy', 'playtime'))).toBe('Still on playtime?');
    expect(LONG_RUN.running('2 hours 30 minutes')).toBe('Running 2 hours 30 minutes');
    expect(LONG_RUN.stillGoing).toBe('Still going');
    expect(LONG_RUN.ended).toBe('It ended');
  });

  /** And the card puts that answer first, where a thumb reaches it without reading twice. */
  it('draws "still going" before "it ended"', () => {
    const card = code('LongRunCard.tsx');
    expect(card.indexOf('label={LONG_RUN.stillGoing}')).toBeLessThan(
      card.indexOf('label={LONG_RUN.ended}'),
    );
    expect(card).toContain('const ANSWERS = [LONG_RUN.stillGoing, LONG_RUN.ended] as const;');
  });
});

/**
 * ONE ROW, UNDER ITS CARD (the owner, 2026-09-30: *"It is taking to much space. The info how long
 * is running is duplicate because it shows exactly that on top of it. The reminder is taller than
 * the timer card itself"*; the second time, after 2026-09-21's *"wayyy too tall"*). The strip's
 * arithmetic is `longRunFit.test.ts`; these are the lines that draw it.
 */
describe('the ask is one strip, tucked under its timer card', () => {
  const card = code('LongRunCard.tsx').replace(/\s+/g, ' ');

  it('shows the clock, the question and two small answers, and nothing else', () => {
    // the question alone: the elapsed, the card above's own number, is heard and never shown
    expect(card).toContain('{question} </BodyStrong>');
    expect(card).toContain('accessibilityLabel={heard}');
    expect(card).toContain(
      'const heard = `${question} ${LONG_RUN.running(announceElapsed(ask.elapsedMin * 60_000))}`;',
    );
    expect(card).not.toMatch(/<BodySm/);
    expect(card).not.toContain('formatElapsed');
    // the sentence on what the card was for went to the picker it opens
    expect(card).not.toContain('LONG_RUN.why');
    expect(card).toContain('title: LONG_RUN.pickTitle,');
    expect(card).toContain('set: LONG_RUN.pickSet,');
    expect(LONG_RUN.pickTitle).toBe('When did it end?');
    expect(LONG_RUN.pickSet).toBe('Set end time');
    // both answers the short pill, never the 44 pt one, and neither grows past the strip
    expect(card.match(/size="xs"/g)).toHaveLength(2);
    expect(card).not.toContain('size="sm"');
    expect(card.match(/maxFontSizeMultiplier=\{S\.fontCap\}/g)).toHaveLength(3);
  });

  it('is a strip and not a card: flat, one row, its padding the card’s across and the slop’s up and down', () => {
    expect(card).not.toContain('<Card');
    expect(card).not.toContain('shadow');
    expect(card).toContain('stacked ? styles.stacked : styles.row,');
    expect(card).toContain("row: { flexDirection: 'row', alignItems: 'center' },");
    expect(card).toContain('paddingHorizontal: S.padX, paddingVertical: S.padY,');
    expect(card).toContain(
      'const stacked = longRunStacks(width, question, ANSWERS, t.fontScale.body);',
    );
  });

  // (NibbleCue draws no running timer card: neither CuddleCue's Today nor its running panel is here)
  /**
   * THE PICKER SAYS WHAT IT IS FOR, on each platform where it can: the question over the iPhone's
   * wheel and on its button, and on Android's own clock dialog its OK, the one slot it has for words.
   */
  it('names the wheel it opens: a title on the iPhone, the set button on both', () => {
    const picker = code('timePicker.tsx').replace(/\s+/g, ' ');
    expect(picker).toContain('...(words ? { positiveButton: { label: words.set } } : {}),');
    expect(picker).toContain('{said.title}');
    expect(picker).toContain("label={said?.set ?? 'Done'}");
  });
});

describe('the ask reaches every surface a running timer has', () => {
  // (no Today timer card or running panel in NibbleCue to draw it under)

  it('draws nothing at all until the core says there is something to ask', () => {
    const card = code('LongRunCard.tsx');
    expect(card).toContain('longRunning({');
    expect(card).toContain('if (ask === null || stoppedAtMs !== null) return null;');
  });

  /**
   * NOT OVER A PUMP THAT IS ALREADY STOPPED (the audit of 2026-09-24, timers 19): the session has
   * an end, the output form below is asking for its amount, and "Still pumping?" over it invited a
   * second end at a different instant.
   */
  it('stays away from a stopped pump', () => {
    const card = code('LongRunCard.tsx');
    expect(card).toContain('const stoppedAtMs = useStoppedAt(timer.id);');
  });
});

describe('what "it ended" writes', () => {
  const card = code('LongRunCard.tsx');
  // the one end rule, shared with the running sheet's End time since 2026-09-29 (`timerEnd.ts`),
  // and the hook that wires it to the app; its behavior is `timerEnd.test.ts`'s
  const rule = code('timerEnd.ts').replace(/\s+/g, ' ');
  const hook = code('useEndTimer.ts').replace(/\s+/g, ' ');

  /**
   * THE INSTANT THE PARENT PICKED, NOT THE ONE THE CLOCK SAYS. The whole point of the flow is
   * that `Date.now()` is the wrong end for this session — a stop at now would record the hours
   * the timer spent forgotten as hours of pumping, which is the bad row the ask exists to
   * prevent. `Date.now()` appears only where it belongs: as the "is this end in the future"
   * bound, and as the instant of the snooze.
   */
  it('stops at the chosen instant, through the one end rule', () => {
    expect(card.replace(/\s+/g, ' ')).toContain(
      'void endAt(timer, applyCustom(picked, Date.now(), timeZone));',
    );
    expect(card).not.toContain('actions.stop(');
    expect(card).not.toContain('validEnd(');
    expect(rule).toContain('const outcome = await deps.stop(timer, endMs);');
    expect(rule).toContain('if (!validEnd(t.startedAtMs, endMs, nowMs))');
    expect(hook).toContain('endTimerAt(timer, endMs, Date.now(), { stop: actions.stop,');
  });

  /** A pump's end is not a stop: the output form has to come first, frozen at that instant. */
  it('hands a pump to its output form with the end already fixed', () => {
    expect(rule).toContain('markStopped(timer.id, endMs); deps.openOutput?.();');
    expect(hook).toContain("openOutput: () => shell.openQuickEntry('pump')");
  });

  // (no pump sheet in NibbleCue)
  /** And a time the timer cannot have ended at is refused with a word, never clamped. */
  it('refuses an impossible end instead of correcting it silently', () => {
    expect(rule).toContain('tooEarly: LONG_RUN.endTooEarly,');
    expect(rule).toContain('inFuture: LONG_RUN.endInFuture,');
    expect(rule).toContain('stillCounting: LONG_RUN.endStillCounting,');
  });

  /**
   * THE PICKER OPENS AT THE SUGGESTION, which is the moment the session stopped being
   * plausible — every correction from there moves backward, which is the direction a forgotten
   * timer is wrong in. Opening at now would start the parent on the one value they have
   * already said is wrong.
   */
  it('opens the picker at the suggested end', () => {
    expect(card).toContain('wallClockOf(ask.suggestedEndMs, timeZone)');
  });
});
