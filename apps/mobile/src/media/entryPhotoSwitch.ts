/**
 * ENTRY PHOTOS ARE OFF FOR NOW, and this is the one switch every photo door reads.
 *
 * The owner, 2026-09-26: *"in log records, i see taht user can add photo, why? we dont want to
 * store too many pictures, i think this need to be disabled for now, as we dont want too much
 * user storage too"*. A photo on an entry, and the growth gallery built from those photos, were
 * the one Plus feature with a storage bill per household (`entryPhotos` in the plan matrix).
 *
 * THE SWITCH IS THE MATRIX LINE, NOT A SECOND FLAG BESIDE IT. `off` on `entryPhotos` in the plan
 * matrix (`assets/entitlements.ts`, mirrored in `packages/core/src/plan/entitlements.ts`) turns it
 * off, and this constant is read from that line. So the lists that sell Plus (the gate sheet, the
 * Plan page, `pricing.config.json`) and the screens below cannot disagree about whether the
 * feature exists: there is one answer, in the one table that decides what each plan gets.
 *
 * WHAT "OFF" MEANS, door by door:
 *   - The entry editor draws no photo row (`sheets/entry/EntryPhotoRow.tsx`): nothing to choose,
 *     take or replace, and no locked chip either, because a lock advertises what it guards.
 *   - The growth history draws no gallery strip (`history/GrowthGallery.tsx`), and the gallery
 *     query does not run (`history/useGallery.ts`).
 *   - Nothing uploads a picture. The sync engine is handed no bucket (`sync/SyncProvider.tsx`),
 *     so the upload queue is never drained: "a build without it simply does not drain", in the
 *     engine's own words (`SyncEngineDeps.photoApi`).
 *
 * WHAT "OFF" LEAVES ALONE, on purpose: the data and the plumbing. `activities.photo_path` and
 * `photo_updated_at` still sync and are still in the free download; the bucket, its policies and
 * migration 0102 stay; deleting a household still queues its `entry-photos` folder for the purge
 * (migration 0110). A picture a household added while the feature was on stays stored, is not
 * shown, and is deleted with the household; it is on screen again when the switch comes back. A
 * picture an older build queued and never sent waits on that phone until then.
 *
 * BRINGING IT BACK: delete the `off` line on `entryPhotos` in both copies of the matrix, run
 * `node assets/gen-pricing.mjs` and `node tools/gen-pricing.mjs`, and put back the words taken
 * out of the store listing (both copies), the website preview's plan list and the docs marked
 * "off for now". `entryPhotoSwitch.test.ts` stops requiring their absence by itself.
 */
import { FEATURES } from '@nibblecue/core';

export const ENTRY_PHOTOS_ENABLED: boolean = FEATURES.entryPhotos.off === undefined;
