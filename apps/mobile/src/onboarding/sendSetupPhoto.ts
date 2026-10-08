/**
 * ONE ATTEMPT AT SENDING THE PICTURE FROM STEP 1 — a photo, or one of the drawn babies — to the child
 * setup created (`SetupSeeder` runs it: now, when a child lands, on a short backoff and when the
 * phone comes back online). Its own file, with every effect handed in, so the whole road from the
 * parked record to the row the household reads is a node test against the in-app test backend
 * (`sendSetupPhoto.test.ts`) rather than a component nobody can run here — which is how the owner's
 * question of 2026-09-26 (*"i feel like i selected an avatar on onboarding, but it does not show up
 * now. just check if it's fine or not"*) was answered: by running it.
 *
 * WHAT EACH OUTCOME LEAVES BEHIND:
 *   `nothing`   no picture was parked: nothing to do, ever, in this session;
 *   `no_child`  the child is not in the account yet: the record stays, for the next wake;
 *   `gone`      the parked file was reclaimed with the cache: the record goes (two taps on the
 *               photo sheet re-pick it — nothing else was lost);
 *   `sent`      uploaded; the bytes are cached under the stamp the server wrote, the parked file
 *               and the record go, and the account is read again so every surface draws it;
 *   `kept`      the child already has a picture: the one parked at setup never replaces it (a
 *               Finish that reached a household another Finish made, or an upload that landed
 *               while its answer was lost), so the record and the parked file go;
 *   `refused`   a refusal the server would repeat (forbidden, too large): the record goes;
 *   `retry`     no network or a server fault: the record stays.
 * A throw (the in-app backend with no connection) is the caller's to catch, and keeps the record.
 */
import type { ApiFailure, ChildPhotoSaved } from '../auth/providers/types';
import { photoWorthRetrying, type PendingChildPhoto } from './pending-photo';

export type SetupPhotoOutcome =
  'nothing' | 'no_child' | 'gone' | 'sent' | 'kept' | 'refused' | 'retry';

/** A child as the account lists it: `photo_path` says whether it has a picture already. */
export interface SetupPhotoChild {
  id: string;
  household_id: string;
  photo_path?: string | null;
}

export interface SetupPhotoDeps {
  loadPending(): Promise<PendingChildPhoto | null>;
  clearPending(): Promise<void>;
  /** The parked bytes, or null when the file is gone (`readSetupPhoto`). */
  readParked(uri: string): Promise<Uint8Array | null>;
  forgetParked(uri: string): void;
  /** Into the child-photo cache, under the stamp the server wrote (`cacheChildPhoto`). */
  cache(childId: string, updatedAt: string, bytes: Uint8Array): void;
  upload(
    householdId: string,
    childId: string,
    jpeg: Uint8Array,
  ): Promise<{ ok: true; photo: ChildPhotoSaved } | ApiFailure>;
  /** The account read again, so the new stamp reaches the chip, the switcher and Family. */
  refresh(): Promise<unknown>;
}

/** The first child of the household: the one setup made, since setup makes exactly one. */
function setupChildOf(children: readonly SetupPhotoChild[], householdId: string): string | null {
  return children.find(c => c.household_id === householdId)?.id ?? null;
}

export async function sendSetupPhoto(
  deps: SetupPhotoDeps,
  householdId: string,
  children: readonly SetupPhotoChild[],
): Promise<SetupPhotoOutcome> {
  const pending = await deps.loadPending();
  if (pending === null) return 'nothing';
  const childId = setupChildOf(children, householdId);
  if (childId === null) return 'no_child';
  // a picture the child already has is somebody's choice, and setup's never replaces it
  const has = children.find(c => c.id === childId)?.photo_path ?? null;
  if (has !== null) {
    deps.forgetParked(pending.uri);
    await deps.clearPending();
    return 'kept';
  }
  const bytes = await deps.readParked(pending.uri);
  if (bytes === null) {
    await deps.clearPending();
    return 'gone';
  }
  const r = await deps.upload(householdId, childId, bytes);
  if (r.ok) {
    // cached under the SERVER's stamp, so the first read after the refresh is a cache hit
    // (`childPhotoCacheName` reads the stamp as an instant, whichever way it was printed)
    deps.cache(childId, r.photo.photo_updated_at, bytes);
    deps.forgetParked(pending.uri);
    await deps.clearPending();
    await deps.refresh();
    return 'sent';
  }
  if (photoWorthRetrying(r.status)) return 'retry';
  deps.forgetParked(pending.uri);
  await deps.clearPending();
  return 'refused';
}
