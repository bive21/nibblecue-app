/**
 * The logging sheets' copy, scanned (PRODUCT_SPEC.md §6; CLAUDE.md rules 1–5).
 *
 * Three of these strings are the product's medical-safety promises. This file exists so that
 * a future edit that softens one of them fails the build rather than shipping.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { leftoverError } from '@nibblecue/core';
import { FOOD_LINES } from './modules/solids/copy';
import { BOTTLE_STASH_ROW, bottleOf, leftIn } from './modules/sheetCopy';
import {
  BANNED_CLINICAL,
  BOTTLE_AMOUNT,
  BOTTLE_KIND_LABEL,
  BOTTLE_KINDS_ON_SHEET,
  BOTTLE_LEFT,
  bottleTook,
  DIAPER_LABEL,
  HINTS,
  savedAt,
  savedBottle,
  savedDiaper,
  savedBreastfeed,
  savedDuration,
  SESSION_DISCARDED,
  SLEEP_KIND_LABEL,
  STASH_ALREADY,
  LONG_RUN,
  longRunTitleWord,
  START_AFTER_STOP,
  TIMER_WORD,
  alreadyRunning,
  pumpSaved,
  LOGGING_FOR,
  eachOwnEntry,
  namesAnd,
  loggedFor,
  plusChild,
  UNDO_BOTH,
  differentAmounts,
  SAME_AMOUNT,
  tandemSides,
  SWAP_SIDES,
  START_TANDEM,
  START_SIDE,
  PICK_ONE_TO_TIME,
  TANDEM_SIDE_EMPTY,
  SAVE_DIAPER,
  DIAPER_QUESTION,
  DIAPER_KIND_WORD,
  DIAPER_KIND_NAME,
  RASH_NOTED,
  RASH_NOTED_TAIL,
  diaperDetailLine,
  TIMER_PATH,
  PUMP_HOW_LONG,
  PUMP_AMOUNT,
  pumpStarted,
  CHOOSE_WHERE_IT_GOES,
  SAVE_SESSION_ONLY,
  PUMP_HEAD,
  pumpHeadSpoken,
  TIME_LABEL,
  BATH_HAIR,
  BATH_HAIR_LABEL,
  lastBathLine,
  TEMP_READING,
  TEMP_SCALE,
  TEMP_METHOD,
  TEMP_METHODS,
  TEMP_METHOD_WORDS,
  savedTemp,
  ADD_NOTE,
  FINISHED,
  SLEEP_WINDOW,
  spanLine,
  TANDEM_MANUAL,
  tandemSpanLine,
  SLEEP_PLAY,
  startWordsFor,
  TIMER_START,
  RUNNING_TIMES,
  PUMP_ENDED,
} from './copy';

/** Every timer's start words, tummy time in both of the household's words. */
const START_WORDS = [
  startWordsFor('sleep', { label: 'Tummy time', word: 'tummy time' }),
  startWordsFor('pump', { label: 'Tummy time', word: 'tummy time' }),
  startWordsFor('breastfeed', { label: 'Tummy time', word: 'tummy time' }),
  startWordsFor('tummy', { label: 'Tummy time', word: 'tummy time' }),
  startWordsFor('tummy', { label: 'Playtime', word: 'playtime' }),
];

/** Every sentence the start row and its confirmation can put on a screen (2026-09-29). */
const START_STRINGS: string[] = [
  TIMER_START.label,
  ...Object.values(TIMER_START.choice),
  ...Object.values(TIMER_START.choiceLong),
  ...Object.values(TIMER_START.spoken),
  TIMER_START.shortcut,
  TIMER_START.undo,
  TIMER_START.undone('Pumping'),
  TIMER_START.tooEarly('2h'),
  TIMER_START.button('left', '9:31 PM'),
  TIMER_START.button('tandem', null),
  ...START_WORDS.flatMap(w => [
    TIMER_START.button(w.verb, null),
    TIMER_START.button(w.verb, '9:31 PM'),
    TIMER_START.already(w.state, '12m'),
    TIMER_START.held(w.what, '9:35 PM', null),
    TIMER_START.held(w.what, '9:35 PM', 'Emma'),
    TIMER_START.heldShortcut(w.what, '9:35 PM', false),
    TIMER_START.heldShortcut(w.what, '9:35 PM', true),
    TIMER_START.started(w.noun, '9:41 PM', []),
    TIMER_START.started(w.noun, '9:41 PM', ['Emma', 'Liam']),
  ]),
];

/** A running timer's two times and every end the app refuses (2026-09-29). */
const TIMES_STRINGS: string[] = [
  RUNNING_TIMES.start,
  RUNNING_TIMES.end,
  RUNNING_TIMES.now,
  RUNNING_TIMES.startSpoken('9:31 PM'),
  RUNNING_TIMES.startHint,
  RUNNING_TIMES.endSpoken(null),
  RUNNING_TIMES.endSpoken('9:31 PM'),
  RUNNING_TIMES.endHint,
  PUMP_ENDED.label,
  ...Object.values(PUMP_ENDED.choice),
  ...Object.values(PUMP_ENDED.choiceLong),
  ...Object.values(PUMP_ENDED.spoken),
  LONG_RUN.endTooEarly,
  LONG_RUN.endInFuture,
  LONG_RUN.endStillCounting,
];

/** Every literal string this module can put on a screen. */
const ALL_STRINGS: string[] = [
  ...Object.values(HINTS),
  ...Object.values(DIAPER_LABEL),
  ...Object.values(BOTTLE_KIND_LABEL),
  savedAt('bath', '6:40 PM'),
  savedDiaper('BOTH', '1:02 PM'),
  savedBottle('4 oz', 'EBM', '1:02 PM'),
  BOTTLE_AMOUNT,
  BOTTLE_LEFT,
  bottleTook('4 oz', false),
  bottleTook('4 oz', true),
  bottleOf('Emma'),
  bottleOf(''),
  leftIn('Emma'),
  leftIn(''),
  ...Object.values(BOTTLE_STASH_ROW),
  ...Object.values(SLEEP_KIND_LABEL),
  ...Object.values(TIMER_WORD),
  savedDuration('nap', '1h 35m'),
  savedBreastfeed(14, 8, 6),
  pumpSaved('7.5 oz', '18m'),
  alreadyRunning('sleep', 'Emma'),
  alreadyRunning('pump', null),
  SESSION_DISCARDED,
  STASH_ALREADY,
  LONG_RUN.title(longRunTitleWord('pump', 'pump')),
  LONG_RUN.title(longRunTitleWord('tummy', 'playtime')),
  LONG_RUN.running('1h 35m'),
  LONG_RUN.stillGoing,
  LONG_RUN.ended,
  LONG_RUN.pickTitle,
  LONG_RUN.pickSet,
  LONG_RUN.endTooEarly,
  LONG_RUN.endInFuture,
  START_AFTER_STOP,
  LOGGING_FOR,
  eachOwnEntry(['Emma', 'Liam']),
  eachOwnEntry(['Emma', 'Liam', 'Noor']),
  loggedFor(['Emma', 'Liam']),
  loggedFor(['Emma', 'Liam', 'Noor']),
  plusChild('Liam'),
  UNDO_BOTH,
  differentAmounts(['Emma', 'Liam']),
  SAME_AMOUNT,
  tandemSides('Emma', 'Liam'),
  SWAP_SIDES,
  START_TANDEM,
  START_SIDE.label,
  START_SIDE.hint,
  ...Object.values(START_SIDE.words),
  ...Object.values(START_SIDE.actions),
  PICK_ONE_TO_TIME,
  TANDEM_SIDE_EMPTY,
  SAVE_DIAPER,
  DIAPER_QUESTION,
  ...Object.values(DIAPER_KIND_WORD),
  ...Object.values(DIAPER_KIND_NAME),
  RASH_NOTED,
  RASH_NOTED_TAIL,
  diaperDetailLine('Wet', true) ?? '',
  ...Object.values(TIMER_PATH).flatMap(m => [m.start.title, m.manual.title]),
  PUMP_HOW_LONG,
  // the pump's amount and its end, on both forms that finish a session (2026-10-01)
  pumpStarted('9:31 PM'),
  PUMP_AMOUNT.by,
  PUMP_AMOUNT.side,
  PUMP_AMOUNT.total,
  PUMP_AMOUNT.left,
  PUMP_AMOUNT.right,
  PUMP_AMOUNT.totalWord,
  PUMP_AMOUNT.totalSaid('4 oz'),
  CHOOSE_WHERE_IT_GOES,
  SAVE_SESSION_ONLY,
  // the head row's count is a count of the household's own sessions, carried beside an amount
  `${PUMP_HEAD.count(3)} · 4 oz`,
  PUMP_HEAD.noneToday,
  PUMP_HEAD.never,
  PUMP_HEAD.last('1:02 PM', '4 oz'),
  PUMP_HEAD.total('4 oz'),
  pumpHeadSpoken({ sessions: 3, total: '4 oz' }, { when: 'at 1:02 PM', amount: '4 oz' }),
  pumpHeadSpoken({ sessions: 0, total: '' }, { when: 'yesterday at 6:40 PM', amount: '4 oz' }),
  pumpHeadSpoken({ sessions: 0, total: '' }, null),
  ...Object.values(TIME_LABEL),
  BATH_HAIR,
  ...Object.values(BATH_HAIR_LABEL),
  lastBathLine('yesterday', '6:40 PM'),
  TEMP_READING,
  TEMP_SCALE,
  TEMP_METHOD,
  ...TEMP_METHODS,
  ...Object.values(TEMP_METHOD_WORDS).flatMap(w => [w.label, w.spoken]),
  savedTemp('98.6 °F', '1:02 PM'),
  SLEEP_WINDOW('1:02 PM', '6:40 PM', '1h 35m'),
  spanLine('1:02 PM', '6:40 PM', '1h 35m'),
  ADD_NOTE,
  ...Object.values(FINISHED).flatMap(form => Object.values(form)),
  TANDEM_MANUAL.title,
  TANDEM_MANUAL.body('Emma', 'Liam'),
  TANDEM_MANUAL.save,
  tandemSpanLine(
    '1:02 PM',
    '6:40 PM',
    { name: 'Emma', duration: '1h 35m' },
    { name: 'Liam', duration: '1h 35m' },
  ),
  // asleep or playing, never both (2026-09-27): the question, both ways, in both words
  SLEEP_PLAY.asleep('Emma'),
  SLEEP_PLAY.asleep(SLEEP_PLAY.someone),
  SLEEP_PLAY.endSleep('tummy time', 'start', null),
  SLEEP_PLAY.endSleep('playtime', 'save', '1:02 PM'),
  SLEEP_PLAY.endSleepButton,
  SLEEP_PLAY.playing('Emma', 'tummy time'),
  SLEEP_PLAY.playing('Emma', 'playtime'),
  SLEEP_PLAY.endPlay('tummy time', null),
  SLEEP_PLAY.endPlay('playtime', '1:02 PM'),
  SLEEP_PLAY.endPlayButton('playtime'),
  SLEEP_PLAY.cancel,
  // when a timer started (2026-09-29): the row, its lines, the Start and the confirmation
  ...START_STRINGS,
  // a running timer's Start time and End time, and the ends refused (2026-09-29)
  ...TIMES_STRINGS,
];

describe('the two ways in are two titles and nothing else (the owner, 2026-09-26)', () => {
  it('has no consequence line on any module — every route is its title', () => {
    for (const [module, paths] of Object.entries(TIMER_PATH)) {
      expect(Object.keys(paths.start), module).toEqual(['title']);
      expect(Object.keys(paths.manual), module).toEqual(['title']);
      expect(paths.manual.title, module).toBe('Already finished');
      expect(paths.start.title, module).toMatch(/^Start /);
    }
  });
});

describe('the three safety promises are present and exact', () => {
  it('medicine: the app never calculates or suggests a dose (§6.7, rule 4)', () => {
    expect(HINTS.med).toBe(
      'Only what you enter is recorded. The app never calculates or suggests a dose.',
    );
  });

  it('temperature: recorded as measured, with no interpretation (§6.8)', () => {
    expect(HINTS.temp).toBe('Recorded as measured, with no interpretation.');
  });

  it('solids: what was noticed is recorded verbatim, no allergy assessment (§6.6)', () => {
    // the sheet's own copy since the owner retired the word "Reactions" (2026-09-24)
    expect(FOOD_LINES.hint).toBe(
      'How it went and what you noticed are kept exactly as you write them, with no allergy assessment.',
    );
    expect('solids' in HINTS).toBe(false);
  });
});

describe('nothing interprets and nothing advises', () => {
  for (const s of ALL_STRINGS) {
    it(`"${s.slice(0, 48)}${s.length > 48 ? '…' : ''}" carries no clinical claim`, () => {
      const lower = s.toLowerCase();
      for (const banned of BANNED_CLINICAL) {
        // the medicine hint legitimately contains the word "dose" while REFUSING to give one,
        // which is why the banned list names phrases like "recommended dose" and not "dose"
        expect(lower).not.toContain(banned);
      }
    });
  }

  it('no string suggests a number a parent did not enter', () => {
    /*
      THE START ROW'S TWO OFFSETS ARE A WAY TO SAY WHEN, not an amount (2026-09-29): "10 min ago"
      is how long ago the parent says a timer began, their own choice among four, as the time row's
      "~15 min" is on every sheet. Nothing about a baby is proposed by them. They are the only
      literals here with a figure, and they are named rather than let through by a pattern.
    */
    const offsets = new Set<string>([
      TIMER_START.choice.m5,
      TIMER_START.spoken.m5,
      TIMER_START.choice.m15,
      TIMER_START.spoken.m15,
      TIMER_START.choice.m30,
      TIMER_START.spoken.m30,
      // the same three spelled out where the slots hold them (2026-10-08)
      TIMER_START.choiceLong.m5,
      TIMER_START.choiceLong.m15,
      TIMER_START.choiceLong.m30,
      PUMP_ENDED.choiceLong.m5,
      PUMP_ENDED.choiceLong.m15,
      PUMP_ENDED.choiceLong.m30,
      // a running pump's end, the same kind of "when" (2026-10-03): fifteen, not an amount
      PUMP_ENDED.choice.m5,
      PUMP_ENDED.choice.m15,
      PUMP_ENDED.spoken.m5,
      PUMP_ENDED.spoken.m15,
      PUMP_ENDED.choice.m30,
      PUMP_ENDED.spoken.m30,
    ]);
    for (const s of ALL_STRINGS) {
      // the formatted toasts carry the amount the CALLER passed; the literals carry none
      if (/4 oz|6:40|1:02|14 min|1h 35m|7\.5 oz|9:3[15] PM|9:41 PM|12m|2h/.test(s)) continue;
      if (offsets.has(s)) continue;
      expect(s).not.toMatch(/\d/);
    }
  });

  it('the scan would catch a sentence that broke the rule', () => {
    // non-vacuous: these are the exact failures the list exists to stop
    for (const bad of [
      'That reading is a fever.',
      'The recommended dose is 2.5 mL.',
      'This is below the normal range.',
      'Calculate the dose by weight.',
    ]) {
      const lower = bad.toLowerCase();
      expect(BANNED_CLINICAL.some(b => lower.includes(b))).toBe(true);
    }
  });
});

describe('the toasts read the way §6 writes them', () => {
  it('bath', () => {
    expect(savedAt('bath', '6:40 PM')).toBe('Saved: bath at 6:40 PM');
  });

  it('diaper', () => {
    expect(savedDiaper('BOTH', '1:02 PM')).toBe('Saved: wet + dirty diaper at 1:02 PM');
    expect(savedDiaper('WET', '1:02 PM')).toBe('Saved: wet diaper at 1:02 PM');
  });

  it('bottle', () => {
    expect(savedBottle('4 oz', 'EBM', '1:02 PM')).toBe('Saved: 4 oz breast milk at 1:02 PM');
  });

  it('never says a dry diaper did not count, only what was logged', () => {
    // DRY is excluded from the COUNT but is a real entry; the toast must not editorialise
    expect(savedDiaper('DRY', '1:02 PM')).toBe('Saved: dry diaper at 1:02 PM');
  });
});

describe('the bottle kinds', () => {
  it('offers only three on a new entry; mixed and other are edit-only (§6.1)', () => {
    expect(BOTTLE_KINDS_ON_SHEET).toEqual(['EBM', 'FORMULA', 'WATER']);
    expect(BOTTLE_KINDS_ON_SHEET).not.toContain('MIXED');
    expect(BOTTLE_KINDS_ON_SHEET).not.toContain('OTHER');
  });

  it('still labels the edit-only kinds, so an edited row is readable', () => {
    expect(BOTTLE_KIND_LABEL.MIXED).toBeTruthy();
    expect(BOTTLE_KIND_LABEL.OTHER).toBeTruthy();
  });
});

describe('the diaper sheet says what it saves', () => {
  it('the Save is the board’s one action, and the toast names the kind (Option 2, 2026-10-05)', () => {
    expect(SAVE_DIAPER).toBe('Save diaper');
    expect(savedDiaper('BOTH', '1:02 PM')).toBe('Saved: wet + dirty diaper at 1:02 PM');
  });
  /**
   * THE RASH TICK ON THE ROW WHERE A DAY IS SCANNED. It was saved and read back nowhere, so the
   * activity log showed a bare `Wet` for an entry where the parent had written a rash down (the
   * owner, 2026-09-19). The line repeats the tick and reads nothing into it.
   */
  it('the log row names the rash beside what was in the diaper', () => {
    expect(diaperDetailLine('Wet', true)).toBe('Wet · rash noted');
    expect(diaperDetailLine('Wet + dirty', true)).toBe('Wet + dirty · rash noted');
    expect(diaperDetailLine('Dry', true)).toBe('Dry · rash noted');
  });

  it('is the kind alone when the switch was off, exactly as before', () => {
    expect(diaperDetailLine('Wet', false)).toBe('Wet');
    expect(diaperDetailLine(DIAPER_LABEL.BOTH, false)).toBe('Wet + dirty');
  });

  it('still says the rash when the kind has not arrived, and nothing at all when neither has', () => {
    // a detail row a delta pull has not brought yet: the row survives, and so does the tick
    expect(diaperDetailLine(undefined, true)).toBe('rash noted');
    expect(diaperDetailLine(undefined, false)).toBeUndefined();
    expect(diaperDetailLine('', false)).toBeUndefined();
  });

  /**
   * THE FINISHED SLEEP, IN THE OWNER'S OWN WORDS (2026-09-25): "Woke up … Wake-up time: 9:22 PM /
   * Slept for / – 35 min + / One compact confirmation line / 8:47 PM → 9:22 PM · 35 min asleep /
   * + Add note / Sticky 'Save sleep' button". The length on the line is the app's own duration
   * (`35m`, `1h 20m`), which every other screen uses for a length. Since 2026-09-26 the wake-up
   * time sits at the end of the one time row, under "Woke up at", rather than in a sentence of its
   * own (the owner: "the options should show in 1 row … then the actual hour").
   */
  it('says when the baby woke, how long it slept, and the whole entry on one line', () => {
    expect(FINISHED.sleep).toEqual({
      when: 'Woke up at',
      fellAsleep: 'Fell asleep',
      length: 'Slept for',
      save: 'Save sleep',
    });
    expect(SLEEP_WINDOW('8:47 PM', '9:22 PM', '35m')).toBe('8:47 PM → 9:22 PM · 35m asleep');
    expect(SLEEP_WINDOW('8:02 PM', '9:22 PM', '1h 20m')).toBe('8:02 PM → 9:22 PM · 1h 20m asleep');
    expect(spanLine('8:22 PM', '9:22 PM', '1h')).toBe('8:22 PM → 9:22 PM · 1h');
    expect(ADD_NOTE).toBe('Add note');
  });

  /**
   * THE TANDEM FEED, TYPED IN, SAYS WHAT IT IS (the owner, 2026-09-25: a left-30, right-30 feed read
   * "30 min" for two babies when it was one baby's hour). Both babies, one on each side, in words,
   * before a minute is typed; the Save names it; one baby is a tap away.
   */
  it('says a tandem feed is two babies at once', () => {
    expect(TANDEM_MANUAL.title).toBe('Tandem feed');
    expect(TANDEM_MANUAL.body('Emma', 'Liam')).toBe(
      'Both babies at once: Emma on the left, Liam on the right. Each gets the minutes on their own side.',
    );
    expect(TANDEM_MANUAL.save).toBe('Save tandem feed');
    // no "Only one baby fed? Just Emma" (the owner, 2026-09-25): a tandem is one a parent chose on
    // the Logging-for row, which holds each baby's chip too — the card no longer repeats them
    expect(Object.keys(TANDEM_MANUAL)).toEqual(['title', 'body', 'save']);
    expect(
      tandemSpanLine(
        '8:52 PM',
        '9:22 PM',
        { name: 'Emma', duration: '30m' },
        { name: 'Liam', duration: '20m' },
      ),
    ).toBe('8:52 PM → 9:22 PM · Emma 30m, Liam 20m');
  });

  /**
   * ON BOTH, THE ROW SAYS WHO, IN WORDS (the owner, 2026-09-25). A sheet no longer opens on Both,
   * so a sheet on Both is one a parent chose; the line under the row names the babies and says each
   * gets an entry of their own — never one row between them (MULTIPLES §1).
   */
  it('names the babies an entry on Both is for, and that each gets their own', () => {
    expect(eachOwnEntry(['Emma', 'Liam'])).toBe('Emma and Liam each get their own entry');
    expect(eachOwnEntry(['Emma', 'Liam', 'Noor'])).toBe(
      'Emma, Liam and Noor each get their own entry',
    );
    // the toast joins the names the same way, and reads as it always has
    expect(namesAnd(['Emma'])).toBe('Emma');
    expect(loggedFor(['Emma', 'Liam'])).toBe('Logged for Emma and Liam');
    expect(loggedFor(['Emma', 'Liam', 'Noor'])).toBe('Logged for Emma, Liam and Noor');
    // three babies on a live feed: one timer is one baby's
    expect(PICK_ONE_TO_TIME).toBe('Pick one baby above to time a feed.');
  });

  /**
   * EVERY FINISHED FORM ASKS WHEN IT ENDED, IN THE SAME WORDS — the pump's too since 2026-09-26
   * (the owner: "simplify the words Start time to become end time"), and the sleep in its own:
   * "Woke up at" is what the owner asked the sleep form to say in the first place.
   */
  it('asks every finished form when it ENDED, in the same words', () => {
    expect(FINISHED.tummy).toEqual({ when: 'End time', length: 'How long' });
    expect(FINISHED.breastfeed).toEqual({ when: 'End time', save: 'Save feed' });
    // the pump's row is a heading on its two-page form, "Finished" (the redesign, 2026-10-05)
    expect(FINISHED.pump).toEqual({ when: 'Finished' });
    expect(FINISHED.sleep.when).toBe('Woke up at');
  });

  /**
   * EVERY SHEET NAMES WHAT ITS TIME IS (the owner, 2026-09-26: "instead of just 'time' it should say
   * 'feeding start time'"). Short enough for the eyebrow, and never the bare word "Time".
   */
  it('names each sheet’s time, the bottle in the owner’s words', () => {
    expect(TIME_LABEL.bottle).toBe('Feeding start time');
    expect(TIME_LABEL.diaper).toBe('Changed at');
    for (const [sheet, label] of Object.entries(TIME_LABEL)) {
      expect(label, sheet).not.toBe('Time');
      expect(label.length, sheet).toBeLessThanOrEqual(20);
      // sentence case: one capital, at the start
      expect(label.slice(1), sheet).toBe(label.slice(1).toLowerCase());
    }
  });

  it('the pump’s head row counts in words the household reads at a glance', () => {
    expect(PUMP_HEAD.count(5)).toBe('5th today');
    expect(PUMP_HEAD.count(1)).toBe('1st today');
    expect(PUMP_HEAD.last('7:18 AM', '2.5 oz')).toBe('Last 7:18 AM · 2.5 oz');
    expect(PUMP_HEAD.total('13 oz')).toBe('13 oz total');
  });

  /**
   * THE PUMP'S AMOUNT AND ITS END, IN PLAIN WORDS (the owner, 2026-10-01: *"there are too much
   * numbers"*): a switch of two short choices, the total said once, the start said once, and the
   * two buttons both forms end with, in the stopped timer's words.
   */
  it('names the pump’s switch, its total, its start and its two buttons', () => {
    expect([PUMP_AMOUNT.side, PUMP_AMOUNT.total]).toEqual(['By side', 'Total only']);
    expect([PUMP_AMOUNT.left, PUMP_AMOUNT.right, PUMP_AMOUNT.totalWord]).toEqual([
      'Left',
      'Right',
      'Total',
    ]);
    // the switch is a group a screen reader names, and the readout is heard as one phrase
    expect(PUMP_AMOUNT.by).toBe('How your pump reports it');
    expect(PUMP_AMOUNT.totalSaid('6.5 oz')).toBe('Total, 6.5 oz');
    expect(pumpStarted('8:20 AM')).toBe('Started 8:20 AM');
    expect(CHOOSE_WHERE_IT_GOES).toBe('Choose where it goes');
    expect(SAVE_SESSION_ONLY).toBe('Save session only');
    // sentence case, and short enough to sit beside each other at the right of a row
    for (const word of [PUMP_AMOUNT.side, PUMP_AMOUNT.total, SAVE_SESSION_ONLY]) {
      expect(word.slice(1), word).toBe(word.slice(1).toLowerCase());
      expect(word.length, word).toBeLessThanOrEqual(17);
    }
  });

  /**
   * THE BOTTLE'S TWO NUMBERS, IN THE ORDER THEY ARE READ OFF THE BOTTLE (the owner, 2026-09-25):
   * what was in it, then what was left in it — and never a number a parent could take for the
   * other one.
   */
  it('names the bottle, what was left in it, and what the baby took', () => {
    expect(BOTTLE_AMOUNT).toBe('In the bottle');
    expect(BOTTLE_LEFT).toBe('Left in the bottle');
    expect(bottleTook('3 oz', false)).toBe('Took 3 oz');
    expect(bottleTook('3 oz', true)).toBe('Took 3 oz · the stash is drawn on the full bottle');
    expect(bottleOf('Emma')).toBe('Emma’s bottle');
    expect(leftIn('Emma')).toBe('Left in Emma’s bottle');
    expect(differentAmounts(['Emma', 'Liam'])).toBe('Emma and Liam had different bottles');
    // the sheet shows core's own words; the app keeps no second copy of them to drift apart
    expect(leftoverError({ bottleMl: 30, leftoverMl: 60 })).toBe(
      'More is left than was in the bottle',
    );
  });
});

/**
 * EVERY SAVE NAMES WHAT WAS SAVED, beside its Undo (the owner, 2026-09-16, with the
 * prototype's toast: "when adding an entry, an undo button will show up, but just like in the
 * prototype, it should say what was the entry as well").
 *
 * A toast reading "Saved" with an Undo beside it asks a parent to remember what they just did
 * in order to decide whether to undo it — at the hour when they are least able to. So every
 * sheet hands `announce` a sentence built here, and this is the tripwire: no save path may pass
 * a bare string literal instead.
 */
describe('the save toast names the entry', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const sources = [
    ...readdirSync(join(here, 'modules'))
      .filter(f => f.endsWith('.tsx'))
      .map(f => join(here, 'modules', f)),
    join(here, 'useTimerActions.ts'),
  ];

  it('builds the sentence from the copy, never from a literal at the call site', () => {
    for (const file of sources) {
      const src = readFileSync(file, 'utf8');
      // `toast: <expr>` on a sheet, and `announce(outcome, <expr>)` on the timer actions
      const calls = [
        ...src.matchAll(/toast:\s*([^,\n]+)/g),
        ...src.matchAll(/announce\(\s*\w+,\s*\n?\s*([^,\n]+)/g),
      ].map(m => (m[1] ?? '').trim());
      for (const call of calls) {
        expect(call, `${file}: ${call}`).not.toMatch(/^['"`]/);
      }
    }
  });

  it('reads the way the prototype does, for every shape of entry', () => {
    expect(savedBottle('5 oz', 'FORMULA', '4:57 PM')).toBe('Saved: 5 oz formula at 4:57 PM');
    expect(savedAt('bath', '6:40 PM')).toBe('Saved: bath at 6:40 PM');
    expect(savedDiaper('WET', '1:02 PM')).toBe('Saved: wet diaper at 1:02 PM');
    // a timed entry names the duration instead of the clock: that is what it is
    expect(savedDuration('nap', '1h 35m')).toBe('Saved: nap 1h 35m');
    for (const line of [
      savedBottle('5 oz', 'FORMULA', '4:57 PM'),
      savedAt('bath', '6:40 PM'),
      savedDuration('nap', '1h 35m'),
    ]) {
      expect(line.startsWith('Saved: ')).toBe(true);
      expect(line.length).toBeGreaterThan('Saved: '.length + 3);
    }
  });
});

/**
 * WHEN A TIMER STARTED, IN WORDS (the owner, 2026-09-29; `startWhen.ts`). What the Start says, what
 * the line under the chips says before the tap, and what the confirmation says after a start whose
 * time was on no screen — each built from one timer's own words, the same shape on all four.
 */
describe('the start row says what the start will be, before the tap', () => {
  it('has the chips in the owner’s words, and a sentence for each to a screen reader', () => {
    expect(TIMER_START.label).toBe('Started');
    // the app's one set of time words (`timePresets.ts`, 2026-10-06)
    expect(TIMER_START.choice).toEqual({
      now: 'Now',
      m5: '\u22125m',
      m15: '\u221215m',
      m30: '\u221230m',
      earlier: 'Custom',
    });
    expect(TIMER_START.spoken.m30).toBe('30 minutes ago');
    expect(TIMER_START.shortcut).toBe('Started earlier?');
  });

  it('has each Start say what it will do: the verb alone at the tap, and the time when it is not', () => {
    const [sleep, pump, feed, tummy, play] = START_WORDS;
    expect(TIMER_START.button(sleep!.verb, null)).toBe('Start sleep');
    expect(TIMER_START.button(sleep!.verb, '9:31 PM')).toBe('Start sleep from 9:31 PM');
    expect(TIMER_START.button(pump!.verb, '9:31 PM')).toBe('Start pumping from 9:31 PM');
    expect(TIMER_START.button(feed!.verb, null)).toBe('Start feeding');
    expect(TIMER_START.button(tummy!.verb, '9:31 PM')).toBe('Start tummy time from 9:31 PM');
    expect(TIMER_START.button(play!.verb, '9:31 PM')).toBe('Start playtime from 9:31 PM');
  });

  it('says the consequence in one line, as the sleep did since 2026-09-18', () => {
    const [sleep, pump, , , play] = START_WORDS;
    expect(TIMER_START.already(sleep!.state, '12m')).toBe(
      'Asleep 12m already. The timer counts from then.',
    );
    expect(TIMER_START.already(pump!.state, '10m')).toBe(
      'Pumping 10m already. The timer counts from then.',
    );
    expect(TIMER_START.already(play!.state, '5m')).toBe(
      'Playtime 5m already. The timer counts from then.',
    );
  });

  it('says a start held at the last entry’s end, naming the baby only when there are several', () => {
    expect(TIMER_START.held('sleep', '9:35 PM', null)).toBe(
      'The last sleep ended at 9:35 PM, so the timer counts from then.',
    );
    expect(TIMER_START.held('pump session', '9:35 PM', null)).toBe(
      'The last pump session ended at 9:35 PM, so the timer counts from then.',
    );
    expect(TIMER_START.held('sleep', '9:35 PM', 'Liam')).toBe(
      'Liam’s last sleep ended at 9:35 PM, so Liam’s timer counts from then.',
    );
  });

  it('refuses a start too far back with the way that fits it', () => {
    expect(TIMER_START.tooEarly('2h')).toBe(
      'That is more than 2h ago. If it has ended, use Already finished.',
    );
  });

  it('confirms a one-tap start with its time, and Change', () => {
    expect(TIMER_START.started('Pumping', '9:41 PM', [])).toBe('Pumping started at 9:41 PM');
    expect(TIMER_START.started('Sleep', '9:41 PM', ['Emma'])).toBe(
      'Sleep started at 9:41 PM for Emma',
    );
    expect(TIMER_START.started('Playtime', '9:41 PM', ['Emma', 'Liam'])).toBe(
      'Playtime started at 9:41 PM for Emma and Liam',
    );
    expect(TIMER_START.undo).toBe('Undo');
    expect(TIMER_START.undone('Pumping')).toBe('Pumping removed');
  });

  it('writes no dash and no clinical word, anywhere a start is said', () => {
    for (const line of START_STRINGS) {
      expect(line, line).not.toMatch(/[—–]|\s-\s/);
      for (const banned of BANNED_CLINICAL) expect(line.toLowerCase(), line).not.toContain(banned);
    }
  });
});

/**
 * A RUNNING TIMER'S TWO TIMES, SIDE BY SIDE (the owner, 2026-09-29: *"cut the correct start time by
 * half and do the other half to do what we want"*): each half named for the time it holds, as every
 * time in a sheet is, and heard with its time and what a tap does.
 */
describe('the running timer says its start and its end', () => {
  it('names the two halves, and says Now for an end that has not come yet', () => {
    expect(RUNNING_TIMES.start).toBe('Start time');
    expect(RUNNING_TIMES.end).toBe('End time');
    expect(RUNNING_TIMES.now).toBe('Now');
    // "End time" is every finished form's word for the same question (`FINISHED`); the pump's
    // two-page form says "Finished" over its row since the redesign of 2026-10-05
    expect(RUNNING_TIMES.end).toBe(FINISHED.breastfeed.when);
  });

  it('is heard as the time with its name, and the hint says what a tap does', () => {
    expect(RUNNING_TIMES.startSpoken('9:31 PM')).toBe('Start time, 9:31 PM');
    expect(RUNNING_TIMES.startHint).toBe('Change when it started');
    expect(RUNNING_TIMES.endSpoken(null)).toBe('End time, now');
    expect(RUNNING_TIMES.endSpoken('9:31 PM')).toBe('End time, 9:31 PM');
    expect(RUNNING_TIMES.endHint).toBe('Set when it ended');
  });

  it('refuses an end a feed was still counting at in the timer’s words, as the other two are', () => {
    expect(LONG_RUN.endTooEarly).toBe('That is before the timer started');
    expect(LONG_RUN.endInFuture).toBe('That is later than now');
    expect(LONG_RUN.endStillCounting).toBe(
      'The feed timer was still counting then. Pick a later time.',
    );
  });

  it('writes no dash and no clinical word, in sentence case', () => {
    for (const line of TIMES_STRINGS) {
      expect(line, line).not.toMatch(/[—–]|\s-\s/);
      expect(line[0], line).toBe(line[0]?.toUpperCase());
      for (const banned of BANNED_CLINICAL) expect(line.toLowerCase(), line).not.toContain(banned);
    }
  });
});

/**
 * A RUNNING PUMP'S END (the owner, 2026-10-03). The start row's words stay the start's. These are
 * the stop sheet's, and fifteen is this row's step.
 */
describe('a running pump says when it ended', () => {
  it('names the row Ended, and the chips are Now, \u22125m, \u221215m, Custom', () => {
    expect(PUMP_ENDED.label).toBe('Ended');
    expect(PUMP_ENDED.choice).toEqual({
      now: 'Now',
      m5: '\u22125m',
      m15: '\u221215m',
      m30: '\u221230m',
      earlier: 'Custom',
    });
    expect(PUMP_ENDED.spoken.m15).toBe('15 minutes ago');
    expect(PUMP_ENDED.spoken.earlier).toBe('Custom, choose the time');
  });
});
