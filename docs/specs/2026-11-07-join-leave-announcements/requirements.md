# Join and leave announcements - requirements

| | |
|---|---|
| Status | **Draft (Step 1)** - awaiting owner approval |
| Triage | Feature (0 → 1 → 2 → 4 → 5 → 6) - classified by the owner in session, 2026-11-07 |
| Ticket | ENG-00 - no ticket |
| Date | 2026-11-07 |
| Next | `design.md` (Step 2), only after this document is approved |

## 1. Problem

Nothing in the server marks a member arriving or leaving. Members don't notice a newcomer to greet, and moderators don't notice who left or how long they had been around. The README has listed join and leave announcements as a planned feature since the project started.

The bot speaks as **Ion Iliescu**, a parody of the former Romanian president, in the voice already approved for the status messages ([`2026-11-07-status-messages/requirements.md §1`](../2026-11-07-status-messages/requirements.md#1-problem)): Romania in 1980-2000, left-leaning, democratic socialist humour. The announcements use the same voice and still say plainly who arrived or left.

## 2. Scope

**In scope**

- Post a join announcement in one configured channel each time a member joins the server.
- Post a leave announcement in the same channel each time a member leaves the server, for any reason.
- Pick each announcement's phrase at random from a fixed list of ten join phrases and ten leave phrases (§6).
- Show, in the leave announcement, how long the member had been on the server, when the bot knows it.

**Out of scope (non-goals)**

- **"First time only."** The bot keeps no storage, so it cannot tell a first join from a rejoin. Every join is announced, including a member who left and came back. A first-time-only welcome needs persistent storage (Constitution §6, open item 3) and is a separate feature.
- Telling apart a member who left, was kicked, or was banned. Discord reports all three as the same event; telling them apart needs audit-log reads and the **View Audit Log** permission. The same leave announcement is posted for all three.
- Pointing the newcomer to the rules channel. The rules channel and its ID don't exist yet; the verification feature adds that line when it lands (Q3).
- Direct messages to the member, images, welcome cards, or role assignment on join.
- Catching up on joins and leaves that happened while the bot was offline.
- Changing the phrases at run time. They live in code and change through a PR, as the status phrases do.
- Rate-limiting announcements during a raid (Q4).

## 3. Roles

Roles as defined in [`docs/CONVENTIONS.md §2`](../../CONVENTIONS.md#2-domain-vocabulary). The **announcements channel** is already in the vocabulary; this feature gives it its configuration, `ANNOUNCEMENTS_CHANNEL_ID`. A **join announcement** and a **leave announcement** are the embeds the bot posts there.

## 4. User stories

- **US-01** - As a **member**, I want to see when someone new joins, in a message that fits the server's humour, so I can say hello.
- **US-02** - As a **moderator**, I want to see when someone leaves and how long they had been on the server, so I can notice a regular leaving or a burst of short stays.
- **US-03** - As an **owner**, I want to turn announcements on for production and leave them off for a development bot without changing code, so test runs don't post to the live server.
- **US-04** - As an **owner**, I want a broken announcements channel (deleted, no permission) to show up in the logs without taking the bot down, so a cosmetic feature can't stop verification or anti-spam.
- **US-05** - As a **moderator**, I want a member's name never to ping anyone or break the message's formatting, so a crafted username can't turn the announcement into a mass ping.

## 5. Acceptance criteria

### Join announcement (US-01)

- **AC-01** - When a member joins the server, the bot posts exactly one join announcement in the announcements channel.
- **AC-02** - The join announcement is an embed with a green colour bar, the title `👋 Avem un tovarăș nou`, one phrase from the join list (§6.1) as its body with `{member}` replaced by a mention of the new member, the member's avatar as a thumbnail, and a timestamp.
- **AC-03** - The join phrase is chosen at random from the join list, and every phrase on the list can be chosen.
- **AC-04** - A member who leaves and joins again gets a new join announcement each time (see §2, "First time only").

### Leave announcement (US-02)

- **AC-05** - When a member leaves the server - by leaving, being kicked, or being banned - the bot posts exactly one leave announcement in the announcements channel.
- **AC-06** - The leave announcement is an embed with a grey colour bar, the title `🚪 Un tovarăș ne-a părăsit`, one phrase from the leave list (§6.2) as its body with `{name}` replaced by the member's name (AC-15), and a timestamp.
- **AC-07** - The leave phrase is chosen at random from the leave list, and every phrase on the list can be chosen.
- **AC-08** - When the bot knows when the member joined, the leave announcement also contains the line `⏳ A stat cu noi <duration>.`, with the duration written as in §6.4.
- **AC-09** - A member who joined before the bot's last restart still gets a leave announcement. If the bot doesn't know when that member joined, the announcement leaves out the duration line rather than showing a wrong or empty one.

### Who is announced

- **AC-10** - Joins and leaves of **bot accounts** are not announced (Q2).
- **AC-11** - Only joins and leaves in the server that owns the announcements channel are announced. If the bot is in another server, that server's joins and leaves are ignored.

### Configuration and failure modes (US-03, US-04)

- **AC-12** - When `ANNOUNCEMENTS_CHANNEL_ID` is unset or empty, the bot posts no announcements, logs one warning at start-up saying join and leave announcements are off, and otherwise starts and runs normally.
- **AC-13** - When `ANNOUNCEMENTS_CHANNEL_ID` is set to a value that is not a Discord ID (not 17-20 digits), start-up stops with an `[ENV] ANNOUNCEMENTS_CHANNEL_ID - ...` error, the same way a malformed `STATUS_CHANNEL_ID` does.
- **AC-14** - When `ANNOUNCEMENTS_CHANNEL_ID` names a channel that doesn't exist, that the bot can't see, or that can't hold text messages, or when the bot lacks **Send Messages** or **Embed Links** there, an announcement that can't be posted is not retried. The bot logs an error naming the channel ID, the reason, and the member's ID, and keeps running. Other features and commands are unaffected.

### Names and mentions (US-05)

- **AC-15** - In the leave announcement, the member's name is their server display name in bold, followed by their username in brackets when the two differ: `**Ion** (ion1930)`. Markdown characters in either are escaped, so the name shows exactly as written.
- **AC-16** - Announcements ping nobody. The join mention shows the new member's name but sends them no notification, and no announcement ever pings `@everyone`, `@here`, a role or a member, whatever a name or phrase contains (Q1).
- **AC-17** - No log line, announcement or error produced by this feature contains the bot token or any value from `src/.env` other than `ANNOUNCEMENTS_CHANNEL_ID`.

## 6. Draft copy

**Drafted 2026-11-07 for owner review - not yet approved.** Romanian, with comma-below diacritics (ș, ț), not cedilla forms (ş, ţ). Each join phrase contains `{member}` exactly once and each leave phrase contains `{name}` exactly once. Once approved, tests compare against this copy exactly.

The status-messages content note applies here too: no phrase is about the June 1990 Mineriad or the deaths of December 1989.

### 6.1 Join phrases

1. Măi {member}, bine ai venit! Ia loc, nu e coadă. Încă.
2. {member} s-a emanat pe server. Revoluția continuă!
3. Fraților, avem un membru nou: {member}! Noi nu ne vindem serverul!
4. Bine ai venit, {member}! Ți-am făcut cartelă: o pâine pe zi și emoji-uri la discreție.
5. {member} a intrat pe server ca un loz în plic: nu știm ce iese, dar sperăm.
6. Ultima oră la Telejurnal: {member} e membru nou. Urmează două ore despre recoltă.
7. Salut, {member}! Te-am trecut în FSN... adică în lista de membri. Scuze, reflex.
8. {member} a venit cu Dacia 1300 și a parcat pe server. Bine ai venit, tovarășe!
9. Bine ai venit, {member}! Aici e mai cald decât într-un bloc din '87.
10. {member}, ai ajuns la noi! Ia o gumă Turbo și citește regulile.

### 6.2 Leave phrases

1. {name} a plecat. Măi animalule, unde fugi?
2. {name} a sărit gardul ambasadei. Drum bun în Occident!
3. {name} a ieșit din partid. Adică de pe server. Tot aia.
4. {name} s-a privatizat și a plecat. Bine măcar că n-a luat și mobila.
5. {name} n-a mai rezistat la coadă și a plecat acasă.
6. {name} a plecat cu ultimul tren CFR. Ajunge mâine, dacă nu se strică locomotiva.
7. {name} a schimbat canalul pe Dallas. Nu-l condamnăm.
8. Pa, {name}! Lasă cheia la administratorul blocului.
9. {name} a dispărut ca apa caldă după ora 22.
10. {name} a plecat la căpșuni în Spania. Trimite-ne o vedere!

### 6.3 Fixed strings

| Where | Text |
|---|---|
| Join title | `👋 Avem un tovarăș nou` |
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
| M-05 | Notifications received by anyone (including the new member) from an announcement, using a member named `@everyone` | 0 |
| M-06 | Phrases never chosen across 1,000 picks per list with a real random source (Vitest) | 0 of 20 |
| M-07 | Duration examples in §6.4 rendered exactly (Vitest) | 8 of 8 |

## 8. Permissions and configuration impact

- **New environment variable:** `ANNOUNCEMENTS_CHANNEL_ID` (optional). Goes into `.env.example` and the README Configuration table in the implementing PR.
- **Bot permissions in the announcements channel:** View Channels, Send Messages, Embed Links. All three are already in the README's permission table; their "Why" text already names announcements.
- **Intents:** no new intent. `GuildMembers` (privileged, already requested and already listed in the README's Discord setup) carries both events.
- **Uncached members (AC-09).** In the installed discord.js 14.27.0, `guildMemberRemove` is only emitted for a member the bot has in its cache, unless the client enables the `GuildMember` partial (`src/client/actions/GuildMemberRemove.js` → `Action#getMember`). Today the client enables no partials, so a member who joined before the last restart would leave silently. How the bot closes that gap is a Step 2 design decision.

## 9. Open questions

Each has a recommendation; approving this document without comment takes all four.

- **Q1 - Ping the new member?** AC-16 says no: the join mention renders the member's name but sends no notification, matching the status messages, which ping nobody. Pinging only the new member is possible (`allowedMentions` limited to their ID) and some servers do it. Once rules verification lands, a new member sees only the rules channel and won't see the announcements channel anyway, so a ping would point them at a message they can't open. **Recommendation: no ping.**
- **Q2 - Announce bots?** AC-10 skips bot accounts. Bots are added by owners, who already know. **Recommendation: skip bots.** The alternative is to announce them with the same phrases, which read oddly for a bot.
- **Q3 - Rules channel line.** The README's roadmap says the welcome "points them to the rules channel". There is no rules channel yet, and per Q1 the newcomer won't see the announcement once verification lands. **Recommendation: leave it out (§2) and update the README's feature description to match.** Join phrase 10 already says `citește regulile` in voice.
- **Q4 - Raids.** A raid of 200 joins posts 200 announcements; discord.js queues them under Discord's rate limits, so they arrive late but the bot holds no growing state of its own. **Recommendation: accept for now**, as status-messages Q2 did for crash loops. The anti-spam feature is the place to detect raids and could pause announcements then.

## 10. Approval

- [ ] Human approval of this document (Step 1), including the copy in §6 and answers to Q1-Q4.
