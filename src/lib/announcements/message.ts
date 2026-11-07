import { Colors, EmbedBuilder, userMention } from 'discord.js';
import { durationLine, JOIN_PHRASE, JOIN_TITLE, LEAVE_PHRASE, LEAVE_TITLE, rulesLine } from './copy';
import { formatDuration } from './duration';

export interface JoinAnnouncementInput {
	memberId: string;
	avatarUrl: string;
	/** From RULES_CHANNEL_ID; null leaves the rules line out. */
	rulesChannelId: string | null;
	timestamp: Date;
}

export interface JoinAnnouncementPayload {
	content: string;
	embeds: [EmbedBuilder];
	allowedMentions: { parse: []; users: [string] };
}

export interface LeaveAnnouncementInput {
	/** Already formatted and escaped by formatMemberName. */
	name: string;
	/** Null for a partial member whose join date the bot never learned. */
	joinedAt: Date | null;
	leftAt: Date;
}

export interface LeaveAnnouncementPayload {
	embeds: [EmbedBuilder];
	allowedMentions: { parse: [] };
}

export function buildJoinAnnouncement({ memberId, avatarUrl, rulesChannelId, timestamp }: JoinAnnouncementInput): JoinAnnouncementPayload {
	const mention = userMention(memberId);
	const phrase = JOIN_PHRASE.replace('{member}', () => mention);
	const embed = new EmbedBuilder()
		.setColor(Colors.Green)
		.setTitle(JOIN_TITLE)
		.setDescription(rulesChannelId === null ? phrase : `${phrase}\n\n${rulesLine(rulesChannelId)}`)
		.setThumbnail(avatarUrl)
		.setTimestamp(timestamp);

	// Only message content can ping, and only the new member is allowed to be pinged.
	return { content: mention, embeds: [embed], allowedMentions: { parse: [], users: [memberId] } };
}

export function buildLeaveAnnouncement({ name, joinedAt, leftAt }: LeaveAnnouncementInput): LeaveAnnouncementPayload {
	const phrase = LEAVE_PHRASE.replace('{name}', () => name); // a function, so $& or $' in a name stay literal
	const embed = new EmbedBuilder()
		.setColor(Colors.Grey)
		.setTitle(LEAVE_TITLE)
		.setDescription(joinedAt === null ? phrase : `${phrase}\n\n${durationLine(formatDuration(joinedAt, leftAt))}`)
		.setTimestamp(leftAt);

	// Leave announcements ping nobody, whatever the member's name says.
	return { embeds: [embed], allowedMentions: { parse: [] } };
}
