# Anti-spam with automatic kick - validation trail (Step 4)

Red-then-green evidence for every unit, in the order it was built (Constitution §4.I, [`TESTING.md §2`](../../TESTING.md#2-the-loop)). Each unit started with a test file and a skeleton whose functions throw `not implemented` or return placeholders, so the red failures come from the tests' own assertions or from the stub, never from a missing module. Baseline before the first test: 15 files, **175 passed**.

## Red → green per unit

| # | Unit | Test file | Red run | Reason for red | Green |
|---|---|---|---|---|---|
| 0 | `tldts` as a direct dependency (D1) | - | - | `package.json` gains `"tldts": "^7.4.19"`; `yarn.lock` resolves it to the 7.4.19 already installed through `@sapphire/plugin-api`, so nothing new was downloaded | 175 passed |
| 1 | `copy.ts` | `tests/lib/antispam/copy.test.ts` | 7 failed (7) | `expected { crossChannel: 'TODO', …(4) } to deeply equal { …(5) }`; `expected 'TODO' to be '🛡️ Agitator scos din server'`; `Error: not implemented` | 182 passed (suite) |
| 2 | `findLinks`, `countsForLinkSpread`, `censorDomain`, `censorLinks` | `tests/lib/antispam/links.test.ts` | 20 failed (20) | `Error: not implemented` | 20 passed (file); suite at unit 3 |
| 3 | `normalizeForRepeat`, `countMentions`, `excerpt`, `toTrackedMessage` | `tests/lib/antispam/message-facts.test.ts` | 12 failed (12) | `Error: not implemented` | 214 passed (suite) |
| 4 | `RULES`, `evaluateRules` | `tests/lib/antispam/rules.test.ts` | 17 failed (17) | 16 × `Error: not implemented`; `expected { crossChannel: { …(2) }, …(4) } to deeply equal …` for the zeroed thresholds | 231 passed (suite) |
| 5 | `isChecked` | `tests/lib/antispam/exemption.test.ts` | 5 failed, 3 passed (8) | The stub checked everyone - the exemption gate removed - so every exemption test failed. The 3 that passed (`checksAnOrdinaryMember`, `checksOtherBotsLikeAnyMember`, `doesNotTreatAPartialIdMatchAsAnOwner`) assert "is checked" and hold without a gate | 239 passed (suite) |
| 6 | `MessageTracker` | `tests/lib/antispam/tracker.test.ts` | 8 failed (8) | 7 × `Error: not implemented`; `expected +0 to be 50` | 247 passed (suite) |
| 7 | `EnforcementQueue` | `tests/lib/antispam/queue.test.ts` | 10 failed (10) | 9 × `Error: not implemented`; `expected +0 to be 5` | 257 passed (suite) |
| 8 | `forDisplay`, `buildKickLog`, `formatKickLogText` | `tests/lib/antispam/kick-log.test.ts` | 11 failed (11) | `Error: not implemented` | 11 passed (file); suite at unit 9 |
| 9 | `SpamGuard` | `tests/lib/antispam/guard.test.ts` | 22 failed, 4 passed (26) | The stub's `handleMessage` did nothing, so every enforcement test timed out waiting for `Enforced against` in the log. The 4 that passed are "never kicks" guards (moderator, owner, webhook/DM/system) and `doesNothingBelowAnyThreshold`; mutations M1-M3 below show the exemption ones fail when the gate is removed | see 9b |
| 9b | Test-fixture defect | same | after implementing: 2 failed, 24 passed (26) | `sendsTheApprovedDmPingingNobody` and `kicksWithTheRuleNamesAsTheAuditLogReason` expected `mesaje în 3 canale într-un minut, linkuri în 2 canale într-un minut`; received `Anti-spam: linkuri în 2 canale într-un minut`. The code was right: with a link in every message, link spread fires on the **second** message (AC-05: two channels) and AC-06 reports the rules of that message. The fixture, not the expectation of the requirements, was wrong: both tests now spam plain text so they test the cross-channel rule as named, and a new test, `firesLinkSpreadOnTheSecondChannelBeforeCrossChannelIsReached`, pins the link case (design §15) | 295 passed (suite) |
| 10 | `antiSpamMessage` listener; `src/index.ts` (Message Content intent, `SpamGuard` creation and `start()`) | none (design §11: one-line delegate) | - | - | 295 passed; smoke run below |

No test was edited to make code pass; 9b corrected a fixture whose input contradicted its own test name, and is recorded rather than hidden. Final run before review: `yarn lint`, `yarn check-types`, `yarn format:check`, `yarn test` (24 files, 295 passed) and `yarn build` all exit 0. After the PR review round: the same five exit 0 with 24 files, **304 passed**.

### PR review round ([TPN-Labs/Discord-Guard#27](https://github.com/TPN-Labs/Discord-Guard/pull/27))

| # | Unit | Test file | Red run | Reason for red | Green |
|---|---|---|---|---|---|
| 11 | `MessageTracker.has` | `tests/lib/antispam/tracker.test.ts` | 1 failed (with unit 12's run: 9 failed, 35 passed (44)) | `Error: not implemented` | see 12 |
| 12 | `SpamGuard` drain (AC-37) and deadlines (AC-38) | `tests/lib/antispam/guard.test.ts` | 8 failed | The two drain tests: they failed fast (110 ms, 154 ms) on the assertion that the late message's channel got a `bulkDelete`, which never happened because nothing drained it. The six deadline tests: a hanging kick, delete or send kept the enforcement from ever finishing, so `Enforced against` never reached the log and the 1 s wait timed out | 304 passed (suite); guard file 10 of 10 runs green |

One test changed before its first green run: `stopsCallingDiscordOnceTheEnforcementDeadlineHasPassed` asserted that channel C, never tried before the deadline, is **never** deleted. While implementing, the design chose to give never-tried channels to the follow-up pass, a stronger AC-14 guarantee, so the test now asserts C is not tried by the enforcement itself (`deleted 0/3`, kick log in the bot's log) but is deleted once by the follow-up, while the timed-out A and B are not retried. The implementation never ran against the old assertion.

## Mutation checks

Deliberate breakages, each applied alone to the finished code, run against `tests/lib/antispam` (120 tests), then restored from a backup. Script: one string replacement per mutation.

| # | Mutation | Result |
|---|---|---|
| M1 | `isChecked` ignores Manage Messages | **Killed** (2): `neverChecksAModeratorWithManageMessages`, `neverKicksAModeratorWithManageMessages` |
| M2 | `isChecked` ignores `OWNERS` | **Killed** (2): `neverChecksAnOwner`, `neverKicksAnOwner` |
| M3 | `SpamGuard` never reads Manage Messages | **Killed** (1): `neverKicksAModeratorWithManageMessages` |
| M4 | Kick log allows `@everyone` | **Killed** (1): `pingsNobody` |
| M5 | Mentions in the kick log not neutralized | **Killed** (3): `showsMentionsAndMarkdownInMessagesAsPlainText`, `showsACraftedNameAsPlainText`, `escapesMarkdownAndNeutralizesMentions` |
| M6 | Excerpts not censored | **Killed** (6), including `censorsLinksBeforeCutting`, `laysOutTheMemberRulesChannelsMessagesAndOutcome`, `carriesTheSameFactsAsTheEmbedOnOneLine` |
| M7 | Per-member cap of 50 lifted | **Killed** (1): `forgetsTheOldestMessageWhenAMemberGoesOverFifty` |
| M8 | Member cap of 5,000 lifted | **Killed** (2): `evictsTheLeastRecentlyActiveMemberWhenAMemberOverTheCapArrives`, `staysBoundedUnderAFloodOf100000MessagesFrom10000Members` |
| M9 | Running cap of 5 lifted | **Killed** (5), including `neverHasMoreThanFiveRunningWhile200MembersFireTogether` |
| M10 | Waiting cap of 50 lifted | **Killed** (3), including `skipsBeyondFiftyWaitingAndWarnsOncePerBurst` |
| M11 | `handleMessage` no longer returns early for a member already in the queue | **Survived** - equivalent: `EnforcementQueue.submit` answers `'duplicate'` for the same member, so behaviour is unchanged. **M11b**, removing both layers, is **killed** (10), including `enforcesOnceAndDeletesMessagesPostedWhileTheKickWasInProgress` and `acceptsOneEntryPerMemberWhileItIsRunningOrWaiting` |
| M12 | Failed-kick cooldown never starts (D3) | **Killed** (1): `onlyDeletesNewSpamFromAMemberWhoseKickFailedForTenMinutes` |
| M13 | Windows include a message exactly one window old | **Killed** (2): `leavesOutAMessageExactlyOneWindowOld`, `leavesOutMentionsOlderThanThirtySeconds` |
| M14 | Tenor/Giphy exception removed (Q-A) | **Killed** (2): `ignoresGifLinksFromTenorAndGiphy`, `doesNotCountAGifLinkTowardsLinkSpread` |
| M15 | Kick waits for the DM with no timeout | **Killed** (1): `kicksAfterTheDmTimeoutWhenTheDmHangs` |
| M16 | An already-deleted single message counts as a failure | **Killed** (1): `countsAnAlreadyDeletedSingleMessageAsDeleted` |
| M17 | Tracked messages never expire | **Killed** (5), including `neverDeletesAMessageOlderThanTenMinutes`, `forgetsExpiredMessagesEveryMinuteOnceStarted` |

PR review round, against `tests/lib/antispam/guard.test.ts` (35 tests):

| # | Mutation | Result |
|---|---|---|
| M18 | Enforcement no longer drains late messages | **Killed** (1): `deletesMessagesPostedWhileTheKickLogWasBeingPosted` |
| M19 | Delete-only pass no longer drains | **Killed** (1): `deletesMessagesPostedDuringADeleteOnlyPass` |
| M20 | Discord calls have no timeout | **Killed** (7), including `kicksAfterTheDmTimeoutWhenTheDmHangs`, `logsTheKickLogFactsWhenPostingItTakesTooLong`, `schedulesAFollowUpForMessagesPostedAfterTheDeadline` |
| M21 | No follow-up pass | **Killed** (2): `schedulesAFollowUp…`, `stopsCallingDiscordOnceTheEnforcementDeadlineHasPassed` |
| M22 | Never-tried messages dropped instead of kept for the follow-up | **Killed** (2): same two |
| M23 | Deadline never checked | **Killed** (2): same two |
| M24 | A late success after a timeout isn't logged | **Killed** (1): `logsTheLateResultOfACallThatTimedOut` |

Not mutation-tested: `GatewayIntentBits.MessageContent` in `src/index.ts`. Its effect only exists with a live gateway; it is checked by hand at Step 5 (AC-34).

## Smoke run of the built bot (`node dist/index.js`)

No Discord connection: an empty `DISCORD_TOKEN` fails before any request.

| Path | Exit code | Log |
|---|---|---|
| `OWNERS` set, `ANNOUNCEMENTS_CHANNEL_ID` and `DISCORD_TOKEN` empty | 1 | `INFO - [AntiSpam] Kick logs go to the bot's log: ANNOUNCEMENTS_CHANNEL_ID is not set.` then `FATAL - DiscordjsError [TokenInvalid]: An invalid token was provided.` - the guard is built before login, and the unref'd sweep timer doesn't hold the process |

## Still to do at Step 5

The manual plan in [`design.md §14`](design.md#14-step-5-manual-acceptance-plan) (M-01 to M-10, the failure modes and D4's memory reading) runs in a test server with a separate bot application. Nothing in this trail touched Discord.
