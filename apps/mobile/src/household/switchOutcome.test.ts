/**
 * A SECOND FAMILY JOINED WHOSE SWITCH DID NOT LAND (`switchOutcome.ts`; the verification sweep of
 * 2026-10-08): never "You joined" over the family being left; what kept it off screen instead.
 * Where `settleJoin` and `switchHousehold` use it is `switch.scan.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { joinedOffScreenOf, joinedOffScreenSentence } from './switchOutcome';

const clock = () => '2:00 AM';

describe('what a join says when its switch did not land', () => {
  it('says nothing extra once the joined family is on screen: the note does', () => {
    expect(
      joinedOffScreenOf('Lee’s family', 'Dana’s family', { kind: 'switched', name: 'x' }),
    ).toBe(null);
  });

  it('owed: the join stands, and the switcher’s own reason', () => {
    const n = joinedOffScreenOf('Lee’s family', 'Dana’s family', {
      kind: 'owed',
      count: 3,
      name: 'Dana’s family',
    });
    expect(n).toEqual({ kind: 'owed', joined: 'Lee’s family', count: 3, leaving: 'Dana’s family' });
    expect(joinedOffScreenSentence(n!, clock)).toBe(
      'You joined Lee’s family. 3 entries for Dana’s family are still on the way to the server. Switch once they have sent.',
    );
    expect(
      joinedOffScreenSentence({ kind: 'owed', joined: '', count: 1, leaving: '' }, clock),
    ).toBe(
      'You joined the family. 1 entry for this family is still on the way to the server. Switch once it has sent.',
    );
  });

  it('on duty: never switched away from silently, and says until when', () => {
    const n = joinedOffScreenOf('Lee’s family', 'Dana’s family', {
      kind: 'on_duty',
      name: 'Dana’s family',
      fromMs: 0,
      untilMs: 1,
      started: true,
    });
    expect(joinedOffScreenSentence(n!, clock)).toBe(
      'You joined Lee’s family. You’re on for Dana’s family until 2:00 AM, so it stays on screen. Switch from Your families when you’re ready.',
    );
  });

  it('failed: the join stands, and the switcher is the way there', () => {
    for (const out of [{ kind: 'failed' } as const, { kind: 'on_duty_offline', name: '' } as const])
      expect(joinedOffScreenSentence(joinedOffScreenOf('Lee’s family', '', out)!, clock)).toBe(
        'You joined Lee’s family. Switch to it from Your families.',
      );
  });

  it('never a dash in what it says', () => {
    for (const n of [
      { kind: 'owed', joined: 'A', count: 2, leaving: 'B' } as const,
      { kind: 'on_duty', joined: 'A', leaving: 'B', untilMs: 0 } as const,
      { kind: 'failed', joined: 'A' } as const,
    ])
      expect(joinedOffScreenSentence(n, clock)).not.toMatch(/[‐‑‒–—―]| - /);
  });
});
