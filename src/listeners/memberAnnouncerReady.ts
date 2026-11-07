import { Events, Listener } from '@sapphire/framework';
import type { Client } from 'discord.js';

/** Reports the announcements configuration and caches every member's join date (docs/specs/2026-11-07-join-leave-announcements). */
export class MemberAnnouncerReadyListener extends Listener<typeof Events.ClientReady> {
	public constructor(context: Listener.LoaderContext, options?: Listener.Options) {
		super(context, { ...options, event: Events.ClientReady, once: true });
	}

	public run(client: Client<true>) {
		return this.container.memberAnnouncer.prepare(client);
	}
}
