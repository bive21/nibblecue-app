/**
 * The one write an in-app message has: a parent's answer (docs/IN_APP_MESSAGES.md §3).
 *
 * It goes through the outbox like every other write, so it lands with no network and reaches
 * the other devices on the next push — which is the whole of §7's "the dismissal survives a
 * reinstall": the row is on the server, and the pull carries it back on the message itself.
 *
 * NO UNDO. Every other write in this app offers one; this one must not. A parent who dismissed
 * a card has finished with it, and an app that offered to bring it back would be arguing.
 */
import { messageDismissalChain, type Clock, type DismissalAction } from '@nibblecue/core';
import type { Db } from '../db/driver';
import type { WriteContext } from './activities';
import { newIntentId } from './ids';
import { commitWrite, type RepositoryDeps, type WriteOutcome } from './repository';

export interface AnswerMessageInput extends WriteContext {
  messageId: string;
  action: DismissalAction;
  /** The build this phone is running, kept locally so `Later` can end on the next version. */
  appVersion?: string | null;
}

export async function answerMessage(
  db: Db,
  clock: Clock,
  input: AnswerMessageInput,
  deps: RepositoryDeps = {},
): Promise<WriteOutcome> {
  const intentId = newIntentId();
  const at = clock.iso();
  const chain = messageDismissalChain({
    intentId,
    householdId: input.householdId,
    createdBy: input.createdBy,
    deviceId: input.deviceId,
    clientEditedAt: at,
    messageId: input.messageId,
    action: input.action,
  });
  chain.rows[0] = {
    table: 'app_message_dismissals',
    row: { ...chain.rows[0]?.row, app_version: input.appVersion ?? null },
  };
  return commitWrite(db, clock, { intentId, chain, source: input.source, invalidates: [] }, deps);
}
