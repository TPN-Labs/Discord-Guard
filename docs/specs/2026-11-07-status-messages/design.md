# Bot status messages - design

| | |
|---|---|
| Status | **Approved (Step 2)** - 2026-11-07 |
| Triage | Feature (0 → 1 → 2 → 4 → 5 → 6) |
| Requirements | [`requirements.md`](requirements.md) (approved 2026-11-07) |
| Ticket | ENG-00 - no ticket |
| Next | Step 4, implementation (a Feature skips Step 3), only after this document is approved |

## 1. Grounding

Every API below was checked against the installed packages, not recalled (Constitution §2, §4.IV).

| Fact | Source |
|---|---|
| discord.js **14.27.0**, @sapphire/framework **5.5.1**, Node **22** | `yarn.lock`, `node -v` |
| `Events.ClientReady` is `'clientReady'`. The `'ready'` event is deprecated. | `discord.js/typings/index.d.ts` (`ClientEvents`, `Events`) |
| `ChannelManager.fetch(id)` returns `Promise<Channel \| null>` | same file |
| `GuildChannel.permissionsFor(UserResolvable)` returns `Readonly<PermissionsBitField> \| null` | same file |
| `Client.destroy()` returns `Promise<void>` | same file |
| `Colors.Green` = `0x57f287`, `Colors.Red` = `0xed4245` | same file |
| `ChannelType.GuildText` = 0, `ChannelType.GuildAnnouncement` = 5 | `discord-api-types/payloads/v10/channel.d.ts` |
| `RESTJSONErrorCodes`: `UnknownChannel` 10003, `MissingAccess` 50001, `MissingPermissions` 50013 | `discord-api-types/rest/common.d.ts` |
| Get Channel Messages: *"If the current user is missing the `READ_MESSAGE_HISTORY` permission in the channel, then no messages will be returned."* The `limit` is 1-100, default 50. | Discord API docs, Message resource |
| No installed library registers `SIGTERM`, `SIGINT`, `uncaughtException` or `unhandledRejection` handlers | grep over `@sapphire/framework`, `discord.js`, `@discordjs/ws`, `@sapphire/plugin-api`, `@sapphire/plugin-logger` |

The Read Message History fact shapes the design. A missing permission doesn't cause an error: Discord returns an empty list, which would look like "never posted before" and silently hide an unplanned outage. So the bot checks the permission **before** fetching history (§5.3), rather than reading meaning into an empty result.

## 2. Overview

```
start-up                                              shutdown
────────                                              ────────
index.ts                                              SIGTERM / SIGINT / uncaughtException / unhandledRejection
 ├─ envParseOptionalSnowflake('STATUS_CHANNEL_ID')      │
 │    malformed → throw [ENV] … (AC-16)                 ▼
 ├─ container.statusAnnouncer = new StatusAnnouncer()  registerShutdownHooks → statusAnnouncer.shutdown(trigger)
 ├─ registerShutdownHooks(process, …)                   ├─ lifecycle.beginShutdown(trigger) → plan | null (AC-9)
 └─ client.login()                                      ├─ plan.postOffline? (only if online was posted, AC-10)
                                                         │    send offline embed  ┐
listeners/statusOnline.ts  (clientReady, once)           ├─ client.destroy()       ┘ within one 5 s deadline (AC-8)
 └─ statusAnnouncer.announceOnline(client)               └─ exit(plan.exitCode)    0 for signals, 1 for errors
      ├─ lifecycle.tryBeginAnnounce()  (AC-04)
      ├─ resolveStatusChannel()        (AC-17, AC-18)
      ├─ canReadHistory? fetch 100 → classifyPreviousRun() (AC-11..AC-14)
      ├─ send online embed (+ outage line)
      └─ lifecycle.markOnlinePosted()
```

The decisions are plain functions in `src/lib/status/`, so tests can drive them without a gateway. `StatusAnnouncer` is the only class that touches discord.js objects, and its tests use `Pick<>`-typed fakes ([`TESTING.md §4`](../../TESTING.md#4-testing-discord-facing-code)).

## 3. Pieces and functions

| File | Kind | Responsibility | Requirements |
|---|---|---|---|
| `src/lib/status/copy.ts` | constants | The approved phrases, titles and outage line, word for word as in requirements §6 | AC-02, AC-07, AC-11 |
| `src/lib/status/pick-phrase.ts` | pure function | `pickPhrase(list, random)` | AC-03, AC-07 |
| `src/lib/status/message.ts` | pure function | `buildStatusMessage(input)` builds the embed and the `allowedMentions` payload | AC-02, AC-07, AC-11, AC-12, AC-19 |
| `src/lib/status/previous-run.ts` | pure function | `classifyPreviousRun(entries, botUserId)` | AC-11, AC-12, AC-13 |
| `src/lib/status/channel.ts` | pure functions + thin adapter | `checkStatusChannelPermissions`, `describeDiscordError`, `resolveStatusChannel` | AC-14, AC-17, AC-18 |
| `src/lib/status/lifecycle.ts` | pure state machine | `StatusLifecycle`: when an online or offline message may be posted, and with which exit code | AC-04, AC-09, AC-10 |
| `src/lib/status/shutdown.ts` | process adapter | `registerShutdownHooks`, `withDeadline`, `SHUTDOWN_DEADLINE_MS` | AC-05, AC-06, AC-08 |
| `src/lib/status/announcer.ts` | Discord adapter | `StatusAnnouncer`: `announceOnline(client)` and `shutdown(trigger, error)`. Also declares the `container.statusAnnouncer` augmentation. | AC-01, AC-05, AC-06, AC-15, AC-20 |
| `src/lib/env-parser.ts` | pure function (extended) | `envParseOptionalSnowflake('STATUS_CHANNEL_ID')` | AC-15, AC-16 |
| `src/listeners/statusOnline.ts` | Sapphire listener | `clientReady`, `once: true`; one line that delegates to `container.statusAnnouncer.announceOnline(client)` | AC-01, AC-04 |
| `src/index.ts` | entry point (edited) | Parse config, create the announcer, register shutdown hooks, all before `client.login()` | AC-05, AC-06, AC-16 |

No command and no precondition is added. Nothing in this feature can be triggered by a member, so there is no authorization surface (Constitution §4.V "Gated" doesn't apply).

## 4. Contracts

TypeScript signatures that Step 4 implements. Names can be polished during implementation; behaviour can't change without looping back to this document.

```ts
// copy.ts
export type StatusKind = 'online' | 'offline';
export const ONLINE_PHRASES: readonly [string, ...string[]];   // requirements §6.1, 5 entries
export const OFFLINE_PHRASES: readonly [string, ...string[]];  // requirements §6.2, 5 entries
export const STATUS_TITLES: Readonly<Record<StatusKind, string>>;
export const UNPLANNED_OUTAGE_LINE: string;

// pick-phrase.ts
export function pickPhrase(phrases: readonly [string, ...string[]], random?: () => number): string;
// index = min(floor(random() * length), length - 1); random defaults to Math.random

// message.ts
export interface StatusMessageInput {
	kind: StatusKind;
	phrase: string;
	unplannedOutage: boolean; // ignored when kind === 'offline'
	timestamp: Date;
}
export function buildStatusMessage(input: StatusMessageInput): {
	embeds: [EmbedBuilder];
	allowedMentions: { parse: [] }; // AC-19: nothing pings, whatever the text says
};
// embed: colour Colors.Green / Colors.Red, title STATUS_TITLES[kind],
// description = phrase, or `${phrase}\n\n${UNPLANNED_OUTAGE_LINE}` when online and unplannedOutage,
// timestamp = input.timestamp

// previous-run.ts
export const STATUS_HISTORY_LIMIT = 100;
export interface StatusHistoryEntry {
	authorId: string;
	embedTitles: readonly (string | null)[];
}
export type PreviousRun = 'online' | 'offline' | 'none';
export function classifyPreviousRun(newestFirst: readonly StatusHistoryEntry[], botUserId: string): PreviousRun;
// first entry by botUserId whose embedTitles include STATUS_TITLES.online or .offline decides; else 'none'

// channel.ts
export type StatusChannel = TextChannel | NewsChannel; // GuildText or GuildAnnouncement only
export interface StatusChannelPermissions {
	missing: string[]; // names from ViewChannel, SendMessages, EmbedLinks
	canReadHistory: boolean; // ReadMessageHistory
}
export function checkStatusChannelPermissions(perms: Readonly<PermissionsBitField> | null): StatusChannelPermissions;
export function describeDiscordError(error: unknown): string; // maps 10003 / 50001 / 50013, else error.message
export type ResolvedStatusChannel =
	| { ok: true; channel: StatusChannel; canReadHistory: boolean }
	| { ok: false; reason: string };
export function resolveStatusChannel(
	client: Pick<Client<true>, 'channels' | 'user'>,
	channelId: string
): Promise<ResolvedStatusChannel>;

// lifecycle.ts
export type ShutdownTrigger = 'SIGTERM' | 'SIGINT' | 'uncaughtException' | 'unhandledRejection';
export interface ShutdownPlan {
	postOffline: boolean;
	exitCode: 0 | 1;
}
export class StatusLifecycle {
	tryBeginAnnounce(): boolean; // true once, from 'starting' only
	markOnlinePosted(): void; // 'announcing' → 'online'
	beginShutdown(trigger: ShutdownTrigger): ShutdownPlan | null; // null if already shutting down
}

// shutdown.ts
export const SHUTDOWN_DEADLINE_MS = 5_000;
export function withDeadline(task: () => Promise<void>, ms: number): Promise<'done' | 'failed' | 'timed-out'>;
export function registerShutdownHooks(
	proc: Pick<NodeJS.Process, 'on'>,
	onTrigger: (trigger: ShutdownTrigger, error?: unknown) => void
): void;

// env-parser.ts
export function envParseOptionalSnowflake(key: 'STATUS_CHANNEL_ID'): string | null;
// unset or blank → null; trimmed value matching /^\d{17,20}$/ → value;
// anything else → throw Error('[ENV] STATUS_CHANNEL_ID - The key must be a Discord ID (17-20 digits).')
```

## 5. Behaviour

### 5.1 Start-up (`src/index.ts`)

The order matters:

1. `envParseOptionalSnowflake('STATUS_CHANNEL_ID')` runs first. A malformed value throws before any handler is registered, so the process dies with the `[ENV]` error and exit code 1, the same visible outcome as a missing `OWNERS` (AC-16).
2. `container.statusAnnouncer = new StatusAnnouncer({ channelId, lifecycle: new StatusLifecycle(), logger: container.logger })`.
3. `registerShutdownHooks(process, (trigger, error) => void container.statusAnnouncer.shutdown(trigger, error, client, process.exit))`.
4. `client.login()`, unchanged. A login failure still logs as fatal and calls `process.exit(1)` directly. The lifecycle never reached `online`, so no offline message is attempted (AC-10).

### 5.2 Online (`StatusAnnouncer.announceOnline`)

1. `channelId === null` → log **warn** once (`Status messages are off: STATUS_CHANNEL_ID is not set.`) and return (AC-15).
2. `lifecycle.tryBeginAnnounce()` returns `false` → return. This backs up `once: true`: a second `clientReady` in the same process can't post twice (AC-04).
3. `resolveStatusChannel` (§5.3). On failure, log **error** with the channel ID and reason, then return (AC-17, AC-18).
4. If `canReadHistory`, call `channel.messages.fetch({ limit: STATUS_HISTORY_LIMIT })`, sort newest first by `createdTimestamp`, map each message to a `StatusHistoryEntry` and call `classifyPreviousRun`. If not, log **warn** (`… missing Read Message History; unplanned-outage detection skipped`) and treat the previous run as `'none'` (AC-14). If the history fetch itself fails, log **warn** with `describeDiscordError` and treat it as `'none'`. The online message still goes out.
5. `channel.send(buildStatusMessage({ kind: 'online', phrase: pickPhrase(ONLINE_PHRASES), unplannedOutage: previous === 'online', timestamp: now() }))`.
6. Success → `lifecycle.markOnlinePosted()`, keep a reference to the channel for shutdown, and log **info** with the channel ID and the previous-run result. Failure → log **error** with `describeDiscordError`. The lifecycle stays out of `online`, so no offline message follows (consistent with AC-10).

`announceOnline` handles all its own errors and never rejects. If it rejected anyway, Sapphire's `listenerError` handling would log it.

### 5.3 Channel resolution (`resolveStatusChannel`)

1. `client.channels.fetch(channelId)`. A thrown `DiscordAPIError` with 10003 or 50001, or a `null` result, → `{ ok: false }` with a readable reason (AC-17).
2. The type must be `ChannelType.GuildText` or `ChannelType.GuildAnnouncement`. Voice channels are text-based in discord.js v14 (they have text-in-voice), so `isTextBased()` alone would accept them. Checking the type explicitly is what makes AC-17's "voice channel" case fail. Threads, forums, stages, categories and DMs are rejected.
3. `checkStatusChannelPermissions(channel.permissionsFor(client.user))`. A missing ViewChannel, SendMessages or EmbedLinks → `{ ok: false }` naming the missing permissions (AC-18). ReadMessageHistory only sets `canReadHistory` (AC-14).
4. The send call still maps `MissingPermissions` (50013) through `describeDiscordError`, because overwrites can change between the check and the send.

### 5.4 Unplanned-outage detection (`classifyPreviousRun`)

- The input is up to **100** most recent messages, newest first: one REST call, bounded.
- The first message whose `authorId === botUserId` **and** whose embed title is exactly the online or offline title decides the result. Other authors and the bot's other messages are skipped (AC-13).
- No status message among the 100 → `'none'` → no outage line (AC-12). If more than 100 messages of chatter have buried the last status message, the outage line is missed. That's accepted: the status channel is meant to be quiet.
- The bot's own messages expose their embeds without the privileged Message Content intent, so no intent change is needed (§6).

### 5.5 Shutdown (`registerShutdownHooks` + `StatusAnnouncer.shutdown`)

`registerShutdownHooks` adds `proc.on` handlers for `SIGTERM`, `SIGINT`, `uncaughtException` and `unhandledRejection`. Registering the last two **replaces Node's default crash**, so this code becomes responsible for exiting. The backstop below guarantees that.

`StatusAnnouncer.shutdown(trigger, error, client, exit)`:

1. For an error trigger, log the error in full with **fatal** first (AC-06).
2. `lifecycle.beginShutdown(trigger)`:
   - `null` (already shutting down) → log **warn** `Shutdown already in progress; ignoring <trigger>` and return (AC-09). A second Ctrl+C doesn't force an early exit; the deadline already bounds the wait.
   - Otherwise it returns a plan. `postOffline` is true only when the lifecycle is `online` (AC-10). `exitCode` is `0` for `SIGTERM`/`SIGINT` and `1` for errors (AC-06).
3. Arm a **backstop**: `setTimeout(() => exit(plan.exitCode), SHUTDOWN_DEADLINE_MS + 500)`. It isn't unref'd, so the process exits even if the code below hangs.
4. `withDeadline(async () => { if (plan.postOffline) await channel.send(buildStatusMessage({ kind: 'offline', … })); await client.destroy(); }, SHUTDOWN_DEADLINE_MS)`.
   - `'timed-out'` → log **error** `Offline status message not sent within 5000 ms; exiting` (AC-08).
   - `'failed'` → log **error** with `describeDiscordError` (AC-08).
5. `exit(plan.exitCode)`.

`client.destroy()` shares the same deadline. Today SIGTERM kills the process without closing the gateway, so Discord shows the bot online until the heartbeat times out. After this change the bot closes the gateway cleanly when there's time. The 5 s budget fits inside Docker's default 10 s stop grace period. Coolify's own setting is checked at Step 5 (M-01).

**Behaviour change for unhandled rejections.** Node 22 already crashes on an unhandled rejection by default. With this change it still logs and exits with code 1, but first tries the offline message, taking at most 5 s. Nothing that used to survive will now die, and nothing that used to die will now survive.

### 5.6 Lifecycle states

```
starting ──tryBeginAnnounce()──▶ announcing ──markOnlinePosted()──▶ online
   │                                 │                                │
   └──────────── beginShutdown() ────┴──────────── beginShutdown() ───┘
                                     ▼
                               shutting-down   (beginShutdown() → null from here)
postOffline = (state was online)
```

## 6. Intents, permissions, API calls

- **Intents:** no change. `Guilds` (already requested) caches channels, roles and the bot's own member, which `permissionsFor` needs. Fetching messages over REST needs no intent, and the bot's own messages carry their embeds without Message Content.
- **Bot permissions in the status channel:** View Channels, Send Messages, Embed Links (required) and Read Message History (optional, for outage detection). All four are already in the README's permission table; implementation adds "status messages" to their "Why" text.
- **Discord API calls per process:** at most `GET /channels/{id}` (often served from cache), one `GET /channels/{id}/messages?limit=100`, one `POST /channels/{id}/messages` at start-up and one at shutdown. Rate limits can't realistically be hit. discord.js queues and retries 429s, and the shutdown deadline caps that wait.

## 7. State and storage

- **In memory:** one `StatusLifecycle` state value and one channel reference. Both are fixed size and don't grow with traffic (§4.V "Bounded").
- **Durable:** none added. The status channel's own history is the record of the previous run's last status message. That's the "Discord is the only durable store" pattern [`ARCHITECTURE.md §6`](../../ARCHITECTURE.md#6-state) already describes for the rules message.
- **No ADR.** No storage technology is chosen here, and Constitution §6 open item 3 (persistent storage) stays open and unaffected.

## 8. Failure modes

| Situation | Members and moderators see | Log | Bot keeps running | AC |
|---|---|---|---|---|
| `STATUS_CHANNEL_ID` unset | No status messages | warn, once at start-up | yes | AC-15 |
| `STATUS_CHANNEL_ID` malformed | Bot never comes online | `[ENV] STATUS_CHANNEL_ID - …`, exit 1 | no (by design) | AC-16 |
| Channel unknown, hidden, or wrong type | No status messages | error with channel ID and reason | yes | AC-17 |
| Missing View, Send or Embed Links | No status messages | error naming the missing permissions | yes | AC-18 |
| Missing Read Message History | Online message without the outage line | warn | yes | AC-14 |
| History fetch fails | Online message without the outage line | warn with the Discord error | yes | AC-14 |
| Online send fails | No online message; no offline message at shutdown | error with the Discord error | yes | AC-10 |
| Offline send slow or failing at shutdown | No offline message; the next start shows the outage line | error (timed out, or the Discord error) | exits within 5 s | AC-08 |
| Hard kill (SIGKILL, OOM, host loss) | No offline message; the next online message has the outage line | nothing (process is dead) | n/a | AC-11 |
| SIGTERM followed by an error, or SIGINT twice | One offline message | warn for the ignored trigger | exits once | AC-09 |

## 9. Non-functional requirements

| Requirement | Number |
|---|---|
| Shutdown time this feature adds, worst case | ≤ 5 000 ms (deadline), with a hard backstop at 5 500 ms |
| History scanned at start-up | ≤ 100 messages, one REST call |
| Status messages per process lifetime | ≤ 1 online + ≤ 1 offline |
| Memory held | O(1): one state value, one channel reference |
| Online message after `clientReady` | one channel lookup + one history fetch + one send; target ≤ 5 s (M-04) |

## 10. Logging and secrets

- Everything goes through `container.logger`: info on successful posts, warn for the feature being off, for detection being skipped, and for ignored triggers, error for unusable channels and failed sends, fatal for uncaught errors.
- Each line includes the channel ID and the trigger or reason, so an incident can be diagnosed from the logs alone (§4.V "Debuggable").
- No log line includes `process.env` values other than `STATUS_CHANNEL_ID`. `DiscordAPIError` messages carry the request path, not the token. A test stubs `DISCORD_TOKEN` with a fake value and asserts it never reaches any logger call (AC-20).

## 11. Requirement → piece → test

TDD order for Step 4: each row's test is written first and seen red. Tests go in `tests/`, mirroring `src/`; shared fakes go in `tests/helpers/`.

| AC | Piece / function | Test file |
|---|---|---|
| AC-01 | `StatusAnnouncer.announceOnline`, `statusOnline` listener | `tests/lib/status/announcer.test.ts`; listener by manual check (M-01, M-04) |
| AC-02 | `buildStatusMessage`, `copy.ts` | `tests/lib/status/message.test.ts`, `tests/lib/status/copy.test.ts` |
| AC-03 | `pickPhrase` | `tests/lib/status/pick-phrase.test.ts` (injected random for the edges, real `Math.random` over 1 000 picks for M-07) |
| AC-04 | `StatusLifecycle.tryBeginAnnounce` | `tests/lib/status/lifecycle.test.ts`, `tests/lib/status/announcer.test.ts` |
| AC-05 | `registerShutdownHooks`, `StatusAnnouncer.shutdown` | `tests/lib/status/shutdown.test.ts` (fake `EventEmitter` process), `announcer.test.ts` |
| AC-06 | same | same: fatal logged, offline attempted, exit code 1 |
| AC-07 | `buildStatusMessage`, `pickPhrase` | `message.test.ts`, `pick-phrase.test.ts` |
| AC-08 | `withDeadline`, backstop | `shutdown.test.ts`, `announcer.test.ts` with `vi.useFakeTimers()` and a never-resolving send |
| AC-09 | `StatusLifecycle.beginShutdown` | `lifecycle.test.ts`, `announcer.test.ts` |
| AC-10 | `StatusLifecycle.beginShutdown` | `lifecycle.test.ts` (shutdown from `starting` or `announcing`) |
| AC-11, AC-12, AC-13 | `classifyPreviousRun`, `buildStatusMessage` | `tests/lib/status/previous-run.test.ts`, `message.test.ts` |
| AC-14 | `checkStatusChannelPermissions`, `announceOnline` | `tests/lib/status/channel.test.ts` (real `PermissionsBitField`), `announcer.test.ts` |
| AC-15 | `envParseOptionalSnowflake`, `announceOnline` | `tests/lib/env-parser.test.ts`, `announcer.test.ts` |
| AC-16 | `envParseOptionalSnowflake` | `tests/lib/env-parser.test.ts` |
| AC-17 | `resolveStatusChannel` | `channel.test.ts` (null, 10003, 50001, voice channel, category) |
| AC-18 | `checkStatusChannelPermissions`, `describeDiscordError` | `channel.test.ts`, `announcer.test.ts` (send rejects with 50013) |
| AC-19 | `buildStatusMessage` | `message.test.ts` (`allowedMentions.parse` is empty); `copy.test.ts` (no `@everyone` or `@here` in the copy) |
| AC-20 | `StatusAnnouncer` logging | `announcer.test.ts` (fake token never appears in logger calls) |

`copy.test.ts` also pins the exact strings and checks that the copy contains no cedilla characters (ş, ţ, Ş, Ţ).

The listener isn't unit-tested. It's a one-line delegate whose behaviour is AC-01 and AC-04, both covered through `StatusAnnouncer` and `StatusLifecycle`, and exercised end to end at Step 5. Building a Sapphire `Listener` outside a loaded store would test the framework, not this code.

## 12. Documentation changes (in the implementing PR)

| Document | Change |
|---|---|
| `README.md` | Feature status row "Online / offline status messages" with the right status; Configuration row for `STATUS_CHANNEL_ID`; "status messages" added to the permission table's "Why" text for View Channels, Send Messages, Embed Links and Read Message History; a short Features entry |
| `.env.example` | `STATUS_CHANNEL_ID=` with a comment (optional; empty means off) |
| `docs/ARCHITECTURE.md` | §2 start-up (config parse and shutdown hooks before login), §3 pieces (`statusOnline` listener), §5 configuration, §6 state (channel history as the previous-run record), §7 failure modes (shutdown deadline, hard kills) |
| `docs/CONVENTIONS.md` §2 | Vocabulary: **status channel**, **status message** |
| `requirements.md` / `design.md` | Step 6: record anything that changed during implementation |

## 13. Risks and design questions

- **D1 - Overlapping deploys.** If Coolify starts the new container before stopping the old one (a rolling update), the order becomes: new instance online **with** the outage line (because the old instance's online message is the last one), then the old instance's offline message. Two instances on one token would also double-handle every gateway event, which matters more once anti-spam lands. **Recommendation:** accept, and make it part of M-01. If M-01 shows overlap, the owner switches the Coolify app to stop-then-start. No code change.
- **D2 - SIGTERM while the online message is in flight.** The lifecycle is in `announcing`, so no offline message is sent. If the online send completes before exit, the next start shows a false outage line. The window is milliseconds wide. **Recommendation:** accept.
- **D3 - Exit code for signals.** `0` for SIGTERM and SIGINT, so a planned stop doesn't read as a failure in Coolify. **Recommendation:** keep it.
- **Noted, out of scope:** the existing `src/listeners/ready.ts` has no `event` option, so it listens to the deprecated `'ready'` event (discord.js 14.27 deprecates it in favour of `'clientReady'`). This feature's listener uses `Events.ClientReady`. Moving the banner listener is a separate small fix.

## 14. Step 5 manual acceptance plan

In a test server with a separate bot application, never the live server:

| Metric | Procedure |
|---|---|
| M-01 | Restart 5 times: 3 times through Coolify (or `docker stop` + start), 2 times with Ctrl+C on `yarn dev`. Each time: one red embed, then one green embed without the ⚡ line. Watch for D1 overlap. |
| M-02 | 3 times: `kill -9 <pid>`, then start again. The green embed carries the ⚡ line. |
| M-03 | Covered by M-01's 5 restarts: no ⚡ line. |
| M-04 | Time from the bot's presence turning online to the green embed appearing: ≤ 5 s. |
| M-05 | Turn off the network, press Ctrl+C, time until the process exits: ≤ 5.5 s, with the timeout error in the log. |
| AC-14, AC-17, AC-18 | Remove Read Message History, then Embed Links, then point `STATUS_CHANNEL_ID` at a voice channel. Check the log line each time, and check that `/ping` still answers. |
| AC-15, AC-16 | Unset the variable (warn, bot runs); set it to `abc` (start-up stops with `[ENV]`). |

Screenshots (Constitution §3): this feature adds new messages, so there is no "before" frame. The PR carries cropped "after" shots of one online embed, one offline embed and one online embed with the ⚡ line, and states that no "before" frame exists.

## 15. Approval

- [x] Human approval of this document (Step 2). Approved by the owner in session, 2026-11-07, with the recommendations for D1-D3.
