# Working with the owner

What the owner expects from an assistant, learned over the CuddleCue build. Their own words are
quoted where they set a rule.

## Who they are and how they test

- Directs the product and tests every build themselves, on Android first ("im from android") and on
  an iPhone, through Expo Go on the staging server and later through store test builds.
- Works on a **Windows PC** (the repo lives at `C:\dev\cuddlecue-app`). Give commands for
  **PowerShell**, not bash: `$env:NAME = "value"`, backtick line continuation, `[Convert]::...`.
- Reports problems as screenshots with one line of text, often several in a row while testing.
  Read each one as a bug report with a picture; fix the cause, not only the screenshot.
- Writes quickly, with typos. Read for intent, never correct their spelling, never make them
  repeat themselves.
- Uses a support mailbox on the studio's domain (Zoho Mail), Supabase (staging and production),
  EAS for builds, RevenueCat for subscriptions, and a static host for the website.

## How they want to be talked to

- **Plain words, short.** Lead with the answer or the result. No jargon without a gloss, no file
  dumps, no internal ids. When a screen is "too much text", it is; the same holds for messages.
- **Honest status, always.** "Was this pushed to master?" deserves a straight yes or no with the
  commit. If a test run failed, say so with what failed, even when the news is that you misread an
  earlier result. Never call something done that was not verified.
- **Explain the why when it is a real trade-off**, briefly, then recommend. Offer a choice only
  where it is genuinely theirs (product, pricing, copy, identifiers, legal, money). Otherwise
  decide, do it, and mention it.
- **Step-by-step instructions for anything only they can do** (store consoles, Apple Developer,
  Supabase dashboard, DNS): numbered, exact menu paths, what "done" looks like, what to send back.
  Consoles move things; when unsure of a menu path, give the console's search term as a fallback.
- **Never ask for a secret in chat.** Not a database password, not a token, not a `.p8`. Give the
  command that puts it straight into the right place (EAS variable, Supabase secret).
- When they ask "how long until launch", give an honest estimate with what it depends on, and
  separate their tasks from the code's.

## What they like

- **Things that just work in real life.** "Why can't I be a parent of my own household and a
  caregiver to someone else? The system mustn't restrict this." Design for the messy case: a nanny
  in five families, a parent on duty switching families at 2 a.m., an offline phone, a twin.
- **Testing with real-life scenarios before pushing.** "Make sure everything works first ... run
  some test with real life scenarios ... then once everything works well we will then push."
  Scenario tests that drive the app's own writes against a real database are the proof they trust.
- **Light builds for slower, older phones.** "Keep the build as light as possible." Measure bundle
  and asset sizes before and after, and say what each change saved.
- **Smoothness.** No flash or jump when a page loads ("even if its just a ms"), no layout shift,
  gentle fades over popping. Lists and pages appear settled.
- **Clear contrast.** Selected or pressed states in the module's own deeper color, never too soft
  ("the green is too soft ... change it to dark green"), borders on chips visible enough to notice.
- **Using space well.** When a chip has room, say it in full ("-5 min", "-15 min", "Custom");
  shorten only when it does not fit, and do it for every module, not just the one in the screenshot.
- **Confirmation before anything destructive**, with an obvious way in: "clicking X then
  confirmation box" on the row. Removing a person, deleting, leaving: always asked first.
- **Simple option sets.** "Simplify ... this evening is not needed. Do 24 hour 1 week 1 month and
  until I turn off." Fewer, clearer choices beat a complete list.
- **Saying the rule up front, not after it fails.** "If I can't, then you need to write this when
  inviting a parent and when joining." Explain a limit where the person meets it.
- **Automatic follow-through.** Changing an invite's role should remake the code without another
  tap. A reminder should reach the right phone without the app open.
- **Honest labels.** A tour button that logs a real entry is "Log Bottle", not "Try it". A demo is
  called a demo.

## What they dislike

- Restrictions that do not match real life, and errors that appear only after the person has done
  all the work (refuse early, or better, do not offer the impossible path).
- Auto-submitting a form the moment the last character is typed ("so that users can still change
  if there is a typo"). Submit on a tap, and lock the field while it is sending.
- Duplicate information on one screen ("Medicine in schedule does not need to be written twice").
- Walls of text on settings and help pages ("definitely too much text, keep what's important").
- Back and close buttons that land somewhere unexpected: they return to where the person came
  from (a guide opened from Help & tour returns to Help & tour, not to More).
- Odd spacing, oversized gaps from a card's border, controls that look disabled when they are not.
- Anything that feels like an old system dialog. Confirmations use the app's own sheet design.
- Pushing an update that "limits many things that were fine before". Regressions cost trust more
  than a missing feature does. Review your own diff for what it might break.

## Decisions are dated facts

The owner's decisions are recorded with the date and their own words (for example: "the owner,
2026-09-27: *why do we need to hide it? i can be moderator*"). Respect them and cite them. Never
reverse one silently; if a new request contradicts an old decision, follow the new request and
update the record. When a choice is genuinely theirs, ask once, with a recommended option first.
