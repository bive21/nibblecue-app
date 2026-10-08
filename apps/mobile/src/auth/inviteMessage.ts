/**
 * THE MESSAGE AN INVITE LINK GOES OUT IN, whole: who, where, the link, and the way in when a tap
 * does not open the app (the owner, 2026-09-29: *"Make sure the email invite also works"*).
 *
 * It names the app because it LEAVES the app: BRANDING.md §2's "Shared text" row, the rule the
 * shopping list's signature follows (`lists/signature.ts`). A message that arrives in somebody's
 * mail or chat saying "join Dana's family" and nothing more says nothing about where. This is the
 * one file the Family page reads it from, so the page itself names nothing
 * (`packages/brand/src/placement.test.ts`).
 */
import { BRAND } from '@nibblecue/brand';
import { JOIN } from '../screens/auth/joinCopy';

export const inviteShareMessage = (inviter: string, household: string, link: string): string =>
  JOIN.share.message(inviter, household, BRAND.appDisplayName, link);
