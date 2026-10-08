/**
 * THE DEVICE'S HALF OF SYNC THAT IS PLAIN SQL: the local schema, writing one row, the pull
 * cursor and the apply engine. Moved here from `apps/mobile/src/{db,data,sync}` (2026-09-23) so
 * the app and `packages/db`'s round-trip test run one copy of it against the real server.
 *
 * It touches SQLite only through the three-method `SqlTx` the caller hands in, and imports no
 * driver: expo-sqlite stays in the app, node:sqlite stays in the tests.
 */
export * from './sql';
export * from './schema';
export * from './mirror';
export * from './seq';
export * from './outbox';
export * from './pull';
export * from './cursors';
export * from './apply';
