import { describe, expect, it } from 'vitest';
import {
	channelsLine,
	deletedLine,
	dmText,
	KICK_LOG_TITLE,
	KICKED_LINE,
	kickFailedLine,
	kickReason,
	moreMessagesLine,
	NO_TEXT,
	RULE_NAMES,
	violatedRulesLine
} from '../../../src/lib/antispam/copy';
import { RULE_IDS } from '../../../src/lib/antispam/rules';

// Approved copy: docs/specs/2026-11-08-anti-spam/requirements.md §6.
describe('anti-spam copy', () => {
	it('namesEveryRuleWithTheApprovedName', () => {
		expect(RULE_NAMES).toEqual({
			crossChannel: 'mesaje în 3 canale într-un minut',
			flood: '8 mesaje în 10 secunde',
			repeat: 'același mesaj de 4 ori într-un minut',
			mentionBurst: '6 mențiuni în 30 de secunde',
			linkSpread: 'linkuri în 2 canale într-un minut'
		});
		expect(Object.keys(RULE_NAMES).sort()).toEqual([...RULE_IDS].sort());
	});

	it('writesTheApprovedDmWithTheServerAndRules', () => {
		expect(dmText('Serverul lui Mihai', ['crossChannel', 'linkSpread'])).toBe(
			'Tovarășe, ai fost scos din **Serverul lui Mihai** pentru spam (mesaje în 3 canale într-un minut, linkuri în 2 canale într-un minut). Poți reveni oricând cu o invitație, dar lasă propaganda acasă.'
		);
	});

	it('escapesMarkdownInTheServerNameOfTheDm', () => {
		expect(dmText('**Bold** _server_', ['flood'])).toContain('**\\*\\*Bold\\*\\* \\_server\\_**');
	});

	it('keepsReplacementPatternsInTheServerNameLiteral', () => {
		expect(dmText("$& $'", ['flood'])).toContain("**$& $'**");
	});

	it('usesTheApprovedKickLogStrings', () => {
		expect(KICK_LOG_TITLE).toBe('🛡️ Agitator scos din server');
		expect(violatedRulesLine(['flood', 'repeat'])).toBe('📋 Reguli încălcate: 8 mesaje în 10 secunde, același mesaj de 4 ori într-un minut');
		expect(channelsLine(['<#1>', '<#2>'])).toBe('📍 Canale: <#1>, <#2>');
		expect(KICKED_LINE).toBe('👢 Dat afară.');
		expect(kickFailedLine('missing permissions')).toBe('⚠️ Nu l-am putut da afară: missing permissions');
		expect(deletedLine(2, 3)).toBe('🧹 Mesaje șterse: 2 din 3.');
		expect(moreMessagesLine(4)).toBe('… și încă 4 mesaje.');
		expect(NO_TEXT).toBe('(fără text)');
	});

	it('prefixesTheAuditLogReasonWithAntiSpam', () => {
		expect(kickReason(['mentionBurst'])).toBe('Anti-spam: 6 mențiuni în 30 de secunde');
	});

	it('usesCommaBelowDiacriticsAndNoMassMentions', () => {
		const copy = [
			...Object.values(RULE_NAMES),
			dmText('S', [...RULE_IDS]),
			KICK_LOG_TITLE,
			violatedRulesLine([...RULE_IDS]),
			channelsLine([]),
			KICKED_LINE,
			kickFailedLine('x'),
			deletedLine(1, 1),
			moreMessagesLine(1),
			NO_TEXT
		].join('\n');

		expect(copy).not.toMatch(/[şţŞŢ]/u);
		expect(copy).not.toMatch(/@everyone|@here/);
	});
});
