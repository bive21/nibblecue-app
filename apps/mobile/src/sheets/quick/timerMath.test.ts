import { describe, expect, it } from 'vitest';
import {
  bankedSides,
  elapsedMs,
  feedCardSides,
  firstSide,
  isPausedFeed,
  manualBounds,
  MIN,
  minutesOf,
  resumeSide,
  startBeforeStop,
  startCorrection,
  switchTarget,
  timerSleepKind,
} from './timerMath';

const T0 = Date.UTC(2026, 8, 15, 12, 0, 0);

describe('bankedSides — the open side keeps counting, the closed one is what was banked', () => {
  it('adds the open run to the active side only', () => {
    const t = {
      activeSide: 'LEFT' as const,
      sideStartedAtMs: T0,
      leftSeconds: 120,
      rightSeconds: 300,
    };
    expect(bankedSides(t, T0 + 90_000)).toEqual({ left: 210, right: 300 });
  });

  it('adds nothing while paused', () => {
    const t = { activeSide: null, sideStartedAtMs: null, leftSeconds: 120, rightSeconds: 300 };
    expect(bankedSides(t, T0 + 90_000)).toEqual({ left: 120, right: 300 });
  });

  it('never counts a clock that is behind the side start', () => {
    const t = {
      activeSide: 'RIGHT' as const,
      sideStartedAtMs: T0,
      leftSeconds: 0,
      rightSeconds: 0,
    };
    expect(bankedSides(t, T0 - 5_000)).toEqual({ left: 0, right: 0 });
  });
});

describe('elapsedMs', () => {
  it('is now minus start minus the paused total, floored at zero', () => {
    expect(elapsedMs({ startedAtMs: T0, pausedMs: 10 * MIN }, T0 + 25 * MIN)).toBe(15 * MIN);
    expect(elapsedMs({ startedAtMs: T0, pausedMs: 0 }, T0 - 1)).toBe(0);
  });
});

describe('manualBounds — the time row is when it ended', () => {
  it('puts the start that many minutes before the wake time (§6.5)', () => {
    expect(manualBounds(T0, 95)).toEqual({ startMs: T0 - 95 * MIN, endMs: T0 });
  });

  it('treats a negative length as zero rather than a start after the end', () => {
    expect(manualBounds(T0, -5)).toEqual({ startMs: T0, endMs: T0 });
  });
});

describe('minutesOf, firstSide', () => {
  it('rounds a stopped timer to whole minutes', () => {
    expect(minutesOf(14.6 * MIN)).toBe(15);
    expect(minutesOf(-1)).toBe(0);
  });

  it('reads the first side from meta, else the open side', () => {
    expect(firstSide({ meta: { first_side: 'RIGHT' }, activeSide: 'LEFT' })).toBe('RIGHT');
    expect(firstSide({ meta: {}, activeSide: 'LEFT' })).toBe('LEFT');
    expect(firstSide({ meta: {}, activeSide: null })).toBeNull();
  });
});

/**
 * NAP OR NIGHT IS DECIDED AT THE STOP, FROM THE START AS IT IS THEN (the audit of 2026-09-24,
 * care C2 and C3). A coin-started sleep has no `meta.kind` and was always saved as a nap; a
 * corrected start kept the word the old start had earned.
 */
describe('timerSleepKind — the household window, read off the start the entry is saved with', () => {
  const zone = 'America/New_York';
  // 8:30 PM and 5:00 PM on 2026-09-15 in New York (UTC-4)
  const evening = Date.UTC(2026, 8, 16, 0, 30);
  const afternoon = Date.UTC(2026, 8, 15, 21, 0);

  it('files a coin-started 8:30 PM sleep as the night it is, with no meta at all', () => {
    // the stop used to read the stored word (`sleepKindOf`, removed 2026-09-27): no kind, so a
    // nap. It reads the start now, against the default 07:00–19:30 day
    expect(timerSleepKind({ startedAtMs: evening }, zone)).toBe('NIGHT');
  });

  it('follows a corrected start, whatever the timer was started as', () => {
    // started 7:45 PM (night), corrected to 5:00 PM: the entry is the nap its start says
    expect(timerSleepKind({ startedAtMs: afternoon }, zone)).toBe('NAP');
  });

  it('files a timer stopped after bedtime as the night, though it began in the day (2026-10-07)', () => {
    const own = { wake: '08:00', bed: '21:00' };
    // 8:30 PM to 9:10 AM: still asleep at nine, so the night
    expect(
      timerSleepKind({ startedAtMs: evening }, zone, own, evening + 12 * 3_600_000 + 40 * 60_000),
    ).toBe('NIGHT');
    // stopped at 8:55 PM: the evening nap it began as
    expect(timerSleepKind({ startedAtMs: evening }, zone, own, evening + 25 * 60_000)).toBe('NAP');
  });

  it('reads the household’s own window, not the default', () => {
    // a household whose day ends at 21:00: 8:30 PM is still daytime
    expect(timerSleepKind({ startedAtMs: evening }, zone, { wake: '08:00', bed: '21:00' })).toBe(
      'NAP',
    );
  });
});

/**
 * A PAUSED FEED KEEPS ITS SIDE (feeding C9 / timers 8): `side_started_at` null is the pause, and
 * `active_side` still says which breast Resume goes back to.
 */
describe('pause, resume and switch on a breastfeed', () => {
  const pausedLeft = {
    activeSide: 'LEFT' as const,
    sideStartedAtMs: null,
    leftSeconds: 480,
    rightSeconds: 0,
    meta: { first_side: 'LEFT' },
  };

  it('resumes the side it paused on — left, not the guess "the other side from the first"', () => {
    expect(isPausedFeed(pausedLeft)).toBe(true);
    expect(resumeSide(pausedLeft)).toBe('LEFT');
    // the right, when that is where it paused
    expect(resumeSide({ ...pausedLeft, activeSide: 'RIGHT' })).toBe('RIGHT');
  });

  it('keeps the old guess only for a feed paused before the side was kept', () => {
    expect(resumeSide({ activeSide: null, meta: { first_side: 'LEFT' } })).toBe('RIGHT');
    expect(resumeSide({ activeSide: null, meta: { first_side: 'RIGHT' } })).toBe('LEFT');
  });

  it('draws a paused feed as paused, with no open side, whatever active_side remembers', () => {
    expect(feedCardSides(pausedLeft)).toEqual({ leftMs: 480_000, rightMs: 0, active: null });
    const running = { ...pausedLeft, sideStartedAtMs: T0 };
    expect(feedCardSides(running)).toEqual({
      leftMs: 480_000,
      rightMs: 0,
      active: 'left',
      sideStartedAt: T0,
    });
    // and a paused feed banks nothing more, so the seconds stand still while it is paused
    expect(bankedSides(pausedLeft, T0 + 10 * MIN)).toEqual({ left: 480, right: 0 });
  });

  it('switches to the side the button names: the other one while timing, "left" while paused', () => {
    expect(switchTarget({ activeSide: 'LEFT', sideStartedAtMs: T0 })).toBe('RIGHT');
    expect(switchTarget({ activeSide: 'RIGHT', sideStartedAtMs: T0 })).toBe('LEFT');
    // paused, the card reads "Switch to left" — so that is where it goes
    expect(switchTarget({ activeSide: 'RIGHT', sideStartedAtMs: null })).toBe('LEFT');
  });

  it('pause-resume-finish credits the whole feed to the side the baby stayed on', () => {
    // start left at T0, pause at 8 min, resume 2 min later, finish at 20 min
    const atPause = bankedSides(
      { ...pausedLeft, leftSeconds: 0, sideStartedAtMs: T0 },
      T0 + 8 * MIN,
    );
    expect(atPause).toEqual({ left: 480, right: 0 });
    const resumed = {
      ...pausedLeft,
      activeSide: resumeSide(pausedLeft),
      leftSeconds: atPause.left,
      sideStartedAtMs: T0 + 10 * MIN,
    };
    expect(bankedSides(resumed, T0 + 20 * MIN)).toEqual({ left: 1080, right: 0 });
  });
});

/**
 * "CORRECT THE START TIME" ON A FEED MOVES THE FEED (feeding C10 / timers 9): its minutes are the
 * sides' seconds, so a start moved on its own changed nothing the card or the entry showed.
 */
describe('startCorrection', () => {
  const feed = {
    type: 'breastfeed' as const,
    startedAtMs: T0,
    activeSide: 'LEFT' as const,
    sideStartedAtMs: T0,
    leftSeconds: 0,
    rightSeconds: 0,
    meta: { first_side: 'LEFT' },
  };

  it('moves only the start of a timer whose elapsed IS its start', () => {
    expect(startCorrection({ ...feed, type: 'sleep' }, T0 - 5 * MIN, T0 + MIN)).toEqual({
      startedAtMs: T0 - 5 * MIN,
    });
  });

  it('adds an earlier start to the side the feed started on', () => {
    const c = startCorrection(feed, T0 - 5 * MIN, T0 + 15 * MIN);
    expect(c).toEqual({
      startedAtMs: T0 - 5 * MIN,
      sides: { leftSeconds: 300, rightSeconds: 0, sideStartedAtMs: T0 },
    });
    // the verified case: 15 minutes on the clock, five earlier — the feed is now 20 minutes
    const after = bankedSides({ ...feed, ...c.sides, sideStartedAtMs: T0 }, T0 + 15 * MIN);
    expect(after.left + after.right).toBe(20 * 60);
  });

  it('adds it to the first side even after a switch', () => {
    const switched = {
      ...feed,
      activeSide: 'RIGHT' as const,
      sideStartedAtMs: T0 + 10 * MIN,
      leftSeconds: 600,
    };
    expect(startCorrection(switched, T0 - 2 * MIN, T0 + 12 * MIN).sides).toEqual({
      leftSeconds: 720,
      rightSeconds: 0,
      sideStartedAtMs: T0 + 10 * MIN,
    });
  });

  it('takes a later start off the earliest time: banked first side, then the other, then the open run', () => {
    // L 5 min banked, then R open for 5 min; the feed really began 7 minutes after the tap
    const lr = {
      ...feed,
      activeSide: 'RIGHT' as const,
      sideStartedAtMs: T0 + 5 * MIN,
      leftSeconds: 300,
    };
    expect(startCorrection(lr, T0 + 7 * MIN, T0 + 10 * MIN).sides).toEqual({
      leftSeconds: 0,
      rightSeconds: 0,
      sideStartedAtMs: T0 + 7 * MIN,
    });
    // on its first run the open side itself starts later, never past now
    expect(startCorrection(feed, T0 + 3 * MIN, T0 + 10 * MIN).sides).toEqual({
      leftSeconds: 0,
      rightSeconds: 0,
      sideStartedAtMs: T0 + 3 * MIN,
    });
    expect(startCorrection(feed, T0 + 30 * MIN, T0 + 10 * MIN).sides?.sideStartedAtMs).toBe(
      T0 + 10 * MIN,
    );
  });
});

/*
  A STOPPED PUMP'S STOP IS ITS END (2026-09-25): "Correct the start time" may not move the start
  past it, or the session ends before it begins and the server refuses it for good.
*/
describe('startBeforeStop — a corrected start never passes the stop', () => {
  const stop = T0 + 30 * MIN;

  it('takes any start while the timer is still running', () => {
    expect(startBeforeStop(T0 + 90 * MIN, null)).toBe(true);
  });

  it('takes a start up to the stop, and refuses one after it', () => {
    expect(startBeforeStop(T0, stop)).toBe(true);
    // a session of no length is a session; the server's rule is end >= start
    expect(startBeforeStop(stop, stop)).toBe(true);
    expect(startBeforeStop(stop + MIN, stop)).toBe(false);
  });
});
