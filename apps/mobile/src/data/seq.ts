/**
 * `seq` — the outbox's total order. It lives in `@nibblecue/core` since 2026-09-23
 * (`packages/core/src/sync/local/seq.ts`, which carries why the counter is durable and global).
 */
export { currentSeq, nextSeq, OUTBOX_SEQ_KEY } from '@nibblecue/core';
