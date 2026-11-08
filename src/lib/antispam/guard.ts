import type { ILogger } from '@sapphire/framework';
import { PermissionsBitField, RESTJSONErrorCodes, DiscordAPIError } from 'discord.js';
import { describeDiscordError, resolveStatusChannel, type StatusChannelClient } from '../status/channel';
import { dmText, kickReason } from './copy';
import { isChecked } from './exemption';
import { buildKickLog, formatKickLogText, type KickLogInput } from './kick-log';
import { toTrackedMessage, type TrackedMessage } from './message-facts';
import { EnforcementQueue } from './queue';
import { evaluateRules, TRACKING_WINDOW_MS, type RuleId } from './rules';
import { MessageTracker } from './tracker';

export type SpamGuardLogger = Pick<ILogger, 'debug' | 'info' | 'warn' | 'error'>;

export interface SpamGuardOptions {
	/** From OWNERS; never checked (requirements AC-09). */
	ownerIds: readonly string[];
	/** From ANNOUNCEMENTS_CHANNEL_ID; null sends kick logs to the bot's log instead (AC-29, AC-30). */
	logChannelId: string | null;
	logger: SpamGuardLogger;
	now?: () => number;
	/** How long the kick waits for the DM (AC-12). */
	dmTimeoutMs?: number;
}

/** The parts of a GuildMember the guard reads and acts on; a real GuildMember satisfies it. */
export interface GuardedMember {
	id: string;
	displayName: string;
	permissions: Pick<Readonly<PermissionsBitField>, 'has'>;
	kick(reason?: string): Promise<unknown>;
	send(options: { content: string; allowedMentions: { parse: [] } }): Promise<unknown>;
}

/** The parts of a Message the guard reads; a real Message from messageCreate satisfies it. */
export interface GuardedMessage {
	id: string;
	channelId: string;
	guildId: string | null;
	createdTimestamp: number;
	content: string;
	system: boolean;
	webhookId: string | null;
	author: { id: string; username: string };
	member: GuardedMember | null;
	guild: { id: string; name: string } | null;
	client: StatusChannelClient;
}

interface Offence {
	key: string;
	member: GuardedMember;
	username: string;
	guild: { id: string; name: string };
	client: StatusChannelClient;
	rules: RuleId[];
	context: string;
}

type KickOutcome = KickLogInput['kick'];

export const DEFAULT_DM_TIMEOUT_MS = 3_000;
export const SWEEP_INTERVAL_MS = 60_000;
/** After a refused kick, new spam is only deleted for this long (design D3). */
export const FAILED_KICK_COOLDOWN_MS = TRACKING_WINDOW_MS;
export const MAX_COOLDOWN_MEMBERS = 1_000;

/**
 * Anti-spam (docs/specs/2026-11-08-anti-spam). Records each checked member's messages, and when a rule fires: DM, kick,
 * delete what it tracked from them, kick log. Never throws into the listener: every failure is logged with the guild,
 * member and channel IDs, and the bot keeps running.
 */
export class SpamGuard {
	private readonly ownerIds: readonly string[];
	private readonly logChannelId: string | null;
	private readonly logger: SpamGuardLogger;
	private readonly now: () => number;
	private readonly dmTimeoutMs: number;
	private readonly tracker: MessageTracker;
	private readonly queue: EnforcementQueue;
	/** Members whose kick was refused, until when; oldest first (D3). */
	private readonly cooldown = new Map<string, number>();
	private sweepTimer: NodeJS.Timeout | null = null;
	private warnedAboutMissingMember = false;

	public constructor({ ownerIds, logChannelId, logger, now = () => Date.now(), dmTimeoutMs = DEFAULT_DM_TIMEOUT_MS }: SpamGuardOptions) {
		this.ownerIds = ownerIds;
		this.logChannelId = logChannelId;
		this.logger = logger;
		this.now = now;
		this.dmTimeoutMs = dmTimeoutMs;
		this.tracker = new MessageTracker({ now });
		this.queue = new EnforcementQueue({ logger });

		if (logChannelId === null) this.logger.info("[AntiSpam] Kick logs go to the bot's log: ANNOUNCEMENTS_CHANNEL_ID is not set.");
	}

	/** Called for every messageCreate. Synchronous up to the queue, so two messages can't both start an enforcement (AC-06). */
	public handleMessage(message: GuardedMessage): void {
		try {
			this.handle(message);
		} catch (error) {
			this.logger.error(
				`[AntiSpam] Could not check message ${message.id} in channel ${message.channelId}: ${error instanceof Error ? error.message : String(error)}`
			);
		}
	}

	/** Starts the sweep that forgets expired messages; unref'd so it never keeps the process alive (D7). */
	public start(): void {
		if (this.sweepTimer !== null) return;
		this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
		this.sweepTimer.unref?.();
	}

	public stop(): void {
		if (this.sweepTimer !== null) clearInterval(this.sweepTimer);
		this.sweepTimer = null;
	}

	private handle(message: GuardedMessage): void {
		const { member, guild } = message;
		const checked = isChecked({
			inGuild: message.guildId !== null,
			isSystem: message.system,
			authorId: message.author.id,
			botUserId: message.client.user.id,
			isWebhook: message.webhookId !== null,
			ownerIds: this.ownerIds,
			hasManageMessages: member?.permissions.has(PermissionsBitField.Flags.ManageMessages) ?? false
		});
		if (!checked) return;

		if (member === null || guild === null) {
			if (!this.warnedAboutMissingMember) {
				this.warnedAboutMissingMember = true;
				this.logger.warn(
					`[AntiSpam] Ignoring message ${message.id} in channel ${message.channelId}: a server message without a member (logged once).`
				);
			}
			return;
		}

		const key = `${guild.id}:${message.author.id}`;
		const history = this.tracker.record(
			key,
			toTrackedMessage({ id: message.id, channelId: message.channelId, createdAt: message.createdTimestamp, content: message.content })
		);
		// Already being enforced against: the message is recorded, so that enforcement deletes it.
		if (this.queue.has(key)) return;

		const rules = evaluateRules(history, message.createdTimestamp);
		if (rules.length === 0) return;

		const offence: Offence = {
			key,
			member,
			username: message.author.username,
			guild,
			client: message.client,
			rules,
			context: `member ${member.id} in guild ${guild.id}`
		};
		this.queue.submit(key, () => (this.inCooldown(key) ? this.deleteOnly(offence) : this.enforce(offence)));
	}

	private async enforce(offence: Offence): Promise<void> {
		await this.sendDm(offence);
		const kick = await this.kick(offence);
		if (!kick.ok) this.startCooldown(offence.key);

		// Taken after the kick, so messages posted while the DM and kick were in flight are deleted too.
		const messages = this.tracker.take(offence.key);
		const deleted = await this.deleteMessages(offence, messages);
		await this.postKickLog(offence, kick, messages, deleted);

		this.logger.info(
			`[AntiSpam] Enforced against ${offence.context}: rules ${offence.rules.join(', ')}; ${kick.ok ? 'kicked' : 'kick failed'}; deleted ${deleted}/${messages.length}.`
		);
	}

	/** A member whose kick failed keeps posting: delete, but no DM, kick or kick log for a while (D3). */
	private async deleteOnly(offence: Offence): Promise<void> {
		const messages = this.tracker.take(offence.key);
		const deleted = await this.deleteMessages(offence, messages);
		this.logger.info(
			`[AntiSpam] ${offence.context} is in the failed-kick cooldown: rules ${offence.rules.join(', ')}; deleted ${deleted}/${messages.length} without a DM, kick or kick log.`
		);
	}

	private async sendDm({ member, guild, rules, context }: Offence): Promise<void> {
		let timer: NodeJS.Timeout | undefined;
		const timeout = new Promise<'timeout'>((resolve) => {
			timer = setTimeout(() => resolve('timeout'), this.dmTimeoutMs);
		});
		// Caught on its own, so a rejection after the timeout is never unhandled; discord.js bounds it at 15 s.
		const send = member.send({ content: dmText(guild.name, rules), allowedMentions: { parse: [] } }).then(
			() => 'sent' as const,
			(error: unknown) => error
		);

		const result = await Promise.race([send, timeout]);
		clearTimeout(timer);
		if (result === 'timeout') {
			this.logger.warn(`[AntiSpam] Could not DM ${context}: timed out after ${this.dmTimeoutMs} ms; kicking anyway.`);
		} else if (result !== 'sent') {
			this.logger.warn(`[AntiSpam] Could not DM ${context}: ${describeDiscordError(result)}; kicking anyway.`);
		}
	}

	private async kick({ member, rules, context }: Offence): Promise<KickOutcome> {
		try {
			await member.kick(kickReason(rules));
			return { ok: true };
		} catch (error) {
			const reason = describeDiscordError(error);
			this.logger.error(`[AntiSpam] Could not kick ${context}: ${reason}. Deleting their messages anyway.`);
			return { ok: false, reason };
		}
	}

	/** One bulk delete per channel, one channel at a time (AC-14, AC-32, AC-35). Returns how many are gone. */
	private async deleteMessages({ client, context }: Offence, messages: readonly TrackedMessage[]): Promise<number> {
		const byChannel = new Map<string, string[]>();
		for (const message of messages) byChannel.set(message.channelId, [...(byChannel.get(message.channelId) ?? []), message.id]);

		let deleted = 0;
		for (const [channelId, ids] of byChannel) {
			try {
				const channel = await client.channels.fetch(channelId);
				if (channel === null || !('bulkDelete' in channel)) throw new Error('unknown channel or not a text channel');
				await channel.bulkDelete(ids);
				deleted += ids.length;
			} catch (error) {
				// A single message someone already deleted: gone, which is the goal (AC-14).
				if (ids.length === 1 && error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMessage) {
					deleted += 1;
					continue;
				}
				this.logger.error(
					`[AntiSpam] Could not delete ${ids.length} messages in channel ${channelId} from ${context}: ${describeDiscordError(error)}`
				);
			}
		}

		return deleted;
	}

	private async postKickLog(offence: Offence, kick: KickOutcome, messages: readonly TrackedMessage[], deleted: number): Promise<void> {
		const input: KickLogInput = {
			member: { displayName: offence.member.displayName, username: offence.username, id: offence.member.id },
			rules: offence.rules,
			channelIds: [...new Set(messages.map((message) => message.channelId))],
			messages,
			kick,
			deleted,
			tracked: messages.length,
			timestamp: new Date(this.now())
		};
		const { logChannelId } = this;

		if (logChannelId === null) {
			this.logger.info(formatKickLogText(input));
			return;
		}

		const resolved = await resolveStatusChannel(offence.client, logChannelId);
		if (!resolved.ok) {
			this.logger.error(`[AntiSpam] Kick-log channel ${logChannelId} is unusable: ${resolved.reason}. ${formatKickLogText(input)}`);
			return;
		}
		if (resolved.channel.guildId !== offence.guild.id) {
			this.logger.warn(`[AntiSpam] Kick-log channel ${logChannelId} is in another server than ${offence.context}. ${formatKickLogText(input)}`);
			return;
		}

		try {
			await resolved.channel.send(buildKickLog(input));
		} catch (error) {
			this.logger.error(
				`[AntiSpam] Could not post the kick log for ${offence.context} in ${logChannelId}: ${describeDiscordError(error)}. ${formatKickLogText(input)}`
			);
		}
	}

	private inCooldown(key: string): boolean {
		const until = this.cooldown.get(key);
		if (until === undefined) return false;
		if (until > this.now()) return true;
		this.cooldown.delete(key);
		return false;
	}

	private startCooldown(key: string): void {
		this.cooldown.delete(key);
		this.cooldown.set(key, this.now() + FAILED_KICK_COOLDOWN_MS);
		if (this.cooldown.size > MAX_COOLDOWN_MEMBERS) {
			const oldest = this.cooldown.keys().next().value;
			if (oldest !== undefined) this.cooldown.delete(oldest);
		}
	}

	private sweep(): void {
		this.tracker.sweep();
		const now = this.now();
		for (const [key, until] of this.cooldown) if (until <= now) this.cooldown.delete(key);
		this.logger.debug(
			`[AntiSpam] Sweep: tracking ${this.tracker.size} members, ${this.tracker.messageCount} messages; ${this.cooldown.size} in the failed-kick cooldown.`
		);
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		spamGuard: SpamGuard;
	}
}
