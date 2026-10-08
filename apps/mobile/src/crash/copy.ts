/**
 * What the error page says (docs/CRASH_REPORTS.md §3; docs/DESIGN_SYSTEM.md §9: an error says what
 * happened and what the app is doing about it). A parent at 3 a.m. reads it, probably holding a
 * baby: what matters is that nothing they logged is gone, and that one button might fix it. Plain,
 * sentence case, no dashes, nothing technical on the page itself.
 */
export const CRASH_COPY = {
  title: 'Something went wrong',
  body: 'Nothing you logged is lost. Every entry is saved on this phone first, so it is still here.',
  next: 'Try again. If this page comes back, close the app and open it again.',
  retry: 'Try again',
  copy: 'Copy the details',
  copied: 'Copied',
} as const;
