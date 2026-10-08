/**
 * THE APP'S OWN CONFIRMATION ANSWERS ONCE, IN TURN, AND NEVER HANGS (the owner, 2026-09-29: the
 * phone's dialog "is not in our ordinary design"; `confirm.ts` has the rules). The queue is pure, so
 * every answer is held here with a hand-made clock; the sheet that draws it is read off its source
 * at the foot, because this suite has no renderer.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CONFIRM_CANCEL,
  confirmButtons,
  confirmQueue,
  type ConfirmQueueOptions,
  type ConfirmRequest,
} from './confirm';

const TURN_OFF: ConfirmRequest = {
  title: 'Turn off pumping?',
  body: 'It leaves Today, the log and the schedule.',
  action: 'Turn off',
  destructive: true,
};
const END_SLEEP: ConfirmRequest = {
  title: 'Ada is asleep',
  body: 'End the sleep to start tummy time?',
  action: 'End sleep',
};

/** A clock that only moves when told, and the one timer the queue may set on it. */
function aClock() {
  let at = 0;
  let timer: { run: () => void; due: number } | null = null;
  const options: ConfirmQueueOptions = {
    gapMs: 220,
    now: () => at,
    schedule: (run, ms) => {
      timer = { run, due: at + ms };
      return () => {
        timer = null;
      };
    },
  };
  const advance = (ms: number) => {
    at += ms;
    const t = timer;
    if (t !== null && at >= t.due) {
      timer = null;
      t.run();
    }
  };
  return { options, advance, pending: () => timer !== null };
}

/** A queue with its sheet on the screen: subscribed, counting what it was told. */
function onScreen(options?: ConfirmQueueOptions) {
  const q = confirmQueue(options);
  let told = 0;
  const off = q.subscribe(() => void (told += 1));
  return { q, off, told: () => told };
}

/** What a promise has settled to so far, read after the microtasks have run. */
async function settled<T>(p: Promise<T>): Promise<{ done: boolean; value?: T }> {
  let out: { done: boolean; value?: T } = { done: false };
  void p.then(value => {
    out = { done: true, value };
  });
  await Promise.resolve();
  await Promise.resolve();
  return out;
}

describe('one question, one answer', () => {
  it('shows the question it was asked, and the action answers true', async () => {
    const { q } = onScreen();
    const answer = q.ask(TURN_OFF);
    expect(q.current()).toBe(TURN_OFF);
    q.answer(true);
    expect(q.current()).toBeNull();
    await expect(answer).resolves.toBe(true);
  });

  it('Cancel answers false', async () => {
    const { q } = onScreen();
    const answer = q.ask(TURN_OFF);
    q.answer(false);
    await expect(answer).resolves.toBe(false);
  });

  it('Close, the scrim, a drag down and Back are the sheet’s false too: nothing is written', async () => {
    // the sheet hands every dismissal to `answer(false)` (the source check at the foot holds that)
    const { q } = onScreen();
    const answer = q.ask(END_SLEEP);
    q.answer(false);
    await expect(answer).resolves.toBe(false);
    expect(q.current()).toBeNull();
  });

  it('asks nothing of its own: the answer is all it gives, and the question is not answered before it', async () => {
    const { q } = onScreen();
    const answer = q.ask(TURN_OFF);
    expect(await settled(answer)).toEqual({ done: false });
    q.answer(true);
    expect(await settled(answer)).toEqual({ done: true, value: true });
  });

  it('a second tap on the action while the sheet slides away does nothing, nor does a Cancel after it', async () => {
    const { q, told } = onScreen();
    const answer = q.ask(TURN_OFF);
    q.answer(true);
    const after = told();
    q.answer(true);
    q.answer(false);
    expect(told()).toBe(after);
    await expect(answer).resolves.toBe(true);
  });
});

describe('in turn', () => {
  it('a question asked while another is up waits, and is shown once the first has had time to leave', async () => {
    const clock = aClock();
    const { q } = onScreen(clock.options);
    const first = q.ask({ ...END_SLEEP, title: 'Ada is asleep' });
    const second = q.ask({ ...END_SLEEP, title: 'Liam is asleep' });
    expect(q.current()?.title).toBe('Ada is asleep');
    q.answer(true);
    // not swapped in place: the sheet leaves first
    expect(q.current()).toBeNull();
    expect(clock.pending()).toBe(true);
    // a tap during the gap answers nothing: nothing is up
    q.answer(false);
    clock.advance(219);
    expect(q.current()).toBeNull();
    clock.advance(1);
    expect(q.current()?.title).toBe('Liam is asleep');
    q.answer(false);
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
  });

  it('with no gap (the shell, whose own handover waits), the next is up at once', () => {
    const { q } = onScreen();
    void q.ask(TURN_OFF);
    void q.ask(END_SLEEP);
    q.answer(true);
    expect(q.current()).toBe(END_SLEEP);
  });

  it('tells its sheet each time what is up changes, and only then', () => {
    const { q, told } = onScreen();
    void q.ask(TURN_OFF);
    expect(told()).toBe(1);
    void q.ask(END_SLEEP); // waits: nothing on the screen changed
    expect(told()).toBe(1);
    q.answer(true); // the first leaves and the second comes, with no gap
    expect(told()).toBe(3);
  });
});

describe('never hangs', () => {
  it('with no sheet on the screen to answer it, a question is Cancel at once', async () => {
    const q = confirmQueue();
    await expect(q.ask(TURN_OFF)).resolves.toBe(false);
    expect(q.current()).toBeNull();
  });

  it('when its sheet goes (its screen or its own sheet closed), everything up or waiting is Cancel', async () => {
    const clock = aClock();
    const { q, off } = onScreen(clock.options);
    const first = q.ask(TURN_OFF);
    const second = q.ask(END_SLEEP);
    off();
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBe(false);
    expect(q.current()).toBeNull();
    // and it asks nothing more of a sheet that is not there
    await expect(q.ask(TURN_OFF)).resolves.toBe(false);
  });

  it('a sheet that comes back (React mounting it twice in development) is asked again as before', async () => {
    const q = confirmQueue();
    q.subscribe(() => undefined)();
    q.subscribe(() => undefined);
    const answer = q.ask(TURN_OFF);
    q.answer(true);
    await expect(answer).resolves.toBe(true);
  });

  it('dismiss answers everything false without being asked, and calls off a question still waiting its turn', async () => {
    const clock = aClock();
    const { q } = onScreen(clock.options);
    const first = q.ask(TURN_OFF);
    q.answer(true);
    const second = q.ask(END_SLEEP);
    expect(clock.pending()).toBe(true);
    q.dismiss();
    expect(clock.pending()).toBe(false);
    await expect(first).resolves.toBe(true);
    await expect(second).resolves.toBe(false);
    clock.advance(1_000);
    expect(q.current()).toBeNull();
  });
});

describe('the two buttons', () => {
  it('draws the action first, then Cancel under it as a ghost', () => {
    expect(confirmButtons(TURN_OFF)).toEqual([
      { label: 'Turn off', variant: 'danger', answer: true, role: 'action' },
      { label: CONFIRM_CANCEL, variant: 'ghost', answer: false, role: 'cancel' },
    ]);
  });

  it('draws a destructive action as the danger fill and any other as the plain primary', () => {
    expect(confirmButtons(TURN_OFF)[0].variant).toBe('danger');
    expect(confirmButtons(END_SLEEP)[0].variant).toBe('primary');
    expect(confirmButtons({ ...END_SLEEP, destructive: false })[0].variant).toBe('primary');
  });

  it('says the other answer in the caller’s own words when it has them', () => {
    expect(confirmButtons({ ...TURN_OFF, cancel: 'Keep it' })[1].label).toBe('Keep it');
    expect(CONFIRM_CANCEL).toBe('Cancel');
  });
});

/* ------------------------------------------------------------------------ the sheet, wired */

const here = dirname(fileURLToPath(import.meta.url));
const sheet = readFileSync(join(here, 'ConfirmSheet.tsx'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  .replace(/\s+/g, ' ');

describe('ConfirmSheet, wired (read off its source)', () => {
  it('is a BottomSheet whose every dismissal is the false answer, clear of the phone’s own buttons', () => {
    expect(sheet).toContain('<BottomSheet visible={request !== null}');
    expect(sheet).toContain('onClose={() => onAnswer(false)}');
    expect(sheet).toContain('bottomInset={bottomInset}');
  });

  it('draws its buttons from `confirmButtons`, each answering its own answer, with an id each', () => {
    expect(sheet).toContain('confirmButtons(q)');
    expect(sheet).toContain('onPress={() => onAnswer(action.answer)}');
    expect(sheet).toContain('onPress={() => onAnswer(cancel.answer)}');
    expect(sheet).toContain('testID={`${testID}.${action.role}`}');
    expect(sheet).toContain('testID={`${testID}.${cancel.role}`}');
    // the action is the sheet's call to action, 54 pt; Cancel keeps the 44 pt minimum
    expect(sheet).toContain('size="lg"');
  });

  it('is never a log sheet’s color, and keeps its words while it slides away', () => {
    expect(sheet).toContain('<ModuleTint module={null}>');
    expect(sheet).toContain('if (request !== null) shown.current = request;');
  });

  it('reads the theme for everything it draws: no color, radius or number of its own', () => {
    expect(sheet).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
    expect(sheet).toContain('gap: t.space.xs');
  });
});
