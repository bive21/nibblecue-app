/**
 * THE CHROME'S ARITHMETIC WITHOUT REACT NATIVE: what the top bar and the tab bar measure, for a
 * test that runs in node. The barrel (`@nibblecue/ui`) exports the same names beside the
 * components, and importing it pulls React Native in; this entry is the two layout modules and
 * nothing else, the way `@nibblecue/ui/theme` and `@nibblecue/ui/appearance` are the theme
 * without the components. The tour's placement test walks the real phone sizes against these
 * numbers rather than a copy of them (`apps/mobile/src/tour/overlayLayout.test.ts`).
 */
export {
  FAB_GAP,
  FAB_SIZE,
  TAB_BAR_BOTTOM,
  TAB_BAR_INSET,
  // the cell's own geometry, for the tour's check that a ring round a tab cell stays in the room
  // that cell has (`overlayLayout.test.ts`, "the marks keep to the room they have")
  TAB_BAR_MAX_CELLS,
  TAB_BAR_PAD,
  TAB_BAR_PADDING,
  TAB_CELL_PAD,
  TAB_GLYPH,
  tabBarHeight,
} from './components/tabLayout';
export {
  TOP_BAR_MIN_HEIGHT,
  // where the baby's name and your initial sit, for the tour's check that a card about either
  // goes under it and never over it (`overlayLayout.test.ts`, "a card about the top bar")
  TOP_BAR_AVATAR,
  TOP_BAR_GUTTER,
  chipMaxWidth,
} from './components/topBarLayout';
/**
 * THE HEART'S DOOR TO THE NIGHT LIGHT (2026-09-26): three quick taps on the top bar's mark, and a
 * target that clears the child chip at every width — held in node by the app's own test
 * (`apps/mobile/src/screens/nightLight/nightLight.test.ts`).
 */
export {
  countMarkTap,
  MARK_DOOR_IDLE_MS,
  MARK_DOOR_TAPS,
  markDoorClearsChip,
  markHitSlop,
} from './components/markDoor';
/**
 * THE THEME TOGGLE'S ROOM (2026-09-25): how wide the Appearance sheet's toggle is at a given width
 * and how far its words may grow there. The design system proves the placement over three fixture
 * words; the app proves it again over the words it really passes, which live in the app
 * (`apps/mobile/src/appearance/themeToggle.test.ts`).
 */
/**
 * THE NIGHT LIGHT'S LEVEL (2026-09-25): the clamp the app reads a saved level back through, so a
 * value stored by an older build, or by hand, can never ask the light to be brighter than its
 * colors allow (`apps/mobile/src/screens/nightLight/level.ts`, tested in node from here).
 */
export { clampLevel, NIGHT_LIGHT_LEVEL } from './components/nightLight';
export {
  DIM_STOPS,
  SKY_STOPS,
  THEME_SKY_SIZE,
  themeSkyGeometry,
  WORD_TYPE,
  wordScaleCap,
} from './components/themeSkyToggle';
/**
 * THE LISTS' MOTION (2026-09-25): how long a tick takes to draw itself and its sparkle to go, when
 * nothing moves at all, and what a tap on Share does besides sharing — when the paper plane's fold
 * and throw are felt, how long its flight is, and the latest the share sheet waits for it to end
 * (2026-09-26). The app's rules are built on these, in node, rather than on copies of them
 * (`apps/mobile/src/screens/lists/listMotion.ts`, `ShoppingScreen.tsx`).
 */
export {
  BURST_DELAY_MS,
  BURST_MS,
  dotReach,
  DOTS_DELAY_MS,
  DOTS_MS,
  motionStill,
  RAY_GAP,
  rayReach,
  TICK_DRAW_MS,
  TICK_UNDRAW_MS,
} from './components/tickDraw';
/**
 * SETUP'S MOTION (2026-09-26): the track's hop, how long Continue waits before a cue counts as the
 * parent's, the beat after a sheet before a saved row answers, and the welcome's sunrise. Setup's
 * own rules (`apps/mobile/src/screens/onboarding/setupMotion.ts`) are built on these, and its test
 * reads them in node rather than copies of them.
 */
export { HOP_MS } from './components/stepHop';
export { NUDGE_ARM_MS } from './components/nudge';
export { WASH_DELAY_MS } from './components/savedWash';
/**
 * AND THE FEEDING STEP'S SWITCHES (2026-09-27): how a pour and a drain are planned, and the most
 * either may take, so setup's test holds the pour to setup's own ceiling for a move.
 */
export { POUR_MAX_MS, POUR_MS, pourPlan } from './components/pourSwitch';
export { POP_TOTAL_MS } from './components/picturePop';
export { SUNRISE_MS, SUNRISE_TIMING } from './components/sunrise';
export { WHEEL_DRAW_MAX_MS } from './components/wheelDraw';
/**
 * THE SAVE THAT TICKS, THE COUNT THAT ROLLS AND THE ROW THAT CRUMPLES (2026-09-26): how long a
 * capture sheet holds for its Save's check before it closes, the rule that decides whether a tile's
 * count rolls, and how long a crumple waits for a sheet over the Log to leave. The app's sheet host,
 * Today and the Log are built on these, and their tests read them in node rather than copies of them
 * (`apps/mobile/src/sheets/quick/saveTick.test.ts`, `apps/mobile/src/screens/today/
 * countsScope.test.ts`, `apps/mobile/src/screens/timeline/crumples.test.ts`).
 */
export { SAVE_TICK_HOLD_MAX_MS, SAVE_TICK_HOLD_MS } from './components/saveTick';
export { COUNT_AFTER_SHEET_MS, countStart, countStep } from './components/countRoll';
export { CRUMPLE_AFTER_SHEET_MS } from './components/crumple';
export {
  PLANE_CREASE_MS,
  PLANE_LAUNCH_MS,
  PLANE_MS,
  planeLaunch,
  planeOrigin,
  SHARE_SAFETY_MS,
  type PlaneLaunch,
} from './components/paperPlane';
/**
 * THE SHOPPING LIST'S MOTION (2026-09-26): how long a row takes to arrive, glide to the basket and
 * back, and be swept off by Clear, when the line through a ticked line's words is drawn, and when a
 * chip thrown from Supplies lands in the cart — felt, bounced and counted then. The app's rules are
 * built on these in node, rather than on copies of them (`apps/mobile/src/screens/lists/listMotion.ts`).
 */
export {
  ENTER_STAGGER_MS,
  ENTER_WHOLE_MS,
  enterStagger,
  enterWholeMs,
  LOOK_WHOLE_MS,
  lookStagger,
  lookWholeMs,
  ROW_AWAY_MS,
  ROW_ENTER_MS,
  ROW_GLIDE_MS,
  ROW_POP_MS,
  ROW_SWEEP_MS,
  rowMotionMs,
  STRIKE_DELAY_MS,
  STRIKE_MS,
  sweepStagger,
  sweepWholeMs,
  UNSTRIKE_MS,
  type RowMotionKind,
} from './components/rowMotion';
/**
 * THE APP'S ONE SWIPE (2026-09-29): how far a row slides to show its action, when a move is the
 * swipe, where a row let go ends up, and the rule that keeps one row out at a time. The shopping
 * list's S5 and the log's Delete are both built on these, and the app's tests read them in node
 * rather than copies of them (`apps/mobile/src/screens/lists/listMotion.test.ts`,
 * `apps/mobile/src/screens/timeline/logSwipe.test.ts`).
 */
export {
  createSwipeRegistry,
  SWIPE_BACK_MS,
  SWIPE_CLAIM,
  SWIPE_FLING,
  SWIPE_OPEN,
  SWIPE_REMOVE_SHARE,
  SWIPE_SETTLE_MS,
  swipeClaims,
  swipeFollow,
  swipeRelease,
  type SwipeEnd,
  type SwipeRegistry,
} from './components/swipeRow';
/**
 * THE SCHEDULE'S DAY, MOVING (2026-09-26): how long before its slot a dot breathes, and where the
 * now line is kept inside the list. The page's own rules (`apps/mobile/src/screens/schedule/
 * dayMotion.ts`) are built on these in node, rather than on copies of them; the first look's
 * stagger and the Next day card's slide are `rowMotion`'s above.
 */
export { nowLineY, SOON_MS } from './components/scheduleMotion';
export { CART_CHIP, CART_LAND_MS, cartLanding, type CartLanding } from './components/cartFlight';
/**
 * THE TRIP'S LAST TICK (2026-09-26): how long the little cart and "All done" are on the screen, so
 * the app can start them once the finished line has settled into the basket and prove in node that
 * the whole moment is brief (`apps/mobile/src/screens/lists/listMotion.ts`).
 */
export { DONE_MS, DONE_ROLL_MS } from './components/allDone';
/**
 * THE LOADER'S PATIENCE AND ITS SIZES (2026-09-26): how long the boot wait holds a plain ground
 * before the mark's ∞ fades in, and the box each loader takes. The app's boot wait is built on
 * these, and its test reads them in node rather than copies of them (`apps/mobile/src/app/
 * bootWait.test.ts`).
 */
export {
  LOADER_DELAY_MS,
  LOADER_FADE_MS,
  LOADER_SIZE,
  loaderMotion,
} from './components/logoLoader';
/**
 * THE COLOR ROW AND THE DESIGN TILES (2026-09-25): whether the six swatches fit one row at a width
 * and a text size, and the room the two design previews share. The design system walks them over
 * its fixture of the six scheme names; the app walks them over the sheet's own body
 * (`apps/mobile/src/appearance/sheet.test.ts`).
 */
export { swatchMinCell, swatchRowLayout } from './components/swatchRow';
export { SKIN_TILE, skinTilePair } from './components/skinTile';
/**
 * THE QUICK SHEETS' PICTURE TOGGLES (2026-09-25): the bottle's and the bath's pill at a given
 * width, how far their words may grow there, and the bottle's level for a leftover. The design
 * system proves the placement over fixture words; the app proves it again over the words it
 * really passes, and that the bottle sheet hands the picture the fraction its steppers show
 * (`apps/mobile/src/sheets/quick/modules/bottleBathToggles.test.ts`).
 */
export {
  PICTURE_TOGGLE_SIZE,
  PICTURE_WORD,
  pictureToggleGeometry,
  pictureWordCap,
} from './components/pictureToggle';
export { BOTTLE_END_PAD, BOTTLE_SLOT, bottleLevel, leftFraction } from './components/bottleToggle';
export { BATH_SLOT } from './components/bathToggle';
/**
 * THE BOTTLE'S LEFTOVER ROW (2026-09-26): the compact stepper's sizes and its number box, so the
 * app can prove the row fits one line on every phone with the words and the grids the sheet really
 * passes (`apps/mobile/src/sheets/quick/modules/bottleBathToggles.test.ts`) — with the typed box
 * round its number since the same day (`typedBoxExtra`), which the growth sheet's pounds and ounces,
 * two compact rows side by side, are measured with too (`growthForm.test.ts`).
 */
export {
  COMPACT_STEPPER,
  compactValueWidth,
  decimalsOfStep,
  typedBoxExtra,
  widestStepChars,
} from './components/stepperMath';
/**
 * THE RULER IN ITS ROW'S GAP (2026-09-30): the number's box at its widest, the strip's rule and the
 * guess a ruler makes before its caption is measured, so the app can prove its own rulers, with the
 * captions and ranges they really draw, keep the strip in the row on every phone from 360 pt at the
 * phone's own text size, and say when they go to two rows
 * (`apps/mobile/src/sheets/quick/modules/rulerInline.test.ts`); and whether a ruler is drawn as a
 * count, a thumb a step (`rulerCounts`: the containers a pump session goes into), all of it in view
 * as a line wherever its numbers keep apart (`countLineFits`, 2026-09-30).
 */
export {
  countLineFits,
  RULER,
  rulerBoxWidth,
  rulerCaptionGuess,
  rulerCounts,
  rulerHeight,
  rulerInline,
  rulerInlineStrip,
  rulerLabelsFit,
  rulerTickFor,
} from './components/rulerMath';
/**
 * THE SIDE SLIDER (2026-09-26): the pill at a given width, how far its words may grow there, and
 * how far the knob travels before it arms a side. The design system proves the placement over
 * fixture words; the app proves it again over the breastfeed sheet's own words
 * (`apps/mobile/src/sheets/quick/modules/sideSlider.test.ts`).
 */
export {
  SIDE_GESTURE,
  SIDE_SLIDER,
  SIDE_WORD,
  sideSliderGeometry,
  sideWordCap,
} from './components/sideSlider';
/**
 * EVERY STORAGE PLACE'S PICTURE (2026-09-26): the strip a card's empty right side gives its
 * picture, every piece of a picture for a host of a given shape, and which changes play at all.
 * The design system proves the strip and the pieces for every width and height; the app proves the
 * stash's storage-window cards over the words they really write, at every phone width and text
 * size, and its rule for which changes it cues reads `rimPlan` rather than a copy of it
 * (`apps/mobile/src/screens/stash/rims.ts`, `rims.test.ts`).
 */
export { RIM_ZONE, rimPlan, rimZone } from './components/placeRim';
export { FROST_MIN_RIM } from './components/frostRim';
/**
 * THE DIAPER TOGGLE (2026-09-26): the diaper sheet's pill at a given width and text size — where the
 * four stops stand, how far their words may grow and each stop's target. The design system proves
 * the placement over fixture words; the app proves it again over the words the sheet really passes
 * (`apps/mobile/src/sheets/quick/modules/diaperToggle.test.ts`).
 */
export { DIAPER_TOGGLE_SIZE, diaperToggleGeometry } from './components/diaperToggle';
/**
 * REPORTS' FIRST LOOK (2026-09-26): when a card counts as come into view, and the entrance's own
 * timings. The app keeps the once-a-session record and decides which card plays; its rule for
 * "in view" is this one, read in node rather than copied (`apps/mobile/src/screens/reports/
 * reveal.ts`, `reveal.test.ts`).
 */
export { REVEAL, REVEAL_VIEW, revealDue, type Reveal } from './components/reportReveal';
/**
 * THE SOLIDS PLATE AND THE GROWTH GAUGES (2026-09-26): the plate's picture of a list, and the ends
 * of the tape and the dial. The app proves that the solids sheet hands the plate its own lines and
 * that the growth sheet's steppers never read past the gauges' ends, in node, against these rather
 * than copies of them (`apps/mobile/src/sheets/quick/modules/plateAndGauges.test.ts`).
 */
export { MORSEL, platePicture } from './components/foodPlate';
export { DIAL_SCALE, RULER_SCALE } from './components/growthGauge';
/**
 * THE RUNNING TIMERS' SMALL MOVE (2026-09-26): where the owner's picture lands on a card and the
 * nap's "z"s over it, and the brightest and darkest pixel a picture may put under the stop pill.
 * The design system proves the move over a fixture picture; the app proves it again over the
 * owner's own pixels, which only it can read (`apps/mobile/src/ui/cardArtParts.test.ts`).
 */
export {
  artPlacement,
  onCard,
  Z_DRIFT,
  zFrames,
  zLifeAt,
  type ArtPlacement,
} from './components/timerMotion';
export {
  ART_DIM_IN_DARK,
  PILL_OVER_ART_ALPHA,
  PILL_UNDER_ART,
  type ArtParts,
} from './theme/artInk';
/**
 * THE RUNNING TIMERS AS ONE STACK (2026-09-26; two cards and the order they started in since
 * 2026-09-27): the order, the cards and the "Also running" rows, and the rows' geometry — for
 * Today's own order and its fold, proved in node against these rather than copies of them
 * (`apps/mobile/src/screens/today/stack.test.ts`).
 */
export {
  ALSO_RUNNING,
  alsoRunningHeight,
  byStart,
  HERO_CARDS,
  stackOrder,
  timerStack,
  type StackTimer,
  type TimerStack,
} from './components/timerStack';
/**
 * THE STASH SHEETS' PICTURES AND NUMBERS (2026-09-26): how full a stored container's picture is,
 * the moment milk lands in its place, and whether the ruler fits — for the app's stash sheets,
 * which draw them at run time, and for the app's tests, which measure them over the words and the
 * places a household really has (`apps/mobile/src/sheets/stash`).
 */
export { milkFill } from './components/milkContainers';
export { DROP_MS } from './components/dropCelebration';
export { rulerFits } from './components/rulerMath';
export { placeSquare, placeTone } from './theme/placeTones';
/**
 * THE CAPSULE'S WORDS (2026-09-26): the bold UI face's widths a capsule's name is fitted by, and the
 * fit — held in node by the app's own test against the TTF it ships and the names it really prints
 * (`apps/mobile/src/screens/today/capsuleWords.test.ts`).
 */
export {
  CAPSULE_LABEL,
  capsuleLabelFit,
  capsuleTextWidth,
  capsuleTileWidth,
  // the grid's cell padding, for Today's fold (`apps/mobile/src/screens/today/layout.ts`)
  QUICK_GRID_PAD,
  UI_BOLD_EM,
  uiBoldWidth,
} from './components/quickCapsule';
/**
 * THE PATH TILES' WORDS (2026-09-26): every word a tile can print, as wide as the face sets it, and
 * the rule that lays the pair out — held in node by the app's own test against the TTF it ships
 * and the titles its copy writes (`apps/mobile/src/sheets/quick/modules/sheets.test.ts`).
 */
export { PATH_WORD_EM, pathTileLayout, pathTitleRows } from './components/pathCard';
/**
 * TODAY'S REPORT, EVERY LINE ONE LINE (2026-09-26): how wide each line of a `StatTable` cell is
 * and how far it is drawn smaller to stay one line — the label and its count chip, the figure, a
 * mixed day's second figure (2026-09-27), the picture before each of those two (the same day) and
 * the note — held in node by the app's own test against the lines `totalsRows` really writes, at
 * every phone width and text size, and against the TTFs the app ships
 * (`apps/mobile/src/screens/today/reportFit.test.ts`).
 */
export {
  MONO_EM,
  STAT_BADGE,
  STAT_FIGURE_BLEED,
  STAT_FIGURE_FLOOR,
  STAT_FIGURE_ICON,
  STAT_FIGURE_ICON_ROOM,
  STAT_GLYPH,
  STAT_HEADER_BLEED,
  STAT_LABEL_EM,
  STAT_LINE,
  STAT_LINE_EM,
  STAT_NOTE_EM,
  STAT_SECOND_LINE,
  STAT_SECOND_SIZES,
  STAT_TYPE,
  statCellRoom,
  statColumns,
  statFigureLine,
  statFigureRuns,
  statFigureText,
  statFigureWidth,
  statFit,
  statHeaderFit,
  statHeaderWidths,
  statNoteWidth,
  statPartsWidth,
  statRows,
  statSecondLine,
} from './components/statTable';
/**
 * Which glyphs say what a diaper held: the solid pair Today's report draws (`rows.ts`). The
 * outlines Reports' day strip marks a change with come from the package root, beside its cards.
 */
export { DIAPER_KIND_SOLID_GLYPHS } from './icons/paths';
/**
 * WHAT YOU TRACK'S CARDS (2026-09-26): how wide a module's name may run and when the grid goes
 * from two across to one — held in node by the app's own test against the TTF it ships and the
 * names the page really prints (`apps/mobile/src/screens/more/whatYouTrack.test.ts`). The page
 * draws the compact card since 2026-09-30, so its numbers and its name's room are here too.
 */
export {
  CARD_WORD_EM,
  CARD_WORD_FALLBACK_EM,
  cardWordWidth,
  MODULE_CARD,
  MODULE_CARD_COMPACT,
  MODULE_CARD_COMPACT_MIN_HEIGHT,
  moduleCardColumns,
  moduleCardNameRoom,
  moduleCardWidth,
} from './components/moduleCard';
/**
 * REPORTS' LEAD CARDS (2026-09-26): a day as a strip — where a moment sits on it, a block for a
 * stretch, marks that never cover each other, which hour words fit under it, and a week of sleep a
 * strip a day — the small bars with their numbers written on them, and the big number's width.
 * The app proves them in node against the words and the figures its cards really write, at every
 * phone width and text size and against the TTFs it ships (`apps/mobile/src/screens/reports/
 * summaryFit.test.ts`).
 */
export {
  axisLabelsShown,
  DAY_AXIS_EM,
  DAY_AXIS_LABELS,
  DAY_STRIP,
  DIARY,
  diaryFit,
  diaryTotalWidth,
  placeMarks,
  stripX,
} from './components/dayStrip';
export {
  barNumberWidth,
  barTickWidth,
  NUMBER_BARS,
  numberBarsFit,
  SHORT_WORD_EM,
} from './components/numberBars';
export { LEAD_FIGURE, leadFigureFit, leadFigureWidth } from './components/leadFigure';
/**
 * HOW MANY CHARACTERS OF A FACE FIT A WIDTH (2026-09-30): the Quick tiles' own budget, for a card on
 * Today that picks between two lines by it, and for its test, which holds the bound to the shipped
 * font in node (`apps/mobile/src/screens/today/careTummy.test.ts`).
 */
export { ADVANCE, lineBudget } from './components/quickScale';
