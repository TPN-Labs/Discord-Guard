# Join and leave announcements - validation trail (Step 4)

Red-then-green evidence for every unit, in the order it was built (Constitution §4.I, [`TESTING.md §2`](../../TESTING.md#2-the-loop)). Each unit started with a test file and a skeleton whose functions throw `not implemented` or return placeholders, so the red failures come from the tests' own assertions or from the stub, never from a missing module. Baseline before the first test: 9 files, **94 passed**.

## Red → green per unit

| # | Unit | Test file | Red run | Reason for red | Green (whole suite) |
|---|---|---|---|---|---|
| 1 | `envParseOptionalSnowflake` for the two new keys | `tests/lib/env-parser.test.ts` | `yarn check-types`: 3 errors | `TS2345: Argument of type '"ANNOUNCEMENTS_CHANNEL_ID" \| "RULES_CHANNEL_ID"' is not assignable to parameter of type '"STATUS_CHANNEL_ID"'`. The parser already accepted any key at run time, so the contract change is the type; the 6 new Vitest cases passed on first run and are characterization tests for the new keys. | 100 passed; types clean |
| 2 | `copy.ts` | `tests/lib/announcements/copy.test.ts` | 5 failed (5) | `expected 'TODO' to be '👋 Avem un tovarăș nou'`, `expected 'TODO' to be 'Ultima oră la Telejurnal: {member} e …'`, and `Error: not implemented` for `rulesLine` / `durationLine` | 105 passed |
| 3 | `romanianCount`, `formatDuration` | `tests/lib/announcements/duration.test.ts` | 28 failed (28) | `Error: not implemented` | 133 passed |
| 4 | `formatMemberName` | `tests/lib/announcements/member-name.test.ts` | 3 failed (3) | `Error: not implemented` | 136 passed |
| 5 | `buildJoinAnnouncement`, `buildLeaveAnnouncement` | `tests/lib/announcements/message.test.ts` | 8 failed (8) | `Error: not implemented` | 144 passed |
| 5b | Placeholder replacement (defect, see design §15) | same | 1 failed, 8 passed (9) | `expected '**{name}  a sărit gardul ambasadei. D…' to be '**$& $\\' $\`** a sărit gardul ambasade…'` - the string-pattern `replace` expanded `$&` and `$'` | 145 passed |
| 6 | `shouldAnnounce` | `tests/lib/announcements/should-announce.test.ts` | 3 failed (3) | `Error: not implemented` | 148 passed |
| 7 | `MemberAnnouncer` | `tests/lib/announcements/announcer.test.ts` | 19 failed (19) | `Error: not implemented`; `promise rejected "Error: not implemented" instead of resolving` | 167 passed |
| 8 | Three listeners, `src/index.ts` wiring (partial, env parsing, container) | none (design §11: one-line delegates, covered through `MemberAnnouncer` and the smoke runs below) | - | - | 167 passed |

No test was edited to make it pass. Final run: `yarn lint`, `yarn check-types`, `yarn format:check`, `yarn test` (15 files, 167 passed) and `yarn build` all exit 0.

## Mutation checks

Deliberate breakages, each run once against the finished code and then reverted.

| # | Mutation | Result |
|---|---|---|
| M1 | Leave announcement allows `@everyone` (`parse: ['everyone']`) | **Killed:** `pingsNobody`, `postsOneLeaveAnnouncementWithTheNameAndHowLongTheyStayed` |
| M2 | Join announcement drops the new member from `allowedMentions.users` | **Killed:** `pingsTheNewMemberAndNobodyElse`, `postsOneJoinAnnouncementThatPingsOnlyTheNewMember` |
| M3 | `announce` no longer skips bots before calling Discord | **Killed:** both `skipsBotAccountsWithoutCallingDiscord` |
| M4 | `shouldAnnounce` ignores the server | **Killed:** `ignoresJoinsInAnotherServer`, `ignoresLeavesInAnotherServer`, `ignoresJoinsAndLeavesInAnotherServer` |
| M5 | `formatMemberName` stops escaping the display name | **Killed:** `escapesMarkdownSoTheNameShowsExactlyAsWritten` |
| M6 | `romanianCount` adds `de` from 21 instead of 20 | **Killed:** `addsDeFromTwentyUnlessTheLastTwoDigitsAreOneToNineteen (20 day)` |
| M7 | Leave announcement shows the duration only when the join date is unknown | **Killed:** three leave tests |

Not mutation-tested: `partials: [Partials.GuildMember]` in `src/index.ts`. Its effect only exists with a live gateway; it is checked by hand at Step 5 (M-03).

## Smoke runs of the built bot (`node dist/index.js`)

No Discord connection: both values fail before `client.login()`.

| Path | Exit code | Log |
|---|---|---|
| `ANNOUNCEMENTS_CHANNEL_ID=abc` (AC-16) | 1 | `Error: [ENV] ANNOUNCEMENTS_CHANNEL_ID - The key must be a Discord ID (17-20 digits).` |
| `RULES_CHANNEL_ID=123,456` (AC-07) | 1 | `Error: [ENV] RULES_CHANNEL_ID - The key must be a Discord ID (17-20 digits).` |

## Still to do at Step 5

The manual plan in [`design.md §14`](design.md#14-step-5-manual-acceptance-plan) (M-01 to M-07 and the configuration checks) runs in a test server with a separate bot application. Nothing in this trail touched Discord.
