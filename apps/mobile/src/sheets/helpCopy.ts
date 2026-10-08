/**
 * HELP'S WORDS, in a file of their own so a test can read them without loading React Native
 * (`HelpSheet.tsx` re-exports them). NibbleCue's Help is the published guidance for this baby's
 * age and a way to reach the studio (docs/PRODUCT.md §More).
 */
export const HELP = {
  rowTitle: 'Help and guides',
  rowDetail: 'Published guidance, and how to reach us',
  title: 'Help and guides',
  guides: 'Guides for this age',
  contact: 'Email us',
  contactDetail: 'We read every message',
  notMedical:
    'General guidance, not medical advice. Follow your pediatrician’s advice for your baby.',
} as const;
