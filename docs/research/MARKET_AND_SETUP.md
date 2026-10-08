# NibbleCue: market teardown and a setup that feels smart

*Research written 2026-10-08, after the owner's test of the food setup: "this does not feel ready
to market yet... even the first questions was where are you with solid, i answered not started
yet, and the next questions can you baby do all of these: swallows food rather than pushing it
out, how do you know about this if you have not started... even answering the questions it didnt
feel like a 'smart' app... there are other apps out there that we can 'learn' from."*

Everything proposed here stays inside `CLAUDE.md` §2: no diagnosis, no dose or amount to reach,
no "allergic", "normal", "not enough", "behind" or "diagnosed" in any parent-facing string, no
dash inside a sentence, US English, sentence case. Every "smart" line below is computed by the
rule planner from the parent's own answers and log, never by a model.

**How to read the evidence.** The sandbox could not open store pages directly (the proxy refuses
`apps.apple.com` and most review aggregators), so competitor facts come from web search results
that quote store listings, review aggregators, Trustpilot, Mumsnet and the developers' own pages.
Each claim says which. Where an app's onboarding could not be seen, the table says "not seen"
rather than guessing. Three apps in the brief could not be found under that name: **Kinder**,
**Feed Me** and **Weaning Week by Week** (the closest match is MadeForMums' week-by-week weaning
app). **Yummy Toddler Food** is a website, newsletter and cookbook, not an app.

---

## 0. What the code does today (the honest starting point)

Read from `FoodProfileScreen.tsx`, `copy.ts` (`PROFILE`), `types.ts` (`NibbleProfile`),
`stage.ts` and `planner/plan.ts`.

| What | Today | Why it hurts |
|---|---|---|
| Step 1, "Not started yet" | Shows "Can your baby do all of these?" with four items, one being "Swallows food rather than pushing it out", and a yes/not yet switch | A parent cannot know the swallow item before food. This is exactly the owner's complaint. HealthyChildren describes it as something you see *when you offer a spoon* ([AAP](https://healthychildren.org/English/ages-stages/baby/feeding-nutrition/Pages/Starting-Solid-Foods.aspx)). |
| Start date | `startedOn` has `maximumDate={new Date()}`; there is no planned future start | "We start on Saturday" cannot be said. `stageFor` treats `ready: true` as "start today". |
| Ready at 4 months | `ready: true` at 4 months gives a first-foods plan from today, no word about 6 months | Guidance says around 6 months; the app should say so where the choice is made. |
| Foods already eaten | `profile.triedBefore` exists and the planner reads it, but **no screen sets it** | A baby "eating lots of foods" gets "A first taste of banana". This alone makes the plan feel unaware. |
| Family allergy switch | Asked in setup, stored, and **changes nothing in the plan** (`higherPeanutRisk` reads only eczema and egg) | A question that changes nothing feels like a form. |
| Region | Asked as a question | Only changes guidance cards (and the model's context). It can be read from the phone and CuddleCue. |
| Meals a day | Asked as a 2/3/4 control | The stage already decides it; a new parent has no basis to answer. |
| Cuisines | Asked in setup | Nudges the new-food score by 1 point. Worth keeping, not worth a required stop. |
| Setup ends | "Your first plan is ready", then Today | No summary of what the answers did. Nothing says "because you said X, the plan does Y". |
| CuddleCue's log | `useNibble` already reads the household's solids meals | Setup never uses it to pre-answer "have you started" or "which foods". |

The planner itself is good: one new food a day at the first meal, a first allergen only after two
foods are tried and three days apart, keep-going twice a week, iron daily, retries in a new form,
holds after a noticed sign. The problem is the conversation around it, not the engine.

---

## 1. Competitor teardown

### 1.1 The table

| App | Onboarding asks | Why it feels smart or personal | Key features | Free vs paid | Parents love | Parents complain |
|---|---|---|---|---|---|---|
| **Solid Starts** (market leader) | Baby's name, birth date, a vegetable avatar; about 4 steps; it *teaches before it asks* (how to spot a reaction comes before any questions); paywall right after setup with a 7-day trial (UX teardown via search) | Age-aware serving for every food, with **real photos of the food cut for that age** and videos of real babies eating; a guided path through "first 100 foods"; allergen plan "developed with our pediatric allergist" that starts by assessing risk | 400+ food database, 300+ recipes, 100-food guided plan, allergen plan, tracker with notes, favorites, reactions, export for the doctor | Database free. All Access: $19.99/mo, $69.99 to $99.99/yr in the US store; promos to $39.99/yr; separate tracker-only tier | "Great source of information", "a necessity", the food pages, gagging vs choking teaching; Mumsnet's most recommended app | Logging is slow: each ingredient searched and logged separately, no multi-select; glitches, lag, content not loading; meal plan "unintuitive and not personalized enough"; paid tier "just the tracker"; feels overwhelming at first |
| **MadeForMums Baby weaning and recipes** (UK, closest to "week by week") | Baby's name and date of birth, to personalize week-by-week guidance | 26 weekly planners for the first six months of weaning; the week you are in is the week you see | Weekly meal planners, 193 recipes, guides, shopping list, works offline | Free (Heinz partnership at one point) | Free, offline, simple week structure | Dated; small rating counts (3.8 to 4.6) |
| **Annabel Karmel** (UK, long-running) | Not seen | "It's a hit!" or "Try again" on each recipe tracks favorites and foods to retry | 1,250+ recipes, meal planners, shopping lists, allergy tracker for symptoms after foods, 50+ first foods index, audio weaning guide | Free download, subscription after a 7-day trial; 4.6 from 149 ratings | Volume of recipes, a trusted name | Price: a Mumsnet parent found £24.99 too much and asked for alternatives |
| **BLW Meals: Starting Solids** | Not seen | Feeding guide for each age from 6 to 24 months; food library with photos and videos of cuts | 650+ recipes (450+ vegetarian, 200+ vegan), food library, notes, shopping lists, questions for the pediatrician, weekly planner | Free with in-app purchases; 3.9 from 693 ratings ("polarized") | "The amount of free content is really impressive", the planner | "Can get a little repetitive", "pricey", crashes and freezes; one listing archived |
| **Baby Led Kitchen** | None found | Not personalized: a cookbook | 225+ "road-tested" recipes, allergen and diet filters, favorites, add ingredients to a shopping list | **One-time purchase** (about €3.99), no subscription, "no premium content hidden" | Fair price, clear recipes | Not a planner |
| **Feeding Littles: Meal Planner** | Not seen | Shared plan for partner and caregivers, live | Drag-and-drop weekly planner, save recipes from anywhere, "disassembled" meal ideas with photos for baby-led weaning | Free with in-app purchases; 4.9 to 5.0 from under 200 ratings | Family-wide planning | A third-party scan reports analytics and ad SDKs |
| **Huckleberry** (sleep app with solids) | Pick what you track at each stage, "early nursing through first solids" | Solids lives inside the baby's whole day | Solids log with notes and reactions per food | Plus adds "Allergens and Sensitivities" solids reports and "Insights" miniplans | Rated 4.8 to 4.9 from about 30,000 | Solids is "a bit basic"; it is a log, not a plan |
| **Little Spoon** (food delivery) | Stage and allergies for the menu (no quiz confirmed) | A menu by age and stage; filter by diet and allergies | Purées (Babyblends), finger-food trays (Biteables), order management | The food is the product | Convenience | (Commerce, not planning) |
| **Ready, Set, Food!** (allergen powder) | Not an app | A fixed schedule does the thinking: first 12 days introduce peanut, egg, milk, then about six months of maintenance | Mix-in powder from 4 months | Product subscription | "Easy" | Efficacy claims are the company's own (up to 80%); no app |
| **Lil Mixins** (allergen powder) | Not an app | Single-allergen packets, one at a time | Peanut, egg, tree nut and multi mixes, 4 to 12 months | Product | "No crushing nuts yourself", flexible single packets | Texture thick in a bottle |
| **Tiny Spoon: BLW** | Not seen; age drives the plan | "Personalized daily meal plans tailored to your baby's age"; per-child profiles | 30-day plans by month, allergen tracking, AI assistant | Free 30-day plan at 6 months; 7 to 12+ months and special diets paid; $1.99 | (Few reviews) | (Few reviews) |
| **TinyTaste** (two apps by that name) | Not seen | "Personalised cards about your baby's stage: iron windows, texture milestones, what to try next"; new foods badged | Weekly meal plans by stage, reaction tracking, 14 EU allergens | Not confirmed | (New) | (New) |
| **BabyPlate: Starting Solids** | Not seen | Counts repetitions per allergen and spaces new allergens 2 to 3 days apart | Allergen schedule | Not confirmed | (New) | (New) |
| **Little Lunches**, **Noshling**, **ToddlerBites**, **Mealime** (planners) | Ages, tastes, allergies | Plan turns into a grocery list on its own | Grocery list by aisle, de-duplicated across meals, pantry tracking, Instacart and Walmart; Noshling's free tier covers the current week | Subscriptions ($4.99/mo for Little Lunches basic) | The list writes itself | (Toddler and family focus, not first foods) |

Sources for the table are listed in §7.

### 1.2 What the leaders do that NibbleCue does not yet

1. **They show the food.** Solid Starts' signature is a photo of the actual food cut the way it is
   served at that age (broccoli for 6 to 8 months, strawberry slices for 9 to 11, toast for 12 to
   17), plus video of babies eating it. Nothing else in the category is as trusted. NibbleCue has
   178 foods and no pictures.
2. **They teach before they ask.** Solid Starts opens with what a reaction looks like, then asks.
   A parent leaves onboarding knowing something.
3. **The week you are in is the week you see.** MadeForMums and Tiny Spoon are dumb underneath (a
   plan per month) but feel personal because the date of birth picks the week.
4. **The plan becomes a grocery list.** Every planner app that parents keep (Mealime, Little
   Lunches, Noshling, Feeding Littles) turns the week into a list grouped by aisle.
5. **Feedback on a food changes what comes next**, visibly. Annabel Karmel's "It's a hit / Try
   again" is the simple version.

### 1.3 Where NibbleCue can already win (and should say so in the listing)

- **Logging a whole meal in two taps.** Solid Starts' loudest complaint is ingredient-by-ingredient
  logging with no multi-select. NibbleCue's Served, then how it went, is the answer.
- **A plan that really adapts.** Solid Starts' plan is called "not personalized enough". NibbleCue's
  is rebuilt from the log every day: a refused food returns in a new form a week later, an allergen
  with a noticed sign goes on hold.
- **Both parents, one plan, one log, shared with CuddleCue.** No competitor shares a log with a
  baby-care tracker; Huckleberry has the log but no plan.
- **Safety is free.** Allergen tracking, the emergency card and serving guidance are never behind
  the paywall. Solid Starts charges for its allergen plan.
- **Honest price.** Proposed $4.99/mo or $39.99/yr against Solid Starts' $19.99/mo or up to
  $99.99/yr (`docs/DECISIONS.md`, owner to confirm).
- **No ads, no ad SDK.** Feeding Littles is reported to carry ad SDKs.

### 1.4 What not to copy

- **"First 100 foods before 1."** A count with a goal is a target for the baby, which `CLAUDE.md`
  rule 3 and §7 forbid. Count up with no finish line: "23 foods tried".
- **A risk score.** Solid Starts "assesses risk". NibbleCue asks the two facts current guidance
  uses (eczema that keeps coming back, an egg allergy a doctor has confirmed) and states the
  published rule that follows; it never shows a level or a verdict.
- **A paywall at the end of onboarding.** The free plan is a working app (rule 16); the first plan
  is shown in full before any mention of Plus.
- **Selling allergen powders or tying the plan to a product.**

---

## 2. The redesigned setup, question by question

### 2.1 Principles

1. **Ask only what changes the plan.** Every question below names what it changes. A question
   that changes nothing moves to the profile page or disappears.
2. **Ask only what a parent can know.** Before solids, ask about what they have *seen*, never about
   eating. The swallow sign becomes something to watch for on the first tries (§3.3).
3. **Pre-answer from what we already know.** The birth date (CuddleCue), the solids meals already
   in the shared log, the phone's region. Show the pre-answer and let the parent change it.
4. **Show the consequence while they answer.** Every step has a small **plan preview** at the
   bottom ("Day 1: iron-fortified oat cereal, smooth"), recomputed on the phone by `buildPlan` on
   each tap. The planner is pure and fast, so this is cheap. This is the single biggest "smart"
   lever: the parent sees the app think.
5. **Use the baby's name and age in every title.** "Has Ada had any solid food yet?" not "Where
   are you with solids?"
6. **End with a summary that explains itself** (§2.6), then the plan, never a paywall.

### 2.2 What the app knows before the first question

| Known | From | Used for |
|---|---|---|
| Baby's name, birth date, so age in months and weeks | CuddleCue's child record | Every title; which branch; the 4 and 6 month dates; serving band |
| Solids meals already logged, their foods and first date | `useNibble` (CuddleCue `activities` of type `solids`) | Pre-answer Q1, the first-taste date and the foods already tried |
| Region | Phone locale, else CuddleCue's settings | Guidance set (US, UK, CA, AU); shown in the summary with "Change" |
| Who is setting up (parent or caregiver) | Household role | A caregiver can see the plan but not change the profile (rule 10) |

**Age is computed, never asked.** Below, `A` is the baby's age today in completed months.

### 2.3 The flow at a glance

```
A < 4 months ─────────────► "Too young yet" screen (no questions). Setup waits. §3.1
A ≥ 4 months
  Q1 Has Ada had solid food yet?
   ├ Not yet ─────► Q2 Getting started (signs seen + when to start) ► Q3 How to offer ► Q4 Family food ► Q6 Allergens
   ├ Just started ─► (first-taste date inline) ► Q3 How to offer ► Q4 Family food ► Q5 Foods had ► Q6 Allergens
   └ Lots of foods ► (first-taste date inline) ► Q3' Textures now ► Q4 Family food ► Q5 Foods had ► Q6 Allergens
  ► Summary (§2.6) ► Today
```

Five screens on every branch, each one tap or a few ticks. About a minute. Everything has a
default except Q1 (and Q1 is pre-answered when CuddleCue has solids logged).

**Moved out of setup** (to the food profile page and a "Make the plan yours" card, §2.7): region,
meals a day, cuisines, the family allergy switch, foods never to serve, who else feeds the baby,
meal times.

### 2.4 The questions

Copy below is final draft wording. It contains no word from `NIBBLE_BANNED` and no dash inside a
sentence; `pnpm check:copy` must still be run on it.

---

#### Intro (not a question)

- **Title:** "Let's plan Ada's first foods"
- **Body:** "Ada is 5 months and 3 weeks. Five quick questions, then you see Ada's plan. You can
  change any answer later."
- **Teach first** (one short card, like Solid Starts): "Before you start: learn what gagging looks
  like, and what a possible reaction looks like." Opens the existing `gagging-vs-choking` and
  `possible-reaction` cards. Skippable.
- **Button:** "Start"

---

#### Q1. Where Ada is now

- **Asked when:** always, from 4 months.
- **Title:** "Has Ada had any solid food yet?"
- **Options:**
  - "Not yet"
  - "Yes, we have just started"
  - "Yes, Ada eats lots of foods"
- **Inline, when an answer other than "Not yet" is chosen:** "When was Ada's first taste?" A date
  field, not before the day Ada turned 4 months, not after today. Hint: "Roughly is fine."
- **Pre-answer from the log:** if CuddleCue has solids meals for this baby, preselect "just
  started" (or "lots of foods" when the first one is over six weeks ago or 20 or more different
  foods are logged), set the date to the first logged meal, and say so: "We found 4 meals logged
  in CuddleCue since September 12."
- **Default:** none selected unless the log pre-answers. Required.
- **Why we ask:** decides the branch, the stage (`first_foods` for 42 days from the first taste,
  then `expanding`), and whether the plan starts today.
- **Changes in the plan:** `profile.stage`, `profile.startedOn`.
- **Note for `A ≥ 12` and "Not yet":** allowed. The plan starts with first foods in toddler-safe
  forms (the stage is `toddler` by age; the one-new-food rule still holds). No comment on timing.

---

#### Q2. Getting started (only "Not yet")

One screen, two parts. This replaces the readiness question the owner tested.

**Part A: what the parent has seen**

- **Title:** "Which of these have you seen Ada do?"
- **Hint:** "These are the signs published guidance looks for. Tick what you have seen so far."
- **Options (tick any, "None yet" is fine):**
  - "Holds the head steady and upright"
  - "Sits up with a little help, without slumping over"
  - "Grabs toys and brings them to the mouth"
  - "Watches you eat, or reaches for your food"
- **Not asked:** anything about swallowing, pushing food out or opening for a spoon. Those need
  food. They become the first-tries note on day one (§3.3).
- **Why these four:** each can be seen without food and each is in published guidance: head
  control and sitting with support (AAP, CDC, NHS), bringing objects to the mouth and
  eye-hand-mouth coordination (NHS, Solid Starts' "reach and grab"), interest in food (AAP: "watch
  you eating, reach for your food and seem eager to be fed"). The NHS lists chewing fists, waking
  at night and wanting extra milk as *not* signs; we do not ask them.
- **Changes in the plan:** stored as the readiness checklist (`signsSeen`, new field). It sets the
  default of Part B and fills the checklist on Today (§3.2). It never blocks the plan on its own.
- **Default:** none ticked.

**Part B: when to start**

- **Title:** "When would you like to start?"
- **Options:**
  - "Today"
  - "On a day I choose" (date: from the day Ada turns 4 months, up to 90 days ahead)
  - "When I see the signs" (the plan waits; Today shows the checklist)
- **Helper, only when Ada is under 6 months on the chosen day:** "Most babies start around 6
  months. Ada turns 6 months on November 14. If you plan to start before then, check with your
  pediatrician first." (UK: "The NHS suggests starting around 6 months.")
- **Helper, when all four signs are ticked:** "You have seen all four signs."
- **Default:** "Today" when all four are ticked and `A ≥ 6`; "On a day I choose" set to the
  6-month day when `A < 6` and some signs are ticked; otherwise "When I see the signs".
- **Why we ask:** a family plans the first day (a weekend, a calm morning, after shopping). A plan
  that starts on a chosen day lets the app write a first-week grocery list in advance.
- **Changes in the plan:** a new `startOn` (planned start date). `stageFor` returns
  `getting_ready` until `startOn`, then first foods from `startOn`. "Today" sets `startOn = today`.
  "When I see the signs" leaves it null (today's `ready: false`).

---

#### Q3. How to offer food ("Not yet" and "Just started")

- **Title:** "How would you like to offer food to Ada?"
- **Options, each with a photo of the same food in that form (sweet potato):**
  - "On a spoon: purées and mashes"
  - "Finger foods Ada picks up"
  - "Some of each" (default)
- **Hint under the chosen option** (what it changes, live): "Sweet potato comes as soft wedges the
  size of your finger." / "Sweet potato comes mashed, on a preloaded spoon." / "Some days mashed,
  some days soft wedges."
- **Why we ask:** decides the form of every item (`FORM_ORDER[approach]`) and which photo each
  food shows.
- **Changes in the plan:** `profile.approach`.

#### Q3'. Textures now ("Lots of foods" only; replaces Q3)

- **Title:** "What does Ada eat most easily right now?"
- **Options:**
  - "Smooth purées"
  - "Mashed, with soft lumps"
  - "Soft pieces and finger foods"
  - "Most of what we eat, cut up"
- **Why we ask:** a family already eating has a texture. Asking "purées or baby-led" of them is
  asking about the past.
- **Changes in the plan (no new field needed):** smooth = `approach: puree` with
  `holdTexture: true` (the 9-month nudge card still shows); lumps = `puree`, `holdTexture: false`;
  soft pieces = `mix`; most of what we eat = `blw`. This replaces the confusing "Keep the texture
  where it is for now" switch in setup.
- **Default:** by age: under 9 months "Mashed, with soft lumps"; 9 to 11 "Soft pieces and finger
  foods"; 12 and over "Most of what we eat, cut up".

---

#### Q4. Family food (all branches)

- **Title:** "What does your family eat?"
- **Options (one):** "Everything" (default), "Vegetarian", "Vegan", "Pescatarian"
- **Second row, "Any of these?" (tick any):** "Halal", "Kosher", "No beef", "No pork", "No
  shellfish", "Jain"
- **Collapsed link:** "Add the foods you cook at home" opens the cuisine chips. Optional; also
  offered again after setup.
- **Live line for vegan:** "Iron in Ada's plan comes from beans, lentils, tofu and fortified
  cereal, with a vitamin C food beside it." (Fact about the plan, sourced to HealthLink BC and
  CDC iron.)
- **Why we ask:** the plan must never offer a food the family does not eat. Changes egg, fish and
  meat carriers for allergens too (a vegan family's egg is passed over, as the planner already
  does).
- **Changes in the plan:** `diet`, `rules`, `cuisines`.

---

#### Q5. Foods Ada has had ("Just started" and "Lots of foods")

This is the missing question. `triedBefore` has no screen today.

- **Title:** "Which foods has Ada had?"
- **Hint:** "Tap the ones Ada has tried. Skip any you are not sure of."
- **Content:** a grid of about 24 photo tiles of the most common first foods, filtered by Ada's
  age band and the family's diet (sweet potato, avocado, banana, oat cereal, carrot, squash, peas,
  pear, apple, broccoli, egg, yogurt, beef, chicken, salmon, lentils, beans, tofu, toast, pasta,
  oatmeal, mango, peach, blueberries), then "Search for more".
- **Pre-ticked:** every food found in CuddleCue's solids log, labeled "From your log".
- **"Lots of foods" helper button:** "Tick all the fruits and vegetables" (most families who say
  "lots" have done these). One tap, then untick.
- **Why we ask:** without it, the plan gives "A first taste of banana" to a baby who eats banana
  every day. It also unlocks allergens at once (the planner waits for two tried foods).
- **Changes in the plan:** `triedBefore`. New foods are only foods not in the list.
- **Default:** only what the log shows.

---

#### Q6. Allergens (all branches)

One screen, up to four short parts, in this order.

**a. A doctor's word**

- **Title:** "Has a doctor told you Ada has a food allergy?"
- **Options:** "No" (default), "Yes"
- **On "Yes":** "Which foods?" with the allergen chips (egg, peanut, milk, wheat, soy, sesame, tree
  nuts expanding to each nut, fish, shellfish). Hint: "These are never planned, whatever else is
  set."
- **Changes:** `diagnosed` (field name unchanged; never shown). An egg answer also sets the peanut
  wait (`higherPeanutRisk`).

**b. Eczema**

- **Title:** "Does Ada have eczema?"
- **Options:**
  - "No" (default)
  - "Yes, mild, or it comes and goes"
  - "Yes, a lot, and it keeps coming back even with prescription creams"
  - "Not sure"
- **Mapping:** no = `none`; mild = `mild_moderate`; a lot = `severe` (the NIAID addendum's
  definition: persistent or frequently recurring, needing prescription creams); not sure =
  `mild_moderate`, with the line "You can change this after your next visit."
- **On "a lot" (or an egg answer in part a):** the existing card, reworded: "With eczema like
  this, guidance says to talk to your pediatrician before peanut. Peanut waits in Ada's plan until
  you tell us they said yes. The other allergens follow the plan."
- **Changes:** `eczema`; peanut waits via `higherPeanutRisk`.

**c. Allergens already offered ("Just started" and "Lots of foods" only)**

- **Title:** "Which of these has Ada had?"
- **Chips:** "Egg", "Peanut", "Milk (yogurt, cheese)", "Wheat (bread, pasta)", "Soy (tofu)",
  "Sesame (tahini)", "Tree nuts" (expands), "Fish", "Shellfish"
- **Pre-ticked:** any allergen inside a food ticked in Q5 or found in the log ("Yogurt counts as
  milk"). This is computed from `foods.data.ts` `allergens`.
- **Changes:** `introducedBefore`. Ticked ones go straight to "keep going" (about twice a week);
  the rest are introduced one at a time in the family's order.

**d. How to introduce them**

- **Title:** "How would you like to introduce allergens?"
- **Options:**
  - "One at a time, starting soon" with the hint "Current guidance is to introduce common allergens
    early and often." (default)
  - "Only the ones my pediatrician says yes to" with the hint "You mark each one as approved, from
    that day."
  - "Not now" with the hint "No allergen is offered for the first time. You can change this any
    time."
- **Changes:** `allergenMode`.

**Removed from this screen:** "A parent or sibling has a food allergy". It changes nothing in the
plan (current guidance does not delay introduction for family history alone), so it moves to the
food profile page under "For the pediatrician summary".

### 2.5 Questions removed, and where each answer now comes from

| Old question | Now | Reason |
|---|---|---|
| "Can your baby do all of these?" (with the swallow item) | Q2 Part A, observable signs only; swallow becomes a first-tries note | A parent cannot know it before food |
| "When did you start?" alone on step 1 | Inline under Q1, pre-filled from the log | One screen fewer |
| "Your family's diet" + "Any of these?" + "Foods your family cooks" | Q4, cuisines collapsed | Cuisines only nudge; optional |
| "A parent or sibling has a food allergy" | Profile page | Changes nothing in the plan |
| "Where you live" | Read from the phone; shown in the summary with "Change" | Changes only guidance cards |
| "Meals a day" | Follows the stage; editable on the profile page | A new parent cannot judge it |
| "Keep the texture where it is for now" | Q3' for families already eating; profile page otherwise | Plain-language texture answer instead |

### 2.6 What the app says back: the setup summary

After Q6, before Today, one screen titled **"Ada's plan is ready"**. Every line is computed from
`buildPlan` over the first 14 days and the profile, so it is true and specific. No model. Lines
that do not apply are left out.

```
Ada's plan is ready

Starts today, Wednesday, October 8. Ada is 6 months and 2 weeks.          (or: Starts Saturday, October 11.)

FIRST WEEK                                                                  [photo strip, one per day]
  Wed  Iron-fortified oat cereal, smooth            New
  Thu  Sweet potato, soft wedges                    New
  Fri  Avocado, mashed                              New
  Sat  Egg, well cooked and mashed into oatmeal     First allergen
  Sun  Avocado and oat cereal                       No new food the day after an allergen
  Mon  Broccoli, soft florets                       New
  Tue  Peanut, a thin smear of smooth peanut butter First allergen

ALLERGENS
  Egg starts Saturday, once Ada has had two foods. Then one new allergen every few days,
  in this order: peanut, milk, wheat, soy, sesame, fish. [Change the order]
  Each one stays in the week, about twice a week, once it is started.
  (if peanut waits) Peanut waits until you tell us your pediatrician said yes.

BECAUSE YOU TOLD US
  Finger foods and spoon: foods alternate between soft wedges and mashes.
  Vegetarian: no meat or fish in the plan. Iron comes from lentils, beans, tofu and fortified cereal.
  Ada has tried 6 foods: the plan will not offer them as new.

FOR THE FIRST WEEK, 7 THINGS TO BUY                          [Add to grocery list]
  Oat cereal (iron-fortified), sweet potato, avocado, eggs, broccoli, smooth peanut butter, oatmeal

Using US guidance (AAP, CDC). [Change]
General guidance, not medical advice.

[See today]
```

Rules for the summary:

- "New" means first time on the plan; "First allergen" says which allergen.
- The "Because you told us" block repeats at most three answers, each with its effect.
- Allergen order comes from `allergenOrder(profile.allergenOrder)`; dates come from the plan days
  where `firstAllergen` is set.
- The grocery block is §4's list for days 1 to 7 (or the planned start week). On the free plan it
  shows today and tomorrow and says "With NibbleCue Plus, the whole week" only if the owner keeps
  that gate (§4.4).
- No numbers about the baby beyond age and counts of what was ticked or logged.
- For "When I see the signs", the summary is shorter: the checklist, the date Ada turns 6 months,
  and "When you are ready, tap Start on Today and the first week appears here."

### 2.7 After setup: "Make the plan yours"

A dismissible card on Plan from day two, listing the optional answers that were taken out of
setup, each one tap away: "Foods you cook at home", "Foods never to serve", "Who else feeds Ada"
(daycare, grandparents, nanny: turns on the caregiver sheet and, in a later version, marks
weekday lunch as "at daycare" so new foods and allergens stay at home meals), "Meal times",
"Region". It disappears when all are visited or dismissed.

### 2.8 Data model changes this needs

| Change | Where | Note |
|---|---|---|
| `startOn: IsoDate \| null` (planned start, may be future) | `NibbleProfile` | `stageFor`: before `startOn` is `getting_ready`; from it, first foods. Property test: no plan item before `startOn` or before 4 months |
| `signsSeen: ('head' \| 'sits' \| 'mouthing' \| 'interest')[]` with the day each was ticked | `NibbleProfile` | Feeds the Today checklist; never gates the plan alone |
| Derive `ready` from `startOn` | `stage.ts` | Keep the field for old records |
| UI for `triedBefore` | Q5 and the food profile page | Already read by the planner |
| Remove `familyAllergy` from setup | `FoodProfileScreen` | Keep the field for the summary |
| Region default from locale | `useNibble` | Shown, not asked |
| Plan preview component | setup steps | `buildPlan` with `days: 7`, read only |

---

## 3. What Today and Plan do in each starting state

### 3.1 Too young (under 4 months)

- **Setup:** no questions. One screen: "Solid food is for later. Ada is 2 months and 1 week. Most
  babies start around 6 months, which for Ada is March 14. Until then, milk is everything." Button
  "Remind me when Ada turns 4 months" (a local reminder), and a link "Answer the family questions
  now" (Q4 and Q6 a, b only, optional).
- **Today:** the same card, with the two dates as a small timeline (4 months: earliest; about 6
  months: most babies). The Foods library is open to browse. No plan, no grocery list.
- **On the 4-month day:** the reminder opens setup at Q1.

### 3.2 4 to 6 months, not started (or any age, "When I see the signs")

Today becomes a **getting-ready page** instead of an empty one.

1. **Readiness checklist** (tickable, the four Q2 signs, each with a one-line "what it looks like"
   and a small illustration). Ticking stamps the day. Title: "Signs you have seen". When all four
   are ticked: "You have seen all four signs. Pick a day to start?" with "Today" and "Choose a
   day". The app never says "Ada is ready"; it reports what the parent ticked.
2. **Countdown line:** "Ada turns 6 months on November 14, in 3 weeks."
3. **A preview of week one**, greyed and labeled "If you start on Saturday", from `buildPlan` with
   a hypothetical start. This makes the app useful before the first bite.
4. **Get ready list** (things to have, not food): "A high chair or a seat where Ada sits upright",
   "A small soft spoon", "An open cup or a straw cup", "A bib or two". One tap "Add to grocery
   list". From the `seated-and-supervised` and `first-cup` cards.
5. **Learn before day one**: three cards in order: gagging vs choking, what a possible reaction
   looks like (with the emergency card link), how much to offer at first.
6. **"We have started"** stays, now opening a date picker (default today) instead of writing
   today silently.

### 3.3 Ready, starting today or on a chosen day: the first-day moment

On the start day, Today opens with a **first-day card** above the meals:

- **Title:** "Ada's first food day"
- **The food:** one large photo of the planned first food in its form, with how to serve it
  ("Mash with a fork until smooth, thin with breast milk or formula").
- **Before you start** (ticks, not stored, just a calm moment): "Ada sits upright, in a high chair
  if you have one", "You stay within arm's reach", "Start with a teaspoon or two; Ada decides how
  much".
- **On the first tries** (this is where the swallow sign lives, phrased as something to watch,
  sourced to HealthyChildren): "Watch whether Ada moves the food back and swallows. If most of it
  comes back out, that is common at first. Try a thinner mash, or try again in a week or two."
- **After Served:** a quiet moment, not confetti: "First food: sweet potato, Wednesday, October 8.
  Saved to Ada's firsts." The first is kept for the pediatrician summary ("First tried") and shows
  on the food's history.
- **Then:** "Tomorrow: avocado, mashed. New."

### 3.4 Just started (a few tastes)

- Stage is `first_foods` for 42 days from the first-taste date, then `expanding` (unchanged).
- Foods ticked in Q5 never come back as "new"; they fill other meals as familiar foods.
- Allergens start as soon as two foods are known; the first allergen is planned for the next day
  that fits the three-day spacing.
- Today's header: "Day 9 of solids. 6 foods tried." (counts only, no goal).
- After each log, one consequence line in the toast (all computed from the planner's next run):
  - Loved it or liked it: "Sweet potato comes back Friday."
  - Didn't like it: "Sweet potato comes back next Wednesday, as soft wedges this time."
  - First allergen logged with no note: "Egg is now part of the week, about twice a week."
  - Something noticed after an allergen: the existing hold text.

### 3.5 Eating lots of foods

- Stage is `expanding` (or `family_foods` from 9 months, `toddler` from 12) from day one.
- Q5 matters most here: the plan's "new" items are only foods not ticked. If fewer than 10 foods
  are ticked, Today shows a one-time card: "Add more of the foods Ada eats, so the plan only offers
  what is new." with the Q5 grid.
- Allergens ticked in Q6 c are "keep going" from day one; the plan shows "Egg: offered this week 0
  of 2" style counts (counts of what is logged, not targets for the baby).
- The texture answer from Q3' sets forms; the 9-month texture card stays a nudge.
- Weekly recap on Plan, Mondays: "Last week: 4 new foods, peanut started, 3 foods Ada loved."

### 3.6 State summary

| State | Today shows | Plan tab | Grocery from plan |
|---|---|---|---|
| Under 4 months | Timeline card, reminder | Empty with the same timeline | None (get-ready list only from 4 months) |
| 4 months and over, not started, no date | Checklist, countdown, week-one preview, get-ready list, learn cards | Preview, greyed | Get-ready list; food list for the preview week on tap |
| Start day chosen, in the future | Countdown to the day, week-one preview, "Shop for the first week" | Preview from that day | First week, dated |
| Start day (day 1) | First-day card, then meals | Live plan | Live |
| Just started | Meals, "Day N of solids", consequence toasts | Live plan | Live |
| Eating lots | Meals, allergen keep-going counts, weekly recap | Live plan | Live |

---

## 4. Grocery list from the meal plan

### 4.1 How competitors do it

| App | How the list is made | Grouping | Quantities | Already at home | Sharing |
|---|---|---|---|---|---|
| Mealime | Combined from the week's recipes | Store department | Recipe quantities, combined | Check off by hand | (Single user) |
| Little Lunches | From planned meals | Not confirmed | Recipe quantities | **Pantry tracking**; Instacart and Walmart delivery | Not confirmed |
| Noshling | From the plan, **de-duplicated across meals** | Category | Not confirmed | Not confirmed | Export (paid) |
| ToddlerBites | From recipes | **Aisle**, "pantry-aware" | Recipe quantities | Pantry-aware | Share by code |
| Feeding Littles | From the planner | Aisle (unconfirmed) | Not confirmed | Reusable staples lists | **Shared list, real time** |
| MadeForMums, Ella's Kitchen, Annabel Karmel, Baby Led Kitchen | From recipes or weekly planners | Simple list | Recipe quantities | No | Ella's: emailed list |
| Solid Starts | No grocery list found | | | | |

Lesson: parents keep planners whose list writes itself, is grouped the way a store is walked, and
is shared. Baby-food apps mostly copy recipe quantities, which NibbleCue must not (rule 3).

### 4.2 What is already being built

An uncommitted change in this working tree (by another session, 2026-10-08) adds
`packages/core/src/nibble/grocery.ts` (`planGroceries`) and
`apps/mobile/src/screens/nibble/FromPlanCard.tsx` on the CuddleCue grocery list (renamed from
"Shopping list"): each planned food once, grouped into six aisles, with the first day it is
needed and a meal count, "Add all" or one tap per food; two days free, a week with Plus. The spec
below builds on that and should be checked against it once it lands.

### 4.3 Spec for NibbleCue

**Source and window**

- Built from `buildPlan` output for the window the family sees (free: today and tomorrow; Plus: 7
  days; the owner decides, §4.4). For a future start day, the window begins on the start day.
- Skipped days are left out; a parent's pins are included; a food the parent took off a meal is
  not.
- Never includes a held allergen, a doctor-confirmed one or a never-serve food (the plan already
  excludes them; the list re-checks, so a stale list line cannot carry one).

**One line per thing to buy**

- De-duplicate by food id across every meal and day. Then match against lines already on the
  grocery list by name (`foodKey`), so "Bananas" typed by hand and the plan's "Banana" are one.
- A **buy name** per food where the store name differs from the food name (new optional
  `buyAs` in `foods.data.ts`): "Peanut powder" → "Peanut powder or smooth peanut butter";
  "Egg" → "Eggs"; "Iron-fortified oat cereal" → "Baby oat cereal (iron-fortified)";
  "Canned light tuna" → "Canned light tuna". A short **buying note** where it matters for safety
  or the plan: peanut butter "smooth, no added salt or sugar"; yogurt "plain, whole milk";
  cereal "iron-fortified". Never a brand.
- Two foods that are one purchase share a line when `buyAs` matches (a later version can group
  "Apple" and "Applesauce" under "Apples").

**Grouping by aisle** (in store-walking order)

| Aisle | Categories |
|---|---|
| Fruits and vegetables | vegetable, fruit, fresh herbs |
| Bread and grains | grain (bread, pasta, rice, tortillas, couscous) |
| Baby aisle | iron-fortified cereals, pouches, jars, puffs (per-food override) |
| Meat and fish | meat, fish, shellfish |
| Dairy and eggs | dairy, egg, plant yogurts |
| Pantry | beans and lentils (dry or canned), nut and seed butters, oils, spices, tahini |
| Frozen | per-food override where frozen is the usual buy (peas, berries, edamame) |
| Drinks | soy milk to drink (12 months on); never water |

A per-food `aisle` override in `foods.data.ts` handles the exceptions; the category default
covers the rest (the in-progress `AISLE_OF` map is that default).

**Quantity: words only**

- Never grams, ounces, servings or portions, and never anything derived from what the baby
  "should" eat.
- Each line shows **which days need it** instead: "For Wed, Sat". This is more useful to a shopper
  than a number and says nothing about the baby.
- Optional count word, computed from the number of meals and the food's shelf type: one meal, or
  any pantry or jar item, shows "1"; two or more meals of a fresh food show "a few". Nothing else.

**First-day flags**

- A food carrying a first allergen gets "For egg's first day, Saturday", so it is bought in time.
- The first food of the first day gets "For Ada's first food day".

**Already at home**

- Each line has "We have it". For fresh food it hides the line for this window. For pantry items
  (oils, spices, cereals, nut butters, dried beans) it links to CuddleCue's **Supplies** ("What you
  buy again and again"): the item is marked in stock and stays off the list until someone taps
  "Ran out" or a supply forecast says it will run out. One source of truth, no second pantry
  (rule 12, log once).
- Lines bought on the grocery list (checked) count as at home for the rest of the window.

**Adding and sharing**

- "Add all" puts every visible line on the shared grocery list (one list, both apps, both parents,
  real time through CuddleCue's sync). "Add" per line. Already-listed lines show "On the list".
- The list line carries the note ("For Wed, Sat") so it reads correctly in CuddleCue too.
- Works offline; writes go through `commitWrite` like every list line.

**Copy (draft)**

- Card title: "From Ada's plan"
- Lede: "What the plan offers in the next 7 days. Tap to add."
- Line: "Sweet potato · For Wed, Sat"
- Button: "Add all 7"; done toast: "7 foods added to the grocery list"
- Empty: "Everything in the plan is on your list or at home."

### 4.4 Decision for the owner

The bill of rights keeps "the shopping list" free. The in-progress card gives the free plan two
days of plan foods and Plus a week. A family shops weekly, so two days may read as a trap. Options:
(a) free sees the week's list for the foods on today's and tomorrow's plan only (current); (b) the
list is free for 7 days and only the plan view is Plus. Recommended: **(b)**, because the list is
the free plan's best proof that the plan works, and the Plus value is shaping the plan, not
seeing it.

---

## 5. Food photos

### 5.1 How competitors show food

- **Solid Starts:** real photographs of each food prepared and cut the way it is served at each
  age band, plus videos of real babies eating; the age label sits on the photo. This is the
  category's trust signal.
- **BLW Meals:** a food library with photos and videos on cutting and preparing for finger foods
  or spoon-feeding.
- **Feeding Littles:** "disassembled" meal photos (the family meal broken into baby-safe parts).
- **Recipe apps** (Annabel Karmel, Baby Led Kitchen, Ella's Kitchen): styled finished-dish photos.
  Pretty, but they do not show size or cut, which is what a new parent needs.

NibbleCue's food page already has `serving[band].how` text and a choking note for each of the
178 foods. A photo of that exact text is what is missing.

### 5.2 The image spec

**One photographic style for every food, so the library reads as one system.**

| Property | Spec |
|---|---|
| Angle | Straight overhead (90 degrees), centered |
| Surface | Warm off-white linen or paper texture, close to the theme's page color (CuddleCue `#F6F3EC`); the same surface in every image |
| Plate | One round, matte, pale stone-colored ceramic plate, no rim pattern, about 70% of the frame. Purées and mashes in one small matching bowl on the plate |
| Scale reference | The same pale wooden baby spoon (about 13 cm) at the lower right of every image, so size is readable at a glance. Required for finger shapes; it is the size cue Solid Starts gets from hands |
| Light | Soft natural daylight from the upper left, soft short shadow, no hard highlights, no flash look |
| Color | True to life, no filters, no saturation boost (a parent compares with the real food) |
| Content | Only the food in the form the plan serves at that band, in the quantity a parent would put down for one try (two or three pieces, or a small spoonful). No garnish, sauce, props, text, logos, packaging or brands |
| People | No people, no babies, no hands. Avoids consent and likeness questions and keeps the set uniform |
| Format | Square 1:1. Master 1600 px PNG. Shipped as WebP: 640 px (food page) about 40 KB, 160 px (list tile) about 6 KB |
| Naming | `food-<id>-<band>.webp`, for example `food-sweet-potato-6-8.webp`. A placeholder file has `placeholder` in its name (CuddleCue's rule) |
| Variants | One per band where the form changes: always `6-8`; `9-11` and `12-17` when `serving[band].how` differs; `18-24` reuses `12-17` |

**Weight and delivery** (the owner wants light builds): 178 foods, about 330 images at 640 px is
about 13 MB, too much to bundle. Bundle the 160 px tiles for the 40 most-planned first foods
(about 250 KB) and the setup photos; load the rest from the shared server's storage on first view
and cache on the phone. With no network, the tile falls back to a category icon, never a broken
box.

**Accuracy rule (safety).** A photo is a serving instruction. Each image must match the food's
`serving[band].how` and `forms` exactly (shape, size against the spoon, skin and pits removed,
round foods quartered), and is checked by a person against that text before it ships. A photo that
shows a high-choking-risk food in a form the validator refuses (whole grapes, coin-cut carrot,
a spoonful of nut butter) must never ship. Add a test that every shipped image id has a matching
food, band and recorded review date.

**Photographed or generated.** Real photography of 330 plates is a two to three day shoot for one
food stylist and photographer with a fixed rig, and is the most trustworthy. Generated images are
faster but often get sizes, textures and counts wrong; if used, every image goes through the same
human review and the store listing must not imply they are photographs of real servings if they
are not. Recommended: photograph the 60 foods most planned in the first six weeks (both bands),
generate or shoot the rest in a second pass. This is an owner decision (cost).

### 5.3 Per-food prompt template

For an image model or as a shot brief for a photographer. Fill the braces from `foods.data.ts`.

```
Overhead food photograph, camera directly above, square 1:1.
Subject: {food.name}, prepared for a baby aged {band label, e.g. "6 to 8 months"}:
{serving[band].how}
Form: {form phrase from the table below}.
Quantity: {"two or three pieces" for finger shapes | "one small spoonful in a small bowl" for purée, mash, lumpy, minced | "a thin layer" for spread | "stirred into {carrier} in a small bowl" for mixed_in}.
Set on one round matte pale stone-colored ceramic plate filling about 70% of the frame,
on a warm off-white linen surface (#F6F3EC).
A pale wooden baby spoon, about 13 cm long, lies at the lower right of the plate for scale.
Soft natural daylight from the upper left, soft short shadow, true-to-life color.
No garnish, no sauce, no other foods, no text, no logo, no packaging, no hands, no people.
Must show: {safety detail, e.g. "grapes quartered lengthwise", "pit and skin removed",
"pieces the length of an adult finger", "smooth peanut butter spread very thin"}.
Must not show: {the refused forms, e.g. "whole grapes", "round coin slices", "a lump of nut butter"}.
```

| Form | Form phrase |
|---|---|
| `puree` | "smooth purée, spoonable, no lumps" |
| `mashed` | "mashed with a fork, soft and thick" |
| `lumpy` | "mashed with small soft lumps" |
| `soft_stick` | "soft-cooked sticks about the length and width of an adult finger, squishable between finger and thumb" |
| `finger` | "small soft pieces about the size of a chickpea, for a pincer grasp" |
| `minced` | "finely minced, moist" |
| `chopped` | "chopped into small bite-sized soft pieces" |
| `family` | "cut-up family food, soft pieces" |
| `spread` | "spread very thinly on a toast strip" |
| `mixed_in` | "a small amount stirred into a food already tried, such as oatmeal or yogurt" |
| `drink` | "a small open cup or straw cup with a little of the drink" |

**Example, filled** (`avocado`, `6-8`, `soft_stick`): "Overhead food photograph... Subject:
avocado, prepared for a baby aged 6 to 8 months: ripe avocado in spears, skin and pit removed.
Form: soft spears about the length and width of an adult finger. Quantity: two spears... Must
show: skin and pit removed, spear shape. Must not show: small cubes."

Also needed: three photos for Q3 (sweet potato as purée, mash and soft wedges) and the four
readiness illustrations for Q2 and the Today checklist (simple line drawings, not photos of
babies).

---

## 6. Ready to market: a prioritized checklist

Honest about today. "Must" means a parent or a reviewer would notice its absence in the first
session; "Later" means it improves the product after launch.

### Must have before marketing

| # | Item | Status today | Size |
|---|---|---|---|
| 1 | **Setup rewrite** (§2): branch on Q1 and age; observable signs only before food; planned start date; Q5 foods already had; Q3' textures for families already eating; region and meals a day not asked | Readiness asks about swallowing; no future start; no tried-foods screen | Medium |
| 2 | **Live plan preview on each setup step** (§2.1 point 4) | None | Small |
| 3 | **Setup summary** "Ada's plan is ready" (§2.6) | One line "Your first plan is ready" | Medium |
| 4 | **Getting-ready Today** (§3.2): tickable checklist, countdown, week-one preview, get-ready list, learn cards | One card and a "We have started" button | Medium |
| 5 | **First-day moment** (§3.3) with the first-tries note | None | Small |
| 6 | **Consequence toasts after a log** (§3.4) | Generic "Breakfast logged" | Small |
| 7 | **Grocery list from the plan** (§4): aisles, days, first-day flags, "we have it" linked to Supplies, de-duplication | In progress (uncommitted `grocery.ts`, `FromPlanCard.tsx`) | Small to medium |
| 8 | **Photos for the first 60 foods**, both early bands, plus the three Q3 photos and four readiness drawings (§5) | No images at all | Owner cost and a shoot |
| 9 | **Property tests updated**: no plan item before `startOn` or 4 months; tried-before foods never "new"; held, confirmed and never-serve foods never on the grocery list | Planner tests exist; new fields untested | Small |
| 10 | **Copy pass** of all new strings through `pnpm check:copy` (no banned word, no dash, US English, sentence case) | n/a | Small |
| 11 | **Owner items** in `docs/DECISIONS.md`: bundle id, URL scheme, EAS project, prices and product ids, legal text approval; a release build refuses to run while any is proposed | Waiting on the owner | Owner |
| 12 | **Store listing**: screenshots of the summary, a food page with photo, the plan, the grocery list, the allergen page; a subtitle naming the plan and allergens; no "100 foods" goal | Not made | Small |
| 13 | **Real-life scenario tests** the owner trusts: a 5-month-old not started choosing a Saturday start; a 7-month-old just started with 6 foods logged in CuddleCue; a 10-month-old eating lots, vegetarian, with severe eczema; twins with different answers; a caregiver seat viewing | Not run for the new flow | Medium |

### Later (after launch)

| Item | Why later |
|---|---|
| Photos for the remaining foods and the 12 to 17 band | The first 60 cover the first weeks |
| "Who else feeds Ada" changing weekday lunch to "at daycare" | Needs a plan rule and tests |
| Short videos of cuts (no babies), like Solid Starts' | Cost; photos first |
| Weekly recap on Plan (§3.5) | Nice, not first-session |
| Grocery delivery handoff (Instacart, Walmart) | Partner and privacy work |
| Recipes that combine planned foods (family meal, baby portion) | Content cost; must pass the validator |
| Born early: plan by corrected age, offered as "Was Ada born early?" on the profile page | Needs guidance sourcing (NHS: look for the same signs) |
| Region-specific readiness copy for CA and AU | US and UK first |

### What NibbleCue lacks today, in one list

1. A readiness question a parent can answer before food.
2. A way to say "we start on Saturday".
3. A way to say which foods the baby already eats (so "eating lots" families get first tastes of
   banana).
4. Any picture of any food.
5. A moment where the app explains what the answers did.
6. A first-day moment.
7. A useful page for the weeks before starting (Today is a single card).
8. A grocery list from the plan (being built now).
9. Store screenshots and listing copy.
10. The owner's identifiers and prices.

---

## 7. Sources

Official guidance (readiness and allergens)

- AAP, HealthyChildren.org, Starting solid foods (interest in food; tongue thrust seen when a
  spoon is offered, "wait a week or two and try again"; around 6 months):
  https://healthychildren.org/English/ages-stages/baby/feeding-nutrition/Pages/Starting-Solid-Foods.aspx
- AAP, When to introduce egg, peanut butter and other common allergens:
  https://www.healthychildren.org/English/healthy-living/nutrition/Pages/when-to-introduce-egg-peanut-butter-and-other-common-food-allergens-to-your-baby-food-allergy-prevention-tips.aspx
- CDC, When, what and how to introduce solid foods:
  https://www.cdc.gov/infant-toddler-nutrition/foods-and-drinks/when-what-and-how-to-introduce-solid-foods.html
- NHS three signs, as reproduced by NHS Wales (Betsi Cadwaladr): sit and hold head steady,
  coordinate eyes, hands and mouth, swallow food; chewing fists, night waking and extra milk are
  not signs: https://bcuhb.nhs.wales/health-advice/best-start/introducing-solid-foods/why-wait-until-6-months-before-giving-your-baby-solid-food/accordion/three-signs-your-baby-is-ready-for-solids
- Leeds Community Healthcare NHS, Starting solid food (same signs; born early, look for the same
  signs): https://leedscommunityhealthcare.nhs.uk/our-services-a-z/0-to-19-public-health-integrated-nursing-service-0-to-19-phins/pregnancy-and-your-new-baby/starting-solid-food/
- NIAID addendum guidelines for peanut (severe eczema definition, egg allergy):
  https://www.aafp.org/afp/2017/0715/p130
- ASCIA, How to introduce solid foods FAQ:
  https://www.allergy.org.au/images/pcc/ASCIA_PCC_How_to_introduce_solid_foods_FAQ_2020.pdf
- Solid Starts, Readiness (sitting with minimal support, head control, reach and grab, interest):
  https://www.solidstarts.com/readiness
- Solid Starts, Safe food sizes and shapes by age:
  https://www.solidstarts.com/safe-food-sizes-shapes-for-babies/

Competitors

- Solid Starts app page: https://solidstarts.com/solid-starts-app-new-first-100-foods/
- Solid Starts promo pricing: https://promo.solidstarts.com/
- Solid Starts App Store listing (pricing tiers): https://apps.apple.com/dz/app/solid-starts/id1564189151
- Solid Starts UX teardown (onboarding, avatar, paywall): https://screensdesign.com/showcase/solid-starts-baby-first-foods
- Solid Starts reviews (ingredient-by-ingredient logging): https://justuseapp.com/en/app/1564189151/solid-starts-baby-first-foods/reviews
- Solid Starts editorial review: https://grand-screen.com/apps/solid-starts-baby-food-app/
- Solid Starts Trustpilot: https://uk.trustpilot.com/review/solidstarts.com?page=8
- Solid Starts complaints: https://www.complaintsboard.com/solid-starts-b148810
- Mumsnet, baby weaning thread (Solid Starts recommended): https://www.mumsnet.com/talk/parenting/5125026-baby-weaning
- Mumsnet, weaning apps thread (Annabel Karmel price): https://www.mumsnet.com/talk/weaning/5321914-weaning-apps
- MadeForMums Baby weaning and recipes: https://apps.apple.com/gb/app/baby-weaning-and-recipes/id1179350331
- Annabel Karmel Kids Recipes: https://apps.apple.com/gb/app/annabel-karmel-kids-recipes/id409157308
- BLW Meals: Starting Solids: https://apps.apple.com/us/app/id1540196240 and https://grand-screen.com/apps/blw-meals-starting-solids/
- Baby Led Kitchen: https://apps.apple.com/gb/app/baby-led-kitchen/id1433931519
- Feeding Littles: Meal Planner: https://appgoblin.info/apps/6746174019
- Huckleberry tracking: https://huckleberrycare.com/product/tracking
- Little Spoon app: https://apps.apple.com/us/app/id6744023739
- Ready, Set, Food! profile: https://thingtesting.com/brands/ready-set-food
- Lil Mixins: https://www.foodnavigator-usa.com/Article/2018/08/27/Lil-Mixins-makes-early-introduction-of-potential-allergens-easy-for-parents
- Tiny Spoon: https://apps.apple.com/us/app/tiny-spoon/id6754613061
- TinyTaste: Baby Nutrition: https://apps.apple.com/app/id6760778450
- BabyPlate: https://apppricinglab.com/app/apple/6744701507
- Ella's Kitchen First Foods app: https://www.motherandbaby.co.uk/family-life/food/get-the-new-ella-s-kitchen-first-foods-app
- Yummy Toddler Food (website, not an app): https://yummytoddlerfood.com/

Grocery list references

- Mealime: https://unanswered.io/guide/mealime-app-review-free-features-pricing
- Little Lunches: https://apps.apple.com/app/id1572670746 and https://mother.ly/food/meal-planning-shopping/little-lunches-app-review
- Noshling: https://apps.apple.com/app/id6750666079
- ToddlerBites: https://chrome-stats.com/d/id6757379526
