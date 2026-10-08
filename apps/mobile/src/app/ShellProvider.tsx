/**
 * The one owner of every overlay (docs/DESIGN_SYSTEM.md §14; docs/MOBILE.md §3): the account
 * popover, the child switcher, the Quick Log grid, a module's Quick Entry sheet, the
 * Appearance sheet, About, the notification list, the paywall, and the app's own confirmation
 * for a question asked from nowhere in particular (`confirm`: a coin's start, a toast's "+ Liam";
 * 2026-09-29, when the phone's `Alert` went). One is open at a time — a
 * screen asks through `useShell()` and never mounts a sheet of its own — with one exception:
 * a gate may open OVER the Appearance sheet (a locked swatch tapped inside it), so the gate is
 * a separate slot and closing it returns to the sheet underneath rather than to the screen.
 *
 * Opening waits for whatever is still leaving. Every sheet and popover here is a React Native
 * Modal, and iOS refuses to present a modal while another is still being dismissed — a top-bar
 * button tapped in the 220 ms after a sheet was swiped away would open nothing at all. (The Quick
 * Log grid tapping into a Quick Entry sheet, the primary path in the app, used to be the first
 * case of it; since 2026-09-28 the grid is the entry sheet's first body and a tile swaps it in
 * place, `swapsInPlace`, so that path waits for nothing.) So every close, whichever path took it (a row handing over, the scrim, the
 * handle, the Back button, `closeAll`), stamps the moment the leaving modal will have gone,
 * and `open` either opens at once or defers by what remains of that exit. The stamp is a clock
 * rather than the React state because the state is already null for the whole time the modal
 * is still on its way out. A still theme (the phone's Reduce Motion, or Calm motion, at night by
 * default) unmounts a sheet immediately, so since 2026-09-28 the stamp is the platform's slack
 * alone then (`handoverAfter`): the + grid into an entry sheet no longer waits 280 ms on a slide
 * nobody sees.
 *
 * The popover keeps its last anchor while closing: a popover whose anchor went null mid-exit
 * would jump to the window's corner for its final frames. (The appearance popover that shared
 * this was unreachable after 2026-09-18, when Appearance moved behind the avatar, and went on
 * 2026-09-26.)
 *
 * Two requests change nothing, and `overlayRules.ts` says why (the audit of 2026-09-24): the
 * capture sheet that is already up is not closed and reopened when it is asked for again — that
 * round trip let a pump's stop go and lost its typed output — and a request for anything but the
 * pump sheet ends the pump stops no sheet is going to ask about. A modal the shell does not own
 * (Today's slot sheet) stamps its own exit, and the handover waits for that too.
 */
import {
  VIEW_ONLY_NO_LOG,
  type FeatureKey,
  type ModuleId,
  type WelcomePrompt,
} from '@nibblecue/core';
import { haptic } from '@nibblecue/ui/haptics';
import {
  confirmQueue,
  SHEET_DURATION_MS,
  useTheme,
  type Anchor,
  type ConfirmRequest,
  sheetHandingOff,
} from '@nibblecue/ui';
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AppearanceSheet as AppearanceSheetBody } from '../appearance/AppearanceSheet';
import { AboutSheet as AboutSheetBody } from '../sheets/AboutSheet';
import { GateSheet as GateSheetBody } from '../sheets/GateSheet';
import { PlanPromptSheet as PlanPromptSheetBody } from '../plan/PlanPromptSheet';
import { SyncInspectorSheet as SyncInspectorSheetBody } from '../sheets/SyncInspectorSheet';
import { AccountPopover as AccountPopoverBody } from './AccountPopover';
import { ChildSwitcherSheet as ChildSwitcherSheetBody } from './ChildSwitcherSheet';
import { AddChildSheet as AddChildSheetBody } from '../sheets/household/AddChildSheet';
import { ChildPhotoSheet as ChildPhotoSheetBody } from '../sheets/household/ChildPhotoSheet';
import { EditEntrySheet } from '../sheets/quick/edit/EditEntrySheet';
import { useCanLog } from '../household/useCanLog';
import { useToast } from '../ui/toast';
import { clearWriteOrigin } from '../data/writeOrigin';
import { clearAllStopped } from '../sheets/quick/stopped';
import {
  endsPumpStops,
  handoverAfter,
  logsNew,
  noteSheetLeaving,
  sameCaptureSheet,
  sheetLeavingUntil,
  swapsInPlace,
} from './overlayRules';
import { QuickEntrySheet as QuickEntrySheetBody } from './QuickEntrySheet';
import { useTour } from '../tour/TourProvider';
import { ConfirmHostSheet } from '../ui/confirm';
import {
  ShellBarOpenContext,
  ShellContext,
  ShellOpenContext,
  useShellOpen,
  type QuickEntryPreset,
  type ShellApi,
} from './shell';

export { useShellOpen };

/*
  EACH OVERLAY REDRAWS WHEN ITS OWN PROPS DO (2026-09-28; the owner: "app needs to run as smooth as
  fast and as light as possible"). The shell holds fifteen of them and re-renders at every open and
  close, and each one ran its whole body again every time — every hook of the Appearance sheet, the
  notification list, the paywall, the stash's save — to draw nothing, twice for every entry logged
  from +, in the frame the next sheet was asked for. Their props are a `visible`, an id or a preset
  out of the shell's own state, and the shell's own stable `onClose`, so a sheet that is not the one
  opening or closing is handed exactly what it had and is skipped. Each still redraws for whatever
  it reads itself — a context, its own state — as before. (The edit sheet is memoised where it is
  defined, `EditEntrySheet.tsx`: this file's import of it is the wiring its test pins.)
*/
const AccountPopover = memo(AccountPopoverBody);
const ChildSwitcherSheet = memo(ChildSwitcherSheetBody);
const AddChildSheet = memo(AddChildSheetBody);
const ChildPhotoSheet = memo(ChildPhotoSheetBody);
const QuickEntrySheet = memo(QuickEntrySheetBody);
const AppearanceSheet = memo(AppearanceSheetBody);
const AboutSheet = memo(AboutSheetBody);
const SyncInspectorSheet = memo(SyncInspectorSheetBody);
const PlanPromptSheet = memo(PlanPromptSheetBody);
const GateSheet = memo(GateSheetBody);
const ShellConfirmSheet = memo(ConfirmHostSheet);

export type ShellOverlay =
  | { kind: 'account'; anchor: Anchor | null }
  | { kind: 'child' }
  | { kind: 'quicklog' }
  | { kind: 'quickentry'; moduleId: ModuleId; preset?: QuickEntryPreset }
  | { kind: 'entry'; activityId: string }
  | { kind: 'appearanceSheet' }
  | { kind: 'about' }
  | { kind: 'sync' }
  | { kind: 'addChild' }
  | { kind: 'coinChild'; subject: string; then: (childId: string) => void }
  | { kind: 'childPhoto'; childId: string }
  | { kind: 'planPrompt'; prompt: WelcomePrompt }
  | { kind: 'confirm'; request: ConfirmRequest };

interface ShellState {
  overlay: ShellOverlay | null;
  /** The paywall, which may sit over the Appearance sheet. */
  gate: FeatureKey | null;
  /** The last rectangle the popover opened from; kept through the close animation. */
  accountAnchor: Anchor | null;
}

/**
 * A closing modal's exit plus a little slack for the platform to finish dismissing it, while
 * sheets slide. The shell's own stamp reads the theme each time (`handoverAfter`), and so do the
 * two screens that borrow this number (`HelpSheet`, `DayWheelSection`, which wait nothing when
 * still).
 */
export const HANDOVER_MS = handoverAfter(SHEET_DURATION_MS, false);

/**
 * A MODAL THE SHELL DOES NOT OWN HAS STARTED CLOSING — Today's slot sheet, which can close and ask
 * for a capture sheet in the same tap (`overlayRules.ts`, timers 23). The next `open` waits it out.
 */
export function noteSheetClosing(): void {
  noteSheetLeaving(Date.now() + HANDOVER_MS);
}

const CLOSED: ShellState = {
  overlay: null,
  gate: null,
  accountAnchor: null,
};

/** The state with `overlay` up and nothing over it; the popover also records its anchor. */
function place(s: ShellState, overlay: ShellOverlay): ShellState {
  return {
    ...s,
    overlay,
    gate: null,
    ...(overlay.kind === 'account' ? { accountAnchor: overlay.anchor } : {}),
  };
}

export function ShellProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ShellState>(CLOSED);
  // whether sheets slide right now, read at the moment a close is stamped (see the header)
  const t = useTheme();
  const still = useRef(t.reduceMotion);
  still.current = t.reduceMotion;
  // what is up as of the last render, readable from a callback without re-creating the API
  const current = useRef<ShellState>(state);
  current.current = state;
  const handover = useRef<ReturnType<typeof setTimeout> | null>(null);
  // when the modal that most recently started leaving will have gone (Date.now() ms)
  const leavingUntil = useRef(0);
  /*
    WHAT IS UP, OR ON ITS WAY UP, as of the last request — kept by every path that changes the
    overlay, at the moment it asks, because `current` is the RENDERED state and is a render behind
    a close made in the same tap. It is what "the sheet that is already up" means below.
  */
  const showing = useRef<ShellOverlay | null>(null);
  /*
    THE SHELL'S OWN QUESTIONS (`ShellApi.confirm`): a coin's start, a toast's "+ Liam". One queue,
    so a second question waits for the first; its sheet is an overlay like any other, placed by
    `open` once whatever was up has gone, and answered Cancel (`dismiss`) by anything else that
    takes the screen before it is answered — a question the parent never saw is never a yes.
  */
  const [questions] = useState(() => confirmQueue());
  // a view only member is never shown a sheet that logs (`logsNew`); read through a ref so the
  // API below is not re-created when the role is read
  const canLog = useCanLog();
  const canLogRef = useRef(canLog);
  canLogRef.current = canLog;
  const toast = useToast();

  const cancelHandover = useCallback(() => {
    if (handover.current) {
      clearTimeout(handover.current);
      handover.current = null;
    }
  }, []);

  useEffect(() => cancelHandover, [cancelHandover]);

  /** A modal has just started leaving, whichever path closed it. */
  const noteLeaving = useCallback(() => {
    leavingUntil.current = Date.now() + handoverAfter(SHEET_DURATION_MS, still.current);
  }, []);

  /** Runs `then` once nothing is still leaving: at once, or after the remainder of the exit. */
  const afterLeaving = useCallback(
    function run(then: () => void) {
      cancelHandover();
      // the shell's own leaving modal, or one a screen owns (Today's slot sheet), whichever is later
      const wait = Math.max(leavingUntil.current, sheetLeavingUntil()) - Date.now();
      if (wait <= 0) {
        then();
        return;
      }
      handover.current = setTimeout(() => {
        handover.current = null;
        run(then); // re-checked: a close during the wait may have moved the clock
      }, wait);
    },
    [cancelHandover],
  );

  const open = useCallback(
    (overlay: ShellOverlay) => {
      // NOTHING THAT LOGS FOR A VIEW ONLY MEMBER (the 2026-10-08 scenario finding): the + and the
      // tiles are hidden for them, and this answers whatever else asks, once, with nothing opened
      if (!canLogRef.current && logsNew(overlay)) {
        haptic('warning');
        toast.show(VIEW_ONLY_NO_LOG);
        return;
      }
      // anything else taking the screen answers a question still up, or waiting for it, Cancel
      if (overlay.kind !== 'confirm') questions.dismiss();
      // the capture sheet on screen, asked for again with nothing new: already done. Closing it to
      // reopen it would let a pump's stop go and lose what was typed (`overlayRules.ts`)
      if (handover.current === null && sameCaptureSheet(showing.current, overlay)) return;
      // a pump's stop that no sheet is going to ask about any more (`overlayRules.ts`)
      if (endsPumpStops(overlay)) clearAllStopped();
      // ONE SHEET HANDING OVER TO THE NEXT (`handOffSheet`): the one leaving holds its dim and
      // fades in place until this one is up, so there is no exit to wait out — waiting it out was
      // the bare beat between the pump's two pages. Opened in the same render it closed in
      if (sheetHandingOff()) {
        cancelHandover();
        showing.current = overlay;
        setState(s => place(s, overlay));
        return;
      }
      // a tile of the + grid: the same sheet takes the module where it stands, with no exit to wait
      // out (`swapsInPlace`; see the header)
      if (handover.current === null && swapsInPlace(showing.current, overlay)) {
        showing.current = overlay;
        setState(s => place(s, overlay));
        return;
      }
      const up = current.current;
      if (up.overlay !== null || up.gate !== null) {
        setState(s => ({ ...s, overlay: null, gate: null }));
        noteLeaving();
      }
      showing.current = null;
      afterLeaving(() => {
        showing.current = overlay;
        setState(s => place(s, overlay));
      });
    },
    [afterLeaving, cancelHandover, noteLeaving, questions, toast],
  );

  const openGate = useCallback(
    (feature: FeatureKey) => {
      questions.dismiss();
      const up = current.current.overlay;
      // over the Appearance sheet the gate stacks; anything else leaves first (see the header)
      if (up !== null && up.kind !== 'appearanceSheet') {
        setState(s => ({ ...s, overlay: null }));
        noteLeaving();
        showing.current = null;
      }
      afterLeaving(() => setState(s => ({ ...s, gate: feature })));
    },
    [afterLeaving, noteLeaving, questions],
  );

  const closeAll = useCallback(() => {
    questions.dismiss();
    cancelHandover();
    const up = current.current;
    if (up.overlay !== null || up.gate !== null) noteLeaving();
    showing.current = null;
    // a pump sheet that was waiting to open never will now: its stop has nothing to ask about
    clearAllStopped();
    setState(s => ({ ...s, overlay: null, gate: null }));
  }, [cancelHandover, noteLeaving, questions]);

  const api = useMemo<ShellApi>(
    () => ({
      // NibbleCue logs meals and nothing else, so the + goes straight to the meal sheet (CuddleCue's
      // own solids sheet) rather than to a grid of one
      openQuickLog: () => open({ kind: 'quickentry', moduleId: 'solids' }),
      openQuickEntry: (moduleId, preset) =>
        open(preset ? { kind: 'quickentry', moduleId, preset } : { kind: 'quickentry', moduleId }),
      openEntry: activityId => open({ kind: 'entry', activityId }),
      openChildSwitcher: () => open({ kind: 'child' }),
      openCoinChild: (subject, then) => open({ kind: 'coinChild', subject, then }),
      openAddChild: () => open({ kind: 'addChild' }),
      openChildPhoto: childId => open({ kind: 'childPhoto', childId }),
      openAppearanceSheet: () => open({ kind: 'appearanceSheet' }),
      openAccount: anchor => open({ kind: 'account', anchor }),
      openAbout: () => open({ kind: 'about' }),
      openSyncInspector: () => open({ kind: 'sync' }),
      openGate,
      openPlanPrompt: prompt => open({ kind: 'planPrompt', prompt }),
      confirm: questions.ask,
      closeAll,
    }),
    [open, openGate, closeAll, questions],
  );

  // the sheets' own dismissals (scrim, handle, Back, a row's onClose) start an exit too
  const closeOverlay = useCallback(() => {
    noteLeaving();
    /*
      A CUECOIN'S FLOW ENDS WHEN ITS SHEET DOES (data/writeOrigin.ts). The coin marks the write
      it is about to cause as `nfc`; if that mark outlived the sheet — cancelled, dismissed,
      saved — the parent's NEXT entry, made by hand from a tile, would be counted as a coin tap.
      Every close clears it, which costs nothing when no coin was involved.
    */
    clearWriteOrigin();
    showing.current = null;
    setState(s => ({ ...s, overlay: null }));
  }, [noteLeaving]);
  const closeGate = useCallback(() => {
    noteLeaving();
    setState(s => ({ ...s, gate: null }));
  }, [noteLeaving]);

  /*
    A QUESTION ANSWERED LEAVES LIKE ANY SHEET, but it is NOT the end of a coin's flow, so it does not
    clear the write origin as `closeOverlay` does: the start it asked about is written after the
    answer, and it is still the coin's.
  */
  const closeQuestion = useCallback(() => {
    if (showing.current?.kind !== 'confirm') return;
    noteLeaving();
    showing.current = null;
    setState(s => (s.overlay?.kind === 'confirm' ? { ...s, overlay: null } : s));
  }, [noteLeaving]);
  // the queue says what is up; the shell places it (after whatever is leaving) or puts it away.
  // Subscribed once: a resubscription would leave the queue with no sheet for a moment, which it
  // reads as its sheet gone and answers everything Cancel (`confirmQueue`)
  const placeQuestion = useRef({ open, closeQuestion });
  placeQuestion.current = { open, closeQuestion };
  useEffect(
    () =>
      questions.subscribe(() => {
        const request = questions.current();
        if (request === null) placeQuestion.current.closeQuestion();
        else placeQuestion.current.open({ kind: 'confirm', request });
      }),
    [questions],
  );

  const ov = state.overlay;
  const openKind = ov?.kind ?? (state.gate !== null ? 'gate' : null);
  // what the top bar draws as expanded, which moves only with its own two overlays (`shell.ts`)
  const barOpen = openKind === 'child' || openKind === 'account' ? openKind : null;
  // the coin's question: one object while the same coin asks it, so the switcher is not redrawn
  // for nothing while it is up (and `null`, which never changes, while it is not)
  const coinAsk = useMemo(
    () => (ov?.kind === 'coinChild' ? { subject: ov.subject, onPick: ov.then } : null),
    [ov],
  );

  /**
   * THE TOUR IS TOLD WHAT IS OVER THE PAGE, as it comes and goes: `open:quicklog` when the +
   * button's grid appears and `close:quicklog` when it is put away, and the same for every
   * other overlay. A tour card can ask for exactly that ("tap + to see it, then close it") and
   * hear the answer, and a tip never starts under a sheet. `did` ignores anything no card is
   * waiting on, so this costs one no-op the rest of the time.
   */
  const tour = useTour();
  const did = tour?.did;
  const lastOpen = useRef<string | null>(null);
  useEffect(() => {
    const was = lastOpen.current;
    if (was === openKind) return;
    lastOpen.current = openKind;
    if (was !== null) did?.(`close:${was}`);
    if (openKind !== null) did?.(`open:${openKind}`);
  }, [openKind, did]);

  return (
    <ShellContext.Provider value={api}>
      <ShellOpenContext.Provider value={openKind}>
        <ShellBarOpenContext.Provider value={barOpen}>
          {children}
          <AccountPopover
            visible={ov?.kind === 'account'}
            anchor={state.accountAnchor}
            onClose={closeOverlay}
          />
          <ChildSwitcherSheet visible={ov?.kind === 'child'} onClose={closeOverlay} />
          {/* the same sheet, borrowed to answer one question — see `ChildAsk` */}
          <ChildSwitcherSheet
            visible={ov?.kind === 'coinChild'}
            onClose={closeOverlay}
            ask={coinAsk}
          />
          <AddChildSheet visible={ov?.kind === 'addChild'} onClose={closeOverlay} />
          <ChildPhotoSheet
            childId={ov?.kind === 'childPhoto' ? ov.childId : null}
            onClose={closeOverlay}
          />
          {/* the + button's grid and every capture sheet are one sheet (`swapsInPlace`) */}
          <QuickEntrySheet
            grid={ov?.kind === 'quicklog'}
            moduleId={ov?.kind === 'quickentry' ? ov.moduleId : null}
            preset={ov?.kind === 'quickentry' ? (ov.preset ?? null) : null}
            onClose={closeOverlay}
          />
          {/* an entry, opened to correct it: its module's own capture sheet, filled in from it */}
          <EditEntrySheet
            activityId={ov?.kind === 'entry' ? ov.activityId : null}
            onClose={closeOverlay}
          />
          <AppearanceSheet visible={ov?.kind === 'appearanceSheet'} onClose={closeOverlay} />
          <AboutSheet visible={ov?.kind === 'about'} onClose={closeOverlay} />
          <SyncInspectorSheet visible={ov?.kind === 'sync'} onClose={closeOverlay} />
          <PlanPromptSheet
            prompt={ov?.kind === 'planPrompt' ? ov.prompt : null}
            onClose={closeOverlay}
          />
          {/* a question asked from nowhere in particular (`ShellApi.confirm`): one overlay among the
              rest, so it is up only once whatever was before it has gone */}
          <ShellConfirmSheet
            request={ov?.kind === 'confirm' ? ov.request : null}
            onAnswer={questions.answer}
            testID="shell.confirm"
          />
          {/* last in the tree so that, over the Appearance sheet, it presents on top */}
          <GateSheet feature={state.gate} onClose={closeGate} />
        </ShellBarOpenContext.Provider>
      </ShellOpenContext.Provider>
    </ShellContext.Provider>
  );
}
