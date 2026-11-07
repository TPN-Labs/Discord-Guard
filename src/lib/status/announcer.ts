import type { ILogger } from '@sapphire/framework';
import type { Client } from 'discord.js';
import { describeDiscordError, resolveStatusChannel, type StatusChannel, type StatusChannelClient } from './channel';
import { OFFLINE_PHRASES, ONLINE_PHRASES } from './copy';
import type { ShutdownTrigger, StatusLifecycle } from './lifecycle';
import { buildStatusMessage } from './message';
import { pickPhrase } from './pick-phrase';
import { classifyPreviousRun, STATUS_HISTORY_LIMIT, type PreviousRun } from './previous-run';
import { SHUTDOWN_DEADLINE_MS, withDeadline } from './shutdown';

export type StatusLogger = Pick<ILogger, 'info' | 'warn' | 'error' | 'fatal'>;

export interface StatusAnnouncerOptions {
	/** From STATUS_CHANNEL_ID; null turns status messages off. */
	channelId: string | null;
	lifecycle: StatusLifecycle;
	logger: StatusLogger;
	random?: () => number;
	now?: () => Date;
}

export interface ShutdownContext {
	client: Pick<Client, 'destroy'>;
	exit: (code: number) => void;
}

/** Hard stop in case the shutdown sequence itself misbehaves; the deadline normally ends it first. */
const BACKSTOP_MARGIN_MS = 500;

/**
 * Posts the online status message at start-up and the offline one at shutdown
 * (docs/specs/2026-11-07-status-messages). Never throws: every failure is logged and the bot keeps running
 * or, at shutdown, keeps exiting.
 */
export class StatusAnnouncer {
	private readonly channelId: string | null;
	private readonly lifecycle: StatusLifecycle;
	private readonly logger: StatusLogger;
	private readonly random: () => number;
	private readonly now: () => Date;
	private channel: StatusChannel | null = null;

	public constructor({ channelId, lifecycle, logger, random = Math.random, now = () => new Date() }: StatusAnnouncerOptions) {
		this.channelId = channelId;
		this.lifecycle = lifecycle;
		this.logger = logger;
		this.random = random;
		this.now = now;
	}

	public async announceOnline(client: StatusChannelClient): Promise<void> {
		const { channelId } = this;
		if (channelId === null) {
			this.logger.warn('[Status] Status messages are off: STATUS_CHANNEL_ID is not set.');
			return;
		}

		if (!this.lifecycle.tryBeginAnnounce()) return;

		const resolved = await resolveStatusChannel(client, channelId);
		if (!resolved.ok) {
			this.logger.error(`[Status] Status channel ${channelId} is unusable: ${resolved.reason}. No status messages will be posted.`);
			return;
		}

		const previous = resolved.canReadHistory ? await this.readPreviousRun(resolved.channel, client.user.id) : this.skipDetection(channelId);

		try {
			await resolved.channel.send(
				buildStatusMessage({
					kind: 'online',
					phrase: pickPhrase(ONLINE_PHRASES, this.random),
					unplannedOutage: previous === 'online',
					timestamp: this.now()
				})
			);
		} catch (error) {
			this.logger.error(`[Status] Could not post the online status message in ${channelId}: ${describeDiscordError(error)}`);
			return;
		}

		if (this.lifecycle.markOnlinePosted()) this.channel = resolved.channel;
		this.logger.info(`[Status] Posted the online status message in ${channelId} (previous run: ${previous}).`);
	}

	public async shutdown(trigger: ShutdownTrigger, error: unknown, { client, exit }: ShutdownContext): Promise<void> {
		if (trigger === 'uncaughtException' || trigger === 'unhandledRejection') {
			this.logger.fatal(`[Status] Shutting down after ${trigger}:`, error);
		}

		const plan = this.lifecycle.beginShutdown(trigger);
		if (plan === null) {
			this.logger.warn(`[Status] Shutdown already in progress; ignoring ${trigger}.`);
			return;
		}

		this.logger.info(`[Status] Shutting down (${trigger}).`);
		const backstop = setTimeout(() => exit(plan.exitCode), SHUTDOWN_DEADLINE_MS + BACKSTOP_MARGIN_MS);

		const result = await withDeadline(async () => {
			if (plan.postOffline) await this.postOffline();
			await client.destroy();
		}, SHUTDOWN_DEADLINE_MS);

		if (result.outcome === 'timed-out') {
			this.logger.error(`[Status] Shutdown did not finish within ${SHUTDOWN_DEADLINE_MS} ms; exiting without waiting further.`);
		} else if (result.outcome === 'failed') {
			this.logger.error(`[Status] Closing the gateway failed: ${describeDiscordError(result.error)}`);
		}

		clearTimeout(backstop);
		exit(plan.exitCode);
	}

	private async postOffline(): Promise<void> {
		const { channel } = this;
		if (channel === null) return;

		try {
			await channel.send(
				buildStatusMessage({
					kind: 'offline',
					phrase: pickPhrase(OFFLINE_PHRASES, this.random),
					unplannedOutage: false,
					timestamp: this.now()
				})
			);
			this.logger.info(`[Status] Posted the offline status message in ${channel.id}.`);
		} catch (error) {
			this.logger.error(`[Status] Could not post the offline status message in ${channel.id}: ${describeDiscordError(error)}`);
		}
	}

	private async readPreviousRun(channel: StatusChannel, botUserId: string): Promise<PreviousRun> {
		try {
			const messages = await channel.messages.fetch({ limit: STATUS_HISTORY_LIMIT });
			const newestFirst = [...messages.values()]
				.sort((a, b) => b.createdTimestamp - a.createdTimestamp)
				.map((message) => ({ authorId: message.author.id, embedTitles: message.embeds.map((embed) => embed.title) }));
			return classifyPreviousRun(newestFirst, botUserId);
		} catch (error) {
			this.logger.warn(
				`[Status] Could not read the history of status channel ${channel.id}: ${describeDiscordError(error)}; unplanned-outage detection skipped.`
			);
			return 'none';
		}
	}

	private skipDetection(channelId: string): PreviousRun {
		this.logger.warn(`[Status] Status channel ${channelId}: missing Read Message History; unplanned-outage detection skipped.`);
		return 'none';
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		statusAnnouncer: StatusAnnouncer;
	}
}
