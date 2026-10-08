import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * `phase: 'ended'` — a caregiver whose evening ran out, or anyone removed, is told so rather
 * than asked for a baby's date of birth (the owner, 2026-09-22). The DECISION and its words are
 * proved in `packages/core/src/accounts/standing.test.ts`; these hold the wiring, for the reason
 * `packages/ui/components/interaction.test.ts` records — no renderer in this suite.
 */
const here = dirname(fileURLToPath(import.meta.url));
const screen = readFileSync(join(here, 'EndedScreen.tsx'), 'utf8');
const context = readFileSync(join(here, '../../auth/AuthContext.tsx'), 'utf8');
const nav = readFileSync(join(here, '../../app/navigation.tsx'), 'utf8');
const flatContext = context.replace(/\s+/g, ' ');

describe('the app can tell a new account from one that lost its household', () => {
  it('writes down the household it is showing, per account', () => {
    expect(context).toContain('const LAST_HOUSEHOLD = (uid: string) => `last_household:${uid}`;');
    expect(flatContext).toContain(
      'await prefsStore.set(LAST_HOUSEHOLD(uid), JSON.stringify(last))',
    );
    // …and reads it at launch, BEFORE the account, so the first phase resolution has it
    expect(flatContext).toContain(
      'const remembered = await prefsStore.get(LAST_HOUSEHOLD(cached.user.id))',
    );
  });

  it('never clears the memory on an empty read — that emptiness is what it explains', () => {
    // the only write is the one that HAS a household; sign-out clears it with the rest
    expect(context.match(/prefsStore\.set\(LAST_HOUSEHOLD/g) ?? []).toHaveLength(1);
    expect(context).not.toContain('prefsStore.remove(LAST_HOUSEHOLD');
    // and the one other write, a leave's mark on the family just left (2026-10-08), writes the
    // memory of a household too: never an empty one
    expect(context.match(/rememberLeaving\(prefsStore, LAST_HOUSEHOLD/g) ?? []).toHaveLength(1);
  });

  it('reads back a leave’s mark, and only a leave’s', () => {
    expect(flatContext).toContain('...(v.left === true ? { left: true } : {}),');
  });

  it('only decides once the account has actually been read', () => {
    // a cold launch with no account yet must not flash this at somebody whose household is
    // about to arrive
    expect(flatContext).toContain(
      "if (account !== null && standingWithNoHousehold(lastHousehold) === 'ended') return 'ended';",
    );
    // and it sits AFTER the ready branch, so a household always wins
    expect(context.indexOf("return 'ready';")).toBeLessThan(context.indexOf("return 'ended';"));
  });
});

describe('what the screen offers', () => {
  it('names the household, and says the same thing when it cannot', () => {
    expect(screen).toContain("ENDED.title(lastHousehold?.name ?? '')");
  });

  it('says "You left <family>" when this account left it itself, and the old words otherwise', () => {
    expect(screen).toContain(
      "const leftSeat = leftHere === null && endedReading(lastHousehold) === 'left';",
    );
    expect(screen).toContain('ENDED.left.title(lastName)');
    expect(screen).toContain('ENDED.left.body');
    expect(screen).toContain('ENDED.left.keptBody(lastName)');
    // the same three ways on, whichever words are said
    expect(screen.match(/testID="ended\.(join|start|sign_out)"/g)).toHaveLength(3);
  });

  it('answers where the entries went before it offers a button', () => {
    expect(screen.indexOf('ENDED.keptTitle')).toBeLessThan(screen.indexOf('ENDED.joinLabel'));
  });

  it('puts a new invite code first: a sitter asked back should not have to sign out', () => {
    const order = ['ended.join', 'ended.start', 'ended.sign_out'];
    const at = order.map(id => screen.indexOf(id));
    expect(at[0]).toBeGreaterThan(-1);
    expect(at).toEqual([...at].sort((a, b) => a - b));
  });

  it('is routed beside onboarding, sharing its doors rather than duplicating them', () => {
    expect(nav).toContain("{phase === 'ended' || phase === 'onboarding' ? (");
    expect(nav).toContain('<Root.Screen name="Ended" component={EndedScreen} />');
    // the setup flow and the code sheet are both reachable from it
    // keyed `setup` since 0154, so the `ready` branch's own setup ("Start your own family") is
    // never this one carried over a phase change
    expect(nav).toContain(
      '<Root.Screen name="Onboarding" navigationKey="setup" component={OnboardingScreen} />',
    );
    expect(nav).toContain('name="JoinCode"');
  });
});
