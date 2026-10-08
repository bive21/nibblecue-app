/**
 * EVERY WORD OF "START YOUR OWN FAMILY" (the owner, 2026-10-08; migration 0154; `auth/startFamily.ts`):
 * Family's row, the two ways back out of setup, the two refusals Finish can meet, and what the
 * welcome's button says when the new family cannot come on screen yet. "Family" to people,
 * `household` in the code. Sentence case, US English, no dashes, for a parent at 3 a.m.
 */
import { MAX_HOUSEHOLDS } from '@nibblecue/core';

const entries = (n: number): string => `${n} ${n === 1 ? 'entry' : 'entries'}`;

export const OWN_FAMILY = {
  /** Family's row, in the group with "Join another household". */
  row: 'Start your own family',
  rowDetail: 'Set up a family for a baby of your own',
  rowHint: 'Opens setup. The families you help in stay as they are.',
  /** The heads-up's and the first step's way back to Family: nothing is made. */
  notNow: 'Not now',
  /** Under the heads-up's button, in place of the invite line a first setup has. */
  introNote: 'The families you help in stay as they are. You’re the owner of the new one.',
  /** What Finish says when the server will not make it (0154); nothing was made either way. */
  refused: {
    parentElsewhere:
      'You’re a parent in another family already, and an account can be a parent in one family. ' +
      'Nothing was set up.',
    limit:
      `You’re in ${MAX_HOUSEHOLDS} families already, the most an account can be in. ` +
      'Leave one from Family, then try again. Your answers are kept.',
  },
  /** The welcome's button, when the new family cannot come on screen yet. */
  welcome: {
    owed: (count: number, family: string): string =>
      `${entries(count)} for ${family.trim() || 'the family on screen'} ${
        count === 1 ? 'is' : 'are'
      } still on the way to the server. Your new family opens once ${
        count === 1 ? 'it has' : 'they have'
      } sent. Try again in a moment.`,
    notYet:
      'Your family is set up. It opens as soon as the app can reach the server. Try again in a moment.',
    /** The person is on for the family on screen (2026-10-08): the switcher asks and hands it back. */
    onDuty: (family: string, until: string): string =>
      `Your family is set up. You’re on for ${
        family.trim() || 'the family on screen'
      } until ${until}, so it stays on screen. Switch from Your families when you’re ready.`,
    /** Leaves the welcome for Family; the new family is in Your families. */
    later: 'Back to Family',
  },
} as const;
