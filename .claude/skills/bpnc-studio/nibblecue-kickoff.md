# Starting NibbleCue (or any new BP&C app)

NibbleCue is the owner's planned sister app to CuddleCue, to be started once CuddleCue is live on
both stores. As of 2026-10-08 no NibbleCue code, identifier or brief exists. This file is the
first-session plan. Do not build features until step 1 is answered.

## 1. Ask the owner first (one message, recommended options first)

Product:
1. **What is NibbleCue for, and for whom?** A one-paragraph brief, the first three things a parent
   does in it, and what makes someone pay. Ask for any designer sketches.
2. **Which CuddleCue data does it touch?** The owner named five integration points on 2026-10-02:
   a shared account, a write-through solids log, deep links (`nibblecue://today`), shopping list
   sync, and reading milk and diaper logs.
3. **Name, store title, tagline, Plus name and target prices.**

Shape (CuddleCue's `cuddlecue-dev` skill, `roadmap.md` §B.7, has the full list with pointers):
4. **Same Supabase project and the same households?** Recommended: yes, the same staging and
   production projects, the same account and household, so a parent signs in once and both apps
   share one log. Separate projects make every integration point a cross-server sync.
5. **Same repository? It follows from question 4** (the owner, 2026-10-08, asked whether a shared
   repo would interfere with CuddleCue; it must not).
   - **Shares the Supabase project** (accounts, solids, shopping, feed reads): add NibbleCue as
     `apps/nibblecue` in the CuddleCue monorepo. Two repos writing migrations to one database is the
     real danger, and one repo keeps every migration in one place, tested against both apps.
   - **Standalone** (its own accounts and data): a separate repo. Simpler and fully isolated; copy
     the design system once and let it diverge.
   Guardrails in the monorepo, set up before the first NibbleCue commit: CuddleCue's full gate runs
   on every change, so a shared-package change that breaks CuddleCue cannot land; each app has its
   own app config, EAS project, identifiers, release tags (`cuddlecue-v*`, `nibblecue-v*`) and
   update channel, so releasing one never ships or deploys the other; NibbleCue work starts only
   after CuddleCue is live and stable, on branches, merged only green.
6. **Does one Plus cover both apps?** And which Terms and Privacy Policy cover shared data (the
   owner's words, never drafted).
7. **Identifiers, set once by the owner**: bundle and package id, URL scheme, App Group, link
   paths on the studio's domain, the EAS project, store product ids. Never invent them.

## 2. Day one, once answered

1. **Write the new app's `CLAUDE.md`** from CuddleCue's: keep §2 (the rules that are never
   broken), the identifiers rule, the legal-facts rule, Free vs Plus with its bill of rights, the
   stack, "How to work" and "What not to do"; replace what is CuddleCue-specific. Point it at this
   skill.
2. **Copy this skill** into the new repo (`.claude/skills/bpnc-studio/`) if it is a separate repo.
   In the monorepo it is already there.
3. **A brand file** (`brand.json` with `decided` and `unconfirmed` sections) and its test that
   fails the build when a brand string or identifier is typed anywhere else.
4. **An entitlement table** with the bill of rights and its test, before the first gated feature.
5. **A prototype first** (CuddleCue's `prototype/ui-prototype.html`: one file, no build, sample
   data), clicked through by the owner before screens are built. It doubles as the source of
   website pictures and store screenshot drafts.
6. **The gate from day one**: lint, typecheck, brand, entitlements, copy scans, unit tests,
   scenario tests, and a boot smoke test that mounts the real app.
7. **Local-first data and sync** reused from CuddleCue's core, not rewritten.

## 3. Integration points, if the owner says yes

| Point | Reuse | Rule |
|---|---|---|
| Shared account | Supabase Auth, `profiles`, `households`, `household_members`, roles | membership and role resolve server-side; RLS on everything |
| Solids log | `activities` (`type = 'solids'`) + `solids_details`, `packages/core/src/solids/` | log once: one row, read by both apps, written through the same outbox |
| Deep links | each app's own scheme; universal links on the studio domain | an app never opens the other's private scheme without a fallback to the store |
| Shopping list | `shopping_items`, `packages/core/src/lists` | one list, not two kept in step |
| Milk and diaper reads | existing activity tables, `sync_pull` | a private entry stays private to its author |

## 4. Launch checklist (what CuddleCue needed)

- Store accounts as an organization for the LLC; App Store Connect app record; Play internal track.
- Push: an APNs key (`.p8`, downloads once) and FCM, set as server secrets; tested with the app
  closed on both platforms.
- Subscriptions in both consoles and RevenueCat, with the webhook and secrets.
- The domain's DNS, mail authentication (SPF, DKIM, DMARC on the Zoho mailbox), and the
  `.well-known` link files uploaded with the website.
- Store listing: real screenshots per size, feature graphic, Data safety, App Privacy label,
  content rating, each answer traced to code; the monochrome Android icon.
- Privacy policy covering everything collected (crash reports included), in the owner's words.
- Two real phones used as one household for a week on staging before release.
- iPhone build to Apple review a few days before release day; launch both together.
