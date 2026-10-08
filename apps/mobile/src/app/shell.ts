/**
 * What any screen may ask the shell to open (docs/DESIGN_SYSTEM.md §14; docs/MOBILE.md §3).
 * The shell — the navigator, the chrome and the overlays it hosts — provides this; a screen
 * never mounts a popover or a sheet of its own, so every overlay has one owner, one scrim
 * and one dismiss rule. Popovers take the opener's window rectangle so they anchor to it.
 *
 * Two contexts, both defined here rather than in ShellProvider.tsx: the API a screen calls,
 * and the read-only "what is open" the top bar needs for its `expanded` states. Keeping them
 * in this component-free module means Screen.tsx never imports the provider (and through it
 * every sheet), so a sheet that one day imports Screen cannot form a cycle.
 */
import type { FeatureKey, ModuleId, Occurrence, WelcomePrompt } from '@nibblecue/core';
import type { Anchor, Confirm } from '@nibblecue/ui';
import { createContext, useContext } from 'react';

/**
 * What a capture sheet opens WITH, when another surface hands it something: the bottle sheet
 * pointed at the counter container a pump session just poured (MILK_STASH.md §6d), or at the
 * container a parent picked on the stash screen.
 */
export interface QuickEntryPreset {
  containerId?: string;
  consumedMl?: number;
  /** The schedule slot a row, Up next or a reminder opened this sheet for (`SlotPreset`). */
  slot?: SlotPreset;
  /**
   * THE RUNNING TIMER A ROW OF TODAY'S "ALSO RUNNING" CARD OPENED THIS SHEET ON (2026-09-26): its
   * baby, so the Logging-for row starts on the baby whose timer was tapped and the sheet shows THAT
   * timer's running panel. With the top bar on Both and twins asleep at once, "up next" is a tie
   * and would have opened the first twin's sleep whichever row was tapped. Null for a household
   * timer (a pump), which names no baby and changes nothing.
   */
  timer?: { childId: string | null };
}

/**
 * A SLOT IS LOGGED ON THE SAME SHEET AS EVERYTHING ELSE (the owner, 2026-09-25: "why is logging
 * feeding from schedule -> today list, has different UI than if logging it from today's page …
 * change the today schedule logging ui to how it looks in the home page").
 *
 * A row on the Schedule tab, a row of Up next and a reminder's "Log it" used to open their own
 * sheet — a "Done now" button, a time stepper, an amount stepper — beside the module's real one.
 * Now they open the module's capture sheet, exactly as the Quick grid does, and this is what it
 * is told about the slot: whose it is (the slot's own baby, not the top bar's), the care item a
 * medicine slot is for, the two ways a feeding slot can be answered, and the two things only a
 * slot has — Skip, and the door to its rhythm — which the sheet's host puts at its foot.
 */
export interface SlotPreset {
  occurrence: Occurrence;
  /** The medicine behind a medicine slot, ticked when the medicine sheet opens. */
  careItemId?: string | null;
  /** Both feeding sheets, when a feeding slot can be answered either way. */
  methods?: readonly ModuleId[];
  /** Opens the activity's rhythm; null where the parent cannot change it. */
  onOpenRhythm?: ((activity: ModuleId) => void) | null;
  /**
   * True when a row of the Schedule tab's day list opened it — the one door to a slot that is
   * OVER. The host then starts the sheet's time at the slot's own time when the slot is over
   * (`slotPrefillAt`; the owner, 2026-09-25: "pre-fill the slot's time when tapping a past slot").
   * Up next, the hero and a reminder open only slots still to do, and start at now.
   */
  fromList?: boolean;
}

/** A pump session captured by its sheet, on its way to the stash-save sheet (§6d). */
export interface PumpSessionDraft {
  startAt: string;
  endAt: string | null;
  leftMl: number | null;
  rightMl: number | null;
  totalOnlyMl: number | null;
  totalMl: number;
  timerId: string | null;
  isPrivate?: boolean;
  /**
   * What page 1 said the milk is for: Store milk or Log feed (the pumping redesign, 2026-10-05).
   * Page 2 opens on it. Absent, Store milk.
   */
  purpose?: 'store' | 'feed';
}

export interface ShellApi {
  /** The center button's grid of everything enabled that can be quick-logged. */
  openQuickLog(): void;
  /** One module's capture sheet, optionally pointed at something (a container). */
  openQuickEntry(moduleId: ModuleId, preset?: QuickEntryPreset): void;
  /**
   * One entry, opened to correct it (PRODUCT_SPEC §4 "Edit"): its module's own capture sheet,
   * filled in from it, in an edit mode (`sheets/quick/edit`; the owner, 2026-09-26).
   */
  openEntry(activityId: string): void;
  /** The child switcher sheet — with "Both" / "All n" for multiples. */
  openChildSwitcher(): void;
  /**
   * WHICH BABY A CUECOIN IS FOR (docs/NFC_TAGS.md §3). The same list without the "Both" row,
   * because "Both" is a way of looking at two babies and not an answer to "who is this change
   * for". `subject` is the coin's name, so the sheet can say why it appeared.
   */
  openCoinChild(subject: string, then: (childId: string) => void): void;
  /** A second child, after setup: the sheet Family and the child switcher both open (docs/MULTIPLES.md §8). */
  openAddChild(): void;
  /** The baby's picture: choose, take or remove the one photo this child has (docs/MEDIA.md). */
  openChildPhoto(childId: string): void;
  /** The full Appearance sheet with the live preview. */
  openAppearanceSheet(): void;
  /** The account popover: Account & privacy · Plan · Appearance. */
  openAccount(anchor: Anchor | null): void;
  openAbout(): void;
  /** The paywall for a gate the parent walked into, carrying that feature's `why`. */
  openGate(feature: FeatureKey): void;
  /**
   * The trial-end sheet, seven or three days before the preview ends (`plan/PlanPromptSheet`).
   * Only `usePlanPrompt` opens it, and only at a moment core's `promptMayShow` allows.
   */
  openPlanPrompt(prompt: WelcomePrompt): void;
  /** The debug-only Sync inspector: the outbox, the cursors, and the dev writes (MOBILE §13). */
  openSyncInspector(): void;
  /**
   * A QUESTION ASKED FROM NOWHERE IN PARTICULAR (2026-09-29): a CueCoin's start over a running
   * sleep, a toast's "+ Liam" whose sheet has already gone. The app's own confirmation
   * (`ConfirmSheet`), hosted here like every other overlay: whatever is up is put away first and
   * the question opens once it has gone, so iOS always has somewhere to present it from, and it is
   * answered Cancel if anything else takes the screen before it is answered. A question asked from
   * a screen or from inside a sheet mounts its own (`useConfirm`), and the sheet stays up under it.
   */
  confirm: Confirm;
  /** Dev-only: six constructions of a circle and a card, side by side, for a screenshot. */
  closeAll(): void;
}

/** Which overlay is up. A gate over the Appearance sheet reports the sheet, its host. */
export type ShellOpenKind =
  | 'account'
  | 'child'
  | 'coinChild'
  | 'quicklog'
  | 'quickentry'
  | 'entry'
  | 'appearanceSheet'
  | 'about'
  | 'sync'
  | 'addChild'
  | 'childPhoto'
  | 'planPrompt'
  | 'confirm'
  | 'gate';

export const ShellContext = createContext<ShellApi | null>(null);
export const ShellOpenContext = createContext<ShellOpenKind | null>(null);

/** The two overlays the top bar draws as expanded: its child chip's, and its avatar's. */
export type ShellBarOpen = Extract<ShellOpenKind, 'child' | 'account'>;

/**
 * WHICH OF THE TOP BAR'S OWN OVERLAYS IS UP, and nothing else (2026-09-28). Every page's bar asked
 * `useShellOpen` for this, so every sheet that opened or closed — the + grid, each capture sheet,
 * a Save's close — re-rendered the bar of every page a parent had visited, twice per entry, for a
 * value that changes only when the child switcher or the account popover does. This one changes
 * only then.
 */
export const ShellBarOpenContext = createContext<ShellBarOpen | null>(null);

export function useShell(): ShellApi {
  const v = useContext(ShellContext);
  if (!v) throw new Error('useShell outside the shell');
  return v;
}

/** The open overlay's kind, or null — for what holds still while anything covers the page. */
export function useShellOpen(): ShellOpenKind | null {
  return useContext(ShellOpenContext);
}

/** The top bar's `expanded` states: the child switcher or the account popover, or null. */
export function useShellBarOpen(): ShellBarOpen | null {
  return useContext(ShellBarOpenContext);
}
