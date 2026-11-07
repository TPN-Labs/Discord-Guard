import { Events, Listener } from '@sapphire/framework';
import type { GuildMember } from 'discord.js';

/** Posts the join announcement (docs/specs/2026-11-07-join-leave-announcements). */
export class MemberJoinAnnouncementListener extends Listener<typeof Events.GuildMemberAdd> {
	public constructor(context: Listener.LoaderContext, options?: Listener.Options) {
		super(context, { ...options, event: Events.GuildMemberAdd });
	}

	public run(member: GuildMember) {
		return this.container.memberAnnouncer.announceJoin(member);
	}
}
