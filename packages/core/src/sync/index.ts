/**
 * The pure half of the offline sync layer: wire types, constants, derived ids, the retry
 * schedule, batch selection, the duplicate guard, field and timer merges, the overdraw rewrite
 * and the chain builders — and, in `./local`, the local schema, the row upsert, the pull cursor
 * and the apply engine, as SQL over a transaction the caller hands in.
 *
 * Everything here runs in node, in the admin console and in a worker, with clocks and storage
 * injected. Anything that opens a database, touches the network or draws a screen lives in
 * `apps/mobile/src/{db,data,sync}` instead (CLAUDE.md §5, enforced by `src/boundaries.test.ts`).
 *
 * NOT HERE: the shared scenario table (`./scenarios`, the §9 matrix as data). Only the two test
 * suites that run it read it, and they import it as `@nibblecue/core/sync/scenarios`. Metro
 * bundles every module a barrel names, used or not, so re-exported from here it shipped 17 KB of
 * test fixtures to every phone (2026-09-26; `src/test-support.test.ts` keeps it out).
 */
export * from './types';
export * from './constants';
export * from './ids';
export * from './backoff';
export * from './batch';
export * from './dedupe';
export * from './merge';
export * from './timers';
export * from './overdraw';
export * from './chains';
export * from './local';
