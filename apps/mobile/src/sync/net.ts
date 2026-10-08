/**
 * Connectivity for the outbox worker, behind `packages/core`'s two-method `Net`.
 *
 * WHY A SECOND NETINFO SUBSCRIPTION IS CORRECT HERE, AND WHY IT MUST NOT DO MORE.
 * `auth/AuthContext.tsx:258-276` already owns one, and it owns one job the sync layer must never
 * take over: mirroring the phone's connectivity into `providers.mock.online`, so the fake auth
 * server is unreachable exactly when the phone is. That line stays where it is. Reaching into it
 * from here — or setting `providers.mock.online` from this file — would give two owners to one
 * piece of state and make "why did the mock come back online?" unanswerable.
 *
 * What this file owns is different and narrower: *is there a connection right now*, and *tell me
 * when one comes back*. `useAuth().online` cannot answer either — it is session reachability
 * (`AuthContext.tsx:361`), which is false while a token refresh is failing on a perfectly good
 * connection, and true for a while after the connection has gone. An outbox that flushed on that
 * signal would sit still with a working network and hammer a dead one.
 *
 * `isConnected()` is a fresh `fetch()` rather than a cached flag, because the answer is read at
 * the top of every flush pass and a stale "connected" costs a round trip that then has to be
 * classified, backed off and retried.
 */
import NetInfo from '@react-native-community/netinfo';
import type { Net } from '@nibblecue/core';

export type { Net };

/**
 * `state.isConnected` is `boolean | null`; null means "not known yet". Treating an unknown as
 * connected is the right default for a queue: the worst case is one request that fails and backs
 * off, where the opposite default is a queue that never tries at all.
 */
const connected = (isConnected: boolean | null): boolean => isConnected !== false;

export function createNet(): Net {
  return {
    async isConnected(): Promise<boolean> {
      const state = await NetInfo.fetch();
      return connected(state.isConnected);
    },

    /**
     * Fires on the EDGE, not on every event. NetInfo emits on any change of type, strength or
     * reachability, and a flush per emission would turn a train journey into a retry storm.
     */
    onReconnect(cb: () => void): () => void {
      let wasConnected = true;
      return NetInfo.addEventListener(state => {
        const now = connected(state.isConnected);
        if (now && !wasConnected) cb();
        wasConnected = now;
      });
    },
  };
}
