# Discord Guard

The guard and helper bot for **Mihai TPN's Discord server**, maintained by [TPN Labs](https://github.com/TPN-Labs).

It welcomes people in, makes sure they accept the rules before they can talk, keeps spammers out, and carries a handful of utility commands for the moderators.

Built with TypeScript on [discord.js](https://discord.js.org) v14 and the [Sapphire framework](https://www.sapphirejs.dev).

> **Status: early development.** The project is scaffolded from a Sapphire starter. The features below are the roadmap for this repository; the [Feature status](#feature-status) table says what works today.

---

## Contents

-   [Features](#features)
-   [Feature status](#feature-status)
-   [Requirements](#requirements)
-   [Setting up the bot in Discord](#setting-up-the-bot-in-discord)
-   [Running locally](#running-locally)
-   [Deploying with Coolify](#deploying-with-coolify)
-   [Troubleshooting](#troubleshooting)
-   [Configuration](#configuration)
-   [Commands](#commands)
-   [Project structure](#project-structure)
-   [Development](#development)
-   [Contributing](#contributing)
-   [License](#license)

---

## Features

### 📜 Rules and verification

The bot posts the server's rules in a dedicated rules channel and adds a ✅ reaction under the message.

-   A new member sees only the rules channel at first.
-   Reacting with ✅ gives them the verified member role, which unlocks the rest of the server.
-   Removing the reaction takes the role away again.
-   The rules message is posted once and reused after restarts, so reactions are never lost.

### 👋 Join and leave announcements

When someone joins or leaves the server, the bot posts a short message in the announcements channel:

-   **Join:** a welcome that mentions the member and points them to the rules channel.
-   **Leave:** a goodbye with the member's username and how long they had been on the server.

### 🛡️ Anti-spam

The bot watches messages and automatically **kicks** members who spam. It looks at:

-   many messages in a short window (message flood),
-   the same message repeated over and over,
-   a burst of mentions (`@user` or `@role`) in a short time,
-   invite links or links posted across several channels in a row.

Each kick is logged in the moderation log channel with the reason and the offending messages, so moderators can review it. Moderators and members with configured roles are never checked.

The thresholds (how many messages, in how many seconds) are adjustable with the `/limits` command.

### 🟢 Online and offline status messages

The bot is called **Ion Iliescu**, and it announces its own comings and goings in a status channel, in character. When it starts it posts a green embed with one of five online phrases; when it is stopped it posts a red embed with one of five offline phrases. Moderators can tell at a glance when verification and anti-spam are down.

-   A planned stop (a Coolify restart or redeploy, Ctrl+C) posts the offline message before the bot exits. Waiting for it never adds more than 5 seconds to a shutdown.
-   A crash that kills the process outright can't post anything. The next online message then carries **"⚡ Revin după o pană de curent neprogramată."** so moderators know there was an outage.
-   Status messages never ping anyone. Leave `STATUS_CHANNEL_ID` empty to turn them off, for example on a development bot.

The phrases and the reasoning behind them are in [`docs/specs/2026-11-07-status-messages/`](docs/specs/2026-11-07-status-messages/requirements.md).

### 🧰 Other commands

Slash commands for moderators and members. See [Commands](#commands).

---

## Feature status

| Feature                                  | Status       |
| ---------------------------------------- | ------------ |
| Bot core, slash command loading, logging | ✅ Done      |
| `/ping`, `/eval`, `/reload`              | ✅ Done      |
| Rules message with ✅ verification       | 🗓️ Planned   |
| Join / leave announcements               | 🗓️ Planned   |
| Anti-spam with automatic kick            | 🗓️ Planned   |
| `/limits` (anti-spam thresholds)         | 🚧 Stub only |
| Online / offline status messages         | 🧪 Built, awaiting test-server acceptance |
| Persistent storage for settings          | 🗓️ Planned   |

---

## Requirements

-   [Node.js](https://nodejs.org) **22.12 or newer** (CI uses Node 22; the Vitest test runner needs at least 22.12)
-   Yarn 4, through [Corepack](https://nodejs.org/api/corepack.html) (ships with Node.js; see [Running locally](#running-locally))
-   A Discord application with a bot user (see below)
-   Permission to manage the target Discord server

---

## Setting up the bot in Discord

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create a **New Application**.
2. In **Bot**, create the bot and copy its **token**. Keep it secret: anyone with the token controls the bot.
3. Still in **Bot**, under **Privileged Gateway Intents**, enable:
    - **Server Members Intent**, needed for join and leave events.
    - **Message Content Intent**, needed to read messages for spam detection.
4. In **OAuth2 → URL Generator**, select the scopes `bot` and `applications.commands`, then these bot permissions:

    | Permission           | Why                                             |
    | -------------------- | ----------------------------------------------- |
    | View Channels        | See the channels it works in                    |
    | Send Messages        | Rules, announcements, status messages, command replies |
    | Embed Links          | Rich embeds for rules, logs and status messages |
    | Add Reactions        | Add the ✅ under the rules message              |
    | Read Message History | Find the existing rules message after a restart; spot an unplanned outage from the status channel |
    | Manage Roles         | Give and remove the verified member role        |
    | Manage Messages      | Delete spam messages                            |
    | Kick Members         | Kick spammers                                   |

5. Open the generated URL and add the bot to the server.
6. In **Server Settings → Roles**, drag the bot's role **above** the verified member role. Discord does not let a bot assign roles that sit higher than its own.

---

## Running locally

```bash
git clone https://github.com/TPN-Labs/Discord-Guard.git
```

```bash
cd Discord-Guard
```

Copy the example environment file **into `src/`**. The bot reads `src/.env`, not a file at the project root.

```bash
cp .env.example src/.env
```

Fill in `src/.env` (see [Configuration](#configuration)). This project uses [Yarn](https://yarnpkg.com/), pinned through the `packageManager` field in `package.json`. Turn on Corepack once so the right Yarn version is used:

```bash
corepack enable
```

Install the dependencies:

```bash
yarn install
```

Build and start:

```bash
yarn build
```

```bash
yarn start
```

Slash commands are registered with Discord when the bot starts. Global commands can take a few minutes to show up in the client the first time.

---

## Deploying with Coolify

The bot deploys with Coolify's **Nixpacks** build pack. The build plan lives in `nixpacks.toml`: Node 22, Yarn 4 through Corepack, `yarn install --immutable`, `yarn build`, then `node dist/index.js`. It also installs Python, gcc and make, which `@sapphire/type` (used by `/eval`) needs to compile its native module.

1. In the application's **General** settings, set **Build Pack** to **Nixpacks**. Leave the install, build and start commands empty: `nixpacks.toml` sets them.
2. In **Environment Variables**, add `DISCORD_TOKEN` and `OWNERS` (see [Configuration](#configuration)). Untick **Available at Buildtime** for both: the build does not need them, and build-time variables end up in the image. Coolify injects them into the container at runtime, so no `src/.env` file is needed.
3. The bot is a long-running process, not a website. It does not need a domain, and the Coolify healthcheck should stay off.
4. Deploy. The container log should end with the bot logging in.

---

## Troubleshooting

### `[TOKEN_INVALID]: An invalid token was provided.`

`DISCORD_TOKEN` in `src/.env` is missing or wrong. Check that the file is in `src/`, not the project root, and copy the token again from the Developer Portal (**Bot → Reset Token**).

### Owner-only commands say "This command can only be used by the owner."

Check `OWNERS` in `src/.env` (or in your host's environment variables): the IDs must be separated by single **spaces**. A comma-separated list such as `123,456` is read as one ID that matches nobody, so every owner is locked out. Tabs and line breaks are not separators either.

---

## Configuration

Settings live in `src/.env`. The file is ignored by git: never commit it.

| Variable        | Required | Description                                                                                                                                              |
| --------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN` | Yes      | The bot token from the Developer Portal.                                                                                                                 |
| `OWNERS`        | Yes      | Discord user IDs allowed to run owner-only commands, **separated by single spaces, not commas**. Example: `OWNERS=123456789012345678 234567890123456789` |
| `NODE_ENV`      | No       | `development` (default) or `production`. Changes the startup banner.                                                                                     |
| `STATUS_CHANNEL_ID` | No   | Channel ID for the online/offline status messages: a text or announcement channel. Empty turns them off (a warning is logged). A value that isn't a Discord ID (17-20 digits) stops start-up. |

To copy a user or channel ID, turn on **Developer Mode** in Discord (**User Settings → Advanced**), then right-click the user or channel and choose **Copy User ID** / **Copy Channel ID**.

Channel IDs, role IDs and anti-spam thresholds for the planned features will be added to this table as each feature lands.

---

## Commands

All commands are **slash commands**.

| Command                                   | Who can use it | What it does                                                                                                                   |
| ----------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `/ping`                                   | Everyone       | Checks the bot is alive and shows round-trip and heartbeat latency. Also available from a message's right-click **Apps** menu. |
| `/eval <code>`                            | Owners         | Runs JavaScript inside the bot process. For debugging only.                                                                    |
| `/reload <piece>`                         | Owners         | Reloads a command or listener without restarting. Can be unreliable for slash commands; restart if in doubt.                   |
| `/limits view`                            | Owners         | Lists the current anti-spam limits. _(not implemented yet)_                                                                    |
| `/limits add <action> <limit> <interval>` | Owners         | Sets how many times an action may happen in an interval before the member is kicked. _(not implemented yet)_                   |
| `/limits remove <limit>`                  | Owners         | Removes a limit. _(not implemented yet)_                                                                                       |

> ⚠️ `/eval` runs arbitrary code with the bot's token and permissions. Only put people you fully trust in `OWNERS`.

---

## Project structure

```
src/
├── index.ts               # Creates the Sapphire client and logs in
├── lib/
│   ├── setup.ts           # Loads src/.env and registers Sapphire plugins
│   ├── constants.ts
│   ├── env-parser.ts      # Reads OWNERS and STATUS_CHANNEL_ID
│   ├── status/            # Online/offline status messages: copy, decisions, shutdown hooks
│   └── utils.ts
├── commands/
│   ├── General/           # Commands for everyone (ping)
│   ├── Development/       # Owner tools (eval, reload)
│   └── Guardian/          # Moderation and anti-spam (limits)
├── listeners/             # Gateway event handlers (ready, statusOnline, command errors, ...)
└── preconditions/         # Command checks (OwnerOnly)
tests/                     # Vitest tests, mirroring src/ (e.g. tests/lib/env-parser.test.ts)
```

Sapphire loads every file in these folders automatically. To add a command or listener, drop a new file in the matching folder; nothing needs to be registered by hand.

New features are expected to land as:

-   `listeners/` handlers for `guildMemberAdd` / `guildMemberRemove` (announcements), `messageReactionAdd` / `messageReactionRemove` (verification) and `messageCreate` (anti-spam),
-   commands under `commands/Guardian/` for moderator controls.

---

## Development

| Script              | What it does                                    |
| ------------------- | ----------------------------------------------- |
| `yarn build`        | Compiles TypeScript from `src/` into `dist/`    |
| `yarn start`        | Runs the compiled bot from `dist/`              |
| `yarn dev`          | Builds, then starts                             |
| `yarn watch`        | Recompiles on every change                      |
| `yarn watch:start`  | Recompiles and restarts the bot on every change |
| `yarn test`         | Runs the Vitest test suite once                 |
| `yarn test:watch`   | Re-runs the tests on every change               |
| `yarn lint`         | Lints `src/` and `tests/` with ESLint           |
| `yarn check-types`  | Type-checks `src/` and `tests/` without emitting |
| `yarn format`       | Formats `src/`, `tests/` and `.github/` with Prettier |
| `yarn format:check` | Checks formatting without writing (CI runs it)  |

### Continuous integration

Every pull request to `main` runs these checks on GitHub-hosted runners, defined in `.github/workflows/ci.yml` and `.github/workflows/semantic_pr.yml`. They are ports of the shared TPN Labs workflows, kept in this repo because a public repository cannot call reusable workflows from a private one:

| Check                       | What it runs                                                                                                                  |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `ci / Quality: ESLint`      | `yarn lint`                                                                                                                   |
| `ci / Quality: TypeScript`  | `yarn check-types`                                                                                                            |
| `ci / Quality: Prettier`    | `yarn format:check` (not a required check yet)                                                                                |
| `ci / Build & Verify`       | `yarn test`, then `yarn build`, then checks that `dist/` was produced                                                         |
| `title / Validate PR title` | Title must be `<type>: <summary>` or `<type>(<scope>): <summary>`; `<type>` is `fix`, `feat`, `ci`, `docs`, `chore` or `test` |

Dependabot (`.github/dependabot.yml`) opens weekly pull requests for dependency updates through Yarn.

Tips:

-   Use a separate test server and a separate bot application for development, so experiments never kick real members.
-   The [Sapphire CLI](https://www.sapphirejs.dev/docs/Guide/CLI/introduction) (`yarn dlx @sapphire/cli generate command <name>`) reads `.sapphirerc.json` and scaffolds new pieces in the right folder.

---

## Contributing

The engineering rules for this repository are in [`CONSTITUTION.md`](CONSTITUTION.md), with day-to-day conventions in [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md), architecture in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and testing practice in [`docs/TESTING.md`](docs/TESTING.md). AI agents start from [`CLAUDE.md`](CLAUDE.md).

1. Open an issue first using the **Bug report** or **Feature request** template.
2. Create a branch from `main`.
3. Write the tests first (see [`docs/TESTING.md`](docs/TESTING.md)), then run `yarn format` and make sure `yarn lint`, `yarn check-types`, `yarn format:check`, `yarn test` and `yarn build` pass. CI runs the same checks (see [Continuous integration](#continuous-integration)).
4. Open a pull request that links the issue.

---

## License

[MIT](LICENSE.md). Based on [discord-bot-template](https://github.com/lorencerri/discord-bot-template) by lorencerri.
