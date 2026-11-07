import { Colors, EmbedBuilder } from 'discord.js';
import { STATUS_TITLES, UNPLANNED_OUTAGE_LINE, type StatusKind } from './copy';

export interface StatusMessageInput {
	kind: StatusKind;
	phrase: string;
	/** Only meaningful for online messages: the previous run ended without an offline message. */
	unplannedOutage: boolean;
	timestamp: Date;
}

export interface StatusMessagePayload {
	embeds: [EmbedBuilder];
	allowedMentions: { parse: [] };
}

export function buildStatusMessage({ kind, phrase, unplannedOutage, timestamp }: StatusMessageInput): StatusMessagePayload {
	const description = kind === 'online' && unplannedOutage ? `${phrase}\n\n${UNPLANNED_OUTAGE_LINE}` : phrase;
	const embed = new EmbedBuilder()
		.setColor(kind === 'online' ? Colors.Green : Colors.Red)
		.setTitle(STATUS_TITLES[kind])
		.setDescription(description)
		.setTimestamp(timestamp);

	// Status messages never ping anyone, whatever the phrase text says.
	return { embeds: [embed], allowedMentions: { parse: [] } };
}
