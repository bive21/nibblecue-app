/**
 * NibbleCue's brand and store-listing guards.
 *
 * Four things this stops:
 *   1. A copy edit that silently breaks a store submission. "NibbleCue - Baby Food Planner" is 29
 *      characters against Apple's and Play's hard limit of 30. One character of headroom: one
 *      extra word, or an en dash written as " – " plus a space, and the upload is rejected.
 *   2. A placeholder, a pending fact or a banned phrase reaching a public surface: "Baby Tracker"
 *      as the positioning line, or a claim about a baby's health.
 *   3. A decided or proposed value typed anywhere but brand.json: the domain, a policy URL, an
 *      address or a native identifier copied into code, config or the listing, where a rename or
 *      the owner's confirmation would miss it.
 *   4. A proposal passing for a decision. brand.json has three states (decided, proposed,
 *      unconfirmed). A proposed value reaches the store listing only as a reference, and the
 *      listing names every proposal it references, so the draft says what it waits on.
 *
 * Run: pnpm test:brand
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import brand from './brand.json';
import listing from './store-listing.json';
import { BRAND, PROPOSED_KEYS, resolveBrandRefs } from './src/index';
import { PRIVACY, TERMS } from './src/legal';

const D = brand.decided;
const PR = brand.proposed;
const P = brand.pending;
const U = brand.unconfirmed;
const L = brand.storeLimits;

const PLACEHOLDER = /^\{\{.+\}\}$/;
const COMPANY_FORM = /\b(LLC|L\.L\.C\.|Inc\.?|Ltd\.?|GmbH|Pty|B\.V\.)\b/;

/** The value keys of a brand.json block: notes (`$…`, `…Note`) are prose, not values. */
const valueEntries = (block: Record<string, unknown>): [string, string][] =>
  Object.entries(block).filter(
    (e): e is [string, string] =>
      typeof e[1] === 'string' && !e[0].startsWith('$') && !e[0].endsWith('Note'),
  );

/** Every string value in a JSON tree that is not a note: keys starting with `$` are notes. */
function shopperStrings(value: unknown, path = ''): [string, string][] {
  if (typeof value === 'string') return [[path, value]];
  if (Array.isArray(value)) return value.flatMap((v, i) => shopperStrings(v, `${path}[${i}]`));
  if (value !== null && typeof value === 'object')
    return Object.entries(value as Record<string, unknown>)
      .filter(([k]) => !k.startsWith('$'))
      .flatMap(([k, v]) => shopperStrings(v, path ? `${path}.${k}` : k));
  return [];
}

/** Every brand key the listing's values reference, as `brand:<key>` or `{{key}}` (notes are prose). */
function referencedKeys(value: unknown): Set<string> {
  const keys = new Set<string>();
  for (const [, text] of shopperStrings(value)) {
    const whole = /^brand:(.*)$/.exec(text);
    if (whole) keys.add(whole[1] ?? '');
    for (const m of text.matchAll(/\{\{([a-zA-Z]+)\}\}/g)) keys.add(m[1] ?? '');
  }
  return keys;
}

/* ---- repository scans ---------------------------------------------------------------
 * The repository root is found by walking up to pnpm-workspace.yaml. */
function repoRoot(): string {
  let dir = dirname(fileURLToPath(import.meta.url));
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const up = dirname(dir);
    if (up === dir) throw new Error('repository root (pnpm-workspace.yaml) not found');
    dir = up;
  }
}
const TEXT = /\.(ts|tsx|js|mjs|cjs|json|toml|ya?ml|sql|html|css|txt|example|swift|kt)$/;
/** Where brand values legitimately live or are quoted: the source itself, and prose. */
const NOT_SCANNED = [
  /^packages\/brand\/brand\.json$/,
  /^docs\//,
  /\.md$/,
  /^prototype\//,
  /lock\.ya?ml$/,
  /package-lock\.json$/,
];
function trackedTextFiles(root: string): string[] {
  /*
    TRACKED **AND** UNTRACKED-BUT-NOT-IGNORED, and the second half is not a nicety.

    `git ls-files` alone reads the INDEX, so a file that is written but not yet `git add`ed is
    invisible to this scan — which means a new screen, page or test can introduce a typed host,
    identifier, pass a full `pnpm verify`, and only go red on the NEXT run, after it has been
    committed and pushed. That happened twice in CuddleCue on 2026-09-22 (generated website
    pages, then a test's describe string) and both times the red landed on a commit that
    had been verified green.

    `--others --exclude-standard` adds exactly the files a commit is about to contain: untracked
    and not matched by a .gitignore. node_modules, build output and the rest stay out because
    they are ignored, so the cost is a handful of paths and the hole closes.
  */
  const args = ['ls-files', '-z', '--cached', '--others', '--exclude-standard'];
  return (
    execFileSync('git', args, { cwd: root, encoding: 'utf8' })
      .split('\0')
      .filter(f => f && TEXT.test(f) && !NOT_SCANNED.some(re => re.test(f)))
      // `git ls-files` reports the INDEX, so a tracked file deleted in the working tree is
      // still listed. That is an ordinary state during any refactor that moves a file, and a
      // brand scan that throws ENOENT on it fails for a reason that has nothing to do with the
      // brand — which is exactly what happened when WP5 moved two reads between folders.
      // A file that is not on disk has no text to offend, so skipping it is also correct.
      .filter(f => existsSync(join(root, f)))
  );
}
/** A comment may name a pending fact; a string may not. Good enough for the file types here. */
function withoutComments(file: string, text: string): string {
  if (/\.(ts|tsx|js|mjs|cjs|css|swift|kt)$/.test(file)) {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  }
  if (/\.sql$/.test(file)) return text.replace(/--.*$/gm, '');
  if (/\.(toml|ya?ml|example)$/.test(file)) return text.replace(/#.*$/gm, '');
  if (/\.html$/.test(file)) return text.replace(/<!--[\s\S]*?-->/g, '');
  return text; // json: no comments, every string is data
}
function scan(needles: [string, string][], stripComments: boolean): string[] {
  const root = repoRoot();
  const offenders: string[] = [];
  for (const file of trackedTextFiles(root)) {
    const raw = readFileSync(join(root, file), 'utf8');
    const text = stripComments ? withoutComments(file, raw) : raw;
    for (const [key, value] of needles) if (text.includes(value)) offenders.push(`${file}: ${key}`);
  }
  return offenders;
}

describe('brand values', () => {
  it('keeps the short name short, because it is what ships on the home screen', () => {
    expect(D.appDisplayName).toBe('NibbleCue');
    expect(D.appDisplayName.length).toBeLessThanOrEqual(12);
    expect(D.appDisplayName).not.toContain(' ');
  });

  it('fits both store title limits', () => {
    expect(D.appStoreTitle.length).toBeLessThanOrEqual(L.appStore.name);
    expect(D.playStoreTitle.length).toBeLessThanOrEqual(L.play.title);
  });

  it('warns that the title has one character of headroom', () => {
    // Not a failure: a deliberate tripwire. If someone shortens the title this test tells them
    // the constraint relaxed; if they lengthen it past 30, the test above fails first.
    expect(D.appStoreTitle.length).toBe(29);
  });

  it('uses the one decided store title on both stores', () => {
    // the owner, 2026-10-08: "NibbleCue - Baby Food Planner"
    expect(D.appStoreTitle).toBe(D.storeTitle);
    expect(D.playStoreTitle).toBe(D.storeTitle);
  });

  it('fits the subtitle and short description limits', () => {
    expect(PR.appleSubtitle.length).toBeLessThanOrEqual(L.appStore.subtitle);
    expect(PR.playShortDescription.length).toBeLessThanOrEqual(L.play.shortDescription);
  });

  it('starts the store title with the brand, so truncation keeps the name', () => {
    expect(D.appStoreTitle.startsWith(D.brand)).toBe(true);
    expect(D.playStoreTitle.startsWith(D.brand)).toBe(true);
  });

  it('names a Plus of its own, never CuddleCue Plus', () => {
    // the owner, 2026-10-08: "this is a different subscription called nibblecue plus"
    expect(D.plusTierName).toBe(`${D.brand} Plus`);
  });

  it('never uses "Baby Tracker" as the product\'s own positioning line', () => {
    // a scoped field is decided, proposed or top level (the tagline); none may be skipped
    const fields = brand.banned.scope.map(field => {
      const value =
        (D as Record<string, string>)[field] ??
        (PR as Record<string, string>)[field] ??
        (brand as Record<string, unknown>)[field];
      expect(typeof value, `${field} must exist to be checked`).toBe('string');
      return [field, String(value)] as const;
    });
    for (const [field, value] of fields) {
      for (const phrase of brand.banned.phrases) {
        expect(value.includes(phrase), `${field} must not contain "${phrase}"`).toBe(false);
      }
    }
  });

  it('keeps the full store title out of in-app copy', () => {
    // in-app strings live in listing.inApp; the store title belongs only to the listing
    const inApp = JSON.stringify(listing.inApp);
    expect(inApp).not.toContain(D.storeTitle);
    expect(inApp).toContain(D.appDisplayName);
  });

  it('signs the sign-in screen with the tagline brand.json holds', () => {
    expect(listing.inApp.signInTagline).toBe(brand.tagline);
  });
});

describe('the three states', () => {
  it('decided holds real values only: no placeholder, no reference, and a company form only as the legal entity', () => {
    for (const [k, v] of valueEntries(D)) {
      expect(v, `decided.${k}`).not.toMatch(PLACEHOLDER);
      expect(v, `decided.${k}`).not.toMatch(/^brand:/);
      // the legal name is the ONE decided value that is a company; a display name never is
      if (k !== 'legalEntity') expect(v, `decided.${k}`).not.toMatch(COMPANY_FORM);
    }
  });

  it('proposed holds real-looking values a dev build can run on, and none of them is also decided', () => {
    for (const [k, v] of valueEntries(PR)) {
      expect(v, `proposed.${k}`).not.toMatch(PLACEHOLDER);
      expect(v, `proposed.${k}`).not.toMatch(/^brand:/);
      expect(v, `proposed.${k}`).not.toMatch(COMPANY_FORM);
      expect(Object.keys(D), `proposed.${k} is decided too`).not.toContain(k);
    }
    expect([...PROPOSED_KEYS]).toEqual(valueEntries(PR).map(([k]) => k));
  });

  it('unconfirmed holds the EAS project, the Apple team, the App Store id and the signing fingerprint', () => {
    // The Apple team is the studio's (the owner, 2026-10-02, for CuddleCue), so it is a real
    // value. The other three wait on accounts NibbleCue does not have yet: `eas init`, the App
    // Store Connect app record and the Play Console app.
    expect(valueEntries(U).map(([k]) => k)).toEqual([
      'easProjectId',
      'appleTeamId',
      'appStoreId',
      'androidSigningSha256',
    ]);
    expect(U.appleTeamId).toMatch(/^[A-Z0-9]{10}$/);
    for (const [k, v] of valueEntries(U)) {
      if (k === 'appleTeamId') continue;
      expect(v, `unconfirmed.${k}`).toMatch(PLACEHOLDER);
      // a NibbleCue placeholder, never a CuddleCue value left over from the seed
      expect(v, `unconfirmed.${k}`).toMatch(/^\{\{NIBBLECUE_/);
    }
  });

  /**
   * ONE NAME, TWO FORMS (the owner, 2026-09-22, for the studio: *"I am not trading as BP&C
   * Studio, but still the official name BP&C Creative Studio"*). `developerName` is the company as
   * a person sees it and `legalEntity` is the same company with its registered suffix, so they
   * differ by that suffix alone. NibbleCue is made by the same company as CuddleCue.
   */
  it('decided holds one company name in two forms: displayed, and with its registered suffix', () => {
    expect(D.legalEntity).not.toMatch(PLACEHOLDER);
    expect(D.legalEntity).toMatch(COMPANY_FORM); // it is a company: that is what a legal name is
    expect(D.legalEntity).not.toBe(D.developerName); // the suffix is the difference
    expect(D.developerName).not.toMatch(COMPANY_FORM); // the displayed name never claims to be one
    // the displayed name is the legal one without its suffix, not a second name
    expect(D.legalEntity.startsWith(D.developerName)).toBe(true);
  });

  it('never writes the retired trading name, anywhere a person or a store can read it', () => {
    const RETIRED = /BP&C Studio/;
    for (const [k, v] of valueEntries(D)) expect(v, `decided.${k}`).not.toMatch(RETIRED);
    expect(JSON.stringify(listing)).not.toMatch(RETIRED);
    for (const doc of [TERMS, PRIVACY]) {
      const text = [
        doc.title,
        ...doc.summary,
        ...doc.sections.flatMap(s => [s.heading, ...s.paragraphs]),
      ].join('\n');
      expect(text, doc.id).not.toMatch(RETIRED);
      // and no document claims a trading name at all
      expect(text.toLowerCase(), doc.id).not.toContain('trading as');
      expect(text.toLowerCase(), doc.id).not.toContain('we trade as');
    }
  });

  it('pending holds nothing today', () => {
    expect(valueEntries(P)).toEqual([]);
  });

  it('identifiers and addresses are well-formed and sit on the decided domain', () => {
    const host = D.universalLinkHost;
    expect(host).toMatch(/^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/);
    for (const url of [
      PR.marketingUrl,
      PR.privacyPolicyUrl,
      PR.termsUrl,
      PR.accountDeletionUrl,
      D.supportUrl,
    ]) {
      const u = new URL(url);
      expect(u.protocol, url).toBe('https:');
      expect(u.host, url).toBe(host);
    }
    // NibbleCue's own pages sit under its marketing URL; the support page is the studio's
    for (const url of [PR.privacyPolicyUrl, PR.termsUrl, PR.accountDeletionUrl]) {
      expect(url.startsWith(`${PR.marketingUrl}/`), url).toBe(true);
    }
    expect(PR.linkPath.startsWith(new URL(PR.marketingUrl).pathname)).toBe(true);
    for (const address of [PR.supportEmail, D.transactionalFromAddress]) {
      expect(address).toMatch(/^[a-z0-9._-]+@/);
      expect(address.endsWith(`@${host}`), `${address} must be on ${host}`).toBe(true);
    }
    expect(PR.urlScheme).toMatch(/^[a-z][a-z0-9+.-]*$/);
    expect(PR.iosBundleId).toMatch(/^[a-z][a-z0-9-]*(\.[a-z][a-z0-9-]*)+$/);
    expect(PR.androidApplicationId).toMatch(/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/);
    expect(PR.iosAppGroup).toBe(`group.${PR.iosBundleId}`);
    // the id `eas init` prints is a UUID; until the owner runs it, a placeholder
    if (!PLACEHOLDER.test(U.easProjectId)) {
      expect(U.easProjectId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    }
  });
});

describe('published copy', () => {
  it('names no company form in the listing, and carries no pending value anywhere in it', () => {
    // the seller field is entered in the consoles by the owner; the listing's copy never
    // names the company, because a parent reads the developer name and the store title
    const all = JSON.stringify(listing);
    expect(all).not.toMatch(COMPANY_FORM);
    for (const [k, v] of valueEntries(P))
      expect(all, `listing must not contain pending.${k}`).not.toContain(v);
  });

  it('carries URLs and addresses in the listing only as references', () => {
    for (const [k, v] of valueEntries(listing.links)) expect(v, `links.${k}`).toMatch(/^brand:/);
  });

  it('references only decided or proposed keys, never a pending or unconfirmed one', () => {
    const allowed = [...valueEntries(D), ...valueEntries(PR)].map(([k]) => k);
    for (const key of referencedKeys(listing))
      expect(allowed, `listing references ${key}`).toContain(key);
    // and the accessor agrees: the whole listing resolves
    expect(() => resolveBrandRefs(listing)).not.toThrow();
  });

  it('lets a proposed value reach the listing only by reference, never typed', () => {
    // A typed proposal would survive the owner changing it in brand.json. Matched as a whole
    // word, so the two-letter monogram is not found inside an ordinary word.
    const all = JSON.stringify(listing);
    for (const [k, v] of valueEntries(PR)) {
      const word = new RegExp(
        `(^|[^A-Za-z0-9])${v.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}($|[^A-Za-z0-9])`,
      );
      expect(word.test(all), `listing types proposed.${k}`).toBe(false);
    }
  });

  it('names every proposal it references as waiting on the owner, and says it is a draft', () => {
    const proposedKeys = valueEntries(PR).map(([k]) => k);
    const used = [...referencedKeys(listing)].filter(k => proposedKeys.includes(k));
    expect([...listing.$meta.waitingOnOwner].sort()).toEqual(used.sort());
    if (used.length > 0) expect(listing.$meta.status).toMatch(/^DRAFT/);
  });

  it('keeps every pending value out of user-facing source files (docs/**, *.md and comments may name it)', () => {
    expect(scan(valueEntries(P), true)).toEqual([]);
  });
});

describe('the single source', () => {
  it('has no domain, URL, address or identifier typed anywhere outside brand.json (docs excluded)', () => {
    const keys = [
      'universalLinkHost',
      'marketingUrl',
      'privacyPolicyUrl',
      'termsUrl',
      'accountDeletionUrl',
      'supportUrl',
      'supportEmail',
      'transactionalFromAddress',
      'iosBundleId',
      'androidApplicationId',
      'iosAppGroup',
      // the legal name: a policy, a footer or a page reads it, never types it
      'legalEntity',
    ] as const;
    expect(
      scan(
        keys.map(k => [k, BRAND[k]]),
        false,
      ),
    ).toEqual([]);
  });

  it('reads the scheme and the identifiers in app.config.ts from brand.json rather than typing them', () => {
    // the URL scheme is the brand word itself, so a text scan would flag every mention of the
    // product; the config is checked structurally instead
    const cfg = readFileSync(join(repoRoot(), 'apps/mobile/app.config.ts'), 'utf8');
    expect(cfg).toContain('@nibblecue/brand/brand.json');
    // `https` is exempt: an Android App Links `data` entry names the PROTOCOL of a URL, which is
    // not an identifier and is not in brand.json. The app's own `scheme:` still may not be typed.
    expect(cfg).not.toMatch(/scheme:\s*['"`](?!https?['"`])/);
    expect(cfg).not.toMatch(/bundleIdentifier:\s*['"`]/);
    expect(cfg).not.toMatch(/package:\s*['"`]/);
    expect(cfg).not.toMatch(
      /process\.env\.(IOS_BUNDLE_ID|ANDROID_APPLICATION_ID|EXPO_PUBLIC_URL_SCHEME)/,
    );
  });
});

describe('store listing drafts', () => {
  const apple = listing.appStore,
    play = listing.play;
  /* A store field is written with references (`brand:<key>`, `{{key}}`) resolved by the accessor.
     A limit counts what the console receives, so the lengths below are measured with every
     reference resolved: a URL is longer than its token. */
  const resolved = (text: string): string => resolveBrandRefs(text);
  const shopper = [
    apple.name,
    apple.subtitle,
    apple.promotionalText,
    apple.description,
    apple.keywords,
    apple.whatsNew,
    play.title,
    play.shortDescription,
    play.fullDescription,
  ].map(resolved);
  /** Everything else a person reads: the app's own strings, the website's and the email's. */
  const elsewhere = shopperStrings({
    inApp: listing.inApp,
    website: listing.website,
    email: listing.email,
  }).map(([path, text]) => [path, resolved(text)] as const);

  it('fits every Apple field', () => {
    expect(resolved(apple.name).length).toBeLessThanOrEqual(L.appStore.name);
    expect(resolved(apple.subtitle).length).toBeLessThanOrEqual(L.appStore.subtitle);
    expect(resolved(apple.promotionalText).length).toBeLessThanOrEqual(L.appStore.promotionalText);
    expect(resolved(apple.description).length).toBeLessThanOrEqual(L.appStore.description);
    expect(resolved(apple.keywords).length).toBeLessThanOrEqual(L.appStore.keywords);
    expect(resolved(apple.whatsNew).length).toBeLessThanOrEqual(L.appStore.whatsNew);
  });

  it('fits every Play field', () => {
    expect(resolved(play.title).length).toBeLessThanOrEqual(L.play.title);
    expect(resolved(play.shortDescription).length).toBeLessThanOrEqual(L.play.shortDescription);
    expect(resolved(play.fullDescription).length).toBeLessThanOrEqual(L.play.fullDescription);
  });

  it("uses the decided title and brand.json's own subtitle and short description", () => {
    expect(apple.name).toBe(D.appStoreTitle);
    expect(play.title).toBe(D.playStoreTitle);
    expect(resolved(apple.subtitle)).toBe(BRAND.appleSubtitle);
    expect(resolved(play.shortDescription)).toBe(BRAND.playShortDescription);
  });

  it('gives the App Store description a working Terms of Use (EULA) and Privacy Policy link', () => {
    // Apple 3.1.2: the Terms of Use in the description or the EULA field. Written as references,
    // so they are brand.json's addresses and never typed copies of them
    expect(apple.description).toContain('Terms of Use (EULA): {{termsUrl}}');
    expect(apple.description).toContain('Privacy Policy: {{privacyPolicyUrl}}');
    expect(resolved(apple.description)).toContain(BRAND.termsUrl);
    expect(resolved(apple.description)).toContain(BRAND.privacyPolicyUrl);
  });

  it('promises nothing NibbleCue does not have: no widgets, no lock screen, no Community, no coins, no trial', () => {
    // CuddleCue's listing carried all of these; NibbleCue has none of them (2026-10-08)
    const absent = [
      /widget/i,
      /lock[- ]?screen|live timer|live activit/i,
      /communit/i,
      /\bcoins?\b|\bNFC\b|sticker/i,
      /\btrial\b|days of (\w+ )?plus|no card/i,
      /\bnight light\b|amber/i,
    ];
    const texts = [...shopper, ...elsewhere.map(([, t]) => t)];
    for (const re of absent) {
      const hit = texts.find(t => re.test(t));
      expect(hit, `listing must not match ${re}`).toBeUndefined();
    }
  });

  it('says every line a person reads without a dash; the store title keeps its hyphen', () => {
    // The owner, 2026-09-27 for the studio: "remove the "-" on the text, feels too AI". The
    // title's short hyphen is the decided store title and stays; a `$` note is the owner's.
    for (const text of shopper) expect(text).not.toMatch(/[—–]/);
    for (const text of shopper.filter(t => t !== D.storeTitle)) expect(text).not.toContain(' - ');
    for (const [path, text] of elsewhere) {
      if (text === D.storeTitle) continue; // the website's hero is the store title itself
      expect(text, path).not.toMatch(/[—–]| - /);
    }
  });

  it('writes its headings in sentence case, never in capitals', () => {
    for (const text of [apple.description, play.fullDescription]) {
      for (const line of text.split('\n')) {
        const words = line.match(/[A-Za-z]{2,}/g) ?? [];
        expect(words.length > 1 && words.every(w => w === w.toUpperCase()), line).toBe(false);
      }
    }
  });

  it('is written in US English', () => {
    const british =
      /\b(colours?|favourites?|cancell(ed|ing)|organis(e|ed|es|ing|ation)|recognis(e|ed|es|ing)|customis(e|ed|es|ing|ation)|analys(e|ed|es|ing)|centres?|grey|licences?|judgements?|behaviours?|programmes?|purée|weaning (off|onto)|nappies|nappy|yoghurt|paediatric\w*|fibre)\b/i;
    for (const text of shopper) expect(text).not.toMatch(british);
    for (const [path, text] of elsewhere) expect(text, path).not.toMatch(british);
  });

  it('does not repeat the title inside the Apple keyword field', () => {
    // Apple already indexes the name and the subtitle; repeating them wastes the 100 characters
    const keywords = apple.keywords.toLowerCase().split(',');
    const titleWords = D.appStoreTitle
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter(Boolean);
    for (const word of titleWords) expect(keywords, word).not.toContain(word);
    expect(apple.keywords.toLowerCase()).not.toContain(D.brand.toLowerCase());
    expect(apple.keywords).not.toMatch(/\s,|,\s/); // spaces around a comma are wasted characters
  });

  it('makes no medical claim anywhere in the listing', () => {
    const banned = [
      /\bdiagnos/i,
      /\btreat(s|ment)?\b/i,
      /\bcure/i,
      /\bmedical advice\b/i,
      /\bprescrib/i,
      /\bdos(e|age|ing)\b/i,
      /\bdose calculator\b/i,
      /\bpredicts? (when|that)\b/i,
      /\brecommend/i,
      /\btells you what to do\b/i,
      /\bAI (coach|advice|guidance|chat)\b/i,
      /\bprevent/i,
      /\bsafe for\b/i,
      /\bhealthier\b/i,
      /\bnutrition(al|ist)?\b/i,
      /\bcalorie/i,
    ];
    /* Saying "never diagnoses and never gives a dose" is the opposite of a claim, and the listing
       needs to be able to say it. So disclaiming sentences are removed before the scan, and a
       disclaimer is recognized only by an explicit negation, not by tone. */
    const NEGATED =
      /(^|\b)(no|not|never|without|does not|doesn't|do not|don't|left out|instead of)\b/i;
    const sentences = [...shopper, ...elsewhere.map(([, t]) => t)]
      .join('\n')
      .split(/(?<=[.!?])\s+|\n+/);
    const claims = sentences.filter(s => !NEGATED.test(s)).join('\n');
    for (const re of banned) {
      const hit = claims.split('\n').find(s => re.test(s));
      expect(hit, `listing claim must not match ${re}`).toBeUndefined();
    }
  });

  it('calls a sign a possible reaction, never an allergy, even in a disclaimer', () => {
    // NibbleCue's own line (2026-10-08): what a parent noticed is "a possible reaction", never an
    // allergy, a diagnosis the app cannot make. "Allergen" (a food) is fine; "allergy" is not.
    for (const text of [...shopper, ...elsewhere.map(([, t]) => t)]) {
      expect(text).not.toMatch(/\ballerg(y|ies|ic)\b/i);
      for (const m of text.matchAll(/\breactions?\b/gi)) {
        expect(
          text.slice(Math.max(0, m.index - 9), m.index),
          text.slice(m.index - 30, m.index + 20),
        ).toBe('possible ');
      }
    }
  });

  it('says out loud that the free plan works, and that NibbleCue Plus is its own subscription', () => {
    for (const t of [apple.description, play.fullDescription]) {
      expect(t.toLowerCase()).toContain('free');
      expect(t).toContain(D.plusTierName);
      expect(t).toContain(`${D.plusTierName} is its own subscription`);
    }
  });

  it('carries the required subscription disclosure', () => {
    for (const t of [apple.description, play.fullDescription]) {
      expect(t.toLowerCase()).toContain('auto-renew');
    }
  });
});
