/**
 * The storage locations every household starts with (docs/ACCOUNTS.md §5 step 9;
 * `bootstrap_household`; `seed/dev.sql` keeps its own fixed sample). ONE LIST FOR EVERY WRITER:
 * the server writes it when the household is created, the in-app server does the same, and the
 * phone writes it too when setup finishes before the first pull has arrived — so a parent's
 * first pump session has somewhere to go before they have thought about freezers.
 *
 * THE OWNER'S FOUR (2026-09-17: *"the milk stash should have a preset location options: Kitchen
 * Freezer, Refrigerator, Counter (room temperature), and deep freeze"*). Until 2026-09-24 only the
 * phone wrote these; the server and the in-app server still wrote an older four (a garage chest
 * freezer and a thawing shelf), so which list a new household got depended on whether setup or
 * the first pull came first — and when setup came first it got BOTH, eight locations with two
 * defaults (the sync sweep of 2026-09-24, F1). A thawing place is made on demand, the first time
 * a bag is thawed (`ensureLocationOfKind`), as the counter was before.
 *
 * `seededLocationId` derives each row's id from the household and the kind, and every writer
 * uses it — so the phone's four and the server's four are the SAME four rows: a phone that wrote
 * them before its first pull is answered "duplicate", never given a second fridge.
 */
import { uuidv5 } from '../sync/ids';
import type { MilkStorageKind } from './constants';

export interface DefaultStorageLocation {
  readonly name: string;
  readonly short_name: string;
  readonly kind: MilkStorageKind;
  readonly sort_order: number;
  readonly is_default: boolean;
}

export const DEFAULT_STORAGE_LOCATIONS: readonly DefaultStorageLocation[] = [
  { name: 'Refrigerator', short_name: 'Fridge', kind: 'FRIDGE', sort_order: 0, is_default: true },
  {
    name: 'Kitchen freezer',
    short_name: 'Freezer',
    kind: 'FREEZER',
    sort_order: 1,
    is_default: false,
  },
  {
    name: 'Deep freeze',
    short_name: 'Deep freeze',
    kind: 'DEEP_FREEZER',
    sort_order: 2,
    is_default: false,
  },
  { name: 'Counter', short_name: 'Counter', kind: 'ROOM', sort_order: 3, is_default: false },
];

/** A fixed namespace: the ids are a function of the household and the kind, nothing else. */
const SEEDED_LOCATION_NAMESPACE = '3f2a9c1d-7b4e-4e6a-9d0c-5a1b2c3d4e5f';

export function seededLocationId(householdId: string, kind: MilkStorageKind): string {
  return uuidv5(SEEDED_LOCATION_NAMESPACE, `${householdId.toLowerCase()}:${kind}`);
}
