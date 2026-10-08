/**
 * Redeeming a code (docs/PROMO_CODES.md; the owner, 2026-09-24: "give 1 month free access with
 * purchase, and I would send the code to them by email").
 *
 * The code is the store's, and so is everything it grants: these tests hold the app to handing
 * a code over, never judging one, and never deciding what the household's plan now is.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { planStatusFrom } from '@nibblecue/core';
import { describe, expect, it } from 'vitest';
import { MockBackend } from '../auth/providers/mock';
import { REDEEM } from './copy';
import { MockBillingProvider } from './mock';
import { codeReady, playRedeemUrl, tidyCode } from './redeem';
import type { BillingProvider } from './types';
import { NoStoreBillingProvider, NO_STORE_REASON } from './unavailable';

const HERE = new URL('.', import.meta.url).pathname;
const screen = readFileSync(join(HERE, '..', 'screens', 'account', 'RedeemPanel.tsx'), 'utf8');
const more = readFileSync(join(HERE, '..', 'screens', 'more', 'MoreScreen.tsx'), 'utf8');
const planPage = readFileSync(join(HERE, '..', 'screens', 'account', 'PlanScreen.tsx'), 'utf8');
const panel = readFileSync(join(HERE, 'SubscribePanel.tsx'), 'utf8');
const nav = readFileSync(join(HERE, '..', 'app', 'navigation.tsx'), 'utf8');
/** Comments out and whitespace flattened: the files explain themselves, and a scan reads code. */
const code = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    .replace(/\s+/g, ' ');
const buyer = { userId: 'u1', householdId: 'h1' };

describe('a code, as someone pasted it', () => {
  it('loses the spaces an email brings, and nothing else', () => {
    expect(tidyCode('  ABCD 1234\nEFGH ')).toBe('ABCD1234EFGH');
    expect(tidyCode('spring-promo')).toBe('spring-promo');
  });

  it('is sent to the store only when it could be a code at all', () => {
    expect(codeReady('ABCD1234EFGH')).toBe(true);
    expect(codeReady(' abcd 1234 ')).toBe(true);
    expect(codeReady('')).toBe(false);
    expect(codeReady('abc')).toBe(false);
    expect(codeReady('Thanks so much for the coins, here is my code')).toBe(false);
    expect(codeReady('A'.repeat(65))).toBe(false);
  });

  it('opens Google Play with the code filled in, in the format Google documents', () => {
    expect(playRedeemUrl(' ABCD 1234 ')).toBe('https://play.google.com/redeem?code=ABCD1234');
  });
});

describe('the store judges the code; the device decides nothing', () => {
  it('a build with no store says so, and offers nothing to press', async () => {
    // through the interface, which is how every screen reaches it
    const p: BillingProvider = new NoStoreBillingProvider();
    expect(p.redeemStyle).toBeNull();
    expect(await p.redeem('ABCD1234')).toEqual({ kind: 'unavailable', why: NO_STORE_REASON });
  });

  /**
   * THE MOCK GRANTS WHAT THE OWNER PLANS, WHERE A STORE WOULD: one month, written as a store row
   * that will not renew, into the backend the account is read from. The plan then reads it the
   * way it reads any canceled subscription — Plus until the date, and never "renews".
   */
  it('writes a month that ends by itself into the backend, and returns no tier', async () => {
    const b = new MockBackend();
    const p = new MockBillingProvider(b, () => buyer);
    expect(p.redeemStyle).toBe('field');
    const before = Date.now();
    const out = await p.redeem('ABCD1234EFGH');
    expect(out).toEqual({ kind: 'purchased' });
    expect(Object.keys(out)).toEqual(['kind']);
    const row = b.state.nibble_entitlements[0];
    expect(row).toMatchObject({ user_id: 'u1', household_id: 'h1', source: 'store' });
    expect(row?.status).toBe('CANCELLED_AT_PERIOD_END');
    const days = (Date.parse(row?.current_period_end ?? '') - before) / 86_400_000;
    expect(Math.round(days)).toBe(30);
    expect(planStatusFrom(row ?? null, Date.now())).toBe('CANCELLED_AT_PERIOD_END');
  });

  it('leaves CuddleCue’s preview alone, refuses what cannot be a code, and needs an account', async () => {
    const b = new MockBackend();
    b.state.entitlements.push({
      user_id: 'u1',
      household_id: 'h1',
      source: 'welcome',
      status: 'ACTIVE',
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const p = new MockBillingProvider(b, () => buyer);
    expect(await p.redeem('no')).toEqual({ kind: 'failed', why: 'code not recognized' });
    expect(await p.redeem(null)).toEqual({ kind: 'failed', why: 'code not recognized' });
    expect(b.state.entitlements[0]?.source).toBe('welcome');
    await p.redeem('ABCD1234');
    // NibbleCue Plus is its own row; CuddleCue's preview is untouched
    expect(b.state.entitlements).toHaveLength(1);
    expect(b.state.entitlements[0]?.source).toBe('welcome');
    expect(b.state.nibble_entitlements).toHaveLength(1);
    expect(b.state.nibble_entitlements[0]?.source).toBe('store');
    // a household that already has Plus from the store has nothing for a code to add
    expect(await p.redeem('WXYZ5678')).toEqual({ kind: 'already' });
    const nobody = new MockBillingProvider(new MockBackend(), () => null);
    expect(await nobody.redeem('ABCD1234')).toEqual({ kind: 'failed', why: 'no account' });
  });
});

describe('the page hands the code over and promises nothing about it', () => {
  it('goes through the billing provider, and reads the plan back from the server', () => {
    expect(screen).toContain('billing.redeem(');
    expect(screen).toContain('billing.redeemStyle');
    expect(screen).toContain('testID="redeem.nostore"');
    // no code list, no check of its own, no plan written from here
    expect(screen).not.toMatch(/entitlement|setPlan|PLUS'|tier/);
  });

  /**
   * WHAT A CODE GIVES IS THE OFFER'S (docs/PROMO_CODES.md §2), and it differs by store today: an
   * App Store code can be a month that simply ends; a Google Play code is a trial that renews
   * unless canceled. So no line here says a length, "free", "no card" or "renews", and none
   * carries a price (rule 13).
   */
  it('never says what a code gives, and never a price', () => {
    for (const line of Object.values(REDEEM)) {
      expect(line).not.toMatch(/\$|\d+\s*(day|month|week)|free|no card|renew/i);
    }
  });

  it('names nothing a code came with — the coins are not public yet', () => {
    expect(JSON.stringify(REDEEM)).not.toMatch(/coin|nfc|sticker/i);
    expect(screen).not.toContain('accessoryName');
  });

  /**
   * THE DOOR MOVED (the owner, 2026-09-26: *"more: redeem code shouldnt be here, it should be in
   * profile picture clicked -> plan"*), and then up the page (2026-09-27: *"bring have a code
   * under the plus subscription (so it's at the beginning of the page instead of last)"*). More has
   * no row and the page that row opened is gone; one quiet line under the offer opens the field in
   * place.
   */
  it('has its door right under the offer on the Plan page, and none in More', () => {
    expect(more).not.toContain('more.redeem');
    expect(more).not.toContain("navigate('Redeem')");
    expect(nav).not.toContain('name="Redeem"');
    const plan = code(planPage);
    expect(REDEEM.have).toBe('Have a code?');
    expect(plan).toContain('<Disclosure summary={REDEEM.have}');
    expect(plan).toContain('<RedeemPanel />');
    // under the plans and under the store's own controls, Manage or cancel among them: never
    // between a parent and the way out of a subscription
    expect(plan.indexOf('<SubscribePanel')).toBeGreaterThan(-1);
    expect(plan.indexOf('<Disclosure')).toBeGreaterThan(plan.indexOf('<SubscribePanel'));
    // and above the two lists, not at the foot of the page
    expect(plan.indexOf('</Disclosure>')).toBeLessThan(plan.indexOf('<PlanLists'));
    // and the plans themselves come first, straight under the days left (the owner, 2026-09-27)
    expect(plan.indexOf('<SubscribePanel')).toBeGreaterThan(
      plan.indexOf('testID="plan.status.body"'),
    );
    // and the plan lists under them (`PlanLists`, whose first card is what Plus adds)
    expect(plan.indexOf('<SubscribePanel')).toBeLessThan(plan.indexOf("plus: 'plan.adds'"));
    expect(code(panel).indexOf('<ManageRow')).toBeGreaterThan(-1);
    // opened, the line is scrolled to the top so the field under it is in view, rather than the
    // page to its end, which is the plan lists now
    expect(plan).toContain('codeAt.current = e.nativeEvent.layout.y;');
    expect(plan).toContain('y: Math.max(0, codeAt.current - t.space.lg)');
    expect(plan).not.toContain('scrollToEnd(');
  });

  it('is not on the paywall: that sheet is for the plan that was asked for', () => {
    const gate = readFileSync(join(HERE, '..', 'sheets', 'GateSheet.tsx'), 'utf8');
    expect(gate).not.toContain('RedeemPanel');
  });
});
