/**
 * The per-household, per-table pull cursor. It lives in `@nibblecue/core` since 2026-09-23
 * (`packages/core/src/sync/local/cursors.ts`, which carries the whole argument for the rewind),
 * so the round-trip test in `packages/db` advances a cursor with the same code the app does.
 */
export {
  clearCursors,
  cursorPhases,
  isDrained,
  phaseMark,
  readCursor,
  readCursors,
  rewound,
  sinceFor,
  writeCursor,
} from '@nibblecue/core';
