import { RESTJSONErrorCodes, type APIEmbed } from 'discord.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SpamGuard, type GuardedMessage } from '../../../src/lib/antispam/guard';
import type { KickLogPayload } from '../../../src/lib/antispam/kick-log';
import {
	discordApiError,
	FAKE_CHANNEL_ID,
	FAKE_MEMBER_ID,
	FAKE_OWNER_ID,
	fakeAnnouncementsChannel,
	fakeGuardClient,
	fakeGuardMember,
	fakeGuardMessage,
	fakeLogger,
	fakeTextChannel,
	type FakeAnnouncementsChannelOptions,
	type FakeGuardMemberOptions
} from '../../helpers/discord';

const CH_A = '111111111111111111';
const CH_B = '222222222222222222';
const CH_C = '333333333333333333';
const CH_D = '444444444444444444';
const OTHER_GUILD_ID = '567890123456789012';
const T0 = 1_800_000_000_000;
const FAKE_TOKEN = 'fake-token.never-a-real-one.0000000000';

function setup({
	logChannelId = FAKE_CHANNEL_ID as string | null,
	logChannel: logChannelOptions = {} as FakeAnnouncementsChannelOptions,
	bulkDelete = {} as Record<string, (ids: string[]) => Promise<unknown>>,
	missingChannels = [] as string[],
	dmTimeoutMs = 3_000,
	callTimeoutMs = 10_000,
	enforcementDeadlineMs = 30_000
} = {}) {
	const order: string[] = [];
	const textChannels = Object.fromEntries(
		[CH_A, CH_B, CH_C, CH_D].map((id) => [
			id,
			fakeTextChannel(id, async (ids) => {
				order.push(`delete ${id}`);
				return (bulkDelete[id] ?? (async () => ({})))(ids);
			})
		])
	);
	const logChannel = fakeAnnouncementsChannel({
		send: async () => {
			order.push('kick log');
			return {};
		},
		...logChannelOptions
	});
	const channels: Record<string, unknown> = { ...textChannels, [FAKE_CHANNEL_ID]: logChannel };
	for (const id of missingChannels) delete channels[id];
	const client = fakeGuardClient(channels);
	const logger = { ...fakeLogger(), debug: vi.fn() };
	const clock = { now: T0 };
	const guard = new SpamGuard({
		ownerIds: [FAKE_OWNER_ID],
		logChannelId,
		logger,
		now: () => clock.now,
		dmTimeoutMs,
		callTimeoutMs,
		enforcementDeadlineMs
	});

	const member = (options: FakeGuardMemberOptions = {}) =>
		fakeGuardMember({
			kick: async () => {
				order.push('kick');
				return {};
			},
			send: async () => {
				order.push('dm');
				return {};
			},
			...options
		});

	/** Posts a message `at` ms after T0 and lets the guard see it. */
	const post = (channelId: string, at: number, options: Partial<Parameters<typeof fakeGuardMessage>[1]> = {}) => {
		clock.now = T0 + at;
		const message = fakeGuardMessage(client, { channelId, createdTimestamp: T0 + at, ...options });
		guard.handleMessage(message as unknown as GuardedMessage);
		return message;
	};

	/** The three-channels-in-a-minute spam, from one member. */
	const spam = (spammer = member(), start = 0, content = 'free nitro https://free-nitro.ru/claim') =>
		[CH_A, CH_B, CH_C].map((channelId, i) => post(channelId, start + i * 1_000, { member: spammer, content }));

	const done = () => vi.waitFor(() => expect(logged(logger.info)).toContain('Enforced against'));

	return { guard, client, logger, logChannel, textChannels, order, clock, member, post, spam, done };
}

/** A promise the test settles by hand. */
function deferred<T = unknown>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((res) => {
		resolve = res;
	});
	return { promise, resolve };
}

const never = () => new Promise<never>(() => undefined);

function logged(fn: ReturnType<typeof vi.fn>): string {
	return fn.mock.calls.map((call) => call.map(String).join(' ')).join('\n');
}

function kickLogs(channel: ReturnType<typeof fakeAnnouncementsChannel>): APIEmbed[] {
	return channel.send.mock.calls.map((call) => (call as unknown as [KickLogPayload])[0].embeds[0].toJSON());
}

afterEach(() => {
	vi.useRealTimers();
});

describe('SpamGuard - enforcement', () => {
	it('dmsKicksDeletesAndLogsInThatOrderWhenAMemberPostsInThreeChannels', async () => {
		const { order, spam, done } = setup();

		spam();
		await done();

		expect(order).toEqual(['dm', 'kick', `delete ${CH_A}`, `delete ${CH_B}`, `delete ${CH_C}`, 'kick log']);
	});

	it('sendsTheApprovedDmPingingNobody', async () => {
		const { member, spam, done } = setup();
		const spammer = member();

		spam(spammer, 0, 'salut tovarăși'); // no link, so only the cross-channel rule fires, on the third message
		await done();

		expect(spammer.send).toHaveBeenCalledWith({
			content:
				'Tovarășe, ai fost scos din **Serverul de test** pentru spam (mesaje în 3 canale într-un minut). Poți reveni oricând cu o invitație, dar lasă propaganda acasă.',
			allowedMentions: { parse: [] }
		});
	});

	it('kicksWithTheRuleNamesAsTheAuditLogReason', async () => {
		const { member, spam, done } = setup();
		const spammer = member();

		spam(spammer, 0, 'salut tovarăși');
		await done();

		expect(spammer.kick).toHaveBeenCalledWith('Anti-spam: mesaje în 3 canale într-un minut');
	});

	it('deletesEveryTrackedMessageFromTheLastTenMinutesGroupedByChannel', async () => {
		const { member, post, textChannels, done } = setup();
		const spammer = member();
		const early = post(CH_A, 0, { member: spammer }); // 9 minutes before the spam: still tracked
		const spamMessages = [CH_A, CH_B, CH_C].map((channelId, i) => post(channelId, 540_000 + i * 1_000, { member: spammer }));

		await done();

		expect(textChannels[CH_A].bulkDelete).toHaveBeenCalledWith([early.id, spamMessages[0].id]);
		expect(textChannels[CH_B].bulkDelete).toHaveBeenCalledWith([spamMessages[1].id]);
		expect(textChannels[CH_C].bulkDelete).toHaveBeenCalledWith([spamMessages[2].id]);
	});

	it('neverDeletesAMessageOlderThanTenMinutes', async () => {
		const { member, post, textChannels, done } = setup();
		const spammer = member();
		post(CH_D, 0, { member: spammer });
		[CH_A, CH_B, CH_C].map((channelId, i) => post(channelId, 600_000 + i * 1_000, { member: spammer }));

		await done();

		expect(textChannels[CH_D].bulkDelete).not.toHaveBeenCalled();
	});

	it('firesLinkSpreadOnTheSecondChannelBeforeCrossChannelIsReached', async () => {
		const { member, spam, done } = setup();
		const spammer = member();

		spam(spammer); // a link in each message: two channels are enough (AC-05), and AC-06 reports the rules of that message
		await done();

		expect(spammer.kick).toHaveBeenCalledWith('Anti-spam: linkuri în 2 canale într-un minut');
	});

	it('postsOneKickLogWithCensoredLinks', async () => {
		const { logChannel, spam, done } = setup();

		spam();
		await done();

		const [embed, ...more] = kickLogs(logChannel);
		expect(more).toHaveLength(0);
		expect(embed.title).toBe('🛡️ Agitator scos din server');
		expect(embed.description).toContain(`<#${CH_A}> free nitro free-nitro`);
		expect(embed.description).not.toContain('free-nitro.ru');
		expect(embed.description).toContain('👢 Dat afară.');
		expect(embed.description).toContain('🧹 Mesaje șterse: 3 din 3.');
	});

	it('enforcesOnceAndDeletesMessagesPostedWhileTheKickWasInProgress', async () => {
		let releaseKick!: () => void;
		const { member, post, textChannels, done } = setup();
		const spammer = member({ kick: () => new Promise((resolve) => (releaseKick = () => resolve({}))) });
		const spamMessages = [CH_A, CH_B, CH_C].map((channelId, i) => post(channelId, i * 1_000, { member: spammer }));
		await vi.waitFor(() => expect(spammer.kick).toHaveBeenCalledTimes(1));

		const late = post(CH_D, 3_500, { member: spammer });
		post(CH_A, 3_600, { member: spammer, content: 'more' });
		releaseKick();
		await done();

		expect(spammer.kick).toHaveBeenCalledTimes(1);
		expect(spammer.send).toHaveBeenCalledTimes(1);
		expect(textChannels[CH_D].bulkDelete).toHaveBeenCalledWith([late.id]);
		expect(textChannels[CH_A].bulkDelete.mock.calls[0][0]).toHaveLength(2);
		expect(spamMessages).toHaveLength(3);
	});

	it('doesNothingBelowAnyThreshold', async () => {
		const { member, post, logChannel } = setup();
		const chatter = member();
		post(CH_A, 0, { member: chatter });
		post(CH_B, 30_000, { member: chatter });
		post(CH_C, 120_000, { member: chatter });

		await new Promise((resolve) => setImmediate(resolve));

		expect(chatter.kick).not.toHaveBeenCalled();
		expect(logChannel.send).not.toHaveBeenCalled();
	});
});

describe('SpamGuard - who is checked', () => {
	it('neverKicksAModeratorWithManageMessages', async () => {
		const { member, post } = setup();
		const moderator = member({ manageMessages: true });
		for (let i = 0; i < 10; i++) post([CH_A, CH_B, CH_C, CH_D][i % 4], i * 100, { member: moderator, content: 'https://x.ro @everyone' });

		await new Promise((resolve) => setImmediate(resolve));

		expect(moderator.kick).not.toHaveBeenCalled();
		expect(moderator.send).not.toHaveBeenCalled();
	});

	it('neverKicksAnOwner', async () => {
		const { member, spam } = setup();
		const owner = member({ id: FAKE_OWNER_ID });

		spam(owner);
		await new Promise((resolve) => setImmediate(resolve));

		expect(owner.kick).not.toHaveBeenCalled();
	});

	it('ignoresWebhookMessagesDirectMessagesAndSystemMessages', async () => {
		const { member, post } = setup();
		const someone = member();
		[CH_A, CH_B, CH_C].forEach((channelId, i) => post(channelId, i, { member: someone, webhookId: '999999999999999999' }));
		[CH_A, CH_B, CH_C].forEach((channelId, i) => post(channelId, 10 + i, { member: someone, guildId: null }));
		[CH_A, CH_B, CH_C].forEach((channelId, i) => post(channelId, 20 + i, { member: someone, system: true }));

		await new Promise((resolve) => setImmediate(resolve));

		expect(someone.kick).not.toHaveBeenCalled();
	});

	it('warnsOnceAndIgnoresAGuildMessageWithoutAMember', async () => {
		const { logger, post } = setup();
		[CH_A, CH_B, CH_C, CH_D].forEach((channelId, i) => post(channelId, i, { member: null }));

		await new Promise((resolve) => setImmediate(resolve));

		expect(logger.warn).toHaveBeenCalledTimes(1);
		expect(logged(logger.warn)).toContain('without a member');
	});
});

describe('SpamGuard - failure modes', () => {
	it('kicksAnywayWhenTheDmFails', async () => {
		const { member, spam, logger, done } = setup();
		const spammer = member({
			send: async () => Promise.reject(discordApiError(RESTJSONErrorCodes.CannotSendMessagesToThisUser, 'Cannot send messages to this user'))
		});

		spam(spammer);
		await done();

		expect(spammer.kick).toHaveBeenCalledTimes(1);
		expect(logged(logger.warn)).toContain('Could not DM');
	});

	it('kicksAfterTheDmTimeoutWhenTheDmHangs', async () => {
		const { member, spam, logger, done } = setup({ dmTimeoutMs: 20 });
		const spammer = member({ send: () => new Promise(() => undefined) });

		spam(spammer);
		await done();

		expect(spammer.kick).toHaveBeenCalledTimes(1);
		expect(logged(logger.warn)).toMatch(/Could not DM.*timed out/);
	});

	it('stillDeletesAndLogsTheFailureWhenTheKickIsRefused', async () => {
		const { member, spam, logger, logChannel, textChannels, done } = setup();
		const spammer = member({ kick: async () => Promise.reject(discordApiError(RESTJSONErrorCodes.MissingPermissions, 'Missing Permissions')) });

		spam(spammer);
		await done();

		expect(textChannels[CH_A].bulkDelete).toHaveBeenCalledTimes(1);
		expect(logged(logger.error)).toMatch(new RegExp(`Could not kick member ${FAKE_MEMBER_ID}.*50013`));
		expect(kickLogs(logChannel)[0].description).toContain('⚠️ Nu l-am putut da afară: missing permissions (Discord error 50013)');
	});

	it('onlyDeletesNewSpamFromAMemberWhoseKickFailedForTenMinutes', async () => {
		const { member, spam, logger, logChannel, textChannels, done } = setup();
		const spammer = member({ kick: async () => Promise.reject(discordApiError(RESTJSONErrorCodes.MissingPermissions, 'Missing Permissions')) });
		spam(spammer);
		await done();

		spam(spammer, 120_000);
		await vi.waitFor(() => expect(logged(logger.info)).toContain('failed-kick cooldown'));

		expect(spammer.kick).toHaveBeenCalledTimes(1);
		expect(spammer.send).toHaveBeenCalledTimes(1);
		expect(logChannel.send).toHaveBeenCalledTimes(1);
		expect(textChannels[CH_A].bulkDelete).toHaveBeenCalledTimes(2);
	});

	it('enforcesAgainOnceTheFailedKickCooldownIsOver', async () => {
		const { member, spam, logChannel, done } = setup();
		const spammer = member({ kick: async () => Promise.reject(discordApiError(RESTJSONErrorCodes.MissingPermissions, 'Missing Permissions')) });
		spam(spammer);
		await done();

		spam(spammer, 700_000);
		await vi.waitFor(() => expect(logChannel.send).toHaveBeenCalledTimes(2));

		expect(spammer.kick).toHaveBeenCalledTimes(2);
	});

	it('countsAnAlreadyDeletedSingleMessageAsDeleted', async () => {
		const { spam, logger, logChannel, done } = setup({
			bulkDelete: { [CH_B]: async () => Promise.reject(discordApiError(RESTJSONErrorCodes.UnknownMessage, 'Unknown Message', 404)) }
		});

		spam();
		await done();

		expect(logger.error).not.toHaveBeenCalled();
		expect(kickLogs(logChannel)[0].description).toContain('🧹 Mesaje șterse: 3 din 3.');
	});

	it('skipsAChannelWhereDeletingIsRefusedAndCarriesOn', async () => {
		const { spam, logger, logChannel, textChannels, done } = setup({
			bulkDelete: { [CH_B]: async () => Promise.reject(discordApiError(RESTJSONErrorCodes.MissingPermissions, 'Missing Permissions')) }
		});

		spam();
		await done();

		expect(textChannels[CH_C].bulkDelete).toHaveBeenCalledTimes(1);
		expect(logger.error).toHaveBeenCalledTimes(1);
		expect(logged(logger.error)).toMatch(new RegExp(`Could not delete.*channel ${CH_B}.*member ${FAKE_MEMBER_ID}`));
		expect(kickLogs(logChannel)[0].description).toContain('🧹 Mesaje șterse: 2 din 3.');
	});

	it('logsAChannelThatNoLongerExists', async () => {
		const { spam, logger, logChannel, done } = setup({ missingChannels: [CH_C] });

		spam();
		await done();

		expect(logged(logger.error)).toMatch(new RegExp(`channel ${CH_C}`));
		expect(kickLogs(logChannel)[0].description).toContain('🧹 Mesaje șterse: 2 din 3.');
	});

	it('logsTheKickLogFactsWhenAnnouncementsAreOff', async () => {
		const { spam, logger, logChannel, done } = setup({ logChannelId: null });

		spam();
		await done();

		expect(logChannel.send).not.toHaveBeenCalled();
		expect(logged(logger.info)).toContain('ANNOUNCEMENTS_CHANNEL_ID is not set');
		expect(logged(logger.info)).toMatch(/Kick log: member Ion \(ion1930\).*free-nitro/);
		expect(logged(logger.info)).not.toContain('free-nitro.ru');
	});

	it('logsTheKickLogFactsWhenTheKickLogChannelIsInAnotherServer', async () => {
		const { spam, logger, logChannel, done } = setup({ logChannel: { guildId: OTHER_GUILD_ID } });

		spam();
		await done();

		expect(logChannel.send).not.toHaveBeenCalled();
		expect(logged(logger.warn)).toMatch(/another server[\s\S]*Kick log: member/);
	});

	it('logsTheKickLogFactsWhenTheKickLogChannelIsUnusable', async () => {
		const { spam, logger, logChannel, done } = setup({ logChannel: { permissions: [] } });

		spam();
		await done();

		expect(logChannel.send).not.toHaveBeenCalled();
		expect(logged(logger.error)).toMatch(/missing permissions[\s\S]*Kick log: member/);
	});

	it('logsTheKickLogFactsWhenPostingTheKickLogFails', async () => {
		const { spam, logger, done } = setup({
			logChannel: { send: async () => Promise.reject(discordApiError(RESTJSONErrorCodes.MissingPermissions, 'Missing Permissions')) }
		});

		spam();
		await done();

		expect(logged(logger.error)).toMatch(/Could not post the kick log[\s\S]*Kick log: member/);
	});

	it('neverLogsTheBotToken', async () => {
		vi.stubEnv('DISCORD_TOKEN', FAKE_TOKEN);
		const { member, spam, logger, logChannel, done } = setup({
			bulkDelete: { [CH_A]: async () => Promise.reject(new Error('boom')) }
		});
		const spammer = member({ kick: async () => Promise.reject(new Error('nope')), send: async () => Promise.reject(new Error('closed')) });

		spam(spammer);
		await done();

		const everything = [logger.info, logger.warn, logger.error, logger.debug, logChannel.send, spammer.send].map((fn) =>
			JSON.stringify(fn.mock.calls)
		);
		for (const output of everything) expect(output).not.toContain(FAKE_TOKEN);
	});
});

describe('SpamGuard - messages posted during enforcement (AC-37)', () => {
	it('deletesMessagesPostedWhileTheKickLogWasBeingPosted', async () => {
		const send = deferred();
		const { member, post, spam, logger, logChannel, textChannels, done } = setup({ logChannel: { send: () => send.promise } });
		const spammer = member();
		spam(spammer, 0, 'salut tovarăși');
		await vi.waitFor(() => expect(logChannel.send).toHaveBeenCalledTimes(1));

		const late = post(CH_D, 5_000, { member: spammer });
		send.resolve({});
		await done();

		expect(textChannels[CH_D].bulkDelete).toHaveBeenCalledWith([late.id]);
		expect(logged(logger.info)).toMatch(/1\/1 more posted during enforcement/);
	});

	it('deletesMessagesPostedDuringADeleteOnlyPass', async () => {
		const secondDelete = deferred();
		let deletesInA = 0;
		const { member, post, spam, logger, textChannels, done } = setup({
			bulkDelete: { [CH_A]: async () => (++deletesInA === 2 ? secondDelete.promise : {}) }
		});
		const spammer = member({ kick: async () => Promise.reject(discordApiError(RESTJSONErrorCodes.MissingPermissions, 'Missing Permissions')) });
		spam(spammer);
		await done();
		spam(spammer, 120_000);
		await vi.waitFor(() => expect(deletesInA).toBe(2));

		const late = post(CH_D, 125_000, { member: spammer });
		secondDelete.resolve({});
		await vi.waitFor(() => expect(logged(logger.info)).toContain('failed-kick cooldown'));

		expect(textChannels[CH_D].bulkDelete).toHaveBeenCalledWith([late.id]);
	});
});

describe('SpamGuard - deadlines (AC-38)', () => {
	it('treatsAKickThatTakesTooLongAsFailed', async () => {
		const { member, spam, logChannel, textChannels, done } = setup({ callTimeoutMs: 20 });
		const spammer = member({ kick: never });

		spam(spammer);
		await done();

		expect(textChannels[CH_A].bulkDelete).toHaveBeenCalledTimes(1);
		expect(kickLogs(logChannel)[0].description).toContain('⚠️ Nu l-am putut da afară: timed out after 20 ms');
	});

	it('treatsADeleteThatTakesTooLongAsNotDeleted', async () => {
		const { spam, logger, logChannel, done } = setup({ callTimeoutMs: 20, bulkDelete: { [CH_B]: never } });

		spam();
		await done();

		expect(logged(logger.error)).toMatch(new RegExp(`channel ${CH_B}.*timed out after 20 ms`));
		expect(kickLogs(logChannel)[0].description).toContain('🧹 Mesaje șterse: 2 din 3.');
	});

	it('logsTheKickLogFactsWhenPostingItTakesTooLong', async () => {
		const { spam, logger, done } = setup({ callTimeoutMs: 20, logChannel: { send: never } });

		spam();
		await done();

		expect(logged(logger.error)).toMatch(/Could not post the kick log.*timed out after 20 ms[\s\S]*Kick log: member/);
	});

	it('stopsCallingDiscordOnceTheEnforcementDeadlineHasPassed', async () => {
		const { spam, logger, logChannel, textChannels, done } = setup({
			callTimeoutMs: 30,
			enforcementDeadlineMs: 50,
			bulkDelete: { [CH_A]: never, [CH_B]: never }
		});

		spam(undefined, 0, 'salut tovarăși');
		await done();

		// The enforcement gave up on A and B, never reached C, and logged the kick log instead of posting it.
		expect(logChannel.send).not.toHaveBeenCalled();
		expect(logged(logger.error)).toMatch(/deadline[\s\S]*Kick log: member/);
		expect(logged(logger.info)).toMatch(/deleted 0\/3/);
		// C, never tried, goes to a follow-up with a fresh deadline; A and B timed out, which counts as failed, so no retry.
		await vi.waitFor(() => expect(textChannels[CH_C].bulkDelete).toHaveBeenCalledTimes(1));
		expect(textChannels[CH_A].bulkDelete).toHaveBeenCalledTimes(1);
		expect(textChannels[CH_B].bulkDelete).toHaveBeenCalledTimes(1);
	});

	it('schedulesAFollowUpForMessagesPostedAfterTheDeadline', async () => {
		const { member, post, spam, logger, textChannels, done } = setup({
			callTimeoutMs: 30,
			enforcementDeadlineMs: 50,
			bulkDelete: { [CH_A]: never, [CH_B]: never }
		});
		const spammer = member();
		spam(spammer, 0, 'salut tovarăși');
		await vi.waitFor(() => expect(textChannels[CH_A].bulkDelete).toHaveBeenCalledTimes(1));

		const late = post(CH_D, 5_000, { member: spammer });
		await done();

		await vi.waitFor(() => expect(textChannels[CH_D].bulkDelete).toHaveBeenCalledWith([late.id]));
		await vi.waitFor(() => expect(logged(logger.info)).toContain('Follow-up'));
	});

	it('logsTheLateResultOfACallThatTimedOut', async () => {
		const { member, spam, logger, done } = setup({ callTimeoutMs: 20 });
		const spammer = member({ kick: () => new Promise((resolve) => setTimeout(() => resolve({}), 60)) });

		spam(spammer);
		await done();

		await vi.waitFor(() => expect(logged(logger.info)).toMatch(new RegExp(`Late result: kick of member ${FAKE_MEMBER_ID}.*succeeded`)));
	});
});

describe('SpamGuard - sweep timer', () => {
	it('forgetsExpiredMessagesEveryMinuteOnceStarted', async () => {
		vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
		const { guard, logger, post, clock } = setup();
		post(CH_A, 0);
		guard.start();

		clock.now = T0 + 600_001;
		vi.advanceTimersByTime(60_000);

		expect(logged(logger.debug)).toContain('tracking 0 members');
		guard.stop();
		vi.advanceTimersByTime(60_000);
		expect(logger.debug).toHaveBeenCalledTimes(1);
	});
});
