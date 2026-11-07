export interface ShouldAnnounceInput {
	isBot: boolean;
	memberGuildId: string;
	/** The server that owns the announcements channel. */
	channelGuildId: string;
}

/** People only (AC-13), and only in the announcements channel's own server (AC-14). */
export function shouldAnnounce({ isBot, memberGuildId, channelGuildId }: ShouldAnnounceInput): boolean {
	return !isBot && memberGuildId === channelGuildId;
}
