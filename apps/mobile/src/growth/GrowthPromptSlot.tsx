/**
 * TODAY'S GROWTH PROMPT, IN A COMPONENT OF ITS OWN (docs/GROWTH_PROMPTS.md §1, §2.3).
 *
 * What the hook watches moves all the time a parent uses the app: every sheet that opens and
 * closes, the tour, the timers, the app going to the background. Called from `TodayScreen`, each of
 * those re-rendered the whole page; here only this element does — the pattern `PlanPromptWatch`
 * set for the trial sheets (2026-09-28, the lag after a save).
 *
 * It draws the one CARD the budget allows when the banner slot is free, and nothing otherwise. The
 * rating ask draws nothing at all: the hook asks the platform itself, at the moment (§2.3).
 *
 * AND UNDER IT, THE SLOT'S LAST CARD: Log together, for a parent who is alone in the household
 * (docs/SHARED_CARE.md §6, `inviteCard/`). It is handed the slot only when the growth card did not
 * draw, so one place decides between the two and they can never stand in the slot together. It is
 * always mounted and told whether the slot is free, so giving way to a higher card never costs it
 * what it has read, and its next first frame can never pass for an arrival at Today.
 */
import { InviteCardSlot } from '../inviteCard/InviteCardSlot';
import { GrowthCard, growthCardDraws } from './GrowthCard';
import { useGrowthPrompt } from './useGrowthPrompt';

export interface GrowthPromptSlotProps {
  /** A card worth asking after was just read and closed (a month mark, the weekly summary). */
  earnedMoment: boolean;
  /** Nothing above this in the banner slot drew: no plan card, no team message. */
  slotFree: boolean;
}

export function GrowthPromptSlot({ earnedMoment, slotFree }: GrowthPromptSlotProps) {
  const prompt = useGrowthPrompt({ earnedMoment });
  const drawn = slotFree && growthCardDraws(prompt);
  return (
    <>
      {drawn ? <GrowthCard prompt={prompt} /> : null}
      <InviteCardSlot slotFree={slotFree && !drawn} />
    </>
  );
}
