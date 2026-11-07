import { ChannelType, PermissionsBitField, type Channel } from 'discord.js';
import { describe, expect, it, vi } from 'vitest';
import { checkStatusChannelPermissions, describeDiscordError, resolveStatusChannel, type StatusChannelClient } from '../../../src/lib/status/channel';
import { discordApiError, FAKE_BOT_ID, FAKE_CHANNEL_ID, fakeChannel, STATUS_CHANNEL_PERMISSIONS } from '../../helpers/discord';

const { ViewChannel, SendMessages, EmbedLinks, ReadMessageHistory } = PermissionsBitField.Flags;

describe('checkStatusChannelPermissions', () => {
	it('reportsNothingMissingWithAllFourPermissions', () => {
		expect(checkStatusChannelPermissions(new PermissionsBitField(STATUS_CHANNEL_PERMISSIONS))).toEqual({ missing: [], canReadHistory: true });
	});

	it('treatsReadMessageHistoryAsOptional', () => {
		expect(checkStatusChannelPermissions(new PermissionsBitField([ViewChannel, SendMessages, EmbedLinks]))).toEqual({
			missing: [],
			canReadHistory: false
		});
	});

	it('namesEachMissingRequiredPermission', () => {
		expect(checkStatusChannelPermissions(new PermissionsBitField([ViewChannel, ReadMessageHistory])).missing).toEqual([
			'SendMessages',
			'EmbedLinks'
		]);
	});

	it('treatsUnknownPermissionsAsAllMissing', () => {
		expect(checkStatusChannelPermissions(null)).toEqual({ missing: ['ViewChannel', 'SendMessages', 'EmbedLinks'], canReadHistory: false });
	});
});

describe('describeDiscordError', () => {
	it.each([
		[10003, 'Unknown Channel', 'unknown channel'],
		[50001, 'Missing Access', 'missing access'],
		[50013, 'Missing Permissions', 'missing permissions']
	])('explainsDiscordErrorCode %i', (code, message, expected) => {
		const description = describeDiscordError(discordApiError(code, message));

		expect(description).toContain(expected);
		expect(description).toContain(String(code));
	});

	it('fallsBackToTheErrorMessageForOtherErrors', () => {
		expect(describeDiscordError(new Error('socket hang up'))).toBe('socket hang up');
	});

	it('describesNonErrorValues', () => {
		expect(describeDiscordError('weird')).toBe('weird');
	});
});

describe('resolveStatusChannel', () => {
	function clientReturning(result: () => Promise<unknown>): StatusChannelClient {
		return {
			channels: { fetch: vi.fn(result) },
			user: { id: FAKE_BOT_ID }
		} as unknown as StatusChannelClient;
	}

	it.each([ChannelType.GuildText, ChannelType.GuildAnnouncement])('acceptsAUsableChannelOfType %i', async (type) => {
		const channel = fakeChannel({ type });

		await expect(
			resolveStatusChannel(
				clientReturning(async () => channel),
				FAKE_CHANNEL_ID
			)
		).resolves.toEqual({
			ok: true,
			channel,
			canReadHistory: true
		});
	});

	it('reportsReadHistoryAccessSoOutageDetectionCanBeSkipped', async () => {
		const channel = fakeChannel({ permissions: [ViewChannel, SendMessages, EmbedLinks] });

		await expect(
			resolveStatusChannel(
				clientReturning(async () => channel),
				FAKE_CHANNEL_ID
			)
		).resolves.toMatchObject({ ok: true, canReadHistory: false });
	});

	it('refusesAChannelThatDoesNotExist', async () => {
		const result = await resolveStatusChannel(
			clientReturning(async () => null),
			FAKE_CHANNEL_ID
		);

		expect(result).toEqual({ ok: false, reason: expect.stringContaining('unknown channel') });
	});

	it.each([
		[10003, 'Unknown Channel', 'unknown channel'],
		[50001, 'Missing Access', 'missing access']
	])('refusesAChannelDiscordWillNotReturn (%i)', async (code, message, expected) => {
		const result = await resolveStatusChannel(
			clientReturning(() => Promise.reject(discordApiError(code, message))),
			FAKE_CHANNEL_ID
		);

		expect(result).toEqual({ ok: false, reason: expect.stringContaining(expected) });
	});

	it.each([
		['voice', ChannelType.GuildVoice],
		['category', ChannelType.GuildCategory],
		['forum', ChannelType.GuildForum],
		['thread', ChannelType.PublicThread],
		['DM', ChannelType.DM]
	])('refusesAChannelThatIsNotATextOrAnnouncementChannel (%s)', async (_name, type) => {
		const result = await resolveStatusChannel(
			clientReturning(async () => fakeChannel({ type })),
			FAKE_CHANNEL_ID
		);

		expect(result).toEqual({ ok: false, reason: expect.stringContaining('text or announcement channel') });
	});

	it('refusesAChannelWhereTheBotCannotSendEmbeds', async () => {
		const channel = fakeChannel({ permissions: [ViewChannel, SendMessages, ReadMessageHistory] });

		const result = await resolveStatusChannel(
			clientReturning(async () => channel as unknown as Channel),
			FAKE_CHANNEL_ID
		);

		expect(result).toEqual({ ok: false, reason: expect.stringContaining('EmbedLinks') });
	});
});
