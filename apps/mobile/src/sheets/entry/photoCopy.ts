/**
 * The words the entry-photo control uses. One file, because these are the strings a device pass
 * rewrites and a screen is the wrong place to hunt for them (the same reason `childPhotoCopy.ts`
 * exists next door).
 *
 * THEY NEVER NAME WHAT THE PICTURE IS OF. "A photo of the rash", "show your doctor" and anything
 * else that describes a baby's condition is rule 3's territory — the app records what a parent
 * chose to record and says nothing about it. So the copy is about the CONTROL: add one, replace
 * it, remove it, and where it is while it waits.
 */
export const ENTRY_PHOTO_COPY = {
  label: 'Photo',
  none: 'No photo',
  add: 'Add a photo',
  change: 'Replace',
  remove: 'Remove',
  take: 'Take a photo',
  choose: 'Choose a photo',
  /** While the queue still has it. It is on the phone and it is not lost; it is not shared yet. */
  pending: 'On this phone until it uploads',
  saving: 'Preparing…',
  /** The gate's one line. It says what Plus gives, never what free is missing. */
  locked: 'Photos on entries are part of Plus',
  /*
    THE PRODUCT NAME IS NOT IN THESE SENTENCES, and `brand.test.ts` is what stopped the version
    that had it. Brand values are read from `assets/brand.json`, never typed (CLAUDE.md §1) —
    and in a permission message the name is not even needed: the parent is looking at this app's
    own screen, so "this app" is unambiguous and one word shorter at 3 a.m. Same wording as
    `childPhotoCopy.ts`, which reached it first.
  */
  deniedCamera: 'Camera access is off for this app. You can turn it on in your phone’s settings.',
  deniedLibrary: 'Photo access is off for this app. You can turn it on in your phone’s settings.',
  unreadable: 'That photo could not be read. Try another one.',
  added: 'Photo added',
  removed: 'Photo removed',
} as const;
