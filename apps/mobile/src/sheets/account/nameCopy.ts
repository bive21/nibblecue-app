/**
 * Changing the name on Account & privacy. The rule and the failure are the join confirmation's
 * own (`JoinedScreen` `NAME_RULE`, `JOIN.joined`), so a name is refused in one sentence wherever
 * it is typed. The help line is what that page already tells a joiner.
 */
export const YOUR_NAME = {
  title: 'Your name',
  label: 'Your name',
  help: 'This is what everyone in the household sees on the entries you log.',
  rule: 'Your name, so entries are attributed. 2 to 40 characters, no links.',
  save: 'Save',
  saved: 'Name saved.',
  failed: 'Your name was not saved. Check your connection, then try again.',
} as const;
