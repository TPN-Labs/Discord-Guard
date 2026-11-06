### discord-bot-template

A basic TypeScript starter template for Discord bots built on [`@sapphiredev/framework`](https://github.com/sapphiredev/framework)

### JavaScript Version

An outdated, although functional JavaScript template is available on the _`javascript`_ branch. **Not recommended.**

### Database

_TODO_

### Getting Started

```bash
git clone https://github.com/lorencerri/discord-bot-template.git # Clone the repo
cd discord-bot-template # Enter the directory
copy .env.example ./src/.env # Copy the .env.example file into the src folder and rename it .env
nano .env # Fill in the .env file
corepack enable # Use the Yarn version pinned in package.json
yarn install # Install dependencies
yarn build # Build the bot
yarn start # Start the bot
```

### Checks

`yarn lint` (ESLint), `yarn check-types` (TypeScript) and `yarn build` run in CI on every pull request to `main`, through the shared workflows in [`TPN-Labs/GitHub-Actions`](https://github.com/TPN-Labs/GitHub-Actions). PR titles must follow `<type>: <summary>` or `<type>(<scope>): <summary>`, with `<type>` one of `fix`, `feat`, `ci`, `docs`, `chore`, `test`.

### Default Commands

> **NOTE:** These are all slash commands

-   eval
-   reload (**NOTE:** Reloading slash commands is typically buggy)
-   ping
