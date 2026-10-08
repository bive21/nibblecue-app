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
| Look and feel | "make sure the theme is the same with cuddle cue, use as much modules as you can from cuddlecue so the app still feel familiar. we can change the main color to diferentiate the two app, but the module and look need to be the same" | NibbleCue is built from CuddleCue's design system and modules (`docs/REUSE.md`). Its default color scheme was CuddleCue's Sunny (orange) until the owner chose green the same day (below); CuddleCue's default is Ocean. |
| Standing rules | "Never commit to, merge into, or push to master. CuddleCue is live and must not be affected. Never deploy the server or publish an update." | Work happens on branch `nibblecue` in both repos. Nothing is deployed or published by a developer or an agent. |

## 2026-10-08: the follow-up answers

| Question | The owner's words | What it means |
|---|---|---|
| Identifiers | "confirmed" | The bundle and package id `app.bpnc.nibblecue`, the URL scheme `nibblecue`, the link path `/nibblecue/app` and the support address `nibblecue@bpnc.app` move to `decided` in `brand.json`. They are never changed after the first store submission. |
| Prices | "confirmed for now" | `nibble_plus_annual` at $39.99 and `nibble_plus_monthly` at $4.99 are the targets for the store dashboards (`pricing.config.json`). The app still reads every price from the store. |
| A trial | "yes", then "also give 14 day trial as well, at the moment my account is not plus with expo go" | A NibbleCue family gets 14 days of NibbleCue Plus once per household, no card, ending by falling back to the free plan (`nibble_start_trial`, migration 0163 in `cuddlecue-app` branch `nibblecue`; the app asks once per household on each phone, `useNibbleTrial`). In Expo Go on the in-app test backend the trial is granted by the mock. |
| Caregiver seats | "yes" | NibbleCue Plus counts for extra caregivers as CuddleCue Plus does (`app.household_seat_has_plus`, 0163). CuddleCue's own Family screen still checks only its own plan before it makes a caregiver's code; that is CuddleCue's code and was not changed. |
| Plan ideas | "yes" | The model's ideas are NibbleCue Plus only on the server too: `nibble-plan-ideas` answers 402 to a household without it, and the phone keeps the rule plan. |
| Sign-in emails | "sign in email can be the nibblecue@bpnc.app, your call what is most proffessional way" | One studio sender for both apps, `noreply@bpnc.app` (already decided for CuddleCue), with `nibblecue@bpnc.app` as the reply-to address on NibbleCue's own mail. The sign-in emails come from the shared Supabase Auth, which can only have one sender, so a NibbleCue-only sender would also sign CuddleCue's mail. Set in the Supabase dashboard by the owner. |
| The plan after setup | "am i not supposed to see anything after answering questions in expo go? after answering the quistionaries, i dont see and food plan here" | Fixed. A family that has not started now chooses when to start (today, a day, or when the signs are there), and Today and Plan show the first days either way. A family starting between 4 and 6 months is offered smooth purées of single first foods, with allergens from 6 months (hard rule `before_six_months`, AAP, CDC, Raising Children). Before that, every food was held to 6 months and the plan was empty. |
| Grocery | "shopping can be replaced with grocery" | The tab and the list are called Grocery. The route name stays `Shopping`, which no one sees. |
| Color and background | "the backgroudn must be changed to cuddlecue, we dont need diapers icons, etc here. i like the green color theme instea of orange. because in our cuddlecue app, solid is green" | The default scheme is Leaf (green); Sunny is gone. The background pattern draws food glyphs (apple, carrot, spoon, broccoli and a few of CuddleCue's) and no diapers or bottles. The placeholder icon and splash are green. |
| The setup | "this does not feel ready to market yet... how do you know about this if you have not started... analyze deeper for every question... it didnt feel like a 'smart' app" | The setup was rebuilt from `docs/research/MARKET_AND_SETUP.md`: the baby's name in every question, nothing asked that a parent cannot know before the first spoon, answers filled in from CuddleCue's log, the plan drawn live under each question, and a summary of what the plan will do and why. |
| Food photos | "we need to add images (generated but looks like real images) for each food listed here" | Every food has a written photo prompt (`tools/foods/food-image-prompts.csv`, one style for all) and the app shows a photo wherever one is imported (`tools/foods/import-food-images.py`). The photos themselves still have to be made: see `docs/FOOD_IMAGES.md`. |
| Grocery from the plan | "shopping/gorcery need to alreayd have pregenerated item according to the meal plan" | The Grocery tab opens on the plan's foods, by aisle, each one tap from the list, with "Add all". The setup summary and the getting-ready page offer the first days' foods too. |

## 2026-10-08: grocery days

| Question | The owner's words | What it means |
|---|---|---|
| Grocery days | "give free users 7 days but plus selectable range/days" | Every family's grocery list covers the next seven days of the plan. NibbleCue Plus chooses the days (three days, a week, two weeks, or any first and last day in the plan's two weeks): `groceryRange` in the plan matrix, gate `grocery.range`. On the free plan the control shows its lock before it is tapped. |

## Waiting on the owner

These are proposals until the owner decides. Each is marked `proposed` or `unconfirmed` in
`packages/brand/brand.json`.

- **The rest of the identifiers**: the App Group `group.app.bpnc.nibblecue` (it follows the
  bundle id, as CuddleCue's does) and the website URLs (`bpnc.app/nibblecue`, its privacy, terms
  and account deletion pages). A release build refuses to run while any is still proposed
  (`apps/mobile/env.guard.cjs`).
- **The store copy**: the Apple subtitle, the marketing headline, the Play short description and
  the monogram.
- **The EAS project** (its id goes in `unconfirmed.easProjectId`).
- **Food photos**: generated, or a photo shoot (`docs/FOOD_IMAGES.md`).
- **The sign-in sender**: set in the Supabase dashboard (Authentication, SMTP settings).
- **Legal text**: `packages/brand/legal/*.json` are drafts adapted from CuddleCue's, for the
  owner to rewrite or approve in their own words.
