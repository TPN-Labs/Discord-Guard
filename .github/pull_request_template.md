<!-- Fill every required section for the triage classification; delete irrelevant sections and leave no required section blank. Changes Discord
renders, including small fixes, require cropped before/after screenshots. -->

## Ticket 🔗

[<LINEAR-ID>](https://linear.app/tpn-labs/issue/<LINEAR-ID>) <!-- or "ENG-00 - no ticket" while no Linear project tracks this repo -->

## Triage Classification 🎯

> Required. Select one.

- [ ] Small fix
- [ ] Small fix (functional modification)
- [ ] Feature
- [ ] Large feature

## Context 🧭

> What does this PR address? Link the requirements / design artefacts under `docs/specs/` if applicable.

## What Changed 📝

> High-level walkthrough. Call out notable decisions and tradeoffs.

## Screenshots 📸

> **Required whenever this PR changes something Discord renders** - a message or embed the bot posts,
> a command's name, description or options, a reply, a moderation-log entry. The diff shows what the
> builder call says, not what members see.
>
> Two rules, both binding:
>
> 1. **Take the "before" shot before you start editing.** Once the change is in the tree the old
>    behaviour is unreachable without `git stash` / `checkout`, which Constitution §4.VI forbids in a
>    shared checkout.
> 2. **Crop to the message or command that changed - never the whole client window.** Both shots come
>    from the same test-server channel, the same trigger and the same client theme.

- [ ] Not applicable - this PR changes nothing Discord renders.

| Message / command | Before | After |
|---|---|---|
| `<what>` in `<test-server channel>` | `<paste image>` | `<paste image>` |

- [ ] Every pair is cropped to the changed message or command.
- [ ] Captured in a test server with a separate bot application, not the live server.

---

## Validation Checklists

> Tick only the sections required by your triage classification.
> The AI may have produced a review; you are still the decision authority (Constitution §4.III).

### Step 1 - Specify *(Feature, Large feature)*

- [ ] User stories name a role from `docs/CONVENTIONS.md §2` (member, moderator, owner); no generic "user".
- [ ] Every acceptance criterion is observable from Discord.
- [ ] At least one negative / failure-mode AC per capability.
- [ ] Success metrics are quantitative.
- [ ] Every AC has a unique `AC-NN` ID.

### Step 2 - Design *(Feature, Large feature)*

- [ ] Every requirement maps to a piece (command, listener, precondition) or a `src/lib/` function in `design.md`.
- [ ] Every new intent, bot permission and Discord API call is named.
- [ ] Storage and state choices are recorded (ADR under `docs/adr/` for anything non-obvious).
- [ ] Non-functional requirements stated with numbers (thresholds, caps, expiry).
- [ ] AI domain constraint (Constitution §2) satisfied.

### Step 3 - Test specs and tasks *(Small fix (functional), Feature, Large feature)*

- [ ] Every AC has ≥1 `SPEC-NN`; the traceability matrix is updated.
- [ ] The failure-path floor in `docs/TESTING.md §7` is covered where it applies.
- [ ] Task ordering respects dependencies.
- [ ] Each task fits a single AI implementation pass.

### Step 4 - Implementation *(All classifications)*

- [ ] Red phase captured: each new test was seen failing for the expected reason before the code (output in *Validation Trail*).
- [ ] `yarn lint`, `yarn check-types`, `yarn format:check`, `yarn test` and `yarn build` pass locally and in CI.
- [ ] No tests were modified to make them pass.
- [ ] No scope creep - code traces to the task spec; gaps were looped back, not absorbed.
- [ ] No token, server ID or member ID in code, tests or this description.
- [ ] Changes Discord renders carry a cropped before/after pair in *Screenshots*, or that section is ticked not-applicable.

### Step 5 - Integration *(Feature, Large feature)*

- [ ] Full test suite green.
- [ ] Production Readiness checklist (`docs/CONVENTIONS.md §5`) completed below.
- [ ] Accepted by hand in a test server; what was checked is in the AC trace table.
- [ ] AI self-review was read; each point accepted or refuted in writing.
- [ ] README Feature status, Configuration and Commands tables updated.

---

## Validation Trail

> Red output for each new test, then the green run. Paste or link CI.

## AC Trace Table *(Feature, Large feature only)*

| AC ID | Test reference | Run evidence / manual check |
|---|---|---|
| AC-01 | `tests/path:line` | <link to CI run> |
| AC-02 | ... | ... |
