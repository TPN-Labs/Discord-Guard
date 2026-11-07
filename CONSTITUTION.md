# TPN LABS Engineering Constitution - Discord Guard

> Adapted for this repository from the TPN LABS Engineering Constitution as carried by `TPN-Labs/AnuntReal` (version 1.6.0). The process, the Git conventions and the Non-Negotiables are the same rules; what changes is the domain they apply to - a single Discord bot instead of a web product - and the two places where this repository deliberately differs: it runs CI on GitHub-hosted runners (§4.VII), and it enforces session isolation by rule rather than by hook (§4.VI).

## 1. Company Identity

**TPN LABS** is a tech company and digital solutions provider based in Timișoara, Romania. Founded in 2023, they operate as an on-demand product team specializing in mobile app development, web development, UI/UX design, DevOps, and quality assurance.

**Discord Guard** is the guard and helper bot for Mihai TPN's Discord server: it welcomes people in, makes sure they accept the rules before they can talk, keeps spammers out, and carries utility commands for the moderators. The feature set and what works today are in [`README.md`](./README.md#features).

## 2. Product Domains

| Domain | Purpose | Tech Stack | Consumers |
|---|---|---|---|
| Bot | Verification, announcements, anti-spam, moderator commands | TypeScript, discord.js v14, Sapphire framework v5 | Server members, moderators, owners |
| Testing | Unit and behaviour tests for bot logic | Vitest | All domains |
| Infrastructure & Tooling | CI, dependency updates, deployment | GitHub Actions (GitHub-hosted runners), Dependabot, Yarn 4, Coolify (Nixpacks) | All domains |

> **AI domain constraint:** Must not default to LLM training data when project context is available. All AI reasoning must be grounded in current local artefacts - this repository's code, its docs, and the installed package versions in `yarn.lock` - not in remembered discord.js or Sapphire APIs from an older major version.

## 3. Development Process

### Triage (Step 0)

A human classifies all work before any spec or code begins. This is a governance layer - not a Fowler pattern.

| Classification | Spec Work Required | Flow |
|---|---|---|
| Small fix | None (brief prompt) | 0 → 4 → 5 → 6 |
| Small fix (functional modification) | Test specs only | 0 → 3 → 4 → 5 → 6 |
| Feature | Steps 1-2 | 0 → 1 → 2 → 4 → 5 → 6 |
| Large feature | Steps 1-3 | 0 → 1 → 2 → 3 → 4 → 5 → 6 |

### Steps

Spec artefacts live under `docs/specs/<YYYY-MM-DD>-<slug>/` (one folder per feature) so they can be reloaded into every session (§4.IV).

**Step -1 - Product Understanding** *(Fowler: Knowledge Priming)*
Build shared understanding of the problem space: who the server's members and moderators are, what the bot must protect against, and the constraints Discord itself imposes (intents, permissions, role hierarchy, rate limits). Output: priming material - [`README.md`](./README.md), [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md), [`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md) - reloaded into every subsequent AI session.

**Step 1 - Specify** *(Fowler: Design-First Level 1 - Capabilities)*
Human provides high-level intent and problem statement. AI drafts user stories, acceptance criteria, and success metrics. Human reviews and validates.
Output: `requirements.md`

**Step 2 - Design** *(Fowler: Design-First Levels 2-4 - Components, Interactions, Contracts)*
Human provides constraints: intents, permissions, storage, non-functional requirements. AI drafts technical design: which Sapphire pieces (listeners, commands, preconditions) carry the behaviour, the data they keep, and the Discord events and API calls involved. Human reviews and validates. No code begins until this step is approved.
Output: `design.md`

**Step 3 - Test Specs and Task Breakdown** *(Fowler: Level 4 Contracts in executable form + implementation-planning bridge)*
AI generates test cases from requirements and design, breaks the design into ordered dependency-aware tasks, scopes each task to a single AI coding pass. Human reviews and validates both outputs.
Outputs: `test-specs/`, `tasks/`

**Step 4 - Implementation** *(Fowler: Design-First Level 5 under Encoding Team Standards)*
One task at a time. AI generates code, runs tests automatically after each task, and self-reviews against requirements and acceptance criteria. Human reviews code and test results. Spec gaps discovered during implementation loop back to the relevant spec before continuing.

**Step 5 - Integration and Validation** *(Fowler: Encoding Team Standards - review and security)*
AI runs the full test suite, traces acceptance criteria to the implementation, completes the Production Readiness checklist (§4.V), and performs an initial review. A human exercises the change against a **test server with a separate bot application** - never the live server - and performs final acceptance review.

**Step 6 - Spec Maintenance** *(Fowler: Feedback Flywheel - narrow case)*
Update specs and the README's Feature status table to reflect what was actually built. Track AI error patterns. Track prompt effectiveness. Keep specs alive for future iteration and evolution.

### Git & PR Conventions

**Branch naming**
Every branch must follow: `<type>/<linear-ticket-number>/<short-description>`
- `type` is one of `fix`, `feat`, `ci`, `docs`, `chore`, `test`
- `linear-ticket-number` is the Linear ticket ID (e.g. `ENG-42`)
- `short-description` is kebab-case, 2-4 words

Example: `feat/ENG-42/rules-verification`

If the Linear ticket number is not known, ask before creating the branch. No Linear project tracks this repository yet; until one does, work without a ticket uses the placeholder `ENG-00`, as the history already does.

**PR title**
Every PR title must follow the Conventional-Commits form: `<type>(<linear-ticket-number>): <summary>`
- `type` is one of `fix`, `feat`, `ci`, `docs`, `chore`, `test`
- `linear-ticket-number` is the Linear ticket ID enclosed in round parentheses (e.g. `ENG-42`)
- `summary` is a short, imperative description of the change

Example: `feat(ENG-42): give the verified role on rules reaction`

> **Exception:** Dependabot PRs are exempt from the Linear-ticket requirement. They must still use a valid `type` and summary (e.g. `chore(deps): bump discord.js from 14.26.0 to 14.27.0`).

This convention is checked on every PR by `.github/workflows/semantic_pr.yml`. Because no Linear project tracks this repository yet, that workflow runs with `REQUIRE_SCOPE: 'false'` and accepts any scope (or none); flipping it to `'true'` enforces the ticket form above once a project exists. The rule binds either way - the workflow is the floor, not the standard.

**PR description**
Always use the template at `.github/pull_request_template.md`. Fill in all sections; do not omit or truncate.

**Screenshots for visible changes**
A PR that changes anything a member or moderator can see in Discord - a message or embed the bot posts, a command's name, description or options, a reply, a log entry in the moderation log channel - carries a **before/after pair** in the template's `## Screenshots` section. The diff is not a substitute: it shows what the builder call now says, not what Discord renders.

- **Crop to the message or command that changed, never to the whole client window.** Both frames come from the same test-server channel, the same trigger and the same client theme, so the only difference between them is the change under review.
- **Take the "before" shot before the first edit.** Once the change is in the tree the old behaviour is unreachable without a `git stash` or a `checkout`, which §4.VI forbids in a shared checkout and which would discard the work in a worktree.

An agent session cannot attach an image to a PR body or drive the Discord client; it states which shots are needed and the human captures and attaches them.

**Automated tests**
Opening a PR triggers the CI pipeline. All automated tests must pass before a PR may be merged. A failing test suite blocks merge regardless of review approval.

## 4. Non-Negotiables

These rules override all other preferences, conventions, and guidelines.

### I. Test-Driven Development (TDD) - MANDATORY

Tests are written and approved before any implementation code is produced. The Red-Green-Refactor cycle is strictly enforced: write the test, watch it fail for the expected reason, write the least code that passes it, then refactor while it stays green. No implementation task is considered started until its tests exist. No task is considered complete until all tests pass (`yarn test`).

The runner is Vitest; tests live in `tests/`, mirroring `src/`. How to make Discord-facing code testable without a live gateway is in [`docs/TESTING.md`](./docs/TESTING.md).

> **Exception:** Small fixes (Step 0 classification) are exempt unless they imply a functional modification, in which case TDD applies.

### II. Behaviour-Driven Development (BDD) - MANDATORY

All features are specified in terms of observable behaviour from the member's, moderator's or owner's perspective before implementation begins - what they see in Discord, what they can and cannot do. Acceptance criteria in `requirements.md` are the authoritative source of truth. Implementation is validated against them at Step 5.

### III. AI-Human Collaboration

AI drafts; humans validate. No AI output - spec, design, test, or code - proceeds to the next step without explicit human review and approval. The human is always the decision authority.

### IV. Context Anchoring - MANDATORY DISCIPLINE

All artefacts (`requirements.md`, `design.md`, `tasks/`, `test-specs/`, and the reference documents in §5) live outside the AI session and are reloaded into each new session - never reconstructed from memory. Long sessions are an anti-pattern. Closing a session without persisting its outputs is a process violation. This applies with particular force to library APIs: discord.js and Sapphire both changed shape across major versions, and code written from memory of an older version (`MessageEmbed`, `Intents.FLAGS`, v13 event names) is a context-anchoring violation, not a style issue.

### V. Production Readiness & Security by Default - MANDATORY

A change is not "done" when its tests pass in isolation; it is done when it is safe to run on the live server under load and failure. Every change that adds or modifies a runtime surface - a command, a listener, a precondition, a scheduled task - must satisfy, before merge:

- **Authorization, not just presence.** Any command that changes server state (roles, kicks, limits, settings) or exposes internals is gated by a precondition (`OwnerOnly` or a moderator check), and that gate has a test that fails when it is removed. Discord's own `default_member_permissions` hides a command; it is not the enforcement.
- **Enforced, not deferred.** Security, anti-abuse and permission controls are enforced in code with a test that fails when the enforcement is removed. A TODO, a code comment, or a ticket is NOT enforcement. If a control is intentionally deferred, the surface that lacks it does not ship enabled.
- **Bounded resources.** Every outbound call has a timeout or a bounded retry; every in-memory structure that grows with traffic (per-member message history, per-channel counters, caches) has an explicit cap or expiry. A spam wave must not become a memory leak.
- **Defined failure modes.** For every Discord API call that can be refused - a missing permission, a role above the bot's, a member who already left, a rate limit - the behaviour is chosen deliberately and tested: what the member sees, what moderators see, what is logged.
- **No production stubs.** A command registered with Discord is a production surface. A command whose handler only throws (as `/limits` does today) is a stub; wiring one into the live command set is a deviation requiring §7 justification.
- **Debuggable.** A production incident is diagnosable from the bot's logs alone. Errors go through `this.container.logger` with enough context (guild, channel, member, command) to reproduce; they are never silently swallowed.
- **Secrets stay secret.** The bot token and anything in `src/.env` never appear in code, logs, replies, test fixtures or docs. `/eval` output is scrubbed of the token, and `/eval` stays owner-only.

This is verified at Step 5 against the Production Readiness checklist in [`docs/CONVENTIONS.md §5`](./docs/CONVENTIONS.md#5-production-readiness-checklist).

### VI. Session Isolation & Work Durability - MANDATORY

Several agent sessions on one working tree is a data-loss architecture, not a discipline problem. On 2026-07-31, in another TPN LABS repository, five concurrent sessions shared one checkout; one session's `git stash push` destroyed five files of another's uncommitted work, unrecoverably from git, and a later `reset --hard` came within one ref of losing three commits. The rules that followed apply here too:

- **Worktree isolation is the default for any session that writes.** Start with `claude --worktree <name>`, or call `EnterWorktree` from inside a session. Worktrees land under `.claude/worktrees/` (gitignored).
- **The shared main checkout is read-only.** Investigation, greps and doc reads only: no file writes, and no git that mutates the working tree, the index or `HEAD` - including `stash`, `reset`, `switch`, `checkout`, `restore`, `clean`, `pull`, `merge`, `rebase`, `commit`, and `branch -d/-D`. "No file writes" covers writes made through a shell, not only through the editing tools. A human may explicitly grant one session the right to write in the main checkout when it is clean and no other session is live; an agent never assumes that grant.
- **Never clear another session's edits out of your way.** If the tree is dirty with work that is not yours, stop and tell the user.
- **Force-pushes are denied in every checkout**, worktrees included.
- **Push before the session ends.** A commit that exists in one local ref only is one command away from lost.
- **At most two concurrent sessions per repository.** A session that starts as the third stops and tells the user which sessions are already live.

**Enforcement.** Unlike `TPN-Labs/AnuntReal`, this repository does **not** ship the `agent-guard.mjs` hook: it is a small repository worked on mostly from remote sessions, and the rules above are enforced by the session and by review. Adopting the hook later is an amendment, not a new rule.

**Remote sessions are exempt from the worktree rule.** A Claude Code on the web checkout is a private, ephemeral clone with a single writer. Its corollary still binds: work in an ephemeral container is lost when the container is reclaimed, so it is pushed before the session ends.

### VII. CI Job Economy - MANDATORY

**No new CI jobs.** A new `jobs:` entry - or a new `strategy.matrix` leg, which is another job wearing one name - requires an explicit human yes and a reason that survives the alternatives below. It is never the default way to add a check, and "each check should be its own job" is not a reason.

- **Cheapest form first.** A test in the Vitest suite (already running on every PR) beats a step; a step in an existing job - reusing its checkout and its install - beats a job. Reach for a job only when neither can express the check.
- **A job is a purchase, not a label.** It costs a runner, a fresh checkout, a fresh dependency install, and a permanent row in the checks list every reviewer reads on every PR.
- **Needing independent verdicts does not justify a split.** One job reports every failure by giving each check its own `continue-on-error` step and a final `if: always()` step that decides the job.
- **Required check names are load-bearing.** The branch ruleset requires `ci / Quality: ESLint`, `ci / Quality: TypeScript`, `ci / Build & Verify` and `title / Validate PR title`. Renaming or removing one blocks every PR until the ruleset is repointed.

**Runners - the deliberate difference from the rest of TPN LABS.** Every other TPN LABS repository runs CI on the self-hosted Hetzner runner (`runs-on: [self-hosted, hetzner]`). This repository is **public**: anyone can open a pull request against it, and a fork's PR must never execute on TPN LABS machines. Its jobs therefore run on GitHub-hosted runners (`runs-on: ubuntu-latest`) and are self-contained ports of the shared `TPN-Labs/GitHub-Actions` workflows, because a public repository cannot call reusable workflows from a private one. Do not "fix" this to the Hetzner runner, and do not point a workflow back at the private reusable workflows.

Like the rest of TPN LABS, this is enforced by review: the reviewer's question on any workflow diff that adds a `jobs:` key or a matrix leg is which exemption in [`docs/CONVENTIONS.md §1`](./docs/CONVENTIONS.md#ci-runners--workflows) it claims.

## 5. Reference Documentation

### README.md

[`README.md`](./README.md) is the product reference: what the bot does, the feature status table, Discord setup (intents, permissions, role order), configuration, commands, and the developer scripts.

### docs/ARCHITECTURE.md

[`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) describes how the bot is put together: process start-up, the Sapphire stores and where each kind of piece lives, the gateway intents, configuration, the external dependencies and their failure modes, and where each planned feature is expected to land.

### docs/CONVENTIONS.md

[`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md) defines the coding and collaboration standards: Git and PR rules, CI rules, naming and placement of pieces, logging and error handling, domain vocabulary, and the Production Readiness checklist used at Step 5.

### docs/TESTING.md

[`docs/TESTING.md`](./docs/TESTING.md) defines the testing process: the Red-Green-Refactor loop in this repository, Given/When/Then test specs and their traceability to acceptance criteria, how to test Discord-facing code without a live gateway, and the failure paths every spec set must cover.

## 6. Open Items

These are known gaps between the current process and a fully realised AI-driven development system. Each is acknowledged and intentionally deferred.

**1. No Linear project.** Branches and PR titles use `ENG-00` and the PR-title check runs with an optional scope. Intent: create a Linear project for this repository, then flip `REQUIRE_SCOPE` to `'true'`.

**2. `/limits` is a registered stub.** Its handlers throw `not implemented`. Under §4.V it should not be in the live command set; it predates this Constitution and is carried as a known deviation until the anti-spam feature lands or the command is unregistered.

**3. No persistent storage.** Settings and anti-spam limits have nowhere durable to live yet. The storage choice is a Step 2 design decision for the first feature that needs it, recorded as an ADR under `docs/adr/`.

**4. Session handoff artefact (missing).** The process assumes artefacts persist across sessions but does not specify how. Intent: define a lightweight session handoff format, shared with the rest of TPN LABS.

## 7. Governance

This constitution supersedes all other engineering practices and team conventions for this repository. When a conflict exists between this document and any other guide, standard, or preference, this document takes precedence.

**Compliance**
All pull requests, AI sessions, and code reviews must verify compliance with the Non-Negotiables (Section 4). Deviations require explicit justification documented in the relevant artefact.

**Amendments**
Any amendment requires: (1) documented rationale, (2) approval by the Tech Lead, (3) a migration note if existing artefacts are affected. A rule changed in the TPN LABS Constitution upstream is adopted here by an amendment that says so.

---

`Version: 1.0.0 | Ratified: 2026-11-06`

> **Adoption note (1.0.0, 2026-11-06 - ENG-00):** Adopted from the TPN LABS Engineering Constitution 1.6.0 as carried by `TPN-Labs/AnuntReal`. **Kept unchanged:** the triage and Step -1 to 6 process, branch and PR-title conventions, the PR template requirement, and Non-Negotiables I-III. **Adapted:** §1-2 describe this bot instead of a web product; §3 screenshots apply to what Discord renders (messages, embeds, commands) rather than web components; §4.IV names library-version drift instead of a design system; §4.V's checklist is restated for a Discord bot (preconditions, role hierarchy, rate limits, per-member state, the bot token, `/eval`). **Deliberately different:** §4.VI keeps the session-isolation rules but not the `agent-guard.mjs` hook that enforces them in AnuntReal; §4.VII keeps the no-new-jobs rule but runs on GitHub-hosted runners, because this repository is public and fork PRs must not run on self-hosted machines. **Dropped:** the AnuntReal design-system references (`DESIGN.md`, `.impeccable/`), the domain guides (`api/CLAUDE.md`, `web/CLAUDE.md`) and the Postgres MCP note, none of which exist here. **Migration:** Vitest is added as the test runner with a seed test for `src/lib/env-parser.ts`, and `yarn test` runs as a step in the existing `ci / Build & Verify` job, so no CI job or required-check name changes. Open PRs are not retroactively blocked.
