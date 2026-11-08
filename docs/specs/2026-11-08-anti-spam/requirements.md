# Anti-spam with automatic kick - requirements

| | |
|---|---|
| Status | **Approved (Step 1)** - 2026-11-08, with the §11 defaults and the §6 copy |
| Triage | Feature (0 → 1 → 2 → 4 → 5 → 6) - classified by the owner in session, 2026-11-08 |
| Ticket | ENG-00 - no ticket |
| Date | 2026-11-08 |
| Next | [`design.md`](design.md) (Step 2) |

## 1. Problem

Spam reaches the server faster than moderators can react. The common pattern is one account - often a new one, sometimes a hijacked regular - posting the same scam or invite link into several channels within seconds. By the time a moderator notices, members have seen it and some have clicked it.

The README has promised anti-spam with an automatic kick since the project started, with four checks (message flood, repeated message, mention burst, links across channels). Nothing is built: there is no `messageCreate` listener, the Message Content intent is not requested, and `/limits` is a stub (Constitution §6, open item 2).

The owner's headline rule: **a member who posts in 3 different channels within one minute is kicked, and their messages are deleted.**

## 2. Scope

**In scope**

- Watch every message members post in the server's channels and threads.
- Five rules (§5, AC-01 to AC-07), each with fixed thresholds in code:
  1. **Cross-channel** - messages in 3 or more different channels within 60 seconds (the owner's headline rule).
  2. **Flood** - 8 or more messages within 10 seconds.
  3. **Repeat** - the same text 4 or more times within 60 seconds.
  4. **Mention burst** - 6 or more mentions within 30 seconds.
  5. **Link spread** - a link posted in 2 or more different channels within 60 seconds.
- When any rule fires: DM the member, kick them, delete the messages the bot has seen from them in the last 10 minutes, and post a kick log in the announcements channel.
- Censor links in the kick log down to the bare domain name, so the log never re-posts a working spam link (AC-24).
- Exempt moderators (members with **Manage Messages**) and owners.
- Bound everything that grows with traffic: per-member history, number of tracked members, enforcement work during a raid.

**Out of scope (non-goals)**

- **Changing thresholds at run time.** Thresholds are code constants and change through a PR. `/limits` and the persistent storage it needs (Constitution §6, open item 3) are a separate feature. `/limits` stays the registered stub it is today; that known deviation is not made worse or fixed here.
- **Deleting messages older than 10 minutes**, or messages posted before the bot's last restart. A kick cannot purge history in Discord (only a ban can), and the bot keeps no storage. See Q5 in §10.
- **Timeouts, bans, softbans, warnings or strikes.** The only action is a kick.
- **Per-channel or per-role thresholds**, stricter thresholds for new members, or an exempt-role list.
- **Edited messages.** Only new messages are checked; an edit is ignored.
- **A separate moderation log channel.** The kick log goes to the announcements channel (Q9). A private log channel is a later change.
- **Appeals**, or undoing a kick from Discord.
- **Raid detection across many accounts.** Each member is judged on their own messages only.
- **Scanning message content beyond links** (bad words, scam phrases, image recognition).

## 3. Roles

Roles as defined in [`docs/CONVENTIONS.md §2`](../../CONVENTIONS.md#2-domain-vocabulary), with two changes this feature makes to the vocabulary (§8):

- **Moderator** - a member with the **Manage Messages** permission in the server (Administrator includes it). Today's vocabulary says "a member with a configured moderator role"; no such role is configured anywhere, and the owner chose the permission instead (Q6).
- **Moderation log channel** - for now, the **announcements channel**. A **kick log** is the embed the bot posts there when it kicks a member for spam.

New terms: a **rule** is one of the five checks in §2; a rule **fires** when a member's recent messages meet its threshold; **enforcement** is everything the bot does after a rule fires (DM, kick, delete, kick log). A **tracked message** is one the bot remembers from a member's last 10 minutes.

## 4. User stories

- **US-01** - As a **member**, I want spam removed and the spammer gone within seconds, without waiting for a moderator, so I don't see or click scam links.
- **US-02** - As a **moderator**, I want to see who was kicked, which rule fired and what they posted, so I can tell a real spammer from a false positive and invite a real member back.
- **US-03** - As a **moderator**, I want the kick log never to repost a working spam link or ping anyone, so the log doesn't spread the spam it reports.
- **US-04** - As a **moderator** or **owner**, I want never to be kicked by the bot, so moderating in several channels at once is safe.
- **US-05** - As a **kicked member**, I want to be told why I was kicked and that I can come back, so a hijacked or over-excited account isn't left guessing.
- **US-06** - As an **owner**, I want a spam wave or raid not to exhaust the bot's memory or flood Discord with requests, so anti-spam can't take the bot down.
- **US-07** - As an **owner**, I want a refused kick or delete (role order, missing permission) to show up in the log and the kick log without stopping anti-spam for anyone else.

## 5. Acceptance criteria

All windows are **sliding**: when a message arrives, the bot looks back over the window ending at that message. The message that arrives counts. Every threshold below is a code constant.

### Rules (US-01)

- **AC-01 - Cross-channel.** When a member's messages in the last **60 s** span **3 or more different channels**, the rule fires on the message that reaches 3. A thread counts as its own channel, separate from its parent. Several messages in the same channel count as one channel.
- **AC-02 - Flood.** When a member has posted **8 or more** messages in the last **10 s**, in any channels, the rule fires on the 8th.
- **AC-03 - Repeat.** When a member has posted the **same text 4 or more times** in the last **60 s**, in any channels, the rule fires on the 4th. Text is compared after trimming leading and trailing whitespace and ignoring letter case. A message with no text (only attachments, stickers or embeds) never counts towards this rule.
- **AC-04 - Mention burst.** When the mentions in a member's messages from the last **30 s** add up to **6 or more**, the rule fires on the message that reaches 6. Each distinct member and each distinct role mentioned in a message counts as 1; a message that tries `@everyone` or `@here` adds 3, whether or not the member is allowed to use it.
- **AC-05 - Link spread.** When a member has posted messages containing a link in **2 or more different channels** in the last **60 s**, the rule fires on the message that reaches 2. A link is an `http://` or `https://` URL, including one inside a masked link (`[text](url)`), or a Discord invite (`discord.gg/...`, `discord.com/invite/...`), with or without a scheme. Links to `tenor.com` or `giphy.com` (and their subdomains) and Discord message links (`discord.com/channels/...`) don't count towards this rule (Q-A); they are still censored in the kick log.
- **AC-06 - One enforcement per member.** When a message makes several rules fire, or the member keeps posting while enforcement is in progress, the member is enforced against once. The kick log names every rule that fired on the message that started enforcement.
- **AC-07 - Only new messages.** Edited messages and messages from before the bot started are never checked. Direct messages to the bot are ignored.

### Who is checked (US-04)

- **AC-08** - Members with the **Manage Messages** permission in the server (including through Administrator) are never checked, and their messages are not tracked.
- **AC-09** - Users whose ID is in `OWNERS` are never checked, and their messages are not tracked.
- **AC-10** - The bot's own messages and webhook messages are never checked. Other bots' accounts are checked like any member.
- **AC-11** - Everyone else is checked the same way, however long they have been on the server (Q12).

### Enforcement (US-01, US-05)

When a rule fires, the bot does these steps in this order:

- **AC-12 - DM first.** The bot sends the member a direct message with the DM text (§6.1). The kick does not wait more than **3 s** for the DM. If the DM fails or times out (DMs closed, blocked), the bot logs a warning and carries on.
- **AC-13 - Kick.** The bot kicks the member. The audit-log reason is `Anti-spam: ` followed by the rule names (§6.3) of the rules that fired.
- **AC-14 - Delete.** The bot deletes every tracked message from the member: what it has seen from them in the last **10 minutes**, in every channel. It deletes them whether or not the kick worked. A message already deleted by someone else is skipped without an error.
- **AC-15 - Kick log.** The bot posts one kick log in the announcements channel (§5, "Kick log").
- **AC-16 - Time.** In a quiet server, the member is kicked and their tracked messages deleted within **5 s** of the message that fired the rule.
- **AC-17 - Leave announcement unchanged.** The kick also produces the usual grey leave announcement, as for any kick ([`2026-11-07-join-leave-announcements` AC-08](../2026-11-07-join-leave-announcements/requirements.md#5-acceptance-criteria)). Anti-spam does not suppress or change it.

### Kick log (US-02, US-03)

- **AC-18** - The kick log is an embed with a red colour bar, the kick-log title (§6.2), and a timestamp. It has no message text.
- **AC-19** - It names the member as their server display name in bold, then their username in brackets when the two differ, then their user ID: `**Ion** (ion1930) · 123456789012345678`. Markdown in names is escaped, the same way as in leave announcements.
- **AC-20** - It names every rule that fired (§6.3) and the channels involved, as channel links (`<#id>`).
- **AC-21** - It lists the deleted messages, oldest first: channel link, then the message text after censoring (AC-24). At most **10** messages are shown, each cut to **200** characters with `…`; a final line says how many more were deleted when there were more than 10. A message with no text shows `(fără text)`.
- **AC-22** - It ends with the outcome: `kicked` or the kick-failed line (§6.2) with Discord's reason, and how many messages were deleted out of how many tracked.
- **AC-23** - The kick log pings nobody. Message text in it can't ping or format: mentions show as plain text, and markdown is escaped, whatever the spammer wrote.
- **AC-24 - Link censoring.** Every link (as defined in AC-05) in the message text is replaced by its **domain name without the top-level domain or subdomains**, and is not clickable:
  - `https://free-nitro.ru/claim?x=1` → `free-nitro`
  - `https://www.steam-gift.com/login` → `steam-gift`
  - `http://login.steam-gift.com` → `steam-gift`
  - `[Claim here](https://free-nitro.ro/x)` → `Claim here (free-nitro)`
  - `discord.gg/AbC123` → `discord`
  - A link whose host is an IP address → `(link)`
  
  Multi-part suffixes such as `.co.uk` and `.com.ro` are dropped whole (`shop.example.co.uk` → `example`). The kick log never contains a working URL, a full host name, an invite code, or a URL path. Text that is not a link is shown unchanged, apart from AC-23 escaping.

### Bounds (US-06)

- **AC-25** - The bot tracks at most **50** messages per member; when a 51st arrives, the oldest is forgotten. A tracked message is forgotten **10 minutes** after it was posted.
- **AC-26** - The bot tracks at most **5,000** members at once. When a new member would go over, the member whose latest message is oldest is forgotten.
- **AC-27** - At most **5** enforcements run at the same time, and at most **50** more wait. A member whose rule fires while 50 are waiting is not enforced against. The bot logs one warning when it starts skipping and one warning with the count when the queue empties, never one line per member (the same pattern as announcements AC-22).
- **AC-28** - Memory used by anti-spam stays bounded under a sustained flood: tested with 100,000 messages from 10,000 different members (Vitest, M-07).

### Configuration and failure modes (US-07)

- **AC-29 - No new variables.** Anti-spam needs no new environment variable and is always on. The kick log uses `ANNOUNCEMENTS_CHANNEL_ID`.
- **AC-30 - Announcements off.** When `ANNOUNCEMENTS_CHANNEL_ID` is unset or empty, anti-spam still checks, DMs, kicks and deletes. Each enforcement is logged in the bot's log instead of a kick log, with the same facts as the kick log (censored the same way).
- **AC-31 - Kick refused.** When the kick fails (the member's highest role is at or above the bot's, the bot lacks **Kick Members**, or the member already left), the bot does not retry. It still deletes the tracked messages, logs an error with the guild, member and reason, and the kick log shows the kick-failed line (§6.2).
- **AC-32 - Delete refused.** When a delete fails because the bot lacks **Manage Messages** in a channel, the bot logs one error per channel with the guild, channel and member, skips that channel's messages, and carries on with the others. The kick log's deleted count shows the shortfall.
- **AC-33 - Kick log refused.** When the kick log can't be posted (channel gone, wrong type, missing **Send Messages** or **Embed Links**), the bot logs an error with the channel and member and the same facts as AC-30, and does not retry.
- **AC-34 - Message Content intent.** The bot requests the privileged **Message Content** intent. Without it Discord sends empty text, and the repeat, link-spread and kick-log text would silently stop working; the README's Discord setup already tells owners to enable it in the portal.
- **AC-35 - Rate limits.** Deletes and kicks go through discord.js's own rate-limit handling. Messages in one channel are deleted with as few requests as Discord allows.
- **AC-36 - Secrets.** No log line, DM, kick log or error from this feature contains the bot token or any value from `src/.env` other than `ANNOUNCEMENTS_CHANNEL_ID`.

## 6. Copy

**Approved by the owner on 2026-11-08 (Q-C in §11).** Romanian, in the Ion Iliescu voice of the status messages and announcements, with comma-below diacritics (ș, ț). The status-messages content note applies: nothing about June 1990 or December 1989, which also rules out "golani". Once approved, tests compare against this copy exactly.

### 6.1 DM to the kicked member

> Tovarășe, ai fost scos din **{server}** pentru spam ({rules}). Poți reveni oricând cu o invitație, dar lasă propaganda acasă.

`{server}` is the server name, escaped. `{rules}` is the rule names (§6.3), joined with `, `.

### 6.2 Kick log strings

| Where | Text |
|---|---|
| Title | `🛡️ Agitator scos din server` |
| Rules line | `📋 Reguli încălcate: {rules}` |
| Channels line | `📍 Canale: {channels}` |
| Outcome, kicked | `👢 Dat afară.` |
| Outcome, kick failed | `⚠️ Nu l-am putut da afară: {reason}` |
| Deleted count | `🧹 Mesaje șterse: {deleted} din {tracked}.` |
| More messages | `… și încă {n} mesaje.` |
| No text | `(fără text)` |

### 6.3 Rule names

| Rule | Name |
|---|---|
| Cross-channel | `mesaje în 3 canale într-un minut` |
| Flood | `8 mesaje în 10 secunde` |
| Repeat | `același mesaj de 4 ori într-un minut` |
| Mention burst | `6 mențiuni în 30 de secunde` |
| Link spread | `linkuri în 2 canale într-un minut` |

## 7. Success metrics

Measured in a test server with a separate bot application during Step 5 acceptance, and in the Vitest suite where noted.

| ID | Metric | Target |
|---|---|---|
| M-01 | Test accounts kicked after posting in 3 channels within 60 s | 3 of 3 |
| M-02 | Test accounts kicked for each of flood, repeat, mention burst and link spread | 2 of 2 each |
| M-03 | Test accounts **not** kicked after posting in 2 channels within 60 s, or 3 channels over 2 minutes | 0 kicked |
| M-04 | Moderator and owner test accounts kicked after breaking every rule | 0 |
| M-05 | Time from the firing message to kick and deletion done (quiet server) | ≤ 5 s |
| M-06 | Working URLs, full host names or invite codes in kick logs, across all M-01/M-02 runs and the AC-24 examples (Vitest) | 0 |
| M-07 | Tracked messages held after 100,000 messages from 10,000 members (Vitest) | ≤ 5,000 members × 50 messages |
| M-08 | Enforcements running at once while 200 members fire rules together (Vitest) | ≤ 5, with ≤ 50 waiting |
| M-09 | People notified by a kick log, with a spammer whose message is `@everyone` and whose name is `@here` | 0 |
| M-10 | Kicked test accounts that receive the DM (DMs open) | 3 of 3 |

## 8. Permissions and configuration impact

- **New environment variables:** none (AC-29).
- **Intents:** add **Message Content** (privileged) to `src/index.ts`. It is already listed in the README's Discord setup; the implementing PR calls it out as a privileged intent, per [`CONVENTIONS.md §5`](../../CONVENTIONS.md#5-production-readiness-checklist). `GuildMessages` is already requested. Reading a member's permissions for AC-08 needs `GuildMembers`, which is already requested; how to read them for a member not in the cache is a Step 2 decision.
- **Bot permissions:** **Kick Members** and **Manage Messages** (server-wide, so every channel), and **View Channels**, **Send Messages**, **Embed Links** in the announcements channel. All are already in the README's permission table, with anti-spam named in their "Why". The bot's role must sit **above** every role it should be able to kick; the README's Discord setup step 6 gets a sentence saying so.
- **DMs:** sending a DM needs no extra permission or intent.
- **Vocabulary:** [`CONVENTIONS.md §2`](../../CONVENTIONS.md#2-domain-vocabulary) changes "Moderator" to "a member with the Manage Messages permission" and points "Moderation log channel" at the announcements channel (§3).
- **README:** the Anti-spam feature text says the kick log goes to the announcements channel, names the five rules and their thresholds, and says only the last 10 minutes of messages are deleted. Feature status moves from 🗓️ Planned when built. `/limits` stays "🚧 Stub only".

## 9. Dependencies on Discord behaviour (to confirm in Step 2)

- Discord bulk delete takes 2-100 messages from one channel, only for messages younger than 14 days; a single message needs a single delete. All tracked messages are under 10 minutes old.
- A bot can't DM a user who shares no server with it, and many members turn DMs from server members off. That is why the DM goes first and its failure is tolerated (AC-12).
- A kick fails when the member's highest role is at or above the bot's highest role, or the member is the server owner.
- Webhook messages have no member and can't be kicked (AC-10).

## 10. Resolved questions

Answered by the owner in session, 2026-11-08.

- **Q1 - Classification.** *Feature.* The draft noted that all four README checks plus the headline rule sit at the top of a Feature; if `design.md` comes out too large, Step 2 may propose reclassifying as a Large feature.
- **Q2 - Scope.** *All checks in one feature:* the headline cross-channel rule plus the README's flood, repeat, mention and link checks.
- **Q3 - Counting.** *Sliding 60 s window, 3 or more distinct channels; threads count as their own channel* (AC-01).
- **Q4 - Action.** *Kick* (AC-13). Softban, timeout and ban were offered and declined.
- **Q5 - Which messages are deleted.** *Messages tracked in memory from the last 10 minutes* (AC-14, AC-25). Scanning channel history on a kick, and deleting only the messages that fired the rule, were declined.
- **Q6 - Exemptions.** *Members with Manage Messages, and OWNERS* (AC-08, AC-09). An exempt-role variable was declined. Bots and webhooks were not chosen as exempt; the draft's default, accepted without objection, is to ignore the bot's own and webhook messages and check other bots (AC-10).
- **Q7 - Thresholds.** *Moderate:* flood 8 / 10 s, repeat 4× / 60 s, mentions 6 / 30 s with `@everyone`/`@here` counting 3 (AC-02 to AC-04).
- **Q8 - Where thresholds live.** *Code constants* (§2, out of scope). `/limits` and storage are a separate feature.
- **Q9 - Kick log.** *In the announcements channel* (`ANNOUNCEMENTS_CHANNEL_ID`), not a new channel. Asked about reposting spam links in a public channel, the owner chose to **censor each link to its domain name without the top-level domain** (AC-24).
- **Q10 - Tell the member.** *DM before the kick*, with DM failure ignored (AC-12).
- **Q11 - Link check.** *Any link in 2 or more channels within 60 s* (AC-05). An invite-only variant and dropping the check were declined.
- **Q12 - Who is checked.** *Everyone not exempt*, with no special treatment by account age (AC-11).

### Notes from design (Step 2)

- **Failed-kick cooldown** ([`design.md` D3](design.md#13-risks-and-design-questions), approved 2026-11-08). For 10 minutes after a refused kick, a rule that fires for that member only deletes their tracked messages: no DM (AC-12), kick (AC-13) or kick log (AC-15). This narrows those three criteria for that one case, so a member the bot can't kick doesn't flood the announcements channel.

## 11. Questions resolved at approval

The owner approved this document on 2026-11-08 without changes, which accepts the proposed default for each question below.

- **Q-A - Links that shouldn't count for link spread.** *Resolved: proposed default (AC-05).* Discord's own GIF picker sends a `tenor.com` link, so a member sending a GIF in two channels within a minute would be kicked under AC-05 as written. *Proposed:* links to `tenor.com`, `giphy.com`, and Discord message links (`discord.com/channels/...`) don't count towards AC-05. They are still censored in the kick log.
- **Q-B - Raid limits.** *Resolved: proposed default (AC-27).* *Proposed:* 5 enforcements at once, 50 waiting, the rest skipped (AC-27). Skipping means a spammer in a large raid may not be kicked, but unbounded work is against [`CONVENTIONS.md §5`](../../CONVENTIONS.md#5-production-readiness-checklist). Alternatively the cap could be larger, since each enforcement is only a few requests.
- **Q-C - Copy.** *Resolved: the §6 drafts are approved as written.*
- **Q-D - Other servers.** *Resolved: proposed default.* *Proposed:* anti-spam acts in every server the bot is in, and the kick log is posted only when the announcements channel belongs to that server; otherwise the enforcement goes to the bot's log (as AC-30). The bot is meant to be in one server, so this only matters for a test bot added to two.

## 12. Approval

- [x] Human approval of this document (Step 1), including the defaults in §11 and the copy in §6. Approved by the owner in session, 2026-11-08.
