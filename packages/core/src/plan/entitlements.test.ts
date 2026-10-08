/**
 * NibbleCue's plan matrix: the bill of rights is never sold, safety is never sold, every gate names
 * a real feature, and nothing on CuddleCue's plan is offered as NibbleCue Plus.
 *
 * Run: pnpm test:entitlements
 */
import { describe, expect, it } from 'vitest';
import {
  billOfRights,
  can,
  FEATURES,
  freeFeatures,
  GATES,
  limitFor,
  offFeatures,
  planOf,
  plusFeatures,
  tierFor,
  type FeatureKey,
} from './entitlements';

const BANNED = /\s[-–—]\s|—|–/;

describe('the bill of rights', () => {
  it('holds the things a parent can never be charged for, safety included', () => {
    const rights: FeatureKey[] = [
      'logging',
      'today',
      'foodLibrary',
      'allergens',
      'noticed',
      'multiples',
      'shopping',
      'baseThemes',
      'exportData',
      'accountDelete',
      'noAds',
    ];
    expect(billOfRights().sort()).toEqual([...rights].sort());
    for (const k of rights) {
      expect(FEATURES[k].free, k).toBe(true);
      expect(can(k, 'FREE'), k).toBe(true);
      expect(FEATURES[k].off, k).toBeUndefined();
    }
  });

  it('is never switched off and never capped', () => {
    for (const k of billOfRights()) {
      expect(limitFor(k, 'FREE')).toBeNull();
      expect(FEATURES[k].limit).toBeUndefined();
    }
  });
});

describe('NibbleCue Plus', () => {
  it('sells depth and polish, each with its reason', () => {
    expect(plusFeatures().sort()).toEqual(
      [
        'caregiverSheet',
        'fullPlan',
        'groceryRange',
        'milk',
        'nightTheme',
        'pediatricianSummary',
        'planIdeas',
        'themes',
      ].sort(),
    );
    for (const k of plusFeatures()) {
      expect(FEATURES[k].why, k).toBeTruthy();
      expect(can(k, 'FREE'), k).toBe(false);
      expect(can(k, 'PLUS'), k).toBe(true);
    }
  });

  it('never lists what either plan decides (caregiver seats, the owner 2026-10-08)', () => {
    expect(planOf('caregivers')).toBe('either');
    expect(plusFeatures()).not.toContain('caregivers');
    expect(freeFeatures()).not.toContain('caregivers');
  });

  it('offers none of CuddleCue’s switched off features', () => {
    for (const k of offFeatures()) {
      expect(plusFeatures()).not.toContain(k);
      expect(freeFeatures()).not.toContain(k);
    }
  });

  it('gates only features that exist and are sold', () => {
    for (const g of GATES) {
      const f = FEATURES[g.feature];
      expect(f, g.surface).toBeDefined();
      expect(f.free || f.fixed, g.surface).toBeFalsy();
      expect(f.off, g.surface).toBeUndefined();
    }
  });

  it('turns a store status into a tier in one place', () => {
    expect(tierFor('ACTIVE')).toBe('PLUS');
    expect(tierFor('GRACE')).toBe('PLUS');
    expect(tierFor('EXPIRED')).toBe('FREE');
    expect(tierFor('FREE')).toBe('FREE');
  });

  it('writes every list name and sentence in the app’s voice', () => {
    for (const k of Object.keys(FEATURES) as FeatureKey[]) {
      const f = FEATURES[k];
      for (const s of [f.label, f.short, f.why ?? ''])
        expect(BANNED.test(s), `${k}: ${s}`).toBe(false);
      expect(f.short.length, k).toBeLessThanOrEqual(22);
      expect(/\.$/.test(f.short), k).toBe(false);
    }
    const shorts = Object.values(FEATURES).map(f => f.short);
    expect(new Set(shorts).size).toBe(shorts.length);
  });
});
