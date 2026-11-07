import type { ILogger } from '@sapphire/framework';
import { describeDiscordError, resolveStatusChannel, type StatusChannelClient } from '../status/channel';
import { formatMemberName } from './member-name';
import { buildJoinAnnouncement, buildLeaveAnnouncement, type JoinAnnouncementPayload, type LeaveAnnouncementPayload } from './message';
import { shouldAnnounce } from './should-announce';

export type AnnouncementLogger = Pick<ILogger, 'info' | 'warn' | 'error'>;

/** A Client<true> satisfies this; tests pass a small fake. */
export type AnnouncementClient = StatusChannelClient;

/** The parts of a GuildMember, or of a PartialGuildMember, the announcements read. */
export interface AnnouncedMember {
	id: string;
	guild: { id: string };
	user: { bot: boolean; username: string };
	displayName: string;
	/** Null for a partial member the bot never cached. */
	joinedAt: Date | null;
	client: AnnouncementClient;
	displayAvatarURL(): string;
}

export interface MemberAnnouncerOptions {
	/** From ANNOUNCEMENTS_CHANNEL_ID; null turns join and leave announcements off. */
	channelId: string | null;
	/** From RULES_CHANNEL_ID; null leaves the rules line out of join announcements. */
	rulesChannelId: string | null;
	logger: AnnouncementLogger;
	now?: () => Date;
}

type AnnouncementKind = 'join' | 'leave';

/** Announcements in progress at once; more during a raid are skipped (requirements AC-21). */
export const MAX_PENDING_ANNOUNCEMENTS = 10;

/**
 * Posts join and leave announcements (docs/specs/2026-11-07-join-leave-announcements). Never throws: every
 * failure is logged with the channel, member and guild IDs, and the bot keeps running.
 */
export class MemberAnnouncer {
	private readonly channelId: string | null;
	private readonly rulesChannelId: string | null;
	private readonly logger: AnnouncementLogger;
	private readonly now: () => Date;
	/** Announcements between the cap check and the end of their send; never above MAX_PENDING_ANNOUNCEMENTS. */
	private inProgress = 0;
	/** Joins and leaves skipped since the backlog last drained. */
	private skipped = 0;

	public constructor({ channelId, rulesChannelId, logger, now = () => new Date() }: MemberAnnouncerOptions) {
		this.channelId = channelId;
		this.rulesChannelId = rulesChannelId;
		this.logger = logger;
		this.now = now;
	}

	/** Once per process, at clientReady: report the configuration and learn every member's join date. */
	public async prepare(client: AnnouncementClient): Promise<void> {
		const { channelId } = this;
		if (channelId === null) {
			this.logger.warn('[Announcements] Join and leave announcements are off: ANNOUNCEMENTS_CHANNEL_ID is not set.');
			return;
		}

		const resolved = await resolveStatusChannel(client, channelId);
		if (!resolved.ok) {
			this.logger.error(`[Announcements] Announcements channel ${channelId} is unusable: ${resolved.reason}.`);
			return;
		}

		const { guild } = resolved.channel;
		try {
			const members = await guild.members.fetch();
			this.logger.info(`[Announcements] Cached ${members.size} members of guild ${guild.id}; join dates are known for leave announcements.`);
		} catch (error) {
			this.logger.warn(
				`[Announcements] Could not fetch the members of guild ${guild.id}: ${describeDiscordError(error)}; leave announcements for members who joined before this start omit the duration.`
			);
		}
	}

	public announceJoin(member: AnnouncedMember): Promise<void> {
		return this.announce('join', member, () =>
			buildJoinAnnouncement({
				memberId: member.id,
				avatarUrl: member.displayAvatarURL(),
				rulesChannelId: this.rulesChannelId,
				timestamp: this.now()
			})
		);
	}

	public announceLeave(member: AnnouncedMember): Promise<void> {
		return this.announce('leave', member, () =>
			buildLeaveAnnouncement({
				name: formatMemberName({ displayName: member.displayName, username: member.user.username }),
				joinedAt: member.joinedAt,
				leftAt: this.now()
			})
		);
	}

	private async announce(
		kind: AnnouncementKind,
		member: AnnouncedMember,
		build: () => JoinAnnouncementPayload | LeaveAnnouncementPayload
	): Promise<void> {
		const { channelId } = this;
		// Off: the warning was logged once in prepare(). Bots: skipped before any Discord call (AC-13).
		if (channelId === null || member.user.bot) return;

		const context = `member ${member.id} in guild ${member.guild.id}`;
		if (this.inProgress >= MAX_PENDING_ANNOUNCEMENTS) {
			if (this.skipped++ === 0) {
				this.logger.warn(
					`[Announcements] ${MAX_PENDING_ANNOUNCEMENTS} announcements are already in progress; skipping new joins and leaves until they finish (first skipped: ${kind} of ${context}).`
				);
			}
			return;
		}

		// Counted before the first await, so a burst of events can't all pass the check at once (AC-21).
		this.inProgress++;
		try {
			await this.post(kind, member, context, channelId, build);
		} finally {
			this.inProgress--;
			if (this.inProgress === 0 && this.skipped > 0) {
				this.logger.warn(`[Announcements] Backlog drained; skipped ${this.skipped} join and leave announcements.`);
				this.skipped = 0;
			}
		}
	}

	private async post(
		kind: AnnouncementKind,
		member: AnnouncedMember,
		context: string,
		channelId: string,
		build: () => JoinAnnouncementPayload | LeaveAnnouncementPayload
	): Promise<void> {
		const resolved = await resolveStatusChannel(member.client, channelId);
		if (!resolved.ok) {
			this.logger.error(`[Announcements] No ${kind} announcement for ${context}: channel ${channelId} is unusable: ${resolved.reason}.`);
			return;
		}

		const { channel } = resolved;
		if (!shouldAnnounce({ isBot: member.user.bot, memberGuildId: member.guild.id, channelGuildId: channel.guildId })) return;

		try {
			await channel.send(build());
		} catch (error) {
			this.logger.error(
				`[Announcements] Could not post the ${kind} announcement for ${context} in ${channelId}: ${describeDiscordError(error)}`
			);
			return;
		}

		this.logger.info(`[Announcements] Posted the ${kind} announcement for ${context} in ${channelId}.`);
	}
}

declare module '@sapphire/pieces' {
	interface Container {
		memberAnnouncer: MemberAnnouncer;
	}
}
