/**
 * NibbleCue Plus's store identifiers: its own, never CuddleCue's. The ids are the developer's
 * proposal until the owner sets them (pricing.config.json `owner_to_confirm`), and once set they
 * are never renamed after the first submission.
 */
import { describe, expect, it } from 'vitest';
import { PACKAGES, PLUS_ENTITLEMENT } from './packages';

describe('the subscription identifiers', () => {
  it('are NibbleCue’s own, so the two apps’ subscriptions never collide', () => {
    expect(PACKAGES.map(p => p.product_id).sort()).toEqual([
      'nibble_plus_annual',
      'nibble_plus_monthly',
    ]);
    expect(PLUS_ENTITLEMENT).toBe('nibble_plus');
    for (const p of PACKAGES) expect(p.product_id.startsWith('plus_')).toBe(false);
  });

  it('select exactly one package by default', () => {
    expect(PACKAGES.filter(p => p.default_selected)).toHaveLength(1);
  });
});
