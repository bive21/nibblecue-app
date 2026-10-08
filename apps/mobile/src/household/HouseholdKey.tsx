/**
 * EVERYTHING BELOW THE ACCOUNT, REMOUNTED WHEN ANOTHER FAMILY COMES ON SCREEN (0153).
 *
 * A switch changes which family the account shows first (`focusAccount`, core) and which file the
 * database reads (`db/index.ts`). Every provider and screen below holds state about the family it
 * was mounted for — a sheet open on one of its entries, a timer, a sync engine, its reminders — so
 * rather than ask each to notice, the whole tree is keyed on the switch's epoch and mounts fresh,
 * on Today, for the family now shown. The epoch never moves for a FIRST family (setup, a join from
 * Ended), which mounts exactly as it always did.
 */
import { Fragment, type ReactNode } from 'react';
import { useAuth } from '../auth/AuthContext';

export function HouseholdKey({ children }: { children: ReactNode }) {
  const { householdEpoch } = useAuth();
  return <Fragment key={householdEpoch}>{children}</Fragment>;
}
