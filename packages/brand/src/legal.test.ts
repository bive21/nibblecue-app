import { describe, expect, it } from 'vitest';
import { BRAND } from './index';
import { LEGAL_VERSION, PRIVACY, TERMS, renderLegalText, type LegalDocument } from './legal';

/**
 * The two documents a parent accepts before using NibbleCue, held to the things that make them
 * publishable: every reference resolved, the company and the contact named from brand.json,
 * the promises the product makes stated in them, and US English. NibbleCue has no Community, so
 * CuddleCue's third document, the Community guidelines, and its tests went with it (2026-10-08).
 */
const DOCS: LegalDocument[] = [TERMS, PRIVACY];
const textOf = (d: LegalDocument): string =>
  [d.title, ...d.summary, ...d.sections.flatMap(s => [s.heading, ...s.paragraphs])].join('\n');

describe('the legal documents', () => {
  it('resolve every reference, so no {{key}} reaches a page or a screen', () => {
    for (const d of DOCS) expect(textOf(d), d.id).not.toMatch(/\{\{|\}\}/);
  });

  it('name the company, the product and the contact from brand.json, never typed', () => {
    // The contact is the decided support page. The support email is still a proposal
    // (brand.json `proposed`), and a policy names only what is decided.
    for (const d of DOCS) {
      const text = textOf(d);
      expect(text, d.id).toContain(BRAND.legalEntity);
      expect(text, d.id).toContain(BRAND.developerName);
      expect(text, d.id).toContain(BRAND.supportUrl);
      expect(text, d.id).toContain(BRAND.appDisplayName);
      expect(text, d.id).not.toContain(BRAND.supportEmail);
    }
    // the tier a parent may buy is NibbleCue's own, named from brand.json
    expect(textOf(TERMS)).toContain(BRAND.plusTierName);
    expect(textOf(PRIVACY)).toContain(BRAND.plusTierName);
  });

  it('refuse a reference to anything that is not a decided value, proposals included', () => {
    expect(() => renderLegalText('see {{appleTeamId}}')).toThrow('appleTeamId');
    expect(() => renderLegalText('see {{legalDecidedOn}}')).toThrow('legalDecidedOn');
    // proposed: a development build runs on it, a policy a parent accepts does not
    expect(() => renderLegalText('see {{marketingUrl}}')).toThrow('marketingUrl');
    expect(() => renderLegalText('see {{privacyPolicyUrl}}')).toThrow('privacyPolicyUrl');
    expect(renderLegalText('{{appDisplayName}} by {{developerName}}')).toBe(
      `${BRAND.appDisplayName} by ${BRAND.developerName}`,
    );
  });

  it('carry a version and an effective date, and the accepted version is the greater of the two', () => {
    for (const d of DOCS) {
      expect(Number.isInteger(d.version) && d.version >= 1, d.id).toBe(true);
      expect(d.effectiveDate, d.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(d.summary.length, d.id).toBeGreaterThan(0);
      expect(d.sections.length, d.id).toBeGreaterThan(5);
      for (const s of d.sections)
        expect(s.paragraphs.length, `${d.id}: ${s.heading}`).toBeGreaterThan(0);
    }
    expect(LEGAL_VERSION).toBe(Math.max(TERMS.version, PRIVACY.version));
  });

  /** The product's own rules (the studio's playbook), stated where a parent and a reviewer read. */
  it('state the medical boundary, the free download, deletion and the subscription facts', () => {
    const terms = textOf(TERMS).toLowerCase();
    expect(terms).toContain('does not give medical advice');
    expect(terms).toContain('not a medical device');
    expect(terms).toContain('never calculates a dose');
    expect(terms).toContain('free of charge');
    expect(terms).toContain('renews automatically');
    expect(terms).toContain('cancel');
    expect(terms).toContain('14-day window');
    expect(terms).toContain('delete your account');
    expect(terms).toContain('the free plan stays a working app');
    const privacy = textOf(PRIVACY).toLowerCase();
    expect(privacy).toContain('do not sell');
    expect(privacy).toContain('download everything');
    expect(privacy).toContain('14-day window');
    expect(privacy).toContain('never calculates a dose');
    expect(privacy).toContain('we do not diagnose');
  });

  /**
   * NIBBLECUE'S OWN FACTS (2026-10-08): a food planner sharing CuddleCue's household and log, with
   * optional meal ideas from an AI model that the safety rules check, sent only a summary.
   */
  it('say what NibbleCue is, that the log is shared with CuddleCue, and what the model is sent', () => {
    const terms = textOf(TERMS).toLowerCase();
    expect(terms).toContain('food planner');
    expect(terms).toContain('published feeding guidance');
    // the AI meal ideas: a summary only, and every idea checked by the plan's safety rules
    expect(terms).toContain('never a name');
    expect(terms).toContain('checked by the same safety rules');
    expect(terms).toContain('an idea that fails a rule is never shown');
    const privacy = textOf(PRIVACY).toLowerCase();
    expect(privacy).toContain('shared between the two apps');
    expect(privacy).toContain('no name, date of birth, note or contact detail is sent');
    expect(privacy).toContain('does not use it to train');
  });

  it('never call a sign an allergy, and promise nothing NibbleCue does not have', () => {
    for (const d of DOCS) {
      const text = textOf(d);
      // "allergy history you choose to enter" is the parent's own record, not the app's verdict
      for (const m of text.matchAll(/\ballerg(y|ies|ic)\b/gi))
        expect(text.slice(m.index, m.index + 16), d.id).toBe('allergy history ');
      expect(text, d.id).not.toMatch(/communit|\bcoins?\b|\bNFC\b|widget/i);
    }
  });

  it('are written in US English', () => {
    const british =
      /\b(colours?|favourites?|cancell(ed|ing)|organis(e|ed|es|ing|ation)|recognis(e|ed|es|ing)|customis(e|ed|es|ing|ation)|analys(e|ed|es|ing)|centres?|grey|licences?|judgements?|behaviours?|programmes?)\b/i;
    for (const d of DOCS) expect(textOf(d), d.id).not.toMatch(british);
  });

  it('assert no fact the owner has not given: no postal address, and the state named only by description', () => {
    for (const d of DOCS) expect(textOf(d), d.id).not.toMatch(/\b\d{5}(-\d{4})?\b/); // a ZIP code
    // the governing law is "the state in which the company is organized" — brand.json holds no
    // state and no address, so the terms may not claim one
    const law = TERMS.sections.find(s => /governing law/i.test(s.heading));
    expect(law?.paragraphs.join(' ')).toContain('is organized');
  });
});
