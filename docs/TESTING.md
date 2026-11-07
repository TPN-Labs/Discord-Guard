# Testing

> Referenced by [`CONSTITUTION.md §4.I`](../CONSTITUTION.md#i-test-driven-development-tdd---mandatory) and
> [`§5`](../CONSTITUTION.md#5-reference-documentation). Owns the TDD loop, the Given/When/Then
> conventions and the acceptance-traceability rules for this repository. Reload before writing or
> reviewing tests or test specs.

## 1. Purpose and scope

TDD and BDD are non-negotiable (Constitution §4.I, §4.II). Acceptance criteria in a feature's
`requirements.md` are the source of truth; every criterion traces to at least one test. Step-3
`test-specs/` are tool-agnostic markdown, validated by a human (§4.III) before implementation begins.
Executable tests are Vitest.

## 2. The loop

```bash
yarn test          # run the suite once (what CI runs)
yarn test:watch    # re-run on change while you work
```

1. **Red.** Write one test for one behaviour. Run it and watch it fail **for the expected reason** - the
   behaviour is missing, not a typo or a bad import. A test that passes on first run is testing
   something that already exists; fix the test.
2. **Green.** Write the least code that makes it pass. Run the whole suite, not just the file.
3. **Refactor.** Clean up with the suite green. Add no behaviour here.

When adding a test for code that already exists (a characterization test), you cannot watch it fail
first. Prove it can fail instead: break the code under test on purpose, see the test go red, then
restore the code. Say in the PR that you did.

A failing test is a real bug or a spec gap - **never edit a test or a spec to make it pass**. Fix the
code, or loop back to the spec and get it re-approved.

## 3. Layout

- Tests live in `tests/`, mirroring `src/`: `src/lib/env-parser.ts` → `tests/lib/env-parser.test.ts`.
- Files end in `.test.ts`. `vitest.config.mts` only picks up `tests/**/*.test.ts`.
- `tests/` is outside the build (`tsconfig.json` compiles `src/` only) but is type-checked by
  `yarn check-types` (through `tests/tsconfig.json`), linted by `yarn lint` and formatted by
  `yarn format`.
- Shared fakes and builders go in `tests/helpers/`, never in `src/`. Production code carries no
  test-only branches or exports.

## 4. Testing Discord-facing code

CI has no Discord connection and must never get one: no bot token in CI, no test server, no network.
That shapes how code is written, not only how it is tested.

- **Keep decisions out of pieces.** A listener or command is a thin adapter: it reads the event or
  interaction, calls a plain function in `src/lib/` that decides what to do, then performs the Discord
  calls. The decision function - "is this a flood?", "which role does this reaction grant?", "how long
  was this member here?" - takes plain data and returns plain data, and is where most tests live.
- **Fake at the boundary, not inside.** When a test must cover the adapter itself, pass a minimal
  hand-written fake for the discord.js object it touches (`{ roles: { add } }`), typed with `Pick<>`
  of the real type so a discord.js upgrade that changes the shape breaks the test's compile. Assert on
  what the bot did to Discord (the role it added, the message it sent), not on how many times an
  internal helper ran.
- **Environment.** Stub variables with `vi.stubEnv`; the config restores them after each test. Code
  that reads the environment at module load (as `OwnerOnly` does) needs `vi.resetModules()` and a
  dynamic `import()` after stubbing.
- **Time.** Anything with a window or interval (anti-spam, "member for 3 days") takes a clock or uses
  `Date.now()` under `vi.useFakeTimers()`. Never `sleep` in a test.
- **Manual acceptance stays manual.** End-to-end behaviour in a real server is checked by a human at
  Step 5, in a test server with a separate bot application. Record what was checked in the PR's AC
  trace table.

## 5. Given/When/Then conventions

- **One observable behaviour per scenario.** If a scenario asserts two unrelated outcomes, split it.
- **Behaviour-named, not implementation-named:** `kicksMemberAfterFiveMessagesInThreeSeconds` ✓ -
  `testSpamCheck2` ✗. Test names in Vitest follow the same rule.
- **Given** = preconditions and fixtures (state, not actions).
- **When** = the single action under test.
- **Then** = observable outcome(s) only. Do not assert on incidental details - exact log strings or
  error messages outside the documented contract.
- **No silent error swallowing** in any behaviour you specify: log-and-return-null is forbidden.

## 6. Scenario ids and traceability

Every scenario in a feature's `test-specs/` carries an id and a trace line:

```
### SPEC-NN: <behaviour name>
Traces: AC-04
**Given** …
**When** …
**Then** …
```

- `SPEC-NN` is unique within one `test-specs/` folder. Cite one from elsewhere as `<folder>/SPEC-NN`.
- `Traces: AC-NN[, AC-MM]` points back to the feature's `requirements.md`. A scenario with no AC
  parent is tagged `Traces: design-only - <one-line reason>`.
- **Forward coverage:** every `AC-NN` is covered by at least one `SPEC-NN`.
- **No orphans:** every `SPEC-NN` traces to an `AC-NN` or is tagged `design-only`.
- Each feature keeps `test-specs/traceability-matrix.md` mapping `AC-NN → [SPEC ids]`. The matrix is
  reviewed at Step 3 and Step 5, and the executable test that implements each SPEC names it in its
  `describe` or test title.

## 7. Failure-path floor

Code reviews in other TPN LABS repositories found their defects in exactly the branches nobody wrote
a scenario for. For this bot, a spec set is incomplete without, where the surface applies:

- **Discord refuses.** Missing permission, the target role sits above the bot's role, the member has
  already left, the message was already deleted, the channel is gone. What does the member see, what do
  moderators see, what is logged?
- **Rate limits and slowness.** A burst of events (a raid, a spam wave) does not create unbounded
  per-member state or an unbounded queue of API calls.
- **Repeats and races.** The same reaction added twice; added and removed in quick succession; the
  bot restarting between the two. The end state is right, and nothing is granted twice.
- **Enforcement removal.** For every permission gate (owner-only, moderator-only, exempt roles), a
  test that fails when the gate is removed: a non-owner is refused, an exempt moderator is not kicked.
- **Bad configuration.** A missing or malformed variable in `src/.env` (an ID list split on the wrong
  separator, an unknown channel ID) fails loudly at start-up rather than misbehaving later.

## 8. CI

`yarn test` runs as a step in the `ci / Build & Verify` job (`.github/workflows/ci.yml`). A red test
fails that required check and blocks merge. Add new tests to the suite; do not add a job or a matrix
leg for them (Constitution §4.VII).
