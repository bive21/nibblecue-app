/**
 * The milk stash's fixed numbers (docs/MILK_STASH.md). Everything here is bookkeeping — a
 * rounding floor, a "worth suggesting" threshold, the two list bands — and NONE of it is a
 * storage window: every duration a parent reads comes from the versioned guidance profile
 * (`guidance.ts`), never from a constant in code (CLAUDE.md §2 rule 5).
 */
import type { z } from 'zod';
import type { ContainerStatus, StorageKind } from '../domain/domain-types';

export type MilkStorageKind = z.infer<typeof StorageKind>;
export type MilkContainerStatus = z.infer<typeof ContainerStatus>;
export type MilkTxnKind = 'ADD' | 'MOVE' | 'SPLIT' | 'THAW' | 'USE' | 'DISCARD' | 'ADJUST';

/**
 * Below this, what is left in a container is not worth keeping and is written off as an
 * `ADJUST`, so the balance identity still holds and no 2 ml ghosts sit in the stash (§2, §7c).
 */
export const MILK_REMAINDER_FLOOR_ML = 7;

/** A container under this is never SUGGESTED for a bottle; it stays in the list and usable (§6b). */
export const MIN_SUGGEST_ML = 30;

/** The `Use first` net (§6g): frozen within 30 days of best use, everything else within 48 h. */
export const USE_SOON_FROZEN_DAYS = 30;
export const USE_SOON_FRESH_HOURS = 48;

/** The row badge bands (§6g, PRODUCT_SPEC §6.11): `≤7d` critical, `≤30d` warn. */
export const BEST_USE_CRIT_DAYS = 7;
export const BEST_USE_WARN_DAYS = 30;

/** The statuses that count in every total (§2). */
export const IN_STASH_STATUSES: readonly MilkContainerStatus[] = ['STORED', 'THAWING'];

const FROZEN_KINDS: readonly MilkStorageKind[] = ['FREEZER', 'DEEP_FREEZER'];
export const isFrozenKind = (kind: MilkStorageKind): boolean => FROZEN_KINDS.includes(kind);

/** The ledger kinds that never move a balance: −n/+n across two rows, or 0 on one (§9). */
export const NET_ZERO_KINDS: readonly MilkTxnKind[] = ['MOVE', 'THAW', 'SPLIT'];

export const DISCARD_REASONS = [
  'STORAGE_TIME',
  'UNFINISHED',
  'SPILLED',
  'STORAGE_ISSUE',
  'OTHER',
] as const;
export type DiscardReason = (typeof DISCARD_REASONS)[number];

/** §8: neutral labels, exactly as `SHEETS.discard` renders them. */
export const DISCARD_REASON_LABEL: Readonly<Record<DiscardReason, string>> = {
  STORAGE_TIME: 'Storage time',
  UNFINISHED: "Baby didn't finish",
  SPILLED: 'Spilled',
  STORAGE_ISSUE: 'Storage issue',
  OTHER: 'Other',
};

export const CONTAINER_TYPES = ['BAG', 'BOTTLE', 'CONTAINER'] as const;
export type ContainerType = (typeof CONTAINER_TYPES)[number] | 'CUSTOM';
export const CONTAINER_TYPE_LABEL: Readonly<Record<ContainerType, string>> = {
  BAG: 'Bag',
  BOTTLE: 'Bottle',
  CONTAINER: 'Container',
  CUSTOM: 'Other',
};
