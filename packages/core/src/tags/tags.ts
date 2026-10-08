/**
 * ── CUECOINS: what the app answers, and what each coin says ──────────────────────────────────
 *
 * The catalog and the URL grammar are in `coins.ts`. This file is the app's side of it: which
 * paths resolve, what a coin's line reads, and the parse that turns a scanned URL into an
 * intent. `docs/NFC_TAGS.md` is the whole specification.
 *
 * A COIN HOLDS A URL AND NOTHING ELSE. No household id, no child id, no account, no key — a
 * coin on a wall is readable by ANY phone that comes near it, including a visitor's and a
 * thief's, so nothing on it may identify a family. What it carries is a target name. Everything
 * private is inside the app's own sign-in, exactly as before.
 *
 * NOR DOES IT NAME A BABY. In a household with more than one, the app asks which one before the
 * quick-log (the spec's §3.2) — so a coin never has to be assigned to a child, by the parent or
 * by us before shipping, and a coin bought for one baby still works for the next.
 *
 * WHY `https://` AND NOT `cuddlecue://`, which is the app's own scheme and would be shorter:
 *
 *   · Android reads an NDEF URL and opens the app itself, through App Links. No NFC library, no
 *     permission, no scanning screen — the coin is a link and this app already routes links.
 *   · iOS reads a tag in the BACKGROUND (iPhone XS and later, phone locked, app closed) only for
 *     a universal link. A custom scheme is never read that way.
 *   · A phone WITHOUT the app opens the website instead of failing, so every coin is also a
 *     small piece of marketing. `cuddlecue://` on a phone with no app does nothing at all.
 *
 * AND IT COSTS NOTHING IN SPEED: the file that claims the URL (assetlinks.json on Android,
 * apple-app-site-association on iOS) is fetched ONCE AT INSTALL and cached, so the tap itself
 * makes no network call and opens no browser. Both are owner actions on the host and must be
 * live before a batch is printed — `docs/NFC_TAGS.md §5`.
 *
 * The custom scheme still resolves the same path, because that is how the app is tested and how
 * a link inside the app can point at one of these.
 */
import { MODULES, type ModuleId } from '../modules/module-registry';
import {
  isTagId,
  RESTOCK,
  TAG_COPY,
  TAG_ID_KEY,
  TAG_SEGMENT,
  type CoinTarget,
  type TagCopy,
} from './coins';

export * from './coins';

/**
 * EVERY TARGET THE APP ANSWERS — wider than the ten we sell, deliberately.
 *
 * The catalog is a product decision; this is a capability. A parent who buys a blank NTAG215 and
 * writes `/t/bath` for the bathroom shelf gets the bath sheet, and nothing had to ship for that
 * to be true. It costs one line and it is the difference between a closed accessory and an open
 * one.
 *
 * Derived from the registry rather than listed, so a module that gains a quick-log gains a coin
 * and one that loses it stops answering — with nothing to remember.
 */
export const COIN_TARGETS: readonly CoinTarget[] = [
  ...MODULES.filter(m => m.quickLog).map(m => m.id),
  // the two that are not quick-log modules: the stash has a screen, restock is not a module
  'stash' as ModuleId,
  RESTOCK,
];

export const isCoinTarget = (id: string): id is CoinTarget =>
  (COIN_TARGETS as readonly string[]).includes(id);

/** The line a coin carries, or null for a target with none. */
export const tagCopy = (id: string): TagCopy | null =>
  (isCoinTarget(id) ? TAG_COPY[id] : undefined) ?? null;

export interface TagScan {
  target: CoinTarget;
  /** The coin's serial, where a run wrote one. Nothing in the app reads it. */
  tagId: string | null;
}

/**
 * A `/t/...` path back into a target, `'unknown'` for a coin this build does not answer, or null
 * when the path is not a coin's at all.
 *
 * THE THREE OUTCOMES ARE DIFFERENT ON PURPOSE (the spec's §3.1). A coin is a physical object
 * that outlives a build: one written for a target a later version retired, or read half-way off
 * a damaged coin, must not open the wrong sheet and log against the wrong thing — so it resolves
 * to `unknown`, and the app says so and lands on Today rather than guessing. A path that is not
 * a coin's is not a coin at all and belongs to whatever else claims it.
 */
export function parseTagPath(
  segments: readonly string[],
  query: Readonly<Record<string, string | undefined>>,
): TagScan | 'unknown' | null {
  if (segments[0] !== TAG_SEGMENT) return null;
  const target = segments[1];
  if (target === undefined || target === '') return 'unknown';
  if (!isCoinTarget(target)) return 'unknown';
  const raw = query[TAG_ID_KEY];
  return { target, tagId: raw !== undefined && isTagId(raw) ? raw : null };
}
