/**
 * The one place NibbleCue's name lives (brand.json's own `$meta`).
 *
 * Nothing in app code, store metadata, email templates or a web page may type a product name,
 * title, tagline, URL, address or native identifier: it reads it from here. `brand.test.ts`
 * (`pnpm test:brand`) checks the store character limits, the banned phrases, that the states
 * stay apart, that no decided or proposed value is typed anywhere else, and that a proposed value
 * reaches the store listing only as a reference the draft names as waiting on the owner.
 */
import brand from '../brand.json';
import { IN_APP } from './inApp.generated';

/**
 * Every brand value the app reads: the owner's decided values (2026-10-08 for NibbleCue's own,
 * the studio's from CuddleCue) and the developer's PROPOSED identifiers, which a development build
 * runs on while the owner has not confirmed them. `PROPOSED_KEYS` says which are which, and a
 * release build refuses to start while any is still proposed (apps/mobile/env.guard.cjs).
 */
export const BRAND = { ...brand.proposed, ...brand.decided };
/** The proposed (not yet owner-confirmed) values, by key. */
export const PROPOSED = brand.proposed;
export const PROPOSED_KEYS: readonly string[] = Object.keys(brand.proposed).filter(
  k => !k.startsWith('$'),
);
/** The in-app tagline (sign-in screen, About). The store's positioning line is BRAND.marketingHeadline. */
export const TAGLINE = brand.tagline;
export const STORE_LIMITS = brand.storeLimits;
/** Where the artwork lives, relative to packages/brand: placeholders until the designer's kit. */
export const BRAND_ASSETS = brand.assets;
/**
 * Chosen by the owner, not yet externally verified. Empty for NibbleCue: the legal entity is the
 * studio's, decided for CuddleCue on 2026-09-21 and the same company (`BRAND.legalEntity`).
 * Anything that lands here is for internal docs, comments and change reports only, never a
 * parent, a policy, an email footer or a store field; brand.test.ts fails the build otherwise.
 */
export const PENDING = brand.pending;

/** A decided or proposed value's key. Notes in the same object (`$…`) are not values. */
export type DecidedKey = Exclude<
  keyof typeof brand.decided | keyof typeof brand.proposed,
  `$${string}`
>;
/** The values the owner has not decided yet. Notes and warnings in the same object are not values. */
export type UnconfirmedKey = Exclude<
  keyof typeof brand.unconfirmed,
  `$${string}` | `${string}Note`
>;

const PLACEHOLDER = /^\{\{.+\}\}$/;
const REFERENCE = /^brand:(.*)$/; // anything with the prefix must resolve — a typo must not reach a console as text
/**
 * A brand value INSIDE a longer text: `{{termsUrl}}` in the App Store description, whose Terms
 * of Use line Apple wants in the text itself (guideline 3.1.2). The same token the legal
 * documents use (`legal.ts`), with this file's rule: a decided or proposed key, never a pending
 * or unconfirmed one. (The legal documents are stricter: decided keys only.)
 */
const INLINE = /\{\{([a-zA-Z]+)\}\}/g;

export function isPlaceholder(value: string): boolean {
  return PLACEHOLDER.test(value);
}

/**
 * The raw value, placeholder and all. A dev build renders `{{NIBBLECUE_APP_STORE_ID}}` visibly so
 * the gap is obvious on screen instead of hidden behind an empty string.
 */
export function unconfirmed(key: UnconfirmedKey): string {
  return brand.unconfirmed[key];
}

/** Throws at build time rather than shipping a placeholder to a user. */
export function required(key: UnconfirmedKey): string {
  const value = brand.unconfirmed[key];
  if (isPlaceholder(value)) {
    throw new Error(
      `brand.json: ${key} is still a placeholder. It is the owner's to set (brand.json unconfirmed.${key}Note).`,
    );
  }
  return value;
}

/** Every `{{key}}` inside a text, resolved to a decided or proposed value; anything else throws. */
function resolveInline(text: string): string {
  return text.replace(INLINE, (_, key: string) => {
    const resolved = (BRAND as Record<string, unknown>)[key];
    if (typeof resolved !== 'string') {
      throw new Error(
        `"{{${key}}}" does not reference a decided or proposed brand value (brand.json.${key})`,
      );
    }
    return resolved;
  });
}

/**
 * Resolve `brand:<key>` references to brand.json values, recursively, and `{{key}}` inside a
 * longer text. The store listing carries its URLs, addresses and proposed lines as references
 * rather than copies, so a change stays a one-file edit. A decided key resolves, and so does a
 * PROPOSED one, because a development build runs on the proposals (`BRAND`); the listing names
 * every proposal it references in `$meta.waitingOnOwner`, and brand.test.ts holds that list to
 * the references, so a draft cannot pass for a finished listing. A pending or unconfirmed value
 * never resolves: it cannot reach a store field this way, by construction rather than by review.
 */
export function resolveBrandRefs<T>(value: T): T {
  if (typeof value === 'string') {
    const match = REFERENCE.exec(value);
    if (!match) return resolveInline(value) as unknown as T;
    const key = match[1] ?? '';
    const resolved = (BRAND as Record<string, unknown>)[key];
    if (key.startsWith('$') || typeof resolved !== 'string') {
      throw new Error(
        `"${value}" does not reference a decided or proposed brand value (brand.json.${key})`,
      );
    }
    return resolved as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map(item => resolveBrandRefs(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>))
      out[k] = resolveBrandRefs(v);
    return out as T;
  }
  return value;
}

/**
 * The only brand strings the app itself renders: short name only, never the store title.
 *
 * `store-listing.json`'s `inApp`, references resolved, read from its generated copy
 * (`inApp.generated.ts`, `tools/gen-app-slices.mjs`): the app imports this file, and an imported
 * JSON file is bundled whole, the App Store, Play, website and email drafts with it. The whole
 * listing is `STORE_LISTING` in `./listing`, imported by path.
 */
export const IN_APP_STRINGS = resolveBrandRefs(IN_APP);

/**
 * The Terms of Use and the Privacy Policy, rendered from `legal/*.json` (legal.ts says why).
 * NibbleCue has no Community, so there are no Community guidelines to export.
 */
export {
  LEGAL_VERSION,
  PRIVACY,
  TERMS,
  renderLegalText,
  type LegalDocument,
  type LegalSection,
} from './legal';

/** What deleting an account does, for the app's screen and the website's page alike. */
export { ACCOUNT_DELETION } from './accountDeletion';
