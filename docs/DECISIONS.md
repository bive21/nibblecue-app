# Decisions

The owner's decisions, dated and in their own words, with what each one changed. A decision here
is never reversed by a developer or an agent; only the owner changes one, and the change gets its
own dated line.

## 2026-10-08: the kickoff answers

| Question | The owner's words | What it means |
|---|---|---|
| AI in the product | "this is wrong, ai is fine" | A model may suggest meal ideas (`nibble-plan-ideas`, server-side). Every idea passes the on-device safety validator; a refused idea is never shown. The medical-safety lines still hold: no diagnosis, no doses, no "allergy" verdicts, general guidance, not medical advice. |
| Icons | "you can generate simple tepmorary icons that i will redesign later once we know clearly what it's for" | `tools/brand/placeholder-art.py` draws placeholder app icon, adaptive icon and splash art in `packages/brand/brand/*-placeholder.png`. The owner redesigns them. |
| Store title | "NibbleCue - Baby Food Planner" | `brand.json` `decided.storeTitle` (both stores). |
| Database | "yes, same supabase projects is fine, but will this overload the database or make the app slower? if your calcualtion says its fine, then do ti" | One Supabase project per stage, shared with CuddleCue. The calculation is `docs/CAPACITY.md`: fine on the current plan, with what to watch. |
| Repository | "i dont recommend same repo github, because testing wil l take a long time now since its for both apps now. give yourself writing for cuddlecue-app." | NibbleCue lives in `nibblecue-app`. Its server pieces (migrations, functions) live in `cuddlecue-app` on branch `nibblecue`, never on master, never deployed by us. |
| Plus | "i dont agree wiuth cuddle cue plus, covers both. this is a different subscription called nibblecue plus, and its different price too" | NibbleCue Plus is its own subscription (`nibble_plus` entitlement, its own products and price). CuddleCue Plus does not unlock NibbleCue Plus, and the reverse is also true. |
| Where to work | "work in github: nibblecue-app, attach the skill here" | The bpnc-studio skill is in `.claude/skills/bpnc-studio/`. |
| Look and feel | "make sure the theme is the same with cuddle cue, use as much modules as you can from cuddlecue so the app still feel familiar. we can change the main color to diferentiate the two app, but the module and look need to be the same" | NibbleCue is built from CuddleCue's design system and modules (`docs/REUSE.md`). Its default color scheme is CuddleCue's Sunny (orange); CuddleCue's default is Ocean. |
| Standing rules | "Never commit to, merge into, or push to master. CuddleCue is live and must not be affected. Never deploy the server or publish an update." | Work happens on branch `nibblecue` in both repos. Nothing is deployed or published by a developer or an agent. |

## Waiting on the owner

These are proposals until the owner decides. Each is marked `proposed` or `unconfirmed` in
`packages/brand/brand.json` or `owner_to_confirm` in `packages/core/src/plan/pricing.config.json`.

- **Identifiers**: bundle id and package `app.bpnc.nibblecue`, URL scheme `nibblecue`, App Group,
  link path `/nibblecue/app`, support email `nibblecue@bpnc.app`, the website URLs. A release
  build refuses to run while any is still proposed (`apps/mobile/env.guard.cjs`).
- **The EAS project** (its id goes in `unconfirmed.easProjectId`).
- **Prices and product ids**: proposed `nibble_plus_annual` at $39.99 and `nibble_plus_monthly`
  at $4.99.
- **A NibbleCue welcome trial**: none is granted. A new family created from NibbleCue goes through
  CuddleCue's bootstrap, which starts CuddleCue's own 14-day preview of CuddleCue Plus.
- **Caregiver seats**: the shared server allows caregiver seats on the household's CuddleCue plan.
  A NibbleCue-only family on the free plan follows CuddleCue's rule. The owner decides whether
  NibbleCue Plus should also count.
- **Plan ideas**: today any member may ask, up to 20 a day per household. The owner decides
  whether ideas should be NibbleCue Plus only on the server too (the app already gates them).
- **Legal text**: `packages/brand/legal/*.json` are drafts adapted from CuddleCue's, for the
  owner to rewrite or approve in their own words.
