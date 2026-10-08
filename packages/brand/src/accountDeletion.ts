import brand from '../brand.json';

/**
 * DELETING AN ACCOUNT, in the words NibbleCue's Delete account screen uses, and the words the page
 * at `accountDeletionUrl` (proposed) will use once NibbleCue has pages of its own.
 *
 * Google Play asks every app that makes accounts for a web page where a person can ask for theirs
 * to be deleted (the Data safety form's "delete account URL"). That page names the steps, what is
 * deleted and what is kept, and how long it takes. A parent reads the same things on the Delete
 * account screen. With one text in both places, the page a reviewer checks and the screen a parent
 * uses cannot come to disagree.
 *
 * ONE ACCOUNT, TWO APPS (docs/SERVER.md, the owner, 2026-10-08: "yes, same supabase projects is
 * fine"). NibbleCue signs in to CuddleCue's server with the same account, household and log, so
 * deleting the account here deletes it in CuddleCue too. A parent who uses both must read that
 * before confirming, not find out after. The two Plus subscriptions are separate purchases (the
 * owner, 2026-10-08), and each store subscription is canceled in its store, so the store line
 * names this app's tier and says the other one is canceled the same way.
 */
const PLUS = brand.decided.plusTierName;

export const ACCOUNT_DELETION = {
  /** What goes, and the undo: the screen's first line. */
  what:
    'Your account and, if you are its only member, your household are deleted 14 days after you ' +
    'confirm. Signing in again before then cancels it. That is undo, not a trick. If you also ' +
    'use CuddleCue, it is the same account, so it is deleted there too.',
  /** An owner with other people in the household hands it on first. */
  ownerFirst:
    'If other people are in your household, make one of them the owner first, under Family.',
  /** The store's subscription is the store's to cancel, said plainly. */
  store:
    `Your ${PLUS} subscription is canceled in the App Store or Google Play, and so is a ` +
    'CuddleCue Plus subscription if you have one. We will not pretend deleting the account does ' +
    'it for you, and we will link you straight there.',
} as const;
