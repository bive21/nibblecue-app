/**
 * THE ONE WAY AN ANSWER TO LOG TOGETHER IS WRITTEN on the phone: the card's three answers, and
 * Family's invite (docs/SHARED_CARE.md §6). The preferences on the device, and the change store
 * that tells the card on Today to read it again (`store.ts` says why).
 */
import type { InviteCardAnswer, InviteCardRecord } from '@nibblecue/core';
import { store } from '../data/store';
import { prefsStore } from '../prefs/async-storage';
import { saveInviteCardAnswer } from './store';

export function answerInviteCard(
  userId: string,
  answer: InviteCardAnswer,
  atMs: number = Date.now(),
): Promise<InviteCardRecord> {
  return saveInviteCardAnswer(prefsStore, store, userId, { answer, atMs });
}
