import { Colors } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { buildKickLog, formatKickLogText, forDisplay, type KickLogInput } from '../../../src/lib/antispam/kick-log';
import { excerpt } from '../../../src/lib/antispam/message-facts';
import { FAKE_MEMBER_ID } from '../../helpers/discord';

const CH_A = '111111111111111111';
const CH_B = '222222222222222222';
const CH_C = '333333333333333333';
const TIMESTAMP = new Date('2026-11-08T12:00:00.000Z');

function input(overrides: Partial<KickLogInput> = {}): KickLogInput {
	return {
		member: { displayName: 'Ion', username: 'ion1930', id: FAKE_MEMBER_ID },
		rules: ['crossChannel', 'linkSpread'],
		channelIds: [CH_A, CH_B, CH_C],
		messages: [CH_A, CH_B, CH_C].map((channelId) => ({ channelId, excerpt: excerpt('Claim [free nitro](https://free-nitro.ru/claim)') })),
		kick: { ok: true },
		deleted: 3,
		tracked: 3,
		timestamp: TIMESTAMP,
		...overrides
	};
}

function description(overrides: Partial<KickLogInput> = {}): string {
	return buildKickLog(input(overrides)).embeds[0].toJSON().description ?? '';
}

describe('buildKickLog', () => {
	it('postsARedEmbedWithTheTitleAndTimestampAndNoMessageText', () => {
		const payload = buildKickLog(input());
		const embed = payload.embeds[0].toJSON();

		expect(embed.color).toBe(Colors.Red);
		expect(embed.title).toBe('🛡️ Agitator scos din server');
		expect(embed.timestamp).toBe(TIMESTAMP.toISOString());
		expect(payload).not.toHaveProperty('content');
	});

	it('laysOutTheMemberRulesChannelsMessagesAndOutcome', () => {
		expect(description()).toBe(
			[
				`**Ion** (ion1930) · ${FAKE_MEMBER_ID}`,
				'📋 Reguli încălcate: mesaje în 3 canale într-un minut, linkuri în 2 canale într-un minut',
				`📍 Canale: <#${CH_A}>, <#${CH_B}>, <#${CH_C}>`,
				'',
				`<#${CH_A}> Claim free nitro (free-nitro)`,
				`<#${CH_B}> Claim free nitro (free-nitro)`,
				`<#${CH_C}> Claim free nitro (free-nitro)`,
				'',
				'👢 Dat afară.',
				'🧹 Mesaje șterse: 3 din 3.'
			].join('\n')
		);
	});

	it('pingsNobody', () => {
		expect(buildKickLog(input()).allowedMentions).toEqual({ parse: [] });
	});

	it('showsAtMostTenMessagesAndCountsTheRest', () => {
		const messages = Array.from({ length: 13 }, (_, i) => ({ channelId: CH_A, excerpt: `spam ${i}` }));
		const text = description({ messages, deleted: 13, tracked: 13 });

		expect(text).toContain('spam 9');
		expect(text).not.toContain('spam 10');
		expect(text).toContain('… și încă 3 mesaje.');
	});

	it('showsAMessageWithoutTextAsFaraText', () => {
		expect(description({ messages: [{ channelId: CH_A, excerpt: '' }] })).toContain(`<#${CH_A}> (fără text)`);
	});

	it('showsTheKickFailedLineWithTheReason', () => {
		const text = description({ kick: { ok: false, reason: 'missing permissions (Discord error 50013)' }, deleted: 2 });

		expect(text).toContain('⚠️ Nu l-am putut da afară: missing permissions (Discord error 50013)');
		expect(text).not.toContain('👢 Dat afară.');
		expect(text).toContain('🧹 Mesaje șterse: 2 din 3.');
	});

	it('showsMentionsAndMarkdownInMessagesAsPlainText', () => {
		const text = description({
			messages: [{ channelId: CH_A, excerpt: `@everyone @here <@${FAKE_MEMBER_ID}> <@&${CH_B}> <#${CH_C}> **bold**` }]
		});

		expect(text).toContain(`@\u200beveryone @\u200bhere \\<@${FAKE_MEMBER_ID}> \\<@&${CH_B}> \\<#${CH_C}> \\*\\*bold\\*\\*`);
		expect(text).not.toMatch(/@everyone|@here/);
	});

	it('showsACraftedNameAsPlainText', () => {
		const text = description({ member: { displayName: '@here', username: '<@123456789012345678>', id: FAKE_MEMBER_ID } });

		expect(text.split('\n')[0]).toBe(`**@\u200bhere** (\\<@123456789012345678>) · ${FAKE_MEMBER_ID}`);
	});

	it('staysWithinTheDescriptionLimitInTheWorstCase', () => {
		const messages = Array.from({ length: 50 }, (_, i) => ({ channelId: String(100000000000000000n + BigInt(i)), excerpt: '*'.repeat(200) }));
		const text = description({
			member: { displayName: '_'.repeat(32), username: '*'.repeat(32), id: FAKE_MEMBER_ID },
			rules: ['crossChannel', 'flood', 'repeat', 'mentionBurst', 'linkSpread'],
			channelIds: messages.map((m) => m.channelId),
			messages,
			deleted: 50,
			tracked: 50
		});

		expect(text.length).toBeLessThanOrEqual(4096);
		expect(text).toContain('🧹 Mesaje șterse: 50 din 50.');
		expect(text).toContain('… și încă 40 mesaje.');
		expect(text).not.toMatch(/[^\\]\\\n/); // never cut in the middle of an escape
	});
});

describe('forDisplay', () => {
	it('escapesMarkdownAndNeutralizesMentions', () => {
		expect(forDisplay('__x__ <@!123456789012345678> @everyone')).toBe('\\_\\_x\\_\\_ \\<@!123456789012345678> @\u200beveryone');
	});
});

describe('formatKickLogText', () => {
	it('carriesTheSameFactsAsTheEmbedOnOneLine', () => {
		const text = formatKickLogText(input({ kick: { ok: false, reason: 'missing permissions' }, deleted: 1 }));

		expect(text).not.toContain('\n');
		expect(text).toContain(FAKE_MEMBER_ID);
		expect(text).toContain('ion1930');
		expect(text).toContain('mesaje în 3 canale într-un minut');
		expect(text).toContain(CH_B);
		expect(text).toContain('missing permissions');
		expect(text).toContain('1/3');
		expect(text).toContain('Claim free nitro (free-nitro)');
		expect(text).not.toContain('free-nitro.ru');
	});
});
