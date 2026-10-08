/**
 * THE FROZEN CONTRACT for `deriveOpId` (`ids.ts`). `app.derive_op` in `0009_add_sync_push.sql`
 * must return these byte for byte (asserted in `packages/db/src/integration/sync-push.test.ts`),
 * and `ids.ts` must keep returning them across every release (`ids.test.ts`). A failure here is
 * never "update the expectation".
 *
 * The two intents are fixed test uuids; the child tags are the twin ids used by the Postgres
 * harness (`packages/db/src/integration/db.ts`), so the same values are quotable on both sides.
 *
 * TEST DATA, SO IT IS REACHED BY ITS OWN PATH (`@nibblecue/core/sync/ids.vectors`) and never
 * through the package's barrel, which Metro bundles whole: it lived in `ids.ts` until 2026-09-26
 * and shipped to every phone from there (`test-support.test.ts` holds it out now).
 */
export interface DeriveOpVector {
  readonly intent: string;
  readonly tag: string;
  readonly id: string;
}

export const DERIVE_OP_VECTORS: readonly DeriveOpVector[] = [
  {
    intent: '5f9a1c3e-8b24-4d7a-9e06-1c2b3a4d5e6f',
    tag: 'use',
    id: '00f6c28a-b00a-5add-bf0a-19746ec79cd7',
  },
  {
    intent: '5f9a1c3e-8b24-4d7a-9e06-1c2b3a4d5e6f',
    tag: 'rem',
    id: 'c5b26947-eb63-5713-b846-faf6d654ed37',
  },
  {
    intent: '5f9a1c3e-8b24-4d7a-9e06-1c2b3a4d5e6f',
    tag: 'adj',
    id: '6955c971-93a4-5bf8-9358-5da776118cb0',
  },
  {
    intent: '5f9a1c3e-8b24-4d7a-9e06-1c2b3a4d5e6f',
    tag: 'undo',
    id: '0d173ae3-97ac-576c-a76e-7432824001b8',
  },
  {
    intent: '5f9a1c3e-8b24-4d7a-9e06-1c2b3a4d5e6f',
    tag: 'add',
    id: 'd5565f13-5c91-5436-a3a9-2c170fd6d106',
  },
  {
    intent: '5f9a1c3e-8b24-4d7a-9e06-1c2b3a4d5e6f',
    tag: 'cccccccc-0000-0000-0000-0000000000e1',
    id: 'a4a2703f-f392-58b2-a353-22f0d4c9e613',
  },
  {
    intent: '5f9a1c3e-8b24-4d7a-9e06-1c2b3a4d5e6f',
    tag: 'cccccccc-0000-0000-0000-0000000000e2',
    id: '330288a4-6d63-5856-b82e-ebba32f4665f',
  },
  {
    intent: '0f8d3b1a-6c45-4e29-8a7b-2d9e5c410f63',
    tag: 'use',
    id: '7c5e8959-1cdd-5637-addc-d4674eb52dc4',
  },
];
