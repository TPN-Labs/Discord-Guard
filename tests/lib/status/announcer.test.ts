import { PermissionsBitField, type APIEmbed } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StatusAnnouncer } from '../../../src/lib/status/announcer';
import type { StatusChannelClient } from '../../../src/lib/status/channel';
import { STATUS_TITLES, UNPLANNED_OUTAGE_LINE } from '../../../src/lib/status/copy';
import { StatusLifecycle } from '../../../src/lib/status/lifecycle';
import type { StatusMessagePayload } from '../../../src/lib/status/message';
import {
	discordApiError,
	FAKE_BOT_ID,
	FAKE_CHANNEL_ID,
	FAKE_MEMBER_ID,
	fakeLogger,
	fakeStatusChannel,
	type FakeStatusChannelOptions
} from '../../helpers/discord';

const { ViewChannel, SendMessages, EmbedLinks } = PermissionsBitField.Flags;
const NOW = new Date('2026-11-07T12:00:00.000Z');

function setup({
	channelId = FAKE_CHANNEL_ID as string | null,
	channel: channelOptions = {} as FakeStatusChannelOptions,
	fetchError = null as Error | null
} = {}) {
	const channel = fakeStatusChannel(channelOptions);
	const client = {
		channels: { fetch: vi.fn(async () => (fetchError ? Promise.reject(fetchError) : channel)) },
		user: { id: FAKE_BOT_ID }
	} as unknown as StatusChannelClient;
	const logger = fakeLogger();
	const announcer = new StatusAnnouncer({ channelId, lifecycle: new StatusLifecycle(), logger, random: () => 0, now: () => NOW });
	const context = { client: { destroy: vi.fn(async () => undefined) }, exit: vi.fn() };
	return { announcer, channel, client, logger, context };
}

function sentEmbeds(channel: ReturnType<typeof fakeStatusChannel>): APIEmbed[] {
	return channel.send.mock.calls.map((call) => (call as unknown as [StatusMessagePayload])[0].embeds[0].toJSON());
}

function logged(fn: ReturnType<typeof vi.fn>): string {
	return fn.mock.calls.map((call) => call.map(String).join(' ')).join('\n');
}

afterEach(() => {
	vi.useRealTimers();
});

describe('StatusAnnouncer.announceOnline', () => {
	it('postsOneOnlineMessageInTheStatusChannel', async () => {
		const { announcer, channel, client } = setup();

		await announcer.announceOnline(client);

		expect(channel.send).toHaveBeenCalledTimes(1);
		expect(channel.send).toHaveBeenCalledWith(expect.objectContaining({ allowedMentions: { parse: [] } }));
		expect(sentEmbeds(channel)[0]).toMatchObject({ title: STATUS_TITLES.online, description: 'Măi animalule, m-am întors!' });
	});

	it('postsNothingWhenReadyFiresASecondTime', async () => {
		const { announcer, channel, client } = setup();

		await announcer.announceOnline(client);
		await announcer.announceOnline(client);

		expect(channel.send).toHaveBeenCalledTimes(1);
	});

	it('addsTheOutageLineWhenTheLastStatusMessageWasOnline', async () => {
		const { announcer, channel, client } = setup({
			channel: {
				history: [
					{ authorId: FAKE_MEMBER_ID, title: null, createdTimestamp: 3 },
					{ authorId: FAKE_BOT_ID, title: STATUS_TITLES.offline, createdTimestamp: 1 },
					{ authorId: FAKE_BOT_ID, title: STATUS_TITLES.online, createdTimestamp: 2 }
				]
			}
		});

		await announcer.announceOnline(client);

		expect(channel.messages.fetch).toHaveBeenCalledWith({ limit: 100 });
		expect(sentEmbeds(channel)[0].description).toContain(UNPLANNED_OUTAGE_LINE);
	});

	it('leavesTheOutageLineOutWhenTheLastStatusMessageWasOffline', async () => {
		const { announcer, channel, client } = setup({
			channel: {
				history: [
					{ authorId: FAKE_BOT_ID, title: STATUS_TITLES.online, createdTimestamp: 1 },
					{ authorId: FAKE_BOT_ID, title: STATUS_TITLES.offline, createdTimestamp: 2 }
				]
			}
		});

		await announcer.announceOnline(client);

		expect(sentEmbeds(channel)[0].description).not.toContain(UNPLANNED_OUTAGE_LINE);
	});

	it('skipsOutageDetectionAndWarnsWithoutReadMessageHistory', async () => {
		const { announcer, channel, client, logger } = setup({ channel: { permissions: [ViewChannel, SendMessages, EmbedLinks] } });

		await announcer.announceOnline(client);

		expect(channel.messages.fetch).not.toHaveBeenCalled();
		expect(sentEmbeds(channel)[0].description).not.toContain(UNPLANNED_OUTAGE_LINE);
		expect(logged(logger.warn)).toMatch(new RegExp(`${FAKE_CHANNEL_ID}.*Read Message History`));
	});

	it('stillPostsWhenReadingHistoryFails', async () => {
		const { announcer, channel, client, logger } = setup({ channel: { history: discordApiError(50001, 'Missing Access') } });

		await announcer.announceOnline(client);

		expect(channel.send).toHaveBeenCalledTimes(1);
		expect(logged(logger.warn)).toContain('missing access');
	});

	it('staysQuietAndWarnsOnceWhenNoChannelIsConfigured', async () => {
		const { announcer, client, logger } = setup({ channelId: null });

		await announcer.announceOnline(client);

		expect(client.channels.fetch).not.toHaveBeenCalled();
		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(logged(logger.warn)).toContain('STATUS_CHANNEL_ID');
	});

	it('logsAnErrorAndPostsNothingWhenTheChannelIsUnusable', async () => {
		const { announcer, channel, client, logger } = setup({ fetchError: discordApiError(10003, 'Unknown Channel', 404) });

		await expect(announcer.announceOnline(client)).resolves.toBeUndefined();

		expect(channel.send).not.toHaveBeenCalled();
		expect(logged(logger.error)).toMatch(new RegExp(`${FAKE_CHANNEL_ID}.*unknown channel`));
	});

	it('logsAnErrorWhenDiscordRefusesTheOnlineMessage', async () => {
		const { announcer, client, logger } = setup({ channel: { send: () => Promise.reject(discordApiError(50013, 'Missing Permissions')) } });

		await expect(announcer.announceOnline(client)).resolves.toBeUndefined();

		expect(logged(logger.error)).toMatch(new RegExp(`${FAKE_CHANNEL_ID}.*missing permissions`));
	});
});

describe('StatusAnnouncer.shutdown', () => {
	async function onlineSetup(options: Parameters<typeof setup>[0] = {}) {
		const result = setup(options);
		await result.announcer.announceOnline(result.client);
		result.channel.send.mockClear();
		return result;
	}

	it('postsOneOfflineMessageThenClosesTheGatewayAndExitsZero', async () => {
		const { announcer, channel, context } = await onlineSetup();

		await announcer.shutdown('SIGTERM', undefined, context);

		expect(sentEmbeds(channel)).toEqual([expect.objectContaining({ title: STATUS_TITLES.offline, description: expect.any(String) })]);
		expect(channel.send.mock.invocationCallOrder[0]).toBeLessThan(context.client.destroy.mock.invocationCallOrder[0]);
		expect(context.exit).toHaveBeenCalledExactlyOnceWith(0);
	});

	it('logsTheErrorInFullThenPostsOfflineAndExitsOne', async () => {
		const { announcer, channel, context, logger } = await onlineSetup();
		const error = new Error('boom');

		await announcer.shutdown('uncaughtException', error, context);

		expect(logger.fatal).toHaveBeenCalledWith(expect.any(String), error);
		expect(channel.send).toHaveBeenCalledTimes(1);
		expect(context.exit).toHaveBeenCalledExactlyOnceWith(1);
	});

	it('postsNoOfflineMessageWhenTheOnlineMessageWasNeverPosted', async () => {
		const { announcer, channel, context } = setup();

		await announcer.shutdown('SIGTERM', undefined, context);

		expect(channel.send).not.toHaveBeenCalled();
		expect(context.client.destroy).toHaveBeenCalled();
		expect(context.exit).toHaveBeenCalledExactlyOnceWith(0);
	});

	it('postsNoOfflineMessageWhenDiscordRefusedTheOnlineMessage', async () => {
		const { announcer, channel, client, context } = setup({
			channel: { send: () => Promise.reject(discordApiError(50013, 'Missing Permissions')) }
		});
		await announcer.announceOnline(client);
		channel.send.mockClear();

		await announcer.shutdown('SIGTERM', undefined, context);

		expect(channel.send).not.toHaveBeenCalled();
	});

	it('postsOneOfflineMessageWhenTwoStopTriggersArrive', async () => {
		const { announcer, channel, context, logger } = await onlineSetup();

		await Promise.all([announcer.shutdown('SIGTERM', undefined, context), announcer.shutdown('SIGINT', undefined, context)]);

		expect(channel.send).toHaveBeenCalledTimes(1);
		expect(context.exit).toHaveBeenCalledExactlyOnceWith(0);
		expect(logged(logger.warn)).toContain('SIGINT');
	});

	it('stillLogsAnErrorThatArrivesDuringShutdown', async () => {
		const { announcer, context, logger } = await onlineSetup();
		const error = new Error('late failure');

		await Promise.all([announcer.shutdown('SIGTERM', undefined, context), announcer.shutdown('uncaughtException', error, context)]);

		expect(logger.fatal).toHaveBeenCalledWith(expect.any(String), error);
	});

	it('givesUpAfterFiveSecondsWhenDiscordHangs', async () => {
		const { announcer, channel, context, logger } = await onlineSetup();
		vi.useFakeTimers();
		channel.send.mockImplementation(() => new Promise(() => undefined));

		const done = announcer.shutdown('SIGTERM', undefined, context);
		await vi.advanceTimersByTimeAsync(4_999);
		expect(context.exit).not.toHaveBeenCalled();

		await vi.advanceTimersByTimeAsync(1);
		await done;
		expect(context.exit).toHaveBeenCalledExactlyOnceWith(0);
		expect(logged(logger.error)).toContain('5000 ms');

		await vi.advanceTimersByTimeAsync(10_000);
		expect(context.exit).toHaveBeenCalledTimes(1);
	});

	it('closesTheGatewayAndExitsWhenTheOfflineMessageIsRefused', async () => {
		const { announcer, channel, context, logger } = await onlineSetup();
		channel.send.mockImplementation(() => Promise.reject(discordApiError(50013, 'Missing Permissions')));

		await announcer.shutdown('SIGTERM', undefined, context);

		expect(logged(logger.error)).toMatch(new RegExp(`${FAKE_CHANNEL_ID}.*missing permissions`));
		expect(context.client.destroy).toHaveBeenCalled();
		expect(context.exit).toHaveBeenCalledExactlyOnceWith(0);
	});
});

describe('StatusAnnouncer secrets', () => {
	it('neverLogsTheBotToken', async () => {
		const token = 'FAKE.TOKEN.never-a-real-one';
		vi.stubEnv('DISCORD_TOKEN', token);
		const loggers = [] as ReturnType<typeof fakeLogger>[];

		const unset = setup({ channelId: null });
		await unset.announcer.announceOnline(unset.client);
		loggers.push(unset.logger);

		const unusable = setup({ fetchError: discordApiError(50001, 'Missing Access') });
		await unusable.announcer.announceOnline(unusable.client);
		loggers.push(unusable.logger);

		const refused = setup({
			channel: { send: () => Promise.reject(discordApiError(50013, 'Missing Permissions')), history: new Error('history') }
		});
		await refused.announcer.announceOnline(refused.client);
		await refused.announcer.shutdown('uncaughtException', new Error('boom'), refused.context);
		loggers.push(refused.logger);

		const all = loggers.flatMap((logger) => [logger.info, logger.warn, logger.error, logger.fatal].map(logged)).join('\n');
		expect(all.length).toBeGreaterThan(0);
		expect(all).not.toContain(token);
	});
});
