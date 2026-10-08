import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ROLE_DETAILS } from '@nibblecue/core';

/**
 * TEMPORARY CAREGIVERS ON THE FAMILY PAGE (the owner, 2026-09-22: *"build the module to give
 * access to temporary caregiver. The list of caregiver currently active need to be shown with
 * it's expiry date"*), and the seat limit the plan matrix already decided.
 *
 * A tripwire over the source, for the reason `packages/ui/components/interaction.test.ts`
 * records: there is no renderer in this suite, and the assertions here are structural. The
 * BEHAVIOR is proved where it is enforced — `packages/db/src/integration/seats.test.ts` against
 * a real Postgres, `auth/providers/mock.test.ts` against the fake server, and
 * `packages/core/src/accounts/seats.test.ts` for the words and the arithmetic.
 */
const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, 'FamilyScreen.tsx'), 'utf8');
const flat = src.replace(/\s+/g, ' ');

describe('the Family page shows who is here now, and until when', () => {
  it('puts the end date beside the person, and says nothing about a permanent member', () => {
    // `seatLabel` returns null for a permanent seat, and the row falls back to the role alone —
    // a "forever" badge on every member would make the temporary one invisible
    expect(flat).toContain('const ends = seatLabel(m.expires_at, now)');
    expect(flat).toContain(
      'detail={ends === null ? roleLabel(m.role) : `${roleLabel(m.role)} · ${ends}`}',
    );
    expect(flat).toContain("badge: { label: 'Temporary', tone: 'warn' as const }");
    // the state is in the words as well as the badge, never in a color alone
    expect(flat).toContain('ends === null ? {} :');
  });

  it('counts down live rather than on a reload', () => {
    // the page already ticks every second for the invite code's countdown; the seat label
    // reads the same `now`, so "3 hours left" becomes "2 hours left" while the page is open
    expect(flat).toContain('setInterval(() => setNow(Date.now()), 1000)');
    expect(flat).toContain('seatLabel(m.expires_at, now)');
  });

  it('explains, in the manage card, that the access ends on its own', () => {
    expect(flat).toContain('family.member.${m.user_id}.ends');
    expect(flat).toContain('Their access ends on its own');
    expect(flat).toContain('Removing them ends it now.');
  });
});

describe('the invite can carry how long they stay', () => {
  it('offers the four lengths from core, and the permanent seat as the default', () => {
    expect(src).toContain('SEAT_DURATIONS');
    expect(flat).toContain('const [seat, setSeat] = useState<SeatChoice>(null)');
    expect(flat).toContain('label={SEAT_UNTIL_OFF}');
    expect(flat).toContain('testID="family.seat.permanent"');
    expect(flat).toContain('testID={`family.seat.${d.hours}`}');
    // the labels are the ones core writes — a length of time in words, never a number of hours
    expect(src).not.toMatch(/label="\d+ hours?"/);
  });

  it('offers a length only for a caregiver, and drops it when the role moves away', () => {
    // the server refuses a timed PARENT or VIEW_ONLY (`create_timed_invite`), so the control
    // is not shown rather than offering a choice that would be turned down
    expect(flat).toContain("const seatOffered = role === 'CAREGIVER'");
    expect(flat).toContain('{seatOffered ? (');
    expect(flat).toContain("if (next !== 'CAREGIVER') setSeat(null)");
  });

  it('keeps the code clock and the seat clock apart', () => {
    // `expires_at` is when the CODE stops working; `seat_hours` is how long the SEAT lasts once
    // it is redeemed. Saying only one of them would mislead a parent who sends a code on Monday
    expect(flat).toContain('testID="family.code.seat"');
    expect(flat).toContain('Once they join, their access lasts');
    expect(flat).toContain('It works once.');
  });

  it('passes the length to the API only when one was chosen', () => {
    expect(flat).toContain('...(choice.seat === null ? [] : [choice.seat])');
  });

  it('makes a new code by itself when the role or length changes (2026-10-08)', () => {
    // only for a code still showing and working, once the choice settles: ten invites an hour
    expect(flat).toContain('invite.role !== role || invite.seat !== seat');
    expect(flat).toContain("void create('CODE', { role, seat })");
    expect(flat).toContain('}, INVITE_REMAKE_MS);');
    expect(flat).toContain('export const INVITE_REMAKE_MS = 700;');
    // a role with no room takes the old code away rather than leaving the wrong key on screen
    expect(flat).toContain('if (!room) { setInvite(null);');
  });
});

/**
 * THE ONE CHOICE ON THIS PAGE THAT HANDS SOMEBODY A KEY. "Pick what they can do first" over three
 * bare words — Parent · Caregiver · View only — asked the person who must not guess to guess.
 */
describe('the invite says what each role can actually do', () => {
  it('draws the chosen role’s own sentence under the pills', () => {
    expect(flat).toContain('{roleDetail(role)}');
    expect(flat).toContain('testID="family.invite.role.detail"');
  });

  it('takes the words from core, so the invite and the spec cannot drift', () => {
    expect(src).toContain('roleDetail');
    expect(ROLE_DETAILS.CAREGIVER.toLowerCase()).toContain('their own');
    // and the page still names each role with the one label, never the enum
    expect(flat).toContain('label={roleLabel(r)}');
  });
});

describe('the free plan holds the two parents, and the control says so before it is tapped', () => {
  it('reads the limit and the feature from the matrix, never a tier name', () => {
    expect(flat).toContain("const limit = plan.limitFor('caregivers')");
    expect(flat).toContain('seatsLeft(parentsIn(members), limit)');
    // caregivers are Plus only (the owner, 2026-09-27): the room depends on the role invited
    expect(flat).toContain(
      "canInviteRole(role, members, { limit, extra: plan.can('caregivers') })",
    );
    // CLAUDE.md §4: no component may read a tier name or a plan status
    expect(src).not.toMatch(/'PLUS'|'FREE'|tier ===/);
  });

  it('locks the control rather than springing a paywall on a filled-in form', () => {
    expect(flat).toContain("if (!room) return shell.openGate('caregivers')");
    expect(flat).toContain("{...(room ? {} : { icon: 'lock' as const })}");
    expect(flat).toContain('testID="family.invite.locked"');
    // and it says what is behind the lock, for the role that is locked, with no dash
    expect(flat).toContain('Caregivers and view only come with Plus, each with their own login.');
    expect(flat).toContain(
      'Both parents are here. Plus adds more people, each with their own login.',
    );
  });

  it('says how many parents can still join', () => {
    expect(flat).toContain('testID="family.seats_left"');
    expect(flat).toContain('can join on the free plan.');
    expect(flat).toContain('Both parents are here. The free plan holds the two of you.');
  });
});

/**
 * THE HANDOFF AUDIT, ON THE FAMILY PAGE (2026-09-24): the other parent was invited as a caregiver by
 * default and lost every reminder (U1); the page that lists the people had no way to "whose phone
 * rings" (U2); and removing someone mid-shift reached this phone's reminders only at the next pull
 * (L4). Since 2026-09-29 the page draws who's on itself, with Take over, rather than a row to the
 * Reminders page (the owner: *"should we also enable it in family since the guide is there?"*).
 */
describe('the Family page and who gets the reminders', () => {
  it('starts an invite on the role the household most likely needs — Parent for the second seat', () => {
    expect(flat).toContain('const role: InviteRole = picked ?? defaultInviteRole(members)');
    expect(flat).not.toContain("useState<InviteRole>('CAREGIVER')");
  });

  it('says, under the pills, that a caregiver is reminded only while on', () => {
    expect(ROLE_DETAILS.CAREGIVER).toContain('reminders only while they’re on');
    expect(flat).toContain('gets reminders only while they’re on');
  });

  it('sends nobody to a Reminders page NibbleCue does not have', () => {
    // CuddleCue draws its who's-on card (`duty/WhoIsOnCard.tsx`) and How handing off works here;
    // NibbleCue has no reminders, so neither is on its Family page, nor a door to Reminders
    expect(flat).not.toContain('WhoIsOnReminders');
    expect(flat).not.toContain("nav.navigate('Reminders')");
    expect(flat).not.toContain('testID="family.reminders"');
  });

  it('pulls at once after a removal or a role change, so the phones follow now', () => {
    const change = flat.slice(
      flat.indexOf('const change = async'),
      flat.indexOf('const secondsLeft'),
    );
    expect(change).toContain('syncRuntime()');
    expect(change).toContain('.pullNow()');
  });
});

/**
 * THE HOUSEHOLD'S NAME, from the page that is titled with it (the owner, 2026-10-04). Tapping the
 * name opens a field; saving goes through `rename_household`, which is the owner's alone. A parent
 * sees the name and is not offered the field, because the server would refuse the write.
 */
describe('the owner can change the household name from Family', () => {
  it('turns the name into a field, and only for the owner', () => {
    expect(flat).toContain('isOwner && !naming && household');
    expect(flat).toContain("titlePressTestID: 'family.name'");
    expect(src).toContain('titlePressLabel: `Household name, ${household.household_name}`');
    expect(flat).toContain('testID="family.name.input"');
    expect(flat).toContain('testID="family.name.save"');
    expect(flat).toContain('testID="family.name.cancel"');
    expect(flat).toContain('label="Household name"');
    expect(flat).toContain('label="Save"');
    expect(flat).toContain('label="Cancel"');
    // the field replaces the heading, where the name they tapped was
    expect(flat).toContain('titleEditor:');
    expect(flat.indexOf('naming && household')).toBeLessThan(flat.indexOf('titleEditor:'));
  });

  it('saves through the same 2 to 60 character rule setup uses, and says so', () => {
    expect(src).toContain('HouseholdNameSchema');
    expect(src).toContain('HOUSEHOLD_NAME_RULE');
    expect(src).toContain('A household name of 2 to 60 characters.');
    expect(flat).toContain('api.renameHousehold(household.household_id, parsed.data)');
    expect(src).toContain('Only the owner can change the household name.');
    expect(src).toContain('Household name saved.');
    expect(src).toContain('Could not save the name. Check your connection, then try again.');
    // the other phones, and this phone's mirror, follow the save rather than the next pull
    const save = src.slice(src.indexOf('const saveName'), src.indexOf('const secondsLeft'));
    expect(save).toContain('update households set name = ? where id = ?');
    expect(save).toContain('actions.refreshAccount()');
    expect(save).toContain('.pullNow()');
  });
});
