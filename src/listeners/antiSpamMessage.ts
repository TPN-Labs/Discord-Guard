import { Events, Listener } from '@sapphire/framework';
import type { Message } from 'discord.js';

/** Checks every new message against the anti-spam rules (docs/specs/2026-11-08-anti-spam). */
export class AntiSpamMessageListener extends Listener<typeof Events.MessageCreate> {
	public constructor(context: Listener.LoaderContext, options?: Listener.Options) {
		super(context, { ...options, event: Events.MessageCreate });
	}

	public run(message: Message) {
		this.container.spamGuard.handleMessage(message);
	}
}
