import {
	ChannelType,
	DiscordAPIError,
	PermissionsBitField,
	RESTJSONErrorCodes,
	type ChannelManager,
	type ClientUser,
	type NewsChannel,
	type TextChannel
} from 'discord.js';

/** Only plain text and announcement channels. Voice channels are text-based in discord.js v14, so isTextBased() is not enough. */
export type StatusChannel = TextChannel | NewsChannel;

export interface StatusChannelPermissions {
	/** Required permissions the bot lacks, by flag name. */
	missing: string[];
	/** Without Read Message History Discord returns an empty history instead of an error, so it is checked up front. */
	canReadHistory: boolean;
}

export type ResolvedStatusChannel = { ok: true; channel: StatusChannel; canReadHistory: boolean } | { ok: false; reason: string };

export interface StatusChannelClient {
	channels: Pick<ChannelManager, 'fetch'>;
	user: ClientUser;
}

const REQUIRED_PERMISSIONS = ['ViewChannel', 'SendMessages', 'EmbedLinks'] as const;

export function checkStatusChannelPermissions(perms: Readonly<PermissionsBitField> | null): StatusChannelPermissions {
	if (perms === null) return { missing: [...REQUIRED_PERMISSIONS], canReadHistory: false };

	return {
		missing: REQUIRED_PERMISSIONS.filter((name) => !perms.has(PermissionsBitField.Flags[name])),
		canReadHistory: perms.has(PermissionsBitField.Flags.ReadMessageHistory)
	};
}

/** A log-friendly reason for a failed Discord call. Never includes request bodies or headers. */
export function describeDiscordError(error: unknown): string {
	if (error instanceof DiscordAPIError) {
		switch (error.code) {
			case RESTJSONErrorCodes.UnknownChannel:
				return `unknown channel (Discord error ${error.code})`;
			case RESTJSONErrorCodes.MissingAccess:
				return `missing access: the bot cannot see the channel (Discord error ${error.code})`;
			case RESTJSONErrorCodes.MissingPermissions:
				return `missing permissions (Discord error ${error.code})`;
			default:
				return `${error.message} (Discord error ${error.code})`;
		}
	}

	return error instanceof Error ? error.message : String(error);
}

export async function resolveStatusChannel(client: StatusChannelClient, channelId: string): Promise<ResolvedStatusChannel> {
	let channel;
	try {
		channel = await client.channels.fetch(channelId);
	} catch (error) {
		return { ok: false, reason: describeDiscordError(error) };
	}

	if (channel === null) return { ok: false, reason: 'unknown channel' };
	if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
		return { ok: false, reason: `unsupported channel type ${ChannelType[channel.type]}; use a text or announcement channel` };
	}

	const { missing, canReadHistory } = checkStatusChannelPermissions(channel.permissionsFor(client.user));
	if (missing.length > 0) return { ok: false, reason: `missing permissions: ${missing.join(', ')}` };

	return { ok: true, channel, canReadHistory };
}
