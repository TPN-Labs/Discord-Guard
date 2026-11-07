import { ChannelType, PermissionsBitField, RESTJSONErrorCodes, type APIEmbed } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { MemberAnnouncer, type AnnouncedMember, type AnnouncementClient } from '../../../src/lib/announcements/announcer';
import type { JoinAnnouncementPayload } from '../../../src/lib/announcements/message';
import {
	discordApiError,
	FAKE_CHANNEL_ID,
	FAKE_GUILD_ID,
	FAKE_MEMBER_ID,
	FAKE_RULES_CHANNEL_ID,
	fakeAnnouncementsChannel,
	fakeAnnouncementsClient,
	fakeLogger,
	fakeMember,
	type FakeAnnouncementsChannelOptions,
	type FakeMemberOptions
} from '../../helpers/discord';

const { ViewChannel, SendMessages } = PermissionsBitField.Flags;
const NOW = new Date('2026-11-07T12:00:00.000Z');
const OTHER_GUILD_ID = '678901234567890123';
const FAKE_TOKEN = 'fake-token.never-a-real-one.0000000000';

function setup({
	channelId = FAKE_CHANNEL_ID as string | null,
	rulesChannelId = FAKE_RULES_CHANNEL_ID as string | null,
	channel: channelOptions = {} as FakeAnnouncementsChannelOptions,
	resolved = 'channel' as 'channel' | 'null'
} = {}) {
	const channel = fakeAnnouncementsChannel(channelOptions);
	const client = fakeAnnouncementsClient(resolved === 'null' ? null : channel);
	const logger = fakeLogger();
	const announcer = new MemberAnnouncer({ channelId, rulesChannelId, logger, now: () => NOW });
	const member = (options: FakeMemberOptions = {}) => fakeMember(client, options) as unknown as AnnouncedMember;
	return { announcer, channel, client: client as unknown as AnnouncementClient, logger, member };
}

function sent(channel: ReturnType<typeof fakeAnnouncementsChannel>): { content?: string; embed: APIEmbed; allowedMentions: unknown }[] {
	return channel.send.mock.calls.map((call) => {
		const payload = (call as unknown as [JoinAnnouncementPayload])[0];
		return { content: payload.content, embed: payload.embeds[0].toJSON(), allowedMentions: payload.allowedMentions };
	});
}

function logged(fn: ReturnType<typeof vi.fn>): string {
	return fn.mock.calls.map((call) => call.map(String).join(' ')).join('\n');
}

describe('MemberAnnouncer.prepare', () => {
	it('warnsOnceThatAnnouncementsAreOffWhenNoChannelIsConfigured', async () => {
		const { announcer, client, logger } = setup({ channelId: null });

		await announcer.prepare(client);

		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(logged(logger.warn)).toContain('ANNOUNCEMENTS_CHANNEL_ID');
		expect(client.channels.fetch).not.toHaveBeenCalled();
	});

	it('fetchesTheMemberListOfTheAnnouncementsChannelsServer', async () => {
		const { announcer, channel, client, logger } = setup({ channel: { members: 42 } });

		await announcer.prepare(client);

		expect(channel.guild.members.fetch).toHaveBeenCalledTimes(1);
		expect(logged(logger.info)).toContain(FAKE_GUILD_ID);
		expect(logged(logger.info)).toContain('42');
	});

	it('logsAnErrorAndFetchesNoMembersWhenTheChannelIsUnusable', async () => {
		const { announcer, channel, client, logger } = setup({ resolved: 'null' });

		await announcer.prepare(client);

		expect(logged(logger.error)).toContain(FAKE_CHANNEL_ID);
		expect(channel.guild.members.fetch).not.toHaveBeenCalled();
	});

	it('warnsAndCarriesOnWhenTheMemberListCannotBeFetched', async () => {
		const { announcer, client, logger } = setup({ channel: { members: new Error('Members didn’t arrive in time.') } });

		await expect(announcer.prepare(client)).resolves.toBeUndefined();

		expect(logged(logger.warn)).toContain('Members didn’t arrive in time.');
	});
});

describe('MemberAnnouncer.announceJoin', () => {
	it('postsOneJoinAnnouncementThatPingsOnlyTheNewMember', async () => {
		const { announcer, channel, member } = setup();

		await announcer.announceJoin(member());

		expect(channel.send).toHaveBeenCalledTimes(1);
		const [{ content, embed, allowedMentions }] = sent(channel);
		expect(content).toBe(`<@${FAKE_MEMBER_ID}>`);
		expect(allowedMentions).toEqual({ parse: [], users: [FAKE_MEMBER_ID] });
		expect(embed).toMatchObject({ title: '👋 Avem un tovarăș nou', timestamp: NOW.toISOString() });
		expect(embed.description).toContain(`<#${FAKE_RULES_CHANNEL_ID}>`);
	});

	it('leavesTheRulesLineOutWhenNoRulesChannelIsConfigured', async () => {
		const { announcer, channel, member } = setup({ rulesChannelId: null });

		await announcer.announceJoin(member());

		expect(sent(channel)[0].embed.description).not.toContain('📜');
	});

	it('announcesAMemberWhoRejoinsEveryTime', async () => {
		const { announcer, channel, member } = setup();

		await announcer.announceJoin(member());
		await announcer.announceJoin(member());

		expect(channel.send).toHaveBeenCalledTimes(2);
	});

	it('doesNothingWhenAnnouncementsAreOff', async () => {
		const { announcer, client, logger, member } = setup({ channelId: null });

		await announcer.announceJoin(member());

		expect(client.channels.fetch).not.toHaveBeenCalled();
		expect(logger.warn).not.toHaveBeenCalled();
	});

	it('skipsBotAccountsWithoutCallingDiscord', async () => {
		const { announcer, client, member } = setup();

		await announcer.announceJoin(member({ bot: true }));

		expect(client.channels.fetch).not.toHaveBeenCalled();
	});

	it('ignoresJoinsInAnotherServer', async () => {
		const { announcer, channel, member } = setup();

		await announcer.announceJoin(member({ guildId: OTHER_GUILD_ID }));

		expect(channel.send).not.toHaveBeenCalled();
	});

	it('logsTheChannelReasonAndMemberWhenTheChannelIsUnusable', async () => {
		const { announcer, channel, logger, member } = setup({ channel: { permissions: [ViewChannel, SendMessages] } });

		await expect(announcer.announceJoin(member())).resolves.toBeUndefined();

		expect(channel.send).not.toHaveBeenCalled();
		const error = logged(logger.error);
		expect(error).toContain(FAKE_CHANNEL_ID);
		expect(error).toContain('EmbedLinks');
		expect(error).toContain(FAKE_MEMBER_ID);
	});

	it('logsTheDiscordErrorWithoutRetryingWhenTheSendIsRefused', async () => {
		const { announcer, channel, logger, member } = setup({
			channel: { send: async () => Promise.reject(discordApiError(RESTJSONErrorCodes.MissingPermissions, 'Missing Permissions')) }
		});

		await expect(announcer.announceJoin(member())).resolves.toBeUndefined();

		expect(channel.send).toHaveBeenCalledTimes(1);
		expect(logged(logger.error)).toContain('missing permissions');
		expect(logged(logger.error)).toContain(FAKE_MEMBER_ID);
	});

	it('refusesAVoiceChannelAsTheAnnouncementsChannel', async () => {
		const { announcer, channel, logger, member } = setup({ channel: { type: ChannelType.GuildVoice } });

		await announcer.announceJoin(member());

		expect(channel.send).not.toHaveBeenCalled();
		expect(logged(logger.error)).toContain('GuildVoice');
	});
});

describe('MemberAnnouncer.announceLeave', () => {
	it('postsOneLeaveAnnouncementWithTheNameAndHowLongTheyStayed', async () => {
		const { announcer, channel, member } = setup();

		await announcer.announceLeave(member({ displayName: 'Ion', username: 'ion1930', joinedAt: new Date('2026-11-04T08:00:00.000Z') }));

		expect(channel.send).toHaveBeenCalledTimes(1);
		const [{ content, embed, allowedMentions }] = sent(channel);
		expect(content).toBeUndefined();
		expect(allowedMentions).toEqual({ parse: [] });
		expect(embed.description).toBe('**Ion** (ion1930) a sărit gardul ambasadei. Drum bun în Occident!\n\n⏳ A stat cu noi 3 zile și 4 ore.');
	});

	it('stillAnnouncesAPartialMemberAndLeavesTheDurationOut', async () => {
		const { announcer, channel, member } = setup();

		await announcer.announceLeave(member({ joinedAt: null }));

		expect(channel.send).toHaveBeenCalledTimes(1);
		expect(sent(channel)[0].embed.description).not.toContain('⏳');
	});

	it('skipsBotAccountsWithoutCallingDiscord', async () => {
		const { announcer, client, member } = setup();

		await announcer.announceLeave(member({ bot: true }));

		expect(client.channels.fetch).not.toHaveBeenCalled();
	});

	it('ignoresLeavesInAnotherServer', async () => {
		const { announcer, channel, member } = setup();

		await announcer.announceLeave(member({ guildId: OTHER_GUILD_ID }));

		expect(channel.send).not.toHaveBeenCalled();
	});

	it('logsTheDiscordErrorWhenTheSendFails', async () => {
		const { announcer, logger, member } = setup({ channel: { send: async () => Promise.reject(new Error('socket hang up')) } });

		await expect(announcer.announceLeave(member())).resolves.toBeUndefined();

		expect(logged(logger.error)).toContain('socket hang up');
		expect(logged(logger.error)).toContain(FAKE_MEMBER_ID);
	});
});

describe('MemberAnnouncer secrets', () => {
	it('neverLogsTheBotToken', async () => {
		vi.stubEnv('DISCORD_TOKEN', FAKE_TOKEN);
		const runs = [
			setup({ channelId: null }),
			setup({ resolved: 'null' }),
			setup({ channel: { members: new Error('timeout') } }),
			setup({ channel: { send: async () => Promise.reject(new Error('socket hang up')) } }),
			setup()
		];

		for (const { announcer, client, member } of runs) {
			await announcer.prepare(client);
			await announcer.announceJoin(member());
			await announcer.announceLeave(member({ joinedAt: NOW }));
		}

		for (const { logger } of runs) {
			for (const fn of [logger.info, logger.warn, logger.error]) expect(logged(fn)).not.toContain(FAKE_TOKEN);
		}
	});
});
