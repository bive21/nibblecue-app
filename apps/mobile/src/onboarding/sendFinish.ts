/**
 * SETUP'S LAST BUTTON, THE PART THAT IS NOT THE SCREEN (`OnboardingScreen` `finish` keeps the
 * analytics, the haptic and the welcome window): the answers kept, the household asked for, and
 * what the answer means for the draft. Its own file so the scenario suites play the real thing
 * against the in-app test backend rather than a copy of it.
 *
 * THE ORDER IS THE FIX (`keepAnswers.ts` has the whole story): the answers are on disk before the
 * request leaves, so no answer — lost, refused as a second household, or never read because the
 * app was killed — can cost the parent the rhythms, the brands, the picture or the tour.
 *
 *   created   the household is this Finish's: the draft is let go, and the welcome shows
 *   exists    409, the account already owns a household (an earlier Finish whose answer or draft
 *             was lost): the answers just kept go into it (`SetupSeeder`), and the draft stays
 *             until they have, so a relaunch before the account is read again still finds it
 *   refused   anything else: nothing was made, the draft stays, and the next tap sends it again.
 *             Two 409s are refusals too, not "exists" (0154): `admin_elsewhere` (a parent in
 *             another family) and `household_limit` (in five already). Neither made anything,
 *             and the answers kept for them must not be read as an earlier Finish's household
 *
 * `scope` names the draft (`draft-store.ts`): the first family's, or "Start your own family"'s.
 *
 * A payload that cannot be built throws before anything is kept: a Finish that could never be
 * sent keeps nothing.
 */
import {
  bootstrapPayloadFrom,
  type BootstrapContext,
  type BootstrapPayload,
  type OnboardingDraft,
} from '@nibblecue/core';
import type { ApiFailure, CreateHouseholdResult } from '../auth/providers/types';
import type { KeyValueStore } from '../prefs';
import { clearOnboarding, type DraftScope } from './draft-store';
import { keepSetupAnswers, takeBackSetupAnswers } from './keepAnswers';

export type FinishOutcome =
  | { kind: 'created'; result: Extract<CreateHouseholdResult, { ok: true }> }
  | { kind: 'exists' }
  | { kind: 'refused'; result: ApiFailure };

export interface FinishDeps {
  store: KeyValueStore;
  userId: string;
  context: BootstrapContext;
  createHousehold: (payload: BootstrapPayload) => Promise<CreateHouseholdResult>;
  /** Which draft this Finish is for; the first family's when left out. */
  scope?: DraftScope;
}

/** The 409s that say this Finish may not make a family at all (0154), rather than "made already". */
const REFUSED_409: ReadonlySet<string> = new Set(['admin_elsewhere', 'household_limit']);

export async function sendFinish(deps: FinishDeps, draft: OnboardingDraft): Promise<FinishOutcome> {
  const payload = bootstrapPayloadFrom(draft, deps.context);
  await keepSetupAnswers(deps.store, deps.userId, draft);
  const r = await deps.createHousehold(payload);
  if (r.ok) {
    await clearOnboarding(deps.store, deps.userId, deps.scope);
    return { kind: 'created', result: r };
  }
  if (r.status === 409 && !REFUSED_409.has(r.error)) return { kind: 'exists' };
  if (r.status === 409) await takeBackSetupAnswers(deps.store, deps.userId);
  return { kind: 'refused', result: r };
}
