/**
 * The two words the pull's cursor and apply are written in, moved here with them from
 * `apps/mobile/src/sync/tables.ts` (which re-exports them and keeps the table list itself).
 */

/** Which pass a table belongs to. Ordered: bootstrap is awaited, the other two are not. */
export const PULL_PHASES = ['bootstrap', 'recent', 'backfill'] as const;
export type PullPhase = (typeof PULL_PHASES)[number];

/**
 * How a `full` page's replace is scoped.
 *
 *   `household`  every row of this household — `household_id = ?`.
 *   `user`       the viewer's own rows, which is what the policy returned. `favorites_read` is
 *                `app.is_member(household_id) and (user_id is null or user_id = auth.uid())`,
 *                and `subscription_entitlements` is the caller's row with **no** household
 *                filter at all (`0010`: the row may carry a null `household_id`).
 *   `global`     not scoped by household or viewer; absence never means removal.
 */
export type PullScope = 'household' | 'user' | 'global';
