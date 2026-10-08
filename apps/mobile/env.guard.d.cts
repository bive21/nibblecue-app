/** The production guard `app.config.ts` runs first; the account is in `env.guard.cjs`. */
export function productionEnvProblem(raw: {
  EXPO_PUBLIC_ENV?: string | undefined;
  EXPO_PUBLIC_AUTH_PROVIDER?: string | undefined;
  EXPO_PUBLIC_SUPABASE_URL?: string | undefined;
  EXPO_PUBLIC_SUPABASE_ANON_KEY?: string | undefined;
}): string | null;

/** Whether this evaluation builds or bundles the app (an EAS worker, `expo export`), where the guard holds. */
export function guardApplies(
  env: { readonly [name: string]: string | undefined },
  args: readonly string[],
): boolean;

/** A release build's refusal while an identifier is still the developer's proposal (NibbleCue). */
export function identifierProblem(brand: {
  proposed: Record<string, unknown>;
  unconfirmed: Record<string, unknown>;
}): string | null;
