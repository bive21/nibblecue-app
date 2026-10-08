/**
 * Core controls (docs/DESIGN_SYSTEM.md §5): the one import for the group. The type roles, the
 * skin material and the three controls that already existed are re-exported here alongside the
 * rows, chips, badges, segments, switches, inputs, headers, avatars, swatches and dividers, so a
 * screen never reaches into a component file by path. Pure helpers (the badge ink, the avatar
 * initial, the row's accessible name) are exported too — the admin console renders the same
 * badges and the same names, and they are tested without React Native.
 */
export * from './Text';
// whether a loop may turn: the page in front, the app open, and not still (docs/DESIGN_SYSTEM.md §7.1)
export * from './motionGate';
export * from './MotionGate';
export * from './Surface';
export * from './Button';
// a log sheet's buttons in its module's color (`theme/moduleButton.ts`)
export * from './ModuleTint';
// the loader a waiting Button draws, its numbers, and the registry the app puts the mark in
export * from './loaderMark';
export * from './logoLoader';
export * from './LogoLoader';
export * from './IconButton';
export * from './Card';
export * from './CardArtLayer';
export * from './cardArtFit';
export * from './Divider';
export * from './ink';
export * from './badge-tone';
export * from './Badge';
export * from './Chip';
export * from './SlotRow';
export * from './slotFit';
export * from './SegmentedControl';
export * from './Switch';
export * from './BellSwitch';
// setup's feeding switches, a track that fills like a bottle; its numbers stay in `pourSwitch.ts`
export * from './PourSwitch';
export * from './DayNightSwitch';
export * from './ThemeSkyToggle';
export * from './LiveSky';
export * from './NightLight';
export * from './StarfieldCredits';
export * from './TickMark';
// a deleted row's paper ball; its numbers stay in `crumple.ts`, the app's in `@nibblecue/ui/layout`
export * from './CrumpleRow';
export * from './PaperPlane';
// the shopping list's motion (2026-09-26): a row arriving, gliding and swept away, the line drawn
// through a ticked line's words, the Supplies page's throw into its cart, the cart's bounce, the
// count beside it rolling, and the empty list's picture
export * from './RowMotion';
// the app's one swipe (2026-09-29): a row slid left shows its action — the shopping list's Remove,
// the log's Delete — one row out at a time; its numbers and rules are `swipeRow.ts`
export * from './swipeRow';
export * from './SwipeRow';
// a list seen for the first time, its rows coming in one after another (the Schedule's day)
export * from './StaggerIn';
export * from './StrikeSweep';
export * from './CartFlight';
export * from './CartBounce';
export * from './CountRoll';
// the cart's count badge: the lines still to buy on its corner, bumping as a thrown thing lands
export * from './CartBadge';
// a daily goal's line that marks the goal reached, and plays the moment it is (tummy time)
export * from './GoalBar';
export * from './EmptyCart';
// the trip's last tick: a little cart rolls along the progress line, and "All done" (2026-09-26)
export * from './AllDone';
export * from './MealSkyToggle';
// a meal's own small sky at the start of its row in the solids rhythm, and the row a snack pops in
// as (2026-09-28); its numbers stay in `mealWindow.ts`
export * from './mealWindow';
export * from './MealWindow';
export * from './ThermometerToggle';
export * from './PlaceRim';
export * from './BottleToggle';
export * from './BathToggle';
// the solids sheet's plate, and the growth sheet's ruler and scale (2026-09-26)
export * from './foodPlate';
export * from './FoodPlate';
export * from './growthGauge';
export * from './GrowthGauges';
export * from './SideSlider';
export * from './DiaperToggle';
export * from './ColorDot';
export * from './Input';
export * from './SectionHeader';
export * from './Disclosure';
export * from './RollDown';
// setup's motion (2026-09-26): a picture that pops, a control that breathes, a row that washes
export * from './PicturePop';
export * from './Nudge';
export * from './SavedWash';
export * from './Sunrise';
// a view moved on the native driver that React never draws again mid-move (§7.1 rule 6, 2026-09-29)
export * from './MovingView';
export * from './initials';
// a picture that would not load: the initial stands in, and the app hears where and why
export * from './photoTrouble';
export * from './Avatar';
export * from './HandoffBaton';
export * from './Swatch';
export * from './SkinTile';
export * from './row-label';
export * from './Row';
export * from './WakingIcon';
// a module you track as a card that is its own switch, two to a row (What you track, 2026-09-26)
export * from './moduleCard';
export * from './ModuleCard';
// the same card as one of a set — pick one, each with its picture (the medicine form's kinds)
export * from './ChoiceCard';
// a time you tap to change, in the typed box's well with a clock (the medicine form's reminders)
export * from './timeButton';
export * from './TimeButton';
export * from './StepTrack';
export * from './ProgressLine';
export * from './StackedBar';
export * from './StepHeader';
export * from './Ground';
