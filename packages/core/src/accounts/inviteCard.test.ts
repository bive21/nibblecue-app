/**
 * Log together, the card for a parent who is alone (docs/SHARED_CARE.md §6). Most of these assert
 * that nothing shows, which is the point: every rule here is one more reason to stay quiet, and the
 * first test shows the card once, so the rest of them mean something.
 */
import { describe, expect, it } from 'vitest';
import { DAYTIME } from '../today/daytime';
import {
  growthAskedSince,
  householdCompany,
  INVITE_CARD_ANSWERS,
  INVITE_CARD_RULES,
  inviteCardEnded,
  inviteCardMayRise,
  inviteCardOwed,
  inviteCardShown,
  keepInviteAnswer,
  newerInviteRecord,
  readInviteCardRecord,
  type HouseholdSeat,
  type InviteCardFacts,
  type InviteCardMoment,
  type InviteCardRecord,
  type InviteCardShowing,
} from './inviteCard';

const DAY = 86_400_000;
/** 2 p.m. UTC on a Monday; `DAY_START` is that day's midnight, standing in for the phone's own. */
const NOW = Date.UTC(2026, 8, 28, 14, 0);
const DAY_START = Date.UTC(2026, 8, 28, 0, 0);
const ME = 'u-me';

const seat = (over: Partial<HouseholdSeat> & Pick<HouseholdSeat, 'userId'>): HouseholdSeat => ({
  role: 'PARENT',
  removedAt: null,
  expiresAt: null,
  ...over,
});

/** A parent alone in a household three weeks old, on their fifth launch, who never answered. */
const owedFacts = (over: Partial<InviteCardFacts> = {}): InviteCardFacts => ({
  decides: true,
  company: { selfRole: 'OWNER', others: 0, formerParents: 0 },
  record: null,
  session: 5,
  arrivedMs: NOW - 21 * DAY,
  nowMs: NOW,
  phoneDayStartMs: DAY_START,
  ...over,
});

const quiet = (over: Partial<InviteCardMoment> = {}): InviteCardMoment => ({
  hour: 14,
  night: false,
  busy: false,
  slotFree: true,
  growthAskedToday: false,
  ...over,
});

const answered = (answer: InviteCardRecord['answer'], atMs: number): InviteCardRecord => ({
  answer,
  atMs,
});

describe('who the card is for', () => {
  it('is owed to a parent alone in the household, which makes the rest of these mean something', () => {
    expect(inviteCardOwed(owedFacts())).toEqual({ owed: true });
    expect(
      inviteCardOwed(owedFacts({ company: { selfRole: 'PARENT', others: 0, formerParents: 0 } })),
    ).toEqual({ owed: true });
  });

  it('goes only to the people who may invite a parent: the owner or a parent', () => {
    expect(inviteCardOwed(owedFacts({ decides: false }))).toEqual({
      owed: false,
      because: 'not a parent',
    });
    // the mirror's role is pulled every pass; the account's is read once a launch (M6)
    for (const role of ['CAREGIVER', 'VIEW_ONLY'] as const) {
      expect(
        inviteCardOwed(owedFacts({ company: { selfRole: role, others: 0, formerParents: 0 } })),
      ).toEqual({
        owed: false,
        because: 'not a parent here',
      });
    }
  });

  it('says nothing until the member list has been read, and this person is in it', () => {
    expect(inviteCardOwed(owedFacts({ company: null }))).toEqual({
      owed: false,
      because: 'members not read',
    });
    expect(
      inviteCardOwed(owedFacts({ company: { selfRole: null, others: 0, formerParents: 0 } })),
    ).toEqual({
      owed: false,
      because: 'members not read',
    });
  });

  it('is never shown while anyone else is in the household, whatever their role', () => {
    expect(
      inviteCardOwed(owedFacts({ company: { selfRole: 'OWNER', others: 1, formerParents: 0 } })),
    ).toEqual({
      owed: false,
      because: 'not alone',
    });
  });

  it('is never shown to a household a parent has left', () => {
    expect(
      inviteCardOwed(owedFacts({ company: { selfRole: 'OWNER', others: 0, formerParents: 1 } })),
    ).toEqual({
      owed: false,
      because: 'a parent was here',
    });
  });
});

describe('who counts as someone else (the local mirror of household_members)', () => {
  it('counts every other current member, of any role', () => {
    const seats = [
      seat({ userId: ME, role: 'OWNER' }),
      seat({ userId: 'u-2', role: 'PARENT' }),
      seat({ userId: 'u-3', role: 'CAREGIVER' }),
      seat({ userId: 'u-4', role: 'VIEW_ONLY' }),
    ];
    expect(householdCompany(seats, ME, NOW)).toEqual({
      selfRole: 'OWNER',
      others: 3,
      formerParents: 0,
    });
  });

  it('is alone with only its own row', () => {
    expect(householdCompany([seat({ userId: ME, role: 'OWNER' })], ME, NOW)).toEqual({
      selfRole: 'OWNER',
      others: 0,
      formerParents: 0,
    });
  });

  it('leaves out a seat that has ended: the babysitter’s evening is over', () => {
    const seats = [
      seat({ userId: ME, role: 'OWNER' }),
      seat({
        userId: 'sitter',
        role: 'CAREGIVER',
        expiresAt: new Date(NOW - 60_000).toISOString(),
      }),
    ];
    expect(householdCompany(seats, ME, NOW).others).toBe(0);
    // the same seat an hour earlier, still running, is someone
    expect(householdCompany(seats, ME, NOW - 2 * 3_600_000).others).toBe(1);
    // and one that ends exactly now has ended
    const atNow = [
      seat({ userId: 'sitter', role: 'CAREGIVER', expiresAt: new Date(NOW).toISOString() }),
    ];
    expect(householdCompany(atNow, ME, NOW).others).toBe(0);
  });

  it('counts a seat whose end does not read as still running, which shows nothing', () => {
    const seats = [seat({ userId: 'sitter', role: 'CAREGIVER', expiresAt: 'not a date' })];
    expect(householdCompany(seats, ME, NOW).others).toBe(1);
  });

  it('keeps a removed member out of the count, and remembers a parent who left', () => {
    const left = new Date(NOW - 5 * DAY).toISOString();
    const seats = [
      seat({ userId: ME, role: 'PARENT' }),
      seat({ userId: 'u-owner', role: 'OWNER', removedAt: left }),
      seat({ userId: 'u-nanny', role: 'CAREGIVER', removedAt: left }),
    ];
    expect(householdCompany(seats, ME, NOW)).toEqual({
      selfRole: 'PARENT',
      others: 0,
      formerParents: 1,
    });
  });

  it('has no role for this person until their own row is in, or once it is removed', () => {
    expect(householdCompany([], ME, NOW).selfRole).toBeNull();
    expect(householdCompany([seat({ userId: 'u-2' })], ME, NOW)).toEqual({
      selfRole: null,
      others: 1,
      formerParents: 0,
    });
    const gone = [seat({ userId: ME, removedAt: new Date(NOW).toISOString() })];
    expect(householdCompany(gone, ME, NOW).selfRole).toBeNull();
  });
});

describe('what ends it and what rests it', () => {
  it('ends for good on Just me: a single parent is never asked again', () => {
    for (const later of [0, 31 * DAY, 365 * DAY]) {
      expect(
        inviteCardOwed(owedFacts({ record: answered('JUST_ME', NOW - later), nowMs: NOW })),
      ).toEqual({
        owed: false,
        because: 'just me',
      });
    }
  });

  it('ends for good once an invite was made on this phone', () => {
    expect(inviteCardOwed(owedFacts({ record: answered('INVITED', NOW - 400 * DAY) }))).toEqual({
      owed: false,
      because: 'invited',
    });
  });

  it('rests for a month on Not now, and comes back after it', () => {
    expect(INVITE_CARD_RULES.notNowRestDays).toBe(30);
    for (const days of [0, 1, 15, 29.9]) {
      expect(
        inviteCardOwed(owedFacts({ record: answered('NOT_NOW', NOW - days * DAY) })),
        `${days} days`,
      ).toEqual({
        owed: false,
        because: 'resting',
      });
    }
    expect(inviteCardOwed(owedFacts({ record: answered('NOT_NOW', NOW - 30 * DAY) }))).toEqual({
      owed: true,
    });
    // a clock that moved back under a Not now rests it longer, never shorter
    expect(inviteCardOwed(owedFacts({ record: answered('NOT_NOW', NOW + DAY) }))).toEqual({
      owed: false,
      because: 'resting',
    });
  });

  it('steps aside for the rest of the day once Invite has opened Family, and is back tomorrow', () => {
    expect(inviteCardOwed(owedFacts({ record: answered('OPENED', DAY_START + 60_000) }))).toEqual({
      owed: false,
      because: 'opened today',
    });
    expect(inviteCardOwed(owedFacts({ record: answered('OPENED', DAY_START - 60_000) }))).toEqual({
      owed: true,
    });
  });

  it('knows which answers end it', () => {
    expect(inviteCardEnded(null)).toBe(false);
    expect(INVITE_CARD_ANSWERS.filter(a => inviteCardEnded(answered(a, NOW)))).toEqual([
      'JUST_ME',
      'INVITED',
    ]);
  });

  it('never lets a later answer bring back a card that was ended', () => {
    const ended = answered('JUST_ME', NOW - DAY);
    expect(keepInviteAnswer(ended, answered('NOT_NOW', NOW))).toBe(ended);
    expect(keepInviteAnswer(ended, answered('OPENED', NOW))).toBe(ended);
    // an invite made after Just me is an answer that ends it too, and it is kept
    expect(keepInviteAnswer(ended, answered('INVITED', NOW))).toEqual(answered('INVITED', NOW));
    expect(keepInviteAnswer(null, answered('NOT_NOW', NOW))).toEqual(answered('NOT_NOW', NOW));
    expect(keepInviteAnswer(answered('NOT_NOW', NOW - DAY), answered('OPENED', NOW))).toEqual(
      answered('OPENED', NOW),
    );
  });

  it('reconciles the copy in memory with a slower read: an ending answer, then the later one', () => {
    const opened = answered('OPENED', NOW);
    // the tap is in memory, the read that set off before it was written finds nothing
    expect(newerInviteRecord(opened, null)).toBe(opened);
    expect(newerInviteRecord(null, opened)).toBe(opened);
    // Family's invite, written while the card held its tap
    expect(newerInviteRecord(opened, answered('INVITED', NOW - 1))).toEqual(
      answered('INVITED', NOW - 1),
    );
    expect(newerInviteRecord(answered('JUST_ME', NOW - DAY), opened)).toEqual(
      answered('JUST_ME', NOW - DAY),
    );
    expect(newerInviteRecord(answered('NOT_NOW', NOW - DAY), opened)).toBe(opened);
    expect(newerInviteRecord(opened, answered('NOT_NOW', NOW - DAY))).toBe(opened);
    expect(newerInviteRecord(null, null)).toBeNull();
  });
});

describe('the answer, as the phone kept it', () => {
  it('reads back what was written', () => {
    for (const answer of INVITE_CARD_ANSWERS) {
      expect(readInviteCardRecord(JSON.stringify({ answer, atMs: NOW }))).toEqual({
        answer,
        atMs: NOW,
      });
    }
  });

  it('reads nothing stored as no answer', () => {
    expect(readInviteCardRecord(null)).toBeNull();
  });

  it('reads anything it cannot as an answer that ends it: never an extra ask', () => {
    for (const raw of [
      '{not json',
      'null',
      '"JUST_ME"',
      '{"answer":"MAYBE","atMs":1}',
      '{"answer":"NOT_NOW"}',
    ]) {
      const r = readInviteCardRecord(raw);
      expect(inviteCardEnded(r), raw).toBe(true);
    }
  });
});

describe('never in the first session, never on the first day', () => {
  it('says nothing in the launch counted first on this phone', () => {
    expect(inviteCardOwed(owedFacts({ session: 1 }))).toEqual({
      owed: false,
      because: 'first session',
    });
    expect(inviteCardOwed(owedFacts({ session: 2 }))).toEqual({ owed: true });
  });

  it('waits a whole day from the day this person arrived', () => {
    for (const hours of [0, 1, 12, 23.9]) {
      expect(
        inviteCardOwed(owedFacts({ arrivedMs: NOW - hours * 3_600_000 })),
        `${hours} h`,
      ).toEqual({
        owed: false,
        because: 'first day',
      });
    }
    expect(inviteCardOwed(owedFacts({ arrivedMs: NOW - DAY }))).toEqual({ owed: true });
    // an account whose arrival is not known yet reads as new this minute (`arrivedMs`): nothing
    expect(inviteCardOwed(owedFacts({ arrivedMs: NOW }))).toEqual({
      owed: false,
      because: 'first day',
    });
  });

  it('is not only for week one: owed a year on, as the owner asked', () => {
    expect(inviteCardOwed(owedFacts({ arrivedMs: NOW - 365 * DAY }))).toEqual({ owed: true });
  });
});

describe('when it may rise', () => {
  it('rises in a quiet daytime moment with the slot free', () => {
    expect(inviteCardMayRise(quiet())).toBe(true);
  });

  it('keeps the phone’s daytime, core’s one pair of hours', () => {
    const hours = Array.from({ length: 24 }, (_, h) => h).filter(h =>
      inviteCardMayRise(quiet({ hour: h })),
    );
    expect(hours[0]).toBe(DAYTIME.fromHour);
    expect(hours.at(-1)).toBe(DAYTIME.untilHour - 1);
    expect(hours).toHaveLength(DAYTIME.untilHour - DAYTIME.fromHour);
    for (const night of [0, 3, 6, 7, 21, 23])
      expect(inviteCardMayRise(quiet({ hour: night })), `${night}`).toBe(false);
  });

  it('never rises in Night, while anything is going on, or over a higher card', () => {
    expect(inviteCardMayRise(quiet({ night: true }))).toBe(false);
    expect(inviteCardMayRise(quiet({ busy: true }))).toBe(false);
    expect(inviteCardMayRise(quiet({ slotFree: false }))).toBe(false);
  });

  it('never rises on a day a growth prompt already asked', () => {
    expect(inviteCardMayRise(quiet({ growthAskedToday: true }))).toBe(false);
    const asked = [{ event: 'IMPRESSION' as const, atMs: DAY_START + 3_600_000 }];
    expect(growthAskedSince(asked, DAY_START)).toBe(true);
    // yesterday's ask is yesterday's
    expect(
      growthAskedSince([{ event: 'IMPRESSION' as const, atMs: DAY_START - 1 }], DAY_START),
    ).toBe(false);
    // what the platform did with an ask is not another ask
    expect(growthAskedSince([{ event: 'PLATFORM_SHOWN' as const, atMs: NOW }], DAY_START)).toBe(
      false,
    );
    expect(growthAskedSince([], DAY_START)).toBe(false);
  });
});

describe('up, or not', () => {
  const at = (over: Partial<InviteCardShowing> = {}): boolean =>
    inviteCardShown({
      wasUp: false,
      arriving: true,
      owed: true,
      may: true,
      awake: true,
      slotFree: true,
      ...over,
    });

  it('rises as Today comes to the front, when it is owed and may', () => {
    expect(at()).toBe(true);
    expect(at({ owed: false })).toBe(false);
    expect(at({ may: false })).toBe(false);
  });

  it('never rises in the middle of a visit, where it would move the Log tiles under a thumb', () => {
    expect(at({ arriving: false })).toBe(false);
  });

  it('stays for the visit once up, whatever starts meanwhile', () => {
    // a timer started, a sheet opened, nine o'clock came: `may` is false and the card stays
    expect(at({ wasUp: true, arriving: false, may: false })).toBe(true);
  });

  it('goes when it is answered, when a higher card takes the slot, and when Today is left', () => {
    expect(at({ wasUp: true, arriving: false, owed: false })).toBe(false);
    expect(at({ wasUp: true, arriving: false, slotFree: false })).toBe(false);
    expect(at({ wasUp: true, arriving: false, awake: false })).toBe(false);
  });
});
