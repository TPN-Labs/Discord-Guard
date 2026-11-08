import { createHash } from 'node:crypto';
import { MessageMentions } from 'discord.js';
import { censorLinks, countsForLinkSpread, findLinks } from './links';

/**
 * What the bot remembers about one message (docs/specs/2026-11-08-anti-spam/design.md §4, §7). The raw text is
 * never kept: only what the rules and the kick log need.
 */
export interface TrackedMessage {
	id: string;
	/** A thread's own ID, so a thread counts as its own channel (requirements AC-01). */
	channelId: string;
	/** Discord's timestamp for the message, in ms. */
	createdAt: number;
	/** sha1 of the normalized text; null when the message has no text (AC-03). */
	repeatKey: string | null;
	/** AC-04 mention points. */
	mentionPoints: number;
	/** Whether the message has a link that counts towards link spread (AC-05). */
	hasCountedLink: boolean;
	/** Censored and cut to EXCERPT_LENGTH, not yet escaped for display (AC-21, AC-24). */
	excerpt: string;
}

export const EXCERPT_LENGTH = 200;
/** An `@everyone` or `@here` attempt counts as this many mentions (AC-04). */
export const EVERYONE_MENTION_POINTS = 3;

const USERS_PATTERN = new RegExp(MessageMentions.UsersPattern.source, 'g');
const ROLES_PATTERN = new RegExp(MessageMentions.RolesPattern.source, 'g');

export function normalizeForRepeat(text: string): string | null {
	const normalized = text.trim().toLocaleLowerCase('ro');
	return normalized === '' ? null : normalized;
}

function distinctIds(text: string, pattern: RegExp): number {
	return new Set(Array.from(text.matchAll(pattern), (match) => match.groups?.id)).size;
}

/** Counted from what the member typed, so a reply that pings its author doesn't count (design D5). */
export function countMentions(text: string): number {
	const everyone = MessageMentions.EveryonePattern.test(text) ? EVERYONE_MENTION_POINTS : 0;
	return distinctIds(text, USERS_PATTERN) + distinctIds(text, ROLES_PATTERN) + everyone;
}

/** Links censored first, then cut by code points so an emoji is never split. */
export function excerpt(content: string): string {
	const characters = Array.from(censorLinks(content));
	return characters.length > EXCERPT_LENGTH ? `${characters.slice(0, EXCERPT_LENGTH).join('')}…` : characters.join('');
}

export function toTrackedMessage({
	id,
	channelId,
	createdAt,
	content
}: {
	id: string;
	channelId: string;
	createdAt: number;
	content: string;
}): TrackedMessage {
	const normalized = normalizeForRepeat(content);
	return {
		id,
		channelId,
		createdAt,
		repeatKey: normalized === null ? null : createHash('sha1').update(normalized).digest('hex'),
		mentionPoints: countMentions(content),
		hasCountedLink: findLinks(content).some(countsForLinkSpread),
		excerpt: excerpt(content)
	};
}
