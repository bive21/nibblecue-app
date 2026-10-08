/**
 * THE ONE SENTENCE A SIGN-IN THAT KEPT THE ACCOUNT IS OWED (`keep-account.ts`; Privacy §7, Terms
 * §12). The Delete account page signs off with a toast — "Account scheduled for deletion on …
 * Sign in before then to keep it." — so the undo answers in the same voice and the same place:
 * "Welcome back. Your account won't be deleted." Once, when the server says this sign-in undid a
 * pending deletion, whichever screen the parent has landed on.
 *
 * Renders nothing. Mounted beside the sync engine, inside the toast host (App.tsx), because the
 * ask can land a while after the sign-in — on a reconnect, or the next launch — when AUTH is long
 * gone and no screen is waiting for it.
 */
import { useEffect } from 'react';
import { ACCOUNT_KEPT } from '../screens/auth/copy';
import { useToast } from '../ui/toast';
import { useAuth } from './AuthContext';

export function AccountKeptToast() {
  const { accountKept, actions } = useAuth();
  const toast = useToast();
  const said = actions.accountKeptSaid;
  useEffect(() => {
    if (!accountKept) return;
    toast.show(ACCOUNT_KEPT);
    said();
  }, [accountKept, toast, said]);
  return null;
}
