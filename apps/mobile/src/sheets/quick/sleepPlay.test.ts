/**
 * ASLEEP OR PLAYING, NEVER BOTH (the owner, 2026-09-27; `sleepPlay.ts` has their words and the
 * rule): which running timer stands in the way, where it is ended, the question in the household's
 * word — and, as tripwires over the source, since node cannot raise a sheet, that the question
 * comes before any write on every path that can put tummy time over a sleep, and that it is asked
 * in the app's own confirmation, mounted where iOS can present it.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ConfirmRequest } from '@nibblecue/ui';
import { describe, expect, it } from 'vitest';
import {
  endIsNow,
  RIVAL,
  rivalEndMs,
  rivalFor,
  sleepPlayQuestion,
  type RivalTimer,
} from './sleepPlay';
import { askSleepPlay, sleepPlayRequest } from './sleepPlayAsk';

const MIN = 60_000;
const NOW = Date.UTC(2026, 8, 27, 18, 0);

const running = (
  type: RivalTimer['type'],
  childId: string | null,
  startedAtMs: number,
  id = `${type}:${childId ?? 'household'}`,
): RivalTimer => ({ id, type, childId, startedAtMs });

const emmaAsleep = running('sleep', 'emma', NOW - 62 * MIN);
const liamAsleep = running('sleep', 'liam', NOW - 20 * MIN);
const emmaPlaying = running('tummy', 'emma', NOW - 7 * MIN);
const pump = running('pump', null, NOW - 12 * MIN);

describe('what stands in the way', () => {
  it('stands a baby’s running sleep in the way of that baby’s tummy time', () => {
    expect(
      rivalFor([pump, emmaAsleep], { type: 'tummy', childId: 'emma', startMs: NOW }, NOW),
    ).toBe(emmaAsleep);
  });

  it('never another baby’s: twins are two babies', () => {
    expect(
      rivalFor([liamAsleep], { type: 'tummy', childId: 'emma', startMs: NOW }, NOW),
    ).toBeNull();
    expect(
      rivalFor([liamAsleep, emmaAsleep], { type: 'tummy', childId: 'liam', startMs: NOW }, NOW),
    ).toBe(liamAsleep);
  });

  it('never a household entry, and nothing for a pump or a feed', () => {
    // a pump is the parent's: it neither stands in the way nor is stood in the way of
    expect(rivalFor([pump], { type: 'tummy', childId: 'emma', startMs: NOW }, NOW)).toBeNull();
    expect(rivalFor([emmaAsleep], { type: 'pump', childId: null, startMs: NOW }, NOW)).toBeNull();
    expect(
      rivalFor(
        [emmaAsleep, emmaPlaying],
        { type: 'breastfeed', childId: 'emma', startMs: NOW },
        NOW,
      ),
    ).toBeNull();
    expect(RIVAL.pump).toBeUndefined();
    expect(RIVAL.breastfeed).toBeUndefined();
  });

  it('reads the owner’s rule the other way too: a sleep over the same baby’s tummy time (the addition)', () => {
    expect(RIVAL).toEqual({ tummy: 'sleep', sleep: 'tummy' });
    expect(rivalFor([emmaPlaying], { type: 'sleep', childId: 'emma', startMs: NOW }, NOW)).toBe(
      emmaPlaying,
    );
    // from a picked time too — a sleep already under way
    expect(
      rivalFor([emmaPlaying], { type: 'sleep', childId: 'emma', startMs: NOW - 30 * MIN }, NOW),
    ).toBe(emmaPlaying);
    expect(
      rivalFor([emmaPlaying], { type: 'sleep', childId: 'liam', startMs: NOW }, NOW),
    ).toBeNull();
  });

  it('stands in the way of a finished session only where the two overlap', () => {
    const tummy = (fromMin: number, toMin: number) => ({
      type: 'tummy' as const,
      childId: 'emma',
      startMs: NOW - fromMin * MIN,
      endMs: NOW - toMin * MIN,
    });
    // ended now, fifteen minutes long: inside the hour-long sleep
    expect(rivalFor([emmaAsleep], tummy(15, 0), NOW)).toBe(emmaAsleep);
    // across the sleep's start
    expect(rivalFor([emmaAsleep], tummy(70, 55), NOW)).toBe(emmaAsleep);
    // over before the sleep began, or ending the instant it began: beside it, not over it
    expect(rivalFor([emmaAsleep], tummy(90, 70), NOW)).toBeNull();
    expect(rivalFor([emmaAsleep], tummy(80, 62), NOW)).toBeNull();
  });

  it('asks nothing when nothing runs', () => {
    expect(rivalFor([], { type: 'tummy', childId: 'emma', startMs: NOW }, NOW)).toBeNull();
  });
});

describe('where the running one ends: min(now, max(where the new one begins, its own start))', () => {
  it('at the tap, for a start tapped now — the new timer starts from the same instant', () => {
    const tap = NOW - 20_000; // answered twenty seconds later
    expect(rivalEndMs({ startMs: tap }, emmaAsleep, NOW)).toBe(tap);
  });

  it('where a finished session began', () => {
    expect(rivalEndMs({ startMs: NOW - 15 * MIN }, emmaAsleep, NOW)).toBe(NOW - 15 * MIN);
  });

  it('at a sleep’s picked start, for tummy time running since before it', () => {
    const playing = running('tummy', 'emma', NOW - 45 * MIN);
    expect(rivalEndMs({ startMs: NOW - 30 * MIN }, playing, NOW)).toBe(NOW - 30 * MIN);
  });

  it('never before the running one began: a session that began first leaves it a sleep of no length', () => {
    // a tummy session typed in as 70 to 55 minutes ago, over a sleep started 62 minutes ago
    expect(rivalEndMs({ startMs: NOW - 70 * MIN }, emmaAsleep, NOW)).toBe(emmaAsleep.startedAtMs);
  });

  it('never after now, whatever it is handed', () => {
    expect(rivalEndMs({ startMs: NOW + 5 * MIN }, emmaAsleep, NOW)).toBe(NOW);
    // a timer whose start another phone's fast clock put in the future ends now; the data layer
    // then holds its end to its start (`stopTimer`)
    expect(rivalEndMs({ startMs: NOW }, running('sleep', 'emma', NOW + MIN), NOW)).toBe(NOW);
  });

  it('says the clock only when the end is not this minute', () => {
    expect(endIsNow(NOW, NOW)).toBe(true);
    expect(endIsNow(NOW - 59_000, NOW)).toBe(true);
    expect(endIsNow(NOW - MIN, NOW)).toBe(false);
    expect(endIsNow(NOW - 15 * MIN, NOW)).toBe(false);
  });
});

describe('the question, in the household’s word', () => {
  const ask = (over: Partial<Parameters<typeof sleepPlayQuestion>[0]> = {}) =>
    sleepPlayQuestion({
      rival: 'sleep',
      name: 'Emma',
      playWord: 'tummy time',
      finished: false,
      endClock: null,
      ...over,
    });

  it('asks the owner’s question before tummy time starts over a sleep', () => {
    expect(ask()).toEqual({
      title: 'Emma is asleep',
      body: 'End the sleep to start tummy time?',
      confirm: 'End sleep',
      cancel: 'Cancel',
    });
  });

  it('says Playtime’s own word once tummy time has graduated', () => {
    expect(ask({ playWord: 'playtime' }).body).toBe('End the sleep to start playtime?');
  });

  it('says where the sleep ends, and "save", for a session already finished', () => {
    expect(ask({ finished: true, endClock: '2:45 PM' }).body).toBe(
      'End the sleep at 2:45 PM to save tummy time?',
    );
  });

  it('asks the other way round for a sleep over tummy time, in the long-run card’s own "on"', () => {
    expect(ask({ rival: 'tummy' })).toEqual({
      title: 'Emma is on tummy time',
      body: 'End tummy time to start the sleep?',
      confirm: 'End tummy time',
      cancel: 'Cancel',
    });
    expect(ask({ rival: 'tummy', playWord: 'playtime', endClock: '1:20 PM' })).toEqual({
      title: 'Emma is on playtime',
      body: 'End playtime at 1:20 PM to start the sleep?',
      confirm: 'End playtime',
      cancel: 'Cancel',
    });
  });

  it('names a baby with no name as the app does', () => {
    expect(ask({ name: null }).title).toBe('Your baby is asleep');
    expect(ask({ name: '  ' }).title).toBe('Your baby is asleep');
  });

  it('is short, and says nothing about the baby but where the timer is', () => {
    for (const q of [
      ask(),
      ask({ rival: 'tummy' }),
      ask({ finished: true, endClock: '2:45 PM' }),
    ]) {
      expect(q.body.length).toBeLessThanOrEqual(48);
      expect(`${q.title} ${q.body}`).not.toMatch(/should|wake|tired|too|enough|need/i);
    }
  });
});

/* ------------------------------------------------------ every path asks first (tripwires) */

const here = dirname(fileURLToPath(import.meta.url));
const code = (rel: string): string =>
  readFileSync(join(here, rel), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');

const actions = code('useTimerActions.ts');
const quickWrite = code('useQuickWrite.ts');

describe('nothing is written until the parent answers', () => {
  it('asks inside the one start every surface calls — the sheets and a coin — before its write', () => {
    const start = actions.slice(actions.indexOf('const start = useCallback('));
    const asked = start.indexOf(
      'const clear = await endRivals( { type: args.type, startMs: args.startedAtMs }, [args.childId], running, args, );',
    );
    expect(asked).toBeGreaterThan(-1);
    expect(start.indexOf('if (!clear) return null;')).toBeGreaterThan(asked);
    expect(start.indexOf('await startTimer(')).toBeGreaterThan(asked);
    // and inside the start's own hold, so a second tap while it is asked is the same start
    expect(
      start.indexOf('timerWrites.run(startKey(args.type, args.childId), async () => {'),
    ).toBeLessThan(asked);
  });

  it('asks every baby’s question before it ends any timer, and a Cancel ends none', () => {
    const rivals = actions.slice(actions.indexOf('const endRivals = useCallback('));
    const asking = rivals.indexOf('const yes = await askSleepPlay(');
    const ending = rivals.indexOf(
      'const ended = await stop(rival, rivalEndMs(adding, rival, nowMs));',
    );
    expect(asking).toBeGreaterThan(-1);
    expect(ending).toBeGreaterThan(asking);
    expect(rivals.indexOf('if (!yes) return false;')).toBeLessThan(ending);
    // the end is the card's own stop — its entry, its toast, its Undo — never a write of its own
    expect(rivals).not.toContain('stopTimer(');
    // the household's word for tummy time
    expect(rivals).toContain("playWord: wordOf('tummy'),");
  });

  // (no tummy-time or sleep sheet in NibbleCue: the question's sheet checks went with them)
  it('asks before the "+ Liam" copy is written, and copies exactly as before where nothing asks', () => {
    const copy = quickWrite.slice(quickWrite.indexOf('label: plusChild(other.name),'));
    const asked = copy.indexOf(
      'if (beforeCopy !== undefined && !(await beforeCopy(other.id))) return;',
    );
    expect(asked).toBeGreaterThan(-1);
    expect(copy.indexOf('await logActivity(db, systemClock, {')).toBeGreaterThan(asked);
  });
});

describe('asked in the app’s own confirmation (2026-09-29: the phone’s dialog "is not in our ordinary design")', () => {
  const q = sleepPlayQuestion({
    rival: 'sleep',
    name: 'Emma',
    playWord: 'tummy time',
    finished: false,
    endClock: null,
  });

  it('asks the question in its own words, with an action that is not a danger: a stop is undone from its toast', () => {
    expect(sleepPlayRequest(q)).toEqual({
      title: 'Emma is asleep',
      body: q.body,
      action: 'End sleep',
      cancel: 'Cancel',
      destructive: false,
    });
  });

  it('asks through the confirmation it is handed, and its answer is the answer: a dismiss is Cancel', async () => {
    const asked: ConfirmRequest[] = [];
    for (const answer of [true, false]) {
      const yes = await askSleepPlay(q, request => {
        asked.push(request);
        return Promise.resolve(answer);
      });
      expect(yes).toBe(answer);
    }
    expect(asked).toEqual([sleepPlayRequest(q), sleepPlayRequest(q)]);
  });

  it('asks through the shell where there is no sheet of its own', () => {
    expect(actions).toContain('export function useTimerActions(ask?: Confirm) {');
    expect(actions).toContain('const question = ask ?? shell.confirm;');
    expect(actions).toContain('via: Confirm = question,');
    // the one question the endRivals loop asks goes where it was told
    const rivals = actions.slice(actions.indexOf('const endRivals = useCallback('));
    expect(rivals).toContain('}), via, );');
    // (CuddleCue's coin start asks from LinkRouter; NibbleCue has no coins)
  });
});
