# Join and leave announcements - design

| | |
|---|---|
| Status | **Approved (Step 2)** - 2026-11-07; amended in PR review 2026-11-07 (§5.3 backlog cap, §5.5 wording) |
| Triage | Feature (0 → 1 → 2 → 4 → 5 → 6) |
| Requirements | [`requirements.md`](requirements.md) (approved 2026-11-07) |
| Ticket | ENG-00 - no ticket |
| Next | Step 4, implementation (a Feature skips Step 3), only after this document is approved |

## 1. Grounding

Every API below was checked against the installed packages, not recalled (Constitution §2, §4.IV).

| Fact | Source |
|---|---|
| discord.js **14.27.0**, @sapphire/framework **5.5.1** | `yarn.lock` |
| `guildMemberAdd: [member: GuildMember]`, `guildMemberRemove: [member: GuildMember \| PartialGuildMember]`; `Events.GuildMemberAdd` / `Events.GuildMemberRemove` | `discord.js/typings/index.d.ts` (`ClientEvents`, `Events`) |
| `PartialGuildMember` = `GuildMember` with `joinedAt`, `joinedTimestamp` and `pending` possibly `null` | same file |
| `guildMemberRemove` is emitted only when `Action#getMember` returns a member: from the cache, or a partial built from the payload **only if** `Partials.GuildMember` is enabled | `src/client/actions/GuildMemberRemove.js`, `src/client/actions/Action.js` (`getPayload`) |
| The same partial switch is used by `GuildMemberUpdate` and by `GuildMemberManager#me` | `src/client/actions/GuildMemberUpdate.js`, `src/managers/GuildMemberManager.js` |
| `GuildMemberManager#fetch()` with no options requests every member over the gateway; its `time` option defaults to **120 000 ms** | `src/managers/GuildMemberManager.js` (`_fetchMany`) |
| `escapeMarkdown`, `userMention`, `channelMention` are exported by discord.js (re-exported from `@discordjs/formatters`) | `typings/index.d.ts` (`export * from '@discordjs/formatters'`) |
| `Colors.Green` = `0x57f287`, `Colors.Grey` = `0x95a5a6` | `typings/index.d.ts` |
| `GuildMember#displayName` is the nickname, else the user's display name (global name, else username) | `typings/index.d.ts`, `src/structures/GuildMember.js` |
| Embeds never trigger mentions; only message `content` can ping, and only what `allowedMentions` allows | Discord API docs, Message resource ("Allowed mentions") |

The first two partial-member facts shape the design. Without `Partials.GuildMember` a member the bot never cached leaves **silently**: no event, no error. And the bot restarts on every deploy, so "joined before the last restart" is most members, not an edge case.

## 2. Overview

```
start-up (index.ts)
 ├─ envParseOptionalSnowflake('ANNOUNCEMENTS_CHANNEL_ID')  malformed → [ENV] … (AC-16)
 ├─ envParseOptionalSnowflake('RULES_CHANNEL_ID')          malformed → [ENV] … (AC-07)
 ├─ new SapphireClient({ …, partials: [Partials.GuildMember] })            (AC-12)
 └─ container.memberAnnouncer = new MemberAnnouncer({ channelId, rulesChannelId, logger })

listeners/memberAnnouncerReady.ts  (clientReady, once)
 └─ memberAnnouncer.prepare(client)
      ├─ channelId null → warn once, stop (AC-15)
      ├─ resolve channel → error once if unusable (AC-17)
      └─ guild.members.fetch()  → join dates known for everyone (AC-11); failure → warn

listeners/memberJoinAnnouncement.ts   (guildMemberAdd)     listeners/memberLeaveAnnouncement.ts  (guildMemberRemove)
 └─ memberAnnouncer.announceJoin(member)                     └─ memberAnnouncer.announceLeave(member)
      ├─ off? bot? (AC-13)                                        ├─ off? bot? (AC-13)
      ├─ resolve channel (cache) → error + member ID (AC-17)      ├─ resolve channel (cache) → error + member ID (AC-17)
      ├─ other guild? → ignore (AC-14)                            ├─ other guild? → ignore (AC-14)
      └─ send buildJoinAnnouncement(…)                            └─ send buildLeaveAnnouncement(…)
           content <@member>, ping only them (AC-19)                   name escaped (AC-18), duration if known (AC-11, AC-12)
```

Decisions are plain functions in `src/lib/announcements/`. `MemberAnnouncer` is the only class that touches discord.js objects; its tests use `Pick<>`-typed fakes ([`TESTING.md §4`](../../TESTING.md#4-testing-discord-facing-code)).

## 3. Pieces and functions

| File | Kind | Responsibility | Requirements |
|---|---|---|---|
| `src/lib/announcements/copy.ts` | constants | Join and leave phrases, titles, rules line and duration line, word for word as in requirements §6 | AC-02, AC-03, AC-05, AC-09, AC-10, AC-11 |
| `src/lib/announcements/duration.ts` | pure functions | `formatDuration(from, to)`, `romanianCount(n, unit)` | AC-11 |
| `src/lib/announcements/member-name.ts` | pure function | `formatMemberName({ displayName, username })` | AC-18 |
| `src/lib/announcements/message.ts` | pure functions | `buildJoinAnnouncement(input)`, `buildLeaveAnnouncement(input)`: embed, content and `allowedMentions` | AC-02, AC-03, AC-05, AC-06, AC-09, AC-10, AC-11, AC-12, AC-19 |
| `src/lib/announcements/should-announce.ts` | pure function | `shouldAnnounce({ isBot, memberGuildId, channelGuildId })` | AC-13, AC-14 |
| `src/lib/announcements/announcer.ts` | Discord adapter | `MemberAnnouncer`: `prepare(client)`, `announceJoin(member)`, `announceLeave(member)`. Declares the `container.memberAnnouncer` augmentation. | AC-01, AC-08, AC-15, AC-17, AC-20 |
| `src/lib/env-parser.ts` | pure function (extended) | `envParseOptionalSnowflake` accepts `'ANNOUNCEMENTS_CHANNEL_ID'` and `'RULES_CHANNEL_ID'` | AC-06, AC-07, AC-15, AC-16 |
| `src/listeners/memberAnnouncerReady.ts` | Sapphire listener | `clientReady`, `once: true`; delegates to `prepare` | AC-11, AC-15, AC-17 |
| `src/listeners/memberJoinAnnouncement.ts` | Sapphire listener | `guildMemberAdd`; delegates to `announceJoin` | AC-01, AC-04 |
| `src/listeners/memberLeaveAnnouncement.ts` | Sapphire listener | `guildMemberRemove`; delegates to `announceLeave` | AC-08, AC-12 |
| `src/index.ts` | entry point (edited) | Parse both variables, enable `Partials.GuildMember`, create the announcer, all before `client.login()` | AC-07, AC-12, AC-16 |

Reused from the status feature, unchanged: `resolveStatusChannel` and `describeDiscordError` from `src/lib/status/channel.ts` (D2).

No command and no precondition is added. Nothing here can be triggered on purpose by a member beyond joining or leaving, so there is no authorization surface (Constitution §4.V "Gated" doesn't apply).

## 4. Contracts

TypeScript signatures that Step 4 implements. Names can be polished during implementation; behaviour can't change without looping back to this document.

```ts
// copy.ts
export const JOIN_TITLE = '👋 Avem un tovarăș nou';
export const LEAVE_TITLE = '🚪 Un tovarăș ne-a părăsit';
export const JOIN_PHRASE = 'Ultima oră la Telejurnal: {member} e membru nou. Urmează două ore despre recoltă.';
export const LEAVE_PHRASE = '{name} a sărit gardul ambasadei. Drum bun în Occident!';
export function rulesLine(rulesChannelId: string): string; // `📜 Regulile sunt în ${channelMention(id)}. Citește-le, tovarășe!`
export function durationLine(duration: string): string;    // `⏳ A stat cu noi ${duration}.`

// duration.ts
export type DurationUnit = 'year' | 'month' | 'day' | 'hour' | 'minute';
export function romanianCount(n: number, unit: DurationUnit): string;
// 1 → 'un an' | 'o lună' | 'o zi' | 'o oră' | 'un minut'
// n ≥ 20 and (n % 100 === 0 or n % 100 ≥ 20) → `${n} de ${plural}`; otherwise `${n} ${plural}`
export function formatDuration(from: Date, to: Date): string;
// < 60 s → 'mai puțin de un minut'; else largest non-zero unit, plus ' și ' + next smaller unit when non-zero

// member-name.ts
export function formatMemberName(input: { displayName: string; username: string }): string;
// `**${escapeMarkdown(displayName)}**`, plus ` (${escapeMarkdown(username)})` when the two differ

// message.ts
export interface JoinAnnouncementInput {
	memberId: string;
	avatarUrl: string;
	rulesChannelId: string | null;
	timestamp: Date;
}
export function buildJoinAnnouncement(input: JoinAnnouncementInput): {
	content: `<@${string}>`;                                  // the only ping (AC-02, AC-19)
	embeds: [EmbedBuilder];
	allowedMentions: { parse: []; users: [string] };         // exactly the new member
};
// embed: Colors.Green, JOIN_TITLE, description = JOIN_PHRASE with {member} → userMention(memberId),
// then '\n\n' + rulesLine(id) when rulesChannelId is set; thumbnail = avatarUrl; timestamp

export interface LeaveAnnouncementInput {
	name: string;            // already formatted by formatMemberName
	joinedAt: Date | null;   // null for a partial member (AC-12)
	leftAt: Date;
}
export function buildLeaveAnnouncement(input: LeaveAnnouncementInput): {
	embeds: [EmbedBuilder];
	allowedMentions: { parse: [] };                           // nobody (AC-09, AC-19)
};
// embed: Colors.Grey, LEAVE_TITLE, description = LEAVE_PHRASE with {name} → name,
// then '\n\n' + durationLine(formatDuration(joinedAt, leftAt)) when joinedAt is known; timestamp = leftAt

// should-announce.ts
export function shouldAnnounce(input: { isBot: boolean; memberGuildId: string; channelGuildId: string }): boolean;

// announcer.ts
export type AnnouncementLogger = Pick<ILogger, 'info' | 'warn' | 'error'>;
export interface MemberAnnouncerOptions {
	channelId: string | null;      // ANNOUNCEMENTS_CHANNEL_ID; null turns the feature off
	rulesChannelId: string | null; // RULES_CHANNEL_ID; null leaves the rules line out
	logger: AnnouncementLogger;
	now?: () => Date;
}
export class MemberAnnouncer {
	prepare(client: AnnouncementClient): Promise<void>;
	announceJoin(member: AnnouncedMember): Promise<void>;
	announceLeave(member: AnnouncedMember): Promise<void>;
}
// AnnouncementClient / AnnouncedMember: structural Pick<>s of Client<true> and GuildMember | PartialGuildMember -
// id, guild.id, user.{ bot, username }, displayName, joinedAt, displayAvatarURL(), client - so test fakes stay small.

// env-parser.ts
export function envParseOptionalSnowflake(key: 'STATUS_CHANNEL_ID' | 'ANNOUNCEMENTS_CHANNEL_ID' | 'RULES_CHANNEL_ID'): string | null;
// unchanged behaviour: unset or blank → null; /^\d{17,20}$/ → value; else throw `[ENV] ${key} - …`
```

## 5. Behaviour

### 5.1 Start-up (`src/index.ts`)

1. `envParseOptionalSnowflake('ANNOUNCEMENTS_CHANNEL_ID')` and `('RULES_CHANNEL_ID')` run next to the existing `STATUS_CHANNEL_ID` parse, before any handler is registered. A malformed value throws and the process exits 1 with the `[ENV]` error (AC-07, AC-16).
2. The client options gain `partials: [Partials.GuildMember]` (AC-12, D1).
3. `container.memberAnnouncer = new MemberAnnouncer({ channelId, rulesChannelId, logger: container.logger })`.

### 5.2 Ready (`MemberAnnouncer.prepare`, once per process)

1. `channelId === null` → log **warn** `[Announcements] Join and leave announcements are off: ANNOUNCEMENTS_CHANNEL_ID is not set.` and return (AC-15).
2. `resolveStatusChannel(client, channelId)`. On failure, log **error** with the channel ID and reason, and return. Per-event resolution (§5.3) still runs, so a channel fixed later starts working without a restart.
3. `channel.guild.members.fetch()` - one gateway request for the whole member list, so `joinedAt` is known for members who joined before this restart (AC-11, D1). On success, log **info** with the guild ID and member count. On failure or timeout, log **warn** (`… join dates unknown for members who joined before this start; leave announcements for them omit the duration`) and carry on.

`prepare` handles all its own errors and never rejects.

### 5.3 Join (`announceJoin`) and leave (`announceLeave`)

Same skeleton for both; each runs once per event and never rejects.

1. `channelId === null` → return silently (the warning was logged once in §5.2).
2. `member.user.bot` → return (AC-13). Checked before any Discord call.
   - *(2a)* **Backlog cap (AC-21, AC-22).** If `MAX_PENDING_ANNOUNCEMENTS` (10) announcements are already in progress, count this one as skipped and return; the first skip of a burst logs one **warn**. Otherwise increment the in-progress count synchronously, before the first `await`, and decrement it in a `finally` once the event is handled, whatever the outcome. When the count returns to 0 with skips recorded, log one **warn** with the number skipped and reset it. Off and bot events never enter the count.
3. `resolveStatusChannel(member.client, channelId)`. `channels.fetch` is answered from the cache the `Guilds` intent keeps, so this is normally no REST call, and permission changes take effect immediately. On failure, log **error** with channel ID, reason, member ID and guild ID; no retry (AC-17).
4. `shouldAnnounce({ isBot, memberGuildId: member.guild.id, channelGuildId: channel.guildId })` false → return (AC-14).
5. Build and send:
   - join: `buildJoinAnnouncement({ memberId: member.id, avatarUrl: member.displayAvatarURL(), rulesChannelId, timestamp: now() })`.
   - leave: `buildLeaveAnnouncement({ name: formatMemberName({ displayName: member.displayName, username: member.user.username }), joinedAt: member.joinedAt, leftAt: now() })`.
6. Send failure → log **error** with `describeDiscordError`, channel ID and member ID (AC-17). Success → log **info** with the member ID.

### 5.4 Mentions

- **Join:** `content` is `<@memberId>`; `allowedMentions` is `{ parse: [], users: [memberId] }`. The phrase's `{member}` in the embed also shows the member, but embeds never ping. Nothing else in the payload can ping: `parse: []` turns off `@everyone`, `@here`, roles and users, and `users` re-allows exactly one ID (AC-19).
- **Leave:** no `content`; `allowedMentions: { parse: [] }` (AC-09).
- **Names:** a display name such as `@everyone` or `<@123…>` appears only in the leave embed, which can't ping, and is markdown-escaped, so `**bold**` or `__x__` show literally (AC-18).

### 5.5 Duration (`formatDuration`)

- Calendar arithmetic in **UTC**: whole years from the join date first, then whole months counted from the date those years reach (not from the join date); a day that doesn't exist in the target month (31 January + 1 month) clamps to the month's last day. The rest is split into days, hours and minutes. Seconds are dropped.
- Under 60 seconds → `mai puțin de un minut`.
- Otherwise the largest non-zero unit, plus `și` and the next smaller unit when that one is non-zero; never a third unit, and never a zero unit (`2 luni`, not `2 luni și 0 zile`).
- `joinedAt` later than `leftAt` (clock skew) → treated as under a minute rather than negative.
- Every row of requirements §6.4 is a test case (M-08).

## 6. Intents, partials, permissions, API calls

- **Intents:** no change. `GuildMembers` (privileged, already requested) delivers both events and allows `members.fetch()`. `Guilds` caches channels for the per-event resolution.
- **Partials:** `Partials.GuildMember` is new. Side effects in the installed version: `guildMemberUpdate` may also be emitted with a partial old member, and `guild.members.me` can return a partial instead of `null`. No listener in this repository handles `guildMemberUpdate`, and nothing reads `members.me` (D4).
- **Bot permissions** in the announcements channel: View Channels, Send Messages, Embed Links - already in the README table. Pinging one member needs no permission; **Mention @everyone, @here and All Roles** is not requested. The rules channel needs no bot permission: the bot only links to it.
- **Discord API calls:** one member-list request per process start; one `POST /channels/{id}/messages` per join or leave. Channel lookups are cache hits. Discord's rate limits cap throughput, not the queue of sends waiting inside discord.js, so the bot itself caps in-progress announcements at 10 (§5.3 step 2a); during a raid the rest are skipped and counted.

## 7. State and storage

- **In memory:** the discord.js member cache for the one server, filled by `members.fetch()` at start-up and kept current by the join and leave events. Its size is the server's member count, not a function of message traffic; a raid of new joins grows it by exactly the members who joined. `MemberAnnouncer` itself holds its configuration plus two counters, in progress (≤ 10) and skipped (§4.V "Bounded").
- **Durable:** none. Join dates come from Discord on each start.
- **No ADR.** Constitution §6 open item 3 stays open and unaffected.

## 8. Failure modes

| Situation | Members and moderators see | Log | Bot keeps running | AC |
|---|---|---|---|---|
| `ANNOUNCEMENTS_CHANNEL_ID` unset | No announcements | warn, once at ready | yes | AC-15 |
| `ANNOUNCEMENTS_CHANNEL_ID` or `RULES_CHANNEL_ID` malformed | Bot never comes online | `[ENV] … - …`, exit 1 | no (by design) | AC-07, AC-16 |
| `RULES_CHANNEL_ID` unset | Join announcement without the rules line | nothing | yes | AC-06 |
| `RULES_CHANNEL_ID` well-formed but wrong | Rules line links to a channel Discord shows as unknown | nothing (D3) | yes | - |
| Channel unknown, hidden, wrong type, or missing View / Send / Embed Links | No announcement for that event | error with channel ID, reason, member ID | yes | AC-17 |
| Send refused or fails | No announcement for that event; no retry | error with the Discord error and member ID | yes | AC-17 |
| Member-list fetch fails or times out at start-up | Leave announcements for members who joined before this start have no duration line | warn | yes | AC-11, AC-12 |
| Member was never cached (left before the fetch finished) | Leave announcement, no duration line, display name without server nickname | info on send | yes | AC-12 |
| Member is a bot | Nothing | nothing | yes | AC-13 |
| Event from another server | Nothing | nothing | yes | AC-14 |
| Raid (more than 10 joins or leaves in progress at once) | Up to 10 announcements in progress; the rest are not posted | one warn when skipping starts, one with the count when the backlog drains | yes | AC-21, AC-22 |

## 9. Non-functional requirements

| Requirement | Number |
|---|---|
| Discord calls per announcement | 1 send; channel lookup from cache |
| Announcements in progress at once | ≤ 10 (`MAX_PENDING_ANNOUNCEMENTS`); excess skipped |
| Start-up cost | 1 member-list request, bounded by discord.js's 120 s default; never blocks other features |
| Memory held by this feature | O(1) beyond the discord.js member cache (§7) |
| Join or leave to announcement | target ≤ 5 s (M-04) |

## 10. Logging and secrets

- Everything goes through `container.logger` with an `[Announcements]` prefix: info on successful posts and the member fetch, warn when the feature is off or the fetch fails, error for unusable channels and failed sends.
- Each line names the channel ID, member ID and guild ID where one applies, so an incident is diagnosable from the logs alone (§4.V "Debuggable"). Member **names** are not logged; the ID is enough to look them up.
- No log line includes `process.env` values other than the two channel IDs. A test stubs `DISCORD_TOKEN` with a fake value and asserts it never reaches a logger call (AC-20).

## 11. Requirement → piece → test

TDD order for Step 4: each row's tests are written first and seen red. Tests mirror `src/`; shared fakes go in `tests/helpers/` (fake members join `fakeStatusChannel` and `fakeLogger` there).

| Order | AC | Piece / function | Test file |
|---|---|---|---|
| 1 | AC-07, AC-16, AC-06, AC-15 | `envParseOptionalSnowflake` | `tests/lib/env-parser.test.ts` |
| 2 | AC-03, AC-05, AC-10, AC-11 | `copy.ts` | `tests/lib/announcements/copy.test.ts` (exact strings, one placeholder each, no cedillas, no `@everyone` / `@here`) |
| 3 | AC-11 | `romanianCount`, `formatDuration` | `tests/lib/announcements/duration.test.ts` (all §6.4 rows, `de` boundaries 19 / 20 / 101 / 120, month clamping, skew) |
| 4 | AC-18 | `formatMemberName` | `tests/lib/announcements/member-name.test.ts` |
| 5 | AC-02, AC-05, AC-06, AC-09, AC-11, AC-12, AC-19 | `buildJoinAnnouncement`, `buildLeaveAnnouncement` | `tests/lib/announcements/message.test.ts` |
| 6 | AC-13, AC-14 | `shouldAnnounce` | `tests/lib/announcements/should-announce.test.ts` |
| 7 | AC-01, AC-04, AC-08, AC-12, AC-15, AC-17, AC-20, AC-21, AC-22 | `MemberAnnouncer` | `tests/lib/announcements/announcer.test.ts` (off, bot, other guild, unusable channel, send rejects with 50013, partial member, member fetch fails, token never logged) |
| 8 | AC-12 | `index.ts` partials | manual (M-03); a one-line option, covered end to end |

The three listeners aren't unit-tested: each is a one-line delegate, as `statusOnline` is. Their behaviour is covered through `MemberAnnouncer` and at Step 5.

## 12. Documentation changes (in the implementing PR)

| Document | Change |
|---|---|
| `README.md` | Feature status row; the Features entry (ping, rules line, every join, kicks and bans included); Configuration rows for `ANNOUNCEMENTS_CHANNEL_ID` and `RULES_CHANNEL_ID`; project structure line for `announcements/` |
| `.env.example` | Both variables with comments (optional; empty means off / no rules line) |
| `docs/ARCHITECTURE.md` | §2 start-up, §3 pieces, §4 partials, §5 configuration, §6 state (member cache), §7 failure modes, §8 moves the feature out of "planned" |
| `docs/CONVENTIONS.md` §2 | Vocabulary: **join announcement**, **leave announcement** |
| `requirements.md` / `design.md` | Step 6: record anything that changed during implementation |

## 13. Risks and design questions

Each has a recommendation; approving this document without comment takes all four.

- **D1 - Uncached members.** Enable `Partials.GuildMember` **and** fetch the member list once at ready. The partial alone makes every leave produce an event (AC-12), but without the fetch every leave by a member who joined before the last deploy would lack its duration - which, with a redeploy per merge, is nearly all of them. The fetch alone isn't enough either: a member who leaves while it is still running would still leave silently. **Recommendation: both.** The cost is one gateway request per start and a member cache the size of the server.
- **D2 - Reuse the status channel helpers.** `resolveStatusChannel` already checks exactly what this feature needs (text or announcement channel; View, Send, Embed Links). **Recommendation: import it as is**, and leave renaming it to a neutral `resolveTextChannel` in a shared module for a separate small refactor, so this PR doesn't touch tested status code.
- **D3 - Wrong `RULES_CHANNEL_ID`.** A well-formed ID for the wrong or a deleted channel renders as an unknown-channel link. Checking it would mean resolving a channel the bot otherwise never touches. **Recommendation: accept, and check the link by hand at Step 5 (M-07).** The verification feature will resolve that channel properly when it lands.
- **D4 - Side effects of the partial.** See §6: harmless today. **Recommendation: accept**, and note in ARCHITECTURE §4 that a future `guildMemberUpdate` listener must handle partial members.

## 14. Step 5 manual acceptance plan

In a test server with a separate bot application, never the live server, with a second test account:

| Metric | Procedure |
|---|---|
| M-01, M-06 | Join 5 times with the test account (leave between). Each time: one green embed, the account gets a notification. |
| M-02 | Leave once, get kicked once, get banned once (unban between). One grey embed each. |
| M-03 | Twice: join with the test account, restart the bot, wait for the member-fetch log line, then leave. Each time: one grey embed **with** the duration line. |
| M-04 | Time from join or leave to the embed: ≤ 5 s. |
| M-05 | Set the test account's server nickname to `@everyone`, then leave: nobody else is notified, the name shows literally. |
| M-07 | Click the rules line in 5 join embeds: each opens the rules channel. |
| AC-13 | Add and remove a bot: nothing posted. |
| AC-15, AC-16, AC-07 | Unset `ANNOUNCEMENTS_CHANNEL_ID` (warn, bot runs); set it to `abc`, then `RULES_CHANNEL_ID` to `abc` (start-up stops with `[ENV]` each time). |
| AC-17 | Remove Embed Links in the announcements channel, join: error in the log, `/ping` still answers. |

Screenshots (Constitution §3): this feature adds new messages, so there is no "before" frame. The PR carries cropped "after" shots of one join embed with the rules line and one leave embed with the duration line, and states that no "before" frame exists.

## 15. Implementation notes (Step 4)

Contract polish and one defect found during implementation. Behaviour matches §4-§5 except where noted.

- **Placeholder replacement uses a function.** `String.replace('{name}', name)` treats `$&`, `$'` and `` $` `` in the replacement as patterns, so a display name such as `$'` would have pasted part of the phrase into itself. Both phrases are filled with `replace(placeholder, () => value)`. Found while writing the builders; a test pins it (`showsANameWithReplacementPatternsLiterally`). Not a behaviour change: it is what AC-18 already required.
- `AnnouncedMember` and `AnnouncementClient` are the structural types §4 described: `AnnouncementClient` is `StatusChannelClient` from the status feature, and a real `GuildMember` or `PartialGuildMember` satisfies `AnnouncedMember`.
- The bot check runs twice on purpose: once before any Discord call (§5.3 step 2, so a bot join costs nothing) and again inside `shouldAnnounce`, which stays the single tested statement of who is announced.
- `envParseOptionalSnowflake` takes a named `OptionalSnowflakeKey` union instead of an inline one.
- Red and green evidence, mutation checks and smoke runs are in [`validation-trail.md`](validation-trail.md).

**Amended in PR review ([TPN-Labs/Discord-Guard#26](https://github.com/TPN-Labs/Discord-Guard/pull/26), 2026-11-07):**

- **Years before months.** The first implementation counted all whole months from the join date, so a join on 2024-02-29 and a leave on 2025-03-28 read `un an` instead of `un an și o lună`. It now counts whole years from the join date, then whole months from the date those years reach, as §5.5 now spells out. A leap-day test pins it.
- **Backlog cap.** Added §5.3 step 2a and requirements AC-21 / AC-22 after review pointed out that rate limits bound throughput, not the number of sends waiting in discord.js.

## 16. Approval

- [x] Human approval of this document (Step 2). Approved by the owner in session, 2026-11-07, with the recommendations for D1-D4.
