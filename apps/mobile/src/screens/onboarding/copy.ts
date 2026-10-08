/**
 * The words of NibbleCue's setup: a new parent's first family (the baby), then the food setup
 * every baby gets once (docs/PRODUCT.md, "Setup"). Plain, short, sentence case, US English, no
 * dashes in a sentence; `copy.test.ts` holds them to it.
 */
export const ONBOARD_YOU = {
  eyebrow: 'Hello',
  title: 'You and your baby',
  blurb:
    'Tell us a little about you and your baby. If you use CuddleCue, sign in with that account instead and your family is already here.',
  name: 'Your name',
  namePlaceholder: 'What would you like us to call you?',
  haveCode: 'I have an invite code',
  babyName: 'Your baby’s name',
  babyNamePlaceholder: 'First name or a nickname',
  birthDate: 'Date of birth',
  role: 'You are',
  create: 'Next',
  creating: 'Setting up your family…',
} as const;

/** Adding a baby who is not here yet (CuddleCue's setup words, used by the Add a child sheet). */
export const ONBOARD_EXPECTING = {
  question: 'Is your baby here yet?',
  born: 'Yes',
  expecting: 'Not yet',
  namePlaceholder: 'If you have one',
  dueDate: 'Due date',
} as const;
