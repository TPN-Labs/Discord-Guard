# Anti-spam with automatic kick - design

| | |
|---|---|
| Status | **Approved (Step 2)** - 2026-11-08, with the recommendations for D1-D8 |
| Triage | Feature (0 → 1 → 2 → 4 → 5 → 6) |
| Requirements | [`requirements.md`](requirements.md) (approved 2026-11-08) |
| Ticket | ENG-00 - no ticket |
| Next | Step 4, implementation (a Feature skips Step 3), only after this document is approved |

## 1. Grounding

Every API below was checked against the installed packages, not recalled (Constitution §4.IV).

| Fact | Source |
|---|---|
| discord.js **14.27.0**, @sapphire/framework **5.5.1**, tldts **7.4.19** | `yarn.lock` |
| `messageCreate: [message: OmitPartialGroupDMChannel<Message>]`; `Events.MessageCreate` | `discord.js/typings/index.d.ts` (`ClientEvents`) |
| `GatewayIntentBits.MessageContent = 32768` (privileged) | `discord-api-types/gateway/v10.d.ts` |
| A guild `MESSAGE_CREATE` carries a partial `member`; discord.js adds or patches it in the member cache, so `message.member` is set for a member's message and `null` for a webhook's | `discord.js/src/structures/Message.js` (`_patch`, lines 339-342); `Message#webhookId` |
| `GuildMember#permissions` is computed from the cached roles (all permissions for the server owner); no REST call | `discord.js/src/structures/GuildMember.js` (`get permissions`) |
| `PermissionsBitField#has` counts Administrator as every permission unless told not to | `discord.js/typings/index.d.ts` (`BitField#has`, `checkAdmin` default) |
| `GuildMember#kick(reason?)`; `GuildMember#kickable` needs a cached `guild.members.me` and throws `GuildUncachedMe` otherwise | `typings/index.d.ts`, `src/structures/GuildMember.js` |
| `TextBasedChannel#bulkDelete(ids)`: 0 IDs → no call; **1 ID → a single `DELETE /messages/{id}`**; 2+ → one `POST /bulk-delete` | `src/structures/interfaces/TextBasedChannel.js` |
| Bulk delete takes 2-100 IDs younger than 14 days; IDs that don't exist still count and don't fail the call. A single delete of a gone message fails with `UnknownMessage` (10008) | Discord API docs (Bulk Delete Messages); `discord-api-types/rest/common.d.ts` |
| `MessageMentions.EveryonePattern = /@(?<mention>everyone\|here)/`, plus `UsersPattern` and `RolesPattern` | `src/structures/MessageMentions.js` |
| `escapeMarkdown`, `channelMention`, `Colors.Red` are exported by discord.js | `typings/index.d.ts` |
| `tldts.parse(url)` gives `domainWithoutSuffix` from the ICANN public-suffix list and `isIp`; checked against every AC-24 example (`free-nitro.ru` → `free-nitro`, `login.steam-gift.com` → `steam-gift`, `shop.example.co.uk` → `example`, `discord.gg/AbC123` → `discord`, `192.168.0.1` → `isIp`, `localhost` → `null`) | `node_modules/tldts`, run in session |
| tldts is already installed, as a dependency of `@sapphire/plugin-api` | `yarn.lock` (`@sapphire/plugin-api@npm:^8.3.1` → `tldts: "npm:^7.0.9"`) |

## 2. Overview

```
start-up (index.ts)
 ├─ intents += GatewayIntentBits.MessageContent                                 (AC-34)
 └─ container.spamGuard = new SpamGuard({ ownerIds: envParseArray('OWNERS'),
                                          logChannelId: announcementsChannelId, logger })

listeners/antiSpamMessage.ts  (messageCreate)
 └─ spamGuard.handleMessage(message)
      ├─ not in a server / system message / bot itself / webhook → ignore        (AC-07, AC-10)
      ├─ owner or Manage Messages → ignore, not tracked                         (AC-08, AC-09)
      ├─ tracker.record(key, toTracked(message))     bounded, expires           (AC-25, AC-26)
      ├─ evaluateRules(tracker.recent(key), now) → fired rules                  (AC-01…AC-05)
      └─ fired → queue.submit(key, () => enforce(…))  once per member; ≤5 run, ≤50 wait  (AC-06, AC-27)

enforce (in order)
 ├─ 1. DM: member.send(dmText) raced against 3 s; failure → warn                 (AC-12)
 ├─ 2. member.kick('Anti-spam: …'); failure → error, carry on                    (AC-13, AC-31)
 ├─ 3. tracker.take(key) → group by channel → channel.bulkDelete(ids)            (AC-14, AC-32, AC-35)
 └─ 4. kick log → announcements channel, or the bot's log                        (AC-15, AC-18…AC-24, AC-30, AC-33)
```

Decisions are plain functions in `src/lib/antispam/`. `SpamGuard` is the only class that touches discord.js objects; its tests use `Pick<>`-typed fakes ([`TESTING.md §4`](../../TESTING.md#4-testing-discord-facing-code)).

## 3. Pieces and functions

| File | Kind | Responsibility | Requirements |
|---|---|---|---|
| `src/lib/antispam/copy.ts` | constants | DM text, kick-log strings, rule names, word for word as in requirements §6 | AC-12, AC-13, AC-18, AC-20, AC-21, AC-22 |
| `src/lib/antispam/rules.ts` | constants + pure function | Thresholds and windows; `evaluateRules(messages, now)` | AC-01 to AC-05 |
| `src/lib/antispam/links.ts` | pure functions | `findLinks(text)`, `countsForLinkSpread(link)`, `censorLinks(text)` | AC-05, AC-24 |
| `src/lib/antispam/message-facts.ts` | pure functions | `normalizeForRepeat(text)`, `countMentions(text)`, `toTrackedMessage(input)` | AC-03, AC-04, AC-25 |
| `src/lib/antispam/exemption.ts` | pure function | `isChecked(input)`: who is checked | AC-07 to AC-11 |
| `src/lib/antispam/tracker.ts` | plain class | `MessageTracker`: per-member history with per-member cap, member cap, expiry | AC-25, AC-26, AC-28 |
| `src/lib/antispam/queue.ts` | plain class | `EnforcementQueue`: one entry per member, ≤ 5 running, ≤ 50 waiting, skip counting | AC-06, AC-27 |
| `src/lib/antispam/kick-log.ts` | pure functions | `buildKickLog(input)` (embed payload), `formatKickLogText(input)` (log line), `excerpt(text)` | AC-18 to AC-24, AC-30, AC-33 |
| `src/lib/antispam/guard.ts` | Discord adapter | `SpamGuard`: `handleMessage(message)`, enforcement, the sweep timer. Declares the `container.spamGuard` augmentation | AC-12 to AC-17, AC-29 to AC-33, AC-35, AC-36 |
| `src/listeners/antiSpamMessage.ts` | Sapphire listener | `messageCreate`; delegates to `handleMessage` | AC-07 |
| `src/index.ts` | entry point (edited) | Add the Message Content intent; create `SpamGuard` before `client.login()` | AC-29, AC-34 |
| `package.json` | edited | `tldts` becomes a direct dependency (D1) | AC-24 |

Reused unchanged: `resolveStatusChannel` and `describeDiscordError` from `src/lib/status/channel.ts` for the kick-log channel (D6); `formatMemberName` from `src/lib/announcements/member-name.ts` for AC-19; `envParseArray('OWNERS')` from `src/lib/env-parser.ts`.

No command and no precondition is added. `/limits` stays the stub it is (requirements §2). The surface a member can trigger is "post a message", and the gate on it is the exemption check, which has removal tests (§11, [`TESTING.md §7`](../../TESTING.md#7-failure-path-floor)).

## 4. Contracts

TypeScript signatures that Step 4 implements. Names can be polished during implementation; behaviour can't change without looping back to this document.

```ts
// rules.ts
export type RuleId = 'crossChannel' | 'flood' | 'repeat' | 'mentionBurst' | 'linkSpread';
export const RULES: Record<RuleId, { windowMs: number; threshold: number }> = {
	crossChannel: { windowMs: 60_000, threshold: 3 }, // distinct channels (AC-01)
	flood:        { windowMs: 10_000, threshold: 8 }, // messages (AC-02)
	repeat:       { windowMs: 60_000, threshold: 4 }, // same normalized text (AC-03)
	mentionBurst: { windowMs: 30_000, threshold: 6 }, // mention points (AC-04)
	linkSpread:   { windowMs: 60_000, threshold: 2 }  // distinct channels with a counted link (AC-05)
};
export const TRACKING_WINDOW_MS = 600_000;        // 10 min (AC-14, AC-25)
export function evaluateRules(messages: readonly TrackedMessage[], now: number): RuleId[];
// messages: one member's tracked messages, oldest first, the new one last. Returns rules in RuleId order.

// message-facts.ts
export interface TrackedMessage {
	id: string;
	channelId: string;            // a thread's own ID, so a thread is its own channel (AC-01)
	createdAt: number;            // message.createdTimestamp
	repeatKey: string | null;     // sha1 of normalizeForRepeat(content); null when there is no text (AC-03)
	mentionPoints: number;        // countMentions(content) (AC-04)
	hasCountedLink: boolean;      // some findLinks(content) passes countsForLinkSpread (AC-05)
	excerpt: string;              // excerpt(content): censored, cut to 200 chars, not yet escaped (AC-21, AC-24)
}
export function normalizeForRepeat(text: string): string | null; // trim + toLocaleLowerCase('ro'); '' → null
export function countMentions(text: string): number;
// distinct <@id>/<@!id> + distinct <@&id> from UsersPattern/RolesPattern, + 3 if EveryonePattern matches (D5)
export function toTrackedMessage(input: { id: string; channelId: string; createdAt: number; content: string }): TrackedMessage;

// links.ts
export interface FoundLink { start: number; end: number; url: string; label: string | null } // label: masked-link text
export function findLinks(text: string): FoundLink[];
// http(s) URLs (any case), the URL inside [label](url) and <url>, and scheme-less discord.gg/… and
// discord(app).com/invite/… ; a URL ends at whitespace, '<', '>', or an unbalanced ')'.
export function countsForLinkSpread(link: FoundLink): boolean;
// false for hosts tenor.com, giphy.com and their subdomains, and for (ptb.|canary.)discord(app).com/channels/…
export function censorDomain(url: string): string;      // tldts domainWithoutSuffix; IP or null → '(link)'
export function censorLinks(text: string): string;
// each link → censorDomain(url); a masked link → `${label} (${censorDomain(url)})` (AC-24)

// exemption.ts
export interface CheckInput {
	inGuild: boolean;
	isSystem: boolean;            // join notices, pins, boosts…
	authorId: string;
	botUserId: string;
	isWebhook: boolean;           // message.webhookId !== null
	ownerIds: readonly string[];
	hasManageMessages: boolean;   // member.permissions.has(ManageMessages), Administrator included
}
export function isChecked(input: CheckInput): boolean;

// tracker.ts
export const MAX_MESSAGES_PER_MEMBER = 50;  // AC-25
export const MAX_TRACKED_MEMBERS = 5_000;   // AC-26
export class MessageTracker {
	constructor(options?: { now?: () => number });
	record(key: string, message: TrackedMessage): readonly TrackedMessage[]; // returns the member's live history
	take(key: string): TrackedMessage[];     // removes and returns the member's unexpired messages
	sweep(): void;                           // drops expired messages and empty members
	get size(): number;                      // tracked members
}
// key = `${guildId}:${userId}`. A Map in least-recently-active order: record() deletes and re-inserts the key,
// and evicts the first key when size would exceed MAX_TRACKED_MEMBERS.

// queue.ts
export const MAX_RUNNING_ENFORCEMENTS = 5;  // AC-27
export const MAX_WAITING_ENFORCEMENTS = 50; // AC-27
export type SubmitResult = 'started' | 'queued' | 'duplicate' | 'skipped';
export class EnforcementQueue {
	constructor(options: { logger: Pick<ILogger, 'warn'> });
	submit(key: string, task: () => Promise<void>): SubmitResult;
	has(key: string): boolean;               // waiting or running
}
// A task never rejects into the queue: a rejection is caught and logged at error by the queue (never swallowed).

// kick-log.ts
export interface KickLogInput {
	member: { displayName: string; username: string; id: string };
	rules: readonly RuleId[];
	channelIds: readonly string[];           // distinct, in first-seen order
	messages: readonly { channelId: string; excerpt: string }[]; // all deleted-or-attempted, oldest first
	kick: { ok: true } | { ok: false; reason: string };
	deleted: number;
	tracked: number;
	timestamp: Date;
}
export function excerpt(content: string): string;  // censorLinks, then cut to 200 chars + '…'
export function buildKickLog(input: KickLogInput): { embeds: [EmbedBuilder]; allowedMentions: { parse: [] } };
export function formatKickLogText(input: KickLogInput): string; // same facts, one line per item, for the bot's log
// Display escaping, applied when building, not when storing: escapeMarkdown, then '\' before '<@', '<@&', '<#'
// and a zero-width space after '@' in '@everyone'/'@here' (AC-23).

// guard.ts
export type SpamGuardLogger = Pick<ILogger, 'info' | 'warn' | 'error'>;
export interface SpamGuardOptions {
	ownerIds: readonly string[];
	logChannelId: string | null;   // ANNOUNCEMENTS_CHANNEL_ID (AC-29, AC-30)
	logger: SpamGuardLogger;
	now?: () => number;
	dmTimeoutMs?: number;          // default 3_000 (AC-12)
}
export class SpamGuard {
	handleMessage(message: GuardedMessage): Promise<void>; // never rejects
	start(): void;                 // starts the 60 s sweep timer, unref'd (D7)
	stop(): void;
}
// GuardedMessage: a structural Pick<> of Message - id, channelId, guildId, createdTimestamp, content, system,
// webhookId, author.{ id, bot, username }, member (permissions, displayName, kick, send) | null,
// guild.{ id, name } | null, client.{ user, channels.fetch } - so test fakes stay small.
```

## 5. Behaviour

### 5.1 Start-up (`src/index.ts`)

1. `GatewayIntentBits.MessageContent` is added to the intents (AC-34). Without the portal toggle, Discord refuses the login with "disallowed intents" and the existing fatal path exits 1; the README's Discord setup already tells owners to turn it on.
2. `container.spamGuard = new SpamGuard({ ownerIds: envParseArray('OWNERS'), logChannelId: announcementsChannelId, logger: container.logger })`, then `container.spamGuard.start()`. `OWNERS` is already required (`OwnerOnly` reads it at module load), so this adds no new failure.
3. No new variable (AC-29). When `announcementsChannelId` is null, the guard logs one **info** at construction: `[AntiSpam] Kick logs go to the bot's log: ANNOUNCEMENTS_CHANNEL_ID is not set.`

### 5.2 Each message (`handleMessage`)

Runs synchronously up to the queue submit, so two messages can't both pass the duplicate check (AC-06).

1. `isChecked(...)` false → return. Order of checks, cheapest first: not in a server (`guildId === null`, AC-07), `system`, author is the bot, `webhookId` (AC-10), author in `ownerIds` (AC-09), `member === null` (can't kick, can't read permissions; logged at **warn** once per process as unexpected), `member.permissions.has(ManageMessages)` (AC-08). Exempt members are never recorded, so their messages are never in memory.
2. `history = tracker.record(key, toTrackedMessage(...))`. The content is reduced to the `TrackedMessage` facts here; the raw text is not kept (§7).
3. If `queue.has(key)` → return. The message is already recorded, so it will be deleted by the enforcement in progress (AC-06, §5.3 step 3).
4. If the member is in the **failed-kick cooldown** (D3) → `fired` rules still evaluate; when any fire, delete this member's tracked messages (§5.3 step 3 only) without DM, kick or kick log, and return.
5. `fired = evaluateRules(history, now)`. Empty → return.
6. `queue.submit(key, () => this.enforce(snapshot))` where the snapshot holds the member, guild, fired rules, and timestamp. `'skipped'` → the queue has already logged (AC-27); nothing else happens and the member's history is kept, so a later message can fire again once there is room.

### 5.3 Enforcement (`enforce`, queued, ≤ 5 at once)

1. **DM (AC-12).** `member.send({ content: dmText(guild.name, rules), allowedMentions: { parse: [] } })` raced against a `dmTimeoutMs` timer. Timeout or rejection → **warn** `[AntiSpam] Could not DM member … : <reason>`. The send is not cancelled on timeout (discord.js has no abort for it); it is bounded by discord.js's own 15 s REST timeout (`@discordjs/rest` default `timeout: 15e3`) and ignored when it settles.
2. **Kick (AC-13, AC-31).** `member.kick(`Anti-spam: ${ruleNames.join(', ')}`)`. Rejection → **error** with guild, member and `describeDiscordError`; the outcome becomes `{ ok: false, reason }` and the member enters the failed-kick cooldown (D3). No retry. `kickable` is not used as a pre-check: it throws when `guild.members.me` is uncached (§1), and Discord's answer is the authority anyway.
3. **Delete (AC-14, AC-32, AC-35).** `messages = tracker.take(key)`, taken **after** the kick so messages posted while the DM and kick were in flight are included. Group by `channelId`. Per channel: `client.channels.fetch(channelId)` (cache hit), then `channel.bulkDelete(ids)` with `filterOld` off (every ID is under 10 minutes old, under 50 per member, so always one call per channel). Outcomes per channel:
   - success → count `ids.length` as deleted;
   - `UnknownMessage` (10008) on a one-ID channel → counted as deleted: it is gone, which is the goal (AC-14);
   - any other failure, or the channel can't be resolved or isn't text-based → **error** once for that channel with guild, channel and member; its IDs count as not deleted (AC-32).
   Channels are deleted one after another, not in parallel, so one enforcement never has more than one delete in flight.
4. **Kick log (AC-15, AC-30, AC-33).** Build `KickLogInput` from the snapshot, the kick outcome and the delete counts.
   - `logChannelId === null` → **info** `formatKickLogText(...)` (AC-30).
   - Else `resolveStatusChannel(client, logChannelId)`; unusable, or `channel.guildId !== guild.id` (Q-D) → **warn** (or **error** when unusable) plus `formatKickLogText(...)`.
   - Else `channel.send(buildKickLog(...))`; rejection → **error** with channel, member and `describeDiscordError`, plus `formatKickLogText(...)`. No retry (AC-33).
5. **Done.** Log **info** `[AntiSpam] Enforced against member … in guild …: rules …, kicked|kick failed, deleted n/m.`

`enforce` catches its own errors per step; nothing it does can stop the next step or another member's enforcement.

### 5.4 Rules (`evaluateRules`)

All five run on every checked message, against the member's history filtered to each rule's window (`createdAt > now - windowMs`), the new message included.

- **crossChannel:** count distinct `channelId` → fires at ≥ 3.
- **flood:** count messages → fires at ≥ 8.
- **repeat:** group by `repeatKey` (ignoring `null`), take the largest group → fires at ≥ 4.
- **mentionBurst:** sum `mentionPoints` → fires at ≥ 6.
- **linkSpread:** count distinct `channelId` among messages with `hasCountedLink` → fires at ≥ 2.

"Fires on the message that reaches the threshold" (AC-01 to AC-05) follows from evaluating on every message: the first message where the count reaches the threshold is the one that fires. Because the firing member then enters the queue, later messages don't re-fire (§5.2 step 3).

`now` is the new message's `createdTimestamp`, so the windows use Discord's clock, not the bot's, and a slow event loop can't stretch a window.

### 5.5 Links and censoring (`links.ts`)

- **Finding** is one left-to-right scan with a single regular expression with alternatives, in this order: masked link `[label](url)`, angle-bracketed `<url>`, bare `http(s)://…`, scheme-less invite `discord.gg/…` / `discord(app).com/invite/…`. Matches don't overlap. A trailing `.`, `,`, `!`, `?`, `:` or `;` is not part of a bare URL, so `see https://x.ro.` censors to `see x.` (how Discord's client linkifies edge cases is not documented; Step 5 checks the common ones by eye).
- **Censoring** replaces each match, right to left so earlier offsets stay valid, with `censorDomain(url)`, or `label (censorDomain(url))` for a masked link. The label itself is censored too, in case it is a URL. The result contains no `://`, no `.` + suffix from the host, no path and no invite code (M-06 asserts this over every test input).
- **Link spread:** `countsForLinkSpread` compares the URL's lower-cased host (via `tldts.parse(url).hostname`) against the exceptions (Q-A). An invite always counts.

### 5.6 Mentions and escaping in the kick log (AC-23)

- The embed has no `content`; `allowedMentions: { parse: [] }`. Embeds never ping; `parse: []` is the second lock.
- Excerpts: `escapeMarkdown`, then neutralize mentions so they show as text, not as Discord's blue mention pills: `<@`, `<@!`, `<@&`, `<#` get a backslash in front (Discord shows `\<@123…>` literally), and `@everyone` / `@here` get a zero-width space after the `@`. Display names go through `formatMemberName` (escaped, as for leave announcements), then the same neutralizer.
- Order: censor → cut to 200 → escape → neutralize, so the cut never splits an escape sequence (§4 `excerpt`).
- Channel links in the rules and messages lines are real `channelMention(id)` - they never ping and should be clickable for moderators.

### 5.7 Embed layout (AC-18 to AC-22)

```
🛡️ Agitator scos din server                                    (title, Colors.Red)
**Ion** (ion1930) · 123456789012345678
📋 Reguli încălcate: mesaje în 3 canale într-un minut, linkuri în 2 canale într-un minut
📍 Canale: #general, #memes, #off-topic

#general  Claim free nitro (free-nitro)
#memes    Claim free nitro (free-nitro)
#off-topic  Claim free nitro (free-nitro)

👢 Dat afară.
🧹 Mesaje șterse: 3 din 3.                                       (timestamp)
```

All in the description. Worst case: 10 × (~25-char channel link + 200-char excerpt, roughly doubled by escaping) + headers ≈ 4,000, near the 4,096-character description limit. `buildKickLog` therefore cuts each excerpt's **escaped** form to fit `floor((4096 - header) / shown)` characters as a final guard; a test feeds ten 200-character excerpts made only of markdown characters.

## 6. Intents, permissions, API calls

- **Intents:** add `MessageContent` (privileged). `GuildMessages` (already requested) delivers `messageCreate` in channels and threads; `Guilds` caches channels, threads and roles, so channel lookups and `member.permissions` cost no REST call.
- **Bot permissions:** Kick Members; Manage Messages and View Channels in every channel members can post in; View Channels, Send Messages and Embed Links in the announcements channel. All already in the README table. The bot's role must be above members it should kick (README step 6 gets a sentence).
- **Discord API calls per enforcement:** 1 DM (+1 to open the DM channel, done by discord.js), 1 kick, 1 delete call per channel involved (≤ 50 in theory, usually 2-5), 1 kick-log send. With ≤ 5 enforcements running and one delete in flight per enforcement, at most ~15 requests are in flight from anti-spam at once. discord.js queues per route and retries rate limits (AC-35).
- **Per message with no enforcement:** none. Recording and evaluating are in memory.

## 7. State and storage

- **`MessageTracker`:** up to 5,000 members × 50 `TrackedMessage`s, each holding two snowflakes, a timestamp, a 40-character hash, two small numbers/booleans and an excerpt of at most ~200 characters (~0.5 KB). Theoretical ceiling ≈ 250,000 × 0.5 KB ≈ **125 MB** (D4). A realistic busy hour on this server is a few hundred members and a few thousand messages: well under 5 MB. Raw message content is never stored (§5.2 step 2).
- **Expiry:** each `record()` drops that member's messages older than 10 minutes. The sweep timer (every 60 s, `unref()`'d so it never keeps the process alive) drops expired messages and empty members everywhere (D7). `take()` filters expired messages again, so a message older than 10 minutes is never deleted.
- **`EnforcementQueue`:** ≤ 55 entries (5 running + 50 waiting) and a skip counter.
- **Failed-kick cooldown (D3):** a `Map<key, expiresAt>` of up to 1,000 members for 10 minutes; oldest dropped first.
- **Durable:** none. A restart forgets every history, the queue and the cooldown. No ADR; Constitution §6 open item 3 stays open.

## 8. Failure modes

| Situation | Members and moderators see | Log | Bot keeps running | AC |
|---|---|---|---|---|
| Message Content intent not enabled in the portal | Bot never comes online | fatal "disallowed intents", exit 1 | no (by design, existing path) | AC-34 |
| `ANNOUNCEMENTS_CHANNEL_ID` unset | No kick logs; kicks and deletes still happen | info once at start; info per enforcement with the kick-log facts | yes | AC-30 |
| DMs closed, blocked or slow (> 3 s) | Member gets no DM; kick goes ahead | warn | yes | AC-12 |
| Member's role at or above the bot's, server owner, no Kick Members, or member already gone | Member stays (unless gone); messages still deleted; kick log shows `⚠️ Nu l-am putut da afară: …` | error with Discord reason | yes | AC-31 |
| Member keeps spamming after a failed kick | Their new messages are deleted when a rule fires again; no repeat DM or kick log for 10 min | info per delete-only pass | yes | D3 |
| No Manage Messages in a channel; channel gone | That channel's messages stay; count shows the shortfall | error per channel | yes | AC-32 |
| Message already deleted by someone else | Nothing; counted as deleted | nothing | yes | AC-14 |
| Kick-log channel unusable or send fails | No kick log | error + the kick-log facts in the bot's log | yes | AC-33 |
| Kick-log channel in another server | No kick log in that server | warn + the kick-log facts | yes | Q-D |
| Raid: > 55 members firing at once | First 5 enforced, 50 wait, the rest not enforced (their history stays; a later message can fire again) | one warn when skipping starts, one with the count when the queue empties | yes | AC-27 |
| `message.member` is `null` for a non-webhook guild message | Message ignored | warn once per process | yes | design-only |
| Rate limited | Slower enforcement | discord.js handles it | yes | AC-35 |

## 9. Non-functional requirements

| Requirement | Number |
|---|---|
| Work per message without enforcement | O(messages in the member's history) ≤ 50; no Discord call |
| Firing message → kicked and deleted | target ≤ 5 s in a quiet server (AC-16); worst case 3 s DM wait + kick + deletes |
| Enforcements at once / waiting | ≤ 5 / ≤ 50 |
| Memory ceiling | ≈ 125 MB theoretical, < 5 MB realistic (§7) |
| Sweep | every 60 s, O(tracked members) |

## 10. Logging and secrets

- Prefix `[AntiSpam]`, through `container.logger`. info: enforcement done, delete-only pass, kick log not configured (once); warn: DM failed, queue skipping and drained, kick log in another server, null member (once); error: kick failed, delete failed per channel, kick-log channel unusable or send failed.
- Each line names guild, member and (where one applies) channel IDs. Member **names** and message excerpts appear only in the kick-log text fallback (AC-30, AC-33), which is the moderators' evidence; that text is censored and escaped exactly like the embed.
- No log line includes `process.env` values other than `ANNOUNCEMENTS_CHANNEL_ID`. A test stubs `DISCORD_TOKEN` with a fake value and asserts it never reaches a logger call, the DM or the kick log (AC-36).

## 11. Requirement → piece → test

TDD order for Step 4: each row's tests are written first and seen red. Tests mirror `src/`; shared fakes (message, member, channel) go in `tests/helpers/`, next to the existing ones. Every test with a window uses explicit timestamps or `vi.useFakeTimers()`, never a real wait.

| Order | AC | Piece / function | Test file |
|---|---|---|---|
| 1 | AC-12, AC-13, AC-18, AC-20 to AC-22 | `copy.ts` | `tests/lib/antispam/copy.test.ts` (exact strings, comma-below diacritics, no `@everyone`/`@here`) |
| 2 | AC-05, AC-24, M-06 | `findLinks`, `countsForLinkSpread`, `censorDomain`, `censorLinks` | `tests/lib/antispam/links.test.ts` (every AC-24 example, masked and `<url>` links, trailing punctuation, uppercase scheme, IP, `localhost`, tenor/giphy/message-link exceptions, a URL as a masked label; property: no output contains `://` or an input host) |
| 3 | AC-03, AC-04 | `normalizeForRepeat`, `countMentions`, `toTrackedMessage` | `tests/lib/antispam/message-facts.test.ts` (case/whitespace, empty text, duplicate mentions count once, `@everyone` and `@here` = 3, plain text `@everyone` without permission still counts) |
| 4 | AC-01 to AC-05 | `evaluateRules` | `tests/lib/antispam/rules.test.ts` (each rule at threshold - 1 and threshold; window edges at exactly `windowMs`; thread as its own channel; 3 channels over 2 minutes doesn't fire - M-03) |
| 5 | AC-07 to AC-11 | `isChecked` | `tests/lib/antispam/exemption.test.ts` (each exemption alone; **removal tests**: a Manage Messages member and an owner are not checked, an ordinary member and another bot are) |
| 6 | AC-25, AC-26, AC-28, M-07 | `MessageTracker` | `tests/lib/antispam/tracker.test.ts` (51st message drops the oldest, 10-minute expiry, 5,001st member evicts the least recently active, `take` empties and filters expired, 100,000 messages from 10,000 members stays ≤ 5,000 × 50) |
| 7 | AC-06, AC-27, M-08 | `EnforcementQueue` | `tests/lib/antispam/queue.test.ts` (duplicate key, 5 running, 50 waiting, 56th skipped, one warn per burst plus one drained warn, rejection logged at error) |
| 8 | AC-18 to AC-24, M-09 | `excerpt`, `buildKickLog`, `formatKickLogText` | `tests/lib/antispam/kick-log.test.ts` (layout, > 10 messages, 200-char cut with `…`, `(fără text)`, kick failed line, `@everyone` text and `@here` name don't ping or render as mentions, description ≤ 4,096 in the worst case) |
| 9 | AC-12 to AC-17, AC-29 to AC-33, AC-35, AC-36 | `SpamGuard` | `tests/lib/antispam/guard.test.ts` (end to end with fakes: fires and runs DM → kick → delete → log in order; DM rejects and DM hangs past 3 s; kick rejects with 50013; bulk delete per channel, one-ID 10008, 50013 in one channel; messages posted during enforcement deleted; announcements off; kick-log channel in another guild; send rejects; failed-kick cooldown; token never logged) |
| 10 | AC-34 | `index.ts` intent | manual (Step 5); a one-line option |

The listener isn't unit-tested: it is a one-line delegate, as `statusOnline` is.

## 12. Documentation changes (in the implementing PR)

| Document | Change |
|---|---|
| `README.md` | Anti-spam Features text (five rules and thresholds, kick log in the announcements channel with censored links, last 10 minutes deleted, DM); Feature status row; Discord setup step 6 (role above members to kick); Configuration note that `ANNOUNCEMENTS_CHANNEL_ID` also carries kick logs; project structure line for `antispam/` |
| `.env.example` | Comment on `ANNOUNCEMENTS_CHANNEL_ID`: also receives anti-spam kick logs |
| `docs/ARCHITECTURE.md` | §2 start-up, §3 pieces, §4 Message Content intent now requested, §6 state (tracker bounds), §7 failure-mode rows, §8 moves anti-spam out of "planned" (`/limits` stays) |
| `docs/CONVENTIONS.md` §2 | Vocabulary: **Moderator** = Manage Messages; **Moderation log channel** = the announcements channel for now; new **kick log**, **rule** |
| `CONSTITUTION.md` §6 | Open item 2 (`/limits` stub) reworded: anti-spam has landed with code-constant thresholds; the stub remains until the storage feature |
| `requirements.md` / `design.md` | Step 6: record anything that changed during implementation |

## 13. Risks and design questions

Each has a recommendation; approving this document without comment takes all of them.

- **D1 - `tldts` as a direct dependency.** Splitting a host into name and suffix correctly (`example.co.uk`, `x.com.ro`) needs the public-suffix list; a hand-written list of TLDs would get multi-part suffixes wrong, which AC-24 names. tldts 7.4.19 is already in `yarn.lock` and `node_modules` through `@sapphire/plugin-api`, so adding `"tldts": "^7.4.19"` to `dependencies` downloads nothing new and meets the 5-day cooldown. Relying on it transitively would break silently if the unused API plugin is ever removed. **Recommendation: add it as a direct dependency.**
- **D2 - ICANN suffixes only.** tldts can also treat private suffixes (`github.io`, `blogspot.com`) as suffixes, which would show `free-nitro.github.io` as `free-nitro` instead of `github`. That name is the spammer's own subdomain, so it would contradict AC-24 ("without … subdomains") and would reveal more of the link. **Recommendation: ICANN only (tldts default).**
- **D3 - Failed-kick cooldown.** When a kick fails (role order), the member stays and keeps posting; without a cooldown every new firing message would send another DM and kick log, flooding the announcements channel. **Recommendation: for 10 minutes after a failed kick, a firing rule only deletes that member's tracked messages** (no DM, kick or kick log; an info line each time). Capped at 1,000 members. Not in the requirements; it narrows AC-12/AC-15 for this one case, so approving this design records it as a requirements note in Step 6.
- **D4 - Memory ceiling.** The approved caps (5,000 members × 50 messages) allow ~125 MB in theory. Reaching it needs 250,000 messages from 5,000 distinct members within 10 minutes without anyone firing the flood rule. **Recommendation: keep the approved caps**, store only the reduced facts (no raw text), and measure real usage at Step 5. Lowering to 2,000 members would cap it near 50 MB if the Coolify container is small.
- **D5 - Mentions counted from text.** Discord's `message.mentions.users` includes the replied-to author on a reply that pings, so six quick replies would count as six mentions. Counting `<@id>`, `<@&id>` and `@everyone`/`@here` in the text matches what the member typed and AC-04's "tries". **Recommendation: count from text.**
- **D6 - Reuse the status channel helpers for the kick log.** As the announcements feature did (its D2): `resolveStatusChannel` checks exactly text/announcement type plus View, Send, Embed Links. **Recommendation: import as is**; renaming it to a shared `resolveTextChannel` stays a separate refactor.
- **D7 - Sweep timer.** Lazy expiry alone would leave idle members' messages in memory until evicted. **Recommendation: a 60 s `setInterval`, `unref()`'d**, started after the guard is created and stopped in tests.
- **D8 - Size.** Nine small modules in `src/lib/antispam/`, one listener, two edited files. Each module is one decision with its own test file, which fits the Feature flow's one-task-at-a-time Step 4. **Recommendation: keep the Feature classification**; no Step 3.

## 14. Step 5 manual acceptance plan

In a test server with a separate bot application, never the live server, with three test accounts (one plain, one with a role above the bot's, one with Manage Messages) and three text channels plus one thread:

| Metric | Procedure |
|---|---|
| M-01, M-05, M-10 | Plain account posts once in each of 3 channels within 60 s, 3 times (rejoin between). Each time: DM received, kicked, 3 messages gone, one kick log, one leave announcement, ≤ 5 s. |
| M-02 | For each of flood (8 in 10 s), repeat (same text 4× in one channel), mentions (6 pings), link spread (a link in 2 channels): kicked, twice each. |
| M-03 | Post in 2 channels within 60 s; post in 3 channels over 2 minutes; send a GIF from the picker in 2 channels: not kicked. |
| M-04 | Manage Messages account and an `OWNERS` account break every rule: never kicked. |
| M-06, M-09 | Spam `@everyone free nitro https://free-nitro.ru/claim` with display name `@here`: kick log shows `free-nitro`, no clickable link, nobody notified. |
| AC-31, D3 | Account with a role above the bot's spams 3 channels: messages deleted, kick log shows the failed line; keeps spamming: messages deleted, no second kick log within 10 min. |
| AC-32 | Remove Manage Messages from the bot in one channel, spam: that channel's message stays, error logged, count shows the shortfall. |
| AC-30 | Unset `ANNOUNCEMENTS_CHANNEL_ID`, spam: kicked, kick-log facts in the bot's log. |
| AC-34 | Turn the Message Content intent off in the portal: the bot refuses to start with the disallowed-intents error. |
| D4 | Note the process memory (Coolify metrics) before and after the M-01/M-02 runs. |

Screenshots (Constitution §3): this feature adds new messages, so there is no "before" frame. The PR carries cropped "after" shots of one kick log (successful kick with censored link) and one DM, and says no "before" frame exists.

## 15. Implementation notes (Step 4)

Contract polish found while building. Behaviour matches §4-§5 except where noted.

- **`excerpt` lives in `message-facts.ts`**, not `kick-log.ts`: `toTrackedMessage` needs it, and the kick log only displays what the tracker already stored.
- **`handleMessage` returns `void`**, not a promise: everything up to the queue is synchronous by design (§5.2), and enforcement runs inside the queue. It catches its own errors and logs them, so the listener can't receive a throw.
- **The failed-kick delete-only pass (D3) also goes through `EnforcementQueue`**, so it is bounded and de-duplicated like a full enforcement.
- **Two layers stop a second enforcement:** `handleMessage` returns early when the member is in the queue, and `EnforcementQueue.submit` answers `'duplicate'`. Mutation M11 in the validation trail shows each alone is enough and removing both is caught.
- `FoundLink` gained `isInvite`; `kick-log.ts` exports `forDisplay` (escape and neutralize) for its own test; `SpamGuardLogger` includes `debug` for the sweep line, which reports tracked members and messages, the number D4 asks to measure at Step 5 (`MessageTracker.messageCount` feeds it).
- **Link spread usually fires first.** A spammer who posts the same link in three channels is kicked on the **second** message, under link spread alone, because AC-05 needs only two channels and AC-06 reports the rules of the message that started enforcement. The third message, if it arrives during enforcement, is still deleted. Two guard tests first expected both rules; their fixture was changed to plain text so they test the cross-channel rule, and a separate test pins the link-spread order (validation trail, unit 9).
- Red and green evidence, mutation checks and the smoke run are in [`validation-trail.md`](validation-trail.md).

## 16. Approval

- [x] Human approval of this document (Step 2), including D1-D8. Approved by the owner in session, 2026-11-08.
