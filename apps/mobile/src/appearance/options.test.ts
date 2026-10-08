import { GATES } from '@nibblecue/core';
import {
  DEFAULT_SHAPE,
  FREE_APPEARANCE,
  parseAppearance,
  PLUS_APPEARANCE,
  QUICK_SHAPES,
  SCHEME_NAMES,
  TAB_POLICIES,
  THEME_CHOICES,
} from '@nibblecue/ui/appearance';
import { DEFAULT_SKIN, SKIN_NAMES } from '@nibblecue/ui/skins';
import { DEFAULT_SCHEME } from '@nibblecue/ui/theme';
import { describe, expect, it } from 'vitest';
import {
  appearanceSummary,
  gateFor,
  isLocked,
  isPlusLook,
  logRowOf,
  SCHEME_OPTIONS,
  SHAPE_OPTIONS,
  shownTheme,
  SKIN_OPTIONS,
  TAB_OPTIONS,
  THEME_OPTIONS,
} from './options';

describe('the option lists (DESIGN_SYSTEM.md §21: an enum value is not copy)', () => {
  it('covers every stored value exactly once, in the resolver order', () => {
    expect(THEME_OPTIONS.map(o => o.value)).toEqual(THEME_CHOICES);
    expect(SCHEME_OPTIONS.map(o => o.value)).toEqual(SCHEME_NAMES);
    expect(SKIN_OPTIONS.map(o => o.value)).toEqual(SKIN_NAMES);
    expect(SHAPE_OPTIONS.map(o => o.value)).toEqual(QUICK_SHAPES);
    // the tabs: every value a stored preference can come out as — which is one, since the parser
    // forces every tab labeled (2026-09-18) whatever was stored
    const given = [...new Set(TAB_POLICIES.map(tabs => parseAppearance({ tabs }).tabs))];
    expect(given).toEqual(['rounded']);
    expect(TAB_OPTIONS.map(o => o.value)).toEqual(given);
  });

  it('labels the themes for a parent, not for a developer', () => {
    expect(THEME_OPTIONS.map(o => o.label)).toEqual(['Match phone', 'Light', 'Dark', 'Night']);
    expect(THEME_OPTIONS.find(o => o.value === 'night')?.note).toBe('Dim amber for 2 a.m.');
  });

  /**
   * THREE SHAPES, NOT FOUR. `cards` is gone (the owner, 2026-09-16: "remove cards module
   * completely, it does not work at all"), and the default leads the list because it is the
   * one a household is already looking at.
   */
  it('labels the shapes and the tab policies as the docs name them (§23.1, §23.2)', () => {
    expect(SHAPE_OPTIONS.map(o => o.label)).toEqual(['Pebble', 'Bubble', 'Capsule']);
    expect(SHAPE_OPTIONS.map(o => o.value)).not.toContain('cards');
    // the free shape's line names no sold layout (2026-10-01): it said "sliding sideways", and the
    // sideways swipe is Plus while Pebble is every plan's, laid out in the wrapping grid
    expect(SHAPE_OPTIONS.find(o => o.value === 'pebble')?.note).toBe('Round icons, three across');
    expect(SHAPE_OPTIONS.find(o => o.value === DEFAULT_SHAPE)?.note).not.toMatch(/slid|swipe/i);
    expect(SHAPE_OPTIONS.find(o => o.value === 'bubble')?.note).toBe(
      'Quick actions as circles, four across',
    );
    // the capsule's note says the layout, because the capsule is the one that does not slide
    expect(SHAPE_OPTIONS.find(o => o.value === 'capsule')?.note).toBe(
      'Wide pills, two columns, all of them on the page',
    );
    // ONE LAYOUT, AND NO CHOICE (the owner, 2026-09-18: "all labels 0 tab labels"): the list is
    // what `parseAppearance` forces — every tab labeled — so nothing offers icons only any more
    expect(TAB_OPTIONS.map(o => o.label)).toEqual(['All labels']);
    expect(TAB_OPTIONS.map(o => o.value)).toEqual([parseAppearance({ tabs: 'icons' }).tabs]);
    expect(TAB_OPTIONS[0]?.note).toBe('Every tab labeled, same size');
  });

  it('takes the skin labels from the skin table, so a rename there reaches both surfaces', () => {
    // two looks since 2026-09-18: Soft was removed (`skins.ts` says why and what it cost)
    expect(SKIN_OPTIONS.map(o => o.label)).toEqual(['Liquid Glass', 'Paper']);
    // CuddleCue's order, with NibbleCue's green Leaf where Sunny was (2026-10-08)
    expect(SCHEME_OPTIONS.map(o => o.label)).toEqual([
      'Ocean',
      'Lilac',
      'Rose',
      'Leaf',
      'Reef',
      'Slate',
    ]);
    // NIBBLECUE STARTS ON LEAF (packages/ui `DEFAULT_SCHEME`, the owner, 2026-10-08: "i like the
    // green color theme instea of orange. because in our cuddlecue app, solid is green"). The
    // swatch row keeps CuddleCue's order, so the default is not the first swatch
    expect(DEFAULT_SCHEME).toBe('leaf');
    expect(SCHEME_OPTIONS.map(o => o.value)).toContain(DEFAULT_SCHEME);
  });

  it('never renders an enum value, an em dash or an empty line', () => {
    const all = [
      ...THEME_OPTIONS,
      ...SCHEME_OPTIONS,
      ...SKIN_OPTIONS,
      ...SHAPE_OPTIONS,
      ...TAB_OPTIONS,
    ];
    for (const o of all) {
      expect(o.label.length).toBeGreaterThan(0);
      expect(o.note.length).toBeGreaterThan(0);
      expect(o.label).not.toMatch(/[A-Z_]{3,}/);
      expect(o.label).not.toContain('—');
      expect(o.note).not.toContain('—');
    }
  });
});

describe('isLocked (PRICING.md §6: a gate looks gated before the tap)', () => {
  it('never locks light, dark or match-phone, whatever the plan (the bill of rights)', () => {
    for (const entitled of [FREE_APPEARANCE, PLUS_APPEARANCE]) {
      expect(isLocked('theme', 'light', entitled)).toBe(false);
      expect(isLocked('theme', 'dark', entitled)).toBe(false);
      expect(isLocked('theme', 'system', entitled)).toBe(false);
    }
  });

  it('locks night exactly when the plan lacks nightTheme', () => {
    expect(isLocked('theme', 'night', FREE_APPEARANCE)).toBe(true);
    expect(isLocked('theme', 'night', { nightTheme: true, themes: false })).toBe(false);
    expect(isLocked('theme', 'night', PLUS_APPEARANCE)).toBe(false);
  });

  it('locks every scheme but the default, and every skin but the default, when the plan lacks themes', () => {
    // DEFAULT_SCHEME, not a literal, for the skin's reason below: Reef was the free scheme until
    // 2026-09-27 and Ocean is now, and the rule is "the default is the one nobody pays for"
    for (const k of SCHEME_NAMES) {
      expect(isLocked('scheme', k, FREE_APPEARANCE)).toBe(k !== DEFAULT_SCHEME);
      expect(isLocked('scheme', k, PLUS_APPEARANCE)).toBe(false);
    }
    // …and NibbleCue's move: Leaf is free, CuddleCue's Ocean is sold like the rest
    expect(isLocked('scheme', 'leaf', FREE_APPEARANCE)).toBe(false);
    expect(isLocked('scheme', 'ocean', FREE_APPEARANCE)).toBe(true);
    expect(isLocked('scheme', 'reef', FREE_APPEARANCE)).toBe(true);
    for (const k of SKIN_NAMES) {
      // DEFAULT_SKIN, not a literal: Soft was the free look until 2026-09-18 and Paper is now,
      // and a test that names the skin rather than the ROLE breaks every time that moves while
      // saying nothing about the rule, which is "the default is the one nobody pays for"
      expect(isLocked('skin', k, FREE_APPEARANCE)).toBe(k !== DEFAULT_SKIN);
      expect(isLocked('skin', k, PLUS_APPEARANCE)).toBe(false);
    }
  });

  /**
   * THE SHAPES AND THE SIDEWAYS LOG ROW ARE SOLD SINCE 2026-10-01 (the owner: "make shapes other
   * than pebble also a plus feature, same with horizontal slider"). This test said "never locks a
   * shape" until then. The free shape is the DEFAULT, never a name, for the skin's reason above.
   */
  it('locks every shape but the default when the plan lacks themes, and never a tab policy', () => {
    expect(DEFAULT_SHAPE).toBe('pebble');
    for (const k of QUICK_SHAPES) {
      expect(isLocked('shape', k, FREE_APPEARANCE), k).toBe(k !== DEFAULT_SHAPE);
      expect(isLocked('shape', k, PLUS_APPEARANCE), k).toBe(false);
      // Night's entitlement opens no shape: they are the looks', with the colors and Glass
      expect(isLocked('shape', k, { nightTheme: true, themes: false }), k).toBe(
        k !== DEFAULT_SHAPE,
      );
    }
    expect(isLocked('shape', 'pebble', FREE_APPEARANCE)).toBe(false);
    expect(isLocked('shape', 'bubble', FREE_APPEARANCE)).toBe(true);
    expect(isLocked('shape', 'capsule', FREE_APPEARANCE)).toBe(true);
    for (const k of TAB_POLICIES) {
      expect(isLocked('tabs', k, FREE_APPEARANCE)).toBe(false);
      expect(isPlusLook('tabs', k)).toBe(false);
    }
  });

  it('locks the sideways log row when the plan lacks themes, and never the wrapping grid', () => {
    expect(logRowOf(false)).toBe('grid');
    expect(logRowOf(true)).toBe('swipe');
    // the default is the grid, and that is the answer every plan has
    expect(logRowOf(parseAppearance({}).logSlider)).toBe('grid');
    expect(isLocked('logRow', 'grid', FREE_APPEARANCE)).toBe(false);
    expect(isLocked('logRow', 'swipe', FREE_APPEARANCE)).toBe(true);
    expect(isLocked('logRow', 'swipe', { nightTheme: true, themes: false })).toBe(true);
    for (const layout of ['grid', 'swipe'] as const)
      expect(isLocked('logRow', layout, PLUS_APPEARANCE), layout).toBe(false);
  });
});

/**
 * WHAT WEARS THE QUIET "PLUS" TAG DURING THE PREVIEW (2026-09-28): exactly what the free plan
 * locks, asked of the same `isLocked`, so a tag and a lock can never disagree.
 */
describe('isPlusLook', () => {
  it('is the free plan’s lock, option for option', () => {
    const lists = [
      ['theme', THEME_CHOICES],
      ['scheme', SCHEME_NAMES],
      ['skin', SKIN_NAMES],
      ['shape', QUICK_SHAPES],
      ['logRow', ['grid', 'swipe']],
      ['tabs', TAB_POLICIES],
    ] as const;
    for (const [kind, values] of lists)
      for (const v of values)
        expect(isPlusLook(kind, v), `${kind} ${v}`).toBe(isLocked(kind, v, FREE_APPEARANCE));
  });

  it('tags Night, the sold colors, Liquid Glass, Bubble, Capsule and the swipe, and nothing free', () => {
    expect(isPlusLook('theme', 'night')).toBe(true);
    for (const free of ['light', 'dark', 'system']) expect(isPlusLook('theme', free)).toBe(false);
    expect(isPlusLook('scheme', DEFAULT_SCHEME)).toBe(false);
    expect(isPlusLook('skin', DEFAULT_SKIN)).toBe(false);
    expect(QUICK_SHAPES.filter(k => isPlusLook('shape', k))).toEqual(['bubble', 'capsule']);
    expect(isPlusLook('logRow', 'swipe')).toBe(true);
    expect(isPlusLook('logRow', 'grid')).toBe(false);
  });
});

describe('gateFor', () => {
  it('names the feature each locked list opens the paywall for', () => {
    expect(gateFor('theme')).toBe('nightTheme');
    expect(gateFor('scheme')).toBe('themes');
    expect(gateFor('skin')).toBe('themes');
    // the shapes and the sideways log row are the looks' since 2026-10-01, never Night's
    expect(gateFor('shape')).toBe('themes');
    expect(gateFor('logRow')).toBe('themes');
    expect(gateFor('tabs')).toBeNull();
  });

  it('opens a gate the matrix declares on the Appearance sheet, for every list that can lock', () => {
    const declared = new Map(
      GATES.filter(g => g.surface.startsWith('appearance.')).map(g => [g.surface, g.feature]),
    );
    expect(declared.get('appearance.night')).toBe(gateFor('theme'));
    expect(declared.get('appearance.scheme')).toBe(gateFor('scheme'));
    expect(declared.get('appearance.skin')).toBe(gateFor('skin'));
    expect(declared.get('appearance.shape')).toBe(gateFor('shape'));
    expect(declared.get('appearance.log_swipe')).toBe(gateFor('logRow'));
  });
});

describe('shownTheme (PRICING.md §6: the locked option must stay tappable)', () => {
  it('shows the stored choice when nothing was taken back', () => {
    for (const choice of THEME_CHOICES) {
      expect(shownTheme(choice, { night: false })).toBe(choice);
    }
  });

  it('shows dark, never night and never light, when the plan took night back', () => {
    expect(shownTheme('night', { night: true })).toBe('dark');
  });

  it('never checks the locked night segment, so a tap on it can open the gate', () => {
    const entitled = FREE_APPEARANCE;
    const stored = 'night' as const;
    const checked = shownTheme(stored, { night: isLocked('theme', stored, entitled) });
    expect(checked).not.toBe('night');
    expect(isLocked('theme', 'night', entitled)).toBe(true);
  });
});

describe('appearanceSummary', () => {
  it('reads "<scheme> · <theme>" from what is painted', () => {
    expect(appearanceSummary({ scheme: 'lilac', theme: 'dark' })).toBe('Lilac · Dark');
    expect(appearanceSummary({ scheme: 'ocean', theme: 'light' })).toBe('Ocean · Light');
    expect(appearanceSummary({ scheme: 'leaf', theme: 'night' })).toBe('Leaf · Night');
  });
});
