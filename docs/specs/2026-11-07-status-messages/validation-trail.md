# Bot status messages - validation trail (Step 4)

Red-then-green evidence for every unit, in the order it was built (Constitution §4.I, [`TESTING.md §2`](../../TESTING.md#2-the-loop)). Each unit started with a test file and a skeleton whose functions throw `not implemented` or return placeholders. The red failures therefore come from the tests' own assertions or from the stub, never from a missing module. Raw Vitest output was captured per run; the excerpts below are the summary lines and the distinct failure reasons.

## Red → green per unit

| # | Unit | Test file | Red run | Reason for red | Green (whole suite) |
|---|---|---|---|---|---|
| 1 | `envParseOptionalSnowflake` | `tests/lib/env-parser.test.ts` | 8 failed, 3 passed (11) | `Error: not implemented`; `expected [Function] to throw error including '[ENV] STATUS_CHANNEL_ID - …' but got 'not implemented'`. The 3 passing are the existing `envParseArray` tests. | 11 passed |
| 2 | `copy.ts` | `tests/lib/status/copy.test.ts` | 3 failed, 2 passed (5) | `expected [ 'TODO' ] to deeply equal [ 'Măi animalule, m-am întors!', …(4) ]` and the same for the offline list and titles. The 2 passing are regression guards (no cedillas, no mass mentions) that hold on placeholders too. | 16 passed |
| 3 | `pickPhrase` | `tests/lib/status/pick-phrase.test.ts` | 6 failed (6) | `Error: not implemented` | 22 passed |
| 4 | `buildStatusMessage` | `tests/lib/status/message.test.ts` | 5 failed, 1 passed (6) | `expected {} to deeply equal { color: 5763719, …(3) }` (empty embed). The 1 passing (`mentionsNobodyWhateverThePhraseSays`) passed because the skeleton already returned `allowedMentions`. See mutation check M1. | 28 passed |
| 5 | `classifyPreviousRun` | `tests/lib/status/previous-run.test.ts` | 6 failed (6) | `Error: not implemented` | 34 passed |
| 6 | `StatusLifecycle` | `tests/lib/status/lifecycle.test.ts` | 11 failed (11) | `Error: not implemented` | 45 passed |
| 7 | `withDeadline`, `registerShutdownHooks` | `tests/lib/status/shutdown.test.ts` | 9 failed, 1 passed (10) | `Error: not implemented`. The 1 passing pins `SHUTDOWN_DEADLINE_MS === 5000`, a constant the skeleton already declared. | 55 passed |
| 8 | `checkStatusChannelPermissions`, `describeDiscordError`, `resolveStatusChannel` | `tests/lib/status/channel.test.ts` | 21 failed (21) | `Error: not implemented` | 76 passed |
| 9 | `StatusAnnouncer` | `tests/lib/status/announcer.test.ts` | 18 failed (18) | `Error: not implemented`; `promise rejected "Error: not implemented" instead of resolving` | 94 passed |
| 10 | `statusOnline` listener, `src/index.ts` wiring | none (design §11: one-line delegate, covered through `StatusAnnouncer` and the smoke runs below) | - | - | 94 passed |

No test was edited to make it pass.

## Mutation checks

Deliberate breakages, each run once against the finished code and then reverted.

| # | Mutation | Expected | Result |
|---|---|---|---|
| M1 | `buildStatusMessage` drops `allowedMentions` | `mentionsNobodyWhateverThePhraseSays` fails | **Failed as expected:** `expected undefined to deeply equal { parse: [] }` |
| M2 | `StatusAnnouncer.shutdown` doesn't clear the backstop timer | `givesUpAfterFiveSecondsWhenDiscordHangs` fails (exit called twice) | **Failed as expected** |
| M3 | `announceOnline` ignores the Read Message History check | `skipsOutageDetectionAndWarnsWithoutReadMessageHistory` fails | **Failed as expected** |
| M4 | `shutdown` posts offline regardless of `plan.postOffline` | the "no offline message" tests fail | **Survived. Equivalent mutant:** `postOffline()` also returns when no channel is stored, and the channel is stored only when the lifecycle reaches `online`, so `plan.postOffline` and "channel stored" are always equal. A deliberate double guard; no observable behaviour differs. |

## Smoke runs of the built bot (`node dist/index.js`)

No Discord connection. For the signal and error paths, `login()` was stubbed by a `-r` preload script (outside the repository) so the process stays up.

| Path | Exit code | Log |
|---|---|---|
| `STATUS_CHANNEL_ID=abc` (AC-16) | 1 | `Error: [ENV] STATUS_CHANNEL_ID - The key must be a Discord ID (17-20 digits).` |
| SIGTERM sent twice | 0, after 13 ms | `INFO - [Status] Shutting down (SIGTERM).` (once) |
| SIGINT sent twice | 0, after 13 ms | `INFO - [Status] Shutting down (SIGINT).` (once) |
| Uncaught exception | 1 | `FATAL - [Status] Shutting down after uncaughtException: Error: smoke: boom`, then `Shutting down (uncaughtException).` |
| Unhandled rejection | 1 | `FATAL - [Status] Shutting down after unhandledRejection: Error: smoke: rejected`, then `Shutting down (unhandledRejection).` |
| Invalid token, real login | 1 | `FATAL - DiscordjsError [TokenInvalid]`; no `[Status]` lines (AC-10: online never posted) |

The hooks register about 430 ms after `node` starts, once the modules have loaded. A signal before that point gets Node's default handling (exit 143). Nothing has been posted that early, so nothing is lost.

Not covered here, by design: a real online or offline post, outage detection against real channel history, and timings against Discord. Those are the Step 5 manual checks ([`design.md §14`](design.md#14-step-5-manual-acceptance-plan)).

## Final checks

`yarn lint`, `yarn check-types`, `yarn format:check`, `yarn test` (94 passed, 9 files) and `yarn build` all pass locally. CI runs the same on the PR.
