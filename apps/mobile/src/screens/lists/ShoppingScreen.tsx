/**
 * The shopping list (0017; redesigned to the shopping brief §5, 2026-09-19): what this household
 * needs THIS trip, ticked off in the aisle.
 *
 * THE LIST STARTS IN SUPPLIES. Everything a household buys again and again lives in the catalog
 * with its brand, its size, its shop and the sentence that stops the wrong box coming home. The
 * way to it is the floating "Add supplies" pill, which is under a thumb wherever the page has
 * been scrolled to; the free-text field is a dashed row under the list, for the birthday card.
 * Order is the instruction here (the owner, 2026-09-16: "what to buy made it seem like that's
 * where the list should be added from, not from the actual supplies list").
 *
 * ONE CARD FOR THE WHOLE TRIP, whatever it walks through. The shops are sub-headings inside it
 * and a hairline is all that stands between one and the next — the owner read a page of per-shop
 * cards as several lists (2026-09-19: "the white background go over everything on the shopping
 * list … otherwise it feels too disjointed"), and the brief says the same thing in §5.
 *
 * FINISHING THE TRIP IS WHAT MAKES THE CATALOG WORTH KEEPING. Every ticked line records the day it
 * went into the basket against its item, which is where "bought 9 days ago" comes from, every
 * ticked line leaves — a one-off with the rest — and anything still unticked stays on the list for
 * next time. One intent, so one Undo puts the whole trip back. A trip is finished by Clear, or by
 * the first thing put on a list that is "All done", which starts the next list (`putOnList`; the
 * owner, 2026-09-26: a one-off had stayed in the basket of the list that came after).
 *
 * WHAT THE REDESIGN REMOVED, and where each thing went:
 *  - the `0%` on the progress card → `2 of 6 in the basket`, which is the number a person says.
 *  - the big "Add supplies" button and its tagline → the FAB pill. This tab KEEPS the tab bar's
 *    own log button, unlike the stash: a parent on the shopping list still logs feeds. The two
 *    are placed so they never overlap (`floatingActionBottom`).
 *  - the "What else to buy" card, its label, its field and its Add button → one dashed row.
 *  - the per-shop cards → sub-headings in the one card.
 *  - `Details` and the `✕` on every row → a tap on the name, and a swipe (`ListRow` says why).
 *
 * SHARE SENDS ONLY WHAT IS LEFT (`shoppingText` in packages/core), with the sizes and the links,
 * as plain text through the platform's own sheet: no app name, nothing that turns a household's
 * list into an advertisement.
 *
 * AND IT IS A LITTLE NICER TO USE THAN IT NEEDS TO BE (the owner, 2026-09-25: *"might not
 * necessarily be useful, but it's cool … Let's try doing everything. I will then review"*). A
 * tick draws itself and is felt; the tick that empties the list sparkles and is felt as a finish;
 * a ticked line keeps its place long enough for that to be seen before the basket takes it; and
 * Share folds a sheet of paper into a plane beside the button and throws it across the page, the
 * share sheet rising once it has gone (2026-09-26). `listMotion.ts` holds the lists' rules and
 * why each one is as short as it is; `paperPlane.ts` in packages/ui holds the plane's. Under reduce
 * motion and in the amber night none of it moves — the lines move on the tap and the sheet opens on
 * the tap, as they always did.
 *
 * AND THE LIST ITSELF MOVES NOW (the owner, 2026-09-26: *"add animation in shopping list to make it
 * more fun"*). A line put on the list here pops into its place, the rows under it sliding down —
 * straight away when it was typed here, once the sheet has gone when it was picked in one, and
 * when the parent comes back to the list when it was added on the Supplies page. A tick throws a
 * few dots in the thing's own color and the line through its words is drawn across; once the list
 * settles the line glides down into the basket, and an untick runs all of it back and glides it up.
 * Clear sweeps the basket off to the side, a line at a time, felt once. And a list with nothing on
 * it shows an empty cart instead of a lone glyph. What is saved, and when, is exactly what it was:
 * every move here is drawn around the same writes, the same undo and the same ids.
 *
 * AND FIVE MORE (the owner, 2026-09-26: *"try everything, if i dont like it, i will ask you to
 * remove"*; `listMotion.ts` has each rule). The first time the list is opened in a run of the app
 * its lines rise in, one after another (S1). A tick throws the thing's picture into the "In the
 * basket" heading, which bounces as it lands (S2). "N to buy" rolls down as a tick lands and up for
 * an untick (S3). The tick that empties the list sends a little cart along the progress line and
 * "All done" up where it stops, once the line has settled into the basket (S4). And a line swiped
 * far enough goes off the edge as its gap closes — the same write and the same Undo as Remove (S5).
 * Under reduce motion and in the amber Night none of it moves, and the haptics are what they were.
 */
import {
  clampShoppingQty,
  groupByShop,
  inTheBasket,
  runningLow,
  shoppingText,
  stillToBuy,
  storeOf,
  supplyLabel,
  toggleOnList,
  TOUR_ANCHOR,
  TOUR_SHARE_SETTLED,
  type ShoppingLine,
  type SupplyItem,
} from '@nibblecue/core';
import {
  AllDoneCart,
  AllDoneWords,
  BodySm,
  BodyStrong,
  Button,
  Card,
  CartBounce,
  CartFlight,
  CountRoll,
  EmptyCart,
  EmptyState,
  Icon,
  Meta,
  PaperPlane,
  ProgressLine,
  RowMotion,
  TabTitle,
  haptic,
  useAccent,
  useTheme,
  type CartThrow,
} from '@nibblecue/ui';
import {
  CART_LAND_MS,
  enterWholeMs,
  motionStill,
  planeLaunch,
  planeOrigin,
  ROW_POP_MS,
  sweepStagger,
  sweepWholeMs,
} from '@nibblecue/ui/layout';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Pressable, Share, StyleSheet, View } from 'react-native';
import { Screen } from '../../app/Screen';
import { useShell } from '../../app/shell';
import type { RootParams } from '../../app/types';
import {
  finishTrip,
  patchShoppingItem,
  putBackTrip,
  putOnList,
  removeShoppingItem,
  restoreShoppingItems,
  tickShoppingItem,
} from '../../data/lists';
import { systemClock } from '../../data/repository';
import type { SupplyItemRow } from '../../db/queries/supplies';
import { useChild } from '../../household/ChildContext';
import { todayIso } from '../../lib/locale';
import { arrivals } from '../../lists/arrivals';
import { shoppingIntro } from '../../lists/intro';
import { listSignature } from '../../lists/signature';
import { SHOPPING, SUPPLIES } from '../../lists/copy';
import { sayPutOn, tripDays } from '../../lists/trip';
import { useShopping, useSupplies } from '../../lists/useLists';
import { usePlan } from '../../plan/PlanProvider';
import { SupplyPickerSheet } from '../../sheets/lists/SupplyPickerSheet';
import { SupplySheet } from '../../sheets/lists/SupplySheet';
import { deviceClock24, useTimeZone } from '../../sheets/quick/prefs';
import { useWriteContext } from '../../sheets/quick/useWriteContext';
import { TourSpot } from '../../tour/TourSpot';
import { useTour } from '../../tour/TourProvider';
import { useToast } from '../../ui/toast';
import { FromPlanCard } from '../nibble/FromPlanCard';
import { ListRow } from './ListRow';
import {
  arrivalDelays,
  AWAY_MS,
  clearFeel,
  DONE_AFTER_MS,
  GLIDE_MS,
  introDelays,
  lineFeel,
  lineMotion,
  OWED_MS,
  owedDraw,
  owedLapse,
  owedStart,
  owedTap,
  placeLines,
  restPlace,
  shareButton,
  shoppingTicks,
  type AwayLine,
  type LinePlace,
  type ListMotionNow,
} from './listMotion';
import {
  CardSection,
  CaptionAction,
  ListCard,
  SectionCaption,
  SectionRows,
  ThrownChip,
} from './parts';
import { useSettling } from './useSettling';

type Nav = NativeStackNavigationProp<RootParams>;

/** The leading glyph a compact `Button` draws (Button.tsx: 18 for `sm`) — where the plane leaves from. */
const SHARE_GLYPH = 18;
/** How long the page's words and cards take to come in once the list is read (2026-10-08). */
const PAGE_FADE_MS = 180;

/** Nothing being swept. */
const NO_SWEEP: readonly ShoppingLine[] = [];
/** Past the last pop or sweep before its lines are let go: a frame or two of slack. */
const MOTION_SLACK_MS = 80;
/** How long the word that a tick throws dots is kept for its tick to read — the write landing. */
const DOTS_WORD_MS = 1200;
/** Nothing in the air over the basket's heading. */
const NO_DROPS: readonly CartThrow[] = [];
/** Nothing going off the edge. */
const NO_AWAY: readonly AwayLine[] = [];
/** The first open's rise, once it is over — or with nothing to rise. */
const NO_INTRO: ReadonlyMap<string, number> = new Map();
const NO_IDS: ReadonlySet<string> = new Set();

export function ShoppingScreen() {
  const t = useTheme();
  const a = useAccent();
  const nav = useNavigation<Nav>();
  const shell = useShell();
  const toast = useToast();
  const plan = usePlan();
  /*
    A VIEW ONLY MEMBER READS THE LIST (the 2026-10-08 scenario finding): what is to buy, what is in
    the basket, how many, with no tick, stepper, Remove, Clear or Add item. The server refuses
    every write of theirs (`app.can_write`), and the write funnel refuses it here first.
  */
  const { canLog, context } = useWriteContext();
  const tour = useTour();
  const timeZone = useTimeZone();
  const { children } = useChild();
  const { lines, read } = useShopping();
  const { items, rows: supplyRows, read: suppliesRead } = useSupplies();
  /*
    NOTHING IS DRAWN FROM AN UNREAD LIST, AND WHAT IS READ FADES IN (the owner, 2026-10-08: "when
    opening the shopping page for the first time, the screen very briefly feels glitchy … can we
    soften this"). Before the two reads came back the page drew "Nothing on the list" and "0 to buy"
    for a frame, then swapped them for the list, and the running-low section popped in on its own a
    moment later. Now the count, the cards and the empty state wait for both reads and come in
    together, over `PAGE_FADE_MS`; the lines' own rise (S1) plays inside that. Still under reduce
    motion and in the amber night, where nothing on this page moves.
  */
  const ready = read && suppliesRead;
  const [pickerOpen, setPickerOpen] = useState(false);
  const [noteOpen, setNoteOpen] = useState(false);
  /** The supply a line's name opens, to correct its size or shop. Adding one is on Supplies. */
  const [target, setTarget] = useState<SupplyItemRow | null>(null);
  const [busy, setBusy] = useState(false);
  // the lines' motion (`listMotion.ts`): nothing moves under reduce motion or in the amber night
  const still = motionStill(t.reduceMotion, t.theme);
  const fade = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!ready) return;
    if (still) {
      fade.setValue(1);
      return;
    }
    Animated.timing(fade, { toValue: 1, duration: PAGE_FADE_MS, useNativeDriver: true }).start();
  }, [ready, still, fade]);
  const faded = { opacity: fade };
  // a tapped line keeps its card until the list settles, then glides to the one it belongs in
  const settling = useSettling<LinePlace>(GLIDE_MS);
  /** The line whose tick finishes the list, from the tap until the next tap. */
  const [burstId, setBurstId] = useState<string | null>(null);
  /** The lines ticked here whose dots are thrown as their ticks draw. */
  const [dotted, setDotted] = useState<ReadonlySet<string>>(() => new Set());
  const dotsEnd = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The basket as Clear took it, drawn while it is swept off (`clearFeel`). */
  const [swept, setSwept] = useState<readonly ShoppingLine[]>(NO_SWEEP);
  const sweepEnd = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** The number of the last plane Share threw (`PaperPlane`'s `launch`). */
  const [plane, setPlane] = useState(0);
  /**
   * The Share button across its taps (`shareButton`): which plane is in the air, and the one send
   * waiting for it to land. Made once, so a plane thrown before a re-render lands on the same one.
   */
  const [shares] = useState(() =>
    shareButton({
      feel: haptic,
      throwPlane: n => setPlane(n),
      later: (fn, ms) => void setTimeout(fn, ms),
    }),
  );
  /** The Share button's own box: where the plane comes out of, measured on the throw. */
  const shareAt = useRef<View>(null);
  /*
    WHETHER THE LIST IS IN FRONT OF THE PARENT: not while a sheet is over it, and not while a page
    is pushed over the tabs — the Supplies page, where a + puts a line on this list out of sight.
    A line that arrives meanwhile waits, shut, and pops in when the list is back (`RowMotion`'s
    `wait`), rather than behind the sheet where nobody sees it.
  */
  const focused = useIsFocused();
  const covered = !focused || pickerOpen || target !== null;

  /*
    THE FIRST OPEN (S1): each line's delay as it rises into its place, the first time the list is
    in front of the parent in this run of the app; then nothing, for the rest of it.
  */
  const [intro, setIntro] = useState<ReadonlyMap<string, number> | null>(null);
  /*
    INTO THE BASKET (S2): the things a tick here threw into the basket's heading, still in the air,
    and one bump per landing for the heading's bounce. Each row hands the view its picture leaves
    from; the heading hands its cart, read as the chip is measured — the first tick of a trip
    brings the heading onto the page in the same render that throws at it. The chips fly in the
    page's overlay (`CartFlight`), and none is drawn while a sheet or a pushed page covers the list.
  */
  const [drops, setDrops] = useState<readonly CartThrow[]>(NO_DROPS);
  const [basketBump, setBasketBump] = useState(0);
  const dropped = useRef(0);
  const iconAt = useRef(new Map<string, View>());
  const iconRefs = useRef(new Map<string, (node: View | null) => void>());
  const basketAt = useRef<View>(null);
  /** The lines taken off here, drawn going off the edge where they stood (S5). */
  const [away, setAway] = useState<readonly AwayLine[]>(NO_AWAY);
  /** The motion's own timers, let go with the screen. */
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  const later = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
  };

  const today = todayIso(new Date(), timeZone);
  const open = stillToBuy(lines);
  const basket = inTheBasket(lines);
  /*
    WHAT TAPS HERE OWE THE WORDS ABOUT THE LIST (S3, S4; `owedDraw`). A tick or an untick leaves a
    note on the tap; the count, redrawn when its write lands, pays it — "N to buy" rolls, and the
    tick that emptied the list starts the cart. Worked out as the list is drawn, so the roll comes
    with the very render that changes the number; a count that changes with nothing owed is set.
  */
  const [owed, setOwed] = useState(() => owedStart(open.length));
  const owedEnd = useRef<ReturnType<typeof setTimeout> | null>(null);
  const said = owedDraw(owed, open.length);
  if (said !== owed) setOwed(said);
  // S4 plays while the list stays finished and in front of the parent, and is cut otherwise
  const doneLive = !covered && open.length === 0;
  /*
    WHERE A LINE IS DRAWN, which is not quite what it is: a line tapped here a moment ago stays in
    the card it was in while its tick draws or runs back, then glides to the other; a basket Clear
    has taken is swept off it; a line taken off here goes off the edge from where it stood
    (`placeLines`). Everything COUNTED on this screen reads `open` and `basket` above — the lines
    as they are.
  */
  const shown = placeLines(lines, settling.places, settling.gliding, swept, away);
  const groups = groupByShop(shown.toBuy);
  /*
    S1, DECIDED IN THE RENDER THAT FIRST DRAWS THE LIST AS READ — so every row's first frame is
    already its rise — and only while the list is in front of the parent. The lines in the order
    they are drawn: the list to buy, shop by shop, then the basket.
  */
  if (intro === null && read && !covered && shoppingIntro.due())
    setIntro(
      introDelays([...groups.flatMap(g => g.lines.map(l => l.id)), ...shown.basket.map(l => l.id)]),
    );
  useEffect(() => {
    if (intro === null) return undefined;
    shoppingIntro.take();
    if (intro.size === 0) return undefined;
    // over once the last line has landed: a row drawn later — a line moved to another shop — is at rest
    const timer = setTimeout(
      () => setIntro(NO_INTRO),
      (still ? 0 : enterWholeMs(intro.size)) + MOTION_SLACK_MS,
    );
    return () => clearTimeout(timer);
  }, [intro, still]);
  /*
    THE LINES PUT ON THE LIST HERE A MOMENT AGO (`lists/arrivals.ts`) that are drawn to buy: each
    pops into its place, one after another in the order they are drawn, and is forgotten once it
    has — so a line redrawn later never pops again.
  */
  const fresh = new Set(arrivals.fresh());
  const popIds = groups.flatMap(g => g.lines.map(l => l.id)).filter(id => fresh.has(id));
  const popDelays = arrivalDelays(popIds);
  const popKey = popIds.join('|');
  const [, setPopsSeen] = useState(0);
  useEffect(() => {
    if (covered || popKey === '') return undefined;
    const ids = popKey.split('|');
    const last = Math.max(0, ...arrivalDelays(ids).values());
    const timer = setTimeout(
      () => {
        arrivals.forget(ids);
        setPopsSeen(n => n + 1);
      },
      still ? 0 : last + ROW_POP_MS + MOTION_SLACK_MS,
    );
    return () => clearTimeout(timer);
  }, [covered, popKey, still]);
  // a list that goes away mid-sweep leaves no timer behind to set state on nothing
  useEffect(
    () => () => {
      if (sweepEnd.current !== null) clearTimeout(sweepEnd.current);
      if (dotsEnd.current !== null) clearTimeout(dotsEnd.current);
    },
    [],
  );
  // nor mid-drop, mid-swipe or with a note owed
  useEffect(() => {
    const running = timers.current;
    return () => {
      for (const id of running) clearTimeout(id);
      running.clear();
      if (owedEnd.current !== null) clearTimeout(owedEnd.current);
    };
  }, []);
  const sweepGap = sweepStagger(swept.length);
  const moving: ListMotionNow = {
    held: settling.places,
    gliding: settling.gliding,
    popping: new Set(popIds),
    swept: new Set(swept.map(l => l.id)),
    away: new Set(away.map(a => a.line.id)),
    intro: intro === null ? NO_IDS : new Set(intro.keys()),
  };
  /** The one ref each row hands the view its picture leaves from, kept per line so it is stable. */
  const iconRefOf = (id: string) => {
    const known = iconRefs.current.get(id);
    if (known !== undefined) return known;
    const ref = (node: View | null) => {
      if (node === null) iconAt.current.delete(id);
      else iconAt.current.set(id, node);
    };
    iconRefs.current.set(id, ref);
    return ref;
  };
  const shops = useMemo(() => new Set(open.map(storeOf)).size, [open]);
  const itemById = useMemo(() => new Map(items.map(x => [x.id, x])), [items]);
  const itemOf = (l: ShoppingLine): SupplyItem | null =>
    l.supplyId == null ? null : (itemById.get(l.supplyId) ?? null);
  const supplyRowOf = (id: string) => supplyRows.find(r => r.id === id);

  // what has not been bought for longer than this household usually goes between buys. Plus, and
  // the section says what it is made of rather than implying the app knows a need.
  const canForecast = plan.can('suppliesForecast');
  const onList = useMemo(
    () => new Set(lines.filter(l => l.supplyId != null).map(l => l.supplyId as string)),
    [lines],
  );
  const low = useMemo(
    () => (canForecast ? runningLow(items, onList, today) : []),
    [canForecast, items, onList, today],
  );

  /**
   * §5: 20 from the right edge, just above the bar. It sat above the log button while this tab kept
   * one (the owner, 2026-09-19: "the + add supplies on the bottom right, is clashing with the quick
   * log + button"); since 2026-09-30 the + is Today's alone ("the + circle icon only from home or
   * today page"), so the pill takes its place, as the stash's always did. `floatingActionBottom` in
   * packages/ui has the arithmetic.
   */
  /**
   * THE BASKET AS A TAP FOUND IT, drawn a moment longer and swept off to the side a line at a time
   * (`clearFeel`, `placeLines`) while the write takes the real lines away: Clear's, and a new list's
   * when a line put on an "All done" list finishes the trip before it. Nothing to sweep under
   * reduce motion or in the amber night — `clearFeel` hands back no lines, and they simply go.
   */
  const sweepOff = (lines: readonly ShoppingLine[]) => {
    if (lines.length === 0) return;
    setSwept(lines);
    if (sweepEnd.current !== null) clearTimeout(sweepEnd.current);
    sweepEnd.current = setTimeout(
      () => {
        sweepEnd.current = null;
        setSwept(NO_SWEEP);
      },
      sweepWholeMs(lines.length) + MOTION_SLACK_MS,
    );
  };

  /*
    A ONE-OFF GOES ON WHEN THE TYPING IS DONE, however it ends (the owner, 2026-09-29, on an
    iPhone: "if user finished typing then click elsewhere on the screen it stays in the box, not
    added to cart"). Enter adds it, and so does leaving the field: a tap anywhere else, Share, the
    back arrow. Enter then leaving is one gesture on a phone that lets the field go on submit, so
    the text on its way in is held here and the second call finds it taken; `busy` alone could not
    say so, because it is set only after the write's context has come back.
  */
  const addingOneOff = useRef(false);
  const addOneOff = async (title: string) => {
    const clean = title.trim();
    if (clean.length === 0 || busy || addingOneOff.current) return;
    addingOneOff.current = true;
    try {
      await putOneOff(clean);
    } finally {
      addingOneOff.current = false;
    }
  };
  const putOneOff = async (clean: string) => {
    const ctx = await context();
    if (ctx === null) return;
    setBusy(true);
    const { db, ...w } = ctx;
    // the basket as it is drawn now: swept off if this line starts a new list (`putOnList`)
    const was = basket;
    const r = await putOnList(db, systemClock, { ...w, ...tripDays(timeZone), title: clean });
    setBusy(false);
    if (!r.committed) return;
    // a line on the list is what the tour's shopping card asks for before Share (`tour/steps.ts`)
    tour?.did('shop:add');
    // it pops into its place when the list draws it (`lists/arrivals.ts`)
    arrivals.note(r.itemId);
    // and the trip it ended goes the way Clear's does, felt as nothing more: the add was the tap
    if (r.finished !== null) sweepOff(clearFeel(was, still).swept);
    sayPutOn(toast, SHOPPING.added(clean), r.finished, trip =>
      putBackTrip(db, systemClock, { ...w, trip }),
    );
  };

  /** On the list, or off it again — the intent is core's (`toggleOnList`), the write is here. */
  const toggle = async (item: SupplyItem) => {
    const ctx = await context();
    if (ctx === null) return;
    const { db, ...w } = ctx;
    const intent = toggleOnList(item.id, lines);
    const label = supplyLabel(item);
    if (intent.action === 'remove') {
      await removeShoppingItem(db, systemClock, { ...w, itemId: intent.lineId });
      toast.show(SHOPPING.offList(label));
      return;
    }
    /*
      A + ON AN "ALL DONE" LIST STARTS A NEW ONE: the trip that ended is finished first, as Clear
      finishes it, its one-offs with it, and the toast says so with an Undo (`putOnList`; the
      owner's report of 2026-09-26). A line in the basket no longer counts as on the list, so this
      + adds rather than taking a bought line back out of the basket (`toggleOnList`).
    */
    const r = await putOnList(db, systemClock, {
      ...w,
      ...tripDays(timeZone),
      title: label,
      supplyId: item.id,
    });
    /*
      THE TOUR IS LISTENING FOR THIS: its shopping card asks for something to be put on the list
      before it asks for Share (the owner, 2026-09-25: "before user shares, they first need to add
      the supplies to the shopping cart"). Reported once the line is written, from the one place
      the Add supplies picker, the supply sheet and "running low" all put a supply on the list.
    */
    if (r.committed) tour?.did('shop:add');
    // it pops into its place when the list draws it — here, once the sheet it was picked in has gone
    if (r.committed) arrivals.note(r.itemId);
    sayPutOn(toast, SHOPPING.addedToList(label), r.finished, trip =>
      putBackTrip(db, systemClock, { ...w, trip }),
    );
  };

  const tick = async (id: string, checked: boolean) => {
    /*
      WHAT THE TAP DOES BEFORE THE WRITE LANDS (`lineFeel`): it is felt — a tap, or a finish for
      the line that empties the list — the finishing tick gets its sparkle and every other tick its
      dots, and the line keeps its card so its tick is seen drawing, or running back. All of it is
      set NOW, on the parent's own tap, so the render that brings the line back changed already has
      it; a tick arriving from the other phone goes through none of this and is simply drawn.

      A TAP NEVER MOVES A LINE: it is held in the card it is drawn in now — the one it was held in
      already, for a line tapped twice before the list settled — and glides to where it belongs
      once the parent pauses (`useSettling`, `placeLines`).
    */
    const feel = lineFeel(shoppingTicks(lines), id, checked, still);
    if (feel.haptic !== null) haptic(feel.haptic);
    setBurstId(feel.burst ? id : null);
    if (feel.dots) {
      setDotted(s => new Set(s).add(id));
      // the word is read as the tick draws, a moment from now; after that it is let go, so a tick
      // arriving later from the other phone is drawn and never thrown dots
      if (dotsEnd.current !== null) clearTimeout(dotsEnd.current);
      dotsEnd.current = setTimeout(() => {
        dotsEnd.current = null;
        setDotted(new Set());
      }, DOTS_WORD_MS);
    }
    const line = lines.find(l => l.id === id);
    const where: LinePlace =
      settling.places.get(id) ?? (line === undefined ? 'toBuy' : restPlace(line));
    if (feel.settleMs > 0) settling.hold(id, feel.settleMs, where);
    else settling.release(id);
    // the count this tap changes rolls when its write lands, and the finish starts the cart (S3, S4)
    setOwed(o => owedTap(o, feel.finish));
    if (owedEnd.current !== null) clearTimeout(owedEnd.current);
    owedEnd.current = setTimeout(() => {
      owedEnd.current = null;
      setOwed(owedLapse);
    }, OWED_MS);
    // and the thing goes into the basket ahead of its line (S2)
    if (feel.drop) dropIntoBasket(id, line);
    const ctx = await context();
    if (ctx === null) return;
    const { db, ...w } = ctx;
    await tickShoppingItem(db, systemClock, { ...w, itemId: id, checked });
  };

  /**
   * S2: THE THING GOES INTO THE BASKET. Its picture — the category square on its row, or a one-off's
   * tick — is thrown from the row into the "In the basket" heading on the tap (`CartFlight`), and
   * the heading's cart bounces as it lands (`CartBounce`), `CART_LAND_MS` later: before the line
   * itself settles and glides down after it. Felt as nothing more: the tap was felt. A chip that
   * cannot be measured is not drawn, and the bounce keeps to this clock either way.
   */
  const dropIntoBasket = (id: string, line: ShoppingLine | undefined) => {
    dropped.current += 1;
    const n = dropped.current;
    const item = line === undefined ? null : itemOf(line);
    setDrops(list => [
      ...list,
      {
        id: n,
        at: Date.now(),
        from: iconAt.current.get(id) ?? null,
        to: basketAt,
        chip: <ThrownChip category={item?.category ?? null} />,
      },
    ]);
    later(() => {
      setDrops(list => list.filter(d => d.id !== n));
      setBasketBump(b => b + 1);
    }, CART_LAND_MS);
  };

  /** The stepper, on the same bound the write uses — the row mutes its ends at the same two. */
  const setQty = async (id: string, next: number) => {
    const qty = clampShoppingQty(next);
    const ctx = await context();
    if (ctx === null) return;
    const { db, ...w } = ctx;
    await patchShoppingItem(db, systemClock, { ...w, itemId: id, qty });
  };

  const removeLine = async (id: string, title: string) => {
    const ctx = await context();
    if (ctx === null) return;
    const { db, ...w } = ctx;
    // the line as it stood, and where: drawn back there while it goes (S5)
    const at = lines.findIndex(l => l.id === id);
    const was = lines[at];
    const r = await removeShoppingItem(db, systemClock, { ...w, itemId: id });
    if (!r.committed) return;
    /*
      S5: IT GOES OFF THE EDGE AND ITS GAP CLOSES — a swipe let go, Remove, the ✕ or the last −,
      every way this list takes a line off. Drawn only once the write has landed, so a line that
      could not be taken off is never drawn going. Under reduce motion and in the amber Night it is
      simply gone. The write and the Undo are the ones this list always had.
    */
    const going = !still && was !== undefined;
    if (going) {
      setAway(list => [...list.filter(a => a.line.id !== id), { line: was, at }]);
      later(() => setAway(list => list.filter(a => a.line.id !== id)), AWAY_MS + MOTION_SLACK_MS);
    }
    const gone = Date.now() + (going ? AWAY_MS + MOTION_SLACK_MS : 0);
    toast.show(SHOPPING.removed(title), {
      undo: () => {
        /*
          NOT BEFORE IT HAS FINISHED GOING: a line brought back mid-flight would be the same row,
          still shut. Its own timer, not the screen's — an Undo outlives the screen that offered it
          — and it pops back into its place when the list draws it (`lists/arrivals.ts`).
        */
        setTimeout(
          () => {
            arrivals.note(id);
            void restoreShoppingItems(db, systemClock, { ...w, itemIds: [id] }).then(() =>
              toast.show(SHOPPING.undone),
            );
          },
          Math.max(0, gone - Date.now()),
        );
      },
    });
  };

  /**
   * CLEAR, ON THE BASKET'S OWN HEADING (§5). Every ticked line leaves the list — a one-off with the
   * rest, because it was never a thing this household buys — and each bought supply records the day
   * it went into the basket. ONE intent (`finishTrip`), so the toast's Undo puts back both halves.
   *
   * This is `finishTrip` under the word a parent would use for it. The old screen had BOTH — a
   * "Clear" that threw the basket away without recording anything and a "Finish the trip" that
   * recorded it — and the difference between them was invisible until afterwards. It is also what
   * a line put on an "All done" list does first (`putOnList`), so a new list never starts with the
   * last trip's one-off still in its basket (the owner's report, 2026-09-26).
   */
  const clear = async () => {
    if (busy || basket.length === 0) return;
    const ctx = await context();
    if (ctx === null) return;
    setBusy(true);
    const { db, ...w } = ctx;
    /*
      THE TRIP, FELT ONCE AND SWEPT OFF (`clearFeel`; the owner, 2026-09-26). One `success` on the
      tap — a trip finished — and the basket as the tap found it is swept off, a beat between each
      line, while the write below takes the real lines away. Under reduce motion and in the amber
      night it is felt and the lines simply go.
    */
    const feel = clearFeel(basket, still);
    haptic(feel.haptic);
    sweepOff(feel.swept);
    const r = await finishTrip(db, systemClock, { ...w, ...tripDays(timeZone) });
    setBusy(false);
    if (!r.committed) return;
    const trip = r.trip;
    toast.show(SHOPPING.tripSaved(trip.lineIds.length, trip.left), {
      undo: () => {
        void putBackTrip(db, systemClock, { ...w, trip }).then(() =>
          toast.show(SHOPPING.tripUndone),
        );
      },
    });
  };

  /**
   * The message names the baby it is for and signs itself. `children` and not the selected child:
   * the shopping list belongs to the household, so a parent looking at one twin still sends a
   * list for both. The name comes from the household's own record, the app's name from the brand
   * file, and the timestamp from this phone's clock.
   */
  const share = () => {
    // a plane is in the air: a second tap would throw a second plane and ask for a second sheet
    if (shares.waiting()) return;
    /*
      THE TOUR IS LISTENING FOR THIS. Its last shopping card asks the parent to tap Share and
      used to have no way of knowing they had — so doing what the card said left the card sitting
      there, and the only way on was the chevron (core's `TourAction` `share` has the report).
      Reported BEFORE the sheet opens, because the platform sheet is modal and a parent who
      dismisses it without choosing an app has still done the thing the card asked about.
    */
    tour?.did('share');
    const send = () => {
      void Share.share({
        message: shoppingText(lines, {
          childNames: children.map(c => c.name),
          madeBy: listSignature(Date.now(), deviceClock24(), timeZone),
        }),
      })
        .catch(() => undefined)
        /*
          …AND AGAIN WHEN THE CALL HAS SETTLED, sent or dismissed: the tour's closing card holds its
          confetti until the sheet is gone (the owner, 2026-09-27: "when i return back from share
          page, it's gone"). On iOS this is the sheet closing; on Android only the chooser being
          asked for, and the app coming back is the rest (`tour/finale.ts`).
        */
        .then(() => tour?.did(TOUR_SHARE_SETTLED));
    };
    /*
      WHAT THE TAP DOES (`shareButton`, `planeLaunch`; the owner, 2026-09-26: "make it look more
      better and feel better"). With a plane, the paper comes out of the button on the next frame;
      its first crease is felt as a tap and the throw as a success — a list sent is a thing finished
      (`haptics.ts`).

      AND THE SHEET WAITS FOR THE PLANE TO BE GONE (the owner, the same day, on an Android phone:
      "can we wait until animation complete, then pop up show up? the plane is still in the 'x of x
      in (THE) basket' … when we close the share log it's just gone"). It was asked for 480 ms into
      a 900 ms flight; Android's sheet is another activity, so the app paused with the plane frozen
      over the progress card, and it had simply vanished when the sheet closed. Now it is asked for
      when `PaperPlane` says the plane has landed — off the page, 700 ms after the tap — or at the
      plan's `shareBy` if that is never heard, so a list is always sent. Under reduce motion and in
      the amber night there is no plane and nothing waits: the send is felt, and the sheet opens, on
      the tap. Nothing is canceled if the tab goes away meanwhile: the tap asked for the sheet.
    */
    shares.tap(planeLaunch(t.reduceMotion, t.theme), send);
  };

  const rowFor = (l: ShoppingLine, prefix: string) => {
    const item = itemOf(l);
    const place: LinePlace = prefix === 'shopping.basket' ? 'basket' : 'toBuy';
    // what the line is doing where it is drawn: popping in, gliding across, swept off, or resting
    const motion = lineMotion(l, place, moving);
    const sweptAt = swept.findIndex(x => x.id === l.id);
    return (
      <RowMotion
        key={l.id}
        motion={motion}
        // a line that arrives behind a sheet, or under the Supplies page, pops once the list is back
        wait={covered && motion === 'pop'}
        delay={
          motion === 'pop'
            ? (popDelays.get(l.id) ?? 0)
            : motion === 'sweep'
              ? Math.max(0, sweptAt) * sweepGap
              : motion === 'enter'
                ? (intro?.get(l.id) ?? 0)
                : 0
        }
      >
        <ListRow
          line={l}
          item={item}
          onTick={next => void tick(l.id, next)}
          onQty={next => void setQty(l.id, next)}
          onRemove={() => void removeLine(l.id, l.title)}
          burst={burstId === l.id}
          dots={dotted.has(l.id)}
          iconRef={iconRefOf(l.id)}
          readOnly={!canLog}
          onOpen={
            item === null || !canLog
              ? undefined
              : () => {
                  const row = supplyRowOf(item.id);
                  if (row !== undefined) setTarget(row);
                }
          }
          testID={`${prefix}.${l.id}`}
        />
      </RowMotion>
    );
  };

  return (
    // a TAB, not a pushed page (2026-09-16): no Back in the bar, and the tab bar stays under it
    <Screen
      testID="shopping"
      overlay={
        <>
          <CartFlight throws={covered ? NO_DROPS : drops} />
          {/* the paper plane's sky: over the whole page and every card on it, taking no touches;
              its landing is what the share sheet waits for */}
          <PaperPlane
            launch={plane}
            from={shareAt}
            at={planeOrigin(t.space.xl, SHARE_GLYPH, t.hit.min)}
            onLanded={shares.landed}
          />
        </>
      }
    >
      {/* §5: the title, what the list is, and the two errands that are not "buy things". The
          tab's own title, 28 (`TabTitle`; docs/DESIGN_SYSTEM.md §4.1 rule 1, 2026-09-30). */}
      <View style={[styles.titleRow, { gap: t.space.md }]}>
        <View style={styles.grow}>
          <TabTitle>{SHOPPING.screenTitle}</TabTitle>
          {/* rolls down a number as a tick here lands, up for an untick (S3) */}
          <Animated.View style={faded}>
            <CountRoll variant="meta" ink="text2" value={open.length} bump={said.roll}>
              {SHOPPING.subtitle(open.length)}
            </CountRoll>
          </Animated.View>
        </View>
        {/*
          ONE BUTTON HERE NOW, AND IT IS SHARE (the owner, 2026-09-22: *"on the page next to
          share button, we can remove the supplies button, and move it to inside the add to the
          list page, under new supply we can add one more button to see full supplies list"*).
          Supplies is a catalog you edit, not an errand you run from a shopping list, and two
          secondary buttons beside a page title made neither of them read as the main one. It is
          "Manage all supplies" in the picker, which is the only place a parent wants it: the moment
          they are looking for something that is not in the list yet (and since 2026-09-26 the only
          way in to add a new one — the picker's own "New supply" row went).

          THE ICON AND THE WORD BOTH STAY (the owner, 2026-09-19: "fix the icon for the share
          button, this is wrong icon"). The download arrow it wore is `export`, an arrow INTO a
          tray — right for "get a copy of your data" and exactly backwards for sending a list to
          somebody. `share` is its own glyph, and the word beside it is what settles it either
          way.

          THE PLANE LEAVES FROM THE GLYPH (2026-09-25) AND FLIES OVER THE PAGE (2026-09-26): the
          paper comes out of the share icon a compact button draws `space.xl` in from its edge at
          18, folds in the gap to its left and is thrown across the page. It is drawn in the
          overlay, not here: beside the button, inside the ScrollView, it was clipped at the top
          bar's edge the moment it climbed, and the cards under the title would have covered its
          dive. This view is only what it measures, on the throw — the tour's ring still measures
          the button alone.
        */}
        <View ref={shareAt} collapsable={false}>
          <TourSpot id={TOUR_ANCHOR.shopShare} radius={t.radius.pill}>
            <Button
              label={SHOPPING.share}
              icon="share"
              variant="secondary"
              size="sm"
              onPress={share}
              testID="shopping.share"
            />
          </TourSpot>
        </View>
      </View>

      {/* NIBBLECUE: the meal plan's foods, ready to put on the list (`FromPlanCard`) */}
      <FromPlanCard />

      {/* how far through the trip, and how many shops it walks through */}
      {ready && lines.length > 0 ? (
        <Animated.View style={faded}>
          <Card testID="shopping.progress" radius="l">
            <View style={{ gap: t.space.sm }}>
              <View style={[styles.titleRow, { gap: t.space.md }]}>
                <BodyStrong style={styles.grow}>
                  {SHOPPING.progress(basket.length, lines.length)}
                </BodyStrong>
                {shops > 0 ? <Meta>{SHOPPING.shopCount(shops)}</Meta> : null}
                {/* S4: where the shop count stood — there is none with nothing left to buy — "All
                  done" comes up as the cart stops under it, and goes */}
                <AllDoneWords run={said.done} live={doneLive} delay={DONE_AFTER_MS}>
                  {SHOPPING.allDone}
                </AllDoneWords>
              </View>
              <View>
                <ProgressLine
                  value={lines.length === 0 ? 0 : basket.length / lines.length}
                  color={a.accent}
                  testID="shopping.progress.bar"
                />
                {/* S4: the little cart, rolling along the line once the last line has settled */}
                <AllDoneCart run={said.done} live={doneLive} delay={DONE_AFTER_MS} />
              </View>
            </View>
          </Card>
        </Animated.View>
      ) : null}

      {ready && lines.length === 0 && swept.length === 0 ? (
        /* THE EMPTY STATE CARRIES THE WAY OUT OF IT (the owner, 2026-09-19: "it needs a clearer
           button to add supplies inside the nothing on the list box when there is nothing"). The
           floating pill does the same job, but at the bottom of a screen whose whole content is
           one small card at the top — so the one place a parent is looking had nothing to tap.
           With an empty catalog it goes to Supplies instead of opening a picker over nothing.

           AND IT HAS A PICTURE (2026-09-26): an empty cart, still, drawn from the icon set in the
           household's colors, with a bottle over it and a dotted path into the basket — the next
           thing to do, and the words under it are the ones it always had (`EmptyCart`). It waits
           for a Clear's sweep to finish, so the basket leaving and the cart arriving are not one
           jumble. */
        <Animated.View style={faded}>
          <EmptyState
            icon="cart"
            art={<EmptyCart testID="shopping.empty.art" />}
            title={SHOPPING.emptyTitle}
            body={items.length === 0 ? SHOPPING.noCatalogHint : SHOPPING.emptyBody}
            testID="shopping.empty"
          />
        </Animated.View>
      ) : null}

      {/* §5: ONE card, one sub-heading per shop, named shops first and Any shop last. It is drawn
          while anything is PLACED in it — a line ticked a moment ago included, so the last tick of
          the trip is seen landing before the card goes (`placeLines`) — and its caption counts
          what is still to buy. */}
      {shown.toBuy.length > 0 ? (
        <ListCard testID="shopping.list">
          {groups.map((g, i) => (
            <CardSection
              key={g.store}
              label={g.store}
              icon="cart"
              band
              first={i === 0}
              right={<Meta>{SHOPPING.itemCount(g.lines.length)}</Meta>}
            >
              <SectionRows>{g.lines.map(l => rowFor(l, 'shopping.line'))}</SectionRows>
            </CardSection>
          ))}
        </ListCard>
      ) : null}

      {/* THE HEADING COMES WITH THE FIRST THING INTO THE BASKET (S2): on the tap that throws it —
          the thing lands in it before its line glides down — and while anything is in the basket
          or drawn there. Its card comes with the first line drawn in it. */}
      {shown.basket.length > 0 || basket.length > 0 || drops.length > 0 ? (
        <View style={{ gap: t.space.lg }}>
          <SectionCaption
            label={SHOPPING.basketHeader}
            icon={
              // what a tick throws into, and what bounces as it lands: the glyph a shop's own
              // heading wears, in the caption's own ink
              <CartBounce bump={basketBump}>
                <View ref={basketAt} collapsable={false} testID="shopping.basket.cart">
                  <Icon name="cart" size={15} color={t.color.text2} />
                </View>
              </CartBounce>
            }
            {...(canLog
              ? {
                  right: (
                    <CaptionAction
                      label={SHOPPING.clearShort}
                      accessibilityLabel={SHOPPING.clear(basket.length)}
                      onPress={() => void clear()}
                      testID="shopping.clear"
                    />
                  ),
                }
              : {})}
          />
          {/* its own card, on its own quieter ground: what is done is done */}
          {shown.basket.length > 0 ? (
            <View
              style={[
                styles.done,
                {
                  borderRadius: t.radius.l,
                  borderColor: t.color.line,
                  backgroundColor: t.color.paper,
                },
              ]}
              testID="shopping.basket"
            >
              <SectionRows>{shown.basket.map(l => rowFor(l, 'shopping.basket'))}</SectionRows>
            </View>
          ) : null}
        </View>
      ) : null}

      {ready && canLog && low.length > 0 ? (
        <Animated.View style={[{ gap: t.space.lg }, faded]}>
          <SectionCaption label={SHOPPING.lowHeader} lede={SHOPPING.lowHint} />
          <ListCard testID="shopping.low">
            <SectionRows>
              {low.map(s => (
                <Pressable
                  key={s.item.id}
                  accessibilityRole="button"
                  accessibilityLabel={SUPPLIES.pickerAdd(supplyLabel(s.item))}
                  onPress={() => void toggle(s.item)}
                  style={({ pressed }) => [
                    styles.titleRow,
                    {
                      paddingHorizontal: t.space.lg,
                      paddingVertical: t.space.md,
                      gap: t.space.md,
                      opacity: pressed ? 0.6 : 1,
                    },
                  ]}
                  testID={`shopping.low.${s.item.id}`}
                >
                  <View style={styles.grow}>
                    <BodyStrong>{supplyLabel(s.item)}</BodyStrong>
                    <Meta>{`bought ${s.days} days ago`}</Meta>
                  </View>
                  <Icon name="plus" size={18} color={a.accent} />
                </Pressable>
              ))}
            </SectionRows>
          </ListCard>
        </Animated.View>
      ) : ready && !canForecast && items.length > 0 ? (
        // the gate shows the SHAPE of what is behind it, with the numbers removed — never an
        // empty box and never a paywall that opens without warning (CLAUDE.md §4)
        <Animated.View style={[{ gap: t.space.lg }, faded]}>
          <SectionCaption label={SHOPPING.lowHeader} />
          <Card onPress={() => shell.openGate('suppliesForecast')} testID="shopping.low.locked">
            <View style={{ gap: t.space.xs }}>
              <BodyStrong>{SHOPPING.lowLocked}</BodyStrong>
              <BodySm ink="text2">{SHOPPING.lowHint}</BodySm>
            </View>
          </Card>
        </Animated.View>
      ) : null}

      {/*
        LIST → NOTE → ADD ITEM in ordinary content flow (2026-10-05). The Screen's `space.lg`
        (~11) sits between the list and this block; inside, `space.xl` (~14) sits between the
        household note and Add item. No oversized margins, minHeights or flex distribution —
        unused space stays below the content. The "Supplies or one-offs" line under the button
        is gone: Add item is enough.
      */}
      <View style={{ gap: t.space.xl }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${SHOPPING.sharedWith} ${SHOPPING.aboutList}`}
          accessibilityState={{ expanded: noteOpen }}
          onPress={() => setNoteOpen(v => !v)}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
          style={[styles.titleRow, { gap: t.space.sm, alignSelf: 'flex-start', maxWidth: '100%' }]}
          testID="shopping.note.info"
        >
          <Icon name="info" size={14} color={t.color.text2} />
          <BodySm style={{ flexShrink: 1 }}>{SHOPPING.sharedWith}</BodySm>
        </Pressable>
        {noteOpen ? <BodySm testID="shopping.note">{SHOPPING.footnote}</BodySm> : null}
        {canLog ? (
          <View testID="shopping.add">
            <TourSpot id={TOUR_ANCHOR.shopAdd}>
              <Button
                label={SHOPPING.addItem}
                icon="plus"
                size="lg"
                onPress={() => setPickerOpen(true)}
                testID="shopping.add.picker"
              />
            </TourSpot>
          </View>
        ) : null}
      </View>
      <SupplyPickerSheet
        visible={pickerOpen}
        onClose={() => setPickerOpen(false)}
        items={items}
        lines={lines}
        onToggle={x => void toggle(x)}
        onOneOff={title => void addOneOff(title)}
        onSeeAll={() => {
          setPickerOpen(false);
          nav.navigate('Supplies');
        }}
      />
      <SupplySheet
        target={target}
        items={items}
        lines={lines}
        onClose={() => setTarget(null)}
        onToggleList={row =>
          void toggle({
            id: row.id,
            category: row.category,
            brand: row.brand,
            product: row.product,
            variant: row.variant,
            pack: row.pack,
            store: row.store,
            notes: row.notes,
            url: row.url,
            lastBoughtOn: row.last_bought_on,
          })
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: 'row', alignItems: 'center' },
  grow: { flex: 1, minWidth: 0 },
  center: { alignItems: 'center', justifyContent: 'center' },
  done: { borderWidth: 1, overflow: 'hidden' },
});
