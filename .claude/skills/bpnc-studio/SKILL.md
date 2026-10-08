---
name: bpnc-studio
description: "How BP&C Creative Studio builds apps: the owner's preferences, product principles, design taste, working process and launch playbook, learned building CuddleCue. Use for ANY work on a BP&C app, especially NibbleCue (the sister app) or any new app: starting a project, building a feature, writing copy, designing a screen, testing, committing, releasing, or answering the owner. Read it before the first change in a session."
metadata:
  version: "1.0.0"
  learned-from: "CuddleCue, September to October 2026"
  written: "2026-10-08"
---

# BP&C Creative Studio: how we build

BP&C Creative Studio, LLC is a family-run studio: one coder (the owner, who directs the work and
tests on real phones) and one graphic designer. CuddleCue, a shared day planner for a baby's first
two years, was the first app. **NibbleCue** is the planned sister app, started once CuddleCue is
live on both stores. This skill carries what the owner likes, dislikes and expects, so a new
project starts where CuddleCue ended rather than relearning it one correction at a time.

When this skill and a repository's own `CLAUDE.md` disagree, the repository's `CLAUDE.md` wins for
that repository. When a new project has no `CLAUDE.md` yet, write one first (see
`nibblecue-kickoff.md`), seeded from this skill.

## Which file to open

| You are about to | Open |
|---|---|
| Talk to the owner, plan work, report results, or decide whether to ask | `owner.md` |
| Design a screen, write a sentence, pick a color, or shape an interaction | `product-and-design.md` |
| Write code, test it, commit, push, deploy or release | `engineering.md` |
| Start NibbleCue (or any new app) from nothing | `nibblecue-kickoff.md` |

In a checkout of the CuddleCue monorepo, the `cuddlecue-dev` skill beside this one describes that
codebase in detail (architecture, data model, every decision with its date). This skill is the
part that travels.

## The ten things that matter most

1. **The reader is a tired parent at 3 a.m. with one hand free.** Every screen, sentence and tap
   target is judged by that person. Short, plain, kind, never clinical, never a wall of text.
2. **No medical advice, ever.** Record what the parent enters and do arithmetic on it. Never
   diagnose, never suggest a cause, never describe a problem or a state of the child the app
   cannot see, never calculate a medicine dose. No AI, chatbot or model anywhere in the product.
   Facts with their sample size are fine ("every 3h 05m over the last 12").
3. **Never lose an entry.** Local-first writes that work offline, client-generated ids,
   idempotent sync, soft delete with Undo. A tap the parent made is sacred.
4. **The free plan is a real app.** Logging, reminders, both parents, light and dark, the full data
   download and account deletion are never sold. No ads, no ad SDK, no data sold. Plus sells depth
   and polish, and a gated control looks gated before it is tapped.
5. **Real life beats the rule.** The owner tests on real phones in real situations (two parents,
   a nanny in several families, offline, switching at 2 a.m.). A restriction that blocks a real
   situation is a bug. Build for the scenario, then prove it with a scenario test.
6. **Nothing half-done reaches `master`.** Run the full gate, read its real result line, and only
   then commit and push. Say plainly what passed, what failed and what was not tested.
7. **Light and fast on older phones.** Every image, font and dependency earns its bytes. Measure
   before and after.
8. **The owner decides product, pricing, copy and identifiers.** Record each decision with its
   date and their words. Never reverse one silently. For a reversible engineering choice, take the
   cheapest reversible option, write down why, and say so.
9. **Never invent a credential, an identifier or a legal fact.** Bundle ids, schemes, keys, the
   legal entity, addresses and processors come from the owner. Build the interface and a mock,
   then say what is needed. Never ask for a secret in chat; give the command that puts it where
   it belongs.
10. **Brand values live in one file and are read, never typed.** Never redraw the logo; render
    only from the designer's kit.
