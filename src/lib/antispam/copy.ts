// Approved copy for anti-spam: docs/specs/2026-11-08-anti-spam/requirements.md §6.
// Romanian with comma-below diacritics (ș, ț). Changing a string is a reviewed PR, not a config change.
import { escapeMarkdown } from 'discord.js';
import type { RuleId } from './rules';

export const RULE_NAMES: Record<RuleId, string> = {
	crossChannel: 'mesaje în 3 canale într-un minut',
	flood: '8 mesaje în 10 secunde',
	repeat: 'același mesaj de 4 ori într-un minut',
	mentionBurst: '6 mențiuni în 30 de secunde',
	linkSpread: 'linkuri în 2 canale într-un minut'
};

/** `{server}` is the escaped server name; `{rules}` the rule names joined with `, `. */
export const DM_PHRASE =
	'Tovarășe, ai fost scos din **{server}** pentru spam ({rules}). Poți reveni oricând cu o invitație, dar lasă propaganda acasă.';

export const KICK_LOG_TITLE = '🛡️ Agitator scos din server';
export const KICKED_LINE = '👢 Dat afară.';
export const NO_TEXT = '(fără text)';

function ruleNames(rules: readonly RuleId[]): string {
	return rules.map((rule) => RULE_NAMES[rule]).join(', ');
}

export function dmText(server: string, rules: readonly RuleId[]): string {
	// Functions, so $& or $' in a server name stay literal.
	return DM_PHRASE.replace('{server}', () => escapeMarkdown(server)).replace('{rules}', () => ruleNames(rules));
}

/** The audit-log reason of the kick (requirements AC-13). */
export function kickReason(rules: readonly RuleId[]): string {
	return `Anti-spam: ${ruleNames(rules)}`;
}

export function violatedRulesLine(rules: readonly RuleId[]): string {
	return `📋 Reguli încălcate: ${ruleNames(rules)}`;
}

/** `channels` are already formatted (channel links). */
export function channelsLine(channels: readonly string[]): string {
	return `📍 Canale: ${channels.join(', ')}`;
}

export function kickFailedLine(reason: string): string {
	return `⚠️ Nu l-am putut da afară: ${reason}`;
}

export function deletedLine(deleted: number, tracked: number): string {
	return `🧹 Mesaje șterse: ${deleted} din ${tracked}.`;
}

export function moreMessagesLine(n: number): string {
	return `… și încă ${n} mesaje.`;
}
