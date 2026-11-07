import { escapeMarkdown } from 'discord.js';

export interface MemberNameInput {
	displayName: string;
	username: string;
}

/** `**Display name** (username)`, markdown-escaped so a crafted name shows literally (requirements AC-18). */
export function formatMemberName({ displayName, username }: MemberNameInput): string {
	const shown = `**${escapeMarkdown(displayName)}**`;
	return displayName === username ? shown : `${shown} (${escapeMarkdown(username)})`;
}
