/**
 * THE LEGAL DOCUMENTS: the Terms of Use and the Privacy Policy, as data (`../legal/*.json`).
 * NibbleCue has no Community, so it has no Community guidelines: CuddleCue's third document was
 * deleted with the copy (2026-10-08), and these two are the whole set.
 *
 * WHY DATA AND NOT PROSE FILES. One text is read in more than one place: the legal sheet in the
 * app (opened from the sign-up checkbox and from the About sheet) and, once NibbleCue has pages of
 * its own, the two pages at `privacyPolicyUrl` and `termsUrl`. Copies of a policy drift, and a
 * policy that says one thing in the app and another on the store's link is a review finding.
 * Sections with headings and paragraphs render as native text in the app and as HTML on the
 * web from the same source, and a test can read them.
 *
 * NOTHING IN THEM TYPES A NAME. Every product name, company name, address and URL is a
 * `{{key}}` reference to a DECIDED value in brand.json, resolved here, so a rename stays a
 * one-file edit, and brand.test.ts's single-source scan (no decided value typed outside
 * brand.json) holds for the policies exactly as it holds for the code. A reference to a key that
 * is not decided throws at import time, and that includes a PROPOSED key: the support email and
 * the policy addresses are still the developer's proposals (brand.json `proposed`), so a policy
 * names the decided support page instead. A proposal a development build runs on is not a fact a
 * parent agrees to.
 *
 * THE VERSION IS WHAT A PARENT ACCEPTS. `LEGAL_VERSION` is the greater of the two documents'
 * versions, and the sign-up checkbox records it per account (`accept_terms`, the shared server's
 * migration 0100); a change to either that a parent must accept again is a bump. NOTHING RE-ASKS
 * on a bump yet, so whoever publishes a new version builds the re-ask then. A wording fix that
 * changes no obligation is an edit without a bump.
 */
import brand from '../brand.json';
import privacyRaw from '../legal/privacy.json';
import termsRaw from '../legal/terms.json';

export interface LegalSection {
  heading: string;
  paragraphs: string[];
}

export interface LegalDocument {
  /** The two documents a parent accepts at sign-up. */
  id: 'terms' | 'privacy';
  /** Bumped when a parent must accept the document again. */
  version: number;
  /** ISO date, shown at the top of the document. */
  effectiveDate: string;
  title: string;
  /** The plain-language bullets the legal sheet and the web page show above the full text. */
  summary: string[];
  sections: LegalSection[];
}

const REFERENCE = /\{\{([a-zA-Z]+)\}\}/g;

/**
 * Every `{{key}}` in a string, resolved to brand.json.decided: never a proposed, pending or
 * unconfirmed value.
 */
export function renderLegalText(text: string): string {
  return text.replace(REFERENCE, (_, key: string) => {
    const value = (brand.decided as Record<string, unknown>)[key];
    if (key.startsWith('$') || typeof value !== 'string') {
      throw new Error(`legal text references "${key}", which is not a decided brand value`);
    }
    return value;
  });
}

function renderLegal(raw: typeof termsRaw): LegalDocument {
  if (raw.id !== 'terms' && raw.id !== 'privacy')
    throw new Error(`unknown legal document ${raw.id}`);
  return {
    id: raw.id,
    version: raw.version,
    effectiveDate: raw.effectiveDate,
    title: raw.title,
    summary: raw.summary.map(renderLegalText),
    sections: raw.sections.map(s => ({
      heading: renderLegalText(s.heading),
      paragraphs: s.paragraphs.map(renderLegalText),
    })),
  };
}

export const TERMS: LegalDocument = renderLegal(termsRaw);
export const PRIVACY: LegalDocument = renderLegal(privacyRaw);
/** The version a parent accepts: both documents at once, so one bump re-asks for the pair. */
export const LEGAL_VERSION: number = Math.max(TERMS.version, PRIVACY.version);
