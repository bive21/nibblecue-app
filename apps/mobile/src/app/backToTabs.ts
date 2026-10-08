/**
 * HOW ANYTHING GOES TO A TAB: `nav.navigate('Tabs', { screen }, BACK_TO_TABS)`.
 *
 * React Navigation 7 changed `navigate`: to a route that is in the stack but not on top, it PUSHES
 * a new one, where 6 went back to it. Every door to a tab that can be used while a page is pushed
 * over the tabs — a deep link, a reminder's response, the celebration sheet, Supplies' shopping
 * list button — laid a second tab navigator over that page: a second tab bar, a back gesture that
 * returned to the page under it, and a first-run tour that counted a page that was not there (the
 * owner, 2026-09-25: "it still says go back to schedule … when im already in the schedule page";
 * `tour/pagesOver.ts`). `pop` asks for the Tabs already in the stack and pops whatever is above
 * it; from a tab, where there is nothing to pop, it is the plain switch it always was.
 *
 * `tour/pagesOver.test.ts` runs the real router both ways with this object, and
 * `backToTabs.test.ts` holds every `navigate('Tabs'` in the app to it.
 */
export const BACK_TO_TABS = { pop: true } as const;
