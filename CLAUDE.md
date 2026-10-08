# CLAUDE.md: NibbleCue

Read this first, then the studio skill in `.claude/skills/bpnc-studio/` (how the owner likes apps
built, learned building CuddleCue). `docs/PRODUCT.md` is what the app is, `docs/DECISIONS.md` is
what the owner decided, `docs/SERVER.md` is the shared server, `docs/REUSE.md` is what came from
CuddleCue, `docs/CAPACITY.md` is the database load.

## 1. What this is

NibbleCue is the solid-food planner sister app of CuddleCue, made by BP&C Creative Studio. It
gives a day-by-day plan of what to offer a baby from the first bite to toddler meals, changes as
the family logs how each food went, introduces the common allergens one at a time and keeps them
going, and keeps what a parent noticed for the pediatrician. It shares CuddleCue's accounts,
families and log on the same Supabase projects. A meal logged in either app is one entry in both.
It looks and works like CuddleCue, and its default color is orange where CuddleCue's is blue.

**CuddleCue is live.** Nothing done here may affect it: never commit to, merge into or push to
`master` in either repository, never deploy the server, never publish an update. NibbleCue's
server pieces live in `cuddlecue-app` on branch `nibblecue` and reach CuddleCue's projects only
when the owner merges and deploys them.

## 2. The rules that may never be broken

These are not preferences. Breaking one is a defect regardless of how well the code reads.

### Medical safety

1. **No medical advice, no diagnosis.** The app plans food from published guidance and records
   what a parent enters. It never says what is wrong with a baby. A sign is "something you
   noticed" or a "possible reaction", never an allergy, an intolerance or a condition.
2. **AI is allowed only for meal ideas** (the owner, 2026-10-08: "ai is fine"), and only behind
   the safety validator. The model runs on the server (`nibble-plan-ideas`), sees food ids and
   counts and never a name or a note. Every idea passes `packages/core/src/nibble/safety/`
   before it is shown. A refused idea is dropped, and a reason with a banned phrase is blanked.
   With no model, the rule plan stands alone and Today is never empty. There is no chatbot and
   no AI health guidance.
3. **Never a dose, never an amount to reach, never calories.** Portions are the baby's to decide.
4. **The hard rules hold for every plan** (`safety/rules.ts`, each with its sources): nothing
   before 4 months, no honey before 12 months, no high-mercury fish, no unsafe foods, a safe form
   for the age, one new food and one new allergen a day, a held or diagnosed allergen never
   offered. `plan.property.test.ts` checks them over 1,500 generated families with independent
   code.
5. **An emergency sign opens the emergency card first** (trouble breathing, swelling of the
   face, lips or tongue, pale or floppy): the region's number, one tap, offline.
6. **An allergen followed by a noticed sign goes on hold.** The app never suggests offering it
   again. Only the parent can take it off hold, after the words "talk to your pediatrician".
7. **Guidance comes from published sources with dates** (`nibble/sources.ts`,
   `guidance.data.ts`, `foods.data.ts`), never from code or a model.
8. **The copy is held to the voice** by tests: `NIBBLE_BANNED` (normal, allergic, diagnosis, not
   enough, behind, calories, dose…), no dash in a sentence, US English, sentence case
   (`pnpm check:copy`).

### Data and trust

9. **Never lose a log.** Local-first writes through `commitWrite`, client ids, idempotency,
   soft deletes with undo. A write succeeds with no network.
10. **Never trust a household id from the client.** Membership and role are resolved by the
    server (`nibble_sync_push` checks `app.is_member`, `app.can_write`, `app.can_admin`). RLS is
    on for every table. The profile, custom foods and plan marks are a parent's to change; a
    caregiver logs and notes; a view-only seat writes nothing.
11. **Never commit a secret**, never invent a credential. Build the interface, a mock and an
    `.env.example` entry, then say what is needed.
12. **Log once.** Meals are CuddleCue's `activities` of type `solids`. Something noticed is
    CuddleCue's Health note plus a NibbleCue record naming the foods. Never keep a second copy
    of something CuddleCue already stores.

### Commerce

13. **No hardcoded price.** Prices come from the store SDK. `pricing.config.json` holds targets.
14. **The store owns entitlement.** NibbleCue Plus is its own subscription (`nibble_plus`); the
    device never decides a tier. No fake trials, no dark patterns.
15. **No ads, no ad SDK, no data sold.**
16. **The free plan is a working app**, and safety is never sold (see §4).

### Identifiers: never change these automatically

Bundle and package ids, the Apple Team id, signing, the App Group, the URL scheme, link paths,
OAuth clients, product ids, RevenueCat identifiers, domains, database names. They are set once
by a human (`packages/brand/brand.json`). The proposed ones are listed in `docs/DECISIONS.md`,
and a release build refuses to run while any is still proposed.

### Legal facts we do not have

17. The legal entity is `BP&C Creative Studio, LLC`, read from `brand.json`, never typed.
18. Never draft legal text that asserts facts about the business. `packages/brand/legal/*.json`
    are drafts for the owner to approve in their own words.

## 3. The shape of the app

Sign in or create an account (CuddleCue's flow; a CuddleCue account works as is). A new parent
names their baby on one page, and the family is made by CuddleCue's bootstrap. Each baby gets a
short food setup once. Tabs: **Today, Plan, Foods, Shopping, More**. `docs/PRODUCT.md` has the
details.

## 4. Free vs NibbleCue Plus

The plan matrix is `packages/core/src/plan/entitlements.ts`. Its test fails if the bill of
rights is ever sold.

- **Always free (the bill of rights):** logging, Today, the food library and serving guidance,
  allergen tracking, something noticed and the emergency card, multiples, the shopping list,
  the base themes, data export, account deletion, no ads.
- **Free:** custom foods, history, supplies.
- **NibbleCue Plus:** the full 14-day plan with pins and swaps, plan ideas, the caregiver sheet,
  the pediatrician summary, milk and drinks, color schemes, the night theme.
- **Caregiver seats** are decided by the household's CuddleCue plan (`planOf`), because the seat
  lives on the shared server.

## 5. Stack and layout

pnpm 10 and turbo; Expo SDK 57, React Native 0.86, React 19; TypeScript strict; vitest; zod.

- `packages/core`: CuddleCue's domain and sync engine, plus `src/nibble/` (NibbleCue's domain,
  imported as `@nibblecue/core/nibble`).
- `packages/ui`: CuddleCue's design system.
- `packages/brand`: brand values, legal drafts, the store listing.
- `packages/db`: generated database types.
- `apps/mobile`: the app. NibbleCue's screens are in `src/screens/nibble/`, its data in
  `src/nibble/`.
- `prototype/ui-prototype.html`: the click-through prototype.

## 6. How to work

- Work on branch `nibblecue`. Commit only green work.
- **Run the gate on every change and read its last line:** `pnpm gate` prints one line per step
  and ends with `GATE_EXIT=0` (green) or `GATE_EXIT=1`. The full log is `gate.log`. Never read a
  status from anything else.
- Fast checks: `pnpm typecheck`, `pnpm test:safety`, `pnpm check:copy`, `pnpm test:entitlements`,
  `pnpm test:brand`, `pnpm check:expo-go`, `pnpm check:reuse`.
- Run the app: `pnpm mobile` (Expo Go, in-app test backend by default).
- Server changes go to `cuddlecue-app` branch `nibblecue` and run CuddleCue's own gate there.

## 7. What not to do

- Do not touch CuddleCue's master, its deploys or its release channel.
- Do not add a model call on the phone, or let a model's text reach a parent unscanned.
- Do not show a number as a target for the baby. Counts of what was logged are fine.
- Do not copy a CuddleCue feature without recording it in `docs/REUSE.md`.
- Do not weaken a safety test to make it pass.

## 8. Still waiting on the owner

`docs/DECISIONS.md`, "Waiting on the owner".
