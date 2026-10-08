# The server NibbleCue shares with CuddleCue

NibbleCue has no server of its own. It signs in to CuddleCue's Supabase projects (`staging` and
`production`), uses the same accounts, households, members and children, and writes meals into
CuddleCue's own tables. The owner decided this on 2026-10-08 (*"yes, same supabase projects is
fine"*), together with keeping NibbleCue in its own repository (*"i dont recommend same repo"*).

## Where the server code lives

**Every migration and Edge Function for the shared projects lives in the CuddleCue repository**
(`bive21/cuddlecue-app`), on its `nibblecue` branch until the owner merges it. Two repositories
writing migrations to one database is the one real danger of sharing it: the Supabase CLI keeps one
migration history per project, and `supabase db push` from a repository that lacks the other's
files refuses to run or, worse, runs out of order. One folder of migrations, one deploy script
(`pnpm server:deploy`), one place that tests every policy against both apps.

This repository holds a copy of the generated `Database` type (`packages/db`) and nothing else
from the server.

## What NibbleCue reads and writes

| Data | Table | How | Change to CuddleCue's server |
|---|---|---|---|
| Account, households, members, children | CuddleCue's own | `sync_pull`, the account Edge Functions | none |
| A meal (what was served, how it went) | `activities` (`type = 'solids'`) + `solids_details.items` | `sync_push` entity `activity`, exactly as CuddleCue writes it | none: migration 0114's check allows extra keys on a line, so NibbleCue adds `food_id`, `form` and `plan_item` and CuddleCue ignores them |
| Milk and diaper entries | `activities` (`bottle`, `breastfeed`, `diaper`) + details | `sync_pull`, read only | none. A private entry stays private (RLS) |
| Shopping list | `shopping_items` | `sync_push` entity `shopping_item` | none: one list for both apps |
| Food profile, custom foods, what was noticed, plan pins | `nibble_records` (new) | `nibble_sync_push`, `nibble_sync_pull` (new) | one new table, two new functions |
| NibbleCue Plus | `nibble_entitlements` (new) | written only by the `nibble-revenuecat-webhook` function; read by `nibble_my_plan()` | one new table, one function, one webhook |
| Plan ideas from the model | `nibble-plan-ideas` Edge Function, cache `nibble_ai_drafts` | the phone sends a summary, receives food ids; the phone's validator checks every one | one new function, one cache table |

No CuddleCue function is replaced. `sync_push` and `sync_pull` stay exactly as they are; NibbleCue's
own records go through functions of their own so a mistake in them cannot touch a CuddleCue write.

## `nibble_records`

One row per thing NibbleCue keeps, its shape checked on the phone (`RECORD_BODY` in
`packages/core/src/nibble/types.ts`) and its size and kind on the server.

| Column | |
|---|---|
| `id uuid` | client-generated |
| `household_id uuid` | never trusted from the client: the function checks membership |
| `child_id uuid null` | must be a child of that household; null for a household's custom food |
| `kind text` | `profile`, `custom_food`, `noticed`, `plan_mark` |
| `body jsonb` | an object under 16 KB |
| `client_edited_at timestamptz` | the phone's edit clock; the later edit wins the whole row |
| `created_by`, `updated_by`, `created_at`, `updated_at`, `deleted_at` | as CuddleCue's tables |

Rules: RLS on, members read their household's rows; no direct writes (the push function is
`security definer` with a pinned `search_path` and checks the caller). A `profile`, `custom_food` or
`plan_mark` is written by an owner or parent only (a caregiver feeds and logs but never changes the
allergen plan, spec §4); a `noticed` by anyone who can write. A delete is a tombstone and beats a
later edit unless the edit says `restore`. A retried op is answered `duplicate` (a table of applied
op ids). A row changes `updated_at` for the pull's keyset cursor and nudges the household's open
phones (CuddleCue 0149's `app.nudge_row`).

## The model (AI), allowed by the owner on 2026-10-08

*"this is wrong, ai is fine"* (the owner, 2026-10-08, answering the kickoff). The spec's design
stands: a model proposes, a deterministic validator on the phone decides.

- The phone sends `nibble-plan-ideas` a summary: age in months, stage, region, approach, diet and
  rules, the foods tried with how they went, the allergen states, the foods the validator already
  allows for the coming days. Never a name, never a free-text note.
- The function checks the caller is a member, calls the model with that summary, and returns food
  ids per day and meal with one short reason each. It caches the answer per child per day and
  limits calls per household per day.
- The phone drops every id the validator refuses and every reason containing a banned phrase,
  then fills the gaps from the rule planner. With no key set, no network or a refusal, the rule
  planner's plan is the plan: Today is never empty.
- The key (`ANTHROPIC_API_KEY`) is a function secret the owner sets; it never enters this repository.
