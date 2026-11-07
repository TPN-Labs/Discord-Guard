import { Events, Listener } from '@sapphire/framework';
import type { GuildMember, PartialGuildMember } from 'discord.js';

/** Posts the leave announcement, also for members the bot never cached (docs/specs/2026-11-07-join-leave-announcements). */
export class MemberLeaveAnnouncementListener extends Listener<typeof Events.GuildMemberRemove> {
	public constructor(context: Listener.LoaderContext, options?: Listener.Options) {
		super(context, { ...options, event: Events.GuildMemberRemove });
	}

	public run(member: GuildMember | PartialGuildMember) {
		return this.container.memberAnnouncer.announceLeave(member);
	}
}
