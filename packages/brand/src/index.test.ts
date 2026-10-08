import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import brand from '../brand.json';
import listing from '../store-listing.json';
import {
  BRAND,
  IN_APP_STRINGS,
  PENDING,
  PROPOSED,
  PROPOSED_KEYS,
  isPlaceholder,
  required,
  resolveBrandRefs,
  unconfirmed,
  type UnconfirmedKey,
} from './index';
import { STORE_LISTING } from './listing';

const valueKeys = Object.keys(brand.unconfirmed).filter(
  k => !k.startsWith('$') && !k.endsWith('Note'),
) as UnconfirmedKey[];

describe('required()', () => {
  it('throws on every value the owner has not set yet, naming the key', () => {
    const unset = valueKeys.filter(k => isPlaceholder(unconfirmed(k)));
    expect(unset.length).toBeGreaterThan(0);
    for (const key of unset) expect(() => required(key)).toThrow(key);
  });

  it('returns a set value, and shows a placeholder through unconfirmed() so a gap stays obvious', () => {
    // The Apple Team id is the studio's (the owner, 2026-10-02, for CuddleCue): the same team
    // publishes NibbleCue. The rest are still {{PLACEHOLDER}}s.
    expect(required('appleTeamId')).toMatch(/^[A-Z0-9]{10}$/);
    expect(isPlaceholder(unconfirmed('appleTeamId'))).toBe(false);
    for (const key of valueKeys.filter(k => k !== 'appleTeamId')) {
      expect(isPlaceholder(unconfirmed(key)), key).toBe(true);
    }
  });

  it('leaves three values unset, each waiting on an account NibbleCue does not have yet', () => {
    // the EAS project (`npx eas-cli init` in apps/mobile), the App Store Connect app record, and
    // the Play Console app's signing certificate
    expect(valueKeys).toEqual([
      'easProjectId',
      'appleTeamId',
      'appStoreId',
      'androidSigningSha256',
    ]);
    expect(valueKeys.filter(k => isPlaceholder(unconfirmed(k)))).toEqual([
      'easProjectId',
      'appStoreId',
      'androidSigningSha256',
    ]);
  });
});

/**
 * THE APP'S STRINGS ARE THE LISTING'S (2026-09-26). The app reads `inApp` from a generated copy,
 * `inApp.generated.ts`, so the rest of the listing is not bundled (`tools/gen-app-slices.mjs`).
 * Every other check of those strings — `brand.test.ts`'s store-title and banned-phrase rules among
 * them — reads the JSON, so they are only checks of what a parent sees while the two are equal.
 */
describe('the in-app strings', () => {
  it('are the listing’s `inApp`, exactly, references resolved', () => {
    expect(IN_APP_STRINGS).toEqual(resolveBrandRefs(listing.inApp));
    expect(IN_APP_STRINGS).toEqual(STORE_LISTING.inApp);
  });

  it('come from the generated copy, so the package root never imports the listing', () => {
    const index = readFileSync(join(__dirname, 'index.ts'), 'utf8');
    expect(index).toContain("from './inApp.generated'");
    expect(index).not.toMatch(/store-listing\.json['"]|from '\.\/listing'/);
  });
});

describe('decided values', () => {
  it('reach the app through the listing strings, never by typing the name', () => {
    expect(BRAND.appDisplayName.length).toBeGreaterThan(0);
    expect(IN_APP_STRINGS.signInTitle).toBe(BRAND.appDisplayName);
    expect(IN_APP_STRINGS.paywallTitle).toBe(BRAND.plusTierName);
    expect(IN_APP_STRINGS.aboutTitle).toContain(BRAND.appDisplayName);
  });

  it('carry the native identifiers and the domain as real values, not placeholders', () => {
    for (const key of [
      'iosBundleId',
      'androidApplicationId',
      'iosAppGroup',
      'urlScheme',
      'universalLinkHost',
      'privacyPolicyUrl',
      'termsUrl',
      'supportEmail',
      'supportUrl',
    ] as const) {
      expect(isPlaceholder(BRAND[key]), key).toBe(false);
    }
  });
});

/**
 * PROPOSED VALUES (2026-10-08): the developer's identifiers and lines, which a development build
 * runs on while the owner has not confirmed them. BRAND carries them so the app can be tested;
 * PROPOSED_KEYS names them so a release build can refuse to start (apps/mobile/env.guard.cjs).
 */
describe('proposed values', () => {
  it('are named by PROPOSED_KEYS, carried by BRAND, and never shadow a decided value', () => {
    expect([...PROPOSED_KEYS]).toEqual(Object.keys(brand.proposed).filter(k => !k.startsWith('$')));
    expect(PROPOSED_KEYS.length).toBeGreaterThan(0);
    for (const key of PROPOSED_KEYS) {
      expect(Object.keys(brand.decided), key).not.toContain(key);
      expect((BRAND as Record<string, unknown>)[key], key).toBe(
        (PROPOSED as Record<string, unknown>)[key],
      );
    }
  });

  it('include every NibbleCue address and identifier the owner has not confirmed', () => {
    for (const key of [
      'marketingUrl',
      'privacyPolicyUrl',
      'termsUrl',
      'accountDeletionUrl',
      'supportEmail',
      'urlScheme',
      'iosBundleId',
      'androidApplicationId',
      'iosAppGroup',
      'linkPath',
    ]) {
      expect(PROPOSED_KEYS, key).toContain(key);
    }
  });
});

describe('pending values', () => {
  it("hold nothing today: the legal entity is the studio's, decided, and reads from BRAND", () => {
    const values = Object.entries(PENDING).filter(
      ([k, v]) => !k.startsWith('$') && typeof v === 'string',
    );
    expect(values).toEqual([]);
    expect(isPlaceholder(BRAND.legalEntity)).toBe(false);
    expect(BRAND.legalEntity).not.toBe(BRAND.developerName);
  });
});

describe('listing references', () => {
  it('resolve to the brand values', () => {
    expect(STORE_LISTING.links.privacyPolicyUrl).toBe(BRAND.privacyPolicyUrl);
    expect(STORE_LISTING.links.termsUrl).toBe(BRAND.termsUrl);
    expect(STORE_LISTING.links.accountDeletionUrl).toBe(BRAND.accountDeletionUrl);
    expect(STORE_LISTING.links.marketingUrl).toBe(BRAND.marketingUrl);
    expect(STORE_LISTING.links.supportEmail).toBe(BRAND.supportEmail);
    expect(STORE_LISTING.links.supportUrl).toBe(BRAND.supportUrl);
    expect(STORE_LISTING.appStore.subtitle).toBe(BRAND.appleSubtitle);
    expect(STORE_LISTING.play.shortDescription).toBe(BRAND.playShortDescription);
    expect(STORE_LISTING.website.heroHeadline).toBe(BRAND.marketingHeadline);
    expect(STORE_LISTING.website.footerLegal).toBe(BRAND.legalEntity);
  });

  it('refuse a pending or unconfirmed value, so it cannot reach a store field this way', () => {
    expect(() => resolveBrandRefs({ x: 'brand:appleTeamId' })).toThrow('appleTeamId');
    expect(() => resolveBrandRefs({ x: 'brand:androidSigningSha256' })).toThrow(
      'androidSigningSha256',
    );
    expect(() => resolveBrandRefs({ x: 'brand:easProjectId' })).toThrow('easProjectId');
    expect(() => resolveBrandRefs('brand:$note')).toThrow();
    expect(() => resolveBrandRefs('brand:notAKey')).toThrow('notAKey');
    // the legal entity is DECIDED (the studio's), so the seller field may reference it
    expect(resolveBrandRefs({ x: 'brand:legalEntity' })).toEqual({ x: BRAND.legalEntity });
  });

  it('resolve a proposed value for a development build', () => {
    expect(PROPOSED_KEYS).toContain('termsUrl');
    expect(resolveBrandRefs('brand:termsUrl')).toBe(PROPOSED.termsUrl);
  });

  it('leave every other string alone', () => {
    expect(resolveBrandRefs({ a: ['plain', 1, null], b: { c: 'brand:brand' } })).toEqual({
      a: ['plain', 1, null],
      b: { c: BRAND.brand },
    });
  });

  it('resolve a brand value inside a longer text, and refuse anything that is not one', () => {
    expect(resolveBrandRefs('Terms: {{termsUrl}} · Privacy: {{privacyPolicyUrl}}')).toBe(
      `Terms: ${BRAND.termsUrl} · Privacy: ${BRAND.privacyPolicyUrl}`,
    );
    expect(() => resolveBrandRefs('Team: {{appleTeamId}}')).toThrow('appleTeamId');
    expect(() => resolveBrandRefs('{{notAKey}} here')).toThrow('notAKey');
  });

  it('give the App Store description working Terms of Use and Privacy Policy links (3.1.2)', () => {
    const description = STORE_LISTING.appStore.description;
    expect(description).toContain(`Terms of Use (EULA): ${BRAND.termsUrl}`);
    expect(description).toContain(`Privacy Policy: ${BRAND.privacyPolicyUrl}`);
    expect(description).toContain(BRAND.marketingHeadline);
    expect(description).not.toContain('{{');
  });
});
