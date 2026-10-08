/**
 * WHERE AN ENTRY'S PICTURE COMES FROM, ON THIS PHONE, in the order a screen should try.
 *
 * There are three places it can be, and they are not alternatives — they are the stages of one
 * life, and a screen that checked only the last of them would show nothing for the minutes or
 * hours between a parent picking a photo and the queue carrying it over:
 *
 *   1. **Staged** — picked, prepared, written to the queue directory, not yet uploaded. This is
 *      the one a parent sees immediately after choosing, and the one they keep seeing on a phone
 *      that never finds signal. It is checked FIRST for exactly that reason.
 *   2. **Cached** — fetched once from the bucket and kept under `photo_updated_at`, so a second
 *      look costs nothing and a replaced picture misses the old file rather than showing it.
 *   3. **The bucket** — a signed URL, ten minutes, fetched once and then cached. Only reached
 *      when the row has a path this device has never seen.
 *
 * IT NEVER THROWS AND NEVER REPORTS. A picture that will not load is a placeholder on an entry,
 * not an error a parent can do anything about — the entry, which is the thing that matters, is
 * on screen either way.
 */
import { useEffect, useState } from 'react';
import { cachedEntryPhoto, fetchEntryPhoto } from './entryPhoto';

/** What the caller knows about the entry's picture. */
export interface EntryPhotoRef {
  activityId: string;
  /** The staged file, from `photo_queue`, when one is still waiting. */
  stagedUri: string | null;
  /** The object path, once the queue has stamped the row. */
  photoPath: string | null;
  photoUpdatedAt: string | null;
}

export interface EntryPhotoState {
  /** A local uri to render, or null when there is nothing to show yet. */
  uri: string | null;
  /** True while the bucket is being asked. A spinner is optional; a wrong picture is not. */
  loading: boolean;
  /** True when the picture exists only on this phone so far. */
  pending: boolean;
}

/**
 * Resolve one entry's picture. `signUrl` is the api's `entryPhotoUrl`, passed in rather than
 * imported so this hook has no opinion about which provider is behind it — and so a screen that
 * has no session yet simply passes a function that returns null.
 */
export function useEntryPhoto(
  ref: EntryPhotoRef | null,
  signUrl: (path: string) => Promise<string | null>,
): EntryPhotoState {
  const [uri, setUri] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const activityId = ref?.activityId ?? null;
  const stagedUri = ref?.stagedUri ?? null;
  const photoPath = ref?.photoPath ?? null;
  const photoUpdatedAt = ref?.photoUpdatedAt ?? null;

  useEffect(() => {
    let live = true;
    if (activityId === null) {
      setUri(null);
      setLoading(false);
      return undefined;
    }
    // 1. staged wins outright: it is this parent's own picture, already on the disk
    if (stagedUri !== null) {
      setUri(stagedUri);
      setLoading(false);
      return undefined;
    }
    if (photoPath === null) {
      setUri(null);
      setLoading(false);
      return undefined;
    }
    // 2. the cache, keyed by the stamp, so a replacement never shows the picture it replaced
    const cached = cachedEntryPhoto(activityId, photoUpdatedAt);
    if (cached !== null) {
      setUri(cached);
      setLoading(false);
      return undefined;
    }
    // 3. the bucket, once
    setLoading(true);
    void (async () => {
      const signed = await signUrl(photoPath);
      const local =
        signed === null ? null : await fetchEntryPhoto(activityId, photoUpdatedAt, signed);
      if (!live) return;
      setUri(local);
      setLoading(false);
    })();
    return () => {
      live = false;
    };
    /*
      `signUrl` IS DELIBERATELY NOT A DEPENDENCY. It is a method off a provider object rebuilt on
      every render of the auth context, so depending on it would refetch the picture on every
      keystroke in the sheet the photo sits in. (This note used to end by explaining why there was
      no disable comment: the rule was off, and a directive for a rule nobody enforces is a warning
      of its own. The rule is an error now, so the directive below is the note.)
    */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activityId, stagedUri, photoPath, photoUpdatedAt]);

  return { uri, loading, pending: stagedUri !== null };
}
