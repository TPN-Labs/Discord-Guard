import { STATUS_TITLES } from './copy';

/** How many recent messages are scanned for the bot's last status message: one REST call, Discord's maximum. */
export const STATUS_HISTORY_LIMIT = 100;

export interface StatusHistoryEntry {
	authorId: string;
	embedTitles: readonly (string | null)[];
}

export type PreviousRun = 'online' | 'offline' | 'none';

/**
 * Decides how the previous run ended from the status channel's history, newest message first.
 * Only the bot's own status messages count; everything else in the channel is skipped.
 */
export function classifyPreviousRun(newestFirst: readonly StatusHistoryEntry[], botUserId: string): PreviousRun {
	for (const entry of newestFirst) {
		if (entry.authorId !== botUserId) continue;
		if (entry.embedTitles.includes(STATUS_TITLES.online)) return 'online';
		if (entry.embedTitles.includes(STATUS_TITLES.offline)) return 'offline';
	}

	return 'none';
}
