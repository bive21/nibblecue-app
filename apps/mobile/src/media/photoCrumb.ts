/**
 * A PICTURE THAT WOULD NOT DRAW, IN THE BOOT LOG (2026-09-29). The design system falls back to the
 * initial when a picture fails and reports it through one hook (`packages/ui` `photoTrouble.ts`);
 * `App.tsx` installs this as that hook, so the Metro terminal of a development build says which
 * circle gave up, where its picture lives and what the phone said. The owner reported an empty
 * circle twice before anyone could name a cause; the next report carries one.
 *
 * Only where and why: `photoPlace` has already left out the file's name and any signed link's
 * token, and `crumb` writes nothing outside a development build.
 */
import type { PhotoTrouble } from '@nibblecue/ui';
import { crumb } from '../app/boot';

/** One line: which component, the picture's place, and the phone's own words. */
export const photoTroubleLine = (t: PhotoTrouble): string =>
  `photo: ${t.where} could not draw the picture at ${t.place} — ${t.error}; the initial stands in`;

export function crumbPhotoTrouble(t: PhotoTrouble): void {
  crumb(photoTroubleLine(t));
}
