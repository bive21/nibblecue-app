/**
 * WHAT THE PHOTO SHEET SAYS (the owner, 2026-09-20: *"Also add the feature to add baby's picture
 * saved to everyone in household"*).
 *
 * Here rather than in the component for the reason §21 gives: a screen is not the place a string
 * is decided, and these particular strings are a PROMISE — where the picture goes, who sees it,
 * what removing it does. A promise that is only in JSX is a promise nothing can hold the app to,
 * so `childPhoto.test.ts` reads this file and checks that the four facts docs/MEDIA.md §1 commits
 * to are all actually said.
 */

/**
 * The sheet's title: the child's name. The photo, the name and the date of birth all live here
 * (the owner, 2026-10-03), so the title is the child and not only the picture.
 */
export const childPhotoTitle = (name: string): string =>
  name.trim() === '' ? 'Child' : name.trim();

/** The name and the date of birth, on the same sheet as the picture. */
export const CHILD_DETAILS = {
  name: 'Name',
  birth: 'Date of birth',
  save: 'Save',
  saving: 'Saving…',
  saved: 'Saved',
  nameNeeded: 'Give the baby a name.',
  nameLong: 'A name can be 40 characters.',
  birthNeeded: 'Pick a date of birth.',
  birthFuture: 'A date of birth cannot be in the future.',
  birthTooOld: 'This app is for the first years. That date is more than eight years ago.',
  birthWindow: 'A due date is within a year of the birth date.',
  /** A baby on the way has no date of birth yet. The birth itself is Today's card. */
  expectingBirth: 'The date of birth is set when the baby is here, from Today.',
  forbidden: 'Only a parent or the owner can change this.',
  offline: 'Could not reach the server. Nothing was saved. Try again when you are online.',
  failed: 'Could not save that. Please try again.',
} as const;

const DETAIL_REASON: Record<string, string> = {
  too_small: CHILD_DETAILS.nameNeeded,
  too_big: CHILD_DETAILS.nameLong,
  future: CHILD_DETAILS.birthFuture,
  too_old: CHILD_DETAILS.birthTooOld,
  invalid: CHILD_DETAILS.birthNeeded,
  'due_date.window': CHILD_DETAILS.birthWindow,
};

export function childDetailFailure(status: number): string {
  if (status === 403) return CHILD_DETAILS.forbidden;
  if (status === 0 || status >= 500) return CHILD_DETAILS.offline;
  return CHILD_DETAILS.failed;
}

export function childDetailReason(reason: string): string {
  return DETAIL_REASON[reason] ?? CHILD_DETAILS.failed;
}

export const CHILD_PHOTO_COPY = {
  set: 'Profile photo set',
  none: 'Add a profile photo',
  lede: 'One photo per child. Everyone in your household sees it on their own phone.',
  choose: 'Choose a photo',
  take: 'Take a photo',
  change: 'Change photo',
  remove: 'Remove photo',
  saving: 'Saving…',
  removing: 'Removing…',
  saved: 'Photo saved. Everyone in your household will see it.',
  removed: 'Photo removed',
  /**
   * THE FOUR PROMISES, in the order a parent worries about them (docs/MEDIA.md §1, and the
   * prototype's own hint under this form). Household only · never in the community · widgets
   * keep the initial so a locked screen shows no picture of a baby · removing deletes the file.
   */
  privacy:
    'The photo is stored for your household only and is never used for anything else. ' +
    'Removing it deletes the file.',
  /** A caregiver sees the picture and no buttons — the same boundary the server enforces. */
  readOnly: 'A parent or the owner can change this.',

  /* ---------------------------------------------------- the pre-made babies (2026-09-24) */

  /**
   * THE OTHER WAY TO GIVE A BABY A FACE (the owner: *"a few pregenerated baby pictures, of all
   * race"*). For a household that would rather not upload a photo of their baby at all, and for
   * one that has not taken the right photo yet. `media/avatars/AvatarGrid.tsx` draws them.
   */
  illustrations: 'Or choose an illustration',
  /**
   * What a screen reader says for each one: girl or boy, the skin tone in the words the Unicode
   * skin-tone modifiers use (the words a screen reader already reads for an emoji), then the hair,
   * the hat or the bow — what a sighted parent sees, in that order.
   */
  illustration: (gender: string, tone: string, look: string): string =>
    `Illustrated baby ${gender}, ${tone} skin tone, ${look}`,
  illustrationFailed: 'That picture could not be made on this phone. Try another one.',

  /* ------------------------------------------------------------------ when it does not work */

  /**
   * THESE TWO NAMED THE PRODUCT, AND NOTHING IN THE APP MAY (CLAUDE.md §1: the name is read
   * from `brand.json` or it is not written at all, and `placement.test.ts` fails the build
   * either way — first for the literal, then for reading the display name on a surface
   * BRANDING.md §2 does not list). A permission message is not one of those surfaces, and it
   * does not need to be: the reader is already inside the app, so "this app" is both true and
   * the only thing they need to find the right row in their phone's settings.
   */
  deniedLibrary: 'Photo access is off for this app. You can turn it on in your phone’s settings.',
  deniedCamera: 'Camera access is off for this app. You can turn it on in your phone’s settings.',
  forbidden: 'Only a parent or the owner can change the photo.',
  offline: 'Could not reach the server. The photo is not saved. Try again when you are online.',
  failed: 'Could not save the photo. Please try again.',
  unreadable: 'That image could not be read. Try another one.',
} as const;

/**
 * The sentence for an API refusal, by status. The same three cases `AddChildSheet` distinguishes
 * between, and for the same reason: "forbidden" and "no network" are different problems and only
 * one of them is worth trying again in a minute.
 */
export function childPhotoFailure(status: number): string {
  if (status === 403) return CHILD_PHOTO_COPY.forbidden;
  if (status === 0 || status >= 500) return CHILD_PHOTO_COPY.offline;
  return CHILD_PHOTO_COPY.failed;
}
