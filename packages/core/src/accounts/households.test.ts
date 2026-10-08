import { HAS_SERVER_MIGRATIONS, serverMigration } from '../testing/serverMigrations';
import { describe, expect, it } from 'vitest';
import {
  canJoinAnother,
  canStartOwnFamily,
  focusAccount,
  hasSeveralHouseholds,
  householdOnScreen,
  MAX_HOUSEHOLDS,
  ownFamilyVerdict,
} from './households';

const account = {
  memberships: [
    { household_id: 'home', household_name: 'Iversen' },
    { household_id: 'sit', household_name: 'Lee' },
  ],
  children: [
    { household_id: 'home', name: 'Ada' },
    { household_id: 'sit', name: 'Mia' },
    { household_id: 'sit', name: 'Max' },
  ],
  modules: [
    { household_id: 'home', module_id: 'sleep' },
    { household_id: 'sit', module_id: 'bottle' },
  ],
  entitlement: { plus: false },
  plans: { home: { plus: false }, sit: { plus: true } },
};

describe('the family on screen', () => {
  it('is the one asked for while the account is in it, else the first listed', () => {
    expect(householdOnScreen(account.memberships, 'sit')).toBe('sit');
    expect(householdOnScreen(account.memberships, 'gone')).toBe('home');
    expect(householdOnScreen(account.memberships, null)).toBe('home');
    expect(householdOnScreen([], 'sit')).toBeNull();
  });

  it('comes first, with only its babies, its modules and its plan', () => {
    const f = focusAccount(account, 'sit');
    expect(f.memberships.map(m => m.household_id)).toEqual(['sit', 'home']);
    expect(f.children.map(c => c.name)).toEqual(['Mia', 'Max']);
    expect(f.modules.map(m => m.module_id)).toEqual(['bottle']);
    expect(f.entitlement).toEqual({ plus: true });
    // and back: the server's order again
    const back = focusAccount(f, 'home');
    expect(back.memberships.map(m => m.household_id)).toEqual(['home', 'sit']);
    expect(back.entitlement).toEqual({ plus: false });
  });

  it('leaves a one-family account exactly as read', () => {
    const one = { ...account, memberships: [account.memberships[0]!], plans: undefined };
    const f = focusAccount(one, null);
    expect(f.memberships).toEqual(one.memberships);
    expect(f.entitlement).toBe(one.entitlement);
    expect(focusAccount({ ...one, memberships: [] }, 'x').children).toHaveLength(3);
  });

  it('reads a family with no plan row as none, and an old cache keeps its own', () => {
    expect(
      focusAccount({ ...account, plans: { home: { plus: true } } }, 'sit').entitlement,
    ).toBeNull();
    const old = { ...account, plans: undefined };
    expect(focusAccount(old, 'sit').entitlement).toBe(account.entitlement);
  });

  it('shows the switcher for two families and offers a join below the limit', () => {
    expect(hasSeveralHouseholds(account)).toBe(true);
    expect(hasSeveralHouseholds({ memberships: [account.memberships[0]!] })).toBe(false);
    expect(hasSeveralHouseholds(null)).toBe(false);
    expect(canJoinAnother(account)).toBe(true);
    const five = { memberships: Array.from({ length: 5 }, (_, i) => ({ household_id: `${i}` })) };
    expect(canJoinAnother(five)).toBe(false);
  });

  it.skipIf(!HAS_SERVER_MIGRATIONS)(
    'holds the same limit the server does (0153 household_limit)',
    () => {
      const sql = serverMigration('0153_several_households.sql');
      expect(sql).toContain(
        `) >= ${MAX_HOUSEHOLDS} then\n    perform app.fail('CC409', 'household_limit');`,
      );
    },
  );

  it.skipIf(!HAS_SERVER_MIGRATIONS)(
    'holds the same limit for a family of your own (0154 household_limit)',
    () => {
      const sql = serverMigration('0154_create_household_beside_others.sql');
      expect(sql).toContain(
        `) >= ${MAX_HOUSEHOLDS} then\n    perform app.fail('CC409', 'household_limit');`,
      );
      expect(sql).toContain("and role in ('OWNER', 'PARENT')");
    },
  );
});

describe('a family of your own (0154)', () => {
  const seat = (role: string, i = 0) => ({ household_id: `h${i}`, role });

  it('is offered to somebody with only a caregiver’s or a viewer’s seats, below the limit', () => {
    expect(ownFamilyVerdict({ memberships: [seat('CAREGIVER')] })).toBe('offered');
    expect(ownFamilyVerdict({ memberships: [seat('CAREGIVER', 0), seat('VIEW_ONLY', 1)] })).toBe(
      'offered',
    );
    expect(canStartOwnFamily({ memberships: [seat('VIEW_ONLY')] })).toBe(true);
    // no family at all is setup's own case, and nothing stops it
    expect(ownFamilyVerdict({ memberships: [] })).toBe('offered');
    expect(ownFamilyVerdict(null)).toBe('offered');
  });

  it('is not offered to a parent anywhere: one family of your own', () => {
    expect(ownFamilyVerdict({ memberships: [seat('OWNER')] })).toBe('parent_elsewhere');
    expect(ownFamilyVerdict({ memberships: [seat('CAREGIVER', 0), seat('PARENT', 1)] })).toBe(
      'parent_elsewhere',
    );
    expect(canStartOwnFamily({ memberships: [seat('PARENT')] })).toBe(false);
  });

  it(`is not offered in ${MAX_HOUSEHOLDS} families already`, () => {
    const full = Array.from({ length: MAX_HOUSEHOLDS }, (_, i) => seat('CAREGIVER', i));
    expect(ownFamilyVerdict({ memberships: full })).toBe('limit');
    expect(canStartOwnFamily({ memberships: full })).toBe(false);
    expect(canStartOwnFamily({ memberships: full.slice(1) })).toBe(true);
  });
});
