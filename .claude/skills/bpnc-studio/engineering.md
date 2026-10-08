# Engineering playbook

How code is written, checked, committed and released at BP&C, and the mistakes CuddleCue already
paid for. Paths and commands below are CuddleCue's; a new repo should copy the shape.

## Stack (CuddleCue, the default for NibbleCue)

| Layer | Choice |
|---|---|
| App | React Native + Expo (EAS Build), TypeScript strict, Expo Go kept working for testing |
| Local store | SQLite (expo-sqlite) with an outbox table; the app always reads local |
| Sync | Supabase (Postgres, RLS on every table, Realtime nudges), delta pull, idempotent push keyed by client op id |
| Push | APNs and FCM from a server worker (an Edge Function sweep), never from the client |
| Billing | RevenueCat; store webhooks write entitlement server-side |
| Monorepo | pnpm workspaces + turbo: `apps/mobile`, `apps/admin` (Next.js), `packages/core` (pure TS, no React), `packages/ui`, `packages/db`, `packages/brand`, `supabase/`, `website/` (static HTML), `tools/` |

`packages/core` stays free of React and React Native so domain logic is tested in node and reused.
**pnpm only**; run `pnpm install` after every pull that touches a `package.json`.

## Every change

1. **Read before writing**: the repo's `CLAUDE.md`, the doc for the area, the existing pattern.
   Reuse what exists; screens stay thin and logic lives in core with unit tests.
2. **Every feature lands with its tests.** Pure functions get unit tests; flows get scenario tests
   that drive the app's own writes through the local database and the mock server (CuddleCue:
   `apps/mobile/src/scenarios/*.scenario.test.ts`); server rules get database integration tests
   against a real local Postgres; copy gets scan tests (banned words, US English, no dashes).
   Some tests read source text on purpose; when you change such code on purpose, change the test
   on purpose.
3. **Run the full gate** before calling anything done. In CuddleCue:
   ```
   pnpm lint && pnpm typecheck && pnpm test:entitlements && pnpm test:brand \
     && node assets/gen-pricing.mjs --check && pnpm check:site && pnpm check:controls \
     && pnpm check:e2e-ids && pnpm check:slices && pnpm check:expo-go && pnpm check:routes \
     && pnpm test:contrast-tokens && pnpm typecheck:functions \
     && npx turbo run test --concurrency=1 --force
   ```
   Add `pnpm test:rls`, `pnpm test:functions` and `pnpm db:types:check` when the server changed.
4. **Read the gate's own result line.** Run it as `( ... ) > gate.log 2>&1; echo "GATE_EXIT=$?" >> gate.log`
   and grep for `GATE_EXIT`. A background job's own exit status is the `echo`'s, not the gate's:
   CuddleCue once reported three failing runs as passing this way. Use `turbo --force` so cached
   results never stand in for a real run.
5. **Re-read your diff adversarially**: what might this break that worked before? Derived copies
   (widget images, notification pictures, mirrored brand files, generated types, the website) must
   be regenerated when their source changes.
6. **Commit with a plain subject that says what changed for a parent**, a body that says why, and
   the attribution trailer the session gives. Work lands on `master`; push to the session branch
   too when one is named.
7. **Never commit half-done work**, even when a hook nags: say what is pending and why.

## Agents in parallel

Large rounds go faster with several agents, each owning a disjoint set of files, each told the
rules, the files it must not touch, the migration number it may use, and to run the gate and
report the real results without committing. Then review every report, run the gate on the
combined tree yourself, and commit. Shared files (release notes, generated types, lockfile) are
appended to at the end, re-reading right before editing.

## Database and server

- **Migrations are append-only**, numbered, each with a header saying why, RLS on every new
  table, and a negative test proving a client cannot read or write what it should not.
- **Never trust a household id from the client**; membership and role resolve server-side.
- Every SECURITY DEFINER function pins its `search_path` and checks its caller.
- **Servers change only through the release scripts**: `pnpm server:deploy staging`; production
  only from a release tag; over-the-air updates only through `pnpm update:publish` (never
  `eas update` by hand). Production keys never go in a local `.env`.
- Secrets are named in `.env.example` and set by the owner as EAS variables or function secrets.

## Identifiers: set once by a human

Bundle and package ids, App Group, URL scheme, OAuth redirect URIs, product ids, the RevenueCat
entitlement, domains and database names are set once by the owner, recorded in the brand file, and
never changed by code or an agent. If a task seems to need one changed, stop and ask.

## Mistakes already paid for (do not repeat)

- **Misreading a test run** (see step 4). Always read the gate's own exit line.
- **Shrinking an asset without regenerating its copies**: the icons were re-encoded and the widget
  catalog and notification pictures, which tests hold byte-for-byte to them, were not.
- **Closing the local database under in-flight queries** crashed the app when switching families
  quickly: claim the write lock first, wait for queued work before closing, and serialize file
  changes.
- **A sign-in link that carries its own tokens** could move a signed-in phone into the sender's
  account: never honor token-in-link sign-in while a session exists.
- **Roles the server refuses** (a view-only member logging) left failed rows on the phone: gate
  the write path and hide the controls, so the app never offers what the server will refuse.
- **CI on a hosted runner**: build one architecture for an emulator, cap the Gradle heap, free disk
  space, and run multi-line emulator scripts from a bash file (the emulator action runs each line
  with `/bin/sh`).
- **Nothing rendered the app shell in tests**, so three crashes reached a phone through a green
  suite: keep a boot smoke test that mounts the real app on react-native-web with the mock backend.
- **Stale installs**: a pull that adds a native module needs `pnpm install`; `expo start -c` clears
  Metro, not `node_modules`.
- **Lazy-loading screens** was declined by the owner because first opens would be slower; do not
  trade page-open speed for startup speed without asking.

## Release

- Android first through Play's internal testing track, iPhone through TestFlight; both stores
  launched together. Ship the iPhone build to review a few days before release day.
- Store listing assets (screenshots per store size, feature graphic, Data safety, App Privacy,
  content rating) are generated from the real app and documented answer by answer with the code
  that proves each one; owner decisions are marked.
- The website is static HTML the owner uploads whole, including `.well-known/` (the App Links and
  universal link files). Hidden folders are easy to lose in an upload; upload the zip.
