/**
 * THE TOKEN IN AN INVITE LINK, whichever form the link came in (the owner's report of 2026-09-29).
 *
 * `AuthContext` read only `<scheme>://invite/<token>`. Family shared that form, and it opens the app
 * where the app owns the scheme — a store build, and the in-app test backend's own
 * `cuddlecue-mock://`. It did nothing in the other forms the deep-link table already reads
 * (`app/linking.ts` `pathOf`): Expo Go's `exp://<dev server>/--/invite/<token>`, the only form an
 * invite can take on the phone the owner tests with, and the universal link on the website's host,
 * which a message app shows as a link where it will not show a custom scheme. All of them reach the
 * same token now, and nothing else is taken for one.
 *
 * THE LINK FAMILY SHARES (the owner, 2026-09-29: *"Make sure the email invite also works, and
 * bypasses the need to enter 6 random digit"*) is `https://<host>/app/invite/#<token>`:
 *   · an https address is a link in every mail and message app, where `cuddlecue://` is plain text
 *     in most of them;
 *   · with the app installed and the website's link files up (docs/LAUNCH_GUIDE.md Step 4.6) it
 *     opens the app; without, it opens the website's invite page, which offers the app;
 *   · the token rides after the `#`, which a browser never sends to a server, so it is in no web
 *     log and no referrer, and the website needs no rewrite rule to serve the page.
 * In Expo Go the shared link is Expo Go's own form instead, the one form that opens it. Whatever a
 * message app does with either, the whole message can be pasted into Join a household
 * (`inviteTokenIn`).
 *
 * Pure: the scheme, the host and Expo Go's address are handed in, so node tests every form.
 */
import { pathOf } from '../app/linking';

/** What the server accepts (`accept-invite`, `check_invite`): 16 to 128 URL-safe characters. */
const TOKEN = /^[A-Za-z0-9_-]{16,128}$/;

export interface InviteLinkContext {
  scheme: string;
  host: string;
}

export function inviteTokenOf(url: string, ctx: InviteLinkContext): string | null {
  const trimmed = url.trim();
  // any scheme's own form: the app's, and the in-app test backend's
  const own = /^[a-z0-9.+-]+:\/\/invite\/([^/?#]+)/i.exec(trimmed)?.[1];
  const token =
    own ??
    (() => {
      const parsed = pathOf(trimmed, { ...ctx, knownChildIds: [] });
      const seg = parsed?.path.split('/').filter(Boolean) ?? [];
      if (seg[0] !== 'invite') return undefined;
      if (seg.length === 2) return seg[1];
      // the shared form: the token after the `#`, where no server sees it
      if (seg.length === 1) return trimmed.split('#')[1];
      return undefined;
    })();
  return token !== undefined && TOKEN.test(token) ? token : null;
}

/**
 * The link to share for a token: Expo Go's own address while the app runs in Expo Go
 * (`expoGoBase` is its `linkingUri`, `exp://<dev server>/--/`), the website's otherwise.
 */
export function inviteShareLink(
  token: string,
  ctx: { host: string; expoGoBase: string | null },
): string {
  const base = ctx.expoGoBase?.trim() ?? '';
  const expo = /^(exps?:\/\/[^/?#]+)(?:\/--\/?)?/i.exec(base)?.[1];
  if (expo) return `${expo}/--/invite/${token}`;
  return `https://${ctx.host}/app/invite/#${token}`;
}

/**
 * THE INVITE IN SOMETHING PASTED, whole message or bare link: the first link in it that carries a
 * token, in any of the forms above. Null when nothing in it is one, which is what a code gives.
 */
export function inviteTokenIn(text: string, ctx: InviteLinkContext): string | null {
  for (const candidate of text.match(/[a-z][a-z0-9.+-]*:\/\/\S+/gi) ?? []) {
    // a sentence can end right after the link: its full stop or bracket is not the token's
    const token = inviteTokenOf(candidate.replace(/[.,;:!?)\]}>'"]+$/, ''), ctx);
    if (token !== null) return token;
  }
  return null;
}
