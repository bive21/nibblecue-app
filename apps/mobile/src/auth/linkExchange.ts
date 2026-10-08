/**
 * What an emailed link's return address carries for the PKCE exchange (docs/ACCOUNTS.md §3.3).
 *
 * Auth sends the parent back to `<scheme>://auth/callback?code=…` (or `/auth/recovery`). auth-js
 * 2.116 can add `sb_flow_id=…` to the return address — the id of the flow whose verifier the code
 * must be exchanged with — but only with `experimental.appendPkceFlowIdToRedirects`, which this
 * app does not set: a real Auth server's link carries the code alone (seen 2026-09-25 against
 * GoTrue built from source), and the exchange then uses the newest verifier, which is the one the
 * newest email was sent with. A resend or a second reset makes the older link invalid on the
 * server anyway. When a flow id is there, it is passed on, so the older email of two would still
 * sign in with its own verifier.
 *
 * Pure, so the node suite exchanges a link exactly the way `SupabaseAuthProvider` does.
 */
import { queryOf } from '../lib/url';

/** auth-js's `PKCE_FLOW_ID_PARAM`. */
const PKCE_FLOW_ID_PARAM = 'sb_flow_id';

/** The code and its flow, or null when the link carries no code (an implicit-flow link, or none). */
export function linkExchange(url: string): { code: string; flowId: string | null } | null {
  const query = queryOf(url);
  if (!query.code) return null;
  return { code: query.code, flowId: query[PKCE_FLOW_ID_PARAM] || null };
}
