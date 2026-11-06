import type { ChatInputCommandDeniedPayload, Events } from '@sapphire/framework';
import { Listener, UserError } from '@sapphire/framework';
import { EmbedBuilder } from 'discord.js';

export class ChatInputCommandDenied extends Listener<typeof Events.ChatInputCommandDenied> {
	public async run(error: UserError, { interaction }: ChatInputCommandDeniedPayload) {
		const embed = new EmbedBuilder()
			.setColor(0x6d3737)
			.setTitle('Chat Input Command Denied')
			.setDescription(`**Message:**\n\`${error.message}\``);

		return interaction.reply({ embeds: [embed] });
	}
}
