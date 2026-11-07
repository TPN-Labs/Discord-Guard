# Bot status messages - requirements

| | |
|---|---|
| Status | **Draft - awaiting human approval (Step 1)** |
| Triage | Feature (0 → 1 → 2 → 4 → 5 → 6) |
| Ticket | ENG-00 - no ticket |
| Date | 2026-11-07 |
| Next | `design.md` (Step 2), only after this document is approved |

## 1. Problem

Nothing in the server says when the bot stops or starts. While it is down, nobody is verifying new members or watching for spam (once those features land), and nobody knows that. Moderators find out by accident, and the owner only finds out from Coolify.

The bot is called **Ion Iliescu**, a parody of the former Romanian president. The server leans left and democratic socialist, and its in-jokes are about Romania in 1980-2000. The status messages should be funny in that voice and still say clearly whether the bot is up or down.

## 2. Scope

**In scope**

- Post a status message to one configured channel when the bot process starts and when it shuts down.
- Pick each message at random from a fixed list of five online phrases and five offline phrases (§6).
- After an unplanned outage (a stop that posted no offline message), mark the next online message.

**Out of scope (non-goals)**

- Announcing gateway reconnects or shard resumes. Only a process start counts.
- Changing the phrases at run time, through a command or an environment variable. The phrases live in code and change through a PR.
- Posting to more than one channel, or a different channel per environment beyond what `STATUS_CHANNEL_ID` gives.
- Persistent storage. The channel's own history is the only record of the previous run.
- External uptime monitoring, heartbeats, or alerting outside Discord.
- Changing the bot's Discord presence or activity.
- Stopping the same phrase from coming up twice in a row.
- Text in the bot's Developer Portal profile (for example, marking it as a parody). That is a manual step, not code.

## 3. Roles

Roles as defined in [`docs/CONVENTIONS.md §2`](../../CONVENTIONS.md#2-domain-vocabulary). The **status channel** is new vocabulary: the one channel, set by `STATUS_CHANNEL_ID`, where the bot posts status messages. A **status message** is an online or offline embed the bot posts there.

## 4. User stories

- **US-01** - As a **member**, I want to see when the bot comes online, in a message that fits the server's humour, so I know it's back.
- **US-02** - As a **moderator**, I want to see when the bot goes offline, so I know verification and anti-spam are down and I can watch the server myself.
- **US-03** - As a **moderator**, I want to know when the bot came back from a crash rather than a planned restart, so I know an outage happened even though no offline message was posted.
- **US-04** - As an **owner**, I want to turn status messages on for production and leave them off for a development bot without changing code, so test runs don't post to the live server.
- **US-05** - As an **owner**, I want a broken status channel (deleted, no permission) to show up in the logs without taking the bot down, so a cosmetic feature can't stop verification or anti-spam.

## 5. Acceptance criteria

### Online message (US-01)

- **AC-01** - When the bot process starts and has connected to Discord, the bot posts exactly one online status message in the status channel.
- **AC-02** - The online status message is an embed with a green colour bar, the title `🟢 Ion Iliescu e online`, one phrase from the online list (§6.1) as its body, and a timestamp showing when it was posted.
- **AC-03** - Each online phrase is chosen at random from the online list, and every phrase on the list can be chosen.
- **AC-04** - When the gateway connection drops and discord.js reconnects or resumes without the process restarting, the bot posts **no** new online status message.

### Offline message (US-02)

- **AC-05** - When the bot process is asked to stop gracefully, the bot posts exactly one offline status message in the status channel before it exits. "Asked to stop gracefully" covers SIGTERM (Coolify restart, redeploy or stop) and SIGINT (Ctrl+C locally).
- **AC-06** - When the bot process is about to exit because of an uncaught exception or an unhandled promise rejection, the bot tries to post one offline status message before it exits. The error is still logged in full, and the process still exits with a non-zero code.
- **AC-07** - The offline status message is an embed with a red colour bar, the title `🔴 Ion Iliescu e offline`, one phrase from the offline list (§6.2) as its body, and a timestamp. The phrase is chosen at random, and every phrase on the list can be chosen.
- **AC-08** - If the offline status message can't be sent within **5 seconds** (Discord slow or unreachable, channel gone, missing permission), the bot logs why and exits anyway. Shutdown is never held up for more than 5 seconds by this feature.
- **AC-09** - One shutdown produces at most one offline status message, even when several stop triggers arrive together (for example, SIGTERM followed by an error during shutdown, or SIGINT pressed twice).
- **AC-10** - If the process stops before the online status message for that run was posted (for example, SIGTERM during start-up, or a login failure), the bot posts **no** offline status message.

### Unplanned outage (US-03)

- **AC-11** - At start-up, if the bot's most recent status message in the status channel is an **online** status message (the previous run never posted its offline message), the new online status message also contains the line `⚡ Revin după o pană de curent neprogramată.`
- **AC-12** - If the bot's most recent status message in the status channel is an offline status message, or the bot has never posted a status message there, the new online status message does **not** contain that line.
- **AC-13** - Only status messages posted by the bot itself count for AC-11 and AC-12. Messages from members, other bots, and the bot's other messages in the channel are ignored.
- **AC-14** - If the bot can't read the status channel's history (for example, it lacks **Read Message History**), it still posts the online status message without the unplanned-outage line and logs a warning that names the channel and the missing access.

### Configuration and failure modes (US-04, US-05)

- **AC-15** - When `STATUS_CHANNEL_ID` is unset or empty, the bot posts no status messages, logs one warning at start-up saying status messages are off, and otherwise starts and runs normally.
- **AC-16** - When `STATUS_CHANNEL_ID` is set to a value that is not a Discord ID (not 17-20 digits), start-up stops with an `[ENV] STATUS_CHANNEL_ID - ...` error, the same way a missing `OWNERS` does. *(Open question Q1.)*
- **AC-17** - When `STATUS_CHANNEL_ID` names a channel that doesn't exist, that the bot can't see, or that can't hold text messages (for example, a voice channel or a category), the bot logs an error naming the channel ID and the reason, posts nothing, and keeps running. Other features and commands are unaffected.
- **AC-18** - When the bot lacks **Send Messages** or **Embed Links** in the status channel, the bot logs an error naming the channel ID and the missing permission, and keeps running.
- **AC-19** - Status messages mention nobody: they never ping `@everyone`, `@here`, a role or a member, whatever the phrase text says.
- **AC-20** - No log line, status message or error produced by this feature contains the bot token or any other value from `src/.env` except `STATUS_CHANNEL_ID`.

## 6. Approved copy

Chosen with the owner on 2026-11-07 from 40 drafts. The text is Romanian, with comma-below diacritics (ș, ț), not cedilla forms (ş, ţ). Tests compare against this copy exactly.

### 6.1 Online phrases

1. Măi animalule, m-am întors!
2. Iliescu apare, botul răsare!
3. Online. Aici construim o democrație originală.
4. Am pornit ca o Dacie 1300 iarna: din a treia cheie, dar am pornit.
5. Fraților, am învins! Botul e liber!

### 6.2 Offline phrases

1. S-a luat curentul. Ca pe vremuri. Revin când dă drumul RENEL-ul.
2. Măi animalule, cine a oprit serverul?
3. Offline. Mi-am pus economiile în Caritas și acum n-am bani nici de server.
4. Ies din emisie. Urmează Cântarea României.
5. Plec la coadă la portocale. E Crăciun, poate se dă.

### 6.3 Fixed strings

| Where | Text |
|---|---|
| Online title | `🟢 Ion Iliescu e online` |
| Offline title | `🔴 Ion Iliescu e offline` |
| Unplanned-outage line | `⚡ Revin după o pană de curent neprogramată.` |

**Content note.** The 40 drafts included four phrases about the June 1990 Mineriad and the deaths of December 1989. None was chosen. Any later change to the lists goes through a PR and keeps to this line.

## 7. Success metrics

Measured in a test server with a separate bot application during Step 5 acceptance, and in the Vitest suite where noted.

| ID | Metric | Target |
|---|---|---|
| M-01 | Graceful restarts (SIGTERM via Coolify or `docker stop`, and Ctrl+C) that produce exactly one offline message followed by exactly one online message | 5 of 5 |
| M-02 | Forced kills (`kill -9`) after which the next online message carries the unplanned-outage line | 3 of 3 |
| M-03 | Graceful restarts whose next online message wrongly carries the unplanned-outage line | 0 of 5 |
| M-04 | Time from the bot showing online in Discord to the online status message appearing | ≤ 5 s |
| M-05 | Extra time added to shutdown when Discord is unreachable (network blocked) | ≤ 5 s |
| M-06 | Online messages posted across gateway reconnects without a process restart (Vitest) | 0 |
| M-07 | Phrases never chosen across 1,000 picks per list with a real random source (Vitest) | 0 of 10 |

## 8. Permissions and configuration impact

- **New environment variable:** `STATUS_CHANNEL_ID` (optional). Goes into `.env.example` and the README Configuration table in the implementing PR.
- **Bot permissions in the status channel:** View Channels, Send Messages, Embed Links, Read Message History. All four are already in the README's permission table; their "Why" text gets status messages added.
- **Intents:** no new intent expected. `Guilds` is already requested; Step 2 confirms it is enough for reading channel history.

## 9. Open questions

- **Q1 - Malformed `STATUS_CHANNEL_ID`.** [`docs/TESTING.md §7`](../../TESTING.md#7-failure-path-floor) says bad configuration fails loudly at start-up. The option chosen during clarification said an invalid channel logs a warning and the bot keeps running. AC-16 and AC-17 split the two cases: a value that can't be an ID stops start-up (detectable before login, almost always a typo), while a well-formed ID for an unreachable channel logs an error and the bot keeps running. **Recommendation: keep the split.** The alternative is to log and carry on in both cases.
- **Q2 - Crash loops.** If the bot crashes right after start-up and Coolify restarts it over and over, every start posts an online message, each with the unplanned-outage line. **Recommendation: accept this for now.** The flood is itself a visible signal, and capping it would need state this feature doesn't keep. Revisit if it happens.
- **Q3 - Fixed name in the titles.** The titles say `Ion Iliescu` even when a test bot with another name posts them. **Recommendation: keep it fixed.** The phrases are written in Iliescu's voice anyway, and the copy stays identical across environments.

## 10. Approval

- [ ] Human approval of this document (Step 1). Approver and date:
