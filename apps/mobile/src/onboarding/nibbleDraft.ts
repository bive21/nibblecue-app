/**
 * NIBBLECUE'S SETUP ANSWERS AS CUDDLECUE'S DRAFT (`screens/onboarding/OnboardingScreen.tsx`): only
 * the first step's answers, through CuddleCue's own reducer, so the bootstrap payload is built and
 * checked by the same code CuddleCue's setup uses (`bootstrapPayloadFrom`). Every module default is
 * CuddleCue's, so the family opens in CuddleCue too.
 */
import { onboardingReducer, type OnboardingDraft } from '@nibblecue/core';

export function nibbleDraft(
  base: OnboardingDraft,
  answers: { name: string; child: string; birth: string | null },
): OnboardingDraft {
  let d = onboardingReducer(base, { type: 'set_name', value: answers.name });
  d = onboardingReducer(d, { type: 'set_role', value: 'parent' });
  d = onboardingReducer(d, { type: 'set_child_name', value: answers.child });
  d = onboardingReducer(d, { type: 'set_birth_date', value: answers.birth });
  return onboardingReducer(d, { type: 'confirm_birth_date' });
}
