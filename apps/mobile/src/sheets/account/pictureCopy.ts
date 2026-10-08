/**
 * WHAT THE PICTURE SHEET SAYS (the owner, 2026-09-30: *"we want to add the option to upload photo
 * for parent account to"*; migration 0148).
 *
 * Here rather than in the component, for the reason `childPhotoCopy.ts` gives: these strings are a
 * PROMISE (who sees the picture, where it never goes, what choosing the initial does), and a promise
 * only in JSX is one nothing can hold the app to. `memberPicture.test.ts` reads this file.
 */

export const MEMBER_PICTURE_COPY = {
  title: 'Your picture',
  /** Account & privacy's row, and what it says the picture is now. */
  row: 'Profile picture',
  rowPhoto: 'Your photo',
  rowDrawing: 'A drawing',
  rowInitial: 'Your initial',
  rowHint: 'Opens your picture',
  /** The sheet's heading beside the big preview. */
  showsPhoto: 'Your photo is showing',
  showsDrawing: 'A drawing is showing',
  showsInitial: 'Your initial is showing',
  lede: 'Everyone in your household sees it on their own phone, in place of your initial.',
  choose: 'Choose a photo',
  take: 'Take a photo',
  change: 'Change your picture',
  useInitial: 'Use your initial',
  saving: 'Saving…',
  saved: 'Picture saved',
  initialBack: 'Your initial is back',
  /** A change kept on this phone while there is no network: it is sent on its own. */
  savedHere: 'Saved on this phone. Your household sees it once you are back online.',
  waiting: 'Waiting for a connection to share it with your household.',
  /**
   * THE PROMISES, in the order a person worries about them: who sees it, where it never goes, and
   * what the initial does to a photo (the server deletes the file: `clearMemberPicture`).
   */
  privacy:
    'Your picture is stored for your household only and is never shown outside it. Going back ' +
    'to your initial deletes a photo.',

  /* -------------------------------------------------------------------- the drawings */

  /** The minimal, universal set: a woman and a man for each of five backgrounds (`adults.ts`). */
  drawings: 'Or choose a drawing',
  /**
   * What a screen reader says for each: woman or man, the skin tone in the words the Unicode
   * skin-tone modifiers use (as the babies' set says it), then the hair — what a sighted person
   * sees, in that order.
   */
  drawing: (gender: string, tone: string, look: string): string =>
    `Illustrated ${gender}, ${tone} skin tone, ${look}`,

  /* ------------------------------------------------------------ when it does not work */

  deniedLibrary: 'Photo access is off for this app. You can turn it on in your phone’s settings.',
  deniedCamera: 'Camera access is off for this app. You can turn it on in your phone’s settings.',
  unreadable: 'That image could not be read. Try another one.',
  tooLarge: 'That photo is too large to save. Try another one.',
  failed: 'Could not save your picture. Please try again.',
} as const;

/** The sentence for a refusal the server would repeat, by status. */
export function memberPictureFailure(status: number | undefined): string {
  if (status === 413) return MEMBER_PICTURE_COPY.tooLarge;
  return MEMBER_PICTURE_COPY.failed;
}
