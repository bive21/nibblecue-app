/**
 * `usePlan()` — the one hook a screen reads its plan through (docs/AUTH_AND_TRIAL.md §6 A6).
 *
 * TWO PLANS, ONE HOOK (NibbleCue, 2026-10-08; the owner: "this is a different subscription called
 * nibblecue plus"). Every NibbleCue feature is answered by the household's NibbleCue Plus row
 * (`account.nibblePlans`, the server's `nibble_my_plan`); the one key whose seat lives on the
 * shared server, caregivers, is answered by either plan (core's `planOf`, the owner 2026-10-08).
 * NibbleCue has no welcome preview of its own, so the preview's card and its sheets never show.
 * The status is the server's word (welcome.ts): the snapshot is computed at server time and
 * only the day count moves on the device. No screen reads a status name to decide a gate;
 * `can()` and `limitFor()` from the plan matrix do.
 */
import {
  can,
  cachedPlan,
  limitFor,
  planOf,
  planSnapshot,
  type FeatureKey,
  type PlanSnapshot,
  type Tier,
  type WelcomeCard,
  type WelcomePrompt,
} from '@nibblecue/core';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '../auth/AuthContext';
import { prefsStore } from '../prefs/async-storage';
import { subscribeToMinute } from '../time/useDayKey';

export interface PlanValue extends PlanSnapshot {
  can(key: FeatureKey): boolean;
  limitFor(key: FeatureKey): number | null;
  /**
   * THE QUIET "PLUS" TAG'S QUESTION (2026-09-28; core's `previewOnly`): `key` is on right now only
   * because of the 14-day preview. A surface asks this through `usePlusTag` and draws `PlusTag`
   * when it is true, so a parent learns during the preview which parts of the app were Plus. Never
   * true on a paid plan, and never on Free, where the lock already says it. This is how a screen
   * learns that without reading a status or a tier name (CLAUDE.md §4).
   */
  previewTag(key: FeatureKey): boolean;
  /**
   * The cap the free plan would hold `key` to while the preview lifts it (the history window's
   * days, core's `previewLimit`), or null: where the Activity log draws its "Older than" line.
   */
  previewLimit(key: FeatureKey): number | null;
  /**
   * THIS MEMBER DECIDES FOR THE HOUSEHOLD: the owner or a parent (`DECIDES` below). The plan cards
   * and the trial-end sheets go only to them, and a locked control tapped by anyone else opens the
   * gate sheet without the offer (`GateSheet`). A role, never a plan status.
   */
  decides: boolean;
  /** Which dismissible card Today shows, if any. */
  card: WelcomeCard;
  /**
   * Which trial-end sheet is due, if any: with seven days left, then three (core's
   * `welcomePrompt`). WHEN it may rise is Today's to decide (`usePlanPrompt`); this only says
   * which one is owed.
   */
  prompt: WelcomePrompt | null;
  dismissThreeDays(): void;
  markSummarySeen(): void;
  /** The prompt has been shown: it never asks again on this phone. */
  markPromptSeen(prompt: WelcomePrompt): void;
}

const PlanContext = createContext<PlanValue | null>(null);

const DISMISS_KEY = (uid: string) => `welcome_three_days_dismissed:${uid}`;
const SUMMARY_KEY = (uid: string) => `welcome_summary_seen:${uid}`;
const PROMPT_KEY = (uid: string, prompt: WelcomePrompt) => `welcome_prompt_seen:${prompt}:${uid}`;

/**
 * WHO IS SOLD TO. The household's plan is bought for everyone in it (migration 0101), so the ask
 * goes to the two people who would decide: the owner and a parent. A caregiver or a view-only seat
 * — the grandparent, the night nurse — is never handed a paywall, and since 2026-09-27 is shown
 * neither plan card either (core's `welcomeCard`).
 */
const DECIDES = new Set(['OWNER', 'PARENT']);

export function PlanProvider({ children }: { children: ReactNode }) {
  const { account, accountReadAt, session } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [summarySeen, setSummarySeen] = useState(false);
  /*
    NULL UNTIL READ, and a prompt is owed only once it is known it was not already shown: a sheet
    that rose because the preference had not loaded yet would be the second time for a parent who
    already said "Not now".
  */
  const [promptsSeen, setPromptsSeen] = useState<{
    sevenDaysLeft: boolean;
    threeDaysLeft: boolean;
  } | null>(null);
  const [tick, setTick] = useState(0);
  const uid = session?.user.id ?? null;

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void Promise.all([
      prefsStore.get(DISMISS_KEY(uid)),
      prefsStore.get(SUMMARY_KEY(uid)),
      prefsStore.get(PROMPT_KEY(uid, 'seven_days_left')),
      prefsStore.get(PROMPT_KEY(uid, 'three_days_left')),
    ]).then(([d, s, seven, three]) => {
      if (cancelled) return;
      setDismissed(d === '1');
      setSummarySeen(s === '1');
      setPromptsSeen({ sevenDaysLeft: seven === '1', threeDaysLeft: three === '1' });
    });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  // the day count moves with real time; the app's one minute clock is plenty for a number of days
  useEffect(() => subscribeToMinute(() => setTick(x => x + 1)), []);

  /*
    THE THREE-DAY CARD AND THE THREE-DAY SHEET ARE ONE MESSAGE (core's `WelcomePrompt`): whichever
    the parent meets and answers first, the other is not said again. Dismissing the card counts as
    having heard the sheet, and the sheet rising dismisses the card.
  */
  const dismissThreeDays = useCallback(() => {
    setDismissed(true);
    setPromptsSeen(p => (p === null ? p : { ...p, threeDaysLeft: true }));
    if (uid) {
      void prefsStore.set(DISMISS_KEY(uid), '1');
      void prefsStore.set(PROMPT_KEY(uid, 'three_days_left'), '1');
    }
  }, [uid]);
  const markPromptSeen = useCallback(
    (prompt: WelcomePrompt) => {
      setPromptsSeen(p =>
        p === null
          ? p
          : prompt === 'seven_days_left'
            ? { ...p, sevenDaysLeft: true }
            : { ...p, threeDaysLeft: true },
      );
      if (prompt === 'three_days_left') setDismissed(true);
      if (uid) {
        void prefsStore.set(PROMPT_KEY(uid, prompt), '1');
        if (prompt === 'three_days_left') void prefsStore.set(DISMISS_KEY(uid), '1');
      }
    },
    [uid],
  );
  const markSummarySeen = useCallback(() => {
    setSummarySeen(true);
    if (uid) void prefsStore.set(SUMMARY_KEY(uid), '1');
  }, [uid]);

  const derived = useMemo(() => {
    const snapshot = planSnapshot(account?.entitlement ?? null, account?.serverNow ?? Date.now());
    const plan = cachedPlan(snapshot, Date.now(), accountReadAt || Date.now());
    const shown = account?.memberships[0];
    const decides = DECIDES.has(shown?.role ?? '');
    const nibbleRow = shown ? (account?.nibblePlans?.[shown.household_id] ?? null) : null;
    const nibble = cachedPlan(
      planSnapshot(nibbleRow, account?.serverNow ?? Date.now()),
      Date.now(),
      accountReadAt || Date.now(),
    );
    return {
      plan: nibble,
      cuddleTier: plan.tier,
      decides,
      // CuddleCue's preview cards are CuddleCue's to show; NibbleCue Plus has no preview
      card: null as WelcomeCard,
      prompt: null as WelcomePrompt | null,
    };
    // `tick` is what re-derives the day count over time. The rule calls it unnecessary because
    // the body never reads it — but the body reads `Date.now()`, which no dependency can express,
    // and the minute counter is how "3 days left" becomes "2 days left" without a remount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account, accountReadAt, dismissed, summarySeen, promptsSeen, tick]);

  /*
    THE VALUE CHANGES WHEN THE ANSWER DOES, NOT WHEN THE MINUTE DOES (docs/DESIGN_SYSTEM.md §7.1).
    `usePlan()` is read by two dozen components across every mounted tab — gates, Plus cards, the
    Appearance locks — and the minute tick above used to hand every one of them a new object sixty
    times an hour, so each re-rendered for a day count that changes once a day. The fields are
    listed one by one, so this is a new value exactly when a field a reader can see is new; a
    required field added to `PlanSnapshot` fails the type check here until it is listed too.
  */
  const { status, tier, daysLeft, expiresAt, computedAt } = derived.plan;
  const { card, prompt, decides, cuddleTier } = derived;
  const value = useMemo<PlanValue>(
    () => ({
      status,
      tier,
      daysLeft,
      expiresAt,
      computedAt,
      can: key => can(key, tierOf(key, tier, cuddleTier)),
      limitFor: key => limitFor(key, tierOf(key, tier, cuddleTier)),
      previewTag: () => false,
      previewLimit: () => null,
      decides,
      card,
      prompt,
      dismissThreeDays,
      markSummarySeen,
      markPromptSeen,
    }),
    [
      status,
      tier,
      daysLeft,
      expiresAt,
      computedAt,
      cuddleTier,
      decides,
      card,
      prompt,
      dismissThreeDays,
      markSummarySeen,
      markPromptSeen,
    ],
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan(): PlanValue {
  const v = useContext(PlanContext);
  if (!v) throw new Error('usePlan outside PlanProvider');
  return v;
}

/** Whose plan answers a feature: NibbleCue Plus, the household's CuddleCue Plus, or either. */
function tierOf(key: FeatureKey, nibble: Tier, cuddle: Tier): Tier {
  const by = planOf(key);
  if (by === 'cuddlecue') return cuddle;
  if (by === 'either') return nibble === 'PLUS' || cuddle === 'PLUS' ? 'PLUS' : 'FREE';
  return nibble;
}
