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
	/** How long any other single Discord call may take, rate-limit waiting included (AC-38). */
	callTimeoutMs?: number;
	/** How long one enforcement, delete-only pass or follow-up may take in total (AC-38). */
	enforcementDeadlineMs?: number;
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

/** When a pass must be done by, on the monotonic clock (`performance.now()`), so the injectable `now` can't skew it. */
interface Budget {
	readonly deadline: number;
}

interface DeleteResult {
	deleted: number;
	/** Messages whose channel was never tried because the deadline had passed; they go to a follow-up pass. */
	skipped: TrackedMessage[];
}

/** A Discord call that didn't settle in time. It is treated as failed, and may still complete later (AC-38). */
class CallTimeoutError extends Error {}

export const DEFAULT_DM_TIMEOUT_MS = 3_000;
export const DEFAULT_CALL_TIMEOUT_MS = 10_000;
export const DEFAULT_ENFORCEMENT_DEADLINE_MS = 30_000;
export const SWEEP_INTERVAL_MS = 60_000;
/** After a refused kick, new spam is only deleted for this long (design D3). */
export const FAILED_KICK_COOLDOWN_MS = TRACKING_WINDOW_MS;
export const MAX_COOLDOWN_MEMBERS = 1_000;

/**
 * Anti-spam (docs/specs/2026-11-08-anti-spam). Records each checked member's messages, and when a rule fires: DM, kick,
 * delete what it tracked from them, kick log, then delete whatever they posted meanwhile. Every Discord call has a
 * timeout and every pass a deadline, so a stalled call can hold a queue slot for at most the deadline. Never throws into
 * the listener: every failure is logged with the guild, member and channel IDs, and the bot keeps running.
 */
export class SpamGuard {
	private readonly ownerIds: readonly string[];
	private readonly logChannelId: string | null;
	private readonly logger: SpamGuardLogger;
	private readonly now: () => number;
	private readonly dmTimeoutMs: number;
	private readonly callTimeoutMs: number;
	private readonly enforcementDeadlineMs: number;
	private readonly tracker: MessageTracker;
	private readonly queue: EnforcementQueue;
	/** Members whose kick was refused, until when; oldest first (D3). */
	private readonly cooldown = new Map<string, number>();
	private sweepTimer: NodeJS.Timeout | null = null;
	private warnedAboutMissingMember = false;

	public constructor({
		ownerIds,
		logChannelId,
		logger,
		now = () => Date.now(),
		dmTimeoutMs = DEFAULT_DM_TIMEOUT_MS,
		callTimeoutMs = DEFAULT_CALL_TIMEOUT_MS,
		enforcementDeadlineMs = DEFAULT_ENFORCEMENT_DEADLINE_MS
	}: SpamGuardOptions) {
		this.ownerIds = ownerIds;
		this.logChannelId = logChannelId;
		this.logger = logger;
		this.now = now;
		this.dmTimeoutMs = dmTimeoutMs;
		this.callTimeoutMs = callTimeoutMs;
		this.enforcementDeadlineMs = enforcementDeadlineMs;
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
		// Already being enforced against: the message is recorded, and that pass drains it before finishing (AC-37).
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
		const budget = this.newBudget();
		await this.sendDm(offence, budget);
		const kick = await this.kick(offence, budget);
		if (!kick.ok) this.startCooldown(offence.key);

		// Taken after the kick, so messages posted while the DM and kick were in flight are deleted too.
		const messages = this.tracker.take(offence.key);
		const { deleted, skipped } = await this.deleteMessages(offence, messages, budget);
		await this.postKickLog(offence, kick, messages, deleted, budget);
		this.keepForFollowUp(offence.key, skipped);
		const late = await this.drain(offence, budget);

		this.logger.info(
			`[AntiSpam] Enforced against ${offence.context}: rules ${offence.rules.join(', ')}; ${kick.ok ? 'kicked' : 'kick failed'}; deleted ${deleted}/${messages.length}${describeLate(late)}.`
		);
		this.followUpIfNeeded(offence, budget);
	}

	/** A member whose kick failed keeps posting: delete, but no DM, kick or kick log for a while (D3). */
	private async deleteOnly(offence: Offence): Promise<void> {
		const budget = this.newBudget();
		const messages = this.tracker.take(offence.key);
		const { deleted, skipped } = await this.deleteMessages(offence, messages, budget);
		this.keepForFollowUp(offence.key, skipped);
		const late = await this.drain(offence, budget);

		this.logger.info(
			`[AntiSpam] ${offence.context} is in the failed-kick cooldown: rules ${offence.rules.join(', ')}; deleted ${deleted}/${messages.length}${describeLate(late)} without a DM, kick or kick log.`
		);
		this.followUpIfNeeded(offence, budget);
	}

	/** Deletes what a pass couldn't reach before its deadline, with a fresh deadline (AC-37, AC-38). */
	private async followUp(offence: Offence): Promise<void> {
		const budget = this.newBudget();
		const late = await this.drain(offence, budget);
		this.logger.info(`[AntiSpam] Follow-up for ${offence.context}: deleted ${late.deleted}/${late.tracked} messages left by the previous pass.`);
		this.followUpIfNeeded(offence, budget);
	}

	/**
	 * Deletes what the member posted while this pass was running, until nothing new is left (AC-37). Ends at the deadline;
	 * anything still tracked then is handled by a follow-up pass.
	 */
	private async drain(offence: Offence, budget: Budget): Promise<{ deleted: number; tracked: number }> {
		let deleted = 0;
		let tracked = 0;
		while (!this.isPastDeadline(budget)) {
			const late = this.tracker.take(offence.key);
			if (late.length === 0) break;

			tracked += late.length;
			const result = await this.deleteMessages(offence, late, budget);
			deleted += result.deleted;
			this.keepForFollowUp(offence.key, result.skipped);
		}

		return { deleted, tracked };
	}

	/**
	 * Schedules a follow-up when the deadline stopped this pass with messages still tracked. Runs after this pass leaves the
	 * queue, through the queue, so it stays bounded and one-per-member. Only reachable after a deadline, so a member whose
	 * kick failed doesn't lose ordinary messages to it.
	 */
	private followUpIfNeeded(offence: Offence, budget: Budget): void {
		if (!this.isPastDeadline(budget) || !this.tracker.has(offence.key)) return;
		const timer = setTimeout(() => {
			if (this.tracker.has(offence.key)) this.queue.submit(offence.key, () => this.followUp(offence));
		}, 0);
		timer.unref?.();
	}

	private keepForFollowUp(key: string, skipped: readonly TrackedMessage[]): void {
		for (const message of skipped) this.tracker.record(key, message);
	}

	private async sendDm({ member, guild, rules, context }: Offence, budget: Budget): Promise<void> {
		try {
			await this.bounded(
				`DM to ${context}`,
				budget,
				() => member.send({ content: dmText(guild.name, rules), allowedMentions: { parse: [] } }),
				this.dmTimeoutMs
			);
		} catch (error) {
			this.logger.warn(`[AntiSpam] Could not DM ${context}: ${describeDiscordError(error)}; kicking anyway.`);
		}
	}

	private async kick({ member, rules, context }: Offence, budget: Budget): Promise<KickOutcome> {
		try {
			await this.bounded(`kick of ${context}`, budget, () => member.kick(kickReason(rules)));
			return { ok: true };
		} catch (error) {
			const reason = describeDiscordError(error);
			this.logger.error(`[AntiSpam] Could not kick ${context}: ${reason}. Deleting their messages anyway.`);
			return { ok: false, reason };
		}
	}

	/** One bulk delete per channel, one channel at a time (AC-14, AC-32, AC-35, AC-38). */
	private async deleteMessages({ client, context }: Offence, messages: readonly TrackedMessage[], budget: Budget): Promise<DeleteResult> {
		const byChannel = new Map<string, TrackedMessage[]>();
		for (const message of messages) byChannel.set(message.channelId, [...(byChannel.get(message.channelId) ?? []), message]);

		let deleted = 0;
		const skipped: TrackedMessage[] = [];
		for (const [channelId, channelMessages] of byChannel) {
			if (this.isPastDeadline(budget)) {
				skipped.push(...channelMessages);
				continue;
			}

			const ids = channelMessages.map((message) => message.id);
			try {
				await this.bounded(`delete of ${ids.length} messages in channel ${channelId} from ${context}`, budget, async () => {
					const channel = await client.channels.fetch(channelId);
					if (channel === null || !('bulkDelete' in channel)) throw new Error('unknown channel or not a text channel');
					await channel.bulkDelete(ids);
				});
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

		if (skipped.length > 0) {
			this.logger.error(
				`[AntiSpam] Enforcement deadline of ${this.enforcementDeadlineMs} ms passed: ${skipped.length} messages from ${context} are left for a follow-up pass.`
			);
		}
		return { deleted, skipped };
	}

	private async postKickLog(
		offence: Offence,
		kick: KickOutcome,
		messages: readonly TrackedMessage[],
		deleted: number,
		budget: Budget
	): Promise<void> {
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
		if (this.isPastDeadline(budget)) {
			this.logger.error(
				`[AntiSpam] Enforcement deadline of ${this.enforcementDeadlineMs} ms passed before the kick log for ${offence.context} was posted. ${formatKickLogText(input)}`
			);
			return;
		}

		let resolved;
		try {
			resolved = await this.bounded(`kick-log channel ${logChannelId}`, budget, () => resolveStatusChannel(offence.client, logChannelId));
		} catch (error) {
			resolved = { ok: false as const, reason: describeDiscordError(error) };
		}
		if (!resolved.ok) {
			this.logger.error(`[AntiSpam] Kick-log channel ${logChannelId} is unusable: ${resolved.reason}. ${formatKickLogText(input)}`);
			return;
		}
		if (resolved.channel.guildId !== offence.guild.id) {
			this.logger.warn(`[AntiSpam] Kick-log channel ${logChannelId} is in another server than ${offence.context}. ${formatKickLogText(input)}`);
			return;
		}

		const { channel } = resolved;
		try {
			await this.bounded(`kick log for ${offence.context}`, budget, () => channel.send(buildKickLog(input)));
		} catch (error) {
			this.logger.error(
				`[AntiSpam] Could not post the kick log for ${offence.context} in ${logChannelId}: ${describeDiscordError(error)}. ${formatKickLogText(input)}`
			);
		}
	}

	private newBudget(): Budget {
		return { deadline: performance.now() + this.enforcementDeadlineMs };
	}

	/** Under a millisecond left counts as passed: Node can fire a timer up to 1 ms early. */
	private isPastDeadline(budget: Budget): boolean {
		return budget.deadline - performance.now() < 1;
	}

	/**
	 * Runs one Discord call with a timeout: its own limit, cut to what is left of the pass's deadline. discord.js's 15 s
	 * request timeout doesn't cover time waiting in its rate-limit queue; this does. A call that times out is treated as
	 * failed; it can't be cancelled, so if it completes later the result stands and is logged at info (AC-38).
	 */
	private async bounded<T>(label: string, budget: Budget, call: () => Promise<T>, limitMs = this.callTimeoutMs): Promise<T> {
		const ms = Math.max(1, Math.min(limitMs, Math.floor(budget.deadline - performance.now())));
		const pending = call();
		let timer: NodeJS.Timeout | undefined;
		const timeout = new Promise<never>((_, reject) => {
			timer = setTimeout(() => reject(new CallTimeoutError(`timed out after ${ms} ms`)), ms);
		});

		try {
			return await Promise.race([pending, timeout]);
		} catch (error) {
			if (error instanceof CallTimeoutError) {
				pending.then(
					() => this.logger.info(`[AntiSpam] Late result: ${label} succeeded after timing out.`),
					(lateError: unknown) =>
						this.logger.info(`[AntiSpam] Late result: ${label} failed after timing out: ${describeDiscordError(lateError)}`)
				);
			}
			throw error;
		} finally {
			clearTimeout(timer);
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

function describeLate({ deleted, tracked }: { deleted: number; tracked: number }): string {
	return tracked === 0 ? '' : `, and ${deleted}/${tracked} more posted during enforcement`;
}

declare module '@sapphire/pieces' {
	interface Container {
		spamGuard: SpamGuard;
	}
}
