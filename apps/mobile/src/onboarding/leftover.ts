/**
 * A SETUP WHOSE FINISH REACHED THE SERVER BUT WHOSE ANSWER NEVER REACHED THE PHONE (the launch
 * sweep, 2026-09-27).
 *
 * Setup's last button creates the household, and only when its answer arrives does the screen
 * turn the draft into the records the rest of the app is built from: the rhythms, the medicines,
 * the quiet hours, the bedtime, the milk unit and the brands (`pending-setup.ts`), and the baby's
 * picture (`pending-photo.ts`). An answer lost on the way back — the connection dropped while the
 * Edge Function committed, or Android killed the app while it spun — left the draft on disk and
 * nothing else. The next account read then showed the household, the navigator swapped setup for
 * Today, and `SetupSeeder` found no record: the parent landed in an app with none of the five
 * pages they had just answered, and no button left to press again.
 *
 * THE SERVER ALREADY KNOWS WHICH FINISH MADE THE HOUSEHOLD. `bootstrap_household` is idempotent on
 * the draft's `client_op_id`: the same op is answered with the same household (`created: false`),
 * any other op with a 409, and it never makes a second household for somebody who owns one. So
 * the leftover draft's own Finish is simply sent again, as the parent's second tap would have
 * been, and the answer decides:
 *
 *   ok, this household   it was this draft: the records are written and the draft let go, exactly
 *                        as a Finish whose answer arrived does it (`OnboardingScreen` `finish`)
 *   409, 422, 400        not this draft's household (the owner finished on another phone), or a
 *                        draft that could never have made one: let go, nothing written
 *   anything else        no answer (offline, a server fault, a lapsed token): kept, asked again
 *
 * ONLY FOR THE OWNER. A joiner's leftover draft — setup begun before an invite arrived — is not
 * sent: for somebody who owns no household the same call would CREATE one.
 *
 * Pure but for what is handed in, so the node suite plays it against the in-app test backend.
 */
import {
  bootstrapPayloadFrom,
  setupSeedFrom,
  type BootstrapContext,
  type BootstrapPayload,
  type Role,
} from '@nibblecue/core';
import type { CreateHouseholdResult } from '../auth/providers/types';
import type { KeyValueStore } from '../prefs';
import { clearOnboarding, loadOnboarding } from './draft-store';
import { savePendingChildPhoto } from './pending-photo';
import { savePendingSetup } from './pending-setup';

/** What settling came to. */
export type LeftoverOutcome =
  /** no draft on disk, or not this person's to send (a joiner): nothing done */
  | 'none'
  /** this draft made the household: its records are written, the draft let go */
  | 'saved'
  /** a draft that did not make this household: let go, nothing written */
  | 'dropped'
  /** no answer: the draft stays, and the next wake asks again */
  | 'retry';

export interface LeftoverDeps {
  store: KeyValueStore;
  userId: string;
  /** The household the account shows, and this person's role in it. */
  householdId: string;
  role: Role | null;
  createHousehold: (payload: BootstrapPayload) => Promise<CreateHouseholdResult>;
  /** The phone's locale and zone, as `finish` sends them; the server's retry path reads neither. */
  context: BootstrapContext;
}

/** A refusal that says this draft did not, and will never, make this household. */
const definite = (status: number): boolean => status === 400 || status === 409 || status === 422;

/**
 * ONE SETTLING AT A TIME PER PERSON: the seeder's two drains (the records and the picture) both
 * ask first, and both must see one answer — never two Finishes racing, or a record written after
 * the other drain already looked.
 */
const inFlight = new Map<string, Promise<LeftoverOutcome>>();

export function settleLeftoverSetup(deps: LeftoverDeps): Promise<LeftoverOutcome> {
  const running = inFlight.get(deps.userId);
  if (running !== undefined) return running;
  const run = settle(deps).finally(() => inFlight.delete(deps.userId));
  inFlight.set(deps.userId, run);
  return run;
}

async function settle(deps: LeftoverDeps): Promise<LeftoverOutcome> {
  const { store, userId } = deps;
  const saved = await loadOnboarding(store, userId);
  if (saved === null || deps.role !== 'OWNER') return 'none';
  const draft = saved.draft;
  let payload: BootstrapPayload;
  try {
    payload = bootstrapPayloadFrom(draft, deps.context);
  } catch {
    // a draft that cannot be sent never made a household: the parent finished setup elsewhere
    await clearOnboarding(store, userId);
    return 'dropped';
  }
  let answer: CreateHouseholdResult;
  try {
    answer = await deps.createHousehold(payload);
  } catch {
    return 'retry'; // offline: the draft is kept, and the next wake asks again
  }
  if (!answer.ok) {
    if (!definite(answer.status)) return 'retry';
    await clearOnboarding(store, userId);
    return 'dropped';
  }
  if (answer.household_id !== deps.householdId) {
    // cannot happen for an owner (the server answers a second op with a 409), and if it ever
    // did, these answers belong to a household the phone is not showing: nothing is written
    await clearOnboarding(store, userId);
    return 'dropped';
  }
  // exactly what `finish` writes when its answer arrives, in the same order
  await savePendingSetup(store, userId, setupSeedFrom(draft));
  if (draft.child_photo_uri !== null)
    await savePendingChildPhoto(store, userId, draft.child_photo_uri);
  await clearOnboarding(store, userId);
  return 'saved';
}
