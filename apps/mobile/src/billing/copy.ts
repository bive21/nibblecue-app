/**
 * Every word the subscribe flow puts in front of a parent.
 *
 * THE VOICE IS THE REST OF THE APP'S, and the commercial rules are CLAUDE.md rule 14's: no
 * scarcity, no countdown, no "last chance", no discount offered to somebody trying to leave,
 * and cancellation never obstructed. There is no sentence here that would be embarrassing to
 * read back at 3 a.m., which is the test every other string in this app is held to and is not
 * suspended because this screen is the one that takes money.
 *
 * WHAT IS DELIBERATELY ABSENT: any price. Not one string here types an amount. The figures come
 * from the provider, already formatted by the store, and the screens render them as they arrive
 * (`billing/types.ts` says at length why); the one number a line here is handed that the store did
 * not format is the annual plan's saving, a whole percentage `saving.ts` floors from the store's
 * own two prices.
 */

/** The first stretch of an introductory offer, named from its length in whole months. */
function firstStretch(months: number): string {
  if (months === 1) return 'First month';
  if (months === 12) return 'First year';
  return months % 12 === 0 ? `First ${months / 12} years` : `First ${months} months`;
}

export const BILLING = {
  /**
   * WHAT ONE SUBSCRIPTION COVERS (migration 0101), said wherever Plus is sold: the paywall, the Plan
   * page and the trial-end sheets all render `SubscribePanel`, which carries it over the choices
   * (2026-09-28). It was the trial sheets' line alone, so a parent who met a lock or walked to the
   * Plan page never heard the plan's biggest difference from buying an app per phone: the partner's
   * phone, the grandparents', the night nurse's. One source, and the sheets no longer say it twice.
   */
  household: 'One subscription covers everyone in your household, on every phone.',
  choose: 'Choose a plan',
  subscribe: 'Subscribe',
  subscribing: 'Talking to the store…',
  restore: 'Restore purchases',
  restoring: 'Checking…',
  manage: 'Manage or cancel',
  /**
   * WHAT CANCELING DOES, SAID TRUE (the launch review, 2026-09-27). It said "takes effect at once",
   * which reads as losing Plus the moment the parent cancels. Both stores stop the NEXT renewal and
   * keep the period that was paid for (`CANCELLED_AT_PERIOD_END` is still Plus), so a parent who
   * believed the old line would cancel later than they wanted to, or not at all.
   */
  manageNote:
    'Opens your subscriptions in the store. Canceling there stops the next renewal, and you keep Plus until the end of the period you paid for.',

  /** Period labels. The store's own price string sits beside these, never inside them. */
  perYear: 'a year',
  perMonth: 'a month',
  perMonthEquivalent: (label: string): string => `${label} a month, billed yearly`,
  /**
   * THE ANNUAL PLAN'S SAVING (`saving.ts`): the figure is the floor of the store's own numbers and
   * is only ever handed in, never typed. `saveSpoken` is what a screen reader hears for the struck
   * figure, which the eye reads from the line through it — so the words say what the line means.
   */
  save: (percent: number): string => `Save ${percent}%`,
  saveSpoken: (percent: number, was: string): string =>
    `Save ${percent}% on twelve months at the monthly price, ${was}`,
  introDays: (days: number): string =>
    `${days} ${days === 1 ? 'day' : 'days'} free first, then it renews until you cancel`,
  /**
   * THE MONTHLY PLAN'S FIRST-SUBSCRIPTION OFFER (docs/SUBSCRIPTIONS.md §3c; the owner, 2026-09-28:
   * "after the first month, they get 1 month free of charge"): one payment of the regular monthly
   * price covers the first two months. The price is the store's own string, handed in, and `per` is
   * the period label above. Said only when the store's own amounts show the payment is exactly one
   * regular month (`revenuecatMap.ts`).
   */
  secondMonthFree: (then: string, per: string): string => `Second month free, then ${then} ${per}`,
  /**
   * ANY OTHER FIRST STRETCH a store offers, said as it is: "First 2 months {price}, then {price} a
   * month". Both figures are the store's own strings, handed in; the stretch is named from the
   * store's own period, and `per` is the period label above. Nothing here is a figure.
   */
  introOffer: (months: number, price: string, then: string, per: string): string =>
    `${firstStretch(months)} ${price}, then ${then} ${per}`,
  renews: 'Renews until you cancel',

  /**
   * THE LINE UNDER THE PURCHASE BUTTONS (App Store guideline 3.1.2; the launch review,
   * 2026-09-27): that it renews by itself, what canceling does, and the two documents. The price
   * and the length are the store's own sheet's to say, and the choices above already show the
   * store's formatted figures, so no price is restated here (rule 13). The two names are the
   * documents' own titles; their addresses are read from the brand package where they are drawn.
   */
  renewal:
    'Plus renews automatically until you cancel. Cancel in the store’s settings and you keep Plus until the end of the period you paid for.',
  terms: 'Terms of Use',
  privacy: 'Privacy Policy',

  /** What a parent is told after each outcome. `cancelled` is absent on purpose: it says nothing. */
  purchased: 'You have Plus.',
  already: 'You already have Plus on this account.',
  pending: 'The store is still working on it. Nothing else to do for now.',
  nothing: 'No earlier purchase found on this account.',
  restored: 'Restored. You have Plus.',
  failed: 'The store could not finish that. Nothing was charged.',

  /**
   * The line that keeps a mock honest. Shown wherever a figure came from a provider whose
   * `figuresAreTargets` is set, because a number that reads as a price and is not one is a lie
   * the parent has no way to catch.
   */
  targetsNote:
    'These are the planned figures, not a real offer. This build has no store connected, so nothing here can be bought and nothing can be charged.',

  /** Shown in place of the subscribe controls when there is no store at all. */
  noStoreTitle: 'Subscribing is not open yet',
  noStoreBody:
    'When it is, the store shows the price and handles the payment. Nothing in the app changes for what you already log.',
} as const;

/**
 * REDEEMING A CODE (docs/PROMO_CODES.md; the owner, 2026-09-24: "give 1 month free access with
 * purchase, and I would send the code to them by email").
 *
 * WHAT A CODE GIVES IS NEVER SAID HERE — not "a free month", not "no card", not "renews". Each of
 * those is the offer's, set in the store's console, and they differ by store today: an App Store
 * code can be a month that simply ends, while a Google Play code is a trial that renews unless it
 * is canceled. The store's own screen says which before anything is confirmed, so these lines
 * point at it rather than repeat it. No price appears either (rule 13).
 */
export const REDEEM = {
  /**
   * The quiet line at the foot of the Plan page that opens the code field (the owner, 2026-09-26:
   * *"have coupon to add? after clicked, then enter the coupon code here"*). A question, because it
   * is one a parent can leave unasked; "code" and not "coupon", because it is the word the email,
   * the field and both stores use.
   */
  have: 'Have a code?',
  lede: 'A code from us adds time on Plus. The store checks it and adds the time, the same way it handles a subscription, and your plan here updates once it has.',
  storeShows: 'The store shows what the code gives, and anything it asks, before you confirm.',
  sheetButton: 'Enter your code',
  fieldLabel: 'Your code',
  fieldPlaceholder: 'From the email',
  fieldButton: 'Redeem',
  working: 'Talking to the store…',
  /** After the store took it. The plan screen has the date; this line does not guess one. */
  redeemed: 'Done. Your plan shows the time from the code.',
  refused: 'The store did not take that code. Check it against the email and try again.',
  /** The mock's honesty line, as `BILLING.targetsNote` is for prices. */
  mockNote:
    'This build has no store connected. A code here is taken by a stand-in and changes only this test account.',
  noStoreTitle: 'Codes open when subscribing does',
} as const;
