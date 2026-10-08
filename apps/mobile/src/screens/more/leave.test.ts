import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLOSED_HOUSEHOLD_DAYS } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { JOIN } from '../auth/joinCopy';
import { LEAVE } from './leaveCopy';

/**
 * LEAVING A HOUSEHOLD NOBODY ELSE IS IN (migration 0143; the owner, 2026-09-29): the words, and the
 * wiring of the four screens that carry it — Family's section, the join sheet in a household, the
 * page an unused invite lands on, and Ended — read as source, for the reason
 * `packages/ui/components/interaction.test.ts` records: there is no renderer in this suite. The
 * BEHAVIOR is proved where it is decided: `packages/db/src/integration/leave-alone.test.ts` against
 * a real Postgres, `auth/leave.test.ts` and `scenarios/leave.scenario.test.ts` on the test backend.
 */
const here = dirname(fileURLToPath(import.meta.url));
const flat = (...p: string[]): string =>
  readFileSync(join(here, ...p), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');
const family = flat('FamilyScreen.tsx');
const section = flat('LeaveHouseholdSection.tsx');
const sheet = flat('..', '..', 'sheets', 'JoinCodeSheet.tsx');
const joined = flat('..', 'auth', 'JoinedScreen.tsx');
const ended = flat('..', 'auth', 'EndedScreen.tsx');
const types = flat('..', '..', 'app', 'types.ts');
const seat = flat('LeaveSeatSection.tsx');

/** Every string a table holds, with its functions called on a name, on none, and on a count. */
function words(table: unknown): string[] {
  const out: string[] = [];
  const visit = (v: unknown): void => {
    if (typeof v === 'string') out.push(v);
    else if (typeof v === 'function') {
      const f = v as (...a: unknown[]) => unknown;
      for (const args of [['Sam’s family'], [''], [1], [3], ['October 28']]) {
        try {
          visit(f(...args));
        } catch (e) {
          if (!(e instanceof TypeError)) throw e;
        }
      }
    } else if (typeof v === 'object' && v !== null) Object.values(v).forEach(visit);
  };
  visit(table);
  return out.filter(s => s !== '');
}

describe('the words: what happens, what is kept, and never a dash', () => {
  const all = [
    ...words(LEAVE),
    JOIN.inHousehold.alone('Sam’s family'),
    JOIN.inHousehold.alone(''),
    JOIN.inHousehold.leaveFirst('Sam’s family'),
    JOIN.notUsed.alone('Sam’s family'),
  ];

  it('says no dash anywhere a person reads, spells US English, and names no system', () => {
    expect(all.length).toBeGreaterThan(30);
    for (const s of all) {
      expect(s, s).not.toMatch(/[‐‑‒–—―]| - /);
      for (const uk of ['colour', 'cancelled', 'favourite', 'grey', 'centre', 'analyse'])
        expect(s.toLowerCase(), s).not.toContain(uk);
      expect(s.toLowerCase(), s).not.toMatch(/\b(server|supabase|token|rpc|purge|database)\b/);
    }
  });

  it('promises the window the server keeps: core’s CLOSED_HOUSEHOLD_DAYS, and no other number', () => {
    for (const s of [LEAVE.kept, LEAVE.confirmHint('Sam’s family')])
      expect(s).toContain(`${CLOSED_HOUSEHOLD_DAYS} days`);
    expect(CLOSED_HOUSEHOLD_DAYS).toBe(30);
  });

  it('names the household when it can, and reads as a sentence when it cannot', () => {
    expect(LEAVE.title('Sam’s family')).toBe('Leave Sam’s family?');
    expect(LEAVE.title('  ')).toBe('Leave this household?');
    expect(LEAVE.ended.title('Sam’s family')).toBe('You left Sam’s family');
    expect(LEAVE.ended.restore('')).toBe('Bring back your household');
    expect(JOIN.inHousehold.leaveFirst('')).toBe('Leave your household first');
    expect(LEAVE.unsynced(3)).toMatch(/^3 entries have not synced yet\./);
  });

  it('says the true thing about a store subscription: unchanged, and it goes with them', () => {
    expect(LEAVE.store).toBe(
      'Leaving does not change your Plus subscription. It goes with you to the next household you join.',
    );
    // a destructive button that says what it does, and a way not to
    expect(LEAVE.confirm).toBe('Leave household');
    expect(LEAVE.cancel).toBe('Cancel');
  });
});

describe('Family: the control near the foot of the page, only while nobody else is in it', () => {
  it('is a new section after everything else on the page', () => {
    const at = family.indexOf('<LeaveHouseholdSection');
    expect(family.indexOf('</Screen>', at)).toBeGreaterThan(at);
    expect(family).toContain('members={members}');
    expect(family).toContain('confirmAt={route.params?.confirmLeave ?? null}');
  });

  it('draws Join another household first in its group, a row like its own (2026-09-30)', () => {
    // the owner: "Why join another household is not a button, it just look different"
    const at = family.indexOf('<LeaveHouseholdSection');
    const join = family.indexOf('testID="family.join_other"');
    expect(join).toBeGreaterThan(at);
    expect(family.slice(at, join)).toContain(
      // a list since 0154, so "Start your own family" can follow it in the same group
      'leading={[ <Row key="join" title={JOIN.inHousehold.familyButton} detail={JOIN.inHousehold.familyDetail} icon="link" onPress={() => nav.navigate(\'JoinCode\')}',
    );
    expect(JOIN.inHousehold.familyDetail).toBe('With an invite code or link');
    // never the bare ghost button it was
    expect(family).not.toMatch(/<Button label=\{JOIN\.inHousehold\.familyButton\}/);
    // in the Leave row's own group, before it; a group of its own when there is no Leave row
    expect(section).toContain('<Rows> {leading} <Row title={LEAVE.row}');
    expect(section).toContain('const leadingGroup = leading ? <Rows>{leading}</Rows> : null;');
  });

  it('is drawn only when the live roster is this person alone, and the server counts again', () => {
    expect(section).toContain('const alone = aloneIn(members);');
    expect(section).toContain('if (household === undefined) return leadingGroup;');
    expect(section).toContain('const outcome = await actions.leaveHousehold();');
    expect(section).toContain("if (outcome.kind === 'not_alone') onRefresh();");
  });

  it('says why when the server counted somebody else: the reason stays, the confirmation goes', () => {
    // not alone: the page's own rows (with a caregiver's, a viewer's or a parent's own Leave, and
    // the owner's way to hand the family on, since 2026-10-08), and the refusal's own sentence
    // only after a refusal
    expect(section).toContain(
      'if (!alone) return ( <> {canLeaveSeat(household.role) || mustHandOnFirst(household.role) ? ( <LeaveSeatSection family={household.household_name} role={household.role} members={members} leading={leading} {...(onMakeOwner !== undefined ? { onMakeOwner } : {})} /> ) : ( leadingGroup )} {error === LEAVE.notAlone ? ( <BodySm ink="crit"',
    );
    expect(section).toContain('testID="family.leave.not_alone"');
    expect(section).toContain('{LEAVE.notAlone}');
    expect(section).toContain('if (!alone) setOpen(false);');
    // the not-alone early return comes before the Leave row is drawn
    expect(section.indexOf('if (!alone) return')).toBeLessThan(section.indexOf('<Rows> {leading}'));
  });

  it('is quiet: a row with the crit glyph and words, never the page’s primary button', () => {
    expect(section).toContain('title={LEAVE.row}');
    expect(section).toContain('tint={{ fg: t.color.crit, soft: t.color.surface2 }}');
    expect(section).toContain('accessibilityHint={LEAVE.rowHint}');
    // the only filled button is the confirmation's own, in the danger fill
    expect(section.match(/<Button /g)).toHaveLength(3);
    expect(section).not.toMatch(/variant="primary"/);
  });

  it('confirms with the household’s name, what is kept, the free download, and one destructive button', () => {
    for (const piece of [
      '{LEAVE.title(name)}',
      '{LEAVE.body}',
      '{LEAVE.kept}',
      'label={LEAVE.download}',
      'label={LEAVE.confirm} variant="danger"',
      'accessibilityHint={LEAVE.confirmHint(name)}',
      'label={LEAVE.cancel} variant="ghost"',
    ])
      expect(section, piece).toContain(piece);
    // the download is the free one, the same sheet Account & privacy opens, and it is never gated
    expect(section).toContain(
      '<DownloadSheet visible={downloadOpen} onClose={() => setDownloadOpen(false)} />',
    );
    expect(section).not.toMatch(/openGate|plan\.can|usePlan/);
    // the store line is this person's, asked when the confirmation opens
    expect(section).toContain('.storeSubscription()');
    expect(section).toContain(
      '{store ? <BodySm testID="family.leave.store">{LEAVE.store}</BodySm> : null}',
    );
    // a refusal is said where it was asked, as an alert
    expect(section).toContain('accessibilityRole="alert"');
  });
});

describe('"Leave <name> first", where the second-account workaround used to be the only answer', () => {
  it('the join sheet in a household reads the roster, and offers it only when nobody else is in it', () => {
    expect(sheet).toContain('setAloneHere(aloneIn(members))');
    expect(sheet).toContain('{JOIN.inHousehold.alone(current)}');
    expect(sheet).toContain('<BodySm>{JOIN.inHousehold.workaround}</BodySm>');
    expect(sheet).toContain('label={JOIN.inHousehold.leaveFirst(current)}');
    // down to the Family page under the sheet, never a second Family pushed over it
    expect(sheet).toContain("nav.navigate('Family', { confirmLeave: Date.now() }, { pop: true })");
  });

  it('the page an unused invite lands on does the same, and resets onto Family over Today', () => {
    expect(joined).toContain('setAloneHere(aloneIn(members))');
    expect(joined).toContain('{JOIN.notUsed.alone(joinNote.current)}');
    expect(joined).toContain('<BodySm>{JOIN.inHousehold.workaround}</BodySm>');
    expect(joined).toContain('label={JOIN.inHousehold.leaveFirst(joinNote.current)}');
    expect(joined).toContain(
      "routes: [{ name: 'Tabs' }, { name: 'Family', params: { confirmLeave: Date.now() } }],",
    );
    // an invite to the very household they are in needs no way out of it
    expect(joined).toContain(
      "const leaving = aloneHere && !sameHousehold && (next === null || joinNote.why === 'parent_elsewhere');",
    );
  });

  it('asks Family for a confirmation, never names a household in the route', () => {
    expect(types).toContain('Family: { confirmLeave?: number } | undefined;');
  });
});

describe('Ended, after leaving', () => {
  it('says they left it, and what is kept, when it is the household this phone showed', () => {
    expect(ended).toContain(
      'left !== null && (lastHousehold === null || lastHousehold.id === left.id) ? left : null;',
    );
    expect(ended).toContain('LEAVE.ended.title(leftHere.name)');
    expect(ended).toContain('LEAVE.ended.kept(keptUntilLabel(leftHere.purge_at))');
    // and the ordinary words otherwise, unchanged
    expect(ended).toContain("ENDED.title(lastHousehold?.name ?? '')");
  });

  it('offers "Bring back" until the purge date, between a new code and their own household', () => {
    expect(ended).toContain(
      'const left = restorable(leftHousehold, Date.now()) ? leftHousehold : null;',
    );
    const order = ['ended.join', 'ended.restore', 'ended.start', 'ended.sign_out'].map(id =>
      ended.indexOf(`testID="${id}"`),
    );
    expect(order[1]).toBeGreaterThan(-1);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(ended).toContain('const outcome = await actions.restoreHousehold();');
    expect(ended).toContain('<FormError testID="ended.problem">');
  });

  it('says a household that can no longer come back where the words outlive the page', () => {
    // the phone lets go of it, and the page may go with it (onto setup): a toast, not the page's line
    expect(ended).toContain(
      "if (outcome.kind === 'gone') { toast.show(LEAVE.ended.gone); return; }",
    );
  });
});

describe('a caregiver or a viewer leaves a family others are in (2026-10-08)', () => {
  it('the words: names the family, says their entries stay, never a dash', () => {
    expect(LEAVE.seat.row('Lee’s family')).toBe('Leave Lee’s family');
    expect(LEAVE.seat.row(' ')).toBe('Leave this family');
    expect(LEAVE.seat.title('Lee’s family')).toBe('Leave Lee’s family?');
    expect(LEAVE.seat.body('Lee’s family')).toBe(
      'You will no longer see Lee’s family or get its reminders.',
    );
    expect(LEAVE.seat.kept).toBe(
      'Everything you logged stays in the family’s log. A parent can invite you again.',
    );
    expect(LEAVE.seat.confirm).toBe('Leave family');
    expect(LEAVE.seat.cancel).toBe('Cancel');
    // and the door the limit's sentence points to is real now
    expect(JOIN.refusal.householdLimit).toContain('Leave one first.');
  });

  it('is drawn in Join another household’s group, for every seat in a family others are in', () => {
    expect(section).toContain(
      '<LeaveSeatSection family={household.household_name} role={household.role} members={members} leading={leading}',
    );
    expect(seat).toContain('<Rows> {leading} <Row title={LEAVE.seat.row(family)}');
    expect(seat).toContain('tint={{ fg: t.color.crit, soft: t.color.surface2 }}');
    // never the page's primary button: the leave's one destructive button and Cancel, in the
    // page, and the owner's picks (secondary) and Cancel
    expect(seat.match(/<Button /g)).toHaveLength(4);
    expect(seat).toContain('variant="danger"');
    expect(seat).toContain('label={LEAVE.seat.cancel} variant="ghost"');
    expect(seat).not.toMatch(/variant="primary"/);
  });

  it('confirms with the family’s name and what is kept, then asks the account to leave the seat', () => {
    for (const piece of [
      '{LEAVE.seat.title(family)}',
      '{LEAVE.seat.body(family)}',
      '{LEAVE.seat.kept}',
      'accessibilityHint={LEAVE.seat.confirmHint(family)}',
      'const outcome = await actions.leaveSeat(handBackDuty ? { handBackDuty } : {});',
      "if (outcome.kind === 'left') return;",
      'setError(seatLeaveProblemSentence(outcome));',
      'accessibilityRole="alert"',
    ])
      expect(seat, piece).toContain(piece);
  });
});

describe('a parent leaves too, and the owner hands the family on first (2026-10-08)', () => {
  it('the owner’s row is never a dead control: it opens Family’s own Make owner', () => {
    expect(LEAVE.owner.row).toBe('Make someone else the owner first');
    expect(LEAVE.owner.rowDetail('Lee’s family')).toBe('Then you can leave Lee’s family');
    expect(LEAVE.owner.pick('Sam')).toBe('Make Sam the owner');
    expect(seat).toContain('if (owner) {');
    expect(seat).toContain('const candidates = ownerCandidates(members);');
    // somebody whose seat lasts, and not oneself: a seat that ends is never the owner's (0109)
    expect(seat).toContain('members.filter(m => !m.is_self && m.expires_at === null)');
    expect(seat).toContain('onPress={() => onMakeOwner(m)}');
    expect(seat).toContain('{LEAVE.owner.nobody}');
    // Family hands it the same transfer as the person's card, asked first
    expect(family).toContain('onMakeOwner={m => void makeOwnerToLeave(m)}');
    expect(family).toContain('() => api.transferOwnership(household.household_id, m.user_id),');
    expect(family).toContain('title: LEAVE.owner.confirmTitle(name),');
  });

  it('on for the family: asked in the card, as the switcher asks, and a yes hands it back', () => {
    expect(seat).toContain("if (outcome.kind === 'on_duty') { setOnDuty(outcome.duty); return; }");
    expect(seat).toContain('SWITCH.onDuty.title(');
    expect(seat).toContain('{LEAVE.seat.onDuty.ask}');
    expect(seat).toContain('onPress={() => void leave(onDuty !== null)}');
    expect(LEAVE.seat.onDuty.confirm).toBe('Leave anyway');
    expect(LEAVE.seat.onDuty.body('Lee’s family')).toBe(
      'Reminders for Lee’s family will go back to the other phones.',
    );
  });

  it('says a parent’s store subscription is untouched, only when they have one', () => {
    expect(seat).toContain("if (!open || role !== 'PARENT') return;");
    expect(seat).toContain(
      '{store ? <BodySm testID="family.leave_seat.store">{LEAVE.seat.store}</BodySm> : null}',
    );
    expect(LEAVE.seat.notAllowed).toContain('Make someone else the owner first.');
  });
});
