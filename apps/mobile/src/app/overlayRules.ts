/**
 * The shell's rules about WHICH overlay request changes anything, pure so they are table tests
 * (`ShellProvider` carries them out; node cannot mount it).
 *
 * ── THE SHEET THAT IS ALREADY UP IS NOT OPENED AGAIN ─────────────────────────────────────────
 *
 * `open` closes whatever is up and places the new overlay once the old one has gone — right for a
 * different sheet, and destructive for the SAME one (the audit of 2026-09-24, feeding C8 / timers 1
 * and 2). Asking for the pump sheet while it was showing — "It ended" on its long-run card, a
 * coin's or the Live Activity's Stop — closed it, which let the parent's stop go and threw away
 * the amounts they had typed, and brought it back ~280 ms later counting again. The session was
 * then saved ending at the save, sometimes hours after the end the parent had just chosen. A
 * request for the capture sheet on screen is now nothing to do: the stop it marked first is
 * already frozen on that sheet's card.
 *
 * ── A PUMP'S STOP ENDS WHEN ANYTHING ELSE TAKES THE SCREEN ───────────────────────────────────────
 *
 * Today and a coin mark a pump's stop and THEN ask for its sheet, and the ask waits out any sheet
 * still closing. If another request lands in that wait, the pump sheet never shows, and the stop
 * it was marked for would sit on Today's card, frozen, with no form asking for the output (timers,
 * Low). Every request for something other than the pump sheet — or the stash-save sheet a running
 * pump hands its stop to — ends the stops that are not handed over.
 */
import type { ModuleId } from '@nibblecue/core';

/** The shape of an overlay request, as far as these rules read it. */
export type OverlayRequest =
  { kind: 'quickentry'; moduleId: ModuleId; preset?: unknown } | { kind: string };

const isCaptureSheet = (
  o: OverlayRequest,
): o is { kind: 'quickentry'; moduleId: ModuleId; preset?: unknown } => o.kind === 'quickentry';

/**
 * The request is for the capture sheet already showing, with nothing new to hand it. A preset
 * (a container for the bottle sheet) is new information, so a request carrying one still reopens.
 */
export function sameCaptureSheet(
  showing: OverlayRequest | null,
  requested: OverlayRequest,
): boolean {
  return (
    showing !== null &&
    isCaptureSheet(showing) &&
    isCaptureSheet(requested) &&
    showing.moduleId === requested.moduleId &&
    showing.preset === undefined &&
    requested.preset === undefined
  );
}

/**
 * THE + GRID TURNS INTO THE ENTRY SHEET WHERE IT STANDS (the owner, 2026-09-28, of "the + button
 * opens one sheet": *"Not sure what this is but I trust your judgement"*). The grid is the capture
 * sheet's first body (`QuickEntrySheet`'s `grid`), so a tile's request for a module is placed at
 * once, with no close and no wait for an exit: there is no second modal for iOS to refuse. Only
 * from the grid, and only to a capture sheet; everything else still closes what is up first.
 */
export function swapsInPlace(showing: OverlayRequest | null, requested: OverlayRequest): boolean {
  return showing !== null && showing.kind === 'quicklog' && isCaptureSheet(requested);
}

/** Opening this ends every pump stop not handed to the stash-save sheet (see the header). */
export function endsPumpStops(requested: OverlayRequest): boolean {
  if (requested.kind === 'stashsave') return false;
  return !(isCaptureSheet(requested) && requested.moduleId === 'pump');
}

/**
 * A SHEET WHOSE ONLY JOB IS TO LOG SOMETHING NEW: the + grid, a capture sheet (a running timer's
 * included, whose controls stop it), the pump's stash save. A view only member is never shown one
 * (the 2026-10-08 scenario finding; `useCanLog`): the shell refuses it with one sentence, as the
 * write funnel does. An entry opened from the log (`entry`) is not one of these: it reads, and
 * offers a change only to whoever may make it (`canChangeEntry`).
 */
export function logsNew(requested: OverlayRequest): boolean {
  return (
    requested.kind === 'quicklog' ||
    requested.kind === 'quickentry' ||
    requested.kind === 'stashsave'
  );
}

/**
 * A SHEET THE SHELL DOES NOT OWN IS STILL CLOSING (timers 23). Today's slot sheet (the Schedule
 * `LogSheet`, until 2026-09-25, when slots moved onto the capture sheets themselves) was Today's
 * own modal, and its "Done now" closed it and asked the shell for a capture sheet in the same tap. The shell only waited out its OWN closing overlays, so it presented the
 * next one while that modal was still leaving, which iOS refuses — the sheet the parent asked for
 * never appeared. The screen that owns such a sheet stamps when it will have gone; the shell's
 * handover waits for the later of its own clock and this one.
 */
let externalLeavingUntil = 0;

export function noteSheetLeaving(untilMs: number): void {
  externalLeavingUntil = Math.max(externalLeavingUntil, untilMs);
}

export function sheetLeavingUntil(): number {
  return externalLeavingUntil;
}

/*
 * ── NO WAITING ON MOTION NOBODY SEES (2026-09-28) ────────────────────────────────────────────────
 *
 * The hand-over waits for the closing sheet's slide (`SHEET_DURATION_MS`) and a little slack for the
 * platform to finish dismissing the window. It is on the path of every log made from the + button
 * (the grid closes, the entry sheet opens), and when the theme is still — the phone's Reduce Motion,
 * or Calm motion, at night by default — a sheet closes without a slide (`BottomSheet` and `Popover`
 * unmount at once), so the 220 ms were a wait on a slide that never played. Still, the wait is the
 * slack alone: iOS still refuses to present a modal in the frames its last one takes to go, so it is
 * never nothing.
 */

/** What the platform needs after a modal's exit before it will present the next one. */
export const HANDOVER_SLACK_MS = 60;

/** How long the next sheet waits for a closing one: its slide and the slack, or the slack alone. */
export const handoverAfter = (exitMs: number, still: boolean): number =>
  (still ? 0 : exitMs) + HANDOVER_SLACK_MS;
