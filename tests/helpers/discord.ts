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
