/**
 * "START YOUR OWN FAMILY" (0154): the part of `AuthContext` that brings the new family on screen
 * (`startedOwnFamily` → `bringOwnFamilyOnScreen`), the mode the screen reads off the phase, and the
 * route that makes the mode reachable. The whole road against the in-app test backend is
 * `scenarios/ownFamily.scenario.test.ts`.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { bringOwnFamilyOnScreen, type FamiliesRead, type SwitchAnswer } from './startFamily';

const here = dirname(fileURLToPath(import.meta.url));
const source = (rel: string): string => readFileSync(join(here, rel), 'utf8');

const READ: FamiliesRead = {
  memberships: [
    { household_id: 'dana', household_name: 'Dana’s family', role: 'CAREGIVER' },
    { household_id: 'nana', household_name: 'Nana’s family', role: 'OWNER' },
  ],
};

const deps = (read: FamiliesRead | null | Error, answer: SwitchAnswer | Error) => {
  const switchTo = vi.fn(async (id: string): Promise<SwitchAnswer> => {
    expect(id).not.toBe('');
    if (answer instanceof Error) throw answer;
    return answer;
  });
  return {
    read: async () => {
      if (read instanceof Error) throw read;
      return read;
    },
    switchTo,
  };
};

describe('the new family comes on screen (bringOwnFamilyOnScreen)', () => {
  it('reads the account, then switches to the family Finish made', async () => {
    const d = deps(READ, { kind: 'switched', name: 'Nana’s family' });
    expect(await bringOwnFamilyOnScreen(d, 'nana')).toEqual({
      kind: 'on_screen',
      name: 'Nana’s family',
    });
    expect(d.switchTo).toHaveBeenCalledWith('nana');
  });

  it('with no id (an earlier Finish whose answer was lost), switches to the family this person owns', async () => {
    const d = deps(READ, { kind: 'switched', name: '' });
    expect(await bringOwnFamilyOnScreen(d, null)).toEqual({
      kind: 'on_screen',
      name: 'Nana’s family',
    });
    expect(d.switchTo).toHaveBeenCalledWith('nana');
  });

  it('changes nothing while the family on screen still owes the server entries', async () => {
    const d = deps(READ, { kind: 'owed', count: 2, name: 'Dana’s family' });
    expect(await bringOwnFamilyOnScreen(d, 'nana')).toEqual({
      kind: 'owed',
      count: 2,
      name: 'Dana’s family',
    });
  });

  it('stays on the family on screen while the person is on for it, and says until when (2026-10-08)', async () => {
    const d = deps(READ, {
      kind: 'on_duty',
      name: 'Dana’s family',
      fromMs: 1_000,
      untilMs: 9_000,
      started: true,
    });
    expect(await bringOwnFamilyOnScreen(d, 'nana')).toEqual({
      kind: 'on_duty',
      name: 'Dana’s family',
      untilMs: 9_000,
    });
    // never handed back from here: only the switcher asks, and only a yes hands it back
    expect(d.switchTo).toHaveBeenCalledWith('nana');
    expect(d.switchTo.mock.calls[0]).toHaveLength(1);
  });

  it('is "not yet" when the read is missing, does not list it, throws, or the switch fails', async () => {
    expect(await bringOwnFamilyOnScreen(deps(null, { kind: 'failed' }), 'nana')).toEqual({
      kind: 'not_yet',
    });
    const without = deps({ memberships: READ.memberships.slice(0, 1) }, { kind: 'failed' });
    expect(await bringOwnFamilyOnScreen(without, 'nana')).toEqual({ kind: 'not_yet' });
    expect(without.switchTo).not.toHaveBeenCalled();
    expect(
      await bringOwnFamilyOnScreen(deps(new Error('offline'), { kind: 'failed' }), 'nana'),
    ).toEqual({ kind: 'not_yet' });
    expect(await bringOwnFamilyOnScreen(deps(READ, { kind: 'failed' }), 'nana')).toEqual({
      kind: 'not_yet',
    });
    expect(await bringOwnFamilyOnScreen(deps(READ, new Error('boom')), 'nana')).toEqual({
      kind: 'not_yet',
    });
    // with no id and no family owned, nothing is switched to
    const none = deps({ memberships: READ.memberships.slice(0, 1) }, { kind: 'failed' });
    expect(await bringOwnFamilyOnScreen(none, null)).toEqual({ kind: 'not_yet' });
    expect(none.switchTo).not.toHaveBeenCalled();
  });
});

describe('the mode, the route and the context, as written', () => {
  const screen = source('../screens/onboarding/OnboardingScreen.tsx');
  const nav = source('../app/navigation.tsx');
  const context = source('./AuthContext.tsx');
  const family = source('../screens/more/FamilyScreen.tsx');

  it('is the phase: setup drawn while `ready` is a family of your own, with its own draft', () => {
    expect(screen).toContain("const own = phase === 'ready';");
    expect(screen).toContain("const scope: DraftScope = own ? 'own' : 'first';");
    expect(screen).toContain('draftFor(prefsStore, uid, newId, scope)');
    // NibbleCue's one-page form saves the draft it filled (`nibbleDraft`) under the same scope
    expect(screen).toContain('saveOnboarding(prefsStore, uid, filled, Date.now, scope)');
  });

  /*
    NibbleCue's onboarding is one page (`OnboardingScreen.tsx`): the only invite door on it is the
    "I have a code" button, and a family of your own draws the page with its chrome, whose back
    leaves for Family (CuddleCue's `onboard.own.not_now`/`cancel` buttons are on its own steps).
  */
  it('never shows the invite door in it, and leaves for Family by the page’s own back', () => {
    expect(screen).toMatch(/\{own \? null : \(\s*<Button\s+label=\{ONBOARD_YOU\.haveCode\}/);
    expect(screen).toContain('testID="onboard.code"');
    expect(screen).toContain('<Screen chrome={own}');
    expect(screen).toContain('if (nav.canGoBack()) nav.goBack();');
  });

  it('is registered in the `ready` branch under a key of its own, and setup’s under another', () => {
    expect(nav).toContain(
      '<Root.Screen name="Onboarding" navigationKey="own" component={OnboardingScreen} />',
    );
    expect(nav).toContain(
      '<Root.Screen name="Onboarding" navigationKey="setup" component={OnboardingScreen} />',
    );
  });

  it('brings the family on screen by the read and the same switch a second join makes', () => {
    expect(context).toContain(
      '{ read: () => refreshAccount(), switchTo: id => switchHousehold(id) }',
    );
    expect(screen).toMatch(
      /if \(own\) \{\s*await actions\.startedOwnFamily\(sent\.kind === 'created' \? sent\.result\.household_id : null\);/,
    );
  });

  it('is offered on Family only when it can work (core `canStartOwnFamily`)', () => {
    expect(family).toContain('...(canStartOwnFamily(account)');
    expect(family).toContain('testID="family.start_own"');
  });
});
