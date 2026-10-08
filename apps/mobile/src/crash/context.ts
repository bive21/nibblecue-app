/**
 * WHAT A CRASH REPORT IS ALLOWED TO KNOW ABOUT THE MOMENT, kept where the recorder can reach it
 * without a provider: a crash can come from anywhere, the providers included, so nothing here is
 * read through React.
 *
 *   · the screen: the navigator's current route name, set by the container (`App.tsx`)
 *   · the names to scrub: the account's own, its families' and its babies' (`useCrashReports`),
 *     never sent, only taken out of what is (`@nibblecue/core` `scrubText`)
 */
let route: string | null = null;
let names: readonly string[] = [];

export function noteCrashRoute(name: string | null | undefined): void {
  route = typeof name === 'string' && name !== '' ? name : null;
}

export function noteCrashNames(next: readonly string[]): void {
  names = next.filter(n => typeof n === 'string' && n.trim() !== '');
}

export const crashRoute = (): string | null => route;
export const crashNames = (): readonly string[] => names;
