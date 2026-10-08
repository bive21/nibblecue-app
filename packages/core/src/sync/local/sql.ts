/**
 * THE SQL SURFACE THE SYNC ENGINE NEEDS, and nothing more: three statements inside a transaction
 * the caller already holds.
 *
 * The app's `Tx` (`apps/mobile/src/db/driver.ts`, over expo-sqlite) and the node:sqlite adapters
 * the tests use both fit it as they are, which is the point: `upsertRow`, the cursor and the
 * apply engine in this folder are written once and run on the phone and against the real server
 * in `packages/db`'s round-trip test alike.
 */

/** The three types a local column can hold (WP4 D31): text, integer or real, or null. */
export type SqlValue = string | number | null;

export interface SqlTx {
  run(sql: string, params?: SqlValue[]): Promise<{ changes: number }>;
  all<T>(sql: string, params?: SqlValue[]): Promise<T[]>;
  get<T>(sql: string, params?: SqlValue[]): Promise<T | undefined>;
}
