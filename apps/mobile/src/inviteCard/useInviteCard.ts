/**
 * LOG TOGETHER, ON THIS PHONE (docs/SHARED_CARE.md §6): the facts core's rules need, gathered
 * honestly. Whether the card is owed is `inviteCardOwed`, whether it may rise `inviteCardMayRise`,
 * and whether it is up from one moment to the next `inviteCardShown`; this hook reads what they ask
 * about and answers conservatively wherever a fact is not in yet.
 *
 * CONSERVATIVE MEANS SILENT, as the growth prompts put it (`growth/useGrowthPrompt.ts`). Until this
 * person's answer, the growth prompts' asks, this launch's number and the member list have all been
 * read, the card is not owed; and because it rises only as Today comes to the front, a fact that
 * arrives in the middle of a visit waits for the next arrival rather than dropping a card above
 * the Log tiles while a parent reaches for one.
 *
 *   · WHO: `usePlan().decides` (the owner or a parent), and the member list from the local mirror
 *     (`db/queries/members.ts`, re-read whenever the household's rows move), which says whether
 *     anyone else is here and whether a parent has left. Not read at all once the card has ended.
 *   · WHAT WAS SAID: the answer on this phone (`store.ts`), read on mount, whenever one is written
 *     (Family's invite among them), and each time Today goes out of view.
 *   · WHEN: this launch's number (`app/launchSession.ts`), the day this person arrived
 *     (`growth/arrived.ts`), the phone's hour (`usePhoneHour`, the app's one minute clock), Night,
 *     and the growth prompts' own record of their asks (`growth/store.ts`), re-read each time Today
 *     goes out of view, so a rating asked during this visit keeps the card away for the rest of the
 *     day.
 *   · BUSY, as broadly as the celebration slot reads it: a timer running for any baby, a sheet,
 *     popover or gate up (the shell's, and every screen's own through `useSheetsUp`, the
 *     celebration card's among them), the tour or a tip.
 *   · ARRIVING: the render in which Today came to the front with the app open (`useScreenAwake`),
 *     decided during render, so the frame the card rises in is the frame the page is drawn in.
 */
import {
  growthAskedSince,
  householdCompany,
  inviteCardEnded,
  inviteCardMayRise,
  inviteCardOwed,
  inviteCardShown,
  keepInviteAnswer,
  newerInviteRecord,
  type GrowthRecord,
  type HouseholdSeat,
  type InviteCardRecord,
} from '@nibblecue/core';
import { useSheetsUp } from '@nibblecue/ui';
import { useCallback, useEffect, useState } from 'react';
import { useAppearance } from '../appearance/AppearanceProvider';
import { launchSession } from '../app/launchSession';
import { useShellOpen } from '../app/shell';
import { useScreenAwake } from '../app/useScreenAwake';
import { useAuth } from '../auth/AuthContext';
import { keys, store } from '../data/store';
import { useLocalQuery } from '../data/useLocalQuery';
import { openLocalDb } from '../db';
import { householdSeats } from '../db/queries/members';
import { arrivedMs } from '../growth/arrived';
import { loadGrowthEvents } from '../growth/store';
import { usePlan } from '../plan/PlanProvider';
import { prefsStore } from '../prefs/async-storage';
import { useAllRunningTimers } from '../sheets/quick/useRunningTimers';
import { usePhoneHour } from '../time/useDaytime';
import { useTour } from '../tour/TourProvider';
import { answerInviteCard } from './answer';
import { inviteCardSignal, loadInviteCardRecord } from './store';

/** The card's own answers. An invite made in Family is Family's to write (`INVITED`). */
export type InviteCardTap = 'OPENED' | 'NOT_NOW' | 'JUST_ME';

export interface InviteCardView {
  /** The card is up. */
  shown: boolean;
  /** Why it is not owed, or '' when it is: for a test or the dev screen that wants the reason. */
  because: string;
  answer: (tap: InviteCardTap) => void;
}

/** Midnight at the start of the phone's own day, the day a rest or an ask belongs to. */
const phoneDayStart = (nowMs: number): number => new Date(nowMs).setHours(0, 0, 0, 0);

export function useInviteCard({ slotFree }: { slotFree: boolean }): InviteCardView {
  const { account, session } = useAuth();
  const plan = usePlan();
  const householdId = account?.memberships[0]?.household_id ?? null;
  const userId = session?.user.id ?? null;
  const awake = useScreenAwake();

  /* WHAT WAS SAID, AND WHAT THE GROWTH PROMPTS ASKED: undefined and null until read */
  const [record, setRecord] = useState<InviteCardRecord | null | undefined>(undefined);
  const [asks, setAsks] = useState<readonly GrowthRecord[] | null>(null);
  const [reads, setReads] = useState(0);
  /*
    A NEW PERSON OR HOUSEHOLD FORGETS WHAT WAS HELD. The reads below merge with the answer in memory
    (so a slow read never undoes a tap), and an answer from the household before must not be merged
    into the next one's: a new household is a new question (`store.ts`).
  */
  const scope = `${userId ?? ''}/${householdId ?? ''}`;
  const [heldScope, setHeldScope] = useState(scope);
  if (heldScope !== scope) {
    setHeldScope(scope);
    setRecord(undefined);
    setAsks(null);
  }
  // an answer written anywhere on this phone (Family's invite) is read at once
  useEffect(() => {
    if (userId === null) return undefined;
    return store.subscribe(inviteCardSignal(userId), () => setReads(n => n + 1));
  }, [userId]);
  // and both again whenever Today goes out of view, so the next arrival knows what happened away
  useEffect(() => {
    if (!awake) setReads(n => n + 1);
  }, [awake]);
  useEffect(() => {
    if (userId === null) return undefined;
    let live = true;
    void Promise.all([loadInviteCardRecord(prefsStore, userId), loadGrowthEvents(prefsStore)])
      .then(([read, growth]) => {
        if (!live) return;
        // a read that set off before a tap was written must not put the older answer back
        setRecord(held => newerInviteRecord(held ?? null, read));
        setAsks(growth);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [userId, householdId, reads]);

  /* THIS LAUNCH'S NUMBER: the first session never sees the card */
  const [launch, setLaunch] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void openLocalDb()
      .then(db => launchSession(db))
      .then(n => {
        if (live) setLaunch(n);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  /* WHO ELSE IS HERE, read only while the card could still be owed */
  const watching =
    plan.decides &&
    householdId !== null &&
    userId !== null &&
    record !== undefined &&
    !inviteCardEnded(record);
  const seats = useLocalQuery<HouseholdSeat[] | null>(
    watching && householdId !== null ? [keys.household(householdId)] : ['inviteCard/idle'],
    async db => (watching && householdId !== null ? householdSeats(db, householdId) : null),
    null,
  );

  /* THE MOMENT */
  const hour = usePhoneHour();
  const { resolved } = useAppearance();
  const timers = useAllRunningTimers();
  const openKind = useShellOpen();
  const sheetsUp = useSheetsUp();
  const tour = useTour();
  const busy =
    timers.length > 0 ||
    openKind !== null ||
    sheetsUp > 0 ||
    (tour !== null && (tour.phase !== 'off' || tour.guide !== null));

  const nowMs = Date.now();
  const dayStart = phoneDayStart(nowMs);
  const verdict =
    account === null || userId === null || record === undefined || asks === null || launch === null
      ? { owed: false as const, because: 'not ready' }
      : inviteCardOwed({
          decides: plan.decides,
          company: seats === null ? null : householdCompany(seats, userId, nowMs),
          record,
          session: launch,
          arrivedMs: arrivedMs(account),
          nowMs,
          phoneDayStartMs: dayStart,
        });
  const may = inviteCardMayRise({
    hour,
    night: resolved.theme === 'night',
    busy,
    slotFree,
    growthAskedToday: asks !== null && growthAskedSince(asks, dayStart),
  });

  /*
    ARRIVING, AND UP OR NOT: both decided during render (React's "adjusting state when a prop
    changes"), as the celebration slot decides its sheet, so the card rises in the very frame Today
    comes to the front and never in a later one.
  */
  const [wasAwake, setWasAwake] = useState(false);
  const arriving = awake && !wasAwake;
  if (awake !== wasAwake) setWasAwake(awake);
  const [up, setUp] = useState(false);
  const shown = inviteCardShown({ wasUp: up, arriving, owed: verdict.owed, may, awake, slotFree });
  if (shown !== up) setUp(shown);

  const answer = useCallback(
    (tap: InviteCardTap) => {
      if (userId === null) return;
      const next = { answer: tap, atMs: Date.now() };
      // the card goes at once; the write is local and cannot fail for want of a network
      setRecord(held => keepInviteAnswer(held ?? null, next));
      void answerInviteCard(userId, next.answer, next.atMs).catch(() => undefined);
    },
    [userId],
  );

  return { shown, because: verdict.owed ? '' : verdict.because, answer };
}
