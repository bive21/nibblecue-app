/**
 * EVERY NAME THE PHONE KNOWS, for the scrub (`@nibblecue/core` `scrubText`): the person's own name
 * and address, every family's name, every baby's. Read from the account the app already holds;
 * nothing is fetched for this, and nothing here is ever sent.
 */
import type { Session } from '../auth/session';
import type { AccountState } from '../auth/providers/types';

export function namesToScrub(account: AccountState | null, session: Session | null): string[] {
  const out: (string | null | undefined)[] = [session?.user.email];
  if (account !== null) {
    out.push(account.profile?.display_name, account.profile?.email);
    for (const m of account.memberships) out.push(m.household_name);
    for (const c of account.children) out.push(c.name);
  }
  return [...new Set(out.filter((n): n is string => typeof n === 'string' && n.trim() !== ''))];
}
