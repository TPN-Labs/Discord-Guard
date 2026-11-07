// Approved copy for the join and leave announcements: docs/specs/2026-11-07-join-leave-announcements/requirements.md §6.
// Romanian with comma-below diacritics (ș, ț). Changing a phrase is a reviewed PR, not a config change.
import { channelMention } from 'discord.js';

export const JOIN_TITLE = '👋 Avem un tovarăș nou';
export const LEAVE_TITLE = '🚪 Un tovarăș ne-a părăsit';

/** `{member}` is replaced by a mention of the new member. */
export const JOIN_PHRASE = 'Ultima oră la Telejurnal: {member} e membru nou. Urmează două ore despre recoltă.';
/** `{name}` is replaced by the leaving member's formatted name. */
export const LEAVE_PHRASE = '{name} a sărit gardul ambasadei. Drum bun în Occident!';

export function rulesLine(rulesChannelId: string): string {
	return `📜 Regulile sunt în ${channelMention(rulesChannelId)}. Citește-le, tovarășe!`;
}

export function durationLine(duration: string): string {
	return `⏳ A stat cu noi ${duration}.`;
}
