# Discord Guard conventions

Last reviewed: 2026-11-08. Internal reference for engineering and AI agents.

This document defines how changes are made to this repository and summarizes the binding engineering rules. [The Constitution](../CONSTITUTION.md) remains authoritative; where the two disagree, the Constitution wins and this document is the defect.

## 1. Process conventions

### Shared references

The documentation pillars are [the README](../README.md) (product, setup, commands), [architecture](ARCHITECTURE.md), this conventions document, and [testing](TESTING.md). They describe one bot from different perspectives. A copied fact is not a second source of authority: link to the owning document instead of restating it.

### Review and approval

Work is triaged by a human before specification or implementation. Features need observable requirements and an approved design; larger features also need approved test specifications and a task breakdown, all under `docs/specs/<YYYY-MM-DD>-<slug>/`. AI drafts; humans validate. Documentation describes approved behaviour and clearly separates planned work from what works today - the README's Feature status table is where that line is drawn.

Binding engineering commitments are test-driven and behaviour-driven development, human validation, reloading current artefacts, production readiness and security, isolated writing sessions with durable work, and economical CI.

### Git & PR conventions

- Branches use `<type>/<linear-ticket-number>/<short-description>`; allowed types are `fix`, `feat`, `ci`, `docs`, `chore`, and `test`. Ask for the ticket if unknown. No Linear project tracks this repository yet; until one does, use `ENG-00`.
- PR titles use `<type>(<linear-ticket-number>): <summary>`. Dependabot keeps its documented exception. The title check currently also accepts other scopes or none (`REQUIRE_SCOPE: 'false'`); the Constitution's form is still the standard.
- Use the complete [PR template](../.github/pull_request_template.md), including validation and screenshot status. Passing tests do not replace human acceptance.
- A change to anything Discord renders - a bot message, an embed, a command's name, description or options, a moderation-log entry - needs cropped before/after screenshots from a test server. Capture the before image **before the first edit**. Documentation-only and internal changes tick "Not applicable".
- Commit messages follow the same `<type>(<scope>): <summary>` form as PR titles.

### Session isolation & work durability

Writing sessions use isolated worktrees (`claude --worktree <name>` or `EnterWorktree`); the shared main checkout is read-only unless a human explicitly grants one session the right to write there. Never stash, reset, clean, or remove another session's work. Force-push is prohibited in every checkout. At most two agent sessions may be live per repository; a third must stop and name the existing sessions. Remote (Claude Code on the web) checkouts are exempt from the worktree rule and must push before the session ends.

This repository enforces these rules by discipline and review; it does not ship AnuntReal's `agent-guard.mjs` hook (Constitution §4.VI).

### CI Runners & Workflows

**Do not add a CI job without explicit human approval and a qualifying exception.** Try a test in the Vitest suite first, then a step in an existing job. A matrix leg creates another job and follows the same rule.

The complete exception list is: a different toolchain or runtime; a different trigger or path filter; a different permission, environment, or secret scope; or a genuinely long critical-path stage where parallelism materially reduces wall-clock time. Tidiness and independent verdicts are not exceptions. One job can collect individual check outcomes and publish a final verdict.

**Runners.** This repository is public, so its jobs run on **GitHub-hosted runners** (`runs-on: ubuntu-latest`) and never on the self-hosted Hetzner runner other TPN LABS repositories use: anyone can open a pull request here, and a fork's code must not execute on TPN LABS machines. Workflows are self-contained ports of `TPN-Labs/GitHub-Actions`, because a public repository cannot call reusable workflows from a private one.

**Security of workflows.** `semantic_pr.yml` runs on `pull_request_target` and therefore with the base branch's permissions: it must never check out or execute PR code, and untrusted values (the PR title) are passed through `env:`, never interpolated into a script. Any new workflow step that comments on PRs skips fork PRs, which get a read-only token.

**Required checks.** The ruleset requires `ci / Quality: ESLint`, `ci / Quality: TypeScript`, `ci / Build & Verify` and `title / Validate PR title`. Renaming a job or changing its `name:` breaks the ruleset for every PR until it is repointed; do it only together with the ruleset change.

**Dependencies.** Dependabot updates weekly with a 5-day cooldown. Keep `@sapphire/*` and discord.js packages in their groups; they move in lockstep. A dependency added by hand respects the same cooldown: pick a release at least five days old.

## 2. Domain vocabulary

| Use | Meaning |
|---|---|
| Server | The one Discord server (guild) the bot guards. |
| Member | Anyone in the server. |
| Verified member role | The role granted by reacting ✅ under the rules message; it unlocks the rest of the server. |
| Rules channel / rules message | The channel a new member sees first (set by `RULES_CHANNEL_ID`), and the single bot-posted message in it that carries the ✅ reaction. |
| Announcements channel | Where join and leave announcements are posted; set by `ANNOUNCEMENTS_CHANNEL_ID`. |
| Join announcement / leave announcement | The green embed (pinging the new member) and the grey embed the bot posts in the announcements channel when a member joins or leaves. |
| Moderation log channel | Where the bot records every automatic action (kicks) with its reason and evidence. For now this is the announcements channel. |
| Kick log | The red embed the bot posts in the moderation log channel when anti-spam kicks a member: who, which rules, the deleted messages with links censored to their domain name, and the outcome. |
| Rule | One anti-spam check (cross-channel, flood, repeat, mention burst, link spread); it **fires** when a member's recent messages reach its threshold. |
| Status channel / status message | The channel set by `STATUS_CHANNEL_ID`, and the green online or red offline embed the bot posts there when it starts or stops. |
| Moderator | A member with the **Manage Messages** permission in the server (Administrator includes it). Never checked by anti-spam. |
| Owner | A user whose ID is in `OWNERS`. Can run owner-only commands, including `/eval`. |
| Limit | A rule's threshold: how many times an action may happen in an interval before the member is kicked. Code constants today; `/limits` will edit them once storage exists. |
| Piece | Sapphire's word for a command, listener, precondition or argument loaded from its folder. |

Use these words in requirements, tests, code and user-facing text. "User" alone is ambiguous: say member, moderator or owner.

## 3. Code conventions

| Rule | Practical consequence |
|---|---|
| Use the installed library versions, not remembered ones. | discord.js v14 (`EmbedBuilder`, `GatewayIntentBits`) and Sapphire v5. Check `yarn.lock` and the library's types before using an API you recall. |
| One piece per file, in the folder for its kind and category. | A moderation command goes in `src/commands/Guardian/`; a gateway event handler in `src/listeners/`. `yarn dlx @sapphire/cli generate` scaffolds into the right place. |
| Pieces are thin; decisions live in `src/lib/`. | The listener reads the event and performs Discord calls; a plain function decides. That function is what the tests cover. |
| Permission gates are preconditions. | Owner-only and moderator-only commands declare `preconditions: [...]`; a handler does not re-implement the check inline. |
| Log through `this.container.logger`. | Never `console.log` outside the start-up banner. Log errors with guild, channel, member and command context. |
| Never swallow an error. | A `catch` either handles the failure deliberately (and a test covers it) or logs and rethrows. Empty catches and log-and-return-null are forbidden. |
| Configuration comes from `src/.env`. | A new variable is read and validated at start-up, documented in `.env.example` and the README's Configuration table in the same PR. |
| Formatting belongs to Prettier. | Run `yarn format`; ESLint's stylistic rules are off so the two never fight. Tabs, single quotes, as configured by `@sapphire/prettier-config`. |
| Mark deliberately unused bindings with `_`. | `_interaction` - matches the ESLint rule and TypeScript's `noUnusedParameters`. |

## 4. Testing conventions

Summarized here; [TESTING.md](TESTING.md) owns the detail.

- Test first, watch it fail for the right reason, then implement (Constitution §4.I).
- Tests live in `tests/`, mirroring `src/`, named `*.test.ts`, with behaviour names.
- No live Discord in tests or CI. Fake discord.js objects at the boundary, typed with `Pick<>` of the real type.
- Never edit a test to make it pass. A red test is a bug or a spec gap.
- Before opening a PR: `yarn format`, then `yarn lint`, `yarn check-types`, `yarn format:check`, `yarn test` and `yarn build` all pass.

## 5. Production readiness checklist

Completed at Step 5 for any change to a runtime surface (Constitution §4.V). Copy it into the PR when it applies.

- [ ] **Gated.** Every command that changes server state or exposes internals has a precondition, and a test fails when that precondition is removed.
- [ ] **Enforced, not deferred.** No control is left as a TODO in a live path; a deferred control means the surface does not ship enabled.
- [ ] **Bounded.** Per-member, per-channel and cached state is capped or expires; no unbounded queue of Discord calls during a spam wave or raid.
- [ ] **Failure modes chosen and tested.** Missing permission, role above the bot's, member already gone, message already deleted, rate limit: each has a decided outcome for the member, the moderators and the log.
- [ ] **No stubs shipped.** No registered command or enabled listener whose handler is a placeholder.
- [ ] **Debuggable.** Failures are logged with enough context to reproduce from the log alone.
- [ ] **Secrets.** No token or `.env` value in code, logs, replies, tests or docs.
- [ ] **Intents and permissions.** Any new intent or bot permission is added to `src/index.ts`, the README's Discord setup section, and, for privileged intents, called out in the PR.
- [ ] **Accepted in a test server** with a separate bot application, never on the live server.

## 6. Maintaining the documentation

Each pillar has one responsibility and links to the others. When behaviour changes, update the owning document in the same PR: the README's Feature status, Configuration and Commands tables for anything visible; ARCHITECTURE for pieces, intents, state and dependencies; this document for rules; TESTING for test practice. Rewrite changed behaviour coherently rather than appending contradicting notes.

Root `CLAUDE.md` is the canonical agent entry point; root `AGENTS.md` links to it.

## Review triggers

Review this document when the Git, CI or testing rules change, when a new kind of piece or a storage layer is introduced, or when the Constitution is amended.
