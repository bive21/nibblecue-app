/**
 * Every string the two shared lists and the catalog behind them put on a screen (WP6b, WP6c,
 * 0017; the prototype's `VIEWS.shoplist`, `VIEWS.tasks` and `VIEWS.supplies`).
 *
 * The voice is the app's — sentence case, plain, US English, a parent at 3 a.m. — and the one
 * sentence that matters more than the rest is `TASKS.footer`: a chore list is not a record of
 * anything that happened to a baby, and the screen says so where somebody will read it rather
 * than in a policy nobody opens.
 */

export const SHOPPING = {
  screenTitle: 'Shopping list',
  share: 'Share',
  clear: (n: number): string => `Clear ${n} bought`,
  clearShort: 'Clear',
  emptyTitle: 'Nothing on the list',
  emptyBody: 'Add an item to start the list.',
  remove: 'Remove from the list',
  added: (title: string): string => `Added ${title}`,
  removed: (title: string): string => `Removed ${title}`,
  undone: 'Back on the list',
  /** With nothing in the catalog the button IS the way to Supplies, and says so. */
  noCatalogHint:
    'Your list is built from Supplies, the things you buy again and again. Add a few there first.',
  /** Today's card: what it says with something on the list, and what it says with nothing. */
  todayToBuy: (n: number): string => `${n} thing${n === 1 ? '' : 's'} to buy`,
  /**
   * The same fact as a figure and its label — `1` over `Thing to buy`.
   *
   * IT IS CAPITALISED NOW AND NOT UPPERCASED (the owner, 2026-09-20: *"fix writing to capital
   * 'Thing to Buy' or 'Things to buy' if more than one"*). It was drawn in the `Label` role,
   * which uppercases — that was the 2026-09-19 ask, when this line sat on a card with no
   * heading of its own. The heading moved INSIDE the card on 2026-09-20 and is itself the caps
   * line, so a second one under it was two shouted lines in a three-line card. One capital is
   * the house rule anyway (CLAUDE.md §6: sentence case) and it is what both of the owner's
   * examples have in common.
   */
  todayToBuyLabel: (n: number): string => (n === 1 ? 'Thing to buy' : 'Things to buy'),
  todayNothing: 'Nothing to buy',
  removeLine: (title: string): string => `Remove ${title} from shopping list`,
  openLine: (title: string): string => `${title}, details`,
  tripSaved: (bought: number, left: number): string =>
    `Trip saved: ${bought} bought${left > 0 ? `, ${left} still on the list` : ''}`,
  tripUndone: 'Trip put back',
  /**
   * WHAT A LINE PUT ON AN "ALL DONE" LIST SAYS (the owner, 2026-09-26: a one-off stayed in the
   * basket of the next list). The trip that ended is saved first, as Clear saves it, and the toast
   * says both halves in one sentence — what was added, and the trip that went — with the Undo that
   * puts the trip back. `added` is the sentence the add would have said on its own.
   */
  newList: (added: string, bought: number): string =>
    `${added} · last trip saved, ${bought} bought`,
  lowHeader: 'Might be running low',
  lowHint:
    'How long it has been since you recorded buying it, against how often you usually do. Arithmetic on your own entries, not a prediction.',
  /**
   * The locked card's heading, under the caption "Might be running low". It said "Knowing what is
   * running low is part of Plus", the caption's words again (2026-09-29, the owner: "this is
   * repetitive"); the lede under it still says what the card works out.
   */
  lowLocked: 'Part of Plus',
  addedToList: (title: string): string => `Added ${title}`,
  offList: (title: string): string => `${title} off the list`,
  qtyUp: 'More',
  qtyDown: 'Fewer',
  tick: (title: string): string => `${title}, in the basket`,

  /* ---------------------------------------------------------------- the 2026-09-19 redesign */

  subtitle: (n: number): string => `Household list · ${n} to buy`,
  /**
   * THE PROGRESS STRIP SAYS A SENTENCE, NOT A PERCENTAGE (the shopping brief §5, "Remove the
   * 0%"). "0%" at the start of a trip is the screen reporting on the parent; "0 of 6 in the
   * basket" is the same arithmetic as a statement of where the trip is, and it is the number a
   * person would say out loud.
   */
  progress: (done: number, total: number): string => `${done} of ${total} in the basket`,
  shopCount: (n: number): string => `${n} shop${n === 1 ? '' : 's'}`,
  toBuyCount: (n: number): string => `To buy · ${n}`,
  grouped: 'Grouped by shop',
  itemCount: (n: number): string => `${n} item${n === 1 ? '' : 's'}`,
  basketHeader: 'In the basket',
  /** A one-off carries no catalog entry. The row says so under the name, with no icon. */
  oneOff: 'One-off',
  oneOffPlaceholder: 'Add a one-off, like bananas or a card',
  oneOffLabel: 'Add a one-off to the list',
  addSupplies: 'Add supplies',
  /** The one add control on the list: opens the combined add sheet. */
  addItem: 'Add item',
  /** Always visible under the list. The longer footnote stays behind the info control. */
  sharedWith: 'Shared with your household.',
  aboutList: 'About this list',
  fromSupplies: 'From supplies',
  fromSuppliesHint: 'Add something from your saved supplies.',
  newItem: 'New item',
  newItemHint: 'Add something just for this list.',
  /**
   * What comes up beside the progress line when a tap here puts the last thing in the basket
   * (2026-09-26, S4). A fact about the list — nothing left on it — never a grade: no praise, no
   * "!" (`CELEBRATION_PRAISE_BANNED`; `listMotion.test.ts` holds it to that).
   */
  allDone: 'All done',
  times: (n: number): string => `×${n}`,
  /** The footnote: what happens to the list after the trip, and who it belongs to. */
  footnote:
    'Unticked items stay on the list for next time. Shared by the household. Nothing here is part of anyone’s record.',
} as const;

export const TASKS = {
  screenTitle: 'To do',
  add: 'Add',
  todayHeader: 'To do',
  /**
   * THE TO DO PAGE'S FIRST GROUP, today's chores over "Not today". It was `todayHeader`, which put
   * "To do" straight under the page's own "To do" (the owner, 2026-09-29, of the same thing on
   * Community: "this is repetitive"). `todayHeader` stays the Today tab's name for its strip.
   */
  todaySection: 'Today',
  notToday: 'Not today',
  emptyTitle: 'Nothing on the list',
  /**
   * TODAY'S STRIP WITH NOTHING IN IT (the owner, 2026-09-21: "show to do module at home even
   * when there is no input yet so user can click on it to find out what this is. when there is
   * nothing just say 'You have no to-do reminders set'"). The row is tappable and opens the
   * list, so an empty strip is the way in rather than a gap where a section would be.
   */
  emptyToday: 'You have no to-do reminders set',
  emptyBody: 'The chores that keep the day working: bottles, pump parts, the diaper bag.',
  newTask: 'New task',
  editTask: 'Edit task',
  what: 'What needs doing',
  whatPlaceholder: 'Wash and prepare the bottles',
  when: 'By',
  anyTime: 'Any time',
  pickTime: 'Pick a time…',
  repeat: 'Repeat',
  who: 'Who',
  anyone: 'Anyone',
  save: 'Save',
  remove: 'Remove',
  done: (title: string): string => `${title}, done`,
  undone: 'Back on the list',
  removed: 'Removed',
  saved: (title: string): string => `${title} saved`,
  late: 'overdue',
  /** A chore's state in its detail line, where there is no tick to show it (a view only member). */
  doneWord: 'done',
  /** What a time does, and what it does not. */
  tick: (title: string): string => `${title}, done`,
  hint: 'Tap the circle to tick a chore off, the chore itself to change it. A task with a time gets one reminder, to whoever it is for; a repeating task comes back tomorrow and nothing nags twice.',
  footer:
    'This is a chore list. It never appears in reports, in a baby’s history, or in anything you export.',
} as const;

/**
 * The supply catalog (0017; the prototype's §17). The voice is the one the feature is for: a
 * person standing in an aisle in front of eleven kinds of diaper, reading this on a phone.
 *
 * NOTHING HERE IS CLINICAL, and that includes the Vitamins category. A vitamin in this catalog
 * is a thing the household buys — a brand, a bottle size, the strength as written on the label —
 * and the fields are the same plain text as Laundry's. No amount is computed and none is
 * suggested (CLAUDE.md §2 rule 4).
 */
export const SUPPLIES = {
  screenTitle: 'Supplies',
  newItem: 'Add a supply',
  editItem: 'Edit supply',
  brandPlaceholder: 'As written on the pack',
  urlPlaceholder: 'Paste it from the store app or site',
  openLink: 'Open the product page',
  save: 'Save',
  remove: 'Remove from supplies',
  saved: (title: string): string => `${title} saved`,
  added: (title: string): string => `Added ${title}`,
  /**
   * A + on the catalog, said where it went (2026-09-26): the page throws the thing into its cart
   * for the eye, and this is the same news for the ear — the toast is read out as it shows.
   * `added` stays for a new supply saved to the catalog, which is a different place.
   */
  addedToList: (title: string): string => `Added ${title} to the shopping list`,
  removed: (title: string): string => `Removed ${title}`,
  undone: 'Back in supplies',
  picker: 'Add to the list',
  pickerSearch: 'Search supplies or type any item',
  pickerAdd: (title: string): string => `${title}, add to the shopping list`,
  pickerDrop: (title: string): string => `${title}, take off the shopping list`,
  pickerDone: (n: number): string => `Done · ${n} on the list`,

  /* ---------------------------------------------------------------- the 2026-09-19 redesign */

  /**
   * THE INTRO IS ONE LINE NOW (the shopping brief §2). The old one was three sentences and the
   * third — "Anyone in the household can read it" — is the footnote's job, said once at the
   * bottom where the rest of the household facts are, rather than twice on one screen.
   */
  lede: 'What this household buys again and again: brand, size, and the detail that matters in the aisle.',
  addSupply: 'Add supply',
  /** The link card at the top: what is on the list, and how something gets onto it. */
  listCount: (n: number): string => `${n} on the shopping list`,
  listCountNone: 'Nothing on the shopping list yet',
  listCountHint: 'Tick a supply below to add it',
  yours: (n: number): string => `Your supplies · ${n}`,
  onListPill: 'On list',
  /** The sort control beside the caption. Persisted, so a household keeps the order it reads in. */
  sortBy: { category: 'By category', az: 'A–Z', shop: 'By shop' },
  sortPick: 'How to sort your supplies',
  /**
   * ADD SUPPLY ASKS WHAT IT IS FIRST (the owner, 2026-09-26: *"after user clicks add supply, the
   * pop up to select which category to add will need to be selected first"*). The sheet opens on
   * the fifteen categories as pictures, and one tap is the form with that shelf chosen. It
   * replaced the page's chip row of every empty category (*"this is too much"*): the parent holding
   * a tub of cream still has somewhere obvious to put it, one tap past the one button.
   */
  kindTitle: 'What are you adding?',
  /** The footnote. One fact about who this belongs to, and one about what it is not. */
  note: 'Shared by the household, not tied to one baby. Nothing here is part of anyone’s record.',
  sheetNote: 'Shared by the household · not part of anyone’s record',

  /* the edit sheet (§3) */
  categoryPick: 'Category',
  categoryPickTitle: 'Pick a category',
  detail: 'Size or detail',
  detailPlaceholder: 'Size 3 (16–28 lb), unscented, 84-count',
  detailHelp: 'The part that gets picked up wrong in the aisle: size, scent, pack count.',
  shopOptional: 'Where you buy it (optional)',
  newShop: 'New shop',
  newShopPlaceholder: 'The shop’s name',
  linkOptional: 'Product link (optional)',
  brandRequired: 'Brand',
  onListSwitch: 'On the shopping list',
  onListSwitchHint: (qty: number, shop: string): string => `Quantity ${qty} · shows under ${shop}`,
  onListSwitchOff: 'Not on the list',
  removeConfirm: 'Remove from supplies?',
  removeConfirmBody:
    'It comes off the shopping list too. Nothing that has already been bought changes.',
  removeConfirmYes: 'Remove',
  cancel: 'Cancel',

  /* the add-to-the-list sheet (§4) */
  pickerSubtitle: 'Tap to add or remove. This stays open.',
  pickerAllCount: (n: number): string => `All · ${n}`,
  /**
   * THE ONE DOOR TO THE CATALOG, and adding a new supply is behind it (the owner, 2026-09-26:
   * *"remove the option for new supply, but keep see all supplies, rename it to manage all
   * supplies, and user can add new supply from there"*). It came here from the shopping list's
   * header on 2026-09-22, under a "New supply" row that opened the form straight from this sheet;
   * two doors to one catalog was one more choice than a parent looking for something to buy
   * needs. What they typed and could not find still goes on the list as a one-off.
   */
  pickerCatalog: 'Manage all supplies',
  pickerCatalogHint: 'Add, edit or remove',
  oneOffEmpty: 'Add a one-off',
  /**
   * SAYS WHERE TO TYPE (the owner, 2026-10-06: "'Add a one-off' need to be made clearer that you need
   * to type the one-off item in the search bar … when you try clicking it nothing happens").
   */
  oneOffEmptyHint: 'Type it in the search box above, then tap here',
  /** Said once the row has been tapped with nothing typed: the box above is waiting. */
  oneOffNudge: 'Type the item in the search box above',
  oneOffAdd: (text: string): string => `Add “${text}” as a one-off`,
  oneOffTypedHint: 'Just for this shopping list',
  pickerNone: 'No matching supplies',
  pickerNoneHint: 'Try a different search term or add it as a one-off.',
} as const;
