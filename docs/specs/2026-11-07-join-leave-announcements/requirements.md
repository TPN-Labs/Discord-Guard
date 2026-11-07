# Join and leave announcements - requirements

| | |
|---|---|
| Status | **Approved (Step 1)** - 2026-11-07; amended in PR review 2026-11-07 (AC-21, AC-22, Q4) |
| Triage | Feature (0 → 1 → 2 → 4 → 5 → 6) - classified by the owner in session, 2026-11-07 |
| Ticket | ENG-00 - no ticket |
| Date | 2026-11-07 |
| Next | [`design.md`](design.md) (Step 2) |

## 1. Problem

Nothing in the server marks a member arriving or leaving. Members don't notice a newcomer to greet, and moderators don't notice who left or how long they had been around. The README has listed join and leave announcements as a planned feature since the project started.

The bot speaks as **Ion Iliescu**, a parody of the former Romanian president, in the voice already approved for the status messages ([`2026-11-07-status-messages/requirements.md §1`](../2026-11-07-status-messages/requirements.md#1-problem)): Romania in 1980-2000, left-leaning, democratic socialist humour. The announcements use the same voice and still say plainly who arrived or left.

## 2. Scope

**In scope**

- Post a join announcement in one configured channel each time a member joins the server.
- Post a leave announcement in the same channel each time a member leaves the server, for any reason.
- Use one fixed join phrase and one fixed leave phrase (§6).
- Ping the new member in their join announcement, and point them to the server's rules channel when it is configured.
- Show, in the leave announcement, how long the member had been on the server, when the bot knows it.
- Cap how many announcements can wait to be posted, so a raid can't build an unbounded backlog (AC-21, AC-22).

**Out of scope (non-goals)**

- **"First time only."** The bot keeps no storage, so it cannot tell a first join from a rejoin. Every join is announced, including a member who left and came back. A first-time-only welcome needs persistent storage (Constitution §6, open item 3) and is a separate feature.
- Telling apart a member who left, was kicked, or was banned. Discord reports all three as the same event; telling them apart needs audit-log reads and the **View Audit Log** permission. The same leave announcement is posted for all three.
- Checking that the rules channel exists, or posting the rules. The rules message and ✅ verification are a separate planned feature, which will reuse `RULES_CHANNEL_ID`.
- Direct messages to the member, images, welcome cards, or role assignment on join.
- Catching up on joins and leaves that happened while the bot was offline.
- Changing the phrases at run time, or rotating between several. They live in code and change through a PR, as the status phrases do.
- Detecting a raid, or summarising skipped members in Discord. Skipped announcements are only counted in the log (AC-22); raid detection belongs to the anti-spam feature.

## 3. Roles

Roles as defined in [`docs/CONVENTIONS.md §2`](../../CONVENTIONS.md#2-domain-vocabulary). The **announcements channel** is already in the vocabulary; this feature gives it its configuration, `ANNOUNCEMENTS_CHANNEL_ID`. A **join announcement** and a **leave announcement** are the embeds the bot posts there.

## 4. User stories

- **US-01** - As a **member**, I want to see when someone new joins, in a message that fits the server's humour, so I can say hello.
- **US-02** - As a **moderator**, I want to see when someone leaves and how long they had been on the server, so I can notice a regular leaving or a burst of short stays.
- **US-03** - As an **owner**, I want to turn announcements on for production and leave them off for a development bot without changing code, so test runs don't post to the live server.
- **US-04** - As an **owner**, I want a broken announcements channel (deleted, no permission) to show up in the logs without taking the bot down, so a cosmetic feature can't stop verification or anti-spam.
- **US-05** - As a **moderator**, I want a member's name never to ping anyone else or break the message's formatting, so a crafted username can't turn the announcement into a mass ping.
- **US-06** - As a **new member**, I want to be pinged when I arrive and pointed to the rules channel, so I know I'm in and where to start.

## 5. Acceptance criteria

### Join announcement (US-01, US-06)

- **AC-01** - When a member joins the server, the bot posts exactly one join announcement in the announcements channel.
- **AC-02** - The join announcement's message text is a mention of the new member, so Discord notifies them (AC-19). Under it is an embed with a green colour bar, the title `👋 Avem un tovarăș nou`, the join phrase (§6.1) as its body with `{member}` replaced by a mention of the new member, the rules line when configured (AC-05), the member's avatar as a thumbnail, and a timestamp.
- **AC-03** - Every join announcement uses the same phrase, §6.1, word for word apart from `{member}`.
- **AC-04** - A member who leaves and joins again gets a new join announcement each time (see §2, "First time only").

### Rules channel line (US-06)

- **AC-05** - When `RULES_CHANNEL_ID` is set, the join embed ends with the line `📜 Regulile sunt în <#RULES_CHANNEL_ID>. Citește-le, tovarășe!`, which Discord shows as a clickable link to the rules channel.
- **AC-06** - When `RULES_CHANNEL_ID` is unset or empty, the join announcement leaves the rules line out and is otherwise unchanged.
- **AC-07** - When `RULES_CHANNEL_ID` is set to a value that is not a Discord ID (not 17-20 digits), start-up stops with an `[ENV] RULES_CHANNEL_ID - ...` error.

### Leave announcement (US-02)

- **AC-08** - When a member leaves the server - by leaving, being kicked, or being banned - the bot posts exactly one leave announcement in the announcements channel.
- **AC-09** - The leave announcement is an embed with a grey colour bar, the title `🚪 Un tovarăș ne-a părăsit`, the leave phrase (§6.2) as its body with `{name}` replaced by the member's name (AC-18), and a timestamp. It has no message text and pings nobody.
- **AC-10** - Every leave announcement uses the same phrase, §6.2, word for word apart from `{name}`.
- **AC-11** - When the bot knows when the member joined, the leave announcement also contains the line `⏳ A stat cu noi <duration>.`, with the duration written as in §6.4.
- **AC-12** - A member who joined before the bot's last restart still gets a leave announcement. If the bot doesn't know when that member joined, the announcement leaves out the duration line rather than showing a wrong or empty one.

### Who is announced

- **AC-13** - Joins and leaves of **bot accounts** are not announced (Q2).
- **AC-14** - Only joins and leaves in the server that owns the announcements channel are announced. If the bot is in another server, that server's joins and leaves are ignored.

### Bursts (US-04)

- **AC-21** - At most **10** announcements are waiting to be posted at any time. A join or leave that arrives while 10 are waiting is not announced.
- **AC-22** - When the bot starts skipping announcements, it logs one warning. When nothing is waiting any more, it logs one warning with how many joins and leaves it skipped. It never logs one line per skipped member.

### Configuration and failure modes (US-03, US-04)

- **AC-15** - When `ANNOUNCEMENTS_CHANNEL_ID` is unset or empty, the bot posts no announcements, logs one warning at start-up saying join and leave announcements are off, and otherwise starts and runs normally.
- **AC-16** - When `ANNOUNCEMENTS_CHANNEL_ID` is set to a value that is not a Discord ID (not 17-20 digits), start-up stops with an `[ENV] ANNOUNCEMENTS_CHANNEL_ID - ...` error, the same way a malformed `STATUS_CHANNEL_ID` does.
- **AC-17** - When `ANNOUNCEMENTS_CHANNEL_ID` names a channel that doesn't exist, that the bot can't see, or that can't hold text messages, or when the bot lacks **Send Messages** or **Embed Links** there, an announcement that can't be posted is not retried. The bot logs an error naming the channel ID, the reason, and the member's ID, and keeps running. Other features and commands are unaffected.

### Names and mentions (US-05, US-06)

- **AC-18** - In the leave announcement, the member's name is their server display name in bold, followed by their username in brackets when the two differ: `**Ion** (ion1930)`. Markdown characters in either are escaped, so the name shows exactly as written.
- **AC-19** - The join announcement pings exactly one person: the new member. No announcement ever pings `@everyone`, `@here`, a role, or any other member, whatever a name or phrase contains (Q1).
- **AC-20** - No log line, announcement or error produced by this feature contains the bot token or any value from `src/.env` other than `ANNOUNCEMENTS_CHANNEL_ID` and `RULES_CHANNEL_ID`.

## 6. Copy

**Chosen by the owner on 2026-11-07** from ten drafts per list. Romanian, with comma-below diacritics (ș, ț), not cedilla forms (ş, ţ). The join phrase contains `{member}` exactly once and the leave phrase contains `{name}` exactly once. Tests compare against this copy exactly.

The status-messages content note applies here too: no phrase is about the June 1990 Mineriad or the deaths of December 1989.

### 6.1 Join phrase

> Ultima oră la Telejurnal: {member} e membru nou. Urmează două ore despre recoltă.

### 6.2 Leave phrase

> {name} a sărit gardul ambasadei. Drum bun în Occident!

### 6.3 Fixed strings

| Where | Text |
|---|---|
| Join title | `👋 Avem un tovarăș nou` |
| Rules line | `📜 Regulile sunt în <#RULES_CHANNEL_ID>. Citește-le, tovarășe!` |
| Leave title | `🚪 Un tovarăș ne-a părăsit` |
| Leave duration line | `⏳ A stat cu noi <duration>.` |

### 6.4 Duration wording

The duration is the time from the member's join to their leave, written in Romanian with the largest non-zero unit, plus the next smaller unit when it is non-zero. Units, largest first: years (`an` / `ani`), months (`lună` / `luni`), days (`zi` / `zile`), hours (`oră` / `ore`), minutes (`minut` / `minute`). A count of one is written as a word (`un an`, `o lună`, `o zi`, `o oră`, `un minut`). Counts of 20 and above take `de`, as Romanian grammar requires, unless the last two digits are 01-19 (`20 de zile`, `101 zile`, `120 de zile`).

| Time on the server | Line |
|---|---|
| 40 seconds | `⏳ A stat cu noi mai puțin de un minut.` |
| 1 minute 30 seconds | `⏳ A stat cu noi un minut.` |
| 25 minutes | `⏳ A stat cu noi 25 de minute.` |
| 1 hour 5 minutes | `⏳ A stat cu noi o oră și 5 minute.` |
| 3 days 4 hours | `⏳ A stat cu noi 3 zile și 4 ore.` |
| 2 months 0 days 6 hours | `⏳ A stat cu noi 2 luni.` |
| 1 year 2 months | `⏳ A stat cu noi un an și 2 luni.` |
| 21 years 1 month | `⏳ A stat cu noi 21 de ani și o lună.` |

How months and years are counted (calendar months or fixed 30-day blocks) is a Step 2 design decision; the examples above hold either way.

## 7. Success metrics

Measured in a test server with a separate bot application during Step 5 acceptance, and in the Vitest suite where noted.

| ID | Metric | Target |
|---|---|---|
| M-01 | Test accounts joining that produce exactly one join announcement | 5 of 5 |
| M-02 | Leaves, kicks and bans of test accounts that produce exactly one leave announcement | 3 of 3 each |
| M-03 | Leaves of a member who joined before the bot's last restart that produce a leave announcement | 2 of 2 |
| M-04 | Time from the join or leave to the announcement appearing | ≤ 5 s |
| M-05 | People other than the new member notified by an announcement, with a test member whose display name is `@everyone` | 0 |
| M-06 | New members notified by their own join announcement | 5 of 5 |
| M-07 | Join announcements whose rules line opens the rules channel when clicked | 5 of 5 |
| M-08 | Duration examples in §6.4 rendered exactly (Vitest) | 8 of 8 |
| M-09 | Announcements waiting to be posted at once while 200 joins arrive together (Vitest) | ≤ 10 |

## 8. Permissions and configuration impact

- **New environment variables:** `ANNOUNCEMENTS_CHANNEL_ID` and `RULES_CHANNEL_ID`, both optional. Both go into `.env.example` and the README Configuration table in the implementing PR. `RULES_CHANNEL_ID` names the server's existing rules channel; the planned rules-and-verification feature reuses it rather than adding its own.
- **Bot permissions in the announcements channel:** View Channels, Send Messages, Embed Links. All three are already in the README's permission table; their "Why" text already names announcements. Pinging one member needs no extra permission; **Mention @everyone, @here and All Roles** is not needed and is not requested.
- **Intents:** no new intent. `GuildMembers` (privileged, already requested and already listed in the README's Discord setup) carries both events.
- **Uncached members (AC-12).** In the installed discord.js 14.27.0, `guildMemberRemove` is only emitted for a member the bot has in its cache, unless the client enables the `GuildMember` partial (`src/client/actions/GuildMemberRemove.js` → `Action#getMember`). Today the client enables no partials, so a member who joined before the last restart would leave silently. How the bot closes that gap is a Step 2 design decision.

## 9. Resolved questions

Answered by the owner in session, 2026-11-07.

- **Q1 - Ping the new member?** *Resolved: yes, ping.* The join announcement's message text mentions the new member and `allowedMentions` is limited to their ID (AC-02, AC-19). The draft recommended no ping. **Note for the verification feature:** once new members can see only the rules channel, Discord is not expected to notify a member about a mention in a channel they can't view, so the ping may stop reaching them then. Unverified here; check it at that feature's Step 5.
- **Q2 - Announce bots?** *Resolved: skip bots* (AC-13).
- **Q3 - Rules channel line.** *Resolved: add it.* The server already has a rules channel. The join announcement points to it through `RULES_CHANNEL_ID` (AC-05 to AC-07). The line's wording in §6.3 was approved with this document.
- **Q4 - Raids.** *Revised in PR review, 2026-11-07: cap the backlog (AC-21, AC-22).* The first answer accepted one announcement per join during a raid. Review on [TPN-Labs/Discord-Guard#26](https://github.com/TPN-Labs/Discord-Guard/pull/26) pointed out that Discord's rate limits cap throughput, not the queue of sends waiting in discord.js, so a raid would still grow that queue without bound, against [`CONVENTIONS.md §5`](../../CONVENTIONS.md#5-production-readiness-checklist) ("no unbounded queue of Discord calls during a spam wave or raid"). At most 10 announcements now wait at once; the rest are skipped and counted in the log. Detecting the raid itself stays with the anti-spam feature.

## 10. Approval

- [x] Human approval of this document (Step 1). Approved by the owner in session, 2026-11-07, including the rules line in §6.3.
