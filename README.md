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

This project uses [Yarn](https://yarnpkg.com/) (version pinned via `packageManager` in `package.json`). Do not use `npm install`; commit changes to `yarn.lock` instead.

### Default Commands

> **NOTE:** These are all slash commands

-   eval
-   reload (**NOTE:** Reloading slash commands is typically buggy)
-   ping
