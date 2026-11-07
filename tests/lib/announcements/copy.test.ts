import { describe, expect, it } from 'vitest';
import { durationLine, JOIN_PHRASE, JOIN_TITLE, LEAVE_PHRASE, LEAVE_TITLE, rulesLine } from '../../../src/lib/announcements/copy';
import { FAKE_CHANNEL_ID } from '../../helpers/discord';

// Approved copy: docs/specs/2026-11-07-join-leave-announcements/requirements.md §6.
describe('join and leave copy', () => {
	it('usesTheApprovedTitles', () => {
		expect(JOIN_TITLE).toBe('👋 Avem un tovarăș nou');
		expect(LEAVE_TITLE).toBe('🚪 Un tovarăș ne-a părăsit');
	});

	it('usesTheApprovedPhrasesWithOnePlaceholderEach', () => {
		expect(JOIN_PHRASE).toBe('Ultima oră la Telejurnal: {member} e membru nou. Urmează două ore despre recoltă.');
		expect(LEAVE_PHRASE).toBe('{name} a sărit gardul ambasadei. Drum bun în Occident!');
		expect(JOIN_PHRASE.split('{member}')).toHaveLength(2);
		expect(LEAVE_PHRASE.split('{name}')).toHaveLength(2);
	});

	it('linksTheRulesChannelInTheRulesLine', () => {
		expect(rulesLine(FAKE_CHANNEL_ID)).toBe(`📜 Regulile sunt în <#${FAKE_CHANNEL_ID}>. Citește-le, tovarășe!`);
	});

	it('wrapsTheDurationInTheDurationLine', () => {
		expect(durationLine('3 zile și 4 ore')).toBe('⏳ A stat cu noi 3 zile și 4 ore.');
	});

	it('usesCommaBelowDiacriticsAndNoMassMentions', () => {
		const copy = [JOIN_TITLE, LEAVE_TITLE, JOIN_PHRASE, LEAVE_PHRASE, rulesLine(FAKE_CHANNEL_ID), durationLine('o zi')].join('\n');

		expect(copy).not.toMatch(/[şţŞŢ]/u);
		expect(copy).not.toMatch(/@everyone|@here/);
	});
});
