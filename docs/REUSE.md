# What came from CuddleCue

NibbleCue is built from CuddleCue's code, as the owner asked on 2026-10-08: *"use as much modules
as you can from cuddlecue so the app still feel familiar."* This file records where each part
came from, so a fix made in one app can be carried to the other. `pnpm check:reuse`
(`tools/reuse-check.mjs`) keeps it honest. It fails when a package or app here is not named
below. When `../cuddlecue-app` is checked out beside this repository, it also fails on a commit
that does not exist there.

Source commit: `0128664`

That is CuddleCue's `master` on 2026-10-08 ("bpnc-studio: the NibbleCue repo choice follows from
whether it shares the database"). Changes CuddleCue made after it and carried here:

- Patch: `0b4d318`. The Health note (CuddleCue's `wellbeing` activity, its migrations 0159 and
  0160): the type, the local tables and the capture sheet. NibbleCue's "Something you noticed"
  writes one.

## Unit by unit

| Unit | From CuddleCue | What NibbleCue changed |
|---|---|---|
| `packages/core` | Copied whole, renamed `@nibblecue/core`: the domain types, the local-first sync engine (outbox, chains, `commitWrite`, push and pull, cursors), the solids log, accounts and onboarding, the plan matrix machinery | `src/nibble/`, NibbleCue's own domain (foods, allergens, stages, history, the safety validator, the rule planner, swaps, guidance, records). The outbox entity `nibble_record`. Local schema v22 with `nibble_records`. `plan/entitlements.ts` and `pricing.config.json` rewritten for NibbleCue Plus. |
| `packages/ui` | Copied whole, renamed `@nibblecue/ui`: tokens, the six schemes, the three skins, every component, the icon set | Default scheme Sunny (orange). Tab labels Today, Plan, Foods, Shopping, More. The top bar's bell is optional. |
| `packages/brand` | The structure (`decided`, `proposed`, `unconfirmed`), the legal renderer, the store listing shape and their tests | NibbleCue's values. Legal drafts adapted. No community guidelines. Placeholder art. |
| `packages/db` | The generated database types | Regenerated on cuddlecue-app's `nibblecue` branch, so they include the `nibble_*` functions. |
| `apps/mobile` | The Expo app: auth and sign-up, family and invites, the shell, the sync wiring, the solids and Health note sheets, the shopping list and supplies, account and plan pages, appearance | Pruned of CuddleCue-only features (schedule, timers, stash, widgets, coins, community, vaccines, reports, notifications, tour). NibbleCue's screens are in `src/screens/nibble/`, its data hooks in `src/nibble/`, and More, Help, navigation and the plan provider were rewritten. |

## Carrying a fix across

A fix to shared code (sync, auth, the design system, the solids log) is made in CuddleCue first,
because CuddleCue is live. Then it is copied here and listed above as `- Patch: <sha>`. A fix
that starts here goes to the owner as a CuddleCue proposal. It is never pushed to CuddleCue's
master by this project.
