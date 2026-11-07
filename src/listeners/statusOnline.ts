import { Events, Listener } from '@sapphire/framework';
import type { Client } from 'discord.js';

/** Posts the online status message once per process (docs/specs/2026-11-07-status-messages). */
export class StatusOnlineListener extends Listener<typeof Events.ClientReady> {
	public constructor(context: Listener.LoaderContext, options?: Listener.Options) {
		super(context, { ...options, event: Events.ClientReady, once: true });
	}

	public run(client: Client<true>) {
		return this.container.statusAnnouncer.announceOnline(client);
	}
}
