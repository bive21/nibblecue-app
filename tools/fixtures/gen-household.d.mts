/**
 * Types for `gen-household.mjs`, so the node budget test can import the generator under
 * `strict` + `noUncheckedIndexedAccess` without the generator itself becoming TypeScript.
 *
 * The generator stays plain ESM because the Postgres half of the budget loads its output through
 * `psql` in CI, where there is no TypeScript at all; this file is the seam that lets the SQLite
 * half import the same rows instead of keeping a second copy of the household.
 */

/** A row in server shape: column name to value, exactly as `sync_pull` would hand it over. */
export type FixtureRow = Record<string, unknown>;

export interface FixtureMeta {
  children: number;
  activities: number;
  containers: number;
  ledger: number;
  rules: number;
  instances: number;
  household_id: string;
  owner_id: string;
  epoch: string;
  end: string;
  /** The cursor a "typical 24 h delta" starts from. */
  delta_since: string;
}

export interface Household {
  meta: FixtureMeta;
  activities: FixtureRow[];
  details: Record<string, FixtureRow[]>;
  containers: FixtureRow[];
  ledger: FixtureRow[];
  rules: FixtureRow[];
  instances: FixtureRow[];
}

export interface FixturePage {
  name: string;
  rows: FixtureRow[];
  next_cursor: { updated_at: string; id: string } | null;
  has_more: boolean;
}

export interface FixturePageSet {
  meta: FixtureMeta;
  pages: FixturePage[];
}

export declare function buildHousehold(): Household;
export declare function toPages(house: Household): FixturePageSet;
export declare function toSql(house: Household): string;
export declare function uuid5(namespace: string, name: string): string;

export declare const COUNTS: {
  children: number;
  activities: number;
  containers: number;
  ledger: number;
  rules: number;
  instances: number;
};

export declare const IDS: {
  household: string;
  owner: string;
  partner: string;
  location: string;
  child: string[];
  phase: string[];
};

export declare const EPOCH: number;
export declare const END: number;
export declare const DAYS: number;
