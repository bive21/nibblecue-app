/**
 * THE ENTRIES THAT HAVE A PICTURE — the growth gallery's one query (`entryPhotos`).
 *
 * IT DOES NOT GO THROUGH `timelineRows`, and that is deliberate rather than lazy. The timeline
 * read model is on every screen in the app and is read dozens of times a minute while a parent
 * scrolls Today; widening it with two columns only one surface wants would make every one of
 * those reads carry them. This is a narrow query for a narrow screen.
 *
 * IT UNIONS THE ROW WITH THE QUEUE, which is the whole reason it is not a one-line select. A
 * picture lives in `photo_queue` from the moment it is picked until the next flush carries it
 * over (`data/entryPhotos.ts`), and a gallery that read `activities.photo_path` alone would
 * have nothing to show for the minutes after a parent adds one — which is exactly when they
 * open it to look.
 */
import type { Db } from '../driver';
import type { SqlValue } from '../driver';

export interface GalleryItem {
  activityId: string;
  /** ISO, newest first. */
  startAt: string;
  photoPath: string | null;
  photoUpdatedAt: string | null;
  /** The staged file, when this device still holds one for the entry. */
  stagedUri: string | null;
}

export interface GalleryRequest {
  householdId: string;
  /** null means the household's own entries as well as every child's. */
  childId: string | null;
  /** One activity type, because a gallery belongs to the surface that shows it. */
  type: string;
  limit: number;
}

interface GalleryRowRaw {
  id: string;
  start_at: string;
  photo_path: string | null;
  photo_updated_at: string | null;
  local_uri: string | null;
}

export async function galleryRows(db: Db, req: GalleryRequest): Promise<GalleryItem[]> {
  const params: SqlValue[] = [req.householdId, req.type];
  let scope = '';
  if (req.childId !== null) {
    scope = ' and a.child_id = ?';
    params.push(req.childId);
  }
  params.push(req.limit);
  const rows = await db.all<GalleryRowRaw>(
    `select a.id, a.start_at, a.photo_path, a.photo_updated_at, q.local_uri
       from activities a
       left join photo_queue q on q.activity_id = a.id and q.state != 'FAILED'
      where a.household_id = ? and a.type = ? and a.deleted_at is null${scope}
        and (a.photo_path is not null or q.local_uri is not null)
      order by a.start_at desc, a.id desc
      limit ?`,
    params,
  );
  return rows.map(r => ({
    activityId: r.id,
    startAt: r.start_at,
    photoPath: r.photo_path,
    photoUpdatedAt: r.photo_updated_at,
    stagedUri: r.local_uri,
  }));
}
