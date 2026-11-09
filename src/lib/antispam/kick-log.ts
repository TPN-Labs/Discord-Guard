import { channelMention, Colors, EmbedBuilder, escapeMarkdown } from 'discord.js';
import { formatMemberName } from '../announcements/member-name';
import {
	channelsLine,
	deletedLine,
	KICK_LOG_TITLE,
	KICKED_LINE,
	kickFailedLine,
	moreMessagesLine,
	NO_TEXT,
	RULE_NAMES,
	violatedRulesLine
} from './copy';
import type { RuleId } from './rules';

/** Everything a kick log shows (docs/specs/2026-11-08-anti-spam/requirements.md AC-18 to AC-22). */
export interface KickLogInput {
	member: { displayName: string; username: string; id: string };
	rules: readonly RuleId[];
	/** Distinct channels involved, in first-seen order. */
	channelIds: readonly string[];
	/** Every deleted or attempted message, oldest first; excerpts already censored (AC-24). */
	messages: readonly { channelId: string; excerpt: string }[];
	kick: { ok: true } | { ok: false; reason: string };
	deleted: number;
	tracked: number;
	timestamp: Date;
}

export interface KickLogPayload {
	embeds: [EmbedBuilder];
	allowedMentions: { parse: [] };
}

export const MAX_SHOWN_MESSAGES = 10;
const DESCRIPTION_LIMIT = 4096;

/** Shows mentions as text instead of mention pills, and defuses `@everyone`/`@here` (AC-23). */
function neutralizeMentions(text: string): string {
	return text.replace(/<(@[!&]?|#)/g, '\\<$1').replace(/@(everyone|here)/g, '@\u200b$1');
}

/** Message text as it may appear in a kick log: markdown escaped, mentions neutralized (AC-23). */
export function forDisplay(text: string): string {
	return neutralizeMentions(escapeMarkdown(text));
}

/** Cuts escaped text to `max` code points plus `…`, never leaving half an escape sequence. */
function cutEscaped(text: string, max: number): string {
	const characters = Array.from(text);
	if (characters.length <= max) return text;

	let cut = characters.slice(0, Math.max(0, max)).join('');
	const trailingBackslashes = /\\*$/.exec(cut)?.[0].length ?? 0;
	if (trailingBackslashes % 2 === 1) cut = cut.slice(0, -1);
	return `${cut}…`;
}

function outcomeLine(kick: KickLogInput['kick']): string {
	return kick.ok ? KICKED_LINE : kickFailedLine(escapeMarkdown(kick.reason));
}

export function buildKickLog(input: KickLogInput): KickLogPayload {
	const { member, rules, channelIds, messages, kick, deleted, tracked, timestamp } = input;
	const shown = messages.slice(0, MAX_SHOWN_MESSAGES);

	const header = [
		`${neutralizeMentions(formatMemberName({ displayName: member.displayName, username: member.username }))} · ${member.id}`,
		violatedRulesLine(rules),
		channelsLine(channelIds.map((id) => channelMention(id))),
		''
	];
	const footer = [
		...(messages.length > shown.length ? [moreMessagesLine(messages.length - shown.length)] : []),
		'',
		outcomeLine(kick),
		deletedLine(deleted, tracked)
	];
	const prefixes = shown.map((message) => `${channelMention(message.channelId)} `);
	let texts = shown.map((message) => (message.excerpt === '' ? NO_TEXT : forDisplay(message.excerpt)));

	const join = () => [...header, ...prefixes.map((prefix, i) => prefix + texts[i]), ...footer].join('\n');
	let description = join();
	if (description.length > DESCRIPTION_LIMIT) {
		// Share what's left after the fixed parts equally between the shown messages (design §5.7).
		const fixed = description.length - texts.reduce((sum, text) => sum + text.length, 0);
		const budget = Math.floor((DESCRIPTION_LIMIT - fixed) / shown.length) - 1; // -1 for the '…'
		texts = texts.map((text) => cutEscaped(text, budget));
		description = join();
	}

	const embed = new EmbedBuilder().setColor(Colors.Red).setTitle(KICK_LOG_TITLE).setDescription(description).setTimestamp(timestamp);
	// Embeds never ping; parse: [] is the second lock (AC-23).
	return { embeds: [embed], allowedMentions: { parse: [] } };
}

function oneLine(text: string): string {
	return text.replace(/\s*[\r\n]+\s*/g, ' ');
}

/** The kick log's facts as one log line, for when it can't or shouldn't be posted (AC-30, AC-33). Censored the same way. */
export function formatKickLogText({ member, rules, channelIds, messages, kick, deleted, tracked }: KickLogInput): string {
	const shown = messages
		.slice(0, MAX_SHOWN_MESSAGES)
		.map((message) => `#${message.channelId} ${message.excerpt === '' ? NO_TEXT : message.excerpt}`);
	const more = messages.length > MAX_SHOWN_MESSAGES ? ` (+${messages.length - MAX_SHOWN_MESSAGES} more)` : '';
	return oneLine(
		[
			`[AntiSpam] Kick log: member ${member.displayName} (${member.username}) ${member.id}`,
			`rules: ${rules.map((rule) => RULE_NAMES[rule]).join(', ')}`,
			`channels: ${channelIds.join(', ')}`,
			kick.ok ? 'kicked' : `kick failed: ${kick.reason}`,
			`deleted ${deleted}/${tracked}`,
			`messages: ${shown.join(' | ')}${more}`
		].join('; ')
	);
}
