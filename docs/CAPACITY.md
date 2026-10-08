# Will sharing CuddleCue's database overload it or slow the apps?

**Short answer: no.** The owner asked on 2026-10-08: *"will this overload the database or make the
app slower? if your calcualtion says its fine, then do ti"*. The calculation is below. It says the
shared project carries NibbleCue at a small fraction of what CuddleCue already asks of it, and
neither app's screens can be slowed by the server at all.

## Why no screen can be slowed by the server

Both apps are local-first (CuddleCue's sync engine, reused). Every screen reads the phone's own
SQLite copy. A save writes to the phone first and is sent later by the outbox. The server is only
reached in the background, to push what was saved and to pull what changed. A slow or busy server
delays when the other parent's phone sees a meal. It never delays a tap, a page or a save.

## What NibbleCue adds to the server

| What | How much, per family that uses NibbleCue | Why it is small |
|---|---|---|
| Meals | 2 to 4 `activities` rows a day | These are CuddleCue's own solids rows ("log once"). A family that logged solids in CuddleCue already writes them. NibbleCue moves them, it does not double them. |
| `nibble_records` | About 1 to 5 rows a week: the profile (one per baby, edited rarely), custom foods, plan pins and swaps, and anything noticed | Small JSON bodies, usually under 1 KB, capped at 16 KB by the server. |
| `nibble_applied_ops` | One small row per NibbleCue write | The duplicate guard; pruned like CuddleCue's. |
| Pull requests | One extra call per sync (`nibble_sync_pull`), delta only | Keyset cursors on `(updated_at, id)` with an index: an unchanged table answers with nothing. |
| Realtime | `nibble_records` joins CuddleCue's change nudges | One nudge per write, the same mechanism and size as CuddleCue's. A phone holds one connection while the app is open. |
| AI plan ideas | At most 20 calls a day per family, cached per baby per day | The model runs at Anthropic, not in the database. The database stores one cached draft per day. |

## The arithmetic, for 1,000 families using NibbleCue every day

- **Writes:** about 3 meals plus 1 record a day each, so about **4,000 writes a day**. That is
  about one every 20 seconds on average. Even at ten times the average at dinner time, it is
  about one every two seconds.
- **Reads:** about 5 app opens a day, with 2 pull calls each, so about **10,000 small calls a
  day**. Most return nothing new.
- **Storage:** about 10 KB of NibbleCue records per family, so about **10 MB per 1,000
  families**, plus the meal rows a solids family writes anyway.

A Supabase project on the paid plan's smallest compute serves hundreds of simple calls a second.
These numbers are two to three orders of magnitude below that. CuddleCue's own feeds, sleeps and
diapers (dozens a day per family) remain by far the larger load. NibbleCue adds roughly 10 to 20%
to the rows of a family that uses both apps, and much of that is meals that would be logged anyway.

## What to watch, and when to act

These checks are in the Supabase dashboard (Reports and Database):

1. **CPU and memory** of the database. If they stay above about 70% at the evening peak, move up
   one compute size. That is a setting, with no code change.
2. **Realtime concurrent connections** against the plan's limit. Each open app holds one. A
   parent with both apps open at once holds two, which is rare because only one app is in front.
3. **Slow queries.** `nibble_sync_pull` should stay in the low milliseconds. If it does not, check
   its index first (`nibble_records (household_id, updated_at, id)`).
4. **The AI cap.** If families hit 20 a day often, the cap is one number in the function.

None of these needs action at launch.
