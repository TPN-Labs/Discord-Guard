import { Command, Precondition } from '@sapphire/framework';
import { envParseArray } from '../lib/env-parser';

const OWNERS = envParseArray('OWNERS');

export class OwnerOnlyPrecondition extends Precondition {
	public chatInputRun(interaction: Command.ChatInputCommandInteraction) {
		return this.checkOwner(interaction.user.id);
	}

	public contextMenuRun(interaction: Command.ContextMenuCommandInteraction) {
		return this.checkOwner(interaction.user.id);
	}

	checkOwner(userId: string) {
		return OWNERS.includes(userId) ? this.ok() : this.error({ message: 'This command can only be used by the owner.' });
	}
}

declare module '@sapphire/framework' {
	interface Preconditions {
		OwnerOnly: never;
	}
}
