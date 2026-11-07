# Architecture

Last reviewed: 2026-11-06. How Discord Guard is put together today, and where planned features are expected to land. What the bot does for members and moderators is in [`README.md`](../README.md); the rules for changing it are in [`CONVENTIONS.md`](CONVENTIONS.md) and [`CONSTITUTION.md`](../CONSTITUTION.md).

## 1. Shape

One Node.js process, one Discord bot user, one server. No database, no HTTP API of its own, no other service.

| Part | Version (from `yarn.lock`) | Role |
|---|---|---|
| Node.js | 22 in CI | Runtime |
| discord.js | 14.x | Gateway connection and REST client |
| Sapphire framework | 5.x | Loads commands, listeners and preconditions from folders; routes events and interactions to them |
| Sapphire plugins | `logger`, `api`, `editable-commands` | Logging; registered but unused HTTP API plugin; message-command edit support |
| Vitest | 5.x (dev only) | Test runner |

Version numbers in prose go stale; `package.json` and `yarn.lock` are the authority.

## 2. Start-up

1. `src/index.ts` imports `src/lib/setup.ts` first.
2. `setup.ts` defaults `NODE_ENV` to `development`, loads `src/.env` (plus `.env.local` / `.env.<NODE_ENV>` variants, highest priority first, via `dotenv` + `dotenv-expand`), and registers the Sapphire plugins.
3. `index.ts` parses `STATUS_CHANNEL_ID` (a malformed value stops start-up with `[ENV] STATUS_CHANNEL_ID - ...`), builds a `SapphireClient` with its gateway intents, creates `container.statusAnnouncer`, and registers the shutdown hooks (§7). Then it calls `client.login()`, which reads `DISCORD_TOKEN` from the environment. A login failure is logged as fatal and the process exits with code 1.
4. Sapphire scans `dist/` for pieces and loads them into their stores. Application (slash and context-menu) commands are registered with Discord at this point, overwriting the remote definition when it differs.
5. The `ready` listener prints the start-up banner and how many pieces each store loaded. The `statusOnline` listener (`clientReady`, once) posts the online status message.

`src/preconditions/OwnerOnly.ts` reads `OWNERS` when the module loads, so a missing `OWNERS` stops start-up with `[ENV] OWNERS - ...` rather than failing on the first owner command.

## 3. Pieces and where they live

Sapphire loads every file in these folders automatically; nothing is registered by hand.

| Folder | Kind | Today |
|---|---|---|
| `src/commands/General/` | Commands for everyone | `/ping` (slash and message context menu) |
| `src/commands/Development/` | Owner tools | `/eval`, `/reload` |
| `src/commands/Guardian/` | Moderation and anti-spam | `/limits` - registered, handlers throw `not implemented` |
| `src/listeners/` | Gateway and framework events | `ready`; `statusOnline` (online status message); `listeners/commands/` logs command success and replies on command errors and denials |
| `src/preconditions/` | Checks run before a command | `OwnerOnly` - user ID must be in `OWNERS` |
| `src/lib/` | Plain code shared by pieces | Setup, constants, env parsing, helpers; `status/` holds the status-message copy, decisions, `StatusAnnouncer` and the shutdown hooks |

Rule of thumb: pieces adapt Discord to plain functions in `src/lib/`; decisions live in `src/lib/` where they can be unit-tested ([`TESTING.md §4`](TESTING.md#4-testing-discord-facing-code)).

## 4. Gateway intents

`src/index.ts` asks for `Guilds`, `GuildMembers`, `GuildModeration`, `GuildExpressions`, `GuildVoiceStates`, `GuildMessages`, `GuildMessageReactions`, `DirectMessages` and `DirectMessageReactions`. `GuildMembers` is privileged and must also be enabled in the Developer Portal. The planned anti-spam reads message text, which needs the privileged **Message Content** intent in both the portal and this list; it is not in the list yet.

## 5. Configuration and secrets

All configuration is environment variables: from `src/.env` (gitignored) when run locally, from Coolify's runtime variables when deployed. Variables already set in the process environment win over `src/.env`. Today: `DISCORD_TOKEN`, `OWNERS` (space-separated user IDs), `NODE_ENV`, and the optional `STATUS_CHANNEL_ID` (empty turns status messages off). Planned features add channel IDs, role IDs and thresholds; each lands in the README's Configuration table in the same PR.

The token grants full control of the bot. It never appears in logs, replies, tests or docs. `/eval` is owner-only and replaces the token in its output with `<TOKEN>` - today only the first occurrence, because it uses `String.replace` with a string pattern; that gap is a known defect, not the intended behaviour.

## 6. State

None persisted. Everything the bot knows is in memory and lost on restart; Discord itself is the only durable store (roles, the rules message and its reactions). Status messages use the same pattern: at start-up the bot reads up to 100 recent messages in the status channel, and if its own last status message there is an online one, the previous run ended without posting offline - an unplanned outage. The planned settings and anti-spam limits need durable storage; choosing it is a Step 2 design decision recorded as an ADR in `docs/adr/` (Constitution §6, open item 3).

In-memory state that grows with traffic - per-member message history for anti-spam, for example - must be capped or expire (Constitution §4.V).

## 7. External dependencies and failure modes

| Dependency | Failure | Behaviour today |
|---|---|---|
| Discord gateway | Login refused (bad token) | Fatal log, exit 1 |
| Discord gateway | Disconnect | discord.js reconnects |
| Discord REST | Request refused (permissions, role order, unknown member) | Command errors are caught by the command-error listeners, which reply with the error message; no feature calls that can fail this way exist yet |
| Discord REST | Rate limited | discord.js queues and retries per its rate-limit handling |
| Status channel | Unset, unknown, wrong type, or missing View / Send / Embed Links | Logged (warn when unset, error otherwise); no status messages; the bot keeps running |
| Status channel | Missing Read Message History | Online message posted without the outage line; warning logged. Discord returns an empty history rather than an error, so the permission is checked up front |
| Process | SIGTERM, SIGINT, uncaught exception or unhandled rejection | `registerShutdownHooks` routes all four to `StatusAnnouncer.shutdown`: errors are logged as fatal, the offline message is posted (only if the online one was), the gateway is closed, then the process exits - 0 for signals, 1 for errors - within 5 s (hard backstop at 5.5 s). These handlers replace Node's default crash on errors |
| Process | SIGKILL, out of memory, host loss | Nothing can be posted; the next online message carries the unplanned-outage line |

Each new feature states its failure behaviour for the calls it adds (Constitution §4.V, [`TESTING.md §7`](TESTING.md#7-failure-path-floor)).

## 8. Planned features

From the README roadmap; where each is expected to land:

| Feature | Pieces |
|---|---|
| Rules message with ✅ verification | `ready` (find or post the rules message), `messageReactionAdd` / `messageReactionRemove` listeners |
| Join / leave announcements | `guildMemberAdd` / `guildMemberRemove` listeners |
| Anti-spam with automatic kick | `messageCreate` listener + detection logic in `src/lib/`, moderation-log output |
| `/limits` | `src/commands/Guardian/limits.ts`, backed by persistent storage |

## 9. Delivery

- **CI** - `.github/workflows/ci.yml` (lint, types, Prettier; then test, build and verify `dist/`) and `.github/workflows/semantic_pr.yml` (PR title), on GitHub-hosted runners because the repository is public (Constitution §4.VII).
- **Dependencies** - Dependabot, weekly, with a 5-day cooldown, grouping `@sapphire/*` and discord.js packages.
- **Deployment** - Coolify, with the Nixpacks build pack. `nixpacks.toml` pins Node 22 (nixos-26.05), adds the Python/C++ toolchain that `@sapphire/type` needs to compile, installs with `yarn install --immutable`, builds with `yarn build` and starts with `node dist/index.js`. Secrets come from Coolify's runtime environment variables, not `src/.env`. Steps are in the README's "Deploying with Coolify" section.
