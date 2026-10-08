/**
 * NIBBLECUE'S DEEP LINKS (2026-10-08). The custom scheme (`nibblecue://`, proposed), Expo Go's form
 * (`exp://<server>/--/<path>`) and the universal link under NibbleCue's own path on the studio's
 * domain (`https://<universalLinkHost><linkPath>/<path>`, brand.json) resolve to the same intents.
 *
 * The shape is CuddleCue's (`apps/mobile/src/app/linking.ts` there): pure, every id checked, and
 * anything unknown lands on Today. `pathOf` keeps CuddleCue's contract because the invite links
 * read it (`auth/inviteLink.ts`): an invite made in either app carries a code both apps accept.
 * CuddleCue's own `/app` links are accepted too, so an invite sent from CuddleCue and opened in
 * NibbleCue still joins the family.
 */
import { BRAND } from '@nibblecue/brand';
import { fragmentOf, queryOf } from '../lib/url';

export type LinkIntent =
  | { kind: 'today' }
  | { kind: 'plan'; day?: string }
  | { kind: 'foods' }
  | { kind: 'food'; foodId: string }
  | { kind: 'allergens' }
  | { kind: 'shopping' }
  | { kind: 'noticed' }
  | { kind: 'emergency' }
  | { kind: 'subscription' }
  | { kind: 'auth' }
  | { kind: 'invite' };

export interface LinkContext {
  /** brand.json → urlScheme. */
  scheme: string;
  /** brand.json → universalLinkHost, the studio's domain. */
  host: string;
  /** Kept for CuddleCue's callers; NibbleCue's links name no child. */
  knownChildIds: readonly string[];
  /** The universal-link path this app owns; brand.json → linkPath by default. */
  linkPath?: string;
}

const TODAY: LinkIntent = { kind: 'today' };
const esc = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** The path and query of a link, whichever form it came in; null when it is not ours. */
export function pathOf(
  url: string,
  ctx: LinkContext,
): { path: string; query: Record<string, string> } | null {
  const q = queryOf(url);
  const custom = new RegExp(`^${esc(ctx.scheme)}://([^?#]*)`, 'i').exec(url);
  if (custom) return { path: '/' + (custom[1] ?? '').replace(/^\/+|\/+$/g, ''), query: q };
  const expoGo = /^exps?:\/\/[^/?#]+\/--\/?([^?#]*)/i.exec(url);
  if (expoGo) return { path: '/' + (expoGo[1] ?? '').replace(/^\/+|\/+$/g, ''), query: q };
  for (const prefix of [ctx.linkPath ?? BRAND.linkPath, '/app']) {
    const universal = new RegExp(`^https://${esc(ctx.host)}${esc(prefix)}(/[^?#]*)?`, 'i').exec(
      url,
    );
    if (universal) {
      return { path: (universal[1] ?? '/').replace(/\/+$/g, '') || '/', query: q };
    }
  }
  return null;
}

const FOOD_ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export function resolveLink(url: string, ctx: LinkContext): LinkIntent {
  if (isAuthLink(url)) return { kind: 'auth' };
  const parsed = pathOf(url, ctx);
  if (!parsed) return TODAY;
  const seg = parsed.path.split('/').filter(Boolean);
  switch (seg[0]) {
    case undefined:
    case 'today':
      return TODAY;
    case 'auth':
      return { kind: 'auth' };
    case 'invite':
      return { kind: 'invite' };
    case 'plan': {
      const day = parsed.query['day'];
      return day !== undefined && DAY.test(day) ? { kind: 'plan', day } : { kind: 'plan' };
    }
    case 'foods':
      return { kind: 'foods' };
    case 'food':
      return seg[1] !== undefined && FOOD_ID.test(seg[1])
        ? { kind: 'food', foodId: seg[1] }
        : { kind: 'foods' };
    case 'allergens':
      return { kind: 'allergens' };
    case 'shopping':
      return { kind: 'shopping' };
    case 'noticed':
      return { kind: 'noticed' };
    case 'emergency':
      return { kind: 'emergency' };
    case 'subscription':
    case 'plus':
      return { kind: 'subscription' };
    default:
      return TODAY;
  }
}

/** Auth callbacks carry their result in the query or the fragment; anything else is content. */
export const isAuthLink = (url: string): boolean =>
  /:\/\/auth\//i.test(url) || 'access_token' in fragmentOf(url);
