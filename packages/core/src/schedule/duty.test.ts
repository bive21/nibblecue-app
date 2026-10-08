/**
 * Who gets the baby's reminders, and who's on — as the scenarios a household actually lives
 * through, not as branches. The server's `app.sync_reminders` (migration 0113) is held to the same
 * table by `packages/db/src/integration/sync-duty.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import {
  DUTY_MAX_MS,
  canBeOn,
  canSplit,
  confirmNeeded,
  confirmedAt,
  defaultSplitAt,
  deliveryFor,
  dutyEndOptions,
  dutyEndsAt,
  dutyFromWire,
  dutyListFromWire,
  dutyListToWire,
  dutyNow,
  dutyProblem,
  dutyToWire,
  dutyWait,
  followsDuty,
  handOver,
  isConfirmed,
  isTonight,
  liveShifts,
  newDutyList,
  routeFor,
  shiftAt,
  withSeen,
  type DeliveryInput,
  type DutyList,
  type DutyShift,
  type ReminderPref,
  type RouteInput,
} from './duty';
import { wallMinutes } from './time';

const TZ = 'America/New_York';
const at = (iso: string): number => Date.parse(iso);
const DANA = 'dana';
const SAM = 'sam';
const NANA = 'nana';
const WINDOW = { wake: '07:00', bed: '19:30' };

/** Dana is on from 10 p.m. until 7 in the morning. */
const NIGHT: DutyShift = {
  userId: DANA,
  fromMs: at('2026-09-23T22:00:00-04:00'),
  untilMs: at('2026-09-24T07:00:00-04:00'),
};
const TWO_AM = at('2026-09-24T02:00:00-04:00');

const OFF: ReminderPref = { enabled: false, sound: true, vibrate: true };
const VIBRATE: ReminderPref = { enabled: true, sound: false, vibrate: true };
const SILENT: ReminderPref = { enabled: true, sound: false, vibrate: false };

const reach = (over: Partial<DeliveryInput>) =>
  deliveryFor({
    activity: 'bottle',
    atMs: TWO_AM,
    audience: [DANA],
    userId: SAM,
    role: 'PARENT',
    pref: undefined,
    shifts: [],
    ...over,
  });

describe('who gets the baby’s reminders when nobody is on', () => {
  it('both parents — the partner who joined later too, whoever wrote the rule', () => {
    expect(reach({ userId: DANA, role: 'OWNER' })).toEqual({
      level: 'sound',
      quietHours: true,
      onShift: null,
    });
    // the rule names only Dana, who made it; Sam is reminded anyway (the repair in rule 1)
    expect(reach({ userId: SAM, role: 'PARENT' })).not.toBeNull();
  });

  it('each at their own level, and not at all when they turned the kind off', () => {
    expect(reach({ pref: VIBRATE })?.level).toBe('vibrate');
    expect(reach({ pref: SILENT })?.level).toBe('silent');
    expect(reach({ pref: OFF })).toBeNull();
  });

  it('never a caregiver — the nanny’s phone does not ring at 2 a.m.', () => {
    expect(reach({ userId: NANA, role: 'CAREGIVER' })).toBeNull();
    expect(
      reach({
        userId: NANA,
        role: 'CAREGIVER',
        pref: { enabled: true, sound: true, vibrate: true },
      }),
    ).toBeNull();
  });

  it('never a view-only member, and never someone who is not in the household', () => {
    expect(reach({ role: 'VIEW_ONLY' })).toBeNull();
    expect(reach({ role: null })).toBeNull();
  });
});

describe('while someone is on', () => {
  it('rings only their phone — everyone else sleeps', () => {
    expect(reach({ userId: DANA, role: 'OWNER', shifts: [NIGHT] })?.onShift).toEqual(NIGHT);
    expect(reach({ userId: SAM, shifts: [NIGHT] })).toBeNull();
  });

  it('at the slot’s own time, whatever their quiet hours, with sound even if they turned it off', () => {
    const d = reach({ userId: DANA, role: 'OWNER', shifts: [NIGHT], pref: OFF });
    expect(d).toEqual({ level: 'sound', quietHours: false, onShift: NIGHT });
    expect(reach({ userId: DANA, shifts: [NIGHT], pref: SILENT })?.level).toBe('sound');
  });

  it('keeps vibration for someone who keeps it on vibrate — the partner asleep beside them', () => {
    expect(reach({ userId: DANA, shifts: [NIGHT], pref: VIBRATE })?.level).toBe('vibrate');
  });

  it('puts a caregiver on too: the night nurse is reminded, both parents are not', () => {
    const nurse: DutyShift = { ...NIGHT, userId: NANA };
    expect(reach({ userId: NANA, role: 'CAREGIVER', shifts: [nurse] })).not.toBeNull();
    expect(reach({ userId: DANA, role: 'OWNER', shifts: [nurse] })).toBeNull();
    expect(reach({ userId: SAM, role: 'PARENT', shifts: [nurse] })).toBeNull();
  });

  it('hands over at the split: Dana until 2, Sam after', () => {
    const split: DutyShift[] = [
      { userId: DANA, fromMs: NIGHT.fromMs, untilMs: TWO_AM },
      { userId: SAM, fromMs: TWO_AM, untilMs: NIGHT.untilMs },
    ];
    const oneAm = at('2026-09-24T01:00:00-04:00');
    const threeAm = at('2026-09-24T03:00:00-04:00');
    expect(reach({ userId: DANA, atMs: oneAm, shifts: split })).not.toBeNull();
    expect(reach({ userId: SAM, atMs: oneAm, shifts: split })).toBeNull();
    expect(reach({ userId: DANA, atMs: threeAm, shifts: split })).toBeNull();
    expect(reach({ userId: SAM, atMs: threeAm, shifts: split })).not.toBeNull();
  });

  it('stops at the end of the shift: the 7:00 feed goes to everyone again', () => {
    expect(reach({ userId: SAM, atMs: NIGHT.untilMs, shifts: [NIGHT] })).not.toBeNull();
  });

  it('never moves a parent’s own reminder: pumping stays with whoever pumps', () => {
    const pump = { activity: 'pump', audience: [SAM], shifts: [NIGHT] };
    expect(reach({ ...pump, userId: SAM })).toEqual({
      level: 'sound',
      quietHours: true,
      onShift: null,
    });
    expect(reach({ ...pump, userId: DANA, role: 'OWNER' })).toBeNull();
  });

  it('reads an unknown or retired module as the baby’s', () => {
    expect(followsDuty('bottle')).toBe(true);
    expect(followsDuty('med')).toBe(true);
    expect(followsDuty('pump')).toBe(false);
    expect(followsDuty('milestone')).toBe(true);
    expect(followsDuty('something-new')).toBe(true);
  });
});

describe('what a shift may be', () => {
  const everyone = new Set([DANA, SAM, NANA]);
  const now = NIGHT.fromMs;

  it('one person, or a night split in two, joined end to start', () => {
    expect(dutyProblem([NIGHT], now, everyone)).toBeNull();
    expect(
      dutyProblem(
        [
          { userId: DANA, fromMs: NIGHT.fromMs, untilMs: TWO_AM },
          { userId: SAM, fromMs: TWO_AM, untilMs: NIGHT.untilMs },
        ],
        now,
        everyone,
      ),
    ).toBeNull();
    expect(dutyProblem([], now, everyone)).toBeNull();
  });

  it('refuses what would be a rota, a gap, a token or a forgotten shift', () => {
    const third = at('2026-09-24T04:00:00-04:00');
    expect(
      dutyProblem(
        [
          { userId: DANA, fromMs: NIGHT.fromMs, untilMs: TWO_AM },
          { userId: SAM, fromMs: TWO_AM, untilMs: third },
          { userId: NANA, fromMs: third, untilMs: NIGHT.untilMs },
        ],
        now,
        everyone,
      ),
    ).toBe('tooMany');
    expect(
      dutyProblem(
        [
          { userId: DANA, fromMs: NIGHT.fromMs, untilMs: TWO_AM },
          { userId: SAM, fromMs: TWO_AM + 60_000, untilMs: NIGHT.untilMs },
        ],
        now,
        everyone,
      ),
    ).toBe('notJoined');
    expect(
      dutyProblem(
        [
          { userId: DANA, fromMs: NIGHT.fromMs, untilMs: TWO_AM },
          { userId: DANA, fromMs: TWO_AM, untilMs: NIGHT.untilMs },
        ],
        now,
        everyone,
      ),
    ).toBe('samePerson');
    expect(dutyProblem([{ ...NIGHT, untilMs: NIGHT.fromMs + 60_000 }], now, everyone)).toBe(
      'tooShort',
    );
    expect(
      dutyProblem([{ ...NIGHT, untilMs: NIGHT.fromMs + DUTY_MAX_MS + 60_000 }], now, everyone),
    ).toBe('tooLong');
    expect(dutyProblem([NIGHT], NIGHT.untilMs, everyone)).toBe('ended');
    expect(dutyProblem([NIGHT], now, new Set([SAM]))).toBe('notEligible');
  });

  it('can be put on by anyone who logs, never by a view-only member', () => {
    expect(canBeOn('OWNER')).toBe(true);
    expect(canBeOn('PARENT')).toBe(true);
    expect(canBeOn('CAREGIVER')).toBe(true);
    expect(canBeOn('VIEW_ONLY')).toBe(false);
    expect(canBeOn(null)).toBe(false);
  });
});

describe('reading the row', () => {
  it('round-trips, forgives a malformed entry, and sorts', () => {
    const split: DutyShift[] = [
      { userId: SAM, fromMs: TWO_AM, untilMs: NIGHT.untilMs },
      { userId: DANA, fromMs: NIGHT.fromMs, untilMs: TWO_AM },
    ];
    const wire = dutyToWire(split);
    expect(dutyFromWire(JSON.stringify([...wire, { user_id: 7 }, 'nonsense']))).toEqual([
      split[1],
      split[0],
    ]);
    expect(dutyFromWire('not json')).toEqual([]);
    expect(dutyFromWire(null)).toEqual([]);
  });

  it('drops ended shifts, and a shift for someone who can no longer be on', () => {
    expect(liveShifts([NIGHT], NIGHT.untilMs)).toEqual([]);
    expect(liveShifts([NIGHT], TWO_AM, new Set([SAM]))).toEqual([]);
    expect(liveShifts([NIGHT], TWO_AM, new Set([DANA]))).toEqual([NIGHT]);
  });

  it('says who is on now, who is next, and when it all ends', () => {
    const split: DutyShift[] = [
      { userId: DANA, fromMs: NIGHT.fromMs, untilMs: TWO_AM },
      { userId: SAM, fromMs: TWO_AM, untilMs: NIGHT.untilMs },
    ];
    const midnight = at('2026-09-24T00:00:00-04:00');
    expect(dutyNow(split, midnight)).toEqual({ current: split[0], next: split[1] });
    expect(dutyNow(split, at('2026-09-24T05:00:00-04:00'))).toEqual({
      current: split[1],
      next: null,
    });
    expect(dutyEndsAt(split, midnight)).toBe(NIGHT.untilMs);
    expect(dutyEndsAt(split, NIGHT.untilMs)).toBeNull();
    expect(shiftAt(split, NIGHT.untilMs)).toBeNull();
  });
});

describe('handing over', () => {
  const midnight = at('2026-09-24T00:00:00-04:00');

  it('gives the rest of the current shift to someone else, from now', () => {
    expect(handOver([NIGHT], SAM, midnight)).toEqual([
      { userId: SAM, fromMs: midnight, untilMs: NIGHT.untilMs },
    ]);
  });

  it('keeps the later half of a split night — and joins the halves when it was already theirs', () => {
    const split: DutyShift[] = [
      { userId: DANA, fromMs: NIGHT.fromMs, untilMs: TWO_AM },
      { userId: SAM, fromMs: TWO_AM, untilMs: NIGHT.untilMs },
    ];
    expect(handOver(split, NANA, midnight)).toEqual([
      { userId: NANA, fromMs: midnight, untilMs: TWO_AM },
      split[1],
    ]);
    expect(handOver(split, SAM, midnight)).toEqual([
      { userId: SAM, fromMs: midnight, untilMs: NIGHT.untilMs },
    ]);
  });

  it('does nothing when nobody is on', () => {
    expect(handOver([], SAM, midnight)).toEqual([]);
  });
});

describe('tonight, and when a shift ends', () => {
  it('is tonight from an hour before bedtime until the morning', () => {
    expect(isTonight(at('2026-09-23T18:29:00-04:00'), WINDOW, TZ)).toBe(false);
    expect(isTonight(at('2026-09-23T18:30:00-04:00'), WINDOW, TZ)).toBe(true);
    expect(isTonight(TWO_AM, WINDOW, TZ)).toBe(true);
    expect(isTonight(at('2026-09-24T07:00:00-04:00'), WINDOW, TZ)).toBe(false);
  });

  it('offers the morning at night, and bedtime by day — with a few hours either way', () => {
    const night = dutyEndOptions(at('2026-09-23T22:00:00-04:00'), WINDOW, TZ);
    expect(night.map(o => o.key)).toEqual(['morning', 'hours']);
    expect(night[0]?.atMs).toBe(NIGHT.untilMs);
    const day = dutyEndOptions(at('2026-09-23T13:00:00-04:00'), WINDOW, TZ);
    expect(day.map(o => o.key)).toEqual(['bedtime', 'hours']);
    expect(day[0]?.atMs).toBe(at('2026-09-23T19:30:00-04:00'));
  });

  it('leaves out an end that is minutes away', () => {
    const late = dutyEndOptions(at('2026-09-24T06:45:00-04:00'), WINDOW, TZ);
    expect(late.map(o => o.key)).toEqual(['hours']);
  });

  it('splits a night on the whole hour nearest its middle', () => {
    expect(canSplit(NIGHT.fromMs, NIGHT.untilMs)).toBe(true);
    expect(canSplit(NIGHT.fromMs, NIGHT.fromMs + 3 * 3_600_000)).toBe(false);
    const split = defaultSplitAt(NIGHT.fromMs, NIGHT.untilMs, TZ);
    // 10 p.m. to 7 a.m. is centred on 2:30; the nearest whole hour is 3 (2:30 rounds up)
    expect(wallMinutes(TZ, split) % 60).toBe(0);
    expect(split).toBe(at('2026-09-24T03:00:00-04:00'));
  });
});

/**
 * TWICE, NEVER MISSED (migration 0115; the handoff audit's H1, H4 and M1). Phones learn a new list
 * only when the app opens on them, so a phone may go quiet for a stretch only once the phone of the
 * person on for it has confirmed the list. Until then the phone that set it keeps ringing.
 */
describe('confirmation: a phone goes quiet only once the person on has it', () => {
  const PARENTS = new Set([DANA, SAM]);
  const at10 = at('2026-09-23T22:00:00-04:00');
  /** Sam puts Dana on for the night, from Sam's phone. Nobody was on before. */
  const samPutsDanaOn = (): DutyList =>
    newDutyList([NIGHT], { rev: 'r1', by: SAM, atMs: at10, replacing: null });
  const route = (list: DutyList, over: Partial<RouteInput>) =>
    routeFor({
      activity: 'bottle',
      atMs: TWO_AM,
      audience: [],
      userId: SAM,
      role: 'PARENT',
      pref: undefined,
      shifts: list.shifts,
      meta: list.meta,
      parents: PARENTS,
      ...over,
    });

  it('keeps the phone that set it ringing — as if on — until the named phone confirms', () => {
    const list = samPutsDanaOn();
    // Sam's phone: Dana's has not confirmed, so Sam's rings at 2:00, through quiet hours, with sound
    expect(route(list, {})).toMatchObject({ level: 'sound', quietHours: false });
    // Dana's phone: she is on, whatever she has confirmed
    expect(route(list, { userId: DANA, role: 'OWNER' })?.quietHours).toBe(false);
    // once Dana's phone confirms, Sam's goes quiet
    const confirmed = withSeen(list, DANA, at10 + 60_000);
    expect(route(confirmed, {})).toBeNull();
    expect(confirmedAt(confirmed.meta, DANA)).toBe(at10 + 60_000);
  });

  it('leaves a third phone on its own settings until the person on confirms — not quiet', () => {
    const list = samPutsDanaOn();
    const nana = route(list, { userId: NANA, role: 'PARENT', pref: VIBRATE });
    expect(nana).toEqual({ level: 'vibrate', quietHours: true, onShift: null });
    expect(route(withSeen(list, DANA, at10), { userId: NANA, role: 'PARENT' })).toBeNull();
  });

  it('needs nothing from anyone when you put yourself on: the writer has confirmed it', () => {
    const mine = newDutyList([NIGHT], { rev: 'r1', by: DANA, atMs: at10, replacing: null });
    expect(isConfirmed(mine.meta, DANA)).toBe(true);
    expect(route(mine, {})).toBeNull();
    expect(dutyWait(mine, SAM, at10, PARENTS)).toEqual({
      unconfirmed: [],
      standingIn: false,
      waitingFor: [],
    });
  });

  it('keeps covering after “End now” at night until the other parent’s phone has the end', () => {
    const mine = newDutyList([NIGHT], { rev: 'r1', by: DANA, atMs: at10, replacing: null });
    const threeAm = at('2026-09-24T03:00:00-04:00');
    const ended = newDutyList([], { rev: 'r2', by: DANA, atMs: threeAm, replacing: mine });
    expect(ended.meta.was).toEqual([NIGHT]);
    const fourAm = at('2026-09-24T04:00:00-04:00');
    // Sam's phone may still think Dana is on, so Dana's keeps ringing through her quiet hours
    expect(route(ended, { userId: DANA, role: 'OWNER', atMs: fourAm, pref: SILENT })).toMatchObject(
      { level: 'sound', quietHours: false },
    );
    expect(dutyWait(ended, DANA, threeAm, PARENTS)).toMatchObject({
      standingIn: true,
      waitingFor: [SAM],
    });
    // Sam's phone confirms the end: Dana's is back on her own settings
    const heard = withSeen(ended, SAM, threeAm + 60_000);
    expect(route(heard, { userId: DANA, role: 'OWNER', atMs: fourAm, pref: SILENT })).toEqual({
      level: 'silent',
      quietHours: true,
      onShift: null,
    });
    // and a phone that holds the ended list is asked to confirm it; the one that ended it is not
    expect(confirmNeeded(ended, SAM, 'PARENT', threeAm)).toBe('parent');
    expect(confirmNeeded(ended, DANA, 'OWNER', threeAm)).toBeNull();
  });

  it('keeps the old person covering when a third person hands their night to someone else', () => {
    const mine = newDutyList([NIGHT], { rev: 'r1', by: DANA, atMs: at10, replacing: null });
    const midnight = at('2026-09-24T00:00:00-04:00');
    const moved = newDutyList(handOver(mine.shifts, SAM, midnight), {
      rev: 'r2',
      by: NANA,
      atMs: midnight,
      replacing: mine,
    });
    // Dana's phone learned of it before Sam's did: Dana keeps covering until Sam confirms
    expect(route(moved, { userId: DANA, role: 'OWNER' })?.quietHours).toBe(false);
    expect(route(moved, { userId: NANA, role: 'CAREGIVER' })?.quietHours).toBe(false);
    expect(route(withSeen(moved, SAM, midnight), { userId: DANA, role: 'OWNER' })).toBeNull();
  });

  it('asks the named phone to confirm, and nobody else — never a caregiver who is not named', () => {
    const list = samPutsDanaOn();
    expect(confirmNeeded(list, DANA, 'OWNER', at10)).toBe('named');
    expect(confirmNeeded(list, SAM, 'PARENT', at10)).toBeNull(); // the writer
    expect(confirmNeeded(list, NANA, 'CAREGIVER', at10)).toBeNull();
    expect(confirmNeeded(withSeen(list, DANA, at10), DANA, 'OWNER', at10)).toBeNull();
    // a list with no record (written before 0115) cannot be confirmed
    expect(confirmNeeded(dutyListFromWire(dutyToWire([NIGHT])), DANA, 'OWNER', at10)).toBeNull();
  });

  it('says whom this phone is waiting for, and that a third phone is not covering', () => {
    const list = samPutsDanaOn();
    expect(dutyWait(list, SAM, at10, PARENTS)).toEqual({
      unconfirmed: [DANA],
      standingIn: true,
      waitingFor: [DANA],
    });
    expect(dutyWait(list, NANA, at10, PARENTS)).toEqual({
      unconfirmed: [DANA],
      standingIn: false,
      waitingFor: [],
    });
  });

  it('decides as before when the list has no record at all (the server’s push, an older phone)', () => {
    const list = samPutsDanaOn();
    expect(
      routeFor({
        activity: 'bottle',
        atMs: TWO_AM,
        audience: [],
        userId: SAM,
        role: 'PARENT',
        pref: undefined,
        shifts: list.shifts,
      }),
    ).toBeNull();
  });

  it('does not count a writer as confirmed when they put themselves on from a phone that cannot ring', () => {
    // Dana takes the night from the sheet with notifications off on her phone
    const mine = newDutyList([NIGHT], {
      rev: 'r1',
      by: DANA,
      atMs: at10,
      replacing: null,
      writerCanRing: false,
    });
    expect(isConfirmed(mine.meta, DANA)).toBe(false);
    expect(confirmedAt(mine.meta, DANA)).toBeNull();
    // Sam's phone keeps its own settings rather than going quiet for a night that rings nowhere
    expect(route(mine, {})).toEqual({ level: 'sound', quietHours: true, onShift: null });
    expect(dutyWait(mine, SAM, at10, PARENTS)).toEqual({
      unconfirmed: [DANA],
      standingIn: false,
      waitingFor: [],
    });
    // her phone is asked to confirm once it can ring, like any phone put on by someone else
    expect(confirmNeeded(mine, DANA, 'OWNER', at10)).toBe('named');
    expect(route(withSeen(mine, DANA, at10 + 60_000), {})).toBeNull();
    // a writer who is not named, or whose phone can ring, has the list by writing it
    const ended = newDutyList([], {
      rev: 'r2',
      by: DANA,
      atMs: TWO_AM,
      replacing: mine,
      writerCanRing: false,
    });
    expect(isConfirmed(ended.meta, DANA)).toBe(true);
    expect(
      isConfirmed(
        newDutyList([NIGHT], { rev: 'r3', by: DANA, atMs: at10, replacing: null }).meta,
        DANA,
      ),
    ).toBe(true);
  });

  it('keeps the phone that was on ringing when its night is taken over by a phone that cannot ring', () => {
    const samsNight = newDutyList([{ ...NIGHT, userId: SAM }], {
      rev: 'r1',
      by: SAM,
      atMs: at10,
      replacing: null,
    });
    const midnight = at('2026-09-24T00:00:00-04:00');
    const taken = newDutyList(handOver(samsNight.shifts, DANA, midnight), {
      rev: 'r2',
      by: DANA,
      atMs: midnight,
      replacing: samsNight,
      writerCanRing: false,
    });
    // Sam's phone keeps the 2 a.m. reminder as if he were still on, until Dana's phone confirms
    expect(route(taken, {})).toMatchObject({ level: 'sound', quietHours: false });
    expect(route(withSeen(taken, DANA, midnight + 60_000), {})).toBeNull();
  });

  it('never moves a parent’s own reminder, whatever is confirmed', () => {
    const list = samPutsDanaOn();
    expect(route(list, { activity: 'pump', audience: [DANA], userId: DANA })).toMatchObject({
      quietHours: true,
    });
    expect(route(list, { activity: 'pump', audience: [DANA] })).toBeNull();
  });
});

describe('the list’s record on the wire (0115)', () => {
  it('round-trips as one more element — which a build from before reads as a skipped shift', () => {
    const list = withSeen(
      newDutyList([NIGHT], { rev: 'r1', by: SAM, atMs: NIGHT.fromMs, replacing: null }),
      DANA,
      NIGHT.fromMs + 60_000,
    );
    const wire = dutyListToWire(list);
    expect(wire).toHaveLength(2);
    expect(dutyFromWire(JSON.stringify(wire))).toEqual([NIGHT]);
    const back = dutyListFromWire(JSON.stringify(wire));
    expect(back.shifts).toEqual([NIGHT]);
    expect(back.meta).toMatchObject({ rev: 'r1', by: SAM, atMs: NIGHT.fromMs });
    expect(back.meta.seen).toEqual({ [SAM]: NIGHT.fromMs, [DANA]: NIGHT.fromMs + 60_000 });
  });

  it('names the list it replaced, and the shifts of it still to run', () => {
    const first = newDutyList([NIGHT], {
      rev: 'r1',
      by: DANA,
      atMs: NIGHT.fromMs,
      replacing: null,
    });
    const second = newDutyList([], { rev: 'r2', by: SAM, atMs: TWO_AM, replacing: first });
    expect(second.meta.base).toBe('r1');
    expect(second.meta.was).toEqual([NIGHT]);
    expect(first.meta.base).toBeNull();
  });

  it('reads a list with no record as set by the row’s own writer, confirmed by nobody else', () => {
    const legacy = dutyListFromWire(dutyToWire([NIGHT]), { by: SAM, atMs: NIGHT.fromMs });
    expect(legacy.meta).toMatchObject({ rev: null, by: SAM, atMs: NIGHT.fromMs, seen: {} });
    expect(isConfirmed(legacy.meta, SAM)).toBe(true);
    expect(isConfirmed(legacy.meta, DANA)).toBe(false);
    expect(dutyListFromWire('not json').shifts).toEqual([]);
  });
});

/**
 * A TEMPORARY SEAT ENDS THE SHIFT WITH IT (the handoff audit's H4): a sitter put on until the
 * morning whose seat ended at eleven kept every parent's phone quiet all night.
 */
describe('someone whose access ends', () => {
  const sitterEnds = at('2026-09-23T23:00:00-04:00');
  const seats = new Map([[NANA, sitterEnds]]);
  const everyone = new Set([DANA, SAM, NANA]);

  it('cannot be on past the end of their seat — the server refuses it too', () => {
    const tillMorning: DutyShift = { ...NIGHT, userId: NANA };
    expect(dutyProblem([tillMorning], NIGHT.fromMs, everyone, seats)).toBe('pastAccess');
    expect(
      dutyProblem([{ ...tillMorning, untilMs: sitterEnds }], NIGHT.fromMs, everyone, seats),
    ).toBeNull();
    // and it is only their seat that ends
    expect(dutyProblem([NIGHT], NIGHT.fromMs, everyone, seats)).toBeNull();
  });

  it('is offered “until their access ends”, and no preset past it', () => {
    const nine = at('2026-09-23T21:00:00-04:00');
    const opts = dutyEndOptions(nine, WINDOW, TZ, sitterEnds);
    expect(opts.map(o => o.key)).toEqual(['access']);
    expect(opts[0]?.atMs).toBe(sitterEnds);
    // a seat that ends after the morning cuts nothing short: offered last, after the presets
    const later = dutyEndOptions(nine, WINDOW, TZ, NIGHT.untilMs + 3_600_000);
    expect(later.map(o => o.key)).toEqual(['morning', 'hours', 'access']);
    // and a seat already over, or ending in minutes, offers nothing of its own
    expect(dutyEndOptions(nine, WINDOW, TZ, nine + 5 * 60_000).map(o => o.key)).toEqual([]);
  });
});
