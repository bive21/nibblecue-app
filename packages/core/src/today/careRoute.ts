/**
 * How a medicine, vitamin or cream is given — the one closed vocabulary on a care item, and
 * the words for it. Here rather than in the app because the pediatrician summary
 * (`reports/visitSheet.ts`) has to say the same words, and it is pure TypeScript.
 *
 * THE THREE A PARENT CAN PICK (the owner, 2026-09-19: "options for vitamins or medications
 * should be: Oral, with milk/food, on skin"), in that order:
 *
 *   MOUTH      Oral             swallowed on its own
 *   WITH_FOOD  With milk/food   mixed into a bottle or a meal — new with that decision
 *   SKIN       On skin
 *
 * `OTHER` IS STILL A VALUE AND NO LONGER A CHOICE. It was the third option before the decision
 * and is the column's default on both stores (`care_route`, `care_items.route`, migration
 * 0001), so a row may carry it: an item saved by an earlier build, or one whose kind is "Other"
 * and whose route was never picked. Nothing rewrites those rows (CLAUDE.md §7). The value
 * stays, the form shows the three options with none chosen until the parent picks one, and a
 * page that would say it says nothing — `OTHER` means "did not say", and there is no honest
 * word for that beside an amount. `CareRouteSchema` accepts it for exactly that reason;
 * `CARE_ROUTES`, what a control offers, does not carry it.
 *
 * The stored tokens stay `MOUTH` and `SKIN` rather than being renamed to match the labels:
 * they are on the wire and in every household's rows already, and the label is the thing that
 * changed. A label is read from here, never derived from the token.
 */
import { z } from 'zod';

/** Every value a stored `route` may hold, including the one no control offers. */
export const CareRouteSchema = z.enum(['MOUTH', 'WITH_FOOD', 'SKIN', 'OTHER']);
export type CareRoute = z.infer<typeof CareRouteSchema>;

/** What a control offers, in the owner's order. */
export const CARE_ROUTES = ['MOUTH', 'WITH_FOOD', 'SKIN'] as const satisfies readonly CareRoute[];
export type OfferedCareRoute = (typeof CARE_ROUTES)[number];

/** The words for each offered value — sentence case, as a chip shows them. */
export const CARE_ROUTE_LABEL: Record<OfferedCareRoute, string> = {
  MOUTH: 'Oral',
  WITH_FOOD: 'With milk/food',
  SKIN: 'On skin',
};

const OFFERED = new Set<string>(CARE_ROUTES);

/**
 * The words for a stored route, at the read edge: an offered value gives its label; `OTHER`,
 * null, empty and any token this build does not know give null, so a token never reaches a
 * page and "did not say" is said by saying nothing.
 */
export function careRouteLabel(route: string | null | undefined): string | null {
  return typeof route === 'string' && OFFERED.has(route)
    ? CARE_ROUTE_LABEL[route as OfferedCareRoute]
    : null;
}
