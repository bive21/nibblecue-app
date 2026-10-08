/**
 * The accounts state machine the whole app hangs off (docs/AUTH_AND_TRIAL.md §2,
 * docs/ACCOUNTS.md §6). One context, four phases, and the rule that decides the first frame:
 * a cached session is a signed-in app before any network call.
 *
 *   booting → signed_out | unverified | onboarding | ready
 *
 * Refresh runs in the background with the pure reducer in session.ts; `forced_sign_out` runs
 * the full teardown and lands on AUTH with the notice — and so does the auth client signing
 * itself out (`effectOfClientSignOut`). The account state (memberships, children, modules,
 * entitlement) is cached in preferences so an offline launch renders Today from what the server
 * last said, and preferences are cleared by teardown step 10. So is an invite held for a partner
 * who has not joined yet (`held-invite.ts`), which outlives a killed app until it is used.
 *
 * A HOUSEHOLD CAN LEAVE THE PHONE WITHOUT ITS PERSON (2026-09-25; `mirror.ts` decides, `teardown.ts`
 * scope `household` does it). When an account read no longer lists the household the mirror holds —
 * or a refused pull, confirmed by one — the household's rows, queue (kept, under this person),
 * reminders, widgets and preferences go, the session stays, and only then is the fresh account
 * written, which is what makes the phase `ended`.
 *
 * THREE PROMISES THE PUBLISHED TEXTS MAKE, KEPT HERE (2026-09-27): signing in again inside the 14
 * days keeps an account (`keep-account.ts`); nobody reaches the app without a recorded "yes" to the
 * current Terms (`terms-step.ts` — AUTH's own checkbox, never a phase); and nothing is measured on
 * the sign-in screens (`measured.ts` — the one emitter is gated here).
 *
 * THE LAST PERSON IN A HOUSEHOLD CAN LEAVE IT (migration 0143, 2026-09-29; `leave.ts`): the server
 * closes it, and it leaves the phone by the same road — the account read that no longer lists it —
 * with what the close answered kept for Ended's "Bring back" until its purge date.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { AppState, Linking } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { BRAND, LEGAL_VERSION } from '@nibblecue/brand';
import {
  canJoinAnother,
  focusAccount,
  standingWithNoHousehold,
  type LastHousehold,
} from '@nibblecue/core';
import {
  createAnalytics,
  gatedSink,
  quietAnalytics,
  type Analytics,
  type AnalyticsSink,
} from '../analytics';
import { readEnv, releaseEnvProblem, type AppEnv } from '../env';
import { prefsStore } from '../prefs/async-storage';
import { crumb } from '../app/boot';
import { updateChannel } from '../app/updates';
import { allowReopen, openLocalDb, selectLocalDbHousehold } from '../db';
import { dutyRead } from '../db/queries/duty';
import { saveDuty } from '../data/duty';
import { deviceId } from '../data/ids';
import { systemClock } from '../data/repository';
import { dutyStateOf } from '../duty/view';
import { dutyBeforeSwitch, type DutyStep, type OnDuty } from '../household/switchDuty';
import {
  joinedOffScreenOf,
  type JoinedOffScreen,
  type SwitchOutcome,
} from '../household/switchOutcome';
import { replayQuarantined } from '../sync/replay';
import { outboxTeardown, syncRuntime } from '../sync/status';
/*
  NIBBLECUE HAS NO WIDGETS AND REGISTERS NO PUSH DEVICE YET (2026-10-08): the teardown's two steps
  for them have nothing to undo. When NibbleCue's reminders are pushed from the server, step 6
  comes back as CuddleCue's `pushTeardown`.
*/
const widgetsTeardown = () => ({
  clearSnapshot: async (): Promise<void> => undefined,
  reloadAll: async (): Promise<void> => undefined,
});
const noPushTeardown = () => ({
  markInvalidOnServer: async (): Promise<void> => undefined,
  unregisterLocally: async (): Promise<void> => undefined,
});
import { foregroundReadDue } from './accountReads';
import { queueOnDisk, quarantine, teardownDeps } from './bindings';
import {
  clearInviteHold,
  holdOf,
  lapseOf,
  loadInviteHold,
  saveInviteHold,
  withLifetime,
  withPreview,
  type HeldInvite,
  type InviteHold,
  type InviteLapse,
  type InviteOrigin,
} from './held-invite';
import { inviteTokenOf } from './inviteLink';
import {
  clearJoinNote,
  loadJoinNote,
  notUsedWhyOf,
  redeemInvite,
  saveJoinNote,
  seatHoursOf,
  type JoinNote,
  type JoinProblem,
  type NotUsedWhy,
  type RedeemOutcome,
} from './join';
import { mockSessionStore } from './keychain';
import { askToKeepAccount, keepAnswerKey, keepAskDue } from './keep-account';
import {
  clearLeftHousehold,
  forgetLeftHousehold,
  leaveAlone,
  leaveSeat as leaveSeatOf,
  rememberLeaving,
  loadLeftHousehold,
  restorable,
  restoreLeft,
  saveLeftHousehold,
  type LeaveOutcome,
  type LeftHousehold,
  type RestoreOutcome,
  type SeatLeaveOutcome,
} from './leave';
import type { AuthLinkProblem } from './linkError';
import { analyticsOpen, launchCounted, signOutMeasured } from './measured';
import {
  clearPendingTermsAcceptance,
  loadPendingTermsAcceptance,
  pendingTermsKey,
  savePendingTermsAcceptance,
} from './pending-terms';
import { bringOwnFamilyOnScreen, type OwnFamilyOutcome } from './startFamily';
import { termsStepFor, type TermsStep } from './terms-step';
import { mockStateStore } from '../prefs/async-storage';
import { createProviders, type Providers } from './providers';
import {
  AuthFailure,
  type AccountState,
  type AuthProvider,
  type AccountsApi,
  type InvitePreview,
} from './providers/types';
import { OwedExit, signOutWhenFree, type ExitDeps } from './exits';
import { latchLifts, mirrorVerdict, recheckDue } from './mirror';
import type { MockBackend } from './providers/mock';
import type { QuarantineHeader } from './quarantine';
import { settleRefusedPull } from './refusedPull';
import {
  effectOfClientSignOut,
  reduceRefresh,
  refreshBackoffMs,
  stateAtLaunch,
  type ForcedSignOut,
  type Session,
  type SessionState,
} from './session';
import {
  resumeInterruptedTeardown,
  runTeardown,
  type SignOutScope,
  type TeardownScope,
} from './teardown';

export type { HeldInvite, InviteLapse } from './held-invite';
export type { JoinNote, JoinProblem } from './join';
export type { LeaveOutcome, LeftHousehold, RestoreOutcome, SeatLeaveOutcome } from './leave';
export type { JoinedOffScreen, SwitchOutcome } from '../household/switchOutcome';

/** The family on screen's stretch this person is on for, named, for the switcher's question. */
export type OnDutyHere = OnDuty & { name: string };
export type { ForcedSignOut } from './session';
export type { OwnFamilyOutcome } from './startFamily';

export type Phase =
  | 'booting'
  | 'signed_out'
  | 'unverified'
  | 'onboarding'
  /**
   * IN NO HOUSEHOLD, HAVING BEEN IN ONE — a temporary caregiver whose evening ran out, or
   * anyone an owner removed. `core/accounts/standing.ts` says why this is not `onboarding` and
   * how the two are told apart.
   */
  | 'ended'
  | 'ready';

export interface AuthContextValue {
  env: AppEnv;
  phase: Phase;
  session: Session | null;
  online: boolean;
  account: AccountState | null;
  /** Device time when `account` was read: pairs with account.serverNow for the plan (welcome.ts). */
  accountReadAt: number;
  /**
   * The household this device last showed for this account, or null. What `phase: 'ended'` is
   * decided from, and what names the household in its one sentence (`core/accounts/standing.ts`).
   */
  lastHousehold: LastHousehold | null;
  pendingEmail: string | null;
  /**
   * The invite code or link this phone is holding for somebody who has not joined yet — on disk,
   * so it survives Android killing the app while they wait for the confirmation email
   * (`held-invite.ts`). Null once it is used, refused, out of time, replaced, or let go.
   */
  heldInvite: HeldInvite | null;
  /**
   * What `check_invite` said about the held invite — the household's name, the inviter's, the
   * seat — or null when it was never checked (a server without 0139). AUTH, Verify and the join
   * page name the household from it.
   */
  heldPreview: InvitePreview | null;
  /**
   * Why the invite this phone was holding stopped working — refused, or out of time — kept (with
   * no code in it) until the person enters a new one or chooses to set up their own household,
   * so the join page can still say "ask for a new code" after a restart.
   */
  inviteLapse: InviteLapse | null;
  /**
   * THE HELD INVITE IS BEING REDEEMED NOW (`join.ts`): the moment an account with no household
   * exists, the invite it was holding is sent on its own — no second button to find.
   */
  joining: boolean;
  /** Why the last join did not land while the invite was kept (`join.ts` `JoinProblem`), or null. */
  joinProblem: JoinProblem | null;
  /**
   * WHAT THE JOINER IS OWED (`join.ts` `JoinNote`): "You joined Dana's family", or that an invite
   * was not used. The first page in the household reads it (`screens/auth/JoinedScreen.tsx`).
   */
  joinNote: JoinNote | null;
  /**
   * A HOUSEHOLD THIS ACCOUNT CLOSED AS ITS LAST MEMBER (migration 0143; `leave.ts`), kept on this
   * phone from what the close answered, so Ended can offer "Bring back" until its purge date. Null
   * for none, and once it is brought back, can no longer be, or its date has passed.
   */
  leftHousehold: LeftHousehold | null;
  /** An emailed link that did not work, for AUTH and Verify to say so (`linkError.ts`). */
  linkProblem: AuthLinkProblem | null;
  quarantined: QuarantineHeader | null;
  /** Why the app signed this phone out on its own, for AUTH's one sentence; null when it did not. */
  forcedSignOut: ForcedSignOut | null;
  recovery: boolean;
  /**
   * THE TERMS STEP (`terms-step.ts`): `none`, or why AUTH is showing the sign-up page's own
   * checkbox to somebody signed in — an account made without it, or Terms that moved on since they
   * said yes. NOT A PHASE: the phase underneath is unchanged, and the navigator draws AUTH, with
   * nothing else to go to, for as long as this is not `none` (`app/navigation.tsx`).
   */
  termsStep: TermsStep;
  /**
   * A sign-in just undid a pending deletion on the server (`keep-account.ts`): the one sentence is
   * owed, and `AccountKeptToast` says it and hands it back through `accountKeptSaid`.
   */
  accountKept: boolean;
  /**
   * THE SWITCHER (0153): bumped each time another family comes on screen, and the key everything
   * below the account remounts on (`household/HouseholdKey.tsx`), so no screen, sheet or timer of
   * the family left can act in the one now shown. It never moves for a first family (setup, a
   * join from Ended), which mounts as it always did.
   */
  householdEpoch: number;
  /** A switch is under way: the queue is being sent and the files changed. */
  switching: boolean;
  /** The family just switched to, for the one sentence that says so (`SwitchedToast`). */
  switchedTo: string | null;
  /** A second family joined whose switch did not land: said once (`SwitchedToast`, `settleJoin`). */
  joinedOffScreen: JoinedOffScreen | null;
  auth: AuthProvider;
  api: AccountsApi;
  mock: MockBackend | null;
  /** The app's one emitter, shut while a sign-in screen is in front (`measured.ts`). */
  analytics: Analytics;
  actions: {
    signedIn(session: Session): Promise<void>;
    setPendingEmail(email: string | null): void;
    refreshAccount(): Promise<AccountState | null>;
    /**
     * Hold a code or a link's token, replacing whatever was held or had lapsed — with what a check
     * said about it, and how the person got it (`held-invite.ts`).
     */
    holdInvite(
      invite: HeldInvite,
      more?: { origin?: InviteOrigin; preview?: InvitePreview | null },
    ): Promise<void>;
    /**
     * A CODE TYPED IN THE SHEET BY SOMEBODY SIGNED IN WITH NO HOUSEHOLD (setup, Ended): joined now,
     * and settled exactly as the held invite's auto-join is — the note on success, the household
     * read. The answer comes back so the sheet can say a refusal where the code was typed.
     */
    joinWithCode(code: string): Promise<RedeemOutcome | null>;
    /** The same, for an invite link pasted into the sheet (the whole message, or the link alone). */
    joinWithLink(token: string): Promise<RedeemOutcome | null>;
    /** The join page's Try again: the held invite, sent again now. */
    retryJoin(): Promise<void>;
    /** The joiner read the note: it is let go, on the phone too. */
    joinNoteSeen(): Promise<void>;
    /**
     * FAMILY'S "LEAVE HOUSEHOLD" (migration 0143; `leave.ts` `leaveAlone`): what the phone owes the
     * household is sent first, the server closes it only if nobody else is live in it, and the
     * household then leaves the phone by the account read, as any household does, onto Ended.
     */
    leaveHousehold(): Promise<LeaveOutcome>;
    /**
     * FAMILY'S "LEAVE <FAMILY>" FOR A CAREGIVER, A VIEWER OR A PARENT (2026-10-08; `leave.ts`
     * `leaveSeat`): a person on for the family is asked first (`on_duty`), what the phone owes the
     * family is sent, the seat is ended (`removeMember` on oneself), and the family leaves the phone
     * the way a removal does. Never for the owner, who hands the family on first.
     */
    leaveSeat(opts?: {
      /** The page asked "Leave anyway?" and the person said yes (`switchDuty.ts`). */
      handBackDuty?: boolean;
    }): Promise<SeatLeaveOutcome>;
    /** ENDED'S "BRING BACK" (0143): the household this account closed, before its purge date. */
    restoreHousehold(): Promise<RestoreOutcome>;
    /** Let the invite go: they joined, or they are setting up a household of their own. */
    forgetInvite(): Promise<void>;
    /** The server refused the held invite: it is cleared, and the lapse says why. */
    inviteRefused(): Promise<void>;
    /**
     * The phone's own clock check (core's `heldInviteExpired`): true while the held invite is still
     * worth sending; false — with the lapse recorded — once its lifetime has passed.
     */
    inviteStillLive(): Promise<boolean>;
    signOut(scope: SignOutScope): Promise<void>;
    /**
     * THE SYNC ENGINE'S `onForbidden` (pull.ts, WP4 D37): the household's pull was refused. The
     * account is read BEFORE anything is deleted, and `mirror.ts` decides from that read — nothing
     * goes on a refusal the account contradicts. Started, never awaited: a pull that waited on
     * this would hold the engine's one pull slot while the teardown's step 2 tries to flush.
     */
    pullRefused(householdId: string): Promise<void>;
    openLink(url: string): Promise<void>;
    /**
     * THE BOX, TICKED ON THE TERMS STEP: recorded exactly as the sign-up side records its own —
     * the pending record for this address, then `accept_terms` — so a tick made offline is kept on
     * the phone and sent when it can be, and the step is gone the moment the box is ticked.
     */
    agreeToTerms(): Promise<void>;
    /** The account-kept sentence has been said. */
    accountKeptSaid(): void;
    /**
     * SHOW ANOTHER FAMILY (0153). What this family owes the server is sent first; a family not on
     * screen never holds an unsent entry, so nothing the phone keeps is ever the last copy of a log
     * (CLAUDE.md rule 7). `owed` says how many could not be sent, and nothing changes.
     */
    switchHousehold(
      householdId: string,
      opts?: {
        /** The switcher asked "Switch anyway?" and the person said yes (`switchDuty.ts`). */
        handBackDuty?: boolean;
      },
    ): Promise<SwitchOutcome>;
    /**
     * WHETHER THIS PERSON IS ON IN THE FAMILY ON SCREEN, read before a switch starts, so the
     * switcher can ask while it is still open (`switchDuty.ts`). Writes nothing.
     */
    dutyHere(): Promise<OnDutyHere | null>;
    /**
     * "START YOUR OWN FAMILY" FINISHED (0154; `startFamily.ts`): the account read again, and the
     * family just made brought on screen by the switch above, once what the family on screen owes
     * is sent. Null names the family this person owns (an earlier Finish whose answer was lost).
     */
    startedOwnFamily(householdId: string | null): Promise<OwnFamilyOutcome>;
    switchedSaid(): void;
    joinedOffScreenSaid(): void;
    dismissForcedSignOut(): void;
    clearLinkProblem(): void;
    clearRecovery(): void;
  };
}

const AuthContext = createContext<AuthContextValue | null>(null);

const ACCOUNT_CACHE = 'account_state';

/**
 * THE FAMILY ON SCREEN, per account (0153): an account-level key, so a family leaving the phone
 * does not take the choice with it (`prefs/index.ts`). One that names a family the account is no
 * longer in reads as the first family listed (`householdOnScreen`, core).
 */
const ACTIVE_HOUSEHOLD = (uid: string) => `active_household:${uid}`;
/**
 * THE LAST HOUSEHOLD THIS ACCOUNT WAS IN, on this device, per account.
 *
 * Written while the app is showing a household and never cleared by a refresh that comes back
 * empty — that emptiness is exactly what it is here to explain. A household teardown keeps it for
 * the same reason (`prefs/index.ts` `ACCOUNT_LEVEL_KEYS`). Sign-out clears it with the rest of the
 * account's preferences, which is right: signing out is not being removed — except the forced
 * sign-out a refused pull falls back to when the account cannot be read, which may well BE a
 * removal, and keeps it so that signing in again says so (`mirror.ts`).
 */
const LAST_HOUSEHOLD = (uid: string) => `last_household:${uid}`;

/**
 * A remembered household, or null. An unreadable memory is the same as none: a new account gets
 * setup, which is the safe way to be wrong — it never accuses anyone of having been removed.
 */
function parseLastHousehold(raw: string | null): LastHousehold | null {
  if (raw === null) return null;
  try {
    const v = JSON.parse(raw) as Partial<LastHousehold> | null;
    if (typeof v?.id !== 'string') return null;
    // the mark a leave writes (`leave.ts` `rememberLeaving`): only `true` is a leave
    return {
      id: v.id,
      name: typeof v.name === 'string' ? v.name : '',
      ...(v.left === true ? { left: true } : {}),
    };
  } catch {
    return null;
  }
}

/** This account's memory of its household on this device, as `phase` reads it. */
const rememberedHousehold = async (uid: string): Promise<LastHousehold | null> =>
  parseLastHousehold(await prefsStore.get(LAST_HOUSEHOLD(uid)).catch(() => null));

/**
 * THE HOUSEHOLD THIS ACCOUNT CLOSED, while it can still be brought back (`leave.ts`, migration 0143).
 * One whose purge date has passed is let go as it is read: it can no longer come back, so Ended's
 * button goes, and so does the memory of it as the last household (`forgetLeftHousehold`), which is
 * why every caller reads this BEFORE `rememberedHousehold`.
 */
async function rememberedLeft(uid: string): Promise<LeftHousehold | null> {
  const left = await loadLeftHousehold(prefsStore, uid);
  if (left === null || restorable(left, Date.now())) return left;
  await forgetLeftHousehold(prefsStore, uid, left.id, LAST_HOUSEHOLD(uid));
  return null;
}

/**
 * THE LAUNCH'S EARLY OPEN, for the family on screen (0153): the file it chose, when it chose one,
 * else the file the account's adoption will select anyway (`selectLocalDbHousehold`).
 */
async function openFamilyDb(userId: string): Promise<void> {
  const wanted = await prefsStore.get(ACTIVE_HOUSEHOLD(userId)).catch(() => null);
  if (wanted !== null) await selectLocalDbHousehold(wanted);
  await openLocalDb();
}

/** The longest the loading screen waits on the first account read after a sign-in. */
const FIRST_READ_WAIT_MS = 8_000;

/** How long a leave waits for what the phone owes the household: the teardown's own flush budget. */
const LEAVE_FLUSH_MS = 5_000;
const waitFor = (ms: number): Promise<void> =>
  new Promise(resolve => {
    setTimeout(resolve, ms);
  });

/** The household this phone's mirror holds: what the sync engine and the database are keyed on. */
const mirrorOf = (account: AccountState | null): string | null =>
  account?.memberships[0]?.household_id ?? null;

/**
 * WHERE THE APP'S PRODUCT ANALYTICS GO: nowhere, today (docs/LAUNCH_GUIDE.md Part D item 10 — the
 * privacy policy says no usage analytics are collected). Everything still goes through the gate
 * below, so the day a first-party sink is wired here it inherits "never on the sign-in screens".
 */
const ANALYTICS_SINK: AnalyticsSink = () => undefined;

/** Where a box ticked on this phone for this session's address is remembered, or null for none. */
const tickedKey = (ticked: boolean, s: Session): string | null =>
  ticked && s.user.email !== null ? pendingTermsKey(s.user.email) : null;

export function AuthProviderRoot({
  children,
  env: envOverride,
}: {
  children: ReactNode;
  env?: AppEnv;
}) {
  const env = useMemo(() => {
    if (envOverride !== undefined) return envOverride;
    const read = readEnv();
    // a store build on the test backend stops here, before anything mounts (env.ts says why)
    const problem = releaseEnvProblem(updateChannel(), read);
    if (problem !== null) throw new Error(problem);
    return read;
  }, [envOverride]);
  const [providers, setProviders] = useState<Providers | null>(null);
  const [sessionState, setSessionState] = useState<SessionState | { status: 'booting' }>({
    status: 'booting',
  });
  const [account, setAccount] = useState<AccountState | null>(null);
  const [accountReadAt, setAccountReadAt] = useState(0);
  /**
   * WHOSE ACCOUNT HAS BEEN READ FROM THE SERVER IN THIS RUN — not the launch's cache. The auto-join
   * waits for it: a cache can say "no household" for an account that has one by now, and the phone
   * must not send an invite on that (the server refuses a second household since 0139, and an older
   * server would not have).
   */
  const [accountReadFor, setAccountReadFor] = useState<string | null>(null);
  /*
    THE ACCOUNT HAS BEEN ASKED FOR, since this sign-in (the owner, 2026-10-08: "after signing in
    with google … 'setup takes about 5 minutes' show up briefly, then recognizing there is an
    active household"). Until the first account read for the person signed in has answered —
    with their families, with none, or with no connection — the app shows the loading screen,
    never setup: "no account read yet" is not "no family". Offline, a failed read counts as asked,
    and a read that never answers is given up on after `FIRST_READ_WAIT_MS`, so nobody waits
    forever on a loading screen.
  */
  const [accountAskedFor, setAccountAskedFor] = useState<string | null>(null);
  const accountReadForRef = useRef<string | null>(null);
  accountReadForRef.current = accountReadFor;
  /** When `adopt` last wrote a read, for the foreground rule below (`accountReads.ts`). */
  const lastReadAt = useRef(0);
  /** The household this device last showed for this account, or null (`standing.ts`). */
  const [lastHousehold, setLastHousehold] = useState<LastHousehold | null>(null);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  /** The held invite or its lapse (`held-invite.ts`); the ref is for callbacks that must not wait a render. */
  const [inviteHold, setInviteHold] = useState<InviteHold | null>(null);
  const inviteHoldRef = useRef<InviteHold | null>(null);
  /**
   * THE JOIN (`join.ts`). `joiningRef` is the one join in flight; `joinTried` names the held invite
   * the auto-join has already sent for this account, so a refusal or a fault is not sent again on
   * every render — a reconnect, Try again, or a new invite sends it again; `joinNote` is what the
   * joiner is owed, per account, on disk.
   */
  const [joining, setJoining] = useState(false);
  const joiningRef = useRef(false);
  /** The held invite this run already tried and kept (`useEffect` on the held invite). */
  const heldTriedRef = useRef<string | null>(null);
  const joinTried = useRef<string | null>(null);
  const [joinProblem, setJoinProblem] = useState<JoinProblem | null>(null);
  const joinProblemRef = useRef<JoinProblem | null>(null);
  const [joinNote, setJoinNote] = useState<JoinNote | null>(null);
  const joinNoteRef = useRef<JoinNote | null>(null);
  const [linkProblem, setLinkProblem] = useState<AuthLinkProblem | null>(null);
  /** The auth link currently being opened — getInitialURL and the url event can both fire for one tap. */
  const openingLink = useRef<string | null>(null);
  /** The household this account closed, for Ended's "Bring back" (`leave.ts`); the ref for callbacks. */
  const [leftHousehold, setLeftHousehold] = useState<LeftHousehold | null>(null);
  const leftRef = useRef<LeftHousehold | null>(null);
  leftRef.current = leftHousehold;
  const [quarantined, setQuarantined] = useState<QuarantineHeader | null>(null);
  const [forcedSignOut, setForcedSignOut] = useState<ForcedSignOut | null>(null);
  const [recovery, setRecovery] = useState(false);
  /**
   * THE ADDRESS WHOSE TICKED BOX IS WAITING ON THIS PHONE for the server (`pending-terms.ts`, as
   * `pendingTermsKey` spells it), or null. Set whenever a pending record is found or written, and
   * kept for the session: the account read may not show the acceptance yet, and the terms step
   * must never ask twice for a "yes" already given here (`terms-step.ts`).
   */
  const [termsTickedHere, setTermsTickedHere] = useState<string | null>(null);
  /** A sign-in undid a pending deletion: the sentence is owed (`keep-account.ts`). */
  const [accountKept, setAccountKept] = useState(false);
  // the switcher (0153): the account as READ, every family in it, and the family on screen
  const rawAccountRef = useRef<AccountState | null>(null);
  const activeRef = useRef<string | null>(null);
  const [householdEpoch, setHouseholdEpoch] = useState(0);
  const [switching, setSwitching] = useState(false);
  const switchingRef = useRef(false);
  const [switchedTo, setSwitchedTo] = useState<string | null>(null);
  // the switch as a join reaches it: settled before `switchHousehold` is declared
  const switchRef = useRef<(householdId: string) => Promise<SwitchOutcome>>(() =>
    Promise.resolve({ kind: 'failed' }),
  );
  /**
   * A SECOND FAMILY JOINED WHOSE SWITCH DID NOT LAND (`settleJoin`): what is said instead of "You
   * joined", and the note itself, held until a switch brings that family on screen. In memory only:
   * after a restart the toast has said it, and the family is under Your families.
   */
  const [joinedOffScreen, setJoinedOffScreen] = useState<JoinedOffScreen | null>(null);
  const owedJoinNoteRef = useRef<JoinNote | null>(null);
  /**
   * THE GATE ON THE APP'S ONE EMITTER (`measured.ts` `analyticsOpen`), written every render from
   * the phase and the terms step — shut on every sign-in screen. Every event the app emits goes
   * through it: the screens' own, the sync engine's, the tour's.
   */
  const measuring = useRef(false);
  const analytics = useMemo(
    () => createAnalytics(gatedSink(ANALYTICS_SINK, () => measuring.current)),
    [],
  );
  /**
   * THE ONE EVENT DECIDED BEFORE THE GATE COULD DECIDE IT: `signed_out` is written at a teardown's
   * last step, when the app is already back on AUTH and the gate is shut. So the teardown is handed
   * this ungated emitter when the sign-out STARTED inside the household, and a quiet one when it
   * started on a sign-in screen (`measured.ts` `signOutMeasured`).
   */
  const signOutAnalytics = useMemo(() => createAnalytics(ANALYTICS_SINK), []);
  /** The phase and the terms step as of the last render, for callbacks (`tearDown`). */
  const phaseRef = useRef<Phase>('booting');
  const termsShown = useRef(false);
  /** This run's launch has been counted (`measured.ts` `launchCounted`). */
  const launchCountedOnce = useRef(false);
  /**
   * THE DELETION UNDO'S BOOKKEEPING (`keep-account.ts`). `keepGen` moves on at every sign-in and
   * sign-out, so an answer that comes back for a session that is gone is dropped; `keepAsking` is
   * the ask in flight for this generation; `keepAnswered` is the pending deletion the server has
   * already answered for, so an account read showing it again starts no new ask.
   */
  const keepGen = useRef(0);
  const keepAsking = useRef<{ gen: number; run: Promise<void> } | null>(null);
  const keepAnswered = useRef<string | null>(null);
  const keepTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keepAttempts = useRef(0);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tearingDown = useRef(false);
  /**
   * THE TEARDOWN UNDER WAY KEEPS THE SESSION (scope `household`). It takes no step 7, so a
   * `SIGNED_OUT` from the auth client during one is not its own, and neither is a refresh the
   * server refuses: the listener and `refresh` remember either here, and `endHousehold` answers it
   * the moment the household is off the phone, rather than it being dropped as "a sign-out already
   * under way".
   */
  const keepsSession = useRef(false);
  const signedOutMeanwhile = useRef(false);
  /** The teardown under way, for a sign-out asked for meanwhile to wait on (`exits.ts`). */
  const teardownDone = useRef<Promise<boolean> | null>(null);
  /** Sign-outs asked for while a household teardown runs, owed to its end (`exits.ts`). */
  const owedExit = useMemo(() => new OwedExit(), []);
  /**
   * The session as of right NOW, for callbacks. Rendering writes it; the teardown's last step
   * writes it too, because a sign-out waiting on that teardown looks again before any render
   * does (`exits.ts` `signOutWhenFree`) and must see nobody signed in.
   */
  const sessionRef = useRef<SessionState | { status: 'booting' }>(sessionState);
  sessionRef.current = sessionState;
  /** The account the app is showing — whose household the mirror holds — for callbacks. */
  const accountRef = useRef<AccountState | null>(account);
  accountRef.current = account;
  /** A refused pull is being settled: another one arriving meanwhile starts nothing. */
  const settling = useRef(false);
  /** The last refused pull settled with nothing deleted (`mirror.ts` `recheckDue`). */
  const settledQuietly = useRef<{ householdId: string; atMs: number } | null>(null);

  const session = sessionState.status === 'signed_in' ? sessionState.session : null;
  const online = sessionState.status === 'signed_in' ? sessionState.online : true;

  /**
   * THE DELETION UNDO FORGETS WHAT IT WAS ASKING: a sign-in or a sign-out moved the session on, so
   * an answer still on its way, a retry still waiting, and what the server last said all belong to
   * a session that is not this one any more.
   */
  const forgetKeepAsk = useCallback(() => {
    keepGen.current += 1;
    keepAsking.current = null;
    keepAnswered.current = null;
    keepAttempts.current = 0;
    if (keepTimer.current) clearTimeout(keepTimer.current);
    keepTimer.current = null;
  }, []);

  /* ---- teardown, one function for every exit ---- */
  const tearDown = useCallback(
    (
      scope: TeardownScope,
      p: Providers,
      opts: { keepPrefs?: readonly string[] } = {},
    ): Promise<boolean> => {
      if (tearingDown.current) return Promise.resolve(false);
      tearingDown.current = true;
      keepsSession.current = scope === 'household';
      /*
        EVERY TEARDOWN SAYS WHICH IT IS, WHERE IT BEGINS (the owner's Expo Go log, 2026-09-29: "is
        this normal?"). One deletes the phone's database, and the log only showed what came after —
        reads refused for teardown, the phase moving on — so it could not tell a Sign out the
        person tapped (`local`, `global`, `switch`, `deletion`) from one the app started itself
        (`forced`: a refresh the server refused, the auth client dropping its session, or a refused
        pull the session check or the account read confirmed — `refusedPull.ts` logs its own
        steps) or a household leaving the phone (`household`). Logging only.
      */
      crumb(`auth: teardown started (${scope})`);
      // decided NOW, where the sign-out starts: its event is written once the app is back on AUTH
      const measured = signOutMeasured(phaseRef.current, termsShown.current);
      const run = (async (): Promise<boolean> => {
        try {
          const current = sessionRef.current;
          const user =
            current.status === 'signed_in'
              ? { id: current.session.user.id, email: current.session.user.email }
              : null;
          await runTeardown(
            scope,
            teardownDeps({
              auth: p.auth,
              // a sign-out started on Verify, on Ended or on the terms step is measured by nobody
              analytics: measured ? signOutAnalytics : quietAnalytics(),
              currentUser: () => user,
              // The real queue, at BOTH call sites (WP4.9). Step 2 flushes it inside its budget
              // and step 3 quarantines whatever is left; the WP2 placeholder did neither, and
              // losing three queued entries on sign-out produced no error and no failing test.
              // With no engine built yet (a teardown at launch), step 3 reads the file itself.
              outbox: outboxTeardown(queueOnDisk),
              // step 5: the widgets forget the household before the database goes (WP9)
              widgets: widgetsTeardown(),
              // step 6: the server stops pushing to this phone, and the phone drops its token (0121)
              push: noPushTeardown(),
              freezeUi: () => undefined,
              closeSheets: () => undefined,
              resetToAuth: () => {
                // written through at once: a sign-out waiting on this teardown looks at it next,
                // before any render has (`sessionRef`)
                sessionRef.current = { status: 'signed_out' };
                setSessionState({ status: 'signed_out' });
                setAccount(null);
                setAccountReadFor(null);
                setAccountAskedFor(null);
                // the next account to sign in reads its own memory (`signedIn`), never this one's
                setLastHousehold(null);
                // and its own record of a household it closed (step 10 swept the stored copy)
                leftRef.current = null;
                setLeftHousehold(null);
                settledQuietly.current = null;
                // step 10 already swept the stored copy with the other preferences
                inviteHoldRef.current = null;
                setInviteHold(null);
                // and the join's own: a note or a problem belongs to the account signing out
                joinNoteRef.current = null;
                setJoinNote(null);
                joinProblemRef.current = null;
                setJoinProblem(null);
                joinTried.current = null;
                setLinkProblem(null);
                setRecovery(false);
                // nothing ticked or kept carries over to whoever signs in next
                setTermsTickedHere(null);
                setAccountKept(false);
                forgetKeepAsk();
              },
              clearMemory: async () => {
                setAccount(null);
              },
            }),
            // what step 10 of a sign-out leaves — only a refused pull's fallback passes any — and
            // what the mark carries, so a run a killed app left keeps it too (`TeardownMark`)
            { keepPrefs: opts.keepPrefs ?? [] },
          );
          setQuarantined(await quarantine.pending());
          return true;
        } finally {
          tearingDown.current = false;
          keepsSession.current = false;
        }
      })();
      teardownDone.current = run;
      return run;
    },
    [signOutAnalytics, forgetKeepAsk],
  );

  /**
   * WHAT `exits.ts` ASKS OF THIS STATE MACHINE, as its refs stand at the moment it asks: a sign-out
   * asked for while a teardown runs waits for a sign-out, and is owed to a household leaving.
   */
  const exitDeps = useCallback(
    (p: Providers): ExitDeps => ({
      signedIn: () => sessionRef.current.status === 'signed_in',
      busy: () => tearingDown.current,
      keepsSession: () => keepsSession.current,
      start: scope => tearDown(scope, p),
      underWay: () => (teardownDone.current ?? Promise.resolve(false)).catch(() => false),
      owe: scope => owedExit.ask(scope),
    }),
    [tearDown, owedExit],
  );

  /* ---- the account state, cached for an offline launch ---- */

  /**
   * A READ, WRITTEN AS THE ACCOUNT: the state, the cache an offline launch renders from, and the
   * household the device is showing. Every caller has already decided the read is one to keep
   * (`mirror.ts`); false when it was not written after all.
   *
   * NEVER DURING A TEARDOWN AND NEVER ONCE SIGNED OUT — `refreshAccount`'s rule, held here, where
   * every read becomes the account, because a caller's check can be an `await` old by now (a
   * household teardown, a session check) and something may have started in between.
   *
   * AND A HOUSEHOLD ABOUT TO BE SHOWN LIFTS THE DATABASE LATCH FIRST (`mirror.ts` `latchLifts`): a
   * household teardown left it closed, and the commit this state causes mounts screens whose
   * first reads run before `SyncProvider`'s effect gets to lift it. Before the state is set, so
   * none of them is refused — and never while a teardown runs or nobody is signed in, so a
   * sign-out's latch is never lifted here.
   */
  const adopt = useCallback(async (read: AccountState): Promise<boolean> => {
    const cur = sessionRef.current;
    if (tearingDown.current || cur.status !== 'signed_in') return false;
    /*
      THE ACCOUNT THE APP SEES IS FOCUSED ON THE FAMILY ON SCREEN (0153; core `focusAccount`): that
      family first, with its babies, modules and plan. Every surface reads `memberships[0]`, so
      every surface is about the family on screen. The database is pointed at that family's file
      BEFORE the latch lifts and before the account is written, so the first read after this
      commit reads the right file.
    */
    const state = focusAccount(read, activeRef.current);
    const showing = mirrorOf(state);
    const before = mirrorOf(accountRef.current);
    await selectLocalDbHousehold(showing);
    if (tearingDown.current || sessionRef.current.status !== 'signed_in') return false;
    if (
      latchLifts({
        showing,
        mirror: before,
        tearingDown: tearingDown.current,
        signedIn: cur.status === 'signed_in',
      })
    )
      allowReopen();
    rawAccountRef.current = read;
    activeRef.current = showing;
    accountRef.current = state;
    setAccount(state);
    // another family on screen than a moment ago: everything below the account remounts on it
    if (before !== null && showing !== null && showing !== before) setHouseholdEpoch(e => e + 1);
    setAccountReadAt(Date.now());
    setAccountReadFor(cur.session.user.id);
    lastReadAt.current = Date.now();
    // the read is cached as it came, every family in it, and focused again when it is read back
    await prefsStore.set(ACCOUNT_CACHE, JSON.stringify({ state: read, readAt: Date.now() }));
    // the device writes down the household it is showing, so that a later read coming back
    // EMPTY can be told apart from an account that never had one (`standing.ts`)
    const here = state.memberships[0];
    const uid = state.profile?.id ?? null;
    if (here !== undefined && uid !== null) {
      const last: LastHousehold = { id: here.household_id, name: here.household_name };
      await prefsStore.set(LAST_HOUSEHOLD(uid), JSON.stringify(last));
      setLastHousehold(last);
    }
    return true;
  }, []);

  /**
   * THE HOUSEHOLD LEAVES THE PHONE, THE PERSON STAYS (`mirror.ts` `end_household`; `teardown.ts`
   * scope `household`). It runs while the account still lists the household — so `SyncProvider`,
   * and the engine step 3 reads the queue through, are still mounted — and the caller writes the
   * fresh read only after it, which is what turns the phase to `ended`. True when the caller may
   * write that read: the teardown ran, and the person is still signed in.
   */
  const endHousehold = useCallback(async (): Promise<boolean> => {
    if (!providers) return false;
    crumb(
      'auth: this account is no longer in the household this phone holds — it leaves the phone',
    );
    signedOutMeanwhile.current = false;
    const ran = await tearDown('household', providers).catch(() => false);
    // step 10 swept the stored note (`join_note:<uid>` is not an account-level key): a note about
    // joining a household that has just left the phone says nothing true, so memory lets it go too
    joinNoteRef.current = null;
    setJoinNote(null);
    /*
      A SIGN-OUT ASKED FOR WHILE IT RAN is run now, the moment the household is off the phone —
      the strongest one asked (`exits.ts`), and everybody who asked is answered only once it has:
      a person who tapped Sign out, or confirmed Delete account, is told so because it is so. It
      takes the place of a session that ended meanwhile, which it signs out as well.
    */
    const owed = owedExit.take();
    const died = signedOutMeanwhile.current;
    signedOutMeanwhile.current = false;
    if (owed !== null) {
      try {
        await signOutWhenFree(owed.scope, exitDeps(providers));
      } finally {
        owed.settle();
      }
      return false;
    }
    if (!died) return ran;
    /*
      THE SESSION ENDED WHILE THE HOUSEHOLD LEFT: supabase-js dropped it (a refused refresh) and
      said SIGNED_OUT mid-teardown, when a teardown already under way could not start another. It
      is answered now, the way the listener answers it. The household is off the phone already, so
      this finds no queue left to keep, and the quarantine the household wrote is added to by any
      later write, never replaced (`quarantine.ts`).
    */
    setForcedSignOut('session');
    await signOutWhenFree('forced', exitDeps(providers));
    return false;
  }, [providers, tearDown, owedExit, exitDeps]);

  const refreshAccount = useCallback(async (): Promise<AccountState | null> => {
    /*
      NOT WHILE A TEARDOWN RUNS, and not with an answer that lands during one. A read made after
      the auth client dropped its session (the forced sign-out below) comes back EMPTY, and an
      empty account unmounts the sync engine (`SyncProvider` keys it on the household) — which is
      what teardown step 3 reads the unsynced queue through. An account written mid-teardown
      could cost the quarantine its contents (CLAUDE.md rule 7); an account not written costs
      nothing, because step 11 clears it anyway.
    */
    if (!providers || sessionRef.current.status !== 'signed_in' || tearingDown.current) return null;
    const userId = sessionRef.current.session.user.id;
    let state: AccountState;
    try {
      state = await providers.api.bootstrapState();
    } catch (err) {
      setAccountAskedFor(userId);
      if (err instanceof AuthFailure && err.code === 'offline') return null; // keep what we have
      throw err;
    }
    setAccountAskedFor(userId);
    if (tearingDown.current) return null;
    const now = sessionRef.current;
    if (now.status !== 'signed_in' || now.session.user.id !== userId) return null;
    /*
      THE READ DECIDES THE MIRROR BEFORE IT IS WRITTEN (`mirror.ts`). A read that no longer lists
      the household this phone holds takes that household off the phone FIRST, session kept, and is
      written after: written first, it would flip the account to "no household" and unmount the
      sync engine step 3 reads the queue through — and the Ended screen would say the household's
      record is no longer on this phone while every row of it still was. A read that does not name
      this account at all is not written over a household it cannot speak for.
    */
    const verdict = mirrorVerdict({
      trigger: 'account_read',
      userId,
      mirror: mirrorOf(accountRef.current),
      read: state,
    });
    if (verdict === 'hold') return null;
    if (verdict === 'end_household' && !(await endHousehold())) return null;
    if (!(await adopt(state))) return null;
    return state;
  }, [providers, adopt, endHousehold]);

  /* ---- the refresh loop: reducer + backoff, never a sign-out from the device clock ---- */
  const refresh = useCallback(async () => {
    if (!providers || sessionRef.current.status !== 'signed_in') return;
    const outcome = await providers.auth.refreshSession();
    const cur = sessionRef.current;
    if (cur.status !== 'signed_in') return;
    /*
      A TEARDOWN ALREADY UNDER WAY OWNS THE EXIT. A refresh the server refuses makes supabase-js
      emit SIGNED_OUT before `refreshSession` even returns, and the forced sign-out that event
      starts (below) is by now between its steps. Setting `signed_out` here, mid-teardown, would
      unmount the sync engine before step 3 read the queue — the quarantine would be empty and step
      8 would delete the entries it exists to keep. The teardown sets `signed_out` itself, at step 12.
      A HOUSEHOLD teardown sets no such thing — it keeps the session — so a refusal landing in one
      is remembered, and `endHousehold` signs out the moment the household is off the phone.
    */
    if (tearingDown.current) {
      if (keepsSession.current && reduceRefresh(cur, outcome).effect === 'forced_sign_out')
        signedOutMeanwhile.current = true;
      return;
    }
    const { state, effect } = reduceRefresh(cur, outcome);
    if (effect === 'forced_sign_out') {
      /*
        THE TEARDOWN FIRST, `signed_out` LAST (rule 7; the sign-in audit, 2026-09-25). This path
        set the session to `signed_out` and THEN started the teardown — and that re-render
        unmounted the sync engine the teardown reads the unsynced queue through, so step 3 found it
        empty, quarantined nothing, and step 8 deleted the entries it exists to keep. It runs on
        its own whenever the server refuses a refresh while the access token still works (the
        launch refresh within the hour after "sign out everywhere" on the other phone). The
        teardown says `signed_out` itself, at its last step (`resetToAuth`), as the client's own
        sign-out above already does. Only a teardown that threw before that step — never one
        another caller is still running — is answered here.
      */
      setForcedSignOut('session');
      try {
        await tearDown('forced', providers);
      } finally {
        if (!tearingDown.current && sessionRef.current.status === 'signed_in') {
          setSessionState(state);
        }
      }
      return;
    }
    setSessionState(state);
    if (effect === 'schedule_retry' && state.status === 'signed_in') {
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(
        () => void refresh(),
        refreshBackoffMs(state.refreshAttempts),
      );
      return;
    }
    await refreshAccount();
  }, [providers, refreshAccount, tearDown]);

  /* ---- a refused pull (pull.ts `onForbidden`, WP4 D37), settled by the account read ---- */
  const pullRefused = useCallback(
    async (householdId: string): Promise<void> => {
      if (!providers || tearingDown.current || settling.current) return;
      const cur = sessionRef.current;
      if (cur.status !== 'signed_in') return;
      const userId = cur.session.user.id;
      // a refusal about a household the app has already moved on from decides nothing
      if (mirrorOf(accountRef.current) !== householdId) return;
      if (!recheckDue(settledQuietly.current, householdId, Date.now())) {
        crumb('sync: the household’s pull was refused again — settled a moment ago, left alone');
        return;
      }
      settling.current = true;
      try {
        /*
          THE ACCOUNT FIRST, AND NOTHING DELETED BEFORE IT ANSWERS (`refusedPull.ts` holds the
          order; `mirror.ts` each decision). A refusal is what a removal looks like — and also what
          a grant a migration dropped, a server fault, or a token that lapsed while the phone was
          down looks like, so an account read that cannot see this person asks the session before
          anyone is signed out, and a session that cannot be reached decides nothing at all.
        */
        const outcome = await settleRefusedPull({
          userId,
          householdId,
          mirror: () => mirrorOf(accountRef.current),
          overtaken: () => {
            const now = sessionRef.current;
            return (
              tearingDown.current || now.status !== 'signed_in' || now.session.user.id !== userId
            );
          },
          read: () => providers.api.bootstrapState().catch(() => null),
          checkSession: async () => {
            // a refresh that throws rather than answering is no answer: nothing is decided on it
            const answer = await providers.auth
              .refreshSession()
              .catch(() => ({ kind: 'offline' as const }));
            const now = sessionRef.current;
            if (now.status !== 'signed_in') return 'schedule_retry';
            // read the way the refresh loop reads it, and a good answer written the way it writes
            // one: the refreshed session, online again
            const { state, effect } = reduceRefresh(now, answer);
            if (effect === 'none' && !tearingDown.current && state.status === 'signed_in')
              setSessionState(state);
            return effect;
          },
          adopt,
          endHousehold,
          signOut: async why => {
            if (tearingDown.current) return;
            /*
              THE SESSION ENDED ('session'), or a good session's account cannot see this person
              ('household'): the forced sign-out a refused pull always got, which keeps every
              unsynced entry (step 3), with the sentence for why. The household one remembers the
              household too: signing in again opens on Ended if that is where things stand, and on
              the household if it is not.
            */
            setForcedSignOut(why);
            await tearDown(
              'forced',
              providers,
              why === 'household' ? { keepPrefs: [LAST_HOUSEHOLD(userId)] } : {},
            );
          },
          log: crumb,
        });
        // settled with nothing deleted — the account still lists it, or nothing could be
        // confirmed: the same refusal inside `REFUSAL_RECHECK_MS` is not worth asking about again
        if (outcome === 'kept' || outcome === 'held')
          settledQuietly.current = { householdId, atMs: Date.now() };
      } catch (err) {
        // started, never awaited (`SyncProvider`): a failure here has nobody to reach but the log
        crumb(
          `sync: settling the refused pull failed — ${err instanceof Error ? err.message : ''}`,
        );
      } finally {
        settling.current = false;
      }
    },
    [providers, adopt, endHousehold, tearDown],
  );

  /* ---- an invite held for somebody who has not joined yet (`held-invite.ts`) ---- */
  const putInviteHold = useCallback(async (next: InviteHold | null) => {
    inviteHoldRef.current = next;
    setInviteHold(next);
    try {
      if (next === null) await clearInviteHold(prefsStore);
      else await saveInviteHold(prefsStore, next);
    } catch {
      // storage refused the write: this run still holds it in memory, which is all the app ever
      // did before the invite was written down, and the next change tries the write again
    }
  }, []);

  const holdInvite = useCallback(
    async (
      invite: HeldInvite,
      more: { origin?: InviteOrigin; preview?: InvitePreview | null } = {},
    ) => {
      const next = holdOf(invite, Date.now(), more);
      if (next === null) return;
      // a new invite is a new join to try, with nothing left over from the last one
      joinTried.current = null;
      joinProblemRef.current = null;
      setJoinProblem(null);
      await putInviteHold(next);
    },
    [putInviteHold],
  );

  const forgetInvite = useCallback(() => {
    joinProblemRef.current = null;
    setJoinProblem(null);
    return putInviteHold(null);
  }, [putInviteHold]);

  const inviteRefused = useCallback(async () => {
    const cur = inviteHoldRef.current;
    if (cur !== null) await putInviteHold(lapseOf(cur, 'refused', Date.now()));
  }, [putInviteHold]);

  const inviteStillLive = useCallback(async (): Promise<boolean> => {
    const cur = inviteHoldRef.current;
    const next = withLifetime(cur, Date.now());
    if (next !== cur) await putInviteHold(next);
    return next?.state === 'held';
  }, [putInviteHold]);

  /* ---- the join (`join.ts`): the join itself, and the note the joiner is owed ---- */
  const putJoinNote = useCallback(async (userId: string, note: JoinNote | null) => {
    joinNoteRef.current = note;
    setJoinNote(note);
    try {
      if (note === null) await clearJoinNote(prefsStore, userId);
      else await saveJoinNote(prefsStore, userId, note);
    } catch {
      // storage refused the write: this run still shows it, which is the part that matters
    }
  }, []);

  /** This account's own note, read at a launch or a sign-in: never another account's. */
  const readJoinNote = useCallback(async (userId: string) => {
    const note = await loadJoinNote(prefsStore, userId);
    joinNoteRef.current = note;
    setJoinNote(note);
  }, []);

  const setProblem = useCallback((p: JoinProblem | null) => {
    joinProblemRef.current = p;
    setJoinProblem(p);
  }, []);

  /**
   * WHAT A JOIN'S ANSWER CHANGES ON THE PHONE — the same for the held invite and for a code typed in
   * the sheet. Joined: the note first, then the household read, which is what turns the phase to
   * `ready` with the confirmation in front of Today. The held invite is let go by the `ready` effect
   * below and never before, so a read that does not land keeps the join page — never setup, whose
   * last button makes a second household.
   */
  const settleJoin = useCallback(
    async (
      userId: string,
      outcome: RedeemOutcome,
      from: { origin: InviteOrigin; preview: InvitePreview | null; hold: InviteHold | null },
    ): Promise<void> => {
      switch (outcome.kind) {
        case 'joined': {
          setProblem(null);
          const note: JoinNote = {
            kind: 'joined',
            household_id: outcome.household_id,
            household_name: outcome.household_name || (from.preview?.household_name ?? ''),
            role: outcome.role,
            seat_hours: seatHoursOf(from.preview?.seat_hours, outcome.seat_expires_at, Date.now()),
            at: Date.now(),
          };
          analytics.emit('invite_accepted', {
            role: outcome.role,
            channel: from.origin,
            attempts: 1,
          });
          /*
            A SECOND FAMILY (0153) COMES ON SCREEN FIRST, AND THEN SAYS "YOU JOINED" (the owner,
            2026-10-07: "it asks for my name, and it just brought me back to join a household").
            Written first, the note opened its page in the family being left, the switch then
            remounted everything under it — the name half typed — and a switch that waited on
            entries still sending left the page over the Join sheet. A first family keeps the old
            order: the note has to be there when the phase turns `ready`, so it opens on it.
          */
          const second = (rawAccountRef.current?.memberships.length ?? 0) > 0;
          if (!second) await putJoinNote(userId, note);
          const read = await refreshAccount().catch(() => null);
          // in, but the read did not land: the join page stays, and a reconnect reads again
          if (read === null || read.memberships.length === 0) setProblem('offline');
          // a SECOND family (0153): it comes on screen, once this one's entries are sent
          else if (
            read.memberships.length > 1 &&
            mirrorOf(accountRef.current) !== outcome.household_id
          ) {
            const leaving = accountRef.current?.memberships[0]?.household_name ?? '';
            const out = await switchRef
              .current(outcome.household_id)
              .catch((): SwitchOutcome => ({ kind: 'failed' }));
            /*
              THE NOTE ONLY ONCE THE SWITCH LANDED (the verification sweep of 2026-10-08). A switch
              that came back owed (entries still sending), on duty, or failed leaves the family
              being left on screen, and "You joined Lee's family" would open over it, its name box
              in the wrong family's tree. The join happened and stays: what kept the family off
              screen is said once instead (`joinedOffScreenOf`, a toast), and the note is held
              until a switch brings that family on screen (`switchHousehold` writes it then). The
              cheapest honest choice: no new page, and the switcher's own words for why.
            */
            const off = second ? joinedOffScreenOf(note.household_name, leaving, out) : null;
            if (off !== null) {
              owedJoinNoteRef.current = note;
              setJoinedOffScreen(off);
              return;
            }
          }
          if (second) await putJoinNote(userId, note);
          return;
        }
        case 'refused':
          setProblem(null);
          if (from.hold !== null)
            await putInviteHold(lapseOf(from.hold, outcome.reason, Date.now()));
          return;
        case 'in_household':
          // one household per account (0139): said on the first page in it, never dropped
          setProblem(null);
          await putJoinNote(userId, {
            kind: 'not_used',
            current: outcome.current,
            invited: from.preview?.household_name ?? '',
            why: notUsedWhyOf(outcome, canJoinAnother(accountRef.current)),
            at: Date.now(),
          });
          await refreshAccount().catch(() => null);
          return;
        case 'kept':
          setProblem(outcome.problem);
          return;
      }
    },
    [analytics, putJoinNote, putInviteHold, refreshAccount, setProblem],
  );

  /**
   * ONE JOIN OF THE HELD INVITE: the auto-join the moment an account with no household exists, a
   * reconnect after "No connection", and the join page's Try again. The name sent is the one the
   * account has, if any; a new account has none, and is named from its address until the
   * confirmation page asks (0124; `JoinedScreen`).
   */
  const redeemHeld = useCallback(async (): Promise<void> => {
    const p = providers;
    const cur = sessionRef.current;
    if (!p || cur.status !== 'signed_in' || tearingDown.current || joiningRef.current) return;
    const hold = inviteHoldRef.current;
    if (hold?.state !== 'held') return;
    const userId = cur.session.user.id;
    joiningRef.current = true;
    setJoining(true);
    try {
      // a code past its lifetime is certainly dead, and a try would spend one of five
      if (!(await inviteStillLive())) return;
      const name = accountRef.current?.profile?.display_name?.trim() ?? '';
      const outcome = await redeemInvite(
        {
          accept: input => p.api.acceptInvite(input),
          read: () => p.api.bootstrapState().catch(() => null),
        },
        hold.invite,
        name === '' ? null : name,
      );
      // a sign-out or another account meanwhile: this answer is about a session that is gone
      const now = sessionRef.current;
      if (tearingDown.current || now.status !== 'signed_in' || now.session.user.id !== userId)
        return;
      await settleJoin(userId, outcome, { origin: hold.origin, preview: hold.preview, hold });
    } finally {
      joiningRef.current = false;
      setJoining(false);
    }
  }, [providers, inviteStillLive, settleJoin]);

  const joinWithInvite = useCallback(
    async (invite: HeldInvite, origin: InviteOrigin): Promise<RedeemOutcome | null> => {
      const p = providers;
      const cur = sessionRef.current;
      if (!p || cur.status !== 'signed_in' || tearingDown.current || joiningRef.current)
        return null;
      const userId = cur.session.user.id;
      joiningRef.current = true;
      setJoining(true);
      try {
        /*
          THE ACCOUNT IS READ FIRST WHEN THIS RUN HAS NOT READ IT: the sheet can be open a moment
          after a sign-in, before the first read, and an account that already has a household must
          hear so rather than be sent anywhere (one household per account, 0139).
        */
        if (accountReadForRef.current !== userId) {
          const read = await refreshAccount().catch(() => null);
          if (read === null) return { kind: 'kept', problem: 'offline' };
          const here = read.memberships[0];
          // several families since 0153: only an account at the limit has nothing to type
          if (here !== undefined && !canJoinAnother(read)) {
            const outcome: RedeemOutcome = { kind: 'in_household', current: here.household_name };
            await settleJoin(userId, outcome, { origin, preview: null, hold: null });
            return outcome;
          }
        }
        const name = accountRef.current?.profile?.display_name?.trim() ?? '';
        const outcome = await redeemInvite(
          {
            accept: input => p.api.acceptInvite(input),
            read: () => p.api.bootstrapState().catch(() => null),
          },
          invite,
          name === '' ? null : name,
        );
        const now = sessionRef.current;
        if (tearingDown.current || now.status !== 'signed_in' || now.session.user.id !== userId)
          return null;
        // a refusal is said in the sheet, where the code was typed; the rest moves the account on
        if (outcome.kind === 'joined' || outcome.kind === 'in_household')
          await settleJoin(userId, outcome, { origin, preview: null, hold: null });
        return outcome;
      } finally {
        joiningRef.current = false;
        setJoining(false);
      }
    },
    [providers, settleJoin, refreshAccount],
  );
  const joinWithCode = useCallback(
    (code: string) => joinWithInvite({ code }, 'code'),
    [joinWithInvite],
  );
  const joinWithLink = useCallback(
    (token: string) => joinWithInvite({ token }, 'link'),
    [joinWithInvite],
  );

  const retryJoin = useCallback(async (): Promise<void> => {
    joinTried.current = null;
    setProblem(null);
    // already in and only the read missing: read again before anything is sent twice
    if (joinNoteRef.current?.kind === 'joined') {
      const read = await refreshAccount().catch(() => null);
      if (read !== null && read.memberships.length > 0) return;
    }
    await redeemHeld();
  }, [redeemHeld, refreshAccount, setProblem]);
  const retryJoinRef = useRef(retryJoin);
  retryJoinRef.current = retryJoin;

  const joinNoteSeen = useCallback(async (): Promise<void> => {
    const cur = sessionRef.current;
    joinNoteRef.current = null;
    setJoinNote(null);
    if (cur.status === 'signed_in')
      await clearJoinNote(prefsStore, cur.session.user.id).catch(() => undefined);
  }, []);

  /* ---- the last person in a household leaves it, and may bring it back (`leave.ts`, 0143) ---- */

  /**
   * FAMILY'S "LEAVE HOUSEHOLD". Nothing here decides who is left: the server counts again, under a
   * lock (`not_alone`). What the phone owes the household goes first, within the teardown's own
   * budget, and a leave with entries still on their way is not sent, so an entry never stays
   * behind on a phone whose household is leaving it (CLAUDE.md rule 7).
   *
   * THEN THE HOUSEHOLD LEAVES THE PHONE BY THE ONE ROAD A HOUSEHOLD EVER TAKES: the account read no
   * longer lists it (`mirror.ts` `end_household`), `endHousehold` runs the household teardown —
   * the database, sync, reminders, widgets and its preferences go, the session stays — and the
   * fresh read makes the phase `ended`, where a signed-in person with no household lands. The
   * record of the close is written BEFORE that read, as an account-level key the teardown keeps
   * (`prefs/index.ts`), so Ended can offer it back. A read that does not land leaves the household
   * showing on a server that has closed it; the next pull is refused, and the refused pull's own
   * settling takes it off the phone the same way.
   */
  const leaveHousehold = useCallback(async (): Promise<LeaveOutcome> => {
    const p = providers;
    const cur = sessionRef.current;
    const here = accountRef.current?.memberships[0];
    if (!p || cur.status !== 'signed_in' || tearingDown.current || here === undefined)
      return { kind: 'failed' };
    const userId = cur.session.user.id;
    const outcome = await leaveAlone({
      flush: async () => {
        const r = syncRuntime();
        if (r !== null)
          await Promise.race([
            r.flush('manual').then(
              () => undefined,
              () => undefined,
            ),
            waitFor(LEAVE_FLUSH_MS),
          ]);
      },
      owed: async () => {
        const r = syncRuntime();
        return r === null ? 0 : (await r.pending()).filter(row => row.state !== 'FAILED').length;
      },
      leave: () => p.api.leaveHousehold(here.household_id),
      now: () => Date.now(),
    });
    if (outcome.kind !== 'left') return outcome;
    const now = sessionRef.current;
    if (now.status !== 'signed_in' || now.session.user.id !== userId) return outcome;
    crumb('auth: left the household as its last member; it is closed and leaves this phone');
    await saveLeftHousehold(prefsStore, userId, outcome.left).catch(() => undefined);
    leftRef.current = outcome.left;
    setLeftHousehold(outcome.left);
    await refreshAccount().catch(() => null);
    return outcome;
  }, [providers, refreshAccount]);

  /**
   * FAMILY'S "LEAVE <FAMILY>", FOR A CAREGIVER OR A VIEWER (2026-10-08; `leave.ts` `leaveSeat`).
   * The family stays as it is for everybody else; only this person's seat ends.
   *
   *   1. WHAT THE PHONE OWES THE FAMILY GOES FIRST, within the leave's own budget, exactly as
   *      `leaveHousehold` sends it: a leave with entries still on their way is not sent, so an entry
   *      never stays behind on a phone whose family is leaving it (CLAUDE.md rule 7).
   *   2. THE SEAT ENDS: `removeMember(family, self)`, the write the server has always allowed a
   *      member to make of their own row (`members_leave`, 0008; the last-owner guard stops an owner).
   *   3. THE FAMILY LEAVES THE PHONE BY THE ROAD A REMOVAL TAKES: the account read no longer lists it
   *      (`mirror.ts` `end_household`), `endHousehold` tears down that family alone (its file, sync,
   *      reminders, widgets, its preferences; the session and the other families stay), and the
   *      read is adopted, which puts the next family on screen (core `focusAccount`), or Ended when
   *      there is none. A read that does not land leaves the family showing on a server that has
   *      ended the seat; the next pull is refused, and the refused pull's own settling does the same.
   *
   * ON FOR THE FAMILY (2026-10-08): asked first, exactly as a switch asks (`switchDuty.ts`, the
   * same `dutyStep`). A person no longer in the family is no longer someone who can be on, so every
   * other phone stops counting their shift once it has the change; but until it does, the list says
   * this phone has the night, and this phone stops ringing for the family the moment it leaves.
   * So the leave stops (`on_duty`), the page asks, and a yes writes the list without their shifts
   * for step 1's flush to send.
   *
   * 4. LEAVING THE ONLY FAMILY: the device marks its memory of the family as left
   *    (`rememberLeaving`), before the read, so Ended says "You left Lee's family" rather than
   *    that their time ran out. With another family left, the read puts it on screen and its own
   *    memory replaces the mark.
   */
  const dutyStepRef = useRef<((userId: string, handBack: boolean) => Promise<DutyStep>) | null>(
    null,
  );
  const leaveSeat = useCallback(
    async (opts: { handBackDuty?: boolean } = {}): Promise<SeatLeaveOutcome> => {
      const p = providers;
      const cur = sessionRef.current;
      const here = accountRef.current?.memberships[0];
      if (!p || cur.status !== 'signed_in' || tearingDown.current || here === undefined)
        return { kind: 'failed' };
      const userId = cur.session.user.id;
      const outcome = await leaveSeatOf({
        role: here.role,
        online: async () => {
          const s = await NetInfo.fetch().catch(() => null);
          return s === null || (s.isConnected !== false && s.isInternetReachable !== false);
        },
        // `dutyStep` is declared with the switch, further down: reached through its ref
        duty: async handBack => {
          const step = dutyStepRef.current;
          return step === null ? { kind: 'failed' } : step(userId, handBack);
        },
        ...(opts.handBackDuty === true ? { handBackDuty: true } : {}),
        flush: async () => {
          const r = syncRuntime();
          if (r !== null)
            await Promise.race([
              r.flush('manual').then(
                () => undefined,
                () => undefined,
              ),
              waitFor(LEAVE_FLUSH_MS),
            ]);
        },
        owed: async () => {
          const r = syncRuntime();
          return r === null ? 0 : (await r.pending()).filter(row => row.state !== 'FAILED').length;
        },
        leave: () => p.api.removeMember(here.household_id, userId),
      });
      if (outcome.kind !== 'left') return outcome;
      const now = sessionRef.current;
      if (now.status !== 'signed_in' || now.session.user.id !== userId) return outcome;
      crumb('auth: left a family others are in; it leaves this phone');
      const marked = await rememberLeaving(prefsStore, LAST_HOUSEHOLD(userId), {
        id: here.household_id,
        name: here.household_name,
      }).catch(() => null);
      if (marked !== null) setLastHousehold(marked);
      await refreshAccount().catch(() => null);
      return outcome;
    },
    [providers, refreshAccount],
  );

  /**
   * ENDED'S "BRING BACK <NAME>": the household this account closed, before its purge date. Brought
   * back, the account read lists it again and the phase is `ready`, with a fresh database the sync
   * engine fills from the server. A household that can no longer come back is let go, record,
   * button and — when it is the household this phone last showed — the memory of it, so the phase
   * turns to setup rather than Ended saying something untrue about it (`forgetLeftHousehold`). One
   * blocked by another household keeps its record, for the day that one is left.
   */
  const restoreHousehold = useCallback(async (): Promise<RestoreOutcome> => {
    const p = providers;
    const cur = sessionRef.current;
    const left = leftRef.current;
    if (!p || cur.status !== 'signed_in' || tearingDown.current || left === null)
      return { kind: 'failed' };
    const userId = cur.session.user.id;
    const outcome = await restoreLeft(() => p.api.restoreHousehold(left.id));
    const now = sessionRef.current;
    if (now.status !== 'signed_in' || now.session.user.id !== userId) return outcome;
    if (outcome.kind === 'restored') {
      await clearLeftHousehold(prefsStore, userId).catch(() => undefined);
      leftRef.current = null;
      setLeftHousehold(null);
    }
    if (outcome.kind === 'gone') {
      if (await forgetLeftHousehold(prefsStore, userId, left.id, LAST_HOUSEHOLD(userId)))
        setLastHousehold(null);
      leftRef.current = null;
      setLeftHousehold(null);
    }
    if (outcome.kind === 'restored') crumb('auth: brought the closed household back');
    if (outcome.kind === 'restored' || outcome.kind === 'in_household')
      await refreshAccount().catch(() => null);
    return outcome;
  }, [providers, refreshAccount]);

  /**
   * A LINK OPENED WHILE SIGNED OUT IS CHECKED TOO (0139): a token's check costs nothing, and it is
   * what lets AUTH name the household — or say, before an account is made for it, that the link no
   * longer works or needs the household's Plus. No answer keeps the link held as it is.
   */
  const checkHeldLink = useCallback(
    async (token: string): Promise<void> => {
      if (!providers) return;
      const r = await providers.api.checkInvite({ token }).catch(() => null);
      const cur = inviteHoldRef.current;
      // replaced or let go meanwhile: this answer is about an invite the phone no longer holds
      if (r === null || cur?.state !== 'held' || cur.invite.token !== token) return;
      if (r.ok) {
        await putInviteHold(withPreview(cur, r.preview));
      } else if (r.error === 'invalid_invite') {
        await putInviteHold(lapseOf(cur, 'refused', Date.now()));
      } else if (r.error === 'needs_plus' && 'preview' in r) {
        const named = withPreview(cur, r.preview);
        if (named !== null) await putInviteHold(lapseOf(named, 'needs_plus', Date.now()));
      }
    },
    [providers, putInviteHold],
  );

  /* ---- boot ---- */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const p = await createProviders(env, { sessionStore: mockSessionStore, mockStateStore });
      if (cancelled) return;
      setProviders(p);
      // an interrupted teardown finishes before anything is read — with the gated emitter, shut
      // while booting: where the sign-out it finishes began is not known, so it is not measured
      await resumeInterruptedTeardown(
        teardownDeps({
          auth: p.auth,
          analytics,
          currentUser: () => null,
          // The second call site. An interrupted teardown finishing at launch still owes the
          // server whatever the last run did not send; no engine exists yet, so the file answers.
          outbox: outboxTeardown(queueOnDisk),
          widgets: widgetsTeardown(),
          push: noPushTeardown(),
          freezeUi: () => undefined,
          closeSheets: () => undefined,
          resetToAuth: () => undefined,
          clearMemory: async () => undefined,
        }),
      );
      const cached = await p.auth.restoreSession();
      const state = stateAtLaunch(cached);
      /*
        THE DATABASE OPENS NOW, BEHIND THE READS BELOW (2026-09-28). Today's first reads, the sync
        engine and the reminder planner all wait on `openLocalDb` — the file, WAL, the schema check
        and the read indexes — and nothing asked for it until the session had been read, the
        account with it, and the whole app mounted under them. A session on the phone is the moment
        it is known the database will be wanted, so it starts opening here, in parallel with the
        rest of the launch, and the first reader finds it open or on its way (`openLocalDb` shares
        one handle). Started, never awaited; a latch a teardown closed above still refuses it, and a
        failure here is the failure the first reader would have met, met again by it.
      */
      // the family on screen's file first, when this account has chosen one (0153); never awaited
      if (cached) void openFamilyDb(cached.user.id).catch(() => undefined);
      /*
        AND WHAT THE FIRST PHASE IS DECIDED FROM IS ASKED FOR AT ONCE, not one read after another
        (2026-09-28): small reads off the phone, none of which needs another's answer, each of which
        used to wait for the one before it — and a launch waits for the last of them before it
        leaves the boot wait. The account's cache, a ticked box and the quarantine are started here
        and taken where they were always taken, so everything is still set before the first phase
        is (`setSessionState` below), in the order the phase reads it.
      */
      const email = cached?.user.email ?? null;
      const accountRead = cached ? prefsStore.get(ACCOUNT_CACHE) : null;
      const tickedRead =
        cached && email !== null
          ? loadPendingTermsAcceptance(prefsStore, email).catch(() => null)
          : null;
      const parkedRead = quarantine.pending();
      // a rejection is still the launch's to handle, where it is awaited: never unhandled meanwhile
      accountRead?.catch(() => undefined);
      parkedRead.catch(() => undefined);
      if (cached) {
        // a household it closed, for Ended's "Bring back" (`leave.ts`): first, since one whose time
        // is up takes this phone's memory of it along (`rememberedLeft`)
        setLeftHousehold(await rememberedLeft(cached.user.id));
        // the household this device last showed, read BEFORE the account so the phase has it
        // the first time it resolves (`standing.ts`)
        const remembered = await prefsStore.get(LAST_HOUSEHOLD(cached.user.id));
        setLastHousehold(parseLastHousehold(remembered));
        // a confirmation the joiner has not read yet: a killed app shows it again (`join.ts`)
        const note = await loadJoinNote(prefsStore, cached.user.id);
        joinNoteRef.current = note;
        setJoinNote(note);
        const raw = await accountRead;
        if (raw) {
          try {
            const { state: cachedAccount, readAt } = JSON.parse(raw) as {
              state: AccountState;
              readAt: number;
            };
            // the family on screen, as `adopt` focuses every read (0153)
            const wanted = await prefsStore.get(ACTIVE_HOUSEHOLD(cached.user.id)).catch(() => null);
            const focused = focusAccount(cachedAccount, wanted);
            rawAccountRef.current = cachedAccount;
            activeRef.current = mirrorOf(focused);
            await selectLocalDbHousehold(mirrorOf(focused));
            setAccount(focused);
            setAccountReadAt(readAt);
          } catch {
            // an unreadable cache is the same as none: the refresh below repopulates it
          }
        }
        // a box ticked on this phone and still on its way to the server, read before the first
        // phase so the terms step never asks again for it (`terms-step.ts`)
        const ticked = await tickedRead;
        if (email !== null && ticked !== null) setTermsTickedHere(pendingTermsKey(email));
      }
      setQuarantined(await parkedRead);
      /*
        THE INVITE A PARTNER TYPED BEFORE THIS LAUNCH, read before the first phase does, so a cold
        start from the confirmation email opens on the join page and not on setup — and minded
        against its clock on the way in (`withLifetime`): a code typed twenty minutes ago is dead,
        and the join page says so rather than spending a try on it.
      */
      const stored = await loadInviteHold(prefsStore).catch(() => null);
      const minded = withLifetime(stored, Date.now());
      if (minded !== stored && minded !== null)
        await saveInviteHold(prefsStore, minded).catch(() => undefined);
      inviteHoldRef.current = minded;
      setInviteHold(minded);
      // the first phase; `app_open` waits for the launch to land past the sign-in screens (below)
      setSessionState(state);
    })().catch(() => {
      if (!cancelled) setSessionState({ status: 'signed_out' });
    });
    return () => {
      cancelled = true;
    };
  }, [env, analytics]);

  /**
   * ONE REFRESH PER SIGN-IN, and the trigger is the signed-in user's id rather than the session
   * object: the object is replaced on every token rotation, and a refresh per rotation is a loop.
   *
   * The `!account` check that used to be here decided nothing — both branches called `refresh()`,
   * so `if (A && !account) r(); else if (A) r();` was `if (A) r();` written twice. It is written
   * once now, which is also why `account` is no longer among the names the rule asks for.
   *
   * `refresh` itself stays out on purpose: it is rebuilt every render, and listing it would run
   * this on each one. `sessionState.status` and `.refreshAttempts` stay out for the same reason
   * the id is in — they move with every rotation, and this is about arriving, not about staying.
   */
  const signedInUserId = sessionState.status === 'signed_in' ? sessionState.session.user.id : null;
  useEffect(() => {
    if (!providers || sessionState.status !== 'signed_in') return;
    if (sessionState.refreshAttempts === 0) void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [providers, signedInUserId]);

  /* ---- retry sooner when the network comes back or the app returns to the foreground ---- */
  useEffect(() => {
    const kick = () => {
      const cur = sessionRef.current;
      if (cur.status === 'signed_in' && !cur.online) void refresh();
    };
    const netSub = NetInfo.addEventListener(s => {
      // the mock's server is unreachable exactly when the phone has no connection
      if (providers?.mock) providers.mock.online = s.isConnected !== false;
      if (s.isConnected) kick();
    });
    const appSub = AppState.addEventListener('change', s => {
      if (s === 'active') kick();
    });
    return () => {
      netSub();
      appSub.remove();
      if (retryTimer.current) clearTimeout(retryTimer.current);
    };
  }, [refresh, providers]);

  /**
   * THE ACCOUNT, READ AGAIN WHEN THE APP COMES BACK AFTER A WHILE (`accountReads.ts`;
   * AUTH_AND_TRIAL.md §4: "on foreground after >5 minutes"). The household's plan is in it, so
   * without this a phone that stayed in memory never heard of the other parent's purchase, nor of
   * the preview ending, until it was killed. A phone with no connection is `kick`'s, above.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s !== 'active') return;
      const cur = sessionRef.current;
      if (
        foregroundReadDue({
          signedIn: cur.status === 'signed_in',
          online: cur.status === 'signed_in' && cur.online,
          lastReadAt: lastReadAt.current,
          now: Date.now(),
        })
      )
        void refreshAccount().catch(() => null);
    });
    return () => sub.remove();
  }, [refreshAccount]);

  /**
   * THE HELD INVITE'S CLOCK, checked each time the app comes back to the foreground: the partner
   * who left to read their email, or to ask for a new code, comes back to a page that already
   * knows whether the code in hand can still work. The launch reads it at boot.
   */
  useEffect(() => {
    const sub = AppState.addEventListener('change', s => {
      if (s === 'active') void inviteStillLive();
    });
    return () => sub.remove();
  }, [inviteStillLive]);

  /**
   * THE AUTH CLIENT SIGNING ITSELF OUT (`session.ts` `effectOfClientSignOut`; the first-day trace,
   * 2026-09-25). supabase-js drops a session whose refresh the server refused — revoked, or a
   * refresh token replayed outside its 10 s window after the app was killed mid-refresh — and says
   * so with SIGNED_OUT and nothing else. Nothing listened, so the app went on showing Today over a
   * session that no longer existed while every sync failed.
   *
   * It is the forced sign-out `refresh` already has for the same fact, run the way every forced
   * sign-out runs (`tearDown('forced')`): the teardown starts while the session
   * is still the app's, so `tearDown` reads this person as the user, and step 3 quarantines every
   * op not yet synced under their id before step 8 deletes the database (CLAUDE.md rule 7). The
   * session state is NOT set to `signed_out` first — that would unmount the sync engine the
   * quarantine reads the queue through — and nothing here deletes anything the teardown would not.
   *
   * NOT AWAITED, AND NOT DEFERRED. supabase-js calls this while it still holds its auth lock, and
   * step 7 of the teardown needs that lock, so an awaited teardown would wait on itself. Started
   * right here, `tearDown` reads the session before anything can re-render.
   *
   * EXCEPT DURING A HOUSEHOLD TEARDOWN, which takes no step 7 and so never says SIGNED_OUT itself:
   * one that arrives then is the session ending under it, and `endHousehold` answers it the moment
   * the household is off the phone (a teardown under way cannot start another).
   */
  useEffect(() => {
    if (!providers) return;
    return providers.auth.onAuthStateChange(event => {
      const effect = effectOfClientSignOut(event, {
        status: sessionRef.current.status,
        tearingDown: tearingDown.current,
      });
      if (effect === 'forced_sign_out') {
        setForcedSignOut('session');
        void tearDown('forced', providers);
        return;
      }
      if (event === 'SIGNED_OUT' && keepsSession.current) signedOutMeanwhile.current = true;
    });
  }, [providers, tearDown]);

  /**
   * A BOX CHECKED ON THE SIGN-UP PAGE, RECORDED THE MOMENT A SESSION EXISTS FOR IT (the owner,
   * 2026-09-22: the acceptance screen should not be "an individual page" the ordinary sign-up
   * meets). `AuthScreen` writes the pending record when the checkbox is checked and the account
   * is created; there is no session yet for an email sign-up (verification can happen after the
   * app is killed), so the record waits on the address rather than a user id. Both places a
   * session for that address can appear — the emailed link, and any direct sign-in — drain it
   * here, AWAITED before the session is published, so the very first `bootstrapState` read
   * this session causes already shows the acceptance, and the terms step (`terms-step.ts`) never
   * asks a parent who already answered it.
   *
   * TRUE WHEN A TICKED BOX WAS WAITING ON THIS PHONE for this address — landed now or not — which
   * the caller keeps as `termsTickedHere`: a drain that failed offline must not turn into the
   * terms step asking the same parent again.
   */
  const drainPendingTerms = useCallback(
    async (s: Session): Promise<boolean> => {
      if (!providers || s.user.email === null) return false;
      const email = s.user.email;
      const pending = await loadPendingTermsAcceptance(prefsStore, email).catch(() => null);
      if (pending === null) return false;
      try {
        const r = await providers.api.acceptTerms(pending.version);
        if (r.ok) await clearPendingTermsAcceptance(prefsStore, email);
        // a failure leaves the record where it is, and the effect below picks it up again on the
        // next launch or the next reconnect — there is no screen behind this any more, so a
        // checked box the server never heard about has to keep trying rather than wait to be asked
      } catch {
        // offline, most likely — same as a server failure: the record stays for next time
      }
      return true;
    },
    [providers],
  );

  /**
   * AND AGAIN ON EVERY LAUNCH AND EVERY RECONNECT. Deleting the acceptance screen (2026-09-22)
   * took away the place a failed drain used to be caught, so the drain has to keep trying
   * instead of waiting to be asked: a parent who signed up on a plane would otherwise have
   * checked a box the server never heard about. It is one preference read for everybody else —
   * `loadPendingTermsAcceptance` returns null the moment the record has landed and been cleared.
   */
  useEffect(() => {
    if (!providers || !online || session === null) return;
    void drainPendingTerms(session);
  }, [providers, online, session, drainPendingTerms]);

  /**
   * THE BOX, TICKED ON THE TERMS STEP (`terms-step.ts`), recorded the way the sign-up side records
   * its own: the pending record for the address, which takes the step away at once, then the
   * drain into `accept_terms` and a fresh read. Offline, the record waits on the phone and the
   * drain above sends it on the next launch or reconnect — the parent is never held on AUTH for
   * want of signal, and the version they ticked is the one that reaches the server.
   */
  const agreeToTerms = useCallback(async (): Promise<void> => {
    const cur = sessionRef.current;
    if (!providers || cur.status !== 'signed_in') return;
    const s = cur.session;
    const email = s.user.email;
    if (email === null) {
      // no address to keep the tick under on this phone: straight to the server, and the step
      // stays until it lands (the screen says why when it does not)
      const r = await providers.api.acceptTerms(LEGAL_VERSION);
      if (!r.ok) throw new AuthFailure('unknown', r.error);
      await refreshAccount();
      return;
    }
    await savePendingTermsAcceptance(prefsStore, email, LEGAL_VERSION);
    setTermsTickedHere(pendingTermsKey(email));
    void (async () => {
      await drainPendingTerms(s);
      await refreshAccount();
    })().catch(() => undefined);
  }, [providers, drainPendingTerms, refreshAccount]);

  /**
   * SIGNING IN AGAIN KEEPS THE ACCOUNT (`keep-account.ts`; Privacy §7, Terms §12). Asked after every
   * sign-in and whenever an account read still shows a deletion pending; a call that does not land
   * is asked again on a backoff timer while the person stays signed in, and on every launch and
   * reconnect, which read the account. The server decides what an ask may undo (0131) — only a
   * deletion requested before this session began — so asking is never the wrong thing to do.
   * "Kept" is said once (`accountKept`), and the account is read again so it shows.
   */
  const keepAccountRef = useRef<(userId: string) => Promise<void>>(async () => undefined);
  const keepAccount = useCallback(
    (userId: string): Promise<void> => {
      if (!providers || tearingDown.current) return Promise.resolve();
      const gen = keepGen.current;
      const asking = keepAsking.current;
      if (asking !== null && asking.gen === gen) return asking.run;
      const run = (async () => {
        const outcome = await askToKeepAccount(providers.api);
        const now = sessionRef.current;
        // a sign-in or a sign-out meanwhile: this answer is about a session that is gone
        if (gen !== keepGen.current || now.status !== 'signed_in' || now.session.user.id !== userId)
          return;
        if (keepTimer.current) clearTimeout(keepTimer.current);
        keepTimer.current = null;
        if (outcome === 'retry') {
          crumb('auth: the deletion undo did not reach the server — asking again');
          keepTimer.current = setTimeout(
            () => void keepAccountRef.current(userId),
            refreshBackoffMs(keepAttempts.current),
          );
          keepAttempts.current += 1;
          return;
        }
        keepAttempts.current = 0;
        // answered: an account read showing this same deletion again starts no new ask
        const pending = accountRef.current?.deletionPending ?? null;
        keepAnswered.current = pending === null ? null : keepAnswerKey(userId, pending.purge_at);
        if (outcome === 'kept') {
          crumb('auth: signing in again canceled the pending deletion');
          setAccountKept(true);
          void refreshAccount().catch(() => undefined);
        }
      })().finally(() => {
        if (keepAsking.current?.gen === gen) keepAsking.current = null;
      });
      keepAsking.current = { gen, run };
      return run;
    },
    [providers, refreshAccount],
  );
  keepAccountRef.current = keepAccount;

  /**
   * AND WHILE AN ACCOUNT READ STILL SHOWS ONE PENDING: the launch after a kill, a reconnect, a
   * refresh — each reads the account, and a deletion still on the server is asked about again,
   * once per pending deletion per sign-in unless the ask did not land.
   */
  useEffect(() => {
    if (!providers || session === null || account === null) return;
    if (!keepAskDue(session.user.id, account.deletionPending, keepAnswered.current)) return;
    void keepAccount(session.user.id);
  }, [providers, session, account, keepAccount]);

  /* ---- links: verification, magic, recovery, invite ---- */
  const openLink = useCallback(
    async (url: string) => {
      if (!providers) return;
      // ONE OPEN AT A TIME FOR THE SAME URL (the owner, 2026-10-02): cold start fires
      // getInitialURL and the Linking url event for the same tap; the first exchange signs in, the
      // second hits "already used" and used to paint Verify with expired while they were already in.
      if (openingLink.current === url) return;
      openingLink.current = url;
      try {
        /*
          AN INVITE LINK, in any of the three forms it can arrive in (`inviteLink.ts`): held, and —
          signed out — checked, so AUTH can name the household before an account is made for it.
          Signed in, what happens next is the phase's: the auto-join for an account with no
          household, and the "not used" note for one that has a household (the effects below).
        */
        const token = inviteTokenOf(url, {
          scheme: BRAND.urlScheme,
          host: BRAND.universalLinkHost,
        });
        if (token !== null) {
          await holdInvite({ token }, { origin: 'link' });
          if (sessionRef.current.status !== 'signed_in') void checkHeldLink(token);
          return;
        }
        const result = await providers.auth.handleAuthLink(url);
        if (result.kind === 'ignored') return;
        if (result.kind === 'link_error') {
          /*
            AN EMAILED LINK THAT DID NOT WORK is said on AUTH and on Verify (`linkError.ts`), with
            what to do next. It used to be dropped here, and the app opened and did nothing. Someone
            already signed in to a confirmed account has nothing to act on — they are in — so the
            sentence is kept for the screens that are signed out or still waiting on the email.
          */
          const cur = sessionRef.current;
          if (cur.status !== 'signed_in' || !cur.session.user.emailVerified)
            setLinkProblem(result.problem);
          return;
        }
        setPendingEmail(null);
        setLinkProblem(null);
        setForcedSignOut(null);
        if (result.kind === 'recovery') setRecovery(true);
        // the household this account last showed on this phone, before its first read decides the
        // phase — as `signedIn` reads it, for the same reason
        setLeftHousehold(await rememberedLeft(result.session.user.id));
        setLastHousehold(await rememberedHousehold(result.session.user.id));
        await readJoinNote(result.session.user.id);
        const ticked = await drainPendingTerms(result.session);
        setTermsTickedHere(tickedKey(ticked, result.session));
        // write the ref before the next openLink can race on "already used"
        sessionRef.current = {
          status: 'signed_in',
          session: result.session,
          online: true,
          refreshAttempts: 0,
        };
        setSessionState(sessionRef.current);
        // an emailed link is a sign-in too — the confirmation, and the reset link a parent who
        // forgot their password comes back through: it keeps a pending deletion (`keep-account.ts`)
        forgetKeepAsk();
        void keepAccount(result.session.user.id);
      } finally {
        if (openingLink.current === url) openingLink.current = null;
      }
    },
    [
      providers,
      drainPendingTerms,
      holdInvite,
      checkHeldLink,
      readJoinNote,
      forgetKeepAsk,
      keepAccount,
    ],
  );

  useEffect(() => {
    if (!providers) return;
    let cancelled = false;
    void Linking.getInitialURL().then(u => {
      if (u && !cancelled) void openLink(u);
    });
    const sub = Linking.addEventListener('url', e => void openLink(e.url));
    return () => {
      cancelled = true;
      sub.remove();
    };
  }, [providers, openLink]);

  /* ---- actions ---- */
  const signedIn = useCallback(
    async (s: Session) => {
      setForcedSignOut(null);
      setLinkProblem(null);
      /*
        THIS ACCOUNT'S OWN MEMORY OF ITS HOUSEHOLD, read before its first account read decides the
        phase. Only a cold launch read it before, so a sign-in never had it: the forced sign-out a
        refused pull falls back to keeps it (`mirror.ts`) so that signing in again opens on Ended
        rather than asking for a baby's date of birth — and whatever a previous account in this
        run left in memory is replaced, never inherited (`resetToAuth` clears it too).
      */
      setLeftHousehold(await rememberedLeft(s.user.id));
      setLastHousehold(await rememberedHousehold(s.user.id));
      await readJoinNote(s.user.id);
      const ticked = await drainPendingTerms(s);
      setTermsTickedHere(tickedKey(ticked, s));
      setSessionState({ status: 'signed_in', session: s, online: true, refreshAttempts: 0 });
      // every sign-in asks the server to keep a pending deletion — the password, Google, a
      // sign-up that came back with a session (`keep-account.ts`); started, never awaited
      forgetKeepAsk();
      void keepAccount(s.user.id);
      // A quarantine written for this user comes back TO THE QUEUE; anyone else's is deleted
      // unread (docs/ACCOUNTS.md §6.3). WP2 discarded `takeFor`'s result, which made the
      // quarantine a file nobody read — a slower way of losing a log. The ops are re-inserted
      // with their original `client_op_id`, so an op that did reach the server before the
      // sign-out comes back as a duplicate rather than as a second row (WP4 D32, R-2).
      const ops = await quarantine.takeFor(s.user.id);
      if (ops.length > 0) {
        try {
          // the teardown latch is lifted first: the fresh file has to be creatable again, and
          // `openLocalDb` migrates it before the first insert
          allowReopen();
          await replayQuarantined(await openLocalDb(), ops);
        } catch {
          // A database that will not open is not a reason to refuse a sign-in. The ops are gone
          // either way at this point (the file was already deleted), and the bounded outcome
          // ACCOUNTS §6.3 describes is exactly this one.
        }
      } else {
        allowReopen();
      }
      setQuarantined(null);
    },
    [drainPendingTerms, forgetKeepAsk, keepAccount, readJoinNote],
  );

  /**
   * A SIGN-OUT THE PERSON ASKED FOR, resolved only once they are signed out (`exits.ts`). A teardown
   * already under way used to swallow it: harmless when that teardown was a sign-out, and a
   * sign-out that never happened when it was a household leaving the phone — the sheet said
   * "Signed out" over the Ended screen, still signed in. Now a sign-out under way is waited for,
   * and a household leaving is owed the sign-out, which runs the moment it ends (`endHousehold`).
   */
  const signOut = useCallback(
    async (scope: SignOutScope) => {
      if (!providers) return;
      await signOutWhenFree(scope, exitDeps(providers));
    },
    [providers, exitDeps],
  );

  const phase: Phase = useMemo(() => {
    if (sessionState.status === 'booting' || !providers) return 'booting';
    if (sessionState.status === 'signed_out') return 'signed_out';
    if (!sessionState.session.user.emailVerified) return 'unverified';
    /**
     * NO TERMS PHASE. It was one, for a day (the owner, 2026-09-21: "terms and conditions user
     * need to accept before using"), and the owner took the screen back out on 2026-09-22 —
     * "the before you start a few things to agree too (t&c) page is still here, delete it."
     * The acceptance is the checkbox on the sign-up page, recorded through `drainPendingTerms`
     * the moment a session for that address exists, so nothing needs to stand here.
     *
     * WHAT WAS LEFT OPEN IS CLOSED BY THE SIGN-UP PAGE ITSELF (2026-09-27), not by a phase: a new
     * account made without the box (Google on the sign-in side) and an account whose accepted
     * version is older than `LEGAL_VERSION` (the Terms moved to 2 that day) see AUTH draw its own
     * checkbox — `termsStep` below, `terms-step.ts`, `app/navigation.tsx` — and the phase under it
     * stays what it is. `docs/AUTH_AND_TRIAL.md §2` carries the note.
     */
    if (account && account.memberships.length > 0) return 'ready';
    // signed in, and the account not asked for yet: the loading screen, never setup (above)
    if (account === null && accountAskedFor !== sessionState.session.user.id) return 'booting';
    /**
     * IN NO HOUSEHOLD — and which screen that deserves depends on whether there ever WAS one
     * (`core/accounts/standing.ts` explains both readings and why the device is what knows).
     * A brand-new account gets setup, as it always has; a caregiver whose evening ran out, or
     * anyone removed, is told so instead of being asked for a baby's date of birth.
     *
     * Only once the account has actually been READ: a cold launch with no account yet must not
     * flash this at somebody whose household is about to arrive.
     */
    if (account !== null && standingWithNoHousehold(lastHousehold) === 'ended') return 'ended';
    /**
     * NO AGE GATE AT ALL (the owner, 2026-09-17: "Remove the parents age"). It was a phase,
     * then a step, and now it is nothing: the app never asks the account holder's date of
     * birth, so this context has no result to hold and offers no action that could produce one
     * (a dormant one would be a loaded gun — see the tripwire in screens/onboarding). Nothing
     * fills the gap with an assumed pass either: `bootstrapPayloadFrom` omits the field, and
     * migration 0020 leaves the three profile columns null rather than stamping a check that
     * nobody ran.
     * A device that ran an older build may still hold an `age_gate:<uid>` preference. It is
     * left where it is: it is the true record of a check that did happen on that device, and
     * nothing reads it any more. "Start fresh" clears it with the rest of preferences.
     */
    return 'onboarding';
  }, [sessionState, providers, account, lastHousehold, accountAskedFor]);
  useEffect(() => crumb(`auth: phase ${phase}`), [phase]);

  // a first read that never answers is given up on, so the loading screen always ends
  const waitingFor =
    sessionState.status === 'signed_in' &&
    account === null &&
    accountAskedFor !== sessionState.session.user.id
      ? sessionState.session.user.id
      : null;
  useEffect(() => {
    if (waitingFor === null) return undefined;
    const t = setTimeout(() => setAccountAskedFor(waitingFor), FIRST_READ_WAIT_MS);
    return () => clearTimeout(t);
  }, [waitingFor]);

  /**
   * THE TERMS STEP (`terms-step.ts`): AUTH's own checkbox for somebody signed in without a
   * recorded "yes" to the current Terms. Decided from the account as READ — never before it, never
   * from an older build's cache that lacks the field — and never for an address whose ticked box
   * is still on its way from this phone.
   */
  const termsStep: TermsStep = useMemo(
    () =>
      termsStepFor({
        session: session === null ? null : { emailVerified: session.user.emailVerified },
        account,
        tickedHere:
          session !== null &&
          session.user.email !== null &&
          termsTickedHere === pendingTermsKey(session.user.email),
        current: LEGAL_VERSION,
      }),
    [session, account, termsTickedHere],
  );
  useEffect(() => {
    if (termsStep !== 'none') crumb(`auth: the terms step (${termsStep})`);
  }, [termsStep]);

  // for callbacks, as of this render: the teardown decides from them whether a sign-out is measured
  phaseRef.current = phase;
  termsShown.current = termsStep !== 'none';
  // and the gate on the one emitter, shut on every sign-in screen (`measured.ts`)
  measuring.current = analyticsOpen(phase, termsStep !== 'none');

  /**
   * THE LAUNCH, COUNTED ONCE IT LANDS PAST THE SIGN-IN SCREENS (`measured.ts` `launchCounted`). It
   * was emitted at boot, before anything was known, so every signed-out launch counted AUTH.
   */
  useEffect(() => {
    if (launchCountedOnce.current || !launchCounted(phase, termsStep !== 'none')) return;
    launchCountedOnce.current = true;
    analytics.emit('app_open', { cold: true });
  }, [phase, termsStep, analytics]);

  /**
   * THE AUTO-JOIN (the owner's report of 2026-09-29: joining "after signing up feels like its
   * incomplete"). The moment the account has been READ with no household in it — a new account whose
   * email link opened the app, or a sign-in on the join's behalf, or somebody on Ended — the invite
   * the phone is holding is sent on its own, and the answer is settled by `settleJoin`: the
   * confirmation, or the join page saying what happened. Never before the account is read (an
   * account with a household must not be sent anywhere), never while the terms step is up (nothing
   * happens until the box is ticked), and once per held invite, so a refusal is not sent again on
   * every render: a reconnect, Try again or a new invite sends it again.
   */
  const heldKey = inviteHold?.state === 'held' ? `${inviteHold.kind}:${inviteHold.heldAt}` : null;
  const signedInId = session?.user.id ?? null;
  useEffect(() => {
    if (signedInId === null || heldKey === null || account === null) return;
    if (accountReadFor !== signedInId) return;
    if (phase !== 'onboarding' && phase !== 'ended') return;
    if (termsStep !== 'none' || account.memberships.length > 0) return;
    const key = `${signedInId}:${heldKey}`;
    if (joinTried.current === key) return;
    joinTried.current = key;
    void redeemHeld();
  }, [signedInId, heldKey, account, accountReadFor, phase, termsStep, redeemHeld]);

  /**
   * "NO CONNECTION" IS NOT THE END OF IT: the join is sent again the moment the phone has a
   * connection, or comes back to the front, without the joiner having to find Try again.
   */
  useEffect(() => {
    const again = () => {
      if (joinProblemRef.current === 'offline') void retryJoinRef.current();
    };
    const netSub = NetInfo.addEventListener(s => {
      if (s.isConnected) again();
    });
    const appSub = AppState.addEventListener('change', s => {
      if (s === 'active') again();
    });
    return () => {
      netSub();
      appSub.remove();
    };
  }, []);

  /**
   * AN ACCOUNT THAT SHOWS A HOUSEHOLD JOINS WITH ITS INVITE BELOW THE LIMIT (0153), and otherwise
   * has nothing left to join with it (0139 had one household per account; ACCOUNTS.md §7.4). The invite is let go the moment `ready` is true
   * — and, since 2026-09-29, never without a word: a code typed on the first screen by somebody who
   * then signed in to an account that already had a household, or a link opened inside one, used to
   * vanish, and the person believed they had joined. Unless this very join is what made the account
   * `ready` (its note says "joined"), the first page in the household says the invite was not used,
   * and why (`JoinedScreen`). A lapsed invite is let go quietly: it could not have been used anyway.
   */
  useEffect(() => {
    if (phase !== 'ready' || inviteHold === null) return;
    const hold = inviteHold;
    const here = account?.memberships[0]?.household_name ?? '';
    void (async () => {
      /*
        SEVERAL FAMILIES (0153): below the limit, the invite is not let go — it JOINS, and the family
        joined comes on screen (`settleJoin`). With no signal it stays held, and the next account
        read (a reconnect) runs this again. Anything else the server says is the note it always was.
      */
      const belowLimit = canJoinAnother(account);
      // at the limit nothing is tried: the note says so
      let why: NotUsedWhy = 'limit';
      if (
        hold.state === 'held' &&
        signedInId !== null &&
        !joiningRef.current &&
        joinNoteRef.current?.kind !== 'joined' &&
        belowLimit
      ) {
        // tried once per run of the app: a refusal that may pass (too many tries, codes paused, a
        // seat that needs Plus, a fault) is not tried again on every account read
        const key = hold.invite.token ?? hold.invite.code ?? '';
        if (heldTriedRef.current === key) return;
        const out = await joinWithInvite(hold.invite, hold.origin);
        if (out === null || (out.kind === 'kept' && out.problem === 'offline')) return;
        if (out.kind === 'joined') {
          await forgetInvite();
          return;
        }
        /*
          KEPT, NOT DROPPED (the regression review, 2026-10-08): a join that did not land for a
          reason that can pass keeps the invite held for the next launch, rather than being let go
          with "You're already in X", which was not the reason. Only a refusal (a dead code) or the
          one-family answer below writes the note and forgets it.
        */
        if (out.kind === 'kept') {
          heldTriedRef.current = key;
          return;
        }
        // the true reason, never the limit for somebody in one family (2026-10-07)
        why = notUsedWhyOf(out, belowLimit);
      }
      if (
        hold.state === 'held' &&
        signedInId !== null &&
        !joiningRef.current &&
        joinNoteRef.current?.kind !== 'joined'
      ) {
        await putJoinNote(signedInId, {
          kind: 'not_used',
          current: here,
          invited: hold.preview?.household_name ?? '',
          why,
          at: Date.now(),
        });
      }
      await forgetInvite();
    })();
  }, [phase, inviteHold, account, signedInId, forgetInvite, putJoinNote, joinWithInvite]);

  const heldInvite = inviteHold?.state === 'held' ? inviteHold.invite : null;
  const heldPreview = inviteHold?.state === 'held' ? inviteHold.preview : null;
  const inviteLapse = inviteHold?.state === 'lapsed' ? inviteHold.lapse : null;
  const accountKeptSaid = useCallback(() => setAccountKept(false), []);

  /*
    THE SWITCH (0153). One family is open at a time: its file, its sync engine, its reminders and
    widgets. A switch is that family stepping off and another stepping on, in this order:

      1. WHAT IT OWES THE SERVER GOES FIRST, within the leave's own budget. A queue that does not
         empty stops the switch, and says how many entries are waiting: a family off screen is never
         left holding an entry the server has not got, so a sign-out (which deletes every family's
         file) can never take the last copy of one. Offline with nothing queued, it switches at once.
      2. ITS ENGINE STOPS (`stopForTeardown`: the latch closes and nothing automatic runs), so not
         one more pull of that family can land in the next family's file.
      3. THE OTHER FAMILY IS FOCUSED (`adopt`): its file is selected, the latch lifts, the account
         shows it first, and the tree below the account remounts on the new epoch — the sync engine
         is rebuilt for it and pulls at once; Today, the reminders and the widgets are its.
  */
  /**
   * THE DUTY STEP OF A SWITCH, for the family on screen (`household/switchDuty.ts` has why). Asked
   * with `handBack` false it only reads; with true, and a connection, it writes the list without
   * this person's shifts, as "End now" writes one, for the switch's flush to send.
   */
  const dutyStep = useCallback(async (userId: string, handBack: boolean): Promise<DutyStep> => {
    const householdId = mirrorOf(accountRef.current);
    if (householdId === null) return { kind: 'clear' };
    const role = accountRef.current?.memberships[0]?.role ?? null;
    return dutyBeforeSwitch(
      {
        read: async () => ({
          loaded: true,
          ...(await dutyRead(await openLocalDb(), householdId)),
        }),
        online: async () => {
          const s = await NetInfo.fetch();
          return s.isConnected !== false && s.isInternetReachable !== false;
        },
        handBack: async (shifts, here) => {
          const db = await openLocalDb();
          const state = dutyStateOf(here, userId, role, Date.now());
          await saveDuty(db, systemClock, {
            householdId,
            createdBy: userId,
            deviceId: await deviceId(db),
            source: 'sheet',
            shifts,
            eligible: state.eligible,
            seatEnds: state.seatEnds,
            // the list as this phone holds it: its `rev` is the `base` the server checks
            replacing: here.list,
          });
        },
        now: () => Date.now(),
      },
      userId,
      handBack,
    );
  }, []);

  dutyStepRef.current = dutyStep;

  const dutyHere = useCallback(async (): Promise<OnDutyHere | null> => {
    const cur = sessionRef.current;
    if (cur.status !== 'signed_in' || tearingDown.current) return null;
    const step = await dutyStep(cur.session.user.id, false).catch(() => null);
    if (step?.kind !== 'on_duty') return null;
    return { name: accountRef.current?.memberships[0]?.household_name ?? '', ...step.duty };
  }, [dutyStep]);

  const switchHousehold = useCallback(
    async (householdId: string, opts: { handBackDuty?: boolean } = {}): Promise<SwitchOutcome> => {
      const cur = sessionRef.current;
      const read = rawAccountRef.current;
      if (
        cur.status !== 'signed_in' ||
        tearingDown.current ||
        read === null ||
        switchingRef.current
      )
        return { kind: 'failed' };
      const target = read.memberships.find(m => m.household_id === householdId);
      if (target === undefined) return { kind: 'failed' };
      if (mirrorOf(accountRef.current) === householdId)
        return { kind: 'switched', name: target.household_name };
      const leaving = accountRef.current?.memberships[0]?.household_name ?? '';
      switchingRef.current = true;
      setSwitching(true);
      try {
        /*
          0. ON DUTY IN THE FAMILY BEING LEFT (2026-10-08; `household/switchDuty.ts`): this phone
             rings only for the family on screen, and the other phones of this one stay quiet
             because the list says this phone has it. So the switch is never silent: it stops and
             says so (`on_duty`), and the switcher asks. A yes hands the shift back as a new list,
             written here so the flush below sends it before the family leaves the screen; with no
             connection nothing is written and nothing changes (`on_duty_offline`).
        */
        const duty = await dutyStep(cur.session.user.id, opts.handBackDuty === true);
        if (duty.kind === 'on_duty') return { kind: 'on_duty', name: leaving, ...duty.duty };
        if (duty.kind === 'offline') return { kind: 'on_duty_offline', name: leaving };
        if (duty.kind === 'failed') return { kind: 'failed' };
        if (duty.kind === 'handed_back')
          crumb('auth: on for the family being left; the shift is handed back before the switch');
        const r = syncRuntime();
        if (r !== null) {
          await Promise.race([
            r.flush('manual').then(
              () => undefined,
              () => undefined,
            ),
            waitFor(LEAVE_FLUSH_MS),
          ]);
          /*
            A ROW THE SERVER REFUSED FOR GOOD (FAILED) IS NOT WAITING TO SEND, and counting it kept
            the switch saying "N entries waiting" for ever (the regression review, 2026-10-08).
            It stays in this family's own file, which a switch never deletes, as `leaveHousehold`
            already counts it.
          */
          const owed = (await r.pending().catch(() => [])).filter(
            row => row.state !== 'FAILED',
          ).length;
          if (owed > 0) return { kind: 'owed', count: owed, name: leaving };
          r.stopForTeardown();
        }
        crumb('auth: another family comes on screen');
        activeRef.current = householdId;
        await prefsStore
          .set(ACTIVE_HOUSEHOLD(cur.session.user.id), householdId)
          .catch(() => undefined);
        if (!(await adopt(read))) {
          // signed out or torn down meanwhile: whatever did that owns the latch now
          return { kind: 'failed' };
        }
        setSwitchedTo(target.household_name);
        // a join whose own switch did not land: its "You joined" is said now, over its family
        const owedNote = owedJoinNoteRef.current;
        if (owedNote?.kind === 'joined' && owedNote.household_id === householdId) {
          owedJoinNoteRef.current = null;
          setJoinedOffScreen(null);
          await putJoinNote(cur.session.user.id, owedNote);
        }
        // what the server says now about every family, in the background
        void refreshAccount().catch(() => null);
        return { kind: 'switched', name: target.household_name };
      } finally {
        switchingRef.current = false;
        setSwitching(false);
      }
    },
    [adopt, refreshAccount, dutyStep, putJoinNote],
  );
  switchRef.current = switchHousehold;
  const switchedSaid = useCallback(() => setSwitchedTo(null), []);
  const joinedOffScreenSaid = useCallback(() => setJoinedOffScreen(null), []);
  // "Start your own family" (0154): the read, then the same switch a second join makes
  const startedOwnFamily = useCallback(
    (householdId: string | null): Promise<OwnFamilyOutcome> =>
      bringOwnFamilyOnScreen(
        { read: () => refreshAccount(), switchTo: id => switchHousehold(id) },
        householdId,
      ),
    [refreshAccount, switchHousehold],
  );

  const value = useMemo<AuthContextValue | null>(() => {
    if (!providers) return null;
    return {
      env,
      phase,
      session,
      online: online && (account !== null || phase !== 'ready'),
      account,
      accountReadAt,
      lastHousehold,
      pendingEmail,
      heldInvite,
      heldPreview,
      inviteLapse,
      joining,
      joinProblem,
      joinNote,
      leftHousehold,
      linkProblem,
      quarantined,
      forcedSignOut,
      recovery,
      termsStep,
      accountKept,
      householdEpoch,
      switching,
      switchedTo,
      joinedOffScreen,
      auth: providers.auth,
      api: providers.api,
      mock: providers.mock,
      analytics,
      actions: {
        signedIn,
        setPendingEmail,
        refreshAccount,
        holdInvite,
        forgetInvite,
        inviteRefused,
        inviteStillLive,
        joinWithCode,
        joinWithLink,
        retryJoin,
        joinNoteSeen,
        leaveHousehold,
        leaveSeat,
        restoreHousehold,
        signOut,
        pullRefused,
        openLink,
        agreeToTerms,
        accountKeptSaid,
        switchHousehold,
        dutyHere,
        startedOwnFamily,
        switchedSaid,
        joinedOffScreenSaid,
        dismissForcedSignOut: () => setForcedSignOut(null),
        clearLinkProblem: () => setLinkProblem(null),
        clearRecovery: () => setRecovery(false),
      },
    };
  }, [
    providers,
    env,
    phase,
    session,
    online,
    account,
    accountReadAt,
    lastHousehold,
    pendingEmail,
    heldInvite,
    heldPreview,
    inviteLapse,
    joining,
    joinProblem,
    joinNote,
    leftHousehold,
    linkProblem,
    quarantined,
    forcedSignOut,
    recovery,
    termsStep,
    accountKept,
    householdEpoch,
    switching,
    switchedTo,
    joinedOffScreen,
    analytics,
    signedIn,
    refreshAccount,
    holdInvite,
    forgetInvite,
    inviteRefused,
    inviteStillLive,
    joinWithCode,
    joinWithLink,
    retryJoin,
    joinNoteSeen,
    leaveHousehold,
    leaveSeat,
    restoreHousehold,
    signOut,
    pullRefused,
    openLink,
    agreeToTerms,
    accountKeptSaid,
    switchHousehold,
    dutyHere,
    startedOwnFamily,
    switchedSaid,
    joinedOffScreenSaid,
  ]);

  if (!value) return null; // the first frame: nothing renders until the phase is known — no flash of the wrong screen
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const v = useContext(AuthContext);
  if (!v) throw new Error('useAuth outside AuthProviderRoot');
  return v;
}
