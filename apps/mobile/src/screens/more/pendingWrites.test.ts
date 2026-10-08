/**
 * THE REMINDERS PAGE RESPONDS AT ONCE (the owner, 2026-09-26: *"there is a delay when adjusting
 * quiet hours, sometimes there is a delay when turning off or on"*). `PendingWrites` is what the
 * page draws its quiet hours and reminder levels through: these hold it to showing a tap before
 * its write has done anything, keeping it until the database has it, and going back — and saying
 * so — when the write fails. Each write here is held open and released by hand, so the order of
 * events is the test's, not the scheduler's.
 */
import { describe, expect, it } from 'vitest';
import { PendingWrites, type Stored } from './pendingWrites';

/** A write the test finishes, one way or the other, when it chooses. */
function held() {
  let done!: () => void;
  let fail!: (e: Error) => void;
  const promise = new Promise<void>((res, rej) => {
    done = res;
    fail = rej;
  });
  return { commit: () => promise, done, fail: () => fail(new Error('the disk said no')) };
}

type Quiet = { from: string; to: string } | null;
const sameQuiet = (a: Quiet, b: Quiet) =>
  a === null || b === null ? a === b : a.from === b.from && a.to === b.to;

/** A database with one quiet-hours setting; every `read` is a new snapshot, as a re-query is. */
function db(initial: Quiet) {
  let value = initial;
  let snapshot = { value };
  const stored = (): Stored<'quiet', Quiet, { value: Quiet }> => {
    const s = snapshot;
    return { snapshot: s, read: () => s.value, same: sameQuiet };
  };
  return {
    stored,
    /** What a commit does: the row changes, and the next read sees it. */
    commit(next: Quiet) {
      value = next;
    },
    /** The query runs again after an invalidation. */
    reread() {
      snapshot = { value };
      return stored();
    },
    get value() {
      return value;
    },
  };
}

const flush = () => new Promise<void>(r => setTimeout(r, 0));

describe('a tap is shown before its write has done anything', () => {
  it('turns quiet hours on the instant it is tapped, and draws again to say so', async () => {
    const d = db(null);
    let draws = 0;
    const w = new PendingWrites(d.stored(), () => (draws += 1));
    const write = held();

    const answer = w.write([['quiet', { from: '22:00', to: '07:00' }]], write.commit);
    // no await between the tap and this line: nothing has been written yet
    expect(w.show('quiet', d.stored().read('quiet'))).toEqual({ from: '22:00', to: '07:00' });
    expect(w.pending('quiet')).toBe(true);
    expect(draws).toBe(1);

    d.commit({ from: '22:00', to: '07:00' });
    write.done();
    expect(await answer).toBe('saved');
  });

  it('turns them off at once too — the case that used to wait for every channel', () => {
    const d = db({ from: '22:00', to: '07:00' });
    const w = new PendingWrites(d.stored(), () => undefined);
    void w.write([['quiet', null]], held().commit);
    expect(w.show('quiet', d.stored().read('quiet'))).toBeNull();
  });

  it('moves a time at once, and a second change before the first lands shows the second', () => {
    const d = db({ from: '22:00', to: '07:00' });
    const w = new PendingWrites(d.stored(), () => undefined);
    void w.write([['quiet', { from: '21:30', to: '07:00' }]], held().commit);
    void w.write([['quiet', { from: '21:30', to: '06:00' }]], held().commit);
    expect(w.show('quiet', d.stored().read('quiet'))).toEqual({ from: '21:30', to: '06:00' });
  });
});

describe('a write that lands keeps what it showed until the database has it', () => {
  it('holds the value through a read from before the commit, and lets go after one from after', async () => {
    const d = db(null);
    const w = new PendingWrites(d.stored(), () => undefined);
    const write = held();
    const answer = w.write([['quiet', { from: '22:00', to: '07:00' }]], write.commit);

    // an unrelated re-read while the write is still going: the database does not have it yet
    w.observe(d.reread());
    expect(w.show('quiet', d.stored().read('quiet'))).toEqual({ from: '22:00', to: '07:00' });

    d.commit({ from: '22:00', to: '07:00' });
    write.done();
    expect(await answer).toBe('saved');
    // landed, and the read the screen has is still the old one: nothing flickers back
    expect(w.pending('quiet')).toBe(true);
    expect(w.show('quiet', null)).toEqual({ from: '22:00', to: '07:00' });

    // the commit's own re-read arrives: from here the database is the truth
    const after = d.reread();
    w.observe(after);
    expect(w.pending('quiet')).toBe(false);
    expect(w.show('quiet', after.read('quiet'))).toEqual({ from: '22:00', to: '07:00' });
  });

  it('lets go at once when the re-read beat the answer home', async () => {
    const d = db(null);
    const w = new PendingWrites(d.stored(), () => undefined);
    const write = held();
    const answer = w.write([['quiet', { from: '22:00', to: '07:00' }]], write.commit);
    d.commit({ from: '22:00', to: '07:00' });
    w.observe(d.reread());
    write.done();
    expect(await answer).toBe('saved');
    expect(w.pending('quiet')).toBe(false);
  });

  it('believes the database after the commit, even when another phone wrote after us', async () => {
    const d = db(null);
    const w = new PendingWrites(d.stored(), () => undefined);
    const write = held();
    const answer = w.write([['quiet', { from: '22:00', to: '07:00' }]], write.commit);
    d.commit({ from: '22:00', to: '07:00' });
    write.done();
    await answer;
    // a pull lands the other parent's change before the re-read
    d.commit({ from: '23:00', to: '06:00' });
    const after = d.reread();
    w.observe(after);
    expect(w.show('quiet', after.read('quiet'))).toEqual({ from: '23:00', to: '06:00' });
  });
});

describe('a write that fails goes back, and says so', () => {
  it('shows what is really stored again, and answers `lost` for the toast', async () => {
    const d = db({ from: '22:00', to: '07:00' });
    let draws = 0;
    const w = new PendingWrites(d.stored(), () => (draws += 1));
    const write = held();
    const answer = w.write([['quiet', null]], write.commit);
    expect(w.show('quiet', d.stored().read('quiet'))).toBeNull();

    write.fail();
    expect(await answer).toBe('lost');
    expect(w.pending('quiet')).toBe(false);
    expect(w.show('quiet', d.stored().read('quiet'))).toEqual({ from: '22:00', to: '07:00' });
    // drawn for the tap and drawn again for the way back
    expect(draws).toBe(2);
  });

  it('says nothing when a later tap already owns the setting', async () => {
    const d = db(null);
    const w = new PendingWrites(d.stored(), () => undefined);
    const first = held();
    const second = held();
    const a = w.write([['quiet', { from: '22:00', to: '07:00' }]], first.commit);
    const b = w.write([['quiet', { from: '21:00', to: '07:00' }]], second.commit);
    first.fail();
    expect(await a).toBe('superseded');
    // the later tap is still what is shown, and still pending
    expect(w.show('quiet', null)).toEqual({ from: '21:00', to: '07:00' });
    d.commit({ from: '21:00', to: '07:00' });
    second.done();
    expect(await b).toBe('saved');
  });
});

describe('a write over several settings, as "All reminders" is', () => {
  type Level = 'sound' | 'vibrate' | 'silent' | 'off';
  const levels = new Map<string, Level>([
    ['bottle', 'sound'],
    ['pump', 'sound'],
  ]);
  const stored = (): Stored<string, Level, Map<string, Level>> => {
    const snap = new Map(levels);
    return { snapshot: snap, read: k => snap.get(k) ?? 'sound', same: (x, y) => x === y };
  };

  it('shows every row at once, and a failed one gives back only the rows it still owns', async () => {
    const w = new PendingWrites(stored(), () => undefined);
    const all = held();
    const one = held();
    const allAnswer = w.write(
      [
        ['bottle', 'off'],
        ['pump', 'off'],
      ],
      all.commit,
    );
    expect(w.show('bottle', 'sound')).toBe('off');
    expect(w.show('pump', 'sound')).toBe('off');

    // the parent sets pump back to vibrate before "all" answers
    const oneAnswer = w.write([['pump', 'vibrate']], one.commit);
    all.fail();
    expect(await allAnswer).toBe('lost');
    // bottle goes back to what is stored; pump keeps the newer tap
    expect(w.show('bottle', 'sound')).toBe('sound');
    expect(w.show('pump', 'sound')).toBe('vibrate');

    levels.set('pump', 'vibrate');
    one.done();
    expect(await oneAnswer).toBe('saved');
    await flush();
  });
});
