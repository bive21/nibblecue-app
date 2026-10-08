/**
 * AN OLD EMPTY PICTURE MENDS ITSELF (2026-09-29). The owner, on the household's two phones: *"the
 * avatar still showing as white empty with party hat. on both android and iphone (same household).
 * but now i changed the avatar from my android, andit changes on the iphone too"*. A drawn baby
 * picked on an iPhone before that day's fix had been stored as the child's photo with the baby in
 * its corner and nothing in its circle (`blankPicture.ts` says how), and every phone in the
 * household drew that circle. Picking again mends it, as the owner found; nobody else should have to
 * find that out.
 *
 * TWO STEPS, both run by `ChildContext`'s one pass over the children:
 *
 *   `lookAtChildPhoto`, ON EVERY PHONE, OFFLINE TOO. What the circle shows is decided once per
 *   version of the picture (the stamp, read as an instant, as the cache reads it) and remembered on
 *   the phone (`child_photo_seen:<child>`), so a picture is read once and never again on a render.
 *   A picture that shows something is drawn as it is. One whose circle is empty is never drawn:
 *   the drawn baby in its corner is drawn in its place, by the app, from its shapes (the same file
 *   a fresh pick of it makes), or, when the corner is not one of the app's babies beyond doubt, the
 *   initial — and the month-day hat sits on that, never on an empty circle.
 *
 *   `mendChildPhoto`, ONCE, FROM A PHONE THAT MAY CHANGE THE PICTURE. The redrawn baby is sent as
 *   the child's photo, exactly as a pick would send it, so the stored picture is right for every
 *   phone, every older build and anything else that reads it. It is careful in three ways:
 *     - only an OWNER or a PARENT sends (`canSetChildPhoto`); every other phone just draws;
 *     - never over another picture: the stamp is read fresh from the server just before, and a
 *       picture that changed since it was judged (the other parent picked a photo) is left alone;
 *     - never in a loop: a version is sent at most `MEND_SENDS` times, a refusal the server would
 *       repeat ends it, one send at a time per version, and what is sent is the app's own drawing,
 *       whose circle is the baby (each of the twenty is judged a picture in `blankPicture.test.ts`),
 *       so the version it makes is remembered as a picture and never mended again.
 *
 * Pure, every effect handed in, so the whole road runs in node against the in-app test backend
 * (`photoMend.test.ts`).
 */
import { childPhotoCacheName } from '@nibblecue/core';
import { z } from 'zod';
import type { ApiFailure, ChildPhotoSaved } from '../auth/providers/types';
import { photoWorthRetrying } from '../onboarding/pending-photo';
import type { KeyValueStore } from '../prefs';
import { BABY_AVATARS, type BabyAvatarDef } from './avatars/art';
import { judgePicture, type Rgb } from './blankPicture';

/** A child as the pass has it: which one, whose, and which version of its picture. */
export interface PhotoChild {
  id: string;
  household_id: string;
  photo_updated_at: string | null;
}

/* ------------------------------------------------------------- what this phone remembers */

const Note = z.object({
  /** The version it is about: the cached file's name, which reads the stamp as an instant. */
  version: z.string().min(1),
  seen: z.enum(['picture', 'blank', 'unread']),
  /** A blank picture's drawn baby, when its corner is one of the app's own (`whichBaby`). */
  baby: z.string().min(1).optional(),
  /** Sends of the redrawn picture tried for this version, and whether the server said no for good. */
  sends: z.number().int().min(0).optional(),
  refused: z.boolean().optional(),
});
export type PhotoNote = z.infer<typeof Note>;

/** Per child and per phone: swept at sign-out and when the household leaves the phone (`prefs`). */
export const photoNoteKey = (childId: string): string =>
  `child_photo_seen:${childId.toLowerCase()}`;

export async function loadPhotoNote(
  store: KeyValueStore,
  childId: string,
): Promise<PhotoNote | null> {
  try {
    const raw = await store.get(photoNoteKey(childId));
    if (raw === null) return null;
    const parsed = Note.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    // a note that cannot be read is a picture judged again: a little work, never a wrong answer
    return null;
  }
}

async function saveNote(store: KeyValueStore, childId: string, note: PhotoNote): Promise<void> {
  try {
    await store.set(photoNoteKey(childId), JSON.stringify(note));
  } catch {
    // unremembered, it is judged again next time
  }
}

const hex = (c: Rgb): string =>
  `#${c.map(v => v.toString(16).padStart(2, '0')).join('')}`.toUpperCase();

/* --------------------------------------------------------------------------- looking */

export interface LookDeps {
  store: KeyValueStore;
  /** The cached file's bytes, or null when it cannot be read. */
  read(uri: string): Promise<Uint8Array | null>;
  /** The drawn baby as a file an avatar can show (`drawnBabyFile`); null when it cannot be made. */
  drawn(def: BabyAvatarDef): Promise<string | null>;
  /** One line for a development build's log. Never a child's name or id. */
  crumb(line: string): void;
}

export interface Look {
  /** What the avatar draws: the picture, the drawn baby, or null for the initial. */
  show: string | null;
  /** The drawn baby shown in place of an empty picture, which `mendChildPhoto` may send. */
  redrawn: BabyAvatarDef | null;
}

/** What one version of one child's picture shows (see the header). Never throws. */
export async function lookAtChildPhoto(
  deps: LookDeps,
  child: PhotoChild,
  uri: string,
): Promise<Look> {
  const version = childPhotoCacheName(child.id, child.photo_updated_at);
  let note = await loadPhotoNote(deps.store, child.id);
  if (note === null || note.version !== version) {
    const bytes = await deps.read(uri).catch(() => null);
    // unread this time: drawn as it is, and not remembered, so the next pass reads it
    if (bytes === null) return { show: uri, redrawn: null };
    const verdict = judgePicture(bytes);
    note = {
      version,
      seen: verdict.kind,
      ...(verdict.kind === 'blank' && verdict.baby !== null ? { baby: verdict.baby.id } : {}),
    };
    await saveNote(deps.store, child.id, note);
    if (verdict.kind === 'blank')
      deps.crumb(
        `photo: a child's picture is one flat color (${hex(verdict.ground)}) in its circle — ${
          verdict.baby === null
            ? 'no drawn baby in its corner; the initial stands in'
            : `the drawn baby "${verdict.baby.id}" in its corner is drawn in its place`
        }`,
      );
    else if (verdict.kind === 'unread')
      deps.crumb(`photo: a child's picture was not judged (${verdict.why}); drawn as it is`);
  }
  if (note.seen !== 'blank') return { show: uri, redrawn: null };
  const baby = BABY_AVATARS.find(b => b.id === note.baby) ?? null;
  if (baby === null) return { show: null, redrawn: null };
  const drawn = await deps.drawn(baby).catch(() => null);
  // a drawing that could not be made is the initial, never the empty circle
  return { show: drawn, redrawn: drawn === null ? null : baby };
}

/* --------------------------------------------------------------------------- mending */

/** The most sends of one version's redrawn picture a phone makes. */
export const MEND_SENDS = 3;

export interface MendDeps {
  store: KeyValueStore;
  /** OWNER or PARENT (`canSetChildPhoto`), who may change the picture; other phones only draw. */
  mayChange: boolean;
  /** The child's stamp on the server now: null for no picture, undefined when it cannot be read. */
  stampNow(childId: string): Promise<string | null | undefined>;
  /** The redrawn picture's bytes, as a pick of that baby sends them; null when they cannot be had. */
  bytes(def: BabyAvatarDef): Promise<Uint8Array | null>;
  upload(
    householdId: string,
    childId: string,
    jpeg: Uint8Array,
  ): Promise<{ ok: true; photo: ChildPhotoSaved } | ApiFailure>;
  /** Into the child-photo cache under the stamp the server wrote (`cacheChildPhoto`). */
  cache(childId: string, updatedAt: string, bytes: Uint8Array): void;
  /** The account read again, so every surface draws the new version. */
  refresh(): Promise<unknown>;
  crumb(line: string): void;
}

export type MendOutcome =
  /** sent: the stored picture is the drawn baby now, for every phone */
  | 'sent'
  /** this phone's person may not change the picture */
  | 'not_theirs'
  /** the picture is not the empty one this phone judged: changed, removed, or already mended */
  | 'moved'
  /** the server's stamp could not be read: no send, and the next pass asks again */
  | 'unsure'
  /** the sends for this version are used up, or the server refused one for good */
  | 'spent'
  /** the server refused, and would again */
  | 'refused'
  /** no network or a server fault: counted, and the next pass tries again */
  | 'retry'
  /** a send for this version is already on its way */
  | 'busy'
  /** the drawing's bytes could not be had */
  | 'no_bytes';

/** One send per version at a time, whatever the passes do meanwhile. */
const sending = new Set<string>();

/** Send the drawn baby in place of an empty stored picture, once (see the header). Never throws. */
export async function mendChildPhoto(
  deps: MendDeps,
  child: PhotoChild,
  baby: BabyAvatarDef,
): Promise<MendOutcome> {
  if (!deps.mayChange) return 'not_theirs';
  const version = childPhotoCacheName(child.id, child.photo_updated_at);
  if (sending.has(version)) return 'busy';
  sending.add(version);
  try {
    const note = await loadPhotoNote(deps.store, child.id);
    if (note === null || note.version !== version || note.seen !== 'blank' || note.baby !== baby.id)
      return 'moved';
    const sends = note.sends ?? 0;
    if (note.refused === true || sends >= MEND_SENDS) return 'spent';
    // NEVER OVER ANOTHER PICTURE: the stamp as the server has it now, not as this phone last read it
    const now = await deps.stampNow(child.id).catch(() => undefined);
    if (now === undefined) return 'unsure';
    if (childPhotoCacheName(child.id, now) !== version) return 'moved';
    const jpeg = await deps.bytes(baby).catch(() => null);
    if (jpeg === null) return 'no_bytes';
    // counted BEFORE the send, so a send that never answers still counts
    await saveNote(deps.store, child.id, { ...note, sends: sends + 1 });
    const r = await deps
      .upload(child.household_id, child.id, jpeg)
      .catch((): ApiFailure => ({ ok: false, status: 0, error: 'network' }));
    if (r.ok) {
      deps.cache(child.id, r.photo.photo_updated_at, jpeg);
      // the version this made is the app's own drawing: a picture, remembered as one
      await saveNote(deps.store, child.id, {
        version: childPhotoCacheName(child.id, r.photo.photo_updated_at),
        seen: 'picture',
      });
      deps.crumb(`photo: the drawn baby "${baby.id}" was sent in place of an empty picture`);
      await deps.refresh().catch(() => undefined);
      return 'sent';
    }
    if (photoWorthRetrying(r.status)) return 'retry';
    await saveNote(deps.store, child.id, { ...note, sends: sends + 1, refused: true });
    deps.crumb(
      `photo: the redrawn picture was refused (${r.status}); it is drawn on this phone only`,
    );
    return 'refused';
  } finally {
    sending.delete(version);
  }
}
