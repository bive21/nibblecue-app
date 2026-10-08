/**
 * One module's capture sheet (docs/MOBILE.md §3 "every capture sheet is a form sheet detented
 * to content"): the module's name as the title, the module's Quick Entry as the body.
 *
 * The sheet remembers the last module it showed: `moduleId` goes null the moment the shell
 * closes it, and the sheet is still on screen for its exit — a title that blanked mid-slide
 * would flash. `openedAtMs` is captured when a module arrives and every time preset resolves
 * against it (QuickEntry.tsx: a sheet left open for ten minutes still means "now" on Save).
 * The time zone is the HOUSEHOLD's, read from the local mirror; the device zone stands in for
 * the first frame.
 *
 * A SCHEDULE SLOT OPENS THIS SAME SHEET (the owner, 2026-09-25: "change the today schedule logging
 * ui to how it looks in the home page"; `sheets/schedule/slotActions.ts`). With `preset.slot` the
 * body is unchanged — the Quick grid's own form — and three things are added around it: the slot's
 * baby is the one the Logging-for row starts on (`SlotBindingContext`), a feeding slot either kind
 * of feed answers gets the method above the form, and the foot carries the slot's line and Skip.
 * (A save from a slot told the first-run tour, whose "What's coming" card waited for one, until the
 * owner took that card out on 2026-09-28: *"also i asked to remove step 3, this is not needed "what's
 * coming""*. Nothing listens for a slot now, so nothing is said.)
 *
 * A SLOT THAT IS OVER STARTS AT ITS OWN TIME (the owner, 2026-09-25: "yes pre-fill the slot's time
 * when tapping a past slot"). Opened from a row of the day's list, a slot from before the account,
 * a missed one or a skip done after all hands the form its time (`SlotBinding.atMs`, decided here
 * once per opening by `slotPrefillAt` against `openedAtMs`), and the form's time row starts on it
 * as a Custom time; the foot says so. Not while this module's timer runs for the slot's baby: the
 * sheet shows the running timer then, as it always has, and nothing is pre-filled.
 *
 * AND IT HOLDS WHAT THE LOGGING-FOR ROW STARTS FROM (the owner, 2026-09-25). With the top bar on
 * Both, a medicine or a breastfeed sheet starts on the baby who is up next for its module (every
 * other sheet starts on Both since 2026-09-30; `loggingForStart.ts`), and that has to be known
 * before the sheet's first paint. This host is mounted for the life of the shell,
 * so it keeps each baby's last entries read — re-read on every write, pull and timer change — and
 * hands them to whichever sheet mounts (`RecencyContext`; `recency.ts` says why here).
 *
 * A SAVE TICKS BEFORE THE SHEET GOES (the owner, 2026-09-26, "agreed"). A body that says it is done
 * while its Save is in flight has just written that Save's entry, so the Save shows its check and
 * the sheet closes `SAVE_TICK_HOLD_MS` later; anything else that ends a sheet — a Start, a Skip, a
 * row that goes somewhere — closes it at once, as before (`sheets/quick/saveTick.ts`). The hold
 * closes only the opening it was made for: a sheet shut by hand meanwhile, or another in its place,
 * is left alone.
 *
 * AND THE + BUTTON'S GRID IS THIS SHEET'S FIRST BODY (the owner, 2026-09-28, of "the + button opens
 * one sheet": *"Not sure what this is but I trust your judgement"*). With `grid` the sheet shows the
 * Quick log grid under its own title; a tile asks the shell for its module (`shell.openQuickEntry`),
 * the shell hands this same sheet the module where it stands (`swapsInPlace`, `overlayRules.ts`),
 * and the body turns into that module's form, which is a new opening like any other. Nothing closes
 * and nothing slides, as in the prototype's `quickentry`; it used to be a modal of its own that had
 * to finish leaving before this one could be presented, about half a second on every log from +.
 * The body the sheet showed last, the grid or a form, is the one it keeps through its exit slide.
 */
import { type ModuleId } from '@nibblecue/core';
import { BottomSheet, ModuleDisc, SegmentedControl, useTheme } from '@nibblecue/ui';
import { useEffect, useMemo, useRef, useState } from 'react';
import { View } from 'react-native';
import { useModuleLabels } from '../modules/useModuleLabels';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ModuleSheetBody } from '../sheets/quick/modules';
import { deviceClock24, useTimeZone } from '../sheets/quick/prefs';
import { RecencyContext, useRecencyRead } from '../sheets/quick/recency';
import {
  holdFor,
  inFlightSaves,
  runPressed,
  SaveTickContext,
  type SaveTick,
} from '../sheets/quick/saveTick';
import { SlotBindingContext, type SlotBinding } from '../sheets/quick/slotBinding';
import { clearAllStopped } from '../sheets/quick/stopped';
import type { QuickEntryPreset } from './shell';

/** The sheets whose title carries the module's picture, and its disc's size. */
const PICTURED: Partial<Record<string, number>> = {
  pump: 40,
  diaper: 44,
  breastfeed: 44,
  sleep: 44,
};

export interface QuickEntrySheetProps {
  /** The + button's grid is up: the sheet shows it until a tile hands it a module (see the header). */
  grid?: boolean;
  moduleId: ModuleId | null;
  /** What the sheet opens pointed at, when another surface handed it something. */
  preset?: QuickEntryPreset | null;
  onClose: () => void;
}

export function QuickEntrySheet({
  grid = false,
  moduleId,
  preset = null,
  onClose,
}: QuickEntrySheetProps) {
  const t = useTheme();
  const insets = useSafeAreaInsets();
  const last = useRef<ModuleId | null>(moduleId);
  // the preset outlives the close too, so a slot's foot does not blank mid-slide
  const lastPreset = useRef<QuickEntryPreset | null>(preset);
  // and so does which body was up, the grid or a form, so neither turns into the other mid-slide
  const lastGrid = useRef(grid);
  if (moduleId !== null) {
    last.current = moduleId;
    lastPreset.current = preset;
    lastGrid.current = false;
  } else if (grid) {
    lastGrid.current = true;
  }
  const showGrid = moduleId === null && (grid || lastGrid.current);
  // the grid carries no preset: a slot's foot from an earlier opening is never drawn under it
  const shown = moduleId !== null ? preset : showGrid ? null : lastPreset.current;
  const slot = shown?.slot ?? null;
  const [openedAtMs, setOpenedAtMs] = useState(() => Date.now());
  // a feeding slot's method, when the parent picks the other one; null is the slot's own
  const [method, setMethod] = useState<ModuleId | null>(null);
  // the upward drag on the handle, per opening: a sheet with more to show opens it on this
  const [expanded, setExpanded] = useState(false);
  /*
    A NEW OPENING IS TAKEN IN AS THE SHEET RENDERS, NOT IN AN EFFECT AFTER ITS FIRST FRAME
    (2026-09-25). An effect runs once a frame has been drawn, and that frame was made with the last
    opening's instant: the body kept its old key and its old state, "Now" resolved against the last
    time a sheet was up, and a past slot's pre-fill — judged against the opening (`slotPrefillAt`)
    — could read "not over yet" and show Now for a frame before the slot's time. So the sheet keeps
    what it last saw and, when the module or the preset changes, sets the opening's state during
    the render; React renders again at once with it, before anything is drawn (React's own pattern
    for state that follows a prop). A close is seen too, so reopening the same sheet is a new
    opening.
  */
  const [seen, setSeen] = useState({ moduleId, preset });
  if (seen.moduleId !== moduleId || seen.preset !== preset) {
    setSeen({ moduleId, preset });
    if (moduleId !== null) {
      setOpenedAtMs(Date.now());
      setExpanded(false);
      setMethod(null);
    }
  }
  const id = showGrid
    ? null
    : slot?.methods !== undefined && method !== null
      ? method
      : (moduleId ?? last.current);
  const labels = useModuleLabels();
  const label = id !== null ? labels.label(id) : '';
  // the clock every other screen on this phone reads, abroad too (`time/useZone.ts`)
  const timeZone = useTimeZone();
  const clock24 = deviceClock24();
  // each baby's last entries, kept read while no sheet is up, so a sheet opened on Both starts on
  // the baby up next without waiting on the database (`recency.ts`) — and the household's running
  // timers, read the same way, which is how this host knows a timer wins over a pre-fill
  const recency = useRecencyRead();
  const timerChild = shown?.timer;
  const binding = useMemo((): SlotBinding | null => {
    // a row of Today's "Also running" names its timer's baby: the sheet starts on that baby, at
    // now, and shows the timer running (`QuickEntryPreset.timer`)
    if (slot === null)
      return timerChild === undefined ? null : { childId: timerChild.childId, atMs: null };
    const childId = slot.occurrence.rule.childId;
    // over, opened from the day's list, and not a module whose timer runs for this baby: the
    // slot's own time; everything else starts at the moment the sheet opened (`slotPrefill.ts`)
    // NibbleCue has no schedule slots (CuddleCue's `sheets/schedule` was not carried over): a slot
    // preset only ever names its baby, and the sheet starts at the moment it opened
    return { childId, atMs: null };
  }, [slot, timerChild]);

  /*
    THE SAVE'S CHECK AND THE SAVES IN FLIGHT, both belonging to ONE OPENING (`openedAtMs`, which a
    close leaves alone): the check stays on the Save through the sheet's exit and is gone at the
    next opening, which also starts with no save in flight — so a save that settles late cannot
    take the next sheet's Save out of flight with it. A hold closes the sheet only if that same
    opening is still up: shut by hand meanwhile, or replaced, and the timer does nothing.
  */
  const [tickedAt, setTickedAt] = useState<number | null>(null);
  const [saves] = useState(inFlightSaves);
  const live = useRef({ openedAtMs, open: moduleId !== null });
  const holding = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    live.current = { openedAtMs, open: moduleId !== null };
  });
  useEffect(() => saves.clear(), [openedAtMs, saves]);
  useEffect(
    () => () => {
      if (holding.current !== null) clearTimeout(holding.current);
    },
    [],
  );
  const ticked = tickedAt === openedAtMs;
  const tick = useMemo<SaveTick>(
    () => ({ ticked, pressed: run => runPressed(saves, run) }),
    [ticked, saves],
  );

  /** A save closes the sheet. */
  const done = () => {
    // a Save's entry landed: its check first, then the close (see the header); anything else, at once
    const hold = holdFor(saves.size);
    if (hold === 0) {
      onClose();
      return;
    }
    setTickedAt(openedAtMs);
    const mine = openedAtMs;
    if (holding.current !== null) clearTimeout(holding.current);
    holding.current = setTimeout(() => {
      holding.current = null;
      if (live.current.open && live.current.openedAtMs === mine) onClose();
    }, hold);
  };

  /*
    A PUMP'S STOP ENDS WITH THIS SHEET (2026-09-24). Stopping a pump freezes its card while the
    output is typed (`stopped.ts`); the moment this sheet stops showing the pump — its X, a swipe,
    the scrim, Back, a save, or another sheet taking its place — that freeze is over, because
    either the session was written or the pump is still running. It used to be released when the
    output panel unmounted, which happens only after the close animation reports finished, and on
    a reopen only AFTER Today had marked the new stop — so a card could stay frozen after the X
    until something else unmounted the panel (the owner, three times). Leaving 'pump' is the one
    moment that is always right, so it is the one used. Arriving at 'pump' never clears: Today and
    a coin mark the stop first and open this sheet second.
  */
  const onScreen = useRef<ModuleId | null>(moduleId);
  useEffect(() => {
    const was = onScreen.current;
    onScreen.current = moduleId;
    if (was === 'pump' && moduleId !== 'pump') clearAllStopped();
  }, [moduleId]);

  return (
    <BottomSheet
      visible={grid || moduleId !== null}
      title={label}
      // the module's own picture in its category disc beside its name: the pump's (the pumping
      // redesign) and the three completed-log forms' (Option 2), both 2026-10-05; every other
      // module's sheet keeps its plain title
      {...(!showGrid && moduleId !== null && PICTURED[moduleId] !== undefined
        ? { titleIcon: <ModuleDisc moduleId={moduleId} size={PICTURED[moduleId]} /> }
        : {})}
      onClose={onClose}
      detent="content"
      bottomInset={insets.bottom}
      onExpand={() => setExpanded(true)}

      testID={showGrid ? 'quicklog' : 'quickentry'}
    >
      {showGrid ? null : id !== null ? (
        <RecencyContext.Provider value={recency}>
          <SlotBindingContext.Provider value={binding}>
            <SaveTickContext.Provider value={tick}>
              {slot?.methods !== undefined ? (
                <View style={{ paddingBottom: t.space.md }}>
                  <SegmentedControl
                    options={slot.methods.map(m => ({ value: m, label: labels.label(m) }))}
                    value={id}
                    onChange={setMethod}
                    label="How it went"
                    testID="quickentry.method"
                  />
                </View>
              ) : null}
              <ModuleSheetBody
                key={`${id}:${openedAtMs}`}
                moduleId={id}
                openedAtMs={openedAtMs}
                timeZone={timeZone}
                clock24={clock24}
                preset={shown}
                expanded={expanded}
                onDone={done}
              />
            </SaveTickContext.Provider>
          </SlotBindingContext.Provider>
        </RecencyContext.Provider>
      ) : null}
    </BottomSheet>
  );
}
