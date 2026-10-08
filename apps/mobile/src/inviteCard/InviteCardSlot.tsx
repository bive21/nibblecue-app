/**
 * LOG TOGETHER, IN A COMPONENT OF ITS OWN (docs/SHARED_CARE.md §6).
 *
 * What the hook watches moves all the time a parent uses the app: every sheet that opens and
 * closes, the timers, the tour, the member list on every save, the app going to the background.
 * Read in `TodayScreen`, each of those would re-render the whole page; here only this element
 * does, the pattern `PlanPromptWatch`, `GrowthPromptSlot` and `CelebrationSlot` set.
 *
 * IT IS THE BANNER SLOT'S LAST CARD, drawn by `GrowthPromptSlot` whenever its own card does not
 * draw, so the one-card rule holds by there being one place that can draw either (docs/
 * IN_APP_MESSAGES.md §1): the travel card, the plan cards, a team message and a growth prompt all
 * come first. It stays mounted whatever the slot holds, so a card that gave way to a
 * higher one is not taken for a new arrival when the slot is free again.
 *
 * *Invite* opens Family, where the invite starts on Parent while there is a parent's seat: the
 * flow that exists, not a second one. The tap is written first (the card steps aside for the day)
 * and an invite made there ends the card for good (`FamilyScreen`).
 */
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootParams } from '../app/types';
import { InviteCard } from './InviteCard';
import { useInviteCard } from './useInviteCard';

export interface InviteCardSlotProps {
  /** Nothing above it in the banner slot drew, the growth prompt's own card included. */
  slotFree: boolean;
}

export function InviteCardSlot({ slotFree }: InviteCardSlotProps) {
  const card = useInviteCard({ slotFree });
  const nav = useNavigation<NativeStackNavigationProp<RootParams>>();
  if (!card.shown) return null;
  return (
    <InviteCard
      onInvite={() => {
        card.answer('OPENED');
        nav.navigate('Family');
      }}
      onNotNow={() => card.answer('NOT_NOW')}
      onJustMe={() => card.answer('JUST_ME')}
    />
  );
}
