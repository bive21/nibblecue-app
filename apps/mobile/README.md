# mobile — the CuddleCue app

Expo SDK 57 (React Native 0.86, React 19.2), TypeScript strict, managed workflow with
`expo prebuild` + config plugins. `ios/` and `android/` are generated and gitignored; every
native change lives in a config plugin under `plugins/` (`docs/MOBILE.md §1`).

```bash
pnpm --filter mobile dev          # expo start — needs a dev build now (native modules)
pnpm --filter mobile typecheck    # tsc --noEmit
pnpm --filter mobile test         # vitest: the pure app logic under src/**/*.test.ts
pnpm --filter mobile build        # expo export for ios + android — the Metro bundle check CI runs
pnpm --filter mobile config       # the resolved app config, names and ids read from @nibblecue/brand
```

## What is here after WP3

The first screen after install is sign in or create an account; a session lands on Today
(`docs/AUTH_AND_TRIAL.md §2`). Every screen is written against two interfaces —
`AuthProvider` (identity, sessions) and `AccountsApi` (the household) in
`src/auth/providers/types.ts` — and runs on the **mock pair** with no keys at all:

```bash
# .env (never committed): the default
EXPO_PUBLIC_AUTH_PROVIDER=mock
# the real stack, once the owner's project exists
EXPO_PUBLIC_AUTH_PROVIDER=supabase
EXPO_PUBLIC_SUPABASE_URL=…
EXPO_PUBLIC_SUPABASE_ANON_KEY=…        # the publishable key
# Community reaches the server whenever the real stack is set; `false` keeps posts on the phone
# EXPO_PUBLIC_COMMUNITY_ENABLED=false
```

| Folder | What |
|---|---|
| `App.tsx` | the providers, outermost first: safe areas → auth → plan → appearance (fonts, the stored look, the status bar) → the child in view → toasts → navigation → the shell |
| `src/app/` | `navigation.tsx` (one root stack per auth phase; the five tabs on the floating bar), `Screen.tsx` (the chrome every screen sits in), `shell.ts` + `ShellProvider.tsx` (every popover and sheet, one owner), the account popover, the child switcher, Quick Log and its placeholder entry sheet, `linking.ts` + `links.ts` + `LinkRouter.tsx` (the deep-link table and where each lands), `tabs.ts` |
| `src/appearance/` | `AppearanceProvider` (the stored choice on the first frame, the OS scheme as a default only, the plan's gates), `fonts.ts` (one face for words, one for numbers), the appearance popover and the sheet with its live preview, `options.ts` |
| `src/auth/` | `AuthContext` (the phase machine: booting → signed_out · unverified · age_gate · onboarding · ready), `session.ts`, `teardown.ts`, `quarantine.ts`, `keychain.ts`, `providers/{mock,supabase}.ts` |
| `src/household/` | `useChild()`: the child in view, remembered per account, "Both" for multiples |
| `src/screens/auth/` | sign in (wordmark + tagline), verify, reset and new password, the age gate |
| `src/screens/onboarding/` | the five steps on the core reducer; the shared setup picker |
| `src/screens/today/` | Today: NOW → QUICK → NEXT → LAST, the welcome cards, the fold arithmetic (`layout.ts`) |
| `src/screens/{schedule,reports,community}/` | honest empty states until their work packages |
| `src/screens/more/` | More (the app's features and the footer that opens About), What you track, Family, Delete account |
| `src/screens/account/` | Account & privacy and Plan, reached from the avatar |
| `src/sheets/` | the six-box invite code, sign out, About, the gate (paywall) sheet |
| `src/plan/` | `usePlan()`; `gate.ts` (the paywall's copy, the plan page's status copy) |
| `src/brand/` | the mark and the wordmark, read from `@nibblecue/brand` |
| `src/ui/toast.tsx` | the toast host on the queue rules: Undo always in the right-hand slot |
| `src/db/`, `src/analytics/`, `src/prefs/` | the local SQLite schema and outbox shape; the PII-free emitter; the keys that survive a sign-out (the appearance among them) |
| `e2e/` | the five Maestro flows of `ACCOUNTS.md §9`, not yet run on a device |

The mock provider adds two dev-only controls (never in a production build): "Open the emailed
link" on the verify screen, and "revoke this session on the server" under More, which the E2E
flows use in place of an inbox and a second device.

What is deliberately **not** here, and why:

- **Sign in with Apple.** Restored 2026-10-02 so Google can stand on an iPhone under guideline 4.8.
  Native on iPhone (`expo-apple-authentication` → Supabase `signInWithIdToken`), drawn once
  `EXPO_PUBLIC_APPLE_SIGN_IN_ENABLED=true`. Google is Supabase's OAuth in the browser sheet
  (`EXPO_PUBLIC_GOOGLE_SIGN_IN_ENABLED=true`). Optional quiet Apple on Android needs the Services
  ID path (`EXPO_PUBLIC_APPLE_ANDROID_SIGN_IN_ENABLED`). `docs/AUTH_AND_TRIAL.md` §2.0.
- **Logging, the outbox worker, widgets, push.** WP4, WP5, WP8, WP10. The Quick tiles open a
  placeholder entry sheet; the sync chip reports offline only; the bell opens an empty list.
- **Subscribing.** The Plan page and the gate sheet name what each plan holds and show no
  price; the store SDK and its prices arrive with WP9.
- **A native icon and splash you can see.** `app.config.ts` carries the kit's app icon, the
  Android adaptive layers, the light and dark splash and the notification glyph; Expo Go shows
  its own icon and splash, so they appear in a development build (`eas build`) and later.
