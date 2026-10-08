/**
 * WHETHER A GROWTH PROMPT MAY SPEAK, ON THIS DEVICE, RIGHT NOW (docs/GROWTH_PROMPTS.md).
 *
 * The decision itself is `decide()` in core — pure, and tested against every rule in §1. This
 * hook's whole job is to answer it honestly: to gather the facts from local state, and to be
 * conservative wherever a fact is not available yet.
 *
 * CONSERVATIVE MEANS SILENT. Every unknown resolves to the answer that shows nothing. The
 * account's age is not known until the account loads, so no prompt shows before it; a prompt
 * is lit only by its switch (`switches.ts`); and a campaign that does not
 * exist makes the cross-promotion path inert rather than half-rendered. A growth prompt that
 * appeared because a value had not loaded yet is exactly the interruption this exists to stop.
 *
 * WHAT COUNTS AS BUSY is deliberately broad: a running timer, an open sheet, the tour. A prompt
 * between "Save" and the toast is the definition of an interruption, and the cheapest way to
 * never be that is to treat "something else is happening" as a veto.
 *
 * THE RATING ASK IS THE PLATFORM'S PROMPT AND NOTHING ELSE (§2.3, since 2026-09-28). It used to be
 * a card of the app's own, *Glad it's helping?* with a *Sure* button that called the platform, and
 * both halves of that are against the stores' rules: Google's in-app review guidelines forbid a
 * question before the rating card ("Do you like the app?" is their own example) and a button that
 * triggers it, and Apple says the API is not for a button either, because the system may show
 * nothing at all. So the hook asks the platform itself, once, shortly after the moment that earned
 * it closed, and draws nothing: `kind` never says `REVIEW`, and the card has no review branch. The
 * one button there is, More's *Rate*, opens the store listing, which is what both stores offer
 * instead (`screens/more/MoreScreen.tsx`).
 */
import {
  decide,
  reviewMomentMayAsk,
  GROWTH_RULES,
  type GrowthContext,
  type GrowthKind,
  type GrowthRecord,
} from '@nibblecue/core';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAppearance } from '../appearance/AppearanceProvider';
import { useShellOpen } from '../app/shell';
import { useScreenAwake } from '../app/useScreenAwake';
import { useAuth } from '../auth/AuthContext';
import { useLocalQuery } from '../data/useLocalQuery';
import { useAllRunningTimers } from '../sheets/quick/useRunningTimers';
import { prefsStore } from '../prefs/async-storage';
import { useTour } from '../tour/TourProvider';
import { arrivedMs } from './arrived';
import { useSyncBanner } from '../sync/SyncProvider';
import {
  growthRecord,
  loadErrorSeen,
  loadGrowthEvents,
  recordErrorSeen,
  recordGrowthEvent,
} from './store';
import { requestReview } from './storeReview';
import { GROWTH_SWITCHES } from './switches';

/** What the app knows about the campaign, if any. Null everywhere until admin publishes one. */
export interface PromoCampaign {
  id: string;
  appName: string;
  /** One factual line about what it does. Campaign data, never app copy. */
  line: string;
  appStoreUrl: string | null;
  playStoreUrl: string | null;
}

export interface GrowthPromptView {
  /**
   * The one CARD that may show, or null. Never `REVIEW`: the rating ask draws nothing of its own
   * (the header says why), so a card slot has nothing to hold for it.
   */
  kind: GrowthKind | null;
  /** Why nothing is showing — for the dev screen and for a test that wants the reason. */
  because: string;
  campaign: PromoCampaign | null;
  /** Record an outcome and stop showing. Both are one call because they always happen together. */
  resolve: (outcome: 'ACCEPT' | 'DISMISS', extra?: 'PLATFORM_SHOWN' | 'PLATFORM_SKIPPED') => void;
}

/**
 * NO CAMPAIGN EXISTS TODAY, and that is the shipped state (§3.3: "the mechanism ships, the
 * campaign does not"). When one does it arrives with the account, the same way an in-app
 * message will; until then this is the constant that keeps the path inert and tested.
 */
export const NO_CAMPAIGN: PromoCampaign | null = null;

/** How often the rating ask looks again while something else is going on, inside its moment. */
export const REVIEW_RECHECK_MS = 1_000;

const NO_COUNTS = { activities: 0, days: 0 };

export function useGrowthPrompt(options: { earnedMoment: boolean }): GrowthPromptView {
  const { account } = useAuth();
  const { resolved } = useAppearance();
  const timers = useAllRunningTimers();
  const openKind = useShellOpen();
  const tour = useTour();
  const awake = useScreenAwake();
  const [history, setHistory] = useState<GrowthRecord[] | null>(null);
  const [shown, setShown] = useState<GrowthKind | null>(null);
  /**
   * THE LAST ERROR THIS PARENT SAW (§1): the sync banner is the one a parent sees, so the moment it
   * appears is written down, and no prompt speaks for a day after it — here or after a restart.
   */
  const bannerUp = useSyncBanner() !== null;
  const [lastErrorMs, setLastErrorMs] = useState<number | null>(null);

  useEffect(() => {
    let live = true;
    void Promise.all([loadGrowthEvents(prefsStore), loadErrorSeen(prefsStore)]).then(
      ([rows, errorAt]) => {
        if (!live) return;
        setHistory(rows);
        setLastErrorMs(prev =>
          prev !== null && errorAt !== null ? Math.max(prev, errorAt) : (prev ?? errorAt),
        );
      },
    );
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    if (!bannerUp) return;
    const now = Date.now();
    setLastErrorMs(now);
    void recordErrorSeen(prefsStore, now);
  }, [bannerUp]);

  const campaign = NO_CAMPAIGN;
  const householdId = account?.memberships[0]?.household_id ?? null;
  const userId = account?.profile?.id ?? null;

  /**
   * HOW MUCH THIS PARENT HAS ACTUALLY LOGGED — two numbers, counted in SQL rather than by
   * reading rows into memory, because "ever" is the whole history and this runs on Today.
   *
   * The day count groups by the UTC date rather than the household's own. It is a THRESHOLD and
   * never a displayed figure, and the two can differ by at most one day at the edges — which
   * can only make a prompt a day later, never a day earlier.
   */
  const counts = useLocalQuery<{ activities: number; days: number }>(
    householdId === null || userId === null
      ? ['growth/idle']
      : ['growth/counts', householdId, userId],
    async db => {
      if (householdId === null || userId === null) return NO_COUNTS;
      const row = await db.get<{ n: number; d: number }>(
        `select count(*) as n, count(distinct substr(start_at, 1, 10)) as d
           from activities
          where household_id = ? and created_by = ? and deleted_at is null`,
        [householdId, userId],
      );
      return { activities: row?.n ?? 0, days: row?.d ?? 0 };
    },
    NO_COUNTS,
  );

  const decision = useMemo(() => {
    // the history has not loaded, or there is no account yet: say nothing at all
    if (history === null || account === null || householdId === null) {
      return { show: null as GrowthKind | null, because: 'not ready' };
    }
    const ctx: GrowthContext = {
      nowMs: Date.now(),
      accountCreatedMs: arrivedMs(account),
      activitiesLogged: counts.activities,
      loggedDays: counts.days,
      /**
       * NOT KNOWN, SO ANSWERED NO. The account state carries the households this user belongs
       * to, not the members of one; there is no member count on the device until the family
       * screen fetches it. §2.2 takes EITHER signal, so saying no here simply means the review
       * ask waits for the other one — seven distinct days logged — which is the conservative
       * half of an either/or and delays a prompt rather than bringing one forward.
       */
      hasSecondCaregiver: false,
      busy: timers.length > 0,
      night: resolved.theme === 'night',
      lastErrorMs,
      history,
      // WHICH PROMPTS ARE LIT is one constant (`switches.ts`): the rating ask is on since
      // 2026-09-28, and an over-the-air update is the minute-long stop §1 asks for
      flags: { ...GROWTH_SWITCHES },
      earnedMoment: options.earnedMoment,
      campaignId: campaign === null ? null : (campaign as PromoCampaign).id,
      lastPaywallDismissMs: null,
    };
    const d = decide(ctx);
    return d.show === null
      ? { show: null as GrowthKind | null, because: d.because }
      : { show: d.show, because: '' };
  }, [
    history,
    account,
    householdId,
    timers.length,
    resolved.theme,
    options.earnedMoment,
    campaign,
    counts.activities,
    counts.days,
    lastErrorMs,
  ]);

  useEffect(() => {
    // the rating ask is never a card: its slot stays empty, and the ask below speaks for it
    setShown(decision.show === 'REVIEW' ? null : decision.show);
  }, [decision.show]);

  /**
   * WHEN THE MOMENT CAME. The celebration hook's `justAnswered` stays true for the rest of the
   * session once a card is answered, so the moment is the edge — false to true — and a later
   * edge (a twin's card after the first) moves it on. `reviewMomentMayAsk` lets a moment go once
   * it is half a minute old: an ask a while after the good moment is an ask out of the blue.
   */
  const [momentAt, setMomentAt] = useState<number | null>(null);
  const wasEarned = useRef(false);
  useEffect(() => {
    if (options.earnedMoment && !wasEarned.current) setMomentAt(Date.now());
    wasEarned.current = options.earnedMoment;
  }, [options.earnedMoment]);

  // the latest facts, for a check that fires on a timer rather than on a render
  const facts = useRef({ busy: true, night: false });
  facts.current = {
    busy:
      !awake ||
      openKind !== null ||
      timers.length > 0 ||
      (tour !== null && (tour.phase !== 'off' || tour.guide !== null)),
    night: resolved.theme === 'night',
  };

  useEffect(() => {
    if (decision.show !== 'REVIEW' || momentAt === null) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let live = true;
    const check = () => {
      const now = Date.now();
      const since = now - momentAt;
      if (since > GROWTH_RULES.review.moment.withinMs) return; // the moment has gone; wait for the next
      const may = reviewMomentMayAsk({
        msSinceMoment: since,
        busy: facts.current.busy,
        night: facts.current.night,
        hour: new Date(now).getHours(),
      });
      if (!may) {
        timer = setTimeout(check, REVIEW_RECHECK_MS);
        return;
      }
      void (async () => {
        // THE ASK IS WRITTEN DOWN FIRST and made second, so a kill in between can only lose an
        // ask, never make one twice. The IMPRESSION is what spends the budget and the cooldown.
        await recordGrowthEvent(prefsStore, growthRecord('REVIEW', 'IMPRESSION', now));
        const outcome = await requestReview();
        // what happened to the REQUEST, never what the parent did with it: no store says
        const rows = await recordGrowthEvent(
          prefsStore,
          growthRecord(
            'REVIEW',
            outcome === 'requested' ? 'PLATFORM_SHOWN' : 'PLATFORM_SKIPPED',
            Date.now(),
          ),
        );
        if (live) setHistory(rows);
      })();
    };
    timer = setTimeout(
      check,
      Math.max(0, GROWTH_RULES.review.moment.afterMs - (Date.now() - momentAt)),
    );
    return () => {
      live = false;
      if (timer !== null) clearTimeout(timer);
    };
  }, [decision.show, momentAt]);

  const resolve = useCallback(
    (outcome: 'ACCEPT' | 'DISMISS', extra?: 'PLATFORM_SHOWN' | 'PLATFORM_SKIPPED') => {
      const kind = shown;
      if (kind === null) return;
      setShown(null);
      const now = Date.now();
      const campaignId = campaign === null ? null : (campaign as PromoCampaign).id;
      void (async () => {
        // the IMPRESSION is what spends the budget, so it is written beside the outcome rather
        // than on render: a card the parent never saw must not cost them a fortnight of silence
        await recordGrowthEvent(prefsStore, growthRecord(kind, 'IMPRESSION', now, campaignId));
        let rows = await recordGrowthEvent(
          prefsStore,
          growthRecord(kind, outcome, now, campaignId),
        );
        if (extra !== undefined) {
          rows = await recordGrowthEvent(prefsStore, growthRecord(kind, extra, now, campaignId));
        }
        setHistory(rows);
      })();
    },
    [shown, campaign],
  );

  return { kind: shown, because: decision.because, campaign, resolve };
}
