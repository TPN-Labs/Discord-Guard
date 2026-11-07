import { ChannelType, Collection, DiscordAPIError, PermissionsBitField, type PermissionResolvable } from 'discord.js';
import { vi } from 'vitest';

/** Fake snowflakes, never real ones (CLAUDE.md, Discord safety). */
export const FAKE_BOT_ID = '123456789012345678';
export const FAKE_CHANNEL_ID = '234567890123456789';
export const FAKE_MEMBER_ID = '345678901234567890';

export const STATUS_CHANNEL_PERMISSIONS: PermissionResolvable[] = [
	PermissionsBitField.Flags.ViewChannel,
	PermissionsBitField.Flags.SendMessages,
	PermissionsBitField.Flags.EmbedLinks,
	PermissionsBitField.Flags.ReadMessageHistory
];

/** A DiscordAPIError as discord.js would throw it for the given JSON error code. */
export function discordApiError(code: number, message: string, status = 403): DiscordAPIError {
	return new DiscordAPIError({ code, message }, code, status, 'GET', `https://discord.com/api/v10/channels/${FAKE_CHANNEL_ID}`, {
		body: undefined,
		files: undefined
	});
}

export interface FakeChannelOptions {
	type?: ChannelType;
	permissions?: PermissionResolvable[] | null;
}

/** The parts of a guild channel the status feature touches. */
export function fakeChannel({ type = ChannelType.GuildText, permissions = STATUS_CHANNEL_PERMISSIONS }: FakeChannelOptions = {}) {
	return {
		id: FAKE_CHANNEL_ID,
		type,
		permissionsFor: () => (permissions === null ? null : new PermissionsBitField(permissions))
	};
}

export interface FakeHistoryMessage {
	authorId: string;
	title: string | null;
	createdTimestamp: number;
}

export interface FakeStatusChannelOptions extends FakeChannelOptions {
	history?: FakeHistoryMessage[] | Error;
	send?: () => Promise<unknown>;
}

/** A status channel with history and send, recording what the bot did to it. */
export function fakeStatusChannel({ history = [], send = async () => ({}), ...channelOptions }: FakeStatusChannelOptions = {}) {
	return {
		...fakeChannel(channelOptions),
		messages: {
			fetch: vi.fn(async () => {
				if (history instanceof Error) throw history;
				return new Collection(
					history.map((message, index) => [
						String(index),
						{ author: { id: message.authorId }, embeds: [{ title: message.title }], createdTimestamp: message.createdTimestamp }
					])
				);
			})
		},
		send: vi.fn(send)
	};
}

export function fakeLogger() {
	return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() };
}

export const FAKE_GUILD_ID = '456789012345678901';
export const FAKE_RULES_CHANNEL_ID = '567890123456789012';

export interface FakeAnnouncementsChannelOptions extends FakeStatusChannelOptions {
	guildId?: string;
	/** What guild.members.fetch() does at start-up; an Error rejects. */
	members?: number | Error;
}

/** An announcements channel: a status-style channel that also belongs to a guild whose members can be fetched. */
export function fakeAnnouncementsChannel({ guildId = FAKE_GUILD_ID, members = 3, ...channelOptions }: FakeAnnouncementsChannelOptions = {}) {
	return {
		...fakeStatusChannel(channelOptions),
		guildId,
		guild: {
			id: guildId,
			members: {
				fetch: vi.fn(async () => {
					if (members instanceof Error) throw members;
					return new Collection(Array.from({ length: members }, (_, index) => [String(index), {}]));
				})
			}
		}
	};
}

/** A client whose channel cache answers with the given channel (or rejects with the given error). */
export function fakeAnnouncementsClient(channel: unknown, fetchError: Error | null = null) {
	return {
		channels: { fetch: vi.fn(async () => (fetchError ? Promise.reject(fetchError) : channel)) },
		user: { id: FAKE_BOT_ID }
	};
}

export interface FakeMemberOptions {
	bot?: boolean;
	guildId?: string;
	displayName?: string;
	username?: string;
	joinedAt?: Date | null;
}

/** The parts of a GuildMember (or a partial one) the announcements feature reads. */
export function fakeMember(
	client: unknown,
	{ bot = false, guildId = FAKE_GUILD_ID, displayName = 'Ion', username = 'ion1930', joinedAt = null }: FakeMemberOptions = {}
) {
	return {
		id: FAKE_MEMBER_ID,
		guild: { id: guildId },
		user: { bot, username },
		displayName,
		joinedAt,
		client,
		displayAvatarURL: () => 'https://cdn.discordapp.com/embed/avatars/0.png'
	};
}
