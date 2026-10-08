# Product principles, design and copy

The rules a BP&C app is built on. They come from CuddleCue's `CLAUDE.md` and from what the owner
asked for along the way; they apply to NibbleCue unchanged unless the owner says otherwise.

## Safety: the line the app never crosses

Parenting apps sit next to medicine. Both stores, and the owner, hold the line here.

- **Record and count, never interpret.** The app stores what the parent typed and does arithmetic
  on it: sums, counts, medians, elapsed times, each with its sample size. It never says what a
  number means for the child.
- **No sentence may describe a problem or a state of the child the app cannot see.** "Overtired",
  "not enough", "should be eating by now", "may be caused by", "concerning", "normal" are banned.
  "Ada usually has a feed about now, every 3h 05m over the last 12" is fine.
- **No diagnosis, no dose, no AI.** No chatbot, no model, no generated health guidance, no
  calculated medicine dose with or without a disclaimer. The amount on a medicine is the one the
  parent typed.
- **Published guidance only, versioned, with its source and date** (milk storage windows,
  immunisation schedules), from data files, never from code or a model.
- **Look back without blame.** A history view lays out what was logged before an event, in order,
  with facts like "first time logged". It never ranks or highlights a likely cause. The
  pediatrician draws the conclusion; the app moves the facts to the person qualified to judge them.
- **Enforce the banned words with a test.** Every copy file that sits near health has a scan test
  for the words above. CuddleCue's `foresight.copy.ts` test is the model.

## The plan: free is a real app

- One entitlement table decides Free vs Plus, one API reads it (`can(key, tier)`,
  `limitFor(key, tier)`). No component reads a tier name, a plan status or a product id.
- **The bill of rights is never sold:** logging, timers, Today, reminders, multiples, light and
  dark, the full data download (a legal duty), account deletion, no ads. A test enforces it.
- Prices come from the store SDK at runtime, never from code. The store owns entitlement.
- No fake trials, no dark patterns, cancellation never obstructed. CuddleCue gives 14 days of Plus
  on sign-up with no card and nothing to cancel, ending by falling back to free, warned with a
  dismissible card, never a push.
- A gated control looks gated before it is tapped (a lock), and every gate shows what is behind
  it (a locked chart shows its shape with the numbers removed, never an empty box).

## Privacy and trust

- Nothing private on the lock screen that the person did not choose to show.
- No analytics or ad SDK; product analytics is first-party and aggregate, never on sign-in screens.
- Crash reports are first-party, scrubbed on the phone (no names, emails, ids or entry contents).
- The privacy policy and terms are the owner's words; never draft facts about the business.

## Voice and copy

- **Sentence case, plain, warm, short.** "Your baby's day, a little easier." Never clinical,
  never cute at the parent's expense.
- **US English** everywhere a person reads (color, favorite, canceled), because store search is
  US-first. Identifiers that would be a breaking rename are exempt.
- **No dashes in sentences.** Use a period or a comma. A test enforces it in CuddleCue.
- **Say what happens, in the person's words**, and the number that matters: "2 entries for Dana's
  family are still on the way to the server. Switch once they have sent."
- **Say the rule where it is met**, before the person does the work it would refuse.
- **Name things for what they do**: "Log Bottle", not "Try it". "Until I turn it off", not
  "Permanent".
- **Softening a sensitive name** happens in the words around it: a health entry is called "Health
  note", its subtitle is "Something you noticed, in your own words", its chips say what was seen
  ("Rash", "Swelling"), never a condition ("Allergy", "Reaction").

## Design taste

- **The page ground is a warm paper color** (CuddleCue: `#F6F3EC`, read from the theme, never
  typed). The household's color scheme colors the things you tap, never the page.
- **Each module has its own color**, and its pressed, selected or holding state uses that module's
  deeper shade, never the theme color and never a tint too soft to see.
- **Big targets, one hand.** 44 pt minimum, the main action in reach of a thumb, nothing that needs
  two hands or precise taps at night.
- **Calm motion.** Short fades (about 180 ms) over pops; no flash of an empty state before data;
  nothing that jumps after it appears.
- **Confirmations and pickers are the app's own sheets**, never the platform's old-looking dialog.
- **Show the change live**: a settings screen that changes appearance shows it before it is closed.
- **Accessibility is not a later pass**: every control labeled for screen readers, dynamic type
  respected, contrast checked by a harness, nothing conveyed by color alone.
- **Light and dark are free** and follow the system; a purpose-built theme (CuddleCue's amber
  Night) can be a Plus feature.
- **Never redraw the logo.** Render only from the designer's vector masters, keep clear space and
  minimum sizes. A derived asset (an Android themed icon, a resized wordmark) is rendered from the
  kit and shown to the owner for approval.

## Features that worked, worth carrying over

- **Who's on**: one person takes the reminders for a stretch so the other can sleep; it always ends
  by itself; reminders after it return to everyone automatically; handing over is one tap.
- **Several families per account** (a nanny or grandparent helping in up to five), a parent in one.
- **Local-first everything** with a visible, honest sync state.
- **The pediatrician sheet**: the household's own record laid out in the order a doctor asks for
  it, every figure with its window and sample size, no flags or verdicts.
- **Widgets and a live timer** on the lock screen, as Plus.
- **A tour whose buttons log real entries**, named for what they do.
