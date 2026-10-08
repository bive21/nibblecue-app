# NibbleCue: what it is and how it works

*Written 2026-10-08 from the owner's answers to the kickoff and the v0.3 spec (used as a
reference, as the owner asked: "use this only as a reference, you still need to design the app
yourself"). Owner decisions are in `docs/DECISIONS.md`.*

## In one paragraph

NibbleCue is the solid-food companion to CuddleCue: a day-by-day plan of what to offer a baby,
from the first bite to toddler meals, that changes as the family logs how each food went. A parent
opens it to see today's meals, taps **Served** and how it went, and the plan moves on: new foods
one at a time, the common allergens introduced in order and kept going, iron every day, a refused
food back a week later in a new form. It shares CuddleCue's account, family and log, so a meal
logged in either app is one entry in both. It looks and feels like CuddleCue; its main color is
orange where CuddleCue's is blue.

## The first three things a parent does

1. **See today's meals** on Today: each meal with its foods, how to serve each one at this age,
   and why it is there ("A first taste of egg", "Back in a different form").
2. **Log a meal in two taps**: Served, then how it went (Loved it, Liked it, Not sure, Didn't
   like it). The whole meal at once, or per food.
3. **Follow the allergens**: which are introduced, which are kept going this week, which wait.

## Tabs (CuddleCue's tab bar, same look)

| Tab | What it holds |
|---|---|
| **Today** | Today's meals from the plan, the serve flow, one guidance card for the stage, allergens due this week, a "Something you noticed" button, tomorrow at a glance. The raised **+** in the bar opens CuddleCue's own meal sheet to log anything else. |
| **Plan** | The next 14 days, meal by meal, with "why" on every item. Pin a food, remove one, skip a day. A strip of what is changing this week (texture step, cups, a new allergen). |
| **Foods** | The library: search, filters (first foods, allergens, iron-rich, not tried yet), each food with how to serve it at this age, the choking note, its allergens, and this baby's history with it. Add your own food. |
| **Grocery** | CuddleCue's shopping list, the same list (one list, both apps), opening on the plan's foods by aisle for the next seven days: each one tap from the list, or "Add all". With NibbleCue Plus, choose the days. |
| **More** | Allergens, Something you noticed (history), Milk and drinks, Caregiver sheet, Pediatrician summary, Baby's food profile, Family, Supplies, NibbleCue Plus, Help, About. Appearance, Account and privacy (with Download your data) and Sign out are in the account menu behind the avatar, as in CuddleCue. |

## Setup

A parent who already uses CuddleCue signs in with the same account and lands on a short food
setup for their baby. A new parent creates an account (CuddleCue's sign-up, same checkbox for the
terms), names their baby, then does the same food setup. The full design, question by question,
is `docs/research/MARKET_AND_SETUP.md` §2; the screen is `FoodSetupScreen.tsx`.

- **Under 4 months there are no questions**: the dates solids can start and most babies start,
  and the food library to browse.
- **Has Ada had any solid food yet?** Not yet, just started, or eats lots of foods. Filled in from
  CuddleCue's log when solids are logged there ("We found 4 meals logged since Sep 12").
- **Not yet**: which readiness signs the parent has *seen* (head steady, sits with a little help,
  brings toys to the mouth, watches you eat), and when to start: today, on a day they choose, or
  when they see the signs. Nothing about swallowing: nobody can know it before the first spoon,
  so Today says what to watch for on the first day. Before 6 months the setup says most babies
  start around 6 months and to check with the pediatrician first.
- **How to offer food** (spoon, finger foods, some of each), or for a family already eating
  lots, **what the baby eats most easily now** (smooth, soft lumps, soft pieces, family food).
- **What the family eats**: diet, rules (halal, kosher, no pork, Jain…), and the cuisines they
  cook, folded away.
- **Foods already had** (just started and lots): a grid of common first foods with photos, ticked
  from the log, "Tick all the fruits and vegetables", and search for more.
- **Allergens**: a doctor's word, eczema in plain words, allergens already had (ticked from the
  foods above: yogurt counts as milk), and how to introduce them.

Under every question the first days of the plan are drawn by the planner as the parent answers.
The setup ends on **"Ada's plan is ready"**: the start day, the first week's foods with New and
first-allergen badges, when allergens start and in what order, three lines of "because you told
us", the first days' foods one tap from the grocery list, and the guidance region read from the
phone. Region, meals a day, the family allergy line and the texture hold are on the food profile
page in More, with every other answer.

## Before the first bite, and day one

- **Getting ready** (not started, or waiting for the signs): Today shows the signs, ticked and kept
  on the profile so both phones agree; the 6-month day; the first days a start would bring; what
  to have ready (high chair, soft spoon, open cup, bibs) one tap from the grocery list; and three
  short reads before day one (gagging and choking, a possible reaction, how much to offer). "Start
  the plan today", "Choose a day" and "We have already started" (with the first taste's date).
- **A start day chosen**: the countdown on Today, and the plan and the grocery list from that day.
- **Day one**: a first-day card above the meals (sit upright, stay within arm's reach, a teaspoon
  or two, and what the first tries show).
- **After**: "Day 9 of solids. 6 foods tried." A count, never a goal.

## The plan (rules, plus an optional model)

The plan is built on the phone by the rule planner (`packages/core/src/nibble/planner/plan.ts`)
from the profile and the household's own log, and every item passes the safety validator
(`safety/validator.ts`, the spec's §8.2 hard rules, each with its source). It is never stored:
both parents' phones compute the same plan from the same log.

The owner allowed AI on 2026-10-08. A model on the server can suggest foods for variety
(`nibble-plan-ideas`, in the CuddleCue repository); the phone drops anything the validator
refuses and any reason with a banned phrase, and the rule plan fills the rest. No key, no network
or a refusal means the rule plan alone: Today is never empty. See `docs/SERVER.md`.

## Safety lines that hold everywhere

- Record and count, never a verdict on the baby. A sign is "something you noticed", a
  "possible reaction", never an allergy.
- Trouble breathing, swelling of the face, lips or tongue, or a pale or floppy baby opens the
  emergency card first: the region's emergency number, one tap, works offline.
- An allergen followed by a noticed sign goes on hold. The app never suggests offering it again;
  the parent can take it off hold after "talk to your pediatrician first".
- No calories, no doses, no amounts to reach. Portions are the parent's ("start with a teaspoon
  or two; let your baby decide").
- Every rule, every guidance card and every food cites published guidance with its date.

## Free and NibbleCue Plus

NibbleCue Plus is its own subscription with its own price (the owner, 2026-10-08). The free plan
is a real app, and **safety is never sold**:

| Free, always (the bill of rights) | NibbleCue Plus |
|---|---|
| Today's and tomorrow's plan, logging, the serve flow | The full 14-day plan, pins and swaps on any day |
| The whole food library and serving guidance, custom foods | Plan ideas from the model |
| Allergen tracking, keep-going counts | The caregiver and daycare sheet |
| Something you noticed, the emergency card | The pediatrician summary (PDF and share) |
| Both parents and caregivers, every child | Milk and drinks, read against CuddleCue's log |
| Grocery list with the next seven days of the plan, light and dark, data download, account deletion, no ads | Choosing the grocery days, color schemes |

Prices come from the stores at runtime; the target numbers are the owner's to set.
