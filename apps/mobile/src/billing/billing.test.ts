/**
 * What the subscribe flow must never do, asserted.
 *
 * The three that matter are all CLAUDE.md rules rather than preferences, and each is checked by
 * showing that the WRONG thing does not happen rather than that the right one does: a mock
 * purchase does not flip a tier by itself, no string in the copy carries an amount, and backing
 * out of the store says nothing at all.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PACKAGES, trialDays } from '@nibblecue/core';
import { MockBackend } from '../auth/providers/mock';
import { MockBillingProvider } from './mock';
import { NoStoreBillingProvider, NO_STORE_REASON } from './unavailable';
import { BILLING } from './copy';

const HERE = new URL('.', import.meta.url).pathname;
const src = (f: string) => readFileSync(join(HERE, f), 'utf8');
/** A file's own explanation of a rule must not be mistaken for a breach of it. */
const withoutComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

const buyer = { userId: 'u1', householdId: 'h1' };

async function backendWithAccount(): Promise<MockBackend> {
  const b = new MockBackend();
  return b;
}

describe('the store owns entitlement — the device never decides', () => {
  it('writes a row the accounts API reads, rather than returning a tier', async () => {
    const b = await backendWithAccount();
    const p = new MockBillingProvider(b, () => buyer);
    const first = PACKAGES[0]!;
    const out = await p.purchase(first.product_id);
    expect(out).toEqual({ kind: 'purchased' });
    // what changed is the backend's row; nothing in the outcome names a tier or a plan
    expect(Object.keys(out)).toEqual(['kind']);
    expect(b.state.entitlements).toHaveLength(0);
    expect(b.state.nibble_entitlements).toHaveLength(1);
    expect(b.state.nibble_entitlements[0]).toMatchObject({
      user_id: 'u1',
      household_id: 'h1',
      source: 'store',
      status: 'ACTIVE',
    });
  });

  it('writes NibbleCue Plus as its own row, leaving CuddleCue’s plan and preview untouched', async () => {
    const b = await backendWithAccount();
    b.state.entitlements.push({
      user_id: 'u1',
      household_id: 'h1',
      source: 'welcome',
      status: 'ACTIVE',
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const p = new MockBillingProvider(b, () => buyer);
    await p.purchase(PACKAGES[0]!.product_id);
    // CuddleCue's row is exactly as it was: a NibbleCue purchase is never CuddleCue Plus
    expect(b.state.entitlements).toHaveLength(1);
    expect(b.state.entitlements[0]?.source).toBe('welcome');
    expect(b.state.nibble_entitlements).toHaveLength(1);
    expect(b.state.nibble_entitlements[0]?.source).toBe('store');
  });

  it('refuses with no account rather than inventing a row', async () => {
    const b = await backendWithAccount();
    const p = new MockBillingProvider(b, () => null);
    expect(await p.purchase(PACKAGES[0]!.product_id)).toEqual({
      kind: 'failed',
      why: 'no account',
    });
    expect(b.state.nibble_entitlements).toHaveLength(0);
  });

  it('refuses an unknown product', async () => {
    const p = new MockBillingProvider(await backendWithAccount(), () => buyer);
    expect((await p.purchase('not_a_product')).kind).toBe('failed');
  });
});

describe('restore answers honestly, and "nothing" is not a failure', () => {
  it('finds nothing before a purchase and the purchase after it', async () => {
    const b = await backendWithAccount();
    const p = new MockBillingProvider(b, () => buyer);
    expect(await p.restore()).toEqual({ kind: 'nothing' });
    await p.purchase(PACKAGES[0]!.product_id);
    expect(await p.restore()).toEqual({ kind: 'already' });
  });

  it('does not treat the welcome preview as a purchase to restore', async () => {
    const b = await backendWithAccount();
    b.state.entitlements.push({
      user_id: 'u1',
      household_id: 'h1',
      source: 'welcome',
      status: 'ACTIVE',
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const p = new MockBillingProvider(b, () => buyer);
    expect(await p.restore()).toEqual({ kind: 'nothing' });
  });

  it('a second purchase is `already` rather than a second row', async () => {
    const b = await backendWithAccount();
    const p = new MockBillingProvider(b, () => buyer);
    await p.purchase(PACKAGES[0]!.product_id);
    expect(await p.purchase(PACKAGES[1]!.product_id)).toEqual({ kind: 'already' });
    expect(b.state.nibble_entitlements).toHaveLength(1);
  });
});

describe('a build with no store sells nothing, loudly', () => {
  it('reports unavailable on every call and hides the controls', async () => {
    const p = new NoStoreBillingProvider();
    expect(p.canSell).toBe(false);
    expect(await p.products()).toEqual([]);
    expect(await p.purchase()).toEqual({ kind: 'unavailable', why: NO_STORE_REASON });
    expect(await p.restore()).toEqual({ kind: 'unavailable', why: NO_STORE_REASON });
    expect(p.manageUrl()).toBeNull();
    // it does not claim its figures are targets, because it reports no figures at all
    expect(p.figuresAreTargets).toBe(false);
  });
});

describe('the products come from the config, and the mock admits they are targets', () => {
  it('offers both packages with the config’s own preselection', async () => {
    const p = new MockBillingProvider(await backendWithAccount(), () => buyer);
    const list = await p.products();
    expect(list).toHaveLength(PACKAGES.length);
    expect(list.filter(x => x.preselected)).toHaveLength(1);
    expect(list.map(x => x.period).sort()).toEqual(['MONTH', 'YEAR']);
    expect(p.figuresAreTargets).toBe(true);
  });

  it('formats a figure with Intl rather than a template, so cents are not lost', async () => {
    const p = new MockBillingProvider(await backendWithAccount(), () => buyer);
    const list = await p.products();
    for (const x of list) expect(x.priceLabel).toMatch(/^\$\d+\.\d{2}$/);
  });

  it('never divides a price to make a per-month figure', async () => {
    // the field is null unless the CONFIG states one; nothing here computes it
    const p = new MockBillingProvider(await backendWithAccount(), () => buyer);
    const list = await p.products();
    for (const x of list) {
      const pack = PACKAGES.find(k => k.product_id === x.id)!;
      expect(x.perMonthLabel === null).toBe(pack.effective_monthly_usd === null);
    }
  });

  it('reads the trial as whole days, and refuses a form it has not been taught', () => {
    expect(trialDays('P14D')).toBe(14);
    expect(trialDays('P1M')).toBeNull();
    expect(trialDays(null)).toBeNull();
    expect(trialDays('')).toBeNull();
  });
});

describe('no price is ever written into the app', () => {
  it('holds no amount in any copy string', () => {
    const text = withoutComments(src('copy.ts'));
    expect(text).not.toMatch(/\$\s?\d/);
    expect(text).not.toMatch(/\b\d+\.\d{2}\b/);
    expect(text).not.toMatch(/\b(6\.99|59)\b/);
  });

  it('holds no amount in either screen that sells', () => {
    for (const f of ['SubscribePanel.tsx']) {
      const text = withoutComments(src(f));
      expect({ f, hit: /\$\s?\d/.test(text) }).toEqual({ f, hit: false });
    }
  });

  it('draws an introductory offer from the product’s store strings, before the regular lines', () => {
    // docs/SUBSCRIPTIONS.md §3c. The renewal line and a per-month figure describe the regular
    // price alone; beside an offer they would read as its terms, so the offer's line comes first
    const flat = withoutComments(src('SubscribePanel.tsx')).replace(/\s+/g, ' ');
    const free = flat.indexOf('BILLING.secondMonthFree(intro.thenLabel, periodLabel(product))');
    const stretch = flat.indexOf(
      'BILLING.introOffer(intro.months, intro.priceLabel, intro.thenLabel, periodLabel(product))',
    );
    const offer = flat.indexOf('introLine(product.introOffer, product)');
    const perMonth = flat.indexOf('BILLING.perMonthEquivalent(product.perMonthLabel)');
    expect(free).toBeGreaterThan(-1);
    expect(stretch).toBeGreaterThan(-1);
    expect(offer).toBeGreaterThan(-1);
    expect(perMonth, 'the per-month line is the fallback after the offer').toBeGreaterThan(offer);
  });

  it('says nothing at all when a parent backs out of the store', () => {
    // `cancelled` deliberately has no sentence in the copy; the panel maps it to null
    const panel = withoutComments(src('SubscribePanel.tsx'));
    expect(panel).toContain("case 'cancelled':");
    expect(panel).toContain('return null;');
  });
});

/*
  THE PLAN PAGE OFFERS NOTHING TO SOMEONE WHO DOES NOT DECIDE (the owner, 2026-09-28, of "hide the
  plans from caregivers on the Plan page, keeping Manage or cancel for anyone who subscribed": yes).
  Read as source, like the rest of this file.
*/
describe('the Plan page for someone who does not decide', () => {
  const plan = withoutComments(
    readFileSync(join(HERE, '..', 'screens/account/PlanScreen.tsx'), 'utf8'),
  );
  const flat = plan.replace(/\s+/g, ' ');
  const branch = flat.indexOf('{plan.decides ? (');
  const otherwise = flat.indexOf(') : (', branch);

  it('draws the plans, Restore and the code field only for the owner or a parent', () => {
    expect(branch).toBeGreaterThan(-1);
    expect(otherwise).toBeGreaterThan(branch);
    for (const offer of [
      '<SubscribePanel testID="plan.billing" />',
      '<RedeemPanel />',
      'testID="plan.code"',
    ]) {
      const at = flat.indexOf(offer);
      expect({ offer, inside: at > branch && at < otherwise }).toEqual({ offer, inside: true });
    }
  });

  it('tells everyone else who chooses, in the gate sheet’s own words, and keeps the way out', () => {
    const rest = flat.slice(otherwise);
    expect(rest).toContain('{gateNotYours(plusName)}');
    // the store's own subscriptions page, for whoever subscribed from this phone (rule 14)
    expect(rest).toContain('<ManageRow testID="plan.billing" />');
    expect(rest).not.toContain('<SubscribePanel');
    expect(rest).not.toContain('<RedeemPanel');
  });
});

describe('both selling surfaces render the same panel', () => {
  /**
   * A TRIPWIRE, NOT A RENDER TEST. Node cannot parse a React Native component, so this reads
   * the two files as text. What it protects is the reason the panel exists: a parent who meets
   * a lock and a parent who walked to Settings must be offered the same deal in the same words,
   * and the cheapest way for that to stop being true is for somebody to inline one of them.
   */
  const up = (f: string) => readFileSync(join(HERE, '..', f), 'utf8');

  it('is rendered by the paywall sheet and by the Plan screen, and inlined by neither', () => {
    for (const f of ['sheets/GateSheet.tsx', 'screens/account/PlanScreen.tsx']) {
      const text = withoutComments(up(f));
      expect({ f, has: text.includes('<SubscribePanel') }).toEqual({ f, has: true });
      // neither surface may grow its own Subscribe button
      expect({ f, own: /label=\{?['"`]Subscribe/.test(text) }).toEqual({ f, own: false });
    }
  });

  it('carries the terms line on both, because both draw the panel and neither draws its own', () => {
    for (const f of ['sheets/GateSheet.tsx', 'screens/account/PlanScreen.tsx']) {
      const text = withoutComments(up(f));
      expect({ f, own: /termsUrl|privacyPolicyUrl|Terms of Use/.test(text) }).toEqual({
        f,
        own: false,
      });
    }
  });

  it('leaves no screen claiming subscribing is unavailable in its own words', () => {
    // the panel is the one place that sentence may live, so it cannot say two different things
    for (const f of ['sheets/GateSheet.tsx', 'screens/account/PlanScreen.tsx']) {
      expect(withoutComments(up(f))).not.toContain('not available in this build');
    }
  });
});

/**
 * THE TERMS ARE WHERE THE PURCHASE IS (App Store guideline 3.1.2; the launch review, 2026-09-27).
 * The panel had no Terms of Use or Privacy Policy link on either surface that sells. Read as
 * source, like the rest of this file: Node cannot render a React Native component.
 */
describe('the purchase terms under the buttons that buy', () => {
  const panel = withoutComments(src('SubscribePanel.tsx'));
  const flat = panel.replace(/\s+/g, ' ');

  it('sits under Subscribe and Restore, and above the way out', () => {
    const subscribe = flat.indexOf('testID={`${testID}.subscribe`}');
    const restore = flat.indexOf('testID={`${testID}.restore`}');
    const terms = flat.indexOf('<PurchaseTerms testID={testID} />');
    const manage = flat.indexOf('<ManageRow testID={testID} />');
    expect(subscribe).toBeGreaterThan(-1);
    expect(restore).toBeGreaterThan(subscribe);
    expect(terms, 'under both purchase buttons').toBeGreaterThan(restore);
    expect(manage, 'Manage or cancel still follows').toBeGreaterThan(terms);
  });

  it('links both documents at the brand package’s addresses, never typed ones', () => {
    expect(flat).toContain('link(BILLING.terms, BRAND.termsUrl, `${testID}.terms`)');
    expect(flat).toContain('link(BILLING.privacy, BRAND.privacyPolicyUrl, `${testID}.privacy`)');
    expect(flat).toContain("import { BRAND } from '@nibblecue/brand';");
    expect(panel).not.toMatch(/https?:\/\//);
    expect(BILLING.terms).toBe('Terms of Use');
    expect(BILLING.privacy).toBe('Privacy Policy');
  });

  it('makes each link a real link a finger can hit', () => {
    expect(flat).toContain('accessibilityRole="link"');
    expect(flat).toContain('hitSlop={slop}');
    expect(flat).toContain('const slop = Math.ceil((t.hit.min - t.type.bodySm.lineHeight) / 2);');
  });

  it('says it renews until canceled, and that canceling keeps Plus to the end of the period', () => {
    const line = BILLING.renewal.toLowerCase();
    expect(line).toContain('renews automatically until you cancel');
    expect(line).toContain('store’s settings');
    expect(line).toContain('until the end of the period');
    // the store's own sheet and the choices above carry the price: none is restated here
    expect(BILLING.renewal).not.toMatch(/\$|\d/);
  });
});

describe('the commercial rules hold in the words themselves', () => {
  const all = Object.values(BILLING).map(v => (typeof v === 'function' ? '' : v));

  it('carries no scarcity, no countdown and no pressure', () => {
    const banned = [
      'hurry',
      'last chance',
      'limited time',
      'only today',
      'expires soon',
      'act now',
      "don't miss",
      'ends tonight',
    ];
    for (const line of all) {
      for (const b of banned) expect(line.toLowerCase()).not.toContain(b);
    }
  });

  it('never obstructs cancelling — the manage line is a link out and says so', () => {
    expect(BILLING.manage.toLowerCase()).toContain('cancel');
    expect(BILLING.manageNote.toLowerCase()).toContain('store');
    expect(BILLING.manageNote.toLowerCase()).not.toContain('are you sure');
  });

  it('never misdescribes cancelling: a canceled plan keeps Plus until the period ends', () => {
    // CLAUDE.md rule 14. "Takes effect at once" read as losing Plus on the spot, which is not what
    // either store does: canceling stops the next renewal and the paid period runs out
    const note = BILLING.manageNote.toLowerCase();
    expect(note).not.toMatch(/at once|immediately|right away/);
    expect(note).toContain('until the end of the period');
  });

  it('tells a parent nothing was charged when the store failed', () => {
    expect(BILLING.failed.toLowerCase()).toContain('nothing was charged');
  });

  it('says the monthly plan’s second month free with the store’s own price', () => {
    // docs/SUBSCRIPTIONS.md §3c; the owner, 2026-09-28: "after the first month, they get 1 month
    // free of charge". The figure is handed in as the store formatted it
    expect(BILLING.secondMonthFree('$6.99', BILLING.perMonth)).toBe(
      'Second month free, then $6.99 a month',
    );
    expect(BILLING.secondMonthFree('6,99 €', BILLING.perMonth)).toBe(
      'Second month free, then 6,99 € a month',
    );
  });

  it('says any other introductory stretch in the store’s own strings, and names its length truly', () => {
    expect(BILLING.introOffer(2, '$4.99', '$6.99', BILLING.perMonth)).toBe(
      'First 2 months $4.99, then $6.99 a month',
    );
    expect(BILLING.introOffer(1, '£0.99', '£6.99', BILLING.perMonth)).toBe(
      'First month £0.99, then £6.99 a month',
    );
    expect(BILLING.introOffer(6, '19,99 €', '59,00 €', BILLING.perYear)).toBe(
      'First 6 months 19,99 €, then 59,00 € a year',
    );
    expect(BILLING.introOffer(12, 'A', 'B', BILLING.perYear)).toBe('First year A, then B a year');
    expect(BILLING.introOffer(24, '¥9,800', '¥7,800', BILLING.perYear)).toMatch(/^First 2 years /);
  });

  it('says an offer in sentence case, with no dash, no pressure and nothing that ends', () => {
    // lower-case stand-ins for the store's figures, so any capital left is the line's own
    for (const line of [
      BILLING.secondMonthFree('y', BILLING.perMonth),
      BILLING.introOffer(2, 'x', 'y', BILLING.perMonth),
    ]) {
      expect(line).not.toMatch(/[—–-]/);
      expect(line.toLowerCase()).not.toMatch(/only|limited|ends|hurry|last chance|save/);
      // one capital, at the start: sentence case
      expect(line[0]).toMatch(/[A-Z]/);
      expect(line.slice(1)).not.toMatch(/[A-Z]/);
    }
  });

  it('marks a target as a target in words a parent can read', () => {
    expect(BILLING.targetsNote.toLowerCase()).toContain('not a real offer');
    expect(BILLING.targetsNote.toLowerCase()).toContain('nothing can be charged');
  });
});
