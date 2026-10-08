/**
 * THE VIEWER'S NEW PICTURE, KEPT ON THIS PHONE UNTIL THE SERVER HAS IT (the owner, 2026-09-30;
 * migration 0148). A photo, a drawing, or back to the initial: whichever was chosen last is written
 * here first, drawn on this phone at once, and sent when there is a network — now, on the reconnect,
 * when the app comes back, on a short backoff (`MemberPictures.tsx` has the when). Nothing is lost
 * offline and nothing is half set: the server takes the photo's file before the row that names it
 * (`setMemberPhoto`), and this record goes only once the server has said yes, or said a no it would
 * say again.
 *
 * WHY THE PREFERENCES AND NOT A FILE: the photo's bytes (the finished 512 px JPEG, some tens of
 * kilobytes) are kept here as base64, where the OS cannot reclaim them the way it may empty the
 * cache directory, and where sign-out clears them with the rest of the account's keys (`prefs`).
 * A household that leaves the phone does not take them: the picture is the person's, not the
 * household's (`survivesHouseholdEnd`).
 *
 * ONE RECORD, THE LATEST CHOICE. A second choice replaces the first before either is sent, and a
 * send clears the record only if it is still the one it sent (`token`): a choice made while an
 * upload was in flight is never lost to that upload's success.
 */
import { z } from 'zod';
import type { AccountsApi, ApiFailure, MemberPictureSaved } from '../auth/providers/types';
import { base64Of, bytesOfBase64 } from '../lib/base64';
import type { KeyValueStore } from '../prefs';

const Waiting = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('photo'), token: z.string().min(1), jpeg: z.string().min(1) }),
  z.object({ kind: z.literal('drawing'), token: z.string().min(1), id: z.string().min(1) }),
  z.object({ kind: z.literal('initial'), token: z.string().min(1) }),
]);
export type WaitingPicture = z.infer<typeof Waiting>;

/** What a person chose, before it is a record: the photo as its finished bytes. */
export type PictureChoice =
  { kind: 'photo'; jpeg: Uint8Array } | { kind: 'drawing'; id: string } | { kind: 'initial' };

export const WAITING_PICTURE_PREFIX = 'waiting_member_picture:';
export const waitingPictureKey = (userId: string): string => `${WAITING_PICTURE_PREFIX}${userId}`;

/** The choice as the record kept for it, under a token of its own. */
export function waitingOf(choice: PictureChoice, token: string): WaitingPicture {
  if (choice.kind === 'photo') return { kind: 'photo', token, jpeg: base64Of(choice.jpeg) };
  if (choice.kind === 'drawing') return { kind: 'drawing', token, id: choice.id };
  return { kind: 'initial', token };
}

export async function saveWaitingPicture(
  store: KeyValueStore,
  userId: string,
  waiting: WaitingPicture,
): Promise<void> {
  await store.set(waitingPictureKey(userId), JSON.stringify(waiting));
}

export async function loadWaitingPicture(
  store: KeyValueStore,
  userId: string,
): Promise<WaitingPicture | null> {
  const raw = await store.get(waitingPictureKey(userId));
  if (!raw) return null;
  try {
    const parsed = Waiting.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Clears the record only if it is still the one `token` names: a newer choice stays. */
export async function clearWaitingPicture(
  store: KeyValueStore,
  userId: string,
  token: string,
): Promise<void> {
  const now = await loadWaitingPicture(store, userId);
  if (now === null || now.token === token) await store.remove(waitingPictureKey(userId));
}

/**
 * A refusal worth sending again: no network (0), a server fault (5xx), a session that is being
 * refreshed (401), or the server asking for a pause (408, 429). Any other refusal is one the server
 * would repeat word for word, and the record goes.
 */
export const pictureWorthRetrying = (status: number): boolean =>
  status === 0 || status === 401 || status === 408 || status === 429 || status >= 500;

export type SendOutcome =
  /** nothing was waiting */
  | 'nothing'
  /** the server has it; the record is gone and the account read again */
  | 'sent'
  /** no network, or a refusal worth another try: the record stays */
  | 'retry'
  /** a refusal the server would repeat: the record is gone */
  | 'refused';

export interface SendDeps {
  load(): Promise<WaitingPicture | null>;
  clear(token: string): Promise<void>;
  api: Pick<AccountsApi, 'setMemberPhoto' | 'setMemberDrawing' | 'clearMemberPicture'>;
  /** The sent photo's bytes into the member-photo cache, under the stamp the server wrote. */
  cache(updatedAt: string | null, bytes: Uint8Array): void;
  /** The account read again, so every surface draws what the server now has. */
  refresh(): Promise<unknown>;
}

/**
 * ONE ATTEMPT AT SENDING WHAT WAITS. Every effect is handed in, so the whole road from the kept
 * record to the row the household reads runs in node against the in-app test backend
 * (`pictureWaiting.test.ts`). A throw from the API (the in-app backend with no connection, a real
 * one with no answer) is a `retry`.
 */
export async function sendWaitingPicture(
  deps: SendDeps,
): Promise<{ outcome: SendOutcome; status?: number }> {
  const waiting = await deps.load();
  if (waiting === null) return { outcome: 'nothing' };
  const bytes = waiting.kind === 'photo' ? bytesOfBase64(waiting.jpeg) : null;
  let r: { ok: true; picture: MemberPictureSaved } | ApiFailure;
  try {
    r =
      bytes !== null
        ? await deps.api.setMemberPhoto(bytes)
        : waiting.kind === 'drawing'
          ? await deps.api.setMemberDrawing(waiting.id)
          : await deps.api.clearMemberPicture();
  } catch {
    return { outcome: 'retry', status: 0 };
  }
  if (r.ok) {
    // cached under the SERVER's stamp, so the first read after the refresh finds its file
    if (bytes !== null) deps.cache(r.picture.avatar_updated_at, bytes);
    await deps.clear(waiting.token);
    await deps.refresh();
    return { outcome: 'sent' };
  }
  if (pictureWorthRetrying(r.status)) return { outcome: 'retry', status: r.status };
  await deps.clear(waiting.token);
  return { outcome: 'refused', status: r.status };
}
