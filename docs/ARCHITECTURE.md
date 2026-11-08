# Architecture

Last reviewed: 2026-11-08. How Discord Guard is put together today, and where planned features are expected to land. What the bot does for members and moderators is in [`README.md`](../README.md); the rules for changing it are in [`CONVENTIONS.md`](CONVENTIONS.md) and [`CONSTITUTION.md`](../CONSTITUTION.md).

## 1. Shape

One Node.js process, one Discord bot user, one server. No database, no HTTP API of its own, no other service.

| Part | Version (from `yarn.lock`) | Role |
|---|---|---|
| Node.js | 22 in CI | Runtime |
| discord.js | 14.x | Gateway connection and REST client |
| Sapphire framework | 5.x | Loads commands, listeners and preconditions from folders; routes events and interactions to them |
| Sapphire plugins | `logger`, `api`, `editable-commands` | Logging; registered but unused HTTP API plugin; message-command edit support |
| tldts | 7.x | Public-suffix list: anti-spam censors each link in a kick log to its domain name without subdomains or suffix |
| Vitest | 5.x (dev only) | Test runner |

Version numbers in prose go stale; `package.json` and `yarn.lock` are the authority.

## 2. Start-up

1. `src/index.ts` imports `src/lib/setup.ts` first.
2. `setup.ts` defaults `NODE_ENV` to `development`, loads `src/.env` (plus `.env.local` / `.env.<NODE_ENV>` variants, highest priority first, via `dotenv` + `dotenv-expand`), and registers the Sapphire plugins.
3. `index.ts` parses `STATUS_CHANNEL_ID`, `ANNOUNCEMENTS_CHANNEL_ID` and `RULES_CHANNEL_ID` (a malformed value stops start-up with `[ENV] <KEY> - ...`), builds a `SapphireClient` with its gateway intents and the `GuildMember` partial (§4), creates `container.memberAnnouncer`, `container.spamGuard` (reading `OWNERS`; its sweep timer is started and `unref()`'d) and `container.statusAnnouncer`, and registers the shutdown hooks (§7). Then it calls `client.login()`, which reads `DISCORD_TOKEN` from the environment. A login failure is logged as fatal and the process exits with code 1.
4. Sapphire scans `dist/` for pieces and loads them into their stores. Application (slash and context-menu) commands are registered with Discord at this point, overwriting the remote definition when it differs.
5. The `ready` listener prints the start-up banner and how many pieces each store loaded. The `statusOnline` listener (`clientReady`, once) posts the online status message. The `memberAnnouncerReady` listener (`clientReady`, once) fetches the announcements server's member list, so join dates are known for leave announcements.

`src/preconditions/OwnerOnly.ts` reads `OWNERS` when the module loads, so a missing `OWNERS` stops start-up with `[ENV] OWNERS - ...` rather than failing on the first owner command.

## 3. Pieces and where they live

Sapphire loads every file in these folders automatically; nothing is registered by hand.

| Folder | Kind | Today |
|---|---|---|
| `src/commands/General/` | Commands for everyone | `/ping` (slash and message context menu) |
| `src/commands/Development/` | Owner tools | `/eval`, `/reload` |
| `src/commands/Guardian/` | Moderation and anti-spam | `/limits` - registered, handlers throw `not implemented` |
| `src/listeners/` | Gateway and framework events | `ready`; `statusOnline` (online status message); `memberAnnouncerReady`, `memberJoinAnnouncement`, `memberLeaveAnnouncement` (join and leave announcements); `antiSpamMessage` (`messageCreate`, anti-spam); `listeners/commands/` logs command success and replies on command errors and denials |
| `src/preconditions/` | Checks run before a command | `OwnerOnly` - user ID must be in `OWNERS` |
| `src/lib/` | Plain code shared by pieces | Setup, constants, env parsing, helpers; `status/` holds the status-message copy, decisions, `StatusAnnouncer` and the shutdown hooks; `announcements/` holds the join and leave copy, the Romanian duration wording, decisions and `MemberAnnouncer`; `antispam/` holds the rules and thresholds, link finding and censoring (via `tldts`), the bounded `MessageTracker` and `EnforcementQueue`, the kick-log builder and `SpamGuard` |

Rule of thumb: pieces adapt Discord to plain functions in `src/lib/`; decisions live in `src/lib/` where they can be unit-tested ([`TESTING.md §4`](TESTING.md#4-testing-discord-facing-code)).

## 4. Gateway intents

`src/index.ts` asks for `Guilds`, `GuildMembers`, `GuildModeration`, `GuildExpressions`, `GuildVoiceStates`, `GuildMessages`, `MessageContent`, `GuildMessageReactions`, `DirectMessages` and `DirectMessageReactions`. `GuildMembers` and `MessageContent` are privileged and must also be enabled in the Developer Portal; without them Discord refuses the login ("disallowed intents") and the bot exits 1. Anti-spam needs `MessageContent`: without it Discord sends empty message text, and the repeat and link rules and the kick-log excerpts would silently stop working.

The client also enables the **`GuildMember` partial**. Without it, discord.js 14.27 emits `guildMemberRemove` only for members it has cached, so anyone who joined before the last restart would leave without an event and without a leave announcement. Side effect: `guildMemberUpdate` can deliver a partial old member and `guild.members.me` can be partial. Nothing handles `guildMemberUpdate` today; a future listener for it must handle partial members.

## 5. Configuration and secrets

All configuration is environment variables: from `src/.env` (gitignored) when run locally, from Coolify's runtime variables when deployed. Variables already set in the process environment win over `src/.env`. Today: `DISCORD_TOKEN`, `OWNERS` (space-separated user IDs), `NODE_ENV`, and the optional `STATUS_CHANNEL_ID` (empty turns status messages off), `ANNOUNCEMENTS_CHANNEL_ID` (empty turns join and leave announcements off) and `RULES_CHANNEL_ID` (empty leaves the rules link out of join announcements). Planned features add channel IDs, role IDs and thresholds; each lands in the README's Configuration table in the same PR.

The token grants full control of the bot. It never appears in logs, replies, tests or docs. `/eval` is owner-only and replaces the token in its output with `<TOKEN>` - today only the first occurrence, because it uses `String.replace` with a string pattern; that gap is a known defect, not the intended behaviour.

## 6. State

None persisted. Everything the bot knows is in memory and lost on restart; Discord itself is the only durable store (roles, the rules message and its reactions). Anti-spam thresholds are code constants for the same reason. Status messages use the same pattern: at start-up the bot reads up to 100 recent messages in the status channel, and if its own last status message there is an online one, the previous run ended without posting offline - an unplanned outage. The planned settings and anti-spam limits need durable storage; choosing it is a Step 2 design decision recorded as an ADR in `docs/adr/` (Constitution §6, open item 3).

Join and leave announcements hold only two counters (announcements in progress, capped at 10, and skipped ones). At start-up the bot fetches the announcements server's member list into discord.js's member cache, so each member's join date is known when they leave; the cache is the size of the server and is kept current by the join and leave events. When a member's join date isn't known (the fetch failed, or they left before it finished), the leave announcement leaves out the time on the server.

In-memory state that grows with traffic must be capped or expire (Constitution §4.V). Anti-spam's is: `MessageTracker` keeps at most 50 messages per member for 10 minutes and at most 5,000 members (least recently active forgotten first), and stores only reduced facts per message - IDs, timestamp, a hash of the text, mention and link flags and a censored 200-character excerpt - never the raw text. The theoretical ceiling is about 125 MB; realistic use is a few MB. A 60-second sweep drops expired entries. `EnforcementQueue` holds at most 5 running and 50 waiting enforcements, and the failed-kick cooldown at most 1,000 members for 10 minutes.

## 7. External dependencies and failure modes

| Dependency | Failure | Behaviour today |
|---|---|---|
| Discord gateway | Login refused (bad token) | Fatal log, exit 1 |
| Discord gateway | Disconnect | discord.js reconnects |
| Discord REST | Request refused (permissions, role order, unknown member) | Command errors are caught by the command-error listeners, which reply with the error message. Anti-spam's refused calls are in the rows below |
| Discord REST | Rate limited | discord.js queues and retries per its rate-limit handling |
| Status channel | Unset, unknown, wrong type, or missing View / Send / Embed Links | Logged (warn when unset, error otherwise); no status messages; the bot keeps running |
| Status channel | Missing Read Message History | Online message posted without the outage line; warning logged. Discord returns an empty history rather than an error, so the permission is checked up front |
| Announcements channel | Unset | warn once at ready; no announcements; the bot keeps running |
| Announcements channel | Unknown, wrong type, or missing View / Send / Embed Links; or a send refused | error per announcement with the channel, member and guild IDs; no retry; the bot keeps running |
| Announcements | More than 10 joins or leaves in progress at once (a raid) | the rest are skipped; one warn when skipping starts, one with the count when the backlog drains. Rate limits bound throughput, not the queue, so the cap is the bot's own |
| Discord gateway | Member-list fetch at start-up fails or times out (120 s) | warn; leave announcements for members who joined before this start omit the duration |
| Anti-spam | DM refused or slower than 3 s | warn; the kick goes ahead |
| Anti-spam | Kick refused (role at or above the bot's, no Kick Members, member gone) | error; messages still deleted; kick log shows the failure; for 10 min new spam from that member is only deleted (no DM, kick or kick log) |
| Anti-spam | Delete refused in a channel, or channel gone | error per channel; other channels still deleted; kick log's count shows the shortfall. A single already-deleted message counts as deleted |
| Anti-spam | Kick-log channel unset, unusable, in another server, or send refused | the kick log's facts (censored) go to the bot's log instead: info when unset, warn for another server, error otherwise; no retry |
| Anti-spam | More than 55 members firing rules at once (a raid) | 5 enforcements run, 50 wait, the rest are skipped; one warn when skipping starts, one with the count when the queue empties |
| Process | SIGTERM, SIGINT, uncaught exception or unhandled rejection | `registerShutdownHooks` routes all four to `StatusAnnouncer.shutdown`: errors are logged as fatal, the offline message is posted (only if the online one was), the gateway is closed, then the process exits - 0 for signals, 1 for errors - within 5 s (hard backstop at 5.5 s). These handlers replace Node's default crash on errors |
| Process | SIGKILL, out of memory, host loss | Nothing can be posted; the next online message carries the unplanned-outage line |

Each new feature states its failure behaviour for the calls it adds (Constitution §4.V, [`TESTING.md §7`](TESTING.md#7-failure-path-floor)).

## 8. Planned features

From the README roadmap; where each is expected to land:

| Feature | Pieces |
|---|---|
| Rules message with ✅ verification | `ready` (find or post the rules message), `messageReactionAdd` / `messageReactionRemove` listeners |
| `/limits` | `src/commands/Guardian/limits.ts`, backed by persistent storage; edits the anti-spam thresholds that are code constants today |

## 9. Delivery

- **CI** - `.github/workflows/ci.yml` (lint, types, Prettier; then test, build and verify `dist/`) and `.github/workflows/semantic_pr.yml` (PR title), on GitHub-hosted runners because the repository is public (Constitution §4.VII).
- **Dependencies** - Dependabot, weekly, with a 5-day cooldown, grouping `@sapphire/*` and discord.js packages.
- **Deployment** - Coolify, with the Nixpacks build pack. `nixpacks.toml` pins Node 22 (nixos-26.05), adds the Python/C++ toolchain that `@sapphire/type` needs to compile, installs with `yarn install --immutable`, builds with `yarn build` and starts with `node dist/index.js`. Secrets come from Coolify's runtime environment variables, not `src/.env`. Steps are in the README's "Deploying with Coolify" section.
