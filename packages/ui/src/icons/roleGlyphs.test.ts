/**
 * SETUP'S TWO ROLE GLYPHS (the owner, 2026-09-27: "at onboarding question: your role at home,
 * create icons for parent and caregiver."). `paths.ts` has the drawing and why; this holds the
 * parts of it a later edit could quietly undo — the set's rules, the two tones, the one adult they
 * share, and that neither is a copy of a person glyph the app already draws.
 */
import { describe, expect, it } from 'vitest';
import { ICON_NAMES, ICON_PATHS, type IconDef, type IconElement } from './paths';
import { CUSTOM_ICON_PATHS } from './paths.custom';

const ROLES = ['parent', 'caregiver'] as const;
const circles = (def: IconDef) =>
  def.elements.filter((el): el is Extract<IconElement, { type: 'circle' }> => el.type === 'circle');
const geometry = (el: IconElement): string =>
  el.type === 'path'
    ? el.d
    : el.type === 'circle'
      ? `c${el.cx},${el.cy},${el.r}`
      : el.type === 'rect'
        ? `r${el.x},${el.y},${el.width},${el.height}`
        : `l${el.x1},${el.y1},${el.x2},${el.y2}`;

describe('the role glyphs', () => {
  it('are built-in names, drawn by the app until the owner sends a file of their own', () => {
    for (const name of ROLES) {
      expect(ICON_NAMES, name).toContain(name);
      // a file in assets/brand/kit/08-icons would replace it by name (`Icon.tsx`); none has
      expect(CUSTOM_ICON_PATHS[name], name).toBeUndefined();
    }
  });

  it('keep the set’s rules: the 24 box, the 1.7 stroke, round ends, no fill of their own', () => {
    for (const name of ROLES) {
      const def = ICON_PATHS[name];
      expect(def.viewBox, name).toBe('0 0 24 24');
      expect(def.fill, name).toBe('none');
      expect(def.strokeWidth, name).toBe(1.7);
      expect(def.alias, name).toBeUndefined();
    }
  });

  it('carry a detail in the second tone, and never let the detail be the picture', () => {
    const parent = ICON_PATHS.parent.elements;
    const caregiver = ICON_PATHS.caregiver.elements;
    // the parent's blanket edge is the one soft stroke
    expect(parent.filter(el => el.tone === 'secondary')).toHaveLength(1);
    // the caregiver's heart: filled in the second tone, outlined in the ink
    const hearts = caregiver.filter(el => 'fill' in el && el.fill === 'secondaryColor');
    expect(hearts).toHaveLength(1);
    expect(hearts[0]?.tone).toBeUndefined();
    // everything else is the ink: at least four marks each, so either reads at half strength
    for (const [name, els] of [
      ['parent', parent],
      ['caregiver', caregiver],
    ] as const) {
      const ink = els.filter(el => el.tone !== 'secondary' && !('fill' in el && el.fill));
      expect(ink.length, name).toBeGreaterThanOrEqual(4);
    }
  });

  it('draw one adult alike in both: the same head, high in the left corner', () => {
    const [parentHead] = circles(ICON_PATHS.parent);
    const [caregiverHead] = circles(ICON_PATHS.caregiver);
    expect(parentHead?.r).toBe(caregiverHead?.r);
    expect(parentHead?.cy).toBe(caregiverHead?.cy);
    expect(Math.abs((parentHead?.cx ?? 0) - (caregiverHead?.cx ?? 99))).toBeLessThanOrEqual(1);
    // and a smaller head for the baby and the child: they are the small ones in each picture
    for (const name of ROLES) {
      const [adult, little] = circles(ICON_PATHS[name]);
      expect(little?.r, name).toBeLessThan(adult?.r ?? 0);
      expect(little?.cy, name).toBeGreaterThan(adult?.cy ?? 99);
    }
  });

  it('keep every head inside the box, with room for the stroke', () => {
    const half = 1.7 / 2;
    for (const name of ROLES) {
      for (const c of circles(ICON_PATHS[name])) {
        expect(c.cx - c.r - half, name).toBeGreaterThanOrEqual(0.5);
        expect(c.cx + c.r + half, name).toBeLessThanOrEqual(23.5);
        expect(c.cy - c.r - half, name).toBeGreaterThanOrEqual(0.5);
        expect(c.cy + c.r + half, name).toBeLessThanOrEqual(23.5);
      }
    }
  });

  it('are neither the household’s people glyph nor the baby’s face, nor each other', () => {
    const seen = (name: keyof typeof ICON_PATHS) =>
      new Set(ICON_PATHS[name].elements.map(geometry));
    for (const name of ROLES) {
      for (const other of ['users', 'babyface'] as const) {
        const theirs = seen(other);
        const shared = ICON_PATHS[name].elements.map(geometry).filter(g => theirs.has(g));
        expect(shared, `${name} borrows from ${other}`).toEqual([]);
      }
    }
    const parent = seen('parent');
    expect(ICON_PATHS.caregiver.elements.map(geometry).filter(g => parent.has(g))).toEqual([]);
  });
});
