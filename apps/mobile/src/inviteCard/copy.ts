/**
 * LOG TOGETHER, IN WORDS (docs/SHARED_CARE.md §6; the owner, 2026-09-28: *"Yes agreed not just
 * week 1"*).
 *
 * IT ASKS, IT DOES NOT ASSUME. "The other parent" takes for granted that there is one, and the
 * card goes to every parent who set up alone, single parents among them. So the body opens with a
 * question the answers finish: *Invite*, *Not now*, or *Just me*, which is the one that ends it
 * for good. A partner is never named, and neither is a role in the family.
 *
 * "FREE ON EVERY PLAN" IS THE ONE PROMISE, and it is exact: a second parent is the free plan's
 * (`canInviteRole`; Family's invite starts on Parent while there is a parent's seat). No price, no
 * plan name and nothing about time running out: the card asks about a family, it does not sell.
 *
 * Sentence case, US English and no dashes, like every string a parent reads at 3 a.m. (though this
 * one only ever appears in the daytime). The product name is never typed here; nothing on the card
 * needs it.
 */
export const INVITE_CARD_COPY = {
  title: 'Log together',
  body: 'Parenting with someone? Share the log so they see every feed and nap on their own phone. Free on every plan.',
  invite: 'Invite',
  /** Said after the label by a screen reader: where the tap goes. */
  inviteHint: 'Opens Family, where you make an invite code or a link.',
  notNow: 'Not now',
  notNowHint: 'Asks again in a month.',
  justMe: 'Just me',
  justMeHint: 'Stops asking. You can invite someone from Family any time.',
} as const;
