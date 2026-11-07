import './lib/setup';
import { container, LogLevel, SapphireClient } from '@sapphire/framework';
import { GatewayIntentBits, Partials } from 'discord.js';
import { MemberAnnouncer } from './lib/announcements/announcer';
import { envParseOptionalSnowflake } from './lib/env-parser';
import { StatusAnnouncer } from './lib/status/announcer';
import { StatusLifecycle } from './lib/status/lifecycle';
import { registerShutdownHooks } from './lib/status/shutdown';

// Parsed before anything else so a malformed value stops start-up with an [ENV] error.
const statusChannelId = envParseOptionalSnowflake('STATUS_CHANNEL_ID');
const announcementsChannelId = envParseOptionalSnowflake('ANNOUNCEMENTS_CHANNEL_ID');
const rulesChannelId = envParseOptionalSnowflake('RULES_CHANNEL_ID');

const client = new SapphireClient({
	defaultPrefix: '!',
	regexPrefix: /^(hey +)?bot[,! ]/i,
	caseInsensitiveCommands: true,
	logger: {
		level: LogLevel.Debug
	},
	shards: 'auto',
	intents: [
		GatewayIntentBits.Guilds,
		GatewayIntentBits.GuildMembers,
		GatewayIntentBits.GuildModeration, // formerly GUILD_BANS
		GatewayIntentBits.GuildExpressions, // formerly GUILD_EMOJIS_AND_STICKERS
		GatewayIntentBits.GuildVoiceStates,
		GatewayIntentBits.GuildMessages,
		GatewayIntentBits.GuildMessageReactions,
		GatewayIntentBits.DirectMessages,
		GatewayIntentBits.DirectMessageReactions
	],
	// Without it, a member the bot never cached (joined before the last restart) leaves without a guildMemberRemove event.
	partials: [Partials.GuildMember]
});

container.memberAnnouncer = new MemberAnnouncer({ channelId: announcementsChannelId, rulesChannelId, logger: container.logger });
container.statusAnnouncer = new StatusAnnouncer({ channelId: statusChannelId, lifecycle: new StatusLifecycle(), logger: container.logger });

// Posts the offline status message, closes the gateway and exits, within SHUTDOWN_DEADLINE_MS.
registerShutdownHooks(process, (trigger, error) => {
	void container.statusAnnouncer.shutdown(trigger, error, { client, exit: (code) => process.exit(code) });
});

const main = async () => {
	try {
		client.logger.info('Logging in');
		await client.login();
		client.logger.info('logged in');
	} catch (error) {
		client.logger.fatal(error);
		client.destroy();
		process.exit(1);
	}
};

main();
