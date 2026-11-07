# Agents Guide

## CONSTITUTION.md

[`CONSTITUTION.md`](./CONSTITUTION.md) is the authoritative engineering reference for this project. Read it at the start of every session. It covers:

- **Identity** - TPN LABS, and what Discord Guard is for
- **Product domains** - the bot, testing, and infrastructure: purpose, stack, consumers; includes the AI domain constraint requiring all reasoning to be grounded in local artefacts, not LLM training data
- **Development process** - triage through spec maintenance (Steps -1 through 6), including which steps apply to small fixes vs. features vs. large features
- **Git & PR conventions** - branch naming (`<type>/<linear_ticket_number>/<short_description>`), PR title format, the PR template requirement, and before/after screenshots for any change Discord renders - cropped to the message or command that changed, with the "before" frame captured before the first edit
- **Non-negotiables** - seven rules that override all other preferences: TDD, BDD, AI-human collaboration (AI drafts, humans validate), context anchoring (artefacts are always reloaded, never reconstructed from memory), production readiness & security by default, session isolation & work durability, and CI job economy (no new CI jobs)
- **Open items** - known gaps intentionally deferred
- **Governance** - this document supersedes all other engineering practices; all PRs and AI sessions must verify compliance with the non-negotiables

## Documentation pillars - read every session

Read these at the start of a session, before proposing, implementing, or reviewing work. Reload the relevant sections when the task changes; do not reconstruct behaviour from memory.

1. **Product:** [`README.md`](./README.md) - features and their status, Discord setup, configuration, commands, scripts.
2. **Architecture:** [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) - start-up, pieces and where they live, intents, state, dependencies and failure modes.
3. **Conventions:** [`docs/CONVENTIONS.md`](./docs/CONVENTIONS.md) - Git, CI, vocabulary, code rules, and the Production Readiness checklist.
4. **Testing:** [`docs/TESTING.md`](./docs/TESTING.md) - the TDD loop, test layout, testing Discord-facing code, and spec traceability.

Check claims against the relevant pillar, keep affected pillars consistent when behaviour changes, and record unresolved discrepancies explicitly. The Constitution remains the authoritative governance reference.

## Development flow

Per [`CONSTITUTION.md §3`](./CONSTITUTION.md#3-development-process). A human triages every piece of work (Step 0) before any spec or code; if the classification is not given, ask for it. The classification decides which steps run:

| Classification | Spec work required | Flow |
|---|---|---|
| Small fix | None (brief prompt) | 0 → 4 → 5 → 6 |
| Small fix (functional modification) | Test specs only | 0 → 3 → 4 → 5 → 6 |
| Feature | Steps 1-2 | 0 → 1 → 2 → 4 → 5 → 6 |
| Large feature | Steps 1-3 | 0 → 1 → 2 → 3 → 4 → 5 → 6 |

| Step | What happens | Output |
|---|---|---|
| -1 Product understanding | Load the pillars above; never work from memory | Priming docs (README, ARCHITECTURE, CONVENTIONS, TESTING) |
| 0 Triage | Human classifies the work | Classification in the PR template |
| 1 Specify | AI drafts user stories, `AC-NN` acceptance criteria, metrics; human approves | `docs/specs/<YYYY-MM-DD>-<slug>/requirements.md` |
| 2 Design | AI drafts pieces, `src/lib/` functions, intents, permissions, state; human approves. No code before this | `design.md` |
| 3 Test specs & tasks | AI drafts Given/When/Then `SPEC-NN` scenarios traced to ACs, and ordered tasks; human approves | `test-specs/`, `tasks/` |
| 4 Implementation | One task at a time, test first (see TDD below); spec gaps loop back to the spec | Code + tests |
| 5 Integration | Full suite, AC trace, Production Readiness checklist (`docs/CONVENTIONS.md §5`), manual check in a test server; human accepts | Completed PR template |
| 6 Spec maintenance | Specs and README Feature status match what was built | Updated docs |

Every step's output is approved by a human before the next step starts (§4.III).

## TDD - how it works here

Per [`CONSTITUTION.md §4.I`](./CONSTITUTION.md#i-test-driven-development-tdd---mandatory), no implementation code without a failing test first (Small fixes excepted, unless they change behaviour).

1. Write one test in `tests/` (mirroring `src/`, named `*.test.ts`) for one behaviour.
2. `yarn test` - watch it fail for the expected reason. Paste the red output into the PR's validation trail.
3. Write the least code that passes. `yarn test` - the whole suite is green.
4. Refactor with the suite green.

Keep Discord out of the decision: listeners and commands are thin adapters, and the logic they call lives in `src/lib/` as plain functions that tests can drive without a gateway. Details in [`docs/TESTING.md`](./docs/TESTING.md).

## Commands

```bash
yarn install        # Yarn 4 via Corepack (`corepack enable` once)
yarn test           # Vitest, once
yarn test:watch     # Vitest, watch mode
yarn lint           # ESLint over src/ and tests/
yarn check-types    # tsc over src/, then over tests/
yarn format         # Prettier, write
yarn format:check   # Prettier, check (CI runs this)
yarn build          # tsc → dist/
```

Before opening a PR, all of `yarn lint`, `yarn check-types`, `yarn format:check`, `yarn test` and `yarn build` pass.

## Session isolation (read this before you write anything)

Per [`CONSTITUTION.md §4.VI`](./CONSTITUTION.md#vi-session-isolation--work-durability---mandatory). There is no hook enforcing this in this repository; the rules bind anyway.

- **Writing sessions use worktrees by default.** In a shared local checkout, call `EnterWorktree` or relaunch with `claude --worktree <name>` before writing. The main checkout stays read-only unless the human explicitly says otherwise for this session.
- **Never clear another session's edits out of your way.** No `stash`, `reset`, `checkout`, `restore` or `clean` over work that is not yours. If the tree is dirty with someone else's work, stop and tell the user.
- **Never force-push**, worktrees included.
- **Push before the session ends.** Remote sessions run in ephemeral containers; unpushed work dies with them.
- **Two sessions per repo, maximum.** If you start as the third, stop and say which sessions are live.

## CI runners (do not get this wrong)

**Do not add a CI job.** Per [`CONSTITUTION.md §4.VII`](./CONSTITUTION.md#vii-ci-job-economy---mandatory), a new `jobs:` entry or matrix leg needs an explicit human yes and one of the narrow exemptions in `docs/CONVENTIONS.md` §1. Put the check in the Vitest suite if it can run in-process, otherwise add a **step** to an existing job - `yarn test` itself is a step in `ci / Build & Verify`.

**This repository is the exception to the Hetzner rule.** It is public, so its jobs run on GitHub-hosted runners (`runs-on: ubuntu-latest`) and must never move to `[self-hosted, hetzner]`: fork PRs would execute on TPN LABS machines. Workflows are self-contained; do not point them at the private `TPN-Labs/GitHub-Actions` reusable workflows, which a public repository cannot call. Do not rename a job: `ci / Quality: ESLint`, `ci / Quality: TypeScript`, `ci / Build & Verify` and `title / Validate PR title` are required checks.

## Discord safety

- Never put a real bot token, server ID or member ID in code, tests, fixtures, docs or PR text. Tests use obviously fake snowflakes (`123456789012345678`).
- Tests and CI never connect to Discord. Acceptance happens by hand in a test server with a separate bot application, never the live server.
- `/eval` runs arbitrary code with the bot's token. Do not widen who can run it, and do not add another command that evaluates input.

## Linear tickets

No Linear project tracks this repository yet. Use `ENG-00` in branch names and PR titles for untracked work, as the history does. Before creating a ticket, ask the user which project it belongs to; do not default to another repository's project.

## PR titles

The PR title format is in [`CONSTITUTION.md §3`](./CONSTITUTION.md#git--pr-conventions): `<type>(<linear-ticket-number>): <summary>`, for example `docs(ENG-00): document OWNERS as space-separated`. The required `title / Validate PR title` check fails anything without a `<type>` prefix.

A PR opened from the Claude Code UI gets a generated title that does not follow this format. After any PR is opened for your branch, read its title and fix it before reporting the PR as ready.
